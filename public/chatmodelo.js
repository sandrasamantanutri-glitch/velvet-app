// ===============================
// CHAT MODELO — FINAL
// ===============================

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

  socket.emit("joinChat", { cliente_id, modelo_id });
  socket.emit("getHistory", { cliente_id, modelo_id });

  document.getElementById("sendBtn").onclick = enviarMensagem;
});

// ===============================
// FUNÇÕES
// ===============================
async function carregarModelo() {
  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });
  const data = await res.json();
  modelo_id = data.id;
}

function carregarClienteAtual() {
  cliente_id = localStorage.getItem("clienteChatAtivo");
}

function enviarMensagem() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

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
