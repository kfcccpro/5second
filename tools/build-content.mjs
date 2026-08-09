import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const srcDir=path.join(root,'content-src');
const meta=JSON.parse(fs.readFileSync(path.join(srcDir,'meta.json'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(srcDir,'catalog.json'),'utf8'));
const order=JSON.parse(fs.readFileSync(path.join(srcDir,'question-order.json'),'utf8'));
const byId=new Map();
for(const item of catalog){
  const rows=JSON.parse(fs.readFileSync(path.join(srcDir,item.file),'utf8'));
  for(const q of rows){if(byId.has(q.id))throw new Error(`duplicate question id: ${q.id}`);byId.set(q.id,q)}
}
const questions=order.map(id=>{const q=byId.get(id);if(!q)throw new Error(`question missing from content source: ${id}`);return q});
if(questions.length!==byId.size)throw new Error(`question order mismatch: order=${questions.length} files=${byId.size}`);
const data={concepts:meta.concepts,questions,errors:meta.errors,sources:meta.sources,learningPaths:meta.learningPaths,annotationSpecs:meta.annotationSpecs,questionFamilies:meta.questionFamilies,bankManifest:meta.bankManifest};
const body='window.JK_DATA='+JSON.stringify(data)+';';
const out=path.join(root,'prototype','app-data.js');
fs.writeFileSync(out,body);
const sha=crypto.createHash('sha256').update(body).digest('hex');
console.log(`built prototype/app-data.js (${questions.length} questions, sha256 ${sha})`);
