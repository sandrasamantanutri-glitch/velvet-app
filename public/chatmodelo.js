// ===============================
// CHAT MODELO — FINAL FUNCIONAL
// ===============================

const socket = window.socket;
const modelo = localStorage.getItem("modeloPerfil");

const state = {
  clientes: [],
  clienteAtual: null
};
const clientesMeta = {};

const lista = document.getElementById("listaClientes");
const chatBox = document.getElementById("chatBox");
const clienteNome = document.getElementById("clienteNome");
const input = document.getElementById("messageInput");
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
const res = await fetch("/api/modelo/vips", {
  headers: { Authorization: "Bearer " + localStorage.getItem("token") }
});
  const clientes = await res.json();
  state.clientes = clientes.map(c => c.cliente);
  lista.innerHTML = "";
  state.clientes.forEach(c => {
    if (!clientesMeta[c]) {
      clientesMeta[c] = {
        novo: true,
        naoLido: false,
        ultimaMsgModeloEm: null
      };
    }
  })
   renderListaClientes();
}

function abrirChat(cliente) {
  state.clienteAtual = cliente;
  clienteNome.textContent = cliente;
  chatBox.innerHTML = "";

  clientesMeta[cliente].novo = false;
  clientesMeta[cliente].naoLido = false;

  renderListaClientes();

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

  clientesMeta[state.clienteAtual].ultimaMsgModeloEm = Date.now();
  renderListaClientes();

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

  if (msgs.length > 0 && state.clienteAtual) {
    clientesMeta[state.clienteAtual].novo = false;
    renderListaClientes();
  }

  msgs.forEach(renderMensagem);
}



function renderMensagem(msg) {
  if (msg.from !== modelo && msg.cliente !== state.clienteAtual) {
    clientesMeta[msg.cliente].naoLido = true;
    renderListaClientes();
  }

  if (msg.cliente !== state.clienteAtual) return;

  const div = document.createElement("div");
  div.className = msg.from === modelo ? "msg-modelo" : "msg-cliente";
  div.textContent = msg.text;
  chatBox.appendChild(div);
}



function renderListaClientes() {
  lista.innerHTML = "";

const ordenados = [...state.clientes].sort((a, b) => {
  const A = clientesMeta[a];
  const B = clientesMeta[b];

  // 1️⃣ Novo primeiro
  if (A.novo !== B.novo) return A.novo ? -1 : 1;

  // 2️⃣ Não lido depois
  if (A.naoLido !== B.naoLido) return A.naoLido ? -1 : 1;

  // 3️⃣ Última mensagem enviada pela modelo
  const tA = A.ultimaMsgModeloEm || 0;
  const tB = B.ultimaMsgModeloEm || 0;

  return tB - tA;
});

  ordenados.forEach(cliente => {
    const meta = clientesMeta[cliente];

    const li = document.createElement("li");
    li.onclick = () => abrirChat(cliente);

    let label = cliente;
    if (meta.novo) label = "🆕 Novo — " + label;
    else if (meta.naoLido) label = "🔴 Não lido — " + label;

    const hora = meta.ultimaMsgModeloEm
      ? new Date(meta.ultimaMsgModeloEm).toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : "";

    li.innerHTML = `
      <span>${label}</span>
      <small style="float:right; opacity:0.6">${hora}</small>
    `;

    lista.appendChild(li);
  });
}