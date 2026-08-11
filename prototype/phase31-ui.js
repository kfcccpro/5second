(()=>{'use strict';
const $=id=>document.getElementById(id);
const DATA=window.JK_DATA||{questions:[]};
const CONTROL_LABELS=new Set([
  '다시 확인','다른 기준','판단 단계 시작','판단단계 시작','정답 보기','답 보기','다음','다음 단계','계속',
  '힌트 보기','교재 보기','원본 PDF 보기','한 번 더','다시 풀기','풀이 순서 시작','한 단계씩 풀기','한 단계씩 다시 풀기'
]);
const PAIRS=new Map([
  ['O','X'],['X','O'],['그렇다','아니다'],['아니다','그렇다'],['있다','없다'],['없다','있다'],
  ['to-V','V-ing'],['V-ing','to-V'],['to + 동사원형','~ing'],['~ing','to + 동사원형'],
  ['단수','복수'],['복수','단수'],['단수동사','복수동사'],['복수동사','단수동사'],
  ['현재','과거'],['과거','현재'],['현재 시제','과거 시제'],['과거 시제','현재 시제'],
  ['형용사','부사'],['부사','형용사'],['사람','사물'],['사물','사람'],
  ['관계대명사 that','명사절 접속사 that'],['명사절 접속사 that','관계대명사 that'],
  ['관계대명사','관계부사'],['관계부사','관계대명사'],
  ['주어와 앞 동사가 능동','주어가 앞 동사의 대상'],['주어가 앞 동사의 대상','주어와 앞 동사가 능동'],
  ['부정문','긍정문'],['긍정문','부정문'],['do','be동사'],['be동사','do'],
  ['형용사 보어','부사 수식'],['부사 수식','형용사 보어'],
  ['일반동사의 수행','상태·감각 연결'],['상태·감각 연결','일반동사의 수행']
]);
const normalize=s=>String(s??'').replace(/\s+/g,' ').trim();
const validChoice=s=>{const t=normalize(s);return !!t&&!CONTROL_LABELS.has(t)};
const addPool=(map,key,value)=>{if(!key||!value)return;if(!map.has(key))map.set(key,[]);map.get(key).push(value)};
function buildPools(){
  const pools={prompt:new Map(),conceptStep:new Map(),stepId:new Map()};
  for(const q of DATA.questions||[])for(const st of q.decisionSteps||[]){
    addPool(pools.prompt,normalize(st.prompt),normalize(st.answer));
    addPool(pools.conceptStep,`${q.conceptId||''}::${st.id||''}`,normalize(st.answer));
    addPool(pools.stepId,String(st.id||''),normalize(st.answer));
  }
  return pools;
}
function lexicalAlternative(q,st,answer){
  const prompt=normalize(st.prompt);if(!/앞\s*동사|앞의\s*동사/.test(prompt))return '';
  for(const c of q.choices||[]){const t=normalize(c).replace(/^to\s+/i,'').replace(/ing$/i,'').replace(/ed$/i,'').replace(/[^A-Za-z'’-]/g,'');if(t.length>=3&&t.toLowerCase()!==answer.toLowerCase())return t}return '';
}
function semanticCandidates(q,st,pools){
  const answer=normalize(st.answer),out=[];const push=v=>{v=normalize(v);if(validChoice(v)&&v!==answer&&!out.includes(v))out.push(v)};
  push(st.semanticAlternative);push(PAIRS.get(answer));
  if(/^과거 일반동사\b/.test(answer))push('현재 시제 표현');if(/^현재 일반동사\b/.test(answer))push('과거 시제 표현');push(lexicalAlternative(q,st,answer));
  for(const pool of [pools.prompt.get(normalize(st.prompt)),pools.conceptStep.get(`${q.conceptId||''}::${st.id||''}`),pools.stepId.get(String(st.id||''))]){for(const v of pool||[])push(v);if(out.length)break}return out;
}
function sanitizeDecisionSteps(){
  const pools=buildPools();let repaired=0,blocked=0,removed=0;
  for(const q of DATA.questions||[]){let invalid=false;
    for(const st of q.decisionSteps||[]){const answer=normalize(st.answer);let choices=[...new Set((Array.isArray(st.choices)?st.choices:[]).map(normalize).filter(validChoice))];removed+=(Array.isArray(st.choices)?st.choices.length:0)-choices.length;if(answer&&!choices.includes(answer))choices.unshift(answer);if(choices.filter(x=>x!==answer).length<1){const alt=semanticCandidates(q,st,pools).find(x=>x!==answer&&!choices.includes(x));if(alt){choices.push(alt);repaired++}}st.choices=choices;if(!answer||choices.length<2||!choices.includes(answer)){invalid=true;blocked++}}
    if(invalid&&q.interactionMode==='process_first'){q.__jkProcessGuard='blocked-invalid-step';q.interactionMode='direct'}
  }
  window.JK_CONTENT_GUARD={repaired,blocked,removed,checkedAt:new Date().toISOString()};
}

/* One meaningful process check is enough before the answer. Keep the author-style reasoning,
   remove the multi-screen ceremony. */
function promptScore(text,index){let s=index*2;const t=normalize(text);if(/주어|동사|목적어|보어|능동|수동|시제|수일치|전치사|접속사|관계|분사|동명사|to부정사|준동사|대명사|수식/.test(t))s+=8;if(/판단\s*체계|작동시킬|단계|먼저\s*볼|무엇을\s*먼저/.test(t))s-=8;if(t.length>55)s-=3;return s}
function simplePrompt(text){let t=normalize(text);
  const exact=new Map([
    ['이 문항에서 먼저 작동시킬 판단 체계는?','먼저 확인할 것은?'],
    ['먼저 확인할 시점·표현은?','시제 단서는?'],
    ['먼저 확인할 시점·표현은 무엇인가?','시제 단서는?'],
    ['이 문항에서 먼저 확인할 것은?','먼저 볼 것은?'],
    ['이 문항에서 먼저 볼 것은?','먼저 볼 것은?']
  ]);if(exact.has(t))return exact.get(t);
  t=t.replace(/^이 문항에서\s*/,'').replace(/판단\s*체계/g,'기준').replace(/작동시킬/g,'볼').replace(/먼저\s+먼저/g,'먼저');
  if(t.length>48)t=t.replace(/무엇인가\?/,'?').replace(/무엇인가요\?/,'?');return t;
}
function compactDecisionSteps(){let compacted=0;
  for(const q of DATA.questions||[]){if(q.interactionMode!=='process_first'||!Array.isArray(q.decisionSteps)||q.decisionSteps.length<2)continue;const ranked=q.decisionSteps.map((st,i)=>({st,i,score:promptScore(st.prompt,i)})).sort((a,b)=>b.score-a.score);const pick={...ranked[0].st,prompt:simplePrompt(ranked[0].st.prompt),choices:[...(ranked[0].st.choices||[])]};q.__jkOriginalDecisionStepCount=q.decisionSteps.length;q.decisionSteps=[pick];compacted++}
  window.JK_SIMPLE_PROCESS={compacted,mode:'one-core-check'};
}
function injectSimpleCss(){if(document.querySelector('link[data-jk-simple-v14]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='maintenance-v1.4-simple.css';link.dataset.jkSimpleV14='true';document.head.appendChild(link)}
function simplifyHome(){const mini=$('syncTop');if(mini)mini.textContent='오늘 학습';const details=document.querySelector('.selfStudy > summary');if(details)details.textContent='학습 도구';const device=document.querySelector('.deviceNote');if(device)device.textContent='필기와 저장 설정은 필요할 때만 확인하세요.'}
function bindStart(){const b=$('todayStartBtn');if(!b||b.dataset.jk31Bound)return;b.dataset.jk31Bound='true';const original=b.onclick;b.onclick=async()=>{JK_PHASE31.setBusy(b,true,{busy:'준비 중'});try{await original?.call(b)}catch(e){console.error(e);JK_PHASE31.notify('sync-error',{action:()=>b.click()})}finally{if(!$('study')?.classList.contains('hidden'))return;JK_PHASE31.setBusy(b,false)}}}
function bindPause(){const b=$('dailyPauseBtn');if(!b||b.dataset.jk31Bound)return;b.dataset.jk31Bound='true';b.onclick=async()=>{JK_PHASE31.setBusy(b,true,{busy:'저장 중'});try{await window.pauseDailyLearning?.();JK_PHASE31.notify('paused',{dismissible:true})}catch(e){console.error(e);JK_PHASE31.notify('storage-attention',{dismissible:true})}finally{JK_PHASE31.setBusy(b,false,{idle:'여기까지 저장'})}}}

const GENERIC_HINTS=[
 '문제를 먼저 판단합니다. 필요한 이론은 실패 단계에서만 열립니다.',
 '최종 답보다 판단 단계를 먼저 통과합니다.',
 '답부터 고르지 말고, 무엇을 먼저 봐야 하는지 순서대로 확인합니다.',
 '풀이 순서를 끝내면 답을 고를 수 있습니다.',
 '판단 단계를 완료하면 답 선택이 열립니다.'
];
function friendlyText(text){let out=String(text||'');
  out=out.replace(/답 선택 전 STEP\s*\d+\s*\/\s*\d+/g,'').replace(/STEP\s*\d+\s*\/\s*\d+/g,'');
  out=out.replace(/판단 단계 재연습/g,'핵심 확인').replace(/판단 단계 시작/g,'확인문제 풀기').replace(/판단 단계/g,'핵심 확인').replace(/풀이 순서/g,'핵심 확인').replace(/저자식 표식/g,'문장 표시');return out.trim()}
function ensureCorrectAnswer(){const card=$('correctCard');if(!card)return;let pill=card.querySelector('.jkAnswerOnly');if(!pill){pill=document.createElement('div');pill.className='jkAnswerOnly';const h=card.querySelector('h2');h?.insertAdjacentElement('afterend',pill)}const marked=$('choices')?.querySelector('.choice.correct');pill.textContent=marked?.textContent?.trim()||'정답 확인'}
function ensureSourceFallback(){const card=$('wrongCard'),img=$('sourceImg');if(!card||!img)return;let fb=card.querySelector('.jkSourceFallback');if(!fb){fb=document.createElement('div');fb.className='jkSourceFallback';fb.textContent='교재 이미지를 불러오지 못했습니다. 원본 PDF로 확인하세요.';img.insertAdjacentElement('afterend',fb)}const showFallback=()=>{img.classList.add('jkAssetMissing');fb.classList.add('jkVisible')};const showImage=()=>{if(img.naturalWidth>0){img.classList.remove('jkAssetMissing');fb.classList.remove('jkVisible')}};if(!img.dataset.jkFallbackBound){img.dataset.jkFallbackBound='1';img.addEventListener('error',showFallback);img.addEventListener('load',showImage)}if(img.complete){img.naturalWidth>0?showImage():showFallback()}}
function simplifyWrongAction(){const b=$('stepBtn');if(!b)return;b.textContent='확인문제 풀기';if(b.dataset.jkSimpleRecovery)return;b.dataset.jkSimpleRecovery='1';b.addEventListener('click',e=>{if($('wrongCard')?.classList.contains('hidden'))return;e.preventDefault();e.stopImmediatePropagation();if(typeof window.showMicro==='function')window.showMicro();else if(typeof showMicro==='function')showMicro()},true)}
function syncUiState(){
  const study=$('study'),correct=$('correctCard'),wrong=$('wrongCard'),hint=$('problemHint');if(!study)return;
  const correctOpen=correct&&!correct.classList.contains('hidden'),wrongOpen=wrong&&!wrong.classList.contains('hidden');study.classList.toggle('jkResultCorrect',!!correctOpen);study.classList.toggle('jkResultWrong',!!wrongOpen);
  if(correctOpen)ensureCorrectAnswer();if(wrongOpen)ensureSourceFallback();
  if(hint){const t=normalize(hint.textContent);hint.classList.toggle('jkGenericHint',GENERIC_HINTS.some(x=>t===x)||/답부터 고르지 말고|필요한 이론은 실패 단계|풀이 순서를 끝내면/.test(t))}
  const head=$('processGateBox')?.querySelector('.processGateHead strong');if(head)head.textContent='핵심 확인';const sub=$('processGateBox')?.querySelector('.processGateHead small');if(sub)sub.textContent='';
  const pre=$('preStepBox');if(pre){for(const h3 of pre.querySelectorAll('h3'))h3.textContent=simplePrompt(h3.textContent);for(const small of pre.querySelectorAll('small'))small.textContent=''}
  const step=$('stepBox');if(step){for(const h3 of step.querySelectorAll('h3'))h3.textContent=simplePrompt(h3.textContent)}
  const btn=$('homeBtn1');if(btn)btn.textContent='';
}
function installObserver(){let queued=false;const run=()=>{queued=false;syncUiState()};new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(run)}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','src']});run()}
function install(){sanitizeDecisionSteps();compactDecisionSteps();injectSimpleCss();simplifyHome();bindStart();bindPause();simplifyWrongAction();ensureSourceFallback();installObserver()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
