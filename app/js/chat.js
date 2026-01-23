const token = localStorage.getItem("token");
if (!token) location.href = "/app/index.html";

// params
const params = new URLSearchParams(location.search);
const clienteId = Number(params.get("cliente"));

let modeloId = null;
let sala = null;

// socket
const socket = io("https://velvet-test-production.up.railway.app", {
  auth: { token: "Bearer " + token }
});

const chatBox = document.getElementById("chatBox");
const input = document.getElementById("msgInput");

// ===============================
// INIT
// ===============================
async function init() {
  const res = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return logout();

  const me = await res.json();
  modeloId = me.id;

  sala = `chat_${clienteId}_${modeloId}`;

  socket.emit("joinChat", { sala });

  socket.emit("getHistory", {
    cliente_id: clienteId,
    modelo_id: modeloId
  });
}

init();

// ===============================
// HISTÓRICO
// ===============================
socket.on("chatHistory", mensagens => {
  chatBox.innerHTML = "";
  mensagens.forEach(renderMsg);
  scroll();
});

// ===============================
// NOVA MSG
// ===============================
socket.on("newMessage", msg => {
  if (msg.cliente_id !== clienteId) return;
  renderMsg(msg);
  scroll();
});

// ===============================
// ENVIAR
// ===============================
function enviar() {
  const text = input.value.trim();
  if (!text) return;

  socket.emit("sendMessage", {
    cliente_id: clienteId,
    modelo_id: modeloId,
    text
  });

  input.value = "";
}

// enter
input.addEventListener("keydown", e => {
  if (e.key === "Enter") enviar();
});

// ===============================
// RENDER
// ===============================
function renderMsg(msg) {
  const div = document.createElement("div");
  div.className = `msg ${msg.sender}`;
  div.textContent = msg.text;
  chatBox.appendChild(div);
}

// ===============================
function scroll() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

function logout() {
  localStorage.clear();
  location.href = "/app/index.html";
}
