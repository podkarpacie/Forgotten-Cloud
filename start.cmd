@echo off
title Forgotten Cloud
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ---- Persistent log: everything the launcher does lands in .cloud\launcher.log ----
if not exist ".cloud" mkdir ".cloud"
set "LOGFILE=.cloud\launcher.log"

echo ============================================== >> "%LOGFILE%"
echo [%date% %time%] Launcher session started >> "%LOGFILE%"
echo ============================================== >> "%LOGFILE%"
echo [%date% %time%] Launcher session started (log: %CD%\%LOGFILE%)

rem ---- Record tool versions for debugging ----
where node >> "%LOGFILE%" 2>&1
node --version >> "%LOGFILE%" 2>&1
where pnpm >> "%LOGFILE%" 2>&1
pnpm --version >> "%LOGFILE%" 2>&1
where npm >> "%LOGFILE%" 2>&1

rem ---- First-run bootstrap: install deps and build if missing ----
if not exist "node_modules" (
    echo [bootstrap] node_modules missing - installing dependencies...
    echo [%date% %time%] BOOTSTRAP: installing dependencies with pnpm >> "%LOGFILE%"
    echo Installing dependencies (this can take a minute)...
    where pnpm >nul 2>nul && (pnpm install >> "%LOGFILE%" 2>&1) || (npm install --no-audit --no-fund >> "%LOGFILE%" 2>&1)
    if errorlevel 1 (
        echo [bootstrap] FAILED - install errors were logged.
        echo [%date% %time%] BOOTSTRAP FAILED at dependency install >> "%LOGFILE%"
        goto :fail
    )
    echo [bootstrap] Dependencies installed.
)

if not exist "dist\server\index.js" (
    echo [bootstrap] dist missing - building panel...
    echo [%date% %time%] BOOTSTRAP: building panel >> "%LOGFILE%"
    echo Building panel (first build can take a minute)...
    where pnpm >nul 2>nul && (pnpm run build >> "%LOGFILE%" 2>&1) || (npm run build >> "%LOGFILE%" 2>&1)
    if errorlevel 1 (
        echo [bootstrap] FAILED - build errors were logged.
        echo [%date% %time%] BOOTSTRAP FAILED at build >> "%LOGFILE%"
        goto :fail
    )
    echo [bootstrap] Build complete.
)

echo [bootstrap] Ready. Panel output follows.

:loop
echo.
echo [%date% %time%] Starting Forgotten Cloud panel...
echo [%date% %time%] PANEL START >> "%LOGFILE%"
node dist\server\index.js 2>> "%LOGFILE%"
set "EXITCODE=%errorlevel%"
echo [%date% %time%] PANEL EXITED code=%EXITCODE% >> "%LOGFILE%"
echo.
echo [%date% %time%] Panel exited (code=%EXITCODE%). Restarting in 3 seconds... Press Ctrl+C twice to stop for good.
timeout /t 3 /nobreak >nul
goto loop

:fail
echo.
echo Startup failed. Full details: %CD%\%LOGFILE%
echo [%date% %time%] LAUNCHER FAILED - stopping. >> "%LOGFILE%"
pause
