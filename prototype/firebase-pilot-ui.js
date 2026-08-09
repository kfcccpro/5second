(() => {
  'use strict';
  if (!window.JK_FIREBASE_PILOT?.enabled) return;
  const $=id=>document.getElementById(id);
  function hideLegacySections(){
    document.querySelectorAll('section.card').forEach(section=>{
      const title=(section.querySelector('h2')?.textContent||'').trim();
      if(title.includes('비공개 다기기 연결')||title.includes('서버 내구성 백업')) section.hidden=true;
    });
  }
  function apply(){
    hideLegacySections();
    const endpoint=$('cloudEndpoint'); if(endpoint){endpoint.value='firebase://hosting';endpoint.readOnly=true;endpoint.type='text';endpoint.placeholder='firebase://hosting';}
    const enabled=$('cloudSyncEnabled'); if(enabled){enabled.checked=true;enabled.disabled=true;const span=enabled.closest('label')?.querySelector('span');if(span)span.innerHTML='<b>Firebase 다기기 동기화</b><br/>Hosting + Firestore 자동 동기화';}
    const session=$('cloudSessionStatus'); if(session) session.value='Firebase Anonymous Auth 자동 연결';
    document.querySelectorAll('label').forEach(label=>{if(label.textContent.trim()==='클라우드 동기화 게이트웨이')label.textContent='Firebase 동기화 백엔드';if(label.textContent.trim()==='서버 세션 상태')label.textContent='Firebase 인증 상태';});
  }
  window.addEventListener('jk-sync-status',event=>{
    const detail=event.detail||{}; const session=$('cloudSessionStatus');
    if(session) session.value=detail.status==='synced'?'Firebase 연결됨 · 동기화 완료':detail.status==='offline-ready'?'오프라인 저장 중 · 재연결 시 동기화':detail.status==='sync-error'?'Firebase 연결 확인 필요':'Firebase Anonymous Auth 자동 연결';
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply,{once:true}); else apply();
  setTimeout(apply,250);
})();
