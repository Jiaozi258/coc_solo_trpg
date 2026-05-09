@echo off
chcp 65001 >nul 2>&1
title COC TRPG - Launcher
setlocal enabledelayedexpansion

set "ROOT=%~dp0"

echo.
echo   ========================================
echo     Call of Cthulhu Solo TRPG Simulator
echo     One-Click Launcher
echo   ========================================
echo.

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] Python not found!
    echo   Install Python 3.10+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] Node.js not found!
    echo   Install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

echo   Python: OK
echo   Node.js: OK

if not exist "%ROOT%backend\venv\Scripts\activate.bat" (
    echo.
    echo   [SETUP] Creating Python virtual environment...
    python -m venv "%ROOT%backend\venv"
)

call "%ROOT%backend\venv\Scripts\activate.bat"
echo   [SETUP] Checking Python dependencies...
pip install -q -r "%ROOT%backend\requirements.txt" 2>nul
echo   Python dependencies: OK

if not exist "%ROOT%frontend\node_modules\" (
    echo.
    echo   [SETUP] Installing frontend dependencies...
    pushd "%ROOT%frontend"
    call npm install
    popd
) else (
    pushd "%ROOT%frontend"
    call npm install --silent 2>nul
    popd
)
echo   Frontend dependencies: OK

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8770" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo   ========================================
echo   Starting services...
echo   ========================================
echo.

start "COC-Backend" /min cmd /c "cd /d "%ROOT%backend" && call "%ROOT%backend\venv\Scripts\activate.bat" && uvicorn app.main:app --host 0.0.0.0 --port 8770"

echo   Waiting for backend on port 8770...
set "BACKEND_OK=0"
for /L %%i in (1,1,30) do (
    curl -s http://localhost:8770/docs >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        set "BACKEND_OK=1"
        goto :backend_done
    )
    timeout /t 1 /nobreak >nul
)
:backend_done
if "!BACKEND_OK!" EQU "1" (
    echo   Backend: OK
) else (
    echo   Backend: may still be starting...
)

start "COC-Frontend" /min cmd /c "cd /d "%ROOT%frontend%" && npx vite --host 0.0.0.0 --port 5173"

echo   Waiting for frontend on port 5173...
set "FRONTEND_OK=0"
for /L %%i in (1,1,30) do (
    curl -s http://localhost:5173 >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        set "FRONTEND_OK=1"
        goto :frontend_done
    )
    timeout /t 1 /nobreak >nul
)
:frontend_done
if "!FRONTEND_OK!" EQU "1" (
    echo   Frontend: OK
) else (
    echo   Frontend: may still be starting...
)

echo.
echo   ========================================
echo   Opening browser...
echo   ========================================

start "" http://localhost:5173

echo.
echo   ========================================
echo     All services are running!
echo.
echo     Game :   http://localhost:5173
echo     API  :   http://localhost:8770/docs
echo.
echo     You can close this window.
echo     Services run in background.
echo   ========================================
echo.
pause
