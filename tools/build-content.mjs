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
const rawQuestions=order.map(id=>{const q=byId.get(id);if(!q)throw new Error(`question missing from content source: ${id}`);return structuredClone(q)});
if(rawQuestions.length!==byId.size)throw new Error(`question order mismatch: order=${rawQuestions.length} files=${byId.size}`);

// Maintenance content normalization v1.1
// Source JSON stays faithful to the authored bank. Runtime data is normalized for a
// single high-school learner: meaningful process contrasts, applied micro-checks,
// and balanced two-choice positions to reduce unconscious answer-position cues.
const hash=s=>{let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const uniq=a=>[...new Set(a.filter(x=>x!=null&&String(x).trim()!==''))];
const promptPool=new Map(),conceptStepPool=new Map(),stepIdPool=new Map(),conceptQuestions=new Map();
const pushPool=(map,key,val)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(val)};
for(const q of rawQuestions){
  pushPool(conceptQuestions,q.conceptId,q);
  for(const st of q.decisionSteps||[]){
    pushPool(promptPool,st.prompt,st.answer);
    pushPool(conceptStepPool,`${q.conceptId}::${st.id||''}`,st.answer);
    pushPool(stepIdPool,st.id||'',st.answer);
  }
}
for(const map of [promptPool,conceptStepPool,stepIdPool])for(const [k,v] of map)map.set(k,uniq(v));

const exactPairs=new Map([
  ['O','X'],['X','O'],['그렇다','아니다'],['아니다','그렇다'],['있다','없다'],['없다','있다'],
  ['to-V','V-ing'],['V-ing','to-V'],['단수','복수'],['복수','단수'],['현재','과거'],['과거','현재'],
  ['현재 시제','과거 시제'],['과거 시제','현재 시제'],['과거형','현재형'],['현재형','과거형'],['형용사','부사'],['부사','형용사'],
  ['완전하다','불완전하다'],['불완전하다','완전하다'],['전치사','접속사'],['접속사','전치사'],
  ['끝났다','끝나지 않았다'],['확인했다','아직 확인하지 않았다'],['2개','1개'],['1개','2개'],
  ['to-V 행동','V-ing 행동'],['to 앞','to 뒤'],['불가능하다','가능하다'],['가능하다','불가능하다'],
  ['이미 끝난 과거','현재와 연결된 과거'],['남을 수 있다','남을 수 없다'],['남을 수 없다','남을 수 있다'],
  ['0개','1개'],['남아 있다','남아 있지 않다'],['진행 중','완료됨'],['현재완료','과거 시제'],
  ['spent','took'],['that절','to부정사'],['to','생략'],['without','with'],['부사절이다','명사절이다'],
  ['단수로 본다','복수로 본다'],['that the company would close','the company'],['장소 부사구','주어'],
  ['사람','사물'],['쓸 수 없다','쓸 수 있다'],['to부정사','동명사'],['Never','Only then'],
  ['people','the policy'],['현재·미래','과거'],['now, 현재','과거'],['동시점','이전 시점'],
  ['that','what'],['what','that'],['which','what'],['where','when'],['when','where'],['why','where'],
  ['동사원형','p.p.'],['p.p.','V-ing'],['one','it'],['it','one'],['much','many'],['many','much']
]);

function answerClass(answer){
  const a=String(answer||'').trim();
  if(['O','X'].includes(a))return 'ox';
  if(['그렇다','아니다'].includes(a))return 'yesno';
  if(['있다','없다'].includes(a))return 'exist';
  if(['가능하다','불가능하다','남을 수 있다','남을 수 없다'].includes(a))return 'possibility';
  if(/^(단수|복수|단수로 본다|복수로 본다|1개|2개|3개)$/.test(a))return 'number';
  if(/^(현재|과거|미래|현재 시제|과거 시제|현재완료|현재완료 시제|과거완료|과거형|현재형|이미 끝난 과거|동시점)$/.test(a))return 'tense';
  if(/to-V|V-ing|p\.p\.|동사원형|과거분사|현재분사|would|could|might|should|have\/has \+ p\.p\.|had \+? ?p\.p\.|did\+|were로|과거형 knew/i.test(a))return 'verbform';
  if(/^(that|what|which|who|whom|whose|where|when|why|how|whatever|However)$/.test(a))return 'connectorword';
  if(/^(형용사|부사|전치사|접속사|관계대명사|관계부사|명사절 주어|부사절이다|준동사 자리|본동사 자리|장소 부사구)$/.test(a))return 'grammarrole';
  if(a.length>55)return 'rule';
  if(/\s/.test(a))return 'phrase';
  return 'lexical';
}

