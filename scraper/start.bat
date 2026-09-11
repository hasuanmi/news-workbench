@echo off
REM media-scraper one-click start (Windows)
cd /d "%~dp0"

set PY=python
where python >nul 2>nul || set PY=py

if not exist "venv\Scripts\python.exe" (
  echo [1/3] Creating virtual environment...
  %PY% -m venv venv
)

echo [2/3] Installing dependencies...
"venv\Scripts\python.exe" -m pip install -q --upgrade pip
"venv\Scripts\python.exe" -m pip install -q -r requirements.txt

echo [3/3] Starting service on http://127.0.0.1:8000   docs: http://127.0.0.1:8000/docs
"venv\Scripts\python.exe" -m app.main
