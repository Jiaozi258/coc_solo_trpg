@echo off
title COC TRPG - Backend

set ROOT=%~dp0
cd /d "%ROOT%backend"

echo ========================================
echo   Call of Cthulhu Solo TRPG - Backend
echo ========================================
echo.

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found!
    echo Install Python 3.10+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

if not exist "venv\Scripts\activate.bat" (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat
echo [INFO] Checking Python dependencies...
pip install -q -r requirements.txt

echo.
echo [INFO] Starting server on http://localhost:8770
echo [INFO] Press Ctrl+C to stop
echo ========================================
echo.

uvicorn app.main:app --host 0.0.0.0 --port 8770 --reload

pause
