@echo off
echo [REI SYSTEM] Syncing changes to GitHub...
cd /d %~dp0

:: Check if git is available
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    echo Please install Git from https://git-scm.com/
    pause
    exit /b
)

echo [1/3] Adding changes...
git add .

echo [2/3] Committing...
git commit -m "feat: Rei Advanced Autonomy & Cloud Persistence"

echo [3/3] Pushing to GitHub...
git push origin main

if %errorlevel% equ 0 (
    echo [SUCCESS] Sync completed! Rei is now ready in the cloud.
) else (
    echo [ERROR] Push failed. Please check your internet connection or GitHub permissions.
)

pause
