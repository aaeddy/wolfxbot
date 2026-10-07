' Start the manager with a hidden window (0 = no window), used by autostart
Option Explicit
Dim fso, shell, scriptDir, root, batPath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptDir)
batPath = fso.BuildPath(scriptDir, "run-manager-silent.bat")
shell.CurrentDirectory = root
shell.Run """" & batPath & """", 0, False
