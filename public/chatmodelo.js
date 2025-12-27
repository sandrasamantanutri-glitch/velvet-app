// ===============================
// CHAT MODELO — VERSÃO ESTÁVEL
// ===============================

const socket = window.socket;
const modelo = localStorage.getItem("modeloPerfil");

if (!modelo) {
  alert("Modelo não identificada");
  throw new Error("modeloPerfil ausente");
}

const state = {
  clientes: [],
  clienteAtual: null
};

// ===============================
// DOM
// ===============================
const lista = document.getElementById("listaClientes");
const chatBox = document.getElementById("chatBox");
const clienteNome = document.getElementById("clienteNome");
const input = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  socket.emit("auth", { token: localStorage.getItem("token") });

  socket.on("connect", async () => {
    socket.emit("loginModelo", modelo);
    await carregarClientesVip();

    // entra em todas as salas
    state.clientes.forEach(c => {
      socket.emit("joinRoom", { cliente: c, modelo });
    });
  });

  socket.on("chatHistory", renderHistorico);
  socket.on("newMessage", renderMensagem);
});

// ===============================
// CLIENTES VIP
// ===============================
async function carregarClientesVip() {
  const res = await fetch(`/api/modelo/${modelo}/vips`, {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });

  const clientes = await res.json();
  if (!Array.isArray(clientes)) return;

  state.clientes = clientes.map(c => c.cliente || c);
  lista.innerHTML = "";

  state.clientes.forEach(c => {
    const li = document.createElement("li");
    li.textContent = c;
    li.onclick = () => abrirChat(c);
    lista.appendChild(li);
  });
}

// ===============================
// CHAT
// ===============================
function abrirChat(cliente) {
  state.clienteAtual = cliente;
  clienteNome.textContent = cliente;
  chatBox.innerHTML = "";

  socket.emit("joinRoom", { cliente, modelo });
}

// ===============================
// ENVIO
// ===============================
sendBtn.onclick = () => {
  if (!state.clienteAtual) return;

  const text = input.value.trim();
  if (!text) return;

  socket.emit("sendMessage", {
    cliente: state.clienteAtual,
    modelo,
    text
  });

  input.value = "";
};

// ===============================
// RENDER
// ===============================
function renderHistorico(msgs) {
  chatBox.innerHTML = "";
  msgs.forEach(renderMensagem);
}

function renderMensagem(msg) {
  if (msg.cliente !== state.clienteAtual) return;

  const div = document.createElement("div");
  div.className = msg.from === modelo ? "msg-modelo" : "msg-cliente";
  div.textContent = msg.text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
