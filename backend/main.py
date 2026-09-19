from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
from pathlib import Path

# Ensure project root is importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Import routers
from backend.routers import lots, components, simulation, evaluation, streaming
from backend.dependencies import load_system


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_system()
    yield


app = FastAPI(
    title="LATENT \u2014 Burn-In Screening API",
    version="1.0.0",
    description=(
        "AI-powered burn-in screening and anomaly detection for ISRO spacecraft-grade "
        "semiconductor components. Cohort-relative outlier detection (MAD + Isolation Forest) "
        "and XGBoost drift prediction with SHAP explainability. Built for SIH 2026."
    ),
    lifespan=lifespan,
)

# Allow the deployed dashboard as well as local development.
# NOTE: allow_credentials cannot be combined with allow_origins=["*"] per CORS spec.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://latent-rose.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(lots.router)
app.include_router(components.router)
app.include_router(simulation.router)
app.include_router(evaluation.router)
app.include_router(streaming.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Burn-In Screening API"}
