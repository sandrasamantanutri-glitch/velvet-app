const socket = io();

const token     = localStorage.getItem("token");
const clienteId = Number(localStorage.getItem("chat_cliente_ativo"));
let modeloId    = null;

// 🔐 autentica socket
socket.emit("auth", { token });

// 🔁 voltar
function voltar() {
  window.location.href = "/chat-app.html";
}

// 🔎 busca dados da modelo logada
fetch("/api/me", {
  headers: { Authorization: "Bearer " + token }
})
.then(res => res.json())
.then(me => {
  modeloId = me.id;

  socket.emit("loginModelo", modeloId);

  const sala = `chat_${clienteId}_${modeloId}`;
  socket.emit("joinChat", { sala });

  carregarCliente();
  carregarHistorico();
});

// 👤 dados do cliente
function carregarCliente() {
  fetch(`/api/cliente/${clienteId}`, {
    headers: { Authorization: "Bearer " + token }
  })
  .then(res => res.json())
  .then(c => {
    document.getElementById("chatNome").innerText = c.nome;
    document.getElementById("chatAvatar").src =
      c.avatar || "/assets/avatarDefault.png";
  });
}

// 📜 histórico
function carregarHistorico() {
  socket.emit("getHistory", {
    cliente_id: clienteId,
    modelo_id: modeloId
  });
}

socket.on("chatHistory", msgs => {
  const box = document.getElementById("chatMensagens");
  box.innerHTML = "";
  msgs.forEach(renderMensagem);
  box.scrollTop = box.scrollHeight;
});

// 💬 nova mensagem realtime
socket.on("newMessage", msg => {
  if (msg.cliente_id === clienteId) {
    renderMensagem(msg);
  }
});

// ✉️ enviar
function enviarMensagem() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  socket.emit("sendMessage", {
    cliente_id: clienteId,
    modelo_id: modeloId,
    text
  });

  input.value = "";
}

// 🎨 render
function renderMensagem(m) {
  const box = document.getElementById("chatMensagens");

  const div = document.createElement("div");
  div.className =
    m.sender === "modelo"
      ? "msg msg-modelo"
      : "msg msg-cliente";

  div.innerText = m.text;

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
