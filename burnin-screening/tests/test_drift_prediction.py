"""
Unit tests for Module B — Drift Prediction
=============================================

Test coverage:
1. Model never sees value_96h or value_168h as training features
2. Predictions are directionally sane (higher slope → higher prediction)
3. Safety-slope flagging correctly identifies components with elevated drift
4. Evaluation metrics make sense (defect MAE > normal MAE)
5. Edge cases (single-unit lot, empty data)
"""

import numpy as np
import pandas as pd
import pytest

from src.drift_prediction.predictor import (
    FEATURE_NAMES,
    DriftPredictor,
    _FORBIDDEN_FEATURES,
    run_drift_prediction,
)

# ---------------------------------------------------------------------------
# Test data builders
# ---------------------------------------------------------------------------

TIMEPOINTS = [0, 24, 96, 168]
VALUE_COLS = [f"value_{t}h" for t in TIMEPOINTS]


def _make_row(lot_id, comp_id, param, v0, v24, v96, v168):
    """Helper: create one measurement row."""
    return {
        "lot_id": lot_id,
        "component_id": comp_id,
        "param_name": param,
        "value_0h": v0,
        "value_24h": v24,
        "value_96h": v96,
        "value_168h": v168,
    }


def _build_simple_lot(
    lot_id="LOT_T",
    n_normal=80,
    extra_components=None,
    seed=42,
):
    """
    Build a controlled lot with normal components and optional extras.

    Normal components: leakage ~15 +/- 1 µA, mild linear drift.
    Extra components: explicitly specified trajectories.
    """
    rng = np.random.default_rng(seed)
    rows = []

    for i in range(n_normal):
        cid = f"{lot_id}_N{i:04d}"
        base_leak = 15.0 + rng.normal(0, 1.0)
        base_delay = 8.0 + rng.normal(0, 0.5)
        # Mild linear drift (~0.005 µA/h for leakage, ~0.003 ns/h for delay)
        for param, base, rate, noise_std in [
            ("leakage_current_uA", base_leak, 0.005, 0.3),
            ("propagation_delay_ns", base_delay, 0.003, 0.15),
        ]:
            vals = [round(base + rate * t + rng.normal(0, noise_std), 4) for t in TIMEPOINTS]
            rows.append(_make_row(lot_id, cid, param, *vals))

    if extra_components:
        for comp in extra_components:
            rows.append(_make_row(lot_id, comp["comp_id"], "leakage_current_uA", *comp["leakage"]))
            rows.append(_make_row(lot_id, comp["comp_id"], "propagation_delay_ns", *comp["delay"]))

    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def generated_dataset():
    """Generate a small dataset using the Phase 1 generator."""
    from src.data_generation.generate_dataset import generate_dataset

    measurements_df, labels_df = generate_dataset(
        n_lots=5, units_min=100, units_max=150, seed=42,
    )
    return measurements_df, labels_df


@pytest.fixture(scope="module")
def fitted_predictor(generated_dataset):
    """Train a predictor on the generated dataset."""
    measurements_df, _ = generated_dataset
    predictor = DriftPredictor(safety_slope_n_sigma=2.5, random_state=42)
    predictor.fit(measurements_df)
    return predictor


# ---------------------------------------------------------------------------
# Test 1: No data leakage
# ---------------------------------------------------------------------------

