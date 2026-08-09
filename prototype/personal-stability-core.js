(() => {
  'use strict';
  const D = window.JK_PHASE27_DATA || {};
  const policy = D.stabilityPolicy || {};
  const ACTIVE_KEY = policy.application?.activeProfileMirror || 'jk_phase27_active_difficulty_profile';
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const round = (n, d=2) => Number(Number(n || 0).toFixed(d));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n || 0)));
  const nowIso = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const mean = rows => rows.length ? rows.reduce((s,x)=>s+Number(x||0),0)/rows.length : 0;
  const dateOnly = value => {
    if (!value) return '';
    if (String(value).startsWith('DAY-')) return String(value).slice(4,14);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).slice(0,10) : date.toISOString().slice(0,10);
  };
  const addDays = (value, days) => {
    const d = new Date(`${dateOnly(value)}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate()+Number(days||0));
    return d.toISOString().slice(0,10);
  };
  const daysBetween = (a,b) => {
    const aa=Date.parse(`${dateOnly(a)}T00:00:00.000Z`), bb=Date.parse(`${dateOnly(b)}T00:00:00.000Z`);
    return Number.isFinite(aa)&&Number.isFinite(bb)?Math.floor((bb-aa)/86400000)+1:0;
  };
  function hashText(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return `fnv1a-${(h>>>0).toString(16).padStart(8,'0')}`}

  function emptyState() {
    return clone(D.initialState || {
      format:'JK_ENG_PHASE27_PERSONAL_DIFFICULTY_STATE', version:'27.0', learnerId:'single-learner',
      status:'NOT_COLLECTED', actualLearnerDataUsed:false, activeProfileId:null, activeApplicationId:null,
      profiles:[], applications:[], observations:[], regressionAlerts:[], automaticApplication:false, automaticRollback:false
    });
  }

  function baselinePayload(value){ return value?.payload || value || null; }
  function proposalPayload(value){ return value?.payload || value || null; }
  function isApprovedActualBaseline(value){ const b=baselinePayload(value); return Boolean(b&&b.status==='APPROVED_PERSONAL'&&b.actualLearnerDataUsed===true&&Number(b.sufficientDays)>=7); }

  function countRecentReductions(history=[], questionId, at=nowIso()) {
    const cutoff=Date.parse(at)-30*86400000;
    return history.filter(x=>x.questionId===questionId&&x.changeType==='reduction'&&Date.parse(x.appliedAt||0)>=cutoff).length;
  }

  function createApprovedProfile({proposalSet,baseline,previousProfile=null,applicationHistory=[],adminConfirmed=false}={}) {
    if(!adminConfirmed) throw new Error('개인 난이도 프로필 생성에는 관리자 확인이 필요합니다.');
    if(!isApprovedActualBaseline(baseline)) throw new Error('실제 7일 기준선이 APPROVED_PERSONAL 상태여야 합니다.');
    const set=proposalPayload(proposalSet);
    if(!set||set.actualLearnerDataUsed!==true) throw new Error('실제 학습 기록 기반 난이도 제안이 필요합니다.');
    const approved=(set.proposals||[]).filter(x=>x.status==='approved');
    if(!approved.length) throw new Error('관리자가 승인한 난이도 제안이 없습니다.');
    const g=policy.cumulativeGuardrails||{}, prevItems=previousProfile?.items||{}, items={}, audit=[];
    for(const p of approved){
      const qid=String(p.questionId||''); if(!qid) continue;
      const prev=prevItems[qid]||{};
      const original=Math.max(1,Number(prev.originalTargetSeconds||p.before?.targetSeconds||60));
      const current=Math.max(1,Number(prev.targetSeconds||p.before?.targetSeconds||original));
      let target=Math.max(1,Number(p.proposed?.targetSeconds||current));
      const requested=target, reasons=[];
      const reducing=target<current;
      if(reducing){
        const stable=Number(p.answerAccuracy)>=Number(g.minimumAnswerAccuracyForReduction||80)&&Number(p.processPassRate)>=Number(g.minimumProcessPassRateForReduction||75)&&p.timeReductionAllowed!==false;
        if(!stable){target=current;reasons.push('accuracy_or_process_guardrail');}
        const recent=countRecentReductions(applicationHistory,qid,nowIso());
        if(recent>=Number(g.maximumQuestionReductionApprovalsPer30Days||2)){target=current;reasons.push('thirty_day_reduction_frequency_cap');}
        const minPerApproval=Math.ceil(current*(1-Number(g.maximumTimeReductionPerApproval||.03)));
        const minCumulative=Math.ceil(original*(1-Number(g.maximumCumulativeQuestionReduction||.09)));
        target=Math.max(target,minPerApproval,minCumulative);
        if(target>requested) reasons.push('question_reduction_cap');
      } else if(target>current){
        const maxIncrease=Math.floor(current*(1+Number(g.maximumTimeIncreasePerApproval||.20)));
        if(target>maxIncrease){target=maxIncrease;reasons.push('increase_cap');}
      }
      const minimum=String(p.part||'').includes('READ')?Number(g.minimumReadingTargetSeconds||60):Number(g.minimumGrammarTargetSeconds||25);
      target=Math.max(target,minimum);
      items[qid]={
        questionId:qid, conceptId:p.conceptId||null, part:p.part||null, sourceProposalId:p.proposalId||null,
        originalTargetSeconds:original, previousTargetSeconds:current, targetSeconds:Math.round(target),
        targetMultiplierFromOriginal:round(target/original,4), score:Number(p.proposed?.score??p.before?.score??55),
        level:Number(p.proposed?.level??p.before?.level??2), answerAccuracy:Number(p.answerAccuracy||0),
        processPassRate:Number(p.processPassRate||0), appliedCount:Number(prev.appliedCount||0)+1,
        reductionCount:Number(prev.reductionCount||0)+(target<current?1:0), guardrailAdjustments:reasons
      };
      audit.push({questionId:qid,requestedTargetSeconds:requested,approvedTargetSeconds:Math.round(target),guardrailAdjustments:reasons});
    }
    const conceptGroups={};
    for(const item of Object.values(items)){(conceptGroups[item.conceptId]||(conceptGroups[item.conceptId]=[])).push(item)}
    for(const rows of Object.values(conceptGroups)){
      const minMultiplier=1-Number(g.maximumCumulativeConceptReduction||.06);
      if(mean(rows.map(x=>x.targetMultiplierFromOriginal))>=minMultiplier) continue;
      for(const item of rows){
        const floor=Math.ceil(item.originalTargetSeconds*minMultiplier);
        if(item.targetSeconds<floor){item.targetSeconds=floor;item.targetMultiplierFromOriginal=round(floor/item.originalTargetSeconds,4);item.guardrailAdjustments.push('concept_cumulative_reduction_cap');}
      }
    }
    const b=baselinePayload(baseline), stamp=nowIso();
    return {
      format:'JK_ENG_PHASE27_PERSONAL_DIFFICULTY_PROFILE', version:'27.0', profileId:uid('personal-profile'),
      learnerId:'single-learner', status:'APPROVED_NOT_APPLIED', actualLearnerDataUsed:true,
      sourceBaselineId:b.baselineId||'single-learner-first-7-days', sourceProposalSetId:proposalSet?.proposalSetId||set.proposalSetId||null,
      sourceDays:Number(b.sufficientDays||7), items, itemCount:Object.keys(items).length,
      approvedAt:stamp, appliedAt:null, automaticApplication:false, guardrailAudit:audit,
      contentDigest:hashText(JSON.stringify(items)), createdAt:stamp, updatedAt:stamp
    };
  }

  function createApplicationSnapshot({profile,previousProfile=null,baseline=null,note=''}={}) {
    if(!profile) throw new Error('스냅샷 대상 프로필이 없습니다.');
    const content={profile:clone(profile),previousProfile:clone(previousProfile),baseline:clone(baselinePayload(baseline)),note};
    return {format:'JK_ENG_PHASE27_DIFFICULTY_SNAPSHOT',version:'27.0',snapshotId:uid('difficulty-snapshot'),kind:'pre_apply',createdAt:nowIso(),rollbackSupported:true,contentDigest:hashText(JSON.stringify(content)),...content};
  }

  function activateProfile({profile,previousProfile=null,baseline=null,adminConfirmed=false,effectiveAt=nowIso()}={}) {
    if(!adminConfirmed) throw new Error('개인 난이도 적용에는 관리자 확인이 필요합니다.');
    if(profile?.status!=='APPROVED_NOT_APPLIED') throw new Error('승인되었지만 아직 적용되지 않은 프로필만 적용할 수 있습니다.');
    if(!profile.actualLearnerDataUsed) throw new Error('실제 학습 기록 기반 프로필만 적용할 수 있습니다.');
    if(!isApprovedActualBaseline(baseline)) throw new Error('APPROVED_PERSONAL 실제 7일 기준선이 필요합니다.');
    const snapshot=createApplicationSnapshot({profile,previousProfile,baseline,note:'관리자 승인 개인 난이도 적용 직전'});
    const stamp=new Date(effectiveAt).toISOString();
    const baselineDays=(baselinePayload(baseline)?.days||[]).map(x=>dateOnly(x.date||x.dayId)).filter(Boolean).sort();
    const lastBaselineDay=baselineDays.at(-1)||'';
    if(lastBaselineDay&&dateOnly(stamp)<=lastBaselineDay) throw new Error('개인 난이도는 7일 기준선 종료 다음 Day부터 적용할 수 있습니다.');
    const active={...clone(profile),status:'ACTIVE_STABILIZING',appliedAt:stamp,updatedAt:stamp,automaticApplication:false};
    const checkpoints=(policy.checkpoints||[]).map(x=>({days:Number(x.days),minimumSufficientDays:Number(x.minimumSufficientDays),dueDate:addDays(stamp,Number(x.days)-1),status:'PENDING'}));
    const application={
      format:'JK_ENG_PHASE27_DIFFICULTY_APPLICATION',version:'27.0',applicationId:uid('difficulty-application'),
      learnerId:'single-learner',profileId:active.profileId,status:'ACTIVE_STABILIZING',appliedAt:stamp,
      previousProfileId:previousProfile?.profileId||null,preApplicationSnapshotId:snapshot.snapshotId,
      checkpoints,changeHistory:Object.values(active.items||{}).filter(x=>Number(x.targetSeconds)!==Number(x.previousTargetSeconds)).map(x=>({questionId:x.questionId,conceptId:x.conceptId,beforeSeconds:Number(x.previousTargetSeconds),afterSeconds:Number(x.targetSeconds),changeType:Number(x.targetSeconds)<Number(x.previousTargetSeconds)?'reduction':'increase',appliedAt:stamp})),automaticApplication:false,automaticRollback:false,createdAt:stamp,updatedAt:stamp
    };
    return {profile:active,application,snapshot};
  }

  function activeProfile(){
    try{
      const p=JSON.parse(localStorage.getItem(ACTIVE_KEY)||'null');
      return p&&['ACTIVE_STABILIZING','STABLE'].includes(p.status)?p:null;
    }catch(_){return null}
  }
  function saveActiveProfile(profile){
    if(!profile||!['ACTIVE_STABILIZING','STABLE'].includes(profile.status)) throw new Error('활성 상태 프로필만 Daily에 연결할 수 있습니다.');
    localStorage.setItem(ACTIVE_KEY,JSON.stringify(profile));
    try{window.dispatchEvent(new CustomEvent('jk-phase27-difficulty-profile-changed',{detail:clone(profile)}))}catch(_){}
    return clone(profile);
  }
  function clearActiveProfile(){localStorage.removeItem(ACTIVE_KEY);try{window.dispatchEvent(new CustomEvent('jk-phase27-difficulty-profile-changed',{detail:null}))}catch(_){};return null}

  function itemForQuestion(profile,question){
    if(!profile||!question)return null;
    const ids=[question.sourceQuestionId,question.id].filter(Boolean);
    for(const id of ids)if(profile.items?.[id])return profile.items[id];
    return null;
  }
  function applyToQuestionProfile(base,question){
    const p=activeProfile(),item=itemForQuestion(p,question);
    if(!item)return {...base,personalStatus:p?'no_question_override':'not_applied'};
    return {...base,score:Number(item.score??base.score),level:Number(item.level??base.level),targetSeconds:Number(item.targetSeconds||base.targetSeconds),status:'personal_admin_approved',personalStatus:'active',personalProfileId:p.profileId,sourceProposalId:item.sourceProposalId||null};
  }

  function sufficientRow(row){
    const s=policy.sufficientDay||{};
    return Boolean(row.completed&&Number(row.attempts)>=Number(s.minimumAttempts||12)&&Number(row.activeMinutes)>=Number(s.minimumActiveMinutes||25)&&Number(row.grammarMinutes)>=Number(s.minimumGrammarMinutes||12)&&Number(row.readingMinutes)>=Number(s.minimumReadingMinutes||10));
  }
  function metricSummary(rows=[]){
    const good=rows.filter(sufficientRow);
    return {
      sufficientDays:good.length, observedDays:rows.length,
      answerAccuracy:round(mean(good.map(x=>x.answerAccuracy)),1), processPassRate:round(mean(good.map(x=>x.processPassRate)),1),
      fullPassRate:round(mean(good.map(x=>x.fullPassRate)),1), paceOverrunRate:round(mean(good.map(x=>x.paceOverrunRate)),1),
      recoveryRate:round(mean(good.map(x=>x.originalRetryPassRate)),1), transferPassRate:round(mean(good.map(x=>x.transferPassRate)),1),
      activeMinutes:round(mean(good.map(x=>x.activeMinutes)),1), rows:clone(good)
    };
  }
  function baselineSummary(baseline){
    const b=baselinePayload(baseline);
    return metricSummary((b?.days||[]).filter(x=>x.sufficient!==false));
  }
  function reportContextMap(reports=[]){return Object.fromEntries(reports.map(r=>[dateOnly(r.dayId||r.date),r]))}
  function contextDiagnostics(rows=[],reports=[]){
    const map=reportContextMap(reports), groups={medicationTiming:{},deviceCategory:{},interruptionBand:{}};
    const band=n=>Number(n||0)===0?'none':Number(n)<=1?'low':Number(n)<=3?'medium':'high';
    const add=(group,key,row)=>{const g=groups[group][key]||(groups[group][key]={days:0,answerAccuracy:[],processPassRate:[],paceOverrunRate:[]});g.days++;g.answerAccuracy.push(row.answerAccuracy);g.processPassRate.push(row.processPassRate);g.paceOverrunRate.push(row.paceOverrunRate)};
    for(const row of rows){
      const r=map[row.date]||{},med=r.medicationTiming||'unknown',device=r.deviceCategory||'unknown',ib=r.interruptionBand||band(r.interruptionCount);
      add('medicationTiming',med,row);add('deviceCategory',device,row);add('interruptionBand',ib,row);
    }
    for(const group of Object.values(groups))for(const [key,g] of Object.entries(group))group[key]={key,days:g.days,answerAccuracy:round(mean(g.answerAccuracy),1),processPassRate:round(mean(g.processPassRate),1),paceOverrunRate:round(mean(g.paceOverrunRate),1)};
    return {usedForDecision:false,purpose:policy.context?.purpose||'',groups};
  }

  function compareMetrics(base,observed){
    const t=policy.regressionThresholds||{};
    const changes={
      answerAccuracy:round(observed.answerAccuracy-base.answerAccuracy,1),
      processPassRate:round(observed.processPassRate-base.processPassRate,1),
      fullPassRate:round(observed.fullPassRate-base.fullPassRate,1),
      paceOverrunRate:round(observed.paceOverrunRate-base.paceOverrunRate,1),
      recoveryRate:round(observed.recoveryRate-base.recoveryRate,1),
      transferPassRate:round(observed.transferPassRate-base.transferPassRate,1)
    };
    const triggers=[];
    if(changes.answerAccuracy<=-Number(t.answerAccuracyDropPoints||8))triggers.push('answer_accuracy_regression');
    if(changes.processPassRate<=-Number(t.processPassDropPoints||8))triggers.push('process_pass_regression');
    if(changes.paceOverrunRate>=Number(t.paceOverrunIncreasePoints||12))triggers.push('pace_overrun_regression');
    if(changes.recoveryRate<=-Number(t.recoveryDropPoints||10))triggers.push('recovery_regression');
    if(changes.transferPassRate<=-Number(t.transferDropPoints||10))triggers.push('transfer_regression');
    const severe=changes.answerAccuracy<=-Number(t.severeAnswerOrProcessDropPoints||12)||changes.processPassRate<=-Number(t.severeAnswerOrProcessDropPoints||12)||changes.paceOverrunRate>=Number(t.severePaceIncreasePoints||20)||changes.recoveryRate<=-Number(t.severeRecoveryDropPoints||15);
    const recommendRollback=severe||triggers.length>=Number(t.minimumTriggersForRollbackProposal||2);
    return {changes,triggers,severe,recommendRollback,automaticRollback:false};
  }

  function evaluateApplication({application,baseline,events=[],sessions=[],reports=[],questions=[],asOf=nowIso(),actualLearnerData=true}={}) {
    const b=baselinePayload(baseline);
    if(!application||!isApprovedActualBaseline(b)||actualLearnerData===false){
      return {format:'JK_ENG_PHASE27_STABILITY_OBSERVATION',version:'27.0',status:'NOT_COLLECTED',actualLearnerDataUsed:false,checkpoints:[],rollbackRecommended:false,automaticRollback:false,contextDiagnostics:{usedForDecision:false,groups:{}}};
    }
    const metrics=window.JK_PHASE26?.dailyMetrics?window.JK_PHASE26.dailyMetrics({events,sessions,reports,questions}):{rows:[]};
    const applied=dateOnly(application.appliedAt), today=dateOnly(asOf), elapsed=daysBetween(applied,today), base=baselineSummary(b), checkpoints=[];
    for(const cp of policy.checkpoints||[]){
      const days=Number(cp.days),due=addDays(applied,days-1),windowRows=(metrics.rows||[]).filter(r=>r.date>=applied&&r.date<=due),summary=metricSummary(windowRows);
      let status='PENDING',comparison=null;
      if(elapsed>=days){status=summary.sufficientDays>=Number(cp.minimumSufficientDays||1)?'COMPLETE':'INSUFFICIENT';if(status==='COMPLETE')comparison=compareMetrics(base,summary)}
      checkpoints.push({days,dueDate:due,status,minimumSufficientDays:Number(cp.minimumSufficientDays||1),summary,comparison});
    }
    const complete=checkpoints.filter(x=>x.status==='COMPLETE'),latest=complete.at(-1)||null,rollbackRecommended=Boolean(latest?.comparison?.recommendRollback);
    const status=rollbackRecommended?'ROLLBACK_RECOMMENDED':complete.some(x=>x.days===30)?'STABLE':'ACTIVE_STABILIZING';
    const observedRows=latest?.summary?.rows||[];
    return {
      format:'JK_ENG_PHASE27_STABILITY_OBSERVATION',version:'27.0',observationId:uid('stability-observation'),
      learnerId:'single-learner',applicationId:application.applicationId,profileId:application.profileId,status,
      actualLearnerDataUsed:true,appliedAt:application.appliedAt,asOf:new Date(asOf).toISOString(),elapsedCalendarDays:elapsed,
      baseline:base,checkpoints,latestCheckpointDays:latest?.days||null,rollbackRecommended,
      rollbackProposalReason:rollbackRecommended?latest.comparison.triggers:[],automaticRollback:false,
      contextDiagnostics:contextDiagnostics(observedRows,reports),createdAt:nowIso(),updatedAt:nowIso()
    };
  }

  function createRegressionAlert(observation){
    if(!observation?.rollbackRecommended)return null;
    return {format:'JK_ENG_PHASE27_REGRESSION_ALERT',version:'27.0',alertId:uid('regression-alert'),learnerId:'single-learner',applicationId:observation.applicationId,profileId:observation.profileId,status:'pending_admin',checkpointDays:observation.latestCheckpointDays,reasons:clone(observation.rollbackProposalReason||[]),automaticRollback:false,createdAt:nowIso(),updatedAt:nowIso()};
  }
  function rollbackApplication({application,snapshot,adminConfirmed=false}={}){
    if(!adminConfirmed)throw new Error('개인 난이도 롤백에는 관리자 확인이 필요합니다.');
    if(!snapshot?.rollbackSupported)throw new Error('롤백 가능한 적용 전 스냅샷이 없습니다.');
    const restored=clone(snapshot.previousProfile||null),stamp=nowIso();
    if(restored){restored.status=['ACTIVE_STABILIZING','STABLE'].includes(restored.status)?restored.status:'STABLE';restored.updatedAt=stamp;saveActiveProfile(restored)}else clearActiveProfile();
    return {application:{...clone(application),status:'ROLLED_BACK',rolledBackAt:stamp,updatedAt:stamp,automaticRollback:false},restoredProfile:restored,rolledBackFromSnapshotId:snapshot.snapshotId,automaticRollback:false};
  }

  function nextCheckpoint(application,asOf=nowIso()){
    const today=dateOnly(asOf);return (application?.checkpoints||[]).find(x=>x.status!=='COMPLETE'&&x.dueDate>=today)||null;
  }

  window.JK_PHASE27={
    policy,emptyState,isApprovedActualBaseline,createApprovedProfile,createApplicationSnapshot,activateProfile,
    activeProfile,saveActiveProfile,clearActiveProfile,itemForQuestion,applyToQuestionProfile,
    sufficientRow,metricSummary,baselineSummary,contextDiagnostics,compareMetrics,evaluateApplication,
    createRegressionAlert,rollbackApplication,nextCheckpoint,hashText,dateOnly,addDays,daysBetween
  };
})();
