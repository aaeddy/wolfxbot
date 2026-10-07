@echo off
chcp 65001 >nul
setlocal
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "PORT=8080"

echo ============================================
echo  Restart WolfxBot manager (port %PORT%)
echo  Use this after changing manager.js / painting.js
echo ============================================
echo.

echo [1/3] Stopping the running console...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if (-not $c) { Write-Host '      not running'; exit 0 }; $procId = ($c | Select-Object -First 1).OwningProcess; $p = Get-Process -Id $procId -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $procId -Force; Write-Host ('      stopped node.exe (pid ' + $procId + ')') } else { Write-Host ('      port is used by ' + $p.ProcessName + ' (not node), skipped'); exit 1 }"
if errorlevel 1 goto FAIL

echo [2/3] Waiting for the port to be released...
ping -n 3 127.0.0.1 >nul

echo [3/3] Starting it in the background...
wscript "%ROOT%\service\run-manager-hidden.vbs"
ping -n 4 127.0.0.1 >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($c) { Write-Host ('      started, pid ' + (($c | Select-Object -First 1).OwningProcess)) } else { Write-Host '      not up yet, check logs\manager.log' }"

echo.
echo Done: http://localhost:%PORT%    (painting console: /painting)
echo Log: %ROOT%\logs\manager.log
echo.
pause
exit /b 0

:FAIL
echo.
echo Aborted: port %PORT% is used by another program. Close it first, then run again.
pause
exit /b 1
