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

  // ❗ SÓ marca "Não visto" se EU NÃO fui quem enviou
  if (msg.sender !== "cliente") {
    atualizarItemListaComNovaMensagem(msg);
    contarChatsNaoLidosCliente();
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


socket.on("unreadUpdate", ({ modelo_id, unread }) => {
  if (!unread) return;

  const li = [...document.querySelectorAll("#listaModelos li")]
    .find(el => Number(el.dataset.modeloId) === Number(modelo_id));

  if (!li) return;

  li.classList.add("nao-visto");

  const badge = li.querySelector(".badge");
  badge.innerText = "Não visto";
  badge.classList.remove("hidden");

  // 🔔 ATUALIZA HEADER
  contarChatsNaoLidosCliente();
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

    const temNaoVisto = unreadIds.includes(m.modelo_id);

    li.innerHTML = `
      <span class="nome">${m.nome}</span>
      <span class="badge ${temNaoVisto ? "" : "hidden"}">Não visto</span>
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
      li.classList.remove("nao-visto");

      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.emit("joinChat", { sala });
      socket.emit("getHistory", { cliente_id, modelo_id });
    };

    lista.appendChild(li);
    contarChatsNaoLidosCliente();
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

  // 🚫 cliente NÃO marca Não visto para mensagens dele mesmo
  if (msg.sender === "cliente") return;

  const li = [...document.querySelectorAll("#listaModelos li")]
    .find(el => Number(el.dataset.modeloId) === msg.modelo_id);

  if (!li) return;

  li.dataset.status = "nao-visto";

  const badge = li.querySelector(".badge");
  badge.innerText = "Não visto";
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

    const liberado = !msg.bloqueado;

    // 🔓 LIBERADO
    if (liberado && Array.isArray(msg.midias)) {
      div.innerHTML = `
        <div class="chat-conteudo livre premium"
     data-id="${msg.id}"
     data-qtd="${msg.quantidade ?? msg.midias.length}">
          <div class="pacote-grid">
            ${msg.midias.map(m => `
              <div class="midia-item"
                   onclick="abrirConteudo('${m.url}', '${m.tipo_media}', ${msg.id})">
                ${
                  m.tipo_media === "video"
                    ? `<video src="${m.url}" muted></video>`
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
              `<div class="midia-item placeholder"></div>`
            ).join("")}
          </div>

         <div class="conteudo-info">
  <span class="status-bloqueado">
    ${msg.quantidade ?? 1} mídia(s)
  </span>

  <span class="preco-bloqueado">
    R$ ${Number(msg.preco).toFixed(2)}
  </span>

  <button class="btn-desbloquear">Desbloquear</button>
</div>
</div>
      `;
    }
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

  
function marcarNaoVisto(msg) {
  document.querySelectorAll("#listaModelos li").forEach(li => {
    if (Number(li.dataset.modeloId) === msg.modelo_id) {
      li.classList.add("nao-visto");
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
    item.classList.remove("nao-visto");
  }
  // ✅ última mensagem foi minha → limpa tudo
  else {
    badge.classList.add("hidden");
    item.classList.remove("nao-visto");
  }
}

function abrirConteudo(url, tipo, messageId) {
  const modal = document.getElementById("modalConteudo");
  const midia = document.getElementById("modalMidia");

  midia.innerHTML =
    tipo === "video"
      ? `<video src="${url}" controls autoplay></video>`
      : `<img src="${url}" />`;

  modal.classList.remove("hidden");

  // 👁️ MARCA COMO VISTO (🔥 ISSO DEIXA VERDE NA MODELO)
  socket.emit("marcarConteudoVisto", {
    message_id: messageId,
    cliente_id,
    modelo_id
  });
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

function contarChatsNaoLidosCliente() {
  const itens = document.querySelectorAll(
    "#listaModelos li.nao-visto, #listaModelos li[data-status='nao-visto']"
  );

  atualizarBadgeHeader(itens.length);
}



setInterval(() => {
  document
    .querySelectorAll(".chat-item")
    .forEach(li => atualizarBadgeComTempo(li));
}, 60000); // a cada 1 min


