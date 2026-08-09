import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'prototype','app-data.js'),'utf8'),ctx);
const D=ctx.window.JK_DATA;const errors=[];const warnings=[];const ids=new Set();const concepts=new Set(D.concepts.map(x=>x.id));const sources=new Set(D.sources.map(x=>x.id));
let twoChoice=0,answerFirst=0,answerSecond=0,contextualChecks=0,legacyChecks=0,processStepCount=0;
for(const q of D.questions){
  if(!q.id)errors.push('question without id'); else if(ids.has(q.id))errors.push(`duplicate id ${q.id}`); else ids.add(q.id);
  if(!concepts.has(q.conceptId))errors.push(`${q.id}: unknown concept ${q.conceptId}`);
  if(!Array.isArray(q.choices)||q.choices.length<2)errors.push(`${q.id}: fewer than 2 choices`);
  if(!q.choices?.includes(q.answer))errors.push(`${q.id}: answer is not in choices`);
  if(q.choices?.length===2){twoChoice++;const pos=q.choices.indexOf(q.answer);if(pos===0)answerFirst++;if(pos===1)answerSecond++;}
  if(q.interactionMode==='process_first'&&(!Array.isArray(q.decisionSteps)||!q.decisionSteps.length))errors.push(`${q.id}: process_first without decisionSteps`);
  for(const s of q.decisionSteps||[]){
    processStepCount++;
    if(!Array.isArray(s.choices)||s.choices.length<2)errors.push(`${q.id}/${s.id||'?'}: process step has fewer than 2 choices`);
    if(!s.choices?.includes(s.answer))errors.push(`${q.id}/${s.id||'?'}: process step answer is not in choices`);
    if(s.choices?.includes('다른 기준'))errors.push(`${q.id}/${s.id||'?'}: meaningless fallback choice remains`);
    if(new Set(s.choices||[]).size!==(s.choices||[]).length)errors.push(`${q.id}/${s.id||'?'}: duplicate process choices`);
  }
  if(q.remediation?.sourceRef&&!sources.has(q.remediation.sourceRef))errors.push(`${q.id}: unknown remediation source ${q.remediation.sourceRef}`);
  const c=q.remediation?.checkQuestion;
  if(c){
    if(!Array.isArray(c.choices)||!c.choices.includes(c.answer))errors.push(`${q.id}: invalid checkQuestion`);
    if(c.choices?.length<2)errors.push(`${q.id}: checkQuestion has fewer than 2 choices`);
    if(c.kind==='contextual_micro')contextualChecks++;else legacyChecks++;
    if(c.kind==='contextual_micro'&&!c.sourceQuestionId)errors.push(`${q.id}: contextual micro check missing sourceQuestionId`);
    if(/have difficulty·cannot help·be busy 뒤의 형태는\?/.test(c.prompt||''))warnings.push(`${q.id}: legacy abstract G26 check remains`);
  }
  if(q.requiresInk&&!q.annotationSpec)errors.push(`${q.id}: requiresInk without annotationSpec`);
}
const sample=D.questions.find(q=>q.id==='Q-G26-002-PF');
if(!sample||sample.interactionMode!=='process_first'||sample.answer!=='organizing')errors.push('known process-first regression fixture invalid');
const expected=D.bankManifest?.learnerQuestionRecordCount;if(expected&&expected!==D.questions.length)errors.push(`bank count mismatch manifest=${expected} actual=${D.questions.length}`);
if(twoChoice){const ratio=answerFirst/twoChoice;if(ratio<0.35||ratio>0.65)errors.push(`two-choice answer-position bias too high: first=${answerFirst}/${twoChoice}`);}
if(contextualChecks<Math.floor(D.questions.length*0.7))warnings.push(`contextual micro checks cover only ${contextualChecks}/${D.questions.length}`);
const report={status:errors.length?'FAIL':'PASS',questions:D.questions.length,concepts:D.concepts.length,sources:D.sources.length,processFirst:D.questions.filter(q=>q.interactionMode==='process_first').length,requiresInk:D.questions.filter(q=>q.requiresInk).length,processStepCount,twoChoice:{total:twoChoice,answerFirst,answerSecond},checks:{contextual:contextualChecks,legacy:legacyChecks},warnings:warnings.slice(0,40),errors};
console.log(JSON.stringify(report,null,2));if(errors.length)process.exit(1);
