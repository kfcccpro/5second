(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const qMap = Object.fromEntries(JK_DATA.questions.map(q => [q.id, q]));
  const cMap = Object.fromEntries(JK_DATA.concepts.map(c => [c.id, c]));
  let scope = 'recent', bundle = { sessions: [], events: [], replays: [], interventions: [], assignments: [], dailyReports: [], devices: [], adaptiveRecommendations: [], trendSnapshots: [] }, report = null, rulesDoc = null, state = null;
  const fmt = iso => iso ? new Date(iso).toLocaleString() : '-';
  const pct = v => `${Number(v || 0).toFixed(1)}%`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const priorityName = p => ({1:'긴급',2:'높음',3:'보통',4:'낮음'}[p] || p);
  const statusName = s => ({auto_pending:'자동 제안',auto_resolved:'자동 해소',approved:'승인',held:'보류',dismissed:'해제',teacher_assigned:'직접 배정',completed:'완료',assigned:'배정',in_progress:'수행 중',cancelled:'취소',pending_admin:'승인 대기',applied:'다음 Day 반영',superseded:'대체됨'}[s] || s);
  function download(text, name, type) { const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }
  function scopedBundle() {
    if (scope === 'all') return bundle;
    const cutoff = Date.now() - 30 * 86400000;
    const sessions = bundle.sessions.filter(s => Date.parse(s.startedAt) >= cutoff);
    const ids = new Set(sessions.map(s => s.sessionId));
    return { ...bundle, sessions, events: bundle.events.filter(e => ids.has(e.sessionId)), replays: bundle.replays.filter(r => ids.has(r.sessionId)) };
  }
  function metric(label, value, note='') { return `<div class="metric"><b>${value}</b><small>${label}${note ? `<br>${note}` : ''}</small></div>`; }
  function renderTable(id, rows, mapper, colspan=6) { $(id).innerHTML = rows.length ? rows.map(mapper).join('') : `<tr><td colspan="${colspan}">기록이 없습니다.</td></tr>`; }
  function renderRules() {
    $('ruleCards').innerHTML = (rulesDoc.rules || []).map(r => `<div class="rule"><span class="pill p${r.priority}">${r.priority} ${priorityName(r.priority)}</span><strong>${esc(r.name)}</strong><small>규칙 ${esc(r.id)} v${r.version}<br>관찰 ${r.lookbackDays || '-'}일 · 기준 ${r.threshold != null ? r.threshold + '회' : r.thresholdDays + '일'}<br>${esc(r.recommendedAction)}<br>${esc(r.completionRule)}</small></div>`).join('');
  }
  function actionButtons(i) {
    const buttons = [];
    if (i.status === 'auto_pending') buttons.push(['approved','승인'],['held','보류'],['dismissed','해제'],['teacher_assigned','직접 배정']);
    else if (i.status === 'approved' || i.status === 'teacher_assigned') buttons.push(['held','보류'],['dismissed','해제']);
    else if (i.status === 'held') buttons.push(['approved','승인'],['dismissed','해제']);
    return buttons.map(([s,l]) => `<button class="btn small review" data-id="${esc(i.interventionId)}" data-status="${s}">${l}</button>`).join(' ');
  }
  function renderInterventions() {
    const rows = [...bundle.interventions].sort((a,b) => a.priority-b.priority || Date.parse(b.lastSeenAt||0)-Date.parse(a.lastSeenAt||0));
    renderTable('interventionRows', rows, i => {
      const q = qMap[i.questionId], c = cMap[i.conceptId];
      const t = i.thresholds || {};
      const threshold = t.threshold != null ? `${t.threshold}회` : t.thresholdDays != null ? `${t.thresholdDays}일` : '-';
      return `<tr><td><span class="pill p${i.priority}">${i.priority} ${priorityName(i.priority)}</span></td><td><span class="status ${esc(i.status)}">${statusName(i.status)}</span><br><small>${fmt(i.updatedAt)}</small></td><td><strong>${esc(i.ruleName)}</strong><br><small>${esc(i.ruleId)} v${esc(i.ruleVersion)}</small><br>${esc(c?.shortName || c?.name || i.conceptId || '-')}<br><small>${esc(q?.id || i.questionId || '-')}</small></td><td>${esc(i.reason)}<br><small>최근 ${t.lookbackDays || '-'}일 · 기준 ${threshold} · 발생 ${i.occurrenceCount}회</small></td><td><strong>${esc(i.recommendedAction)}</strong><br><small>${esc(i.completionRule)}</small></td><td class="evidence">${(i.evidenceEventIds || []).map(esc).join('<br>') || '-'}</td><td>${actionButtons(i)}</td></tr>`;
    }, 7);
    document.querySelectorAll('.review').forEach(b => b.onclick = async () => { await JK_STORAGE.updateInterventionStatus(b.dataset.id, b.dataset.status); await refresh(false); });
  }
  function renderAssignments() {
    renderTable('assignmentRows', bundle.assignments, a => {
      const q = qMap[a.questionId], c = cMap[a.conceptId];
      const scores = `${a.baselineMethodScore == null ? '-' : a.baselineMethodScore} → ${a.resultMethodScore == null ? '-' : a.resultMethodScore}`;
      const link = ['assigned','in_progress'].includes(a.status) ? `<a class="btn small primary" href="index.html?assignmentId=${encodeURIComponent(a.assignmentId)}">학습자 실행</a>` : '';
      return `<tr><td><span class="status ${esc(a.status)}">${statusName(a.status)}</span></td><td>${fmt(a.assignedAt)}</td><td>${esc(q?.id || a.questionId)}<br><small>${esc(c?.shortName || c?.name || a.conceptId)}</small></td><td>${esc(a.recommendedAction)}</td><td>${scores}</td><td>${a.recovered ? '<span class="good">회복</span>' : '-'}</td><td>${link}</td></tr>`;
    }, 7);
  }
  function renderDaily(){
    const reports=[...(bundle.dailyReports||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))); const r=reports[0]||JK_DAILY.report({bundle,data:JK_DATA,date:new Date()});
    const radar=$('adminRadar'),metrics=$('adminDailyMetrics'); if(!radar||!metrics)return; radar.innerHTML=JK_DAILY.radarSvg(r.axes,{size:340});
    metrics.innerHTML=[['학습시간',`${Math.round(r.activeMinutes||0)}분`],['최종 정확도',`${Math.round(r.answerAccuracy||0)}%`],['과정 통과',`${Math.round(r.processPassRate||0)}%`],['완전 통과',`${Math.round(r.fullPassRate||0)}%`]].map(([l,v])=>`<div><b>${v}</b><span>${l}</span></div>`).join('');
    $('adminStrength').textContent=r.strength||'아직 충분한 기록이 없습니다.'; $('adminFocus').textContent=r.nextFocus||'오늘 학습 후 보완 축을 계산합니다.'; $('adminRecommendation').textContent=r.recommendation||'문제→단계 판단→교재 복귀→원문 재도전 순서를 유지합니다.';
    $('dailyAdminStatus').textContent=`${r.date||'오늘'} · 문법·어법 ${Math.round(r.grammarMinutes||0)}분 · 독해 ${Math.round(r.readingMinutes||0)}분`; $('deviceCount').textContent=`등록 기기 ${(bundle.devices||[]).length}대`;
  }
  function mixHtml(values={}) {
    const cells = [
      ['신규', `${Math.round(Number(values.newRatio||0)*100)}%`],
      ['복습', `${Math.round(Number(values.reviewRatio||0)*100)}%`],
      ['회상', `${Math.round(Number(values.recallRatio||0)*100)}%`],
      ['페이스', `${Math.round(Number(values.paceTargetMultiplier||1)*100)}%`],
      ['문법·어법', `${Number(values.grammarMinutes||21)}분`],
      ['독해', `${Number(values.readingMinutes||18)}분`]
    ];
    return cells.map(([label,value])=>`<div><b>${value}</b><span>${label}</span></div>`).join('');
  }
  function renderAdaptive() {
    const list=[...(bundle.adaptiveRecommendations||[])].sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));
    const item=list[0];
    if(!item){$('adaptiveTitle').textContent='아직 제안이 없습니다.';$('adaptiveStatus').textContent='대기';$('adaptiveBefore').innerHTML='';$('adaptiveProposed').innerHTML='';$('adaptiveReasons').innerHTML='<div class="reason">학습 결과가 저장되면 최근 7일 자료로 다음 Day를 계산합니다.</div>';$('adaptiveActions').innerHTML='';$('adaptiveSample').textContent='표본 0일';return;}
    $('adaptiveTitle').textContent=`다음 Day 제안 · ${item.recommendationId}`;
    $('adaptiveStatus').className=`status ${esc(item.status)}`;$('adaptiveStatus').textContent=statusName(item.status);
    $('adaptiveSample').textContent=`표본 ${item.sourceWindow?.reportCount||0}일`;
    $('adaptiveBefore').innerHTML=mixHtml(item.before);$('adaptiveProposed').innerHTML=mixHtml(item.proposed);
    $('adaptiveReasons').innerHTML=(item.reasons||[]).map(r=>`<div class="reason"><strong>${esc(r.label||r.code)}</strong><br><span class="notice">근거 ${esc(typeof r.evidence==='object'?JSON.stringify(r.evidence):r.evidence??'-')} · 기준 ${esc(typeof r.threshold==='object'?JSON.stringify(r.threshold):r.threshold??'-')}</span></div>`).join('')||'<div class="reason">보수적 기본값을 유지합니다.</div>';
    $('adaptiveTeacherNote').value=item.teacherNote||'';
    const actions=[];
    if(item.status==='pending_admin')actions.push(['approved','승인'],['dismissed','보류 없이 제외']);
    else if(item.status==='approved')actions.push(['dismissed','승인 취소']);
    $('adaptiveActions').innerHTML=actions.map(([status,label])=>`<button class="btn ${status==='approved'?'primary':''} adaptiveReview" data-id="${esc(item.recommendationId)}" data-status="${status}">${label}</button>`).join('')+(item.status==='applied'?'<span class="notice">승인값이 다음 Day 계획에 반영되었습니다.</span>':'');
    document.querySelectorAll('.adaptiveReview').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await JK_STORAGE.updateAdaptiveRecommendation(button.dataset.id,button.dataset.status,$('adaptiveTeacherNote').value.trim());await refresh(false);}finally{button.disabled=false;}});
  }
  function trendMetaHtml(trend){
    const last=trend.rows?.at(-1)||{};
    return [
      ['정확도',trend.hasData?`${Math.round(last.answerAccuracy||0)}%`:'-'],
      ['과정 통과',trend.hasData?`${Math.round(last.processPassRate||0)}%`:'-'],
      ['다음 날 전이',trend.nextDayTransferRate==null?'-':`${trend.nextDayTransferRate}%`]
    ].map(([label,value])=>`<div><b>${value}</b><small>${label}</small></div>`).join('');
  }
  function renderTrends(){
    const reports=bundle.dailyReports||[],events=bundle.events||[];
    const t7=JK_ADAPTIVE.buildTrend({reports,events,days:7}),t30=JK_ADAPTIVE.buildTrend({reports,events,days:30});
    for(const [prefix,trend] of [['trend7',t7],['trend30',t30]]){
      $(`${prefix}Status`).textContent=trend.hasData?`${trend.reportCount}일 · ${trend.attempts}회`:'데이터 없음';
      $(`${prefix}Chart`).innerHTML=JK_ADAPTIVE.sparkline(trend.metrics.processPassRate,{label:`${trend.days}일 과정 통과 추세`});
      $(`${prefix}Meta`).innerHTML=trendMetaHtml(trend);
    }
    const evidence=t7.nextDayTransferEvidence||0;
    $('transferEvidence').textContent=evidence?`최근 7일 회복 문항의 다음 날 재통과 근거 ${evidence}건 · 전이율 ${t7.nextDayTransferRate}%`:'다음 날 전이율은 전날 회복 문항이 다음 Day에서 다시 통과한 기록이 생기면 표시합니다.';
  }
  function render() {
    const scoped = scopedBundle(); report = JK_ANALYTICS.aggregate({ ...scoped, questions: JK_DATA.questions, concepts: JK_DATA.concepts });
    const o = report.overall, activeInterventions = bundle.interventions.filter(i => ['auto_pending','approved','held','teacher_assigned'].includes(i.status)).length, openAssignments = bundle.assignments.filter(a => ['assigned','in_progress'].includes(a.status)).length;
    $('scopeStatus').textContent = `${scoped.sessions.length}개 세션 · ${scoped.events.length}개 이벤트 · 활성 처방 ${activeInterventions}개 · 수행 과제 ${openAssignments}개`;
    $('metrics').innerHTML = [metric('전체 시도', o.attempts), metric('최종 정답률', pct(o.answerAccuracy)), metric('과정 통과율', pct(o.processPassRate)), metric('완전 통과율', pct(o.fullPassRate)), metric('정답·과정 미통과', o.correctProcessFail), metric('교재 복귀 후 회복률', pct(o.recoveryRate)), metric('활성 처방', activeInterventions), metric('수행 과제', openAssignments)].join('');
    renderInterventions(); renderAssignments(); renderRules(); renderDaily(); renderAdaptive(); renderTrends();
    renderTable('partRows', report.byPart, r => `<tr><td>${esc(r.label)}</td><td>${r.attempts}</td><td>${pct(r.answerAccuracy)}</td><td>${pct(r.processPassRate)}</td><td>${pct(r.recoveryRate)}</td></tr>`, 5);
    const failures = [...report.byFailureStage.map(r => ({...r,label:`단계: ${r.label}`})), ...report.byErrorCode.map(r => ({...r,label:`오답: ${r.label}`}))];
    renderTable('failureRows', failures, r => `<tr><td>${esc(r.label)}</td><td>${r.attempts}</td><td>${pct(r.fullPassRate)}</td><td>${r.repeatedSameError}</td></tr>`, 4);
    renderTable('conceptRows', report.byConcept, r => `<tr><td>${esc(r.label)}</td><td>${r.attempts}</td><td>${pct(r.answerAccuracy)}</td><td>${pct(r.processPassRate)}</td><td>${r.correctProcessFail}</td><td>${r.recoveries}</td></tr>`, 6);
    renderTable('sessionRows', report.sessions, s => `<tr><td>${fmt(s.startedAt)}</td><td>${esc(s.pathId || '-')} / ${esc(s.stageId || '-')}</td><td>${s.attempts}</td><td>${pct(s.answerAccuracy)}</td><td>${pct(s.processPassRate)}</td><td>${s.recoveries}</td><td><button class="btn small sessionDetail" data-id="${esc(s.sessionId)}">상세</button></td></tr>`, 7);
    document.querySelectorAll('.sessionDetail').forEach(b => b.onclick = () => showSession(b.dataset.id));
  }
  function eventLabel(e) {
    const labels = { session_start:'세션 시작', session_end:'세션 종료', day_started:'Day 시작', day_completed:'Day 완료', pace_prompt:'페이스 안내', question_presented:'문항 제시', mark_committed:'표식 저장', mark_confirmed:'표식 확정', decision_step_answered:'판단 단계', final_answer:'최종 답안', grading_result:'채점 결과', textbook_return:'교재 복귀', check_question_answered:'확인문제', original_retry:'원문 재도전', replay_saved:'리플레이 저장', assignment_started:'처방 수행 시작', assignment_completed:'처방 완료', adaptive_recommendation_created:'적응형 제안 생성', adaptive_recommendation_approved:'적응형 제안 승인', adaptive_plan_applied:'적응형 계획 반영', device_transfer:'기기 전환', sync_queued:'동기화 대기', cloud_sync_completed:'클라우드 동기화 완료' };
    return labels[e.type] || e.type;
  }
  async function showSession(id) {
    const events = bundle.events.filter(e => e.sessionId === id).sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp) || a.sequence-b.sequence);
    $('detailTitle').textContent = `세션 상세 · ${id}`;
    $('timeline').innerHTML = events.map(e => {
      const q = qMap[e.questionId]; const replayId = e.payload && e.payload.replayId;
      const details = [q ? `${q.id} · ${(cMap[q.conceptId] && (cMap[q.conceptId].shortName || cMap[q.conceptId].name)) || q.conceptId}` : '', e.answerCorrect == null ? '' : `정답 ${e.answerCorrect ? 'O' : 'X'}`, e.methodScore == null ? '' : `과정 ${e.methodScore}점`, e.errorCode ? `오답 ${e.errorCode}` : '', e.payload?.assignmentId ? `배정 ${e.payload.assignmentId}` : ''].filter(Boolean).join(' · ');
      return `<div class="event"><strong>${eventLabel(e)}</strong><small>${fmt(e.timestamp)}${details ? ` · ${esc(details)}` : ''}</small>${replayId ? `<div><a class="btn small" href="replay.html?replayId=${encodeURIComponent(replayId)}">필기 과정 재생</a></div>` : ''}</div>`;
    }).join('') || '<div class="event">이벤트가 없습니다.</div>';
    $('detailCard').classList.remove('hidden'); $('detailCard').scrollIntoView({ behavior: 'smooth' });
  }
  function exportCsv() {
    const headers = ['sessionId','questionId','conceptId','part','attemptNo','timestamp','answerCorrect','methodPass','methodScore','failureStage','errorCode','textbookReturnBeforeAttempt','recoveredAfterTextbook','repeatedSameError','replayId'];
    const cell = v => `"${String(v == null ? '' : v).replace(/"/g,'""')}"`;
    const rows = [headers.join(','), ...report.attempts.map(a => headers.map(h => cell(a[h])).join(','))];
    download('\ufeff' + rows.join('\n'), `JK_ENG_session_summary_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  }
  function exportJson() { const scoped = scopedBundle(); download(JSON.stringify({ format:'JK_ENG_DIAGNOSTICS', schemaVersion:19, appVersion:'19.0', createdAt:new Date().toISOString(), ruleSetVersion:rulesDoc.ruleSetVersion, ...scoped }, null, 2), `JK_ENG_diagnostics_${Date.now()}.json`, 'application/json'); }
  async function loadRules() {
    if (rulesDoc) return rulesDoc;
    try { rulesDoc = await fetch('intervention-rules.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }); }
    catch (_) { rulesDoc = window.JK_RULES || { schemaVersion:17, ruleSetVersion:'1.0.0', rules:[] }; }
    const valid = JK_INTERVENTIONS.validateRules(rulesDoc); if (!valid.ok) throw new Error(valid.errors.join(', ')); return rulesDoc;
  }
  async function refresh(recompute=true) {
    if(!state){await JK_AUTH.requireRole('admin');state=await JK_STORAGE.init();await JK_STORAGE.registerDevice({role:'admin',label:JK_STORAGE.detectDeviceLabel(),lastSeenAt:new Date().toISOString()});} await JK_CLOUD.flush(); state=JK_STORAGE.getSnapshot(); await loadRules();
    let raw = await JK_STORAGE.getDiagnosticBundle();
    if (recompute) {
      const proposals = JK_INTERVENTIONS.evaluate({ events: raw.events, sessions: raw.sessions, questions: JK_DATA.questions, rules: rulesDoc, learnerId: state.settings?.learnerLocalId || 'single-learner', now: new Date().toISOString() });
      await JK_STORAGE.reconcileInterventions(proposals); raw = await JK_STORAGE.getDiagnosticBundle();
    }
    const candidate=JK_ADAPTIVE.buildRecommendation({reports:raw.dailyReports||[],events:raw.events||[],settings:state.settings||{},now:new Date()});
    if(!(raw.adaptiveRecommendations||[]).some(item=>item.determinismKey===candidate.determinismKey)) { await JK_STORAGE.saveAdaptiveRecommendation(candidate); raw=await JK_STORAGE.getDiagnosticBundle(); }
    bundle = raw; render();
  }
  document.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { scope = b.dataset.scope; document.querySelectorAll('[data-scope]').forEach(x => x.classList.toggle('active', x === b)); render(); });
  $('recompute').onclick = () => refresh(true);
  $('manualAssign').onclick = async () => { const id = $('manualQuestion').value.trim(), q = qMap[id]; if (!q) { $('manualStatus').textContent = '문항 ID를 확인하세요.'; return; } const sourceRef = q.remediation && q.remediation.sourceRef; try { await JK_STORAGE.createManualAssignment({ learnerId: state.settings?.learnerLocalId || 'single-learner', questionId:q.id, conceptId:q.conceptId, sourceRef, recommendedAction:$('manualAction').value, priority:Number($('manualPriority').value), teacherNote:$('manualNote').value, reason:$('manualNote').value || '교사 직접 배정' }); $('manualStatus').textContent = `${q.id} 직접 배정 완료`; await refresh(false); } catch (e) { $('manualStatus').textContent = e.message; } };
  $('exportCsv').onclick = exportCsv; $('exportJson').onclick = exportJson; $('closeDetail').onclick = () => $('detailCard').classList.add('hidden');
  $('deleteRange').onclick = async () => { const from = $('deleteFrom').value, to = $('deleteTo').value; if (!from || !to) return $('deleteStatus').textContent = '시작일과 종료일을 모두 선택하세요.'; if (!confirm(`${from}부터 ${to}까지 진단 데이터를 삭제할까요?`)) return; const r = await JK_STORAGE.deleteSessionData({ from: `${from}T00:00:00`, to: `${to}T23:59:59.999` }); $('deleteStatus').textContent = `${r.deletedSessions}개 세션 삭제`; await refresh(true); };
  $('clearAll').onclick = async () => { if (!confirm('세션·이벤트·리플레이 진단 데이터를 모두 삭제할까요?')) return; const r = await JK_STORAGE.clearSessionData(); $('deleteStatus').textContent = `${r.deletedSessions}개 세션 삭제`; await refresh(true); };
  refresh(true).catch(e => { $('scopeStatus').textContent = `초기화 실패: ${e.message}`; console.error(e); });
  setInterval(()=>{if(state?.settings?.cloudSyncEnabled)refresh(false).catch(()=>{})},60000);
})();
