// ===============================
// CHAT MODELO — FINAL FUNCIONAL
// ===============================

const socket = window.socket;
const modelo = localStorage.getItem("modeloPerfil");

const state = {
  clientes: [],
  clienteAtual: null
};

const lista = document.getElementById("listaClientes");
const chatBox = document.getElementById("chatBox");
const clienteNome = document.getElementById("clienteNome");
const input = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

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

async function carregarClientesVip() {
  const res = await fetch(`/api/modelo/${modelo}/vips`, {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });

  const clientes = await res.json();
  state.clientes = clientes.map(c => c.cliente);

  lista.innerHTML = "";
  state.clientes.forEach(c => {
    const li = document.createElement("li");
    li.textContent = c;
    li.onclick = () => abrirChat(c);
    lista.appendChild(li);
  });
}

function abrirChat(cliente) {
  state.clienteAtual = cliente;
  clienteNome.textContent = cliente;
  chatBox.innerHTML = "";

  socket.emit("joinRoom", { cliente, modelo });
}

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
}
