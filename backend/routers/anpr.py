"""
VIMS — ANPR Recognition Router
POST /api/anpr/recognize: accepts an uploaded image, runs plate localization and OCR.
POST /api/anpr/scan-video: accepts an uploaded video and runs localization and OCR across frames.
"""

import os
import tempfile

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status

from backend.services.anpr_engine import recognize_plate_from_image, scan_video_file
from backend.utils.rate_limiter import limiter

router = APIRouter(prefix="/api/anpr", tags=["ANPR Recognition"])

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB (images)
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}

MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB, consistent with the video-ingest cap
ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4", "video/webm", "video/x-m4v", "video/quicktime", "video/x-matroska", "video/avi",
}


@router.post("/recognize")
@limiter.limit("20/minute")
async def recognize_plate(request: Request, file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type '{file.content_type}'. Upload a JPEG, PNG, WEBP, or BMP image.",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds the {MAX_UPLOAD_BYTES // (1024*1024)} MB upload limit.",
        )
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file upload.")

    result = recognize_plate_from_image(contents)
    return result


@router.post("/scan-video")
@limiter.limit("5/minute")
async def scan_video(
    request: Request,
    file: UploadFile = File(...),
    frame_stride: int = Query(
        default=5, ge=1, le=30,
        description="Decode+OCR every Nth frame across the WHOLE video (speed/thoroughness "
                    "trade-off). The scan always covers the full video length, start to end.",
    ),
):
    """
    Run real ANPR detection+OCR across an ENTIRE uploaded video, start to
    finish — not just the first few seconds. Returns every distinct,
    format-valid plate actually read from the footage, ranked by how many
    independent frames confirmed it. Backend-only addition; no frontend
    file calls this endpoint yet.
    """
    if file.content_type not in ALLOWED_VIDEO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported video type '{file.content_type}'. Allowed: {sorted(ALLOWED_VIDEO_CONTENT_TYPES)}",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file upload.")
    if len(contents) > MAX_VIDEO_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video exceeds the {MAX_VIDEO_UPLOAD_BYTES // (1024*1024)} MB upload limit.",
        )

    suffix = os.path.splitext(file.filename or "")[1] or ".mp4"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        result = scan_video_file(tmp_path, frame_stride=frame_stride)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {
        "success": True,
        "mode": "REAL_OCR_FULL_VIDEO_SCAN",
        "filename": file.filename,
        "video_total_frames": result.total_frames_in_video,
        "frames_actually_scanned": result.frames_scanned,
        "video_duration_sec": result.duration_sec,
        "frame_stride": result.frame_stride,
        "processing_time_sec": result.processing_time_sec,
        "unique_plates_detected": len(result.plates),
        "plates": [
            {
                "plate": p.plate,
                "format_type": p.format_type,
                "best_confidence": p.best_confidence,
                "frame_hits": p.frame_hits,
                "first_seen_sec": p.first_seen_sec,
                "last_seen_sec": p.last_seen_sec,
                "sample_ocr_text": p.sample_ocr_text,
            }
            for p in result.plates
        ],
    }
