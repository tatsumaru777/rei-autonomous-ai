@echo off
echo Starting Rei Autonomous AI Secretary System...
cd /d %~dp0
start http://localhost:5173
cmd /c npm run dev -- --force
pause
