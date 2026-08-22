# explainability — SHAP-based model interpretability + QA report generation
#
# Public API:
#   BurnInExplainer          — core explainer combining SHAP + rule-based justifications
#   generate_sample_report() — one-call sample report generator

from src.explainability.explainer import BurnInExplainer, generate_sample_report

__all__ = ["BurnInExplainer", "generate_sample_report"]
