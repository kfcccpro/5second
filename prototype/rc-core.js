(function(global){
'use strict';
const VERSION='30.0',PERF_KEY='jk_phase30_performance_samples',PWA_KEY='jk_phase30_pwa_state';
const PAGE_ROLES={
 'index.html':'learner','calibration.html':'learner','pen-diagnostics.html':'learner',
 'dashboard.html':'admin','settings.html':'admin','storage-diagnostics.html':'admin','replay.html':'admin','question-bank.html':'admin','quality-audit.html':'admin','baseline-quality.html':'admin','stability.html':'admin','operations.html':'admin','support.html':'admin','release-candidate.html':'admin',
 'pair-device.html':'public-limited','support-claim.html':'public-limited'
};
const DEFAULT_BUDGETS={domInteractiveMs:2000,windowLoadMs:3500,questionTransitionMs:250,inkCommitMs:120,syncFlushMs:5000,criticalAssetBytes:25000000,largestSingleScriptBytes:18000000};
function safeRead(key,fallback){try{const value=JSON.parse(global.localStorage?.getItem(key)||'null');return value==null?fallback:value}catch(_){return fallback}}
function safeWrite(key,value){try{global.localStorage?.setItem(key,JSON.stringify(value))}catch(_){}}
function evaluatePerformance(samples,budgets=DEFAULT_BUDGETS){const rows=(samples||[]).map(s=>({...s,budgetMs:Number(budgets[s.metric+'Ms']??budgets[s.metric]??Infinity)}));return{rows:rows.map(r=>({...r,status:Number(r.durationMs)<=r.budgetMs?'PASS':'OVER_BUDGET'})),pass:rows.every(r=>Number(r.durationMs)<=r.budgetMs)}}
function recordDuration(metric,durationMs,meta={}){const sample={metric,durationMs:Math.max(0,Math.round(Number(durationMs)||0)),at:new Date().toISOString(),page:pageName(),...meta};const all=safeRead(PERF_KEY,[]);all.push(sample);safeWrite(PERF_KEY,all.slice(-200));try{global.dispatchEvent(new CustomEvent('jk-performance-sample',{detail:sample}))}catch(_){}return sample}
function performanceSamples(){return safeRead(PERF_KEY,[])}
function pageName(){try{return (global.location.pathname.split('/').pop()||'index.html').split('?')[0]}catch(_){return'unknown'}}
function pageRole(name=pageName()){return PAGE_ROLES[name]||'unknown'}
function navigationAudit(matrix){const pages=matrix?.pages||[];const known=new Map(pages.map(p=>[p.page,p]));const missing=Object.keys(PAGE_ROLES).filter(p=>!known.has(p));const mismatch=Object.entries(PAGE_ROLES).filter(([p,r])=>known.get(p)&&known.get(p).role!==r);return{pass:!missing.length&&!mismatch.length,missing,mismatch,pageCount:pages.length}}
function enhanceAccessibility(doc=global.document){if(!doc)return{pass:false};const main=doc.querySelector('main')||doc.querySelector('.wrap')||doc.body;if(main&&!main.id)main.id='mainContent';if(main&&!main.hasAttribute('tabindex'))main.setAttribute('tabindex','-1');if(main&&!doc.querySelector('.jk-skip-link')){const a=doc.createElement('a');a.className='jk-skip-link';a.href='#'+main.id;a.textContent='본문으로 바로가기';doc.body.prepend(a)}
 doc.querySelectorAll('button:not([type])').forEach(b=>b.type='button');doc.querySelectorAll('nav:not([aria-label])').forEach(n=>n.setAttribute('aria-label','주요 메뉴'));
 doc.querySelectorAll('iframe:not([title])').forEach((f,i)=>f.title=i?'교재 참고 화면':'교재 원문 참고 화면');doc.querySelectorAll('img:not([alt])').forEach(img=>img.alt=img.classList.contains('problemImg')?'문제 원문 이미지':'');
 doc.querySelectorAll('canvas:not([role])').forEach(c=>{c.setAttribute('role','img');c.setAttribute('aria-label','문장 구조와 근거를 표시하는 필기 영역')});
 doc.querySelectorAll('.modal').forEach(m=>{m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-hidden',m.classList.contains('hidden')?'true':'false')});
 doc.querySelectorAll('a[href]').forEach(a=>{try{const target=(new URL(a.href,global.location.href).pathname.split('/').pop()||'index.html');if(target===pageName())a.setAttribute('aria-current','page')}catch(_){}});
 let live=doc.getElementById('jkRcLive');if(!live){live=doc.createElement('div');live.id='jkRcLive';live.className='jk-sr-only';live.setAttribute('aria-live','polite');doc.body.appendChild(live)}
 const observer=new MutationObserver(ms=>{for(const m of ms){if(m.type==='attributes'&&m.target.classList?.contains('modal'))m.target.setAttribute('aria-hidden',m.target.classList.contains('hidden')?'true':'false')}});doc.querySelectorAll('.modal').forEach(m=>observer.observe(m,{attributes:true,attributeFilter:['class']}));
 doc.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const modal=[...doc.querySelectorAll('.modal:not(.hidden)')].pop();if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');modal.querySelector('iframe')?.setAttribute('src','');const opener=doc.querySelector('[data-jk-modal-opener="true"]');opener?.focus?.()}});
 return{pass:true,mainId:main.id,buttons:doc.querySelectorAll('button').length,links:doc.querySelectorAll('a[href]').length}
}
function announce(text){const el=global.document?.getElementById('jkRcLive');if(el){el.textContent='';setTimeout(()=>{el.textContent=String(text||'')},20)}}
function trackNavigation(){if(!global.performance)return;global.addEventListener('load',()=>{setTimeout(()=>{const n=performance.getEntriesByType?.('navigation')?.[0];if(n){recordDuration('domInteractive',n.domInteractive);recordDuration('windowLoad',n.loadEventEnd||performance.now())}},0)},{once:true})}
function statusBox(message,actions=[]){const doc=global.document;if(!doc)return null;let box=doc.getElementById('jkRcStatus');if(!box){box=doc.createElement('div');box.id='jkRcStatus';box.className='jk-rc-status';box.setAttribute('role','status');doc.body.appendChild(box)}box.hidden=false;box.innerHTML='<span></span><div></div>';box.querySelector('span').textContent=message;const holder=box.querySelector('div');for(const a of actions){const b=doc.createElement('button');b.type='button';b.textContent=a.label;b.className=a.secondary?'secondary':'';b.onclick=a.action;holder.appendChild(b)}return box}
function setupPwaLifecycle(){if(!('serviceWorker'in navigator)||!location.protocol.startsWith('http'))return{status:'UNSUPPORTED'};let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing)return;refreshing=true;location.reload()});navigator.serviceWorker.addEventListener('message',e=>{const d=e.data||{};if(d.type==='JK_SW_UPDATE_READY')statusBox('새 릴리스가 준비되었습니다.',[{label:'업데이트',action:()=>navigator.serviceWorker.controller?.postMessage({type:'SKIP_WAITING'})},{label:'나중에',secondary:true,action:()=>document.getElementById('jkRcStatus').hidden=true}]);if(d.type==='JK_SW_ACTIVATED'){safeWrite(PWA_KEY,{version:d.version,status:'ACTIVE',at:new Date().toISOString()});announce('앱 업데이트가 적용되었습니다.')}if(d.type==='JK_SW_ROLLBACK_RESULT'){safeWrite(PWA_KEY,{version:d.version,status:d.ok?'ROLLED_BACK':'ROLLBACK_FAILED',at:new Date().toISOString()});announce(d.ok?'이전 캐시로 전환했습니다.':'이전 캐시 전환에 실패했습니다.')}});
 navigator.serviceWorker.register('./sw.js').then(reg=>{if(reg.waiting)statusBox('새 릴리스가 설치 대기 중입니다.',[{label:'적용',action:()=>reg.waiting.postMessage({type:'SKIP_WAITING'})}]);reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)statusBox('새 릴리스가 준비되었습니다.',[{label:'업데이트',action:()=>w.postMessage({type:'SKIP_WAITING'})}])})})}).catch(()=>{});
 return{status:'REGISTERED'}
}
function requestRollback(){navigator.serviceWorker?.controller?.postMessage({type:'ROLLBACK_TO_PREVIOUS'})}
function restoreCurrent(){navigator.serviceWorker?.controller?.postMessage({type:'RESTORE_CURRENT'})}
function installRuntime(){enhanceAccessibility();trackNavigation();setupPwaLifecycle();global.document?.documentElement.setAttribute('data-jk-release','30.0')}
const api={VERSION,PAGE_ROLES,DEFAULT_BUDGETS,evaluatePerformance,recordDuration,performanceSamples,pageName,pageRole,navigationAudit,enhanceAccessibility,announce,setupPwaLifecycle,requestRollback,restoreCurrent};
if(typeof module!=='undefined'&&module.exports)module.exports=api;global.JK_RC=api;
if(global.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRuntime,{once:true});else installRuntime()}
})(typeof globalThis!=='undefined'?globalThis:this);
