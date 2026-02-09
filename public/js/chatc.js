const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

const socket = io({
  transports: ["websocket"]
});

socket.emit("auth", { token });

const params = new URLSearchParams(location.search);
const modeloId = Number(params.get("modelo"));

const chatBox = document.getElementById("chatBox");

chatBox.addEventListener("scroll", () => {
  if (chatBox.scrollTop === 0 && !carregandoHistorico) {
    carregarMensagensAntigas();
  }
});


const input = document.getElementById("msgInput");

clienteId=null;
let sala = null;
let modelo_id = null;
let cliente_id = null;
let chatAtivo = null;
let conteudosVistosModelo = new Set();

// 📜 HISTÓRICO
socket.on("chatHistory", mensagens => {
  const chat = document.getElementById("chatBox");
  if (!chat || !mensagens.length) return;

  // 🧹 limpa antes
  chat.innerHTML = "";

  mensagens.forEach(m => renderMensagem(m));

  // 🔥 força scroll pro final
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });

  ultimoTimestamp = mensagens[0].created_at;
});

socket.on("newMessage", msg => {
  if (msg.sender === "modelo") {
    renderMensagem(msg);
  } 
});

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch("/api/me");
const me = await res.json();

// valida cliente
if (me.role !== "cliente") {
  alert("Acesso inválido");
  history.back();
  return;
}

// AGORA SIM pode usar
cliente_id = me.id;


  await carregarInfoModelo(modelo_id);

  sala = `chat_${modelo_id}_${cliente_id}`;
  socket.emit("joinChat", { sala });
  socket.emit("getHistory", { modelo_id, cliente_id });

  // 🔥 AQUI — quando o chat ABRE
  marcarComoLido(modelo_id);

  socket.emit("loginModelo", modelo_id);
  socket.emit("loginCliente", cliente_id);


  const input = document.getElementById("msgInput");

// ENTER envia mensagem
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
});

socket.on("mensagemEditada", ({ id, text }) => {
  const msgEl = document
    .querySelector(`.msg-menu[data-id="${id}"]`)
    ?.closest(".msg");

  if (!msgEl) return;

  const textoDiv = msgEl.querySelector(".msg-texto");
  if (textoDiv) {
    textoDiv.innerText = text;
  }
});

socket.on("mensagemExcluida", ({ id }) => {
  const msgEl = document
    .querySelector(`.msg-menu[data-id="${id}"]`)
    ?.closest(".msg");

  if (msgEl) {
    msgEl.remove();
  }
});





});

// ===============================
// FUNÇÕES
// ===============================

function scrollParaFinal() {
  const chat = document.getElementById("chatBox");
  if (!chat) return;

  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}


function formatarTempo(timestamp) {
  if (!timestamp || timestamp === "0") return "agora";

  // aceita número OU string ISO
  const time =
    typeof timestamp === "number"
      ? timestamp
      : new Date(timestamp).getTime();

  if (isNaN(time)) return "agora";

  const diff = Date.now() - time;

  const min = Math.floor(diff / 60000);
  const h   = Math.floor(diff / 3600000);
  const d   = Math.floor(diff / 86400000);

  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (h < 24) return `há ${h} h`;
  if (d === 1) return "ontem";
  return `há ${d} dias`;
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

  if (!modelo_id || !cliente_id) {
  alert("Erro de sessão. Recarregue a página.");
  return;
}
  socket.emit("sendMessage", {
    cliente_id,
    modelo_id,
    text
  });

  const item = [...document.querySelectorAll("#listaModelos li")]
  .find(li => Number(li.dataset.modeloId) === modelo_id);

if (item) {
  const badge = item.querySelector(".badge");
  badge.classList.add("hidden");
}

if (item) {
  item.dataset.lastTime = Date.now();
  item.dataset.status = "normal";
  atualizarBadgeComTempo(item);
  organizarListaModelos();
}

  input.value = "";
}

