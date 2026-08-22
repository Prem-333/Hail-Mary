"""
Burn-In Screening Dashboard
==============================
Streamlit dashboard with 4 views for the component reliability screening system.

Run:  streamlit run dashboard/app.py
"""

import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Path setup â€” ensure project root is importable regardless of cwd
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

DATA_DIR = PROJECT_ROOT / "data" / "generated"

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import shap
import streamlit as st

from src.drift_prediction.predictor import FEATURE_NAMES, DriftPredictor
from src.evaluation.evaluate import (
    evaluate_anomaly_detection,
    evaluate_drift_prediction,
)
from src.explainability.explainer import (
    BurnInExplainer,
    DEFAULT_LIMITS,
    PARAM_DISPLAY,
)
from src.outlier_detection.detector import OutlierDetector

# ---------------------------------------------------------------------------
# Streamlit page configuration
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="Burn-In Screening System",
    page_icon="\U0001f52c",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Color palette â€” consistent across all views
# ---------------------------------------------------------------------------

C_NORMAL = "#2ECC71"
C_LATENT = "#F39C12"
C_OBVIOUS = "#E74C3C"
C_ACCEPT = "#2ECC71"
C_REJECT = "#E74C3C"
C_REVIEW = "#F39C12"
C_INFO = "#3498DB"
C_BG_CARD = "#F8F9FA"

DEFECT_COLORS = {"normal": C_NORMAL, "latent": C_LATENT, "obvious": C_OBVIOUS}
PLOTLY_TEMPLATE = "plotly_white"

# ---------------------------------------------------------------------------
# Custom CSS
# ---------------------------------------------------------------------------

st.markdown("""
<style>
    .block-container { padding-top: 1rem; }
    div[data-testid="stMetric"] {
        background: #F8F9FA; border-radius: 0.75rem; padding: 1rem 1.25rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    div[data-testid="stMetric"] label { font-size: 0.85rem; color: #666; }
    .status-badge { display: inline-block; padding: 0.4rem 1.2rem;
        border-radius: 2rem; font-weight: 700; font-size: 1.1rem; }
    .badge-reject  { background: #E74C3C; color: white; }
    .badge-accept  { background: #2ECC71; color: white; }
    .badge-review  { background: #F39C12; color: white; }
    .demo-note { background: #FFF3CD; border-left: 4px solid #F39C12;
        padding: 0.6rem 1rem; border-radius: 0.4rem; font-size: 0.85rem;
        color: #856404; margin-bottom: 1rem; }
</style>
""", unsafe_allow_html=True)


# ===================================================================
# Data loading & module execution (cached)
# ===================================================================

