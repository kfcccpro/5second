(() => {
  'use strict';
  const D = window.JK_PHASE26_DATA || {};
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const clamp = (n,a,b) => Math.max(a, Math.min(b, Number(n || 0)));
  const round = (n,d=2) => Number(Number(n || 0).toFixed(d));
  const pct = (n,d) => d ? round(100 * n / d, 1) : 0;
  const nowIso = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const dayOf = value => {
    if (!value) return '';
    if (String(value).startsWith('DAY-')) return String(value).slice(4,14);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0,10);
    return date.toISOString().slice(0,10);
  };

  function seedDraft(seed=D.approvalSeed) {
    return {
      format:'JK_ENG_PHASE26_APPROVAL_DRAFT', version:'26.0', draftId:uid('quality-draft'),
      status:'draft', createdAt:nowIso(), updatedAt:nowIso(), automaticApplication:false,
      duplicateDecisions:Object.fromEntries((seed?.duplicateReviewFamilies||[]).map(x=>[x.familyId,{familyId:x.familyId,status:'pending',action:null,representativeFamilyId:null,note:'',updatedAt:null}])),
      conceptDecisions:Object.fromEntries((seed?.conceptBalanceProposals||[]).map(x=>[x.conceptId,{conceptId:x.conceptId,status:'pending',action:null,approvedWeight:1,note:'',updatedAt:null}])),
      auditTrail:[]
    };
  }

  function updateDuplicateDecision(draft, familyId, action, options={}) {
    const allowed = new Set(D.approvalSeed?.duplicateReviewFamilies?.find(x=>x.familyId===familyId)?.allowedActions || []);
    if (!allowed.has(action)) throw new Error(`지원하지 않는 중복 조치입니다: ${action}`);
    const next=clone(draft), stamp=nowIso();
    const before=clone(next.duplicateDecisions[familyId]||null);
    next.duplicateDecisions[familyId]={familyId,status:'decided',action,representativeFamilyId:options.representativeFamilyId||null,note:options.note||'',updatedAt:stamp};
    next.auditTrail.push({auditId:uid('audit'),type:'duplicate_decision',entityId:familyId,before,after:clone(next.duplicateDecisions[familyId]),actor:'admin',at:stamp});
    next.updatedAt=stamp;return next;
  }

  function updateConceptDecision(draft, conceptId, action, options={}) {
    if (!['approve','reject','hold'].includes(action)) throw new Error(`지원하지 않는 개념 보정 조치입니다: ${action}`);
    const proposal=D.approvalSeed?.conceptBalanceProposals?.find(x=>x.conceptId===conceptId);
    if(!proposal)throw new Error(`개념 보정안을 찾을 수 없습니다: ${conceptId}`);
    const next=clone(draft),stamp=nowIso(),before=clone(next.conceptDecisions[conceptId]||null);
    next.conceptDecisions[conceptId]={conceptId,status:'decided',action,approvedWeight:action==='approve'?Number(options.approvedWeight||proposal.proposedWeight):1,note:options.note||'',updatedAt:stamp};
    next.auditTrail.push({auditId:uid('audit'),type:'concept_decision',entityId:conceptId,before,after:clone(next.conceptDecisions[conceptId]),actor:'admin',at:stamp});
    next.updatedAt=stamp;return next;
  }

  function reviewProgress(draft, seed=D.approvalSeed) {
    const duplicates=seed?.duplicateReviewFamilies||[], concepts=seed?.conceptBalanceProposals||[];
    const duplicateDone=duplicates.filter(x=>draft?.duplicateDecisions?.[x.familyId]?.status==='decided').length;
    const conceptDone=concepts.filter(x=>draft?.conceptDecisions?.[x.conceptId]?.status==='decided').length;
    return {duplicateDone,duplicateTotal:duplicates.length,conceptDone,conceptTotal:concepts.length,totalDone:duplicateDone+conceptDone,total:duplicates.length+concepts.length,complete:duplicateDone===duplicates.length&&conceptDone===concepts.length};
  }

  function buildRiskGroups(seed=D.approvalSeed){
    const groups={};
    for(const item of seed?.duplicateReviewFamilies||[]){
      for(const riskId of item.riskIds||[]){if(!groups[riskId])groups[riskId]=[];groups[riskId].push(item.familyId)}
    }
    for(const key of Object.keys(groups))groups[key]=[...new Set(groups[key])].sort();
    return groups;
  }

  function buildPolicyOverlay(draft, seed=D.approvalSeed) {
    const familyPolicies={},conceptWeights={},groups=buildRiskGroups(seed);
    for(const [riskId,families] of Object.entries(groups)){
      const decisions=families.map(id=>draft?.duplicateDecisions?.[id]).filter(Boolean);
      const keep=decisions.find(d=>d.action==='keep_representative');
      if(keep){
        const representative=(keep.representativeFamilyId&&families.includes(keep.representativeFamilyId))?keep.representativeFamilyId:families[0];
        for(const id of families)familyPolicies[id]={familyId:id,mode:id===representative?'regular':'review_only',riskId,representativeFamilyId:representative,minRepeatDays:id===representative?7:null,source:'admin_approved_duplicate_decision'};
      }
      for(const id of families){
        const d=draft?.duplicateDecisions?.[id];if(!d||!d.action||d.action==='keep_representative')continue;
        familyPolicies[id]={familyId:id,mode:d.action==='intentional_repeat'?'regular':d.action,minRepeatDays:d.action==='intentional_repeat'?14:null,riskId,source:'admin_approved_duplicate_decision'};
      }
    }
    for(const proposal of seed?.conceptBalanceProposals||[]){
      const d=draft?.conceptDecisions?.[proposal.conceptId];
      if(d?.action==='approve')conceptWeights[proposal.conceptId]={conceptId:proposal.conceptId,weight:clamp(d.approvedWeight,.5,1.5),source:'admin_approved_concept_balance'};
    }
    return {version:'26.0',generatedAt:nowIso(),familyPolicies,conceptWeights,automaticApplication:false};
  }

  function createSnapshot({draft,activePolicy={},bankManifest={},kind='pre_apply',note=''}={}) {
    const content={draft:clone(draft),activePolicy:clone(activePolicy),bankVersion:bankManifest.bankVersion||'25.0',questionCount:bankManifest.learnerQuestionRecordCount||0,familyCount:bankManifest.allFamilyCount||0};
    const digest=hashText(JSON.stringify(content));
    return {format:'JK_ENG_PHASE26_BANK_SNAPSHOT',version:'26.0',snapshotId:uid('snapshot'),kind,note,createdAt:nowIso(),contentDigest:digest,rollbackSupported:true,...content};
  }

  function applyApprovedDraft({draft,bankManifest={},adminConfirmed=false}={}) {
    const progress=reviewProgress(draft);
    if(!adminConfirmed)throw new Error('관리자 최종 확인이 필요합니다.');
    if(!progress.complete)throw new Error(`모든 검토 결정을 완료해야 합니다. ${progress.totalDone}/${progress.total}`);
    const policy=buildPolicyOverlay(draft);
    const nextDraft=clone(draft),stamp=nowIso();nextDraft.status='applied';nextDraft.appliedAt=stamp;nextDraft.updatedAt=stamp;
    nextDraft.auditTrail.push({auditId:uid('audit'),type:'policy_applied',entityId:'question-bank',actor:'admin',at:stamp,automaticApplication:false});
    return {draft:nextDraft,policy,snapshot:createSnapshot({draft:nextDraft,activePolicy:policy,bankManifest,kind:'post_apply'})};
  }

  function rollbackSnapshot(snapshot, adminConfirmed=false) {
    if(!adminConfirmed)throw new Error('롤백에는 관리자 확인이 필요합니다.');
    if(!snapshot?.rollbackSupported)throw new Error('롤백할 수 없는 스냅샷입니다.');
    return {draft:clone(snapshot.draft),policy:clone(snapshot.activePolicy||{}),rolledBackFrom:snapshot.snapshotId,rolledBackAt:nowIso(),automaticApplication:false};
  }

  function hashText(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return `fnv1a-${(h>>>0).toString(16).padStart(8,'0')}`}

  function dedupeEvents(events=[]) {
    const byPrimary=new Map(), duplicateIds=[];
    const sorted=[...events].sort((a,b)=>Date.parse(a.timestamp||0)-Date.parse(b.timestamp||0)||Number(a.sequence||0)-Number(b.sequence||0));
    for(const e of sorted){
      const payload=e.payload||{};
      const primary=e.eventId?`id:${e.eventId}`:payload.opId?`op:${payload.opId}`:null;
      if(primary){if(byPrimary.has(primary)){duplicateIds.push(e.eventId||primary);byPrimary.set(primary,e)}else byPrimary.set(primary,e);continue}
      const attempt=payload.attemptNo??e.attemptNo??1;
      const sig=`sig:${e.dayId||dayOf(e.timestamp)}|${e.questionId||''}|${attempt}|${e.type}|${payload.choice??''}|${payload.stepIndex??''}`;
      if(byPrimary.has(sig))duplicateIds.push(e.eventId||sig);
      byPrimary.set(sig,e);
    }
    const first=[...byPrimary.values()];
    const byAttempt=new Map();
    for(const e of first){
      if(!['grading_result','final_answer','check_question_answered','check_question_passed','original_retry','original_retry_passed'].includes(e.type)){byAttempt.set(`event:${e.eventId||Math.random()}`,e);continue}
      const p=e.payload||{},key=`attempt:${e.dayId||dayOf(e.timestamp)}|${e.questionId||''}|${p.attemptNo??1}|${e.type}`;
      const old=byAttempt.get(key);if(old)duplicateIds.push(old.eventId||key);if(!old||Date.parse(e.timestamp||0)>=Date.parse(old.timestamp||0))byAttempt.set(key,e);
    }
    return {events:[...byAttempt.values()].sort((a,b)=>Date.parse(a.timestamp||0)-Date.parse(b.timestamp||0)),duplicateCount:duplicateIds.length,duplicateIds};
  }

  function dailyMetrics({events=[],sessions=[],reports=[],questions=[]}={}) {
    const deduped=dedupeEvents(events),qMap=Object.fromEntries(questions.map(q=>[q.id,q])),byDay={};
    const ensure=date=>byDay[date]||(byDay[date]={date,events:[],sessions:[],report:null});
    for(const e of deduped.events){const date=dayOf(e.dayId||e.timestamp);if(date)ensure(date).events.push(e)}
    for(const s of sessions){const date=dayOf(s.dayId||s.startedAt);if(date)ensure(date).sessions.push(s)}
    for(const r of reports){const date=dayOf(r.dayId||r.date);if(date)ensure(date).report=r}
    const rows=[];
    for(const day of Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date))){
      const grading=day.events.filter(e=>e.type==='grading_result');
      const answers=grading.length,correct=grading.filter(e=>e.answerCorrect===true).length,process=grading.filter(e=>e.payload?.methodPass!==false&&(e.methodScore==null||Number(e.methodScore)>=70)).length;
      const paceRows=grading.filter(e=>Number(e.payload?.targetSeconds)>0&&Number(e.payload?.elapsedSeconds)>=0);
      const paceOver=paceRows.filter(e=>Number(e.payload.elapsedSeconds)>Number(e.payload.targetSeconds)).length;
      const finalGroups={};for(const e of day.events.filter(e=>e.type==='final_answer')){const k=`${e.questionId}|${e.payload?.attemptNo||1}`;(finalGroups[k]||(finalGroups[k]=[])).push(e)}
      const answerChanges=Math.max(Object.values(finalGroups).reduce((sum,arr)=>sum+Math.max(0,arr.length-1),0),grading.reduce((sum,e)=>sum+Number(e.payload?.answerChanges||0),0));
      const returns=day.events.filter(e=>e.type==='textbook_return').length;
      const checks=day.events.filter(e=>e.type==='check_question_answered'),checkPass=checks.filter(e=>e.payload?.checkCorrect===true||e.answerCorrect===true).length;
      const retries=day.events.filter(e=>e.type==='original_retry'),retryPassEvents=day.events.filter(e=>e.type==='original_retry_passed'),retryPass=retryPassEvents.length||retries.filter(e=>e.answerCorrect===true&&e.payload?.methodPass!==false).length;
      const transfer=grading.filter(e=>['transfer','recovery_transfer'].includes(qMap[e.questionId]?.variantType)),transferPass=transfer.filter(e=>e.answerCorrect===true&&e.payload?.methodPass!==false).length;
      const report=day.report||{};
      let activeMinutes=Number(report.activeMinutes||0);
      if(!activeMinutes)activeMinutes=day.sessions.reduce((sum,s)=>sum+Math.max(Number(s.totalActiveMs||0),s.endedAt&&s.startedAt?Math.max(0,Date.parse(s.endedAt)-Date.parse(s.startedAt)):0),0)/60000;
      let grammarMinutes=Number(report.grammarMinutes||0),readingMinutes=Number(report.readingMinutes||0);
      if(!grammarMinutes&&!readingMinutes){for(const e of grading){const m=Number(e.payload?.elapsedSeconds||0)/60;if((e.module||e.payload?.module)==='reading')readingMinutes+=m;else grammarMinutes+=m}}
      const completed=Boolean(report.completedAt)||day.events.some(e=>e.type==='day_completed');
      const fullPass=grading.filter(e=>e.answerCorrect===true&&e.payload?.methodPass!==false&&(e.methodScore==null||Number(e.methodScore)>=70)).length;
      rows.push({date:day.date,completed,attempts:answers,answerAccuracy:pct(correct,answers),processPassRate:pct(process,answers),fullPassRate:pct(fullPass,answers),paceOverrunRate:pct(paceOver,paceRows.length),answerChanges,textbookReturns:returns,checkPassRate:pct(checkPass,checks.length),originalRetryPassRate:pct(retryPass,retries.length),transferPassRate:pct(transferPass,transfer.length),activeMinutes:round(activeMinutes,1),grammarMinutes:round(grammarMinutes,1),readingMinutes:round(readingMinutes,1),deviceCount:new Set([...day.events.map(e=>e.deviceId),...day.sessions.map(s=>s.deviceId)].filter(Boolean)).size,duplicateEventsRemoved:deduped.duplicateCount});
    }
    return {rows,deduplication:deduped};
  }

  function baselineState({events=[],sessions=[],reports=[],questions=[],policy=D.baselinePolicy,actualLearnerData=true}={}) {
    const metrics=dailyMetrics({events,sessions,reports,questions}),w=policy?.window||{};
    const sufficient=metrics.rows.map(r=>({...r,sufficient:Boolean(r.completed&&r.attempts>=Number(w.minimumAttemptsPerDay||12)&&r.activeMinutes>=Number(w.minimumActiveMinutesPerDay||25)&&r.grammarMinutes>=Number(w.minimumGrammarMinutesPerDay||12)&&r.readingMinutes>=Number(w.minimumReadingMinutesPerDay||10)),issues:[]}));
    for(const r of sufficient){if(!r.completed)r.issues.push('day_not_completed');if(r.attempts<Number(w.minimumAttemptsPerDay||12))r.issues.push('attempts_insufficient');if(r.activeMinutes<Number(w.minimumActiveMinutesPerDay||25))r.issues.push('active_minutes_insufficient');if(r.grammarMinutes<Number(w.minimumGrammarMinutesPerDay||12))r.issues.push('grammar_minutes_insufficient');if(r.readingMinutes<Number(w.minimumReadingMinutesPerDay||10))r.issues.push('reading_minutes_insufficient')}
    const good=sufficient.filter(r=>r.sufficient),required=Number(w.requiredDays||7),allReal=actualLearnerData!==false;
    let status='NOT_COLLECTED';
    if(sufficient.length){status=good.length>=required?'READY_FOR_REVIEW':'COLLECTING';if(sufficient.length>=required&&good.length<required)status='PAUSED_INSUFFICIENT'}
    if(!allReal&&status==='READY_FOR_REVIEW')status='VALIDATION_ONLY_SYNTHETIC';
    const span=good.length?Math.round((Date.parse(good.at(-1).date)-Date.parse(good[0].date))/86400000)+1:0;
    return {format:'JK_ENG_PHASE26_BASELINE_RUN',version:'26.0',baselineId:'single-learner-first-7-days',status,actualLearnerDataUsed:allReal&&good.length>0,requiredDays:required,sufficientDays:good.length,observedDays:sufficient.length,progressPercent:Math.min(100,Math.round(100*good.length/required)),calendarSpanDays:span,dataSufficient:good.length>=required&&span<=Number(w.maxCalendarSpanDays||14),days:sufficient,deduplication:{removed:metrics.deduplication.duplicateCount},updatedAt:nowIso()};
  }

  function questionObservations({events=[],questions=[]}={}) {
    const qMap=Object.fromEntries(questions.map(q=>[q.id,q])),dedup=dedupeEvents(events).events,groups={};
    for(const e of dedup.filter(e=>e.type==='grading_result'&&e.questionId)){
      const q=qMap[e.questionId];if(!q)continue;const id=q.sourceQuestionId||q.id;
      const g=groups[id]||(groups[id]={questionId:id,conceptId:q.conceptId,part:q.part,rows:[],baseTargetSeconds:Number(q.initialCalibration?.targetSeconds||e.payload?.targetSeconds||60),baseScore:Number(q.initialCalibration?.score||55),baseLevel:Number(q.initialCalibration?.level||q.difficulty||2)});g.rows.push(e)
    }
    return groups;
  }

  function generateDifficultyProposals({baseline,events=[],questions=[],adminApprovedBaseline=false}={}) {
    if(!baseline||!['READY_FOR_REVIEW','APPROVED_PERSONAL'].includes(baseline.status)||!baseline.actualLearnerDataUsed)return {format:'JK_ENG_PHASE26_PERSONAL_DIFFICULTY_PROPOSALS',version:'26.0',status:'NOT_COLLECTED',actualLearnerDataUsed:false,sourceDays:baseline?.sufficientDays||0,proposals:[],automaticApplication:false,adminApprovalRequired:true};
    const groups=questionObservations({events,questions}),proposals=[];
    for(const g of Object.values(groups)){
      const n=g.rows.length;if(n<2)continue;const acc=pct(g.rows.filter(e=>e.answerCorrect===true).length,n),proc=pct(g.rows.filter(e=>e.payload?.methodPass!==false&&(e.methodScore==null||Number(e.methodScore)>=70)).length,n);
      const paceRows=g.rows.filter(e=>Number(e.payload?.targetSeconds)>0),over=pct(paceRows.filter(e=>Number(e.payload.elapsedSeconds)>Number(e.payload.targetSeconds)).length,paceRows.length);
      const recoveryRows=g.rows.filter(e=>e.payload?.recovered!=null),recovery=pct(recoveryRows.filter(e=>e.payload.recovered===true).length,recoveryRows.length);
      const stable=acc>=80&&proc>=75;let multiplier=1,reason='정확도·과정 안정 전 시간 유지';
      if(stable&&over<=25){multiplier=.97;reason='정확도 80%·과정 75% 이상이며 페이스 초과가 낮아 최대 3% 단축 제안'}
      else if(over>50||acc<65||proc<60){multiplier=Math.min(1.20,1+Math.max(0,(70-acc)/500)+Math.max(0,(70-proc)/600)+over/1000);reason='과정 또는 정확도 불안정으로 판단시간 완화 제안'}
      const failA=100-acc,failP=100-proc,score=Math.round(.55*g.baseScore+.20*failA+.15*failP+.07*over+.03*(100-recovery));
      proposals.push({proposalId:`PD-${g.questionId}`,questionId:g.questionId,conceptId:g.conceptId,part:g.part,observations:n,answerAccuracy:acc,processPassRate:proc,paceOverrunRate:over,recoveryRate:recovery,before:{score:g.baseScore,level:g.baseLevel,targetSeconds:g.baseTargetSeconds},proposed:{score,level:score<=38?1:score<=67?2:3,targetSeconds:Math.round(g.baseTargetSeconds*multiplier),targetMultiplier:round(multiplier,3)},timeReductionAllowed:stable,guardrailPassed:multiplier>=1||stable,status:'pending_admin',reason,autoApplied:false})
    }
    return {format:'JK_ENG_PHASE26_PERSONAL_DIFFICULTY_PROPOSALS',version:'26.0',status:adminApprovedBaseline?'PENDING_ADMIN_DIFFICULTY_APPROVAL':'READY_FOR_BASELINE_APPROVAL',actualLearnerDataUsed:true,sourceDays:baseline.sufficientDays,generatedAt:nowIso(),proposals,automaticApplication:false,adminApprovalRequired:true};
  }

  function expectedComparison(proposals=[]){
    if(!proposals.length)return {proposalCount:0,averageBeforeSeconds:0,averageAfterSeconds:0,averageChangePercent:0,reducedCount:0,increasedCount:0,unchangedCount:0};
    const before=proposals.reduce((s,p)=>s+Number(p.before?.targetSeconds||0),0)/proposals.length,after=proposals.reduce((s,p)=>s+Number(p.proposed?.targetSeconds||0),0)/proposals.length;
    return {proposalCount:proposals.length,averageBeforeSeconds:round(before,1),averageAfterSeconds:round(after,1),averageChangePercent:before?round(100*(after-before)/before,1):0,reducedCount:proposals.filter(p=>p.proposed.targetSeconds<p.before.targetSeconds).length,increasedCount:proposals.filter(p=>p.proposed.targetSeconds>p.before.targetSeconds).length,unchangedCount:proposals.filter(p=>p.proposed.targetSeconds===p.before.targetSeconds).length};
  }

  function activePolicy(){try{return JSON.parse(localStorage.getItem('jk_phase26_active_policy')||'null')||{version:'26.0',familyPolicies:{},conceptWeights:{}}}catch(_){return{version:'26.0',familyPolicies:{},conceptWeights:{}}}}
  function saveActivePolicy(policy){localStorage.setItem('jk_phase26_active_policy',JSON.stringify(policy||{}));window.dispatchEvent(new CustomEvent('jk-phase26-policy-changed',{detail:clone(policy)}));return clone(policy)}
  function familyMode(familyId){return activePolicy().familyPolicies?.[familyId]?.mode||'regular'}
  function conceptWeight(conceptId){return Number(activePolicy().conceptWeights?.[conceptId]?.weight||1)}

  window.JK_PHASE26={seedDraft,updateDuplicateDecision,updateConceptDecision,reviewProgress,buildRiskGroups,buildPolicyOverlay,createSnapshot,applyApprovedDraft,rollbackSnapshot,dedupeEvents,dailyMetrics,baselineState,generateDifficultyProposals,expectedComparison,activePolicy,saveActivePolicy,familyMode,conceptWeight,hashText};
})();
