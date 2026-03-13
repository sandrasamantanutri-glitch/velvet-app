// ===============================
// AUTH
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "modelo") {
  logout();
}

const LIMIT = 20;
let offset = 0;
let listaCompleta = [];
let carregando = false;
let fimLista = false;

// ===============================
// SOCKET
// ===============================
const socket = io({
  transports: ["websocket", "polling"]
});

function autenticar() {
  socket.emit("auth", { token });
}

function entrarInbox() {
  socket.emit("joinInbox");
}


socket.on("connect", () => {
  console.log("🟢 Inbox conectado:", socket.id);
  autenticar();
});

socket.on("authOk", () => {
  entrarInbox();
});

socket.on("inboxMessage", dados => {

  atualizarChatLocal(dados);

  // fallback segurança
  if (!chatsMap.has(dados.cliente_id)) {
    carregarListaClientes();
  }

});

socket.on("disconnect", (reason) => {
  console.warn("🔴 Inbox desconectado:", reason);
});

// ===============================
// ELEMENTOS
// ===============================
const inboxEl = document.getElementById("inbox");
const chatsMap = new Map();

// ===============================
// INIT
// ===============================
window.addEventListener("load", () => {
  carregarListaClientes();
});



if (inboxEl) {

  let scrollTimer;

  inboxEl.addEventListener("scroll", () => {

    clearTimeout(scrollTimer);

    scrollTimer = setTimeout(() => {

      const pertoDoFim =
        inboxEl.scrollTop + inboxEl.clientHeight >=
        inboxEl.scrollHeight - 200;

      if (pertoDoFim) {
        carregarListaClientes();
      }

    }, 120);

  });

}

// ===============================
// PRIORIDADE CHAT
// ===============================
function prioridadeChat(c) {

  // novo VIP
  if (c.novo_vip) return 1;

  // cliente nunca recebeu resposta
  if (!c.modelo_respondeu) return 2;

  // cliente enviou e não foi visto
  if (c.ultimo_sender === "cliente" && c.visto === false) return 3;

  // cliente enviou e você viu
  if (c.ultimo_sender === "cliente" && c.visto === true) return 4;

  return 5;
}

// ===============================
// FETCH CLIENTES
// ===============================
async function carregarListaClientes() {

   if (carregando || fimLista) return;

  carregando = true;
  document.body.classList.add("loading");

  try {

    const res = await fetch(
      `/api/chat/modelo?limit=${LIMIT}&offset=${offset}`,
      { headers: { Authorization: "Bearer " + token } }
    );

    if (!res.ok) {
      carregando = false;
      return;
    }

    const clientes = await res.json();

     if (clientes.length === 0) {
      fimLista = true;
      carregando = false;
      return;
    }

    preloadAvatars(clientes);

    clientes.sort((a, b) => {

      const pa = prioridadeChat(a);
      const pb = prioridadeChat(b);

      if (pa !== pb) return pa - pb;

      const da = a.ultima_mensagem_em ? new Date(a.ultima_mensagem_em) : 0;
      const db = b.ultima_mensagem_em ? new Date(b.ultima_mensagem_em) : 0;

      return db - da;

    });

    clientes.forEach(c => {
  if (!chatsMap.has(c.cliente_id)) {
    listaCompleta.push(c);
  }
});

    renderizarMais();

    offset += clientes.length;

  } catch (err) {

    console.error("Erro carregar inbox:", err);

  }  finally {

    carregando = false;
    document.body.classList.remove("loading");
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
function abrirChat(clienteId) {
  window.location.href = `/chat.html?cliente_id=${clienteId}`;
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

  if (c.ultimo_sender === "cliente" && c.visto === false) {
    return `<span class="status status-unseen">Não lida</span>`;
  }

  if (c.ultimo_sender === "cliente" && c.visto === true) {
    return `<span class="status status-reply">Por responder</span>`;
  }

  if (c.ultimo_sender === "modelo" && c.lida === true) {
    return `<span class="status status-read">✓✓</span>`;
  }

  if (c.ultimo_sender === "modelo") {
    return `<span class="status status-sent">✓</span>`;
  }

  return "";
}
function renderizarMais() {

  const inicio = inboxEl.children.length;
  const novos = listaCompleta.slice(inicio);

  novos.forEach(c => {

    let statusHTML = "";

    if (c.novo_vip) {
      statusHTML = `<span class="status status-vip">Novo VIP</span>`;
    }

    else if (c.ultimo_sender === "cliente") {

      if (c.visto === false) {
        statusHTML = `<span class="status status-unseen">Não lida</span>`;
      } else {
        statusHTML = `<span class="status status-reply">Por responder</span>`;
      }

    }

    else if (c.ultimo_sender === "modelo") {

      if (c.lida === true) {
        statusHTML = `<span class="status status-read">✓✓</span>`;
      } else {
        statusHTML = `<span class="status status-sent">✓</span>`;
      }

    }

    const div = document.createElement("div");
    div.className = "chat-item";

    div.onclick = () => abrirChat(c.cliente_id);

    div.innerHTML = `...`;

    inboxEl.appendChild(div);

    chatsMap.set(c.cliente_id, {
      data: c,
      element: div
    });

  });

}

function preloadAvatars(clientes) {

  clientes.slice(0,10).forEach(c => {

 const avatar = c.avatar_thumb || c.avatar;
    if (!avatar) return;

    const img = new Image();
    img.src = avatar;

  });

}

setInterval(() => {

  if (document.visibilityState === "visible") {

    offset = 0;
    fimLista = false;
    listaCompleta = [];
    inboxEl.innerHTML = "";

    carregarListaClientes();

  }

}, 8000);