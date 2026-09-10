@echo off
start "" npm run dev
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"
