from fastapi import APIRouter, Depends
from api.dependencies import get_system

router = APIRouter(prefix="/api/evaluation", tags=["Evaluation"])

@router.get("/")
def get_evaluation(system=Depends(get_system)):
    am = system["anomaly_metrics"]
    dm = system["drift_metrics"]
    
    # We must sanitize numpy types
    import json
    import numpy as np
    
    def default_encode(obj):
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        raise TypeError
        
    safe_am = json.loads(json.dumps(am, default=default_encode))
    safe_dm = json.loads(json.dumps(dm, default=default_encode))
    
    # Flags logic
    flags = system["flags"]
    labels = system["labels"]
    flags_merged = flags.merge(labels[["component_id", "defect_type"]], on="component_id")
    
    flag_stats = []
    for dtype in ["normal", "latent", "obvious"]:
        sub = flags_merged[flags_merged["defect_type"] == dtype]
        if sub.empty: continue
        n_flagged = int(sub["flagged_for_rejection"].sum())
        flag_stats.append({
            "class": dtype.title(),
            "total": len(sub),
            "flagged": n_flagged,
            "flag_rate": n_flagged / len(sub)
        })
        
    return {
        "anomaly_metrics": safe_am,
        "drift_metrics": safe_dm,
        "safety_slope": flag_stats
    }
