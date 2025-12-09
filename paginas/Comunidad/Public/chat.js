// chat.js
let socket;
function initSocket(){
  const token = localStorage.getItem('token');
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });

  const chatWindow = document.getElementById('chat-window');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  function renderMessage(msg) {
    const el = document.createElement('div');
    el.className = 'msg';
    el.innerHTML = `<div class="meta"><strong>${escapeHtml(msg.author)}</strong> • ${new Date(msg.ts).toLocaleString()}</div>
                    <div class="text">${escapeHtml(msg.text)}</div>`;
    chatWindow.appendChild(el);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  socket.on('connect', ()=>{});
  socket.on('chat:message', (msg) => renderMessage(msg));

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit('chat:message', { text });
    chatInput.value = '';
  });
}
initSocket();

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
