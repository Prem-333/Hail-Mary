# QA Inspection Report: LOT_008_C0130

| Field | Value |
|-------|-------|
| **Lot** | `LOT_008` |
| **Component ID** | `LOT_008_C0130` |
| **Recommendation** | 🔴 **REJECT** |
| **Confidence** | High |
| **Ground Truth** | Latent Defect (confirmed) |

---

## 1. Parametric Trajectory

### Leakage Current (µA)

| 0h | 24h | 96h | 168h | Datasheet Limit |
|:---:|:---:|:---:|:---:|:---:|
| 18.53 | 18.82 | 26.69 | 40.12 | 50.0 |

### Propagation Delay (ns)

| 0h | 24h | 96h | 168h | Datasheet Limit |
|:---:|:---:|:---:|:---:|:---:|
| 9.64 | 9.72 | 13.27 | 18.4 | 18.0 |

---

## 2. Anomaly Detection (Module A)

> [!WARNING]
> **ANOMALOUS** (score: 15.5, robust z: 15.5)

### Justification

Component LOT_008_C0130 flagged as ANOMALOUS (score: 15.5). Leakage Current at 96h (26.7 µA) is 3.7 standard deviations above the lot median (19.6 µA), despite being within the 50.0 µA datasheet limit. Propagation Delay at 96h (13.3 ns) is 6.1 standard deviations above the lot median (8.1 ns), despite being within the 18.0 ns datasheet limit. Leakage Current at 168h (40.1 µA) is 10.4 standard deviations above the lot median (20.5 µA), despite being within the 50.0 µA datasheet limit. Propagation Delay at 168h (18.4 ns) is 11.5 standard deviations above the lot median (8.2 ns). Isolation Forest corroborates this as an outlier based on joint leakage/propagation-delay pattern.

### Detection Triggers

- `robust_z(leakage_current_uA@value_96h): z=3.7`
- `robust_z(propagation_delay_ns@value_96h): z=6.1`
- `robust_z(leakage_current_uA@value_168h): z=10.4`
- `robust_z(propagation_delay_ns@value_168h): z=11.5`
- `isolation_forest(score=-0.139)`

---

## 3. Drift Prediction (Module B)

### Predicted vs. Actual (168h)

| Parameter | Predicted (XGBoost) | Predicted (Linear) | Actual | Residual |
|-----------|:---:|:---:|:---:|:---:|
| Leakage Current (µA) | 25.4 | 21.4 | 40.1 | +14.7 |
| Propagation Delay (ns) | 13.4 | 10.5 | 18.4 | +5.0 |

> [!CAUTION]
> **Safety-slope flag triggered**: implied drift rate (0.0410/h) exceeds lot threshold (0.0402/h)

### SHAP Feature Contributions

*Each value shows how much that feature pushed the 168h prediction away from the base (lot-average) prediction. Positive = higher predicted drift, Negative = lower predicted drift.*

#### Leakage Current

| Feature | Measured Value | SHAP Contribution | Direction |
|---------|:---:|:---:|:---:|
| `early_slope` | 0.0120 | +1.6188 µA | ↑ Higher |
| `value_24h` | 18.8221 | +1.2113 µA | ↑ Higher |
| `lot_dev_24h` | 0.1684 | +1.0779 µA | ↑ Higher |
| `value_0h` | 18.5341 | +0.8586 µA | ↑ Higher |
| `lot_dev_0h` | 0.1826 | +0.7828 µA | ↑ Higher |

**Base prediction**: 19.87 µA &emsp; **SHAP adjustment**: +5.55 µA &emsp; **Final prediction**: 25.41 µA

#### Propagation Delay

| Feature | Measured Value | SHAP Contribution | Direction |
|---------|:---:|:---:|:---:|
| `value_0h` | 9.6416 | +1.4104 ns | ↑ Higher |
| `lot_dev_0h` | 1.7752 | +1.1638 ns | ↑ Higher |
| `value_24h` | 9.7187 | +0.9966 ns | ↑ Higher |
| `lot_dev_24h` | 1.7921 | +0.4652 ns | ↑ Higher |
| `early_slope` | 0.0032 | +0.1210 ns | ↑ Higher |

**Base prediction**: 9.22 ns &emsp; **SHAP adjustment**: +4.16 ns &emsp; **Final prediction**: 13.38 ns

> [!IMPORTANT]
> The large prediction residual is itself a strong indicator of a latent defect. The component's trajectory diverged in ways the model could not anticipate from early measurements alone -- precisely the signature of a defect that activates under sustained thermal stress.

---

## 4. Final Recommendation

### 🔴 REJECT

This component exhibits clear signs of abnormal degradation and should be REJECTED:
  - Trajectory divergence: Leakage Current changed +117% from 0h to 168h (18.5 -> 40.1 µA), far exceeding the lot's typical drift of +12%.
  - Trajectory divergence: Propagation Delay changed +91% from 0h to 168h (9.6 -> 18.4 ns), far exceeding the lot's typical drift of +4%.
  - Cohort-relative anomaly: Flagged by outlier detection (score: 15.5), indicating the component is statistically unusual relative to its manufacturing lot.
  - Prediction residual: The drift model predicted 25.4 µA at 168h but actual was 40.1 µA (residual: +14.7 µA), suggesting unexpected degradation.
  - Prediction residual: The drift model predicted 13.4 ns at 168h but actual was 18.4 ns (residual: +5.0 ns), suggesting unexpected degradation.
  - Note: The 168h leakage current (40.1 µA) remains within the datasheet limit (50.0 µA), but the degradation trajectory strongly suggests continued drift toward field failure.
