// ===============================
// CHAT CLIENTE — SIMPLES E CORRETO
// ===============================

const socket = window.socket;

let cliente = null;

const state = {
  modelos: [],          // [{ id, nome }]
  modeloAtual: null     // { id, nome }
};

const lista = document.getElementById("listaModelos");
const chatBox = document.getElementById("chatBox");
const modeloNome = document.getElementById("modeloNome");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

// -------------------------------
// SOCKET
// -------------------------------
socket.on("chatHistory", renderHistorico);
socket.on("newMessage", renderMensagem);

document.addEventListener("DOMContentLoaded", async () => {
  socket.emit("auth", { token: localStorage.getItem("token") });

  socket.on("connect", async () => {
    await carregarCliente();
    await carregarModelos();
  });
});

// -------------------------------
// DADOS DO CLIENTE
// -------------------------------
async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });

  const data = await res.json();

  cliente = {
    id: data.id,
    nome: data.nome
  };
}

// -------------------------------
// LISTA DE MODELOS
// -------------------------------
async function carregarModelos() {
  const res = await fetch("/api/cliente/modelos", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });

  state.modelos = await res.json(); // [{ id, nome }]
  renderListaModelos();
}

function renderListaModelos() {
  lista.innerHTML = "";

  state.modelos.forEach(modelo => {
    const li = document.createElement("li");
    li.textContent = modelo.nome;
    li.onclick = () => abrirChat(modelo);
    lista.appendChild(li);
  });
}

// -------------------------------
// ABRIR CHAT
// -------------------------------
function abrirChat(modelo) {
  state.modeloAtual = modelo;

  modeloNome.textContent = modelo.nome;
  chatBox.innerHTML = "";

  socket.emit("joinRoom", {
    clienteId: cliente.id,
    modeloId: modelo.id
  });
}

// -------------------------------
// ENVIAR MENSAGEM
// -------------------------------
sendBtn.onclick = () => {
  if (!state.modeloAtual) return;

  const text = input.value.trim();
  if (!text) return;

  socket.emit("sendMessage", {
    clienteId: cliente.id,
    modeloId: state.modeloAtual.id,
    text
  });

  input.value = "";
};

// ENTER envia
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.onclick();
  }
});

// -------------------------------
// CHAT
// -------------------------------
function renderHistorico(msgs) {
  chatBox.innerHTML = "";
  msgs.forEach(renderMensagem);
}

function renderMensagem(msg) {
  if (!state.modeloAtual) return;
  if (msg.modeloId !== state.modeloAtual.id) return;

  const div = document.createElement("div");
  div.className =
    msg.from === cliente.id ? "msg-cliente" : "msg-modelo";

  div.textContent = msg.text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
