# drift_prediction — Module B: parametric drift forecasting
#
# Public API:
#   DriftPredictor          — configurable predictor class (XGBoost + linear baseline)
#   run_drift_prediction()  — one-call convenience wrapper

from src.drift_prediction.predictor import DriftPredictor, run_drift_prediction

__all__ = ["DriftPredictor", "run_drift_prediction"]
