// ===============================
// AUTH
// ===============================
const token = localStorage.getItem("token");
if (!token) {
  location.href = "/app/index.html";
}

// ===============================
// SOCKET (SÓ INBOX)
// ===============================
const socket = io("https://velvet-test-production.up.railway.app", {
  auth: { token: "Bearer " + token }
});

const inboxEl = document.getElementById("inbox");
let modeloId = null;

// ===============================
// INIT
// ===============================
async function init() {
  const res = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return logout();

  const me = await res.json();
  if (me.role !== "modelo") return logout();

  modeloId = me.id;

  // entra SOMENTE na inbox
  socket.emit("joinInbox", { modelo_id: modeloId });

  await carregarInbox();
}

init();

// ===============================
// FETCH INBOX
// ===============================
async function carregarInbox() {
  const res = await fetch("/api/chat/modelo", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    console.error("Erro inbox:", res.status);
    return;
  }

  const chats = await res.json();
  renderInbox(chats);
}

// ===============================
// RENDER
// ===============================
function renderInbox(chats) {
  inboxEl.innerHTML = "";

  if (!Array.isArray(chats) || chats.length === 0) {
    inboxEl.innerHTML = `
      <div style="padding:16px;color:#aaa">
        Nenhum cliente ainda.
      </div>
    `;
    return;
  }

  chats.forEach(c => {
    const div = document.createElement("div");
    div.className = "chat-item";
    div.onclick = () => abrirChat(c.cliente_id);

    div.innerHTML = `
      <div class="avatar">
        ${c.avatar ? `<img src="${c.avatar}" />` : ""}
      </div>

      <div class="chat-body">
        <div class="chat-top">
          <strong>${c.username || c.nome || "Cliente"}</strong>
          <span class="chat-time"></span>
        </div>

        <div class="chat-last">
          <span></span>
        </div>
      </div>
    `;

    inboxEl.appendChild(div);
  });
}

// ===============================
// REALTIME
// ===============================
socket.on("inboxMessage", () => {
  carregarInbox(); // simples e estável
});

// ===============================
// HELPERS
// ===============================
function abrirChat(clienteId) {
  location.href = `/app/chat.html?cliente=${clienteId}`;
}

function logout() {
  localStorage.clear();
  location.href = "/app/index.html";
}
