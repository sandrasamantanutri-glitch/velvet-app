const socket = window.socket;

if (!socket) {
  console.error("❌ Socket não disponível no chatmodelo");
}

// ===========================
// ESTADO
// ===========================
const state = {
    clienteAtual: null,
    unread: {},
    clientes: [],
    mensagens: [],
    ultimaResposta: {}
};

state.clienteAtual = null;

// ===========================
// IDENTIDADE
// ===========================
const modelo = localStorage.getItem("modeloPerfil");
if (!modelo) {
    alert("Modelo não identificada");
    throw new Error("modeloPerfil ausente");
}

// ===========================
// DOM
// ===========================
const chatBox = document.getElementById("chatBox");
const lista = document.getElementById("listaClientes");
const clienteNome = document.getElementById("clienteNome");

// ===========================
// SOCKET
// ===========================

socket.on("connect", async () => {
    socket.emit("loginModelo", modelo);

    await carregarClientesVip();
    await carregarUltimasRespostas(); // 🔑 AQUI
    renderListaClientes();
});


socket.on("chatHistory", onChatHistory);
socket.on("newMessage", onNewMessage);
socket.on("unreadUpdate", map => {
    if (!map) return;

    for (const cliente in map) {
        if (cliente !== state.clienteAtual) {
            state.unread[cliente] = map[cliente];
        }
    }

    renderListaClientes();
});



// ===========================
// HANDLERS
// ===========================
function onChatHistory(messages) {
    state.mensagens = messages;

    messages.forEach(m => {
        marcarNaoNovo(m.cliente);
    });

    chatBox.innerHTML = "";
    messages.forEach(renderMessage);
}

function onNewMessage(msg) {
    state.mensagens.push(msg);
    marcarNaoNovo(msg.cliente);

    if (msg.cliente === state.clienteAtual) {
        renderMessage(msg);
        chatBox.scrollTop = chatBox.scrollHeight;

        delete state.unread[msg.cliente];
        socket.emit("markAsRead", { cliente: msg.cliente, modelo });
    }
    else {
        // 🔔 cria unread local
        state.unread[msg.cliente] = true;
    }

    renderListaClientes(); // só atualiza badge
}

// ===========================
// LISTA DE CLIENTES
// ===========================
async function carregarClientesVip() {
    const res = await fetch(`/api/modelo/${modelo}/vips`);
    const vips = await res.json();

    state.clientes = vips;
    renderListaClientes();
}

async function carregarUltimasRespostas() {
    const res = await fetch(`/api/modelo/${modelo}/ultima-resposta`);
    state.ultimaResposta = await res.json();
}

function renderListaClientes() {
    lista.innerHTML = "";

    const clientesOrdenados = [...state.clientes].sort((a, b) => {
        const clienteA = a.cliente;
        const clienteB = b.cliente;

        const aNovo = !jaTeveMensagens(clienteA);
        const bNovo = !jaTeveMensagens(clienteB);

        const aUnread = state.unread[clienteA] ? 1 : 0;
        const bUnread = state.unread[clienteB] ? 1 : 0;

        const aTime = state.ultimaResposta[clienteA] || 0;
        const bTime = state.ultimaResposta[clienteB] || 0;

        // 1️⃣ novos primeiro
        if (aNovo !== bNovo) return bNovo - aNovo;

        // 2️⃣ não lidas
        if (aUnread !== bUnread) return bUnread - aUnread;

        // 3️⃣ mais recente
        return bTime - aTime;
    });

    clientesOrdenados.forEach(c => {
        const li = document.createElement("li");
        let label = "";

        if (state.unread[c.cliente]) {
            label = " (Não lida)";
        } else if (!jaTeveMensagens(c.cliente)) {
            label = " (Novo)";
        }

        const ultima = state.ultimaResposta[c.cliente];
        let tempo = "";
        if (ultima) {
            tempo = ` · ${tempoDesde(ultima)}`;
        }

        li.textContent = c.cliente + tempo + label;
        li.onclick = () => abrirChat(c.cliente);

        lista.appendChild(li);
    });
}



