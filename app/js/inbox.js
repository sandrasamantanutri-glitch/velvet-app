// ===============================
// AUTH
// ===============================
const token = localStorage.getItem("token");
if (!token) {
  location.href = "/app/index.html";
}

// ===============================
// SOCKET (SÓ INBOX)
// ===============================
const socket = io("https://velvet-test-production.up.railway.app", {
  auth: { token: "Bearer " + token }
});

const inboxEl = document.getElementById("inbox");
let modeloId = null;

// ===============================
// INIT
// ===============================
async function init() {
  const res = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return logout();

  const me = await res.json();
  if (me.role !== "modelo") return logout();

  modeloId = me.id;

  // entra SOMENTE na inbox
  socket.emit("joinInbox", { modelo_id: modeloId });

  await carregarListaClientes();
}

init();

// ===============================
// FETCH INBOX
// ===============================
async function carregarListaClientes() {
  const res = await fetch("/api/chat/modelo", {
    headers: { Authorization: "Bearer " + token }
  });

  const clientes = await res.json();
  const lista = inboxEl;

  lista.innerHTML = "";

  if (!clientes.length) {
    lista.innerHTML = "<li>Nenhum cliente VIP ainda.</li>";
    return;
  }

  clientes.forEach(c => {
    const li = document.createElement("li");
    li.className = "chat-item";
    li.dataset.clienteId = c.cliente_id;

    // ⏱ timestamp da última mensagem da MODELO
    li.dataset.lastTime = c.ultima_msg_modelo_ts
      ? new Date(c.ultima_msg_modelo_ts).getTime()
      : 0;
    li.dataset.status = c.status || "normal";

    const nomeExibido = c.username || c.nome;
li.innerHTML = `
  <div class="linha-topo">
    <span class="nome">${nomeExibido}</span>
    <span class="tempo"></span>
  </div>
  <span class="badge hidden"></span>
`;
    // 🔔 aplica badge + tempo
    atualizarBadgeComTempo(li);
    contarChatsNaoLidosModelo();

    // ===============================
    // 🖱️ CLICK NO CLIENTE
    // ===============================
    li.onclick = async () => {
      const avatarEl = document.getElementById("chatAvatar");
      avatarEl.src = "/assets/avatarDefault.png";
      cliente_id = c.cliente_id;
      localStorage.setItem("chat_cliente_ativo", cliente_id);
      chatAtivo = { cliente_id, modelo_id };
      await carregarConteudosVistos(cliente_id);
      

      document.getElementById("clienteNome").innerText =
  c.username || c.nome;


      // 🔥 buscar dados do cliente (avatar, etc.)
      const res = await fetch(`/api/cliente/${cliente_id}`, {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      });
      if (res.ok) {
  const dados = await res.json();
  avatarEl.src = dados.avatar || "/assets/avatarDefault.png";

  avatarEl.onclick = () => {
    if (!dados.avatar) return;
    abrirPreviewAvatar(dados.avatar);
  };
}

      // 🧹 limpar badge visual
      const badge = li.querySelector(".badge");
      if (badge) badge.classList.add("hidden");

      // 🔄 atualizar status local
      li.dataset.status = "normal";

      // 🔁 reordenar lista
      organizarListaClientes();

      // 📡 entrar no chat
      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.emit("joinChat", { sala });
      socket.emit("getHistory", { cliente_id, modelo_id });
      setTimeout(contarChatsNaoLidosModelo, 50);
    };

    lista.appendChild(li);
  });

  // 🔁 ordena após carregar tudo
  organizarListaClientes();
}

// ===============================
// REALTIME
// ===============================
socket.on("inboxMessage", () => {
  carregarListaClientes();
});

// ===============================
// HELPERS
// ===============================
function abrirChat(clienteId) {
  location.href = `/app/chat.html?cliente=${clienteId}`;
}

function logout() {
  localStorage.clear();
  location.href = "/app/index.html";
}
