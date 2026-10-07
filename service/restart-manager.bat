@echo off
chcp 65001 >nul
setlocal
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "PORT=8080"

echo ============================================
echo  重启 WolfxBot 统一控制台（端口 %PORT%）
echo  改了 manager.js / painting.js 之后，用它让改动生效
echo ============================================
echo.

echo [1/3] 停止正在运行的控制台...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if (-not $c) { Write-Host '      没有在运行'; exit 0 }; $procId = ($c | Select-Object -First 1).OwningProcess; $p = Get-Process -Id $procId -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $procId -Force; Write-Host ('      已结束 node.exe（pid ' + $procId + '）') } else { Write-Host ('      端口被 ' + $p.ProcessName + ' 占用（不是 node），已跳过，请手动处理'); exit 1 }"
if errorlevel 1 goto FAIL

echo [2/3] 等待端口释放...
ping -n 3 127.0.0.1 >nul

echo [3/3] 后台启动控制台...
wscript "%ROOT%\service\run-manager-hidden.vbs"
ping -n 4 127.0.0.1 >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($c) { Write-Host ('      已启动，pid ' + (($c | Select-Object -First 1).OwningProcess)) } else { Write-Host '      还没起来，请查看 logs\manager.log' }"

echo.
echo 完成: http://localhost:%PORT%    （地图画控制台: /painting）
echo 日志: %ROOT%\logs\manager.log
echo.
pause
exit /b 0

:FAIL
echo.
echo 重启中止：%PORT% 端口被别的程序占用，请先关掉它再运行本脚本。
pause
exit /b 1
