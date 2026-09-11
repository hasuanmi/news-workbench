#!/usr/bin/env bash
# media-scraper one-click start (Linux / macOS)
set -e
cd "$(dirname "$0")"

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

if [ ! -x "venv/bin/python" ]; then
  echo "[1/3] Creating virtual environment..."
  "$PY" -m venv venv
fi

echo "[2/3] Installing dependencies..."
./venv/bin/python -m pip install -q --upgrade pip
./venv/bin/python -m pip install -q -r requirements.txt

echo "[3/3] Starting service on http://0.0.0.0:8000   docs: http://127.0.0.1:8000/docs"
./venv/bin/python -m app.main