@st.cache_resource(show_spinner="Loading data and running screening modules...")
def load_system():
    """Load data, run Module A + B, create explainer. Cached on first load."""
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

    # SHAP explainers (cached separately)
    shap_explainers = {
        param: shap.TreeExplainer(predictor.xgb_models_[param])
        for param in predictor.param_names_
    }

    return {
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


# ===================================================================
# Helper functions
# ===================================================================

def lot_envelope(measurements, lot_id, param):
    """Compute median +/- 2*MAD envelope for a lot-parameter pair."""
    ld = measurements[
        (measurements["lot_id"] == lot_id) & (measurements["param_name"] == param)
    ]
    tp = [0, 24, 96, 168]
    cols = ["value_0h", "value_24h", "value_96h", "value_168h"]
    meds, lo, hi = [], [], []
    for col in cols:
        v = ld[col].values
        med = float(np.median(v))
        mad = float(np.median(np.abs(v - med))) * 1.4826
        meds.append(med)
        lo.append(med - 2 * mad)
        hi.append(med + 2 * mad)
    return tp, meds, lo, hi


def recommendation_badge(rec):
    """Return an HTML badge for a recommendation."""
    cls = {"REJECT": "badge-reject", "ACCEPT": "badge-accept",
           "FLAG FOR MANUAL REVIEW": "badge-review"}.get(rec, "badge-review")
    return f'<span class="status-badge {cls}">{rec}</span>'


# ===================================================================
# View 1 â€” Lot Overview
# ===================================================================

def page_lot_overview(S):
    st.header("Lot Overview")
    st.markdown(
        '<div class="demo-note">\u26a0\ufe0f Ground truth labels are shown '
        "for demonstration purposes only. In production, ground truth is "
        "unavailable â€” the system operates on anomaly scores alone.</div>",
        unsafe_allow_html=True,
    )

    lots = sorted(S["measurements"]["lot_id"].unique())
    lot_id = st.selectbox("Select lot", lots, key="lot_overview_lot")

    # Merge outlier results + labels for this lot
    lot_outlier = S["outlier_results"][S["outlier_results"]["lot_id"] == lot_id].copy()
    lot_outlier = lot_outlier.merge(
        S["labels"][["component_id", "defect_type"]], on="component_id",
    )
    lot_outlier = lot_outlier.sort_values("anomaly_score", ascending=False).reset_index(drop=True)

    # Summary metrics
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Components", len(lot_outlier))
    c2.metric("Flagged", int(lot_outlier["is_anomalous"].sum()))
    c3.metric("Latent Defects", int((lot_outlier["defect_type"] == "latent").sum()))
    c4.metric("Obvious Defects", int((lot_outlier["defect_type"] == "obvious").sum()))

    # Scatter plot
    fig = go.Figure()
    for dtype in ["normal", "latent", "obvious"]:
        sub = lot_outlier[lot_outlier["defect_type"] == dtype]
        if sub.empty:
            continue
        flagged = sub["is_anomalous"].values
        fig.add_trace(go.Scatter(
            x=sub.index,
            y=sub["anomaly_score"],
            mode="markers",
            name=dtype.title(),
            marker=dict(
                color=DEFECT_COLORS[dtype],
                size=np.where(flagged, 13, 6),
                symbol=np.where(flagged, "diamond", "circle"),
                line=dict(width=0.5, color="white"),
                opacity=np.where(flagged, 1.0, 0.6),
            ),
            customdata=np.column_stack([sub["component_id"], sub["anomaly_score"]]),
            hovertemplate=(
                "<b>%{customdata[0]}</b><br>"
                "Score: %{customdata[1]:.1f}<br>"
                f"Type: {dtype}<extra></extra>"
            ),
        ))

    # Threshold line
    fig.add_hline(
        y=3.5, line_dash="dash", line_color="grey",
        annotation_text="Z-score threshold (3.5)",
        annotation_position="top right",
    )

    fig.update_layout(
        template=PLOTLY_TEMPLATE,
        title=f"Anomaly Scores â€” {lot_id}",
        xaxis_title="Component Index (sorted by score)",
        yaxis_title="Anomaly Score",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        height=450,
        margin=dict(t=80, b=40),
    )
    st.plotly_chart(fig, width='stretch')

    # Detail table
    with st.expander("Show flagged component details"):
        flagged = lot_outlier[lot_outlier["is_anomalous"] == True][
            ["component_id", "defect_type", "anomaly_score", "robust_z_score", "isolation_score"]
        ].reset_index(drop=True)
        st.dataframe(flagged, width='stretch', hide_index=True)


# ===================================================================
# View 2 â€” Component Deep-Dive
# ===================================================================

def page_component_deep_dive(S):
    st.header("Component Deep-Dive")

    measurements = S["measurements"]
    labels = S["labels"]
    outlier_results = S["outlier_results"]

    # Component selector with lot filter
    col_lot, col_comp = st.columns([1, 2])
    lots = sorted(measurements["lot_id"].unique())
    with col_lot:
        lot_id = st.selectbox("Lot", lots, key="dive_lot")

    lot_components = sorted(
        measurements[measurements["lot_id"] == lot_id]["component_id"].unique()
    )
    # Put flagged components first for convenience
    lot_flagged = outlier_results[
        (outlier_results["lot_id"] == lot_id) & (outlier_results["is_anomalous"] == True)
    ]["component_id"].tolist()
    ordered = lot_flagged + [c for c in lot_components if c not in lot_flagged]

    with col_comp:
        comp_id = st.selectbox(
            "Component (flagged components listed first)", ordered, key="dive_comp",
        )

    # Get component info
    label_row = labels[labels["component_id"] == comp_id]
    defect_type = label_row.iloc[0]["defect_type"] if not label_row.empty else "unknown"
    report = S["explainer"].generate_qa_report(comp_id)

    # Header badges
    rec = report.get("recommendation", "N/A")
    confidence = report.get("confidence", "N/A")
    st.markdown(
        f"**Recommendation:** {recommendation_badge(rec)} &emsp; "
        f"**Confidence:** {confidence} &emsp; "
        f"**Ground truth:** `{defect_type}`",
        unsafe_allow_html=True,
    )
    st.markdown("---")

    # ---- Trajectory charts ----
    st.subheader("Parametric Trajectory")
    tcol1, tcol2 = st.columns(2)

    for idx, (param, display) in enumerate(PARAM_DISPLAY.items()):
        col_target = tcol1 if idx == 0 else tcol2
        tp, meds, lo, hi = lot_envelope(measurements, lot_id, param)
        comp_data = measurements[
            (measurements["component_id"] == comp_id)
            & (measurements["param_name"] == param)
        ]
        if comp_data.empty:
            continue
        comp_vals = [
            float(comp_data.iloc[0][c])
            for c in ["value_0h", "value_24h", "value_96h", "value_168h"]
        ]
        limit = DEFAULT_LIMITS.get(param, {}).get("max", None)

        fig = go.Figure()

        # Lot envelope
        fig.add_trace(go.Scatter(
            x=tp, y=hi, mode="lines", line=dict(width=0),
            showlegend=False, hoverinfo="skip",
        ))
        fig.add_trace(go.Scatter(
            x=tp, y=lo, mode="lines",
            fill="tonexty", fillcolor="rgba(52,152,219,0.12)",
            line=dict(width=0), name="Lot normal range (Â±2Ïƒ)",
        ))
        # Lot median
        fig.add_trace(go.Scatter(
            x=tp, y=meds, mode="lines",
            line=dict(color=C_INFO, width=1, dash="dot"), name="Lot median",
        ))
        # Component trajectory
        color = DEFECT_COLORS.get(defect_type, C_INFO)
        fig.add_trace(go.Scatter(
            x=tp, y=comp_vals, mode="lines+markers",
            line=dict(color=color, width=3),
            marker=dict(size=9, color=color, line=dict(width=1, color="white")),
            name=comp_id,
        ))
        # Datasheet limit
        if limit:
            fig.add_hline(
                y=limit, line_dash="dash", line_color=C_OBVIOUS, line_width=1.5,
                annotation_text=f"Limit ({limit} {display['unit']})",
                annotation_position="top right",
                annotation_font_color=C_OBVIOUS,
            )

        fig.update_layout(
            template=PLOTLY_TEMPLATE,
            title=f"{display['name']} ({display['unit']})",
            xaxis_title="Burn-In Duration (hours)",
            yaxis_title=f"{display['name']} ({display['unit']})",
            height=350, margin=dict(t=50, b=40, l=50, r=20),
            legend=dict(font_size=10, orientation="h", y=-0.25),
        )
        col_target.plotly_chart(fig, width='stretch')

    st.markdown("---")

    # ---- Module A: Anomaly Detection ----
    acol, bcol = st.columns(2)

    with acol:
        st.subheader("Anomaly Detection (Module A)")
        anomaly = report.get("anomaly", {})
        if anomaly.get("is_anomalous"):
            st.error(f"**ANOMALOUS** â€” Score: {anomaly['anomaly_score']:.1f}")
        else:
            st.success(f"**Normal** â€” Score: {anomaly['anomaly_score']:.1f}")

        st.markdown("**Justification:**")
        st.info(anomaly.get("justification", "N/A"))

        triggers = anomaly.get("triggered_by", [])
        if triggers:
            st.markdown("**Detection triggers:**")
            for t in triggers:
                st.code(t, language=None)

    # ---- Module B: Drift Prediction + SHAP ----
    with bcol:
        st.subheader("Drift Prediction (Module B)")
        drift = report.get("drift", {})

        # Predictions table
        rows = []
        for param, display in PARAM_DISPLAY.items():
            pinfo = drift.get("per_parameter", {}).get(param, {})
            if not pinfo:
                continue
            rows.append({
                "Parameter": f"{display['name']} ({display['unit']})",
                "Predicted": f"{pinfo['predicted_168h_xgb']:.1f}",
                "Actual": f"{pinfo['actual_168h']:.1f}" if pinfo.get("actual_168h") else "N/A",
                "Residual": f"{pinfo['residual']:+.1f}" if pinfo.get("residual") else "N/A",
            })
        if rows:
            st.dataframe(pd.DataFrame(rows), width='stretch', hide_index=True)

        if drift.get("flagged_for_rejection"):
            st.warning(
                f"**Safety-slope flag triggered**: drift rate "
                f"({drift['max_implied_drift']:.4f}/h) > threshold "
                f"({drift['max_safety_slope']:.4f}/h)"
            )
        else:
            st.success("Safety-slope check: **PASSED**")

    # ---- SHAP breakdown ----
    st.subheader("SHAP Feature Contributions")
    shap_cols = st.columns(len(PARAM_DISPLAY))
    for idx, (param, display) in enumerate(PARAM_DISPLAY.items()):
        pinfo = drift.get("per_parameter", {}).get(param, {})
        shap_data = pinfo.get("shap", {})
        if not shap_data:
            continue
        sv = shap_data.get("shap_values", {})
        fv = shap_data.get("feature_values", {})
        sorted_feats = sorted(sv.keys(), key=lambda f: abs(sv[f]))

        fig = go.Figure(go.Bar(
            x=[sv[f] for f in sorted_feats],
            y=[f for f in sorted_feats],
            orientation="h",
            marker_color=[C_LATENT if sv[f] > 0 else C_INFO for f in sorted_feats],
            text=[f"{sv[f]:+.3f}" for f in sorted_feats],
            textposition="outside",
            hovertemplate="%{y}: value=%{customdata:.4f}, SHAP=%{x:+.4f}<extra></extra>",
            customdata=[fv.get(f, 0) for f in sorted_feats],
        ))
        base = shap_data.get("base_value", 0)
        pred = shap_data.get("prediction", 0)
        fig.update_layout(
            template=PLOTLY_TEMPLATE,
            title=f"{display['name']} â€” base: {base:.1f}, pred: {pred:.1f}",
            xaxis_title=f"SHAP contribution ({display['unit']})",
            height=280, margin=dict(t=50, b=30, l=100, r=60),
        )
        shap_cols[idx].plotly_chart(fig, width='stretch')

    # ---- Recommendation ----
    st.markdown("---")
    st.subheader("Final Recommendation")
    st.markdown(recommendation_badge(rec), unsafe_allow_html=True)
    st.markdown(report.get("recommendation_text", ""))


# ===================================================================
# View 3 â€” Live Early-Rejection Simulator
# ===================================================================

def page_live_simulator(S):
    st.header("Live Early-Rejection Simulator")
    st.caption(
        "Enter hypothetical 0h and 24h measurements. The system predicts "
        "the 168h value and flags for rejection â€” in real time."
    )

    predictor = S["predictor"]
    lots = sorted(S["measurements"]["lot_id"].unique())

    # ---- Inputs ----
    st.markdown("### Input Measurements")
    in_lot, in_leak, in_delay = st.columns([1, 1, 1])

    with in_lot:
        lot_id = st.selectbox("Reference lot (for cohort context)", lots, key="sim_lot")
        lot_stats = predictor.lot_stats_.get(lot_id, {})
        st.caption(
            "Lot-relative features are computed against this lot's median. "
            "Selecting a different lot changes what 'normal' looks like."
        )

    # Defaults from lot median
    leak_stats = lot_stats.get("leakage_current_uA", {})
    delay_stats = lot_stats.get("propagation_delay_ns", {})
    default_leak_0h = round(leak_stats.get("median_0h", 17.0), 1)
    default_delay_0h = round(delay_stats.get("median_0h", 8.0), 1)

    with in_leak:
        st.markdown("**Leakage Current (\u00b5A)**")
        leak_0h = st.number_input(
            "value_0h", value=default_leak_0h, min_value=0.0, max_value=100.0,
            step=0.5, key="sim_leak_0h",
        )
        leak_24h = st.number_input(
            "value_24h", value=round(default_leak_0h * 1.01, 1),
            min_value=0.0, max_value=100.0, step=0.5, key="sim_leak_24h",
        )

    with in_delay:
        st.markdown("**Propagation Delay (ns)**")
        delay_0h = st.number_input(
            "value_0h ", value=default_delay_0h, min_value=0.0, max_value=50.0,
            step=0.2, key="sim_delay_0h",
        )
        delay_24h = st.number_input(
            "value_24h ", value=round(default_delay_0h * 1.005, 1),
            min_value=0.0, max_value=50.0, step=0.2, key="sim_delay_24h",
        )

    st.markdown("---")

    # ---- Run prediction ----
    sim_data = pd.DataFrame([
        {"lot_id": lot_id, "component_id": "SIM_INPUT",
         "param_name": "leakage_current_uA",
         "value_0h": leak_0h, "value_24h": leak_24h,
         "value_96h": 0.0, "value_168h": 0.0},
        {"lot_id": lot_id, "component_id": "SIM_INPUT",
         "param_name": "propagation_delay_ns",
         "value_0h": delay_0h, "value_24h": delay_24h,
         "value_96h": 0.0, "value_168h": 0.0},
    ])

    preds = predictor.predict(sim_data)
    flags = predictor.flag_for_rejection(sim_data)
    safety_slopes = predictor._compute_safety_slopes()

    is_flagged = bool(flags.iloc[0]["flagged_for_rejection"]) if not flags.empty else False

    # ---- Output ----
    st.markdown("### Prediction Results")

    res_cols = st.columns(len(PARAM_DISPLAY) + 1)
    for idx, (param, display) in enumerate(PARAM_DISPLAY.items()):
        pred_row = preds[preds["param_name"] == param]
        if pred_row.empty:
            continue
        pred_val = float(pred_row.iloc[0]["predicted_168h_xgb"])
        limit = DEFAULT_LIMITS.get(param, {}).get("max", 999)
        within = pred_val < limit

        with res_cols[idx]:
            st.metric(
                f"Predicted 168h {display['name']}",
                f"{pred_val:.2f} {display['unit']}",
                delta=f"{'within' if within else 'EXCEEDS'} {limit} limit",
                delta_color="normal" if within else "inverse",
            )

    with res_cols[-1]:
        if is_flagged:
            st.metric("Safety-Slope Status", "REJECT", delta="Exceeds threshold",
                      delta_color="inverse")
        else:
            st.metric("Safety-Slope Status", "PASS", delta="Within threshold",
                      delta_color="normal")

    # ---- Gauge: implied drift vs safety slope ----
    st.markdown("### Drift Rate Analysis")
    gauge_cols = st.columns(len(PARAM_DISPLAY))

    for idx, (param, display) in enumerate(PARAM_DISPLAY.items()):
        pred_row = preds[preds["param_name"] == param]
        if pred_row.empty:
            continue
        pred_val = float(pred_row.iloc[0]["predicted_168h_xgb"])
        v0 = float(pred_row.iloc[0]["value_0h"])
        implied_drift = (pred_val - v0) / 168.0
        threshold = safety_slopes.get(lot_id, {}).get(param, 0.1)
        gauge_max = max(threshold * 2.5, implied_drift * 1.3, 0.01)

        fig = go.Figure(go.Indicator(
            mode="gauge+number+delta",
            value=round(implied_drift, 5),
            delta={"reference": threshold, "position": "bottom",
                   "increasing": {"color": C_REJECT},
                   "decreasing": {"color": C_ACCEPT}},
            number={"suffix": f" {display['unit_ascii']}/h", "font": {"size": 24}},
            title={"text": display["name"], "font": {"size": 14}},
            gauge={
                "axis": {"range": [0, gauge_max], "tickformat": ".4f"},
                "bar": {"color": C_REJECT if implied_drift > threshold else C_ACCEPT},
                "threshold": {
                    "line": {"color": C_REJECT, "width": 3},
                    "thickness": 0.8, "value": threshold,
                },
                "steps": [
                    {"range": [0, threshold], "color": "#E8F8F5"},
                    {"range": [threshold, gauge_max], "color": "#FDEDEC"},
                ],
            },
        ))
        fig.update_layout(height=250, margin=dict(t=50, b=20, l=30, r=30))
        gauge_cols[idx].plotly_chart(fig, width='stretch')

    # ---- SHAP explanation ----
    st.markdown("### SHAP Feature Breakdown")
    st.caption(
        "Each bar shows how much a feature pushed the prediction away from "
        "the lot-average baseline. Positive = higher predicted drift."
    )
    shap_cols = st.columns(len(PARAM_DISPLAY))

    for idx, (param, display) in enumerate(PARAM_DISPLAY.items()):
        param_data = sim_data[sim_data["param_name"] == param]
        X = predictor._engineer_features(param_data, param)
        explainer_shap = S["shap_explainers"][param]
        sv = explainer_shap.shap_values(X.values)
        base_val = explainer_shap.expected_value
        if not np.isscalar(base_val):
            base_val = float(np.asarray(base_val).flat[0])
        sv_row = sv[0] if sv.ndim > 1 else sv

        fig = go.Figure(go.Bar(
            x=[float(sv_row[i]) for i in range(len(FEATURE_NAMES))],
            y=FEATURE_NAMES,
            orientation="h",
            marker_color=[
                C_LATENT if float(sv_row[i]) > 0 else C_INFO
                for i in range(len(FEATURE_NAMES))
            ],
            text=[f"{float(sv_row[i]):+.3f}" for i in range(len(FEATURE_NAMES))],
            textposition="outside",
        ))
        pred_val = base_val + float(sv_row.sum())
        fig.update_layout(
            template=PLOTLY_TEMPLATE,
            title=f"{display['name']} â€” base: {base_val:.2f}, pred: {pred_val:.2f}",
            xaxis_title=f"SHAP ({display['unit']})",
            height=260, margin=dict(t=50, b=30, l=100, r=60),
        )
        shap_cols[idx].plotly_chart(fig, width='stretch')


# ===================================================================
# View 4 â€” Evaluation Summary
# ===================================================================

def page_evaluation_summary(S):
    st.header("Evaluation Summary")

    am = S["anomaly_metrics"]
    dm = S["drift_metrics"]

    # ---- Top-level metric cards ----
    st.subheader("Anomaly Detection (Module A)")
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("F2-Score", f"{am['f2_score']:.4f}")
    c2.metric("Recall", f"{am['recall']:.2%}")
    c3.metric("Precision", f"{am['precision']:.2%}")
    c4.metric("False Negatives", am["false_negatives"])
    c5.metric("True Positives", f"{am['true_positives']} / {am['total_defects']}")

    if am["false_negatives"] == 0:
        st.success("**Zero false negatives** â€” no defective component escaped detection.")
    else:
        st.warning(
            f"**{am['false_negatives']} false negatives** â€” these defective "
            f"components were not flagged. F2-score penalises this heavily "
            f"because the brief states 'a False Negative is catastrophic.'"
        )

    st.markdown("---")

    # ---- Drift Prediction ----
    st.subheader("Drift Prediction Accuracy (Module B)")

    for param, display in PARAM_DISPLAY.items():
        m = dm.get(param, {})
        if not m:
            continue
        st.markdown(f"**{display['name']}**")
        mc1, mc2, mc3, mc4 = st.columns(4)
        mc1.metric("XGBoost MAE", f"{m['xgb_mae']:.4f} {display['unit']}")
        mc2.metric("Linear MAE", f"{m['linear_mae']:.4f} {display['unit']}")
        mc3.metric("XGBoost RMSE", f"{m.get('xgb_rmse', 0):.4f} {display['unit']}")
        mc4.metric("Linear RMSE", f"{m.get('linear_rmse', 0):.4f} {display['unit']}")

        # Per-class breakdown
        class_rows = []
        for dtype in ["normal", "latent", "obvious"]:
            xgb_key = f"xgb_mae_{dtype}"
            lr_key = f"linear_mae_{dtype}"
            if xgb_key in m:
                class_rows.append({
                    "Class": dtype.title(),
                    f"XGBoost MAE ({display['unit']})": m[xgb_key],
                    f"Linear MAE ({display['unit']})": m.get(lr_key, "N/A"),
                })
        if class_rows:
            st.dataframe(pd.DataFrame(class_rows), width='stretch', hide_index=True)

    st.markdown("---")

    # ---- Safety-slope flagging ----
    st.subheader("Safety-Slope Early Rejection")
    flags_merged = S["flags"].merge(
        S["labels"][["component_id", "defect_type"]], on="component_id",
    )
    flag_rows = []
    for dtype in ["normal", "latent", "obvious"]:
        sub = flags_merged[flags_merged["defect_type"] == dtype]
        if sub.empty:
            continue
        n_flagged = int(sub["flagged_for_rejection"].sum())
        flag_rows.append({
            "Class": dtype.title(),
            "Total": len(sub),
            "Flagged": n_flagged,
            "Flag Rate": f"{n_flagged / len(sub):.1%}",
        })
    st.dataframe(pd.DataFrame(flag_rows), width='stretch', hide_index=True)

    st.markdown("---")

    # ---- Explainability rubric ----
    st.subheader("Explainability Quality (Rubric)")

    rubric_items = [
        ("Trajectory data", "Raw measurements at all 4 timepoints"),
        ("SHAP contributions", "Numeric feature-level contributions cited"),
        ("Measured values", "References actual physical readings"),
        ("Recommendation", "Clear ACCEPT / REJECT / FLAG verdict"),
        ("Anomaly justification", "Plain-language explanation of anomaly flag"),
        ("Drift residual", "Predicted vs actual comparison"),
        ("Safety-slope status", "Flag threshold comparison reported"),
        ("Lot context", "References lot median or deviation"),
    ]

    st.markdown("**8-point structural completeness rubric:**")
    rubric_df = pd.DataFrame(rubric_items, columns=["Criterion", "Description"])
    rubric_df.index = range(1, len(rubric_df) + 1)
    rubric_df.index.name = "#"
    st.dataframe(rubric_df, width='stretch')

    st.info(
        "This is a **proxy metric**. True explainability quality requires "
        "human evaluation. The rubric checks structural completeness: does "
        "the report contain traceable, measurement-backed reasoning?"
    )


# ===================================================================
# Sidebar navigation & main routing
# ===================================================================

def main():
    # Sidebar
    st.sidebar.markdown("## \U0001f52c Burn-In Screening")
    st.sidebar.caption(
        "AI-powered latent defect detection in semiconductor burn-in testing"
    )
    st.sidebar.markdown("---")

    page = st.sidebar.radio(
        "Navigate",
        [
            "\U0001f4ca Lot Overview",
            "\U0001f50d Component Deep-Dive",
            "\u26a1 Live Simulator",
            "\U0001f4cb Evaluation Summary",
        ],
        label_visibility="collapsed",
    )

    # Load data (cached â€” only runs once)
    S = load_system()

    st.sidebar.markdown("---")
    st.sidebar.markdown("**Dataset**")
    n_comp = S["measurements"]["component_id"].nunique()
    n_lots = S["measurements"]["lot_id"].nunique()
    n_defects = int((S["labels"]["defect_type"] != "normal").sum())
    st.sidebar.caption(
        f"{n_comp:,} components across {n_lots} lots\n\n"
        f"{n_defects} defects ({n_defects / n_comp:.1%} defect rate)"
    )

    # Title bar
    st.markdown(
        "# \U0001f52c Burn-In Screening System\n"
        "*AI-powered latent defect detection in semiconductor burn-in testing*"
    )
    st.markdown("---")

    # Route to selected page
    if "Lot Overview" in page:
        page_lot_overview(S)
    elif "Component Deep-Dive" in page:
        page_component_deep_dive(S)
    elif "Live Simulator" in page:
        page_live_simulator(S)
    elif "Evaluation Summary" in page:
        page_evaluation_summary(S)


if __name__ == "__main__":
    main()

