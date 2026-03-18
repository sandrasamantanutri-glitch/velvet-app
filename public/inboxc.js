if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/"
      });
      console.log("Service worker registrado:", reg.scope);
    } catch (err) {
      console.error("Erro ao registrar service worker:", err);
    }
  });
}
// ===============================
// AUTH
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "cliente") {
  logout();
}

const LIMITE_INICIAL = 30;
let offset = 0;
let listaCompleta = [];
const chatsMap = new Map();

// ===============================
// SOCKET
// ===============================
const socket = io({
  transports: ["websocket", "polling"]
});

let clienteId = null;

function autenticar() {
  socket.emit("auth", { token });
}

function entrarInbox() {
  socket.emit("joinInbox", {
    sala: `inbox_cliente_${clienteId}`
  });
}

socket.on("connect", () => {
  console.log("🟢 Inbox cliente conectado:", socket.id);
  autenticar();
});

socket.on("authOk", () => {
  entrarInbox();
});

socket.on("inboxMessage", dados => {
  atualizarChatLocal(dados);

  // fallback segurança
  if (!chatsMap.has(dados.modelo_id)) {
    carregarListaModelos();
  }

});

socket.on("disconnect", (reason) => {
  console.warn("🔴 Inbox desconectado:", reason);
});

// ===============================
// ELEMENTOS
// ===============================
const inboxEl = document.getElementById("inbox");

// ===============================
// INIT
// ===============================
async function initClienteInbox() {

  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return logout();

  const me = await res.json();

  clienteId = me.id;

  if (socket.connected) {
    entrarInbox();
  }

  carregarListaModelos();
}

document.addEventListener("DOMContentLoaded", initClienteInbox);

// ===============================
// PRIORIDADE CHAT
// ===============================
function prioridadeChat(c) {

  // mensagem da modelo não lida
  if (c.sender === "modelo" && c.lida === false) return 1;

  // modelo enviou e você leu
  if (c.sender === "modelo" && c.lida === true) return 2;

  // você enviou por último
  if (c.sender === "cliente") return 3;

  return 4;
}

// ===============================
// FETCH MODELOS
// ===============================
async function carregarListaModelos() {

  try {

    const res = await fetch("/api/chat/cliente", {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) return;

    const modelos = await res.json();
    preloadAvatars(modelos);

    // ordenação inteligente
    modelos.sort((a, b) => {

      const pa = prioridadeChat(a);
      const pb = prioridadeChat(b);

      if (pa !== pb) return pa - pb;

      const da = a.ultima_mensagem_em ? new Date(a.ultima_mensagem_em) : 0;
      const db = b.ultima_mensagem_em ? new Date(b.ultima_mensagem_em) : 0;

      return db - da;
    });

    listaCompleta = modelos;

offset = 0;

inboxEl.innerHTML = "";
chatsMap.clear();

renderizarMais();

  } catch (err) {

    console.error("Erro inbox cliente:", err);

  }

}

// ===============================
// TEMPO
// ===============================
function formatarTempo(data) {

  if (!data) return "";

  const d = new Date(data);

  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);

  if (diff === 0) {

    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });

  }

  if (diff === 1) return "1 dia";

  return `${diff} dias`;
}

// ===============================
// HELPERS
// ===============================
function abrirChat(modeloId) {
  window.location.href = `/chatc.html?modelo_id=${modeloId}`;
}

function logout() {
  localStorage.clear();
  location.href = "/index.html";
}

function atualizarChatLocal(dados) {

  const chatId = dados.cliente_id || dados.modelo_id;

  const chat = chatsMap.get(chatId);

  if (!chat) return;

  const el = chat.element;

  // atualizar mensagem
  el.querySelector(".chat-last").textContent =
    dados.ultima_mensagem || "";

  // atualizar horário
  el.querySelector(".chat-time").textContent =
    formatarTempo(dados.ultima_mensagem_em);

  // atualizar status
  el.querySelector(".chat-status").innerHTML =
    gerarStatus(dados);

  moverChatParaTopo(el);

}

function moverChatParaTopo(el) {

  const primeiro = inboxEl.firstChild;

  if (primeiro !== el) {
    inboxEl.insertBefore(el, primeiro);
  }

}

function gerarStatus(c) {
  if (c.sender === "modelo" && c.lida === false) {
    return `<span class="status status-unseen">Não lida</span>`;
  }

  if (c.sender === "modelo" && c.lida === true) {
    return `<span class="status status-read">✓✓</span>`;
  }

  if (c.sender === "cliente") {
    return `<span class="status status-sent">✓</span>`;
  }

  return "";
}

function renderizarMais() {

  const slice = listaCompleta.slice(offset, offset + LIMITE_INICIAL);

  slice.forEach(m => {

    let statusHTML = "";

    if (m.sender === "modelo" && m.lida === false) {
      statusHTML = `<span class="status status-unseen">Não lida</span>`;
    } else if (m.sender === "modelo" && m.lida === true) {
      statusHTML = `<span class="status status-read">✓✓</span>`;
    } else if (m.sender === "cliente") {
      statusHTML = `<span class="status status-sent">✓</span>`;
    }

    const div = document.createElement("div");
    div.className = "chat-item";

    div.onclick = () => abrirChat(m.modelo_id);

    div.innerHTML = `
    <div class="avatar">
      <img 
        src="${m.avatar || 'assets/avatar.png'}"
        width="40"
        height="40"
        loading="lazy"
        decoding="async"
        fetchpriority="low"
      />
    </div>

    <div class="chat-body">
      <div class="chat-top">
        <span class="chat-name">
          ${m.nome_exibicao || "Modelo"}
        </span>

        <span class="chat-time">
          ${formatarTempo(m.ultima_mensagem_em)}
        </span>
      </div>

      <div class="chat-bottom">
        <span class="chat-last">
          ${m.ultima_mensagem || ""}
        </span>

        <div class="chat-status">
          ${statusHTML}
        </div>
      </div>
    </div>
    `;

    inboxEl.appendChild(div);

    chatsMap.set(m.modelo_id, {
      data: m,
      element: div
    });

  });

  offset += LIMITE_INICIAL;
}


function preloadAvatars(modelos) {

  modelos.slice(0,10).forEach(m => {

    const avatar = m.avatar_thumb || m.avatar;
    if (!avatar) return;

    const img = new Image();
    img.src = avatar;

  });

}

// ===============================
// ATUALIZA AO VOLTAR PRA ABA
// ===============================
setInterval(() => {

  if (document.visibilityState === "visible") {
    carregarListaModelos();
  }

}, 30000);