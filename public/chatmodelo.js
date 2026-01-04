const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}
const socket = io({
  transports: ["websocket"]
});

let modelo_id = null;
let cliente_id = null;
let chatAtivo = null;
let conteudosVistosCliente = new Set();

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
  // 🔥 se ainda não escolheu cliente, ignora só mensagens que NÃO são da modelo
  if (!cliente_id && msg.sender !== "modelo") return;

  // 🔒 se tem cliente ativo, filtra normalmente
  if (cliente_id && Number(msg.cliente_id) !== Number(cliente_id)) return;

  renderMensagem(msg);
  atualizarStatusPorResponder([msg]);
});


socket.on("conteudoVisto", ({ message_id }) => {
  const el = document.querySelector(
    `.chat-conteudo[data-id="${message_id}"]`
  );
  if (!el) return;

  // remove qualquer estado anterior
  el.classList.remove("nao-visto");
  el.classList.remove("bloqueado");

  // aplica visto
  el.classList.add("visto");
});



socket.on("unreadUpdate", ({ cliente_id, modelo_id }) => {
  document.querySelectorAll("#listaClientes li").forEach(li => {
    if (Number(li.dataset.clienteId) === cliente_id) {
      li.dataset.status = "nao-visto";
      const badge = li.querySelector(".badge");
      badge.innerText = "Não visto";
      badge.classList.remove("hidden");
      
      organizarListaClientes();
    }
    contarChatsNaoLidosModelo();
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
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();   // 🔥 ISSO resolve a quebra de linha
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

    // 📌 status vindo do backend
    // esperado: "novo" | "nao-visto" | "por-responder" | "normal"
    li.dataset.status = c.status || "normal";

    li.innerHTML = `
      <span class="nome">${c.nome}</span>
      <span class="badge hidden">Não visto</span>
      <span class="tempo"></span>
    `;

    // 🔔 aplica badge + tempo
    atualizarBadgeComTempo(li);
    contarChatsNaoLidosModelo();

    // ===============================
    // 🖱️ CLICK NO CLIENTE
    // ===============================
    li.onclick = async () => {
      cliente_id = c.cliente_id;
      chatAtivo = { cliente_id, modelo_id };
      await carregarConteudosVistos(cliente_id);

      document.getElementById("clienteNome").innerText = c.nome;

      // 🔥 buscar dados do cliente (avatar, etc.)
      const res = await fetch(`/api/cliente/${cliente_id}`, {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      });

      if (res.ok) {
        const dados = await res.json();
        if (dados.avatar) {
          document.getElementById("chatAvatar").src = dados.avatar;
        }
      }

      // 🧹 limpar badge visual
      const badge = li.querySelector(".badge");
      if (badge) badge.classList.add("hidden");

      // 🔄 atualizar status local
      li.dataset.status = "normal";

      // 🔁 reordenar lista
      organizarListaClientes();

      // 📡 entrar no chat
      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.emit("joinChat", { sala });
      socket.emit("getHistory", { cliente_id, modelo_id });
      setTimeout(contarChatsNaoLidosModelo, 50);
    };

    lista.appendChild(li);
  });

  // 🔁 ordena após carregar tudo
  organizarListaClientes();
}


// ===============================
// 🔁 ORDENAR LISTA DE CLIENTES
// ===============================
function organizarListaClientes() {
  const lista = document.getElementById("listaClientes");
  const itens = [...lista.querySelectorAll("li")];

  const prioridade = {
    "novo": 1,
    "nao-visto": 2,
    "por-responder": 3,
    "normal": 4
  };

  itens.sort((a, b) => {
    const pA = prioridade[a.dataset.status] || 99;
    const pB = prioridade[b.dataset.status] || 99;

    // prioridade primeiro
    if (pA !== pB) return pA - pB;

    // mais recente primeiro
    return Number(b.dataset.lastTime) - Number(a.dataset.lastTime);
  });

  itens.forEach(li => lista.appendChild(li));
}


// ===============================
// 🔔 BADGE + TEMPO
// ===============================
function atualizarBadgeComTempo(li) {
  const badge = li.querySelector(".badge");
  const tempo = li.querySelector(".tempo");

  const status = li.dataset.status;
  const lastTime = Number(li.dataset.lastTime);

  // 🔔 BADGE
  if (status === "novo") {
    badge.innerText = "Novo";
    badge.classList.remove("hidden");
  }
  else if (status === "nao-visto") {
    badge.innerText = "Não visto";
    badge.classList.remove("hidden");
  }
  else if (status === "por-responder") {
    badge.innerText = "Por responder";
    badge.classList.remove("hidden");
  }
  else {
    badge.classList.add("hidden");
  }

  // ⏱ TEMPO
  if (lastTime > 0) {
    tempo.innerText = formatarTempo(lastTime);
  } else {
    tempo.innerText = "";
  }
}


// ===============================
// ⏱ FORMATAR TEMPO (WHATSAPP STYLE)
// ===============================
function formatarTempo(ts) {
  const diff = Date.now() - ts;

  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;

  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;

  const d = Math.floor(h / 24);
  return `${d} d`;
}

async function carregarModelo() {
  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();
  modelo_id = data.user_id ?? data.id;
  const nomeEl = document.getElementById("modeloNome");
  if (nomeEl) {
    nomeEl.innerText = data.nome || "Modelo";
  }
  socket.emit("loginModelo", modelo_id);
}

async function aplicarUnreadModelo() {
  const res = await fetch("/api/chat/unread/modelo", {
    headers: { Authorization: "Bearer " + token }
  });

  const unreadIds = await res.json();

  document.querySelectorAll("#listaClientes li").forEach(li => {
    if (unreadIds.includes(Number(li.dataset.clienteId))) {
    li.dataset.status = "nao-visto";
    const badge = li.querySelector(".badge");
    badge.innerText = "Não visto";
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
  if (!chat) return;

  const div = document.createElement("div");

  // alinhamento correto
  div.className =
    msg.sender === "modelo" ? "msg msg-modelo" : "msg msg-cliente";

    if (
  msg.tipo === "conteudo" &&
  Array.isArray(msg.midias) &&
  msg.midias.length > 0
 ) {

    div.innerHTML = `
<div class="chat-conteudo premium ${msg.visto ? "visto" : "bloqueado"}"
     data-id="${msg.id}"
     data-qtd="${msg.quantidade ?? msg.midias.length}">

    <!-- 📸 MÍDIA -->
    <div class="pacote-grid">
      ${msg.midias.map(m => `
        <div class="midia-item">
          ${
            (m.tipo_media || m.tipo) === "video"
  ? `<video src="${m.url}" muted></video>`
  : `<img src="${m.url}" />`
          }
        </div>
      `).join("")}
    </div>

    <!-- 🧾 INFO ABAIXO -->
    ${
      msg.preco > 0
        ? `
          <div class="conteudo-info">
            <span class="status-bloqueado">
              ${
                msg.visto
                  ? `🟢 Vendido · ${msg.quantidade ?? msg.midias.length} mídia(s)`
                  : `🔒 ${msg.quantidade ?? msg.midias.length} mídia(s)`
              }
            </span>

            <span class="preco-bloqueado">
              R$ ${Number(msg.preco).toFixed(2)}
            </span>
          </div>
        `
        : ""
    }

  </div>
`;
  }

  /* ===============================
     💬 TEXTO NORMAL
  =============================== */
  else {
    div.textContent = msg.text;
  }

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

  // 🚫 nunca sobrepor "novo" ou "nao-visto"
  if (item.dataset.status === "novo" || item.dataset.status === "nao-visto") {
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
    "nao-visto": 2,
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

  // só mostra tempo se NÃO for novo / não visto / por responder
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
  const res = await fetch("/api/conteudos", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const conteudos = await res.json();

  if (!conteudos.length) {
    document.getElementById("previewConteudos").innerHTML =
      "<p>Nenhum conteúdo disponível.</p>";
    return;
  }

  // 🔥 AQUI está a correção
  renderConteudosPopup(conteudos);
}

 
function confirmarEnvioConteudo() {
  if (!cliente_id || !modelo_id) {
    alert("Selecione um cliente primeiro.");
    return;
  }

  const selecionados = [
    ...document.querySelectorAll(".preview-item.selected")
  ];

  if (!selecionados.length) {
    alert("Selecione ao menos um conteúdo.");
    return;
  }

  const preco = Number(
    document.getElementById("precoConteudo").value || 0
  );

  const conteudos_ids = selecionados
  .map(item => Number(item.dataset.conteudoId))
  .filter(id => Number.isInteger(id) && id > 0);

  // 🔥 GARANTE QUE A MODELO ESTÁ NA SALA
  const sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });

  socket.emit("sendConteudo", {
    cliente_id,
    modelo_id,
    conteudos_ids,   // ← 1 ou vários
    preco
  });

  fecharPopupConteudos();
}

function abrirPreviewConteudo(url, tipo) {
  const popup = document.getElementById("popupConteudos");

  // usa o MESMO sistema do resto da UI
  if (popup) popup.classList.add("hidden");

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

    const fechar = () => {
      modal.classList.remove("open");

      const video = modal.querySelector("#previewVideo");
      video.pause();
      video.src = "";

      if (popup) {
        popup.classList.remove("hidden");

        // 🔥 devolve foco ao popup
        const inputPreco = document.getElementById("precoConteudo");
        if (inputPreco) inputPreco.focus();
      }
    };

    // ✅ EVENTOS REGISTRADOS CORRETAMENTE
    modal.querySelector(".preview-backdrop").onclick = fechar;
    modal.querySelector(".preview-close").onclick = fechar;
  }

  const img = modal.querySelector("#previewImg");
  const video = modal.querySelector("#previewVideo");

  if (tipo === "video") {
    img.style.display = "none";

    video.style.display = "block";
    video.src = url;
    video.currentTime = 0;
    video.play();
  } else {
    video.pause();
    video.src = "";
    video.style.display = "none";

    img.style.display = "block";
    img.src = url;
  }

  modal.classList.add("open");
}

function contarChatsNaoLidosModelo() {
  const itens = document.querySelectorAll(
    "#listaClientes li[data-status='nao-visto'], #listaClientes li[data-status='novo']"
  );

  atualizarBadgeHeader(itens.length);
}

async function carregarConteudosVistos(cliente_id) {
  const res = await fetch(`/api/chat/conteudos-vistos/${cliente_id}`, {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  const ids = await res.json();
  conteudosVistosCliente = new Set(ids);
}

function renderConteudosPopup(conteudos) {
  const grid = document.querySelector(".preview-grid");
  grid.innerHTML = "";

  conteudos.forEach(c => {
    const jaVisto = conteudosVistosCliente.has(c.id);

    const div = document.createElement("div");
    div.className = "preview-item" + (jaVisto ? " visto" : "");
    div.dataset.conteudoId = c.id;

    div.innerHTML = `
      ${c.tipo === "video"
        ? `<video src="${c.url}" muted></video>`
        : `<img src="${c.url}">`
      }
      ${jaVisto ? `<span class="badge-visto">Visto</span>` : ""}
    `;

    if (!jaVisto) {
      div.onclick = () => div.classList.toggle("selected");
    }

    grid.appendChild(div);
  });
}

