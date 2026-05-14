// ===============================
// 🔐 AUTENTICAÇÃO
// ===============================

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

const socket = io({
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});

let autenticado = false;
let salaPronta = false;

let cliente_id = null;
let modelo_id = null;

// paginação igual ao chat da modelo
let offsetMensagens = 0;
const LIMIT_MENSAGENS = 20;

let carregandoHistorico = false;
let historicoInicialCarregado = false;

const conteudosLiberados = new Set();
let pagamentoAtual = null;

const stripe = Stripe("pk_live_51Spb5lRtYLPrY4c3L6pxRlmkDK6E0OSU93T5B75V4pY39rJ3FVyPEa6ZDDgqUiY1XCCEay6uQcItbZY4EcAOkoJn00TtsQ8bbz");
let elements = null;

const chatBox = document.getElementById("chatBox");

// ===============================
// SOCKET
// ===============================

socket.on("connect", () => {
  autenticado = false;
  salaPronta = false;
  socket.emit("auth", { token });
});

socket.on("authOk", async () => {

  if (autenticado) return;
  autenticado = true;

  socket.emit("loginCliente");

  await carregarCliente();
  await carregarInfoModelo(modelo_id);

  tentarEntrarSala();

});

// ===============================
// ENTRAR NA SALA
// ===============================

function tentarEntrarSala() {

  if (!autenticado) return;
  if (!cliente_id || !modelo_id) return;
  if (salaPronta) return;

  salaPronta = true;

  socket.emit("joinChat", {
    cliente_id,
    modelo_id
  });

  socket.emit("getHistory", {
    cliente_id,
    modelo_id,
    offset: offsetMensagens,
    limit: LIMIT_MENSAGENS
  });

}

// ===============================
// DOM READY
// ===============================

document.addEventListener("DOMContentLoaded", () => {

  const params = new URLSearchParams(window.location.search);
  modelo_id = Number(params.get("modelo_id"));

  if (!modelo_id) {
    alert("Modelo inválida.");
    return;
  }

  tentarEntrarSala();

  const sendBtn = document.getElementById("sendBtn");
  const input   = document.getElementById("messageInput");

  if (sendBtn) sendBtn.onclick = enviarMensagem;

  if (input) {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        enviarMensagem();
      }
    });
  }

});

// ===============================
// SCROLL HISTÓRICO
// ===============================

if (chatBox) {

  chatBox.addEventListener("scroll", () => {

    if (
      historicoInicialCarregado &&
      chatBox.scrollTop === 0 &&
      !carregandoHistorico
    ) {
      carregarMensagensAntigas();
    }

  });

}

// ===============================
// HISTÓRICO
// ===============================

socket.on("chatHistory", mensagens => {

  if (!Array.isArray(mensagens)) return;

  const primeiraCarga = offsetMensagens === 0;

  if (primeiraCarga) {
    chatBox.innerHTML = "";
  }

  mensagens.forEach(m => {

    if (m.tipo === "conteudo" && m.liberado === true) {
      conteudosLiberados.add(Number(m.id));
    }

    renderMensagem(m);

  });

  offsetMensagens += mensagens.length;
  historicoInicialCarregado = true;

  if (primeiraCarga) {
    requestAnimationFrame(() => {
      chatBox.scrollTop = chatBox.scrollHeight;
    });
  }

});

// ===============================
// NOVA MENSAGEM
// ===============================

socket.on("newMessage", msg => {

  if (
    Number(msg.modelo_id) !== Number(modelo_id) ||
    Number(msg.cliente_id) !== Number(cliente_id)
  ) return;

  renderMensagem(msg);
  scrollParaFinal();

});

// ===============================
// LIBERAÇÃO DE CONTEÚDO
// ===============================

