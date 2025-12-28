// ===============================
// AUTH GUARD — CHAT CLIENTE
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "cliente") {
  window.location.href = "/index.html";
  throw new Error("Acesso negado");
}

const socket = io({
  transports: ["websocket"]
});

let cliente_id = null;
let modelo_id = null;

// 🔐 SOCKET AUTH
socket.on("connect", () => {
  socket.emit("auth", {
    token: localStorage.getItem("token")
  });
});

// 📜 HISTÓRICO
socket.on("chatHistory", mensagens => {
  const chat = document.getElementById("chatBox");
  chat.innerHTML = "";

  mensagens.forEach(m => renderMensagem(m));
});

// 💬 NOVA MENSAGEM
socket.on("newMessage", msg => {
  renderMensagem(msg);
});

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarCliente();
  await carregarModelo();

  socket.emit("joinChat", {
  sala: `chat_${cliente_id}_${modelo_id}`
});

  socket.emit("getHistory", { cliente_id, modelo_id });

  const sendBtn = document.getElementById("sendBtn");
  const input   = document.getElementById("messageInput");
  sendBtn.onclick = enviarMensagem;

  input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    enviarMensagem();
  }
});
});


// ===============================
// FUNÇÕES
// ===============================
async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    alert("Sessão expirada");
    window.location.href = "/index.html";
    throw new Error("Cliente inválido");
  }

  const data = await res.json();
  cliente_id = data.id;
}

async function carregarModelo() {
  modelo_id = localStorage.getItem("modelo_id");

  if (!modelo_id) {
    alert("Modelo não identificada. Volte ao perfil.");
    window.location.href = "/clientHome.html";
    throw new Error("modelo_id ausente");
  }
}

function enviarMensagem() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  if (!cliente_id || !modelo_id) {
    alert("Erro de sessão. Recarregue a página.");
    return;
  }

  socket.emit("sendMessage", {
    cliente_id,
    modelo_id,
    text
  });

  input.value = "";
}

function renderMensagem(msg) {
  const chat = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.className = "msg";
  div.textContent = msg.text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
