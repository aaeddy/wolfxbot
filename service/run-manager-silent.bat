@echo off
chcp 65001 >nul
rem Background launcher (no window): node manager.js -> logs\manager.log
cd /d "%~dp0.."
if not exist "logs" mkdir "logs"

rem rotate the log file if it is bigger than 5MB
if exist "logs\manager.log" (
  for %%A in ("logs\manager.log") do if %%~zA GTR 5242880 (
    if exist "logs\manager.log.old" del /q "logs\manager.log.old"
    move /y "logs\manager.log" "logs\manager.log.old" >nul
  )
)

set "NODE=node"
if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"

"%NODE%" manager.js >> "logs\manager.log" 2>&1