socket.on("conteudoVisto", async ({ message_id }) => {

  conteudosLiberados.add(Number(message_id));

  const card = document.querySelector(`[data-id="${message_id}"]`);

  if (!card) {
    socket.emit("getHistory", {
      cliente_id,
      modelo_id,
      offset: 0,
      limit: LIMIT_MENSAGENS
    });
    return;
  }

  const res = await fetch(`/api/chat/conteudo/${message_id}`, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const midias = await res.json();

  card.classList.remove("bloqueado");
  card.classList.add("livre");

  card.innerHTML = `
    <div class="pacote-grid">
      ${midias.map((m,index)=>`
        <div class="midia-item"
             onclick="abrirConteudoSeguro(${message_id},${index})">
          ${
            m.tipo_media === "video"
              ? `<video src="${m.url}" muted playsinline></video>`
              : `<img src="${m.url}">`
          }
        </div>
      `).join("")}
    </div>
  `;

});

// ===============================
// RENDER MENSAGEM
// ===============================

function renderMensagem(msg){

  if (document.querySelector(`[data-id="${msg.id}"]`)) return;

  const div = document.createElement("div");

  div.className =
    msg.sender === "modelo"
      ? "msg modelo"
      : "msg cliente";

  div.dataset.id = msg.id;

  // TEXTO
  if (msg.tipo === "texto"){

    div.innerHTML = `
      <div class="msg-texto">
        ${msg.text}
      </div>
    `;

  }

  // CONTEÚDO
  else if (msg.tipo === "conteudo"){

    const liberado = conteudosLiberados.has(Number(msg.id));

    // BLOQUEADO
    if (!liberado){

      div.innerHTML = `
        <div class="chat-conteudo bloqueado"
             data-id="${msg.id}"
             data-preco="${msg.preco}"
             data-qtd="${msg.quantidade ?? 1}">

          <div class="pacote-grid">
            ${Array(msg.quantidade ?? 1).fill("").map(()=>`
              <div class="midia-item placeholder"></div>
            `).join("")}
          </div>

          <div class="conteudo-info">
            <span>${msg.quantidade ?? 1} mídia(s)</span>
            <span>R$ ${Number(msg.preco).toFixed(2)}</span>

            ${
              Number(msg.preco) > 0
              ? `<button class="btn-desbloquear"
                  data-preco="${msg.preco}"
                  data-message-id="${msg.id}">
                    Desbloquear
                 </button>`
              : ""
            }

          </div>

        </div>
      `;

    }

  }

  chatBox.appendChild(div);

}

// ===============================
// CARREGAR HISTÓRICO ANTIGO
// ===============================

function carregarMensagensAntigas(){

  carregandoHistorico = true;

  socket.emit("getHistory",{
    cliente_id,
    modelo_id,
    offset: offsetMensagens,
    limit: LIMIT_MENSAGENS
  });

  setTimeout(()=>{
    carregandoHistorico = false;
  },400);

}

// ===============================
// ENVIAR MENSAGEM
// ===============================

function enviarMensagem(){

  const input = document.getElementById("messageInput");
  const text = input.value.trim();

  if(!text) return;

  socket.emit("sendMessage",{
    cliente_id,
    modelo_id,
    text
  });

  input.value="";

}

// ===============================
// ABRIR CONTEÚDO
// ===============================

async function abrirConteudoSeguro(message_id,index=0){

  const modal = document.getElementById("modalConteudo");
  const midiaBox = document.getElementById("modalMidia");

  modal.classList.remove("hidden");
  midiaBox.innerHTML="Carregando...";

  const res = await fetch(`/api/chat/conteudo/${message_id}`,{
    headers:{ Authorization:"Bearer "+token }
  });

  if(!res.ok){
    midiaBox.innerHTML="Acesso negado";
    return;
  }

  const midias = await res.json();
  const midia = midias[index];

  conteudosLiberados.add(Number(message_id));

  socket.emit("marcarConteudoVisto",{
    message_id,
    cliente_id,
    modelo_id
  });

  midiaBox.innerHTML =
    midia.tipo_media==="video"
      ? `<video src="${midia.url}" controls autoplay></video>`
      : `<img src="${midia.url}">`;

}

// ===============================
// PAGAMENTO
// ===============================

document.addEventListener("click",e=>{

  const btn = e.target.closest(".btn-desbloquear");
  if(btn){

    const preco = btn.dataset.preco;
    const messageId = btn.dataset.messageId;

    abrirPagamentoChat(preco,messageId);
    return;

  }

  const card = e.target.closest(".chat-conteudo.bloqueado");

  if(card){

    const preco = Number(card.dataset.preco);
    const messageId = card.dataset.id;

    // conteúdo free
    if(preco===0){
      abrirConteudoSeguro(messageId);
      return;
    }

    abrirPagamentoChat(preco,messageId);

  }

});

// ===============================
// PAGAMENTO CHAT
// ===============================

function abrirPagamentoChat(valor,conteudoId){

  pagamentoAtual = {
    conteudo_id:Number(conteudoId),
    valor:Number(valor)
  };

  document
    .getElementById("escolhaPagamento")
    .classList.remove("hidden");

}

// ===============================
// SCROLL
// ===============================

function scrollParaFinal(){

  requestAnimationFrame(()=>{
    chatBox.scrollTop = chatBox.scrollHeight;
  });

}

// ===============================
// API
// ===============================

async function carregarCliente(){

  const res = await fetch("/api/cliente/me",{
    headers:{ Authorization:"Bearer "+token }
  });

  if(!res.ok) return;

  const data = await res.json();
  cliente_id = data.cliente_id;

}

async function carregarInfoModelo(modelo_id){

  const res = await fetch(`/api/modelo/chat/${modelo_id}`,{
    headers:{ Authorization:"Bearer "+token }
  });

  if(!res.ok) return;

  const modelo = await res.json();

  const nome = document.getElementById("chatModeloNome");
  if(nome) nome.innerText = modelo.nome_exibicao;

}