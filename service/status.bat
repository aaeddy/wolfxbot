@echo off
chcp 65001 >nul
set "TASK=WolfxBotManager"

echo ==== 计划任务 ====
schtasks /Query /TN "%TASK%" 2>nul
if errorlevel 1 echo 未安装计划任务（可能用的是启动文件夹方式，或还没安装）

echo.
echo ==== 8080 端口 ====
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Format-Table LocalAddress,LocalPort,OwningProcess -AutoSize"
echo 浏览器打开: http://localhost:8080  （地图画控制台: /painting）
echo.
pause
