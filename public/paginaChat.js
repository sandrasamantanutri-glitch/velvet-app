// ===============================
// CONTEXTO
// ===============================
const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

let cliente_id = Number(localStorage.getItem("chat_cliente_ativo"));
let modelo_id = null;
let conteudosVistosCliente = new Set();

const socket = io({ transports: ["websocket"] });

// ===============================
// SOCKET AUTH
// ===============================
socket.on("connect", () => {
  socket.emit("auth", { token });
});

// ===============================
// HISTÓRICO
// ===============================
socket.on("chatHistory", mensagens => {
  const chat = document.getElementById("chatBox");
  chat.innerHTML = "";
  mensagens.forEach(renderMensagem);

  socket.emit("chatOpened", { cliente_id, modelo_id });
});

// ===============================
// NOVA MENSAGEM
// ===============================
socket.on("newMessage", msg => {
  if (Number(msg.cliente_id) !== cliente_id) return;
  renderMensagem(msg);
});

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarModelo();
  await carregarCliente();
  await carregarConteudosVistos();

  const sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });
  socket.emit("getHistory", { cliente_id, modelo_id });

  bindUI();
});

// ===============================
// API
// ===============================
async function carregarModelo() {
  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + token }
  });
  const data = await res.json();
  modelo_id = Number(data.user_id ?? data.id);
  socket.emit("loginModelo", modelo_id);
}

async function carregarCliente() {
  const res = await fetch(`/api/cliente/${cliente_id}`, {
    headers: { Authorization: "Bearer " + token }
  });
  const c = await res.json();

  document.getElementById("clienteNome").innerText =
    c.username || c.nome || "Cliente";

  document.getElementById("chatAvatar").src =
    c.avatar || "/assets/avatarDefault.png";
}

async function carregarConteudosVistos() {
  const res = await fetch(`/api/chat/conteudos-vistos/${cliente_id}`, {
    headers: { Authorization: "Bearer " + token }
  });
  const ids = await res.json();
  conteudosVistosCliente = new Set(ids);
}

// ===============================
// UI
// ===============================
function bindUI() {
  document.getElementById("sendBtn").onclick = enviarMensagem;
  document.getElementById("btnVoltar").onclick = voltar;
  document.getElementById("btnEnviarConteudo").onclick = abrirPopupConteudos;

  document.getElementById("messageInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  });
}

// ===============================
// ENVIO TEXTO
// ===============================
function enviarMensagem() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  socket.emit("sendMessage", {
    cliente_id,
    modelo_id,
    text
  });

  input.value = "";
}

// ===============================
// RENDER
// ===============================
function renderMensagem(msg) {
  const chat = document.getElementById("chatBox");
  if (!chat) return;

  const div = document.createElement("div");
  div.className =
    msg.sender === "modelo" ? "msg msg-modelo" : "msg msg-cliente";

  // ===============================
  // 📦 CONTEÚDO (IMAGEM / VÍDEO)
  // ===============================
  if (msg.tipo === "conteudo" && Array.isArray(msg.midias)) {

    const midiasHTML = msg.midias.map(m => {
      const url  = m.url || m.file_url || m.media_url;
      const tipo = m.tipo_media || m.tipo;

      if (!url) return "";

      if (tipo === "video") {
        return `
          <div class="midia-item">
            <video
              src="${url}"
              muted
              playsinline
              preload="metadata"
              controls
            ></video>
          </div>
        `;
      }

      return `
        <div class="midia-item">
          <img src="${url}" />
        </div>
      `;
    }).join("");

    div.innerHTML = `
      <div class="chat-conteudo premium" data-id="${msg.id}">
        <div class="pacote-grid">
          ${midiasHTML}
        </div>
      </div>
    `;
  }

  // ===============================
  // 💬 TEXTO NORMAL
  // ===============================
  else {
    div.textContent = msg.text || "";
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ===============================
// 📦 POPUP DE CONTEÚDOS (IGUAL CHATMODELO)
// ===============================
async function abrirPopupConteudos() {
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
      "preview-item" + (jaVisto ? " visto desabilitado" : "");
    item.dataset.conteudoId = c.id;

    item.innerHTML = `
      ${c.tipo === "video"
        ? `<video src="${c.url}" muted></video>`
        : `<img src="${c.url}" />`
      }
      ${jaVisto ? `<span class="badge-visto">Visto</span>` : ""}
    `;

    if (jaVisto) {
      item.onclick = () => {
        alert("Este conteúdo já foi visto por este cliente.");
      };
    } else {
      item.onclick = () => {
        item.classList.toggle("selected");
      };
    }

    grid.appendChild(item);
  });
}

function confirmarEnvioConteudo() {
  if (!cliente_id || !modelo_id) {
    alert("Sessão inválida.");
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

  const conteudos_ids = selecionados.map(el =>
    Number(el.dataset.conteudoId)
  );

  const sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });

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

function fecharPopupConteudos() {
  const popup = document.getElementById("popupConteudos");
  if (!popup) return;

  popup.classList.add("hidden");

  document
    .querySelectorAll(".preview-item.selected")
    .forEach(el => el.classList.remove("selected"));

  const precoInput = document.getElementById("precoConteudo");
  if (precoInput) precoInput.value = 0;
}


// ===============================
// VOLTAR
// ===============================
function voltar() {
  window.location.href = "/chat-app.html";
}
