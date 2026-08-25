@echo off
title Forgotten Cloud
cd /d "%~dp0"

rem ---- First-run bootstrap: install deps and build if missing ----
if not exist "node_modules" (
    echo First run: installing dependencies...
    where pnpm >nul 2>nul && (pnpm install) || (npm install --no-audit --no-fund)
    echo.
)
if not exist "dist\server\index.js" (
    echo First run: building panel...
    where pnpm >nul 2>nul && (pnpm run build) || (npm run build)
    echo.
)

:loop
echo [%date% %time%] Starting Forgotten Cloud panel...
node dist\server\index.js
echo.
echo [%date% %time%] Panel exited. Restarting in 3 seconds (Ctrl+C twice to stop)...
timeout /t 3 /nobreak >nul
goto loop
