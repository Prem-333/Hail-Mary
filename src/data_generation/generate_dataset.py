#!/usr/bin/env python3
"""
Synthetic Burn-In Test Data Generator
======================================

Generates realistic semiconductor burn-in test data with three component
populations:

- **Normal**: Mild Arrhenius-type parametric drift under thermal stress.
- **Latent defect**: Readings indistinguishable from normal at 0h/24h but
  diverging sharply by 168h — the core scenario the screening system must catch.
- **Obvious defect**: Values exceed static datasheet limits, serving as a
  sanity-check baseline for outlier detection.

Physics basis:
    Parametric drift under accelerated stress follows the Arrhenius equation:
        rate ∝ exp(−Eₐ / kT)
    We approximate this as value(t) = baseline × exp(α·t) + ε, where α is a
    temperature-dependent drift coefficient and ε is measurement noise.

Usage:
    python -m src.data_generation.generate_dataset --lots 10 --seed 42
    python -m src.data_generation.generate_dataset --lots 20 --units-min 200 --units-max 500 --visualize
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TIMEPOINTS = [0, 24, 96, 168]  # burn-in measurement hours
TIMEPOINT_COLS = [f"value_{t}h" for t in TIMEPOINTS]

PARAM_NAMES = ["leakage_current_uA", "propagation_delay_ns"]

# ---------------------------------------------------------------------------
# Lot-level baseline configuration
# ---------------------------------------------------------------------------
# Each lot draws its own mean/std from these ranges to simulate manufacturing
# process variation (e.g. wafer-to-wafer differences in oxide thickness).

LOT_CONFIG = {
    "leakage_current_uA": {
        "mean_range": (12.0, 22.0),       # µA — typical leakage for a lot
        "std_range": (1.5, 3.0),           # within-lot component spread
        "drift_alpha_range": (0.0003, 0.0008),  # normal drift rate (per hour)
    },
    "propagation_delay_ns": {
        "mean_range": (6.0, 11.0),         # ns
        "std_range": (0.5, 1.2),
        "drift_alpha_range": (0.0002, 0.0006),
    },
}

# ---------------------------------------------------------------------------
# Latent defect configuration
# ---------------------------------------------------------------------------
# The "knee" is the timepoint (in hours) where accelerated degradation
# activates — modelling an internal defect (e.g. gate oxide weak spot) that
# only manifests after sustained stress.  Before the knee the component
# drifts like a normal part; after the knee, the drift rate jumps.

LATENT_CONFIG = {
    "leakage_current_uA": {
        "knee_range": (20, 60),            # hours — activation point
        "accel_alpha_range": (0.003, 0.007),  # accelerated drift rate
    },
    "propagation_delay_ns": {
        "knee_range": (20, 60),
        "accel_alpha_range": (0.002, 0.005),
    },
}

# ---------------------------------------------------------------------------
# Obvious defect configuration
# ---------------------------------------------------------------------------
# Baseline multiplier pushes initial value near or above datasheet limits.

OBVIOUS_CONFIG = {
    "leakage_current_uA": {
        "baseline_multiplier_range": (2.8, 4.5),
        "drift_boost": 1.5,               # drift rate multiplier
    },
    "propagation_delay_ns": {
        "baseline_multiplier_range": (2.0, 3.0),
        "drift_boost": 1.5,
    },
}

# ---------------------------------------------------------------------------
# Datasheet limits (static pass/fail)
# ---------------------------------------------------------------------------

DATASHEET_LIMITS = {
    "leakage_current_uA": {
        "min": 0.0,
        "max": 50.0,
        "unit": "µA",
        "description": "Maximum allowable leakage current per datasheet spec",
    },
    "propagation_delay_ns": {
        "min": 0.0,
        "max": 18.0,
        "unit": "ns",
        "description": "Maximum allowable propagation delay per datasheet spec",
    },
}


# ===================================================================
# Core generation functions
# ===================================================================

def _generate_normal_trajectory(
    baseline: float,
    drift_alpha: float,
    noise_std: float,
    rng: np.random.Generator,
) -> dict[int, float]:
    """
    Normal component: mild exponential drift with measurement noise.

    value(t) = baseline × exp(α_comp · t) + ε
    where α_comp = α_lot × U(0.7, 1.3) for component-level variation.
    """
    comp_alpha = drift_alpha * rng.uniform(0.7, 1.3)
    values = {}
    for t in TIMEPOINTS:
        drift = np.exp(comp_alpha * t)
        noise = rng.normal(0, noise_std)
        values[t] = max(round(baseline * drift + noise, 4), 0.01)
    return values


def _generate_latent_trajectory(
    baseline: float,
    drift_alpha: float,
    noise_std: float,
    param_name: str,
    rng: np.random.Generator,
) -> dict[int, float]:
    """
    Latent defect: normal drift until a 'knee' point, then accelerated
    exponential drift.  This produces the key signature — early readings
    are statistically indistinguishable from normal components, but the
    168h value diverges sharply.

    Phase 1 (t ≤ knee):  value(t) = baseline × exp(α_normal · t) + ε
    Phase 2 (t > knee):  value(t) = baseline × exp(α_normal·knee + α_accel·(t−knee)) + ε
    """
    cfg = LATENT_CONFIG[param_name]
    knee = rng.uniform(*cfg["knee_range"])
    accel_alpha = rng.uniform(*cfg["accel_alpha_range"])
    comp_alpha = drift_alpha * rng.uniform(0.8, 1.2)  # tighter spread so early points stay normal

    values = {}
    for t in TIMEPOINTS:
        if t <= knee:
            drift = np.exp(comp_alpha * t)
        else:
            normal_part = comp_alpha * knee
            accel_part = accel_alpha * (t - knee)
            drift = np.exp(normal_part + accel_part)

        noise = rng.normal(0, noise_std)
        values[t] = max(round(baseline * drift + noise, 4), 0.01)
    return values


def _generate_obvious_trajectory(
    baseline: float,
    drift_alpha: float,
    noise_std: float,
    param_name: str,
    rng: np.random.Generator,
) -> dict[int, float]:
    """
    Obvious defect: elevated baseline that exceeds (or nearly exceeds)
    datasheet limits from the start.  These are easy catches for any
    static threshold check and serve as a sanity baseline.
    """
    cfg = OBVIOUS_CONFIG[param_name]
    multiplier = rng.uniform(*cfg["baseline_multiplier_range"])
    elevated_baseline = baseline * multiplier
    boosted_alpha = drift_alpha * cfg["drift_boost"] * rng.uniform(0.8, 1.2)

    values = {}
    for t in TIMEPOINTS:
        drift = np.exp(boosted_alpha * t)
        noise = rng.normal(0, noise_std * 1.5)
        values[t] = max(round(elevated_baseline * drift + noise, 4), 0.01)
    return values


_TRAJECTORY_GENERATORS = {
    "normal": _generate_normal_trajectory,
    "latent": _generate_latent_trajectory,
    "obvious": _generate_obvious_trajectory,
}


def generate_lot(
    lot_id: str,
    num_units: int,
    latent_rate: float,
    obvious_rate: float,
    rng: np.random.Generator,
) -> tuple[list[dict], list[dict]]:
    """
    Generate burn-in measurement data for a single manufacturing lot.

    Returns:
        (measurement_records, label_records) — both as lists of dicts.
    """
    # --- Assign defect types ---
    num_latent = max(1, int(round(num_units * latent_rate)))
    num_obvious = max(1, int(round(num_units * obvious_rate)))
    num_normal = num_units - num_latent - num_obvious

    defect_labels = (
        ["normal"] * num_normal
        + ["latent"] * num_latent
        + ["obvious"] * num_obvious
    )
    rng.shuffle(defect_labels)

    # --- Draw lot-level baselines ---
    lot_baselines = {}
    for param in PARAM_NAMES:
        cfg = LOT_CONFIG[param]
        lot_baselines[param] = {
            "mean": rng.uniform(*cfg["mean_range"]),
            "std": rng.uniform(*cfg["std_range"]),
            "drift_alpha": rng.uniform(*cfg["drift_alpha_range"]),
        }

    # --- Generate per-component trajectories ---
    measurements = []
    labels = []

    for idx, defect_type in enumerate(defect_labels):
        comp_id = f"{lot_id}_C{idx:04d}"
        labels.append(
            {
                "lot_id": lot_id,
                "component_id": comp_id,
                "is_defective": int(defect_type != "normal"),
                "defect_type": defect_type,
            }
        )

        for param in PARAM_NAMES:
            lb = lot_baselines[param]
            baseline = max(rng.normal(lb["mean"], lb["std"]), 0.5)
            noise_std = lb["std"] * 0.08  # measurement noise ≈ 8% of lot spread

            if defect_type == "normal":
                values = _generate_normal_trajectory(
                    baseline, lb["drift_alpha"], noise_std, rng
                )
            elif defect_type == "latent":
                values = _generate_latent_trajectory(
                    baseline, lb["drift_alpha"], noise_std, param, rng
                )
            else:
                values = _generate_obvious_trajectory(
                    baseline, lb["drift_alpha"], noise_std, param, rng
                )

            record = {
                "lot_id": lot_id,
                "component_id": comp_id,
                "param_name": param,
            }
            for t, col in zip(TIMEPOINTS, TIMEPOINT_COLS):
                record[col] = values[t]
            measurements.append(record)

    return measurements, labels


def generate_dataset(
    n_lots: int = 20,
    units_min: int = 500,
    units_max: int = 1000,
    latent_rate_min: float = 0.03,
    latent_rate_max: float = 0.07,
    obvious_rate_min: float = 0.01,
    obvious_rate_max: float = 0.02,
    seed: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Generate the full synthetic dataset across multiple lots.

    Returns:
        (measurements_df, labels_df)
    """
    rng = np.random.default_rng(seed)

    all_measurements = []
    all_labels = []

    for i in range(n_lots):
        lot_id = f"LOT_{i:03d}"
        num_units = rng.integers(units_min, units_max + 1)
        latent_rate = rng.uniform(latent_rate_min, latent_rate_max)
        obvious_rate = rng.uniform(obvious_rate_min, obvious_rate_max)

        measurements, labels = generate_lot(
            lot_id=lot_id,
            num_units=int(num_units),
            latent_rate=latent_rate,
            obvious_rate=obvious_rate,
            rng=rng,
        )
        all_measurements.extend(measurements)
        all_labels.extend(labels)

        n_lat = sum(1 for l in labels if l["defect_type"] == "latent")
        n_obv = sum(1 for l in labels if l["defect_type"] == "obvious")
        print(
            f"  {lot_id}: {num_units} units "
            f"({num_units - n_lat - n_obv} normal, {n_lat} latent, {n_obv} obvious)"
        )

    measurements_df = pd.DataFrame(all_measurements)
    labels_df = pd.DataFrame(all_labels)

    return measurements_df, labels_df


