const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "modelo") {
  window.location.href = "/index.html";
  throw new Error("Acesso negado");
}

const socket = io({
  transports: ["websocket"]
});

let modelo_id = null;
let cliente_id = null;
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

  atualizarStatusPorResponder(mensagens);
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

socket.on("unreadUpdate", ({ cliente_id }) => {
  document.querySelectorAll("#listaClientes li").forEach(li => {
    if (Number(li.dataset.clienteId) === cliente_id) {
      setStatusChat(li, "nao-lida", "Não lida");
    }
  });
  organizarListaChats();
});

socket.on("novoAssinante", ({ cliente_id, nome }) => {
adicionarNovoClienteNaLista(cliente_id, nome);
organizarListaChats();
});

socket.on("mensagensLidas", ({ cliente_id }) => {
  // atualiza mensagens visuais (se estiver no chat aberto)
  document.querySelectorAll(".msg.modelo").forEach(msg => {
    msg.classList.add("lida");
  });

  // atualiza estado do chat na lista
  const item = [...document.querySelectorAll(".chat-item")]
    .find(li => Number(li.dataset.clienteId) === cliente_id);

  if (item) {
    setStatusChat(item, "visto", "✓✓");
    organizarListaChats();
  }
});

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarModelo();   
  await carregarListaClientes();
  await aplicarUnreadModelo();

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
async function carregarListaClientes() {
  const res = await fetch("/api/chat/modelo", {
    headers: { Authorization: "Bearer " + token }
  });

  const clientes = await res.json();
  const lista = document.getElementById("listaClientes");

  lista.innerHTML = "";

  if (!clientes.length) {
    lista.innerHTML = "<li>Nenhum cliente VIP ainda.</li>";
    return;
  }

  clientes.forEach(c => {
const li = document.createElement("li");
li.className = "chat-item";
li.dataset.clienteId = c.cliente_id;

li.innerHTML = `
  <span class="nome">${c.nome}</span>
  <span class="badge hidden"></span>
`;

setStatusChat(li, "normal");


    li.onclick = () => {
      cliente_id = c.cliente_id;
      chatAtivo = { cliente_id, modelo_id };

      document.getElementById("clienteNome").innerText = c.nome;

      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.emit("joinChat", { sala });
      socket.emit("getHistory", { cliente_id, modelo_id });
    };

    lista.appendChild(li);
  });
  organizarListaChats();
}

async function carregarModelo() {
  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();
  modelo_id = data.user_id ?? data.id;

  socket.emit("loginModelo", modelo_id);
}

async function aplicarUnreadModelo() {
  const res = await fetch("/api/chat/unread/modelo", {
    headers: { Authorization: "Bearer " + token }
  });

  const unreadIds = await res.json();

  document.querySelectorAll("#listaClientes li").forEach(li => {
    if (unreadIds.includes(Number(li.dataset.clienteId))) {
    setStatusChat(li, "nao-lida", "Não lida");
    }
  });
  organizarListaChats();
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

  const item = [...document.querySelectorAll("#listaClientes li")]
  .find(li => Number(li.dataset.clienteId) === cliente_id);

if (item) {
  setStatusChat(item, "normal");
}

  input.value = "";
  
  organizarListaChats();
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

function atualizarStatusPorResponder(mensagens) {
  if (!mensagens || mensagens.length === 0) return;

  const ultima = mensagens[mensagens.length - 1];
  const minhaRole = localStorage.getItem("role"); // cliente | modelo

  const item = [...document.querySelectorAll(".chat-item")]
    .find(li =>
      minhaRole === "cliente"
        ? Number(li.dataset.modeloId) === ultima.modelo_id
        : Number(li.dataset.clienteId) === ultima.cliente_id
    );

  if (!item) return;

  const badge = item.querySelector(".badge");

  // ✅ última mensagem NÃO foi minha → por responder
  if (ultima.sender !== minhaRole) {
  setStatusChat(item, "por-responder", "Por responder");
  }
  // ✅ última mensagem foi minha → limpa tudo
  else {
    setStatusChat(item, "visto", "✓");
  }
  organizarListaChats();
}

function adicionarNovoClienteNaLista(cliente_id, nome) {
  const lista = document.getElementById("listaClientes");

  const existente = [...lista.querySelectorAll("li")]
    .find(li => Number(li.dataset.clienteId) === cliente_id);

  if (existente) return;

  const li = document.createElement("li");
li.className = "chat-item";
li.dataset.clienteId = cliente_id;

li.innerHTML = `
  <span class="nome">${nome}</span>
  <span class="badge hidden"></span>
`;

setStatusChat(li, "novo", "Novo");

  li.onclick = () => {
    cliente_id = Number(li.dataset.clienteId);
    chatAtivo = { cliente_id, modelo_id };

    document.getElementById("clienteNome").innerText = nome;

    const sala = `chat_${cliente_id}_${modelo_id}`;
    socket.emit("joinChat", { sala });
    socket.emit("getHistory", { cliente_id, modelo_id });
  };

  lista.prepend(li);
}

function organizarListaChats() {
  const lista = document.getElementById("listaClientes");
  if (!lista) return;

  const itens = [...lista.querySelectorAll(".chat-item")];

  const prioridade = {
    "novo": 1,
    "nao-lida": 2,
    "por-responder": 3,
    "visto": 4,
    "normal": 5
  };

  itens.sort((a, b) => {
    const pa = prioridade[a.dataset.status || "normal"];
    const pb = prioridade[b.dataset.status || "normal"];
    return pa - pb;
  });

  itens.forEach(li => lista.appendChild(li));
}

function setStatusChat(li, status, textoBadge = null) {
  // limpa qualquer estado anterior
  li.dataset.status = status;

  const badge = li.querySelector(".badge");
  if (!badge) return;

  // limpa visual
  badge.classList.add("hidden");
  badge.innerText = "";

  // aplica novo estado visual
  if (textoBadge) {
    badge.innerText = textoBadge;
    badge.classList.remove("hidden");
  }
}


