# Burn-In Screening System — Project Report

## 1. Problem & Motivation

Semiconductor burn-in testing stresses components at elevated temperature
(typically 125°C) for extended durations (168 hours) to precipitate latent
manufacturing defects before field deployment.  During burn-in, parametric
measurements — leakage current (µA) and propagation delay (ns) — are
sampled at intervals (0h, 24h, 96h, 168h) and compared against static
datasheet limits.

The fundamental limitation of static limits is that they are
**lot-agnostic**.  A leakage current of 45 µA passes a 50 µA datasheet
limit regardless of whether the component's lot has a median of 10 µA
(making this a 4.5× outlier) or 40 µA (making it typical).  Latent
defects — components with internal degradation mechanisms that accelerate
under sustained thermal stress — often pass static limits at 168h but
would fail in field deployment.

This project addresses three gaps:

1. **Cohort-relative detection**: Evaluate each component against its
   manufacturing lot's statistical baseline, not a fixed limit.
2. **Early rejection**: Predict whether a component's trajectory implies
   dangerous 168h drift from 0h and 24h measurements alone, enabling
   rejection at 24h (85% time reduction).
3. **Transparent reasoning**: Provide traceable, measurement-backed
   explanations for every screening decision, so quality engineers can
   verify and challenge the system's reasoning.

## 2. Data Strategy

### Why synthetic data

This project uses synthetically generated burn-in data.  The rationale
is straightforward: real semiconductor burn-in datasets are proprietary
(covered by foundry NDAs) and unavailable for academic or competition use.
The synthetic data serves to demonstrate the **methodology**, not to claim
validated performance on production data.

### How the data is modelled

The data generator (see `docs/data_generation_rationale.md` for full
technical details) models three component populations:

1. **Normal components (93–97% per lot)**: Mild exponential drift
   following Arrhenius kinetics (rate ∝ exp(-Eₐ/kT)), with Gaussian noise.
   This reflects the physical reality that parametric drift under thermal
   stress follows an activation-energy-dependent rate equation.

2. **Latent defects (3–7% per lot)**: A two-phase degradation model.
   Phase 1 (0h–24h) is indistinguishable from normal drift.  Phase 2
   activates at a randomised knee-point (24h–96h), after which degradation
   accelerates with a higher effective activation energy.  This models
   defect mechanisms like gate oxide weakening or electromigration
   precursors that remain dormant until cumulative stress exceeds a
   threshold.

3. **Obvious defects (~1% per lot)**: Immediate, visible parametric
   deviation from the first measurement — these are included for
   completeness but are trivially detectable.

Each lot of 200–500 components has independently sampled baseline
distributions (mean, standard deviation) for each parameter, simulating
real manufacturing variance between wafer runs.

### Transparency note

The synthetic generator uses seeded randomness for reproducibility.
Results reported here are on the same distribution used for training —
real deployment would require cross-validation on held-out fab data and
separate lots not seen during model fitting.

## 3. Module A — Outlier Detection

### Approach

Module A detects anomalous components within each manufacturing lot using
two complementary methods:

**Method 1: Robust Z-Score (Median / MAD)**

For each lot, parameter, and timepoint, the detector computes the median
and Median Absolute Deviation (MAD) — not mean and standard deviation.
MAD is robust to contamination: even if 5% of a lot are defective, the
median and MAD remain stable estimates of the "normal" population.

A component is flagged if its robust z-score (|value - median| / (MAD ×
1.4826)) exceeds a configurable threshold (default: 3.5) for any
parameter at any timepoint.

**Method 2: Isolation Forest**

A second detector trains a per-lot Isolation Forest on the joint
leakage-current × propagation-delay feature space across all timepoints.
Isolation Forest detects multivariate anomalies that may not be extreme
in any single parameter but occupy unusual regions of the joint
distribution.

**Combination rule**: A component is flagged as anomalous if **either**
method triggers.  The output records which method(s) fired, enabling
downstream explainability.

### Why this design

- **Median/MAD over mean/std**: A lot with 5% defects would inflate the
  standard deviation, making defects appear less extreme.  MAD is
  unaffected.
- **Per-lot models**: Lot-to-lot variation (different baseline means and
  spreads) means a single global model would flag components simply for
  being in an unusually high-mean lot.
