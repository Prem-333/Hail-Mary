"""
Real-time sensor streaming via WebSocket.

Reads actual burn-in measurement data from the loaded system state and
replays it as a continuous time-series stream. Between the real measurement
timepoints (0h, 24h, 96h, 168h), values are linearly interpolated with
small Gaussian noise to simulate live sensor readings.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from api.dependencies import get_system
import asyncio
import json
import time
import random
import numpy as np

router = APIRouter(tags=["Streaming"])


def _interpolate_trajectory(values: list[float], timepoints: list[float],
                            steps_between: int = 10, noise_scale: float = 0.02):
    """
    Given 4 real measurements at timepoints [0, 24, 96, 168],
    produce a smooth interpolated stream with small noise.
    Returns list of (relative_time_in_hours, value) tuples.
    """
    result = []
    for i in range(len(timepoints) - 1):
        t0, t1 = timepoints[i], timepoints[i + 1]
        v0, v1 = values[i], values[i + 1]
        for step in range(steps_between):
            frac = step / steps_between
            t = t0 + (t1 - t0) * frac
            v = v0 + (v1 - v0) * frac
            # Add small realistic noise proportional to the value
            noise = np.random.normal(0, abs(v) * noise_scale)
            result.append((t, v + noise))
    # Add final point
    result.append((timepoints[-1], values[-1]))
    return result


@router.websocket("/ws/sensor-stream")
async def sensor_stream(websocket: WebSocket):
    await websocket.accept()

    system = get_system()
    measurements = system["measurements"]
    labels = system["labels"]

    try:
        # Wait for initial configuration message from client
        init_msg = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        config = json.loads(init_msg)
        lot_id = config.get("lot_id", None)
        component_id = config.get("component_id", None)

        # If no lot specified, pick a random one
        lots = sorted(measurements["lot_id"].unique().tolist())
        if not lot_id or lot_id not in lots:
            lot_id = random.choice(lots)

        lot_data = measurements[measurements["lot_id"] == lot_id]

        # If no component specified, pick a random one from the lot
        components = lot_data["component_id"].unique().tolist()
        if not component_id or component_id not in components:
            component_id = random.choice(components)

        comp_data = lot_data[lot_data["component_id"] == component_id]

        # Get the defect type for context
        label_row = labels[labels["component_id"] == component_id]
        defect_type = str(label_row.iloc[0]["defect_type"]) if not label_row.empty else "unknown"

        # Build interpolated trajectories for both parameters
        timepoints = [0.0, 24.0, 96.0, 168.0]
        trajectories = {}

        for param in ["leakage_current_uA", "propagation_delay_ns"]:
            param_data = comp_data[comp_data["param_name"] == param]
            if param_data.empty:
                continue
            row = param_data.iloc[0]
            values = [float(row[f"value_{t}h"]) for t in [0, 24, 96, 168]]
            trajectories[param] = _interpolate_trajectory(
                values, timepoints, steps_between=12, noise_scale=0.005
            )

        # Send initial metadata
        await websocket.send_json({
            "type": "init",
            "lot_id": lot_id,
            "component_id": component_id,
            "defect_type": defect_type,
            "available_lots": lots,
            "available_components": components,
        })

        # Stream the interpolated data points
        base_time = time.time()
        leak_points = trajectories.get("leakage_current_uA", [])
        delay_points = trajectories.get("propagation_delay_ns", [])
        max_points = max(len(leak_points), len(delay_points))

        idx = 0
        while True:
            if idx >= max_points:
                # Loop back to continue streaming (cycle the data)
                idx = 0
                base_time = time.time()

            point = {
                "type": "data",
                "time": time.time(),
                "index": idx,
                "burn_in_hour": round(leak_points[idx][0], 2) if idx < len(leak_points) else 0,
            }

            if idx < len(leak_points):
                point["leakage"] = round(leak_points[idx][1], 4)
            if idx < len(delay_points):
                point["delay"] = round(delay_points[idx][1], 4)

            await websocket.send_json(point)
            idx += 1

            # ~1 point per second for a nice streaming effect
            await asyncio.sleep(1.0)

    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="No init message received")
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close(code=1011)
        except Exception:
            pass


@router.get("/api/streaming/components/{lot_id}")
def get_streamable_components(lot_id: str, system=Depends(get_system)):
    """Get the list of components available for streaming in a lot."""
    measurements = system["measurements"]
    labels = system["labels"]

    lot_data = measurements[measurements["lot_id"] == lot_id]
    component_ids = sorted(lot_data["component_id"].unique().tolist())

    # Enrich with defect type
    components = []
    for cid in component_ids:
        label_row = labels[labels["component_id"] == cid]
        defect_type = str(label_row.iloc[0]["defect_type"]) if not label_row.empty else "unknown"
        components.append({"component_id": cid, "defect_type": defect_type})

    return {"lot_id": lot_id, "components": components}
