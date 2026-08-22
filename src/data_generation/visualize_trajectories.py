#!/usr/bin/env python3
"""
Trajectory Visualization for Burn-In Screening
================================================

Generates a pitch-deck-ready plot comparing normal, latent-defect, and
obvious-defect component trajectories across the four burn-in measurement
timepoints (0h, 24h, 96h, 168h).

The plot is designed to make the "invisible until late" nature of latent
defects immediately obvious at a glance.

Usage:
    python -m src.data_generation.visualize_trajectories
    python -m src.data_generation.visualize_trajectories --input-dir data/generated --output data/generated/sample_trajectories.png
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Style constants
# ---------------------------------------------------------------------------

TIMEPOINTS = [0, 24, 96, 168]
TIMEPOINT_LABELS = ["0h", "24h", "96h", "168h"]

# Curated color palette
COLORS = {
    "normal": "#4FC3F7",       # light blue
    "latent": "#FFB74D",       # amber
    "obvious": "#EF5350",      # red
    "limit": "#FF7043",        # deep orange dashed line
    "fail_zone": "#FF7043",    # fill above limit
    "bg": "#121820",           # dark background
    "grid": "#2A3040",         # subtle grid
    "text": "#E0E0E0",         # light text
    "title": "#FFFFFF",        # white titles
}

PLOT_PARAMS = {
    "normal": {"alpha": 0.15, "linewidth": 1.0, "zorder": 1},
    "latent": {"alpha": 0.70, "linewidth": 2.0, "zorder": 3},
    "obvious": {"alpha": 0.60, "linewidth": 1.8, "zorder": 2},
}

# Datasheet limits for reference lines
LIMITS = {
    "leakage_current_uA": 50.0,
    "propagation_delay_ns": 18.0,
}

PARAM_DISPLAY = {
    "leakage_current_uA": {
        "title": "Leakage Current",
        "ylabel": "Leakage Current (µA)",
    },
    "propagation_delay_ns": {
        "title": "Propagation Delay",
        "ylabel": "Propagation Delay (ns)",
    },
}

# Number of sample trajectories to plot per defect type
N_SAMPLES = {"normal": 30, "latent": 10, "obvious": 5}


def _sample_components(
    measurements_df: pd.DataFrame,
    labels_df: pd.DataFrame,
    n_samples: dict[str, int] | None = None,
    seed: int = 42,
) -> pd.DataFrame:
    """Select a balanced sample of components for plotting."""
    if n_samples is None:
        n_samples = N_SAMPLES.copy()

    rng = np.random.default_rng(seed)
    sampled_ids = []

    for defect_type, n in n_samples.items():
        pool = labels_df.loc[labels_df["defect_type"] == defect_type, "component_id"].values
        if len(pool) == 0:
            continue
        n_pick = min(n, len(pool))
        chosen = rng.choice(pool, size=n_pick, replace=False)
        sampled_ids.extend(chosen)

    sampled_meas = measurements_df[measurements_df["component_id"].isin(sampled_ids)].copy()
    sampled_labels = labels_df[labels_df["component_id"].isin(sampled_ids)].copy()

    return sampled_meas.merge(
        sampled_labels[["component_id", "defect_type"]],
        on="component_id",
        how="left",
    )


def plot_sample_trajectories(
    measurements_df: pd.DataFrame,
    labels_df: pd.DataFrame,
    output_path: str | Path = "data/generated/sample_trajectories.png",
    n_samples: dict[str, int] | None = None,
    seed: int = 42,
) -> None:
    """
    Generate a two-panel trajectory plot (leakage current + propagation delay).

    Designed for pitch deck inclusion: dark background, clear color coding,
    datasheet limit lines, and annotation highlighting the latent-defect
    signature.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    merged = _sample_components(measurements_df, labels_df, n_samples, seed)
    value_cols = [f"value_{t}h" for t in TIMEPOINTS]

    # --- Figure setup ---
    fig, axes = plt.subplots(1, 2, figsize=(16, 7), facecolor=COLORS["bg"])
    fig.subplots_adjust(wspace=0.28, left=0.07, right=0.95, top=0.88, bottom=0.12)

    for ax_idx, param in enumerate(["leakage_current_uA", "propagation_delay_ns"]):
        ax = axes[ax_idx]
        ax.set_facecolor(COLORS["bg"])
        param_data = merged[merged["param_name"] == param]
        display = PARAM_DISPLAY[param]
        limit = LIMITS[param]

        # -- Plot trajectories by defect type (normal first so defects overlay) --
        for defect_type in ["normal", "latent", "obvious"]:
            subset = param_data[param_data["defect_type"] == defect_type]
            style = PLOT_PARAMS[defect_type]

            for _, row in subset.iterrows():
                values = [row[col] for col in value_cols]
                ax.plot(
                    TIMEPOINTS,
                    values,
                    color=COLORS[defect_type],
                    alpha=style["alpha"],
                    linewidth=style["linewidth"],
                    zorder=style["zorder"],
                    solid_capstyle="round",
                )

        # -- Datasheet limit line --
        ax.axhline(
            y=limit,
            color=COLORS["limit"],
            linestyle="--",
            linewidth=1.5,
            alpha=0.8,
            zorder=4,
            label=f"Datasheet limit ({limit} {display['ylabel'].split('(')[1]}",
        )

        # -- Fail zone shading --
        y_max = ax.get_ylim()[1]
        ax.fill_between(
            [-5, 175],
            limit,
            max(y_max, limit * 1.5),
            color=COLORS["fail_zone"],
            alpha=0.06,
            zorder=0,
        )
        ax.text(
            164, limit + (max(y_max, limit * 1.5) - limit) * 0.15,
            "FAIL",
            color=COLORS["fail_zone"],
            alpha=0.35,
            fontsize=14,
            fontweight="bold",
            ha="right",
            va="bottom",
            zorder=5,
        )

        # -- Styling --
        ax.set_xlim(-5, 175)
        ax.set_xticks(TIMEPOINTS)
        ax.set_xticklabels(TIMEPOINT_LABELS, fontsize=11, color=COLORS["text"])
        ax.set_xlabel("Burn-In Duration", fontsize=12, color=COLORS["text"], labelpad=8)
        ax.set_ylabel(display["ylabel"], fontsize=12, color=COLORS["text"], labelpad=8)
        ax.set_title(display["title"], fontsize=15, fontweight="bold", color=COLORS["title"], pad=12)
        ax.tick_params(colors=COLORS["text"], labelsize=10)
        ax.grid(True, color=COLORS["grid"], linewidth=0.5, alpha=0.6)

        for spine in ax.spines.values():
            spine.set_color(COLORS["grid"])
            spine.set_linewidth(0.5)

    # --- Legend ---
    from matplotlib.lines import Line2D

    legend_elements = [
        Line2D([0], [0], color=COLORS["normal"], linewidth=2, alpha=0.6, label="Normal"),
        Line2D([0], [0], color=COLORS["latent"], linewidth=2.5, alpha=0.9, label="Latent Defect"),
        Line2D([0], [0], color=COLORS["obvious"], linewidth=2.5, alpha=0.9, label="Obvious Defect"),
        Line2D([0], [0], color=COLORS["limit"], linewidth=1.5, linestyle="--", alpha=0.8, label="Datasheet Limit"),
    ]
    fig.legend(
        handles=legend_elements,
        loc="upper center",
        ncol=4,
        fontsize=11,
        frameon=False,
        labelcolor=COLORS["text"],
        bbox_to_anchor=(0.5, 0.98),
    )

    # --- Suptitle ---
    fig.suptitle(
        "Burn-In Trajectories: Normal vs. Latent vs. Obvious Defects",
        fontsize=17,
        fontweight="bold",
        color=COLORS["title"],
        y=1.02,
    )

    # --- Annotation callout on leakage panel ---
    axes[0].annotate(
        "Latent defects are\nindistinguishable at 0–24h\nbut diverge sharply by 168h",
        xy=(144, _get_annotation_y(merged, "leakage_current_uA")),
        xytext=(50, _get_annotation_y(merged, "leakage_current_uA") * 1.15),
        fontsize=9,
        color=COLORS["latent"],
        alpha=0.9,
        arrowprops=dict(arrowstyle="->", color=COLORS["latent"], alpha=0.6, lw=1.2),
        bbox=dict(boxstyle="round,pad=0.4", facecolor=COLORS["bg"], edgecolor=COLORS["latent"], alpha=0.8),
        zorder=10,
    )

    # --- Save ---
    fig.savefig(
        output_path,
        dpi=200,
        facecolor=COLORS["bg"],
        edgecolor="none",
        bbox_inches="tight",
        pad_inches=0.3,
    )
    plt.close(fig)
    print(f"[OK] Trajectory plot saved to {output_path}")


def _get_annotation_y(merged: pd.DataFrame, param: str) -> float:
    """Find a reasonable y-coordinate for the annotation arrow target."""
    latent = merged[
        (merged["param_name"] == param) & (merged["defect_type"] == "latent")
    ]
    if latent.empty:
        return 35.0
    return float(latent["value_168h"].median())


# ===================================================================
# CLI
# ===================================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Plot sample burn-in trajectories (normal vs. latent vs. obvious defects).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--input-dir", type=str, default="data/generated",
        help="Directory containing burnin_measurements.csv and burnin_labels.csv.",
    )
    parser.add_argument(
        "--output", type=str, default="data/generated/sample_trajectories.png",
        help="Output path for the trajectory plot.",
    )
    parser.add_argument("--seed", type=int, default=42, help="Sampling seed.")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    measurements_df = pd.read_csv(input_dir / "burnin_measurements.csv")
    labels_df = pd.read_csv(input_dir / "burnin_labels.csv")

    plot_sample_trajectories(measurements_df, labels_df, output_path=args.output, seed=args.seed)


if __name__ == "__main__":
    main()
