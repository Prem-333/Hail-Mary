<p align="center">
  <img src="https://img.shields.io/badge/SIH-2026-FF6B35?style=for-the-badge&labelColor=0D1117" alt="SIH 2026" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white&labelColor=0D1117" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white&labelColor=0D1117" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white&labelColor=0D1117" alt="Next.js" />
  <img src="https://img.shields.io/badge/XGBoost-2.0+-FF6600?style=for-the-badge&labelColor=0D1117" alt="XGBoost" />
  <img src="https://img.shields.io/badge/SHAP-Explainable_AI-8B5CF6?style=for-the-badge&labelColor=0D1117" alt="SHAP" />
</p>

<h1 align="center">LATENT</h1>
<h3 align="center">Burn-In Screening System for Latent Semiconductor Defect Detection</h3>
<p align="center"><em>Catch the defects that pass every test — before they reach orbit.</em></p>

---

## The Problem

Standard semiconductor burn-in testing compares each component's measurements against **fixed datasheet limits** (e.g., "leakage current < 50 µA"). These limits are **lot-agnostic**: a 45 µA reading passes the 50 µA limit whether the lot average is 10 µA (making this a **4.5× outlier**) or 40 µA (making it completely typical).

**Latent defects** — components with hidden degradation mechanisms that activate under sustained thermal stress — **routinely pass** 168-hour static limits and fail in the field. Traditional screening has **no mechanism** to catch them early or to explain why a component was flagged.

For ISRO-grade missions, a single undetected defect reaching orbit can be catastrophic.

---

## The Solution

LATENT is a two-module AI screening pipeline that replaces lot-agnostic static limits with **cohort-relative, explainable** defect detection:

| Capability | What It Does | Key Result |
|:---|:---|:---|
| **Module A — Outlier Detection** | MAD-based robust Z-score + per-lot Isolation Forest, combined with OR logic | **F2 = 0.9347** · 96.24% recall · 83.83% precision |
| **Module B — Early Rejection at 24h** | XGBoost regressor predicts 168h value from 0h + 24h data; safety-slope threshold flags anomalous drift | **0.01% FPR** on normal components · catches 68.1% of obvious defects at 24h |
| **SHAP Explainability** | Every screening decision decomposes into additive per-feature contributions, each mapping to a physical bench measurement | **8.0/8** structural completeness rubric score |
| **Interactive Simulator** | Feed arbitrary 0h/24h readings → get predicted 168h value, drift rate, safety-slope verdict, and per-feature SHAP waterfall | Live demonstration for evaluators |
| **Real-Time Sensor Stream** | WebSocket replay of interpolated burn-in trajectories with Gaussian noise, simulating live ATE output | 1 Hz streaming at `ws://localhost:8000/ws/sensor-stream` |
| **Next.js Dashboard** | Lot overview, component deep-dive with trajectory envelope charts, interactive simulator, live monitor, evaluation report | 5 routes at `http://localhost:3000` |

---

## At a Glance — Key Metrics

<table>
<tr>
<td width="50%">

### Module A — Anomaly Detection
| Metric | Value |
|:---|:---:|
| F2-Score | **0.9347** |
| Recall | 96.24% |
| Precision | 83.83% |
| True Positives | 2,406 |
| False Negatives | 94 / 2,500 |
| Total Components | 38,018 |

</td>
<td width="50%">

### Module B — Drift Prediction
| Metric | Value |
|:---|:---:|
| Leakage MAE (XGBoost) | **1.45 µA** |
| Delay MAE (XGBoost) | **0.47 ns** |
| Normal FPR (safety-slope) | 0.01% |
| Latent early-catch rate | 1.3% |
| Obvious early-catch rate | 68.1% |
| Explainability score | **8.0 / 8** |

</td>
</tr>
</table>

> **Why F2 and not F1?** The problem brief states a false negative is catastrophic — a defective component reaching a satellite. F2 weights recall **4× more** than precision, directly encoding this asymmetric cost into the evaluation metric.

---

## Architecture

