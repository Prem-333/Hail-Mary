#!/usr/bin/env python3
"""
Module A — Dynamic Cohort-Relative Outlier Detector
=====================================================

Detects anomalous components in burn-in test data using two complementary
methods, then combines their verdicts:

1. **Robust Z-Score (Mahalanobis-style)**
   Computes a multi-parameter anomaly score per component using the median
   and MAD (Median Absolute Deviation) of the component's lot-cohort at each
   timepoint. This is "cohort-relative" because the score is always computed
   against the component's own lot, not a global population — so a 20 µA
   reading in a 10 µA-average lot is suspicious, even though 20 µA would be
   perfectly normal in a 19 µA-average lot.

2. **Isolation Forest (ensemble)**
   A tree-based anomaly detector from scikit-learn, trained per-lot on all
   parametric features across all timepoints.  Isolation Forest identifies
   anomalies by measuring how few random splits are needed to isolate a
   data point — anomalous points are isolated quickly.

Combination rule: a component is flagged if EITHER method flags it.
Each flag carries provenance (which method, which parameter/timepoint) for
downstream explainability.

Statistical note — why MAD and not standard deviation:
    Standard deviation is heavily influenced by extreme values.  If a lot
    contains 5% defective components, their extreme readings pull the mean
    and inflate the std, making defects *harder* to detect.  The median and
    MAD are *robust* estimators — a handful of outliers barely move them —
    so the "normal" baseline stays clean even when defects are present.

Usage:
    from src.outlier_detection.detector import OutlierDetector
    detector = OutlierDetector(z_threshold=3.5, contamination=0.05)
    results = detector.detect(measurements_df, labels_df=None)
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TIMEPOINTS = [0, 24, 96, 168]
VALUE_COLS = [f"value_{t}h" for t in TIMEPOINTS]
PARAM_NAMES = ["leakage_current_uA", "propagation_delay_ns"]

# Scale factor to convert MAD to a σ-equivalent for normally distributed data.
# For a normal distribution, MAD ≈ 0.6745 × σ, so σ ≈ MAD / 0.6745.
MAD_SCALE = 1.4826  # = 1 / 0.6745


# ===================================================================
# Data structures
# ===================================================================

@dataclass
class AnomalyResult:
    """Container for per-component anomaly detection results."""

    component_id: str
    lot_id: str
    is_anomalous: bool
    anomaly_score: float          # continuous score — higher = more anomalous
    robust_z_score: float         # max robust z across all params/timepoints
    isolation_score: float        # isolation forest anomaly score (−1 to ~0)
    triggered_by: list[str] = field(default_factory=list)


# ===================================================================
# Core detector
# ===================================================================

class OutlierDetector:
    """
    Dynamic, cohort-relative outlier detector for burn-in screening data.

    This detector works on the *wide-form* measurement DataFrame produced by
    the data generator (columns: lot_id, component_id, param_name,
    value_0h, value_24h, value_96h, value_168h).

    Parameters
    ----------
    z_threshold : float, default 3.5
        Robust z-score threshold.  A component is flagged by the z-score
        method if its maximum robust z-score across all parameters and
        timepoints exceeds this value.

        Rule of thumb: for normally distributed data, z > 3.5 corresponds
        to roughly a 1-in-4300 chance — conservative enough to avoid
        false alarms on a 300-unit lot.

    contamination : float, default 0.05
        Expected fraction of anomalies for Isolation Forest.  Set slightly
        above the anticipated defect rate (3–7% latent + 1–2% obvious ≈ 5–9%)
        so the forest doesn't under-flag.

    isolation_n_estimators : int, default 200
        Number of trees in the Isolation Forest ensemble.  200 is well above
        the default 100 and provides more stable scores on small lots.

    random_state : int, default 42
        Random seed for Isolation Forest reproducibility.
    """

    def __init__(
        self,
        z_threshold: float = 3.5,
        contamination: float = 0.05,
        isolation_n_estimators: int = 200,
        random_state: int = 42,
    ):
        self.z_threshold = z_threshold
        self.contamination = contamination
        self.isolation_n_estimators = isolation_n_estimators
        self.random_state = random_state

    # ---------------------------------------------------------------
    # Public API
    # ---------------------------------------------------------------

    def detect(self, measurements_df: pd.DataFrame) -> pd.DataFrame:
        """
        Run anomaly detection on the full measurements DataFrame.

        Parameters
        ----------
        measurements_df : pd.DataFrame
            Must have columns: lot_id, component_id, param_name,
            value_0h, value_24h, value_96h, value_168h.

        Returns
        -------
        pd.DataFrame
            One row per component with columns:
            component_id, lot_id, is_anomalous (bool), anomaly_score (float),
            robust_z_score, isolation_score, triggered_by (list of strings).
        """
        if measurements_df.empty:
            return self._empty_results_df()

        all_results: list[dict] = []

        for lot_id, lot_data in measurements_df.groupby("lot_id"):
            lot_results = self._detect_lot(lot_id, lot_data)
            all_results.extend(lot_results)

        results_df = pd.DataFrame(all_results)

        # Ensure consistent column order
        col_order = [
            "component_id", "lot_id", "is_anomalous", "anomaly_score",
            "robust_z_score", "isolation_score", "triggered_by",
        ]
        return results_df[col_order]

    # ---------------------------------------------------------------
    # Per-lot detection
    # ---------------------------------------------------------------

    def _detect_lot(self, lot_id: str, lot_data: pd.DataFrame) -> list[dict]:
        """
        Run both detection methods on a single lot and combine results.

        For lots with fewer than 4 components, only the robust z-score method
        is applied (Isolation Forest needs a minimum sample size to be
        meaningful).
        """
        # --- Pivot to wide form: one row per component, columns = param×timepoint ---
        wide_df = self._pivot_lot(lot_data)
        component_ids = wide_df.index.tolist()
        feature_cols = [c for c in wide_df.columns if c.startswith("value_")]

        n_components = len(component_ids)

        # --- Method 1: Robust Z-Score ---
        z_results = self._robust_z_method(lot_data, component_ids)

        # --- Method 2: Isolation Forest ---
        if n_components >= 4:
            iso_results = self._isolation_forest_method(wide_df, feature_cols)
        else:
            # Too few samples for Isolation Forest — mark as not triggered
            iso_results = {
                cid: {"flagged": False, "score": 0.0, "triggers": []}
                for cid in component_ids
            }

        # --- Combine ---
        combined = []
        for cid in component_ids:
            z_info = z_results[cid]
            iso_info = iso_results[cid]

            triggered_by: list[str] = []
            triggered_by.extend(z_info["triggers"])
            triggered_by.extend(iso_info["triggers"])

            is_anomalous = z_info["flagged"] or iso_info["flagged"]

            # Composite anomaly score: max of normalized z-score and
            # rescaled isolation score.  The z-score is already interpretable;
            # we rescale the isolation score from its native [-1, ~0.5] range
            # to [0, ~5] so the two are roughly comparable.
            z_normalized = z_info["score"]
            iso_normalized = max(0.0, -iso_info["score"] * 5.0)  # higher = more anomalous
            anomaly_score = round(max(z_normalized, iso_normalized), 4)

            combined.append({
                "component_id": cid,
                "lot_id": lot_id,
                "is_anomalous": is_anomalous,
                "anomaly_score": anomaly_score,
                "robust_z_score": round(z_normalized, 4),
                "isolation_score": round(iso_info["score"], 4),
                "triggered_by": triggered_by,
            })

        return combined

    # ---------------------------------------------------------------
    # Method 1: Robust Z-Score (Mahalanobis-style)
    # ---------------------------------------------------------------

    def _robust_z_method(
        self,
        lot_data: pd.DataFrame,
        component_ids: list[str],
    ) -> dict[str, dict]:
        """
        Compute robust z-scores for every component in the lot.

        For each parameter and timepoint, compute the median and MAD across
        the lot, then calculate a z-score for each component:

            z = |value − median| / (MAD × 1.4826)

        The 1.4826 factor converts MAD to a standard-deviation-equivalent
        for normally distributed data (since MAD ≈ 0.6745σ for a Gaussian).

        We then combine z-scores across parameters using a simplified
        Mahalanobis-style approach: for each timepoint, compute the
        Euclidean norm of the per-parameter z-scores.  The final score
        is the max combined z across all timepoints.

        This catches the "45 µA in a 10 µA-average lot" case because:
        - median ≈ 10 µA, MAD ≈ 1 µA → σ_est ≈ 1.48 µA
        - z = |45 − 10| / 1.48 ≈ 23.6  ≫  threshold of 3.5
        Even though 45 µA is under the 50 µA datasheet limit.

        Parameters
        ----------
        lot_data : pd.DataFrame
            Long-form data for a single lot.
        component_ids : list[str]
            Ordered list of component IDs in this lot.

        Returns
        -------
        dict mapping component_id → {flagged, score, triggers}
        """
        results: dict[str, dict] = {
            cid: {"flagged": False, "score": 0.0, "triggers": []}
            for cid in component_ids
        }

        # For each timepoint, compute combined z across parameters
        for t_col in VALUE_COLS:
            # Collect per-parameter z-scores for all components at this timepoint
            param_z_scores: dict[str, dict[str, float]] = {}  # cid → {param: z}

            for param in lot_data["param_name"].unique():
                param_data = lot_data[lot_data["param_name"] == param]
                values = param_data[t_col].values

                median = np.median(values)
                mad = np.median(np.abs(values - median))
                sigma_est = mad * MAD_SCALE

                if sigma_est < 1e-10:
                    # All values nearly identical — use a small floor to avoid
                    # division by zero, and any deviation will produce a large z
                    sigma_est = 1e-6

                for _, row in param_data.iterrows():
                    cid = row["component_id"]
                    z = abs(row[t_col] - median) / sigma_est

                    if cid not in param_z_scores:
                        param_z_scores[cid] = {}
                    param_z_scores[cid][param] = z

            # Combine per-parameter z-scores via Euclidean norm (Mahalanobis-like)
            for cid, z_dict in param_z_scores.items():
                combined_z = np.sqrt(sum(z ** 2 for z in z_dict.values()))

                if combined_z > results[cid]["score"]:
                    results[cid]["score"] = combined_z

                if combined_z > self.z_threshold:
                    results[cid]["flagged"] = True
                    # Record which parameters contributed most
                    for param, z in z_dict.items():
                        if z > self.z_threshold * 0.5:  # contributed meaningfully
                            trigger = f"robust_z({param}@{t_col}): z={z:.1f}"
                            if trigger not in results[cid]["triggers"]:
                                results[cid]["triggers"].append(trigger)

        return results

    # ---------------------------------------------------------------
    # Method 2: Isolation Forest
    # ---------------------------------------------------------------

    def _isolation_forest_method(
        self,
        wide_df: pd.DataFrame,
        feature_cols: list[str],
    ) -> dict[str, dict]:
        """
        Run Isolation Forest on the wide-form feature matrix for one lot.

        Isolation Forest detects anomalies by building an ensemble of random
        trees and measuring the average path length needed to isolate each
        data point.  Anomalies — being rare and different — are isolated in
        fewer splits and receive lower (more negative) scores.

        This method is complementary to the robust z-score because:
        - Z-score is univariate (per parameter per timepoint) then combined;
          Isolation Forest considers the full joint feature space natively.
        - Z-score assumes roughly Gaussian marginals; Isolation Forest is
          distribution-free.
        - Isolation Forest can detect multivariate anomalies where no single
          feature is extreme but the *combination* is unusual.

        Parameters
        ----------
        wide_df : pd.DataFrame
            Wide-form data (index = component_id, columns include feature columns).
        feature_cols : list[str]
            Column names for the feature matrix.

        Returns
        -------
        dict mapping component_id → {flagged, score, triggers}
        """
        X = wide_df[feature_cols].values
        component_ids = wide_df.index.tolist()

        # Fit Isolation Forest
        clf = IsolationForest(
            n_estimators=self.isolation_n_estimators,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1,
        )
        clf.fit(X)

        # decision_function: negative = more anomalous, positive = more normal
        scores = clf.decision_function(X)
        predictions = clf.predict(X)  # -1 = anomaly, 1 = normal

        results = {}
        for i, cid in enumerate(component_ids):
            flagged = predictions[i] == -1
            triggers = []
            if flagged:
                triggers.append(f"isolation_forest(score={scores[i]:.3f})")

            results[cid] = {
                "flagged": flagged,
                "score": float(scores[i]),
                "triggers": triggers,
            }

        return results

    # ---------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------

    def _pivot_lot(self, lot_data: pd.DataFrame) -> pd.DataFrame:
        """
        Pivot long-form lot data into a wide feature matrix.

        Input (long):
            component_id | param_name          | value_0h | value_24h | ...
            C001         | leakage_current_uA  | 15.2     | 15.5      | ...
            C001         | propagation_delay_ns | 7.1      | 7.2       | ...

        Output (wide):
            component_id | value_0h_leakage_current_uA | value_0h_propagation_delay_ns | ...
            C001         | 15.2                        | 7.1                           | ...
        """
        pivoted = lot_data.pivot_table(
            index="component_id",
            columns="param_name",
            values=VALUE_COLS,
            aggfunc="first",
        )
        # Flatten MultiIndex columns: (value_0h, leakage_current_uA) → value_0h_leakage_current_uA
        pivoted.columns = [f"{val}_{param}" for val, param in pivoted.columns]
        return pivoted

    @staticmethod
    def _empty_results_df() -> pd.DataFrame:
        """Return an empty DataFrame with the correct schema."""
        return pd.DataFrame(columns=[
            "component_id", "lot_id", "is_anomalous", "anomaly_score",
            "robust_z_score", "isolation_score", "triggered_by",
        ])


# ===================================================================
# Convenience function
# ===================================================================

def run_outlier_detection(
    measurements_df: pd.DataFrame,
    z_threshold: float = 3.5,
    contamination: float = 0.05,
    random_state: int = 42,
) -> pd.DataFrame:
    """
    One-call convenience wrapper around OutlierDetector.

    Parameters
    ----------
    measurements_df : pd.DataFrame
        Burn-in measurement data (long form).
    z_threshold : float
        Robust z-score threshold (default 3.5).
    contamination : float
        Isolation Forest contamination parameter (default 0.05).
    random_state : int
        Random seed.

    Returns
    -------
    pd.DataFrame
        Results with columns: component_id, lot_id, is_anomalous,
        anomaly_score, robust_z_score, isolation_score, triggered_by.
    """
    detector = OutlierDetector(
        z_threshold=z_threshold,
        contamination=contamination,
        random_state=random_state,
    )
    return detector.detect(measurements_df)
