from fastapi import APIRouter, Depends
from backend.dependencies import get_system
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

    # -------------------------------------------------------------------------
    # "Safe to End Burn-In" — Module B confidence analysis
    # A component is clearable at 24h if:
    #   1. Module A: not flagged as anomalous (outlier detector passed)
    #   2. Module B: not flagged for rejection by drift predictor
    # -------------------------------------------------------------------------
    flags = system["flags"]  # per-component drift rejection flags
    lot_flags = flags[flags["lot_id"] == lot_id][["component_id", "flagged_for_rejection"]].copy()

    # All components in this lot that are clean on BOTH modules
    clean_module_a = set(lot_outlier[lot_outlier["is_anomalous"] == 0]["component_id"].tolist())
    if not lot_flags.empty:
        clean_module_b = set(lot_flags[lot_flags["flagged_for_rejection"] == False]["component_id"].tolist())
        clearable_ids = list(clean_module_a & clean_module_b)
        dual_clean_count = len(clearable_ids)
        # Confidence: fraction of non-anomalous that also pass Module B
        confidence = (dual_clean_count / len(clean_module_a)) if clean_module_a else 0.0
    else:
        # Fallback: use Module A only
        clearable_ids = list(clean_module_a)
        dual_clean_count = len(clearable_ids)
        confidence = 1.0 if dual_clean_count == total else float(dual_clean_count) / total

    # Time math: burn-in runs 168h total; Module B decides at 24h -> 144h saved per component
    HOURS_REMAINING = 144  # 168h total - 24h already elapsed
    hours_saved = dual_clean_count * HOURS_REMAINING
    # Lot is fully clearable only when zero anomalies AND Module B gives the all-clear
    is_lot_fully_clear = (flagged == 0) and (dual_clean_count == total)

    burn_in_savings = {
        "clearable_count": dual_clean_count,
        "total_count": total,
        "hours_saved": hours_saved,
        "hours_remaining_per_component": HOURS_REMAINING,
        "confidence": round(confidence, 4),
        "is_lot_fully_clear": is_lot_fully_clear,
        "flagged_count": flagged,
    }

    return {
        "metrics": {
            "total": total,
            "flagged": flagged,
            "latent": latent,
            "obvious": obvious
        },
        "burn_in_savings": burn_in_savings,
        "components": components_data
    }
