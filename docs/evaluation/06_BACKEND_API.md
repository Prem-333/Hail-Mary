# Doc 6 — Backend & API Architecture
### Person 6 Preparation Sheet | SIH 2026 · LATENT

> **Your job in the presentation:** Explain how the FastAPI backend wires
> together data, ML models, and the frontend — and why each technology choice
> was made deliberately.

---

## 1. Tech Stack

| Technology | Version | Why We Chose It |
|------------|---------|----------------|
| **FastAPI** | 0.100+ | Async-native, auto-generates OpenAPI docs, 2–3× faster than Flask for model inference |
| **Uvicorn** | Latest | ASGI server — needed for WebSocket support (synchronous WSGI servers like Gunicorn can't do this) |
| **XGBoost** | Latest | GPU-optional, extremely fast inference (sub-millisecond for 5 features) |
| **Scikit-Learn** | Latest | Isolation Forest implementation; industry-standard, well-tested |
| **SHAP** | Latest | Only library providing game-theoretically exact feature attributions for tree models |
| **Joblib** | Latest | Serializes trained ML models to disk; loads them once at startup |
| **Pandas + NumPy** | Latest | Data wrangling before passing to ML models |
| **Pydantic** | V2 | Request/response validation — every API input is type-checked automatically |

**Backend Location:** `api/`  
**Start Command:** `uvicorn main:app --reload --port 8000` from the `api/` directory  
**API Docs:** `http://localhost:8000/docs` (auto-generated Swagger UI)

---

## 2. Project Structure

```
api/
├── main.py              # FastAPI app initialization, router registration, CORS
├── dependencies.py      # Startup: loads ML models and data into memory once
└── routers/
    ├── lots.py          # GET /api/lots/ — list all lots
    ├── components.py    # GET /api/components/{id} — deep-dive for one component
    ├── simulation.py    # POST /api/simulate/ — live prediction with SHAP
    ├── streaming.py     # WS /api/stream/{lot_id} — WebSocket live telemetry
    └── evaluation.py    # GET /api/evaluation/ — serve metrics.md report
```

---

## 3. Startup — The Dependency System

**File:** `api/dependencies.py`

When the FastAPI server starts, it loads everything into memory **once**. This
is critical for performance — loading XGBoost models from disk takes ~200ms.
If we did it on every request, the API would be unusably slow.

```python
# Pseudocode of what happens at startup:
measurements_df = load_csv("data/measurements.csv")
labels_df = load_csv("data/labels.csv")

detector = OutlierDetector(z_threshold=3.5, contamination=0.05)
anomaly_results = detector.detect(measurements_df)

predictor = DriftPredictor(safety_slope_n_sigma=3.0)
predictor.fit(measurements_df)
drift_results = predictor.flag_for_rejection(measurements_df)

shap_explainers = load_shap_explainers_from_predictor(predictor)
```

All of these objects are stored in a dictionary called `system` and injected into
every router via FastAPI's `Depends(get_system)` mechanism.

**When a judge asks "how fast is the API?"**
- Model inference: **< 1 ms** (models are already in RAM)
- Full deep-dive endpoint (including SHAP): **< 50 ms**
- Streaming WebSocket: **1 Hz**, real-time

---

## 4. The Key API Endpoints

### GET `/api/lots/`
Returns a list of all manufacturing lots with aggregate statistics.

```json
[
  {
    "lot_id": "LOT_021",
    "total_components": 312,
    "anomalous_count": 24,
    "defect_rate": 0.077,
    "lot_median_leakage": 15.3
  },
  ...
]
```

---

### GET `/api/components/{component_id}`
The most complex endpoint. Returns everything needed for the deep-dive page.

```json
{
  "component_id": "LOT_021_C0378",
  "lot_id": "LOT_021",
  "defect_type": "latent",
  "report": {
    "recommendation": "REJECT",
    "recommendation_text": "Component shows ...",
    "anomaly": {
      "is_anomalous": true,
      "anomaly_score": 28.91,
      "justification": "Leakage current at 0h is 28.9 standard deviations..."
    },
    "drift": {
      "flagged_for_rejection": false,
      "per_parameter": {
        "leakage_current_uA": {
          "predicted_168h_xgb": 34.2,
          "implied_drift": 0.000813,
          "safety_slope": 0.000952,
          "drift_ratio": 0.85
        }
      }
    }
  },
  "trajectories": {
    "leakage_current_uA": {
      "values": [15.1, 15.4, 16.0, 16.8],
      "envelope": {
        "meds": [15.0, 15.2, 15.6, 16.1],
        "lo": [13.5, 13.7, 14.0, 14.5],
        "hi": [16.5, 16.7, 17.1, 17.6]
      }
    }
  }
}
```

---

### POST `/api/simulate/`
Accepts 0h and 24h readings, runs both ML models + SHAP, returns prediction.

**Request:**
```json
{
  "lot_id": "LOT_021",
  "leak_0h": 17.0,
  "leak_24h": 17.2,
  "delay_0h": 8.0,
  "delay_24h": 8.04
}
```

**Response (simplified):**
```json
{
  "status": "success",
  "is_flagged": false,
  "results": {
    "leakage_current_uA": {
      "predicted_168h": 18.1,
      "implied_drift": 0.000655,
      "threshold": 0.000952
    }
  },
  "shap": {
    "leakage_current_uA": {
      "base_value": 17.2,
      "features": [
        {"feature": "value_24h", "value": 0.42},
        {"feature": "early_slope", "value": 0.31}
      ]
    }
  }
}
```

---

### WebSocket `/api/stream/{lot_id}`
**File:** `api/routers/streaming.py`

This endpoint simulates a real-time hardware sensor stream from a burn-in oven.

How it works:
1. Client connects via WebSocket (the browser's built-in `WebSocket` API)
2. Every second, the backend sends a JSON message with updated sensor readings
   for all components in the selected lot
3. The frontend updates the live chart in real-time

```python
@router.websocket("/api/stream/{lot_id}")
async def stream_lot(websocket: WebSocket, lot_id: str):
    await websocket.accept()
    while True:
        data = generate_realtime_reading(lot_id)
        await websocket.send_json(data)
        await asyncio.sleep(1.0)  # 1 Hz
```

**Why WebSockets and not REST polling?** REST would require the browser to send
a new HTTP request every second. WebSockets maintain a persistent, bi-directional
connection — far lower latency and no HTTP overhead for streaming data.

---

## 5. Score Fusion Logic — Where the Verdict Is Made

The verdict (ACCEPT / REJECT / MANUAL REVIEW) is computed in the `components.py`
router, not in the ML models themselves. This is important — the ML models output
numbers; the router applies the business rules.

```python
# Simplified fusion logic in components.py:
is_anomalous = anomaly_result.is_anomalous
is_drift_flagged = drift_result.flagged_for_rejection

if is_anomalous and is_drift_flagged:
    recommendation = "REJECT"
elif is_anomalous or is_drift_flagged:
    recommendation = "MANUAL REVIEW"
else:
    recommendation = "ACCEPT"
```

---

## 6. CORS Configuration

The backend explicitly allows cross-origin requests from the frontend at
`http://localhost:3000`. Without this, the browser would block all API calls
for security reasons.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 7. Soundbites for Judges

- *"We chose FastAPI over Flask because FastAPI is async-native — it can handle
  WebSocket streaming AND serve REST endpoints simultaneously on the same thread,
  which is impossible with synchronous Flask."*
- *"All ML models are loaded once at server startup via FastAPI's dependency
  injection system. The inference latency for a full deep-dive (both models +
  SHAP) is under 50 milliseconds."*
- *"The WebSocket streaming endpoint simulates what a production system with a
  real MQTT hardware stream would look like. Swapping it for real hardware is
  a one-line change to the data source."*
- *"The API auto-generates Swagger documentation at /docs. Every judge can open
  it, read the exact schema of every endpoint, and run live API calls directly
  from the browser."*
