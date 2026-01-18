#!/bin/bash
set -e

echo "Building frontend..."
cd frontend
npm run build
cd ..

echo "Starting backend..."
# Ensure we are in the root directory
export PYTHONPATH=$PYTHONPATH:$(pwd)/sam3
export BIOSEG_API_BASE_URL="http://localhost:8005"

# Serve the frontend static files from FastAPI? 
# Currently FastAPI is API-only. Let's add static file serving to FastAPI for the all-in-one experience.

python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8005
