// ===============================
// CONTEXTO
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role"); // deve ser "modelo"
const cliente_id = Number(localStorage.getItem("chat_cliente_ativo"));

if (!token || !cliente_id) {
  window.location.href = "/chat-app.html";
  throw new Error("Sessão inválida");
}

const socket = io({
  transports: ["websocket"]
});

let modelo_id = null;
let conteudosVistosCliente = new Set();

// ===============================
// 🔐 SOCKET AUTH
// ===============================
socket.on("connect", () => {
  socket.emit("auth", { token });
});

// ===============================
// 📜 HISTÓRICO
// ===============================
socket.on("chatHistory", mensagens => {
  const chat = document.getElementById("chatMensagens");
  chat.innerHTML = "";

  mensagens.forEach(m => renderMensagem(m));

  // 🔥 abriu o chat → marcar como lido globalmente
  socket.emit("chatOpened", {
    cliente_id,
    modelo_id
  });
});

// ===============================
// 💬 NOVA MENSAGEM (REALTIME)
// ===============================
socket.on("newMessage", msg => {
  if (Number(msg.cliente_id) !== cliente_id) return;
  renderMensagem(msg);
});

// ===============================
// 👁️ CONTEÚDO VISTO (SYNC TOTAL)
// ===============================
socket.on("conteudoVisto", ({ message_id }) => {
  const el = document.querySelector(
    `.chat-conteudo[data-id="${message_id}"]`
  );
  if (!el) return;

  el.classList.remove("nao-visto", "bloqueado");
  el.classList.add("visto");
});

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarModelo();
  await carregarCliente();
  await carregarConteudosVistos(cliente_id);

  // 📡 entrar na sala
  const sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });
  socket.emit("getHistory", { cliente_id, modelo_id });

  // ⌨️ envio por ENTER
  const input = document.getElementById("chatInput");
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  });

  // 🔙 BOTÃO VOLTAR
  const btnVoltar = document.getElementById("btnVoltar");
  btnVoltar.onclick = voltar;

  // ✉️ BOTÃO ENVIAR
  const btnEnviar = document.getElementById("chatEnviar");
  btnEnviar.onclick = enviarMensagem;

});

// ===============================
// FUNÇÕES
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

  if (!res.ok) return;

  const c = await res.json();
  document.getElementById("chatNome").innerText =
    c.username || c.nome || "Cliente";

  document.getElementById("chatAvatar").src =
    c.avatar || "/assets/avatarDefault.png";
}

async function carregarConteudosVistos(cliente_id) {
  const res = await fetch(`/api/chat/conteudos-vistos/${cliente_id}`, {
    headers: { Authorization: "Bearer " + token }
  });

  const ids = await res.json();
  conteudosVistosCliente = new Set(ids);
}

// ===============================
// ✉️ ENVIAR TEXTO
// ===============================
function enviarMensagem() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  if (!cliente_id || !modelo_id) return;

  socket.emit("sendMessage", {
    cliente_id,
    modelo_id,
    text
  });

  input.value = "";
}

// ===============================
// 🎨 RENDER MENSAGEM (COPIADO DO MODELO)
// ===============================
function renderMensagem(msg) {
  const chat = document.getElementById("chatMensagens");
  if (!chat) return;

  const div = document.createElement("div");
  div.className =
    msg.sender === "modelo" ? "msg msg-modelo" : "msg msg-cliente";

  // 📦 CONTEÚDO
  if (
    msg.tipo === "conteudo" &&
    Array.isArray(msg.midias) &&
    msg.midias.length > 0
  ) {
    div.innerHTML = `
<div class="chat-conteudo premium ${msg.visto ? "visto" : "bloqueado"}"
     data-id="${msg.id}">

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

  ${
    msg.preco > 0
      ? `
      <div class="conteudo-info">
        <span class="status-bloqueado">
          ${
            msg.visto
              ? `🟢 Vendido`
              : `🔒 ${msg.midias.length} mídia(s)`
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
  // 💬 TEXTO NORMAL
  else {
    div.textContent = msg.text;
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ===============================
// 🔙 VOLTAR
// ===============================
function voltar() {
  window.location.href = "/chat-app.html";
}
