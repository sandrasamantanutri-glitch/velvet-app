// ===============================
// AUTH GUARD — CHAT CLIENTE
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}
window.socket = io({
  transports: ["websocket"]
});

socket.emit("auth", { token });

let cliente_id = null;
let modelo_id = null;
const conteudosLiberados = new Set();
let pagamentoAtual = {};

// 📜 HISTÓRICO
socket.on("chatHistory", mensagens => {
  const chat = document.getElementById("chatBox");
  chat.innerHTML = "";

  mensagens.forEach(m => {

    // 🔓 marca como liberado ao carregar histórico
    if (m.tipo === "conteudo") {
      if (m.visto === true || Number(m.preco) === 0) {
        conteudosLiberados.add(Number(m.id));
      }
    }

    renderMensagem(m);
  });

});

// 💬 NOVA MENSAGEM
socket.on("newMessage", msg => {
  if (Number(msg.modelo_id) !== Number(modelo_id)) return;

  renderMensagem(msg);
});


socket.on("conteudoVisto", async ({ message_id }) => {

  console.log("🔓 Conteúdo liberado:", message_id);
  conteudosLiberados.add(Number(message_id));

  const card = document.querySelector(
    `.chat-conteudo[data-id="${message_id}"]`
  );

  if (!card) return;

  const res = await fetch(`/api/chat/conteudo/${message_id}`, {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) return;

  const midias = await res.json();

  card.classList.remove("bloqueado");
  card.classList.add("livre");

card.innerHTML = `
  <div class="pacote-grid">
    ${midias.map((m, index) => `
  <div class="midia-item"
       onclick="abrirConteudoSeguro(${message_id}, ${index})">
    ${
      m.tipo_media === "video"
        ? `<video src="${m.url}" muted playsinline></video>`
        : `<img src="${m.url}" />`
    }
  </div>
`).join("")}

  </div>
 `;
 const toast = document.getElementById("toastPagamento");

if (toast) {
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

 card.classList.remove("bloqueado");
card.classList.add("livre");
card.removeAttribute("data-preco");

});


// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {

  // 🔐 carrega cliente
  await carregarCliente();

  // 🔥 pega modelo pela URL
  const params = new URLSearchParams(window.location.search);
  modelo_id = Number(params.get("modelo_id"));

  if (!modelo_id) {
    alert("Modelo inválida.");
    return;
  }

  // 🔌 entra direto na sala
  const sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });
  socket.emit("getHistory", { cliente_id, modelo_id });

  // 📨 botão enviar
  const sendBtn = document.getElementById("sendBtn");
  const input   = document.getElementById("messageInput");

  sendBtn.onclick = enviarMensagem;

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  });

const avatarEl = document.getElementById("chatAvatar");

if (avatarEl) {
  avatarEl.onerror = () => {
    avatarEl.src = "/assets/avatar.png";
  };
}

  // 💳 botão desbloquear (delegação)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-desbloquear");
    if (!btn) return;

    const preco = btn.dataset.preco;
    const conteudoId = btn.dataset.conteudoId;
    const messageId = btn.dataset.messageId;
     console.log("conteudoId recebido:", conteudoId); // 🔥 ADICIONA ISSO
    abrirPagamentoChat(preco, conteudoId, messageId);
  });

});


// ===============================
// FUNÇÕES
// 💰 FORMATA VALORES EM REAL (R$)
function valorBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}


function fecharEscolha() {
  document
    .getElementById("escolhaPagamento")
    .classList.add("hidden");
}

async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();
  cliente_id = data.id;

  socket.emit("loginCliente", cliente_id);
}

function enviarMensagem() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  if (!modelo_id) {
  alert("Selecione uma modelo para conversar.");
  return;
}

// ❌ erro real de sessão
if (!cliente_id) {
  alert("Erro de sessão. Recarregue a página.");
  return;
}

  socket.emit("sendMessage", {
    cliente_id,
    modelo_id,
    text
  });

  input.value = "";
}