def save_outputs(
    measurements_df: pd.DataFrame,
    labels_df: pd.DataFrame,
    output_dir: str | Path,
) -> None:
    """Save measurement CSV, labels CSV, and datasheet limits JSON."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    meas_path = output_dir / "burnin_measurements.csv"
    labels_path = output_dir / "burnin_labels.csv"
    limits_path = output_dir / "datasheet_limits.json"

    measurements_df.to_csv(meas_path, index=False)
    labels_df.to_csv(labels_path, index=False)

    with open(limits_path, "w") as f:
        json.dump(DATASHEET_LIMITS, f, indent=2)

    print(f"\n[OK] Measurements saved to {meas_path}")
    print(f"[OK] Labels saved to      {labels_path}")
    print(f"[OK] Datasheet limits at  {limits_path}")

    # Summary stats
    total = len(labels_df)
    n_defective = labels_df["is_defective"].sum()
    n_latent = (labels_df["defect_type"] == "latent").sum()
    n_obvious = (labels_df["defect_type"] == "obvious").sum()
    print(f"\nDataset summary:")
    print(f"  Total components:  {total}")
    print(f"  Normal:            {total - n_defective} ({100*(total - n_defective)/total:.1f}%)")
    print(f"  Latent defects:    {n_latent} ({100*n_latent/total:.1f}%)")
    print(f"  Obvious defects:   {n_obvious} ({100*n_obvious/total:.1f}%)")
    print(f"  Measurement rows:  {len(measurements_df)} ({len(PARAM_NAMES)} params x {total} components)")


# ===================================================================
# CLI
# ===================================================================

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic burn-in test data for component reliability screening.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--lots", type=int, default=20, help="Number of manufacturing lots to simulate.")
    parser.add_argument("--units-min", type=int, default=500, help="Minimum units per lot.")
    parser.add_argument("--units-max", type=int, default=1000, help="Maximum units per lot.")
    parser.add_argument("--latent-rate-min", type=float, default=0.03, help="Minimum latent defect rate per lot.")
    parser.add_argument("--latent-rate-max", type=float, default=0.07, help="Maximum latent defect rate per lot.")
    parser.add_argument("--obvious-rate-min", type=float, default=0.01, help="Minimum obvious defect rate per lot.")
    parser.add_argument("--obvious-rate-max", type=float, default=0.02, help="Maximum obvious defect rate per lot.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
    parser.add_argument("--output-dir", type=str, default="data/generated", help="Output directory for generated files.")
    parser.add_argument("--visualize", action="store_true", help="Generate sample trajectory plot after data generation.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    print(f"Generating synthetic burn-in data (seed={args.seed})...")
    print(f"  Lots: {args.lots}, Units/lot: {args.units_min}–{args.units_max}")
    print(f"  Latent rate: {args.latent_rate_min:.0%}–{args.latent_rate_max:.0%}")
    print(f"  Obvious rate: {args.obvious_rate_min:.0%}–{args.obvious_rate_max:.0%}")
    print()

    measurements_df, labels_df = generate_dataset(
        n_lots=args.lots,
        units_min=args.units_min,
        units_max=args.units_max,
        latent_rate_min=args.latent_rate_min,
        latent_rate_max=args.latent_rate_max,
        obvious_rate_min=args.obvious_rate_min,
        obvious_rate_max=args.obvious_rate_max,
        seed=args.seed,
    )

    save_outputs(measurements_df, labels_df, args.output_dir)

    if args.visualize:
        print("\nGenerating trajectory visualization...")
        # Import here to avoid matplotlib dependency when not visualizing
        from src.data_generation.visualize_trajectories import plot_sample_trajectories

        plot_sample_trajectories(
            measurements_df,
            labels_df,
            output_path=Path(args.output_dir) / "sample_trajectories.png",
        )


if __name__ == "__main__":
    main()
