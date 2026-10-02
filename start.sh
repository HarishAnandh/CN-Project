#!/bin/bash

echo "=========================================================="
echo "    Smart Warehouse Drone Fleet - Computer Networks UI    "
echo "=========================================================="

# Check for C compiler & build backend
echo "[1/3] Building C backend binary (drone_fleet)..."
make -C backend

if [ $? -ne 0 ]; then
  echo "[ERROR] Failed to compile C backend!"
  exit 1
fi

# Install npm dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "[2/3] Installing Node.js adapter dependencies..."
  npm install
else
  echo "[2/3] Node dependencies verified."
fi

# Launch Adapter Server Bridge & Dashboard
echo "[3/3] Launching Bridge Server & Web Dashboard..."
echo "  - UDP Datagram Socket Server: 127.0.0.1:8080"
echo "  - C Backend Subprocess: ./backend/drone_fleet"
echo "  - Web Dashboard UI: http://localhost:3000"
echo "=========================================================="

node bridge/server.js
