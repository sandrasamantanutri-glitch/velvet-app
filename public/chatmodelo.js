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
    atualizarStatusPorResponder([msg]); // 👈 ADICIONA ISTO
  }
});


socket.on("unreadUpdate", ({ cliente_id, modelo_id }) => {
  document.querySelectorAll("#listaClientes li").forEach(li => {
    if (Number(li.dataset.clienteId) === cliente_id) {
      li.dataset.status = "nao-lida";
      const badge = li.querySelector(".badge");
      badge.innerText = "Não lida";
      badge.classList.remove("hidden");
      
      organizarListaClientes();
    }
  });
});

socket.on("novoAssinante", ({ cliente_id, nome }) => {
adicionarNovoClienteNaLista(cliente_id, nome);
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
  const btnConteudo = document.getElementById("btnEnviarConteudo");

  sendBtn.onclick = enviarMensagem;

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      enviarMensagem();
    }
  });

  // 🔥 AQUI — sempre ativo
  btnConteudo.onclick = abrirPopupConteudos;
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

    // ⏱ timestamp da última mensagem da MODELO
li.dataset.lastTime = c.ultima_msg_modelo_ts
  ? new Date(c.ultima_msg_modelo_ts).getTime()
  : 0;


    // 📌 status inicial vindo do backend
    // esperado: "novo" | "nao-lida" | "por-responder" | "normal"
    li.dataset.status = c.status || "normal";

    li.innerHTML = `
      <span class="nome">${c.nome}</span>
      <span class="badge hidden">Não lida</span>
      <span class="tempo"></span>
    `;

    // 🔔 atualiza badge + tempo
    atualizarBadgeComTempo(li);

    li.onclick = () => {
      cliente_id = c.cliente_id;
      chatAtivo = { cliente_id, modelo_id };

      document.getElementById("clienteNome").innerText = c.nome;

      // 🧹 limpar badge visual
      const badge = li.querySelector(".badge");
      badge.classList.add("hidden");

      // 🔄 atualizar status local
      li.dataset.status = "normal";

      // 🔁 reordenar após mudança de status
      organizarListaClientes();

      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.emit("joinChat", { sala });
      socket.emit("getHistory", { cliente_id, modelo_id });
    };

    lista.appendChild(li);
  });

  // ✅ ordenar SOMENTE depois que todos os itens existirem
  organizarListaClientes();
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
    li.dataset.status = "nao-lida";
    const badge = li.querySelector(".badge");
    badge.innerText = "Não lida";
    badge.classList.remove("hidden");
    }
  });
  organizarListaClientes();
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
  const badge = item.querySelector(".badge");
  badge.classList.add("hidden");
}

if (item) {
  item.dataset.lastTime = Date.now();
  item.dataset.status = "normal";
  atualizarBadgeComTempo(item);
  organizarListaClientes();
}

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

function atualizarStatusPorResponder(mensagens) {
  if (!mensagens || mensagens.length === 0) return;

  const ultima = mensagens[mensagens.length - 1];
  const minhaRole = localStorage.getItem("role"); // cliente | modelo

  const item = [...document.querySelectorAll(".chat-item")].find(li =>
    minhaRole === "cliente"
      ? Number(li.dataset.modeloId) === ultima.modelo_id
      : Number(li.dataset.clienteId) === ultima.cliente_id
  );

  if (!item) return;

  const badge = item.querySelector(".badge");
  let mudou = false;

  // 🚫 nunca sobrepor "novo" ou "nao-lida"
  if (item.dataset.status === "novo" || item.dataset.status === "nao-lida") {
    return;
  }

  // 📩 última mensagem NÃO foi minha → por responder
  if (ultima.sender !== minhaRole) {
    if (item.dataset.status !== "por-responder") {
      item.dataset.status = "por-responder";
      badge.innerText = "Por responder";
      badge.classList.remove("hidden");
      mudou = true;
    }
  }
  // ✅ última mensagem foi minha → volta ao normal
  else {
    if (item.dataset.status !== "normal") {
      item.dataset.status = "normal";
      badge.classList.add("hidden");
      mudou = true;
    }
  }

  // 🔁 reorganiza só se algo mudou
  if (mudou) {
    organizarListaClientes();
  }
}

