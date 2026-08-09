(() => {
  'use strict';
  const AXIS_KEYS = ['conceptActivation','stageExecution','evidenceJudgment','finalAccuracy','paceStability','recoveryTransfer'];
  const clamp = (n, lo=0, hi=100) => Math.max(lo, Math.min(hi, Number(n || 0)));
  const avg = values => values.length ? values.reduce((a,b)=>a+Number(b||0),0)/values.length : null;
  const isoDay = value => String(value || '').slice(0,10);
  const seeded = text => { let h=2166136261; for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)} return Math.abs(h); };
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const stable = value => JSON.stringify(canonical(value));
  const hash = value => seeded(typeof value === 'string' ? value : stable(value)).toString(36);
  const fullPass = e => e?.type === 'grading_result' && Boolean(e.answerCorrect) && e.payload?.methodPass !== false;

  function windowReports(reports=[], days=7, now=new Date()) {
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate()-(days-1)); cutoff.setHours(0,0,0,0);
    return [...reports].filter(r=>Date.parse(`${r.date || String(r.dayId||'').slice(4)}T23:59:59`)>=cutoff.getTime()).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }

  function failureEvidence(events=[], days=7, now=new Date()) {
    const cutoff = new Date(now).getTime() - days*86400000;
    const rows = events.filter(e=>Date.parse(e.timestamp||0)>=cutoff && e.type==='grading_result' && (!e.answerCorrect || e.payload?.methodPass===false));
    const countBy = key => {
      const map = new Map();
      for(const e of rows){const value = key(e); if(!value)continue; const item=map.get(value)||{key:value,count:0,eventIds:[],questionIds:[]}; item.count++; item.eventIds.push(e.eventId); if(e.questionId)item.questionIds.push(e.questionId); map.set(value,item);}
      return [...map.values()].map(x=>({...x,eventIds:[...new Set(x.eventIds)].sort(),questionIds:[...new Set(x.questionIds)].sort()})).sort((a,b)=>b.count-a.count||String(a.key).localeCompare(String(b.key)));
    };
    return { failures:rows.length, stages:countBy(e=>e.payload?.failureStage||e.failureStage), errorCodes:countBy(e=>e.errorCode), questions:countBy(e=>e.questionId) };
  }

  function buildRecommendation({ reports=[], events=[], settings={}, now=new Date() }={}) {
    const recent = windowReports(reports,7,now);
    const evidence = failureEvidence(events,7,now);
    const process = avg(recent.map(r=>r.processPassRate));
    const accuracy = avg(recent.map(r=>r.answerAccuracy));
    const pace = avg(recent.map(r=>r.axes?.paceStability));
    const recovery = avg(recent.map(r=>r.axes?.recoveryTransfer));
    const before = {
      grammarMinutes: Math.max(20,Number(settings.grammarMinutes||21)), readingMinutes:Number(settings.readingMinutes||18), resultMinutes:Number(settings.resultMinutes||1),
      newRatio:Number(settings.newQuestionRatio??0.55), reviewRatio:Number(settings.reviewQuestionRatio??0.30), recallRatio:Number(settings.recallQuestionRatio??0.15), paceTargetMultiplier:Number(settings.paceTargetMultiplier||1)
    };
    const proposed = {...before};
    const reasons=[];
    const enough = recent.length>=3;
    const processStable = enough && process>=82 && accuracy>=80;
    if(!enough){proposed.newRatio=.4;proposed.reviewRatio=.4;proposed.recallRatio=.2;reasons.push({code:'INSUFFICIENT_SAMPLE',label:'최근 표본이 3일 미만이므로 속도 단축 없이 복습 비중을 높입니다.',evidence:recent.length,threshold:3});}
    else if(process<70){proposed.newRatio=.3;proposed.reviewRatio=.45;proposed.recallRatio=.25;reasons.push({code:'PROCESS_UNSTABLE',label:'과정 통과가 안정되기 전에는 신규 문항과 목표시간을 공격적으로 조정하지 않습니다.',evidence:Math.round(process),threshold:70});}
    else if(process<82){proposed.newRatio=.42;proposed.reviewRatio=.38;proposed.recallRatio=.2;reasons.push({code:'PROCESS_BUILDING',label:'단계 수행 안정화를 위해 복습과 회상을 우선 배치합니다.',evidence:Math.round(process),threshold:82});}
    if(recovery!=null && recovery<70){proposed.recallRatio=Math.max(proposed.recallRatio,.25);proposed.newRatio=Math.max(.25,1-proposed.reviewRatio-proposed.recallRatio);reasons.push({code:'RECOVERY_TRANSFER_LOW',label:'교재 복귀 후 회복·전이 축이 낮아 다음 Day 회상 문항을 늘립니다.',evidence:Math.round(recovery),threshold:70});}
    if(processStable && pace>=78){proposed.paceTargetMultiplier=Math.max(.95,Number((before.paceTargetMultiplier*.97).toFixed(2)));reasons.push({code:'SAFE_PACE_REDUCTION',label:'정확도와 과정이 안정된 유형에만 목표시간을 3% 단축합니다.',evidence:{process:Math.round(process),accuracy:Math.round(accuracy),pace:Math.round(pace)},threshold:{process:82,accuracy:80,pace:78}});}
    else {proposed.paceTargetMultiplier=Math.max(1,before.paceTargetMultiplier);reasons.push({code:'PACE_HOLD',label:'과정 안정 기준을 충족하지 않아 목표시간을 유지합니다.',evidence:{process:process==null?null:Math.round(process),accuracy:accuracy==null?null:Math.round(accuracy),pace:pace==null?null:Math.round(pace)},threshold:{process:82,accuracy:80,pace:78}});}
    if(evidence.failures>=4){proposed.newRatio=Math.max(.25,proposed.newRatio-.05);proposed.reviewRatio=Math.min(.5,proposed.reviewRatio+.05);reasons.push({code:'REPEATED_FAILURES',label:'최근 7일 반복 실패 단계와 오답 코드를 우선 배치합니다.',evidence:evidence.failures,threshold:4});}
    const total = proposed.newRatio+proposed.reviewRatio+proposed.recallRatio;
    proposed.newRatio=Number((proposed.newRatio/total).toFixed(2)); proposed.reviewRatio=Number((proposed.reviewRatio/total).toFixed(2)); proposed.recallRatio=Number((1-proposed.newRatio-proposed.reviewRatio).toFixed(2));
    proposed.grammarMinutes=Math.max(20,Math.min(22,proposed.grammarMinutes));
    proposed.readingMinutes=Math.max(18,Math.min(20,proposed.readingMinutes));
    const sourceWindow={days:7,reportCount:recent.length,from:recent[0]?.date||null,to:recent.at(-1)?.date||null};
    const priorityTargets={failureStages:evidence.stages.slice(0,3),errorCodes:evidence.errorCodes.slice(0,3),questionIds:evidence.questions.slice(0,8).map(x=>x.key)};
    const keyPayload={sourceWindow,before,proposed,priorityTargets,reasons:reasons.map(r=>r.code)};
    const date=isoDay(now.toISOString());
    return {recommendationId:`ADAPT-${date}-${hash(keyPayload)}`,learnerId:'single-learner',status:'pending_admin',sourceWindow,before,proposed,priorityTargets,reasons,determinismKey:hash(keyPayload),createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),schemaVersion:19};
  }

  function deterministicPick(list,count,seed){return [...list].sort((a,b)=>(seeded(`${seed}|${a.id}`)%100000)-(seeded(`${seed}|${b.id}`)%100000)||a.id.localeCompare(b.id)).slice(0,Math.max(0,count)).map(x=>x.id);}
  function applyRecommendation({plan,recommendation,data=window.JK_DATA,progress={}}={}){
    if(!plan||!recommendation||recommendation.status!=='approved')return plan;
    const p=recommendation.proposed||{}, daySeed=plan.dayId;
    const all=data.questions||[];
    const seen=new Set([...Object.keys(progress.correct||{}),...Object.keys(progress.wrong||{}),...Object.keys(progress.method||{})]);
    const wrongSet=new Set(Object.keys(progress.wrong||{}).filter(id=>Number(progress.wrong[id])>0));
    const priority=new Set(recommendation.priorityTargets?.questionIds||[]);
    function moduleQuestions(reading){return all.filter(q=>reading?(String(q.part||'').includes('READ')||String(q.conceptId||'').startsWith('R')):(/^PART(?:[1-9]|10)$/.test(q.part||'')&&!String(q.part||'').includes('READ')));}
    function allocate(reading,count){const pool=moduleQuestions(reading), nNew=Math.round(count*Number(p.newRatio??.55)),nReview=Math.round(count*Number(p.reviewRatio??.3)),nRecall=Math.max(0,count-nNew-nReview);const used=new Set();const take=(items,n,suffix)=>{const picked=deterministicPick(items.filter(q=>!used.has(q.id)),n,`${daySeed}|${reading?'R':'G'}|${suffix}`);picked.forEach(id=>used.add(id));return picked};const recallPool=pool.filter(q=>wrongSet.has(q.id)||priority.has(q.id));const reviewPool=pool.filter(q=>seen.has(q.id)&&!wrongSet.has(q.id));const newPool=pool.filter(q=>!seen.has(q.id));let out=[...take(recallPool,nRecall,'recall'),...take(reviewPool,nReview,'review'),...take(newPool,nNew,'new')];if(out.length<count)out.push(...take(pool,count-out.length,'fill'));return out;}
    const grammarMinutes=Math.max(20,Number(p.grammarMinutes||plan.grammarMinutes||21)),readingMinutes=Math.max(18,Number(p.readingMinutes||plan.readingMinutes||18));
    const grammarCount=Math.max(8,Math.round(grammarMinutes*60/75)),readingCount=Math.max(4,Math.round(readingMinutes*60/150));
    return {...plan,grammarMinutes,readingMinutes,grammarQuestionIds:allocate(false,grammarCount),readingQuestionIds:allocate(true,readingCount),recallQuestionIds:[...new Set([...(recommendation.priorityTargets?.questionIds||[]),...(plan.recallQuestionIds||[])])].slice(0,5),adaptiveRecommendationId:recommendation.recommendationId,adaptiveAppliedAt:new Date().toISOString(),paceTargetMultiplier:Number(p.paceTargetMultiplier||1),questionMix:{newRatio:p.newRatio,reviewRatio:p.reviewRatio,recallRatio:p.recallRatio},updatedAt:new Date().toISOString()};
  }

  function recoveredByDay(events=[]){const days=new Map();for(const e of [...events].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||Number(a.sequence||0)-Number(b.sequence||0))){const d=e.dayId||isoDay(e.timestamp),row=days.get(d)||{returns:new Set(),recovered:new Set(),passes:new Set()};if(e.type==='textbook_return'&&e.questionId)row.returns.add(e.questionId);if(fullPass(e)&&e.questionId){row.passes.add(e.questionId);if(row.returns.has(e.questionId)||Number(e.payload?.attemptNo||1)>1)row.recovered.add(e.questionId);}days.set(d,row);}return days;}
  function buildTrend({reports=[],events=[],days=7,now=new Date()}={}){
    const rows=windowReports(reports,days,now);const axes=Object.fromEntries(AXIS_KEYS.map(k=>[k,rows.map(r=>({date:r.date,value:Number(r.axes?.[k]||0),evidence:Number(r.axisEvidence?.[k]||0)}))]));
    const metric = key => rows.map(r=>({date:r.date,value:Number(r[key]||0),sample:Number(r.attempts||0)}));
    const first=rows[0],last=rows.at(-1);const delta=key=>rows.length>1?Number((Number(last?.[key]||0)-Number(first?.[key]||0)).toFixed(1)):null;
    const recovered=recoveredByDay(events);let transferNumerator=0,transferDenominator=0;for(let i=0;i<rows.length-1;i++){const a=recovered.get(rows[i].dayId||`DAY-${rows[i].date}`),b=recovered.get(rows[i+1].dayId||`DAY-${rows[i+1].date}`);if(!a||!a.recovered.size)continue;for(const q of a.recovered){transferDenominator++;if(b?.passes.has(q))transferNumerator++;}}
    return {days,from:first?.date||null,to:last?.date||null,reportCount:rows.length,attempts:rows.reduce((s,r)=>s+Number(r.attempts||0),0),rows,axes,metrics:{answerAccuracy:metric('answerAccuracy'),processPassRate:metric('processPassRate'),fullPassRate:metric('fullPassRate'),activeMinutes:metric('activeMinutes'),recoveryRate:metric('recoveryRate')},delta:{answerAccuracy:delta('answerAccuracy'),processPassRate:delta('processPassRate'),fullPassRate:delta('fullPassRate'),activeMinutes:delta('activeMinutes')},nextDayTransferRate:transferDenominator?Math.round(100*transferNumerator/transferDenominator):null,nextDayTransferEvidence:transferDenominator,hasData:rows.length>0};
  }

  function sparkline(points=[],options={}){const w=Number(options.width||440),h=Number(options.height||130),pad=18;const vals=points.map(x=>Number(x.value||0));if(!vals.length)return`<div class="trend-empty">데이터 없음</div>`;const min=options.min??Math.min(...vals,0),max=options.max??Math.max(...vals,100),range=Math.max(1,max-min);const xy=vals.map((v,i)=>[pad+(w-pad*2)*(points.length===1?.5:i/(points.length-1)),h-pad-(h-pad*2)*(v-min)/range]);const path=xy.map((p,i)=>`${i?'L':'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');const dots=xy.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5"><title>${points[i].date}: ${Math.round(vals[i])}</title></circle>`).join('');return`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${options.label||'추세'}"><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="#d2d2d7"/><path d="${path}" fill="none" stroke="#0071e3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;}

  window.JK_ADAPTIVE={buildRecommendation,applyRecommendation,buildTrend,sparkline,windowReports,failureEvidence};
})();
