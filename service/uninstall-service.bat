@echo off
chcp 65001 >nul
set "TASK=WolfxBotManager"

echo 正在删除开机自启项...
schtasks /Delete /TN "%TASK%" /F >nul 2>&1
del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WolfxBotManager.vbs" >nul 2>&1

echo 正在停止 8080 端口上的控制台...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo 完成，已移除开机自启并停止控制台。
pause
