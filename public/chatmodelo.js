const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "modelo") {
  window.location.href = "/index.html";
  throw new Error("Acesso negado");
}

const socket = io({
  transports: ["websocket"]
});

let modelo_id = null;
let cliente_id = null;

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
});

// 💬 NOVA MENSAGEM
socket.on("newMessage", msg => {
  renderMensagem(msg);
});

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarListaClientes();
  
  socket.emit("getHistory", { cliente_id, modelo_id });

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
async function carregarListaClientes() {
  const res = await fetch("/api/chat/modelo", {
    headers: { Authorization: "Bearer " + token }
  });

  const clientes = await res.json();
  const lista = document.getElementById("listaClientes");

  lista.innerHTML = "";

  if (!clientes.length) {
    lista.innerHTML = "<li>Nenhum cliente VIP ainda.</li>";
    return;
  }

  clientes.forEach(c => {
    const li = document.createElement("li");
    li.className = "chat-item";
    li.textContent = c.nome;

    li.onclick = () => {
      cliente_id = c.cliente_id;

      document.getElementById("chatTitulo").innerText =
        "Conversando com: " + c.nome;

      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.emit("joinChat", { sala });
      socket.emit("getHistory", { cliente_id, modelo_id });
    };

    lista.appendChild(li);
  });
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

  input.value = "";
}

function renderMensagem(msg) {
  const chat = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.className = "msg";
  div.textContent = msg.text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