- **Ensemble OR**: Each method catches different failure signatures.
  Robust z-score catches univariate extremes; Isolation Forest catches
  multivariate joint-distribution anomalies.

### Results

| Metric | Value |
|--------|:-----:|
| Precision | 84.40% |
| Recall | 95.58% |
| F2-Score | 0.9311 |
| False Negatives | 11 / 249 |

The 11 false negatives are latent defects whose 168h values remained close
enough to the lot's normal range to avoid triggering either detection
method.  These represent the hardest-to-detect defects — components whose
degradation trajectory was only slightly faster than normal.

## 4. Module B — Drift Prediction

### Approach

Module B predicts each component's 168h parametric value from its 0h and
24h measurements only.  This enables early rejection at the 24h mark.

**Feature engineering (5 features per parameter):**

| Feature | Definition | Rationale |
|---------|-----------|-----------|
| `value_0h` | Raw 0h measurement | Baseline reading |
| `value_24h` | Raw 24h measurement | First stress response |
| `early_slope` | (value_24h − value_0h) / 24 | Rate of early drift |
| `lot_dev_0h` | value_0h − lot_median_0h | Cohort-relative position |
| `lot_dev_24h` | value_24h − lot_median_24h | Cohort-relative change |

The lot-relative features (`lot_dev_*`) give the model context about
whether a component's absolute value is unusual for its lot, not just
whether it's high in absolute terms.

**Strict no-leakage constraint**: Features `value_96h` and `value_168h`
are explicitly excluded from the training feature set.  The 96h value is
used only for validation (checking that the model's trajectory prediction
is consistent at the midpoint).

**Two models, side by side:**

- **XGBoost Regressor**: Gradient-boosted trees trained per parameter
  per lot.
- **Linear Regression baseline**: Same features, same splits.  Included
  to demonstrate that the predictive gain from XGBoost is real, not an
  artifact of feature engineering alone.

**Safety-slope flagging**: After prediction, each component's implied
drift rate ((predicted_168h − value_0h) / 168) is compared against a
per-lot threshold (lot_median_slope + 3 × lot_std_slope).  Components
exceeding this threshold are flagged for rejection at 24h.

### Results

| Parameter | XGBoost MAE | Linear MAE | Latent MAE (XGB) |
|-----------|:-----------:|:----------:|:----------------:|
| Leakage Current (µA) | 1.36 | 1.59 | 10.67 |
| Propagation Delay (ns) | 0.42 | 0.50 | 3.19 |

| Class | Flag Rate |
|-------|:---------:|
| Normal | 0.1% |
| Latent | 37.4% |
| Obvious | 62.7% |

The high latent-class MAE (14× normal) is expected and correct.  The
model accurately learns normal drift patterns; its inability to predict
latent divergence from early data reflects a fundamental information
limit, not a model failure.

## 5. Explainability

### Approach

Every screening decision is accompanied by two forms of explanation:

**SHAP-based model explanations (Module B):**

Each XGBoost prediction is decomposed into per-feature additive
contributions using SHAP (SHapley Additive exPlanations) TreeExplainer.
The key property is additivity:

    prediction = base_value + Σ(shap_values)

Every SHAP value maps to a physical measurement a QA engineer can verify
on the bench.  For example: "value_0h contributed +3.2 µA to the
prediction" means the component's initial leakage reading pushed the
predicted 168h value up by 3.2 µA relative to the lot average.

**Rule-based justifications (Module A):**

For each flagged component, the system generates a plain-language sentence
citing the specific parameter, timepoint, measured value, lot median, and
datasheet limit.  For example:

> "Component LOT_008_C0130 flagged: leakage current at 168h (40.1 µA) is
> 10.4 standard deviations above the lot median (20.5 µA), despite being
> within the 50.0 µA datasheet limit."

**QA report generator:**

The `generate_qa_report()` function combines both explanations into a
structured report with four sections: parametric trajectory, anomaly
detection reasoning, drift prediction with SHAP breakdown, and a final
accept/reject recommendation.  The report is written so a QA engineer
with zero ML background can understand exactly why the system made its
recommendation.

### Why this matters

The alternative to SHAP-based explanation is a black-box model that
outputs "reject" with no reasoning.  In a regulated industry (automotive,
aerospace, medical devices), unexplainable screening decisions are
unacceptable.  SHAP values trace every number in the prediction back to
a physical measurement, enabling challenge and verification.

### Explainability rubric