function jaTeveMensagens(cliente) {
    if (jaFoiNovo(cliente)) return true;
    return state.mensagens.some(m => m.cliente === cliente);
}


function temUnread(cliente) {
    if (!state.unread) return false;
    return state.unread[cliente] === true;
}



// ===========================
// CHAT
// ===========================
function abrirChat(cliente) {
    state.clienteAtual = cliente;

    delete state.unread[cliente];
    socket.emit("markAsRead", { cliente, modelo });
    
    clienteNome.textContent = cliente; // 👈 ESSENCIAL
    chatBox.innerHTML = "";

    socket.emit("joinRoom", { cliente, modelo });
    
    renderListaClientes();
}



function limparUnread(cliente) {
    socket.emit("markAsRead", { cliente, modelo });
    delete state.unread[cliente];
    renderListaClientes();
}


function marcarNaoNovo(cliente) {
    const key = `naoNovo_${modelo}`;
    const lista = JSON.parse(localStorage.getItem(key) || "[]");

    if (!lista.includes(cliente)) {
        lista.push(cliente);
        localStorage.setItem(key, JSON.stringify(lista));
    }
}

function jaFoiNovo(cliente) {
    const key = `naoNovo_${modelo}`;
    const lista = JSON.parse(localStorage.getItem(key) || "[]");
    return lista.includes(cliente);
}


// ===========================
// ENVIO
// ===========================
document.getElementById("sendBtn").onclick = () => {
    if (!state.clienteAtual) {
        alert("Selecione um cliente");
        return;
    }

    const input = document.getElementById("msgInput");
    const text = input.value.trim();
    if (!text) return;

    socket.emit("sendMessage", {
        cliente: state.clienteAtual,
        modelo,
        from: modelo,
        text,
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
        arquivo: `/conteudo/abrir?modelo=${encodeURIComponent(modelo)}&conteudoId=${msg.conteudoId}`,
        bloqueado: msg.preco > 0,
        preco: msg.preco
    };

    const card = renderConteudo(conteudo, "modelo");
    chatBox.appendChild(card);
    chatBox.scrollTop = chatBox.scrollHeight;

const div = document.createElement("div");
div.classList.add("chat-conteudo");

div.addEventListener("click", () => {
  if (tipoUsuario === "cliente" && conteudo.bloqueado) return;
  window.open(conteudo.arquivo, "_blank");
});

    return;
}

    // 💬 MENSAGEM NORMAL
    const div = document.createElement("div");
    div.textContent = `${msg.from}: ${msg.text}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}


// ===========================
// UTIL
// ===========================
function pedirUnread() {
    socket.emit("getUnread", modelo);
}

function tempoDesde(timestamp) {
    const diff = Date.now() - timestamp;

    const minutos = Math.floor(diff / 60000);
    if (minutos < 1) return "agora";
    if (minutos < 60) return `${minutos}m`;

    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas}h`;

    const dias = Math.floor(horas / 24);
    return `${dias}d`;
}
//CONTEUDOS CHAT

// ===========================
// CONTEÚDOS — CHAT MODELO
// ===========================

let conteudoSelecionado = null;

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btnEnviarConteudo");
    const popup = document.getElementById("popupConteudos");

    if (!btn || !popup) {
        console.warn("Popup ou botão de conteúdo não encontrado");
        return;
    }

    btn.addEventListener("click", abrirPopupConteudos);
});

function abrirPopupConteudos() {
    const modelo = localStorage.getItem("modeloPerfil");

    if (!modelo) {
        alert("Modelo não identificada");
        return;
    }

    const popup = document.getElementById("popupConteudos");
    popup.classList.remove("hidden");

    carregarConteudos(modelo);
}

