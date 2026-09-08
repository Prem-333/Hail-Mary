# Doc 3 — ML Model: Outlier Detection [Module A]
### Person 3 Preparation Sheet | SIH 2026 · LATENT

> **Your job in the presentation:** Explain exactly how Module A detects
> anomalous components by comparing them to their own batch, and why this
> is fundamentally better than static datasheet limits.

---

## 1. The Core Insight — Why Static Limits Fail

Traditional testing says: "If leakage is below 50 µA, the component passes."

**The problem:** Imagine a lot where every component reads around 10 µA. Now
one component reads 48 µA. It passes the 50 µA limit — but relative to its
peers, it is completely wrong. It is a **latent defect**.

Module A detects exactly this. It replaces static limits with
**cohort-relative anomaly detection** — it scores every component relative to
the distribution of its own manufacturing lot, not a fixed threshold.

**Key code reference:** `src/outlier_detection/detector.py`

---

## 2. Method 1 — Robust Z-Score

### What is a Z-score?
A Z-score answers: "How many standard deviations away from the average is this
measurement?"

$$z = \frac{|\text{value} - \text{mean}|}{\text{std}}$$

A z-score of 1.0 means the value is 1 standard deviation away — fairly normal.
A z-score of 3.5 means it's 3.5 standard deviations away — very unusual.

### Why MAD instead of Standard Deviation?

Standard Deviation is computed using the *mean*, which is heavily pulled by
extreme outliers. If a lot contains even a few catastrophically defective parts,
those outliers inflate the standard deviation, making the "normal zone" look
wider and making the defects *harder* to detect.

**Median Absolute Deviation (MAD)** uses the *median* instead:

$$\text{MAD} = \text{median}(|x_i - \text{median}(x)|)$$

The median is not affected by extreme values. Even if 20% of a lot is defective,
the median stays anchored to the typical good component.

**The conversion factor (1.4826):**
For a normally distributed population, $\text{MAD} \approx 0.6745\sigma$, so:
$$\sigma_{\text{est}} = \text{MAD} \times 1.4826$$

This converts MAD back into standard-deviation units, making the z-score
formula valid again:

$$z_{\text{robust}} = \frac{|\text{value} - \text{median}|}{\text{MAD} \times 1.4826}$$

### Real Example from validate_physics.py

```
Lot readings: [10.1, 9.8, 10.3, 10.0, 9.7, 10.2, 9.9, 10.1, 10.0, 48.0]
Lot median:   10.05 µA
MAD:          0.15 µA
σ_est:        0.222 µA

Robust z-score for 48 µA = |48 - 10.05| / 0.222 = 171.0
Threshold = 3.5  →  FLAGGED ✅

Traditional: 48 µA < 50 µA limit → PASSED ❌
```

This is the most powerful example in the whole project. The **same component**
passes static screening but is caught with a z-score of 171.

### Multi-Parameter Combination (Mahalanobis-style)

The code computes z-scores for both Leakage Current and Propagation Delay at
all four timepoints (0h, 24h, 96h, 168h). It then combines per-parameter
z-scores at each timepoint using a Euclidean norm:

$$z_{\text{combined}} = \sqrt{z_{\text{leakage}}^2 + z_{\text{delay}}^2}$$

This is a simplified Mahalanobis distance. It correctly amplifies cases where
both parameters are anomalous simultaneously (even stronger evidence of a defect).

**Flagging threshold:** `z_combined > 3.5` → component is anomalous.
*(For a normal distribution, z > 3.5 corresponds to a 1-in-4300 probability.)*

---

## 3. Method 2 — Isolation Forest

Isolation Forest is an **unsupervised machine learning algorithm** from Scikit-Learn.
It was chosen as a second detection method because it catches **multivariate anomalies** —
cases where no single parameter is extreme, but the *combination* is unusual.

### How Isolation Forest Works

1. The algorithm builds an ensemble of **200 random decision trees** (our config).
2. For each tree, it randomly picks a feature and a random split value to
   progressively isolate individual data points.
3. **Normal points** are surrounded by many other points — they take many splits to isolate.
4. **Anomalies** are isolated far from the cluster — they are isolated in very few splits.
5. The algorithm assigns a score based on average path length: **shorter path = more anomalous**.

### Key Configuration Parameters

```python
IsolationForest(
    n_estimators=200,      # 200 trees — more stable than default 100
    contamination=0.05,    # Tell the model to expect ~5% anomalies per lot
    random_state=42        # Fixed seed for reproducibility
)
```

The `contamination=0.05` parameter is set to 5%, which is slightly below our
actual defect rate (5–9%). This is intentionally conservative — we prefer to
flag a few extra parts (false positives) rather than miss real defects.

---

## 4. Combination Rule — OR Logic

From `detector.py`:
```python
is_anomalous = z_info["flagged"] or iso_info["flagged"]
```

A component is flagged if **EITHER** method flags it. This is a deliberate
engineering choice:
- The two methods are **complementary**, not redundant.
- The Z-score excels at catching univariate extreme values (obvious defects, or
  latent defects with high baselines).
- Isolation Forest excels at catching subtle multivariate anomalies where no
  single feature is dramatic.
- Using OR ensures the highest possible recall (catching the most defects).

---

## 5. The Anomaly Score

The `anomaly_score` shown in the UI is a **composite score**:

```python
iso_normalized = max(0.0, -iso_info["score"] * 5.0)
anomaly_score = max(z_normalized, iso_normalized)
```

It is the maximum of:
1. The robust z-score (directly interpretable — e.g., 28.9 means 28.9 standard
   deviations from the lot median)
2. The isolation score re-scaled to comparable units

This means when you see "Score: 28.91 (z-score)" in the UI, that number is
directly meaningful — the component is 28.91 standard deviations from its
lot's median.

---

## 6. Soundbites for Judges

- *"Module A doesn't ask 'is this below 50 µA?' — it asks 'is this component
  unusual compared to the 300 other components made in the same factory run at
  the same time?' That is a fundamentally harder and more powerful question."*
- *"We use MAD instead of standard deviation because standard deviation is
  corrupted by the very defects we are trying to detect. MAD is robust — a handful
  of extreme outliers barely move it."*
- *"Isolation Forest and Robust Z-Score are complementary detectors. Z-score
  catches univariate extremes; Isolation Forest catches subtle multivariate
  anomalies. Using OR gives us the highest recall."*
