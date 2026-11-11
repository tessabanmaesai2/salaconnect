@echo off
chcp 65001 >nul
title SALA CONNECT - Stop Server (Port 3405)
cd /d "%~dp0"

echo ===================================================
echo   SALA CONNECT - Stop Server (Port 3405)
echo ===================================================
echo.

powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3405 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host 'Stopped PID:' $_.OwningProcess }"

echo.
echo SALA CONNECT Server stopped successfully.
ping 127.0.0.1 -n 2 >nul
exit /b 0

