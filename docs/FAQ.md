# Judge FAQ

Anticipated questions and direct answers.

---

### "Why synthetic data?"

Real semiconductor burn-in datasets are proprietary and covered by foundry
NDAs — they are not available for academic or competition use.  The
synthetic generator models physically defensible degradation curves
(Arrhenius-style exponential drift, two-phase latent activation) so the
methodology can be demonstrated end-to-end.  The system's architecture —
cohort-relative detection, per-lot modelling, SHAP-based explanations — is
data-agnostic and would transfer directly to real STDF data from an ATE
handler.

---

### "How does this generalise beyond leakage current and propagation delay?"

The system is parameter-agnostic by design.  Module A computes robust
z-scores and fits Isolation Forest on whatever numeric columns are present
in the measurement data.  Module B trains a separate XGBoost model per
parameter.  Adding a new parameter (e.g., IDDQ, rise/fall time, output
voltage) requires only adding it to the input CSV — no code changes.  The
SHAP explainer and QA report generator automatically adapt to the new
feature set.

---

### "What happens with a brand new lot with no history?"

Each lot is modelled independently — Module A computes lot-specific
medians and MAD, and Module B trains per-lot models.  A new lot needs only
its own data (200+ components) to establish a statistical baseline.  There
is no dependency on historical lots.  This is intentional: lot-to-lot
process variation means a model trained on one lot's distribution would
produce incorrect baselines for a lot manufactured under different
conditions.

---

### "How is this different from just using tighter static limits?"

Static limits, no matter how tight, are lot-agnostic.  If Lot A has a
median leakage of 10 µA and Lot B has a median of 35 µA (both valid
process windows), a fixed limit of 40 µA would flag half of Lot B as
defective while missing 4× outliers in Lot A.  Cohort-relative detection
solves this: a 45 µA reading is flagged in Lot A (z ≈ 4.1) but not in
Lot B (z ≈ 0.8).  Additionally, the drift prediction model captures
*trajectory* information — not just whether a single measurement is high,
but whether the rate of change implies the component is on a path toward
failure — which no static threshold can assess.

---

### "What's the false negative rate, and is that acceptable?"

11 of 249 defective components (4.4%) were not flagged by Module A.  These
are latent defects whose 168h values remained close enough to the lot's
normal range that neither the robust z-score nor Isolation Forest triggered.
Whether 4.4% is acceptable depends on the application's criticality: for
consumer electronics, this is strong; for automotive safety-critical or
medical devices, additional screening layers (e.g., extended burn-in,
IDDQ testing) would be warranted.  The system reports false-negative count
explicitly and uses F2-score (not F1) precisely because missed defects are
the costlier failure mode.

---

### "How do you know the SHAP explanations are trustworthy?"

SHAP values for tree-based models (TreeExplainer) are exact — they are
computed from the tree structure, not approximated.  The additivity
guarantee (base_value + Σ shap_values = prediction) is mathematically
provable, not empirical.  What SHAP does *not* guarantee is that the
underlying model is correct — if the XGBoost model has learned a spurious
correlation, SHAP will faithfully explain a wrong prediction.  This is why
the system reports both model predictions and actual measurements side by
side, enabling a QA engineer to spot disagreement.