An 8-point structural completeness rubric evaluates whether QA reports
contain: trajectory data, SHAP contributions, measured values, a clear
recommendation, anomaly justification, drift residual, safety-slope
status, and lot context.

Average score: **8.0 / 8** across 10 sampled reports.  This is a proxy
metric — true explainability quality requires human evaluation — but
perfect structural completeness indicates the system consistently
produces reports with all expected traceability elements.

## 6. Results Summary

| Metric | Value | Significance |
|--------|:-----:|-------------|
| F2-Score | 0.9311 | Recall-weighted; penalises missed defects heavily |
| Recall | 95.58% | 238 of 249 defects caught |
| Precision | 84.40% | 238 of 282 flags were actual defects |
| False Negatives | 11 | Hardest-to-detect latent defects |
| XGB MAE (leakage) | 1.36 µA | vs. Linear: 1.59 µA |
| XGB MAE (delay) | 0.42 ns | vs. Linear: 0.50 ns |
| Safety-slope FPR | 0.1% | Normal components incorrectly flagged |
| Safety-slope latent catch | 37.4% | Latent defects caught at 24h |
| Explainability score | 8.0 / 8 | Structural completeness rubric |

## 7. Limitations & Future Work

The following limitations are documented in `docs/known_limitations.md`.

### 7.1 Synthetic data does not capture all failure mechanisms

The generator models exponential drift and two-phase latent activation.
Real failure modes include electromigration (Black's equation),
hot-carrier injection (logarithmic time dependence), and intermittent
contact resistance faults.  Validated performance on real fab data is
required before production deployment.

### 7.2 Safety-slope threshold is a tunable hyperparameter

The N=3 sigma threshold for safety-slope flagging is a statistical
heuristic, not a physically derived constant.  The optimal N depends on
the cost ratio between false rejections (lost revenue) and false passes
(field failures), which is business-specific.

### 7.3 Prediction from 0h/24h has fundamental information limits

Latent defects whose activation energy threshold is above 24h of thermal
stress produce no detectable signal in the 0h/24h features.  No model
can predict a 168h divergence from features that contain no evidence of
it.  Module B's early rejection catches ~37% of latent defects — the
ones with detectable early signatures — but the remaining 63% require
full 168h burn-in.

### 7.4 Explainability rubric is a structural proxy

The 8-point rubric checks presence of expected elements, not semantic
quality.  Production deployment should include periodic human evaluation
of explanation accuracy and usefulness.

### Future work

- **Real data integration**: Partner with a foundry or OSAT to validate
  on historical burn-in records.
- **Adaptive thresholds**: Replace fixed N-sigma with Bayesian updating
  as more lot data accumulates.
- **Additional parameters**: Extend to frequency-domain measurements,
  IDDQ testing, and multi-site probe data.
- **Online learning**: Retrain models incrementally as new lots arrive,
  rather than batch retraining.

## 8. Real-World Deployment Considerations

### Integration with Automated Test Equipment (ATE)

In a production fab or ESS (Environmental Stress Screening) facility,
this system would integrate at three points:

1. **Data ingestion**: ATE handlers (Advantest, Teradyne) export
   parametric measurements as STDF (Standard Test Data Format) files.
   A lightweight ETL layer would parse STDF records into the
   lot/component/parameter/timepoint schema used by this system.

2. **24h decision gate**: After the 24h measurement cycle, Module B's
   safety-slope flag would feed back to the ATE handler's binning logic.
   Components flagged for rejection would be removed from the burn-in
   board, freeing slots for the next lot and reducing cycle time.

3. **168h final disposition**: After full burn-in, Module A's anomaly
   detection and Module B's prediction residual analysis would inform
   the final bin assignment.  Components passing both checks ship;
   flagged components go to failure analysis or are scrapped.

### Operational requirements

- **Latency**: Module A and B inference (excluding model training)
  complete in under 1 second for a 500-component lot on commodity
  hardware.  This is well within ATE cycle time constraints.
- **Model retraining**: Should occur per product line, triggered when
  a new process revision changes baseline parametric distributions.
  Monitoring for distribution shift (e.g., lot median drifting over
  time) would trigger automatic retraining.
- **Auditability**: Every screening decision is logged with the full
  QA report (trajectory, SHAP values, recommendation), providing a
  complete audit trail for ISO 9001 / IATF 16949 compliance.
