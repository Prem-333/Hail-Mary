from fastapi import APIRouter, Depends
from pydantic import BaseModel
from api.dependencies import get_system
import pandas as pd
import numpy as np
import json
from src.drift_prediction.predictor import FEATURE_NAMES

router = APIRouter(prefix="/api/simulate", tags=["Simulation"])

class SimulateRequest(BaseModel):
    lot_id: str
    leak_0h: float
    leak_24h: float
    delay_0h: float
    delay_24h: float

@router.post("/")
def simulate_component(req: SimulateRequest, system=Depends(get_system)):
    predictor = system["predictor"]
    
    sim_data = pd.DataFrame([
        {"lot_id": req.lot_id, "component_id": "SIM_INPUT",
         "param_name": "leakage_current_uA",
         "value_0h": req.leak_0h, "value_24h": req.leak_24h,
         "value_96h": 0.0, "value_168h": 0.0},
        {"lot_id": req.lot_id, "component_id": "SIM_INPUT",
         "param_name": "propagation_delay_ns",
         "value_0h": req.delay_0h, "value_24h": req.delay_24h,
         "value_96h": 0.0, "value_168h": 0.0},
    ])
    
    preds = predictor.predict(sim_data)
    flags = predictor.flag_for_rejection(sim_data)
    safety_slopes = predictor._compute_safety_slopes()
    
    is_flagged = bool(flags.iloc[0]["flagged_for_rejection"]) if not flags.empty else False
    
    results = {}
    shap_results = {}
    
    for param in ["leakage_current_uA", "propagation_delay_ns"]:
        pred_row = preds[preds["param_name"] == param]
        if pred_row.empty: continue
        
        pred_val = float(pred_row.iloc[0]["predicted_168h_xgb"])
        v0 = float(pred_row.iloc[0]["value_0h"])
        implied_drift = float((pred_val - v0) / 168.0)
        threshold = float(safety_slopes.get(req.lot_id, {}).get(param, 0.1))
        
        results[param] = {
            "predicted_168h": pred_val,
            "implied_drift": implied_drift,
            "threshold": threshold,
            "is_flagged": bool(is_flagged)
        }
        
        # SHAP
        param_data = sim_data[sim_data["param_name"] == param]
        X = predictor._engineer_features(param_data, param)
        explainer_shap = system["shap_explainers"][param]
        sv = explainer_shap.shap_values(X.values)
        base_val = explainer_shap.expected_value
        if not np.isscalar(base_val):
            base_val = float(np.asarray(base_val).flat[0])
        else:
            base_val = float(base_val)
        sv_row = sv[0] if sv.ndim > 1 else sv
        
        shap_features = [{"feature": f, "value": float(sv_row[i])} for i, f in enumerate(FEATURE_NAMES)]
        
        shap_results[param] = {
            "base_value": base_val,
            "features": shap_features
        }
        
    return {
        "status": "success",
        "is_flagged": is_flagged,
        "results": results,
        "shap": shap_results
    }
