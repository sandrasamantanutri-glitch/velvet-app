// ===============================
// AUTH GUARD — CHAT CLIENTE
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
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

socket.on("chatMetaUpdate", data => {
  atualizarListaComMeta(data);
});

// 💬 NOVA MENSAGEM
socket.on("newMessage", msg => {

  // 🔒 se a mensagem NÃO é deste chat, ignora
  if (Number(msg.modelo_id) !== Number(modelo_id)) return;

  // ✅ renderiza sempre no chat aberto
  renderMensagem(msg);

  // ❗ SÓ marca "Não lida" se EU NÃO fui quem enviou
  if (msg.sender !== "cliente") {
    atualizarItemListaComNovaMensagem(msg);
  }
});


socket.on("conteudoVisto", ({ message_id }) => {
  const el = document.querySelector(
    `.chat-conteudo[data-id="${message_id}"]`
  );
  if (el) {
    el.classList.add("visto");
  }
});


socket.on("unreadUpdate", ({ cliente_id, modelo_id, unread }) => {

  if (!unread) return;

  const li = [...document.querySelectorAll("#listaModelos li")]
    .find(el => Number(el.dataset.modeloId) === modelo_id);

  if (!li) return;

  li.classList.add("nao-lida");

  const badge = li.querySelector(".badge");
  badge.innerText = "Não lida";
  badge.classList.remove("hidden");
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
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // 🚫 impede quebra de linha
    enviarMensagem();
  }
  });
  const avatarEl = document.getElementById("chatAvatar");

  avatarEl.onerror = () => {
  avatarEl.src =
    "https://velvet-app-production.up.railway.app/assets/avatarDefault.png";
  };

});



// ===============================
// FUNÇÕES
// ===============================
function atualizarListaComMeta({ cliente_id, modelo_id, sender, created_at }) {
  const minhaRole = localStorage.getItem("role");

  const li = [...document.querySelectorAll(".chat-item")]
    .find(el =>
      minhaRole === "cliente"
        ? Number(el.dataset.modeloId) === modelo_id
        : Number(el.dataset.clienteId) === cliente_id
    );

  if (!li) return;

  // horário
  li.dataset.lastTime = new Date(created_at).getTime();

  // status
  if (sender !== minhaRole) {
    li.dataset.status = "por-responder";
    li.querySelector(".badge").innerText = "Por responder";
    li.querySelector(".badge").classList.remove("hidden");
  }

  organizarListaClientes?.();
  organizarListaModelos?.();
}

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

  const unreadRes = await fetch("/api/chat/unread/cliente", {
    headers: { Authorization: "Bearer " + token }
  });
  const unreadIds = await unreadRes.json();

  modelos.forEach(m => {
    const li = document.createElement("li");
    li.className = "chat-item";
    li.dataset.modeloId = m.modelo_id;

    const temNaoLida = unreadIds.includes(m.modelo_id);

    li.innerHTML = `
      <span class="nome">${m.nome}</span>
      <span class="badge ${temNaoLida ? "" : "hidden"}">Não lida</span>
    `;

    li.onclick = () => {
      modelo_id = m.modelo_id;
      chatAtivo = { cliente_id, modelo_id };

      mensagensRenderizadas.clear();
      document.getElementById("chatBox").innerHTML = "";
      document.getElementById("chatNome").innerText = m.nome;
      if (m.avatar) {
        document.getElementById("chatAvatar").src = m.avatar;
      }

      li.querySelector(".badge")?.classList.add("hidden");
      li.classList.remove("nao-lida");

      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.emit("joinChat", { sala });
      socket.emit("getHistory", { cliente_id, modelo_id });
    };

    lista.appendChild(li);
  });
}

async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();
  cliente_id = data.id;

  document.getElementById("clienteNomeTitulo").innerText = data.nome;

  socket.emit("loginCliente", cliente_id);
}

function atualizarItemListaComNovaMensagem(msg) {

  // 🚫 cliente NÃO marca Não lida para mensagens dele mesmo
  if (msg.sender === "cliente") return;

  const li = [...document.querySelectorAll("#listaModelos li")]
    .find(el => Number(el.dataset.modeloId) === msg.modelo_id);

  if (!li) return;

  li.dataset.status = "nao-lida";

  const badge = li.querySelector(".badge");
  badge.innerText = "Não lida";
  badge.classList.remove("hidden");

  li.dataset.lastTime = Date.now();

  organizarListaModelos?.();
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
const msgKey = msg.id ?? `${msg.sender}-${msg.created_at}`;
if (mensagensRenderizadas.has(msgKey)) return;

mensagensRenderizadas.add(msgKey);
const chat = document.getElementById("chatBox");
  if (!chat) return;

  const div = document.createElement("div");

  const minhaRole = localStorage.getItem("role"); // "cliente" | "modelo"
  div.className =
  msg.sender === "modelo"
    ? "msg msg-modelo"   // 👉 direita
    : "msg msg-cliente"; // 👉 esquerda

  /* ===============================
     📦 CONTEÚDO (IMAGEM / VÍDEO)
  =============================== */
  if (msg.tipo === "conteudo") {

    if ((msg.gratuito || Number(msg.preco) === 0 || msg.pago) && msg.url) {

      div.innerHTML = `
      <div class="chat-conteudo livre"
      data-id="${msg.id}"
     data-url="${msg.url}"
     data-tipo="${msg.tipo_media}">
      ${
      msg.tipo_media === "video"
        ? `<video src="${msg.url}" muted></video>`
        : `<img src="${msg.url}" />`
      }
      </div>
      `;
    }
const conteudo = div.querySelector(".chat-conteudo");

if (conteudo) {
  conteudo.addEventListener("click", () => {

    // abre sempre
    if (conteudo.dataset.url) {
      abrirConteudo(
        conteudo.dataset.url,
        conteudo.dataset.tipo
      );
    }

    // 🔔 SEMPRE marca como visto (pago OU gratuito)
    socket.emit("conteudoVisto", {
      message_id: msg.id,
      cliente_id,
      modelo_id,
      conteudo_id: msg.conteudo_id
    });
  });
}

    // 🔒 BLOQUEADO (PAGO)
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

function organizarListaModelos() {
  const lista = document.getElementById("listaModelos");
  if (!lista) return;

  const itens = [...lista.querySelectorAll("li")];

  itens.sort((a, b) => {
    const ta = Number(a.dataset.lastTime || 0);
    const tb = Number(b.dataset.lastTime || 0);
    return tb - ta; // mais recente primeiro
  });

  itens.forEach(li => lista.appendChild(li));
}

function organizarListaClientes() {
  // cliente NÃO usa essa função
  // deixamos vazia só pra não quebrar
}


setInterval(() => {
  document
    .querySelectorAll(".chat-item")
    .forEach(li => atualizarBadgeComTempo(li));
}, 60000); // a cada 1 min