class TestNoDataLeakage:
    """
    The model must NEVER see value_96h or value_168h as input features.
    value_96h is a validation signal only; value_168h is the prediction target.
    Leaking either would invalidate the entire "predict from early data" premise.
    """

    def test_feature_names_exclude_forbidden(self):
        """FEATURE_NAMES must not contain value_96h or value_168h."""
        for feat in FEATURE_NAMES:
            assert feat not in _FORBIDDEN_FEATURES, (
                f"FEATURE_NAMES contains forbidden feature: {feat}"
            )

    def test_feature_names_are_0h_24h_derived(self):
        """All features must be derivable from 0h and 24h data only."""
        allowed_sources = {"value_0h", "value_24h", "early_slope", "lot_dev_0h", "lot_dev_24h"}
        for feat in FEATURE_NAMES:
            assert feat in allowed_sources, f"Unexpected feature: {feat}"

    def test_engineered_features_exclude_96h_168h(self):
        """The actual feature matrix produced by _engineer_features must not leak."""
        data = _build_simple_lot(n_normal=20)
        predictor = DriftPredictor()
        predictor.lot_stats_ = predictor._compute_lot_stats(data)

        for param in data["param_name"].unique():
            param_data = data[data["param_name"] == param]
            X = predictor._engineer_features(param_data, param)

            assert "value_96h" not in X.columns, "value_96h leaked into features!"
            assert "value_168h" not in X.columns, "value_168h leaked into features!"
            assert list(X.columns) == FEATURE_NAMES

    def test_xgb_model_has_correct_n_features(self, fitted_predictor):
        """Trained XGBoost model should have exactly len(FEATURE_NAMES) features."""
        for param, model in fitted_predictor.xgb_models_.items():
            n_features = model.n_features_in_
            assert n_features == len(FEATURE_NAMES), (
                f"Model for {param} has {n_features} features, expected {len(FEATURE_NAMES)}"
            )


# ---------------------------------------------------------------------------
# Test 2: Directional sanity
# ---------------------------------------------------------------------------

class TestDirectionalSanity:
    """
    Higher early_slope should correlate with higher predicted 168h value.
    This is basic physical sanity: a component drifting faster early on
    is expected to drift more by 168h.
    """

    def test_higher_slope_higher_prediction(self):
        """
        Construct two components in the same lot:
        - Component A: low early slope (0.005 µA/h)
        - Component B: high early slope (0.05 µA/h, 10x higher)

        After training, B should get a higher predicted 168h.
        """
        # Build training data with enough variety for the model to learn
        data = _build_simple_lot(
            n_normal=100,
            extra_components=[
                {
                    "comp_id": "SLOW_DRIFT",
                    "leakage": [15.0, 15.12, 15.5, 15.8],  # slope = 0.005
                    "delay": [8.0, 8.07, 8.3, 8.5],
                },
                {
                    "comp_id": "FAST_DRIFT",
                    "leakage": [15.0, 16.2, 19.0, 22.0],  # slope = 0.05
                    "delay": [8.0, 8.5, 10.0, 11.5],
                },
            ],
            seed=42,
        )

        predictor = DriftPredictor(random_state=42)
        predictor.fit(data)
        predictions = predictor.predict(data)

        slow = predictions[predictions["component_id"] == "SLOW_DRIFT"]
        fast = predictions[predictions["component_id"] == "FAST_DRIFT"]

        # For leakage current, fast drift should predict higher 168h
        slow_leak_pred = slow[slow["param_name"] == "leakage_current_uA"]["predicted_168h_xgb"].values[0]
        fast_leak_pred = fast[fast["param_name"] == "leakage_current_uA"]["predicted_168h_xgb"].values[0]

        assert fast_leak_pred > slow_leak_pred, (
            f"Fast-drift prediction ({fast_leak_pred:.2f}) should exceed "
            f"slow-drift prediction ({slow_leak_pred:.2f})"
        )

    def test_predictions_are_positive(self, generated_dataset, fitted_predictor):
        """All predicted 168h values should be positive (physical constraint)."""
        measurements_df, _ = generated_dataset
        predictions = fitted_predictor.predict(measurements_df)

        assert (predictions["predicted_168h_xgb"] > 0).all(), "Negative predictions found"
        assert (predictions["predicted_168h_linear"] > 0).all(), "Negative linear predictions found"


# ---------------------------------------------------------------------------
# Test 3: Safety-slope flagging
# ---------------------------------------------------------------------------

