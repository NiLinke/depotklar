@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte Node.js 24 LTS installieren und dieses Fenster erneut oeffnen.
  pause
  exit /b 1
)
if not exist "dist\vendor\exceljs.min.js" (
  echo Bitte einmal npm ci --ignore-scripts und npm run build ausfuehren.
  pause
  exit /b 1
)
echo Depotklar laeuft unter http://127.0.0.1:4173
echo Dieses Fenster zum Beenden mit Strg+C schliessen.
node server.mjs
