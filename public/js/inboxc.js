const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

const socket = io("https://velvet-test-production.up.railway.app", {
  auth: { token: "Bearer " + token }
});

const inboxEl = document.getElementById("inbox");

document.addEventListener("DOMContentLoaded", () => {
  carregarListaModelos();
});


// ===============================
// FETCH INBOX
// ===============================
async function carregarListaModelos() {
  const res = await fetch("/api/chat/cliente", {
    headers: { Authorization: "Bearer " + token }
  });
  if (!res.ok) return;

  const modelos = await res.json();

  // 🔥 ordena antes de renderizar
  modelos.sort((a, b) => {
    const pa = prioridadeChat(a);
    const pb = prioridadeChat(b);
    if (pa !== pb) return pa - pb;
    return new Date(b.ultima_mensagem_em) - new Date(a.ultima_mensagem_em);
  });

  inboxEl.innerHTML = "";

  modelos.forEach(c => {
    let statusHTML = "";

  if (c.sender === "modelo" && c.lida === false) {
  statusHTML = `<span class="status status-unseen">Não lido</span>`;
  } else {
        statusHTML = `<span class="status status-reply">Por responder</span>`;
      }

    const div = document.createElement("div");
    div.className = "chat-item";
    div.onclick = () => abrirChat(c.modelo_id);
    div.innerHTML = `
  <div class="avatar">
    ${
      c.avatar
        ? `<img src="${c.avatar}" />`
        : `<div class="avatar-placeholder"></div>`
    }
  </div>

  <div class="chat-body">
    <div class="chat-top">
      <span class="chat-name">
        ${c.nome_exibicao || "Modelo"}
      </span>

      <span class="chat-time">
        ${c.ultima_mensagem_em ? formatarTempo(c.ultima_mensagem_em) : ""}
      </span>
    </div>

      <div class="chat-bottom">
        <span class="chat-last">${c.ultima_mensagem || ""}</span>
        <div class="chat-status">${statusHTML}</div>
      </div>
    </div>
  </div>
`;

    inboxEl.appendChild(div);
  });
}


function prioridadeChat(c) {
  // 1️⃣ NOVO (modelo enviou e não foi visto)
  if (c.ultimo_sender === "modelo" && c.visto === false && c.aberto === false) {
    return 1;
  }

  // 2️⃣ Não lidas (modelo enviou e ainda não viu)
  if (c.ultimo_sender === "modelo" && c.visto === false) {
    return 2;
  }

  // 3️⃣ Por responder (modelo enviou, você viu)
  if (c.ultimo_sender === "modelo" && c.visto === true) {
    return 3;
  }

  if (c.ultimo_sender === "cliente" && c.lida === true) {
    return 4;
  }

  // 5️⃣ Demais
  return 5;
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
// REALTIME
// ===============================

socket.emit("joinInbox", {
  sala: `inbox_cliente_${cliente_id}`
});

socket.on("inboxMessage", carregarListaModelos);


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