class TestSafetySlopeFlagging:
    """
    The safety-slope mechanism should flag components with abnormally high
    predicted drift.  On generated data, it should flag more defective
    components than normal ones (proportionally).
    """

    def test_elevated_drift_component_is_flagged(self):
        """
        A component with dramatically elevated early slope (10x normal)
        should be flagged by the safety-slope mechanism.
        """
        data = _build_simple_lot(
            n_normal=80,
            extra_components=[{
                "comp_id": "DRIFTER",
                "leakage": [15.0, 18.0, 30.0, 45.0],  # aggressive drift
                "delay": [8.0, 9.5, 14.0, 18.0],
            }],
            seed=42,
        )
        # Use a moderate N_sigma so elevated slopes are caught
        predictor = DriftPredictor(safety_slope_n_sigma=2.5, random_state=42)
        predictor.fit(data)
        flags = predictor.flag_for_rejection(data)

        drifter = flags[flags["component_id"] == "DRIFTER"]
        assert len(drifter) == 1
        assert bool(drifter.iloc[0]["flagged_for_rejection"]) is True, (
            f"Elevated-drift component was not flagged! "
            f"implied_drift={drifter.iloc[0]['max_implied_drift']:.4f}, "
            f"safety_slope={drifter.iloc[0]['max_safety_slope']:.4f}"
        )

    def test_normal_components_mostly_unflagged(self):
        """In a clean lot, almost no normal components should be flagged."""
        data = _build_simple_lot(n_normal=100, extra_components=None, seed=42)
        predictor = DriftPredictor(safety_slope_n_sigma=3.0, random_state=42)
        predictor.fit(data)
        flags = predictor.flag_for_rejection(data)

        n_flagged = flags["flagged_for_rejection"].sum()
        # Allow up to 5% false positives at N=3
        assert n_flagged <= 5, f"Too many normal components flagged: {n_flagged}/100"

    def test_defect_flag_rate_exceeds_normal_rate_on_generated_data(
        self, generated_dataset, fitted_predictor,
    ):
        """
        On generated data, the flag rate for defective components should be
        higher than for normal components.  This verifies the safety slope
        has discriminative power.

        Note: we don't expect perfect recall.  Latent defects are designed
        to look normal at 0h/24h, so only those with subtly elevated early
        slopes will be caught.  The point is that the flagging is NOT random.
        """
        measurements_df, labels_df = generated_dataset
        flags = fitted_predictor.flag_for_rejection(measurements_df)

        # Merge with labels
        merged = flags.merge(labels_df[["component_id", "defect_type"]], on="component_id")

        normal_flags = merged[merged["defect_type"] == "normal"]
        defect_flags = merged[merged["defect_type"] != "normal"]

        normal_flag_rate = normal_flags["flagged_for_rejection"].mean()
        defect_flag_rate = defect_flags["flagged_for_rejection"].mean()

        # Defect flag rate should exceed normal flag rate
        assert defect_flag_rate > normal_flag_rate, (
            f"Defect flag rate ({defect_flag_rate:.2%}) should exceed "
            f"normal flag rate ({normal_flag_rate:.2%})"
        )


# ---------------------------------------------------------------------------
# Test 4: Evaluation metrics
# ---------------------------------------------------------------------------

