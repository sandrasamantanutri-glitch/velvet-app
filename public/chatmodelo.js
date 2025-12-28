const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "modelo") {
  window.location.href = "/index.html";
  throw new Error("Acesso negado");
}

const socket = io({
  transports: ["websocket"]
});

let modelo_id = null;
let cliente_id = null;

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
  await carregarModelo();
  await carregarClienteAtual();

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
async function carregarModelo() {
  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    alert("Sessão expirada");
    window.location.href = "/index.html";
    throw new Error("Modelo inválida");
  }

  const data = await res.json();
  modelo_id = data.id;
}

function carregarClienteAtual() {
  cliente_id = localStorage.getItem("cliente_id");

  if (!cliente_id) {
    alert("Cliente não identificado. Selecione um chat.");
    window.location.href = "/chatmodelo.html";
    throw new Error("cliente_id ausente");
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
