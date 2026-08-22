#!/usr/bin/env python3
"""
Evaluation Harness
=====================

Reproduces the three metrics from the SIH problem statement:

1. **Anomaly Detection Score** — Precision, Recall, F2-score for Module A.
   F2 (not F1) is used because the brief states "a False Negative is
   catastrophic."  F2 weights recall twice as heavily as precision, encoding
   this priority directly.  False-negative count is reported explicitly.

2. **Drift Prediction Accuracy** — MAE and RMSE for Module B's 168h
   predictions, broken down by defect class (normal vs latent vs obvious).

3. **Explainability Quality** — A rubric-based structural completeness
   score for QA reports.  This is a **proxy metric**: true explainability
   quality requires a human judge, but the presence of structured, traceable
   reasoning is itself evidence of non-black-box behavior.

Usage:
    from src.evaluation.evaluate import evaluate_all
    summary = evaluate_all(measurements_df, labels_df)
    # summary is a dict; also writes results/metrics.md
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    fbeta_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    recall_score,
    confusion_matrix,
)

from src.drift_prediction.predictor import DriftPredictor
from src.explainability.explainer import BurnInExplainer
from src.outlier_detection.detector import OutlierDetector


# ===================================================================
# Metric 1: Anomaly Detection Score
# ===================================================================

def evaluate_anomaly_detection(
    outlier_results: pd.DataFrame,
    labels_df: pd.DataFrame,
) -> dict:
    """
    Compute precision, recall, F2-score, and false-negative count for
    Module A's outlier detection against ground-truth labels.

    Ground truth: any component with defect_type != "normal" is a true
    positive (i.e. both "latent" and "obvious" defects should be caught).

    Why F2 and not F1:
        The problem brief explicitly states that False Negatives are
        catastrophic — shipping a defective component is far worse than
        pulling a good one for re-inspection.  F2 = (1 + 2^2) * P * R /
        (2^2 * P + R) weights recall 4x more than precision, directly
        encoding this asymmetric cost.

    Parameters
    ----------
    outlier_results : pd.DataFrame
        Module A output with columns: component_id, is_anomalous.
    labels_df : pd.DataFrame
        Ground truth with columns: component_id, defect_type.

    Returns
    -------
    dict with keys: precision, recall, f2_score, false_negatives,
    false_positives, true_positives, true_negatives, total_defects,
    total_components.
    """
    merged = outlier_results.merge(
        labels_df[["component_id", "defect_type"]],
        on="component_id",
        how="inner",
    )

    # Ground truth: 1 = defective, 0 = normal
    y_true = (merged["defect_type"] != "normal").astype(int).values
    y_pred = merged["is_anomalous"].astype(int).values

    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f2 = fbeta_score(y_true, y_pred, beta=2, zero_division=0)

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()

    return {
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f2_score": round(float(f2), 4),
        "true_positives": int(tp),
        "false_positives": int(fp),
        "false_negatives": int(fn),
        "true_negatives": int(tn),
        "total_defects": int(y_true.sum()),
        "total_components": len(y_true),
    }


# ===================================================================
# Metric 2: Drift Prediction Accuracy
# ===================================================================

def evaluate_drift_prediction(
    predictions_df: pd.DataFrame,
    measurements_df: pd.DataFrame,
    labels_df: pd.DataFrame,
) -> dict:
    """
    Compute MAE and RMSE for Module B's 168h predictions, broken down
    by component class (normal, latent, obvious).

    The per-class breakdown is important because:
    - Normal MAE should be low (model learns the drift pattern well)
    - Latent MAE should be high (model predicts "normal" but actual
      diverges — this is expected and correct)
    - Obvious MAE may vary (some obvious defects have distinctive
      early features that are predictable)

    Parameters
    ----------
    predictions_df : pd.DataFrame
        Module B output with columns: component_id, param_name,
        predicted_168h_xgb, predicted_168h_linear.
    measurements_df : pd.DataFrame
        Raw measurements with value_168h column.
    labels_df : pd.DataFrame
        Ground truth labels.

    Returns
    -------
    dict keyed by param_name, each containing MAE/RMSE overall and
    per defect class, for both XGBoost and linear models.
    """
    actuals = measurements_df[["component_id", "param_name", "value_168h"]].copy()
    actuals = actuals.rename(columns={"value_168h": "actual_168h"})

    merged = predictions_df.merge(actuals, on=["component_id", "param_name"], how="left")
    merged = merged.merge(
        labels_df[["component_id", "defect_type"]],
        on="component_id",
        how="left",
    )

    metrics: dict = {}

    for param in sorted(merged["param_name"].unique()):
        pdata = merged[merged["param_name"] == param]
        m: dict = {}

        # Overall
        m["xgb_mae"] = round(mean_absolute_error(pdata["actual_168h"], pdata["predicted_168h_xgb"]), 4)
        m["xgb_rmse"] = round(math.sqrt(mean_squared_error(pdata["actual_168h"], pdata["predicted_168h_xgb"])), 4)
        m["linear_mae"] = round(mean_absolute_error(pdata["actual_168h"], pdata["predicted_168h_linear"]), 4)
        m["linear_rmse"] = round(math.sqrt(mean_squared_error(pdata["actual_168h"], pdata["predicted_168h_linear"])), 4)

        # Per class
        for defect_type in ["normal", "latent", "obvious"]:
            subset = pdata[pdata["defect_type"] == defect_type]
            if len(subset) == 0:
                continue
            m[f"xgb_mae_{defect_type}"] = round(
                mean_absolute_error(subset["actual_168h"], subset["predicted_168h_xgb"]), 4
            )
            m[f"xgb_rmse_{defect_type}"] = round(
                math.sqrt(mean_squared_error(subset["actual_168h"], subset["predicted_168h_xgb"])), 4
            )
            m[f"linear_mae_{defect_type}"] = round(
                mean_absolute_error(subset["actual_168h"], subset["predicted_168h_linear"]), 4
            )

        metrics[param] = m

    return metrics


# ===================================================================
# Metric 3: Explainability Quality (Rubric)
# ===================================================================

def evaluate_explainability(
    explainer: BurnInExplainer,
    sample_component_ids: list[str],
) -> dict:
    """
    Score QA reports for structural completeness using a rubric checklist.

    This is a PROXY METRIC.  True explainability quality requires a human
    judge evaluating whether the explanations are (a) accurate, (b) useful,
    and (c) actionable.  However, the presence of structured, traceable
    reasoning — where every number maps to a physical measurement — is
    itself strong evidence that the system is NOT a black box.

    Rubric (8 points total):
    1. [1pt] Report contains trajectory data (raw measurements at all
       timepoints)
    2. [1pt] Report cites specific feature contributions (SHAP values
       with actual numeric values)
    3. [1pt] Report references measured values (not just abstract scores)
    4. [1pt] Report gives a clear accept/reject recommendation
    5. [1pt] Report includes anomaly detection justification text
    6. [1pt] Report includes drift prediction residual analysis
    7. [1pt] Report includes safety-slope flag status
    8. [1pt] Report includes lot-relative context (mentions lot median
       or deviation)

    Parameters
    ----------
    explainer : BurnInExplainer
        Initialized explainer with access to all models and data.
    sample_component_ids : list[str]
        Component IDs to evaluate.

    Returns
    -------
    dict with per-component scores and aggregate statistics.
    """
    results = []

    for comp_id in sample_component_ids:
        report = explainer.generate_qa_report(comp_id)
        md = explainer.render_qa_report_markdown(comp_id)

        checklist = {}

        # 1. Trajectory data present
        checklist["has_trajectory"] = bool(
            report.get("trajectory")
            and any(len(v) >= 4 for v in report["trajectory"].values())
        )

        # 2. SHAP values with numeric contributions
        drift_params = report.get("drift", {}).get("per_parameter", {})
        has_shap = False
        for pinfo in drift_params.values():
            shap_data = pinfo.get("shap", {})
            if shap_data.get("shap_values"):
                has_shap = True
                break
        checklist["cites_shap_contributions"] = has_shap

        # 3. References actual measured values (not just scores)
        checklist["references_measured_values"] = bool(
            report.get("trajectory")
            and any(
                any(isinstance(v, (int, float)) and v > 0 for v in traj.values())
                for traj in report["trajectory"].values()
            )
        )

        # 4. Clear accept/reject recommendation
        checklist["has_recommendation"] = report.get("recommendation") in (
            "ACCEPT", "REJECT", "FLAG FOR MANUAL REVIEW",
        )

        # 5. Anomaly justification text
        justification = report.get("anomaly", {}).get("justification", "")
        checklist["has_anomaly_justification"] = len(justification) > 30

        # 6. Drift prediction residual
        has_residual = any(
            pinfo.get("residual") is not None
            for pinfo in drift_params.values()
        )
        checklist["has_drift_residual"] = has_residual

        # 7. Safety-slope flag status
        checklist["has_safety_slope_status"] = (
            "flagged_for_rejection" in report.get("drift", {})
        )

        # 8. Lot-relative context (mentions lot median or deviation)
        md_lower = md.lower()
        checklist["has_lot_context"] = (
            "lot median" in md_lower
            or "lot_dev" in md_lower
            or "deviation" in md_lower
        )

        score = sum(checklist.values())
        results.append({
            "component_id": comp_id,
            "score": score,
            "max_score": 8,
            "checklist": checklist,
        })

    # Aggregate
    scores = [r["score"] for r in results]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0
    perfect_count = sum(1 for s in scores if s == 8)

    return {
        "per_component": results,
        "average_score": avg_score,
        "max_score": 8,
        "perfect_reports": perfect_count,
        "total_evaluated": len(results),
        "rubric_note": (
            "This is a PROXY metric. True explainability quality requires "
            "human evaluation. The rubric checks structural completeness: "
            "does the report contain traceable, measurement-backed reasoning? "
            "A perfect score of 8/8 means all expected structural elements "
            "are present, but does not guarantee the explanations are "
            "semantically correct or useful to a domain expert."
        ),
    }


# ===================================================================
# Combined evaluation
# ===================================================================

def evaluate_all(
    measurements_df: pd.DataFrame,
    labels_df: pd.DataFrame,
    output_path: str | Path = "results/metrics.md",
    z_threshold: float = 3.5,
    safety_slope_n_sigma: float = 3.0,
    random_state: int = 42,
    n_explainability_samples: int = 10,
) -> dict:
    """
    Run all three evaluation metrics and produce a clean summary report.

    Orchestration:
    1. Run Module A (outlier detection) on measurements
    2. Train Module B (drift predictor) on measurements
    3. Create explainer and evaluate QA reports
    4. Write results/metrics.md for direct inclusion in project report

    Parameters
    ----------
    measurements_df : pd.DataFrame
        Full measurement data.
    labels_df : pd.DataFrame
        Ground-truth labels.
    output_path : str or Path
        Where to write the markdown report.
    z_threshold : float
        Module A z-score threshold.
    safety_slope_n_sigma : float
        Module B safety-slope N-sigma.
    random_state : int
        Random seed.
    n_explainability_samples : int
        Number of components to evaluate for explainability.

    Returns
    -------
    dict with all metrics.
    """
    print("=" * 60)
    print("  BURN-IN SCREENING SYSTEM — EVALUATION HARNESS")
    print("=" * 60)

    # --- Module A ---
    print("\n[1/3] Running anomaly detection (Module A)...")
    detector = OutlierDetector(z_threshold=z_threshold)
    outlier_results = detector.detect(measurements_df)
    anomaly_metrics = evaluate_anomaly_detection(outlier_results, labels_df)

    print(f"      Precision: {anomaly_metrics['precision']:.4f}")
    print(f"      Recall:    {anomaly_metrics['recall']:.4f}")
    print(f"      F2-score:  {anomaly_metrics['f2_score']:.4f}")
    print(f"      False Negatives: {anomaly_metrics['false_negatives']}"
          f" / {anomaly_metrics['total_defects']} defects MISSED")

    # --- Module B ---
    print("\n[2/3] Training drift predictor (Module B)...")
    predictor = DriftPredictor(
        safety_slope_n_sigma=safety_slope_n_sigma,
        random_state=random_state,
    )
    predictor.fit(measurements_df)
    predictions = predictor.predict(measurements_df)
    flags = predictor.flag_for_rejection(measurements_df)
    drift_metrics = evaluate_drift_prediction(predictions, measurements_df, labels_df)

    for param, m in drift_metrics.items():
        print(f"      {param}: XGB MAE={m['xgb_mae']:.4f}, "
              f"Linear MAE={m['linear_mae']:.4f}")

    # --- Module C (Explainability) ---
    print("\n[3/3] Evaluating explainability quality...")
    explainer = BurnInExplainer(
        measurements_df=measurements_df,
        drift_predictor=predictor,
        outlier_results_df=outlier_results,
        labels_df=labels_df,
    )

    # Sample: pick a mix of flagged defects and normal components
    merged_flags = outlier_results.merge(
        labels_df[["component_id", "defect_type"]], on="component_id",
    )
    flagged_defects = merged_flags[
        (merged_flags["is_anomalous"] == True)
        & (merged_flags["defect_type"] != "normal")
    ].sort_values("anomaly_score", ascending=False)

    normal_comps = merged_flags[merged_flags["defect_type"] == "normal"]

    # Take top flagged defects + some normal components
    n_defects = min(n_explainability_samples // 2, len(flagged_defects))
    n_normal = min(n_explainability_samples - n_defects, len(normal_comps))

    sample_ids = (
        flagged_defects.head(n_defects)["component_id"].tolist()
        + normal_comps.sample(n=n_normal, random_state=random_state)["component_id"].tolist()
    )

    explain_metrics = evaluate_explainability(explainer, sample_ids)
    print(f"      Average rubric score: {explain_metrics['average_score']:.1f} / 8")
    print(f"      Perfect reports: {explain_metrics['perfect_reports']}"
          f" / {explain_metrics['total_evaluated']}")

    # --- Safety-slope flagging summary ---
    flag_merged = flags.merge(
        labels_df[["component_id", "defect_type"]], on="component_id",
    )
    safety_slope_metrics = {}
    for dtype in ["normal", "latent", "obvious"]:
        subset = flag_merged[flag_merged["defect_type"] == dtype]
        if len(subset) == 0:
            continue
        flagged_count = int(subset["flagged_for_rejection"].sum())
        safety_slope_metrics[dtype] = {
            "total": len(subset),
            "flagged": flagged_count,
            "rate": round(flagged_count / len(subset), 4),
        }

    # --- Assemble full results ---
    all_metrics = {
        "anomaly_detection": anomaly_metrics,
        "drift_prediction": drift_metrics,
        "safety_slope_flagging": safety_slope_metrics,
        "explainability": {
            "average_score": explain_metrics["average_score"],
            "max_score": explain_metrics["max_score"],
            "perfect_reports": explain_metrics["perfect_reports"],
            "total_evaluated": explain_metrics["total_evaluated"],
            "rubric_note": explain_metrics["rubric_note"],
        },
    }

    # --- Write report ---
    report_md = _render_metrics_report(all_metrics, explain_metrics)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(report_md)

    print(f"\n[OK] Metrics report saved to {output_path}")
    print("=" * 60)

    return all_metrics


# ===================================================================
# Report renderer
# ===================================================================

def _render_metrics_report(metrics: dict, explain_detail: dict) -> str:
    """Render all metrics as a formatted markdown report."""
    lines = []

    lines.append("# Burn-In Screening System — Evaluation Report")
    lines.append("")
    lines.append("*Auto-generated by `src/evaluation/evaluate.py`*")
    lines.append("")

    # ---- Metric 1: Anomaly Detection ----
    lines.append("---")
    lines.append("")
    lines.append("## 1. Anomaly Detection Score (Module A)")
    lines.append("")

    ad = metrics["anomaly_detection"]
    lines.append("> [!IMPORTANT]")
    lines.append(f"> **F2-score: {ad['f2_score']:.4f}** — F2 (not F1) is used because the")
    lines.append("> problem brief states \"a False Negative is catastrophic.\" F2 weights")
    lines.append("> recall 4x more than precision, directly encoding this asymmetric cost.")
    lines.append("")

    lines.append("| Metric | Value |")
    lines.append("|--------|:-----:|")
    lines.append(f"| **Precision** | {ad['precision']:.4f} |")
    lines.append(f"| **Recall** | {ad['recall']:.4f} |")
    lines.append(f"| **F2-Score** | {ad['f2_score']:.4f} |")
    lines.append(f"| True Positives | {ad['true_positives']} |")
    lines.append(f"| False Positives | {ad['false_positives']} |")
    lines.append(f"| **False Negatives** | **{ad['false_negatives']}** |")
    lines.append(f"| True Negatives | {ad['true_negatives']} |")
    lines.append(f"| Total Defects | {ad['total_defects']} |")
    lines.append(f"| Total Components | {ad['total_components']} |")
    lines.append("")

    if ad["false_negatives"] == 0:
        lines.append("> [!TIP]")
        lines.append("> **Zero false negatives** — no defective component escaped detection.")
    else:
        lines.append("> [!WARNING]")
        lines.append(f"> **{ad['false_negatives']} false negatives** — {ad['false_negatives']}")
        lines.append(f"> defective components were NOT flagged and would have shipped.")
    lines.append("")

    # ---- Metric 2: Drift Prediction ----
    lines.append("---")
    lines.append("")
    lines.append("## 2. Drift Prediction Accuracy (Module B)")
    lines.append("")

    dp = metrics["drift_prediction"]
    for param, m in dp.items():
        display = param.replace("_", " ").title()
        lines.append(f"### {display}")
        lines.append("")
        lines.append("| Metric | XGBoost | Linear Regression |")
        lines.append("|--------|:-------:|:-----------------:|")
        lines.append(f"| **MAE (overall)** | **{m['xgb_mae']:.4f}** | {m['linear_mae']:.4f} |")
        lines.append(f"| **RMSE (overall)** | **{m['xgb_rmse']:.4f}** | {m['linear_rmse']:.4f} |")
        lines.append("")

        # Per-class breakdown
        lines.append("**Per-class MAE breakdown:**")
        lines.append("")
        lines.append("| Component Class | XGBoost MAE | Linear MAE | Notes |")
        lines.append("|-----------------|:-----------:|:----------:|-------|")
        for dtype in ["normal", "latent", "obvious"]:
            xgb_key = f"xgb_mae_{dtype}"
            lr_key = f"linear_mae_{dtype}"
            if xgb_key not in m:
                continue
            note = ""
            if dtype == "latent":
                note = "Expected high: latent defects diverge unpredictably"
            elif dtype == "normal":
                note = "Model learns normal drift well"
            lines.append(
                f"| {dtype.title()} | {m[xgb_key]:.4f} | "
                f"{m.get(lr_key, 'N/A'):.4f} | {note} |"
            )
        lines.append("")

    # ---- Safety-slope flagging ----
    lines.append("### Safety-Slope Early Rejection (Module B)")
    lines.append("")
    lines.append("*Flags components for rejection at 24h, before 168h measurement is taken.*")
    lines.append("")
    lines.append("| Component Class | Total | Flagged | Flag Rate |")
    lines.append("|-----------------|:-----:|:-------:|:---------:|")
    for dtype in ["normal", "latent", "obvious"]:
        ss = metrics["safety_slope_flagging"].get(dtype)
        if not ss:
            continue
        lines.append(
            f"| {dtype.title()} | {ss['total']} | {ss['flagged']} | {ss['rate']:.1%} |"
        )
    lines.append("")

    # ---- Metric 3: Explainability ----
    lines.append("---")
    lines.append("")
    lines.append("## 3. Explainability Quality (Rubric)")
    lines.append("")

    ex = metrics["explainability"]
    lines.append(f"**Average rubric score: {ex['average_score']:.1f} / {ex['max_score']}**")
    lines.append(f"({ex['perfect_reports']} / {ex['total_evaluated']} reports scored a perfect 8/8)")
    lines.append("")

    lines.append("> [!NOTE]")
    lines.append(f"> {ex['rubric_note']}")
    lines.append("")

    lines.append("### Rubric Checklist")
    lines.append("")
    lines.append("| # | Criterion | Description |")
    lines.append("|:-:|-----------|-------------|")
    lines.append("| 1 | Trajectory data | Raw measurements at all 4 timepoints |")
    lines.append("| 2 | SHAP contributions | Numeric feature-level contributions cited |")
    lines.append("| 3 | Measured values | References actual physical readings |")
    lines.append("| 4 | Recommendation | Clear ACCEPT / REJECT / FLAG verdict |")
    lines.append("| 5 | Anomaly justification | Plain-language explanation of anomaly flag |")
    lines.append("| 6 | Drift residual | Predicted vs actual comparison |")
    lines.append("| 7 | Safety-slope status | Flag threshold comparison reported |")
    lines.append("| 8 | Lot context | References lot median or deviation |")
    lines.append("")

    # Individual scores
    lines.append("### Per-Component Scores")
    lines.append("")
    lines.append("| Component | Score | Checklist |")
    lines.append("|-----------|:-----:|-----------|")
    for r in explain_detail["per_component"]:
        passed = [k for k, v in r["checklist"].items() if v]
        short = ", ".join(k.replace("has_", "").replace("_", " ") for k in passed)
        lines.append(f"| `{r['component_id']}` | {r['score']}/8 | {short} |")
    lines.append("")

    return "\n".join(lines)


# ===================================================================
# CLI entry point
# ===================================================================

if __name__ == "__main__":
    measurements = pd.read_csv("data/generated/burnin_measurements.csv")
    labels = pd.read_csv("data/generated/burnin_labels.csv")
    evaluate_all(measurements, labels)
