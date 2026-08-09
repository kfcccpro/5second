(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const fmtDate=s=>{const d=new Date(`${s}T00:00:00`);return `${d.getMonth()+1}월 ${d.getDate()}일`};
  async function ensurePlan(){
    const snap=window.JK_STORAGE.getSnapshot(),id=window.JK_DAILY.dayId();let plan=await window.JK_STORAGE.getDailyPlan(id);
    if(!plan){
      plan=window.JK_DAILY.createPlan({data:window.JK_DATA,progress:snap.progress,settings:snap.settings});
      const approved=(await window.JK_STORAGE.listAdaptiveRecommendations({status:'approved'}))[0];
      if(approved&&snap.settings.adaptiveEnabled!==false)plan=window.JK_ADAPTIVE.applyRecommendation({plan,recommendation:approved,data:window.JK_DATA,progress:snap.progress});
      plan=await window.JK_STORAGE.saveDailyPlan(plan);
      if(approved&&plan.adaptiveRecommendationId===approved.recommendationId)await window.JK_STORAGE.updateAdaptiveRecommendation(approved.recommendationId,'applied','승인된 추천을 새 Day 계획에 반영했습니다.');
    }
    return plan;
  }
  function renderPlan(plan){if(!$('todayDay'))return;$('todayDay').textContent=`${fmtDate(plan.date)} · 오늘 학습`;$('todayTime').textContent=`약 ${plan.targetMinutes}분`;$('grammarTime').textContent=`${plan.grammarMinutes}분`;$('readingTime').textContent=`${plan.readingMinutes}분`;$('todayCount').textContent=`${window.JK_DAILY.planQuestionIds(plan).length}개 활동`;const b=$('todayStartBtn');if(b){b.textContent=plan.status==='completed'?'오늘 학습 완료':plan.status==='active'?'중단한 곳부터 이어하기':'오늘 학습 시작';b.disabled=plan.status==='completed'}const adaptive=$('adaptivePlanNote');if(adaptive){adaptive.textContent=plan.adaptiveRecommendationId?'관리자 승인 처방이 오늘 계획에 반영되었습니다.':'기본 Daily 구조로 진행합니다.';adaptive.classList.toggle('hidden',!plan.adaptiveRecommendationId);}}
  function renderReport(report){const card=$('dailyResultCard');if(!card)return;if(!report||!report.attempts){card.classList.add('hidden');return}card.classList.remove('hidden');$('dailyRadar').innerHTML=window.JK_DAILY.radarSvg(report.axes,{size:340});$('dailyMetrics').innerHTML=[['최종 정확도',report.answerAccuracy],['과정 통과',report.processPassRate],['완전 통과',report.fullPassRate],['회복률',report.recoveryRate]].map(([l,v])=>`<div><b>${Math.round(v)}%</b><span>${l}</span></div>`).join('');$('dailyStrength').textContent=report.strength;$('dailyFocus').textContent=report.nextFocus;$('dailyRecommendation').textContent=report.recommendation;const b=$('todayStartBtn');if(b&&report.completedAt){b.textContent='오늘 학습 완료';b.disabled=true}}
  async function refreshHome(){try{await window.JK_STORAGE.init();const plan=await ensurePlan();renderPlan(plan);renderReport(await window.JK_STORAGE.getDailyReport(plan.dayId));const snap=window.JK_STORAGE.getSnapshot();const status=$('syncState');if(status)status.textContent=snap.settings.cloudSyncEnabled?(navigator.onLine?'다기기 동기화 준비':'오프라인 저장'):'이 기기에 안전하게 저장'}catch(e){console.warn('phase21 home',e)}}
  async function finalizeDay(id){
    const bundle=await window.JK_STORAGE.getDiagnosticBundle();const report=window.JK_DAILY.report({bundle,data:window.JK_DATA,date:id.slice(4)});report.completedAt=new Date().toISOString();await window.JK_STORAGE.saveDailyReport(report);const plan=await window.JK_STORAGE.getDailyPlan(id);if(plan)await window.JK_STORAGE.saveDailyPlan({...plan,status:'completed',updatedAt:new Date().toISOString()});
    const after=await window.JK_STORAGE.getDiagnosticBundle(),snap=window.JK_STORAGE.getSnapshot();
    if(snap.settings.adaptiveEnabled!==false){const rec=window.JK_ADAPTIVE.buildRecommendation({reports:after.dailyReports,events:after.events,settings:snap.settings,now:new Date()});await window.JK_STORAGE.saveAdaptiveRecommendation(rec);}
    for(const days of [7,30]){const trend=window.JK_ADAPTIVE.buildTrend({reports:after.dailyReports,events:after.events,days});await window.JK_STORAGE.saveTrendSnapshot({trendId:`TREND-${days}-${id}`,periodDays:days,reportCount:trend.reportCount,attempts:trend.attempts,payload:trend,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}
    await window.JK_CLOUD.flush();renderReport(report);return report;
  }
  window.addEventListener('jk-sync-status',e=>{const el=$('syncState');if(!el)return;const map={synced:'모든 승인 기기와 동기화됨',syncing:'동기화 중','offline-ready':'오프라인 저장 중','local-only':'로컬 저장','sync-error':'동기화 대기','token-revoked':'기기 재승인 필요','device-pending':'관리자 승인 대기','lease-conflict':'다른 기기에서 학습 중'};el.textContent=map[e.detail.status]||e.detail.status});
  window.JK_PHASE21={ensurePlan,refreshHome,finalizeDay,renderReport};
  window.JK_PHASE20=window.JK_PHASE21;window.JK_PHASE19=window.JK_PHASE21;window.JK_PHASE18=window.JK_PHASE21;
  queueMicrotask(()=>refreshHome());
})();
