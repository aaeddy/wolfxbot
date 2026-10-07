@echo off
chcp 65001 >nul
set "TASK=WolfxBotManager"

echo ==== Scheduled task ====
schtasks /Query /TN "%TASK%" 2>nul
if errorlevel 1 echo Not installed (or it uses the Startup folder way)

echo.
echo ==== Port 8080 ====
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Format-Table LocalAddress,LocalPort,OwningProcess -AutoSize"
echo Open: http://localhost:8080   (painting console: /painting)
echo.
pause
