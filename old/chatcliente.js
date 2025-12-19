const socket = window.socket;

if (!socket) {
  console.error("❌ Socket não disponível no chatmodelo");
}
// ===========================
// IDENTIDADE
// ===========================
const cliente = localStorage.getItem("clientName");
if (!cliente) {
    alert("Cliente não identificado");
    throw new Error("clientName ausente");
}

// ===========================
// ESTADO
// ===========================
const state = {
    modeloAtual: null,
    unread: {},
    modelos: []
};
// ===========================
// DOM
// ===========================
const chatBox = document.getElementById("chatBox");
const lista = document.getElementById("listaModelos");
const modeloNome = document.getElementById("modeloNome");

// ===========================
// SOCKET
// ===========================
socket.on("connect", () => {
    socket.emit("loginCliente", cliente);
    carregarModelos();
    pedirUnread();

    const modeloSalvo = localStorage.getItem("chatModelo");
    if (modeloSalvo) {
        abrirChat(modeloSalvo); // ✅ agora é seguro
    }
});


socket.on("chatHistory", onChatHistory);
socket.on("newMessage", onNewMessage);
socket.on("unreadUpdate", onUnreadUpdate);

socket.on("errorMessage", msg => {
    alert(msg);
});

// ===========================
// HANDLERS
// ===========================
function onChatHistory(messages) {
    chatBox.innerHTML = "";
    messages.forEach(renderMessage);
}

function onNewMessage(msg) {
    renderMessage(msg);
    pedirUnread();
}

function onUnreadUpdate(map) {
    state.unread = map;
    renderLista();
}

// ===========================
// LISTA DE MODELOS
// ===========================
async function carregarModelos() {
    const res = await fetch(`/api/cliente/${cliente}/modelos`);
    const modelosAPI = await res.json();

    const modeloDoPerfil = localStorage.getItem("modeloAtual");

    // base vem da API
    state.modelos = [...modelosAPI];

    // 🔑 se veio do perfil e não está na lista, adiciona
    if (modeloDoPerfil && !state.modelos.includes(modeloDoPerfil)) {
        state.modelos.unshift(modeloDoPerfil);
    }

    renderLista();

    // 🔑 se entrou pelo perfil, abre o chat automaticamente
    if (modeloDoPerfil && !state.modeloAtual) {
        abrirChat(modeloDoPerfil);
    }
}

function renderLista() {
    lista.innerHTML = "";

    const ordenados = [...state.modelos].sort((a, b) => {
        const aUnread = state.unread[a] ? 1 : 0;
        const bUnread = state.unread[b] ? 1 : 0;
        if (aUnread !== bUnread) return bUnread - aUnread;
        return a.localeCompare(b);
    });

    ordenados.forEach(nome => {
        const li = document.createElement("li");
        li.textContent = state.unread[nome] ? `${nome} (Não lida)` : nome;

        li.onclick = () => {
            abrirChat(nome);
            limparUnread(nome);
        };

        lista.appendChild(li);
    });
}

// ===========================
// CHAT
// ===========================
function abrirChat(nomeModelo) {
    if (state.modeloAtual === nomeModelo) return; // 🔑 evita reload

    state.modeloAtual = nomeModelo;
    modeloNome.textContent = nomeModelo;

    chatBox.innerHTML = ""; // ✅ só limpa ao trocar

    localStorage.setItem("modeloAtual", nomeModelo);
    localStorage.setItem("chatModelo", nomeModelo);

    socket.emit("joinRoom", { cliente, modelo: nomeModelo });
}



function limparUnread(modelo) {
    socket.emit("markAsRead", { cliente, modelo });
    delete state.unread[modelo];
    renderLista();
}

// ===========================
// ENVIO
// ===========================
document.getElementById("sendBtn").onclick = () => {
    if (!state.modeloAtual) {
        alert("Selecione um modelo");
        return;
    }

    const input = document.getElementById("msgInput");
    const text = input.value.trim();

    if (!text) return;

    socket.emit("sendMessage", {
        cliente,
        modelo: state.modeloAtual,
        from: cliente,
        text
    });

    input.value = "";
};