function renderMensagem(msg) {

  const chat = document.getElementById("chatBox");
  if (!chat) return;

  const div = document.createElement("div");

  div.className =
    msg.sender === "modelo"
      ? "msg msg-modelo"
      : "msg msg-cliente";

  /* ✉️ TEXTO */
  if (msg.tipo === "texto") {
    div.innerText = msg.text;
  }

  /* 📦 CONTEÚDO */
  else if (msg.tipo === "conteudo") {

    const liberado =
  msg.visto === true ||
  conteudosLiberados.has(Number(msg.id)) ||
  Number(msg.preco) === 0;


    // 🔓 LIBERADO
  if (liberado) {
  div.innerHTML = `
    <div class="chat-conteudo livre premium"
         data-id="${msg.id}"
         data-qtd="${msg.quantidade ?? msg.midias.length}">
      <div class="pacote-grid">
        ${msg.midias.map((m, index) => `
          <div class="midia-item"
               onclick="abrirConteudoSeguro(${msg.id}, ${index})">
            ${
              (m.tipo_media || m.tipo) === "video"
                ? `<video src="${m.url}" muted playsinline></video>`
                : `<img src="${m.url}" />`
            }
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

    // 🔒 BLOQUEADO
    else {
      div.innerHTML = `
        <div class="chat-conteudo bloqueado premium"
     data-id="${msg.id}"
     data-preco="${msg.preco}"
     data-qtd="${msg.quantidade ?? 1}">
          <div class="pacote-grid">
            ${Array(msg.quantidade ?? 1).fill("").map(() =>
  `<div class="midia-item placeholder"
       onclick="abrirPagamentoChat(${msg.preco}, ${msg.conteudo_id})"></div>`
).join("")}
          </div>

         <div class="conteudo-info">
  <span class="status-bloqueado">
    ${msg.quantidade ?? 1} mídia(s)
  </span>

  <span class="preco-bloqueado">
    R$ ${Number(msg.preco).toFixed(2)}
  </span>

<button class="btn-desbloquear"
  data-preco="${msg.preco}"
  data-conteudo-id="${msg.conteudo_id}"
  data-message-id="${msg.id}">
  Desbloquear
</button>
</div>
</div>
      `;
    }
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function avisarConteudoBloqueado() {
  alert("Você precisa desbloquear a mídia para ver o conteúdo.");
}

async function abrirConteudoSeguro(message_id, index = 0) {
  const modal = document.getElementById("modalConteudo");
  const midiaBox = document.getElementById("modalMidia");
  
  conteudosLiberados.add(Number(message_id));
  socket.emit("marcarConteudoVisto", {
  message_id,
  cliente_id,
  modelo_id
 });

  if (!modal || !midiaBox) {
    console.error("❌ Modal de conteúdo não encontrado no DOM");
    return;
  }

  modal.classList.remove("hidden");
  midiaBox.innerHTML = "<p>Carregando...</p>";

  try {
    const res = await fetch(`/api/chat/conteudo/${message_id}`, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      midiaBox.innerHTML = "<p>Erro ao carregar conteúdo.</p>";
      return;
    }

    const midias = await res.json();
    const midia = midias[index];

    if (!midia) {
  midiaBox.innerHTML = "<p>Erro ao abrir mídia.</p>";
  return;
}

     midiaBox.innerHTML =
      (midia.tipo_media || midia.tipo) === "video"
        ? `<video src="${midia.url}" controls autoplay></video>`
        : `<img src="${midia.url}" />`;

  } catch (err) {
    console.error("Erro abrir conteúdo:", err);
    midiaBox.innerHTML = "<p>Erro inesperado.</p>";
  }
}


function fecharConteudo() {
  const modal = document.getElementById("modalConteudo");
  const midia = document.getElementById("modalMidia");

  modal.classList.add("hidden");
  midia.innerHTML = "";
}

document.addEventListener("click", e => {
  if (
    e.target.classList.contains("modal-backdrop") ||
    e.target.classList.contains("modal-fechar")
  ) {
    fecharConteudo();
  }
});


function fecharPagamento() {
  const modal = document.getElementById("paymentModal");
  if (modal) modal.classList.add("hidden");

  // limpa Stripe Elements
  const el = document.getElementById("payment-element");
  if (el) el.innerHTML = "";

  elements = null;
}

function abrirPagamentoChat(preco, conteudoId, messageId) {

  window.PAGAMENTO_TIPO_ATUAL = "midia";
  window.PAGAMENTO_ORIGEM = "chat";

  window.MIDIA_VENDA_ATUAL = {
  conteudo_id: Number(conteudoId),
  message_id: Number(messageId),   // 🔥 ESSENCIAL
  preco: Number(preco),
  descricao: "Conteúdo exclusivo no chat"
};

  abrirPopupPagamento();
}