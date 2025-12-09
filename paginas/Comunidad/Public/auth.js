// auth.js
let currentUser = null;
const authArea = document.getElementById('auth-area');

async function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  // include token if exists
  const token = localStorage.getItem('token');
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, opts);
  return res;
}

async function refreshMe() {
  const token = localStorage.getItem('token');
  if (!token) return setAuthUI(null);
  const res = await fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token }});
  const data = await res.json();
  setAuthUI(data.user || null);
}

function setAuthUI(user) {
  currentUser = user;
  // update UI
  const adminTab = document.getElementById('tab-admin');
  const authArea = document.getElementById('auth-area');
  if (user) {
    authArea.innerHTML = `<div style="display:flex;gap:8px;align-items:center">
      <strong style="color:#ffd6b3">${escapeHtml(user.username)}</strong>
      <button id="btn-logout">Salir</button>
    </div>`;
    document.getElementById('btn-logout').addEventListener('click', () => {
      localStorage.removeItem('token'); setAuthUI(null);
    });
    if (user.role === 'admin' || user.role === 'moderator') { adminTab.style.display = 'block'; }
  } else {
    authArea.innerHTML = `
      <input id="login-user" placeholder="usuario" />
      <input id="login-pass" placeholder="contraseña" type="password" />
      <button id="btn-login">Entrar</button>
      <button id="btn-show-register">Registrarse</button>`;
    document.getElementById('btn-login').addEventListener('click', login);
    document.getElementById('btn-show-register').addEventListener('click', showRegisterPrompt);
  }
}

async function login() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  if (!user || !pass) return alert('Introduce usuario y contraseña');
  const res = await fetch('/api/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username: user, password: pass })
  });
  if (!res.ok) return alert('Credenciales inválidas');
  const data = await res.json();
  localStorage.setItem('token', data.token);
  await refreshMe();
  // reconnect socket with token
  initSocket();
}

async function showRegisterPrompt() {
  const username = prompt('Nombre de usuario (sin espacios):');
  if (!username) return;
  const password = prompt('Contraseña:');
  if (!password) return;
  const res = await fetch('/api/auth/register', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) return alert('No se pudo registrar. Usuario existente?');
  const data = await res.json();
  localStorage.setItem('token', data.token);
  await refreshMe();
  initSocket();
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// init
refreshMe();
