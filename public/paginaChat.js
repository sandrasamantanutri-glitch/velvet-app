// ===============================
// CONTEXTO
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role"); // modelo

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

let cliente_id = Number(localStorage.getItem("chat_cliente_ativo")) || null;
let modelo_id  = null;
let conteudosVistosCliente = new Set();

const socket = io({
  transports: ["websocket"]
});

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
  if (!chat) return;

  chat.innerHTML = "";
  mensagens.forEach(renderMensagem);

  if (cliente_id && modelo_id) {
    socket.emit("chatOpened", { cliente_id, modelo_id });
  }
});

// ===============================
// 💬 NOVA MENSAGEM
// ===============================
socket.on("newMessage", msg => {
  if (!cliente_id) return;
  if (Number(msg.cliente_id) !== Number(cliente_id)) return;
  renderMensagem(msg);
});

// ===============================
// 👁️ CONTEÚDO VISTO
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
// INIT (IGUAL AO CHATMODELO)
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarModelo();

  if (!cliente_id) {
    console.warn("⚠️ Nenhum cliente ativo");
    return;
  }

  await carregarCliente();
  await carregarConteudosVistos(cliente_id);

  entrarNoChat(cliente_id);
  bindUI();
});

// ===============================
// 🔁 FLUXO CENTRAL (COPIADO DO CHATMODELO)
// ===============================
function entrarNoChat(cid) {
  cliente_id = Number(cid);
  localStorage.setItem("chat_cliente_ativo", cliente_id);

  const sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });
  socket.emit("getHistory", { cliente_id, modelo_id });
}

// ===============================
// UI
// ===============================
function bindUI() {
  const input = document.getElementById("chatInput");
  const btnEnviar = document.getElementById("btnEnviar");
  const btnVoltar = document.getElementById("btnVoltar");

  if (input) {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        enviarMensagem();
      }
    });
  }

  if (btnEnviar) btnEnviar.onclick = enviarMensagem;
  if (btnVoltar) btnVoltar.onclick = voltar;
}

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
// ENVIO
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
// RENDER
// ===============================
function renderMensagem(msg) {
  const chat = document.getElementById("chatMensagens");
  if (!chat) return;

  const div = document.createElement("div");
  div.className =
    msg.sender === "modelo" ? "msg msg-modelo" : "msg msg-cliente";

  if (
    msg.tipo === "conteudo" &&
    Array.isArray(msg.midias) &&
    msg.midias.length
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
      </div>
    `;
  } else {
    div.textContent = msg.text;
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ===============================
// VOLTAR
// ===============================
function voltar() {
  window.location.href = "/chat-app.html";
}
