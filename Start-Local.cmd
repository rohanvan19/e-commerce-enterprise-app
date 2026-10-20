@echo off
cd /d "%~dp0"
if not exist "node_modules\next\dist\bin\next" (
  echo Please run npm install in this folder first.
  pause
  exit /b 1
)
if exist ".local-postgres\data\PG_VERSION" (
  node scripts/local-db.mjs
  if errorlevel 1 exit /b 1
)
node scripts/database.mjs
if errorlevel 1 exit /b 1
node node_modules\next\dist\bin\next dev --hostname 127.0.0.1 --port 3000
pause
