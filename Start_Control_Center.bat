@echo off
chcp 65001 >nul
title SALA CONNECT Control Center (Port 3405)
cd /d "%~dp0"

REM 1. Check if Node is installed
where node >nul 2>nul
if not errorlevel 1 (
    netstat -ano | findstr /R /C:":3405 .*LISTENING" >nul 2>nul
    if errorlevel 1 (
        start "SALA CONNECT Server (Port 3405)" /min node "%~dp0control_center.cjs"
        ping 127.0.0.1 -n 2 >nul
    )
    start "" "http://127.0.0.1:3405/sala"
    exit /b 0
)

:already_running
start "" "http://127.0.0.1:3405/sala"
exit /b 0