// ===========================
// RENDER
// ===========================
function renderMessage(msg) {
    if (msg.type === "conteudo") {

    const conteudo = {
        id: msg.conteudoId,
        tipo: msg.tipo || "imagem",
        arquivo: `/conteudo/abrir?modelo=${encodeURIComponent(state.modeloAtual)}&conteudoId=${msg.conteudoId}`,
        bloqueado: msg.preco > 0,
        preco: msg.preco
    };

    const card = renderConteudo(conteudo, "cliente");
    chatBox.appendChild(card);
    chatBox.scrollTop = chatBox.scrollHeight;
    return;
}


   const div = document.createElement("div");
div.classList.add("msg");

if (msg.from === cliente) {
  div.classList.add("msg-cliente");
} else {
  div.classList.add("msg-modelo");
}

div.innerHTML = `
  <div class="msg-text">${msg.text}</div>
`;
chatBox.appendChild(div);
chatBox.scrollTop = chatBox.scrollHeight;

}


function renderConteudoBloqueado(data) {
    const chatBox = document.getElementById("chatBox");

    const msg = document.createElement("div");
    msg.className = "msg-conteudo-bloqueado";

    const urlPreview =
        `/conteudo/abrir?modelo=${encodeURIComponent(data.modelo)}&conteudoId=${data.conteudoId}`;

    let previewHTML = "";

    if (data.tipo === "video") {
        previewHTML = `
            <video src="${urlPreview}" muted></video>
        `;
    } else {
        previewHTML = `
            <img src="${urlPreview}">
        `;
    }

    msg.innerHTML = `
        <div class="preview-blur">
            ${previewHTML}
        </div>

        <div class="conteudo-info">
            <p>🔒 Conteúdo bloqueado</p>
            <button onclick="desbloquearConteudo(${data.conteudoId})">
                Desbloquear €${data.preco}
            </button>
        </div>
    `;

    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
}


// ===========================
// UTIL
// ===========================
function pedirUnread() {
    socket.emit("getUnread", cliente);
}


function abrirConteudo(conteudoId) {
    const modelo = state.modeloAtual;
    if (!modelo) {
        alert("Modelo não identificado");
        return;
    }

    const url = `/conteudo/abrir?modelo=${encodeURIComponent(modelo)}&conteudoId=${encodeURIComponent(conteudoId)}`;

    // abre em nova aba (simples para testar)
    window.open(url, "_blank");
}

function comprarConteudo(conteudoId) {
    alert("💳 Compra simulada\nConteúdo: " + conteudoId);

    // aqui depois ligamos PayPal / Stripe
}


document.addEventListener("click", e => {
  if (e.target.classList.contains("btn-desbloquear")) {
    e.preventDefault();
    e.stopPropagation(); // 🔑 ESSENCIAL (para de piscar)

    const conteudoId = e.target.dataset.id;

    fetch("/api/desbloquear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conteudoId })
    })
    .then(res => res.json())
    .then(() => {
      console.log("Conteúdo desbloqueado");
    });
  }
});


// ================================
// RENDERIZA CONTEÚDO (IMAGEM/VÍDEO)
// ================================

function renderConteudo(conteudo, tipoUsuario) {
  const div = document.createElement("div");
  div.classList.add("chat-conteudo");

  // =========================
  // CLIENTE + CONTEÚDO BLOQUEADO
  // =========================
  if (tipoUsuario === "cliente" && conteudo.bloqueado) {
    div.classList.add("bloqueado");

    // PREVIEW
    if (conteudo.tipo === "imagem") {
      const img = document.createElement("img");
      img.src = conteudo.arquivo;
      div.appendChild(img);
    }

    if (conteudo.tipo === "video") {
      const video = document.createElement("video");
      video.src = conteudo.arquivo;
      video.muted = true;
      div.appendChild(video);
    }

    // OVERLAY INFO
    const info = document.createElement("div");
    info.className = "conteudo-info";
    info.innerHTML = `
      <p>🔒 Conteúdo bloqueado</p>
      <p class="preco">Preço: €${conteudo.preco}</p>
      <button class="btn-desbloquear" data-id="${conteudo.id}">
        Desbloquear
      </button>
    `;

    div.appendChild(info);
    return div;
  }

  // =========================
  // CONTEÚDO NORMAL (DESBLOQUEADO)
  // =========================
  if (conteudo.tipo === "imagem") {
    const img = document.createElement("img");
    img.src = conteudo.arquivo;
    div.appendChild(img);
  }

  if (conteudo.tipo === "video") {
    const video = document.createElement("video");
    video.src = conteudo.arquivo;
    video.controls = true;
    div.appendChild(video);
  }

  // clique abre
  div.addEventListener("click", () => {
    window.open(conteudo.arquivo, "_blank");
  });

  return div;
}

//ENTER ENVIA MSGM
const input = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); // impede quebra de linha
        sendBtn.click();    // dispara envio
    }
});







