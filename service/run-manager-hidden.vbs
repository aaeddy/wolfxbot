' 用隐藏窗口（0 = 不显示窗口）启动统一控制台，供开机自启使用
Option Explicit
Dim fso, shell, scriptDir, root, batPath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptDir)
batPath = fso.BuildPath(scriptDir, "run-manager-silent.bat")
shell.CurrentDirectory = root
shell.Run """" & batPath & """", 0, False
