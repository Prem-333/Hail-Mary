from fastapi import APIRouter, Depends, HTTPException
from api.dependencies import get_system
import numpy as np

router = APIRouter(prefix="/api/components", tags=["Components"])

@router.get("/{component_id}")
def get_component_details(component_id: str, system=Depends(get_system)):
    labels = system["labels"]
    explainer = system["explainer"]
    measurements = system["measurements"]
    
    label_row = labels[labels["component_id"] == component_id]
    defect_type = str(label_row.iloc[0]["defect_type"]) if not label_row.empty else "unknown"
    
    try:
        report = explainer.generate_qa_report(component_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Report failed: {e}")

    # Generate envelope for trajectory charts
    comp_data = measurements[measurements["component_id"] == component_id]
    if comp_data.empty:
        raise HTTPException(status_code=404, detail="Component not found")
        
    lot_id = comp_data.iloc[0]["lot_id"]
    
    def get_envelope(param_name):
        ld = measurements[(measurements["lot_id"] == lot_id) & (measurements["param_name"] == param_name)]
        cols = ["value_0h", "value_24h", "value_96h", "value_168h"]
        meds, lo, hi = [], [], []
        for col in cols:
            v = ld[col].values
            med = float(np.median(v))
            mad = float(np.median(np.abs(v - med))) * 1.4826
            meds.append(med)
            lo.append(med - 2 * mad)
            hi.append(med + 2 * mad)
        return {"meds": meds, "lo": lo, "hi": hi}

    trajectories = {}
    for param in ["leakage_current_uA", "propagation_delay_ns"]:
        env = get_envelope(param)
        cd = comp_data[comp_data["param_name"] == param]
        if not cd.empty:
            vals = [float(cd.iloc[0][c]) for c in ["value_0h", "value_24h", "value_96h", "value_168h"]]
            trajectories[param] = {
                "values": vals,
                "envelope": env
            }

    # Handle nan/float32 in report
    import json
    def default_encode(obj):
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        raise TypeError
        
    safe_report = json.loads(json.dumps(report, default=default_encode))

    return {
        "component_id": component_id,
        "lot_id": lot_id,
        "defect_type": defect_type,
        "report": safe_report,
        "trajectories": trajectories
    }
