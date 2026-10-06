@echo off
chcp 65001 >nul
rem 手动启动统一控制台（有窗口，方便看日志；关掉窗口即停止）
cd /d "%~dp0.."
echo 正在启动统一控制台，打开 http://localhost:8080 查看；关闭本窗口即停止。
"node" manager.js
pause