function carregarConteudos(modelo) {
    fetch(`/api/conteudos/listar?modelo=${encodeURIComponent(modelo)}`)
        .then(res => res.json())
        .then(conteudos => {
            const lista = document.getElementById("previewConteudos");
            lista.innerHTML = "";

            if (conteudos.length === 0) {
                lista.innerHTML = "<p>Nenhum conteúdo encontrado</p>";
                return;
            }

            conteudos.forEach(c => {
                const card = document.createElement("div");
                card.className = "preview-card";

                const url = `/conteudo/abrir?modelo=${modelo}&conteudoId=${c.id}`;

                if (c.tipo === "video") {
                    card.innerHTML = `<video src="${url}" muted></video>`;
                } else {
                    card.innerHTML = `<img src="${url}" />`;
                }

                card.onclick = () => selecionarConteudo(c.id, card);
                lista.appendChild(card);
            });
        })
        .catch(err => console.error("Erro ao listar conteúdos:", err));
}

function selecionarConteudo(id, el) {
    conteudoSelecionado = id;

    document.querySelectorAll(".preview-card")
        .forEach(i => i.classList.remove("selected"));

    el.classList.add("selected");
}


function confirmarEnvioConteudo() {
    console.log("confirmarEnvioConteudo chamada");

    if (!state.clienteAtual) {
        alert("Selecione um cliente antes de enviar o conteúdo");
        return;
    }

    if (!conteudoSelecionado) {
        alert("Selecione um conteúdo");
        return;
    }

    const preco =
        parseFloat(document.getElementById("precoConteudo")?.value) || 0;

    console.log("Emitindo sendContent");

    socket.emit("sendContent", {
        cliente: state.clienteAtual,
        modelo: localStorage.getItem("modeloPerfil"),
        conteudoId: conteudoSelecionado,
        preco
    });

    fecharPopupConteudos(); // 👈 FECHA O POPUP
}

function fecharPopupConteudos() {
    const popup = document.getElementById("popupConteudos");
    popup.classList.add("hidden");
    conteudoSelecionado = null;
}

// ================================
// RENDERIZA CONTEÚDO (IMAGEM/VÍDEO)
// ================================
function renderConteudo(conteudo, tipoUsuario) {
  const div = document.createElement("div");
  div.classList.add("chat-conteudo");

  // 🔑 CONTEÚDO PAGO NA VISÃO DA MODELO
  if (tipoUsuario === "modelo" && conteudo.preco > 0) {
     const valor = document.createElement("div");
    valor.className = "valor-conteudo";
    valor.textContent = `💰 €${conteudo.preco}`;
    div.appendChild(valor);

    div.classList.add("msg-conteudo-pago");

    if (!conteudo.bloqueado) {
      div.classList.add("desbloqueado"); // 💚
    }
  } else {
    div.classList.add("chat-conteudo");
  }

  // CLIENTE
  if (tipoUsuario === "cliente" && conteudo.bloqueado) {
    div.classList.add("bloqueado");
  }

  // IMAGEM
  if (conteudo.tipo === "imagem") {
    const img = document.createElement("img");
    img.src = conteudo.arquivo;
    div.appendChild(img);
  }

  // VÍDEO
  if (conteudo.tipo === "video") {
    const video = document.createElement("video");
    video.src = conteudo.arquivo;
    video.controls = !conteudo.bloqueado || tipoUsuario === "modelo";
    div.appendChild(video);
  }

  // OVERLAY CLIENTE
  if (tipoUsuario === "cliente" && conteudo.bloqueado) {
    const overlay = document.createElement("div");
    overlay.className = "overlay-bloqueado";
    overlay.innerHTML = `
      🔒 Conteúdo bloqueado<br>
      <button class="btn-desbloquear" data-id="${conteudo.id}">
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

function ordenarClientes(lista) {
  return lista.sort((a, b) => {

    // 1️⃣ novos primeiro
    if (a.isNovo !== b.isNovo) {
      return b.isNovo - a.isNovo;
    }

    // 2️⃣ mensagens não lidas
    if ((a.unread > 0) !== (b.unread > 0)) {
      return (b.unread > 0) - (a.unread > 0);
    }

    // 3️⃣ última mensagem mais recente
    return b.timestamp - a.timestamp;
  });
}











