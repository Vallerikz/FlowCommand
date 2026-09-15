# Legacy Prototype (superseded)

These files were an earlier, separate prototype of the same traffic-engine
idea, duplicated at the project root alongside the newer, more complete
FastAPI app in `backend/`. Having two parallel apps with the same module
names was a real source of import confusion (e.g. running `python main.py`
from the root vs `uvicorn backend.main:app` would load different code).

`backend/` is the canonical, actively-developed app:
  * `backend/main.py` — FastAPI app, routers, CORS, rate limiting
  * `backend/traffic_engine.py` — signal control state machine
  * `backend/junction_router.py` — junction API endpoints
  * `backend/video_engine.py` — real YOLOv8 vehicle detection + MJPEG stream

These root-level files are kept only for reference and are not imported
by anything in `backend/`. Safe to delete once you've confirmed you don't
need anything from them.
