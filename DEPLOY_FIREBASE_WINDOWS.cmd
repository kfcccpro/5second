@echo off
setlocal
cd /d "%~dp0"
where firebase.cmd >nul 2>nul
if errorlevel 1 (
  echo Firebase CLI is not installed.
  echo Run: npm.cmd install -g firebase-tools
  pause
  exit /b 1
)
echo [1/3] Firebase login
firebase.cmd login
if errorlevel 1 goto :fail
echo [2/3] Select Firebase project and set alias default
firebase.cmd use --add
if errorlevel 1 goto :fail
echo [3/3] Deploy Firestore rules and Hosting
firebase.cmd deploy --only "firestore:rules,hosting"
if errorlevel 1 goto :fail
echo.
echo Deployment complete. Open the Hosting URL shown above and run the smoke test.
pause
exit /b 0
:fail
echo.
echo Deployment stopped because a Firebase CLI step failed.
pause
exit /b 1
