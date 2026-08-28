from fastapi import APIRouter, Depends
from api.dependencies import get_system
import json

router = APIRouter(prefix="/api/lots", tags=["Lots"])

@router.get("/")
def get_lots(system=Depends(get_system)):
    measurements = system["measurements"]
    lots = sorted(measurements["lot_id"].unique().tolist())
    return {"lots": lots}

@router.get("/{lot_id}")
def get_lot_details(lot_id: str, system=Depends(get_system)):
    outlier_results = system["outlier_results"]
    labels = system["labels"]
    
    lot_outlier = outlier_results[outlier_results["lot_id"] == lot_id].copy()
    lot_outlier = lot_outlier.merge(
        labels[["component_id", "defect_type"]], on="component_id"
    )
    lot_outlier = lot_outlier.sort_values("anomaly_score", ascending=False).reset_index(drop=True)
    
    # Fill NaN to allow JSON serialization
    lot_outlier = lot_outlier.fillna(0)
    
    measurements = system["measurements"]
    lot_meas = measurements[measurements["lot_id"] == lot_id].copy()
    lot_meas["median_val"] = lot_meas[["value_0h", "value_24h", "value_96h", "value_168h"]].median(axis=1)
    
    leakage = lot_meas[lot_meas["param_name"] == "leakage_current_uA"][["component_id", "median_val"]].rename(columns={"median_val": "leakage_median"})
    delay = lot_meas[lot_meas["param_name"] == "propagation_delay_ns"][["component_id", "median_val"]].rename(columns={"median_val": "delay_median"})
    
    lot_outlier = lot_outlier.merge(leakage, on="component_id", how="left")
    lot_outlier = lot_outlier.merge(delay, on="component_id", how="left")
    
    total = len(lot_outlier)
    flagged = int(lot_outlier["is_anomalous"].sum())
    latent = int((lot_outlier["defect_type"] == "latent").sum())
    obvious = int((lot_outlier["defect_type"] == "obvious").sum())
    
    # Convert to dict and handle numpy types by parsing json
    components_data = json.loads(lot_outlier.to_json(orient="records"))
    
    return {
        "metrics": {
            "total": total,
            "flagged": flagged,
            "latent": latent,
            "obvious": obvious
        },
        "components": components_data
    }
