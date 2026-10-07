@echo off
chcp 65001 >nul
setlocal
set "TASK=WolfxBotManager"
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "VBS=%ROOT%\service\run-manager-hidden.vbs"

echo ============================================
echo  Install WolfxBot manager autostart
echo  Project: %ROOT%
echo  Port: 8080
echo ============================================
echo.

echo [1/2] Creating scheduled task (start at logon)...
schtasks /Create /TN "%TASK%" /TR "wscript.exe \"%VBS%\"" /SC ONLOGON /RL LIMITED /F >nul
if errorlevel 1 goto FALLBACK

echo      OK: scheduled task created
echo [2/2] Starting it once now...
schtasks /Run /TN "%TASK%" >nul 2>&1
echo      Started (if the port is busy, see logs\manager.log)
goto DONE

:FALLBACK
echo      Failed, falling back to Startup folder (also needs no admin)...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\WolfxBotManager.vbs" echo Set shell = CreateObject("WScript.Shell")
>> "%STARTUP%\WolfxBotManager.vbs" echo shell.Run """%VBS%""", 0, False
wscript "%STARTUP%\WolfxBotManager.vbs"
echo      Placed in the Startup folder and started

:DONE
echo.
echo Done. Open http://localhost:8080  (painting console: /painting)
echo Remove autostart: service\uninstall-service.bat   Check status: service\status.bat
echo.
pause