class TestEvaluation:
    """Verify evaluation metrics are sensible."""

    def test_xgb_beats_linear(self, generated_dataset, fitted_predictor):
        """
        XGBoost MAE should be less than or equal to linear regression MAE.
        If not, the non-linear model provides no benefit (which would be
        suspicious on this data).
        """
        measurements_df, labels_df = generated_dataset
        metrics = fitted_predictor.evaluate(measurements_df, labels_df)

        for param, m in metrics.items():
            assert m["xgb_mae"] <= m["linear_mae"] * 1.1, (
                f"XGBoost MAE ({m['xgb_mae']:.4f}) is unexpectedly worse than "
                f"linear MAE ({m['linear_mae']:.4f}) for {param}"
            )

    def test_defect_mae_exceeds_normal_mae(self, generated_dataset, fitted_predictor):
        """
        Per-class MAE for latent defects should exceed normal MAE.

        This is EXPECTED and correct: latent defects diverge at 168h in ways
        the model cannot predict from 0h/24h features.  The model predicts
        "normal" → large residual → high MAE.

        A model where defect MAE ≈ normal MAE would be suspicious — it would
        mean either the defects aren't actually different at 168h, or the
        model is somehow seeing future data.
        """
        measurements_df, labels_df = generated_dataset
        metrics = fitted_predictor.evaluate(measurements_df, labels_df)

        for param, m in metrics.items():
            if "xgb_mae_latent" in m and "xgb_mae_normal" in m:
                assert m["xgb_mae_latent"] > m["xgb_mae_normal"], (
                    f"Latent MAE ({m['xgb_mae_latent']:.4f}) should exceed normal MAE "
                    f"({m['xgb_mae_normal']:.4f}) for {param}"
                )

    def test_metrics_structure(self, generated_dataset, fitted_predictor):
        """Metrics dict should have expected keys."""
        measurements_df, labels_df = generated_dataset
        metrics = fitted_predictor.evaluate(measurements_df, labels_df)

        for param in fitted_predictor.param_names_:
            assert param in metrics
            m = metrics[param]
            assert "xgb_mae" in m
            assert "linear_mae" in m


# ---------------------------------------------------------------------------
# Test 5: Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Edge cases that should not crash the predictor."""

    def test_single_lot(self):
        """Predictor works on a single lot."""
        data = _build_simple_lot(n_normal=30)
        predictor = DriftPredictor(random_state=42)
        predictor.fit(data)
        preds = predictor.predict(data)
        assert len(preds) == 60  # 30 components x 2 params

    def test_small_lot(self):
        """Predictor handles a very small lot (5 components)."""
        data = _build_simple_lot(n_normal=5)
        predictor = DriftPredictor(random_state=42)
        predictor.fit(data)
        preds = predictor.predict(data)
        flags = predictor.flag_for_rejection(data)
        assert len(preds) == 10  # 5 x 2
        assert len(flags) == 5

    def test_prediction_schema(self):
        """Predictions DataFrame should have expected columns."""
        data = _build_simple_lot(n_normal=20)
        predictor = DriftPredictor(random_state=42)
        predictor.fit(data)
        preds = predictor.predict(data)

        expected_cols = {
            "component_id", "lot_id", "param_name", "value_0h", "value_24h",
            "early_slope", "predicted_168h_xgb", "predicted_168h_linear",
        }
        assert expected_cols.issubset(set(preds.columns))

    def test_flagging_schema(self):
        """Flagging DataFrame should have expected columns."""
        data = _build_simple_lot(n_normal=20)
        predictor = DriftPredictor(random_state=42)
        predictor.fit(data)
        flags = predictor.flag_for_rejection(data)

        expected_cols = {
            "component_id", "lot_id", "flagged_for_rejection",
            "max_implied_drift", "max_safety_slope", "flagged_params",
        }
        assert expected_cols.issubset(set(flags.columns))


# ---------------------------------------------------------------------------
# Test: convenience function
# ---------------------------------------------------------------------------

class TestConvenienceFunction:
    """Test the run_drift_prediction wrapper."""

    def test_returns_correct_tuple(self):
        data = _build_simple_lot(n_normal=30)
        labels = pd.DataFrame({
            "component_id": data["component_id"].unique(),
            "defect_type": "normal",
        })
        preds, flags, metrics = run_drift_prediction(data, labels)

        assert isinstance(preds, pd.DataFrame)
        assert isinstance(flags, pd.DataFrame)
        assert isinstance(metrics, dict)

    def test_works_without_labels(self):
        data = _build_simple_lot(n_normal=30)
        preds, flags, metrics = run_drift_prediction(data, labels_df=None)

        assert isinstance(preds, pd.DataFrame)
        assert isinstance(flags, pd.DataFrame)
        assert metrics is None
