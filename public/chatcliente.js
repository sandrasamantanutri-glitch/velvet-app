// ===============================
// CHAT CLIENTE — FINAL CORRIGIDO
// ===============================

const socket = window.socket;
let cliente = null;

const state = {
  modelos: [],
  modeloAtual: null
};

const lista = document.getElementById("listaModelos");
const chatBox = document.getElementById("chatBox");
const modeloNome = document.getElementById("modeloNome");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

// 🔥 LISTENERS DO CHAT (ESTAVAM FALTANDO)
socket.on("chatHistory", renderHistorico);
socket.on("newMessage", renderMensagem);

document.addEventListener("DOMContentLoaded", async () => {
  socket.emit("auth", { token: localStorage.getItem("token") });

  socket.on("connect", async () => {
    await carregarCliente();
    socket.emit("loginCliente", cliente);
    await carregarModelos();
  });
});

async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });
  const data = await res.json();
  cliente = data.nome;
}

async function carregarModelos() {
  const res = await fetch("/api/cliente/modelos", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });

  const modelos = await res.json();
  lista.innerHTML = "";

  modelos.forEach(nome => {
    const li = document.createElement("li");
    li.textContent = nome;
    li.onclick = () => abrirChat(nome);
    lista.appendChild(li);
  });
}

function abrirChat(nomeModelo) {
  state.modeloAtual = nomeModelo;
  modeloNome.textContent = nomeModelo;
  chatBox.innerHTML = "";

  socket.emit("joinRoom", {
    cliente,
    modelo: nomeModelo
  });
}

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

// ⌨️ ENTER envia mensagem (Shift+Enter quebra linha)
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.onclick();
  }
});



function renderHistorico(msgs) {
  chatBox.innerHTML = "";
  msgs.forEach(renderMensagem);
}

function renderMensagem(msg) {
  if (msg.modelo !== state.modeloAtual) return;

  const div = document.createElement("div");
  div.className =
    msg.from === cliente ? "msg-cliente" : "msg-modelo";

  div.textContent = msg.text;
  chatBox.appendChild(div);

  chatBox.scrollTop = chatBox.scrollHeight;
}


