@echo off
chcp 65001 >nul
setlocal
set "TASK=WolfxBotManager"
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "VBS=%ROOT%\service\run-manager-hidden.vbs"

echo ============================================
echo  安装 WolfxBot 统一控制台开机自启
echo  项目目录: %ROOT%
echo  端口: 8080
echo ============================================
echo.

echo [1/2] 创建计划任务（登录时自动启动）...
schtasks /Create /TN "%TASK%" /TR "wscript.exe \"%VBS%\"" /SC ONLOGON /RL LIMITED /F >nul
if errorlevel 1 goto FALLBACK

echo      计划任务创建成功
echo [2/2] 立即启动一次...
schtasks /Run /TN "%TASK%" >nul 2>&1
echo      已启动（若端口被占用会记录在 logs\manager.log）
goto DONE

:FALLBACK
echo      计划任务创建失败，改用"启动文件夹"方式（同样不需要管理员）...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\WolfxBotManager.vbs" echo Set shell = CreateObject("WScript.Shell")
>> "%STARTUP%\WolfxBotManager.vbs" echo shell.Run """%VBS%""", 0, False
wscript "%STARTUP%\WolfxBotManager.vbs"
echo      已放入启动文件夹并立即启动

:DONE
echo.
echo 完成！打开 http://localhost:8080 查看进程管理器，/painting 是地图画控制台。
echo 卸载请运行 service\uninstall-service.bat；查看状态请运行 service\status.bat。
echo.
pause
