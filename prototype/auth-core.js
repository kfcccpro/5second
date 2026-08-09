(() => {
  'use strict';
  const DEFAULT_HASH = {
    learner: 'a7fc04e4c6f7823a3ccbd1dd99a7300ded02962e8b259da67fe0af937903eed5',
    admin: 'f1cfa5ebb149e8099d561aae57beed6c68f990f45a910ea9d7b460dbcc5350be'
  };
  const PIN_KEY = 'jk_phase22_pin_hashes';
  const LEGACY_PIN_KEY = 'jk_phase18_pin_hashes';
  const SESSION_KEY = 'jk_phase22_auth_session';
  const LEGACY_SESSION_KEY = 'jk_phase18_auth_session';
  const LOCK_KEY = 'jk_phase22_auth_lock';
  const MAX_FAILURES = 5;
  const LOCK_MS = 30000;

  const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const sessionRead = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem(LEGACY_SESSION_KEY) || 'null'); } catch (_) { return null; } };
  const sessionWrite = value => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); } catch (_) {} };
  async function hashPin(pin) {
    const bytes = new TextEncoder().encode(String(pin));
    const cryptoApi=globalThis.crypto;
    if (!cryptoApi || !cryptoApi.subtle) throw new Error('보안 해시 기능을 사용할 수 없습니다.');
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function hashes() { return { ...DEFAULT_HASH, ...read(LEGACY_PIN_KEY, {}), ...read(PIN_KEY, {}) }; }
  function lockState(role) { const all = read(LOCK_KEY, {}); return { all, item: all[role] || { failures: 0, lockedUntil: 0 } }; }
  function noteFailure(role) {
    const { all, item } = lockState(role); item.failures = Number(item.failures || 0) + 1;
    if (item.failures >= MAX_FAILURES) { item.failures = 0; item.lockedUntil = Date.now() + LOCK_MS; }
    all[role] = item; write(LOCK_KEY, all); return item;
  }
  function clearFailure(role) { const { all } = lockState(role); all[role] = { failures: 0, lockedUntil: 0 }; write(LOCK_KEY, all); }
  function validSession(role) { const s = sessionRead(); return Boolean(s && s.role === role && Number(s.expiresAt || 0) > Date.now()); }
  function roleLabel(role) { return role === 'admin' ? '관리자' : '학습자'; }
  function cloudConfig() { try { return JSON.parse(localStorage.getItem('jk_phase22_cloud_auth_config') || 'null'); } catch (_) { return null; } }
  async function centralAuthenticate(role, pin) {
    if (window.JK_FIREBASE_PILOT?.enabled) return null;
    const config = cloudConfig();
    if (!config?.cloudSyncEnabled || !config.cloudEndpoint || !config.deviceId) return null;
    try {
      const response = await fetch(`${String(config.cloudEndpoint).replace(/\/$/,'')}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json','X-JK-Schema':'19'}, body:JSON.stringify({ role, pin, deviceId:config.deviceId, label:config.deviceLabel || '' }) });
      let body={}; try { body=await response.json(); } catch (_) {}
      if (!response.ok) return { ok:false, message: response.status===401 ? '서버 PIN이 일치하지 않거나 이 기기가 연결되지 않았습니다.' : (body.error || `서버 인증 실패 ${response.status}`) };
      try { sessionStorage.setItem('jk_phase22_server_session_pending', JSON.stringify({ sessionToken:body.sessionToken, expiresAt:body.expiresAt, role:body.role, deviceId:body.deviceId })); } catch (_) {}
      const custom = read(PIN_KEY, {}); custom[role] = await hashPin(pin); write(PIN_KEY, custom);
      return { ok:true };
    } catch (_) { return null; }
  }
  function injectStyle() {
    if (document.getElementById('jkAuthStyle')) return;
    const style = document.createElement('style'); style.id = 'jkAuthStyle'; style.textContent = `
      .jk-auth{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:rgba(245,245,247,.96);backdrop-filter:blur(24px);padding:24px;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .jk-auth-card{width:min(520px,100%);background:rgba(255,255,255,.96);border:1px solid rgba(0,0,0,.08);border-radius:30px;padding:32px;box-shadow:0 24px 80px rgba(0,0,0,.12);text-align:center}
      .jk-auth-cover{display:block;width:min(210px,50vw);max-height:290px;object-fit:contain;margin:0 auto 18px;border-radius:18px;box-shadow:0 12px 30px rgba(0,0,0,.12);background:#fff}
      .jk-auth-book{font-size:13px;color:#6e6e73;font-weight:760;margin:-4px 0 14px}
      .jk-auth-mark{width:62px;height:62px;margin:0 auto 18px;border-radius:18px;display:grid;place-items:center;background:#0071e3;color:white;font-weight:900;font-size:20px;box-shadow:0 12px 28px rgba(0,113,227,.24)}
      .jk-auth h1{font-size:30px;letter-spacing:-.04em;margin:0 0 8px}.jk-auth p{color:#63636a;font-size:16px;line-height:1.6;margin:0 0 20px}
      .jk-pin{width:100%;height:64px;border:1px solid #d2d2d7;border-radius:16px;font-size:25px;letter-spacing:.42em;text-align:center;background:#fff;outline:none}.jk-pin:focus{border-color:#0071e3;box-shadow:0 0 0 4px rgba(0,113,227,.13)}
      .jk-auth button{width:100%;border:0;border-radius:16px;padding:16px;margin-top:12px;background:#0071e3;color:white;font-size:16px;font-weight:800;cursor:pointer}.jk-auth small{display:block;min-height:20px;margin-top:12px;color:#bf4800}.jk-auth-switch{display:block;margin-top:16px;color:#6e6e73;text-decoration:none;font-size:13px}
      @media(max-width:560px){.jk-auth{padding:12px}.jk-auth-card{padding:20px;border-radius:24px}.jk-auth-cover{width:min(176px,50vw);max-height:240px;margin-bottom:14px}.jk-auth-mark{width:56px;height:56px;margin-bottom:14px}.jk-auth h1{font-size:26px}.jk-auth p{font-size:14px;margin-bottom:16px}.jk-pin{height:58px}.jk-auth button{padding:15px}}
      @media(min-width:1100px){.jk-auth-card{width:min(560px,100%)}.jk-auth-cover{width:220px}.jk-auth h1{font-size:32px}}
    `; document.head.appendChild(style);
  }
  function showGate(role) {
    injectStyle();
    return new Promise(resolve => {
      const workbook = window.JK_WORKBOOK_META || {};
      const coverHtml = role === 'learner' && workbook.cover ? `<img class="jk-auth-cover" src="${workbook.cover}" alt="${workbook.title || 'JK English 문제집'} 표지"><div class="jk-auth-book">${workbook.title || ''}</div>` : '';
      const pairLink = window.JK_FIREBASE_PILOT?.enabled ? '' : '<a class="jk-auth-switch" href="pair-device.html">새 기기 연결</a>';
      const gate = document.createElement('div'); gate.className = 'jk-auth'; gate.innerHTML = `<div class="jk-auth-card">${coverHtml}<div class="jk-auth-mark">JK</div><h1>${roleLabel(role)} 모드</h1><p>${role === 'admin' ? '학습 기록과 처방 설정은 관리자에게만 표시됩니다.' : '표지를 확인한 뒤 PIN을 입력해 오늘 학습을 시작하세요.'}</p><input class="jk-pin" inputmode="numeric" autocomplete="one-time-code" maxlength="4" aria-label="${roleLabel(role)} PIN"><button>계속</button><small></small>${role === 'learner' ? '<a class="jk-auth-switch" href="dashboard.html">관리자 모드</a>' : '<a class="jk-auth-switch" href="index.html">학습자 모드</a>'}${pairLink}</div>`;
      document.body.appendChild(gate);
      const input = gate.querySelector('input'), button = gate.querySelector('button'), status = gate.querySelector('small');
      const submit = async () => {
        const lock = lockState(role).item;
        if (Number(lock.lockedUntil || 0) > Date.now()) { status.textContent = `${Math.ceil((lock.lockedUntil - Date.now()) / 1000)}초 후 다시 시도하세요.`; return; }
        const pin = input.value.trim(); if (!/^\d{4}$/.test(pin)) { status.textContent = '4자리 PIN을 입력하세요.'; return; }
        button.disabled = true;
        try {
          const central = await centralAuthenticate(role, pin);
          const ok = central?.ok === true || (central == null && await hashPin(pin) === hashes()[role]);
          if (!ok) { const n = noteFailure(role); status.textContent = n.lockedUntil > Date.now() ? '입력이 반복되어 30초 동안 잠겼습니다.' : (central?.message || 'PIN이 일치하지 않습니다.'); input.select(); return; }
          clearFailure(role); const auth = { role, issuedAt: Date.now(), expiresAt: Date.now() + (role === 'admin' ? 4 : 12) * 60 * 60 * 1000 }; sessionWrite(auth); try { sessionStorage.setItem('jk_phase22_central_pin_once', JSON.stringify({ role, pin, expiresAt: Date.now() + 5 * 60 * 1000 })); } catch (_) {} gate.remove(); resolve(auth);
        } finally { button.disabled = false; }
      };
      button.addEventListener('click', submit); input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }); setTimeout(() => input.focus(), 50);
    });
  }
  async function requireRole(role) { if (validSession(role)) return sessionRead(); return showGate(role); }
  async function changePin(role, currentPin, nextPin) {
    if (!/^\d{4}$/.test(String(nextPin))) throw new Error('새 PIN은 4자리 숫자여야 합니다.');
    if (await hashPin(currentPin) !== hashes()[role]) throw new Error('현재 PIN이 일치하지 않습니다.');
    const custom = read(PIN_KEY, {}); custom[role] = await hashPin(nextPin); write(PIN_KEY, custom); return true;
  }
  async function adminSetPin(role, nextPin) {
    if (!validSession('admin')) throw new Error('관리자 인증이 필요합니다.');
    if (!/^\d{4}$/.test(String(nextPin))) throw new Error('새 PIN은 4자리 숫자여야 합니다.');
    const custom = read(PIN_KEY, {}); custom[role] = await hashPin(nextPin); write(PIN_KEY, custom); return true;
  }
  function logout() { try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem('jk_phase22_central_pin_once'); } catch (_) {} location.reload(); }
  window.JK_AUTH = { requireRole, changePin, adminSetPin, logout, current: sessionRead, hashPin, DEFAULT_HASH };
})();
