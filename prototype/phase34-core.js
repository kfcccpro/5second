(function(global){
'use strict';
const VERSION='34.0';
const text=value=>String(value==null?'':value).trim();
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();
const uid=prefix=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const policy=()=>global.JK_PHASE34_DATA?.policy||{};
const normalizeHash=value=>text(value).toLowerCase().replace(/^sha256:/,'').trim();
function latestDecision(decisions=[]){
  return (Array.isArray(decisions)?decisions:[]).slice().sort((a,b)=>Date.parse(b?.decidedAt||0)-Date.parse(a?.decidedAt||0))[0]||null;
}
function verifyApprovedAuditBundle(bundle={},options={},p=policy()){
  const checks=[],errors=[];const add=(id,ok,detail='')=>{checks.push({id,ok:Boolean(ok),detail:text(detail)});if(!ok)errors.push({id,detail:text(detail)})};
  const accepted=p.acceptedAuditBundle||{},computed=normalizeHash(options.computedSha256),expected=normalizeHash(options.expectedSha256),decision=latestDecision(bundle?.manualDecisions||[]),evaluation=bundle?.finalEvaluation||{},verification=bundle?.evidenceVerification||{};
  add('BUNDLE_FORMAT',bundle?.format===accepted.format,`${bundle?.format||'missing'} / expected ${accepted.format||'-'}`);
  add('BUNDLE_VERSION',bundle?.version===accepted.version,`${bundle?.version||'missing'} / expected ${accepted.version||'-'}`);
  add('BUNDLE_CANDIDATE',bundle?.candidate===accepted.candidate,`${bundle?.candidate||'missing'} / expected ${accepted.candidate||'-'}`);
  add('EXPECTED_SHA256_REQUIRED',/^[a-f0-9]{64}$/.test(expected),expected||'missing');
  add('COMPUTED_SHA256',/^[a-f0-9]{64}$/.test(computed),computed||'missing');
  add('BUNDLE_SHA256_MATCH',Boolean(expected&&computed&&expected===computed),computed&&expected?`${computed===expected?'match':'mismatch'}`:'missing hash');
  add('LATEST_DECISION_EXISTS',Boolean(decision),decision?.decisionId||'missing');
  add('LATEST_DECISION_APPROVE',decision?.action==='APPROVE',decision?.action||'missing');
  add('LATEST_DECISION_ACCEPTED',decision?.accepted===true,String(decision?.accepted));
  add('LATEST_DECISION_IMMUTABLE',decision?.immutable===true,String(decision?.immutable));
  add('EVALUATION_READY',evaluation?.status==='READY_FOR_MANUAL_APPROVAL'&&evaluation?.readyForApproval===true,evaluation?.status||'missing');
  add('EVIDENCE_VERIFICATION_PASS',verification?.status==='PASS'&&verification?.integrityPass!==false,verification?.status||'missing');
  add('ALL_EXTERNAL_GATES_PASS',evaluation?.allGatesPass===true&&Array.isArray(evaluation?.gates)&&evaluation.gates.length>0&&evaluation.gates.every(g=>g.status==='PASS'&&g.pass!==false),`${(evaluation?.gates||[]).filter(g=>g.status==='PASS').length}/${(evaluation?.gates||[]).length}`);
  add('DEFECT_GATE_CLEAR',evaluation?.defectsPass===true&&Number(evaluation?.blockers?.releaseBlocking||0)===0&&Number(evaluation?.blockers?.unresolvedP2||0)===0,JSON.stringify(evaluation?.blockers||{}).slice(0,180));
  const source=bundle?.sourcePackage||{};add('SOURCE_PACKAGE_PHASE32',source?.format==='JK_ENG_PHASE32_REHEARSAL_EVIDENCE_PACKAGE'&&source?.version==='32.0',`${source?.format||'missing'} ${source?.version||''}`);
  const pass=errors.length===0;
  return {format:'JK_ENG_PHASE34_PREDEPLOY_REVERIFICATION',version:VERSION,verificationId:text(options.verificationId)||uid('cutover-predeploy'),status:pass?'PASS':'FAIL',approvedForCutover:pass,bundleSha256:computed,expectedSha256:expected,latestDecision:clone(decision),gateCount:(evaluation?.gates||[]).length,checks,errors,reverifiedAt:nowIso(),automaticCutover:false};
}
function normalizeChecklist(input={},p=policy()){
  const required=p.cutoverLock?.requiredChecklist||[];const values={};for(const key of required)values[key]=Boolean(input?.[key]);return {required,values,missing:required.filter(k=>!values[k]),complete:required.every(k=>values[k])};
}
function createCutoverLock(input={},verification={},p=policy()){
  const checklist=normalizeChecklist(input.checklist||{},p),operator=text(input.operator),reason=text(input.reason),errors=[];
  if(verification?.status!=='PASS'||verification?.approvedForCutover!==true)errors.push('APPROVED_AUDIT_BUNDLE_REQUIRED');
  if(!/^[a-f0-9]{64}$/.test(normalizeHash(verification?.bundleSha256)))errors.push('BUNDLE_SHA256_REQUIRED');
  if(!checklist.complete)errors.push('CHECKLIST_INCOMPLETE');if(!operator)errors.push('OPERATOR_REQUIRED');if(!reason)errors.push('REASON_REQUIRED');
  const accepted=errors.length===0;
  return {format:'JK_ENG_PHASE34_CUTOVER_LOCK',version:VERSION,lockId:text(input.lockId)||uid('cutover-lock'),status:accepted?'LOCKED':'LOCK_REJECTED',accepted,errors,checklist,operator,reason,bundleSha256:normalizeHash(verification?.bundleSha256),verificationId:verification?.verificationId||null,lockedAt:input.lockedAt||nowIso(),immutable:true,automaticCutover:false};
}
function createCutoverExecution(input={},lock={},p=policy()){
  const targetUrl=text(input.targetUrl).replace(/\/$/,'');let parsed=null;try{parsed=new URL(targetUrl)}catch(_){ }
  const phrase=text(input.confirmationPhrase),rehash=normalizeHash(input.reverifiedSha256),errors=[];
  if(lock?.status!=='LOCKED'||lock?.accepted!==true)errors.push('EXECUTION_LOCK_REQUIRED');
  if(!parsed||parsed.protocol!=='https:')errors.push('HTTPS_TARGET_REQUIRED');
  if(input.actualExternalContext!==true)errors.push('ACTUAL_EXTERNAL_CONTEXT_REQUIRED');
  if(phrase!==(p.cutoverLock?.confirmationPhrase||'EXECUTE RC2 CUTOVER'))errors.push('CONFIRMATION_PHRASE_MISMATCH');
  if(!rehash||rehash!==normalizeHash(lock?.bundleSha256))errors.push('PREEXECUTION_REHASH_MISMATCH');
  if(!text(input.operator))errors.push('OPERATOR_REQUIRED');
  const accepted=errors.length===0;
  return {format:'JK_ENG_PHASE34_CUTOVER_EXECUTION',version:VERSION,executionId:text(input.executionId)||uid('cutover-execution'),status:accepted?'CUTOVER_EXECUTED':'CUTOVER_BLOCKED',accepted,errors,lockId:lock?.lockId||null,bundleSha256:rehash||null,targetUrl:targetUrl||null,actualExternalContext:Boolean(input.actualExternalContext),operator:text(input.operator),executedAt:input.executedAt||nowIso(),automaticCutover:false};
}
function evaluateSmokeRun(input={},execution={},p=policy()){
  const actual=Boolean(input.actualExternalContext),defs=p.smokeTests||[],provided=input.tests||{};
  if(execution?.status!=='CUTOVER_EXECUTED'||execution?.accepted!==true)return {format:'JK_ENG_PHASE34_SMOKE_RUN',version:VERSION,runId:text(input.runId)||uid('smoke-run'),status:'SMOKE_NOT_RUN',tests:defs.map(d=>({id:d.id,label:d.label,status:'NOT_RUN',evidence:''})),actualExternalContext:false,errors:['CUTOVER_NOT_EXECUTED'],testedAt:null};
  const rows=defs.map(def=>{const raw=provided[def.id]||{},status=text(raw.status||'NOT_RUN').toUpperCase(),evidence=text(raw.evidence);let final=status;if(status==='PASS'&&(!actual||!evidence))final='INCOMPLETE_EVIDENCE';return{id:def.id,label:def.label,status:final,evidence,pass:final==='PASS'}});
  const failed=rows.some(r=>r.status==='FAIL'),allPass=rows.length>0&&rows.every(r=>r.pass),status=!actual?'SMOKE_INCOMPLETE':failed?'SMOKE_FAIL':allPass?'SMOKE_PASS':'SMOKE_INCOMPLETE';
  return {format:'JK_ENG_PHASE34_SMOKE_RUN',version:VERSION,runId:text(input.runId)||uid('smoke-run'),status,tests:rows,actualExternalContext:actual,operator:text(input.operator),targetUrl:execution.targetUrl||null,errors:actual?[]:['ACTUAL_EXTERNAL_CONTEXT_REQUIRED'],testedAt:input.testedAt||nowIso(),automaticPass:false};
}
function startObservation(input={},execution={},smoke={},p=policy()){
  if(execution?.status!=='CUTOVER_EXECUTED'||smoke?.status!=='SMOKE_PASS')return {format:'JK_ENG_PHASE34_OBSERVATION',version:VERSION,observationId:text(input.observationId)||uid('observation'),status:'OBSERVATION_NOT_RUN',errors:['CUTOVER_AND_SMOKE_PASS_REQUIRED'],startedAt:null,endsAt:null,hours:Number(p.observation?.hours||24)};
  const startedAt=input.startedAt||nowIso(),ms=Date.parse(startedAt),hours=Number(p.observation?.hours||24),endsAt=new Date(ms+hours*3600000).toISOString();
  return {format:'JK_ENG_PHASE34_OBSERVATION',version:VERSION,observationId:text(input.observationId)||uid('observation'),status:'OBSERVING',errors:[],startedAt,endsAt,hours,targetUrl:execution.targetUrl||null,operator:text(input.operator),automaticRollback:false};
}
function normalizeIncident(input={},p=policy()){
  const allowed=p.observation?.incidentSeverities||['P0','P1','P2'],severity=text(input.severity||'P2').toUpperCase(),status=text(input.status||'OPEN').toUpperCase();
  return {format:'JK_ENG_PHASE34_OBSERVATION_INCIDENT',version:VERSION,incidentId:text(input.incidentId)||uid('cutover-incident'),severity:allowed.includes(severity)?severity:'P2',status:['OPEN','MITIGATED','CLOSED'].includes(status)?status:'OPEN',title:text(input.title),detail:text(input.detail),evidence:text(input.evidence),at:input.at||nowIso(),updatedAt:nowIso()};
}
function evaluateObservation(observation={},incidents=[],at=nowIso(),p=policy()){
  if(observation?.status==='OBSERVATION_NOT_RUN'||!observation?.startedAt)return {format:'JK_ENG_PHASE34_OBSERVATION_EVALUATION',version:VERSION,status:'OBSERVATION_NOT_RUN',rollbackDecision:'ROLLBACK_NOT_REQUIRED',openP0P1:0,incidents:[],evaluatedAt:at,automaticRollback:false};
  const rows=(Array.isArray(incidents)?incidents:[]).map(x=>normalizeIncident(x,p)),immediate=new Set(p.observation?.immediateRollbackSeverities||['P0','P1']),openCritical=rows.filter(x=>x.status!=='CLOSED'&&immediate.has(x.severity)),ended=Date.parse(at)>=Date.parse(observation.endsAt||0);
  let status='OBSERVING',rollbackDecision='ROLLBACK_NOT_REQUIRED';if(openCritical.length){status='ROLLBACK_REQUIRED';rollbackDecision='ROLLBACK_REQUIRED'}else if(ended)status='OBSERVATION_COMPLETE';
  return {format:'JK_ENG_PHASE34_OBSERVATION_EVALUATION',version:VERSION,status,rollbackDecision,openP0P1:openCritical.length,incidents:rows,startedAt:observation.startedAt,endsAt:observation.endsAt,evaluatedAt:at,automaticRollback:false};
}
function createRollbackRecord(input={},evaluation={}){
  const operator=text(input.operator),reason=text(input.reason),confirmation=text(input.confirmationPhrase),errors=[];
  if(evaluation?.rollbackDecision!=='ROLLBACK_REQUIRED')errors.push('ROLLBACK_NOT_REQUIRED');if(!operator)errors.push('OPERATOR_REQUIRED');if(!reason)errors.push('REASON_REQUIRED');if(confirmation!=='ROLLBACK RC2 NOW')errors.push('ROLLBACK_CONFIRMATION_MISMATCH');
  const accepted=errors.length===0;return {format:'JK_ENG_PHASE34_ROLLBACK_RECORD',version:VERSION,rollbackId:text(input.rollbackId)||uid('rollback'),status:accepted?'ROLLBACK_REQUESTED':'ROLLBACK_BLOCKED',accepted,errors,operator,reason,requestedAt:input.requestedAt||nowIso(),automaticRollback:false,externalRollbackExecution:'NOT_VERIFIED'};
}
function buildCutoverAuditBundle(input={}){
  return {format:'JK_ENG_PHASE34_CUTOVER_AUDIT_BUNDLE',version:VERSION,candidate:policy().candidate||'JK English v1.0 RC2',exportedAt:nowIso(),policy:clone(policy()),state:clone(global.JK_PHASE34_DATA?.state||{}),approvedBundleMeta:clone(input.approvedBundleMeta||null),predeployVerification:clone(input.predeployVerification||null),cutoverLocks:clone(input.cutoverLocks||[]),executions:clone(input.executions||[]),smokeRuns:clone(input.smokeRuns||[]),observations:clone(input.observations||[]),incidents:clone(input.incidents||[]),rollbacks:clone(input.rollbacks||[]),truthfulBoundary:{lockIsNotDeployment:true,localRecordIsNotExternalExecution:true,automaticCutover:false,automaticRollback:false,cutoverNotRunPreserved:true,observationNotRunPreserved:true}};
}
const api={VERSION,normalizeHash,latestDecision,verifyApprovedAuditBundle,normalizeChecklist,createCutoverLock,createCutoverExecution,evaluateSmokeRun,startObservation,normalizeIncident,evaluateObservation,createRollbackRecord,buildCutoverAuditBundle};
if(typeof module!=='undefined'&&module.exports)module.exports=api;global.JK_PHASE34=api;
})(typeof globalThis!=='undefined'?globalThis:this);
