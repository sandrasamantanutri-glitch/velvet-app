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

  await carregarListaClientes();
}

init();

// ===============================
// FETCH INBOX
// ===============================
async function carregarListaClientes() {
  const res = await fetch("/api/chat/modelo", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    console.error("Erro ao carregar inbox");
    return;
  }

  const clientes = await res.json();
  inboxEl.innerHTML = "";

  if (!Array.isArray(clientes) || clientes.length === 0) {
    inboxEl.innerHTML = `
      <div class="inbox-empty">
        Nenhum cliente ainda.
      </div>
    `;
    return;
  }

  clientes.forEach(c => {
    const div = document.createElement("div");
    div.className = "chat-item";
    div.onclick = () => abrirChat(c.cliente_id);

    div.innerHTML = `
  <div class="avatar">
    ${c.avatar ? `<img src="${c.avatar}" />` : ""}
  </div>

  <div class="chat-body">
    
    <!-- LINHA 1 -->
    <div class="chat-top">
      <span class="chat-name">
        ${c.username || c.nome || "Cliente"}
      </span>

      <span class="chat-time">
        ${formatarHora(c.ultima_mensagem_em)}
      </span>
    </div>

    <!-- LINHA 2 -->
    <div class="chat-bottom">
      <span class="chat-last">
        ${c.ultima_mensagem || ""}
      </span>

      <div class="chat-badges">
        ${
          c.nao_lidas > 1
            ? `<span class="badge">${c.nao_lidas}</span>`
            : c.nao_lidas === 1
              ? `<span class="badge-dot"></span>`
              : ""
        }

        ${
          c.ultimo_sender === "cliente" &&
          c.ultima_vista === true &&
          c.nao_lidas === 0
            ? `<span class="badge-reply">Necessita responder</span>`
            : ""
        }
      </div>
    </div>

  </div>
`;
    inboxEl.appendChild(div);
  });
}

function formatarHora(data) {
  if (!data) return "";
  const d = new Date(data);
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}


// ===============================
// REALTIME
// ===============================
socket.on("inboxMessage", () => {
  carregarListaClientes();
});

// ===============================
// HELPERS
// ===============================
function abrirChat(clienteId) {
  window.location.href = `/app/chat.html?cliente=${clienteId}`;
}

function logout() {
  localStorage.clear();
  location.href = "/app/index.html";
}

window.addEventListener("focus", () => {
  carregarListaClientes();
});
