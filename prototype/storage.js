(() => {
  'use strict';

  const APP_VERSION = '50.0';
  const SCHEMA_VERSION = 21;
  const DB_NAME = 'jk_english_learning';
  const DB_VERSION = 21;
  const STORE_STATE = 'state';
  const STORE_INK = 'ink';
  const STORE_PROFILES = 'profiles';
  const STORE_BACKUPS = 'backups';
  const STORE_DIAGNOSTICS = 'diagnostics';
  const STORE_SESSIONS = 'sessions';
  const STORE_EVENTS = 'events';
  const STORE_REPLAYS = 'replays';
  const STORE_INTERVENTIONS = 'interventions';
  const STORE_ASSIGNMENTS = 'assignments';
  const STORE_DAILY_PLANS = 'dailyPlans';
  const STORE_DAILY_REPORTS = 'dailyReports';
  const STORE_DEVICES = 'devices';
  const STORE_SYNC_QUEUE = 'syncQueue';
  const STORE_ADAPTIVE_RECOMMENDATIONS = 'adaptiveRecommendations';
  const STORE_TREND_SNAPSHOTS = 'trendSnapshots';
  const STORE_QUALITY_APPROVALS = 'qualityApprovals';
  const STORE_BANK_SNAPSHOTS = 'bankSnapshots';
  const STORE_BASELINE_RUNS = 'baselineRuns';
  const STORE_DIFFICULTY_PROPOSALS = 'difficultyProposals';
  const STORE_APPROVAL_AUDIT = 'approvalAudit';
  const STORE_PERSONAL_DIFFICULTY_PROFILES = 'personalDifficultyProfiles';
  const STORE_DIFFICULTY_APPLICATIONS = 'difficultyApplications';
  const STORE_STABILITY_OBSERVATIONS = 'stabilityObservations';
  const STORE_REGRESSION_ALERTS = 'regressionAlerts';
  const LEGACY_PROGRESS_KEYS = ['jk_phase16_progress_fallback', 'jk_phase15_progress_fallback', 'jk_phase14_progress', 'jk_phase13_progress'];
  const LEGACY_INK_KEYS = ['jk_phase16_ink_fallback', 'jk_phase15_ink_fallback', 'jk_phase14_ink_v2', 'jk_phase13_ink_v2', 'jk_phase13_ink'];
  const MAX_AUTO_BACKUPS = 12;
  const EVENT_TYPES = new Set([
    'session_start', 'session_end', 'question_presented', 'mark_committed', 'mark_confirmed',
    'decision_step_answered', 'final_answer', 'grading_result', 'textbook_return',
    'check_question_answered', 'check_question_passed', 'original_retry', 'original_retry_passed', 'process_failed', 'delayed_recall_revealed', 'replay_saved', 'assignment_started', 'assignment_completed',
    'day_started', 'day_completed', 'pace_prompt', 'device_transfer', 'sync_queued',
    'adaptive_recommendation_created', 'adaptive_recommendation_approved', 'adaptive_recommendation_dismissed',
    'device_approved', 'cloud_token_revoked', 'sync_conflict', 'device_paired', 'server_login', 'server_backup_verified',
    'quality_decision_saved', 'bank_snapshot_created', 'bank_snapshot_rolled_back', 'baseline_state_changed', 'difficulty_proposal_created', 'difficulty_proposal_approved',
    'personal_difficulty_profile_created', 'personal_difficulty_applied', 'stability_checkpoint_saved', 'regression_rollback_proposed', 'personal_difficulty_rolled_back', 'learning_context_saved',
    'device_diagnostic_reported', 'support_code_created', 'diagnostic_bundle_created', 'support_timeline_read'
  ]);

  const DEFAULT_PROGRESS = () => ({ wrong: {}, correct: {}, method: {}, methodGap: {}, errorCodes: {} });
  const nowIso = () => new Date().toISOString();
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const canonicalLearnerId = () => 'single-learner';
  const localDateId = date => { const d = date ? new Date(date) : new Date(); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `DAY-${y}-${m}-${day}`; };

  function detectDeviceLabel() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const touchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isIPad = /iPad/.test(ua) || touchMac;
    const isSamsung = /SM-T|SM-X|SAMSUNG|SamsungBrowser/.test(ua);
    if (isIPad) return /CriOS/.test(ua) ? 'iPad Chrome' : 'iPad Safari';
    if (isSamsung) return /SamsungBrowser/.test(ua) ? 'Galaxy Tab Samsung Internet' : 'Galaxy Tab Chrome';
    if (/Android/.test(ua)) return 'Android tablet/browser';
    if (/Windows/.test(ua)) return 'Windows browser';
    if (/Macintosh/.test(ua)) return 'Mac browser';
    return 'Unknown browser';
  }

  function deviceProfileId(label = detectDeviceLabel()) {
    const map = {
      'iPad Safari': 'ipad-safari', 'iPad Chrome': 'ipad-chrome',
      'Galaxy Tab Samsung Internet': 'galaxy-tab-samsung-internet',
      'Galaxy Tab Chrome': 'galaxy-tab-chrome', 'Android tablet/browser': 'android-browser',
      'Windows browser': 'windows-browser', 'Mac browser': 'mac-browser'
    };
    return map[label] || 'browser-default';
  }

  function defaultProfile(overrides = {}) {
    const stamp = nowIso();
    return {
      profileId: overrides.profileId || deviceProfileId(overrides.deviceLabel || detectDeviceLabel()),
      deviceLabel: overrides.deviceLabel || detectDeviceLabel(), pointerTypes: [], pressureEnabled: false,
      pressureMin: 0, pressureMax: 1, tiltEnabled: false, azimuthEnabled: false,
      slashAngleMin: 35, slashAngleMax: 80, slashLengthMin: 0.035,
      circleClosureRatio: 0.22, circleMinSpan: 0.035,
      underlineAspectMin: 3.2, underlineAngleMax: 20, palmGuard: true,
      scrollInkConflict: false, leftHanded: false, toolbarPosition: 'top',
      calibrationStatus: 'default', calibratedAt: null, createdAt: stamp, updatedAt: stamp,
      schemaVersion: SCHEMA_VERSION, ...overrides
    };
  }

  let db = null;
  let initialized = false;
  let mode = 'indexeddb';
  let lastAutoBackupAt = 0;
  let lastAutoBackupReason = '';
  const cache = {
    progress: DEFAULT_PROGRESS(), ink: {}, profiles: {}, sessions: {}, events: [], replays: {}, interventions: {}, assignments: {},
    dailyPlans: {}, dailyReports: {}, devices: {}, syncQueue: {}, adaptiveRecommendations: {}, trendSnapshots: {}, qualityApprovals: {}, bankSnapshots: {}, baselineRuns: {}, difficultyProposals: {}, approvalAudit: {}, personalDifficultyProfiles: {}, difficultyApplications: {}, stabilityObservations: {}, regressionAlerts: {},
    settings: { activeProfileId: 'default', learnerLocalId: 'single-learner', penOnly: true, dailyTargetMinutes: 40, grammarMinutes: 21, readingMinutes: 18, resultMinutes: 1, cloudSyncEnabled: Boolean(window.JK_FIREBASE_PILOT?.enabled), cloudEndpoint: window.JK_FIREBASE_PILOT?.enabled ? 'firebase://hosting' : '', cloudSessionToken: '', cloudSessionExpiresAt: '', cloudDeviceStatus: window.JK_FIREBASE_PILOT?.enabled ? 'firebase-ready' : 'unpaired', syncMode: 'offline-first', adaptiveEnabled: true, newQuestionRatio: 0.55, reviewQuestionRatio: 0.30, recallQuestionRatio: 0.15, paceTargetMultiplier: 1, activeDifficultyProfileId: null, activeDifficultyApplicationId: null, schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() },
    metadata: { appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, createdAt: nowIso(), updatedAt: nowIso(), legacyMigration: null }
  };

  function emitError(code, error, context = {}) {
    const detail = { code, message: String(error && error.message ? error.message : error), context, at: nowIso() };
    console.warn('[JK storage]', detail);
    try { window.dispatchEvent(new CustomEvent('jk-storage-error', { detail })); } catch (_) {}
    return detail;
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function ensureStore(database, name, options, indexes = []) {
    let store;
    if (!database.objectStoreNames.contains(name)) store = database.createObjectStore(name, options);
    else store = eventUpgradeTransaction.objectStore(name);
    for (const [indexName, keyPath, opts] of indexes) {
      if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, opts || { unique: false });
    }
    return store;
  }

  let eventUpgradeTransaction = null;
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not supported'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const database = request.result;
        eventUpgradeTransaction = request.transaction;
        ensureStore(database, STORE_STATE, { keyPath: 'key' });
        ensureStore(database, STORE_INK, { keyPath: 'questionId' });
        ensureStore(database, STORE_PROFILES, { keyPath: 'profileId' });
        ensureStore(database, STORE_BACKUPS, { keyPath: 'backupId' }, [['createdAt', 'createdAt'], ['reason', 'reason']]);
        ensureStore(database, STORE_DIAGNOSTICS, { keyPath: 'id' });
        ensureStore(database, STORE_SESSIONS, { keyPath: 'sessionId' }, [['startedAt', 'startedAt'], ['endedAt', 'endedAt'], ['status', 'status']]);
        ensureStore(database, STORE_EVENTS, { keyPath: 'eventId' }, [['sessionId', 'sessionId'], ['timestamp', 'timestamp'], ['questionId', 'questionId'], ['type', 'type']]);
        ensureStore(database, STORE_REPLAYS, { keyPath: 'replayId' }, [['sessionId', 'sessionId'], ['questionId', 'questionId'], ['createdAt', 'createdAt']]);
        ensureStore(database, STORE_INTERVENTIONS, { keyPath: 'interventionId' }, [['learnerId', 'learnerId'], ['status', 'status'], ['priority', 'priority'], ['lastSeenAt', 'lastSeenAt'], ['signature', 'signature', { unique: true }]]);
        ensureStore(database, STORE_ASSIGNMENTS, { keyPath: 'assignmentId' }, [['learnerId', 'learnerId'], ['status', 'status'], ['questionId', 'questionId'], ['interventionId', 'interventionId'], ['assignedAt', 'assignedAt']]);
        ensureStore(database, STORE_DAILY_PLANS, { keyPath: 'dayId' }, [['date', 'date'], ['status', 'status']]);
        ensureStore(database, STORE_DAILY_REPORTS, { keyPath: 'dayId' }, [['date', 'date'], ['completedAt', 'completedAt']]);
        ensureStore(database, STORE_DEVICES, { keyPath: 'deviceId' }, [['role', 'role'], ['lastSeenAt', 'lastSeenAt']]);
        ensureStore(database, STORE_SYNC_QUEUE, { keyPath: 'opId' }, [['status', 'status'], ['createdAt', 'createdAt'], ['entityType', 'entityType']]);
        ensureStore(database, STORE_ADAPTIVE_RECOMMENDATIONS, { keyPath: 'recommendationId' }, [['status', 'status'], ['createdAt', 'createdAt'], ['updatedAt', 'updatedAt']]);
        ensureStore(database, STORE_TREND_SNAPSHOTS, { keyPath: 'trendId' }, [['periodDays', 'periodDays'], ['createdAt', 'createdAt']]);
        ensureStore(database, STORE_QUALITY_APPROVALS, { keyPath: 'approvalId' }, [['status', 'status'], ['updatedAt', 'updatedAt']]);
        ensureStore(database, STORE_BANK_SNAPSHOTS, { keyPath: 'snapshotId' }, [['kind', 'kind'], ['createdAt', 'createdAt']]);
        ensureStore(database, STORE_BASELINE_RUNS, { keyPath: 'baselineId' }, [['status', 'status'], ['updatedAt', 'updatedAt']]);
        ensureStore(database, STORE_DIFFICULTY_PROPOSALS, { keyPath: 'proposalSetId' }, [['status', 'status'], ['updatedAt', 'updatedAt']]);
        ensureStore(database, STORE_APPROVAL_AUDIT, { keyPath: 'auditId' }, [['type', 'type'], ['entityId', 'entityId'], ['at', 'at']]);
        ensureStore(database, STORE_PERSONAL_DIFFICULTY_PROFILES, { keyPath: 'profileId' }, [['status', 'status'], ['approvedAt', 'approvedAt'], ['updatedAt', 'updatedAt']]);
        ensureStore(database, STORE_DIFFICULTY_APPLICATIONS, { keyPath: 'applicationId' }, [['status', 'status'], ['appliedAt', 'appliedAt'], ['updatedAt', 'updatedAt']]);
        ensureStore(database, STORE_STABILITY_OBSERVATIONS, { keyPath: 'observationId' }, [['applicationId', 'applicationId'], ['status', 'status'], ['asOf', 'asOf']]);
        ensureStore(database, STORE_REGRESSION_ALERTS, { keyPath: 'alertId' }, [['applicationId', 'applicationId'], ['status', 'status'], ['createdAt', 'createdAt']]);
        request.transaction.objectStore(STORE_STATE).put({
          key: 'schema', value: { fromDatabaseVersion: event.oldVersion || 0, toDatabaseVersion: DB_VERSION, appSchemaVersion: SCHEMA_VERSION, upgradedAt: nowIso() }
        });
        eventUpgradeTransaction = null;
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open IndexedDB'));
      request.onblocked = () => emitError('DB_BLOCKED', new Error('Database upgrade is blocked by another tab'));
    });
  }

  async function idbGet(storeName, key) { const tx = db.transaction(storeName, 'readonly'); return requestToPromise(tx.objectStore(storeName).get(key)); }
  async function idbGetAll(storeName) { const tx = db.transaction(storeName, 'readonly'); return requestToPromise(tx.objectStore(storeName).getAll()); }
  async function idbPut(storeName, value) { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(value); await transactionDone(tx); return value; }
  async function idbDelete(storeName, key) { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(key); await transactionDone(tx); }
  async function idbClear(storeName) { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).clear(); await transactionDone(tx); }

  function readLegacyJson(keys) {
    for (const key of keys) {
      try { const raw = localStorage.getItem(key); if (raw) return { key, value: JSON.parse(raw) }; }
      catch (error) { emitError('LEGACY_PARSE_FAILED', error, { key }); }
    }
    return null;
  }

  function normalizeProgress(value) {
    const p = value && typeof value === 'object' ? value : {};
    return {
      wrong: p.wrong && typeof p.wrong === 'object' ? p.wrong : {},
      correct: p.correct && typeof p.correct === 'object' ? p.correct : {},
      method: p.method && typeof p.method === 'object' ? p.method : {},
      methodGap: p.methodGap && typeof p.methodGap === 'object' ? p.methodGap : {},
      errorCodes: p.errorCodes && typeof p.errorCodes === 'object' ? p.errorCodes : {}
    };
  }

  function normalizeInkMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out = {};
    for (const [questionId, entry] of Object.entries(value)) {
      if (Array.isArray(entry)) out[questionId] = { actions: entry, marks: [], evaluation: null, migratedFrom: 13, updatedAt: nowIso() };
      else if (entry && typeof entry === 'object') out[questionId] = { ...entry, actions: Array.isArray(entry.actions) ? entry.actions : [], marks: Array.isArray(entry.marks) ? entry.marks : [], evaluation: entry.evaluation || null, updatedAt: entry.updatedAt || nowIso() };
    }
    return out;
  }

  function sanitizePayload(payload) {
    const allowed = ['choice', 'correctChoice', 'methodPass', 'failureStage', 'attemptNo', 'stepIndex', 'stepCorrect', 'checkCorrect', 'sourceRef', 'reason', 'pathId', 'stageId', 'position', 'queueLength', 'replayId', 'breakScore', 'focusScore', 'completionScore', 'passScore', 'markCount', 'strokeCount', 'assignmentId', 'interventionId', 'learnerId', 'recommendedAction', 'status', 'ruleId', 'baselineMethodScore', 'resultMethodScore', 'recovered', 'dayId', 'module', 'targetSeconds', 'elapsedSeconds', 'paceBand', 'deviceId', 'activeMs', 'syncStatus', 'reportId', 'recommendationId', 'determinismKey', 'before', 'proposed', 'sourceWindow', 'familyId', 'sourceQuestionId', 'variantType', 'opId', 'stepElapsedSeconds', 'answerChanges', 'transferQuestionId', 'duplicateWriteId', 'personalDifficultyProfileId', 'personalDifficultyApplicationId', 'medicationTiming', 'deviceCategory', 'interruptionCount', 'interruptionBand', 'contextSource', 'checkpointDays', 'regressionReasons'];
    const out = {};
    for (const key of allowed) if (payload && payload[key] !== undefined) out[key] = clone(payload[key]);
    return out;
  }

  function normalizeSession(s = {}) {
    return {
      sessionId: String(s.sessionId || uid('session')), pathId: s.pathId || null, stageId: s.stageId || null, learnerId: canonicalLearnerId(s.learnerId), assignmentId: s.assignmentId || null, dayId: s.dayId || localDateId(s.startedAt), module: s.module || null, deviceId: s.deviceId || cache.settings.deviceId || null, totalActiveMs: Number(s.totalActiveMs || 0),
      startedAt: s.startedAt || nowIso(), endedAt: s.endedAt || null, status: s.status || 'active',
      endReason: s.endReason || null, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION,
      updatedAt: s.updatedAt || nowIso()
    };
  }

  function normalizeEvent(e = {}, sequenceFallback = 0) {
    const type = String(e.type || '');
    if (!EVENT_TYPES.has(type)) throw new Error(`지원하지 않는 세션 이벤트입니다: ${type}`);
    return {
      eventId: String(e.eventId || uid('event')), sessionId: String(e.sessionId || ''), type,
      sequence: Number.isFinite(Number(e.sequence)) ? Number(e.sequence) : sequenceFallback,
      questionId: e.questionId || null, conceptId: e.conceptId || null, errorCode: e.errorCode || null, learnerId: canonicalLearnerId(e.learnerId || cache.sessions[e.sessionId]?.learnerId), dayId: e.dayId || cache.sessions[e.sessionId]?.dayId || localDateId(e.timestamp), module: e.module || cache.sessions[e.sessionId]?.module || null, deviceId: e.deviceId || cache.sessions[e.sessionId]?.deviceId || cache.settings.deviceId || null,
      methodScore: e.methodScore == null ? null : Number(e.methodScore),
      answerCorrect: e.answerCorrect == null ? null : Boolean(e.answerCorrect),
      timestamp: e.timestamp || nowIso(), payload: sanitizePayload(e.payload || e), schemaVersion: SCHEMA_VERSION
    };
  }

  function normalizePoint(point, index, lastT) {
    const t = Number.isFinite(Number(point.t)) ? Number(point.t) : lastT + Math.max(8, index * 4);
    return { x: Math.max(0, Math.min(1, Number(point.x) || 0)), y: Math.max(0, Math.min(1, Number(point.y) || 0)), p: Math.max(0, Math.min(1, Number(point.p == null ? 0.5 : point.p))), t };
  }

  function normalizeReplay(r = {}) {
    let lastT = 0;
    const rawStrokes = (r.rawStrokes || r.actions || []).map((stroke, si) => {
      const points = (stroke.points || []).map((p, pi) => {
        const np = normalizePoint(p, pi, lastT);
        lastT = Math.max(lastT, np.t);
        return np;
      });
      return { tool: stroke.tool || 'pen', points, source: 'raw', strokeIndex: si };
    });
    const mapMark = (m, i, source) => ({ ...clone(m), source: m.source || source, t: Number.isFinite(Number(m.t)) ? Number(m.t) : lastT + i + 1 });
    const committedMarks = (r.committedMarks || r.marks || []).map((m, i) => mapMark(m, i, 'committed'));
    const detectedMarks = (r.detectedMarks || []).map((m, i) => mapMark(m, i, 'auto'));
    const durationMs = Math.max(Number(r.durationMs || 0), lastT, ...committedMarks.map(x => x.t || 0), ...detectedMarks.map(x => x.t || 0));
    return {
      replayId: String(r.replayId || uid('replay')), sessionId: String(r.sessionId || ''), questionId: String(r.questionId || ''),
      conceptId: r.conceptId || null, attemptNo: Number(r.attemptNo || 1), coordinateSpace: 'normalized-v1',
      rawStrokes, committedMarks, detectedMarks, assessment: clone(r.assessment || null), durationMs,
      createdAt: r.createdAt || nowIso(), updatedAt: r.updatedAt || nowIso(), schemaVersion: SCHEMA_VERSION
    };
  }

  function normalizeIntervention(i = {}) {
    const status = ['auto_pending', 'auto_resolved', 'approved', 'held', 'dismissed', 'teacher_assigned', 'completed'].includes(i.status) ? i.status : 'auto_pending';
    return {
      interventionId: String(i.interventionId || uid('intv')), signature: String(i.signature || i.interventionId || uid('sig')),
      learnerId: canonicalLearnerId(i.learnerId || cache.settings.learnerLocalId), ruleId: i.ruleId || 'MANUAL', ruleVersion: Number(i.ruleVersion || 1), ruleSetVersion: i.ruleSetVersion || '1.0.0', ruleName: i.ruleName || '교사 직접 배정',
      priority: Math.max(1, Math.min(4, Number(i.priority || 3))), conceptId: i.conceptId || null, questionId: i.questionId || null,
      errorCode: i.errorCode || null, failureStage: i.failureStage || null, sourceRef: i.sourceRef || null,
      recommendedAction: i.recommendedAction || '원문 재도전', completionRule: i.completionRule || '원문 재도전 완전 통과', completionCode: i.completionCode || 'original_retry_full_pass',
      occurrenceCount: Math.max(1, Number(i.occurrenceCount || 1)), evidenceEventIds: [...new Set(i.evidenceEventIds || [])].sort(),
      firstSeenAt: i.firstSeenAt || nowIso(), lastSeenAt: i.lastSeenAt || i.firstSeenAt || nowIso(), latestMethodScore: i.latestMethodScore == null ? null : Number(i.latestMethodScore),
      thresholds: clone(i.thresholds || {}), reason: i.reason || '', status, teacherNote: i.teacherNote || '',
      createdAt: i.createdAt || nowIso(), updatedAt: i.updatedAt || nowIso(), schemaVersion: SCHEMA_VERSION
    };
  }

  function normalizeAssignment(a = {}) {
    const status = ['assigned', 'in_progress', 'completed', 'held', 'cancelled'].includes(a.status) ? a.status : 'assigned';
    return {
      assignmentId: String(a.assignmentId || uid('assignment')), interventionId: a.interventionId || null,
      learnerId: canonicalLearnerId(a.learnerId || cache.settings.learnerLocalId), questionId: a.questionId || null, conceptId: a.conceptId || null,
      sourceRef: a.sourceRef || null, recommendedAction: a.recommendedAction || '원문 재도전', status,
      assignedBy: a.assignedBy || 'teacher', assignedAt: a.assignedAt || nowIso(), startedAt: a.startedAt || null, completedAt: a.completedAt || null,
      baselineMethodScore: a.baselineMethodScore == null ? null : Number(a.baselineMethodScore), resultMethodScore: a.resultMethodScore == null ? null : Number(a.resultMethodScore),
      baselineFullyCorrect: Boolean(a.baselineFullyCorrect), recovered: Boolean(a.recovered), startSessionId: a.startSessionId || null, resultEventId: a.resultEventId || null,
      attemptsAfterAssignment: Number(a.attemptsAfterAssignment || 0), teacherNote: a.teacherNote || '', createdAt: a.createdAt || nowIso(), updatedAt: a.updatedAt || nowIso(), schemaVersion: SCHEMA_VERSION
    };
  }

  function normalizeDailyPlan(p = {}) {
    const dayId = p.dayId || localDateId(p.date);
    return { dayId, date: p.date || dayId.slice(4), learnerId: canonicalLearnerId(p.learnerId), status: p.status || 'planned', targetMinutes: Number(p.targetMinutes || 40), grammarMinutes: Number(p.grammarMinutes || 21), readingMinutes: Number(p.readingMinutes || 18), resultMinutes: Number(p.resultMinutes || 1), grammarQuestionIds: [...new Set(p.grammarQuestionIds || [])], readingQuestionIds: [...new Set(p.readingQuestionIds || [])], recallQuestionIds: [...new Set(p.recallQuestionIds || [])], resumeQuestionId:p.resumeQuestionId||null, resumeIndex:Number(p.resumeIndex||0), lastDeviceId:p.lastDeviceId||null, adaptiveRecommendationId:p.adaptiveRecommendationId||null, adaptiveAppliedAt:p.adaptiveAppliedAt||null, paceTargetMultiplier:Number(p.paceTargetMultiplier||1), questionMix:clone(p.questionMix||null), questionPacing:clone(p.questionPacing||{}), difficultyCurveVersion:p.difficultyCurveVersion||null, calibrationStatus:p.calibrationStatus||null, personalDifficultyProfileId:p.personalDifficultyProfileId||null, personalDifficultyApplied:Boolean(p.personalDifficultyApplied), conceptDiversityGuard:p.conceptDiversityGuard!==false, createdAt: p.createdAt || nowIso(), updatedAt: p.updatedAt || nowIso(), schemaVersion: SCHEMA_VERSION };
  }
  function normalizeDailyReport(r = {}) {
    const axes = r.axes || {}, evidence=r.axisEvidence||{};
    return { dayId: r.dayId || localDateId(r.date), date: r.date || String(r.dayId || '').slice(4), learnerId: canonicalLearnerId(r.learnerId), completedAt: r.completedAt || null, activeMinutes: Number(r.activeMinutes || 0), grammarMinutes: Number(r.grammarMinutes || 0), readingMinutes: Number(r.readingMinutes || 0), attempts: Number(r.attempts || 0), answerAccuracy: Number(r.answerAccuracy || 0), processPassRate: Number(r.processPassRate || 0), fullPassRate: Number(r.fullPassRate || 0), recoveryRate: Number(r.recoveryRate || 0), medicationTiming:['unknown','before_window','within_window','after_window'].includes(r.medicationTiming)?r.medicationTiming:'unknown', deviceCategory:['unknown','phone','tablet','pc'].includes(r.deviceCategory)?r.deviceCategory:'unknown', interruptionCount:Math.max(0,Number(r.interruptionCount||0)), interruptionBand:['none','low','medium','high'].includes(r.interruptionBand)?r.interruptionBand:null, contextNote:String(r.contextNote||'').slice(0,500), contextUpdatedAt:r.contextUpdatedAt||null, axes: { conceptActivation:Number(axes.conceptActivation||0), stageExecution:Number(axes.stageExecution||0), evidenceJudgment:Number(axes.evidenceJudgment||0), finalAccuracy:Number(axes.finalAccuracy||0), paceStability:Number(axes.paceStability||0), recoveryTransfer:Number(axes.recoveryTransfer||0) }, axisEvidence:{conceptActivation:Number(evidence.conceptActivation||0),stageExecution:Number(evidence.stageExecution||0),evidenceJudgment:Number(evidence.evidenceJudgment||0),finalAccuracy:Number(evidence.finalAccuracy||0),paceStability:Number(evidence.paceStability||0),recoveryTransfer:Number(evidence.recoveryTransfer||0)}, strength: r.strength || '', nextFocus: r.nextFocus || '', recommendation: r.recommendation || '', sourceEventIds: [...new Set(r.sourceEventIds || [])], createdAt: r.createdAt || nowIso(), updatedAt: r.updatedAt || nowIso(), schemaVersion: SCHEMA_VERSION };
  }
  function normalizeAdaptiveRecommendation(r = {}) {
    const status = ['pending_admin','approved','dismissed','applied','superseded'].includes(r.status) ? r.status : 'pending_admin';
    return { recommendationId:String(r.recommendationId||uid('adapt')), learnerId:canonicalLearnerId(r.learnerId), status, sourceWindow:clone(r.sourceWindow||{}), before:clone(r.before||{}), proposed:clone(r.proposed||{}), priorityTargets:clone(r.priorityTargets||{}), reasons:Array.isArray(r.reasons)?clone(r.reasons):[], determinismKey:String(r.determinismKey||''), teacherNote:r.teacherNote||'', approvedAt:r.approvedAt||null, dismissedAt:r.dismissedAt||null, appliedAt:r.appliedAt||null, createdAt:r.createdAt||nowIso(), updatedAt:r.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION };
  }
  function normalizeTrendSnapshot(t = {}) { return { trendId:String(t.trendId||uid('trend')), learnerId:canonicalLearnerId(t.learnerId), periodDays:Number(t.periodDays||7), reportCount:Number(t.reportCount||0), attempts:Number(t.attempts||0), payload:clone(t.payload||t), createdAt:t.createdAt||nowIso(), updatedAt:t.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeQualityApproval(a={}) { return { approvalId:String(a.approvalId||a.draftId||uid('approval')), status:a.status||'draft', payload:clone(a.payload||a), createdAt:a.createdAt||nowIso(), updatedAt:a.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeBankSnapshot(s={}) { return { snapshotId:String(s.snapshotId||uid('snapshot')), kind:s.kind||'manual', payload:clone(s.payload||s), createdAt:s.createdAt||nowIso(), updatedAt:s.updatedAt||s.createdAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeBaselineRun(b={}) { return { baselineId:String(b.baselineId||'single-learner-first-7-days'), status:b.status||'NOT_COLLECTED', payload:clone(b.payload||b), actualLearnerDataUsed:Boolean(b.actualLearnerDataUsed||b.payload?.actualLearnerDataUsed), createdAt:b.createdAt||nowIso(), updatedAt:b.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeDifficultyProposalSet(d={}) { return { proposalSetId:String(d.proposalSetId||uid('difficulty-set')), status:d.status||'NOT_COLLECTED', payload:clone(d.payload||d), actualLearnerDataUsed:Boolean(d.actualLearnerDataUsed||d.payload?.actualLearnerDataUsed), createdAt:d.createdAt||nowIso(), updatedAt:d.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeApprovalAudit(a={}) { return { auditId:String(a.auditId||uid('approval-audit')), type:a.type||'unknown', entityId:String(a.entityId||''), actor:a.actor||'admin', payload:clone(a.payload||a), at:a.at||nowIso(), createdAt:a.createdAt||a.at||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizePersonalDifficultyProfile(x={}) { return { profileId:String(x.profileId||uid('personal-profile')), learnerId:canonicalLearnerId(x.learnerId), status:x.status||'APPROVED_NOT_APPLIED', actualLearnerDataUsed:Boolean(x.actualLearnerDataUsed), payload:clone(x.payload||x), approvedAt:x.approvedAt||x.payload?.approvedAt||null, appliedAt:x.appliedAt||x.payload?.appliedAt||null, createdAt:x.createdAt||nowIso(), updatedAt:x.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeDifficultyApplication(x={}) { return { applicationId:String(x.applicationId||uid('difficulty-application')), learnerId:canonicalLearnerId(x.learnerId), profileId:String(x.profileId||x.payload?.profileId||''), status:x.status||'ACTIVE_STABILIZING', payload:clone(x.payload||x), appliedAt:x.appliedAt||x.payload?.appliedAt||null, createdAt:x.createdAt||nowIso(), updatedAt:x.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeStabilityObservation(x={}) { return { observationId:String(x.observationId||uid('stability-observation')), learnerId:canonicalLearnerId(x.learnerId), applicationId:String(x.applicationId||x.payload?.applicationId||''), status:x.status||x.payload?.status||'ACTIVE_STABILIZING', payload:clone(x.payload||x), asOf:x.asOf||x.payload?.asOf||nowIso(), createdAt:x.createdAt||nowIso(), updatedAt:x.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeRegressionAlert(x={}) { return { alertId:String(x.alertId||uid('regression-alert')), learnerId:canonicalLearnerId(x.learnerId), applicationId:String(x.applicationId||x.payload?.applicationId||''), status:x.status||'pending_admin', payload:clone(x.payload||x), createdAt:x.createdAt||nowIso(), updatedAt:x.updatedAt||nowIso(), schemaVersion:SCHEMA_VERSION }; }
  function normalizeDevice(d = {}) { const nav=typeof navigator!=='undefined'?navigator:{}; return { deviceId: String(d.deviceId || uid('device')), label: d.label || detectDeviceLabel(), role: d.role || 'learner', trusted: d.trusted !== false, platform: d.platform || nav.platform || '', createdAt: d.createdAt || nowIso(), lastSeenAt: d.lastSeenAt || nowIso(), schemaVersion: SCHEMA_VERSION }; }
  function normalizeSyncOp(o = {}) { return { opId: String(o.opId || uid('sync')), entityType: o.entityType || 'unknown', entityId: String(o.entityId || ''), action: o.action || 'upsert', payload: clone(o.payload || {}), status: o.status || 'queued', attempts: Number(o.attempts || 0), lastError: o.lastError || '', createdAt: o.createdAt || nowIso(), updatedAt: o.updatedAt || nowIso(), schemaVersion: SCHEMA_VERSION }; }
  async function queueCloud(entityType, entityId, payload, action='upsert') { if (!cache.settings.cloudSyncEnabled) return null; return queueSync({ entityType, entityId, payload, action, status:'queued' }); }

  function safeSettings(value=cache.settings) { const out=clone(value)||{}; delete out.cloudDeviceToken; delete out.cloudSessionToken; delete out.cloudSessionExpiresAt; delete out.cloudRegistrationCode; delete out.adminBootstrapToken; return out; }

  function fallbackSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { emitError('LOCALSTORAGE_WRITE_FAILED', error, { key }); return false; } }

  function mirrorCloudAuthConfig() { try { localStorage.setItem('jk_phase22_cloud_auth_config', JSON.stringify({ cloudEndpoint: cache.settings.cloudEndpoint || '', cloudSyncEnabled: Boolean(cache.settings.cloudSyncEnabled), deviceId: cache.settings.deviceId || '', lastRole: cache.settings.lastRole || 'learner', deviceLabel: detectDeviceLabel() })); } catch (_) {} }

  async function migrateLegacyLocalStorage() {
    const migration = { attemptedAt: nowIso(), progressKey: null, inkKey: null, progressMigrated: false, inkRecordsMigrated: 0, phase18To19: true };
    const existingProgress = await idbGet(STORE_STATE, 'progress');
    if (!existingProgress) {
      const legacy = readLegacyJson(LEGACY_PROGRESS_KEYS);
      if (legacy) { cache.progress = normalizeProgress(legacy.value); await idbPut(STORE_STATE, { key: 'progress', value: cache.progress, updatedAt: nowIso() }); migration.progressKey = legacy.key; migration.progressMigrated = true; }
    }
    const existingInk = await idbGetAll(STORE_INK);
    if (!existingInk.length) {
      const legacy = readLegacyJson(LEGACY_INK_KEYS);
      if (legacy) {
        const normalized = normalizeInkMap(legacy.value); const tx = db.transaction(STORE_INK, 'readwrite'); const store = tx.objectStore(STORE_INK);
        for (const [questionId, data] of Object.entries(normalized)) { store.put({ questionId, data, updatedAt: data.updatedAt || nowIso() }); migration.inkRecordsMigrated += 1; }
        await transactionDone(tx); migration.inkKey = legacy.key;
      }
    }
    if (migration.progressMigrated || migration.inkRecordsMigrated) cache.metadata.legacyMigration = migration;
  }

  function localFallbackLoad() {
    mode = 'localStorage';
    const p = readLegacyJson(LEGACY_PROGRESS_KEYS); if (p) cache.progress = normalizeProgress(p.value);
    const i = readLegacyJson(LEGACY_INK_KEYS); if (i) cache.ink = normalizeInkMap(i.value);
    try { cache.settings = { ...cache.settings, ...JSON.parse(localStorage.getItem('jk_phase19_settings') || localStorage.getItem('jk_phase18_settings') || '{}'), schemaVersion:SCHEMA_VERSION }; } catch (_) {}
    try { cache.metadata = { ...cache.metadata, ...JSON.parse(localStorage.getItem('jk_phase19_metadata') || localStorage.getItem('jk_phase18_metadata') || '{}'), appVersion:APP_VERSION, schemaVersion:SCHEMA_VERSION }; } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_sessions') || localStorage.getItem('jk_phase18_sessions') || localStorage.getItem('jk_phase17_sessions') || localStorage.getItem('jk_phase16_sessions') || '{}'); cache.sessions=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeSession({...v,sessionId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_events') || localStorage.getItem('jk_phase18_events') || localStorage.getItem('jk_phase17_events') || localStorage.getItem('jk_phase16_events') || '[]'); cache.events=raw.map((v,i)=>normalizeEvent(v,i)); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_replays') || localStorage.getItem('jk_phase18_replays') || localStorage.getItem('jk_phase17_replays') || localStorage.getItem('jk_phase16_replays') || '{}'); cache.replays=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeReplay({...v,replayId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_interventions') || localStorage.getItem('jk_phase18_interventions') || localStorage.getItem('jk_phase17_interventions') || '{}'); cache.interventions=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeIntervention({...v,interventionId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_assignments') || localStorage.getItem('jk_phase18_assignments') || localStorage.getItem('jk_phase17_assignments') || '{}'); cache.assignments=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeAssignment({...v,assignmentId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_daily_plans') || localStorage.getItem('jk_phase18_daily_plans') || '{}'); cache.dailyPlans=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeDailyPlan({...v,dayId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_daily_reports') || localStorage.getItem('jk_phase18_daily_reports') || '{}'); cache.dailyReports=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeDailyReport({...v,dayId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_devices') || localStorage.getItem('jk_phase18_devices') || '{}'); cache.devices=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeDevice({...v,deviceId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_sync_queue') || localStorage.getItem('jk_phase18_sync_queue') || '{}'); cache.syncQueue=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeSyncOp({...v,opId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_adaptive_recommendations') || '{}'); cache.adaptiveRecommendations=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeAdaptiveRecommendation({...v,recommendationId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase19_trend_snapshots') || '{}'); cache.trendSnapshots=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeTrendSnapshot({...v,trendId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase26_quality_approvals') || '{}'); cache.qualityApprovals=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeQualityApproval({...v,approvalId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase26_bank_snapshots') || '{}'); cache.bankSnapshots=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeBankSnapshot({...v,snapshotId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase26_baseline_runs') || '{}'); cache.baselineRuns=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeBaselineRun({...v,baselineId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase26_difficulty_proposals') || '{}'); cache.difficultyProposals=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeDifficultyProposalSet({...v,proposalSetId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase26_approval_audit') || '{}'); cache.approvalAudit=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeApprovalAudit({...v,auditId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase27_personal_difficulty_profiles') || '{}'); cache.personalDifficultyProfiles=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizePersonalDifficultyProfile({...v,profileId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase27_difficulty_applications') || '{}'); cache.difficultyApplications=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeDifficultyApplication({...v,applicationId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase27_stability_observations') || '{}'); cache.stabilityObservations=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeStabilityObservation({...v,observationId:k})])); } catch (_) {}
    try { const raw=JSON.parse(localStorage.getItem('jk_phase27_regression_alerts') || '{}'); cache.regressionAlerts=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,normalizeRegressionAlert({...v,alertId:k})])); } catch (_) {}
    try { const stored=JSON.parse(localStorage.getItem('jk_phase19_profile') || localStorage.getItem('jk_phase18_profile') || 'null'); if(stored)cache.profiles[stored.profileId||'default']={...defaultProfile(),...stored,schemaVersion:SCHEMA_VERSION}; } catch (_) {}
    if (!Object.keys(cache.profiles).length) { const profile = defaultProfile({ calibrationStatus: 'fallback-default' }); cache.profiles[profile.profileId] = profile; }
    cache.settings.learnerLocalId=canonicalLearnerId(cache.settings.learnerLocalId); cache.settings.activeProfileId=cache.profiles[cache.settings.activeProfileId]?cache.settings.activeProfileId:Object.keys(cache.profiles)[0];
    if (!cache.settings.deviceId) cache.settings.deviceId=`device-${Math.random().toString(36).slice(2,10)}`;
  }

  async function loadCacheFromIdb() {
    const [progressRec, settingsRec, metadataRec, profiles, inkRecords, sessions, events, replays, interventions, assignments, dailyPlans, dailyReports, devices, syncQueue, adaptiveRecommendations, trendSnapshots, qualityApprovals, bankSnapshots, baselineRuns, difficultyProposals, approvalAudit, personalDifficultyProfiles, difficultyApplications, stabilityObservations, regressionAlerts] = await Promise.all([
      idbGet(STORE_STATE, 'progress'), idbGet(STORE_STATE, 'settings'), idbGet(STORE_STATE, 'metadata'), idbGetAll(STORE_PROFILES), idbGetAll(STORE_INK), idbGetAll(STORE_SESSIONS), idbGetAll(STORE_EVENTS), idbGetAll(STORE_REPLAYS), idbGetAll(STORE_INTERVENTIONS), idbGetAll(STORE_ASSIGNMENTS), idbGetAll(STORE_DAILY_PLANS), idbGetAll(STORE_DAILY_REPORTS), idbGetAll(STORE_DEVICES), idbGetAll(STORE_SYNC_QUEUE), idbGetAll(STORE_ADAPTIVE_RECOMMENDATIONS), idbGetAll(STORE_TREND_SNAPSHOTS), idbGetAll(STORE_QUALITY_APPROVALS), idbGetAll(STORE_BANK_SNAPSHOTS), idbGetAll(STORE_BASELINE_RUNS), idbGetAll(STORE_DIFFICULTY_PROPOSALS), idbGetAll(STORE_APPROVAL_AUDIT), idbGetAll(STORE_PERSONAL_DIFFICULTY_PROFILES), idbGetAll(STORE_DIFFICULTY_APPLICATIONS), idbGetAll(STORE_STABILITY_OBSERVATIONS), idbGetAll(STORE_REGRESSION_ALERTS)
    ]);
    cache.progress = normalizeProgress(progressRec && progressRec.value);
    if (settingsRec && settingsRec.value) cache.settings = { ...cache.settings, ...settingsRec.value, schemaVersion: SCHEMA_VERSION };
    if (metadataRec && metadataRec.value) cache.metadata = { ...cache.metadata, ...metadataRec.value, schemaVersion: SCHEMA_VERSION };
    cache.profiles = Object.fromEntries(profiles.map(item => [item.profileId, item]));
    cache.ink = Object.fromEntries(inkRecords.map(item => [item.questionId, item.data]));
    cache.sessions = Object.fromEntries(sessions.map(item => [item.sessionId, normalizeSession(item)]));
    cache.events = events.map((item, i) => normalizeEvent(item, i)).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.sequence - b.sequence);
    cache.replays = Object.fromEntries(replays.map(item => [item.replayId, normalizeReplay(item)]));
    cache.interventions = Object.fromEntries(interventions.map(item => [item.interventionId, normalizeIntervention(item)]));
    cache.assignments = Object.fromEntries(assignments.map(item => [item.assignmentId, normalizeAssignment(item)]));
    cache.dailyPlans = Object.fromEntries(dailyPlans.map(item => [item.dayId, normalizeDailyPlan(item)]));
    cache.dailyReports = Object.fromEntries(dailyReports.map(item => [item.dayId, normalizeDailyReport(item)]));
    cache.devices = Object.fromEntries(devices.map(item => [item.deviceId, normalizeDevice(item)]));
    cache.syncQueue = Object.fromEntries(syncQueue.map(item => [item.opId, normalizeSyncOp(item)]));
    cache.adaptiveRecommendations = Object.fromEntries(adaptiveRecommendations.map(item => [item.recommendationId, normalizeAdaptiveRecommendation(item)]));
    cache.trendSnapshots = Object.fromEntries(trendSnapshots.map(item => [item.trendId, normalizeTrendSnapshot(item)]));
    cache.qualityApprovals = Object.fromEntries(qualityApprovals.map(item => [item.approvalId, normalizeQualityApproval(item)]));
    cache.bankSnapshots = Object.fromEntries(bankSnapshots.map(item => [item.snapshotId, normalizeBankSnapshot(item)]));
    cache.baselineRuns = Object.fromEntries(baselineRuns.map(item => [item.baselineId, normalizeBaselineRun(item)]));
    cache.difficultyProposals = Object.fromEntries(difficultyProposals.map(item => [item.proposalSetId, normalizeDifficultyProposalSet(item)]));
    cache.approvalAudit = Object.fromEntries(approvalAudit.map(item => [item.auditId, normalizeApprovalAudit(item)]));
    cache.personalDifficultyProfiles = Object.fromEntries(personalDifficultyProfiles.map(item => [item.profileId, normalizePersonalDifficultyProfile(item)]));
    cache.difficultyApplications = Object.fromEntries(difficultyApplications.map(item => [item.applicationId, normalizeDifficultyApplication(item)]));
    cache.stabilityObservations = Object.fromEntries(stabilityObservations.map(item => [item.observationId, normalizeStabilityObservation(item)]));
    cache.regressionAlerts = Object.fromEntries(regressionAlerts.map(item => [item.alertId, normalizeRegressionAlert(item)]));
    cache.settings.learnerLocalId = canonicalLearnerId(cache.settings.learnerLocalId);
    if (!Object.keys(cache.profiles).length) { const profile = defaultProfile(); cache.profiles[profile.profileId] = profile; await idbPut(STORE_PROFILES, profile); }
    if (!cache.profiles[cache.settings.activeProfileId]) { cache.settings.activeProfileId = Object.keys(cache.profiles)[0]; await idbPut(STORE_STATE, { key: 'settings', value: cache.settings, updatedAt: nowIso() }); }
  }

  async function init() {
    if (initialized) return snapshot();
    try {
      db = await openDatabase(); await migrateLegacyLocalStorage(); await loadCacheFromIdb();
      cache.settings.learnerLocalId = canonicalLearnerId(cache.settings.learnerLocalId);
      if (window.JK_FIREBASE_PILOT?.enabled) {
        cache.settings.cloudSyncEnabled = true;
        cache.settings.cloudEndpoint = 'firebase://hosting';
        cache.settings.cloudDeviceStatus = 'firebase-ready';
        cache.settings.cloudSessionToken = '';
        cache.settings.cloudSessionExpiresAt = '';
      }
      if (!cache.settings.deviceId) cache.settings.deviceId = `device-${Math.random().toString(36).slice(2,10)}`;
      const device = normalizeDevice({ ...(cache.devices[cache.settings.deviceId] || {}), deviceId: cache.settings.deviceId, role: cache.settings.lastRole || 'learner', lastSeenAt: nowIso() }); cache.devices[device.deviceId] = device; await idbPut(STORE_DEVICES, device); await idbPut(STORE_STATE, { key: 'settings', value: cache.settings, updatedAt: nowIso() });
      cache.metadata.appVersion = APP_VERSION; cache.metadata.schemaVersion = SCHEMA_VERSION; cache.metadata.updatedAt = nowIso();
      await idbPut(STORE_STATE, { key: 'metadata', value: cache.metadata, updatedAt: nowIso() });
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) {}
      mirrorCloudAuthConfig();
      const activeDifficulty=Object.values(cache.personalDifficultyProfiles).map(x=>x.payload||x).filter(x=>['ACTIVE_STABILIZING','STABLE'].includes(x.status)).sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0))[0];
      if(activeDifficulty){try{localStorage.setItem('jk_phase27_active_difficulty_profile',JSON.stringify(activeDifficulty));}catch(_){}}
    } catch (error) { emitError('IDB_INIT_FAILED', error); localFallbackLoad(); }
    const fallbackActive=Object.values(cache.personalDifficultyProfiles).map(x=>x.payload||x).filter(x=>['ACTIVE_STABILIZING','STABLE'].includes(x.status)).sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0))[0];
    if(fallbackActive){try{localStorage.setItem('jk_phase27_active_difficulty_profile',JSON.stringify(fallbackActive));}catch(_){}}
    initialized = true; return snapshot();
  }

  function snapshot() {
    const activeProfileId = cache.settings.activeProfileId || 'default';
    return {
      mode, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, progress: clone(cache.progress), ink: clone(cache.ink),
      profiles: clone(cache.profiles), profile: clone(cache.profiles[activeProfileId] || defaultProfile()), settings: clone(cache.settings), metadata: clone(cache.metadata), dailyPlans: clone(cache.dailyPlans), dailyReports: clone(cache.dailyReports), devices: clone(cache.devices), syncQueue: clone(cache.syncQueue), adaptiveRecommendations:clone(cache.adaptiveRecommendations), trendSnapshots:clone(cache.trendSnapshots), qualityApprovals:clone(cache.qualityApprovals), bankSnapshots:clone(cache.bankSnapshots), baselineRuns:clone(cache.baselineRuns), difficultyProposals:clone(cache.difficultyProposals), approvalAudit:clone(cache.approvalAudit), personalDifficultyProfiles:clone(cache.personalDifficultyProfiles), difficultyApplications:clone(cache.difficultyApplications), stabilityObservations:clone(cache.stabilityObservations), regressionAlerts:clone(cache.regressionAlerts),
      sessionCounts: { sessions: Object.keys(cache.sessions).length, events: cache.events.length, replays: Object.keys(cache.replays).length, interventions: Object.keys(cache.interventions).length, assignments: Object.keys(cache.assignments).length, dailyReports: Object.keys(cache.dailyReports).length, adaptiveRecommendations:Object.keys(cache.adaptiveRecommendations).length, qualityApprovals:Object.keys(cache.qualityApprovals).length, bankSnapshots:Object.keys(cache.bankSnapshots).length, baselineRuns:Object.keys(cache.baselineRuns).length, difficultyProposals:Object.keys(cache.difficultyProposals).length, personalDifficultyProfiles:Object.keys(cache.personalDifficultyProfiles).length, difficultyApplications:Object.keys(cache.difficultyApplications).length, stabilityObservations:Object.keys(cache.stabilityObservations).length, regressionAlerts:Object.keys(cache.regressionAlerts).length, queuedSync: Object.values(cache.syncQueue).filter(x=>x.status==='queued').length }
    };
  }

  async function saveProgress(progress) {
    cache.progress = normalizeProgress(progress); cache.metadata.updatedAt = nowIso();
    if (mode === 'indexeddb') { try { await idbPut(STORE_STATE, { key: 'progress', value: cache.progress, updatedAt: nowIso() }); } catch (error) { emitError('PROGRESS_SAVE_FAILED', error); fallbackSet('jk_phase19_progress_fallback', cache.progress); } }
    else fallbackSet('jk_phase19_progress_fallback', cache.progress);
    await queueCloud('progress','single-learner',cache.progress); return clone(cache.progress);
  }

  async function saveInk(questionId, data) {
    if (!questionId) return null;
    const normalized = normalizeInkMap({ [questionId]: data })[questionId] || { actions: [], marks: [], evaluation: null }; normalized.updatedAt = nowIso(); cache.ink[questionId] = normalized;
    if (mode === 'indexeddb') { try { await idbPut(STORE_INK, { questionId, data: normalized, updatedAt: normalized.updatedAt }); } catch (error) { emitError('INK_SAVE_FAILED', error, { questionId }); fallbackSet('jk_phase19_ink_fallback', cache.ink); } }
    else fallbackSet('jk_phase19_ink_fallback', cache.ink);
    await queueCloud('ink',questionId,normalized); return clone(normalized);
  }

  async function updateSettings(patch, options = {}) {
    const wasCloud=Boolean(cache.settings.cloudSyncEnabled); cache.settings = { ...cache.settings, ...patch, learnerLocalId:canonicalLearnerId(patch.learnerLocalId||cache.settings.learnerLocalId), schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() };
    if (mode === 'indexeddb') { try { await idbPut(STORE_STATE, { key: 'settings', value: cache.settings, updatedAt: nowIso() }); } catch (error) { emitError('SETTINGS_SAVE_FAILED', error); } }
    else fallbackSet('jk_phase19_settings', cache.settings);
    mirrorCloudAuthConfig();
    if (!options.skipSync) {
      await queueCloud('settings','single-learner',safeSettings());
      if(!wasCloud&&cache.settings.cloudSyncEnabled) await queueSync({entityType:'bootstrap',entityId:'single-learner',payload:buildBackup('cloud-bootstrap'),status:'queued'});
    }
    if (!options.skipBackup) await autoBackup('settings-change');
    return clone(cache.settings);
  }

  async function saveProfile(profile) {
    const current = cache.profiles[profile.profileId || 'default'] || defaultProfile();
    const normalized = { ...current, ...profile, profileId: profile.profileId || 'default', schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), createdAt: current.createdAt || profile.createdAt || nowIso() };
    cache.profiles[normalized.profileId] = normalized; cache.settings.activeProfileId = normalized.profileId; cache.settings.updatedAt = nowIso();
    if (mode === 'indexeddb') {
      try { const tx = db.transaction([STORE_PROFILES, STORE_STATE], 'readwrite'); tx.objectStore(STORE_PROFILES).put(normalized); tx.objectStore(STORE_STATE).put({ key: 'settings', value: cache.settings, updatedAt: nowIso() }); await transactionDone(tx); }
      catch (error) { emitError('PROFILE_SAVE_FAILED', error); fallbackSet('jk_phase19_profile', normalized); }
    } else fallbackSet('jk_phase19_profile', normalized);
    await queueCloud('profile',normalized.profileId,normalized); await autoBackup('settings-change', { force: true }); return clone(normalized);
  }

  async function resetProfile(profileId = 'default', overrides = {}) { return saveProfile(defaultProfile({ profileId, deviceLabel: detectDeviceLabel(), calibrationStatus: 'default-restored', calibratedAt: nowIso(), ...overrides })); }

  async function startSession(meta = {}) {
    const session = normalizeSession({ ...meta, learnerId: canonicalLearnerId(meta.learnerId || cache.settings.learnerLocalId), deviceId: meta.deviceId || cache.settings.deviceId, dayId: meta.dayId || localDateId(meta.startedAt), sessionId: meta.sessionId || uid('session'), startedAt: meta.startedAt || nowIso(), status: 'active' });
    cache.sessions[session.sessionId] = session;
    if (mode === 'indexeddb') await idbPut(STORE_SESSIONS, session); else fallbackSet('jk_phase19_sessions', cache.sessions);
    await queueCloud('session',session.sessionId,session); await appendEvent({ type: 'session_start', sessionId: session.sessionId, learnerId: session.learnerId, dayId: session.dayId, module: session.module, deviceId: session.deviceId, payload: { pathId: session.pathId, stageId: session.stageId, dayId: session.dayId, module: session.module, deviceId: session.deviceId } });
    return clone(session);
  }

  async function appendEvent(event) {
    if (!event || !event.sessionId) throw new Error('세션 이벤트에는 sessionId가 필요합니다.');
    const seq = cache.events.filter(x => x.sessionId === event.sessionId).length + 1;
    const session = cache.sessions[event.sessionId] || {}; const normalized = normalizeEvent({ ...event, learnerId: event.learnerId || session.learnerId, dayId: event.dayId || session.dayId, module: event.module || session.module, deviceId: event.deviceId || session.deviceId }, seq);
    cache.events.push(normalized);
    cache.events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.sequence - b.sequence);
    if (mode === 'indexeddb') await idbPut(STORE_EVENTS, normalized); else fallbackSet('jk_phase19_events', cache.events);
    await queueCloud('event',normalized.eventId,normalized); return clone(normalized);
  }

  async function endSession(sessionId, reason = 'completed') {
    const existing = cache.sessions[sessionId]; if (!existing) return null;
    if (existing.status !== 'ended') await appendEvent({ type: 'session_end', sessionId, payload: { reason } });
    const endedAt = existing.endedAt || nowIso(); const session = normalizeSession({ ...existing, endedAt, totalActiveMs: Math.max(existing.totalActiveMs || 0, Date.parse(endedAt)-Date.parse(existing.startedAt)), status: 'ended', endReason: reason, updatedAt: nowIso() });
    cache.sessions[sessionId] = session;
    if (mode === 'indexeddb') await idbPut(STORE_SESSIONS, session); else fallbackSet('jk_phase19_sessions', cache.sessions);
    await queueCloud('session',session.sessionId,session); return clone(session);
  }

  async function saveReplay(replay) {
    const normalized = normalizeReplay(replay); cache.replays[normalized.replayId] = normalized;
    if (mode === 'indexeddb') await idbPut(STORE_REPLAYS, normalized); else fallbackSet('jk_phase19_replays', cache.replays);
    await queueCloud('replay',normalized.replayId,normalized); await appendEvent({ type: 'replay_saved', sessionId: normalized.sessionId, questionId: normalized.questionId, conceptId: normalized.conceptId, methodScore: normalized.assessment && normalized.assessment.total, payload: { replayId: normalized.replayId, attemptNo: normalized.attemptNo, strokeCount: normalized.rawStrokes.length, markCount: normalized.detectedMarks.length } });
    return clone(normalized);
  }

  async function listInterventions(options = {}) {
    let list = Object.values(cache.interventions);
    if (options.learnerId) list = list.filter(x => x.learnerId === options.learnerId);
    if (options.status) list = list.filter(x => x.status === options.status);
    return clone(list.sort((a, b) => a.priority - b.priority || Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0) || a.interventionId.localeCompare(b.interventionId)));
  }

  async function reconcileInterventions(proposals = []) {
    const incoming = proposals.map(normalizeIntervention);
    const incomingSignatures = new Set(incoming.map(x => x.signature));
    for (const old of Object.values(cache.interventions)) {
      if (old.status === 'auto_pending' && !incomingSignatures.has(old.signature)) {
        const resolved = normalizeIntervention({ ...old, status: 'auto_resolved', teacherNote: old.teacherNote || '규칙 재계산에서 자동 조건이 해소되었습니다.', updatedAt: nowIso() });
        cache.interventions[resolved.interventionId] = resolved;
        if (mode === 'indexeddb') await idbPut(STORE_INTERVENTIONS, resolved); await queueCloud('intervention',resolved.interventionId,resolved);
      }
    }
    for (const item of incoming) {
      const existing = cache.interventions[item.interventionId] || Object.values(cache.interventions).find(x => x.signature === item.signature);
      const keepStatus = existing && ['approved', 'held', 'dismissed', 'teacher_assigned', 'completed'].includes(existing.status);
      const merged = normalizeIntervention({ ...existing, ...item, status: keepStatus ? existing.status : item.status, teacherNote: existing && existing.teacherNote || item.teacherNote, createdAt: existing && existing.createdAt || item.createdAt, updatedAt: nowIso(), occurrenceCount: Math.max(Number(existing && existing.occurrenceCount || 0), Number(item.occurrenceCount || 0)), evidenceEventIds: [...new Set([...(existing && existing.evidenceEventIds || []), ...(item.evidenceEventIds || [])])].sort() });
      cache.interventions[merged.interventionId] = merged;
      if (mode === 'indexeddb') await idbPut(STORE_INTERVENTIONS, merged); await queueCloud('intervention',merged.interventionId,merged);
    }
    if (mode !== 'indexeddb') fallbackSet('jk_phase19_interventions', cache.interventions);
    return listInterventions();
  }

  async function ensureAssignmentForIntervention(intervention, direct = false) {
    let assignment = Object.values(cache.assignments).find(x => x.interventionId === intervention.interventionId && !['completed', 'cancelled'].includes(x.status));
    if (!assignment) assignment = normalizeAssignment({ interventionId: intervention.interventionId, learnerId: intervention.learnerId, questionId: intervention.questionId, conceptId: intervention.conceptId, sourceRef: intervention.sourceRef, recommendedAction: intervention.recommendedAction, baselineMethodScore: intervention.latestMethodScore, baselineFullyCorrect: false, assignedBy: direct ? 'teacher-direct' : 'teacher' });
    cache.assignments[assignment.assignmentId] = assignment;
    if (mode === 'indexeddb') await idbPut(STORE_ASSIGNMENTS, assignment); else fallbackSet('jk_phase19_assignments', cache.assignments);
    await queueCloud('assignment',assignment.assignmentId,assignment); return assignment;
  }

  async function updateInterventionStatus(interventionId, status, teacherNote = '') {
    const allowed = ['auto_pending', 'approved', 'held', 'dismissed', 'teacher_assigned', 'completed'];
    if (!allowed.includes(status)) throw new Error(`지원하지 않는 처방 상태입니다: ${status}`);
    const old = cache.interventions[interventionId]; if (!old) throw new Error('처방을 찾을 수 없습니다.');
    const item = normalizeIntervention({ ...old, status, teacherNote, updatedAt: nowIso() }); cache.interventions[item.interventionId] = item;
    if (mode === 'indexeddb') await idbPut(STORE_INTERVENTIONS, item); else fallbackSet('jk_phase19_interventions', cache.interventions);
    await queueCloud('intervention',item.interventionId,item); let assignment = null;
    if (status === 'approved' || status === 'teacher_assigned') assignment = await ensureAssignmentForIntervention(item, status === 'teacher_assigned');
    if (status === 'held' || status === 'dismissed') {
      for (const a of Object.values(cache.assignments)) if (a.interventionId === interventionId && !['completed', 'cancelled'].includes(a.status)) { const na = normalizeAssignment({ ...a, status: status === 'held' ? 'held' : 'cancelled', updatedAt: nowIso() }); cache.assignments[na.assignmentId] = na; if (mode === 'indexeddb') await idbPut(STORE_ASSIGNMENTS, na); await queueCloud('assignment',na.assignmentId,na); }
      if (mode !== 'indexeddb') fallbackSet('jk_phase19_assignments', cache.assignments);
    }
    return { intervention: clone(item), assignment: clone(assignment) };
  }

  async function createManualAssignment(spec = {}) {
    if (!spec.questionId || !spec.conceptId || !spec.sourceRef) throw new Error('직접 배정에는 questionId, conceptId, sourceRef가 필요합니다.');
    const signature = `MANUAL|${spec.learnerId || cache.settings.learnerLocalId}|${spec.questionId}|${spec.recommendedAction || '원문 재도전'}|${Date.now()}`;
    const item = normalizeIntervention({ interventionId: uid('intv-manual'), signature, learnerId: spec.learnerId || cache.settings.learnerLocalId, ruleId: 'MANUAL_TEACHER_ASSIGNMENT', ruleName: '교사 직접 배정', priority: spec.priority || 3, conceptId: spec.conceptId, questionId: spec.questionId, sourceRef: spec.sourceRef, recommendedAction: spec.recommendedAction || '원문 재도전', reason: spec.reason || '교사가 직접 배정했습니다.', status: 'teacher_assigned', teacherNote: spec.teacherNote || '' });
    cache.interventions[item.interventionId] = item; if (mode === 'indexeddb') await idbPut(STORE_INTERVENTIONS, item); else fallbackSet('jk_phase19_interventions', cache.interventions);
    await queueCloud('intervention',item.interventionId,item); const assignment = await ensureAssignmentForIntervention(item, true); return { intervention: clone(item), assignment: clone(assignment) };
  }

  async function listAssignments(options = {}) {
    let list = Object.values(cache.assignments);
    if (options.learnerId) list = list.filter(x => x.learnerId === options.learnerId);
    if (options.status) list = list.filter(x => x.status === options.status);
    return clone(list.sort((a, b) => Date.parse(b.assignedAt || 0) - Date.parse(a.assignedAt || 0)));
  }
  async function getAssignment(assignmentId) { return clone(cache.assignments[assignmentId] || null); }
  async function startAssignment(assignmentId, sessionId = null) {
    const old = cache.assignments[assignmentId]; if (!old) throw new Error('배정 과제를 찾을 수 없습니다.');
    const item = normalizeAssignment({ ...old, status: 'in_progress', startedAt: old.startedAt || nowIso(), startSessionId: sessionId || old.startSessionId, updatedAt: nowIso() }); cache.assignments[item.assignmentId] = item;
    if (mode === 'indexeddb') await idbPut(STORE_ASSIGNMENTS, item); else fallbackSet('jk_phase19_assignments', cache.assignments); await queueCloud('assignment',item.assignmentId,item); return clone(item);
  }
  async function completeAssignment(assignmentId, result = {}) {
    const old = cache.assignments[assignmentId]; if (!old) throw new Error('배정 과제를 찾을 수 없습니다.');
    const fullyCorrect = Boolean(result.answerCorrect) && result.methodPass !== false;
    const item = normalizeAssignment({ ...old, status: fullyCorrect ? 'completed' : 'in_progress', completedAt: fullyCorrect ? nowIso() : null, resultMethodScore: result.methodScore, recovered: fullyCorrect, resultEventId: result.eventId || null, attemptsAfterAssignment: Number(old.attemptsAfterAssignment || 0) + 1, updatedAt: nowIso() }); cache.assignments[item.assignmentId] = item;
    if (mode === 'indexeddb') await idbPut(STORE_ASSIGNMENTS, item); else fallbackSet('jk_phase19_assignments', cache.assignments); await queueCloud('assignment',item.assignmentId,item);
    if (fullyCorrect && item.interventionId && cache.interventions[item.interventionId]) { const iv = normalizeIntervention({ ...cache.interventions[item.interventionId], status: 'completed', updatedAt: nowIso() }); cache.interventions[iv.interventionId] = iv; if (mode === 'indexeddb') await idbPut(STORE_INTERVENTIONS, iv); else fallbackSet('jk_phase19_interventions', cache.interventions); await queueCloud('intervention',iv.interventionId,iv); }
    return clone(item);
  }

  async function saveDailyPlan(plan) { const item=normalizeDailyPlan(plan); cache.dailyPlans[item.dayId]=item; if(mode==='indexeddb') await idbPut(STORE_DAILY_PLANS,item); else fallbackSet('jk_phase19_daily_plans',cache.dailyPlans); await queueCloud('dailyPlan',item.dayId,item); return clone(item); }
  async function getDailyPlan(dayId=localDateId()) { return clone(cache.dailyPlans[dayId] || null); }
  async function listDailyPlans() { return clone(Object.values(cache.dailyPlans).sort((a,b)=>b.date.localeCompare(a.date))); }
  async function saveDailyReport(report) { const item=normalizeDailyReport(report); cache.dailyReports[item.dayId]=item; if(mode==='indexeddb') await idbPut(STORE_DAILY_REPORTS,item); else fallbackSet('jk_phase19_daily_reports',cache.dailyReports); await queueCloud('dailyReport',item.dayId,item); return clone(item); }
  async function getDailyReport(dayId=localDateId()) { return clone(cache.dailyReports[dayId] || null); }
  async function listDailyReports() { return clone(Object.values(cache.dailyReports).sort((a,b)=>b.date.localeCompare(a.date))); }
  async function saveAdaptiveRecommendation(spec={}) { const item=normalizeAdaptiveRecommendation(spec); const same=Object.values(cache.adaptiveRecommendations).find(x=>x.determinismKey&&x.determinismKey===item.determinismKey); const saved=same?normalizeAdaptiveRecommendation({...same,...item,recommendationId:same.recommendationId,status:same.status,createdAt:same.createdAt,updatedAt:nowIso()}):item; cache.adaptiveRecommendations[saved.recommendationId]=saved; if(mode==='indexeddb')await idbPut(STORE_ADAPTIVE_RECOMMENDATIONS,saved);else fallbackSet('jk_phase19_adaptive_recommendations',cache.adaptiveRecommendations); await queueCloud('adaptiveRecommendation',saved.recommendationId,saved); return clone(saved); }
  async function listAdaptiveRecommendations(options={}) { let list=Object.values(cache.adaptiveRecommendations); if(options.status)list=list.filter(x=>x.status===options.status); return clone(list.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))); }
  async function updateAdaptiveRecommendation(recommendationId,status,teacherNote='') { const old=cache.adaptiveRecommendations[recommendationId]; if(!old)throw new Error('적응형 추천을 찾을 수 없습니다.'); if(!['pending_admin','approved','dismissed','applied','superseded'].includes(status))throw new Error('지원하지 않는 추천 상태입니다.'); const stamp=nowIso(); const item=normalizeAdaptiveRecommendation({...old,status,teacherNote,approvedAt:status==='approved'?stamp:old.approvedAt,dismissedAt:status==='dismissed'?stamp:old.dismissedAt,appliedAt:status==='applied'?stamp:old.appliedAt,updatedAt:stamp}); cache.adaptiveRecommendations[item.recommendationId]=item; if(mode==='indexeddb')await idbPut(STORE_ADAPTIVE_RECOMMENDATIONS,item);else fallbackSet('jk_phase19_adaptive_recommendations',cache.adaptiveRecommendations); await queueCloud('adaptiveRecommendation',item.recommendationId,item); return clone(item); }
  async function saveTrendSnapshot(spec={}) { const item=normalizeTrendSnapshot(spec); cache.trendSnapshots[item.trendId]=item; if(mode==='indexeddb')await idbPut(STORE_TREND_SNAPSHOTS,item);else fallbackSet('jk_phase19_trend_snapshots',cache.trendSnapshots); await queueCloud('trendSnapshot',item.trendId,item); return clone(item); }
  async function listTrendSnapshots(options={}) { let list=Object.values(cache.trendSnapshots); if(options.periodDays)list=list.filter(x=>x.periodDays===Number(options.periodDays)); return clone(list.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))); }
  async function registerDevice(spec={}) { const item=normalizeDevice({...(cache.devices[spec.deviceId || cache.settings.deviceId]||{}),...spec,deviceId:spec.deviceId||cache.settings.deviceId}); cache.devices[item.deviceId]=item; cache.settings.deviceId=item.deviceId; cache.settings.lastRole=item.role; if(mode==='indexeddb'){await idbPut(STORE_DEVICES,item);await idbPut(STORE_STATE,{key:'settings',value:cache.settings,updatedAt:nowIso()});}else{fallbackSet('jk_phase19_devices',cache.devices);fallbackSet('jk_phase19_settings',cache.settings);} mirrorCloudAuthConfig(); await queueCloud('device',item.deviceId,item); return clone(item); }
  async function listDevices(){return clone(Object.values(cache.devices).sort((a,b)=>Date.parse(b.lastSeenAt)-Date.parse(a.lastSeenAt)));}
  async function queueSync(spec={}) { const item=normalizeSyncOp(spec); cache.syncQueue[item.opId]=item; if(mode==='indexeddb') await idbPut(STORE_SYNC_QUEUE,item); else fallbackSet('jk_phase19_sync_queue',cache.syncQueue); return clone(item); }
  async function listSyncQueue(options={}) { let list=Object.values(cache.syncQueue); if(options.status)list=list.filter(x=>x.status===options.status); return clone(list.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt))); }
  async function updateSyncOp(opId,patch={}) { const old=cache.syncQueue[opId]; if(!old)return null; const item=normalizeSyncOp({...old,...patch,updatedAt:nowIso()}); cache.syncQueue[opId]=item; if(mode==='indexeddb')await idbPut(STORE_SYNC_QUEUE,item);else fallbackSet('jk_phase19_sync_queue',cache.syncQueue); return clone(item); }
  async function saveQualityApproval(spec={}) { const item=normalizeQualityApproval(spec); cache.qualityApprovals[item.approvalId]=item; if(mode==='indexeddb')await idbPut(STORE_QUALITY_APPROVALS,item);else fallbackSet('jk_phase26_quality_approvals',cache.qualityApprovals); await queueCloud('qualityApproval',item.approvalId,item); return clone(item); }
  async function listQualityApprovals(options={}) { let rows=Object.values(cache.qualityApprovals); if(options.status)rows=rows.filter(x=>x.status===options.status); return clone(rows.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))); }
  async function saveBankSnapshot(spec={}) { const item=normalizeBankSnapshot(spec); cache.bankSnapshots[item.snapshotId]=item; if(mode==='indexeddb')await idbPut(STORE_BANK_SNAPSHOTS,item);else fallbackSet('jk_phase26_bank_snapshots',cache.bankSnapshots); await queueCloud('bankSnapshot',item.snapshotId,item); return clone(item); }
  async function listBankSnapshots(options={}) { let rows=Object.values(cache.bankSnapshots); if(options.kind)rows=rows.filter(x=>x.kind===options.kind); return clone(rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))); }
  async function getBankSnapshot(snapshotId) { return clone(cache.bankSnapshots[snapshotId]||null); }
  async function saveBaselineRun(spec={}) { const item=normalizeBaselineRun(spec); cache.baselineRuns[item.baselineId]=item; if(mode==='indexeddb')await idbPut(STORE_BASELINE_RUNS,item);else fallbackSet('jk_phase26_baseline_runs',cache.baselineRuns); await queueCloud('baselineRun',item.baselineId,item); return clone(item); }
  async function getBaselineRun(baselineId='single-learner-first-7-days') { return clone(cache.baselineRuns[baselineId]||null); }
  async function listBaselineRuns() { return clone(Object.values(cache.baselineRuns).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))); }
  async function saveDifficultyProposalSet(spec={}) { const item=normalizeDifficultyProposalSet(spec); cache.difficultyProposals[item.proposalSetId]=item; if(mode==='indexeddb')await idbPut(STORE_DIFFICULTY_PROPOSALS,item);else fallbackSet('jk_phase26_difficulty_proposals',cache.difficultyProposals); await queueCloud('difficultyProposalSet',item.proposalSetId,item); return clone(item); }
  async function listDifficultyProposalSets(options={}) { let rows=Object.values(cache.difficultyProposals); if(options.status)rows=rows.filter(x=>x.status===options.status); return clone(rows.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))); }
  async function appendApprovalAudit(spec={}) { const item=normalizeApprovalAudit(spec); cache.approvalAudit[item.auditId]=item; if(mode==='indexeddb')await idbPut(STORE_APPROVAL_AUDIT,item);else fallbackSet('jk_phase26_approval_audit',cache.approvalAudit); await queueCloud('approvalAudit',item.auditId,item); return clone(item); }
  async function listApprovalAudit(options={}) { let rows=Object.values(cache.approvalAudit); if(options.type)rows=rows.filter(x=>x.type===options.type); if(options.entityId)rows=rows.filter(x=>x.entityId===options.entityId); return clone(rows.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))); }
  async function savePersonalDifficultyProfile(spec={}) { const payload=spec.payload||spec; const item=normalizePersonalDifficultyProfile({...spec,profileId:spec.profileId||payload.profileId,status:spec.status||payload.status,actualLearnerDataUsed:spec.actualLearnerDataUsed??payload.actualLearnerDataUsed,approvedAt:spec.approvedAt||payload.approvedAt,appliedAt:spec.appliedAt||payload.appliedAt}); cache.personalDifficultyProfiles[item.profileId]=item; if(['ACTIVE_STABILIZING','STABLE'].includes(payload.status)){cache.settings.activeDifficultyProfileId=item.profileId;try{localStorage.setItem('jk_phase27_active_difficulty_profile',JSON.stringify(payload));}catch(_){}} else if(cache.settings.activeDifficultyProfileId===item.profileId){cache.settings.activeDifficultyProfileId=null;} cache.settings.updatedAt=nowIso(); if(mode==='indexeddb'){await idbPut(STORE_PERSONAL_DIFFICULTY_PROFILES,item);await idbPut(STORE_STATE,{key:'settings',value:cache.settings,updatedAt:cache.settings.updatedAt});}else{fallbackSet('jk_phase27_personal_difficulty_profiles',cache.personalDifficultyProfiles);fallbackSet('jk_phase19_settings',cache.settings);} await queueCloud('personalDifficultyProfile',item.profileId,item); return clone(item); }
  async function getPersonalDifficultyProfile(profileId=cache.settings.activeDifficultyProfileId) { return clone(cache.personalDifficultyProfiles[profileId]||null); }
  async function listPersonalDifficultyProfiles(options={}) { let rows=Object.values(cache.personalDifficultyProfiles); if(options.status)rows=rows.filter(x=>x.status===options.status); return clone(rows.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))); }
  async function saveDifficultyApplication(spec={}) { const payload=spec.payload||spec; const item=normalizeDifficultyApplication({...spec,applicationId:spec.applicationId||payload.applicationId,profileId:spec.profileId||payload.profileId,status:spec.status||payload.status,appliedAt:spec.appliedAt||payload.appliedAt}); cache.difficultyApplications[item.applicationId]=item; if(['ACTIVE_STABILIZING','STABLE'].includes(payload.status))cache.settings.activeDifficultyApplicationId=item.applicationId;else if(cache.settings.activeDifficultyApplicationId===item.applicationId)cache.settings.activeDifficultyApplicationId=null; cache.settings.updatedAt=nowIso(); if(mode==='indexeddb'){await idbPut(STORE_DIFFICULTY_APPLICATIONS,item);await idbPut(STORE_STATE,{key:'settings',value:cache.settings,updatedAt:cache.settings.updatedAt});}else{fallbackSet('jk_phase27_difficulty_applications',cache.difficultyApplications);fallbackSet('jk_phase19_settings',cache.settings);} await queueCloud('difficultyApplication',item.applicationId,item); return clone(item); }
  async function getDifficultyApplication(applicationId=cache.settings.activeDifficultyApplicationId) { return clone(cache.difficultyApplications[applicationId]||null); }
  async function listDifficultyApplications(options={}) { let rows=Object.values(cache.difficultyApplications); if(options.status)rows=rows.filter(x=>x.status===options.status); return clone(rows.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))); }
  async function saveStabilityObservation(spec={}) { const payload=spec.payload||spec; const item=normalizeStabilityObservation({...spec,observationId:spec.observationId||payload.observationId,applicationId:spec.applicationId||payload.applicationId,status:spec.status||payload.status,asOf:spec.asOf||payload.asOf}); cache.stabilityObservations[item.observationId]=item; if(mode==='indexeddb')await idbPut(STORE_STABILITY_OBSERVATIONS,item);else fallbackSet('jk_phase27_stability_observations',cache.stabilityObservations); await queueCloud('stabilityObservation',item.observationId,item); return clone(item); }
  async function listStabilityObservations(options={}) { let rows=Object.values(cache.stabilityObservations); if(options.applicationId)rows=rows.filter(x=>x.applicationId===options.applicationId); if(options.status)rows=rows.filter(x=>x.status===options.status); return clone(rows.sort((a,b)=>Date.parse(b.asOf)-Date.parse(a.asOf))); }
  async function saveRegressionAlert(spec={}) { const payload=spec.payload||spec; const item=normalizeRegressionAlert({...spec,alertId:spec.alertId||payload.alertId,applicationId:spec.applicationId||payload.applicationId,status:spec.status||payload.status}); cache.regressionAlerts[item.alertId]=item; if(mode==='indexeddb')await idbPut(STORE_REGRESSION_ALERTS,item);else fallbackSet('jk_phase27_regression_alerts',cache.regressionAlerts); await queueCloud('regressionAlert',item.alertId,item); return clone(item); }
  async function listRegressionAlerts(options={}) { let rows=Object.values(cache.regressionAlerts); if(options.applicationId)rows=rows.filter(x=>x.applicationId===options.applicationId); if(options.status)rows=rows.filter(x=>x.status===options.status); return clone(rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))); }
  async function updateRegressionAlert(alertId,status,note='') { const old=cache.regressionAlerts[alertId]; if(!old)throw new Error('회귀 알림을 찾을 수 없습니다.'); const payload={...(old.payload||old),status,note,updatedAt:nowIso()}; return saveRegressionAlert({...old,status,payload,updatedAt:payload.updatedAt}); }

  async function listSessions(options = {}) {
    let sessions = Object.values(cache.sessions);
    if (options.from) sessions = sessions.filter(x => Date.parse(x.startedAt) >= Date.parse(options.from));
    if (options.to) sessions = sessions.filter(x => Date.parse(x.startedAt) <= Date.parse(options.to));
    return clone(sessions.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)));
  }

  async function getEvents(options = {}) {
    let events = cache.events;
    if (options.sessionId) events = events.filter(x => x.sessionId === options.sessionId);
    if (options.questionId) events = events.filter(x => x.questionId === options.questionId);
    if (options.from) events = events.filter(x => Date.parse(x.timestamp) >= Date.parse(options.from));
    if (options.to) events = events.filter(x => Date.parse(x.timestamp) <= Date.parse(options.to));
    return clone(events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.sequence - b.sequence));
  }

  async function getReplay(replayId) { return clone(cache.replays[replayId] || null); }
  async function listReplays(options = {}) {
    let list = Object.values(cache.replays);
    if (options.sessionId) list = list.filter(x => x.sessionId === options.sessionId);
    if (options.questionId) list = list.filter(x => x.questionId === options.questionId);
    return clone(list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }
  async function getDiagnosticBundle(options = {}) { return { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, sessions: await listSessions(options), events: await getEvents(options), replays: await listReplays(options), interventions: await listInterventions(options), assignments: await listAssignments(options), dailyPlans: await listDailyPlans(), dailyReports: await listDailyReports(), devices: await listDevices(), syncQueue: await listSyncQueue(), adaptiveRecommendations:await listAdaptiveRecommendations(), trendSnapshots:await listTrendSnapshots(), qualityApprovals:await listQualityApprovals(), bankSnapshots:await listBankSnapshots(), baselineRuns:await listBaselineRuns(), difficultyProposals:await listDifficultyProposalSets(), approvalAudit:await listApprovalAudit(), personalDifficultyProfiles:await listPersonalDifficultyProfiles(), difficultyApplications:await listDifficultyApplications(), stabilityObservations:await listStabilityObservations(), regressionAlerts:await listRegressionAlerts() }; }

  async function deleteSessionData(options = {}) {
    const from = options.from ? Date.parse(options.from) : -Infinity, to = options.to ? Date.parse(options.to) : Infinity;
    const ids = new Set(Object.values(cache.sessions).filter(s => { const t = Date.parse(s.startedAt); return t >= from && t <= to; }).map(s => s.sessionId));
    for (const id of ids) delete cache.sessions[id];
    cache.events = cache.events.filter(e => !ids.has(e.sessionId));
    for (const [id, replay] of Object.entries(cache.replays)) if (ids.has(replay.sessionId)) delete cache.replays[id];
    if (mode === 'indexeddb') {
      // Read candidate keys before opening the write transaction. Awaiting getAll()
      // inside a readwrite transaction can let browsers auto-commit the transaction.
      const [allEvents, allReplays] = await Promise.all([
        idbGetAll(STORE_EVENTS),
        idbGetAll(STORE_REPLAYS)
      ]);
      const tx = db.transaction([STORE_SESSIONS, STORE_EVENTS, STORE_REPLAYS], 'readwrite');
      const ss = tx.objectStore(STORE_SESSIONS), es = tx.objectStore(STORE_EVENTS), rs = tx.objectStore(STORE_REPLAYS);
      for (const id of ids) ss.delete(id);
      for (const event of allEvents) if (ids.has(event.sessionId)) es.delete(event.eventId);
      for (const replay of allReplays) if (ids.has(replay.sessionId)) rs.delete(replay.replayId);
      await transactionDone(tx);
    } else { fallbackSet('jk_phase19_sessions', cache.sessions); fallbackSet('jk_phase19_events', cache.events); fallbackSet('jk_phase19_replays', cache.replays); }
    return { deletedSessions: ids.size };
  }
  async function clearSessionData() { return deleteSessionData({}); }

  function buildBackup(reason = 'manual') {
    return { format: 'JK_ENG_BACKUP', appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, createdAt: nowIso(), reason,
      data: { progress: clone(cache.progress), ink: clone(cache.ink), profiles: clone(cache.profiles), settings: safeSettings(), metadata: clone(cache.metadata), sessions: clone(cache.sessions), events: clone(cache.events), replays: clone(cache.replays), interventions: clone(cache.interventions), assignments: clone(cache.assignments), dailyPlans: clone(cache.dailyPlans), dailyReports: clone(cache.dailyReports), devices: clone(cache.devices), syncQueue: clone(cache.syncQueue), adaptiveRecommendations:clone(cache.adaptiveRecommendations), trendSnapshots:clone(cache.trendSnapshots), qualityApprovals:clone(cache.qualityApprovals), bankSnapshots:clone(cache.bankSnapshots), baselineRuns:clone(cache.baselineRuns), difficultyProposals:clone(cache.difficultyProposals), approvalAudit:clone(cache.approvalAudit), personalDifficultyProfiles:clone(cache.personalDifficultyProfiles), difficultyApplications:clone(cache.difficultyApplications), stabilityObservations:clone(cache.stabilityObservations), regressionAlerts:clone(cache.regressionAlerts) } };
  }

  function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportBackup(options = {}) { const payload = buildBackup(options.reason || 'manual-export'); if (options.download !== false) downloadJson(payload, `JK_ENG_backup_v21_${payload.createdAt.replace(/[:.]/g, '-')}.json`); return payload; }

  function migrateBackupPayload(input) {
    if (!input || typeof input !== 'object') throw new Error('백업 파일이 JSON 객체가 아닙니다.');
    const sourceSchema = Number(input.schemaVersion || (input.data && input.data.schemaVersion) || 14);
    if (sourceSchema > SCHEMA_VERSION) throw new Error(`현재 앱보다 새로운 스키마(${sourceSchema})의 백업입니다.`);
    if (input.format === 'JK_ENG_BACKUP' && sourceSchema === SCHEMA_VERSION) return clone(input);
    if (sourceSchema <= 20) {
      const sourceData = input.data && typeof input.data === 'object' ? input.data : input;
      const profile = defaultProfile({ calibrationStatus: 'migrated-default', calibratedAt: null, createdAt: input.createdAt || nowIso() });
      return { format: 'JK_ENG_BACKUP', appVersion: String(input.appVersion || `${sourceSchema}.0`), schemaVersion: SCHEMA_VERSION, migratedFromSchema: sourceSchema, createdAt: input.createdAt || nowIso(), reason: input.reason || 'legacy-import',
        data: {
          progress: normalizeProgress(sourceData.progress || sourceData), ink: normalizeInkMap(sourceData.ink || sourceData.inkDB || {}),
          profiles: sourceData.profiles && typeof sourceData.profiles === 'object' ? sourceData.profiles : { default: profile },
          settings: { ...cache.settings, ...(sourceData.settings || {}), activeProfileId: (sourceData.settings && sourceData.settings.activeProfileId) || 'default', schemaVersion: SCHEMA_VERSION },
          metadata: { ...cache.metadata, ...(sourceData.metadata || {}), importedFromSchema: sourceSchema, importedAt: nowIso() },
          sessions: sourceData.sessions && typeof sourceData.sessions === 'object' ? sourceData.sessions : {},
          events: Array.isArray(sourceData.events) ? sourceData.events : [], replays: sourceData.replays && typeof sourceData.replays === 'object' ? sourceData.replays : {},
          interventions: sourceData.interventions && typeof sourceData.interventions === 'object' ? sourceData.interventions : {}, assignments: sourceData.assignments && typeof sourceData.assignments === 'object' ? sourceData.assignments : {}, dailyPlans: sourceData.dailyPlans && typeof sourceData.dailyPlans === 'object' ? sourceData.dailyPlans : {}, dailyReports: sourceData.dailyReports && typeof sourceData.dailyReports === 'object' ? sourceData.dailyReports : {}, devices: sourceData.devices && typeof sourceData.devices === 'object' ? sourceData.devices : {}, syncQueue: sourceData.syncQueue && typeof sourceData.syncQueue === 'object' ? sourceData.syncQueue : {}, adaptiveRecommendations:sourceData.adaptiveRecommendations&&typeof sourceData.adaptiveRecommendations==='object'?sourceData.adaptiveRecommendations:{}, trendSnapshots:sourceData.trendSnapshots&&typeof sourceData.trendSnapshots==='object'?sourceData.trendSnapshots:{}, qualityApprovals:sourceData.qualityApprovals&&typeof sourceData.qualityApprovals==='object'?sourceData.qualityApprovals:{}, bankSnapshots:sourceData.bankSnapshots&&typeof sourceData.bankSnapshots==='object'?sourceData.bankSnapshots:{}, baselineRuns:sourceData.baselineRuns&&typeof sourceData.baselineRuns==='object'?sourceData.baselineRuns:{}, difficultyProposals:sourceData.difficultyProposals&&typeof sourceData.difficultyProposals==='object'?sourceData.difficultyProposals:{}, approvalAudit:sourceData.approvalAudit&&typeof sourceData.approvalAudit==='object'?sourceData.approvalAudit:{}, personalDifficultyProfiles:sourceData.personalDifficultyProfiles&&typeof sourceData.personalDifficultyProfiles==='object'?sourceData.personalDifficultyProfiles:{}, difficultyApplications:sourceData.difficultyApplications&&typeof sourceData.difficultyApplications==='object'?sourceData.difficultyApplications:{}, stabilityObservations:sourceData.stabilityObservations&&typeof sourceData.stabilityObservations==='object'?sourceData.stabilityObservations:{}, regressionAlerts:sourceData.regressionAlerts&&typeof sourceData.regressionAlerts==='object'?sourceData.regressionAlerts:{}
        } };
    }
    throw new Error(`지원하지 않는 백업 스키마입니다: ${sourceSchema}`);
  }

  function validateBackup(input) {
    const errors = [], warnings = []; let migrated = null;
    try {
      migrated = migrateBackupPayload(input); const d = migrated.data;
      if (migrated.format !== 'JK_ENG_BACKUP') errors.push('백업 형식 식별자가 없습니다.');
      if (Number(migrated.schemaVersion) !== SCHEMA_VERSION) errors.push('스키마 변환에 실패했습니다.');
      if (!d || typeof d !== 'object') errors.push('data 영역이 없습니다.');
      if (!d.progress || typeof d.progress !== 'object') errors.push('진도 데이터가 없습니다.');
      if (!d.ink || typeof d.ink !== 'object') errors.push('필기 데이터가 없습니다.');
      if (!d.profiles || typeof d.profiles !== 'object') errors.push('펜 프로필 데이터가 없습니다.');
      if (!d.sessions || typeof d.sessions !== 'object') errors.push('세션 데이터가 없습니다.');
      if (!Array.isArray(d.events)) errors.push('이벤트 로그가 배열이 아닙니다.');
      if (!d.replays || typeof d.replays !== 'object') errors.push('리플레이 데이터가 없습니다.');
      if (!d.interventions || typeof d.interventions !== 'object') errors.push('처방 데이터가 없습니다.');
      if (!d.assignments || typeof d.assignments !== 'object') errors.push('배정 데이터가 없습니다.');
      if (!d.dailyPlans || typeof d.dailyPlans !== 'object') errors.push('Day 계획 데이터가 없습니다.');
      if (!d.dailyReports || typeof d.dailyReports !== 'object') errors.push('일일 진단 데이터가 없습니다.');
      if (!d.devices || typeof d.devices !== 'object') errors.push('기기 데이터가 없습니다.');
      if (!d.syncQueue || typeof d.syncQueue !== 'object') errors.push('동기화 대기열 데이터가 없습니다.');
      if (!d.adaptiveRecommendations || typeof d.adaptiveRecommendations !== 'object') errors.push('적응형 추천 데이터가 없습니다.');
      if (!d.trendSnapshots || typeof d.trendSnapshots !== 'object') errors.push('추세 스냅샷 데이터가 없습니다.');
      if (!d.qualityApprovals || typeof d.qualityApprovals !== 'object') errors.push('문항 품질 승인 데이터가 없습니다.');
      if (!d.bankSnapshots || typeof d.bankSnapshots !== 'object') errors.push('문제은행 스냅샷 데이터가 없습니다.');
      if (!d.baselineRuns || typeof d.baselineRuns !== 'object') errors.push('7일 기준선 데이터가 없습니다.');
      if (!d.difficultyProposals || typeof d.difficultyProposals !== 'object') errors.push('개인 난이도 제안 데이터가 없습니다.');
      if (!d.approvalAudit || typeof d.approvalAudit !== 'object') errors.push('승인 감사 이력 데이터가 없습니다.');
      if (!d.personalDifficultyProfiles || typeof d.personalDifficultyProfiles !== 'object') errors.push('개인 난이도 프로필 데이터가 없습니다.');
      if (!d.difficultyApplications || typeof d.difficultyApplications !== 'object') errors.push('개인 난이도 적용 데이터가 없습니다.');
      if (!d.stabilityObservations || typeof d.stabilityObservations !== 'object') errors.push('안정화 관찰 데이터가 없습니다.');
      if (!d.regressionAlerts || typeof d.regressionAlerts !== 'object') errors.push('회귀 감지 알림 데이터가 없습니다.');
      const sessionIds = new Set(Object.keys(d.sessions || {}));
      for (const e of d.events || []) { if (!e.sessionId || (!sessionIds.has(e.sessionId) && Object.keys(d.sessions || {}).length)) errors.push(`이벤트 세션 참조 오류: ${e.eventId || '?'}`); if (e.type && !EVENT_TYPES.has(e.type)) errors.push(`지원하지 않는 이벤트 유형: ${e.type}`); }
      if (migrated.migratedFromSchema) warnings.push(`스키마 ${migrated.migratedFromSchema} 백업을 스키마 21로 변환합니다.`);
    } catch (error) { errors.push(error.message || String(error)); }
    return { ok: errors.length === 0, errors, warnings, migrated };
  }

  function mergeCounterMaps(a = {}, b = {}) { const out = { ...a }; for (const [key, value] of Object.entries(b)) out[key] = Math.max(Number(out[key] || 0), Number(value || 0)); return out; }
  function mergeMethodMaps(a = {}, b = {}) { const out = clone(a) || {}; for (const [key, value] of Object.entries(b)) { const old = out[key] || {}; out[key] = { ...old, ...value, best: Math.max(Number(old.best || 0), Number(value.best || value.last || 0)), attempts: Math.max(Number(old.attempts || 0), Number(value.attempts || 0)), last: Number(value.last != null ? value.last : old.last || 0) }; } return out; }
  function mergeProgress(a, b) { return { wrong: mergeCounterMaps(a.wrong, b.wrong), correct: mergeCounterMaps(a.correct, b.correct), methodGap: mergeCounterMaps(a.methodGap, b.methodGap), errorCodes: mergeCounterMaps(a.errorCodes, b.errorCodes), method: mergeMethodMaps(a.method, b.method) }; }
  function mergeTimedMap(a = {}, b = {}) { const out = clone(a) || {}; for (const [key, value] of Object.entries(b || {})) { const old = out[key]; if (!old || (Date.parse(value.updatedAt || value.createdAt || 0) || 0) >= (Date.parse(old.updatedAt || old.createdAt || 0) || 0)) out[key] = value; } return out; }

  async function persistWholeCache() {
    if (mode !== 'indexeddb') { fallbackSet('jk_phase19_progress_fallback', cache.progress); fallbackSet('jk_phase19_ink_fallback', cache.ink); fallbackSet('jk_phase19_settings',cache.settings); fallbackSet('jk_phase19_metadata',cache.metadata); fallbackSet('jk_phase19_profile',cache.profiles[cache.settings.activeProfileId]||defaultProfile()); fallbackSet('jk_phase19_sessions', cache.sessions); fallbackSet('jk_phase19_events', cache.events); fallbackSet('jk_phase19_replays', cache.replays); fallbackSet('jk_phase19_interventions', cache.interventions); fallbackSet('jk_phase19_assignments', cache.assignments); fallbackSet('jk_phase19_daily_plans',cache.dailyPlans); fallbackSet('jk_phase19_daily_reports',cache.dailyReports); fallbackSet('jk_phase19_devices',cache.devices); fallbackSet('jk_phase19_sync_queue',cache.syncQueue); fallbackSet('jk_phase19_adaptive_recommendations',cache.adaptiveRecommendations); fallbackSet('jk_phase19_trend_snapshots',cache.trendSnapshots); fallbackSet('jk_phase26_quality_approvals',cache.qualityApprovals); fallbackSet('jk_phase26_bank_snapshots',cache.bankSnapshots); fallbackSet('jk_phase26_baseline_runs',cache.baselineRuns); fallbackSet('jk_phase26_difficulty_proposals',cache.difficultyProposals); fallbackSet('jk_phase26_approval_audit',cache.approvalAudit); fallbackSet('jk_phase27_personal_difficulty_profiles',cache.personalDifficultyProfiles); fallbackSet('jk_phase27_difficulty_applications',cache.difficultyApplications); fallbackSet('jk_phase27_stability_observations',cache.stabilityObservations); fallbackSet('jk_phase27_regression_alerts',cache.regressionAlerts); return; }
    const tx = db.transaction([STORE_STATE, STORE_INK, STORE_PROFILES, STORE_SESSIONS, STORE_EVENTS, STORE_REPLAYS, STORE_INTERVENTIONS, STORE_ASSIGNMENTS, STORE_DAILY_PLANS, STORE_DAILY_REPORTS, STORE_DEVICES, STORE_SYNC_QUEUE, STORE_ADAPTIVE_RECOMMENDATIONS, STORE_TREND_SNAPSHOTS, STORE_QUALITY_APPROVALS, STORE_BANK_SNAPSHOTS, STORE_BASELINE_RUNS, STORE_DIFFICULTY_PROPOSALS, STORE_APPROVAL_AUDIT, STORE_PERSONAL_DIFFICULTY_PROFILES, STORE_DIFFICULTY_APPLICATIONS, STORE_STABILITY_OBSERVATIONS, STORE_REGRESSION_ALERTS], 'readwrite');
    const state = tx.objectStore(STORE_STATE), ink = tx.objectStore(STORE_INK), profiles = tx.objectStore(STORE_PROFILES), sessions = tx.objectStore(STORE_SESSIONS), events = tx.objectStore(STORE_EVENTS), replays = tx.objectStore(STORE_REPLAYS), interventions = tx.objectStore(STORE_INTERVENTIONS), assignments = tx.objectStore(STORE_ASSIGNMENTS), dailyPlans=tx.objectStore(STORE_DAILY_PLANS), dailyReports=tx.objectStore(STORE_DAILY_REPORTS), devices=tx.objectStore(STORE_DEVICES), syncQueue=tx.objectStore(STORE_SYNC_QUEUE), adaptiveRecommendations=tx.objectStore(STORE_ADAPTIVE_RECOMMENDATIONS), trendSnapshots=tx.objectStore(STORE_TREND_SNAPSHOTS), qualityApprovals=tx.objectStore(STORE_QUALITY_APPROVALS), bankSnapshots=tx.objectStore(STORE_BANK_SNAPSHOTS), baselineRuns=tx.objectStore(STORE_BASELINE_RUNS), difficultyProposals=tx.objectStore(STORE_DIFFICULTY_PROPOSALS), approvalAudit=tx.objectStore(STORE_APPROVAL_AUDIT), personalDifficultyProfiles=tx.objectStore(STORE_PERSONAL_DIFFICULTY_PROFILES), difficultyApplications=tx.objectStore(STORE_DIFFICULTY_APPLICATIONS), stabilityObservations=tx.objectStore(STORE_STABILITY_OBSERVATIONS), regressionAlerts=tx.objectStore(STORE_REGRESSION_ALERTS);
    state.put({ key: 'progress', value: cache.progress, updatedAt: nowIso() }); state.put({ key: 'settings', value: cache.settings, updatedAt: nowIso() }); state.put({ key: 'metadata', value: cache.metadata, updatedAt: nowIso() });
    ink.clear(); for (const [questionId, data] of Object.entries(cache.ink)) ink.put({ questionId, data, updatedAt: data.updatedAt || nowIso() });
    profiles.clear(); for (const profile of Object.values(cache.profiles)) profiles.put(profile);
    sessions.clear(); for (const session of Object.values(cache.sessions)) sessions.put(session);
    events.clear(); for (const event of cache.events) events.put(event);
    replays.clear(); for (const replay of Object.values(cache.replays)) replays.put(replay);
    interventions.clear(); for (const intervention of Object.values(cache.interventions)) interventions.put(intervention);
    assignments.clear(); for (const assignment of Object.values(cache.assignments)) assignments.put(assignment); dailyPlans.clear(); for(const item of Object.values(cache.dailyPlans)) dailyPlans.put(item); dailyReports.clear(); for(const item of Object.values(cache.dailyReports)) dailyReports.put(item); devices.clear(); for(const item of Object.values(cache.devices)) devices.put(item); syncQueue.clear(); for(const item of Object.values(cache.syncQueue)) syncQueue.put(item); adaptiveRecommendations.clear(); for(const item of Object.values(cache.adaptiveRecommendations)) adaptiveRecommendations.put(item); trendSnapshots.clear(); for(const item of Object.values(cache.trendSnapshots)) trendSnapshots.put(item); qualityApprovals.clear(); for(const item of Object.values(cache.qualityApprovals)) qualityApprovals.put(item); bankSnapshots.clear(); for(const item of Object.values(cache.bankSnapshots)) bankSnapshots.put(item); baselineRuns.clear(); for(const item of Object.values(cache.baselineRuns)) baselineRuns.put(item); difficultyProposals.clear(); for(const item of Object.values(cache.difficultyProposals)) difficultyProposals.put(item); approvalAudit.clear(); for(const item of Object.values(cache.approvalAudit)) approvalAudit.put(item); personalDifficultyProfiles.clear(); for(const item of Object.values(cache.personalDifficultyProfiles)) personalDifficultyProfiles.put(item); difficultyApplications.clear(); for(const item of Object.values(cache.difficultyApplications)) difficultyApplications.put(item); stabilityObservations.clear(); for(const item of Object.values(cache.stabilityObservations)) stabilityObservations.put(item); regressionAlerts.clear(); for(const item of Object.values(cache.regressionAlerts)) regressionAlerts.put(item);
    await transactionDone(tx);
  }

  async function importBackup(input, importMode = 'merge') {
    const check = validateBackup(input); if (!check.ok) throw new Error(check.errors.join('\n')); const data = check.migrated.data;
    const incomingSessions = Object.fromEntries(Object.entries(data.sessions || {}).map(([k, v]) => [k, normalizeSession({ ...v, sessionId: k })]));
    const incomingEvents = (data.events || []).map((e, i) => normalizeEvent(e, i));
    const incomingReplays = Object.fromEntries(Object.entries(data.replays || {}).map(([k, v]) => [k, normalizeReplay({ ...v, replayId: k })]));
    const incomingInterventions = Object.fromEntries(Object.entries(data.interventions || {}).map(([k, v]) => [k, normalizeIntervention({ ...v, interventionId: k })]));
    const incomingAssignments = Object.fromEntries(Object.entries(data.assignments || {}).map(([k, v]) => [k, normalizeAssignment({ ...v, assignmentId: k })]));
    const incomingDailyPlans=Object.fromEntries(Object.entries(data.dailyPlans||{}).map(([k,v])=>[k,normalizeDailyPlan({...v,dayId:k})])); const incomingDailyReports=Object.fromEntries(Object.entries(data.dailyReports||{}).map(([k,v])=>[k,normalizeDailyReport({...v,dayId:k})])); const incomingDevices=Object.fromEntries(Object.entries(data.devices||{}).map(([k,v])=>[k,normalizeDevice({...v,deviceId:k})])); const incomingSyncQueue=Object.fromEntries(Object.entries(data.syncQueue||{}).map(([k,v])=>[k,normalizeSyncOp({...v,opId:k})])); const incomingAdaptiveRecommendations=Object.fromEntries(Object.entries(data.adaptiveRecommendations||{}).map(([k,v])=>[k,normalizeAdaptiveRecommendation({...v,recommendationId:k})])); const incomingTrendSnapshots=Object.fromEntries(Object.entries(data.trendSnapshots||{}).map(([k,v])=>[k,normalizeTrendSnapshot({...v,trendId:k})])); const incomingQualityApprovals=Object.fromEntries(Object.entries(data.qualityApprovals||{}).map(([k,v])=>[k,normalizeQualityApproval({...v,approvalId:k})])); const incomingBankSnapshots=Object.fromEntries(Object.entries(data.bankSnapshots||{}).map(([k,v])=>[k,normalizeBankSnapshot({...v,snapshotId:k})])); const incomingBaselineRuns=Object.fromEntries(Object.entries(data.baselineRuns||{}).map(([k,v])=>[k,normalizeBaselineRun({...v,baselineId:k})])); const incomingDifficultyProposals=Object.fromEntries(Object.entries(data.difficultyProposals||{}).map(([k,v])=>[k,normalizeDifficultyProposalSet({...v,proposalSetId:k})])); const incomingApprovalAudit=Object.fromEntries(Object.entries(data.approvalAudit||{}).map(([k,v])=>[k,normalizeApprovalAudit({...v,auditId:k})])); const incomingPersonalDifficultyProfiles=Object.fromEntries(Object.entries(data.personalDifficultyProfiles||{}).map(([k,v])=>[k,normalizePersonalDifficultyProfile({...v,profileId:k})])); const incomingDifficultyApplications=Object.fromEntries(Object.entries(data.difficultyApplications||{}).map(([k,v])=>[k,normalizeDifficultyApplication({...v,applicationId:k})])); const incomingStabilityObservations=Object.fromEntries(Object.entries(data.stabilityObservations||{}).map(([k,v])=>[k,normalizeStabilityObservation({...v,observationId:k})])); const incomingRegressionAlerts=Object.fromEntries(Object.entries(data.regressionAlerts||{}).map(([k,v])=>[k,normalizeRegressionAlert({...v,alertId:k})]));
    if (importMode === 'overwrite') {
      cache.progress = normalizeProgress(data.progress); cache.ink = normalizeInkMap(data.ink); cache.profiles = clone(data.profiles) || {}; cache.sessions = incomingSessions; cache.events = incomingEvents; cache.replays = incomingReplays; cache.interventions = incomingInterventions; cache.assignments = incomingAssignments; cache.dailyPlans=incomingDailyPlans; cache.dailyReports=incomingDailyReports; cache.devices=incomingDevices; cache.syncQueue=incomingSyncQueue; cache.adaptiveRecommendations=incomingAdaptiveRecommendations; cache.trendSnapshots=incomingTrendSnapshots; cache.qualityApprovals=incomingQualityApprovals; cache.bankSnapshots=incomingBankSnapshots; cache.baselineRuns=incomingBaselineRuns; cache.difficultyProposals=incomingDifficultyProposals; cache.approvalAudit=incomingApprovalAudit; cache.personalDifficultyProfiles=incomingPersonalDifficultyProfiles; cache.difficultyApplications=incomingDifficultyApplications; cache.stabilityObservations=incomingStabilityObservations; cache.regressionAlerts=incomingRegressionAlerts;
      cache.settings = { ...cache.settings, ...(data.settings || {}), learnerLocalId: canonicalLearnerId((data.settings||{}).learnerLocalId || cache.settings.learnerLocalId), schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() }; cache.metadata = { ...cache.metadata, ...(data.metadata || {}), restoredAt: nowIso(), restoreMode: 'overwrite' };
    } else if (importMode === 'merge') {
      cache.progress = mergeProgress(cache.progress, normalizeProgress(data.progress)); cache.ink = mergeTimedMap(cache.ink, normalizeInkMap(data.ink)); cache.profiles = { ...cache.profiles, ...(data.profiles || {}) };
      cache.sessions = mergeTimedMap(cache.sessions, incomingSessions); const byId = new Map(cache.events.map(e => [e.eventId, e])); for (const e of incomingEvents) byId.set(e.eventId, e); cache.events = [...byId.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.sequence - b.sequence);
      cache.replays = mergeTimedMap(cache.replays, incomingReplays); cache.interventions = mergeTimedMap(cache.interventions, incomingInterventions); cache.assignments = mergeTimedMap(cache.assignments, incomingAssignments); cache.dailyPlans=mergeTimedMap(cache.dailyPlans,incomingDailyPlans); cache.dailyReports=mergeTimedMap(cache.dailyReports,incomingDailyReports); cache.devices=mergeTimedMap(cache.devices,incomingDevices); cache.syncQueue=mergeTimedMap(cache.syncQueue,incomingSyncQueue); cache.adaptiveRecommendations=mergeTimedMap(cache.adaptiveRecommendations,incomingAdaptiveRecommendations); cache.trendSnapshots=mergeTimedMap(cache.trendSnapshots,incomingTrendSnapshots); cache.qualityApprovals=mergeTimedMap(cache.qualityApprovals,incomingQualityApprovals); cache.bankSnapshots=mergeTimedMap(cache.bankSnapshots,incomingBankSnapshots); cache.baselineRuns=mergeTimedMap(cache.baselineRuns,incomingBaselineRuns); cache.difficultyProposals=mergeTimedMap(cache.difficultyProposals,incomingDifficultyProposals); cache.approvalAudit=mergeTimedMap(cache.approvalAudit,incomingApprovalAudit); cache.personalDifficultyProfiles=mergeTimedMap(cache.personalDifficultyProfiles,incomingPersonalDifficultyProfiles); cache.difficultyApplications=mergeTimedMap(cache.difficultyApplications,incomingDifficultyApplications); cache.stabilityObservations=mergeTimedMap(cache.stabilityObservations,incomingStabilityObservations); cache.regressionAlerts=mergeTimedMap(cache.regressionAlerts,incomingRegressionAlerts); cache.settings = { ...cache.settings, ...(data.settings || {}), learnerLocalId: canonicalLearnerId((data.settings||{}).learnerLocalId || cache.settings.learnerLocalId), schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() }; cache.metadata = { ...cache.metadata, restoredAt: nowIso(), restoreMode: 'merge' };
    } else throw new Error('가져오기 방식은 merge 또는 overwrite여야 합니다.');
    if (!cache.profiles[cache.settings.activeProfileId]) { const first = Object.keys(cache.profiles)[0] || 'default'; if (!cache.profiles[first]) cache.profiles.default = defaultProfile(); cache.settings.activeProfileId = first; }
    await persistWholeCache(); await autoBackup(`restore-${importMode}`, { force: true }); return snapshot();
  }

  async function pruneBackups() { if (mode !== 'indexeddb') return; const all = await idbGetAll(STORE_BACKUPS); const autos = all.filter(x => x.kind === 'auto').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); for (const item of autos.slice(MAX_AUTO_BACKUPS)) await idbDelete(STORE_BACKUPS, item.backupId); }
  async function autoBackup(reason = 'auto', options = {}) {
    const now = Date.now(); if (!options.force && reason === lastAutoBackupReason && now - lastAutoBackupAt < 45000) return null; lastAutoBackupAt = now; lastAutoBackupReason = reason; const payload = buildBackup(reason);
    if (mode === 'indexeddb') { try { const backupId = uid('auto'); await idbPut(STORE_BACKUPS, { backupId, kind: 'auto', reason, createdAt: payload.createdAt, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, payload }); await pruneBackups(); return backupId; } catch (error) { emitError('AUTO_BACKUP_FAILED', error, { reason }); fallbackSet('jk_phase19_auto_backup', payload); return null; } }
    fallbackSet('jk_phase19_auto_backup', payload); return 'localStorage-fallback';
  }
  async function listBackups() { if (mode !== 'indexeddb') { try { const p = JSON.parse(localStorage.getItem('jk_phase19_auto_backup') || 'null'); return p ? [{ backupId: 'local', kind: 'auto', reason: p.reason, createdAt: p.createdAt, schemaVersion: p.schemaVersion }] : []; } catch (_) { return []; } } return (await idbGetAll(STORE_BACKUPS)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); }

  async function clearLearningData() {
    cache.progress = DEFAULT_PROGRESS(); cache.ink = {};
    if (mode === 'indexeddb') { await idbPut(STORE_STATE, { key: 'progress', value: cache.progress, updatedAt: nowIso() }); await idbClear(STORE_INK); }
    else { fallbackSet('jk_phase19_progress_fallback', cache.progress); fallbackSet('jk_phase19_ink_fallback', cache.ink); }
    return snapshot();
  }

  async function diagnose() {
    const result = { at: nowIso(), indexedDBSupported: 'indexedDB' in window, mode, databaseName: DB_NAME, databaseVersion: DB_VERSION, schemaVersion: SCHEMA_VERSION, readWrite: false, readWriteMessage: '', quota: null, usage: null, persisted: null, serviceWorkerSupported: 'serviceWorker' in navigator, serviceWorkerControlled: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller), online: navigator.onLine, sessions: Object.keys(cache.sessions).length, events: cache.events.length, replays: Object.keys(cache.replays).length, interventions: Object.keys(cache.interventions).length, assignments: Object.keys(cache.assignments).length, dailyReports: Object.keys(cache.dailyReports).length, adaptiveRecommendations:Object.keys(cache.adaptiveRecommendations).length, trendSnapshots:Object.keys(cache.trendSnapshots).length, qualityApprovals:Object.keys(cache.qualityApprovals).length, bankSnapshots:Object.keys(cache.bankSnapshots).length, baselineRuns:Object.keys(cache.baselineRuns).length, difficultyProposals:Object.keys(cache.difficultyProposals).length, approvalAudit:Object.keys(cache.approvalAudit).length, personalDifficultyProfiles:Object.keys(cache.personalDifficultyProfiles).length, difficultyApplications:Object.keys(cache.difficultyApplications).length, stabilityObservations:Object.keys(cache.stabilityObservations).length, regressionAlerts:Object.keys(cache.regressionAlerts).length, queuedSync: Object.values(cache.syncQueue).filter(x=>x.status==='queued').length };
    try {
      if (mode === 'indexeddb') { const id = uid('test'), value = Math.random().toString(36); await idbPut(STORE_DIAGNOSTICS, { id, value, createdAt: nowIso() }); const read = await idbGet(STORE_DIAGNOSTICS, id); await idbDelete(STORE_DIAGNOSTICS, id); result.readWrite = Boolean(read && read.value === value); result.readWriteMessage = result.readWrite ? 'IndexedDB 읽기/쓰기 정상' : 'IndexedDB 읽기 값 불일치'; }
      else { const key = 'jk_phase19_diag_test', value = Math.random().toString(36); localStorage.setItem(key, value); result.readWrite = localStorage.getItem(key) === value; localStorage.removeItem(key); result.readWriteMessage = result.readWrite ? 'localStorage 대체 저장 정상' : '대체 저장 실패'; }
    } catch (error) { result.readWriteMessage = error.message || String(error); emitError('DIAGNOSTIC_RW_FAILED', error); }
    try { if (navigator.storage && navigator.storage.estimate) { const estimate = await navigator.storage.estimate(); result.quota = estimate.quota || null; result.usage = estimate.usage || null; } if (navigator.storage && navigator.storage.persisted) result.persisted = await navigator.storage.persisted(); } catch (error) { emitError('STORAGE_ESTIMATE_FAILED', error); }
    return result;
  }

  function runLegacyBackupMigrationTest() {
    const synthetic = { format: 'JK_ENG_BACKUP', schemaVersion: 18, appVersion: '18.0', createdAt: '2026-01-01T00:00:00.000Z', data: { progress: { wrong: { Q1: 2 }, correct: { Q2: 1 }, method: {}, methodGap: {}, errorCodes: {} }, ink: { Q1: { actions: [{ tool: 'pen', points: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.3 }] }], marks: [] } }, profiles: { default: defaultProfile({ profileId: 'default' }) }, settings: { activeProfileId: 'default' }, metadata: {} } };
    const checked = validateBackup(synthetic);
    return { ok: checked.ok && checked.migrated && checked.migrated.schemaVersion === 21 && Array.isArray(checked.migrated.data.events) && typeof checked.migrated.data.sessions === 'object', warnings: checked.warnings, errors: checked.errors };
  }

  window.JK_STORAGE = {
    APP_VERSION, SCHEMA_VERSION, DB_NAME, DB_VERSION, init, getSnapshot: () => snapshot(), detectDeviceLabel, deviceProfileId, defaultProfile,
    saveProgress, saveInk, updateSettings, saveProfile, resetProfile, startSession, appendEvent, endSession, saveReplay,
    listSessions, getEvents, getReplay, listReplays, getDiagnosticBundle, deleteSessionData, clearSessionData,
    listInterventions, reconcileInterventions, updateInterventionStatus, createManualAssignment, listAssignments, getAssignment, startAssignment, completeAssignment,
    saveDailyPlan, getDailyPlan, listDailyPlans, saveDailyReport, getDailyReport, listDailyReports, saveAdaptiveRecommendation, listAdaptiveRecommendations, updateAdaptiveRecommendation, saveTrendSnapshot, listTrendSnapshots, saveQualityApproval, listQualityApprovals, saveBankSnapshot, listBankSnapshots, getBankSnapshot, saveBaselineRun, getBaselineRun, listBaselineRuns, saveDifficultyProposalSet, listDifficultyProposalSets, appendApprovalAudit, listApprovalAudit, savePersonalDifficultyProfile, getPersonalDifficultyProfile, listPersonalDifficultyProfiles, saveDifficultyApplication, getDifficultyApplication, listDifficultyApplications, saveStabilityObservation, listStabilityObservations, saveRegressionAlert, listRegressionAlerts, updateRegressionAlert, registerDevice, listDevices, queueSync, listSyncQueue, updateSyncOp,
    exportBackup, validateBackup, migrateBackupPayload, importBackup, autoBackup, listBackups, clearLearningData, diagnose, runLegacyBackupMigrationTest, localDateId
  };
})();
