@echo off
echo Starting Rei Autonomous AI in BACKGROUND MODE...
cd /d %~dp0
cmd /c npm run autonomous
pause
