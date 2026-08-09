import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const appData=path.join(root,'prototype','app-data.js');
const ctx={window:{}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(appData,'utf8'),ctx);
const D=ctx.window.JK_DATA;

const critical=[];
const warnings=[];
const notes=[];
const questionsById=new Map(D.questions.map(q=>[q.id,q]));
const concepts=new Map(D.concepts.map(c=>[c.id,c]));
const perConcept=new Map();
const checkPromptCount=new Map();
const meaningless=/^(다시 확인|재확인|다른 기준|모르겠음|모르겠다|잘 모르겠음|확인 필요|기타)$/;
const tooGeneric=/^(이 표현 뒤의 형태는\?|뒤의 형태는\?|알맞은 것은\?|옳은 것은\?|무엇인가\?)$/;

function row(cid){
  if(!perConcept.has(cid))perConcept.set(cid,{questions:0,twoChoice:0,first:0,second:0,contextualChecks:0,legacyChecks:0,processSteps:0});
  return perConcept.get(cid);
}
function words(s){return (String(s||'').match(/[A-Za-z][A-Za-z'’-]*/g)||[]).length}
function norm(s){return String(s||'').toLowerCase().replace(/[\s·,.;:!?()[\]{}'"“”‘’/_-]+/g,' ').trim()}
function containsUnblankedChoice(prompt,choice){
  // A contextual micro-check is intentionally clozed. The same short token may
  // legitimately occur elsewhere in the sentence (e.g. "it" inside another word,
  // or "that" in a different clause). Treat exposure as critical only when there
  // is no visible cloze at all and the complete normalized choice is still shown.
  if(String(prompt||'').includes('_____'))return false;
  const p=` ${norm(prompt)} `,c=norm(choice);
  if(!p.trim()||!c||c.length<2)return false;
  return p.includes(` ${c} `);
}
function push(arr,type,q,extra={}){arr.push({type,questionId:q?.id||null,conceptId:q?.conceptId||null,...extra})}

let twoChoice=0,first=0,second=0,contextual=0,legacy=0,processSteps=0;
for(const q of D.questions){
  const r=row(q.conceptId);r.questions++;
  if(Array.isArray(q.choices)&&q.choices.length===2){
    twoChoice++;r.twoChoice++;
    const pos=q.choices.indexOf(q.answer);
    if(pos===0){first++;r.first++}else if(pos===1){second++;r.second++}
    if(new Set(q.choices).size!==2)push(critical,'duplicate-main-choice',q,{choices:q.choices});
  }
  for(const [i,s] of (q.decisionSteps||[]).entries()){
    processSteps++;r.processSteps++;
    const choices=s.choices||[];
    if(choices.length<2)push(critical,'process-choice-count',q,{step:i+1,prompt:s.prompt,choices});
    if(!choices.includes(s.answer))push(critical,'process-answer-missing',q,{step:i+1,prompt:s.prompt,answer:s.answer,choices});
    if(choices.some(x=>meaningless.test(String(x).trim())))push(critical,'meaningless-process-choice',q,{step:i+1,prompt:s.prompt,choices});
    if(new Set(choices).size!==choices.length)push(critical,'duplicate-process-choice',q,{step:i+1,prompt:s.prompt,choices});
    const max=Math.max(...choices.map(x=>String(x).length),0),min=Math.min(...choices.map(x=>String(x).length),999);
    if(choices.length===2&&max>=55&&max>Math.max(18,min*3.5))push(warnings,'process-choice-length-cue',q,{step:i+1,choices});
  }
  const c=q.remediation?.checkQuestion;
  if(c){
    checkPromptCount.set(c.prompt,(checkPromptCount.get(c.prompt)||0)+1);
    if(c.kind==='contextual_micro'){
      contextual++;r.contextualChecks++;
      const src=questionsById.get(c.sourceQuestionId);
      if(!src)push(critical,'micro-source-missing',q,{sourceQuestionId:c.sourceQuestionId});
      else{
        if(src.conceptId!==q.conceptId)push(critical,'micro-concept-mismatch',q,{sourceQuestionId:c.sourceQuestionId,sourceConceptId:src.conceptId});
        if(src.id===q.id)push(critical,'micro-self-reuse',q,{sourceQuestionId:c.sourceQuestionId});
        if(q.familyId&&src.familyId&&q.familyId===src.familyId)push(warnings,'micro-same-family',q,{sourceQuestionId:c.sourceQuestionId,familyId:q.familyId});
        if(norm(src.stem)===norm(q.stem))push(critical,'micro-duplicate-stem',q,{sourceQuestionId:c.sourceQuestionId});
      }
      if(words(c.prompt)<3&&!String(c.prompt).includes('_____'))push(warnings,'micro-low-context',q,{prompt:c.prompt});
      const exposed=(c.choices||[]).filter(x=>containsUnblankedChoice(c.prompt,x));
      if(exposed.length)push(critical,'micro-answer-exposure',q,{prompt:c.prompt,exposedChoices:exposed,sourceQuestionId:c.sourceQuestionId});
      if(!String(c.prompt||'').includes('_____')&&words(c.prompt)>=3)push(warnings,'micro-no-visible-gap',q,{prompt:c.prompt,sourceQuestionId:c.sourceQuestionId});
    }else{
      legacy++;r.legacyChecks++;
      if(tooGeneric.test(String(c.prompt).trim())||words(c.prompt)<2)push(warnings,'legacy-abstract-check',q,{prompt:c.prompt});
    }
    if(!Array.isArray(c.choices)||c.choices.length<2||!c.choices.includes(c.answer))push(critical,'invalid-check-question',q,{prompt:c.prompt,answer:c.answer,choices:c.choices});
    if(new Set(c.choices||[]).size!==(c.choices||[]).length)push(critical,'duplicate-check-choice',q,{prompt:c.prompt,choices:c.choices});
    if((c.choices||[]).some(x=>meaningless.test(String(x).trim())))push(critical,'meaningless-check-choice',q,{prompt:c.prompt,choices:c.choices});
  }
}

if(twoChoice){
  const ratio=first/twoChoice;
  if(ratio<0.42||ratio>0.58)critical.push({type:'global-answer-position-bias',first,second,total:twoChoice,ratio});
}
for(const [cid,r] of perConcept){
  if(r.twoChoice>=12){
    const ratio=r.first/r.twoChoice;
    if(ratio<0.25||ratio>0.75)warnings.push({type:'concept-answer-position-skew',conceptId:cid,concept:concepts.get(cid)?.name||cid,first:r.first,second:r.second,total:r.twoChoice,ratio});
  }
}
for(const [prompt,count] of checkPromptCount){if(count>=25)warnings.push({type:'repeated-check-prompt',count,prompt});}
const coverage=contextual/Math.max(1,contextual+legacy);
if(coverage<0.8)warnings.push({type:'contextual-check-coverage',contextual,legacy,coverage});

const report={generatedAt:new Date().toISOString(),profile:'highschool-single-learner-v1.2',status:critical.length?'FAIL':'PASS',summary:{questions:D.questions.length,concepts:D.concepts.length,processSteps,twoChoice:{total:twoChoice,answerFirst:first,answerSecond:second},checks:{contextual,legacy,coverage:Number(coverage.toFixed(4))},critical:critical.length,warnings:warnings.length},critical:critical.slice(0,160),warnings:warnings.slice(0,200),notes,perConcept:Object.fromEntries([...perConcept.entries()].map(([k,v])=>[k,v]))};
const outDir=path.join(root,'.qa');fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'learner-content-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary,null,2));console.log(`learner content audit: ${report.status} (full report: .qa/learner-content-audit.json)`);if(critical.length)process.exit(1);
