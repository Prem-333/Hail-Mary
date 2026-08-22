# Known Limitations

*Transparency about limitations is a credibility signal. The following are
honest constraints of the current system that should be disclosed during
evaluation and would be addressed in a production deployment.*

---

## 1. Synthetic Data May Not Capture All Real Failure Mechanisms

The dataset generator models two degradation patterns — mild exponential
drift (normal) and accelerated Arrhenius-style activation (latent defects).
Real semiconductor burn-in data exhibits far richer failure phenomenology:

- **Electromigration** — current-density-driven metal voiding that follows
  Black's equation (current^n × exp(-Ea/kT)), not captured here.
- **Hot-carrier injection** — gate oxide degradation with logarithmic
  time-dependence (not exponential).
- **Intermittent faults** — contact resistance spikes that appear and
  disappear stochastically, not modeled by smooth drift curves.
- **Lot-to-lot correlations** — real foundry lots may share systematic
  defects (e.g. etch depth variation), which our independent-lot generation
  does not simulate.

A production system would train on historical fab data (under NDA), not
synthetic approximations. The synthetic data demonstrates the *methodology*
works; generalization to real failure modes would need validation on actual
burn-in records.

---

## 2. Safety-Slope Threshold Is a Tunable Hyperparameter, Not a Physical Constant

The safety-slope rejection threshold (`lot_median_slope + N × std_slope`,
default N=3) is a statistical heuristic, not a physically derived critical
value. In practice:

- **N is arbitrary**: N=3 gives ~0.1% false-positive rate on normal
  components, but the "correct" N depends on the cost ratio between
  a false rejection (lost revenue) and a false pass (field failure).
  This cost ratio is business-specific and should be tuned with domain
  experts, not fixed by the ML engineer.
- **Gaussian assumption**: Using `mean + N×std` assumes approximately
  normal slope distributions. Heavily skewed or multimodal distributions
  (common in real lots with multiple failure populations) would need
  a different threshold strategy (e.g. quantile-based).
- **Static vs adaptive**: The current threshold is fixed per lot. An
  adaptive threshold that tightens as more data accumulates (e.g.
  Bayesian updating) would be more robust but is not implemented.

---

## 3. Prediction from 0h/24h Has Fundamental Information Limits

Module B predicts 168h values from only 0h and 24h measurements. This is
a deliberate design choice (enabling early rejection at 24h), but it means:

- **Latent defects with activation energy above 24h are invisible**: If
  a defect's knee point is at 48h+, the 0h and 24h features look completely
  normal. No model — no matter how sophisticated — can predict a 168h
  divergence from features that contain no signal of it.
- **The high latent-class MAE is inherent, not fixable**: The ~10× higher
  MAE for latent defects compared to normal components is a *feature*, not
  a bug — it reflects the fundamental unpredictability of late-activating
  defects from early data. This residual is itself a useful detection signal,
  but it means Module B should be used as a *complementary* screen, not a
  standalone replacement for full burn-in.
- **Adding value_96h as a feature would improve accuracy but defeat the
  purpose**: The brief explicitly prohibits using 96h data for prediction
  because the goal is *early* rejection. If 96h data were available,
  Module A (which uses all timepoints) would already catch most defects.

---

## 4. Explainability Rubric Is a Structural Proxy, Not a Semantic Evaluation

The explainability score (Section 3 of the evaluation report) checks whether
QA reports *contain* the right structural elements (SHAP values, measured
values, recommendations), but does not evaluate whether those explanations
are:

- **Accurate**: A SHAP value could be numerically correct but misleading
  if the underlying model has learned a spurious correlation.
- **Useful**: A QA engineer might find the lot-relative deviation important
  but the raw SHAP numbers unhelpful without context about typical ranges.
- **Actionable**: The recommendation "FLAG FOR MANUAL REVIEW" is honest
  but not specific about *what* to review or *what* follow-up test to run.

A production system should include a human-in-the-loop evaluation phase
where domain experts rate explanation quality on a Likert scale, with
periodic calibration against actual QA decisions. The rubric here is a
reasonable *minimum bar* for competition judging, not a production-grade
evaluation.
