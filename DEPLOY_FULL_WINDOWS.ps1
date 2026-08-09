$ErrorActionPreference = "Stop"
node .\tools\build-content.mjs
node .\tools\validate-content.mjs
node .\tools\validate-runtime.mjs
firebase.cmd use jk-english-5sec-grammar
firebase.cmd deploy --only "firestore:rules,hosting"
