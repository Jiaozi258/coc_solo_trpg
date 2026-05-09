@echo off
title COC TRPG - Frontend

cd /d "%~dp0frontend"

echo ========================================
echo   Call of Cthulhu Solo TRPG - Frontend
echo ========================================
echo.

if not exist "node_modules\" (
    echo [INFO] Installing dependencies (this may take a few minutes)...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install. Please install Node.js 18+
        pause
        exit /b 1
    )
) else (
    echo [INFO] Checking dependencies...
    call npm install --silent
)

echo.
echo [INFO] Starting dev server on http://localhost:5173
echo [INFO] Press Ctrl+C to stop
echo ========================================
echo.

call npx vite --host 0.0.0.0 --port 5173

pause
