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

  const div = document.createElement("div");
  div.className =
    msg.sender === "modelo" ? "msg msg-modelo" : "msg msg-cliente";

  if (msg.tipo === "conteudo") {
    div.innerHTML = `
      <div class="chat-conteudo premium" data-id="${msg.id}">
         <div class="pacote-grid">
          ${(msg.midias || []).map(m => `
            <div class="midia-item">
              ${
                (m.tipo_media || m.tipo) === "video"
                  ? `
                    <div class="midia-video">
                      <img src="${m.thumbnail_url || m.thumb || m.url}" />
                      <span class="video-icon">▶</span>
                    </div>
                  `
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
                      ? `🟢 Vendido · ${msg.quantidade ?? msg.midias?.length ?? 0} mídia(s)`
                      : `🔒 ${msg.quantidade ?? msg.midias?.length ?? 0} mídia(s)`
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
  } else {
    // fallback seguro para mensagens normais
    div.textContent = msg.texto || "";
  }

  // ✅ ESSENCIAL — estava faltando
  chat.appendChild(div);
}

// ===============================
// VOLTAR
// ===============================
function voltar() {
  window.location.href = "/chat-app.html";
}
