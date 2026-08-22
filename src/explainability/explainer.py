#!/usr/bin/env python3
"""
Explainability Layer for Burn-In Screening
=============================================

Combines SHAP-based model explanations (Module B) with rule-based
justifications (Module A) to produce human-readable QA reports that can
be handed directly to a quality engineer with zero ML background.

Why this approach avoids being "a complete black box":
------------------------------------------------------
SHAP (SHapley Additive exPlanations) values decompose each prediction into
**additive** contributions from individual features.  Unlike opaque
embeddings from deep networks, every SHAP value maps directly to a
**physical measurement** that a QA engineer can verify on the bench:

    "value_0h contributed +3.2 uA to the prediction"
    → The component's initial leakage reading pushed the predicted 168h
      value up by 3.2 uA relative to the lot average.

    "lot_dev_24h contributed -0.5 uA"
    → The component was slightly below its lot's median at 24h, pulling
      the prediction down.

The additivity property guarantees:
    prediction = base_value + SUM(shap_values)

So a QA engineer can:
1. See the base prediction (what the model expects for a "typical" component)
2. See exactly how each measurement adjusted the prediction
3. Challenge any individual contribution against the physical data
4. Understand exactly WHY the system recommended accept/reject

This is fundamentally different from a neural-network-based approach where
predictions emerge from thousands of inscrutable weights.  Here, every
number traces back to a reading on the bench instrument.

Usage:
    from src.explainability.explainer import BurnInExplainer
    explainer = BurnInExplainer(measurements_df, drift_predictor, outlier_results)
    report_md = explainer.render_qa_report_markdown("LOT_003_C0142")
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd
import shap

from src.drift_prediction.predictor import FEATURE_NAMES, DriftPredictor

# ---------------------------------------------------------------------------
# Display configuration
# ---------------------------------------------------------------------------

PARAM_DISPLAY = {
    "leakage_current_uA": {"name": "Leakage Current", "unit": "\u00b5A", "unit_ascii": "uA"},
    "propagation_delay_ns": {"name": "Propagation Delay", "unit": "ns", "unit_ascii": "ns"},
}

TIMEPOINT_COLS = ["value_0h", "value_24h", "value_96h", "value_168h"]
TIMEPOINT_LABELS = {"value_0h": "0h", "value_24h": "24h", "value_96h": "96h", "value_168h": "168h"}

DEFAULT_LIMITS = {
    "leakage_current_uA": {"max": 50.0},
    "propagation_delay_ns": {"max": 18.0},
}

# Robust scale factor: MAD -> sigma equivalent
MAD_SCALE = 1.4826


# ===================================================================
# Core explainer
# ===================================================================

class BurnInExplainer:
    """
    Explainability engine combining SHAP (Module B) and rule-based
    justifications (Module A) into structured QA reports.

    Parameters
    ----------
    measurements_df : pd.DataFrame
        Full measurement data (all timepoints).
    drift_predictor : DriftPredictor
        Fitted drift predictor (Module B) — used for SHAP explanations.
    outlier_results_df : pd.DataFrame
        Outlier detection results from Module A (component_id, lot_id,
        is_anomalous, anomaly_score, triggered_by, ...).
    labels_df : pd.DataFrame, optional
        Ground-truth labels for enriching reports.
    datasheet_limits : dict, optional
        Static datasheet limits per parameter.
    """

    def __init__(
        self,
        measurements_df: pd.DataFrame,
        drift_predictor: DriftPredictor,
        outlier_results_df: pd.DataFrame,
        labels_df: pd.DataFrame | None = None,
        datasheet_limits: dict | None = None,
    ):
        self.measurements_df = measurements_df
        self.predictor = drift_predictor
        self.outlier_results = outlier_results_df
        self.labels_df = labels_df
        self.limits = datasheet_limits or DEFAULT_LIMITS

        # Pre-compute Module B predictions and flags
        self.predictions_df = drift_predictor.predict(measurements_df)
        self.flags_df = drift_predictor.flag_for_rejection(measurements_df)

        # Initialize SHAP TreeExplainers (one per parameter)
        self._shap_explainers: dict[str, shap.TreeExplainer] = {}
        for param in drift_predictor.param_names_:
            self._shap_explainers[param] = shap.TreeExplainer(
                drift_predictor.xgb_models_[param]
            )
        self._shap_cache: dict[tuple[str, str], dict] = {}

        # Pre-compute lot statistics for all timepoints
        self._lot_stats = self._compute_lot_stats()

    # ---------------------------------------------------------------
    # Internal helpers
    # ---------------------------------------------------------------

    def _compute_lot_stats(self) -> dict:
        """Compute lot median, MAD, and sigma-estimate per param per timepoint."""
        stats: dict = {}
        for lot_id, lot_data in self.measurements_df.groupby("lot_id"):
            stats[lot_id] = {}
            for param, pdata in lot_data.groupby("param_name"):
                stats[lot_id][param] = {}
                for col in TIMEPOINT_COLS:
                    values = pdata[col].values
                    median = float(np.median(values))
                    mad = float(np.median(np.abs(values - median)))
                    stats[lot_id][param][col] = {
                        "median": median,
                        "mad": mad,
                        "sigma_est": mad * MAD_SCALE,
                    }
        return stats

    def _get_component_measurements(self, component_id: str) -> pd.DataFrame:
        """Get all measurement rows for a component."""
        return self.measurements_df[
            self.measurements_df["component_id"] == component_id
        ].copy()

    def _get_outlier_result(self, component_id: str) -> dict | None:
        """Get Module A result for a component."""
        row = self.outlier_results[
            self.outlier_results["component_id"] == component_id
        ]
        if row.empty:
            return None
        return row.iloc[0].to_dict()

    def _get_label(self, component_id: str) -> str | None:
        """Get ground-truth defect type if labels are available."""
        if self.labels_df is None:
            return None
        row = self.labels_df[self.labels_df["component_id"] == component_id]
        if row.empty:
            return None
        return row.iloc[0]["defect_type"]

    # ---------------------------------------------------------------
    # SHAP explanations (Module B)
    # ---------------------------------------------------------------

    def get_shap_explanation(self, component_id: str, param_name: str) -> dict:
        """
        Compute SHAP feature contributions for a component's drift prediction.

        Returns a dict with:
        - feature_values: {feature_name: raw_value, ...}
        - shap_values: {feature_name: shap_contribution, ...}
        - base_value: model's average prediction (lot-agnostic baseline)
        - prediction: base_value + sum(shap_values)

        Each SHAP value represents how much that feature pushed the
        prediction away from the base value.  Positive values push the
        prediction higher; negative values pull it lower.
        """
        cache_key = (component_id, param_name)
        if cache_key in self._shap_cache:
            return self._shap_cache[cache_key]

        # Get component measurement and engineer features
        comp_data = self.measurements_df[
            (self.measurements_df["component_id"] == component_id)
            & (self.measurements_df["param_name"] == param_name)
        ]
        if comp_data.empty:
            return {}

        X = self.predictor._engineer_features(comp_data, param_name)

        # Compute SHAP values
        explainer = self._shap_explainers[param_name]
        sv = explainer.shap_values(X.values)
        base = explainer.expected_value
        base_val = float(base) if np.isscalar(base) else float(np.asarray(base).flat[0])

        if sv.ndim == 1:
            sv_row = sv
        else:
            sv_row = sv[0]

        result = {
            "feature_values": {fn: round(float(X[fn].values[0]), 4) for fn in FEATURE_NAMES},
            "shap_values": {fn: round(float(sv_row[i]), 4) for i, fn in enumerate(FEATURE_NAMES)},
            "base_value": round(base_val, 4),
            "prediction": round(base_val + float(sv_row.sum()), 4),
        }

        self._shap_cache[cache_key] = result
        return result

    # ---------------------------------------------------------------
    # Module A explanation (plain language)
    # ---------------------------------------------------------------

    def explain_outlier(self, component_id: str) -> str:
        """
        Generate a plain-language justification for a Module A outlier flag.

        Written so a QA engineer with zero ML background can understand
        exactly why this component was flagged and decide whether to
        investigate further.

        Example output:
            "Component LOT_003_C0142 flagged: leakage current at 168h
            (42.1 uA) is 18.4 standard deviations above the lot median
            (17.2 uA), despite being within the 50.0 uA datasheet limit.
            Isolation Forest corroborates this as an outlier based on joint
            leakage/propagation-delay pattern."
        """
        outlier = self._get_outlier_result(component_id)
        if outlier is None:
            return f"Component {component_id}: no outlier detection data available."

        if not outlier["is_anomalous"]:
            return (
                f"Component {component_id}: NOT flagged as anomalous. "
                f"Anomaly score {outlier['anomaly_score']:.1f} is below threshold. "
                f"No further investigation recommended."
            )

        # Parse triggers
        triggers = outlier.get("triggered_by", [])
        comp_data = self._get_component_measurements(component_id)
        lot_id = outlier["lot_id"]

        sentences = [f"Component {component_id} flagged as ANOMALOUS (score: {outlier['anomaly_score']:.1f})."]

        z_triggers = []
        iso_triggered = False

        for trig in triggers:
            parsed = self._parse_trigger(trig)
            if parsed["method"] == "robust_z":
                z_triggers.append(parsed)
            elif parsed["method"] == "isolation_forest":
                iso_triggered = True

        # Build z-score explanation sentences
        for zt in z_triggers:
            param = zt.get("param", "unknown")
            timepoint = zt.get("timepoint", "unknown")
            z_val = zt.get("z_value", 0)

            display = PARAM_DISPLAY.get(param, {"name": param, "unit": ""})
            tp_label = TIMEPOINT_LABELS.get(timepoint, timepoint)

            # Get actual value and lot median
            actual_val = self._get_value(comp_data, param, timepoint)
            lot_stat = self._lot_stats.get(lot_id, {}).get(param, {}).get(timepoint, {})
            lot_median = lot_stat.get("median", 0)
            limit = self.limits.get(param, {}).get("max", float("inf"))

            if actual_val is not None:
                limit_note = ""
                if actual_val < limit:
                    limit_note = f", despite being within the {limit:.1f} {display['unit']} datasheet limit"

                sentences.append(
                    f"{display['name']} at {tp_label} ({actual_val:.1f} {display['unit']}) "
                    f"is {z_val:.1f} standard deviations above the lot median "
                    f"({lot_median:.1f} {display['unit']}){limit_note}."
                )

        # Isolation Forest corroboration
        if iso_triggered:
            sentences.append(
                "Isolation Forest corroborates this as an outlier based on "
                "joint leakage/propagation-delay pattern."
            )

        return " ".join(sentences)

    def _parse_trigger(self, trigger_str: str) -> dict:
        """Parse a Module A trigger string into structured data."""
        if trigger_str.startswith("robust_z"):
            match = re.match(r"robust_z\((.+?)@(.+?)\): z=(.+)", trigger_str)
            if match:
                return {
                    "method": "robust_z",
                    "param": match.group(1),
                    "timepoint": match.group(2),
                    "z_value": float(match.group(3)),
                }
        elif trigger_str.startswith("isolation_forest"):
            match = re.match(r"isolation_forest\(score=(.+?)\)", trigger_str)
            if match:
                return {"method": "isolation_forest", "score": float(match.group(1))}
        return {"method": "unknown", "raw": trigger_str}

    def _get_value(self, comp_data: pd.DataFrame, param: str, timepoint_col: str) -> float | None:
        """Get a specific value from component measurement data."""
        row = comp_data[comp_data["param_name"] == param]
        if row.empty or timepoint_col not in row.columns:
            return None
        return float(row.iloc[0][timepoint_col])

    # ---------------------------------------------------------------
    # QA Report generation
    # ---------------------------------------------------------------

    def generate_qa_report(self, component_id: str) -> dict:
        """
        Produce a structured QA report combining all screening signals.

        Returns a dict with:
        - summary: component ID, lot, recommendation, confidence
        - trajectory: raw measurements at all timepoints
        - anomaly: Module A results and plain-language justification
        - drift: Module B predictions, SHAP explanations, safety-slope flags
        - recommendation: final plain-English recommendation text

        This dict can be rendered as markdown, JSON, or fed into a dashboard.
        """
        comp_data = self._get_component_measurements(component_id)
        if comp_data.empty:
            return {"error": f"Component {component_id} not found in measurements."}

        lot_id = comp_data.iloc[0]["lot_id"]
        outlier = self._get_outlier_result(component_id)
        label = self._get_label(component_id)

        # --- Trajectory ---
        trajectory = {}
        for param in PARAM_DISPLAY:
            prow = comp_data[comp_data["param_name"] == param]
            if prow.empty:
                continue
            trajectory[param] = {
                TIMEPOINT_LABELS[col]: round(float(prow.iloc[0][col]), 2)
                for col in TIMEPOINT_COLS
            }

        # --- Module A: Anomaly detection ---
        anomaly_section = {
            "is_anomalous": bool(outlier["is_anomalous"]) if outlier else False,
            "anomaly_score": outlier["anomaly_score"] if outlier else 0.0,
            "robust_z_score": outlier["robust_z_score"] if outlier else 0.0,
            "isolation_score": outlier["isolation_score"] if outlier else 0.0,
            "triggered_by": outlier["triggered_by"] if outlier else [],
            "justification": self.explain_outlier(component_id),
        }

        # --- Module B: Drift prediction + SHAP ---
        predictions = self.predictions_df[
            self.predictions_df["component_id"] == component_id
        ]
        flag_row = self.flags_df[self.flags_df["component_id"] == component_id]

        drift_section = {"per_parameter": {}}
        for param in PARAM_DISPLAY:
            pred_row = predictions[predictions["param_name"] == param]
            if pred_row.empty:
                continue
            pred_row = pred_row.iloc[0]

            actual_168h = self._get_value(comp_data, param, "value_168h")
            predicted_xgb = float(pred_row["predicted_168h_xgb"])
            predicted_lr = float(pred_row["predicted_168h_linear"])
            residual = (actual_168h - predicted_xgb) if actual_168h else None

            shap_expl = self.get_shap_explanation(component_id, param)

            drift_section["per_parameter"][param] = {
                "predicted_168h_xgb": round(predicted_xgb, 2),
                "predicted_168h_linear": round(predicted_lr, 2),
                "actual_168h": round(actual_168h, 2) if actual_168h else None,
                "residual": round(residual, 2) if residual else None,
                "shap": shap_expl,
            }

        if not flag_row.empty:
            fr = flag_row.iloc[0]
            drift_section["flagged_for_rejection"] = bool(fr["flagged_for_rejection"])
            drift_section["max_implied_drift"] = float(fr["max_implied_drift"])
            drift_section["max_safety_slope"] = float(fr["max_safety_slope"])
        else:
            drift_section["flagged_for_rejection"] = False

        # --- Recommendation ---
        is_anomalous = anomaly_section["is_anomalous"]
        is_drift_flagged = drift_section.get("flagged_for_rejection", False)

        if is_anomalous and is_drift_flagged:
            recommendation = "REJECT"
            confidence = "High"
        elif is_anomalous or is_drift_flagged:
            recommendation = "FLAG FOR MANUAL REVIEW"
            confidence = "Medium"
        else:
            recommendation = "ACCEPT"
            confidence = "High"

        recommendation_text = self._build_recommendation_text(
            component_id, lot_id, recommendation, trajectory,
            anomaly_section, drift_section,
        )

        return {
            "component_id": component_id,
            "lot_id": lot_id,
            "ground_truth": label,
            "recommendation": recommendation,
            "confidence": confidence,
            "trajectory": trajectory,
            "anomaly": anomaly_section,
            "drift": drift_section,
            "recommendation_text": recommendation_text,
        }

    def _build_recommendation_text(
        self, component_id, lot_id, recommendation, trajectory, anomaly, drift,
    ) -> str:
        """Build a plain-English recommendation paragraph."""
        lines = []

        if recommendation == "REJECT":
            lines.append(
                f"This component exhibits clear signs of abnormal degradation "
                f"and should be REJECTED:"
            )
        elif recommendation == "FLAG FOR MANUAL REVIEW":
            lines.append(
                f"This component shows some concerning signals and should be "
                f"reviewed by a senior QA engineer before disposition:"
            )
        else:
            lines.append(
                f"This component shows normal parametric behavior across all "
                f"burn-in timepoints. No anomalies detected. ACCEPT for shipment."
            )
            return "\n".join(lines)

        # Trajectory divergence
        for param, display in PARAM_DISPLAY.items():
            if param not in trajectory:
                continue
            t = trajectory[param]
            v0, v168 = t.get("0h", 0), t.get("168h", 0)
            if v0 > 0:
                pct_change = (v168 - v0) / v0 * 100
                lot_stat_0h = self._lot_stats.get(lot_id, {}).get(param, {}).get("value_0h", {})
                lot_stat_168h = self._lot_stats.get(lot_id, {}).get(param, {}).get("value_168h", {})
                lot_med_0h = lot_stat_0h.get("median", v0)
                lot_med_168h = lot_stat_168h.get("median", v168)
                lot_pct = (lot_med_168h - lot_med_0h) / lot_med_0h * 100 if lot_med_0h > 0 else 0

                if abs(pct_change) > abs(lot_pct) * 2:
                    lines.append(
                        f"  - Trajectory divergence: {display['name']} changed "
                        f"{pct_change:+.0f}% from 0h to 168h ({v0:.1f} -> {v168:.1f} "
                        f"{display['unit']}), far exceeding the lot's typical "
                        f"drift of {lot_pct:+.0f}%."
                    )

        # Anomaly flag detail
        if anomaly["is_anomalous"]:
            lines.append(
                f"  - Cohort-relative anomaly: Flagged by outlier detection "
                f"(score: {anomaly['anomaly_score']:.1f}), indicating the component "
                f"is statistically unusual relative to its manufacturing lot."
            )

        # Drift prediction residual
        for param, pinfo in drift.get("per_parameter", {}).items():
            display = PARAM_DISPLAY.get(param, {"name": param, "unit": ""})
            if pinfo.get("residual") is not None and abs(pinfo["residual"]) > 2:
                lines.append(
                    f"  - Prediction residual: The drift model predicted "
                    f"{pinfo['predicted_168h_xgb']:.1f} {display['unit']} at 168h "
                    f"but actual was {pinfo['actual_168h']:.1f} {display['unit']} "
                    f"(residual: {pinfo['residual']:+.1f} {display['unit']}), "
                    f"suggesting unexpected degradation."
                )

        # Datasheet limit context
        for param, display in PARAM_DISPLAY.items():
            if param not in trajectory:
                continue
            v168 = trajectory[param].get("168h", 0)
            limit = self.limits.get(param, {}).get("max", float("inf"))
            if v168 < limit and anomaly["is_anomalous"]:
                lines.append(
                    f"  - Note: The 168h {display['name'].lower()} ({v168:.1f} "
                    f"{display['unit']}) remains within the datasheet limit "
                    f"({limit:.1f} {display['unit']}), but the degradation "
                    f"trajectory strongly suggests continued drift toward "
                    f"field failure."
                )

        return "\n".join(lines)

    # ---------------------------------------------------------------
    # Markdown rendering
    # ---------------------------------------------------------------

    def render_qa_report_markdown(self, component_id: str) -> str:
        """
        Render a complete QA report as a formatted markdown string.

        Designed to be dropped directly into a pitch deck, documentation,
        or shown live during judging.
        """
        report = self.generate_qa_report(component_id)
        if "error" in report:
            return f"# Error\n\n{report['error']}"

        rec = report["recommendation"]
        rec_emoji = {"REJECT": "\U0001f534", "FLAG FOR MANUAL REVIEW": "\U0001f7e1", "ACCEPT": "\U0001f7e2"}.get(rec, "")
        confidence = report["confidence"]
        lot_id = report["lot_id"]
        label = report.get("ground_truth")

        lines = []
        lines.append(f"# QA Inspection Report: {component_id}")
        lines.append("")
        lines.append("| Field | Value |")
        lines.append("|-------|-------|")
        lines.append(f"| **Lot** | `{lot_id}` |")
        lines.append(f"| **Component ID** | `{component_id}` |")
        lines.append(f"| **Recommendation** | {rec_emoji} **{rec}** |")
        lines.append(f"| **Confidence** | {confidence} |")
        if label:
            label_display = {"normal": "Normal", "latent": "Latent Defect (confirmed)", "obvious": "Obvious Defect (confirmed)"}.get(label, label)
            lines.append(f"| **Ground Truth** | {label_display} |")
        lines.append("")

        # --- Section 1: Trajectory ---
        lines.append("---")
        lines.append("")
        lines.append("## 1. Parametric Trajectory")
        lines.append("")

        for param, display in PARAM_DISPLAY.items():
            if param not in report["trajectory"]:
                continue
            t = report["trajectory"][param]
            limit = self.limits.get(param, {}).get("max", "N/A")

            lines.append(f"### {display['name']} ({display['unit']})")
            lines.append("")
            lines.append("| 0h | 24h | 96h | 168h | Datasheet Limit |")
            lines.append("|:---:|:---:|:---:|:---:|:---:|")
            lines.append(
                f"| {t.get('0h', 'N/A')} | {t.get('24h', 'N/A')} | "
                f"{t.get('96h', 'N/A')} | {t.get('168h', 'N/A')} | {limit} |"
            )
            lines.append("")

        # --- Section 2: Anomaly Detection ---
        lines.append("---")
        lines.append("")
        lines.append("## 2. Anomaly Detection (Module A)")
        lines.append("")

        anomaly = report["anomaly"]
        if anomaly["is_anomalous"]:
            lines.append(
                f"> [!WARNING]\n"
                f"> **ANOMALOUS** (score: {anomaly['anomaly_score']:.1f}, "
                f"robust z: {anomaly['robust_z_score']:.1f})"
            )
        else:
            lines.append(
                f"> [!NOTE]\n"
                f"> **Normal** (score: {anomaly['anomaly_score']:.1f})"
            )
        lines.append("")
        lines.append("### Justification")
        lines.append("")
        lines.append(anomaly["justification"])
        lines.append("")

        if anomaly["triggered_by"]:
            lines.append("### Detection Triggers")
            lines.append("")
            for trig in anomaly["triggered_by"]:
                lines.append(f"- `{trig}`")
            lines.append("")

        # --- Section 3: Drift Prediction ---
        lines.append("---")
        lines.append("")
        lines.append("## 3. Drift Prediction (Module B)")
        lines.append("")

        # Predictions table
        lines.append("### Predicted vs. Actual (168h)")
        lines.append("")
        lines.append("| Parameter | Predicted (XGBoost) | Predicted (Linear) | Actual | Residual |")
        lines.append("|-----------|:---:|:---:|:---:|:---:|")

        drift = report["drift"]
        for param, display in PARAM_DISPLAY.items():
            pinfo = drift.get("per_parameter", {}).get(param, {})
            if not pinfo:
                continue
            pred_xgb = f"{pinfo['predicted_168h_xgb']:.1f}"
            pred_lr = f"{pinfo['predicted_168h_linear']:.1f}"
            actual = f"{pinfo['actual_168h']:.1f}" if pinfo.get("actual_168h") is not None else "N/A"
            residual = f"{pinfo['residual']:+.1f}" if pinfo.get("residual") is not None else "N/A"
            lines.append(
                f"| {display['name']} ({display['unit']}) | {pred_xgb} | {pred_lr} | {actual} | {residual} |"
            )
        lines.append("")

        # Safety slope flag
        if drift.get("flagged_for_rejection"):
            lines.append(
                f"> [!CAUTION]\n"
                f"> **Safety-slope flag triggered**: implied drift rate "
                f"({drift['max_implied_drift']:.4f}/h) exceeds lot threshold "
                f"({drift['max_safety_slope']:.4f}/h)"
            )
        else:
            lines.append(
                f"> [!NOTE]\n"
                f"> Safety-slope check: PASSED"
            )
        lines.append("")

        # SHAP explanations
        lines.append("### SHAP Feature Contributions")
        lines.append("")
        lines.append(
            "*Each value shows how much that feature pushed the 168h prediction "
            "away from the base (lot-average) prediction. "
            "Positive = higher predicted drift, Negative = lower predicted drift.*"
        )
        lines.append("")

        for param, display in PARAM_DISPLAY.items():
            pinfo = drift.get("per_parameter", {}).get(param, {})
            shap_data = pinfo.get("shap", {})
            if not shap_data:
                continue

            lines.append(f"#### {display['name']}")
            lines.append("")
            lines.append("| Feature | Measured Value | SHAP Contribution | Direction |")
            lines.append("|---------|:---:|:---:|:---:|")

            sv = shap_data.get("shap_values", {})
            fv = shap_data.get("feature_values", {})

            # Sort by absolute SHAP value (most impactful first)
            sorted_features = sorted(sv.keys(), key=lambda f: abs(sv[f]), reverse=True)

            for feat in sorted_features:
                s_val = sv[feat]
                f_val = fv.get(feat, 0)
                direction = "\u2191 Higher" if s_val > 0.01 else ("\u2193 Lower" if s_val < -0.01 else "\u2194 Neutral")
                lines.append(
                    f"| `{feat}` | {f_val:.4f} | {s_val:+.4f} {display['unit']} | {direction} |"
                )

            base = shap_data.get("base_value", 0)
            total_shap = sum(sv.values())
            pred = shap_data.get("prediction", 0)
            lines.append("")
            lines.append(f"**Base prediction**: {base:.2f} {display['unit']} &emsp; "
                         f"**SHAP adjustment**: {total_shap:+.2f} {display['unit']} &emsp; "
                         f"**Final prediction**: {pred:.2f} {display['unit']}")
            lines.append("")

        # Large residual note
        has_large_residual = any(
            abs(p.get("residual", 0) or 0) > 3
            for p in drift.get("per_parameter", {}).values()
        )
        if has_large_residual:
            lines.append(
                "> [!IMPORTANT]\n"
                "> The large prediction residual is itself a strong indicator of a latent "
                "defect. The component's trajectory diverged in ways the model could not "
                "anticipate from early measurements alone -- precisely the signature of "
                "a defect that activates under sustained thermal stress."
            )
            lines.append("")

        # --- Section 4: Recommendation ---
        lines.append("---")
        lines.append("")
        lines.append("## 4. Final Recommendation")
        lines.append("")
        lines.append(f"### {rec_emoji} {rec}")
        lines.append("")
        lines.append(report["recommendation_text"])
        lines.append("")

        return "\n".join(lines)


# ===================================================================
# Convenience function
# ===================================================================

def generate_sample_report(
    measurements_path: str = "data/generated/burnin_measurements.csv",
    labels_path: str = "data/generated/burnin_labels.csv",
    output_path: str = "docs/sample_qa_report.md",
) -> str:
    """
    Generate a sample QA report for the most interesting flagged component.

    Runs both Module A and Module B, finds a flagged latent defect with
    the highest anomaly score, and renders its report as markdown.
    """
    from src.outlier_detection.detector import OutlierDetector

    measurements = pd.read_csv(measurements_path)
    labels = pd.read_csv(labels_path)

    # Run Module A
    print("Running Module A (outlier detection)...")
    detector = OutlierDetector(z_threshold=3.5)
    outlier_results = detector.detect(measurements)

    # Run Module B
    print("Training Module B (drift predictor)...")
    predictor = DriftPredictor(safety_slope_n_sigma=3.0, random_state=42)
    predictor.fit(measurements)

    # Create explainer
    explainer = BurnInExplainer(
        measurements_df=measurements,
        drift_predictor=predictor,
        outlier_results_df=outlier_results,
        labels_df=labels,
    )

    # Find the best example: a flagged latent defect with highest anomaly score
    merged = outlier_results.merge(labels[["component_id", "defect_type"]], on="component_id")
    candidates = merged[
        (merged["defect_type"] == "latent") & (merged["is_anomalous"] == True)
    ].sort_values("anomaly_score", ascending=False)

    if candidates.empty:
        print("No flagged latent defects found -- using highest-scored component.")
        candidates = merged.sort_values("anomaly_score", ascending=False)

    best_id = candidates.iloc[0]["component_id"]
    print(f"Generating report for {best_id} (score: {candidates.iloc[0]['anomaly_score']:.1f})...")

    report_md = explainer.render_qa_report_markdown(best_id)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(report_md)

    print(f"[OK] Sample QA report saved to {output_path}")
    return best_id


if __name__ == "__main__":
    generate_sample_report()
