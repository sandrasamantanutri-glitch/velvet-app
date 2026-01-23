// ===============================
// PARAMS E ELEMENTOS
// ===============================
const params = new URLSearchParams(window.location.search);
const clienteId = params.get("cliente");

const chatBox = document.getElementById("chatBox");
const input = document.getElementById("mensagem");
const token = localStorage.getItem("token");

if (!token || !clienteId) {
  window.location.href = "/frontend/index.html";
}

// ===============================
// SOCKET (AUTENTICADO)
// ===============================
const socket = io({
  auth: { token },
  transports: ["websocket", "polling"]
});

let modeloId = null;

// ===============================
// INIT
// ===============================
async function initChat() {
  // 🔐 pega modelo logado
  const res = await fetch("/api/auth/me", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const me = await res.json();
  modeloId = me.id;

  // 🔗 entra na sala correta
  socket.emit("join", {
    modelo_id: modeloId,
    cliente_id: clienteId
  });

  // 📥 carrega histórico inicial
  await carregarChat();
}

initChat();

// ===============================
// SOCKET LISTENERS
// ===============================
socket.on("message", msg => {
  // só renderiza se for dessa conversa
  if (msg.cliente_id != clienteId) return;

  renderMessage(msg);
});

// ===============================
// CARREGAR CHAT
// ===============================
async function carregarChat() {
  const res = await fetch(`/api/chat/${clienteId}`, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const mensagens = await res.json();
  chatBox.innerHTML = "";

  mensagens.forEach(renderMessage);
  scrollBottom();
}

// ===============================
// ENVIAR MENSAGEM
// ===============================
async function enviar() {
  const text = input.value.trim();
  if (!text) return;

  // grava no backend
  await fetch("https://velvet-test-production.up.railway.app/api/chat/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({
      cliente_id: clienteId,
      text,
      sender: "modelo"
    })
  });

  input.value = "";
}

// ===============================
// ENTER PARA ENVIAR
// ===============================
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviar();
  }
});

// ===============================
// RENDER
// ===============================
function renderMessage(m) {
  const div = document.createElement("div");
  div.className = `msg ${
    m.sender === "modelo" ? "msg-modelo" : "msg-cliente"
  }`;

  let status = "";
  if (m.sender === "modelo") {
    if (m.visto) status = "✓✓ Lido";
    else if (m.lida) status = "✓ Entregue";
    else status = "✓ Enviado";
  }

  div.innerHTML = `
    <span>${m.text}</span>
    ${status ? `<small class="status">${status}</small>` : ""}
  `;

  chatBox.appendChild(div);
  scrollBottom();
}

function scrollBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ===============================
// VOLTAR
// ===============================
function voltar() {
  window.location.href = "/frontend/inbox.html";
}
