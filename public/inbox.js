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

window.addEventListener("scroll", () => {

  const pertoDoFim =
    window.innerHeight + window.scrollY >=
    document.body.offsetHeight - 100;

  if (pertoDoFim) {
    carregarListaClientes();
  }

});


// ===============================
// PRIORIDADE CHAT
// ===============================
function prioridadeChat(c) {
  // 1) NÃO LIDA
  if (c.ultimo_sender === "cliente" && c.lida === false) return 1;

  // 2) POR RESPONDER
  if (c.ultimo_sender === "cliente" && c.lida === true) return 2;

  // 3) NOVO VIP
  if (c.novo_vip === true) return 3;

  // 4) CLIENTE VISUALIZOU MAS NÃO RESPONDEU
  if (c.ultimo_sender === "modelo" && c.visto === true) return 4;

  // 5) RESTO
  return 5;
}

function pesoGasto(c) {
  const total = Number(c.total_gasto || 0);

  if (total >= 300) return 3; // $$$
  if (total >= 200) return 2; // $$
  if (total > 100) return 1;  // $
  return 0;
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

  const ga = pesoGasto(a);
  const gb = pesoGasto(b);

  if (ga !== gb) return gb - ga;

  const va = Number(a.total_gasto || 0);
  const vb = Number(b.total_gasto || 0);

  if (va !== vb) return vb - va;

  const da = a.ultima_mensagem_em ? new Date(a.ultima_mensagem_em).getTime() : 0;
  const db = b.ultima_mensagem_em ? new Date(b.ultima_mensagem_em).getTime() : 0;

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
  } finally {
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
  listaCompleta.forEach(c => {
    if (chatsMap.has(c.cliente_id)) return;

    let statusHTML = "";

    if (c.novo_vip) {
      statusHTML = `<span class="status status-vip">Novo VIP</span>`;
    }

    else if (c.ultimo_sender === "cliente") {
      if (c.lida === false) {
        statusHTML = `<span class="status status-unseen">Não lida</span>`;
      } else {
        statusHTML = `<span class="status status-reply">Por responder</span>`;
      }
    }

    else if (c.ultimo_sender === "modelo") {
      if (c.visto === true) {
        statusHTML = `<span class="status status-read">✓✓</span>`;
      } else {
        statusHTML = `<span class="status status-sent">✓</span>`;
      }
    }

    const div = document.createElement("div");
    div.className = "chat-item";

    div.onclick = () => abrirChat(c.cliente_id);

    div.innerHTML = `
      <div class="avatar">
        <img src="${c.avatar || 'assets/avatar.png'}" width="40" height="40">
      </div>

      <div class="chat-body">

        <div class="chat-top">
          <span class="chat-name">
            ${c.username || c.nome || "Cliente"}
            <span class="spend-level">${c.spend_level || ""}</span>
          </span>

          <span class="chat-time">
            ${formatarTempo(c.ultima_mensagem_em)}
          </span>
        </div>

        <div class="chat-bottom">
          <span class="chat-last">
            ${c.ultima_mensagem || ""}
          </span>

          <div class="chat-status">
            ${statusHTML}
          </div>
        </div>

      </div>
    `;

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

  if (document.visibilityState !== "visible") return;

  offset = 0;
  fimLista = false;

  carregarListaClientes();

}, 20000);
