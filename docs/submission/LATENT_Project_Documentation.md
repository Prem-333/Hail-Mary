# LATENT Semiconductor Reliability Screening


---

## 1 LATENT

Semiconductor Reliability Screening

Cohort based anomaly detection and early drift analysis

[Cover illustration: a semiconductor package surrounded by orbital paths.]

LATENT helps identify semiconductor components whose electrical behaviour differs from comparable parts in the same manufacturing lot. It combines anomaly detection across the burn-in cycle, predictions from the first 24 hours, and explanations that connect each result to measured values.

15,142 synthetic components | 96.72% full-cycle defect recall | 613 extra defects flagged¹

The application brings lot summaries, component trajectories, prediction models and an interactive simulator into a single workflow. It gives quality engineers a clearer basis for investigating suspicious parts and understanding why a component was flagged.

¹ Compared with the configured final-measurement limits on the current synthetic dataset. The additional 613 labelled defects were flagged by Module A while remaining below both final limits. These results demonstrate the method under simulated conditions. [4]

### Document scope

Problem and approach · System architecture · Data and methods · Visual component assessment · Interactive simulation · Verified results · Implementation and next steps


---

## 2 Why component context matters

A semiconductor can meet a fixed electrical limit while behaving differently from the rest of its production lot. That difference can be worth investigating, especially when the component will operate in a system that is difficult to repair after deployment.

Burn-in applies stress before service so that susceptible components can reveal abnormal behaviour. Conventional limit checks answer whether a measurement is allowed. LATENT adds a second question: is the component behaving normally for its own peer group? [7]

Illustrative comparison: lot median 10 µA, component 45 µA, maximum limit 50 µA. The component is below the limit but unusual within its lot.

Figure 1. Illustrative leakage comparison. The 50 µA limit and example values explain the concept; they are not a universal specification for semiconductor devices.

### Behaviour across time adds another signal

A hidden defect may produce ordinary early readings and diverge only after sustained stress. Looking at several checkpoints reveals the trajectory as well as the final value. The system therefore separates early forecasting from analysis of the complete burn-in record.

Burn-in timeline: baseline at 0h, early forecast at 24h, later observation at 96h and final checkpoint at 168h.

### The practical objective

LATENT prioritises components for investigation and presents the supporting evidence. It complements the laboratory’s existing screening requirements. Statistical unusualness is an investigation signal; engineering assessment determines its physical meaning and final disposition.


---

## 3 How the system works

Measurement records enter a Python analytics pipeline. Two complementary modules analyse the data, an explanation layer assembles a component report, and a web application makes the results available for exploration. [1-3]

Measurement CSVs feed Module A and Module B. Triggers and SHAP feed FastAPI and the dashboard. Labels support evaluation.

Figure 2. Implemented data flow. Labels support synthetic evaluation. The early predictor receives only the 0h and 24h readings and their lot-relative context.

Module A uses all four checkpoints for anomaly detection. Module B uses early readings to forecast the final measurement.

### An integrated application

The FastAPI backend loads measurements, computes anomalies, trains the forecasting models and caches the results. A Next.js and React interface provides the lot overview, component details, simulator, evaluation view and live monitor. SHAP supplies feature contributions for the forecast; deterministic report rules explain anomaly flags.

The current live monitor replays stored trajectories with interpolation and noise over a WebSocket. Connecting physical test equipment requires a data adapter with validated units, timestamps and device identifiers.

Core stack: Python, pandas, NumPy, scikit-learn, XGBoost and SHAP; FastAPI for the service; Next.js 16, React 19 and TypeScript for the interface. The prototype stores its active data and models in process memory.


---

## 4 Data and analytical methods

The current dataset contains 15,142 components from 20 manufacturing lots: 14,135 normal, 761 latent and 246 obvious defects. Each component has leakage current and propagation delay readings at 0h, 24h, 96h and 168h, giving 30,284 measurement rows. [1, 4]

### A controlled model of degradation

Normal parts follow mild exponential drift with noise. Latent parts begin with normal behaviour and accelerate after a sampled activation time between 20 and 60 hours. Obvious defects start with elevated values. The generator samples drift coefficients directly; it is a thermal-activation-inspired approximation, not a calibrated model of a particular device family.

### Module A compares each component with its lot

For each parameter and checkpoint, a robust score measures distance from the lot median. Median absolute deviation, or MAD, supplies a spread estimate that is less sensitive to extreme readings. Scores from the two parameters are combined and the largest checkpoint score is retained.

```text
z = abs(value - lot median) / (1.4826 × MAD)
checkpoint score = sqrt(z_leakage² + z_delay²)
robust flag = maximum checkpoint score > 3.5
```

A per-lot Isolation Forest also examines the eight parameter-by-time features. Module A flags a component when either method triggers. The implementation uses 200 trees and contamination 0.05; the forest is skipped for lots smaller than four components. [2, 8]

