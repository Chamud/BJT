' BJT Trainer desktop app launcher - starts with NO console windows.
' Double-click this (or the "BJT Trainer" shortcut). Rebuilds the app silently, then starts the tray app + widget.
Option Explicit
Dim sh, fso, root, env, electron
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)

' VS Code terminals set this, which would make Electron run as plain Node
Set env = sh.Environment("Process")
On Error Resume Next
env.Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0

' first run: install dependencies (hidden, wait)
If Not fso.FolderExists(root & "\app\node_modules") Then sh.Run "cmd /c cd /d """ & root & "\app"" && npm install", 0, True
If Not fso.FolderExists(root & "\desktop\node_modules") Then sh.Run "cmd /c cd /d """ & root & "\desktop"" && npm install", 0, True

' rebuild the trainer so code changes are picked up (hidden, wait ~1-2 s)
sh.Run "cmd /c cd /d """ & root & "\app"" && npm run build", 0, True

' start the desktop app (a normal Windows program: tray icon + widget, no console)
electron = root & "\desktop\node_modules\electron\dist\electron.exe"
sh.Run """" & electron & """ """ & root & "\desktop""", 1, False
