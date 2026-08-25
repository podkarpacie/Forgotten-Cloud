@echo off
title Forgotten Cloud
cd /d "%~dp0"

:loop
echo [%date% %time%] Starting Forgotten Cloud panel...
node dist/server/index.js
echo.
echo [%date% %time%] Panel exited. Restarting in 3 seconds (Ctrl+C twice to stop)...
timeout /t 3 /nobreak >nul
goto loop
