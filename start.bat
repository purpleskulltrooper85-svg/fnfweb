@echo off
cd /d "%~dp0"
start "" "http://localhost:8080"
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
) else (
  python -m http.server 8080
)
pause
