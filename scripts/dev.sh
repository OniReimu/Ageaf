#!/usr/bin/env bash
set -euo pipefail

# Kill any existing webpack watch processes
echo "Killing existing webpack watch processes..."
pkill -f "webpack.*watch" || true

# Kill any existing host dev processes (tsx watch)
echo "Killing existing host dev processes..."
pkill -f "tsx watch.*start.ts" || true
pkill -f "tsx.*src/start.ts" || true

# Kill any processes on port 3210 (host server) - retry until port is free
if command -v lsof >/dev/null 2>&1; then
  echo "Killing processes on port 3210..."
  MAX_RETRIES=5
  RETRY=0
  while [ $RETRY -lt $MAX_RETRIES ]; do
    PIDS=$(lsof -ti:3210 2>/dev/null || true)
    if [ -z "$PIDS" ]; then
      break  # Port is free
    fi
    echo "  Attempt $((RETRY + 1)): Killing PIDs: $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
    RETRY=$((RETRY + 1))
  done
  
  # Final check
  PIDS=$(lsof -ti:3210 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Warning: Port 3210 still in use by PIDs: $PIDS after $MAX_RETRIES attempts"
  else
    echo "Port 3210 is now free"
  fi
fi

# Wait a moment for processes to fully terminate
sleep 1

# Start extension watch in background
echo "Starting extension watch..."
npm run watch &
WATCH_PID=$!

# Final verification that port 3210 is free before starting
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:3210 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "ERROR: Port 3210 is still in use by PIDs: $PIDS"
    echo "Please manually kill these processes or wait a moment and try again."
    exit 1
  fi
fi

# Start host dev in background
echo "Starting host dev server..."
cd host && npm run dev &
HOST_PID=$!
cd ..

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $WATCH_PID 2>/dev/null || true
  kill $HOST_PID 2>/dev/null || true
  pkill -f "webpack.*watch" || true
  pkill -f "tsx watch.*start.ts" || true
  exit 0
}

# Trap SIGINT and SIGTERM
trap cleanup SIGINT SIGTERM

# Wait for both processes
echo ""
echo "Extension watch (PID: $WATCH_PID) and host dev (PID: $HOST_PID) are running."
echo "Press Ctrl+C to stop both processes."
echo ""

# Wait for both processes, exit if either dies
wait $WATCH_PID $HOST_PID || true