```mermaid
flowchart TD
    subgraph DataLayer["Data Layer"]
        CSV["burnin_measurements.csv\nburnin_labels.csv"]
        GEN["generate_dataset.py\nArrhenius-based synthetic generator"]
    end

    subgraph MLPipeline["ML Pipeline (src/)"]
        MA["Module A: OutlierDetector\nMAD Z-score + Isolation Forest"]
        MB["Module B: DriftPredictor\nXGBoost + Linear Baseline"]
        EX["BurnInExplainer\nSHAP TreeExplainer + Rule-based"]
        EV["evaluate.py\nF2, MAE, Safety-slope metrics"]
    end

    subgraph Backend["FastAPI Backend (api/)"]
        DEP["dependencies.py\nload_system() — singleton"]
        R1["GET /api/lots/"]
        R2["GET /api/components/{id}"]
        R3["POST /api/simulate/"]
        R4["GET /api/evaluation/"]
        WS["WS /ws/sensor-stream"]
    end

    subgraph Frontend["Next.js Dashboard (hail mary/apps/web/)"]
        P1["/ — Lot Overview\nScatter plots · Defect rates"]
        P2["/components/[id]\nTrajectory envelopes · SHAP · Verdict"]
        P3["/simulator\nLive prediction · Gauge charts"]
        P4["/monitor\nWebSocket live charts"]
        P5["/evaluation\nMetrics report"]
    end

    GEN --> CSV
    CSV --> DEP
    DEP --> MA --> EX
    DEP --> MB --> EX
    EX --> EV
    DEP --> R1 & R2 & R3 & R4 & WS
    R1 --> P1
    R2 --> P2
    R3 --> P3
    WS --> P4
    R4 --> P5
```

---

## How It Works — Sequence Flow

**Scenario: QA engineer opens a component's detail page.**

```mermaid
sequenceDiagram
    actor QA as QA Engineer
    participant FE as Next.js Dashboard
    participant API as FastAPI
    participant EX as BurnInExplainer
    participant MA as OutlierDetector
    participant MB as DriftPredictor + SHAP

    QA->>FE: Clicks component in lot table
    FE->>API: GET /api/components/{component_id}
    API->>EX: generate_qa_report(component_id)
    EX->>MA: Lookup outlier_results_df for component
    EX->>MB: predictor.predict() + shap_explainer.shap_values()
    EX-->>API: Report dict (trajectory, SHAP, recommendation)
    API->>API: get_envelope() — lot MAD band for chart
    API-->>FE: Report + trajectories + defect_type
    FE-->>QA: Trajectory chart + SHAP waterfall + accept/reject verdict
```

---

## Quickstart

### Prerequisites

| Tool | Version | Purpose |
|:---|:---|:---|
| Python | 3.11+ | ML pipeline and API |
| Node.js | 20+ | Next.js dashboard |
| npm | 10+ | Package manager |
| Git | Latest | Version control |

### 1. Clone & Setup Python Backend

```bash
git clone <repo-url>
cd "SIH - 2026"

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate
# Activate (macOS/Linux)
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Generate Dataset & Start API

```bash
# Generate the synthetic burn-in dataset (Arrhenius-modelled, seeded for reproducibility)
python -m src.data_generation.generate_dataset

# Start the FastAPI server (trains both ML modules on startup, ~10–20s cold boot)
uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

> **API documentation** is auto-generated at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) (Swagger UI) and [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc) (ReDoc).

### 3. Start Next.js Dashboard

```bash
cd "hail mary"
npm install
npm run dev
# Dashboard opens at http://localhost:3000
```

### Environment Variables

| Variable | Default | Location |
|:---|:---|:---|
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | `hail mary/apps/web/.env.local` |
| `NEXT_PUBLIC_WS_URL` | `ws://127.0.0.1:8000` | `hail mary/apps/web/.env.local` |

### 4. Run Tests

```bash
# Full test suite
pytest tests/ -v

# Sanity check — obvious defect detection validation
python test_obvious.py

# Physics validation — Arrhenius trajectory verification
python validate_physics.py
```

---

## Tech Stack

