import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'prototype','app-data.js'),'utf8'),ctx);
const D=ctx.window.JK_DATA;const errors=[];const ids=new Set();const concepts=new Set(D.concepts.map(x=>x.id));const sources=new Set(D.sources.map(x=>x.id));
for(const q of D.questions){
  if(!q.id)errors.push('question without id'); else if(ids.has(q.id))errors.push(`duplicate id ${q.id}`); else ids.add(q.id);
  if(!concepts.has(q.conceptId))errors.push(`${q.id}: unknown concept ${q.conceptId}`);
  if(!Array.isArray(q.choices)||q.choices.length<2)errors.push(`${q.id}: fewer than 2 choices`);
  if(!q.choices?.includes(q.answer))errors.push(`${q.id}: answer is not in choices`);
  if(q.interactionMode==='process_first'&&(!Array.isArray(q.decisionSteps)||!q.decisionSteps.length))errors.push(`${q.id}: process_first without decisionSteps`);
  if(q.remediation?.sourceRef&&!sources.has(q.remediation.sourceRef))errors.push(`${q.id}: unknown remediation source ${q.remediation.sourceRef}`);
  const c=q.remediation?.checkQuestion;if(c&&(!Array.isArray(c.choices)||!c.choices.includes(c.answer)))errors.push(`${q.id}: invalid checkQuestion`);
  if(q.requiresInk&&!q.annotationSpec)errors.push(`${q.id}: requiresInk without annotationSpec`);
}
const sample=D.questions.find(q=>q.id==='Q-G26-002-PF');
if(!sample||sample.interactionMode!=='process_first'||sample.answer!=='organizing')errors.push('known process-first regression fixture invalid');
const expected=D.bankManifest?.learnerQuestionRecordCount;if(expected&&expected!==D.questions.length)errors.push(`bank count mismatch manifest=${expected} actual=${D.questions.length}`);
const report={status:errors.length?'FAIL':'PASS',questions:D.questions.length,concepts:D.concepts.length,sources:D.sources.length,processFirst:D.questions.filter(q=>q.interactionMode==='process_first').length,requiresInk:D.questions.filter(q=>q.requiresInk).length,errors};
console.log(JSON.stringify(report,null,2));if(errors.length)process.exit(1);
