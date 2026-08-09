(function(global){'use strict';
const VERSION='32.0';
const FALLBACK_PLATFORM_PROFILE={
 'iphone-safari':'phone','android-chrome':'phone',
 'ipad-pencil':'tablet','galaxy-tab-spen':'tablet',
 'windows-chrome-edge':'desktop','macos-safari-chrome':'desktop'
};
const text=x=>String(x==null?'':x).trim();
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const nowIso=()=>new Date().toISOString();
const uid=p=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
function policy(){return global.JK_PHASE32_DATA?.policy||{}}
function slug(value){return text(value).normalize('NFKD').replace(/[^A-Za-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-').toUpperCase()||'NA'}
function profileForPlatform(platformId,p=policy()){
 const id=text(platformId);for(const batch of p.deviceExecutionOrder||[])if((batch.platforms||[]).includes(id))return batch.profile;
 return FALLBACK_PLATFORM_PROFILE[id]||'device';
}
function dateToken(value){
 if(/^\d{8}$/.test(text(value)))return text(value);
 if(/^\d{4}-\d{2}-\d{2}/.test(text(value)))return text(value).slice(0,10).replaceAll('-','');
 const d=value instanceof Date?value:new Date(value||Date.now());if(Number.isNaN(d.getTime()))return new Date().toISOString().slice(0,10).replaceAll('-','');
 return d.toISOString().slice(0,10).replaceAll('-','');
}
function evidenceFileName(input={},p=policy()){
 const ext=slug(input.extension||'png').toLowerCase();const allowed=p.evidenceNaming?.allowedExtensions||[];
 const safeExt=allowed.includes(ext)?ext:'png';const digits=Number(p.evidenceNaming?.sequenceDigits||2);const seq=String(Math.max(1,Number(input.sequence||1))).padStart(digits,'0');
 return `JKENG_RC2_${dateToken(input.date||input.executedAt)}_${slug(input.profile||profileForPlatform(input.platformId,p))}_${slug(input.platformId)}_${slug(input.scenarioId)}_${seq}.${safeExt}`;
}
function evidencePattern(p=policy()){
 const exts=(p.evidenceNaming?.allowedExtensions||['png']).join('|').replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\|/g,'|');
 return new RegExp(`^JKENG_RC2_\\d{8}_(PHONE|TABLET|DESKTOP)_([A-Z0-9-]+)_([A-Z0-9-]+)_\\d{2}\\.(${exts})$`,'i');
}
function validateEvidenceName(name,p=policy()){return evidencePattern(p).test(text(name).split(/[\\/]/).pop()||'')}
function normalizeEvidenceList(input){return (Array.isArray(input)?input:text(input).split(/\n+/)).map(text).filter(Boolean)}
function normalizeEvidenceRun(input={},p=policy()){
 const run={format:'JK_ENG_PHASE32_DEVICE_EVIDENCE_RUN',version:VERSION,runId:text(input.runId)||uid('device-evidence'),cellId:text(input.cellId),profile:text(input.profile)||profileForPlatform(input.platformId,p),platformId:text(input.platformId),scenarioId:text(input.scenarioId),status:text(input.status||'NOT_RUN').toUpperCase(),deviceModel:text(input.deviceModel),osVersion:text(input.osVersion),browserVersion:text(input.browserVersion),tester:text(input.tester),executedAt:input.executedAt||null,observedResult:text(input.observedResult),evidence:normalizeEvidenceList(input.evidence),physicalDeviceUsed:Boolean(input.physicalDeviceUsed),stylusUsed:Boolean(input.stylusUsed),defects:Array.isArray(input.defects)?clone(input.defects):[],createdAt:input.createdAt||nowIso(),updatedAt:nowIso()};
 const req=p.evidenceMinimum?.passRequires||[];const missing=req.filter(k=>k==='evidence'?!run.evidence.length:!text(run[k]));
 const invalidNames=run.evidence.filter(x=>!validateEvidenceName(x,p));const stylusRequired=(p.evidenceMinimum?.stylusRequiredPlatforms||[]).includes(run.platformId);
 if(run.status==='PASS'&&(missing.length||!run.physicalDeviceUsed||(stylusRequired&&!run.stylusUsed)||invalidNames.length))run.status='INCOMPLETE_EVIDENCE';
 run.missingEvidence=missing;run.invalidEvidenceNames=invalidNames;run.physicalEvidenceAccepted=run.physicalDeviceUsed&&(!stylusRequired||run.stylusUsed)&&run.evidence.length>0&&!invalidNames.length;run.automaticPass=false;
 return run;
}
function headerIncludes(headers,name,tokens){const value=text(headers?.[name]||headers?.[String(name).toLowerCase()]).toLowerCase();return (tokens||[]).every(t=>value.includes(String(t).toLowerCase()))}
function evaluateDeploymentEvidence(input={}){
 const checks=[];const baseUrl=text(input.baseUrl).replace(/\/$/,'');const add=(id,ok,detail)=>checks.push({id,ok:Boolean(ok),detail:text(detail)});let parsed=null;try{parsed=new URL(baseUrl)}catch(_){ }
 add('HTTPS',parsed?.protocol==='https:',parsed?.protocol||'invalid URL');add('HEALTH_OK',input.health?.ok===true,JSON.stringify(input.health||{}).slice(0,220));add('DATABASE_OK',input.health?.database?.ok===true,JSON.stringify(input.health?.database||{}).slice(0,180));add('INTEGRITY_OK',input.health?.integrity?.ok===true&&input.integrity?.ok===true,`health=${input.health?.integrity?.ok}; endpoint=${input.integrity?.ok}`);const expectedManifestVersion=text(input.expectedManifestVersion)||VERSION;add(`MANIFEST_V${expectedManifestVersion.replace(/\D/g,'')}`,input.integrity?.manifestVersion===expectedManifestVersion,input.integrity?.manifestVersion||'missing');
 for(const [name,tokens] of Object.entries(input.requiredSecurityHeaders||{}))add(`HEADER_${String(name).toUpperCase()}`,headerIncludes(input.headers||{},name,tokens),text((input.headers||{})[name]||(input.headers||{})[String(name).toLowerCase()]));
 add('PWA_MANIFEST',input.pwa?.manifestOk===true,input.pwa?.manifestStatus);add('SERVICE_WORKER_V32',input.pwa?.serviceWorkerOk===true,input.pwa?.serviceWorkerStatus);add('ASSET_MANIFEST_V32',input.pwa?.assetManifestOk===true,input.pwa?.assetManifestStatus);const actual=Boolean(input.actualCredentialsUsed&&input.externalNetworkUsed);add('ACTUAL_EXTERNAL_CONTEXT',actual,actual?'external URL and credentials confirmed':'not confirmed');
 const requiredOk=checks.every(x=>x.ok);return{format:'JK_ENG_PHASE32_DEPLOYMENT_CHECK',version:VERSION,checkId:text(input.checkId)||uid('deployment-check'),status:requiredOk?'PASS':baseUrl?'FAIL':'DEPLOYMENT_NOT_RUN',baseUrl:baseUrl||null,actualCredentialsUsed:Boolean(input.actualCredentialsUsed),externalNetworkUsed:Boolean(input.externalNetworkUsed),checks,checkedAt:input.checkedAt||nowIso(),automaticPass:false};
}
function auditDevicePlan(plan=global.JK_PHASE32_DATA?.devicePlan,p=policy()){
 const batches=plan?.executionBatches||[];const ordered=batches.every((b,i)=>b.order===i+1)&&batches.map(x=>x.profile).join(',')==='phone,tablet,desktop';
 const unique=new Set(batches.flatMap(b=>b.platforms||[]));const policyPlatforms=new Set((p.deviceExecutionOrder||[]).flatMap(b=>b.platforms||[]));
 return{pass:ordered&&unique.size===policyPlatforms.size&&[...policyPlatforms].every(x=>unique.has(x)),ordered,profiles:batches.map(x=>x.profile),platformCount:unique.size,status:plan?.status||'DEVICE_QA_NOT_RUN'};
}
const transitions={OPEN:['TRIAGED'],TRIAGED:['FIXED'],FIXED:['REVERIFY_REQUIRED'],REVERIFY_REQUIRED:['REVERIFY_PASS'],REVERIFY_PASS:['CLOSED'],CLOSED:[]};
function normalizeDefect(input={}){return{format:'JK_ENG_PHASE32_BLOCKER_DEFECT',version:VERSION,defectId:text(input.defectId)||uid('RC2-DEFECT'),severity:(text(input.severity)||'P2').toUpperCase(),status:(text(input.status)||'OPEN').toUpperCase(),title:text(input.title),scenarioId:text(input.scenarioId),platformId:text(input.platformId),reproduction:text(input.reproduction),owner:text(input.owner),fixReference:text(input.fixReference),reverifyEvidence:normalizeEvidenceList(input.reverifyEvidence),reverifiedBy:text(input.reverifiedBy),reverifiedAt:input.reverifiedAt||null,acceptedRisk:Boolean(input.acceptedRisk),notes:text(input.notes),createdAt:input.createdAt||nowIso(),updatedAt:nowIso()}}
function canTransition(defect,next,p=policy()){
 const d=normalizeDefect(defect),target=text(next).toUpperCase();if(!(transitions[d.status]||[]).includes(target))return{ok:false,reason:'INVALID_TRANSITION'};
 if(target==='CLOSED'){
  const required=p.blockerWorkflow?.closeRequires||[];const missing=required.filter(k=>k==='reverifyEvidence'?!d.reverifyEvidence.length:!d[k]);if(missing.length)return{ok:false,reason:'MISSING_CLOSE_EVIDENCE',missing};
 }
 return{ok:true,reason:'OK'};
}
function transitionDefect(defect,next,patch={},p=policy()){
 const d=normalizeDefect({...defect,...patch});const check=canTransition(d,next,p);if(!check.ok)return{...d,transitionError:check.reason,missing:check.missing||[]};d.status=text(next).toUpperCase();d.updatedAt=nowIso();return d;
}
function summarizeBlockers(defects=[],p=policy()){
 const rows=(defects||[]).map(normalizeDefect),blocking=new Set(p.blockerWorkflow?.releaseBlockingSeverities||['P0','P1']);
 const open=rows.filter(d=>d.status!=='CLOSED'),releaseBlocking=open.filter(d=>blocking.has(d.severity));const unresolvedP2=open.filter(d=>d.severity==='P2'&&!d.acceptedRisk);
 return{status:releaseBlocking.length?'BLOCKED':unresolvedP2.length?'DISPOSITION_REQUIRED':'CLEAR',total:rows.length,open:open.length,releaseBlocking:releaseBlocking.length,unresolvedP2:unresolvedP2.length,rows};
}
function rehearsalSummary(input={},p=policy()){
 const blockers=summarizeBlockers(input.defects||[],p);const external={deployment:input.deployment||'DEPLOYMENT_NOT_RUN',deviceQa:input.deviceQa||'DEVICE_QA_NOT_RUN',recoveryDrill:input.recoveryDrill||'RECOVERY_DRILL_NOT_RUN',pwaExternalInstall:input.pwaExternalInstall||'PWA_INSTALL_NOT_RUN',assistiveTechnology:input.assistiveTechnology||'AT_DEVICE_NOT_RUN',performanceDevice:input.performanceDevice||'PERFORMANCE_DEVICE_NOT_RUN'};
 const allExternalPass=Object.values(external).every(x=>x==='PASS');const staticReady=input.rehearsalPackage==='PASS'&&input.learningRegression==='PASS'&&input.featureFreeze==='FROZEN';
 return{format:'JK_ENG_PHASE32_REHEARSAL_SUMMARY',version:VERSION,status:blockers.releaseBlocking?'BLOCKED':allExternalPass&&staticReady?'READY_FOR_MANUAL_PRODUCTION_APPROVAL':staticReady?'READY_FOR_EXTERNAL_REHEARSAL':'NOT_READY',staticReady,allExternalPass,external,blockers,productionApprovalRequired:true,automaticProductionApproval:false,generatedAt:nowIso()};
}
function exportPackage(input={}){return{format:'JK_ENG_PHASE32_REHEARSAL_EVIDENCE_PACKAGE',version:VERSION,candidate:'JK English v1.0 RC2',exportedAt:nowIso(),policy:clone(policy()),state:clone(global.JK_PHASE32_DATA?.state||{}),devicePlan:clone(global.JK_PHASE32_DATA?.devicePlan||{}),deployment:clone(input.deployment||null),deviceQa:clone(input.deviceQa||null),recovery:clone(input.recovery||null),blockers:clone(input.blockers||[]),baseline:clone(input.baseline||null),truthfulBoundary:{externalNotRunPreserved:true,automaticPass:false,automaticProductionApproval:false}}}
const api={VERSION,slug,profileForPlatform,dateToken,evidenceFileName,validateEvidenceName,normalizeEvidenceRun,evaluateDeploymentEvidence,auditDevicePlan,normalizeDefect,canTransition,transitionDefect,summarizeBlockers,rehearsalSummary,exportPackage};
if(typeof module!=='undefined'&&module.exports)module.exports=api;global.JK_PHASE32=api;
})(typeof globalThis!=='undefined'?globalThis:this);
