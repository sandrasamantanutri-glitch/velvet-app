const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
if (!token) {
  window.location.href = "app/index.html";
  throw new Error("Sem token");
}
const socket = io({
  transports: ["websocket"]
});

socket.emit("auth", { token });

// params
const params = new URLSearchParams(location.search);
const clienteId = Number(params.get("cliente"));

const chatBox = document.getElementById("chatBox");
const input = document.getElementById("msgInput");


let modeloId = null;
let sala = null;
let modelo_id = null;
let cliente_id = null;
let chatAtivo = null;
let conteudosVistosCliente = new Set();

// 📜 HISTÓRICO
socket.on("chatHistory", mensagens => {
  chatBox.innerHTML = "";
  mensagens.forEach(m => renderMensagem(m));
});


socket.on("newMessage", msg => {
  if (msg.sender === "modelo") {
    renderMensagem(msg);
  } else {
    renderMensagem(msg);
  }
});

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const me = await res.json();
  modelo_id = me.id;

  cliente_id = clienteId;

  sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });
  socket.emit("getHistory", { cliente_id, modelo_id });
  socket.emit("loginModelo", modelo_id);

  const input = document.getElementById("msgInput");
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  });
});

// ===============================
// FUNÇÕES
// ===============================

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


function atualizarBadgeComTempo(li) {
  const badge = li.querySelector(".badge");
  const tempo = li.querySelector(".tempo");

  const status = li.dataset.status;
  const lastTime = Number(li.dataset.lastTime || 0);

  // 🔔 BADGE
  if (badge) {
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
  }

  // ⏱ TEMPO
  if (tempo) {
    tempo.innerText = lastTime > 0 ? formatarTempo(lastTime) : "";
  }
}

function enviarMensagem() {
  const input = document.getElementById("msgInput");
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


function abrirPreviewAvatar(url) {
  let modal = document.getElementById("avatarPreviewModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "avatarPreviewModal";
    modal.className = "preview-modal open";

    modal.innerHTML = `
      <div class="preview-backdrop"></div>
      <div class="preview-box">
        <span class="preview-close">×</span>
        <img id="avatarPreviewImg" />
      </div>
    `;

    document.body.appendChild(modal);

    const fechar = () => modal.remove();
    modal.querySelector(".preview-backdrop").onclick = fechar;
    modal.querySelector(".preview-close").onclick = fechar;
  }

  const img = modal.querySelector("#avatarPreviewImg");
  img.src = url;

  modal.classList.add("open");
}

function enviarConteudosSelecionados() {
  const selecionados = [
    ...document.querySelectorAll(".preview-item.selected")
  ];

  if (selecionados.length === 0) {
    alert("Selecione ao menos um conteúdo.");
    return;
  }

  const conteudos_ids = selecionados.map(
    el => Number(el.dataset.conteudoId)
  );

  const preco = Number(
    document.getElementById("precoConteudo")?.value || 0
  );

  socket.emit("sendConteudo", {
    cliente_id,
    modelo_id,
    conteudos_ids,
    preco
  });

  fecharPopupConteudos();
}

async function abrirPopupConteudos() {
  await carregarConteudosVistos(cliente_id);
  document.getElementById("popupConteudos").classList.remove("hidden");

  const grid = document.getElementById("previewConteudos");
  grid.innerHTML = "Carregando...";

  const res = await fetch("/api/conteudos/me", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) {
    grid.innerHTML = "Erro ao carregar conteúdos";
    return;
  }

  const conteudos = await res.json();

  if (!Array.isArray(conteudos) || conteudos.length === 0) {
    grid.innerHTML = "<p>Nenhum conteúdo enviado ainda.</p>";
    return;
  }

  grid.innerHTML = "";

  conteudos.forEach(c => {
    const jaVisto = conteudosVistosCliente.has(c.id);

    const item = document.createElement("div");
    item.className =
      "preview-item" +
      (jaVisto ? " visto desabilitado" : "");
    item.dataset.conteudoId = c.id;

    item.innerHTML = `
      ${c.tipo === "video"
        ? `<video src="${c.url}" muted></video>`
        : `<img src="${c.url}" />`
      }
      ${jaVisto ? `<span class="badge-visto">Visto</span>` : ""}
    `;

    // 🚫 REGRA FINAL:
    // conteúdo visto (pago OU grátis) NUNCA pode ser reenviado
    if (jaVisto) {
      item.onclick = () => {
        alert("Este conteúdo já foi visto por este cliente e não pode ser reenviado.");
      };
    } else {
      item.onclick = () => {
        item.classList.toggle("selected");
      };
    }

    grid.appendChild(item);
  });
}

// ===============================
// ❌ FECHAR POPUP DE CONTEÚDOS
// ===============================
function fecharPopupConteudos() {
  const popup = document.getElementById("popupConteudos");
  if (!popup) return;

  popup.classList.add("hidden");

  // limpa seleção
  document
    .querySelectorAll(".preview-item.selected")
    .forEach(el => el.classList.remove("selected"));

  // reseta preço
  const precoInput = document.getElementById("precoConteudo");
  if (precoInput) precoInput.value = 0;
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

  // 🔥 GARANTE JOIN NA SALA ATIVA
  const sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });

  // 🔥 ENVIA UMA ÚNICA VEZ (após garantir o join)
  setTimeout(() => {
    socket.emit("sendConteudo", {
      cliente_id,
      modelo_id,
      conteudos_ids,
      preco
    });
  }, 50);

  fecharPopupConteudos();
}

socket.on("conteudoVisto", ({ message_id }) => {
  const el = document.querySelector(
    `.chat-conteudo[data-id="${message_id}"]`
  );
  if (!el) return;

  el.classList.remove("bloqueado");
  el.classList.add("visto");

  const status = el.querySelector(".status-bloqueado");
  if (status) status.innerText = "🟢 Vendido";
});

async function carregarConteudosVistos(cliente_id) {
  const res = await fetch(`/api/chat/conteudos-vistos/${cliente_id}`, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const ids = await res.json();
  conteudosVistosCliente = new Set(ids);
}




