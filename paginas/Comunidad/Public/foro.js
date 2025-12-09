// foro.js
const listaTemasEl = document.getElementById('lista-temas');
const nuevoTemaForm = document.getElementById('nuevo-tema-form');
const tituloIn = document.getElementById('tema-titulo');
const autorIn = document.getElementById('tema-autor');
const contenidoIn = document.getElementById('tema-contenido');
const temaImage = document.getElementById('tema-image');

const API = '/api/foro';

async function cargarTemas(){
  const res = await fetch(API);
  const data = await res.json();
  renderTemas(data);
}
function renderTemas(temas){
  listaTemasEl.innerHTML = '';
  if (!temas || temas.length===0) { listaTemasEl.innerHTML = '<div>No hay temas.</div>'; return; }
  temas.forEach(t => {
    const el = document.createElement('div'); el.className='tema';
    el.innerHTML = `
      <h3>${escapeHtml(t.title)}</h3>
      <div class="meta">por ${escapeHtml(t.author||'Anónimo')} • ${new Date(t.createdAt).toLocaleString()}</div>
      <div class="contenido">${escapeHtml(t.content)}</div>
      ${t.image ? `<div><img src="${escapeHtml(t.image)}" style="max-width:200px;margin-top:8px;border-radius:8px"/></div>` : ''}
      <div style="margin-top:8px">
        <button data-id="${t.id}" class="like-topic">👍 ${t.likes||0}</button>
        <button data-id="${t.id}" class="show-reply">Responder</button>
        <button data-id="${t.id}" class="mod-delete" style="display:none">Eliminar (mod)</button>
      </div>
      <div class="replies" id="replies-${t.id}">${renderRepliesHtml(t.replies)}</div>
      <div class="reply-form" id="reply-form-${t.id}" style="display:none;margin-top:8px;">
        <input id="reply-author-${t.id}" placeholder="Tu alias (opcional)"/>
        <input id="reply-image-${t.id}" type="file" accept="image/*"/>
        <input id="reply-input-${t.id}" placeholder="Respuesta..." />
        <button data-id="${t.id}" class="send-reply">Enviar</button>
      </div>
    `;
    listaTemasEl.appendChild(el);
  });

  // eventos
  document.querySelectorAll('.send-reply').forEach(btn=>{
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const input = document.getElementById(`reply-input-${id}`);
      const author = document.getElementById(`reply-author-${id}`);
      const fileInput = document.getElementById(`reply-image-${id}`);
      const text = input.value.trim(); if(!text) return alert('Escribe algo');
      const form = new FormData();
      form.append('content', text);
      if (fileInput && fileInput.files[0]) form.append('image', fileInput.files[0]);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/${id}/reply`, { method:'POST', body:form, headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if (!res.ok) return alert('No se pudo enviar respuesta (¿logueado?)');
      input.value=''; author.value=''; if(fileInput) fileInput.value='';
      await cargarTemas();
    });
  });

  document.querySelectorAll('.show-reply').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.id;
      const node = document.getElementById(`reply-form-${id}`);
      node.style.display = node.style.display === 'none' ? 'block' : 'none';
    });
  });

  document.querySelectorAll('.like-topic').forEach(b => {
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
      const token = localStorage.getItem('token');
      if (!token) return alert('Debes autenticarte para dar like');
      const res = await fetch('/api/like', { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + token }, body: JSON.stringify({ targetType:'topic', targetId: id })});
      if (!res.ok) return alert('Error like');
      await cargarTemas();
    });
  });

  // moderation delete buttons (if visible)
  document.querySelectorAll('.mod-delete').forEach(btn=>{
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('Eliminar topic?')) return;
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/mod/topic/${id}`, { method:'DELETE', headers: { Authorization: 'Bearer ' + token }});
      if (!res.ok) return alert('No autorizado');
      await cargarTemas();
    });
  });
}

function renderRepliesHtml(replies){
  if (!replies || replies.length===0) return '<div class="muted">Sin respuestas</div>';
  return replies.map(r => `
    <div class="reply"><strong>${escapeHtml(r.author)}</strong> • ${new Date(r.createdAt).toLocaleString()}<div>${escapeHtml(r.content)}</div>
    ${r.image ? `<div><img src="${escapeHtml(r.image)}" style="max-width:160px;border-radius:6px;margin-top:6px"/></div>` : ''}
    <div><button data-id="${r.id}" class="like-reply">👍</button>
    <button data-id="${r.id}" class="mod-del-reply" style="display:none">Eliminar (mod)</button></div>
    </div>
  `).join('');
}

nuevoTemaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = tituloIn.value.trim(); const content = contenidoIn.value.trim();
  if (!title || !content) return alert('Título y contenido requeridos');
  const form = new FormData();
  form.append('title', title);
  form.append('content', content);
  const f = temaImage.files[0]; if (f) form.append('image', f);
  const token = localStorage.getItem('token');
  const res = await fetch(API, { method:'POST', body: form, headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) return alert('Error creando tema (¿logueado?)');
  tituloIn.value=''; contenidoIn.value=''; temaImage.value='';
  await cargarTemas();
});

// simple utilities
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

cargarTemas();
