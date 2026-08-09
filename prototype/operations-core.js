(() => {
  'use strict';
  const D=window.JK_PHASE28_DATA||{}; const policy=D.policy||{}; const learnerUx={numericCountdownVisible:false,numericTargetSecondsVisible:false};
  const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
  const nowIso=()=>new Date().toISOString();
  const uid=p=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const text=x=>String(x==null?'':x).trim();
  const pct=(n,d)=>d?Math.round(n/d*1000)/10:0;
  function headerIncludes(headers,name,tokens){const value=text(headers?.[name]||headers?.[name.toLowerCase()]).toLowerCase();return tokens.every(t=>value.includes(String(t).toLowerCase()))}
  function evaluateDeploymentEvidence(input={}){
    const checks=[]; const baseUrl=text(input.baseUrl).replace(/\/$/,'');
    const add=(id,ok,detail)=>checks.push({id,ok:Boolean(ok),detail:text(detail)});
    let parsed=null;try{parsed=new URL(baseUrl)}catch(_){ }
    add('HTTPS',parsed?.protocol==='https:',parsed?.protocol||'invalid URL');
    add('HEALTH_OK',input.health?.ok===true,JSON.stringify(input.health||{}).slice(0,220));
    add('DATABASE_OK',input.health?.database?.ok===true,JSON.stringify(input.health?.database||{}).slice(0,180));
    add('INTEGRITY_OK',input.health?.integrity?.ok===true&&input.integrity?.ok===true,`health=${input.health?.integrity?.ok}; endpoint=${input.integrity?.ok}`);
    add('MANIFEST_V28',input.integrity?.manifestVersion==='28.0',input.integrity?.manifestVersion||'missing');
    const required=policy.deployment?.requiredSecurityHeaders||{};
    for(const [name,tokens] of Object.entries(required))add(`HEADER_${name.toUpperCase()}`,headerIncludes(input.headers||{},name,tokens),text((input.headers||{})[name]||(input.headers||{})[name.toLowerCase()]));
    add('PWA_MANIFEST',input.pwa?.manifestOk===true,input.pwa?.manifestStatus);
    add('SERVICE_WORKER',input.pwa?.serviceWorkerOk===true,input.pwa?.serviceWorkerStatus);
    add('ASSET_MANIFEST',input.pwa?.assetManifestOk===true,input.pwa?.assetManifestStatus);
    const actual=Boolean(input.actualCredentialsUsed&&input.externalNetworkUsed);
    add('ACTUAL_EXTERNAL_CONTEXT',actual,actual?'external URL and credentials confirmed':'not confirmed');
    const requiredOk=checks.every(x=>x.ok);
    return {format:'JK_ENG_PHASE28_DEPLOYMENT_CHECK',version:'28.0',checkId:input.checkId||uid('deployment-check'),status:requiredOk?'PASS':baseUrl?'FAIL':'DEPLOYMENT_NOT_RUN',baseUrl:baseUrl||null,actualCredentialsUsed:Boolean(input.actualCredentialsUsed),externalNetworkUsed:Boolean(input.externalNetworkUsed),checks,checkedAt:input.checkedAt||nowIso(),automaticPass:false};
  }
  function normalizeQaRun(input={}){
    const run={format:'JK_ENG_PHASE28_DEVICE_QA_RUN',version:'28.0',runId:input.runId||uid('device-qa'),cellId:text(input.cellId),platformId:text(input.platformId),scenarioId:text(input.scenarioId),status:text(input.status||'NOT_RUN').toUpperCase(),deviceModel:text(input.deviceModel),osVersion:text(input.osVersion),browserVersion:text(input.browserVersion),tester:text(input.tester),executedAt:input.executedAt||null,observedResult:text(input.observedResult),evidence:Array.isArray(input.evidence)?input.evidence.map(text).filter(Boolean):text(input.evidence).split(/\n+/).map(text).filter(Boolean),defects:Array.isArray(input.defects)?clone(input.defects):[],physicalDeviceUsed:Boolean(input.physicalDeviceUsed),stylusUsed:Boolean(input.stylusUsed),createdAt:input.createdAt||nowIso(),updatedAt:nowIso()};
    const required=policy.remoteDeviceQa?.passRequires||[];
    const missing=required.filter(k=>k==='evidence'?!run.evidence.length:!text(run[k]));
    const pen=(policy.remoteDeviceQa?.platformIds||[]).includes(run.platformId)&&['ipad-pencil','galaxy-tab-spen'].includes(run.platformId);
    if(run.status==='PASS'&&(missing.length||!run.physicalDeviceUsed||(pen&&!run.stylusUsed)))run.status='INCOMPLETE_EVIDENCE';
    run.missingEvidence=missing; run.automaticPass=false; return run;
  }
  function summarizeQa(matrix=D.qaMatrix,runs=[]){
    const latest=new Map(); for(const raw of runs){const r=normalizeQaRun(raw.payload||raw);const prev=latest.get(r.cellId);if(!prev||Date.parse(r.updatedAt)>=Date.parse(prev.updatedAt))latest.set(r.cellId,r)}
    const cells=(matrix?.cells||[]).map(c=>({...clone(c),...(latest.get(c.cellId)||{})}));
    const counts={NOT_RUN:0,PASS:0,FAIL:0,BLOCKED:0,INCOMPLETE_EVIDENCE:0};for(const c of cells)counts[c.status]=(counts[c.status]||0)+1;
    const critical=new Set(policy.remoteDeviceQa?.criticalScenarios||[]);const criticalCells=cells.filter(c=>critical.has(c.scenarioId));
    const allCriticalPass=criticalCells.length>0&&criticalCells.every(c=>c.status==='PASS');
    const allPass=cells.length>0&&cells.every(c=>c.status==='PASS');
    return {format:'JK_ENG_PHASE28_DEVICE_QA_SUMMARY',version:'28.0',status:allPass?'PASS':counts.FAIL?'FAIL':counts.PASS||counts.BLOCKED||counts.INCOMPLETE_EVIDENCE?'IN_PROGRESS':'DEVICE_QA_NOT_RUN',counts,total:cells.length,completed:cells.filter(c=>c.status!=='NOT_RUN').length,completionRate:pct(cells.filter(c=>c.status!=='NOT_RUN').length,cells.length),allCriticalPass,allPass,cells};
  }
  function sufficientDay(report={}){const s=policy.baselineReadiness?.sufficientDay||{};return Boolean(report.completedAt)&&Number(report.attempts||0)>=s.minimumAttempts&&Number(report.activeMinutes||0)>=s.minimumActiveMinutes&&Number(report.grammarMinutes||0)>=s.minimumGrammarMinutes&&Number(report.readingMinutes||0)>=s.minimumReadingMinutes}
  function evaluateBaselineReadiness(reports=[],asOf=new Date().toISOString()){
    const end=new Date(asOf);end.setHours(23,59,59,999);const start=new Date(end);start.setDate(start.getDate()-6);start.setHours(0,0,0,0);
    const actual=(reports||[]).filter(r=>r&&r.date&&new Date(`${r.date}T12:00:00`).getTime()>=start.getTime()&&new Date(`${r.date}T12:00:00`).getTime()<=end.getTime()).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const sufficient=actual.filter(sufficientDay);const first=actual[0]?.date||null;const observed=first?Math.min(7,Math.max(1,Math.floor((end-new Date(`${first}T00:00:00`))/86400000)+1)):0;
    let status='NOT_COLLECTED';if(actual.length){status='COLLECTING';if(observed>=7&&sufficient.length<5)status='PAUSED_INSUFFICIENT';if(observed>=7&&sufficient.length>=5)status='READY_FOR_REVIEW'}
    const alerts=[];const requiredByDay={3:2,5:3,7:5};for(const [day,min] of Object.entries(requiredByDay))if(observed>=Number(day)&&sufficient.length<min)alerts.push({code:`DAY_${day}_SUFFICIENCY_GAP`,severity:Number(day)===7?'high':'medium',message:`관찰 ${day}일 시점에 충분 Day가 ${sufficient.length}일입니다. 최소 ${min}일이 필요합니다.`});
    return {format:'JK_ENG_PHASE28_BASELINE_READINESS',version:'28.0',baselineId:'single-learner-first-7-days',status,actualLearnerDataUsed:actual.length>0,windowStart:start.toISOString().slice(0,10),windowEnd:end.toISOString().slice(0,10),calendarDaysObserved:observed,reportDays:actual.length,sufficientDays:sufficient.length,minimumSufficientDays:5,days:actual.map(r=>({date:r.date,sufficient:sufficientDay(r),attempts:Number(r.attempts||0),activeMinutes:Number(r.activeMinutes||0),grammarMinutes:Number(r.grammarMinutes||0),readingMinutes:Number(r.readingMinutes||0)})),alerts,adminApprovalRequired:true,automaticDifficultyApplication:false,evaluatedAt:nowIso()};
  }
  function evaluateRecoveryDrill(input={}){
    const required=policy.backupRecovery?.passRequires||[];const evidence=Array.isArray(input.evidence)?input.evidence.map(text).filter(Boolean):text(input.evidence).split(/\n+/).map(text).filter(Boolean);
    const obj={format:'JK_ENG_PHASE28_RECOVERY_DRILL',version:'28.0',drillId:input.drillId||uid('recovery-drill'),backupId:text(input.backupId),sha256Verified:Boolean(input.sha256Verified),quickCheckOk:Boolean(input.quickCheckOk),requiredTablesOk:Boolean(input.requiredTablesOk),restoreStartedAt:input.restoreStartedAt||null,restoreFinishedAt:input.restoreFinishedAt||null,tester:text(input.tester),evidence,actualBackupUsed:Boolean(input.actualBackupUsed),notes:text(input.notes),createdAt:input.createdAt||nowIso()};
    const missing=required.filter(k=>k==='evidence'?!evidence.length:!obj[k]);let minutes=null;if(obj.restoreStartedAt&&obj.restoreFinishedAt)minutes=Math.max(0,(Date.parse(obj.restoreFinishedAt)-Date.parse(obj.restoreStartedAt))/60000);obj.rtoMinutes=minutes;
    const pass=!missing.length&&obj.actualBackupUsed&&obj.sha256Verified&&obj.quickCheckOk&&obj.requiredTablesOk&&minutes!=null&&minutes<=Number(policy.backupRecovery?.maximumTargetRtoMinutes||30);
    obj.status=pass?'PASS':obj.backupId?'FAIL':'RECOVERY_DRILL_NOT_RUN';obj.missingEvidence=missing;obj.automaticProductionRestore=false;return obj;
  }
  window.JK_PHASE28={policy,learnerUx,clone,evaluateDeploymentEvidence,normalizeQaRun,summarizeQa,sufficientDay,evaluateBaselineReadiness,evaluateRecoveryDrill};
})();
