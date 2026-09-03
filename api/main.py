from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
from pathlib import Path

# Ensure project root is importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Import routers
from api.routers import lots, components, simulation, evaluation, streaming
from api.dependencies import load_system

app = FastAPI(
    title="LATENT \u2014 Burn-In Screening API",
    version="1.0.0",
    description=(
        "AI-powered burn-in screening and anomaly detection for ISRO spacecraft-grade "
        "semiconductor components. Cohort-relative outlier detection (MAD + Isolation Forest) "
        "and XGBoost drift prediction with SHAP explainability. Built for SIH 2026."
    ),
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load machine learning system on startup
@app.on_event("startup")
async def startup_event():
    load_system()

# Include routers
app.include_router(lots.router)
app.include_router(components.router)
app.include_router(simulation.router)
app.include_router(evaluation.router)
app.include_router(streaming.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Burn-In Screening API"}
