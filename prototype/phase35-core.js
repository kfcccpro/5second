(function(global){
'use strict';
const VERSION='35.0';
const text=value=>String(value==null?'':value).trim();
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();
const uid=prefix=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const policy=()=>global.JK_PHASE35_DATA?.policy||{};
const AXES=['conceptActivation','stageExecution','evidenceJudgment','finalAccuracy','paceStability','recoveryTransfer'];
const dayOf=value=>{const raw=text(value?.date||value?.dayId||value);const m=raw.match(/(\d{4}-\d{2}-\d{2})/);return m?m[1]:''};
const sortedUnique=rows=>[...new Map((rows||[]).map(x=>[dayOf(x),x]).filter(([k])=>k)).values()].sort((a,b)=>dayOf(a).localeCompare(dayOf(b)));
const avg=values=>{const rows=values.map(Number).filter(Number.isFinite);return rows.length?Math.round(rows.reduce((a,b)=>a+b,0)*10/rows.length)/10:null};
function verifyPhase34Completion(input={},p=policy()){
  const execution=input.execution||{},smoke=input.smoke||{},observation=input.observation||{},evaluation=input.evaluation||{},rollbacks=Array.isArray(input.rollbacks)?input.rollbacks:[];
  const checks=[],errors=[];const add=(id,ok,detail='')=>{checks.push({id,ok:Boolean(ok),detail:text(detail)});if(!ok)errors.push(id)};
  const req=p.phase34Prerequisite||{};
  add('CUTOVER_EXECUTED',execution.status===req.cutoverStatus&&execution.accepted===true,execution.status||'CUTOVER_NOT_RUN');
  add('CUTOVER_ACTUAL_EXTERNAL',req.actualExternalContextRequired!==true||execution.actualExternalContext===true,String(execution.actualExternalContext));
  add('SMOKE_PASS',smoke.status===req.smokeStatus,smoke.status||'SMOKE_NOT_RUN');
  add('SMOKE_ACTUAL_EXTERNAL',req.actualExternalContextRequired!==true||smoke.actualExternalContext===true,String(smoke.actualExternalContext));
  add('OBSERVATION_RECORD',Boolean(observation.startedAt&&observation.endsAt),observation.status||'OBSERVATION_NOT_RUN');
  add('OBSERVATION_COMPLETE',evaluation.status===req.observationStatus,evaluation.status||'OBSERVATION_NOT_RUN');
  add('ROLLBACK_NOT_REQUIRED',evaluation.rollbackDecision===req.rollbackDecision,evaluation.rollbackDecision||'ROLLBACK_NOT_REQUIRED');
  add('NO_ACCEPTED_ROLLBACK',!rollbacks.some(r=>r?.accepted===true&&r?.status==='ROLLBACK_REQUESTED'),String(rollbacks.filter(r=>r?.accepted===true).length));
  const pass=errors.length===0;
  return {format:'JK_ENG_PHASE35_PHASE34_INPUT',version:VERSION,status:pass?'PASS':'NOT_READY',readyForSevenDayStabilization:pass,actualExternalContext:pass,checks,errors,cutoverAt:execution.executedAt||null,observationStartedAt:observation.startedAt||null,observationEndedAt:observation.endsAt||null,verifiedAt:nowIso(),automaticPromotion:false};
}
function evaluateSevenDayBaseline(input={},p=policy()){
  const baseline=input.baseline||{},reports=sortedUnique(input.dailyReports||[]),cfg=p.sevenDayBaseline||{},required=Number(cfg.requiredDays||7),accepted=new Set(cfg.acceptedStatuses||['READY_FOR_REVIEW','APPROVED_PERSONAL']);
  const startDate=dayOf(input.stabilizationStartDate||''),sourceDays=sortedUnique((baseline.days||[]).filter(d=>d?.sufficient===true&&(!startDate||dayOf(d)>=startDate)));
  const reportMap=new Map(reports.map(r=>[dayOf(r),r])),selected=sourceDays.slice(0,required),missingReports=selected.filter(d=>!reportMap.has(dayOf(d))).map(dayOf);
  const checks=[],errors=[];const add=(id,ok,detail='')=>{checks.push({id,ok:Boolean(ok),detail:text(detail)});if(!ok)errors.push(id)};
  add('BASELINE_FORMAT',baseline.format===cfg.sourceFormat,baseline.format||'missing');
  add('BASELINE_VERSION',baseline.version===cfg.sourceVersion,baseline.version||'missing');
  add('ACTUAL_LEARNER_DATA',cfg.actualLearnerDataRequired!==true||baseline.actualLearnerDataUsed===true,String(baseline.actualLearnerDataUsed));
  add('BASELINE_STATUS',accepted.has(baseline.status),baseline.status||'NOT_COLLECTED');
  add('SUFFICIENT_DAYS',Number(baseline.sufficientDays||0)>=required,`${baseline.sufficientDays||0}/${required}`);
  add('DATA_SUFFICIENT',baseline.dataSufficient===true,String(baseline.dataSufficient));
  add('STABILIZATION_START_DATE',Boolean(startDate),startDate||'missing');
  add('POST_OBSERVATION_DAYS',Boolean(startDate)&&selected.length===required&&selected.every(d=>dayOf(d)>=startDate),selected.map(dayOf).join(','));
  add('REPORTS_FOR_SUFFICIENT_DAYS',selected.length===required&&missingReports.length===0,missingReports.join(',')||`${selected.length}/${required}`);
  const selectedReports=selected.map(d=>reportMap.get(dayOf(d))).filter(Boolean);
  add('REPORTS_COMPLETED',selectedReports.length===required&&selectedReports.every(r=>Boolean(r.completedAt)),`${selectedReports.filter(r=>r?.completedAt).length}/${required}`);
  const span=selected.length?Math.round((Date.parse(dayOf(selected.at(-1)))-Date.parse(dayOf(selected[0])))/86400000)+1:0;
  add('CALENDAR_SPAN',selected.length===required&&span<=Number(cfg.maxCalendarSpanDays||14),String(span));
  const pass=errors.length===0;
  const totals={attempts:selectedReports.reduce((s,r)=>s+Number(r.attempts||0),0),activeMinutes:Math.round(selectedReports.reduce((s,r)=>s+Number(r.activeMinutes||0),0)*10)/10};
  const averages={activeMinutes:avg(selectedReports.map(r=>r.activeMinutes)),answerAccuracy:avg(selectedReports.map(r=>r.answerAccuracy)),processPassRate:avg(selectedReports.map(r=>r.processPassRate)),recoveryRate:avg(selectedReports.map(r=>r.recoveryRate)),paceStability:avg(selectedReports.map(r=>r.axes?.paceStability))};
  return {format:'JK_ENG_PHASE35_SEVEN_DAY_BASELINE_EVALUATION',version:VERSION,status:pass?'BASELINE_READY':'NOT_COLLECTED',stabilizationStartDate:startDate,actualLearnerDataUsed:pass,requiredDays:required,sufficientDays:pass?selected.length:Number(baseline.sufficientDays||0),calendarSpanDays:span,days:selected.map(d=>clone(d)),reportDates:selectedReports.map(dayOf),missingReports,totals,averages,checks,errors,evaluatedAt:nowIso(),automaticPersonalizationChange:false};
}
function aggregateSevenDayHex(input={},p=policy()){
  const baseline=input.baselineEvaluation||{},reports=sortedUnique(input.dailyReports||[]),map=new Map(reports.map(r=>[dayOf(r),r])),dates=(baseline.reportDates||[]).slice(0,Number(p.sevenDayBaseline?.requiredDays||7)),rows=dates.map(d=>map.get(d)).filter(Boolean),axes={},evidence={};
  for(const axis of AXES){axes[axis]=avg(rows.map(r=>r.axes?.[axis]))??0;evidence[axis]=rows.reduce((s,r)=>s+Number(r.axisEvidence?.[axis]||0),0)}
  const ready=baseline.status==='BASELINE_READY'&&rows.length===Number(p.sevenDayBaseline?.requiredDays||7);
  return {format:'JK_ENG_PHASE35_SEVEN_DAY_HEX',version:VERSION,status:ready?'READY':'NOT_COLLECTED',days:rows.length,axes,evidence,sourceDates:dates,thresholdsChanged:false,personalizationChanged:false,generatedAt:nowIso()};
}
function createDailyOpsSnapshot(input={},p=policy()){
  const cfg=p.dailyOperations||{},date=dayOf(input.date),sync=text(input.syncStatus).toUpperCase(),backup=text(input.backupStatus).toUpperCase(),recovery=text(input.recoveryStatus).toUpperCase(),incidentReview=text(input.incidentReviewStatus||'INCOMPLETE').toUpperCase(),operator=text(input.operator),evidence=text(input.evidence),errors=[];
  if(!date)errors.push('DATE_REQUIRED');if(cfg.requiresPhase34Ready===true&&input.phase34Ready!==true)errors.push('PHASE34_OBSERVATION_COMPLETE_REQUIRED');if(input.stabilizationStartDate&&date<dayOf(input.stabilizationStartDate))errors.push('DATE_BEFORE_STABILIZATION_START');if(cfg.actualExternalContextRequired===true&&input.actualExternalContext!==true)errors.push('ACTUAL_EXTERNAL_CONTEXT_REQUIRED');if(!(cfg.syncStatuses||[]).includes(sync))errors.push('SYNC_STATUS_INVALID');if(!(cfg.backupStatuses||[]).includes(backup))errors.push('BACKUP_STATUS_INVALID');if(!(cfg.recoveryStatuses||[]).includes(recovery))errors.push('RECOVERY_STATUS_INVALID');if(!(cfg.incidentReviewStatuses||[]).includes(incidentReview))errors.push('INCIDENT_REVIEW_STATUS_INVALID');if(!operator)errors.push('OPERATOR_REQUIRED');if(!evidence)errors.push('EVIDENCE_REQUIRED');
  const accepted=errors.length===0;
  return {format:'JK_ENG_PHASE35_DAILY_OPERATIONS_SNAPSHOT',version:VERSION,snapshotId:text(input.snapshotId)||uid(`ops-${date||'day'}`),date,status:accepted?'RECORDED':'REJECTED',accepted,errors,actualExternalContext:Boolean(input.actualExternalContext),syncStatus:sync||'NOT_VERIFIED',backupStatus:backup||'NOT_VERIFIED',recoveryStatus:recovery||'NOT_VERIFIED',incidentReviewStatus:incidentReview,queuedSync:Math.max(0,Number(input.queuedSync||0)),failedSync:Math.max(0,Number(input.failedSync||0)),incidentCounts:clone(input.incidentCounts||{}),operator,evidence,recordedAt:input.recordedAt||nowIso(),immutable:true,automaticPass:false};
}
function createP2Disposition(input={},p=policy()){
  const cfg=p.p2Disposition||{},incident=input.incident||{},action=text(input.action).toUpperCase(),operator=text(input.operator),reason=text(input.reason),errors=[];
  if(text(incident.severity).toUpperCase()!=='P2')errors.push('P2_ONLY');if(!(cfg.allowedActions||[]).includes(action))errors.push('ACTION_INVALID');if(cfg.operatorRequired!==false&&!operator)errors.push('OPERATOR_REQUIRED');if(cfg.reasonRequired!==false&&!reason)errors.push('REASON_REQUIRED');
  const accepted=errors.length===0;return {format:'JK_ENG_PHASE35_P2_DISPOSITION',version:VERSION,dispositionId:text(input.dispositionId)||uid('p2-disposition'),incidentId:incident.incidentId||null,severity:'P2',action,status:accepted?'RECORDED':'REJECTED',accepted,errors,operator,reason,decidedAt:input.decidedAt||nowIso(),immutable:true};
}
function summarizeOperations(input={},p=policy()){
  const required=Number(p.dailyOperations?.requiredDays||7),dates=(input.dates||[]).map(dayOf).filter(Boolean).slice(0,required),snapshots=sortedUnique((input.opsSnapshots||[]).filter(x=>x?.accepted===true)),snapMap=new Map(snapshots.map(x=>[dayOf(x),x])),dispositions=(input.dispositions||[]).filter(x=>x?.accepted===true),dispMap=new Map();for(const d of dispositions.sort((a,b)=>Date.parse(a.decidedAt||0)-Date.parse(b.decidedAt||0)))dispMap.set(d.incidentId,d);
  const incidents=(input.incidents||[]).map(x=>clone(x));const openCritical=incidents.filter(i=>['P0','P1'].includes(text(i.severity).toUpperCase())&&text(i.status).toUpperCase()!=='CLOSED');const openP2=incidents.filter(i=>text(i.severity).toUpperCase()==='P2'&&text(i.status).toUpperCase()==='OPEN'&&!dispMap.has(i.incidentId));
  const dayRows=dates.map(date=>{const s=snapMap.get(date);return {date,status:s?'RECORDED':'MISSING',syncStatus:s?.syncStatus||'NOT_VERIFIED',backupStatus:s?.backupStatus||'NOT_VERIFIED',recoveryStatus:s?.recoveryStatus||'NOT_VERIFIED',incidentReviewStatus:s?.incidentReviewStatus||'INCOMPLETE',queuedSync:s?.queuedSync||0,failedSync:s?.failedSync||0,evidence:s?.evidence||'',operator:s?.operator||''}});
  const missingDays=dayRows.filter(x=>x.status==='MISSING').map(x=>x.date),syncFailures=dayRows.filter(x=>x.syncStatus==='FAILED'||x.failedSync>0),backupFailures=dayRows.filter(x=>x.backupStatus!=='PASS'),recoveryFailures=dayRows.filter(x=>x.recoveryStatus!=='READY'),reviewIncomplete=dayRows.filter(x=>x.incidentReviewStatus!=='COMPLETE');
  const severityCounts={P0:incidents.filter(i=>text(i.severity).toUpperCase()==='P0').length,P1:incidents.filter(i=>text(i.severity).toUpperCase()==='P1').length,P2:incidents.filter(i=>text(i.severity).toUpperCase()==='P2').length};
  const ready=dates.length===required&&!missingDays.length&&!openCritical.length&&!openP2.length&&!syncFailures.length&&!backupFailures.length&&!recoveryFailures.length&&!reviewIncomplete.length;
  return {format:'JK_ENG_PHASE35_OPERATIONS_SUMMARY',version:VERSION,status:ready?'OPERATIONS_READY':'OPERATIONS_INCOMPLETE',requiredDays:required,days:dayRows,missingDays,severityCounts,openP0P1:openCritical.length,unresolvedP2:openP2.length,syncFailureDays:syncFailures.map(x=>x.date),backupNotPassDays:backupFailures.map(x=>x.date),recoveryNotReadyDays:recoveryFailures.map(x=>x.date),incidentReviewIncompleteDays:reviewIncomplete.map(x=>x.date),p2Dispositions:dispositions.length,ready,evaluatedAt:nowIso()};
}
function evaluateRelease(input={},p=policy()){
  const observation=input.observationInput||{},baseline=input.baselineEvaluation||{},hex=input.hex||{},operations=input.operations||{},checks=[],reasons=[];const add=(id,ok,detail='')=>{checks.push({id,ok:Boolean(ok),detail:text(detail)});if(!ok)reasons.push(id)};
  add('PHASE34_OBSERVATION_COMPLETE',observation.status==='PASS'&&observation.readyForSevenDayStabilization===true,observation.status||'NOT_READY');
  add('ACTUAL_EXTERNAL_EXECUTION',observation.actualExternalContext===true,String(observation.actualExternalContext));
  add('SEVEN_ACTUAL_DAYS',baseline.status==='BASELINE_READY'&&baseline.actualLearnerDataUsed===true&&Number(baseline.sufficientDays||0)>=Number(p.sevenDayBaseline?.requiredDays||7),`${baseline.sufficientDays||0}/${p.sevenDayBaseline?.requiredDays||7}`);
  add('SEVEN_DAY_HEX_READY',hex.status==='READY'&&hex.personalizationChanged===false,hex.status||'NOT_COLLECTED');
  add('SEVEN_DAY_OPERATIONS_READY',operations.status==='OPERATIONS_READY'&&operations.ready===true,operations.status||'OPERATIONS_INCOMPLETE');
  add('NO_OPEN_P0_P1',Number(operations.openP0P1||0)===0,String(operations.openP0P1||0));
  add('NO_UNRESOLVED_P2',Number(operations.unresolvedP2||0)===0,String(operations.unresolvedP2||0));
  const ready=reasons.length===0;
  return {format:'JK_ENG_PHASE35_RELEASE_EVALUATION',version:VERSION,candidate:p.candidate||'JK English v1.0 RC2',releaseTarget:p.releaseTarget||'JK English v1.0',status:ready?'READY_FOR_MANUAL_RELEASE':'RELEASE_HOLD',readyForManualRelease:ready,checks,reasons,evaluatedAt:nowIso(),automaticRelease:false,personalizationThresholdsChanged:false};
}
function makeReleaseDecision(input={},evaluation={},p=policy()){
  const action=text(input.action||'HOLD').toUpperCase(),reviewer=text(input.reviewer),reason=text(input.reason),confirmation=text(input.confirmationPhrase),errors=[];if(!(p.releaseDecision?.allowedActions||['RELEASE','HOLD']).includes(action))errors.push('ACTION_INVALID');if(p.releaseDecision?.reviewerRequired!==false&&!reviewer)errors.push('REVIEWER_REQUIRED');if(p.releaseDecision?.reasonRequired!==false&&!reason)errors.push('REASON_REQUIRED');if(action==='RELEASE'&&(evaluation?.status!=='READY_FOR_MANUAL_RELEASE'||evaluation?.readyForManualRelease!==true))errors.push('RELEASE_GATE_NOT_READY');if(action==='RELEASE'&&confirmation!==(p.releaseDecision?.releaseConfirmationPhrase||'RELEASE JK ENGLISH V1.0'))errors.push('RELEASE_CONFIRMATION_MISMATCH');const accepted=errors.length===0;
  return {format:'JK_ENG_PHASE35_RELEASE_DECISION',version:VERSION,decisionId:text(input.decisionId)||uid('v1-release-decision'),action,status:accepted?'RECORDED':'REJECTED',accepted,errors,reviewer,reason,confirmationMatched:action!=='RELEASE'||errors.indexOf('RELEASE_CONFIRMATION_MISMATCH')<0,evaluationStatus:evaluation?.status||'RELEASE_HOLD',decidedAt:input.decidedAt||nowIso(),immutable:true,automaticRelease:false};
}
function buildReleaseAuditBundle(input={},p=policy()){
  return {format:'JK_ENG_PHASE35_V1_RELEASE_AUDIT_BUNDLE',version:VERSION,candidate:p.candidate||'JK English v1.0 RC2',releaseTarget:p.releaseTarget||'JK English v1.0',exportedAt:nowIso(),policy:clone(p),state:clone(global.JK_PHASE35_DATA?.state||{}),phase34ObservationInput:clone(input.observationInput||null),baselineEvaluation:clone(input.baselineEvaluation||null),sevenDayHex:clone(input.hex||null),operationsSummary:clone(input.operations||null),operationsSnapshots:clone(input.opsSnapshots||[]),p2Dispositions:clone(input.dispositions||[]),releaseEvaluation:clone(input.releaseEvaluation||null),releaseDecisions:clone(input.releaseDecisions||[]),truthfulBoundary:{manualReleaseOnly:true,releaseEvaluationIsNotReleaseExecution:true,syntheticOrMissingDataCannotRelease:true,automaticPersonalizationChange:false}};
}
const api={VERSION,AXES,verifyPhase34Completion,evaluateSevenDayBaseline,aggregateSevenDayHex,createDailyOpsSnapshot,createP2Disposition,summarizeOperations,evaluateRelease,makeReleaseDecision,buildReleaseAuditBundle};
if(typeof module!=='undefined'&&module.exports)module.exports=api;global.JK_PHASE35=api;
})(typeof globalThis!=='undefined'?globalThis:this);