function adicionarNovoClienteNaLista(cliente_id, nome) {
  const lista = document.getElementById("listaClientes");

  const existente = [...lista.querySelectorAll("li")]
    .find(li => Number(li.dataset.clienteId) === cliente_id);

  if (existente) return;

  const li = document.createElement("li");
  li.className = "chat-item";
  li.dataset.clienteId = cliente_id;
  li.dataset.status = "novo";
  li.dataset.lastTime = Date.now();

  li.innerHTML = `
    <span class="nome">${nome}</span>
    <span class="badge">Novo</span>
    <span class="tempo">${formatarTempo(li.dataset.lastTime)}</span>
  `;

  li.onclick = () => {
    cliente_id = Number(li.dataset.clienteId);
    chatAtivo = { cliente_id, modelo_id };

    document.getElementById("clienteNome").innerText = nome;

    // 🧹 limpar badge e status
    li.dataset.status = "normal";
    const badge = li.querySelector(".badge");
    badge.classList.add("hidden");

    organizarListaClientes();

    const sala = `chat_${cliente_id}_${modelo_id}`;
    socket.emit("joinChat", { sala });
    socket.emit("getHistory", { cliente_id, modelo_id });
  };

  // ➕ adiciona apenas UMA vez
  lista.prepend(li);

  // 🔁 organiza depois de tudo pronto
  organizarListaClientes();
}


function formatarTempo(timestamp) {
  if (!timestamp || timestamp === "0") return "";

  const diff = Date.now() - Number(timestamp);
  const min = Math.floor(diff / 60000);
  const h   = Math.floor(diff / 3600000);
  const d   = Math.floor(diff / 86400000);

  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  if (h < 24) return `${h} h`;
  if (d === 1) return "ontem";
  return `${d} dias`;
}

function organizarListaClientes() {
  const lista = document.getElementById("listaClientes");
  const itens = [...lista.querySelectorAll(".chat-item")];

  const prioridadeStatus = {
    "novo": 1,
    "nao-lida": 2,
    "por-responder": 3,
    "normal": 4
  };

  itens.sort((a, b) => {
    const pa = prioridadeStatus[a.dataset.status] || 4;
    const pb = prioridadeStatus[b.dataset.status] || 4;

    // 1️⃣ prioridade por status
    if (pa !== pb) return pa - pb;

    // 2️⃣ se status igual → mais recente primeiro
    const ta = Number(a.dataset.lastTime || 0);
    const tb = Number(b.dataset.lastTime || 0);
    return tb - ta;
  });

  itens.forEach(li => lista.appendChild(li));
}

function atualizarBadgeComTempo(li) {
  const badge = li.querySelector(".badge");
  if (!badge) return;

  // só mostra tempo se NÃO for novo / não lida / por responder
  if (li.dataset.status === "normal") {
    const texto = formatarTempo(li.dataset.lastTime);
    if (texto) {
      badge.innerText = texto;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
}

function abrirPopupConteudos() {
  if (!cliente_id) {
    alert("Selecione um cliente primeiro.");
    return;
  }

  document.getElementById("popupConteudos").classList.remove("hidden");
  carregarConteudosModelo();
}

function fecharPopupConteudos() {
  document.getElementById("popupConteudos").classList.add("hidden");
}

async function carregarConteudosModelo() {
  const grid = document.getElementById("previewConteudos");
  grid.innerHTML = "";

  const res = await fetch("/api/conteudos", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const conteudos = await res.json();

  if (!conteudos.length) {
    grid.innerHTML = "<p>Nenhum conteúdo disponível.</p>";
    return;
  }

  conteudos.forEach(c => {
    const div = document.createElement("div");
    div.className = "preview-item";
    div.dataset.conteudoId = c.id;

    div.innerHTML = c.tipo === "video"
      ? `<video src="${c.url}" muted></video>`
      : `<img src="${c.url}" />`;

   div.onclick = () => {
  document
    .querySelectorAll(".preview-item")
    .forEach(i => i.classList.remove("selected"));

  div.classList.add("selected");
};

// 🔍 DUPLO CLIQUE → abrir preview grande
div.ondblclick = () => {
  abrirPreviewConteudo(c.url, c.tipo);
};

    grid.appendChild(div);
  });
}

function confirmarEnvioConteudo() {
  const selecionado = document.querySelector(".preview-item.selected");
  if (!selecionado) {
    alert("Selecione um conteúdo.");
    return;
  }

  const preco = Number(document.getElementById("precoConteudo").value || 0);

  socket.emit("sendConteudo", {
    cliente_id,
    modelo_id,
    conteudo_id: selecionado.dataset.conteudoId,
    preco
  });

  fecharPopupConteudos();
}

function abrirPreviewConteudo(url, tipo) {
  let modal = document.getElementById("previewModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "previewModal";
    modal.className = "preview-modal";

    modal.innerHTML = `
      <div class="preview-backdrop"></div>
      <div class="preview-box">
        <span class="preview-close">×</span>
        <img id="previewImg" />
        <video id="previewVideo" controls></video>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".preview-backdrop").onclick =
    modal.querySelector(".preview-close").onclick = () =>
      modal.classList.remove("open");
  }

  const img = modal.querySelector("#previewImg");
  const video = modal.querySelector("#previewVideo");

  if (tipo === "video") {
    img.style.display = "none";
    video.style.display = "block";
    video.src = url;
    video.play();
  } else {
    video.pause();
    video.style.display = "none";
    img.style.display = "block";
    img.src = url;
  }

  modal.classList.add("open");
}





