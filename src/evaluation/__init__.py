# evaluation — Metrics, benchmarks, and reporting
#
# Public API:
#   evaluate_all()                    — one-call full evaluation harness
#   evaluate_anomaly_detection()      — Module A precision/recall/F2
#   evaluate_drift_prediction()       — Module B MAE/RMSE per class
#   evaluate_explainability()         — rubric-based QA report scoring
#   evaluate_lot_cv()                 — k-fold lot-level cross-validation
#   evaluate_generalization_gap()     — in-sample vs CV generalization gap

from src.evaluation.evaluate import (
    evaluate_all,
    evaluate_anomaly_detection,
    evaluate_drift_prediction,
    evaluate_explainability,
    evaluate_lot_cv,
    evaluate_generalization_gap,
)

__all__ = [
    "evaluate_all",
    "evaluate_anomaly_detection",
    "evaluate_drift_prediction",
    "evaluate_explainability",
    "evaluate_lot_cv",
    "evaluate_generalization_gap",
]
