(function(global){'use strict';
const VERSION='31.0';
const fallback={
 'synced':{title:'저장 완료',body:'학습 기록이 안전하게 저장되었습니다.'},
 'syncing':{title:'저장 내용을 맞추는 중',body:'학습은 그대로 계속할 수 있습니다.'},
 'offline-ready':{title:'오프라인으로 계속할 수 있습니다',body:'기록은 이 기기에 저장되며 연결되면 자동으로 맞춰집니다.'},
 'local-only':{title:'이 기기에 저장 중',body:'현재 학습 기록은 이 기기에 안전하게 남습니다.'},
 'sync-error':{title:'이 기기에 먼저 저장했습니다',body:'연결이 돌아오면 자동으로 다시 맞춥니다. 학습은 계속할 수 있습니다.',actionLabel:'다시 확인'},
 'lease-conflict':{title:'다른 기기의 저장을 마무리하는 중입니다',body:'잠시 후 이어하기를 다시 누르면 중단한 곳부터 시작합니다.',actionLabel:'다시 이어보기'},
 'authentication-required':{title:'기기 연결을 다시 확인해 주세요',body:'현재 기록은 이 기기에 남아 있습니다.'},
 'device-pending':{title:'기기 승인을 기다리고 있습니다',body:'현재 학습은 이 기기에 저장할 수 있습니다.'},
 'storage-attention':{title:'저장 상태를 한 번 더 확인해 주세요',body:'현재 화면의 학습 내용은 유지됩니다.',actionLabel:'상태 확인'},
 'paused':{title:'여기까지 저장했습니다',body:'다음에는 중단한 문제부터 이어집니다.'},
 'ready':{title:'오늘 학습 준비 완료',body:'시작하면 문제부터 바로 진행합니다.'}
};
function catalog(){return global.JK_PHASE31_DATA?.policy?.messageCatalog||fallback}
function messageFor(status,overrides={}){const base=catalog()[status]||catalog()['sync-error']||fallback['sync-error'];return{status,title:overrides.title||base.title,body:overrides.body||base.body,actionLabel:overrides.actionLabel??base.actionLabel??'',tone:overrides.tone||base.tone||'calm'}}
function resumeOrder(ids=[],resumeQuestionId){const rows=[...ids];if(!resumeQuestionId||!rows.includes(resumeQuestionId))return rows;return[resumeQuestionId,...rows.filter(id=>id!==resumeQuestionId)]}
function layoutForWidth(width){const n=Number(width||0),profiles=global.JK_PHASE31_DATA?.policy?.responsive?.profiles||[];return profiles.find(p=>n>=p.minWidth&&n<=p.maxWidth)?.id||(n<600?'phone':n<1100?'tablet':'desktop')}
function journeyAudit(policy=global.JK_PHASE31_DATA?.policy||{}){const rows=Object.values(policy.journeys||{});return{pass:rows.length===4&&rows.every(x=>x.pass===true&&x.steps.length<=x.maxSteps&&x.maxSteps<=3),rows}}
function responsiveAudit(policy=global.JK_PHASE31_DATA?.policy||{}){const p=policy.responsive?.profiles||[];const ids=p.map(x=>x.id);return{pass:policy.responsive?.syntheticStatus==='PASS'&&['phone','tablet','desktop'].every(x=>ids.includes(x))&&p.every(x=>x.targetPx>=44),profiles:p}}
function ensureNotice(){if(!global.document)return null;let box=document.getElementById('learnerNotice');if(box)return box;box=document.createElement('div');box.id='learnerNotice';box.className='jk31-notice hidden';box.setAttribute('role','status');box.setAttribute('aria-live','polite');const app=document.querySelector('.app')||document.body;app.prepend(box);return box}
function notify(status,options={}){const msg=messageFor(status,options),box=ensureNotice();if(!box)return msg;box.classList.remove('hidden');box.dataset.status=status;box.innerHTML='<div><strong></strong><span></span></div><div class="jk31-notice-actions"></div>';box.querySelector('strong').textContent=msg.title;box.querySelector('span').textContent=msg.body;const holder=box.querySelector('.jk31-notice-actions');if(msg.actionLabel&&typeof options.action==='function'){const b=document.createElement('button');b.type='button';b.textContent=msg.actionLabel;b.onclick=options.action;holder.appendChild(b)}if(options.dismissible!==false){const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='확인';close.onclick=()=>box.classList.add('hidden');holder.appendChild(close)}return msg}
function compactStatus(status){const m=messageFor(status);return m.title}
function setBusy(button,busy,labels={}){if(!button)return;if(busy){button.dataset.jk31Label=button.textContent;button.disabled=true;button.textContent=labels.busy||'준비 중'}else{button.disabled=false;button.textContent=labels.idle||button.dataset.jk31Label||button.textContent}}
function installRuntime(){if(!global.document)return;document.documentElement.setAttribute('data-jk-usability',VERSION);global.addEventListener?.('offline',()=>notify('offline-ready',{dismissible:true}));global.addEventListener?.('online',()=>notify('syncing',{dismissible:true}));global.addEventListener?.('jk-sync-status',e=>{const s=e.detail?.status||'local-only',el=document.getElementById('syncState');if(el)el.textContent=compactStatus(s);if(['sync-error','lease-conflict','authentication-required','device-pending'].includes(s))notify(s,{dismissible:true})});global.addEventListener?.('jk-storage-error',()=>notify('storage-attention',{dismissible:true,action:()=>{location.href='storage-diagnostics.html'}}));}
const api={VERSION,messageFor,resumeOrder,layoutForWidth,journeyAudit,responsiveAudit,notify,compactStatus,setBusy,installRuntime};
if(typeof module!=='undefined'&&module.exports)module.exports=api;global.JK_PHASE31=api;if(global.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRuntime,{once:true});else installRuntime()}
})(typeof globalThis!=='undefined'?globalThis:this);