function renderMensagem(msg) {
  const chat = document.getElementById("chatBox");
  if (!chat) return;

  const div = document.createElement("div");

  // alinhamento correto
  div.className =
    msg.sender === "cliente" ? "msg msg-cliente" : "msg msg-modelo";

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
  <span class="msg-hora">${formatarHora(msg.created_at)}</span>
`;
  }

else {
  div.innerHTML = `
    <div class="msg-texto">${msg.text}</div>

    ${msg.sender === "modelo" ? `
<button
  class="msg-menu"
  data-id="${msg.id}"
  data-text="${encodeURIComponent(msg.text || "")}">
  ⋮
</button>
    ` : ""}

    <span class="msg-hora">${formatarHora(msg.created_at)}</span>
  `;
}
  chat.appendChild(div);
const btn = div.querySelector(".msg-menu");
if (btn) {
  btn.addEventListener("click", () => {
    console.log("CLIQUEI NO MENU", btn.dataset.id);
    abrirMenuMensagem(
  btn.dataset.id,
  decodeURIComponent(btn.dataset.text)
);
  });
}

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
  await carregarConteudosVistos(modelo_id);
  document.getElementById("popupConteudos").classList.remove("hidden");

  const grid = document.getElementById("previewConteudos");
  grid.innerHTML = "Carregando...";

  const res = await fetch("/api/conteudos", {
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
    const jaVisto = conteudosVistosModelo.has(c.id);

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
        alert("Este conteúdo já foi visto por esta modelo e não pode ser reenviado.");
      };
    } else {
      item.onclick = () => {
        item.classList.toggle("selected");
      };
    }

    grid.appendChild(item);
  });
}

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
  if (!modelo_id || !cliente_id) {
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
  const sala = `chat_${modelo_id}_${cliente_id}`;
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

async function carregarConteudosVistos(modelo_id) {
  const res = await fetch(`/api/chat/conteudos-vistos/${modelo_id}`, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const ids = await res.json();
  conteudosVistosModelo = new Set(ids);
}

function formatarHora(data) {
  if (!data) return "";

  const d = new Date(data);
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function marcarComoLido(clienteId) {
  try {
    await fetch(`/api/chat/marcar-lido/${clienteId}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });
  } catch (err) {
    console.error("Erro ao marcar como lido:", err);
  }
}

let mensagemEditandoId = null;
let elementoMensagemEditando = null;

function abrirMenuMensagem(id, texto) {
  mensagemEditandoId = id;

  // acha a mensagem no DOM
  elementoMensagemEditando = document.querySelector(
    `.msg-menu[data-id="${id}"]`
  )?.closest(".msg");

  document.getElementById("editarTexto").value = texto || "";
  document.getElementById("menuMensagem").classList.remove("hidden");
}


function fecharMenuMensagem() {
  mensagemEditandoId = null;
  elementoMensagemEditando = null;
  document.getElementById("menuMensagem").classList.add("hidden");
}

function salvarEdicao() {
  const novoTexto = document.getElementById("editarTexto").value.trim();

  if (!novoTexto) {
    alert("Mensagem vazia não é permitida.");
    return;
  }

  // 🔥 atualiza na tela
  if (elementoMensagemEditando) {
    const textoDiv = elementoMensagemEditando.querySelector(".msg-texto");
    if (textoDiv) {
      textoDiv.innerText = novoTexto;
    }
  }

  // (backend depois)
  socket.emit("editarMensagem", {
    id: mensagemEditandoId,
    text: novoTexto
  });

  fecharMenuMensagem();
}

function excluirMensagem() {
  if (!confirm("Tem certeza que deseja excluir esta mensagem?")) return;

  // 🔥 remove da tela
  if (elementoMensagemEditando) {
    elementoMensagemEditando.remove();
  }

  // (backend depois)
  socket.emit("excluirMensagem", {
    id: mensagemEditandoId
  });

  fecharMenuMensagem();
}

async function carregarInfoModelo(modeloId) {
  try {
    const res = await fetch(`/api/cliente/${modeloId}`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) return;

    const modelo = await res.json();

    const avatar = document.getElementById("chatmodeloAvatar");
    const nome = document.getElementById("chatmodeloNome");
    const status = document.getElementById("chatmodeloStatus");

    if (avatar) {
      avatar.src = modelo.avatar || "/assets/avatar.png";
    }

    if (nome) {
  nome.innerText = modelo.username || "Modelo";
}
if (status) {
  if (modelo.last_seen) {
    status.innerText = `visto por último: ${formatarTempo(modelo.last_seen)}`;
  } else {
    status.innerText = "visto por último: agora";
  }
}

  } catch (err) {
    console.error("Erro carregar modelo:", err);
  }
}








