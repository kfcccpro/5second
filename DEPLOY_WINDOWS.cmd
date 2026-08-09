@echo off
setlocal
cd /d "%~dp0"

echo [1/4] Build content
node tools\build-content.mjs || exit /b 1

echo [2/4] Validate content/runtime
node tools\validate-content.mjs || exit /b 1
node tools\validate-runtime.mjs || exit /b 1
node tools\build-asset-manifest.mjs || exit /b 1

echo [3/4] Confirm Firebase project
firebase.cmd use jk-english-5sec-grammar || exit /b 1

echo [4/4] Deploy Hosting only
firebase.cmd deploy --only "hosting" || exit /b 1

echo.
echo Deploy complete.
endlocal
