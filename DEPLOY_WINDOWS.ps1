$ErrorActionPreference = "Stop"
Write-Host "[1/4] Build content"
node .\tools\build-content.mjs
Write-Host "[2/4] Validate content/runtime"
node .\tools\validate-content.mjs
node .\tools\validate-runtime.mjs
Write-Host "[3/4] Confirm Firebase project"
firebase.cmd use jk-english-5sec-grammar
Write-Host "[4/4] Deploy Hosting only"
firebase.cmd deploy --only "hosting"
