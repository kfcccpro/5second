@echo off
setlocal
cd /d "%~dp0"
node tools\build-content.mjs || exit /b 1
node tools\validate-content.mjs || exit /b 1
node tools\validate-runtime.mjs || exit /b 1
node tools\build-asset-manifest.mjs || exit /b 1
firebase.cmd use jk-english-5sec-grammar || exit /b 1
firebase.cmd deploy --only "firestore:rules,hosting" || exit /b 1
endlocal
