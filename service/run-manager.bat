@echo off
chcp 65001 >nul
rem Start the manager in this window (logs are visible; closing the window stops it)
cd /d "%~dp0.."
echo Starting WolfxBot manager. Open http://localhost:8080 ; closing this window stops it.
"node" manager.js
pause
