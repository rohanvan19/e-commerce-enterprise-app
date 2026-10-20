@echo off
cd /d "%~dp0"
if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" scripts\iphone-start.mjs
) else (
  node scripts\iphone-start.mjs
)
pause

