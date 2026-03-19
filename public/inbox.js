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
const role = localStorage.getItem("role");

if (!token || role !== "modelo") {
  logout();
}

// ===============================
// ESTADO
// ===============================
const LIMIT = 20;
let offset = 0;
let listaCompleta = [];
let carregando = false;
let fimLista = false;

// ===============================
// SOCKET
// ===============================
const socket = io({
  transports: ["websocket", "polling"],
  auth: {
    token
  },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  timeout: 10000
});

socket.on("connect", () => {
  console.log("🟢 Inbox conectado:", socket.id);
  entrarInbox();
});

socket.on("connect_error", (err) => {
  console.error("❌ connect_error socket:", err.message, err);
});

socket.on("inboxMessage", (dados) => {
  atualizarChatLocal(dados);

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

function entrarInbox() {
socket.emit("joinInbox", (res) => {
    if (!res?.ok) {
      console.warn("⚠️ Falha ao entrar na inbox:", res?.error);
      return;
    }

    console.log("📬 Entrou na inbox:", res.sala);
  });
}

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

clientes.forEach(c => {
  const idx = listaCompleta.findIndex(x => x.cliente_id === c.cliente_id);

  if (idx === -1) {
    listaCompleta.push(c);
  } else {
    listaCompleta[idx] = c;
  }
});

listaCompleta.sort(compararChats);

rerenderizarInboxCompleta();

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
  const idx = listaCompleta.findIndex(c => c.cliente_id === clienteId);

  if (idx !== -1 && listaCompleta[idx].ultimo_sender === "cliente") {
    listaCompleta[idx] = {
      ...listaCompleta[idx],
      lida: true
    };

    listaCompleta.sort(compararChats);
    rerenderizarInboxCompleta();
  }

  window.location.href = `/chat.html?cliente_id=${clienteId}`;
}

function logout() {
  localStorage.clear();
  location.href = "/index.html";
}

function atualizarChatLocal(dados) {
  const chatId = dados.cliente_id || dados.modelo_id;

  const idx = listaCompleta.findIndex(c => c.cliente_id === chatId);
  if (idx === -1) return;

const atualizado = {
  ...listaCompleta[idx],
  ...dados
};

  listaCompleta[idx] = atualizado;

  listaCompleta.sort(compararChats);
  rerenderizarInboxCompleta();
}


function gerarStatus(c) {
  if (c.ultimo_sender === "cliente" && c.lida === false) {
    return `<span class="status status-unseen">Não lida</span>`;
  }

  if (c.ultimo_sender === "cliente" && c.lida === true) {
    return `<span class="status status-reply">Por responder</span>`;
  }

  if (c.novo_vip === true) {
    return `<span class="status status-vip">Novo VIP</span>`;
  }

  if (c.ultimo_sender === "modelo" && c.visto === true) {
    return `<span class="status status-read">✓✓</span>`;
  }

  if (c.ultimo_sender === "modelo") {
    return `<span class="status status-sent">✓</span>`;
  }

  return "";
}

// function renderizarMais() {
//   listaCompleta.forEach(c => {
//     if (chatsMap.has(c.cliente_id)) return;

//     let statusHTML = "";

//     if (c.novo_vip) {
//       statusHTML = `<span class="status status-vip">Novo VIP</span>`;
//     }

//     else if (c.ultimo_sender === "cliente") {
//       if (c.lida === false) {
//         statusHTML = `<span class="status status-unseen">Não lida</span>`;
//       } else {
//         statusHTML = `<span class="status status-reply">Por responder</span>`;
//       }
//     }

//     else if (c.ultimo_sender === "modelo") {
//       if (c.visto === true) {
//         statusHTML = `<span class="status status-read">✓✓</span>`;
//       } else {
//         statusHTML = `<span class="status status-sent">✓</span>`;
//       }
//     }

//     const div = document.createElement("div");
//     div.className = "chat-item";

//     div.onclick = () => abrirChat(c.cliente_id);

//     div.innerHTML = `
//       <div class="avatar">
//         <img src="${c.avatar || 'assets/avatar.png'}" width="40" height="40">
//       </div>

//       <div class="chat-body">

//         <div class="chat-top">
//           <span class="chat-name">
//             ${c.username || c.nome || "Cliente"}
//             <span class="spend-level">${c.spend_level || ""}</span>
//           </span>

//           <span class="chat-time">
//             ${formatarTempo(c.ultima_mensagem_em)}
//           </span>
//         </div>

//         <div class="chat-bottom">
//           <span class="chat-last">
//             ${c.ultima_mensagem || ""}
//           </span>

//           <div class="chat-status">
//             ${statusHTML}
//           </div>
//         </div>

//       </div>
//     `;

//     inboxEl.appendChild(div);

//     chatsMap.set(c.cliente_id, {
//       data: c,
//       element: div
//     });
//   });
// }

function preloadAvatars(clientes) {
  clientes.slice(0, 10).forEach(c => {
    const avatar = c.avatar_thumb || c.avatar;
    if (!avatar || avatar === "assets/avatar.png") return;

    const img = new Image();
    img.src = avatar;
  });
}

function compararChats(a, b) {
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
}

function rerenderizarInboxCompleta() {
  inboxEl.innerHTML = "";
  chatsMap.clear();

listaCompleta.forEach(c => {
    const statusHTML = gerarStatus(c);
    const avatarSrc = c.avatar_thumb || c.avatar || "assets/avatar.png";

    const div = document.createElement("div");
    div.className = "chat-item";
    div.onclick = () => abrirChat(c.cliente_id);

    div.innerHTML = `
      <div class="avatar">
        <img
          src="${avatarSrc}"
          width="40"
          height="40"
          onerror="this.onerror=null; this.src='assets/avatar.png';"
        >
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

setInterval(() => {

  if (document.visibilityState !== "visible") return;

  offset = 0;
  fimLista = false;

  carregarListaClientes();

}, 30000);
