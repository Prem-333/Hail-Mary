"""
tests/test_api_endpoints.py
============================
Comprehensive API test suite for the burn-in reliability analysis backend.

Uses a monkeypatched fake SYSTEM_STATE so that **no real ML training** is
triggered.  Every route is exercised through FastAPI's ``TestClient``.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pandas as pd
import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture()
def fake_system() -> dict:
    """Build a minimal, self-contained fake SYSTEM_STATE dict.

    Every value that the real pipeline would compute is replaced with
    deterministic, hard-coded data so tests are fast and repeatable.
    """

    # ── measurements ────────────────────────────────────────────────────
    measurements = pd.DataFrame(
        [
            {
                "component_id": cid,
                "lot_id": "LOT_001",
                "param_name": param,
                "value_0h": 15.0,
                "value_24h": 15.5,
                "value_96h": 16.0,
                "value_168h": 16.5,
            }
            for cid in ("LOT_001_C0001", "LOT_001_C0002")
            for param in ("leakage_current_uA", "propagation_delay_ns")
        ]
    )

    # ── labels ──────────────────────────────────────────────────────────
    labels = pd.DataFrame(
        {
            "component_id": ["LOT_001_C0001", "LOT_001_C0002"],
            "defect_type": ["normal", "normal"],
        }
    )

    # ── outlier_results ─────────────────────────────────────────────────
    outlier_results = pd.DataFrame(
        {
            "component_id": ["LOT_001_C0001", "LOT_001_C0002"],
            "lot_id": ["LOT_001", "LOT_001"],
            "is_anomalous": [False, False],
            "anomaly_score": [1.0, 1.0],
            "robust_z_score": [0.5, 0.5],
            "isolation_score": [0.1, 0.1],
            "triggered_by": [[], []],
        }
    )

    # ── predictor (MagicMock) ───────────────────────────────────────────
    predictor = MagicMock()
    predictor.param_names_ = [
        "leakage_current_uA",
        "propagation_delay_ns",
    ]
    predictor.xgb_models_ = {
        "leakage_current_uA": MagicMock(n_features_in_=5),
        "propagation_delay_ns": MagicMock(n_features_in_=5),
    }
    predictor.safety_slope_n_sigma = 3.0

    predictions_df = pd.DataFrame(
        {
            "component_id": ["LOT_001_C0001"],
            "lot_id": ["LOT_001"],
            "param_name": ["leakage_current_uA"],
            "predicted_168h_xgb": [16.5],
            "predicted_168h_linear": [16.4],
            "value_0h": [15.0],
            "value_24h": [15.5],
            "early_slope": [0.02],
        }
    )
    predictor.predict.return_value = predictions_df

    flags_df = pd.DataFrame(
        {
            "component_id": ["LOT_001_C0001"],
            "lot_id": ["LOT_001"],
            "flagged_for_rejection": [False],
            "max_implied_drift": [0.009],
            "max_safety_slope": [0.05],
            "flagged_params": [[]],
        }
    )
    predictor.flag_for_rejection.return_value = flags_df

    # ── explainer (MagicMock) ───────────────────────────────────────────
    explainer = MagicMock()
    explainer.generate_qa_report.return_value = {
        "component_id": "LOT_001_C0001",
        "verdict": "ACCEPT",
        "anomaly": {
            "is_anomalous": False,
            "score": 1.0,
            "triggered_by": [],
        },
        "drift": {
            "predicted_168h_xgb": {"leakage_current_uA": 16.5},
        },
        "shap_values": {},
        "recommendation": "ACCEPT",
    }

    # ── scalar / dict metrics ───────────────────────────────────────────
    anomaly_metrics: dict = {
        "f2_score": 0.93,
        "recall": 0.96,
        "precision": 0.84,
        "false_negatives": 0,
        "false_positives": 180,
        "total_defects": 2500,
        "total_normal": 35518,
    }

    drift_metrics: dict = {
        "leakage_mae": 1.45,
        "delay_mae": 0.47,
        "leakage_current_uA": {
            "xgb_mae_normal": 0.77,
            "xgb_mae_latent": 3.2,
            "xgb_mae_obvious": 8.1,
            "linear_mae_normal": 1.2,
            "linear_mae_latent": 4.5,
            "linear_mae_obvious": 11.0,
        },
        "propagation_delay_ns": {
            "xgb_mae_normal": 0.30,
            "xgb_mae_latent": 1.1,
            "xgb_mae_obvious": 3.2,
            "linear_mae_normal": 0.55,
            "linear_mae_latent": 1.8,
            "linear_mae_obvious": 4.5,
        },
    }

    return {
        "measurements": measurements,
        "labels": labels,
        "outlier_results": outlier_results,
        "predictor": predictor,
        "explainer": explainer,
        "anomaly_metrics": anomaly_metrics,
        "drift_metrics": drift_metrics,
        "shap_explainers": {},
        "flags": flags_df,
        "predictions": predictions_df,
    }


@pytest.fixture()
def client(fake_system: dict):
    """Yield a FastAPI ``TestClient`` with the real system state replaced.

    Both ``dependencies.SYSTEM_STATE`` and ``dependencies.get_system`` are
    monkeypatched so that no route ever touches the real ML pipeline.
    """
    from fastapi.testclient import TestClient

    from backend import dependencies
    from backend.main import app

    # Monkeypatch the module-level state and the accessor function.
    original_state = getattr(dependencies, "SYSTEM_STATE", None)
    original_getter = getattr(dependencies, "get_system", None)

    dependencies.SYSTEM_STATE = fake_system
    dependencies.get_system = lambda: fake_system

    with TestClient(app) as tc:
        yield tc

    # Restore originals so other test modules are unaffected.
    dependencies.SYSTEM_STATE = original_state
    dependencies.get_system = original_getter


# ─────────────────────────────────────────────────────────────────────────────
# Tests → /api/lots/
# ─────────────────────────────────────────────────────────────────────────────


class TestLotsEndpoint:
    """Tests for the lot-listing and lot-detail routes."""

    def test_get_lots_returns_200(self, client):
        response = client.get("/api/lots/")
        assert response.status_code == 200, (
            f"Expected 200 from GET /api/lots/, got {response.status_code}"
        )
        data = response.json()
        assert isinstance(data, list), (
            f"Expected response to be a list, got {type(data).__name__}"
        )
        assert len(data) >= 1, (
            "Expected at least one lot in the response list, "
            f"but got {len(data)} items"
        )

    def test_lot_has_required_fields(self, client):
        data = client.get("/api/lots/").json()
        required_keys = {"lot_id", "n_components", "n_anomalous", "defect_rate"}
        for lot in data:
            missing = required_keys - set(lot.keys())
            assert not missing, (
                f"Lot {lot} is missing required field(s): {missing}"
            )

    def test_get_specific_lot_returns_200(self, client):
        response = client.get("/api/lots/LOT_001")
        assert response.status_code == 200, (
            f"Expected 200 for existing lot LOT_001, got {response.status_code}"
        )

    def test_get_nonexistent_lot_returns_404(self, client):
        response = client.get("/api/lots/FAKE_LOT_XYZ")
        assert response.status_code == 404, (
            f"Expected 404 for non-existent lot FAKE_LOT_XYZ, got {response.status_code}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Tests → /api/components/
# ─────────────────────────────────────────────────────────────────────────────


class TestComponentsEndpoint:
    """Tests for the component detail route."""

    def test_get_component_returns_200(self, client):
        response = client.get("/api/components/LOT_001_C0001")
        assert response.status_code == 200, (
            f"Expected 200 for component LOT_001_C0001, got {response.status_code}"
        )

    def test_component_response_has_required_keys(self, client):
        data = client.get("/api/components/LOT_001_C0001").json()
        required_keys = {
            "component_id",
            "lot_id",
            "defect_type",
            "report",
            "trajectories",
        }
        missing = required_keys - set(data.keys())
        assert not missing, (
            f"Component response is missing required key(s): {missing}"
        )

    def test_get_nonexistent_component_returns_404(self, client):
        response = client.get("/api/components/FAKE_COMPONENT")
        assert response.status_code == 404, (
            f"Expected 404 for non-existent component FAKE_COMPONENT, "
            f"got {response.status_code}"
        )

    def test_trajectories_contain_both_params(self, client):
        data = client.get("/api/components/LOT_001_C0001").json()
        trajectories = data["trajectories"]
        assert "leakage_current_uA" in trajectories, (
            "Expected 'leakage_current_uA' in trajectories dict"
        )
        assert "propagation_delay_ns" in trajectories, (
            "Expected 'propagation_delay_ns' in trajectories dict"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Tests → /api/simulate/
# ─────────────────────────────────────────────────────────────────────────────


class TestSimulatorEndpoint:
    """Tests for the simulation (what-if) route."""

    _VALID_BODY = {
        "leakage_0h": 15.0,
        "leakage_24h": 15.5,
        "delay_0h": 8.0,
        "delay_24h": 8.1,
        "lot_id": "LOT_001",
    }

    def test_simulate_returns_200(self, client):
        response = client.post("/api/simulate/", json=self._VALID_BODY)
        assert response.status_code == 200, (
            f"Expected 200 from POST /api/simulate/, got {response.status_code}"
        )

    def test_simulate_response_has_prediction(self, client):
        data = client.post("/api/simulate/", json=self._VALID_BODY).json()
        has_key = (
            "predicted_168h" in data
            or "predicted" in data
            or "shap_values" in data
        )
        assert has_key, (
            "Simulate response must contain at least one of "
            "'predicted_168h', 'predicted', or 'shap_values'. "
            f"Keys found: {list(data.keys())}"
        )

    def test_simulate_missing_body_returns_422(self, client):
        response = client.post("/api/simulate/", json={})
        assert response.status_code == 422, (
            f"Expected 422 Unprocessable Entity for empty body, "
            f"got {response.status_code}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Tests → /api/evaluation/
# ─────────────────────────────────────────────────────────────────────────────


class TestEvaluationEndpoint:
    """Tests for the evaluation / model-metrics route."""

    def test_evaluation_returns_200(self, client):
        response = client.get("/api/evaluation/")
        assert response.status_code == 200, (
            f"Expected 200 from GET /api/evaluation/, got {response.status_code}"
        )

    def test_evaluation_has_anomaly_metrics(self, client):
        data = client.get("/api/evaluation/").json()
        assert "anomaly_metrics" in data, (
            "Evaluation response must include 'anomaly_metrics'. "
            f"Keys found: {list(data.keys())}"
        )

    def test_evaluation_has_drift_metrics(self, client):
        data = client.get("/api/evaluation/").json()
        assert "drift_metrics" in data, (
            "Evaluation response must include 'drift_metrics'. "
            f"Keys found: {list(data.keys())}"
        )

    def test_f2_score_in_valid_range(self, client):
        data = client.get("/api/evaluation/").json()
        f2 = data["anomaly_metrics"]["f2_score"]
        assert 0 <= f2 <= 1, (
            f"f2_score should be between 0 and 1, got {f2}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Tests → / (health check)
# ─────────────────────────────────────────────────────────────────────────────


class TestHealthEndpoint:
    """Tests for the root health-check route."""

    def test_root_returns_ok(self, client):
        response = client.get("/")
        assert response.status_code == 200, (
            f"Expected 200 from GET /, got {response.status_code}"
        )
        data = response.json()
        assert data["status"] == "ok", (
            f"Expected status 'ok' in health check response, got {data.get('status')!r}"
        )