| Layer | Technology | Why |
|:---|:---|:---|
| **ML — Anomaly** | scikit-learn `IsolationForest` | Per-lot unsupervised detection; no label dependency at inference time |
| **ML — Regression** | `xgboost >= 2.0` | Captures non-linear interaction between lot-relative deviations and raw slope that linear models miss |
| **ML — Baseline** | scikit-learn `LinearRegression` | Explicit comparison — proves XGBoost's gain is not an artifact of feature engineering |
| **Explainability** | `shap >= 0.43` TreeExplainer | Exact, additive per-feature attributions; traces every prediction to physical bench measurements |
| **Data** | `pandas >= 2.0`, `numpy >= 1.24` | Standard tabular data pipeline |
| **API** | `FastAPI >= 0.100`, `uvicorn >= 0.23` | Async-native; WebSocket support for sensor stream; auto-generated OpenAPI docs |
| **Frontend** | Next.js 16, React 19, TypeScript | App Router; server-side rendering; Turbopack for sub-second hot reload |
| **Charts** | `@visx/shape`, custom `@workspace/ui` charts | Trajectory envelopes, live streaming charts, animated gauge components |
| **Animations** | `framer-motion 13`, `@number-flow/react` | Staggered page transitions, animated metric counters, progressive disclosure |
| **Monorepo** | Turborepo 2 | Shared UI package across apps; parallel builds |
| **Testing** | `pytest >= 7.4` | Unit tests for outlier detection, drift prediction, and API endpoints |

---

## Project Structure

```
SIH - 2026/
│
├── api/                              # FastAPI backend
│   ├── main.py                       # App entry point; router registration; CORS config
│   ├── dependencies.py               # load_system() — singleton ML pipeline loader
│   └── routers/
│       ├── lots.py                   # GET /api/lots/, GET /api/lots/{lot_id}
│       ├── components.py             # GET /api/components/{id} — QA report + trajectories
│       ├── simulation.py             # POST /api/simulate/ — ad-hoc prediction + SHAP
│       ├── evaluation.py             # GET /api/evaluation/ — aggregate metrics report
│       └── streaming.py              # WS /ws/sensor-stream — live trajectory replay
│
├── src/                              # ML pipeline source code
│   ├── data_generation/
│   │   ├── generate_dataset.py       # Arrhenius-based synthetic burn-in data generator
│   │   └── visualize_trajectories.py # Trajectory plotting utilities
│   ├── outlier_detection/
│   │   └── detector.py               # Module A: MAD Z-score + Isolation Forest ensemble
│   ├── drift_prediction/
│   │   ├── predictor.py              # Module B: XGBoost regressor + safety-slope logic
│   │   └── run_evaluation.py         # Standalone evaluation runner
│   ├── explainability/
│   │   └── explainer.py              # SHAP TreeExplainer + rule-based QA report generator
│   └── evaluation/
│       └── evaluate.py               # F2, MAE, per-class metrics; generates results/metrics.md
│
├── hail mary/                        # Turborepo monorepo
│   ├── apps/web/                     # Next.js 16 dashboard
│   │   ├── app/
│   │   │   ├── page.tsx              # / — Lot overview with scatter plots
│   │   │   ├── components/
│   │   │   │   ├── page.tsx          # /components — Component listing
│   │   │   │   └── [id]/page.tsx     # /components/[id] — Deep-dive QA report
│   │   │   ├── simulator/page.tsx    # /simulator — Interactive prediction with SHAP
│   │   │   ├── monitor/page.tsx      # /monitor — Live WebSocket sensor charts
│   │   │   └── evaluation/page.tsx   # /evaluation — Auto-generated metrics dashboard
│   │   └── components/
│   │       ├── charts/               # 60+ custom chart components (line, scatter, gauge, etc.)
│   │       ├── header.tsx            # App header with navigation
│   │       └── sidebar.tsx           # App sidebar with route links
│   └── packages/
│       └── ui/                       # Shared UI component library
│
├── data/generated/                   # Synthetic dataset (generated, .gitignored)
│   ├── burnin_measurements.csv       # 38,018 components × 4 timepoints × 2 parameters
│   ├── burnin_labels.csv             # Ground-truth defect labels per component
│   └── datasheet_limits.json         # Static limits (50 µA leakage, 18 ns delay)
│
├── docs/                             # Project documentation
│   ├── DOCUMENTATION.md              # ⬅ Full technical documentation (see below)
│   ├── project_report.md             # Comprehensive project report
│   ├── data_generation_rationale.md  # Physics justification for synthetic data
│   ├── known_limitations.md          # Honest constraint disclosure
│   ├── sample_qa_report.md           # Example QA report for LOT_008_C0130
│   ├── judge_faq.md                  # Anticipated judge questions with answers
│   └── evaluation/                   # Per-person presentation preparation sheets
│       ├── doc1_metrics.md           # Person 1: Metrics & evaluation strategy
│       ├── doc2_hardware_physics.md  # Person 2: Burn-in physics & Arrhenius model
│       ├── doc3_module_a_outlier.md  # Person 3: Outlier detection deep-dive
│       ├── doc4_module_b_drift.md    # Person 4: Drift prediction & SHAP
│       ├── doc5_frontend.md          # Person 5: Dashboard UI walkthrough
│       └── doc6_backend.md           # Person 6: Backend architecture & API
│
├── results/
│   └── metrics.md                    # Auto-generated evaluation report
│
├── tests/                            # Pytest test suite
│   ├── test_outlier_detection.py     # Module A unit tests
│   ├── test_drift_prediction.py      # Module B unit tests
│   └── api/                          # API endpoint tests
│
├── test_obvious.py                   # Sanity check: obvious defect detection
├── validate_physics.py               # Arrhenius trajectory validation
├── requirements.txt                  # Python dependencies
└── README.md                         # ⬅ You are here
```

