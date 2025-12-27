// 🔌 esperar socket global do header.js
function obterSocket() {
  if (!window.socket) return null;
  return window.socket;
}

let cliente = null;

// buscar identidade real
async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + window.token }
  });

  const data = await res.json();
  cliente = data.nome;
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

document.addEventListener("DOMContentLoaded", () => {
  const socket = obterSocket();

  if (!socket) {
    console.error("❌ Socket ainda não inicializado");
    return;
  }

  // autentica socket
  socket.emit("auth", { token: window.token });

  socket.on("connect", async () => {
    await carregarCliente();

    socket.emit("loginCliente", cliente);
    carregarModelos();
    pedirUnread();

    const modeloSalvo = localStorage.getItem("chatModelo");
    if (modeloSalvo) abrirChat(modeloSalvo);
  });

  // listeners
  socket.on("chatHistory", onChatHistory);
  socket.on("newMessage", onNewMessage);
  socket.on("unreadUpdate", onUnreadUpdate);
});


// ===========================
// SOCKET
// ===========================

socket.on("chatHistory", onChatHistory);
socket.on("newMessage", onNewMessage);
socket.on("unreadUpdate", onUnreadUpdate);

socket.on("errorMessage", msg => {
    alert(msg);
});

socket.on("connect", async () => {
  await carregarCliente();

  socket.emit("loginCliente", cliente);
  carregarModelos();
  pedirUnread();

  const modeloSalvo = localStorage.getItem("chatModelo");
  if (modeloSalvo) abrirChat(modeloSalvo);
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
  const res = await fetch("/api/cliente/modelos", {
    headers: {
      Authorization: "Bearer " + window.token
    }
  });

  if (!res.ok) {
    console.error("Erro ao carregar modelos:", res.status);
    return;
  }

  const modelosAPI = await res.json();

  const modeloDoPerfil = localStorage.getItem("modeloAtual");

  state.modelos = Array.isArray(modelosAPI) ? [...modelosAPI] : [];

  if (modeloDoPerfil && !state.modelos.includes(modeloDoPerfil)) {
    state.modelos.unshift(modeloDoPerfil);
  }

  renderLista();

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

  // =========================
  // 📦 CONTEÚDO (imagem/vídeo)
  // =========================
  if (msg.type === "conteudo") {

    const conteudo = {
      id: msg.id,
      modelo: state.modeloAtual,
      tipo: msg.tipo || "imagem",
      arquivo: msg.arquivo,
      preco: msg.preco,
      pago: msg.pago === true
    };

    if (!conteudo.modelo || !conteudo.arquivo) {
      console.error("❌ Conteúdo inválido:", conteudo);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.classList.add("msg");

    if (msg.from === cliente) {
      wrapper.classList.add("msg-cliente");
    } else {
      wrapper.classList.add("msg-modelo");
    }

    const card = renderConteudo(conteudo, "cliente");
    wrapper.appendChild(card);

    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
    return;
  }

  // =========================
  // 💬 MENSAGEM DE TEXTO
  // =========================
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



// ================================
// RENDERIZA CONTEÚDO (IMAGEM/VÍDEO)
// ================================

function renderConteudo(conteudo, tipoUsuario) {
  const div = document.createElement("div");
  div.classList.add("chat-conteudo");

  const src = `/conteudo/abrir?modelo=${encodeURIComponent(conteudo.modelo)}&conteudoId=${encodeURIComponent(conteudo.arquivo)}`;

  // 🔒 CLIENTE COM CONTEÚDO PAGO
const desbloqueado =
  tipoUsuario !== "cliente" ||
  conteudo.preco === 0 ||
  conteudo.pago === true;

if (tipoUsuario === "cliente" && conteudo.preco > 0 && !desbloqueado) {
  div.classList.add("bloqueado");
}

  // 🔑 CLICK PARA ABRIR (SÓ SE DESBLOQUEADO)
  div.addEventListener("click", () => {
  if (tipoUsuario === "cliente" && conteudo.preco > 0 && !desbloqueado) return;
  window.open(src, "_blank");
});


  // 🖼️ IMAGEM
  if (conteudo.tipo === "imagem") {
    const img = document.createElement("img");
    img.src = src;
    img.style.cursor = conteudo.preco > 0 ? "not-allowed" : "pointer";
    div.appendChild(img);
  }

  // 🎥 VÍDEO
  if (conteudo.tipo === "video") {
    const video = document.createElement("video");
    video.src = src;
    video.controls = conteudo.preco === 0;
    video.style.cursor = conteudo.preco > 0 ? "not-allowed" : "pointer";
    div.appendChild(video);
  }

  // 🔒 OVERLAY DE BLOQUEIO
if (tipoUsuario === "cliente" && conteudo.preco > 0 && !desbloqueado) {
    const overlay = document.createElement("div");
    overlay.className = "overlay-bloqueado";
    overlay.innerHTML = `
    🔒 Conteúdo bloqueado<br>
  <button 
    class="btn-desbloquear"
    data-id="${conteudo.arquivo}"
    data-preco="${conteudo.preco}">
    Desbloquear €${conteudo.preco}
  </button>
`;
    div.appendChild(overlay);
  }

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

//PAYMENT
async function pagarConteudo(conteudoId, preco) {
  try {
    const cliente = localStorage.getItem("clientName");
    const modelo = state.modeloAtual;

    console.log("Pagar:", { conteudoId, preco }); // debug seguro

    const res = await fetch("/api/pagamentos/criar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente,
        modelo,
        conteudoId,
        preco
      })
    });

    const data = await res.json();

    if (!data.pix) {
      alert("Erro ao gerar Pix");
      return;
    }

    abrirPopupPix(data.pix);

  } catch (err) {
    console.error("Erro pagarConteudo:", err);
  }
}


function abrirPopupPix(pix) {
  document.getElementById("pixQr").src =
    `data:image/png;base64,${pix.qr_code_base64}`;

  document.getElementById("pixCopia").value = pix.qr_code;

  document.getElementById("popupPix").classList.remove("hidden");
}

function fecharPopupPix() {
  document.getElementById("popupPix").classList.add("hidden");
}

// ===============================
// 🔓 CLICK NO BOTÃO DESBLOQUEAR
// (delegação segura)
// ===============================
chatBox.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-desbloquear");
  if (!btn) return;

  e.stopPropagation();

  const conteudoId = btn.dataset.id;
  const preco = Number(btn.dataset.preco); 

  if (!conteudoId || !preco) {
    console.error("❌ dados incompletos", { conteudoId, preco });
    return;
  }

  pagarConteudo(conteudoId, preco);
});


socket.on("conteudoDesbloqueado", ({ conteudoId }) => {

  const card = document.querySelector(
    `.chat-conteudo .btn-desbloquear[data-id="${conteudoId}"]`
  )?.closest(".chat-conteudo");

  if (card) {
    card.classList.remove("bloqueado");

    const overlay = card.querySelector(".overlay-bloqueado");
    if (overlay) overlay.remove();

    // 🔑 CORRIGE O CURSOR DEFINITIVAMENTE
    const media = card.querySelector("img, video");
    if (media) {
      media.style.cursor = "pointer";   // 👈 AQUI
      media.style.pointerEvents = "auto";

      if (media.tagName === "VIDEO") {
        media.controls = true;
      }
    }
  }

  fecharPopupPix();
});

