function semanticAlternative(answer){
  if(exactPairs.has(answer))return exactPairs.get(answer);
  const a=String(answer);
  if(/^had \+? ?p\.p\.$/i.test(a)||a==='had p.p.')return 'have/has + p.p.';
  if(/^have\/has \+ p\.p\.$/i.test(a))return 'had + p.p.';
  if(a.startsWith('would have p.p.'))return 'would + 동사원형';
  if(a.startsWith('would + 동사원형'))return 'would have p.p.';
  if(a.includes('관계대명사'))return '관계부사';
  if(a.includes('관계부사'))return '관계대명사';
  if(a.includes('주어'))return '목적어';
  if(a.includes('목적어'))return '주어';
  if(a.includes('준동사 자리'))return '본동사 자리';
  if(a.includes('본동사 자리'))return '준동사 자리';
  return null;
}
function orderTwo(choices,answer,key){
  const c=uniq(choices);
  if(c.length!==2||!c.includes(answer))return c;
  const desired=hash(key)%2;
  const idx=c.indexOf(answer);
  return idx===desired?c:[c[1],c[0]];
}
function processChoices(q,st,stepNo){
  let c=uniq(st.choices||[]);
  if(c.length<2&&Array.isArray(q.choices)&&q.choices.length>=2&&q.choices.includes(st.answer))c=[...q.choices];
  if(c.length<2){const alt=semanticAlternative(st.answer);if(alt)c=[st.answer,alt]}
  if(c.length<2){
    const pools=[promptPool.get(st.prompt),conceptStepPool.get(`${q.conceptId}::${st.id||''}`),stepIdPool.get(st.id||'')];
    for(const pool of pools){
      const cls=answerClass(st.answer);
      let alt=(pool||[]).filter(x=>x!==st.answer&&answerClass(x)===cls);
      if(!alt.length&&cls==='phrase')alt=(pool||[]).filter(x=>x!==st.answer&&['phrase','lexical'].includes(answerClass(x)));
      if(alt.length){c=[st.answer,alt[hash(`${q.id}:${st.id}:${stepNo}`)%alt.length]];break}
    }
  }
  if(c.length<2)c=[st.answer,'다른 기준']; // validator will flag if this fallback is ever reached.
  return orderTwo(c,st.answer,`${q.id}:step:${stepNo}`);
}
function clozeStem(stem,choices=[]){
  let s=String(stem||'').trim();
  const pairs=[...s.matchAll(/[\[(]([^\])]+\s*\/\s*[^\])]+)[\])]/g)];
  for(const m of pairs){
    const body=m[1];
    const hits=choices.filter(x=>body.includes(String(x))).length;
    if(hits>=Math.min(2,choices.length)){s=s.replace(m[0],'_____');break}
  }
  return s;
}
function microCandidate(q){
  const all=(conceptQuestions.get(q.conceptId)||[]).filter(x=>x.id!==q.id&&Array.isArray(x.choices)&&x.choices.length>=2);
  if(!all.length)return null;
  const scored=all.map(x=>{
    let score=0;
    if(x.familyId&&q.familyId&&x.familyId!==q.familyId)score+=80;
    if(x.variantType==='core')score+=60;
    if(x.interactionMode==='direct')score+=45;
    if(!x.requiresInk)score+=20;
    if(Number(x.difficulty||2)<=Math.max(2,Number(q.difficulty||2)))score+=18;
    const stem=String(x.stem||'');
    const len=stem.length;
    const englishWords=(stem.match(/[A-Za-z][A-Za-z'’-]*/g)||[]).length;
    if(englishWords>=4)score+=55;else if(englishWords>=2)score+=12;else score-=40;
    if(len<=120)score+=35;else if(len<=180)score+=22;else if(len<=260)score+=8;else score-=20;
    if(englishWords<2&&/[?？]\s*$/.test(stem))score-=25;
    score-=Math.abs(Number(x.difficulty||2)-Number(q.difficulty||2))*3;
    return{x,score};
  }).sort((a,b)=>b.score-a.score||String(a.x.id).localeCompare(String(b.x.id)));
  const top=scored.slice(0,Math.min(5,scored.length));
  return top[hash(`${q.id}:micro`)%top.length]?.x||scored[0].x;
}
function contextualCheck(q){
  const x=microCandidate(q);
  if(x){
    return{
      prompt:clozeStem(x.stem,x.choices),
      choices:orderTwo(x.choices,x.answer,`${q.id}:micro-choice`),
      answer:x.answer,
      sourceQuestionId:x.id,
      kind:'contextual_micro'
    };
  }
  const old=q.remediation?.checkQuestion;
  if(!old)return null;
  return{...old,choices:orderTwo(old.choices,old.answer,`${q.id}:micro-fallback`),kind:'legacy_fallback'};
}
const questions=rawQuestions.map(q=>{
  const out={...q};
  out.choices=orderTwo(q.choices,q.answer,`${q.id}:main-choice`);
  out.decisionSteps=(q.decisionSteps||[]).map((st,i)=>({...st,choices:processChoices(q,st,i)}));
  if(q.remediation){out.remediation={...q.remediation,checkQuestion:contextualCheck(q)}}
  out.runtimeContentProfile='highschool-single-learner-v1.1';
  return out;
});

const data={concepts:meta.concepts,questions,errors:meta.errors,sources:meta.sources,learningPaths:meta.learningPaths,annotationSpecs:meta.annotationSpecs,questionFamilies:meta.questionFamilies,bankManifest:meta.bankManifest};
const body='window.JK_DATA='+JSON.stringify(data)+';';
const out=path.join(root,'prototype','app-data.js');
fs.writeFileSync(out,body);
const sha=crypto.createHash('sha256').update(body).digest('hex');
const stepFallbacks=questions.flatMap(q=>q.decisionSteps||[]).filter(s=>s.choices?.includes('다른 기준')).length;
const contextualChecks=questions.filter(q=>q.remediation?.checkQuestion?.kind==='contextual_micro').length;
console.log(`built prototype/app-data.js (${questions.length} questions, sha256 ${sha})`);
console.log(`normalized learner content: contextualChecks=${contextualChecks}, unresolvedStepFallbacks=${stepFallbacks}`);
