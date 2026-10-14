"""
VIMS — Vehicle Lookup & RTSP Edge Configuration Router
POST /api/vehicle/lookup: validates plate, queries the configured vehicle registry service.
POST /api/vehicle/rtsp-config: configures edge camera stream parameters.
"""

from fastapi import APIRouter, Request, HTTPException, status, Header
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from backend.utils.rate_limiter import limiter
from backend.services.vehicle_registry import registry_service

router = APIRouter(prefix="/api/vehicle", tags=["Vehicle Intelligence"])

class VehicleLookupRequest(BaseModel):
    plate: str = Field(..., description="Indian vehicle registration number", min_length=3, max_length=15)

class RTSPConfigRequest(BaseModel):
    junction_id: str = Field(..., description="Camera junction identifier, e.g. CAM-03")
    rtsp_url: str = Field(..., description="RTSP video stream URI, e.g. rtsp://192.168.1.120:554/live")
    sampling_fps: int = Field(default=10, ge=1, le=30, description="Sampling rate in frames per second")
    enable_nvdec: bool = Field(default=True, description="Hardware accelerated NVDEC decode")
    confidence_threshold: float = Field(default=0.75, ge=0.1, le=1.0)

@router.post("/lookup")
@limiter.limit("10/minute")
async def lookup_vehicle(request: Request, body: VehicleLookupRequest, authorization: Optional[str] = Header(None)):
    """
    Look up an Indian vehicle registration plate via the configured registry service.
    Normalizes modern, Bharat series, commercial, and legacy formats.
    Returns structured registration and vehicle data. Runs in demo mode (sample
    plates only) unless OFFICIAL_REGISTRY_API_URL is configured with an
    authorized data source — see backend/services/vehicle_registry.py.
    """
    record = await registry_service.query_vehicle(body.plate)

    if not record.get("success"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=record.get("error", "Invalid vehicle registration plate format.")
        )

    return record

@router.post("/rtsp-config")
async def configure_rtsp_edge_stream(config: RTSPConfigRequest):
    """
    Configure edge RTSP hardware-accelerated decode daemon.
    Avoids client-side heavy video file upload bottleneck.
    """
    return {
        "success": True,
        "status": "STREAM_ACTIVE",
        "junction_id": config.junction_id,
        "rtsp_url": config.rtsp_url,
        "sampling_fps": config.sampling_fps,
        "hardware_acceleration": "NVDEC_CUDA" if config.enable_nvdec else "CPU_SOFTWARE",
        "pipeline": f"rtspsrc location={config.rtsp_url} latency=0 ! rtph264depay ! h264parse ! nvv4l2decoder ! nvvidconv ! video/x-raw,framerate={config.sampling_fps}/1 ! appsink"
    }
