const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

socket.on("connect", () => {
  socket.emit("auth", {
    token: localStorage.getItem("token")
  });
});

const socket = io({
  transports: ["websocket"]
});

let cliente_id = null;
let modelo_id = null;
let chatAtivo = null;
const mensagensRenderizadas = new Set();
const conteudosLiberados = new Set();
let stripe;
let elements;
let pagamentoAtual = {};

// ===============================
// FETCH INBOX
// ===============================
async function carregarListaModelos() {
  const res = await fetch("/api/chat/cliente", {
    headers: { Authorization: "Bearer " + token }
  });

  const modelos = await res.json();
  const lista = document.getElementById("listaModelos");
  lista.innerHTML = "";

  if (!modelos.length) {
    lista.innerHTML = "<li>Você não é VIP em nenhuma modelo.</li>";
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
















function prioridadeChat(c) {
  // 1️⃣ NOVO (cliente enviou e não foi visto)
  if (c.ultimo_sender === "cliente" && c.visto === false && c.aberto === false) {
    return 1;
  }

  // 2️⃣ Não lidas (cliente enviou e ainda não viu)
  if (c.ultimo_sender === "cliente" && c.visto === false) {
    return 2;
  }

  // 3️⃣ Por responder (cliente enviou, você viu)
  if (c.ultimo_sender === "cliente" && c.visto === true) {
    return 3;
  }

  // 4️⃣ Visto pelo cliente (última mensagem foi sua e ele leu)
  if (c.ultimo_sender === "modelo" && c.lida === true) {
    return 4;
  }

  // 5️⃣ Demais
  return 5;
}



// ===============================
// TEMPO
// ===============================
function formatarTempo(data) {
  if (!data) return "";
  const d = new Date(data);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);

  if (diff === 0) {
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (diff === 1) return "1 dia";
  return `${diff} dias`;
}

// ===============================
// REALTIME
// ===============================
socket.on("inboxMessage", carregarListaClientes);

// ===============================
// HELPERS
// ===============================
function abrirChat(clienteId) {
  window.location.href = `/chat.html?cliente=${clienteId}`;
}

function logout() {
  localStorage.clear();
  location.href = "/index.html";
}
