#!/bin/bash
echo "=== FlowCommand VIMS — Smart India Hackathon ==="
echo "Starting backend..."
pip install -r backend/requirements.txt -q
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "Starting frontend..."
python -m http.server 3000 &
FRONTEND_PID=$!
echo ""
echo "Backend:  http://localhost:8000/docs"
echo "Frontend: http://localhost:3000/index.html"
echo ""
echo "Demo Login: Badge=MH-PI-4501, Pass=admin123, OTP=123456"
echo "Press Ctrl+C to stop."
wait $BACKEND_PID $FRONTEND_PID
