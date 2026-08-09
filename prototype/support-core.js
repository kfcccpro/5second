(() => {
  'use strict';
  const D=window.JK_PHASE29_DATA||{}; const policy=D.policy||{};
  const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
  const nowIso=()=>new Date().toISOString();
  const text=x=>String(x==null?'':x).trim();
  const forbidden=/pin|token|secret|password|authorization|registrationcode|pairingcode|supportcode|handwriting|ink|stroke|points|rawtext|answertext|studentname|email|phone/i;
  const allowedDiagnosticKeys=new Set(['appVersion','clientSchemaVersion','platform','browser','online','syncQueue','lease','serviceWorker','storage','lastSyncAt','lastErrorCode']);
  function ageMinutes(value,now=Date.now()){const t=Date.parse(value||'');return Number.isFinite(t)?Math.max(0,(now-t)/60000):0}
  function containsForbidden(value,depth=0){if(depth>8||value==null)return false;if(Array.isArray(value))return value.some(v=>containsForbidden(v,depth+1));if(typeof value!=='object')return false;return Object.entries(value).some(([k,v])=>(forbidden.test(k)&&v!==false)||containsForbidden(v,depth+1))}
  function sanitize(value,depth=0){if(depth>6)return'[truncated]';if(Array.isArray(value))return value.slice(0,200).map(v=>sanitize(v,depth+1));if(value==null||typeof value!=='object')return typeof value==='string'?value.slice(0,300):value;const out={};for(const[k,v]of Object.entries(value)){if(forbidden.test(k))continue;out[k]=sanitize(v,depth+1)}return out}
  function summarizeQueue(rows=[],now=Date.now()){
    const list=(rows||[]).map(r=>r?.payload&&typeof r.payload==='object'?r.payload:r).filter(Boolean);
    const queued=list.filter(x=>x.status==='queued'); const failed=list.filter(x=>x.status==='failed'||Number(x.attempts||0)>=5&&x.status!=='sent');
    const oldest=queued.length?Math.max(...queued.map(x=>ageMinutes(x.createdAt,now))):0;
    const byType={}; for(const x of queued)byType[x.entityType]=(byType[x.entityType]||0)+1;
    return {queued:queued.length,failed:failed.length,oldestAgeMinutes:Math.round(oldest*10)/10,byType};
  }
  function browserLabel(nav={}){const ua=text(nav.userAgent);if(/SamsungBrowser/.test(ua))return'Samsung Internet';if(/Edg\//.test(ua))return'Edge';if(/CriOS|Chrome\//.test(ua))return'Chrome';if(/Safari\//.test(ua))return'Safari';return'Unknown browser'}
  function platformLabel(nav={}){const ua=text(nav.userAgent),p=text(nav.platform);if(/iPad/.test(ua)||(p==='MacIntel'&&Number(nav.maxTouchPoints)>1))return'iPadOS';if(/Android/.test(ua))return'Android';if(/Windows/.test(ua))return'Windows';if(/Mac/.test(p)||/Macintosh/.test(ua))return'macOS';return p||'Unknown'}
  function buildClientDiagnostic(input={}){
    const snap=input.snapshot||{},settings=snap.settings||{},queue=summarizeQueue(input.queue||[],input.now||Date.now()),cloud=input.cloudStatus||{},sw=input.serviceWorker||{},storage=input.storage||{};
    const diagnostic={appVersion:text(input.appVersion||'29.0'),clientSchemaVersion:Number(input.clientSchemaVersion||21),platform:text(input.platform||platformLabel(input.navigatorLike||{})),browser:text(input.browser||browserLabel(input.navigatorLike||{})),online:input.online!==false,syncQueue:queue,lease:{conflict:Boolean(cloud.lastLeaseConflict||input.lease?.conflict),ageMinutes:Number(input.lease?.ageMinutes||0)},serviceWorker:{version:text(sw.version),expectedVersion:'29.0',matches:text(sw.version)==='29.0'},storage:{mode:text(storage.mode||storage.backend||'unknown'),indexedDbOk:storage.indexedDbOk!==false,quotaRatio:Math.max(0,Math.min(1,Number(storage.quotaRatio||0)))},lastSyncAt:cloud.lastSyncAt||settings.lastCloudPullAt||null,lastErrorCode:text(input.lastErrorCode||cloud.status||'').slice(0,80)};
    if(containsForbidden(diagnostic))throw new Error('client diagnostic unexpectedly contains forbidden fields');return diagnostic;
  }
  function evaluateClientHealth(diagnostic={}){
    const t=policy.thresholds||{},alerts=[];const add=(code,severity,message,recommendation)=>alerts.push({code,severity,message,recommendation,automaticAction:false});
    const q=diagnostic.syncQueue||{};
    if(Number(q.failed)>0||Number(q.queued)>=Number(t.syncQueueQueued?.critical||20)||Number(q.oldestAgeMinutes)>=Number(t.syncQueueOldestMinutes?.critical||60))add('LOCAL_SYNC_QUEUE_CRITICAL','critical',`로컬 동기화 대기 ${q.queued||0}건, 실패 ${q.failed||0}건입니다.`,'학습 기록을 삭제하지 말고 네트워크·로그인·서버 주소를 순서대로 확인하십시오.');
    else if(Number(q.queued)>=Number(t.syncQueueQueued?.warning||5)||Number(q.oldestAgeMinutes)>=Number(t.syncQueueOldestMinutes?.warning||15))add('LOCAL_SYNC_QUEUE_DELAY','warning',`로컬 동기화 대기 ${q.queued||0}건, 최장 ${Number(q.oldestAgeMinutes||0).toFixed(0)}분입니다.`,'온라인 상태에서 수동 동기화를 실행하십시오.');
    if(diagnostic.lease?.conflict)add('LOCAL_LEASE_CONFLICT','warning','다른 기기 또는 탭이 같은 Day 세션을 보유하고 있습니다.','활성 학습 기기를 하나로 정하고 중복 탭을 닫으십시오.');
    if(diagnostic.serviceWorker?.matches===false)add('LOCAL_SW_MISMATCH','warning',`서비스워커 ${diagnostic.serviceWorker?.version||'unknown'}가 앱 29.0과 일치하지 않습니다.`,'앱을 완전히 닫았다가 다시 열고 필요하면 사이트 데이터를 갱신하십시오.');
    if(diagnostic.storage?.indexedDbOk===false)add('LOCAL_STORAGE_FALLBACK','critical','IndexedDB를 사용할 수 없어 임시 저장 모드입니다.','브라우저의 사이트 저장 권한과 비공개 모드를 확인하십시오.');
    if(Number(diagnostic.storage?.quotaRatio||0)>=.9)add('LOCAL_STORAGE_QUOTA','warning','브라우저 저장공간 사용률이 90% 이상입니다.','백업 후 불필요한 캐시만 정리하십시오. 학습 기록은 임의 삭제하지 마십시오.');
    const status=alerts.some(x=>x.severity==='critical')?'CRITICAL':alerts.length?'WARNING':'HEALTHY';return{format:'JK_ENG_PHASE29_CLIENT_HEALTH',version:'29.0',status,alerts,diagnostic:clone(diagnostic),evaluatedAt:nowIso(),automaticRemediation:false};
  }
  function normalizeObservability(raw={}){if(raw?.format==='JK_ENG_PHASE29_OBSERVABILITY')return sanitize(raw);return{format:'JK_ENG_PHASE29_OBSERVABILITY',version:'29.0',status:'OBSERVABILITY_NOT_CONNECTED',metrics:{},alerts:[],alertDelivery:{status:'NOT_CONFIGURED',automaticNotification:false},automaticRemediation:false,collectedAt:null}}
  function timelineCategory(type=''){const s=text(type).toLowerCase();if(s.includes('qa'))return'qa';if(s.includes('backup')||s.includes('recovery'))return'backup';if(s.includes('baseline'))return'baseline';if(s.includes('support')||s.includes('diagnostic'))return'support';if(s.includes('auth')||s.includes('login')||s.includes('pairing')||s.includes('session'))return'auth';if(s.includes('sync'))return'sync';if(s.includes('lease'))return'lease';if(s.includes('device'))return'device';return'operations'}
  function mergeTimeline({localAudits=[],serverTimeline=[],limit=200}={}){
    const local=(localAudits||[]).map(row=>{const r=row?.payload&&typeof row.payload==='object'?row.payload:row;return{at:r.at||r.createdAt||r.updatedAt||nowIso(),category:timelineCategory(r.type||r.action),action:text(r.type||r.action||'local_event'),role:text(r.actor||'admin'),device:null,status:/fail|reject|conflict|rollback/i.test(text(r.type||r.action))?'attention':'info',source:'local'}});
    const server=(serverTimeline||[]).map(row=>({...sanitize(row),source:'server'}));
    return[...local,...server].sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0)).slice(0,limit);
  }
  function buildPrivacyBundle(input={}){
    const localDiagnostic=buildClientDiagnostic(input.local||{}),clientHealth=evaluateClientHealth(localDiagnostic),server=normalizeObservability(input.serverObservability||{}),timeline=mergeTimeline({localAudits:input.localAudits||[],serverTimeline:input.serverTimeline||[]});
    const bundle={format:'JK_ENG_PHASE29_PRIVACY_MIN_DIAGNOSTIC_BUNDLE',version:'29.0',generatedAt:nowIso(),learnerId:'single-learner',privacy:{containsPin:false,containsSessionToken:false,containsPairingCode:false,containsSupportCode:false,containsRawHandwriting:false,containsRawAnswerText:false,deviceIdsAliased:true,excluded:clone(policy.diagnosticBundle?.excluded||[])},client:{diagnostic:localDiagnostic,health:clientHealth},server,operationsSummary:sanitize(input.operationsSummary||{}),supportTimeline:timeline,operationalTruth:{externalAlertDelivery:server.alertDelivery?.status||'NOT_CONFIGURED',automaticRemediation:false,actualExternalSupportSession:false}};
    if(containsForbidden(bundle))throw new Error('privacy-min bundle contains forbidden fields');return bundle;
  }
  function validateSupportCodeResult(result={}){return{status:result?.code?'ACTIVE':'NOT_CREATED',supportId:text(result.supportId),code:text(result.code),expiresAt:result.expiresAt||null,oneTime:result.oneTime!==false,grantsSession:false,diagnosticOnly:true}}
  window.JK_PHASE29={policy,clone,sanitize,containsForbidden,summarizeQueue,buildClientDiagnostic,evaluateClientHealth,normalizeObservability,mergeTimeline,buildPrivacyBundle,validateSupportCodeResult,allowedDiagnosticKeys};
})();
