// ===============================
// CHAT CLIENTE — VERSÃO ESTÁVEL
// ===============================

let cliente = null;
const socket = window.socket;

const state = {
  modelos: [],
  modeloAtual: null
};

// ===============================
// DOM
// ===============================
const lista = document.getElementById("listaModelos");
const chatBox = document.getElementById("chatBox");
const modeloNome = document.getElementById("modeloNome");
const input = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  socket.emit("auth", { token: localStorage.getItem("token") });

  socket.on("connect", async () => {
    await carregarCliente();
    await carregarModelos();

    const modeloSalvo = localStorage.getItem("chatModelo");
    if (modeloSalvo) abrirChat(modeloSalvo);
  });

  socket.on("chatHistory", renderHistorico);
  socket.on("newMessage", renderMensagem);
});

// ===============================
// CLIENTE
// ===============================
async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });
  const data = await res.json();
  cliente = data.nome;
}

// ===============================
// MODELOS VIP
// ===============================
async function carregarModelos() {
  const res = await fetch("/api/cliente/modelos", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });

  const modelos = await res.json();
  if (!Array.isArray(modelos)) return;

  state.modelos = modelos;
  lista.innerHTML = "";

  modelos.forEach(nome => {
    const li = document.createElement("li");
    li.textContent = nome;
    li.onclick = () => abrirChat(nome);
    lista.appendChild(li);
  });
}

// ===============================
// CHAT
// ===============================
function abrirChat(nomeModelo) {
  state.modeloAtual = nomeModelo;
  modeloNome.textContent = nomeModelo;
  chatBox.innerHTML = "";

  localStorage.setItem("chatModelo", nomeModelo);
  socket.emit("joinRoom", { cliente, modelo: nomeModelo });
}

// ===============================
// ENVIO
// ===============================
sendBtn.onclick = () => {
  if (!state.modeloAtual) return;

  const text = input.value.trim();
  if (!text) return;

  socket.emit("sendMessage", {
    cliente,
    modelo: state.modeloAtual,
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
  const div = document.createElement("div");
  div.className = msg.from === cliente ? "msg-cliente" : "msg-modelo";
  div.textContent = msg.text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
