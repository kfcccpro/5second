(() => {
  'use strict';

  const SCHEMA_VERSION = 21;
  const cfg = window.JK_FIREBASE_PILOT || {};
  const WORKBOOK_ID = cfg.workbookId || 'jk-5sec-grammar';
  const LEARNER_ID = cfg.learnerId || 'single-learner';
  const SDK_VERSION = cfg.sdkVersion || '12.16.0';
  const ENTITY_TO_BACKUP = Object.freeze({
    progress:'progress', ink:'ink', profile:'profiles', settings:'settings', session:'sessions', event:'events', replay:'replays',
    intervention:'interventions', assignment:'assignments', dailyPlan:'dailyPlans', dailyReport:'dailyReports', device:'devices',
    adaptiveRecommendation:'adaptiveRecommendations', trendSnapshot:'trendSnapshots', qualityApproval:'qualityApprovals',
    bankSnapshot:'bankSnapshots', baselineRun:'baselineRuns', difficultyProposalSet:'difficultyProposals', approvalAudit:'approvalAudit',
    personalDifficultyProfile:'personalDifficultyProfiles', difficultyApplication:'difficultyApplications',
    stabilityObservation:'stabilityObservations', regressionAlert:'regressionAlerts'
  });

  let state = { status:'firebase-ready', lastSyncAt:null, lastError:'', running:false, lastLeaseConflict:null, backend:'firebase' };
  let firebasePromise = null;
  let firebaseCtx = null;

  const notify = () => { try { window.dispatchEvent(new CustomEvent('jk-sync-status', { detail:{...state} })); } catch (_) {} };
  const nowIso = () => new Date().toISOString();
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const safePayload = value => JSON.parse(JSON.stringify(value == null ? {} : value));
  const DEVICE_LOCAL_SETTING_KEYS = new Set(['deviceId','lastRole','cloudEndpoint','cloudSyncEnabled','cloudSessionToken','cloudSessionExpiresAt','cloudDeviceStatus','lastCloudPullAt']);
  function sharedSettings(value) {
    const out=safePayload(value||{});
    for (const key of DEVICE_LOCAL_SETTING_KEYS) delete out[key];
    return out;
  }
  const unsupported = name => Promise.reject(new Error(`${name} 기능은 Firebase Student Pilot에서 사용하지 않습니다.`));

  function base64Url(text) {
    const bytes = new TextEncoder().encode(String(text));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function backupShell() {
    return {
      format:'JK_ENG_BACKUP', appVersion:window.JK_STORAGE?.APP_VERSION || '50.0', schemaVersion:SCHEMA_VERSION,
      createdAt:nowIso(), reason:'firebase-snapshot', data:{
        progress:{}, ink:{}, profiles:{}, settings:{}, metadata:{ backend:'firebase', workbookId:WORKBOOK_ID, generatedAt:nowIso() },
        sessions:{}, events:[], replays:{}, interventions:{}, assignments:{}, dailyPlans:{}, dailyReports:{}, devices:{}, syncQueue:{},
        adaptiveRecommendations:{}, trendSnapshots:{}, qualityApprovals:{}, bankSnapshots:{}, baselineRuns:{}, difficultyProposals:{}, approvalAudit:{},
        personalDifficultyProfiles:{}, difficultyApplications:{}, stabilityObservations:{}, regressionAlerts:{}
      }
    };
  }

  function applyEntityToBackup(backup, entityType, entityId, payload) {
    const key = ENTITY_TO_BACKUP[entityType];
    if (!key || !backup?.data) return;
    if (entityType === 'progress') backup.data[key] = clone(payload || {});
    else if (entityType === 'settings') backup.data[key] = sharedSettings(payload || {});
    else if (entityType === 'event') backup.data.events.push(clone(payload || {}));
    else backup.data[key][entityId] = clone(payload || {});
  }

  function bootstrapEntities(backup) {
    const out = [];
    const d = backup?.data || {};
    if (d.progress && Object.keys(d.progress).length) out.push(['progress', LEARNER_ID, d.progress]);
    if (d.settings && Object.keys(d.settings).length) out.push(['settings', LEARNER_ID, d.settings]);
    const maps = {
      ink:d.ink, profile:d.profiles, session:d.sessions, replay:d.replays, intervention:d.interventions, assignment:d.assignments,
      dailyPlan:d.dailyPlans, dailyReport:d.dailyReports, device:d.devices, adaptiveRecommendation:d.adaptiveRecommendations,
      trendSnapshot:d.trendSnapshots, qualityApproval:d.qualityApprovals, bankSnapshot:d.bankSnapshots, baselineRun:d.baselineRuns,
      difficultyProposalSet:d.difficultyProposals, approvalAudit:d.approvalAudit, personalDifficultyProfile:d.personalDifficultyProfiles,
      difficultyApplication:d.difficultyApplications, stabilityObservation:d.stabilityObservations, regressionAlert:d.regressionAlerts
    };
    for (const [type, records] of Object.entries(maps)) {
      for (const [id, value] of Object.entries(records || {})) out.push([type, id, value]);
    }
    for (const event of Array.isArray(d.events) ? d.events : []) if (event?.eventId) out.push(['event', event.eventId, event]);
    return out;
  }

  async function ensureFirebase() {
    if (!cfg.enabled) throw new Error('Firebase Pilot이 비활성화되어 있습니다.');
    if (firebaseCtx) return firebaseCtx;
    if (firebasePromise) return firebasePromise;
    firebasePromise = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
      ]);
      const configResponse = await fetch('/__/firebase/init.json', { cache:'no-store' });
      if (!configResponse.ok) throw new Error('Firebase Hosting 자동 설정을 불러오지 못했습니다. Firebase Hosting 주소에서 실행하세요.');
      const firebaseConfig = await configResponse.json();
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      if (!auth.currentUser) await authMod.signInAnonymously(auth);
      let db;
      try {
        db = fsMod.initializeFirestore(app, { localCache:fsMod.persistentLocalCache({ tabManager:fsMod.persistentMultipleTabManager() }) });
      } catch (_) {
        db = fsMod.getFirestore(app);
      }
      firebaseCtx = { app, auth, db, appMod, authMod, fsMod, firebaseConfig };
      state = { ...state, status:'firebase-authenticated', lastError:'' };
      notify();
      return firebaseCtx;
    })().catch(error => {
      firebasePromise = null;
      const code = String(error?.code || '');
      const authHint = /operation-not-allowed|admin-restricted-operation/i.test(code) ? ' Firebase Console에서 Authentication > Anonymous 로그인을 활성화하세요.' : '';
      state = { ...state, status:'firebase-error', lastError:`${error.message || error}${authHint}` };
      notify();
      throw error;
    });
    return firebasePromise;
  }

  function entitiesCollection(ctx) {
    return ctx.fsMod.collection(ctx.db, 'jkEnglishWorkbooks', WORKBOOK_ID, 'learners', LEARNER_ID, 'entities');
  }
  function leasesCollection(ctx) {
    return ctx.fsMod.collection(ctx.db, 'jkEnglishWorkbooks', WORKBOOK_ID, 'learners', LEARNER_ID, 'leases');
  }
  function entityRef(ctx, entityType, entityId) {
    return ctx.fsMod.doc(entitiesCollection(ctx), base64Url(`${entityType}::${entityId}`));
  }

  function validateFirestoreSize(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    if (bytes > 850000) throw new Error(`동기화 문서가 너무 큽니다 (${Math.round(bytes/1024)}KB). 학습 데이터는 로컬에 안전하게 남아 있습니다.`);
  }

  function entityEnvelope(entityType, entityId, payload, deviceId, deleted=false) {
    const clean = entityType === 'settings' ? sharedSettings(payload || {}) : safePayload(payload || {});
    validateFirestoreSize(clean);
    return {
      entityType, entityId, payload:clean, deleted:Boolean(deleted), learnerId:LEARNER_ID, workbookId:WORKBOOK_ID,
      updatedAt:String(clean.updatedAt || clean.createdAt || nowIso()), updatedByDevice:String(deviceId || ''), schemaVersion:SCHEMA_VERSION
    };
  }

  async function writeOperation(ctx, op, deviceId) {
    if (op.entityType === 'bootstrap') return applyBootstrap(ctx, op.payload, deviceId);
    const ref = entityRef(ctx, op.entityType, op.entityId);
    const envelope = entityEnvelope(op.entityType, op.entityId, op.payload, deviceId, op.action === 'delete');
    await ctx.fsMod.setDoc(ref, envelope, { merge:true });
    return { outcome:op.action === 'delete' ? 'deleted' : 'stored' };
  }

  async function applyBootstrap(ctx, backup, deviceId) {
    const rows = bootstrapEntities(backup);
    const { writeBatch } = ctx.fsMod;
    for (let i=0; i<rows.length; i+=350) {
      const batch = writeBatch(ctx.db);
      for (const [entityType, entityId, payload] of rows.slice(i,i+350)) {
        const envelope = entityEnvelope(entityType, entityId, payload, deviceId, false);
        batch.set(entityRef(ctx, entityType, entityId), envelope, { merge:true });
      }
      await batch.commit();
    }
    return { outcome:`bootstrap:${rows.length}` };
  }

  async function ensureInitialMerge(ctx, snap) {
    const markerKey = `jk_firebase_bootstrap_${WORKBOOK_ID}`;
    if (localStorage.getItem(markerKey)) return;
    const remote = await ctx.fsMod.getDocs(ctx.fsMod.query(entitiesCollection(ctx), ctx.fsMod.limit(1)));
    if (remote.empty) {
      const backup = await window.JK_STORAGE.exportBackup({ download:false, reason:'firebase-first-bootstrap' });
      await applyBootstrap(ctx, backup, snap.settings.deviceId);
    }
    localStorage.setItem(markerKey, nowIso());
  }

  async function pullSnapshot(ctx, sinceIso) {
    const backup = backupShell();
    let q = entitiesCollection(ctx);
    if (sinceIso && sinceIso !== '1970-01-01T00:00:00.000Z') q = ctx.fsMod.query(q, ctx.fsMod.where('updatedAt', '>=', sinceIso));
    const docs = await ctx.fsMod.getDocs(q);
    docs.forEach(snap => {
      const row = snap.data() || {};
      if (row.deleted) return;
      applyEntityToBackup(backup, row.entityType, row.entityId, row.payload || {});
    });
    return backup;
  }

  async function queue(entityType, entityId, payload, action='upsert') {
    return window.JK_STORAGE.queueSync({ entityType, entityId, payload, action, status:'queued' });
  }

  async function ensureServerSession(role) {
    const ctx = await ensureFirebase();
    const snap = window.JK_STORAGE.getSnapshot();
    await window.JK_STORAGE.updateSettings({
      cloudSyncEnabled:true, cloudEndpoint:'firebase://hosting', cloudDeviceStatus:'firebase-ready',
      cloudSessionToken:'', cloudSessionExpiresAt:'', lastRole:role || snap.settings.lastRole || 'learner'
    }, { skipSync:true, skipBackup:true });
    return Boolean(ctx.auth.currentUser);
  }

  async function loginWithPin({ role }={}) {
    await ensureServerSession(role || 'learner');
    return { role:role || 'learner', provider:'anonymous', deviceId:window.JK_STORAGE.getSnapshot().settings.deviceId, expiresAt:null };
  }
  async function pairDevice({ role }={}) { return loginWithPin({ role }); }
  async function logoutServer() {
    try { const ctx=await ensureFirebase(); await ctx.authMod.signOut(ctx.auth); } catch (_) {}
    state={...state,status:'firebase-ready'}; notify(); return true;
  }

  async function flush() {
    const start = globalThis.performance?.now?.() || Date.now();
    if (state.running) return {...state};
    state.running = true; notify();
    try {
      const snap = window.JK_STORAGE.getSnapshot();
      if (!navigator.onLine) { state={...state,status:'offline-ready',lastError:''}; return {...state}; }
      const ctx = await ensureFirebase();
      await ensureInitialMerge(ctx, snap);
      state={...state,status:'syncing',lastError:''}; notify();
      const items = await window.JK_STORAGE.listSyncQueue({ status:'queued' });
      for (const op of items) {
        try {
          const result = await writeOperation(ctx, op, snap.settings.deviceId);
          await window.JK_STORAGE.updateSyncOp(op.opId, { status:'sent', serverOutcome:result.outcome || 'stored', lastError:'', attempts:Number(op.attempts||0)+1 });
        } catch (error) {
          await window.JK_STORAGE.updateSyncOp(op.opId, { status:'queued', lastError:String(error.message||error), attempts:Number(op.attempts||0)+1 });
          throw error;
        }
      }
      const latest = window.JK_STORAGE.getSnapshot();
      const since = latest.settings.lastCloudPullAt || '1970-01-01T00:00:00.000Z';
      const remote = await pullSnapshot(ctx, since);
      await window.JK_STORAGE.importBackup(remote, 'merge');
      const stamp = nowIso();
      await window.JK_STORAGE.updateSettings({ lastCloudPullAt:stamp, cloudSyncEnabled:true, cloudEndpoint:'firebase://hosting', cloudDeviceStatus:'firebase-ready' }, { skipSync:true, skipBackup:true });
      state={...state,status:'synced',lastSyncAt:stamp,lastError:'',lastLeaseConflict:null}; notify();
      return {...state};
    } catch (error) {
      state={...state,status:navigator.onLine?'sync-error':'offline-ready',lastError:String(error.message||error)}; notify();
      return {...state};
    } finally {
      state.running=false; notify();
      window.JK_RC?.recordDuration?.('syncFlush',(globalThis.performance?.now?.()||Date.now())-start,{status:state.status,backend:'firebase'});
    }
  }

  async function acquireSessionLease(dayId) {
    if (!navigator.onLine) return { ok:true, mode:'offline' };
    try {
      const ctx=await ensureFirebase();
      const snap=window.JK_STORAGE.getSnapshot();
      const ref=ctx.fsMod.doc(leasesCollection(ctx), String(dayId));
      const result=await ctx.fsMod.runTransaction(ctx.db, async tx => {
        const current=await tx.get(ref); const now=Date.now();
        if (current.exists()) {
          const d=current.data()||{};
          if (Number(d.expiresAtMs||0)>now && d.deviceId && d.deviceId!==snap.settings.deviceId) return { ok:false, conflict:true, deviceId:d.deviceId, expiresAtMs:d.expiresAtMs };
        }
        tx.set(ref,{ deviceId:snap.settings.deviceId, dayId:String(dayId), acquiredAt:nowIso(), expiresAtMs:now+120000 },{merge:true});
        return { ok:true, mode:'firebase', expiresAtMs:now+120000 };
      });
      if (!result.ok) { state={...state,status:'lease-conflict',lastLeaseConflict:result}; notify(); }
      return result;
    } catch (error) { return { ok:true, mode:'offline', warning:String(error.message||error) }; }
  }

  async function releaseSessionLease(dayId) {
    try {
      const ctx=await ensureFirebase(); const snap=window.JK_STORAGE.getSnapshot(); const ref=ctx.fsMod.doc(leasesCollection(ctx),String(dayId));
      await ctx.fsMod.runTransaction(ctx.db, async tx => { const current=await tx.get(ref); if(current.exists() && current.data()?.deviceId===snap.settings.deviceId) tx.delete(ref); });
      return true;
    } catch (_) { return false; }
  }

  async function listRemoteDevices() {
    const ctx=await ensureFirebase();
    const docs=await ctx.fsMod.getDocs(ctx.fsMod.query(entitiesCollection(ctx),ctx.fsMod.where('entityType','==','device')));
    return { devices:docs.docs.filter(x=>!x.data()?.deleted).map(x=>x.data()?.payload||{}).sort((a,b)=>Date.parse(b.lastSeenAt||0)-Date.parse(a.lastSeenAt||0)) };
  }
  async function revokeDevice(deviceId) {
    const ctx=await ensureFirebase(); const ref=entityRef(ctx,'device',deviceId); const existing=await ctx.fsMod.getDoc(ref);
    if(existing.exists()) await ctx.fsMod.setDoc(ref,{payload:{...(existing.data()?.payload||{}),status:'revoked',updatedAt:nowIso()},updatedAt:nowIso()},{merge:true});
    return { ok:true, deviceId };
  }

  async function reportDeviceDiagnostic(payload) { return { ok:true, localOnly:true, payload:safePayload(payload||{}) }; }
  async function getObservability() { return { status:state.status, backend:'firebase', lastSyncAt:state.lastSyncAt, lastError:state.lastError }; }
  async function getDiagnosticBundle() { return { snapshot:window.JK_STORAGE.getSnapshot(), cloud:getStatus(), generatedAt:nowIso() }; }
  async function getAudit() { return { audit:[] }; }
  async function runServerBackup() { const backup=await window.JK_STORAGE.exportBackup({download:false,reason:'firebase-manual-backup'}); return { backup:{ backupId:`local-${Date.now()}`, createdAt:backup.createdAt, bytes:new TextEncoder().encode(JSON.stringify(backup)).byteLength, status:'LOCAL_EXPORT_READY', sha256:'' } }; }
  async function listServerBackups() { return { backups:[] }; }
  async function restoreDrill() { return unsupported('서버 복원훈련'); }
  async function createPairingCode() { return unsupported('1회용 기기 연결 코드'); }
  async function changeServerPin() { return unsupported('서버 PIN 변경'); }
  async function revokeAllSessions() { return unsupported('서버 세션 일괄 해제'); }
  async function createSupportCode() { return unsupported('지원 코드'); }
  async function getSupportTimeline() { return { items:[] }; }
  async function claimSupportDiagnostic() { return unsupported('원격 지원 진단'); }
  function getStatus() { return {...state}; }

  window.JK_CLOUD = {
    SCHEMA_VERSION, queue, flush, ensureServerSession, loginWithPin, pairDevice, logoutServer, createPairingCode, changeServerPin,
    revokeAllSessions, revokeDevice, listRemoteDevices, getAudit, runServerBackup, listServerBackups, restoreDrill,
    acquireSessionLease, releaseSessionLease, reportDeviceDiagnostic, getObservability, createSupportCode, getDiagnosticBundle,
    getSupportTimeline, claimSupportDiagnostic, getStatus
  };
})();
