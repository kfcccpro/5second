(()=>{'use strict';
const $=id=>document.getElementById(id);
function simplifyHome(){const mini=$('syncTop');if(mini)mini.textContent='오늘 학습';const details=document.querySelector('.selfStudy > summary');if(details)details.textContent='학습 도구';const device=document.querySelector('.deviceNote');if(device)device.textContent='필기와 저장 설정은 필요할 때만 확인하세요.';}
function bindStart(){const b=$('todayStartBtn');if(!b||b.dataset.jk31Bound)return;b.dataset.jk31Bound='true';const original=b.onclick;b.onclick=async()=>{JK_PHASE31.setBusy(b,true,{busy:'오늘 학습 준비 중'});try{await original?.call(b)}catch(e){console.error(e);JK_PHASE31.notify('sync-error',{action:()=>b.click()})}finally{if(!$('study')?.classList.contains('hidden'))return;JK_PHASE31.setBusy(b,false)}}}
function bindPause(){const b=$('dailyPauseBtn');if(!b||b.dataset.jk31Bound)return;b.dataset.jk31Bound='true';b.onclick=async()=>{JK_PHASE31.setBusy(b,true,{busy:'여기까지 저장 중'});try{await window.pauseDailyLearning?.();JK_PHASE31.notify('paused',{dismissible:true})}catch(e){console.error(e);JK_PHASE31.notify('storage-attention',{dismissible:true})}finally{JK_PHASE31.setBusy(b,false,{idle:'여기까지 저장'})}}}
function updateStartCopy(){const b=$('todayStartBtn');if(!b)return;const t=b.textContent.trim();b.setAttribute('aria-label',t==='중단한 곳부터 이어하기'?'중단한 문제부터 오늘 학습 이어하기':'오늘 학습 시작');}
function install(){simplifyHome();bindStart();bindPause();updateStartCopy();const target=$('todayStartBtn');if(target)new MutationObserver(updateStartCopy).observe(target,{childList:true,characterData:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