### Module B estimates the final measurement

Separate XGBoost and linear-regression models predict each parameter at 168h. Their five inputs are the 0h value, 24h value, early slope and deviations from the lot median at those two times. Later measurements are excluded from the input features.

```text
early slope = (value_24h - value_0h) / 24
threshold = lot median early slope + 3 × lot slope std
implied drift = (predicted_168h - value_0h) / 168
early flag = implied drift exceeds the parameter threshold
```

Leakage drift is measured in µA per hour and delay drift in ns per hour. A component is flagged if either parameter exceeds its threshold. Thresholds are statistical settings that require validation for the intended part family and process.


---

## 5 A component assessment in practice

LOT_009_C0374 demonstrates why trajectory and cohort context matter. This component is labelled latent in the generated dataset. At 168h its leakage is 48.09 µA and its delay is 17.03 ns, both below the configured maxima of 50 µA and 18 ns. [4]

Navy: component measurement. Blue: lot median. Dashed gold: illustrative datasheet maximum. Residuals use unrounded values.

[Figure: verified case trajectories compared with their lot medians and illustrative limits.]

Figure 3. Measured synthetic trajectories against the lot median. Lines connect the four sampled checkpoints; they do not represent continuous sensor observations.

| Parameter | Forecast from early data | Observed at 168h | Residual |
| --- | --- | --- | --- |
| Leakage current | 21.98 µA | 48.09 µA | +26.11 µA |
| Propagation delay | 10.51 ns | 17.03 ns | +6.53 ns |

### How the assessment develops

At 24h, the early drift screen does not flag the component. At the final checkpoint, the complete trajectory stands out from the lot and Module A flags it. The report therefore recommends FLAG FOR MANUAL REVIEW. This example uses the full-data demonstration model, rather than the separate held-out model reported on page 7.

### An explanation with a clear meaning

The report shows raw readings, lot context, anomaly triggers, forecasts and residuals. SHAP explains how the early input features move the forecast away from the model’s expected value. For leakage, the approximate baseline is 20.03 µA and the net feature contribution is +1.96 µA, producing a forecast of 21.98 µA. Rounding explains small displayed differences. [3, 9]

> Interpretation — The later measurements reveal divergence that the early forecast did not establish. The report provides traceable reasons to investigate. SHAP explains a model prediction; it does not determine the physical cause of a defect or guarantee future reliability.


---

## 6 Exploring early readings visually

The simulator makes the relationship between early measurements and the prediction visible. The two scenarios below were processed by the running simulation API using the same lot, LOT_009, and the same starting values: 17.13 µA leakage and 9.12 ns delay. [5]

Simulator results using the same lot and starting readings. Recorded inputs predict 21.98 µA with a 0.47× drift ratio and no early flag. Higher 24h inputs predict 35.58 µA with a 1.80× drift ratio and an early flag.

Figure 4. Actual API outputs presented as a visual comparison. The left scenario uses rounded early readings from the component on page 5. The right scenario is a hypothetical increase in its 24h readings. These panels illustrate the model response, not physical test outcomes.

### What changes between the scenarios

Increasing the 24h leakage from 17.88 to 23.00 µA raises the predicted final leakage from 21.98 to 35.58 µA. The implied leakage drift rises from 0.0289 to 0.1098 µA per hour against the same lot threshold of 0.0609 µA per hour. The second scenario therefore produces an early flag.

The predicted delay also changes, from 10.51 to 12.45 ns. Its implied drift crosses the corresponding delay threshold. In both cases, each parameter is compared in its own units before the component-level flag is formed.

Application workflow: select a lot, inspect a component, explore a scenario, review its evidence.

The absence of an early flag does not justify ending the burn-in cycle. Page 5 shows a component with ordinary early behaviour that later diverges. No probability of failure is implied by the simulator’s flag.


---

## 7 Measured performance

Evaluation on the current synthetic dataset shows the strongest benefit in full-cycle anomaly detection. Module A flagged 974 of 1,007 labelled defects: 96.72% recall, 84.11% precision and 0.9391 F2. It missed 33 defects and flagged 184 normal components. [4]

Defects flagged: static limits 361; Module A 974.

Figure 5. Defects flagged out of 1,007. The comparison baseline checks whether the final leakage exceeds 50 µA or final delay exceeds 18 ns. It represents the configured limits, not every procedure used in a laboratory.

| Screen | Defects flagged | Defects missed | Normal parts flagged |
| --- | --- | --- | --- |
| Final limit check | 361 | 646 | 0 |
| Module A | 974 | 33 | 184 |

Module A identified 613 labelled defects below both final limits. Its additional review burden was 184 normal components, or 1.30% of the normal population. This tradeoff should be assessed against the laboratory’s investigation capacity and tolerance for missed defects.

### Forecasting on five unseen lots

