// ===============================
// 🔐 TOKEN
// ===============================
const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "/app/index.html";
}

// ===============================
// 🧠 PROTEÇÃO CONTRA DUPLICAÇÃO
// ===============================
if (window.__INBOX_INIT__) {
  console.warn("Inbox já inicializada, evitando duplicação");
} else {
  window.__INBOX_INIT__ = true;
}

// ===============================
// 🔌 SOCKET (AUTENTICADO)
// ===============================

const socket = io("https://velvet-test-production.up.railway.app", {
  auth: {
    token: "Bearer " + token
  }
});


// ===============================
let modeloId = null;

// ===============================
// 🚀 INIT
// ===============================
async function initInbox() {
  try {
    const res = await fetch("/api/me", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const me = await res.json();

    if (me.role !== "modelo") {
      alert("Acesso restrito");
      return;
    }

    modeloId = me.id;

    console.log("📥 entrando na sala inbox_", modeloId);

    // entra na sala da inbox
    socket.emit("joinInbox", { modelo_id: modeloId });

    // ✅ carga inicial única
    await carregarInbox(false);

  } catch (err) {
    console.error("Erro ao iniciar inbox", err);
  }
}

// ===============================
// 🔄 SOCKET → REFRESH
// ===============================
socket.on("refreshInbox", () => {
  console.log("🔄 refreshInbox recebido");
  carregarInbox(true);
});

socket.on("inboxMessage", data => {
  console.log("📨 mensagem nova na inbox", data);

  atualizarInboxEmTempoReal(data);
});

// ===============================
// 📥 FETCH INBOX
// ===============================
let inboxCarregada = false;
let primeiraCarga = true;

async function carregarInbox(force = false) {
  const res = await fetch(
    "https://velvet-test-production.up.railway.app/api/chat/inbox",
    {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    }
  );

  if (!res.ok) {
    console.error("Erro inbox:", res.status);
    return;
  }

  const data = await res.json();
  renderInbox(data);
}

// ===============================
// 🖼️ RENDER
// ===============================
function renderInbox(chats, destacar) {
  if (!Array.isArray(chats)) {
    console.error("Inbox não é array:", chats);
    return;
  }

  const inbox = document.querySelector(".inbox");
  inbox.innerHTML = "";

  chats.forEach((chat, index) => {
    const div = document.createElement("div");
    div.className = "chat-item";
    div.dataset.clienteId = chat.cliente_id; // 🔑 ESSENCIAL

    if (destacar && index === 0) {
      div.classList.add("nova-msg");
    }

    div.onclick = () => openChat(chat.cliente_id);

const avatarHTML = chat.foto
  ? `<img class="avatar-img" src="${chat.foto}" />`
  : `<div class="velvet-avatar"></div>`;

    div.innerHTML = `
      ${avatarHTML}

      <div class="chat-info">
        <strong>${chat.nome || `Cliente #${chat.cliente_id}`}</strong>
        <span>${chat.ultima_mensagem || ""}</span>
      </div>

      <div class="chat-meta">
        <small>${chat.hora || ""}</small>
        ${
          chat.nao_lidas > 0
            ? `<span class="badge">${chat.nao_lidas}</span>`
            : ""
        }
      </div>
    `;

    inbox.appendChild(div);
  });
}

function atualizarInboxEmTempoReal(msg) {
  const inbox = document.querySelector(".inbox");
  const itens = Array.from(inbox.children);

  // tenta achar o chat existente
let item = itens.find(div =>
  div.dataset.clienteId == msg.cliente_id
);


  // se não existir, faz fallback (refetch)
  if (!item) {
    carregarInbox(true);
    return;
  }

  // atualiza texto
  const span = item.querySelector(".chat-info span");
  if (span) span.textContent = msg.text;

  // atualiza hora
  const hora = item.querySelector(".chat-meta small");
  if (hora) {
    hora.textContent = new Date(msg.created_at).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // badge
  let badge = item.querySelector(".badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "1";
    item.querySelector(".chat-meta").appendChild(badge);
  } else {
    badge.textContent = Number(badge.textContent || 0) + 1;
  }

  // sobe pro topo
  inbox.prepend(item);
}


// ===============================
// 🔗 ABRIR CHAT
// ===============================
function openChat(clienteId) {
  window.location.href = `/app/chat.html?cliente=${clienteId}`;
}

// ===============================
// START
// ===============================
initInbox();
