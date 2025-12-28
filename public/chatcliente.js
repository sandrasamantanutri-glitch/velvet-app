// ===============================
// AUTH GUARD — CHAT CLIENTE
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "cliente") {
  window.location.href = "/index.html";
  throw new Error("Acesso negado");
}

const socket = io({
  transports: ["websocket"]
});

let cliente_id = null;
let modelo_id = null;
let chatAtivo = null;
const mensagensRenderizadas = new Set();

// 🔐 SOCKET AUTH
socket.on("connect", () => {
  socket.emit("auth", {
    token: localStorage.getItem("token")
  });
});

// 📜 HISTÓRICO
socket.on("chatHistory", mensagens => {
  const chat = document.getElementById("chatBox");
  chat.innerHTML = "";

  mensagens.forEach(m => renderMensagem(m));

  atualizarStatusPorResponder(mensagens);
});


// 💬 NOVA MENSAGEM
socket.on("newMessage", msg => {
  // sempre renderiza se for deste cliente
  if (msg.cliente_id === cliente_id) {
    renderMensagem(msg);
  }
});


socket.on("unreadUpdate", ({ cliente_id, modelo_id }) => {
  document.querySelectorAll("#listaModelos li").forEach(li => {
    if (Number(li.dataset.modeloId) === modelo_id) {
      li.classList.add("nao-lida");

      const badge = li.querySelector(".badge");
      badge.innerText = "Não lida";
      li.querySelector(".badge").classList.remove("hidden");
    }
  });
});


// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarCliente();
  await carregarListaModelos();

  const sendBtn = document.getElementById("sendBtn");
  const input   = document.getElementById("messageInput");
  sendBtn.onclick = enviarMensagem;

  input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    enviarMensagem();
  }
});
});


// ===============================
// FUNÇÕES
// ===============================
async function carregarListaModelos() {
  const res = await fetch("/api/chat/cliente", {
    headers: { Authorization: "Bearer " + token }
  });

  const modelos = await res.json();
  const lista = document.getElementById("listaModelos");

  lista.innerHTML = "";

  if (!modelos.length) {
    lista.innerHTML = "<li>Você não tem modelos VIP.</li>";
    return;
  }

  modelos.forEach(m => {
   const li = document.createElement("li");
   li.className = "chat-item";
   li.dataset.modeloId = m.modelo_id;
   
   li.innerHTML = `
  <span class="nome">${m.nome}</span>
  <span class="badge hidden">Não lida</span>
  `;

li.onclick = () => {
  modelo_id = m.modelo_id;              // ✅ DEFINE O MODELO
  chatAtivo = { cliente_id, modelo_id };

  document.getElementById("clienteNome").innerText = m.nome;

  li.dataset.status = "normal";
  atualizarBadgeComTempo?.(li);
  organizarListaClientes?.();

  const sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });
  socket.emit("getHistory", { cliente_id, modelo_id });
};

    lista.appendChild(li);
  });
  const unreadRes = await fetch("/api/chat/unread/cliente", {
  headers: { Authorization: "Bearer " + token }
});
const unreadIds = await unreadRes.json();

document.querySelectorAll("#listaModelos li").forEach(li => {
  if (unreadIds.includes(Number(li.dataset.modeloId))) {
  li.classList.add("nao-lida");
  li.querySelector(".badge").classList.remove("hidden");
}
});

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

  if (!cliente_id || !modelo_id) {
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
  item.querySelector(".badge").classList.add("hidden");
}
  input.value = "";
}

function renderMensagem(msg) {
  // 🔒 evita duplicação
  if (mensagensRenderizadas.has(msg.id)) return;
  mensagensRenderizadas.add(msg.id);

  const chat = document.getElementById("chatBox");
  if (!chat) return;

  const div = document.createElement("div");

  const minhaRole = localStorage.getItem("role"); // "cliente" | "modelo"

  // 📍 alinhamento correto
  div.className =
    msg.sender === minhaRole
      ? "msg msg-cliente"
      : "msg msg-modelo";

  /* ===============================
   📦 CONTEÚDO (IMAGEM / VÍDEO)
=============================== */
if (msg.tipo === "conteudo") {

  // ✅ CONTEÚDO LIBERADO (GRÁTIS OU PAGO)
  if ((msg.gratuito || Number(msg.preco) === 0 || msg.pago) && msg.url) {

    div.innerHTML = `
      <div 
        class="chat-conteudo livre" 
        data-url="${msg.url}" 
        data-tipo="${msg.tipo_media}"
      >
        ${
          msg.tipo_media === "video"
            ? `<video src="${msg.url}" muted></video>`
            : `<img src="${msg.url}" />`
        }
      </div>
    `;

    const conteudoLivre = div.querySelector(".chat-conteudo.livre");

    conteudoLivre.addEventListener("click", () => {
      abrirConteudo(
        conteudoLivre.dataset.url,
        conteudoLivre.dataset.tipo
      );
    });

  }

  // 🔒 CONTEÚDO BLOQUEADO (PAGO)
  else {

    div.innerHTML = `
      <div 
        class="chat-conteudo bloqueado"
        data-id="${msg.conteudo_id}"
        data-preco="${msg.preco}"
      >
        <div class="blur-fundo"></div>

        <div class="overlay-conteudo">
          <img src="/assets/lock.png" class="lock-icon" />
          <div class="valor-conteudo">R$ ${msg.preco}</div>
          <div class="conteudo-msg">Desbloquear</div>
        </div>
      </div>
    `;
  }
}

  /* ===============================
     💬 TEXTO NORMAL
  =============================== */
  else {
    div.textContent = msg.text;
  }

  // ✅ ESSENCIAL: adiciona no chat
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function marcarNaoLida(msg) {
  document.querySelectorAll("#listaModelos li").forEach(li => {
    if (Number(li.dataset.modeloId) === msg.modelo_id) {
      li.classList.add("nao-lida");
      li.querySelector(".badge").classList.remove("hidden");
    }
  });
}

function adicionarMensagemNoChat(msg) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;

  const div = document.createElement("div");
  div.className = msg.sender === "cliente" ? "msg cliente" : "msg modelo";
  div.innerText = msg.text;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function atualizarStatusPorResponder(mensagens) {
  if (!mensagens || mensagens.length === 0) return;

  const ultima = mensagens[mensagens.length - 1];
  const minhaRole = localStorage.getItem("role"); // cliente | modelo

  const item = [...document.querySelectorAll(".chat-item")]
    .find(li =>
      minhaRole === "cliente"
        ? Number(li.dataset.modeloId) === ultima.modelo_id
        : Number(li.dataset.clienteId) === ultima.cliente_id
    );

  if (!item) return;

  const badge = item.querySelector(".badge");

  // ✅ última mensagem NÃO foi minha → por responder
  if (ultima.sender !== minhaRole) {
    badge.innerText = "Por responder";
    badge.classList.remove("hidden");
    item.classList.remove("nao-lida");
  }
  // ✅ última mensagem foi minha → limpa tudo
  else {
    badge.classList.add("hidden");
    item.classList.remove("nao-lida");
  }
}

function abrirConteudo(url, tipo) {
  const modal = document.getElementById("modalConteudo");
  const midia = document.getElementById("modalMidia");

  midia.innerHTML =
    tipo === "video"
      ? `<video src="${url}" controls autoplay></video>`
      : `<img src="${url}" />`;

  modal.classList.remove("hidden");
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

