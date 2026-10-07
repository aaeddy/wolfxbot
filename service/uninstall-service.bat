@echo off
chcp 65001 >nul
set "TASK=WolfxBotManager"

echo Removing autostart entry...
schtasks /Delete /TN "%TASK%" /F >nul 2>&1
del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WolfxBotManager.vbs" >nul 2>&1

echo Stopping the console on port 8080...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo Done: autostart removed and console stopped.
pause
