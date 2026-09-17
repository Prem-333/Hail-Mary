"""
Integration test — full pipeline: generate → detect → predict → evaluate.
Verifies that the three modules can run end-to-end on synthetic data without
errors, and that the key metric invariants hold.
"""

import pandas as pd
import pytest
from src.data_generation.generate_dataset import generate_dataset
from src.outlier_detection.detector import OutlierDetector
from src.drift_prediction.predictor import DriftPredictor
from src.evaluation.evaluate import evaluate_anomaly_detection, evaluate_drift_prediction

@pytest.fixture(scope="module")
def pipeline_output():
    measurements, labels = generate_dataset(n_lots=3, units_min=80, units_max=100, seed=99)
    detector = OutlierDetector(z_threshold=3.5, contamination=0.05)
    outlier_results = detector.detect(measurements)
    predictor = DriftPredictor(safety_slope_n_sigma=3.0, random_state=99)
    predictor.fit(measurements)
    predictions = predictor.predict(measurements)
    flags = predictor.flag_for_rejection(measurements)
    anomaly_metrics = evaluate_anomaly_detection(outlier_results, labels)
    drift_metrics = evaluate_drift_prediction(predictions, measurements, labels)
    return {
        "measurements": measurements, "labels": labels,
        "outlier_results": outlier_results, "predictor": predictor,
        "predictions": predictions, "flags": flags,
        "anomaly_metrics": anomaly_metrics, "drift_metrics": drift_metrics,
    }

class TestPipelineIntegration:
    def test_pipeline_completes_without_error(self, pipeline_output):
        assert pipeline_output is not None

    def test_all_components_have_outlier_results(self, pipeline_output):
        n_components = pipeline_output["measurements"]["component_id"].nunique()
        assert len(pipeline_output["outlier_results"]) == n_components

    def test_recall_above_80_percent(self, pipeline_output):
        recall = pipeline_output["anomaly_metrics"]["recall"]
        assert recall >= 0.80, f"Recall {recall:.2%} is below 80% threshold"

    def test_leakage_mae_below_3ua(self, pipeline_output):
        mae = pipeline_output["drift_metrics"].get("leakage_mae", 999)
        assert mae < 3.0, f"Leakage MAE {mae:.2f} µA exceeds 3.0 µA threshold"

    def test_no_forbidden_features_in_model(self, pipeline_output):
        predictor = pipeline_output["predictor"]
        for param, model in predictor.xgb_models_.items():
            feature_names = list(model.get_booster().feature_names)
            assert "value_96h" not in feature_names
            assert "value_168h" not in feature_names

    def test_flags_schema_correct(self, pipeline_output):
        flags = pipeline_output["flags"]
        assert "flagged_for_rejection" in flags.columns
        assert flags["flagged_for_rejection"].dtype == bool or flags["flagged_for_rejection"].isin([True, False]).all()
