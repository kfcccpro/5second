import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(here,'..');
const html=fs.readFileSync(path.join(root,'prototype','index.html'),'utf8');const js=fs.readFileSync(path.join(root,'prototype','app.js'),'utf8');const css=fs.readFileSync(path.join(root,'prototype','maintenance-v1.css'),'utf8');const failures=[];
for(const token of ['maintenance-v1.css','id="processGateBox"','id="preStepBox"','id="choiceGate"'])if(!html.includes(token))failures.push(`index missing ${token}`);
if(!js.includes("$('processGateBox')?.classList.remove('hidden')"))failures.push('process gate is not opened in question card');
if(js.includes("function startProcessGate(){processGateDone=false;stepIndex=0;$('stepBox')"))failures.push('legacy hidden-parent process gate bug remains');
for(const token of ['@media (max-width:699px)','@media (min-width:700px) and (max-width:1099px)','@media (min-width:1400px)','.choiceGate','.processGateBox'])if(!css.includes(token))failures.push(`responsive css missing ${token}`);
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',checks:9,failures},null,2));if(failures.length)process.exit(1);
