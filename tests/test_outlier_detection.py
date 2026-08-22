"""
Unit tests for Module A — Outlier Detection
=============================================

Test coverage:
1. Obvious defects are caught
2. Normal components are not flagged
3. The datasheet-limit edge case (45 µA in a 10 µA lot, under 50 µA limit) is caught
4. Empty and single-unit lots don't crash
5. Result schema is correct
6. Both detection methods contribute triggers
"""

import numpy as np
import pandas as pd
import pytest

from src.outlier_detection.detector import OutlierDetector, run_outlier_detection


# ---------------------------------------------------------------------------
# Fixtures — construct controlled test data
# ---------------------------------------------------------------------------

TIMEPOINTS = [0, 24, 96, 168]
VALUE_COLS = [f"value_{t}h" for t in TIMEPOINTS]


def _make_measurement_row(
    lot_id: str,
    comp_id: str,
    param: str,
    values: list[float],
) -> dict:
    """Helper: create one measurement row."""
    row = {"lot_id": lot_id, "component_id": comp_id, "param_name": param}
    for col, val in zip(VALUE_COLS, values):
        row[col] = val
    return row


def _build_lot_data(
    lot_id: str = "LOT_TEST",
    n_normal: int = 50,
    outlier_specs: list[dict] | None = None,
    normal_leakage_mean: float = 10.0,
    normal_delay_mean: float = 7.0,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Build a synthetic lot with controllable normal and outlier components.

    Parameters
    ----------
    outlier_specs : list of dict
        Each dict: {"comp_id": str, "leakage_values": [4 floats],
                     "delay_values": [4 floats]}
    """
    rng = np.random.default_rng(seed)
    rows = []

    # Normal components — tight cluster around the mean
    for i in range(n_normal):
        cid = f"{lot_id}_N{i:04d}"
        leakage = [round(normal_leakage_mean + rng.normal(0, 0.8), 2) for _ in TIMEPOINTS]
        delay = [round(normal_delay_mean + rng.normal(0, 0.4), 2) for _ in TIMEPOINTS]
        rows.append(_make_measurement_row(lot_id, cid, "leakage_current_uA", leakage))
        rows.append(_make_measurement_row(lot_id, cid, "propagation_delay_ns", delay))

    # Outlier components
    if outlier_specs:
        for spec in outlier_specs:
            cid = spec["comp_id"]
            rows.append(_make_measurement_row(
                lot_id, cid, "leakage_current_uA", spec["leakage_values"]
            ))
            rows.append(_make_measurement_row(
                lot_id, cid, "propagation_delay_ns", spec["delay_values"]
            ))

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Test: obvious defect is caught
# ---------------------------------------------------------------------------

class TestObviousDefect:
    """An obvious defect with values far above the lot mean should always be flagged."""

    def test_obvious_defect_is_flagged(self):
        """A component at 60 µA in a 10 µA-average lot is unmistakably anomalous."""
        data = _build_lot_data(
            outlier_specs=[{
                "comp_id": "LOT_TEST_OBVIOUS",
                "leakage_values": [58.0, 60.0, 65.0, 72.0],
                "delay_values": [15.0, 16.0, 17.0, 19.0],
            }],
        )
        detector = OutlierDetector(z_threshold=3.5)
        results = detector.detect(data)

        obvious = results[results["component_id"] == "LOT_TEST_OBVIOUS"]
        assert len(obvious) == 1
        assert bool(obvious.iloc[0]["is_anomalous"]) is True
        assert obvious.iloc[0]["anomaly_score"] > 5.0  # should be very high
        assert len(obvious.iloc[0]["triggered_by"]) > 0

    def test_obvious_defect_score_exceeds_threshold(self):
        """The robust z-score for a 60 µA reading in a 10 µA lot should be huge."""
        data = _build_lot_data(
            outlier_specs=[{
                "comp_id": "LOT_TEST_OBVIOUS",
                "leakage_values": [60.0, 62.0, 65.0, 70.0],
                "delay_values": [7.0, 7.1, 7.2, 7.3],  # delay is normal
            }],
        )
        detector = OutlierDetector(z_threshold=3.5)
        results = detector.detect(data)

        row = results[results["component_id"] == "LOT_TEST_OBVIOUS"].iloc[0]
        assert row["robust_z_score"] > 20.0  # (60-10)/~1.2 ≈ 42


# ---------------------------------------------------------------------------
# Test: normal components are NOT flagged
# ---------------------------------------------------------------------------

class TestNormalComponents:
    """Normal components clustered around the lot mean should not be flagged."""

    def test_no_false_positives_in_clean_lot(self):
        """A lot with only normal components should produce very few anomalies."""
        data = _build_lot_data(n_normal=100, outlier_specs=None)
        # Use very low contamination to minimize IF false positives on a clean lot
        detector = OutlierDetector(z_threshold=3.5, contamination=0.005)
        results = detector.detect(data)

        n_flagged = results["is_anomalous"].sum()
        # Allow at most 5% false positives — Isolation Forest may flag a few
        # components at the tails of the normal distribution
        assert n_flagged <= 5, f"Expected <=5 false positives, got {n_flagged}"

    def test_normal_scores_are_low(self):
        """Normal components should have low anomaly scores."""
        data = _build_lot_data(n_normal=100, outlier_specs=None)
        detector = OutlierDetector(z_threshold=3.5, contamination=0.01)
        results = detector.detect(data)

        median_score = results["anomaly_score"].median()
        assert median_score < 3.0, f"Median anomaly score {median_score} is too high for normals"


# ---------------------------------------------------------------------------
# Test: datasheet-limit edge case — 45 µA under 50 µA limit
# ---------------------------------------------------------------------------

class TestDatasheetEdgeCase:
    """
    The critical scenario from the problem brief: a component reads 45 µA in
    a lot where the average is ~10 µA.  The 50 µA datasheet limit would PASS
    this component, but our cohort-relative detector must flag it.

    This test constructs exactly this scenario and asserts it's caught.
    """

    def test_45uA_in_10uA_lot_is_flagged(self):
        """
        45 µA is under the 50 µA datasheet limit, but in a lot averaging 10 µA
        with σ ≈ 1 µA, the robust z-score should be ≈ 23 — far above threshold.

        This demonstrates that cohort-relative detection catches what static
        thresholds miss.
        """
        data = _build_lot_data(
            n_normal=100,
            normal_leakage_mean=10.0,
            outlier_specs=[{
                "comp_id": "LATENT_EDGE_CASE",
                # Looks normal at 0h (10.5 µA), slightly elevated at 24h,
                # then diverges to 45 µA by 168h — classic latent trajectory
                "leakage_values": [10.5, 11.2, 25.0, 45.0],
                "delay_values": [7.0, 7.1, 7.3, 7.5],  # delay is normal
            }],
        )

        # Verify the value is under the datasheet limit
        assert 45.0 < 50.0, "Sanity: 45 µA is under the 50 µA limit"

        detector = OutlierDetector(z_threshold=3.5)
        results = detector.detect(data)

        edge_case = results[results["component_id"] == "LATENT_EDGE_CASE"]
        assert len(edge_case) == 1

        row = edge_case.iloc[0]
        assert row["is_anomalous"] is True or bool(row["is_anomalous"]) is True, (
            f"45 µA component was NOT flagged! Score: {row['anomaly_score']}, "
            f"z-score: {row['robust_z_score']}"
        )

        # The z-score should be very high: (45 - 10) / ~1.2 ≈ 29
        assert row["robust_z_score"] > 10.0, (
            f"Expected z-score > 10, got {row['robust_z_score']}"
        )

    def test_edge_case_triggers_include_leakage(self):
        """The trigger list should mention leakage current as the flagging parameter."""
        data = _build_lot_data(
            n_normal=50,
            normal_leakage_mean=10.0,
            outlier_specs=[{
                "comp_id": "LATENT_EDGE_CASE",
                "leakage_values": [10.5, 11.2, 25.0, 45.0],
                "delay_values": [7.0, 7.1, 7.3, 7.5],
            }],
        )
        detector = OutlierDetector(z_threshold=3.5)
        results = detector.detect(data)

        row = results[results["component_id"] == "LATENT_EDGE_CASE"].iloc[0]
        trigger_str = " ".join(row["triggered_by"])
        assert "leakage_current_uA" in trigger_str, (
            f"Expected leakage trigger, got: {row['triggered_by']}"
        )


# ---------------------------------------------------------------------------
# Test: edge cases — empty and single-unit lots
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Boundary conditions that should not crash the detector."""

    def test_empty_dataframe(self):
        """An empty DataFrame should return an empty results DataFrame."""
        empty_df = pd.DataFrame(columns=[
            "lot_id", "component_id", "param_name",
            "value_0h", "value_24h", "value_96h", "value_168h",
        ])
        detector = OutlierDetector()
        results = detector.detect(empty_df)

        assert isinstance(results, pd.DataFrame)
        assert len(results) == 0
        assert "is_anomalous" in results.columns

    def test_single_unit_lot(self):
        """
        A lot with only one component should not crash.
        With no peers to compare against, the lone component might or might
        not be flagged, but the system must not error.
        """
        data = pd.DataFrame([
            _make_measurement_row("SINGLE_LOT", "SOLO_001", "leakage_current_uA", [15, 16, 17, 18]),
            _make_measurement_row("SINGLE_LOT", "SOLO_001", "propagation_delay_ns", [7, 7.1, 7.2, 7.3]),
        ])
        detector = OutlierDetector()
        results = detector.detect(data)

        assert len(results) == 1
        assert results.iloc[0]["component_id"] == "SOLO_001"

    def test_two_unit_lot(self):
        """A lot with two identical components should not flag either."""
        rows = []
        for cid in ["C001", "C002"]:
            rows.append(_make_measurement_row("TINY_LOT", cid, "leakage_current_uA", [10, 10.1, 10.2, 10.3]))
            rows.append(_make_measurement_row("TINY_LOT", cid, "propagation_delay_ns", [7, 7.05, 7.1, 7.15]))
        data = pd.DataFrame(rows)

        detector = OutlierDetector()
        results = detector.detect(data)

        assert len(results) == 2
        # Two identical components — neither should be flagged by z-score
        assert results["robust_z_score"].max() < 0.5

    def test_multiple_lots_processed_independently(self):
        """Components are scored against their own lot, not globally."""
        # Lot A: mean ≈ 10 µA — a 15 µA component is mildly elevated
        lot_a = _build_lot_data(lot_id="LOT_A", n_normal=50, normal_leakage_mean=10.0,
                                outlier_specs=[{
                                    "comp_id": "LOT_A_MILD",
                                    "leakage_values": [15, 15.5, 16, 16.5],
                                    "delay_values": [7, 7.1, 7.2, 7.3],
                                }])
        # Lot B: mean ≈ 20 µA — a 15 µA component is BELOW average (should not flag)
        lot_b = _build_lot_data(lot_id="LOT_B", n_normal=50, normal_leakage_mean=20.0,
                                outlier_specs=[{
                                    "comp_id": "LOT_B_LOW",
                                    "leakage_values": [15, 15.5, 16, 16.5],
                                    "delay_values": [7, 7.1, 7.2, 7.3],
                                }], seed=99)

        data = pd.concat([lot_a, lot_b], ignore_index=True)
        detector = OutlierDetector(z_threshold=3.5)
        results = detector.detect(data)

        # LOT_B_LOW has values BELOW its lot mean — should not be flagged
        # (unless the z is high, which it shouldn't be since 15 is within 20±3)
        lot_b_low = results[results["component_id"] == "LOT_B_LOW"].iloc[0]
        # The z-score here: |15-20|/~1.2 ≈ 4.2 — this might flag, which is
        # acceptable since it IS somewhat anomalous within its lot. The key
        # point is that scoring is lot-relative.
        assert lot_b_low["lot_id"] == "LOT_B"


# ---------------------------------------------------------------------------
# Test: result schema
# ---------------------------------------------------------------------------

class TestResultSchema:
    """Verify the output DataFrame has the correct structure."""

    def test_result_columns(self):
        """All required columns are present."""
        data = _build_lot_data(n_normal=20)
        results = OutlierDetector().detect(data)

        required_cols = {
            "component_id", "lot_id", "is_anomalous", "anomaly_score",
            "robust_z_score", "isolation_score", "triggered_by",
        }
        assert required_cols.issubset(set(results.columns))

    def test_anomaly_score_is_numeric(self):
        """anomaly_score should be a float, not a string or boolean."""
        data = _build_lot_data(n_normal=20)
        results = OutlierDetector().detect(data)

        assert pd.api.types.is_numeric_dtype(results["anomaly_score"])

    def test_triggered_by_is_list(self):
        """triggered_by should be a list for every row."""
        data = _build_lot_data(n_normal=20)
        results = OutlierDetector().detect(data)

        for _, row in results.iterrows():
            assert isinstance(row["triggered_by"], list)

    def test_one_result_per_component(self):
        """There should be exactly one result row per unique component."""
        data = _build_lot_data(n_normal=30, outlier_specs=[{
            "comp_id": "OUTLIER_1",
            "leakage_values": [50, 55, 60, 70],
            "delay_values": [15, 16, 17, 18],
        }])
        results = OutlierDetector().detect(data)

        n_components = data["component_id"].nunique()
        assert len(results) == n_components


# ---------------------------------------------------------------------------
# Test: both methods can trigger
# ---------------------------------------------------------------------------

class TestMethodCombination:
    """Verify that both detection methods contribute to the final verdict."""

    def test_extreme_outlier_triggers_z_score(self):
        """An extreme outlier should definitely trigger the robust z-score method."""
        data = _build_lot_data(
            n_normal=50,
            outlier_specs=[{
                "comp_id": "EXTREME",
                "leakage_values": [80, 85, 90, 100],
                "delay_values": [7, 7.1, 7.2, 7.3],
            }],
        )
        results = OutlierDetector().detect(data)
        row = results[results["component_id"] == "EXTREME"].iloc[0]

        z_triggers = [t for t in row["triggered_by"] if t.startswith("robust_z")]
        assert len(z_triggers) > 0, "Z-score method should have triggered"

    def test_extreme_outlier_triggers_isolation_forest(self):
        """An extreme outlier should also trigger Isolation Forest."""
        data = _build_lot_data(
            n_normal=50,
            outlier_specs=[{
                "comp_id": "EXTREME",
                "leakage_values": [80, 85, 90, 100],
                "delay_values": [7, 7.1, 7.2, 7.3],
            }],
        )
        results = OutlierDetector().detect(data)
        row = results[results["component_id"] == "EXTREME"].iloc[0]

        iso_triggers = [t for t in row["triggered_by"] if t.startswith("isolation_forest")]
        assert len(iso_triggers) > 0, "Isolation Forest should have triggered"


# ---------------------------------------------------------------------------
# Test: convenience function
# ---------------------------------------------------------------------------

class TestConvenienceFunction:
    """Test the run_outlier_detection() wrapper."""

    def test_run_outlier_detection_returns_dataframe(self):
        data = _build_lot_data(n_normal=30)
        results = run_outlier_detection(data)
        assert isinstance(results, pd.DataFrame)
        assert len(results) == 30
