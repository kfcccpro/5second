(() => {
  'use strict';
  const AXES = [
    ['conceptActivation','개념 활성화'], ['stageExecution','단계 수행'], ['evidenceJudgment','근거 판단'],
    ['finalAccuracy','최종 정확도'], ['paceStability','페이스 안정'], ['recoveryTransfer','회복·전이']
  ];
  const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n || 0))));
  const average = values => values.length ? values.reduce((a,b)=>a+Number(b||0),0)/values.length : null;
  const pct = (n,d) => d ? 100*n/d : 0;
  const dayId = date => window.JK_STORAGE?.localDateId ? window.JK_STORAGE.localDateId(date) : `DAY-${new Date(date || Date.now()).toISOString().slice(0,10)}`;
  const seeded = text => { let h=2166136261; for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)} return Math.abs(h); };
  const dateOrdinal = date => Math.floor((Date.UTC(new Date(date).getFullYear(),new Date(date).getMonth(),new Date(date).getDate())-Date.UTC(2026,0,1))/86400000);
  function bankMaps(data){
    const questions=data.questions||[],qMap=Object.fromEntries(questions.map(q=>[q.id,q]));
    const families=(data.questionFamilies||[]).filter(f=>f.coreQuestionId).map(f=>({...f,core:qMap[f.coreQuestionId]})).filter(f=>f.core);
    return {questions,qMap,families};
  }
  function selectFamilyVariants(data,predicate,count,date,channel,excludeFamilies=new Set()){
    const {qMap,families}=bankMaps(data),ordinal=dateOrdinal(date),modes=['core','process_first','delayed_recall','contrast','transfer'];
    const policy=window.JK_PHASE26?.activePolicy?.()||{familyPolicies:{},conceptWeights:{}};
    const pool=families.filter(f=>!excludeFamilies.has(f.familyId)&&predicate(f.core)&&!['review_only','disable'].includes(policy.familyPolicies?.[f.familyId]?.mode)).sort((a,b)=>{const aw=Number(policy.conceptWeights?.[a.core.conceptId]?.weight||1),bw=Number(policy.conceptWeights?.[b.core.conceptId]?.weight||1);return((seeded(`FAMILY|${a.familyId}`)%1000000)/aw)-((seeded(`FAMILY|${b.familyId}`)%1000000)/bw)});
    if(!pool.length)return[];
    const start=((ordinal*Math.max(1,count))+seeded(channel))%pool.length,selected=[];
    for(let i=0;i<Math.min(count,pool.length);i++)selected.push(pool[(start+i)%pool.length]);
    return selected.map((family,i)=>{
      const wanted=modes[(ordinal+i+seeded(`${channel}|${family.familyId}`))%modes.length];
      const ids=family.dailyEligibleIds||family.variantIds||[];
      const rows=ids.map(id=>qMap[id]).filter(q=>q&&q.eligibleForDaily!==false);
      return (rows.find(q=>q.variantType===wanted)||rows.find(q=>q.variantType==='core')||rows[0]).id;
    });
  }
  function recoveryQuestions(data,progress,count=3){
    const {questions,qMap}=bankMaps(data),recoveryBySource=new Map();
    for(const q of questions.filter(q=>q.variantType==='recovery_check'&&window.JK_PHASE26?.familyMode?.(q.familyId)!=='disable'))if(!recoveryBySource.has(q.sourceQuestionId))recoveryBySource.set(q.sourceQuestionId,q);
    const familyRows=new Map();for(const q of questions){if(!familyRows.has(q.familyId))familyRows.set(q.familyId,[]);familyRows.get(q.familyId).push(q)}
    const seen=new Set(),out=[];
    for(const [qid] of Object.entries(progress.wrong||{}).sort((a,b)=>b[1]-a[1])){
      const q=qMap[qid];if(!q)continue;const family=q.familyId||q.sourceQuestionId||q.id;if(seen.has(family))continue;seen.add(family);
      const source=q.sourceQuestionId||q.id,rows=familyRows.get(family)||[];
      const chosen=recoveryBySource.get(source)||rows.find(x=>x.variantType==='process_first')||rows.find(x=>x.variantType==='core')||q;
      out.push(chosen.id);if(out.length>=count)break;
    }
    return out;
  }
  function createPlan({ date=new Date(), data=window.JK_DATA, progress={}, settings={} }={}) {
    const id=dayId(date), dateText=id.slice(4);
    const targetMinutes=Number(settings.dailyTargetMinutes||40), grammarMinutes=Number(settings.grammarMinutes||21), readingMinutes=Number(settings.readingMinutes||18), resultMinutes=Number(settings.resultMinutes||1);
    // Counts are derived from a calm working pace rather than a visible countdown.
    const grammarCount=Math.max(8,Math.round(grammarMinutes*60/75));
    const readingCount=Math.max(4,Math.round(readingMinutes*60/150));
    const recallQuestionIds=recoveryQuestions(data,progress,3),qMap=Object.fromEntries((data.questions||[]).map(q=>[q.id,q]));
    const recallFamilies=new Set(recallQuestionIds.map(id=>qMap[id]?.familyId).filter(Boolean));
    const selectedGrammar=selectFamilyVariants(data,q=>(/^PART(?:[1-9]|10)$/.test(q.part||'')||q.part==='REVIEW7')&&!String(q.part).includes('READ'),grammarCount,date,'GRAMMAR',recallFamilies);
    const selectedReading=selectFamilyVariants(data,q=>String(q.part||'').includes('READ')||String(q.conceptId||'').startsWith('R'),readingCount,date,'READING',recallFamilies);
    const arranged=window.JK_QUALITY?.arrangeDay({grammarQuestionIds:selectedGrammar,readingQuestionIds:selectedReading,qMap})||{grammarQuestionIds:selectedGrammar,readingQuestionIds:selectedReading,questionPacing:{},difficultyCurveVersion:'legacy',calibrationStatus:'fallback'};
    const grammarQuestionIds=arranged.grammarQuestionIds,readingQuestionIds=arranged.readingQuestionIds;
    const all=[...recallQuestionIds,...grammarQuestionIds,...readingQuestionIds],familyIds=[...new Set(all.map(qid=>qMap[qid]?.familyId).filter(Boolean))];
    const questionMix=all.reduce((acc,qid)=>{const t=qMap[qid]?.variantType||'unknown';acc[t]=(acc[t]||0)+1;return acc},{});
    return { dayId:id,date:dateText,learnerId:'single-learner',status:'planned',targetMinutes,grammarMinutes,readingMinutes,resultMinutes,grammarQuestionIds,readingQuestionIds,recallQuestionIds,planFamilyIds:familyIds,questionMix,questionPacing:arranged.questionPacing,difficultyCurveVersion:arranged.difficultyCurveVersion,calibrationStatus:arranged.calibrationStatus,personalDifficultyProfileId:arranged.personalDifficultyProfileId||window.JK_PHASE27?.activeProfile?.()?.profileId||null,personalDifficultyApplied:Boolean(arranged.personalDifficultyProfileId||window.JK_PHASE27?.activeProfile?.()),conceptDiversityGuard:true,bankVersion:(data.bankManifest&&data.bankManifest.bankVersion)||'26.0',familyRepeatGuardDays:7,qualityPolicyVersion:window.JK_PHASE26?.activePolicy?.().version||'none',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString() };
  }
  function planQuestionIds(plan={}) { return [...new Set([...(plan.recallQuestionIds||[]),...(plan.grammarQuestionIds||[]),...(plan.readingQuestionIds||[])])]; }
  function eventsForDay(bundle,id){ return (bundle.events||[]).filter(e => (e.dayId || dayId(e.timestamp)) === id); }
  function sessionsForDay(bundle,id){ return (bundle.sessions||[]).filter(s => (s.dayId || dayId(s.startedAt)) === id); }
  function completedQuestionIds(bundle,id){
    const latest=new Map();
    for(const e of eventsForDay(bundle,id).filter(e=>e.type==='grading_result'&&e.questionId).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||Number(a.sequence||0)-Number(b.sequence||0))) latest.set(e.questionId,e);
    return new Set([...latest].filter(([,e])=>Boolean(e.answerCorrect)&&e.payload?.methodPass!==false).map(([qid])=>qid));
  }
  function remainingQuestionIds(plan,bundle){ const done=completedQuestionIds(bundle,plan.dayId); return planQuestionIds(plan).filter(id=>!done.has(id)); }
  function pacing(events){
    const rows=events.filter(e=>e.type==='grading_result').map(e=>e.payload||{}).filter(p=>Number(p.elapsedSeconds)>0);
    if(!rows.length)return {score:0,within:0,total:0};
    let score=0; for(const p of rows){const ratio=Number(p.elapsedSeconds)/Math.max(1,Number(p.targetSeconds||60)); score += ratio<=1?100:ratio<=1.25?82:ratio<=1.6?62:40;}
    return {score:clamp(score/rows.length),within:rows.filter(p=>Number(p.elapsedSeconds)<=Number(p.targetSeconds||60)).length,total:rows.length};
  }
  function report({bundle, data=window.JK_DATA, date=new Date()}={}){
    const id=dayId(date), events=eventsForDay(bundle,id), sessions=sessionsForDay(bundle,id);
    const analytics=window.JK_ANALYTICS.aggregate({sessions,events,questions:data.questions||[],concepts:data.concepts||[]});
    const o=analytics.overall, grading=events.filter(e=>e.type==='grading_result'), pace=pacing(events);
    const explicitMethod=grading.filter(e=>e.methodScore!=null).map(e=>Number(e.methodScore));
    const decisionSteps=events.filter(e=>e.type==='decision_step_answered').map(e=>Boolean(e.payload?.stepCorrect));
    const focusEvidence=grading.map(e=>{const q=(data.questions||[]).find(x=>x.id===e.questionId),max=Number(q?.annotationSpec?.weights?.focus||0);return max?100*Number(e.payload?.focusScore||0)/max:null}).filter(v=>v!=null);
    const firstAttempts=analytics.attempts.filter(a=>Number(a.attemptNo||1)===1);
    const firstAccuracy=pct(firstAttempts.filter(a=>a.answerCorrect).length,firstAttempts.length);
    const stageProxy=decisionSteps.length?pct(decisionSteps.filter(Boolean).length,decisionSteps.length):(explicitMethod.length?pct(grading.filter(e=>e.methodScore!=null&&e.payload?.methodPass!==false).length,explicitMethod.length):firstAccuracy);
    const methodProxy=explicitMethod.length?average(explicitMethod):firstAccuracy;
    const evidenceProxy=focusEvidence.length?average(focusEvidence):(decisionSteps.length?pct(decisionSteps.filter(Boolean).length,decisionSteps.length):firstAccuracy);
    const activeMs=sessions.reduce((sum,s)=>sum+Math.max(Number(s.totalActiveMs||0),s.endedAt?Math.max(0,Date.parse(s.endedAt)-Date.parse(s.startedAt)):0),0);
    const grammarMs=grading.filter(e=>(e.module||e.payload?.module)!=='reading').reduce((sum,e)=>sum+Number(e.payload?.elapsedSeconds||0)*1000,0);
    const readingMs=grading.filter(e=>(e.module||e.payload?.module)==='reading').reduce((sum,e)=>sum+Number(e.payload?.elapsedSeconds||0)*1000,0);
    const recovery= o.textbookReturns ? o.recoveryRate : (o.fullPassRate ? Math.min(100,o.fullPassRate+5) : 0);
    const axes={conceptActivation:clamp(methodProxy),stageExecution:clamp(stageProxy),evidenceJudgment:clamp(evidenceProxy),finalAccuracy:clamp(o.answerAccuracy),paceStability:clamp(pace.score),recoveryTransfer:clamp(recovery)};
    const axisEvidence={conceptActivation:explicitMethod.length||firstAttempts.length,stageExecution:decisionSteps.length||explicitMethod.length,evidenceJudgment:focusEvidence.length||decisionSteps.length,finalAccuracy:grading.length,paceStability:pace.total,recoveryTransfer:o.textbookReturns||analytics.attempts.filter(a=>Number(a.attemptNo)>1).length};
    const sorted=AXES.map(([k,l])=>({key:k,label:l,value:axes[k]})).sort((a,b)=>b.value-a.value); const strength=sorted[0]?.label||'학습 기록 없음', weak=sorted.at(-1)?.label||'학습 기록 없음';
    const recommendation=grading.length?`${weak} 축을 우선 보완합니다. 긴 이론을 먼저 제시하지 않고, 실패 단계에 필요한 규칙만 확인한 뒤 확인문제와 원문 재도전을 연결합니다.`:'오늘 학습을 시작하면 단계 수행과 회복 과정이 진단됩니다.';
    const dayCompleted=events.some(e=>e.type==='day_completed');
    return {dayId:id,date:id.slice(4),learnerId:'single-learner',completedAt:dayCompleted?new Date(Math.max(...events.filter(e=>e.type==='day_completed').map(e=>Date.parse(e.timestamp)))).toISOString():null,activeMinutes:Math.round(activeMs/600)/100,grammarMinutes:Math.round(grammarMs/600)/100,readingMinutes:Math.round(readingMs/600)/100,attempts:o.attempts||0,answerAccuracy:o.answerAccuracy||0,processPassRate:o.processPassRate||0,fullPassRate:o.fullPassRate||0,recoveryRate:o.recoveryRate||0,axes,axisEvidence,strength:`${strength}이 가장 안정적입니다.`,nextFocus:`${weak}을 다음 Day의 우선 처방으로 둡니다.`,recommendation,sourceEventIds:grading.map(e=>e.eventId),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  }
  function polygonPoints(axes,cx=150,cy=150,r=108){ return AXES.map(([k],i)=>{const a=-Math.PI/2+i*Math.PI/3, rr=r*clamp(axes?.[k])/100; return `${(cx+Math.cos(a)*rr).toFixed(1)},${(cy+Math.sin(a)*rr).toFixed(1)}`}).join(' '); }
  function radarSvg(axes, options={}){
    const size=Number(options.size||320), c=size/2, r=size*.34, rings=[.25,.5,.75,1];
    const pt=(ratio,i)=>{const a=-Math.PI/2+i*Math.PI/3;return`${(c+Math.cos(a)*r*ratio).toFixed(1)},${(c+Math.sin(a)*r*ratio).toFixed(1)}`};
    const grid=rings.map(x=>`<polygon points="${AXES.map((_,i)=>pt(x,i)).join(' ')}" fill="none" stroke="#d2d2d7" stroke-width="1"/>`).join('');
    const spokes=AXES.map((_,i)=>`<line x1="${c}" y1="${c}" x2="${pt(1,i).split(',')[0]}" y2="${pt(1,i).split(',')[1]}" stroke="#e5e5ea"/>`).join('');
    const labels=AXES.map(([,label],i)=>{const a=-Math.PI/2+i*Math.PI/3,x=c+Math.cos(a)*r*1.27,y=c+Math.sin(a)*r*1.27;return`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="#6e6e73">${label}</text>`}).join('');
    const values=AXES.map(([k],i)=>{const a=-Math.PI/2+i*Math.PI/3,rr=r*clamp(axes?.[k])/100;return`${(c+Math.cos(a)*rr).toFixed(1)},${(c+Math.sin(a)*rr).toFixed(1)}`}).join(' ');
    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="오늘의 학습 육각진단">${grid}${spokes}<polygon points="${values}" fill="rgba(0,113,227,.17)" stroke="#0071e3" stroke-width="3" stroke-linejoin="round"/>${labels}</svg>`;
  }
  function paceTarget(question){ return window.JK_QUALITY?.targetSeconds(question) || Number(question?.initialCalibration?.targetSeconds) || 60; }
  function paceBand(elapsed,target){ const ratio=elapsed/Math.max(1,target); return ratio<.75?'steady':ratio<1?'decide':ratio<1.35?'transition':'over'; }
  function paceMessage(band){ return band==='decide'?'핵심 근거 하나를 정하고 답을 선택하세요.':band==='transition'?'지금까지 찾은 근거로 결정해 보세요.':band==='over'?'현재 판단을 기록하고 다음 단계로 이동해도 됩니다.':''; }
  window.JK_DAILY={AXES,dayId,createPlan,planQuestionIds,completedQuestionIds,remainingQuestionIds,report,radarSvg,polygonPoints,paceTarget,paceBand,paceMessage};
})();
