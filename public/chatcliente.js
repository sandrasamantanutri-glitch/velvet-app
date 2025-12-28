// ===============================
// AUTH GUARD — CHAT CLIENTE
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "cliente") {
  window.location.href = "/index.html";
  throw new Error("Acesso negado");
}

const socket = io({
  transports: ["websocket"]
});

let cliente_id = null;
let modelo_id = null;
let chatAtivo = null;

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
  if (
    chatAtivo &&
    msg.cliente_id === chatAtivo.cliente_id &&
    msg.modelo_id === chatAtivo.modelo_id
  ) {
    renderMensagem(msg);
  }
});

socket.on("unreadUpdate", ({ cliente_id, modelo_id }) => {
  document.querySelectorAll("#listaModelos li").forEach(li => {
    if (Number(li.dataset.modeloId) === modelo_id) {
      li.classList.add("nao-lida");
      li.querySelector(".badge").classList.remove("hidden");
    }
  });
});


// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarCliente();
  await carregarListaModelos();

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
async function carregarListaModelos() {
  const res = await fetch("/api/chat/cliente", {
    headers: { Authorization: "Bearer " + token }
  });

  const modelos = await res.json();
  const lista = document.getElementById("listaModelos");

  lista.innerHTML = "";

  if (!modelos.length) {
    lista.innerHTML = "<li>Você não tem modelos VIP.</li>";
    return;
  }

  modelos.forEach(m => {
   const li = document.createElement("li");
   li.className = "chat-item";
   li.dataset.modeloId = m.modelo_id;
   
   li.innerHTML = `
  <span class="nome">${m.nome}</span>
  <span class="badge hidden">Não lida</span>
  `;

    li.onclick = () => {
      modelo_id = m.modelo_id;
      chatAtivo = { cliente_id, modelo_id };
      li.classList.remove("nao-lida");
      li.querySelector(".badge").classList.add("hidden");

      document.getElementById("modeloNome").innerText = m.nome;

      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.emit("joinChat", { sala });
      socket.emit("getHistory", { cliente_id, modelo_id });
    };

    lista.appendChild(li);
  });
  const unreadRes = await fetch("/api/chat/unread/cliente", {
  headers: { Authorization: "Bearer " + token }
});
const unreadIds = await unreadRes.json();

document.querySelectorAll("#listaModelos li").forEach(li => {
  if (unreadIds.includes(Number(li.dataset.modeloId))) {
  li.classList.add("nao-lida");
  li.querySelector(".badge").classList.remove("hidden");
}
});

}

async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();
  cliente_id = data.id;

  socket.emit("loginCliente", cliente_id);
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

  const minhaRole = localStorage.getItem("role"); // 'cliente' ou 'modelo'
  const classe =
    msg.sender === minhaRole ? "msg msg-cliente" : "msg msg-modelo";

  div.className = classe;
  div.textContent = msg.text;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function marcarNaoLida(msg) {
  document.querySelectorAll("#listaModelos li").forEach(li => {
    if (Number(li.dataset.modeloId) === msg.modelo_id) {
      li.classList.add("nao-lida");
      li.querySelector(".badge").classList.remove("hidden");
    }
  });
}

function adicionarMensagemNoChat(msg) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;

  const div = document.createElement("div");
  div.className = msg.sender === "cliente" ? "msg cliente" : "msg modelo";
  div.innerText = msg.text;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}


