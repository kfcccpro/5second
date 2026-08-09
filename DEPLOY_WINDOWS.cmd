@echo off
setlocal
cd /d "%~dp0"

echo [1/5] Build content
node tools\build-content.mjs || goto :fail

echo [2/5] Validate content/runtime
node tools\validate-content.mjs || goto :fail
node tools\audit-learning-content.mjs || goto :fail
node tools\validate-runtime.mjs || goto :fail
node tools\build-asset-manifest.mjs || goto :fail

echo [3/5] Confirm Firebase project
where firebase.cmd >nul 2>nul || (
  echo ERROR: firebase.cmd was not found. Install Firebase CLI first.
  goto :fail
)
call firebase.cmd use jk-english-5sec-grammar || goto :fail

echo [4/5] Deploy Hosting only
call firebase.cmd deploy --only "hosting" || goto :fail

echo [5/5] Finished

echo.
echo Deploy complete.
echo.
pause
exit /b 0

:fail
echo.
echo DEPLOY FAILED. Review the error message above.
echo.
pause
exit /b 1
