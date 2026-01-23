const token = localStorage.getItem("token");
if (!token) location.href = "/app/index.html";

// 🔌 SOCKET
const socket = io("https://velvet-test-production.up.railway.app", {
  auth: { token: "Bearer " + token }
});

let modeloId = null;
const inboxEl = document.getElementById("inbox");

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

  socket.emit("joinInbox", { modelo_id: modeloId });

  carregarInbox();
}

// ===============================
// FETCH INBOX
// ===============================
async function carregarInbox() {
  const res = await fetch("/api/chat/inbox", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const chats = await res.json();
  renderInbox(chats);
}

// ===============================
// RENDER
// ===============================
function renderInbox(chats) {
  inboxEl.innerHTML = "";

  chats.forEach(chat => {
    const div = document.createElement("div");
    div.className = "chat-item";
    div.onclick = () => abrirChat(chat.cliente_id);

    div.innerHTML = `
      <div class="avatar">
        ${
          chat.foto
            ? `<img src="${chat.foto}" />`
            : ``
        }
      </div>

      <div class="chat-body">
        <div class="chat-top">
          <strong>${chat.nome || "Cliente"}</strong>
          <span class="chat-time">${chat.hora || ""}</span>
        </div>

        <div class="chat-last">
          <span>${chat.ultima_mensagem || ""}</span>
          ${
            chat.nao_lidas > 0
              ? `<span class="badge">${chat.nao_lidas}</span>`
              : ""
          }
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
  carregarInbox(); // simples, robusto, sem bugs
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

init();
