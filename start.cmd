@echo off
title Forgotten Cloud
setlocal EnableDelayedExpansion
cd /d "%~dp0"

rem ---- Persistent log ----
if not exist ".cloud" mkdir ".cloud"
set "LOGFILE=%CD%\.cloud\launcher.log"

echo ============================================== >> "%LOGFILE%"
echo [%date% %time%] Launcher session started >> "%LOGFILE%"
echo Node: >> "%LOGFILE%"
node --version >> "%LOGFILE%" 2>&1
echo ============================================== >> "%LOGFILE%"
echo [launcher] Log file: %LOGFILE%
node --version

rem ---- Bootstrap: dependencies ----
if exist "node_modules\.pnpm" goto :deps_ok
if exist "node_modules\express" goto :deps_ok

echo.
echo [1/2] Installing dependencies (this can take a minute)...
echo [%date% %time%] BOOTSTRAP: installing dependencies >> "%LOGFILE%"
where pnpm >nul 2>nul
if %errorlevel%==0 (
    call pnpm install
) else (
    call npm install --no-audit --no-fund
)
if not %errorlevel%==0 (
    echo.
    echo [bootstrap] FAILED to install dependencies. Details in launcher.log
    echo [%date% %time%] BOOTSTRAP FAILED at dependency install >> "%LOGFILE%"
    pause
    exit /b 1
)
echo [bootstrap] Dependencies installed.

:deps_ok
rem ---- Bootstrap: build ----
if exist "dist\server\index.js" goto :ready

echo.
echo [2/2] Building panel (first build can take a minute)...
echo [%date% %time%] BOOTSTRAP: building panel >> "%LOGFILE%"
where pnpm >nul 2>nul
if %errorlevel%==0 (
    call pnpm run build
) else (
    call npm run build
)
if not %errorlevel%==0 (
    echo.
    echo [bootstrap] FAILED to build. Details in launcher.log
    echo [%date% %time%] BOOTSTRAP FAILED at build >> "%LOGFILE%"
    pause
    exit /b 1
)
echo [bootstrap] Build complete.

:ready
echo.
echo [launcher] Ready. Panel output follows. Ctrl+C twice stops everything.
echo [%date% %time%] Entering restart loop >> "%LOGFILE%"

:loop
echo.
echo [%date% %time%] Starting Forgotten Cloud panel...
echo [%date% %time%] PANEL START >> "%LOGFILE%"
call node dist\server\index.js
set "EXITCODE=%errorlevel%"
echo [%date% %time%] PANEL EXITED code=%EXITCODE% >> "%LOGFILE%"
echo.
echo [%date% %time%] Panel exited (code=%EXITCODE%). Restarting in 3 seconds... Close this window or press Ctrl+C twice to stop for good.
timeout /t 3 /nobreak >nul
goto loop
