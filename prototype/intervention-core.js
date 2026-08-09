(() => {
  'use strict';

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const DAY = 86400000;
  const ACTIONS = new Set(['교재 복귀', '판단 단계 재연습', '확인문제', '원문 재도전']);

  function stableHash(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableSort(items, selector) {
    return [...items].sort((a, b) => {
      const av = selector(a), bv = selector(b);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return String(a.eventId || a.interventionId || '').localeCompare(String(b.eventId || b.interventionId || ''));
    });
  }

  function within(attempt, nowMs, days) {
    const t = Date.parse(attempt.timestamp || 0);
    return Number.isFinite(t) && t >= nowMs - Number(days || 0) * DAY && t <= nowMs;
  }

  function group(items, keyFn) {
    const map = new Map();
    for (const item of items) {
      const key = keyFn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }

  function sourceRefFor(questionMap, attempt) {
    const q = questionMap[attempt.questionId] || {};
    return (q.remediation && q.remediation.sourceRef) || attempt.sourceRef || null;
  }

  function proposal(rule, learnerId, attempt, occurrences, questionMap, extra = {}) {
    const sourceRef = extra.sourceRef || sourceRefFor(questionMap, attempt);
    const signatureParts = [rule.id, learnerId, attempt.conceptId || '', attempt.questionId || '', extra.errorCode || '', extra.failureStage || '', sourceRef || '', rule.recommendedAction];
    const signature = signatureParts.join('|');
    const sorted = stableSort(occurrences, x => `${x.timestamp || ''}|${String(x.gradingEventId || '')}`);
    const eventIds = [...new Set(sorted.flatMap(x => [x.gradingEventId, ...(x.evidenceEventIds || [])]).filter(Boolean))].sort();
    const first = sorted[0] || attempt;
    const last = sorted[sorted.length - 1] || attempt;
    const base = {
      interventionId: `intv-${stableHash(signature)}`,
      signature,
      learnerId,
      ruleId: rule.id,
      ruleVersion: Number(rule.version || 1),
      ruleSetVersion: extra.ruleSetVersion || '1.0.0',
      ruleName: rule.name,
      priority: Number(rule.priority || 4),
      conceptId: attempt.conceptId || null,
      questionId: attempt.questionId || null,
      errorCode: extra.errorCode || attempt.errorCode || null,
      failureStage: extra.failureStage || attempt.failureStage || null,
      sourceRef,
      recommendedAction: ACTIONS.has(rule.recommendedAction) ? rule.recommendedAction : '원문 재도전',
      completionRule: rule.completionRule,
      completionCode: 'original_retry_full_pass',
      occurrenceCount: sorted.length,
      evidenceEventIds: eventIds,
      firstSeenAt: first.timestamp || null,
      lastSeenAt: last.timestamp || null,
      latestMethodScore: last.methodScore == null ? null : Number(last.methodScore),
      thresholds: {
        lookbackDays: Number(rule.lookbackDays || 0),
        threshold: rule.threshold == null ? null : Number(rule.threshold),
        thresholdDays: rule.thresholdDays == null ? null : Number(rule.thresholdDays)
      },
      reason: extra.reason || rule.name,
      status: 'auto_pending',
      createdAt: last.timestamp || new Date().toISOString(),
      updatedAt: last.timestamp || new Date().toISOString()
    };
    return { ...base, ...clone(extra.fields || {}) };
  }

  function evaluate(input = {}) {
    const rulesDoc = input.rules || { ruleSetVersion: '1.0.0', rules: [] };
    const rules = Object.fromEntries((rulesDoc.rules || []).filter(r => r.enabled !== false).map(r => [r.id, r]));
    const learnerId = input.learnerId || 'single-learner';
    const nowMs = Date.parse(input.now || new Date().toISOString());
    const questions = input.questions || [];
    const questionMap = Object.fromEntries(questions.map(q => [q.id, q]));
    const attempts = window.JK_ANALYTICS ? window.JK_ANALYTICS.buildAttempts(input.events || [], questionMap) : (input.attempts || []);
    const orderedAttempts = stableSort(attempts, x => `${x.timestamp || ''}|${String(x.gradingEventId || '')}`);
    const proposals = [];

    const processRule = rules.R17_CORRECT_PROCESS_FAIL;
    if (processRule) {
      const rows = orderedAttempts.filter(a => a.answerCorrect && !a.methodPass && within(a, nowMs, processRule.lookbackDays));
      for (const occurrences of group(rows, a => a.questionId).values()) {
        if (occurrences.length < Number(processRule.threshold || 1)) continue;
        const last = occurrences[occurrences.length - 1];
        proposals.push(proposal(processRule, learnerId, last, occurrences, questionMap, {
          ruleSetVersion: rulesDoc.ruleSetVersion,
          failureStage: last.failureStage || 'process',
          reason: `최종 답은 맞았지만 과정 미통과가 최근 ${processRule.lookbackDays}일 동안 ${occurrences.length}회 발생했습니다.`
        }));
      }
    }

    const errorRule = rules.R17_REPEAT_ERROR_CODE;
    if (errorRule) {
      const rows = orderedAttempts.filter(a => a.errorCode && within(a, nowMs, errorRule.lookbackDays));
      for (const occurrences of group(rows, a => `${a.questionId}::${a.errorCode}`).values()) {
        if (occurrences.length < Number(errorRule.threshold || 1)) continue;
        const last = occurrences[occurrences.length - 1];
        proposals.push(proposal(errorRule, learnerId, last, occurrences, questionMap, {
          ruleSetVersion: rulesDoc.ruleSetVersion,
          errorCode: last.errorCode,
          reason: `동일 오답 코드 ${last.errorCode}가 최근 ${errorRule.lookbackDays}일 동안 ${occurrences.length}회 반복되었습니다.`
        }));
      }
    }

    const stageRule = rules.R17_REPEAT_FAILURE_STAGE;
    if (stageRule) {
      const rows = orderedAttempts.filter(a => !a.fullyCorrect && a.failureStage && within(a, nowMs, stageRule.lookbackDays));
      for (const occurrences of group(rows, a => `${a.conceptId}::${a.failureStage}`).values()) {
        if (occurrences.length < Number(stageRule.threshold || 1)) continue;
        const last = occurrences[occurrences.length - 1];
        proposals.push(proposal(stageRule, learnerId, last, occurrences, questionMap, {
          ruleSetVersion: rulesDoc.ruleSetVersion,
          failureStage: last.failureStage,
          reason: `동일 실패 단계 ${last.failureStage}가 같은 개념에서 최근 ${stageRule.lookbackDays}일 동안 ${occurrences.length}회 반복되었습니다.`
        }));
      }
    }

    const recoveryRule = rules.R17_NO_RECOVERY_AFTER_TEXTBOOK;
    if (recoveryRule) {
      for (const occurrences of group(orderedAttempts.filter(a => within(a, nowMs, recoveryRule.lookbackDays)), a => a.questionId).values()) {
        let unresolved = [];
        for (let i = 0; i < occurrences.length; i += 1) {
          const a = occurrences[i];
          if (!a.textbookReturnBeforeAttempt || a.fullyCorrect) continue;
          const laterRecovery = occurrences.slice(i + 1).some(x => x.fullyCorrect);
          if (!laterRecovery) unresolved.push(a);
        }
        if (unresolved.length < Number(recoveryRule.threshold || 1)) continue;
        const last = unresolved[unresolved.length - 1];
        proposals.push(proposal(recoveryRule, learnerId, last, unresolved, questionMap, {
          ruleSetVersion: rulesDoc.ruleSetVersion,
          reason: `교재 복귀 이후에도 지정 원문에서 완전 통과로 회복되지 않은 기록이 ${unresolved.length}회 남아 있습니다.`
        }));
      }
    }

    const inactivityRule = rules.R17_LONG_INACTIVITY;
    if (inactivityRule && orderedAttempts.length) {
      const last = orderedAttempts[orderedAttempts.length - 1];
      const inactiveDays = Math.floor((nowMs - Date.parse(last.timestamp || 0)) / DAY);
      if (inactiveDays >= Number(inactivityRule.thresholdDays || 14) && !last.fullyCorrect) {
        proposals.push(proposal(inactivityRule, learnerId, last, [last], questionMap, {
          ruleSetVersion: rulesDoc.ruleSetVersion,
          reason: `마지막 미완료 학습 이후 ${inactiveDays}일 동안 새 학습 기록이 없습니다.`,
          fields: { inactiveDays }
        }));
      }
    }

    const bySignature = new Map();
    for (const item of proposals) {
      const old = bySignature.get(item.signature);
      if (!old || Date.parse(item.lastSeenAt || 0) >= Date.parse(old.lastSeenAt || 0)) bySignature.set(item.signature, item);
    }
    return [...bySignature.values()].sort((a, b) => a.priority - b.priority || Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0) || a.interventionId.localeCompare(b.interventionId));
  }

  function validateRules(doc = {}) {
    const errors = [];
    const ids = new Set();
    if (Number(doc.schemaVersion) !== 17) errors.push('schemaVersion must be 17');
    for (const rule of doc.rules || []) {
      if (!rule.id || ids.has(rule.id)) errors.push(`duplicate-or-empty-rule:${rule.id || '?'}`);
      ids.add(rule.id);
      if (!ACTIONS.has(rule.recommendedAction)) errors.push(`invalid-action:${rule.id}`);
      if (![1, 2, 3, 4].includes(Number(rule.priority))) errors.push(`invalid-priority:${rule.id}`);
    }
    return { ok: errors.length === 0, errors };
  }

  window.JK_INTERVENTIONS = { evaluate, validateRules, stableHash, ACTIONS: [...ACTIONS] };
})();
