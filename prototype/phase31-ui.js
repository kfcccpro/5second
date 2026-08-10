(()=>{'use strict';
const $=id=>document.getElementById(id);
const DATA=window.JK_DATA||{questions:[]};
const CONTROL_LABELS=new Set([
  '다시 확인','다른 기준','판단 단계 시작','판단단계 시작','정답 보기','답 보기','다음','다음 단계','계속',
  '힌트 보기','교재 보기','원본 PDF 보기','한 번 더','다시 풀기','풀이 순서 시작','한 단계씩 풀기'
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
  const prompt=normalize(st.prompt);
  if(!/앞\s*동사|앞의\s*동사/.test(prompt))return '';
  const candidates=[];
  for(const c of q.choices||[]){
    let t=normalize(c).replace(/^to\s+/i,'').replace(/ing$/i,'').replace(/ed$/i,'').replace(/[^A-Za-z'’-]/g,'');
    if(t.length>=3&&t.toLowerCase()!==answer.toLowerCase())candidates.push(t);
  }
  return candidates[0]||'';
}
function semanticCandidates(q,st,pools){
  const answer=normalize(st.answer),out=[];
  const push=v=>{v=normalize(v);if(validChoice(v)&&v!==answer&&!out.includes(v))out.push(v)};
  push(st.semanticAlternative);
  push(PAIRS.get(answer));
  if(/^과거 일반동사\b/.test(answer))push('현재 시제 표현');
  if(/^현재 일반동사\b/.test(answer))push('과거 시제 표현');
  push(lexicalAlternative(q,st,answer));
  for(const pool of [pools.prompt.get(normalize(st.prompt)),pools.conceptStep.get(`${q.conceptId||''}::${st.id||''}`),pools.stepId.get(String(st.id||''))]){
    for(const v of pool||[])push(v);
    if(out.length)break;
  }
  return out;
}
function sanitizeDecisionSteps(){
  const pools=buildPools();let repaired=0,blocked=0,removed=0;
  for(const q of DATA.questions||[]){
    let invalid=false;
    for(const st of q.decisionSteps||[]){
      const answer=normalize(st.answer);
      let choices=[...new Set((Array.isArray(st.choices)?st.choices:[]).map(normalize).filter(validChoice))];
      removed+=(Array.isArray(st.choices)?st.choices.length:0)-choices.length;
      if(answer&&!choices.includes(answer))choices.unshift(answer);
      if(choices.filter(x=>x!==answer).length<1){
        const alt=semanticCandidates(q,st,pools).find(x=>x!==answer&&!choices.includes(x));
        if(alt){choices.push(alt);repaired++}
      }
      st.choices=choices;
      if(!answer||choices.length<2||!choices.includes(answer)){invalid=true;blocked++}
    }
    if(invalid&&q.interactionMode==='process_first'){
      // A stale cached dataset must never trap the learner behind a fake control-label choice.
      // Build-time validation is the primary protection; this browser guard is the last safety net.
      q.__jkProcessGuard='blocked-invalid-step';
      q.interactionMode='direct';
    }
  }
  window.JK_CONTENT_GUARD={repaired,blocked,removed,checkedAt:new Date().toISOString()};
  if(repaired||blocked||removed)console.info('[JK content guard]',window.JK_CONTENT_GUARD);
}
function injectLandscapeCss(){
  if(document.querySelector('link[data-jk-landscape-v12]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='maintenance-v1.2-landscape.css';link.dataset.jkLandscapeV12='true';document.head.appendChild(link);
}
function simplifyHome(){
  const mini=$('syncTop');if(mini)mini.textContent='오늘 학습';
  const details=document.querySelector('.selfStudy > summary');if(details)details.textContent='학습 도구';
  const device=document.querySelector('.deviceNote');if(device)device.textContent='필기와 저장 설정은 필요할 때만 확인하세요.';
}
function bindStart(){const b=$('todayStartBtn');if(!b||b.dataset.jk31Bound)return;b.dataset.jk31Bound='true';const original=b.onclick;b.onclick=async()=>{JK_PHASE31.setBusy(b,true,{busy:'오늘 학습 준비 중'});try{await original?.call(b)}catch(e){console.error(e);JK_PHASE31.notify('sync-error',{action:()=>b.click()})}finally{if(!$('study')?.classList.contains('hidden'))return;JK_PHASE31.setBusy(b,false)}}}
function bindPause(){const b=$('dailyPauseBtn');if(!b||b.dataset.jk31Bound)return;b.dataset.jk31Bound='true';b.onclick=async()=>{JK_PHASE31.setBusy(b,true,{busy:'여기까지 저장 중'});try{await window.pauseDailyLearning?.();JK_PHASE31.notify('paused',{dismissible:true})}catch(e){console.error(e);JK_PHASE31.notify('storage-attention',{dismissible:true})}finally{JK_PHASE31.setBusy(b,false,{idle:'여기까지 저장'})}}}
function updateStartCopy(){const b=$('todayStartBtn');if(!b)return;const t=b.textContent.trim();b.setAttribute('aria-label',t==='중단한 곳부터 이어하기'?'중단한 문제부터 오늘 학습 이어하기':'오늘 학습 시작')}
const EXACT_COPY=new Map([
  ['과정 우선 · 단계 통과 후 답 선택','답부터 고르지 말고 · 한 단계씩 풀기'],
  ['최종 답보다 판단 단계를 먼저 통과합니다.','답부터 고르지 말고, 무엇을 먼저 봐야 하는지 순서대로 확인합니다.'],
  ['판단 단계를 완료하면 답 선택이 열립니다.','풀이 순서를 끝내면 답을 고를 수 있습니다.'],
  ['판단 단계 시작','한 단계씩 다시 풀기'],
  ['판단 단계','풀이 순서'],
  ['판단 단계 완료','풀이 순서 완료'],
  ['판단 단계를 통과했습니다. 이제 최종 답을 선택하세요.','풀이 순서를 끝냈습니다. 이제 답을 고르세요.'],
  ['판단 단계를 통과했습니다. 문장에 저자식 표식을 남긴 뒤 답을 선택하세요.','풀이 순서를 끝냈습니다. 문장에 필요한 표시를 한 뒤 답을 고르세요.'],
  ['문장 표지와 자리 판단을 다시 확인하세요.','왼쪽 문장과 핵심 단서를 보고 다시 골라보세요.'],
  ['교재 요약과 저자식 표시를 다시 확인하세요.','왼쪽 교재 근거에서 방금 기준을 확인한 뒤 다시 골라보세요.']
]);
function friendlyText(text){
  const raw=String(text||'');
  if(EXACT_COPY.has(raw.trim()))return EXACT_COPY.get(raw.trim());
  let out=raw;
  out=out.replace(/답 선택 전 STEP\s*(\d+)\s*\/\s*(\d+)/g,'$1단계 / $2단계');
  out=out.replace(/STEP\s*(\d+)\s*\/\s*(\d+)/g,'$1단계 / $2단계');
  out=out.replace(/판단 단계 재연습/g,'풀이 순서 다시 연습');
  out=out.replace(/판단 단계/g,'풀이 순서');
  out=out.replace(/저자식 표식/g,'문장 표시');
  return out;
}
function polishNode(el){
  if(!el||el.nodeType!==1)return;
  const selectors=['#problemHint','#choiceGate','#stepBtn','#stepLabel','#stepPrompt','#stepFb','#preStepBox small','#preStepBox h3','.processGateHead strong','.processGateHead small','.sessionNote','.tag'];
  if(el.matches?.(selectors.join(','))){const next=friendlyText(el.textContent);if(next!==el.textContent)el.textContent=next}
  for(const node of el.querySelectorAll?.(selectors.join(','))||[]){const next=friendlyText(node.textContent);if(next!==node.textContent)node.textContent=next}
  const btn=$('stepBtn');if(btn&&btn.textContent.trim()==='판단 단계 시작')btn.textContent='한 단계씩 다시 풀기';
}
function addFlowLabels(){
  const card=$('questionCard');if(card&&!card.querySelector('.jkFlowLabel.problem')){
    const label=document.createElement('div');label.className='jkFlowLabel problem';label.textContent='문제 · 방금 본 문장';card.prepend(label);
  }
  const gate=$('processGateBox');if(gate&&!gate.querySelector('.jkFlowLabel.current')){
    const label=document.createElement('div');label.className='jkFlowLabel current';label.textContent='지금 할 것';gate.prepend(label);
  }
  const wrong=$('wrongCard');if(wrong&&!wrong.querySelector('.jkFlowGuide')){
    const guide=document.createElement('div');guide.className='jkFlowGuide';guide.innerHTML='<span>왼쪽 · 교재에서 기준 확인</span><b>→</b><span>오른쪽 · 한 단계씩 다시 풀기</span>';wrong.prepend(guide);
  }
}
function installCopyObserver(){
  const target=document.body;if(!target)return;
  let queued=false;
  const run=()=>{queued=false;polishNode(target);addFlowLabels()};
  new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(run)}).observe(target,{subtree:true,childList:true,characterData:true});
  run();
}
function install(){sanitizeDecisionSteps();injectLandscapeCss();simplifyHome();bindStart();bindPause();updateStartCopy();installCopyObserver();const target=$('todayStartBtn');if(target)new MutationObserver(updateStartCopy).observe(target,{childList:true,characterData:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
