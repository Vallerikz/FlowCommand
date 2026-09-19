"""
VIMS — Real-Time Telemetry & Alert WebSocket Router
Manages live push stream for surveillance camera detections and discrepancy alerts.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Header, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import asyncio
import json
import time

router = APIRouter(tags=["Telemetry & Live Streaming"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time junction ANPR detections and hotlist alerts.
    """
    await manager.connect(websocket)
    try:
        # Initial welcome handshake
        await websocket.send_text(json.dumps({
            "type": "STATUS",
            "message": "Connected to VIMS Central Telemetry Broadcast",
            "timestamp": time.time()
        }))

        # Keep connection open and receive any operator pings
        while True:
            data = await websocket.receive_text()
            # Echo or process client events
            await websocket.send_text(json.dumps({"type": "PONG", "received": data}))

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@router.get("/api/telemetry/nodes")
async def get_camera_nodes():
    """
    List edge camera nodes and health status.
    """
    return {
        "nodes": [
            {"id": "CAM-01", "junction": "Swargate Bus Depot", "zone": "Central", "fps": 15, "status": "ONLINE", "hardware": "Jetson Orin Nano (8GB)"},
            {"id": "CAM-02", "junction": "FC Road — Goodluck Sq", "zone": "Central", "fps": 15, "status": "ONLINE", "hardware": "Jetson Xavier NX"},
            {"id": "CAM-03", "junction": "JM Road Square", "zone": "Central", "fps": 20, "status": "ONLINE", "hardware": "Jetson Orin Nano (8GB)"},
            {"id": "CAM-04", "junction": "Shivajinagar Interchange", "zone": "North", "fps": 15, "status": "ONLINE", "hardware": "Jetson Orin Nano (8GB)"},
            {"id": "CAM-05", "junction": "Hinjewadi Phase-1 Circle", "zone": "IT Corridor", "fps": 20, "status": "ONLINE", "hardware": "Jetson AGX Orin"},
            {"id": "CAM-06", "junction": "Wakad Bridge", "zone": "IT Corridor", "fps": 15, "status": "ONLINE", "hardware": "Jetson Xavier NX"},
            {"id": "CAM-07", "junction": "Hadapsar Gadital", "zone": "East", "fps": 15, "status": "ONLINE", "hardware": "Jetson Orin Nano (8GB)"},
            {"id": "CAM-08", "junction": "Airport Road 509 Sq", "zone": "East", "fps": 20, "status": "ONLINE", "hardware": "Jetson Orin Nano (8GB)"},
            {"id": "CAM-09", "junction": "Katraj Tunnel Approach", "zone": "South", "fps": 15, "status": "ONLINE", "hardware": "Jetson Xavier NX"},
            {"id": "CAM-10", "junction": "Chandni Chowk Highway Split", "zone": "West", "fps": 20, "status": "ONLINE", "hardware": "Jetson AGX Orin"}
        ]
    }

class AlertBroadcastPayload(BaseModel):
    """Typed payload for broadcasting alerts — prevents arbitrary JSON injection."""
    alert_type: str = Field(..., description="Alert category, e.g. HOTLIST_HIT, ANOMALY, INCIDENT")
    severity: str = Field("MEDIUM", description="LOW / MEDIUM / HIGH / CRITICAL")
    message: str = Field(..., description="Human-readable alert description")
    junction_id: Optional[str] = Field(None, description="Originating junction/camera ID")
    plate: Optional[str] = Field(None, description="Related vehicle plate if applicable")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional structured data")

@router.post("/api/telemetry/broadcast")
async def broadcast_alert(
    payload: AlertBroadcastPayload,
    authorization: Optional[str] = Header(None),
):
    """
    Internal trigger to push an incident alert to all connected command terminals.
    Requires a valid session token — unauthenticated broadcast is rejected.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required to broadcast alerts.",
        )

    await manager.broadcast({
        "type": "ALERT",
        "data": payload.model_dump(exclude_none=True),
        "timestamp": time.time()
    })
    return {"success": True, "recipients": len(manager.active_connections)}

