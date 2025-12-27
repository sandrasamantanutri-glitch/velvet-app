// ===============================
// CHAT CLIENTE — FINAL CORRIGIDO
// ===============================
const socket = io({
  transports: ["websocket", "polling"]
});

let cliente = null;

const state = {
  modelos: [],          // [{ id, nome }]
  modeloAtual: null     // { id, nome }
};

const lista = document.getElementById("listaModelos");
const chatBox = document.getElementById("chatBox");
const modeloNome = document.getElementById("modeloNome");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

// 🔔 listeners DO SOCKET (fora do connect)
socket.on("chatHistory", renderHistorico);
socket.on("newMessage", renderMensagem);

// 🔌 conecta
socket.on("connect", async () => {
  console.log("🟢 Socket conectado:", socket.id);

  socket.emit("auth", {
    token: localStorage.getItem("token")
  });

  await carregarCliente();
  await carregarModelos();

  socket.emit("loginCliente", cliente.id);

  // ✅ AGORA SIM: reabrir chat após F5
  const chatSalvo = localStorage.getItem("chatAtivo");
  if (chatSalvo) {
    const { clienteId, modeloId, modeloNome } = JSON.parse(chatSalvo);

    state.modeloAtual = { id: modeloId, nome: modeloNome };
    document.getElementById("modeloNome").textContent = modeloNome;

    socket.emit("joinRoom", { clienteId, modeloId });
  }
});

// CLIENTE
async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });

  const data = await res.json();

  cliente = {
    id: Number(data.id),
    nome: data.nome
  };
}

// MODELOS
async function carregarModelos() {
  const res = await fetch("/api/cliente/modelos", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  });

  state.modelos = (await res.json()).map(m => ({
    id: Number(m.id),
    nome: m.nome
  }));

  renderListaModelos();
}

function renderListaModelos() {
  lista.innerHTML = "";

  state.modelos.forEach(modelo => {
    const li = document.createElement("li");
    li.textContent = modelo.nome;
    li.onclick = () => abrirChat(modelo);
    lista.appendChild(li);
  });
}

// ABRIR CHAT
function abrirChat(modelo) {
  state.modeloAtual = modelo;

  modeloNome.textContent = modelo.nome;
  chatBox.innerHTML = "";

  // ✅ SALVA O CHAT ATIVO (AQUI)
  localStorage.setItem("chatAtivo", JSON.stringify({
    clienteId: cliente.id,
    modeloId: modelo.id,
    modeloNome: modelo.nome
  }));

  socket.emit("joinRoom", {
    clienteId: cliente.id,
    modeloId: modelo.id
  });
}

// ENVIAR
sendBtn.onclick = () => {
  if (!state.modeloAtual) return;

  const text = input.value.trim();
  if (!text) return;

  // 🔥 renderiza local imediatamente
  renderMensagem({
    modeloId: state.modeloAtual.id,
    from: cliente.id,
    text
  });

  socket.emit("sendMessage", {
    clienteId: cliente.id,
    modeloId: state.modeloAtual.id,
    text
  });

  input.value = "";
};

// ENTER envia
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.onclick();
  }
});

// RENDER
function renderHistorico(msgs) {
  chatBox.innerHTML = "";
  msgs.forEach(renderMensagem);
}

function renderMensagem(msg) {
  if (!state.modeloAtual) return;
  if (Number(msg.modeloId) !== state.modeloAtual.id) return;

  const div = document.createElement("div");
  div.className =
    Number(msg.from) === cliente.id ? "msg-cliente" : "msg-modelo";

  div.textContent = msg.text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
