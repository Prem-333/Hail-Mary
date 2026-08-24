from pathlib import Path
import pandas as pd
import shap
import numpy as np
import threading

from src.drift_prediction.predictor import DriftPredictor
from src.evaluation.evaluate import (
    evaluate_anomaly_detection,
    evaluate_drift_prediction,
)
from src.explainability.explainer import BurnInExplainer
from src.outlier_detection.detector import OutlierDetector

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "generated"

# Global system state
SYSTEM_STATE = None
_lock = threading.Lock()

def load_system():
    global SYSTEM_STATE
    with _lock:
        if SYSTEM_STATE is not None:
            return SYSTEM_STATE

        print("Loading data and running screening modules...")
        measurements = pd.read_csv(DATA_DIR / "burnin_measurements.csv")
        labels = pd.read_csv(DATA_DIR / "burnin_labels.csv")

        # Module A â€” Outlier Detection
        detector = OutlierDetector(z_threshold=3.5)
        outlier_results = detector.detect(measurements)

        # Module B â€” Drift Prediction
        predictor = DriftPredictor(safety_slope_n_sigma=3.0, random_state=42)
        predictor.fit(measurements)
        predictions = predictor.predict(measurements)
        flags = predictor.flag_for_rejection(measurements)

        # Explainer
        explainer = BurnInExplainer(
            measurements_df=measurements,
            drift_predictor=predictor,
            outlier_results_df=outlier_results,
            labels_df=labels,
        )

        # Pre-compute metrics
        anomaly_metrics = evaluate_anomaly_detection(outlier_results, labels)
        drift_metrics = evaluate_drift_prediction(predictions, measurements, labels)

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
            "shap_explainers": shap_explainers,
        }
        print("System loaded successfully.")
        return SYSTEM_STATE

def get_system():
    if SYSTEM_STATE is None:
        return load_system()
    return SYSTEM_STATE
