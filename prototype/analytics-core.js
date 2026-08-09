(() => {
  'use strict';

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const pct = (n, d) => d ? Math.round(n * 1000 / d) / 10 : 0;
  const keyOf = (sessionId, questionId) => `${sessionId}::${questionId}`;

  function sortEvents(events = []) {
    return [...events].sort((a, b) => Date.parse(a.timestamp || 0) - Date.parse(b.timestamp || 0) || Number(a.sequence || 0) - Number(b.sequence || 0) || String(a.eventId || '').localeCompare(String(b.eventId || '')));
  }

  function buildAttempts(events = [], questionMap = {}) {
    const ordered = sortEvents(events);
    const state = new Map();
    const attempts = [];
    const ensure = e => {
      const k = keyOf(e.sessionId, e.questionId || '');
      if (!state.has(k)) state.set(k, { attemptNo: 1, textbookReturn: false, checkCorrect: false, priorErrors: {}, steps: [], textbookEventIds: [], checkEventIds: [], decisionEventIds: [], sourceRef: null });
      return state.get(k);
    };
    for (const e of ordered) {
      if (!e.questionId && !['session_start', 'session_end'].includes(e.type)) continue;
      const s = ensure(e);
      if (e.type === 'question_presented') {
        s.attemptNo = Number(e.payload && e.payload.attemptNo || s.attemptNo || 1);
        s.presentedAt = e.timestamp;
      } else if (e.type === 'textbook_return') {
        s.textbookReturn = true; s.textbookEventIds.push(e.eventId); s.sourceRef = e.payload && e.payload.sourceRef || s.sourceRef;
      } else if (e.type === 'check_question_answered') {
        if (e.payload && e.payload.checkCorrect) s.checkCorrect = true; s.checkEventIds.push(e.eventId);
      } else if (e.type === 'decision_step_answered') {
        s.steps.push({ stepIndex: Number(e.payload && e.payload.stepIndex || 0), correct: Boolean(e.payload && e.payload.stepCorrect), timestamp: e.timestamp }); s.decisionEventIds.push(e.eventId);
      } else if (e.type === 'original_retry') {
        s.attemptNo = Number(e.payload && e.payload.attemptNo || s.attemptNo + 1);
      } else if (e.type === 'grading_result') {
        const q = questionMap[e.questionId] || {};
        const payload = e.payload || {};
        const errorCode = e.errorCode || null;
        const priorSameError = errorCode ? Number(s.priorErrors[errorCode] || 0) : 0;
        const attempt = {
          sessionId: e.sessionId, questionId: e.questionId, conceptId: e.conceptId || q.conceptId || null,
          part: q.part || null, attemptNo: Number(payload.attemptNo || s.attemptNo || 1), timestamp: e.timestamp,
          answerCorrect: Boolean(e.answerCorrect), methodScore: e.methodScore == null ? null : Number(e.methodScore),
          methodPass: payload.methodPass !== false, fullyCorrect: Boolean(e.answerCorrect) && payload.methodPass !== false,
          failureStage: payload.failureStage || (e.answerCorrect ? 'process' : 'final_answer'), errorCode,
          textbookReturnBeforeAttempt: Boolean(s.textbookReturn), checkCorrectBeforeAttempt: Boolean(s.checkCorrect),
          recoveredAfterTextbook: Boolean(e.answerCorrect) && payload.methodPass !== false && s.textbookReturn,
          repeatedSameError: priorSameError > 0, decisionStepFailures: s.steps.filter(x => !x.correct).length,
          replayId: payload.replayId || null, gradingEventId: e.eventId, sourceRef: s.sourceRef || payload.sourceRef || null,
          evidenceEventIds: [...s.textbookEventIds, ...s.checkEventIds, ...s.decisionEventIds]
        };
        attempts.push(attempt);
        if (errorCode) s.priorErrors[errorCode] = priorSameError + 1;
        if (!attempt.fullyCorrect) {
          s.attemptNo = attempt.attemptNo + 1;
        } else {
          s.textbookReturn = false; s.checkCorrect = false; s.steps = []; s.textbookEventIds = []; s.checkEventIds = []; s.decisionEventIds = []; s.sourceRef = null;
        }
      }
    }
    return attempts;
  }

  function emptyMetric() {
    return { attempts: 0, answerCorrect: 0, methodPass: 0, fullyCorrect: 0, correctProcessFail: 0, textbookReturns: 0, recoveries: 0, repeatedSameError: 0, methodScoreSum: 0, methodScoreCount: 0 };
  }

  function addMetric(metric, attempt) {
    metric.attempts += 1;
    if (attempt.answerCorrect) metric.answerCorrect += 1;
    if (attempt.methodPass) metric.methodPass += 1;
    if (attempt.fullyCorrect) metric.fullyCorrect += 1;
    if (attempt.answerCorrect && !attempt.methodPass) metric.correctProcessFail += 1;
    if (attempt.textbookReturnBeforeAttempt) metric.textbookReturns += 1;
    if (attempt.recoveredAfterTextbook) metric.recoveries += 1;
    if (attempt.repeatedSameError) metric.repeatedSameError += 1;
    if (attempt.methodScore != null) { metric.methodScoreSum += attempt.methodScore; metric.methodScoreCount += 1; }
    return metric;
  }

  function finalizeMetric(metric) {
    return {
      ...metric,
      answerAccuracy: pct(metric.answerCorrect, metric.attempts),
      processPassRate: pct(metric.methodPass, metric.attempts),
      fullPassRate: pct(metric.fullyCorrect, metric.attempts),
      recoveryRate: pct(metric.recoveries, metric.textbookReturns),
      averageMethodScore: metric.methodScoreCount ? Math.round(metric.methodScoreSum * 10 / metric.methodScoreCount) / 10 : null
    };
  }

  function groupBy(attempts, selector, labeler = x => x) {
    const map = new Map();
    for (const attempt of attempts) {
      const key = selector(attempt) || '미분류';
      if (!map.has(key)) map.set(key, { key, label: labeler(key, attempt), metric: emptyMetric() });
      addMetric(map.get(key).metric, attempt);
    }
    return [...map.values()].map(x => ({ key: x.key, label: x.label, ...finalizeMetric(x.metric) })).sort((a, b) => b.attempts - a.attempts || String(a.label).localeCompare(String(b.label)));
  }

  function aggregate(input = {}) {
    const sessions = input.sessions || [];
    const events = input.events || [];
    const questions = input.questions || [];
    const concepts = input.concepts || [];
    const questionMap = Object.fromEntries(questions.map(q => [q.id, q]));
    const conceptMap = Object.fromEntries(concepts.map(c => [c.id, c]));
    const attempts = buildAttempts(events, questionMap);
    const overall = finalizeMetric(attempts.reduce(addMetric, emptyMetric()));
    const byPart = groupBy(attempts, x => x.part, k => k || '미분류');
    const byConcept = groupBy(attempts, x => x.conceptId, (k) => (conceptMap[k] && (conceptMap[k].shortName || conceptMap[k].name)) || k);
    const byErrorCode = groupBy(attempts.filter(x => x.errorCode), x => x.errorCode);
    const byFailureStage = groupBy(attempts.filter(x => !x.fullyCorrect), x => x.failureStage);
    const sessionRows = sessions.map(s => {
      const own = attempts.filter(a => a.sessionId === s.sessionId);
      const m = finalizeMetric(own.reduce(addMetric, emptyMetric()));
      const replayQuestionIds = [...new Set(own.filter(a => a.replayId).map(a => a.questionId))];
      return { ...clone(s), ...m, replayQuestionIds };
    }).sort((a, b) => Date.parse(b.startedAt || 0) - Date.parse(a.startedAt || 0));
    return { overall, attempts, byPart, byConcept, byErrorCode, byFailureStage, sessions: sessionRows };
  }

  function validateReferences(bundle = {}, questionIds = new Set(), conceptIds = new Set(), errorCodes = new Set()) {
    const errors = [];
    const sessions = new Set((bundle.sessions || []).map(x => x.sessionId));
    const eventIds = new Set();
    let previousBySession = {};
    for (const e of sortEvents(bundle.events || [])) {
      if (!e.eventId || eventIds.has(e.eventId)) errors.push(`duplicate-or-empty-event:${e.eventId || '?'}`);
      eventIds.add(e.eventId);
      if (!sessions.has(e.sessionId)) errors.push(`missing-session:${e.eventId}`);
      if (e.questionId && questionIds.size && !questionIds.has(e.questionId)) errors.push(`missing-question:${e.eventId}:${e.questionId}`);
      if (e.conceptId && conceptIds.size && !conceptIds.has(e.conceptId)) errors.push(`missing-concept:${e.eventId}:${e.conceptId}`);
      if (e.errorCode && errorCodes.size && !errorCodes.has(e.errorCode)) errors.push(`missing-error:${e.eventId}:${e.errorCode}`);
      const prev = previousBySession[e.sessionId];
      if (prev && (Date.parse(e.timestamp) < Date.parse(prev.timestamp) || Number(e.sequence || 0) <= Number(prev.sequence || 0))) errors.push(`event-order:${e.eventId}`);
      previousBySession[e.sessionId] = e;
    }
    for (const r of bundle.replays || []) {
      if (!sessions.has(r.sessionId)) errors.push(`replay-session:${r.replayId}`);
      if (r.questionId && questionIds.size && !questionIds.has(r.questionId)) errors.push(`replay-question:${r.replayId}`);
      let last = -1;
      for (const stroke of r.rawStrokes || []) for (const p of stroke.points || []) {
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) errors.push(`replay-coordinate:${r.replayId}`);
        if (Number(p.t) < last) errors.push(`replay-time:${r.replayId}`);
        last = Number(p.t);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  window.JK_ANALYTICS = { sortEvents, buildAttempts, aggregate, validateReferences };
})();