A separate split trained Module B on 11,189 components from 15 lots and tested it on 3,953 components from five other lots. Lot context used only early readings. Mean absolute error, or MAE, is the average magnitude of prediction error; lower is better.

| Held-out parameter | XGBoost MAE | Linear model MAE |
| --- | --- | --- |
| Leakage current | 1.6206 µA | 1.5506 µA |
| Propagation delay | 0.5579 ns | 0.5190 ns |

The early screen flagged 36 of 57 obvious defects, 0 of 235 latent defects and 6 of 3,661 normal parts in this split. The linear model achieved lower MAE and RMSE for both parameters. These results support retaining the full burn-in cycle and evaluating simple models alongside XGBoost.

Protocol: GroupShuffleSplit, test_size 0.25, random_state 42. This is one split of synthetic data. Real-device performance, uncertainty bounds and repeated-lot stability remain to be established. The repository test suite passed 36 tests, including one placeholder. [4, 6]


---

## 8 Implementation and practical value

LATENT is implemented as a local web application. Its immediate purpose is to organise screening evidence and support investigation. The same service boundary provides a starting point for connection to a laboratory’s approved data sources. [3]

| Capability | Current implementation |
| --- | --- |
| Lot overview | Groups components by manufacturing lot and orders anomalies for inspection. |
| Component report | Combines trajectories, cohort envelopes, predictions, SHAP and a recommendation. |
| Interactive simulator | Accepts a lot identifier and four early readings through the simulation API. |
| Evaluation view | Displays synthetic screening metrics; separate held-out evidence accompanies this document. |
| Live monitor | Replays interpolated stored trajectories through a WebSocket. |

### Deployment foundation

The backend runs with Python and FastAPI; the dashboard uses Node.js and Next.js. The repository includes installation instructions and an automated test suite. The current service trains and caches models during initialisation. A sustained deployment should separate training from serving and version the data, model and threshold used for each decision.

### Potential operational benefit

Earlier identification of unsuitable components could reduce avoidable testing effort when the equipment and approved procedure allow action at 24h. The maximum interval to the final 168h checkpoint is 144 component-hours per approved early removal. Actual capacity or energy savings depend on batch scheduling, review costs and equipment operation; they have not yet been measured.

### Development priorities

| Next step | Outcome sought |
| --- | --- |
| Validate with real records | Establish performance by lot, part family and independently verified failure outcome. |
| Strengthen data and service controls | Add ingestion validation, access controls, persistent records and model versioning. |
| Run in shadow mode | Measure explanation usefulness and review workload while existing rules retain authority. |

The next practical milestone is a controlled pilot with historical measurements followed by shadow operation. Success means useful additional findings at a manageable false-alarm rate, supported by traceable decisions and an approved review process.


---

## 9 References and terminology

Project paths are relative to the SIH - 2026 repository. The evidence snapshot is dated 16 September 2026 and uses code baseline 959b746. Public sources provide background for the methods.

[1] Data modelsrc/data_generation/generate_dataset.py. Parameters, trajectories, labels and configured limits.

[2] Detection and predictionsrc/outlier_detection/detector.py and src/drift_prediction/predictor.py. Algorithms, features and thresholds.

[3] Explanation and applicationsrc/explainability/explainer.py, backend/ and dashboard/apps/web/. Reports, API and dashboard implementation.

[4] Verified evaluationdocs/submission/verification_evidence.json. Current dataset hashes, package versions, metrics, held-out lots and component report.

[5] Simulator demonstrationdocs/submission/simulation_demo.json. Exact requests and responses from the local simulation API for the two illustrated scenarios.

[6] Reproduction and checksdocs/submission/verify_evidence.py and verification_tests.txt. Evaluation script and successful 36-test run, including one placeholder.

[7] NASA Kennedy Space Center, [Preferred Reliability Practice PT-TE-1401](https://extapps.ksc.nasa.gov/Reliability/Documents/Preferred_Practices/1401.pdf). Background on screening and latent failure mechanisms.

[8] scikit-learn, [IsolationForest reference](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html). Tree-based anomaly detection and configuration.

[9] SHAP, [TreeExplainer reference](https://shap.readthedocs.io/en/latest/generated/shap.TreeExplainer.html). Model explanations and additive feature contributions.

### Terms used throughout the document

| Term | Meaning |
| --- | --- |
| Burn-in | Stress applied during component screening to expose susceptible behaviour. |
| Lot or cohort | The manufacturing group used as the component’s comparison population. |
| Latent defect | A hidden defect whose effects may become observable under later stress. |
| Recall and precision | Recall measures defect coverage; precision measures how often a flag is a labelled defect. |
| SHAP and residual | SHAP attributes a model output to features. A residual is the observed value minus the prediction. |

All quantitative model results in this document concern synthetic data. Dataset hashes, package versions and held-out lot identifiers are recorded in the accompanying evidence files so the calculations can be reproduced.
