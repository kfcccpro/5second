@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo JK English - ONE-TIME Firebase GitHub auto-deploy setup
echo ============================================================
echo.
echo This is NOT a normal deployment command.
echo Run this file once only to connect GitHub Actions to Firebase Hosting.
echo After setup, pushes to main will run QA and deploy automatically.
echo.

where firebase.cmd >nul 2>nul
if errorlevel 1 (
  echo Firebase CLI is not installed.
  echo Run: npm.cmd install -g firebase-tools
  pause
  exit /b 1
)

where git.exe >nul 2>nul
if errorlevel 1 (
  echo Git command was not found. GitHub Desktop normally installs Git.
  echo Open GitHub Desktop once, then run this file again.
  pause
  exit /b 1
)

echo [1/4] Check Firebase login
call firebase.cmd projects:list >nul 2>nul
if errorlevel 1 (
  echo Firebase login is required. A browser authorization step will open.
  call firebase.cmd login --no-localhost
  if errorlevel 1 goto :fail
) else (
  echo Firebase login already available.
)

echo [2/4] Confirm Firebase project
call firebase.cmd use jk-english-5sec-grammar
if errorlevel 1 goto :fail

echo.
echo [3/4] Connect Firebase Hosting to GitHub
echo.
echo When Firebase asks for the GitHub repository, enter:
echo   kfcccpro/5second
echo.
echo If it asks whether to run a build script before deploy, choose No.
echo If it asks whether to deploy live when a PR is merged, choose No.
echo The repository already has its own QA + live deployment workflow.
echo This step is only for creating the Firebase service account and GitHub secret.
echo.
call firebase.cmd init hosting:github
if errorlevel 1 goto :fail

echo [4/4] Keep the repository's managed deployment configuration
rem Firebase CLI may generate default workflow files. Our firebase-live.yml replaces them.
if exist ".github\workflows\firebase-hosting-merge.yml" del /q ".github\workflows\firebase-hosting-merge.yml"
if exist ".github\workflows\firebase-hosting-pull-request.yml" del /q ".github\workflows\firebase-hosting-pull-request.yml"
rem Restore Firebase config in case init touched repository-managed settings.
git restore --source=HEAD -- firebase.json .firebaserc >nul 2>nul

echo.
echo ============================================================
echo AUTO-DEPLOY AUTHORIZATION SETUP COMPLETE
echo ============================================================
echo.
echo From now on the normal flow is:
echo   main push -^> GitHub Actions QA -^> Firebase Hosting live deploy
echo.
echo DEPLOY_WINDOWS.cmd is no longer required for normal updates.
echo Keep it only as an emergency fallback.
echo.
echo Return to ChatGPT and say: setup complete
echo ChatGPT can then re-run and verify the failed auto-deploy workflow.
echo.
pause
exit /b 0

:fail
echo.
echo AUTO-DEPLOY SETUP STOPPED.
echo Review the error shown above. No normal Hosting deployment was attempted.
echo.
pause
exit /b 1
