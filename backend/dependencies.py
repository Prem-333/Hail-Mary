from pathlib import Path
from typing import TypedDict

import pandas as pd
import shap
import numpy as np
import threading

from src.drift_prediction.predictor import DriftPredictor
from src.evaluation.evaluate import (
    evaluate_anomaly_detection,
    evaluate_drift_prediction,
    evaluate_generalization_gap,
)
from src.explainability.explainer import BurnInExplainer
from src.outlier_detection.detector import OutlierDetector

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "generated"

# ── Train/test split ratio (by lot) ────────────────────────────────────
TRAIN_RATIO = 0.80


class SystemState(TypedDict):
    measurements: pd.DataFrame
    labels: pd.DataFrame
    outlier_results: pd.DataFrame
    predictor: DriftPredictor
    predictions: pd.DataFrame
    flags: pd.DataFrame
    explainer: BurnInExplainer
    anomaly_metrics: dict
    drift_metrics: dict
    generalization_metrics: dict
    split_info: dict
    shap_explainers: dict


# Global system state
SYSTEM_STATE: SystemState | None = None
_lock = threading.Lock()


def _stratified_lot_split(
    measurements: pd.DataFrame,
    labels: pd.DataFrame,
    train_ratio: float = TRAIN_RATIO,
    random_state: int = 42,
) -> tuple[list[str], list[str]]:
    """
    80/20 stratified lot-level split.

    Stratification: lots are ranked by their defect rate so that both
    train and test partitions contain a representative mix of easy and
    hard lots.  Splitting at the *lot* level (not component level)
    prevents within-lot data leakage.
    """
    rng = np.random.RandomState(random_state)

    # Compute per-lot defect rate for stratification
    lot_defect = (
        labels.merge(
            measurements[["component_id", "lot_id"]].drop_duplicates(),
            on="component_id",
        )
        .assign(is_defective=lambda df: (df["defect_type"] != "normal").astype(int))
        .groupby("lot_id")["is_defective"]
        .mean()
        .reset_index()
        .rename(columns={"is_defective": "defect_rate"})
    )

    # Sort by defect rate, then interleave into train/test
    lot_defect = lot_defect.sort_values("defect_rate", ascending=True).reset_index(drop=True)
    lots_sorted = lot_defect["lot_id"].tolist()

    # Shuffle within 5 strata so split is stratified but not deterministic
    n = len(lots_sorted)
    strata_size = max(n // 5, 1)
    for i in range(0, n, strata_size):
        chunk = lots_sorted[i : i + strata_size]
        rng.shuffle(chunk)
        lots_sorted[i : i + strata_size] = chunk

    split_idx = int(len(lots_sorted) * train_ratio)
    return lots_sorted[:split_idx], lots_sorted[split_idx:]


def load_system() -> SystemState:
    global SYSTEM_STATE
    with _lock:
        if SYSTEM_STATE is not None:
            return SYSTEM_STATE

        print("Loading data and running screening modules...")
        measurements = pd.read_csv(DATA_DIR / "burnin_measurements.csv")
        labels = pd.read_csv(DATA_DIR / "burnin_labels.csv")

        # ── Train/Test Lot Split ───────────────────────────────────────
        train_lots, test_lots = _stratified_lot_split(measurements, labels)
        train_meas = measurements[measurements["lot_id"].isin(train_lots)]
        test_meas = measurements[measurements["lot_id"].isin(test_lots)]
        train_labels = labels[labels["component_id"].isin(train_meas["component_id"])]
        test_labels = labels[labels["component_id"].isin(test_meas["component_id"])]

        split_info = {
            "train_lots": len(train_lots),
            "test_lots": len(test_lots),
            "train_components": int(train_meas["component_id"].nunique()),
            "test_components": int(test_meas["component_id"].nunique()),
            "split_ratio": f"{TRAIN_RATIO:.0%} / {1 - TRAIN_RATIO:.0%}",
            "strategy": "stratified lot-level split (by defect rate)",
        }
        print(
            f"  Split: {split_info['train_lots']} train lots "
            f"({split_info['train_components']} components) / "
            f"{split_info['test_lots']} test lots "
            f"({split_info['test_components']} components)"
        )

        # Module A — Outlier Detection (fit on all, since unsupervised)
        detector = OutlierDetector(z_threshold=3.5)
        outlier_results = detector.detect(measurements)

        # Module B — Drift Prediction (fit on TRAIN, predict on ALL)
        predictor = DriftPredictor(safety_slope_n_sigma=3.0, random_state=42)
        predictor.fit(train_meas)
        predictions = predictor.predict(measurements)
        flags = predictor.flag_for_rejection(measurements)

        # Explainer (uses all data for component lookups)
        explainer = BurnInExplainer(
            measurements_df=measurements,
            drift_predictor=predictor,
            outlier_results_df=outlier_results,
            labels_df=labels,
        )

        # ── Metrics on TEST split only (honest out-of-sample) ──────────
        test_outlier = outlier_results[
            outlier_results["component_id"].isin(test_meas["component_id"].unique())
        ]
        test_predictions = predictions[
            predictions["component_id"].isin(test_meas["component_id"].unique())
        ]
        anomaly_metrics = evaluate_anomaly_detection(test_outlier, test_labels)
        drift_metrics = evaluate_drift_prediction(
            test_predictions, test_meas, test_labels
        )
        generalization_metrics = evaluate_generalization_gap(measurements, labels)

        # SHAP explainers
        shap_explainers = {
            param: shap.TreeExplainer(predictor.xgb_models_[param])
            for param in predictor.param_names_
        }

        SYSTEM_STATE = {
            "measurements": measurements,
            "labels": labels,
            "outlier_results": outlier_results,
            "predictor": predictor,
            "predictions": predictions,
            "flags": flags,
            "explainer": explainer,
            "anomaly_metrics": anomaly_metrics,
            "drift_metrics": drift_metrics,
            "generalization_metrics": generalization_metrics,
            "split_info": split_info,
            "shap_explainers": shap_explainers,
        }
        print("System loaded successfully.")
        return SYSTEM_STATE


def get_system() -> SystemState:
    if SYSTEM_STATE is None:
        return load_system()
    return SYSTEM_STATE