---

## Documentation

> **📖 Full technical documentation is at [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)**

The documentation suite is organized for different audiences:

| Document | Audience | Description |
|:---|:---|:---|
| **[`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)** | Evaluators & Developers | Complete technical reference — architecture, algorithms, API, physics, and deployment |
| [`docs/project_report.md`](docs/project_report.md) | Judges | Formal project report covering problem, approach, results, and limitations |
| [`docs/data_generation_rationale.md`](docs/data_generation_rationale.md) | Technical reviewers | Physics justification for synthetic data (Arrhenius, JEDEC standards) |
| [`docs/known_limitations.md`](docs/known_limitations.md) | Everyone | Honest constraint disclosure — what we can and cannot do |
| [`docs/sample_qa_report.md`](docs/sample_qa_report.md) | QA Engineers | Example AI-generated inspection report with full SHAP breakdown |
| [`docs/judge_faq.md`](docs/judge_faq.md) | Judges | Pre-emptive answers to anticipated evaluation questions |
| [`docs/evaluation/`](docs/evaluation/) | Team members | Per-person preparation sheets for the live presentation |
| [`results/metrics.md`](results/metrics.md) | Everyone | Auto-generated evaluation metrics (F2, MAE, safety-slope, explainability rubric) |
| `http://127.0.0.1:8000/docs` | Developers | Auto-generated Swagger/OpenAPI documentation (when backend is running) |

---

## What Makes This Different

### 1. Cohort-Relative Detection with Provenance

Module A doesn't ask "is this below 50 µA?" — it asks "is this component unusual compared to the 300 other components manufactured in the same factory run at the same time?" Every flag records _which_ method fired (MAD Z-score or Isolation Forest), the specific parameter, timepoint, measured value, lot median, and σ distance — every rejection reason is auditable.

### 2. Strict No-Leakage Feature Design

Module B explicitly blocks `value_96h` and `value_168h` from the feature matrix via `_FORBIDDEN_FEATURES`. The 24-hour early-rejection goal is **architectural** — it cannot be accidentally invalidated by a refactor.

### 3. Per-Lot Models, Not Global

Both `OutlierDetector` and `DriftPredictor` fit separate models per manufacturing lot. Lot-to-lot baseline variance is isolated rather than averaged away — each component is scored against its own cohort.

### 4. Residual-as-Signal Design

Latent defects the model _cannot_ predict (activation energy above the 24h mark) produce large prediction residuals. Rather than treating this as model failure, the design documents it as a **complementary detection signal** — components with unexpectedly large MAE are themselves suspect.

### 5. SHAP-Backed, Regulation-Ready Explainability

Every screening decision decomposes into additive SHAP feature contributions. Each value maps to a physical measurement a QA engineer can verify on the bench. In regulated industries (automotive, aerospace, medical devices), unexplainable screening decisions are unacceptable — SHAP provides the audit trail required for ISO 9001 / IATF 16949 compliance.

---

## API Reference

| Method | Endpoint | Description |
|:---:|:---|:---|
| `GET` | `/api/lots/` | List all manufacturing lots with aggregate statistics |
| `GET` | `/api/lots/{lot_id}` | Detailed lot info with component list |
| `GET` | `/api/components/{component_id}` | Full QA report: trajectory, anomaly detection, drift prediction, SHAP, verdict |
| `POST` | `/api/simulate/` | Ad-hoc prediction: provide 0h/24h readings → get 168h prediction + SHAP + safety-slope |
| `GET` | `/api/evaluation/` | Aggregate metrics report (F2, MAE, per-class breakdowns) |
| `WS` | `/ws/sensor-stream` | Real-time WebSocket stream of burn-in sensor data (1 Hz) |
| `GET` | `/api/streaming/components/{lot_id}` | List available components for streaming in a lot |

> Full interactive API documentation with request/response schemas is available at **[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)** when the backend is running.

---

## Dashboard Pages

| Route | Page | Description |
|:---|:---|:---|
| `/` | **Lot Overview** | All manufacturing lots with color-coded defect rates; scatter plot visualization; click any component to deep-dive |
| `/components/[id]` | **Component Deep-Dive** | Trajectory charts with ±2 MAD batch envelope; Module A anomaly gauge; Module B drift gauge; SHAP feature breakdown; accept/reject/review verdict |
| `/simulator` | **Rejection Simulator** | Input arbitrary 0h/24h readings; see predicted 168h value, implied drift rate, animated gauges, and full SHAP waterfall in real-time |
| `/monitor` | **Live Sensor Monitor** | WebSocket-connected real-time charts showing leakage current and propagation delay streaming at 1 Hz; threshold indicators; connection status |
| `/evaluation` | **Evaluation Report** | Auto-generated metrics dashboard with animated counters, progress bars, per-lot detection rates, and prediction accuracy tables |

---

## Challenges & Lessons Learned

**The fundamental physics constraint:** The most dangerous defects — those whose activation energy exceeds 24 hours of thermal stress — are by definition invisible in the 0h/24h feature space. Predicting their 168h divergence is information-theoretically impossible from early data alone. Rather than tuning around this, the design documents it explicitly and treats the large prediction residual as a complementary flag, not a model failure.

**Per-lot model scaling:** Per-lot model fitting means training N separate XGBoost and Isolation Forest instances at startup. The `load_system()` singleton in `api/dependencies.py` avoids re-training per request, but cold-boot latency scales linearly with lot count — a real constraint for large production datasets.

**Threshold tuning is domain-dependent:** The MAD safety factor (1.4826) and safety-slope N=3 threshold are statistical heuristics. The correct N is a function of the business cost ratio between false rejections and false passes — a value that cannot be set without domain input from the specific application (automotive vs. aerospace vs. consumer).

---

## Known Limitations

> Full disclosure is at [`docs/known_limitations.md`](docs/known_limitations.md)

| Limitation | Impact | Mitigation Path |
|:---|:---|:---|
| Synthetic data | Does not capture electromigration, HCI logarithmic degradation, or intermittent faults | Validate on real STDF data from foundry partner |
| Safety-slope N=3 is arbitrary | Optimal N depends on business cost ratio (false reject vs. false pass) | Bayesian adaptive threshold with domain expert input |
| 24h prediction is information-limited | 63% of latent defects have no detectable signal at 24h | Residual-as-signal design; complementary to (not replacement for) full burn-in |
| Explainability rubric is structural | Checks presence, not semantic quality of explanations | Production system should include Likert-scale human evaluation |

---

## Future Roadmap

- **Adaptive N-sigma thresholds** — Bayesian updating: tighten as lot history accumulates, widen for new product families with sparse data
- **STDF ingestion layer** — ETL from Advantest/Teradyne Standard Test Data Format files, connecting directly to real ATE output
- **Online model retraining** — Background retraining trigger on new-lot arrival for incremental learning without server restart
- **Additional failure mode generators** — Black's equation (electromigration), logarithmic HCI, stochastic intermittent faults
- **Human-in-the-loop evaluation** — Likert-scale interface for domain experts to rate explanation quality beyond structural rubric

---

## Running the Full Evaluation Pipeline

```bash
# 1. Generate dataset (if not already generated)
python -m src.data_generation.generate_dataset

# 2. Run the evaluation to generate results/metrics.md
python -m src.evaluation.evaluate

# 3. Validate physics (Arrhenius trajectory verification)
python validate_physics.py

# 4. Run test suite
pytest tests/ -v

# 5. Start both servers
uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
cd "hail mary" && npm run dev
```

---

## Team

<!-- TODO: add team members -->

| Name | Role | Link |
|:---|:---|:---|
| — | — | — |

---

<p align="center">
  <em>Built for SIH 2026 — Smart India Hackathon</em><br/>
  <sub>Designed for ISRO-grade component qualification. Every decision is traceable. Every flag is explainable.</sub>
</p>
