// ===============================
// 🔐 AUTENTICAÇÃO
// ===============================

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

const socket = io({
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});

window.socket = socket;

let autenticado = false;
let salaPronta = false;

let cliente_id = null;
let modelo_id = null;

let offsetMensagens = 0;
const LIMIT_MENSAGENS = 20;

let carregandoHistorico = false;
let enviandoConteudo = false;
let historicoInicialCarregado = false;

const mensagensRenderizadas = new Set();
const chatBox = document.getElementById("chatBox");

const conteudosLiberados = new Set();
let pagamentoAtual = null;
let elements = null;
let pagamentoEmProcesso = false;


const stripe = Stripe("pk_live_51Spb5lRtYLPrY4c3L6pxRlmkDK6E0OSU93T5B75V4pY39rJ3FVyPEa6ZDDgqUiY1XCCEay6uQcItbZY4EcAOkoJn00TtsQ8bbz");

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

if(modelo_id){
  await carregarInfoModelo(modelo_id);
}

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

document.addEventListener("DOMContentLoaded", async () => {

  try {

    const res = await fetch("/api/cliente/me",{
      headers:{ Authorization:"Bearer "+token }
    });

    if(!res.ok) {
      console.error("Erro ao buscar cliente");
      return;
    }

    const cliente = await res.json();
    cliente_id = cliente.cliente_id;

    if(!cliente_id){
      console.error("cliente_id indefinido");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    modelo_id = Number(params.get("modelo_id"));

    if (!modelo_id) {
      alert("Modelo inválida.");
      return;
    }

    await carregarInfoModelo(modelo_id);
    tentarEntrarSala();

    const sendBtn = document.getElementById("sendBtn");
    const input   = document.getElementById("msgInput");

    if(sendBtn){
      sendBtn.addEventListener("click", enviarMensagem);
    }

    if (input) {
      input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          enviarMensagem();
        }
      });
    }

  } catch (err){
    console.error("Erro DOMContentLoaded:",err);
  }

});

// ===============================
// SCROLL HISTÓRICO
// ===============================

if (chatBox) {

  chatBox.addEventListener("scroll", () => {

    if (
      historicoInicialCarregado &&
      chatBox.scrollTop <= 100 &&
      !carregandoHistorico
    ) {
      carregarMensagensAntigas();
    }

  });

}

// 👇 EVENTO GLOBAL DE CLIQUE (CAPTURE)
document.addEventListener(
  "click",
  (e) => {
    const card = e.target.closest(".chat-conteudo");
    if (!card) return;

    const preco = Number(card.dataset.preco || 0);
    const messageId = Number(card.dataset.id);
    const midiaClicada = e.target.closest(".midia-item");

    const todasMidias = [...card.querySelectorAll(".midia-item")];

    // pacote totalmente liberado só quando TODAS as mídias estiverem liberadas
    const pacoteTotalmenteLiberado =
      preco === 0 ||
      card.classList.contains("livre") ||
      conteudosLiberados.has(messageId) ||
      (todasMidias.length > 0 &&
        todasMidias.every(
          (m) =>
            m.classList.contains("midia-livre") ||
            m.dataset.liberado === "true"
        ));

    // ==============================
    // PACOTE NÃO ESTÁ 100% LIBERADO
    // qualquer clique abre pagamento
    // ==============================
    if (preco > 0 && !pacoteTotalmenteLiberado) {
      e.preventDefault();
      e.stopPropagation();
      abrirPagamentoChat(preco, messageId);
      return;
    }

    // ==============================
    // PACOTE 100% LIBERADO
    // pode abrir a mídia clicada
    // ==============================
    if (!midiaClicada) return;

    e.preventDefault();
    e.stopPropagation();

    const index = Number(midiaClicada.dataset.index || 0);
    abrirConteudo(messageId, index);
  },
  true
);

// ===============================
// HISTÓRICO
// ===============================

socket.on("chatHistory", mensagens => {

  if (!chatBox || !Array.isArray(mensagens)) return;

  const primeiraCarga = offsetMensagens === 0;

  if (primeiraCarga) {

    chatBox.innerHTML = "";
    mensagensRenderizadas.clear();

    mensagens.forEach(m => renderMensagem(m));

    // 🔧 esperar DOM + imagens renderizarem
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chatBox.scrollTop = chatBox.scrollHeight;
      });
    });

  } else {

    const alturaAntes = chatBox.scrollHeight;

    mensagens.reverse().forEach(m => {

      if (mensagensRenderizadas.has(m.id)) return;
      mensagensRenderizadas.add(m.id);

      const div = criarMensagemElemento(m);
      chatBox.prepend(div);

    });

    requestAnimationFrame(() => {
      const alturaDepois = chatBox.scrollHeight;
      chatBox.scrollTop += (alturaDepois - alturaAntes);
    });

  }

  offsetMensagens += mensagens.length;
  historicoInicialCarregado = true;
  carregandoHistorico = false;

});

// ===============================
// NOVA MENSAGEM
// ===============================

socket.on("newMessage", msg => {

  if (
    Number(msg.modelo_id) !== Number(modelo_id) ||
    Number(msg.cliente_id) !== Number(cliente_id)
  ) return;

  const temp = document.querySelector(`[data-id="${msg.tempId}"]`);

  if (temp) {
    temp.dataset.id = msg.id;
    mensagensRenderizadas.add(msg.id);
    return;
  }

  if (mensagensRenderizadas.has(msg.id)) return;

  renderMensagem(msg);
  scrollParaFinal();

});

// ===============================
// ENVIAR MENSAGEM
// ===============================
function enviarMensagem(e){

  if(e) e.preventDefault();

  const campo = document.getElementById("msgInput");
  if(!campo) return;

  const text = campo.value.trim();
  if(!text) return;

  if(!socket.connected){
    alert("Conexão perdida. Aguarde reconectar.");
    return;
  }

  const tempId = "temp-" + Date.now();

  renderMensagem({
    id: tempId,
    sender:"cliente",
    text,
    created_at:Date.now()
  });

  scrollParaFinal();

  socket.emit(
    "sendMessage",
    {
      cliente_id,
      modelo_id,
      text,
      tempId
    },
    resposta => {

      if(!resposta?.ok) return;

      const el = document.querySelector(`[data-id="${tempId}"]`);
      if(el) el.dataset.id = resposta.message_id;

    }
  );

  campo.value = "";

}

// ===============================
// SCROLL
// ===============================

function scrollParaFinal(){
  if(!chatBox) return;

  requestAnimationFrame(()=>{
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

// ===============================
// CARREGAR HISTÓRICO ANTIGO
// ===============================

function carregarMensagensAntigas(){

  if(carregandoHistorico) return;

  carregandoHistorico = true;

  socket.emit("getHistory",{
    cliente_id,
    modelo_id,
    offset: offsetMensagens,
    limit: LIMIT_MENSAGENS
  });
}

socket.on("conteudoVisto", async ({ message_id, cliente_id: cid }) => {
  console.log("📩 conteudoVisto recebido:", { message_id, cid, cliente_id });

  if (!message_id) return;
  if (cid != null && Number(cid) !== Number(cliente_id)) return;

  const el = document.querySelector(`.chat-conteudo[data-id="${message_id}"]`);
  if (!el) return;

  try {
    const res = await fetch(`/api/chat/conteudo/${message_id}`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) return;

    const midias = await res.json();

    const todasLiberadas = midias.every(m => m.liberado !== false);

    el.classList.remove("bloqueado");

    if (todasLiberadas) {
      el.classList.add("livre");
      conteudosLiberados.add(Number(message_id));
    }

    el.innerHTML = `
      <div class="pacote-grid">
        ${midias.map((m, index) => {
          const liberado = m.liberado !== false;

          return `
            <div class="midia-item ${liberado ? "midia-livre" : "midia-bloqueada"}"
                 data-index="${index}"
                 data-liberado="${liberado ? "true" : "false"}">
              ${
                liberado
                  ? (
                      m.tipo_media === "video"
                        ? `<video src="${m.url}" muted playsinline></video>`
                        : `<img src="${m.url}">`
                    )
                  : `
                    <div class="midia-preview" style="background-image:url('${m.thumbnail_url || m.url}')"></div>
                  `
              }
            </div>
          `;
        }).join("")}
      </div>
    `;
  } catch (err) {
    console.error("Erro liberar conteúdo:", err);
  }
});


// ===============================
// FORMATAR HORA
// ===============================
function formatarTempo(timestamp) {
  if (!timestamp || timestamp === "0") return "agora";

  // aceita número OU string ISO
  const time =
    typeof timestamp === "number"
      ? timestamp
      : new Date(timestamp).getTime();

  if (isNaN(time)) return "agora";

  const diff = Date.now() - time;

  const min = Math.floor(diff / 60000);
  const h   = Math.floor(diff / 3600000);
  const d   = Math.floor(diff / 86400000);

  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (h < 24) return `há ${h} h`;
  if (d === 1) return "ontem";
  return `há ${d} dias`;
}


// ===============================
// RENDER MENSAGEM
// ===============================

function renderMensagem(msg){

  if (!chatBox) return;

  // evitar duplicação
  if (mensagensRenderizadas.has(msg.id)) return;
  mensagensRenderizadas.add(msg.id);

  const div = document.createElement("div");

  div.className =
    msg.sender === "modelo"
      ? "msg msg-modelo"
      : "msg msg-cliente";

  div.dataset.id = msg.id;

  // ===============================
  // 📦 MENSAGEM DE CONTEÚDO
  // ===============================
if (msg.tipo === "conteudo" || msg.tipo === "conteudo_ppv_mass") {
  const quantidade =
    msg.quantidade ?? (msg.midias?.length || 0);

const cardLiberado =
  Number(msg.preco) === 0 ||
  msg.liberado === true;

  div.innerHTML = `
<div class="chat-conteudo premium ${
  cardLiberado ? "visto" : (msg.preco > 0 ? "bloqueado" : "")
}" data-id="${msg.id}" data-preco="${msg.preco || 0}">

  <div class="pacote-grid">
    ${(msg.midias || []).map((m, index) => {
      const midiaLiberada =
        Number(msg.preco) === 0 ||
        m.liberado === true ||
        cardLiberado;

      return `
 <div class="midia-item lazy-midia ${
          midiaLiberada ? "midia-livre" : "midia-bloqueada"
        }"
          data-thumb="${m.thumbnail_url || m.url}"
          data-full="${m.url}"
          data-index="${index}"
          data-conteudo-id="${m.conteudo_id || ""}"
          data-ja-possuia="${m.ja_possuia === true ? "true" : "false"}"
          data-liberado="${midiaLiberada ? "true" : "false"}"
          style="background-image:url('${m.thumbnail_url || m.url}')">
        </div>
      `;
    }).join("")}
  </div>

  ${
    msg.preco > 0
      ? `
      <div class="conteudo-info">
        <span class="status-bloqueado">
          ${
            msg.liberado
              ? `🟢 ${quantidade} mídia(s)`
              : msg.tem_parcial_liberado
                ? `✨ ${quantidade} mídia(s) · parcial`
                : `✨ ${quantidade} mídia(s)`
          }
        </span>

        <span class="preco-bloqueado">
          R$ ${Number(msg.preco).toFixed(2)}
        </span>
      </div>
    `
      : ""
  }

</div>
`;

    const bloqueadoTotal =
      Number(msg.preco) > 0 &&
      msg.liberado !== true &&
      !msg.tem_parcial_liberado;

    ativarLazyLoadingModelo(div, msg, bloqueadoTotal);
}

  // ===============================
  // 💬 MENSAGEM DE TEXTO
  // ===============================
  else {

    div.innerHTML = `
<div class="msg-texto">${msg.text}</div>

${msg.sender === "modelo" ? `
  <button
    class="msg-menu"
    data-id="${msg.id}"
    data-text="${encodeURIComponent(msg.text || "")}">
    ⋮
  </button>
` : ""}

<span class="msg-hora">
  ${formatarTempo(msg.created_at)}
</span>
`;

    const btn = div.querySelector(".msg-menu");

    if (btn) {

      btn.addEventListener("click", () => {

        abrirMenuMensagem(
          btn.dataset.id,
          decodeURIComponent(btn.dataset.text)
        );

      });

    }

  }

  chatBox.appendChild(div);

}

// // ===============================
// // ABRIR CONTEÚDO
// // ===============================

async function abrirConteudo(message_id, index = 0) {
  const modal = document.getElementById("modalMidia");
  const img = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");
  const iframe = document.getElementById("modalIframe");

  const btnPrev = document.getElementById("btnMidiaAnterior");
  const btnNext = document.getElementById("btnMidiaProxima");

  if (!modal) return;

  const res = await fetch(`/api/chat/conteudo/${message_id}`, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    alert("Erro ao carregar mídia");
    return;
  }

  const midias = await res.json();
  const midia = midias[index];

  if (!midia) return;

  if (midia.liberado === false) {
    const card = document.querySelector(`.chat-conteudo[data-id="${message_id}"]`);
    const preco = Number(card?.dataset.preco || 0);

    if (preco > 0) {
      abrirPagamentoChat(preco, message_id);
    }
    return;
  }

  modal.classList.remove("hidden");

  marcarConteudoVisto(message_id);

  img.style.display = "none";
  img.src = "";

  video.pause();
  video.removeAttribute("src");
  video.load();
  video.style.display = "none";

  iframe.src = "";
  iframe.style.display = "none";

  if (midia.url.includes("iframe.videodelivery.net")) {
    iframe.src = midia.url;
    iframe.style.display = "block";
  } else if (
    midia.url.includes(".mp4") ||
    midia.url.includes(".webm") ||
    midia.url.includes(".mov")
  ) {
    video.src = midia.url;
    video.style.display = "block";
    video.play().catch(() => {});
  } else {
    img.src = midia.url;
    img.style.display = "block";
  }
}

// ===============================
// PAGAMENTO CHAT
// ===============================

function abrirPagamentoChat(valor, conteudoId) {

  if (!valor || !conteudoId) {
    alert("Erro: dados inválidos");
    return;
  }

  pagamentoAtual = {
    conteudo_id: Number(conteudoId),
    valor: Number(valor)
  };

  document
    .getElementById("escolhaPagamento")
    .classList.remove("hidden");
}

async function carregarInfoModelo(modelo_id){

  try {

    const res = await fetch(`/api/modelo/chat/${modelo_id}`,{
      headers:{ Authorization:"Bearer "+token }
    });

    if(!res.ok){
      console.warn("Erro ao carregar modelo");
      return;
    }

    const modelo = await res.json();

    const nome = document.getElementById("chatModeloNome");
    if(nome) nome.innerText = modelo.nome_exibicao;

    const avatar = document.getElementById("chatModeloAvatar");
    const status = document.getElementById("chatModeloStatus");

    if(status) status.innerText = "online";

    if (avatar && modelo.avatar_url) {

      avatar.src = modelo.avatar_url; 

      avatar.style.cursor = "pointer";

      avatar.onclick = () => {
        abrirPreviewAvatar(modelo.avatar_url);
      };
    }

    if (status) {
      if (modelo.last_seen) {
        status.innerText = `visto por último: ${formatarTempo(modelo.last_seen)}`;
      } else {
        status.innerText = "visto por último: agora";
      }
    }

  } catch(err){
    console.error("Erro carregarInfoModelo:",err);
  }

}

function fecharEscolha() {
  document
.getElementById("escolhaPagamento")
    .classList.add("hidden");
}

function fecharModalMidia(){

  const modal  = document.getElementById("modalMidia");
  const video  = document.getElementById("modalVideo");
  const iframe = document.getElementById("modalIframe");

  if(video){
    video.pause();
    video.src = "";
  }

  if(iframe){
    iframe.src = "";
  }

  modal.classList.add("hidden");
}


function abrirMidia(midia) {
  if (!midia) return;

  const src = midia.dataset.full || midia.dataset.src || midia.dataset.thumb;
  if (!src) return;

  abrirModalMidia(src);

  const conteudo = midia.closest(".chat-conteudo");
  if (!conteudo) return;

  const message_id = Number(conteudo.dataset.id);

  if (message_id && socket) {
    socket.emit("marcarConteudoVisto", {
      message_id,
      cliente_id,
      modelo_id
    });
  }
}

function abrirModalMidia(src) {
  const modal  = document.getElementById("modalMidia");
  const img    = document.getElementById("modalImg");
  const video  = document.getElementById("modalVideo");
  const iframe = document.getElementById("modalIframe");

  if (!modal || !src) return;

  modal.classList.remove("hidden");

  // reset de tudo
  if (img) {
    img.style.display = "none";
    img.removeAttribute("src");
  }

  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.style.display = "none";
    video.load();
  }

  if (iframe) {
    iframe.removeAttribute("src");
    iframe.style.display = "none";
  }

  if (src.includes("iframe.videodelivery.net")) {
    if (iframe) {
      iframe.src = src;
      iframe.style.display = "block";
    }
    return;
  }

  if (
    src.includes(".mp4") ||
    src.includes(".webm") ||
    src.includes(".mov")
  ) {
    if (video) {
      video.src = src;
      video.style.display = "block";
      video.play().catch(() => {});
    }
    return;
  }

  if (img) {
    img.src = src;
    img.style.display = "block";
  }
}


function abrirPreviewAvatar(url) {
  if (!url || typeof url !== "string") return;

  let modal = document.getElementById("avatarPreviewModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "avatarPreviewModal";
    modal.className = "preview-modal";

    modal.innerHTML = `
      <div class="preview-backdrop"></div>
      <div class="preview-box">
        <span class="preview-close">×</span>
        <img id="avatarPreviewImg" />
      </div>
    `;

    document.body.appendChild(modal);

    const fechar = () => {
      modal.classList.remove("open");
      setTimeout(() => modal.remove(), 200);
      document.removeEventListener("keydown", escListener);
    };

    const escListener = (e) => {
      if (e.key === "Escape") fechar();
    };

    modal.querySelector(".preview-backdrop").onclick = fechar;
    modal.querySelector(".preview-close").onclick = fechar;

    document.addEventListener("keydown", escListener);
  }

  const img = modal.querySelector("#avatarPreviewImg");

  //Evita mostrar imagem quebrada
  img.onerror = () => {
    console.warn("Erro ao carregar avatar preview");
    modal.remove();
  };

  img.src = url;

  // 🔥 Abrir
  requestAnimationFrame(() => {
    modal.classList.add("open");
  });
}

function ativarLazyLoadingModelo(div){

  const midias = div.querySelectorAll(".lazy-midia");

  midias.forEach(el => {

    const thumb = el.dataset.thumb;
    if(!thumb) return;

    const img = document.createElement("img");

    img.src = thumb;
    img.loading = "lazy";
    img.decoding = "async";
    img.className = "midia-thumb";
    img.style.pointerEvents = "none";

    el.innerHTML = "";
    el.appendChild(img);

  });

}

function formatarHora(data) {
  if (!data) return "";

  const d = new Date(data);
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function abrirPreviewMidia({ url }){

  if(!url) return;

  abrirModalMidia(url);

}

function criarMensagemElemento(msg){

  const div = document.createElement("div");

  div.className =
    msg.sender === "modelo"
      ? "msg msg-modelo"
      : "msg msg-cliente";

  div.dataset.id = msg.id;

if (msg.tipo === "conteudo" || msg.tipo === "conteudo_ppv_mass") {
  const quantidade =
    msg.quantidade ?? (msg.midias?.length || 0);

const cardLiberado =
  Number(msg.preco) === 0 ||
  msg.liberado === true;

  div.innerHTML = `
<div class="chat-conteudo premium ${
  cardLiberado ? "visto" : (msg.preco > 0 ? "bloqueado" : "")
}" data-id="${msg.id}" data-preco="${msg.preco || 0}">

  <div class="pacote-grid">
    ${(msg.midias || []).map((m, index) => {
      const midiaLiberada =
        Number(msg.preco) === 0 ||
        m.liberado === true ||
        cardLiberado;

      return `
       <div class="midia-item lazy-midia ${
  midiaLiberada ? "midia-livre" : "midia-bloqueada"
}"
  data-thumb="${m.thumbnail_url || m.url}"
  data-full="${m.url}"
  data-index="${index}"
  data-conteudo-id="${m.conteudo_id || ""}"
  data-ja-possuia="${m.ja_possuia === true ? "true" : "false"}"
  data-liberado="${midiaLiberada ? "true" : "false"}">
</div>
      `;
    }).join("")}
  </div>

  ${
    msg.preco > 0
      ? `
      <div class="conteudo-info">
        <span class="status-bloqueado">
          ${
            msg.liberado
              ? `🟢 ${quantidade} mídia(s)`
              : msg.tem_parcial_liberado
                ? `✨ ${quantidade} mídia(s) · parcial`
                : `✨ ${quantidade} mídia(s)`
          }
        </span>

        <span class="preco-bloqueado">
          R$ ${Number(msg.preco).toFixed(2)}
        </span>
      </div>
      `
      : ""
  }
</div>

<div class="msg-meta">
  <span class="msg-hora">${formatarTempo(msg.created_at)}</span>
</div>
`;
}

  return div;

}

function obterCpfValido(){

  const input = document.getElementById("cpfEscolha");
  if(!input) return null;

  const cpf = input.value.replace(/\D/g,"");

  if(cpf.length !== 11){
    alert("Informe um CPF válido para continuar.");
    input.focus();
    return null;
  }

  return cpf;

}

function fecharPopupPix() {
  resetarPixUI();

  const popup = document.getElementById("popupPix");
  if (popup) popup.classList.add("hidden");
  pagamentoAtual = {};
  const cpf = document.getElementById("pixCpf");
if (cpf) cpf.value = "";
}

function valorBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function abrirPixConteudo(conteudo_id, preco) {
  resetarPixUI();

  if (!conteudo_id || Number(preco) <= 0) {
    alert("Conteúdo inválido");
    return;
  }

  pagamentoAtual = {};
  
  pagamentoAtual.conteudo_id = Number(conteudo_id);
  pagamentoAtual.valor = Number(preco);

  const taxaTransacao  = Number((preco * 0.10).toFixed(2));
  const taxaPlataforma = Number((preco * 0.05).toFixed(2));
  const valorTotal     = Number(
    (preco + taxaTransacao + taxaPlataforma).toFixed(2)
  );

  document.getElementById("pixValorBase").innerText =
    valorBRL(preco);

  document.getElementById("pixTaxaTransacao").innerText =
    valorBRL(taxaTransacao);

  document.getElementById("pixTaxaPlataforma").innerText =
    valorBRL(taxaPlataforma);

  document.getElementById("pixValorTotal").innerText =
    valorBRL(valorTotal);

  document
    .getElementById("popupPix")
    .classList.remove("hidden");
}

async function gerarPix() {
  if (pollingPagamento) {
  clearInterval(pollingPagamento);
}

if (pollingTimeout) {
  clearTimeout(pollingTimeout);
}

  const btn = document.getElementById("btnGerarPix");

  if (btn) {
    btn.disabled = true;
    btn.innerText = "Aguarde...";
  }

  try {

    if (!pagamentoAtual?.conteudo_id) {
      alert("Conteúdo inválido.");
      return;
    }

const cpfLimpo = obterCpfValido();
if (!cpfLimpo) return;

const conteudo_id = Number(pagamentoAtual.conteudo_id);

    const res = await fetch("/api/pagamento/midia/pix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({
        conteudo_id,
        cpf: cpfLimpo
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao gerar PIX");
      return;
    }

const imgQr = document.getElementById("pixQr");

if (data.qr_code_base64) {

  imgQr.src = "data:image/png;base64," + data.qr_code_base64;
  imgQr.classList.remove("hidden");

} else {console.error("Gateway não retornou QR base64");
}

    const inputCopia = document.getElementById("pixCopia");
    const btnCopiar = document.getElementById("btnCopiarPix");

    if (data.qr_code) {
      inputCopia.value = data.qr_code;
    }

    if (btnCopiar) {
      btnCopiar.disabled = false;
    }

    pagamentoAtual.orderId = data.payment_id;

    iniciarPollingPagamento(data.payment_id);

  } catch (err) {

    console.error("Erro Pix:", err);
    alert("Erro inesperado no Pix");

  } finally {

    if (btn) {
      btn.disabled = false;
      btn.innerText = "Gerar o código Pix";
    }

  }
}


function pagarComPix() {

  resetarPixUI();

  const cpf = obterCpfValido();
  if(!cpf) return;

  pagamentoAtual.cpf = cpf;  

  document
    .getElementById("escolhaPagamento")
    .classList.add("hidden");

  if (!pagamentoAtual?.conteudo_id || !pagamentoAtual?.valor) {
    alert("Conteúdo inválido");
    return;
  }

  abrirPixConteudo(
    pagamentoAtual.conteudo_id,
    pagamentoAtual.valor
  );
}


// async function pagarComCartao() {

//   const cpf = obterCpfValido();
//   if (!cpf) return;

//   pagamentoAtual.cpf = cpf;

//   if (pagamentoEmProcesso) return;
//   pagamentoEmProcesso = true;

//   document
//     .getElementById("escolhaPagamento")
//     .classList.add("hidden");

//   if (!pagamentoAtual?.conteudo_id) {
//     alert("Conteúdo inválido");
//     pagamentoEmProcesso = false;
//     return;
//   }

//   const conteudo_id = Number(pagamentoAtual.conteudo_id);

//   try {

//     const res = await fetch("/api/pagamento/midia/cartao", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: "Bearer " + localStorage.getItem("token")
//       },
//       body: JSON.stringify({
//         conteudo_id,
//         cpf: pagamentoAtual.cpf
//       })
//     });

//     const data = await res.json();

//     if (!res.ok) {
//       alert(data.error || "Erro no pagamento");
//       pagamentoEmProcesso = false;
//       return;
//     }

// const elValorConteudo = document.getElementById("cartaoValorConteudo");
// if (elValorConteudo) {
//   elValorConteudo.innerText = valorBRL(data.valorBase);
// }

// const elTaxaTransacao = document.getElementById("cartaoTaxaTransacao");
// if (elTaxaTransacao) {
//   elTaxaTransacao.innerText = valorBRL(data.taxaTransacao);
// }

// const elTaxaPlataforma = document.getElementById("cartaoTaxaPlataforma");
// if (elTaxaPlataforma) {
//   elTaxaPlataforma.innerText = valorBRL(data.taxaPlataforma);
// }

// const elValorTotal = document.getElementById("cartaoValorTotal");
// if (elValorTotal) {
//   elValorTotal.innerText = valorBRL(data.total);
// }

//     elements = stripe.elements({
//       clientSecret: data.clientSecret
//     });

//     const paymentElement = elements.create("payment");
//     paymentElement.mount("#payment-element");

//     document
//       .getElementById("paymentModal")
//       .classList.remove("hidden");

//   } catch (err) {

//     console.error("Erro cartão:", err);
//     alert("Erro inesperado");
//     pagamentoEmProcesso = false;

//   }
// }

async function pagarComCartao() {

  const cpf = obterCpfValido();
  if (!cpf) return;

  pagamentoAtual.cpf = cpf;

  if (pagamentoEmProcesso) return;
  pagamentoEmProcesso = true;

  document
    .getElementById("escolhaPagamento")
    .classList.add("hidden");

  if (!pagamentoAtual?.conteudo_id) {
    alert("Conteúdo inválido");
    pagamentoEmProcesso = false;
    return;
  }

  const conteudo_id = Number(pagamentoAtual.conteudo_id);

  try {

    /* =========================
       GERAR TOKEN DO CARTÃO
    ========================= */

    const client = await pagarme.client.connect({
      encryption_key: PAGARME_PUBLIC_KEY
    });

    const card = await client.security.encrypt({
      card_number: document
        .getElementById("card_number")
        .value.replace(/\s/g, ""),   // remove espaços
      card_holder_name: document
        .getElementById("card_holder")
        .value,
      card_expiration_date: document
        .getElementById("card_expiration")
        .value,
      card_cvv: document
        .getElementById("card_cvv")
        .value
    });

    const card_token = card.card_hash;

    /* =========================
       ENVIAR PARA BACKEND
    ========================= */

    const res = await fetch("/api/pagamento/midia/cartao", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({
        conteudo_id,
        cpf: pagamentoAtual.cpf,
        card_token
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro no pagamento");
      pagamentoEmProcesso = false;
      return { sucesso:false };
    }

    /* =========================
       ATUALIZAR UI
    ========================= */

    const elValorConteudo = document.getElementById("cartaoValorConteudo");
    if (elValorConteudo) {
      elValorConteudo.innerText = valorBRL(data.valorBase);
    }

    const elTaxaTransacao = document.getElementById("cartaoTaxaTransacao");
    if (elTaxaTransacao) {
      elTaxaTransacao.innerText = valorBRL(data.taxaTransacao);
    }

    const elTaxaPlataforma = document.getElementById("cartaoTaxaPlataforma");
    if (elTaxaPlataforma) {
      elTaxaPlataforma.innerText = valorBRL(data.taxaPlataforma);
    }

    const elValorTotal = document.getElementById("cartaoValorTotal");
    if (elValorTotal) {
      elValorTotal.innerText = valorBRL(data.total);
    }

    document
      .getElementById("paymentModal")
      .classList.remove("hidden");

    alert("Pagamento enviado. Aguardando confirmação.");

    pagamentoEmProcesso = false;

    return { sucesso:true };

  } catch (err) {

    console.error("Erro cartão:", err);

    alert("Erro inesperado");

    pagamentoEmProcesso = false;

    return { sucesso:false };

  }

}

function fecharPagamento() {

  const modal = document.getElementById("paymentModal");
  if (modal) modal.classList.add("hidden");

  if (elements) {
    try {
      elements = null;
    } catch (err) {
      console.warn("Erro limpando Stripe Elements:", err);
    }
  }

  const el = document.getElementById("payment-element");
  if (el) el.innerHTML = "";
}

let pollingPagamento = null;
let pollingTimeout = null;

function iniciarPollingPagamento(orderId) {

  if (pollingPagamento) {
    clearInterval(pollingPagamento);
  }

  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
  }

 pollingPagamento = setInterval(async () => {

  try {

    const res = await fetch(`/api/pagamento/status/${orderId}`, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      return;
    }

    const data = await res.json();

    const statusPix = document.getElementById("pixStatus");

    // ==========================
    // PROCESSANDO
    // ==========================
    if (data.status === "processing") {

      if (statusPix) {
        statusPix.innerText = "⏳ Aguarde, estamos processando o pagamento...";
        statusPix.className = "pix-status processando";
      }
    }

    // ==========================
    // PAGAMENTO CONFIRMADO
    // ==========================
    if (data.status === "pago") {

      if (statusPix) {
        statusPix.innerText = "✅ Pagamento confirmado!";
        statusPix.className = "pix-status pago";
      }

      clearInterval(pollingPagamento);
      clearTimeout(pollingTimeout);

      liberarConteudo(data.message_id);

      setTimeout(() => {
        fecharPagamento();
      }, 2000);
    }

    // ==========================
    // PAGAMENTO FALHOU
    // ==========================
    if (data.status === "falhou") {

      if (statusPix) {
        statusPix.innerText = "❌ Pagamento não aprovado. Verifique com seu banco ou tente outro método.";
        statusPix.className = "pix-status erro";
      }

      clearInterval(pollingPagamento);
      clearTimeout(pollingTimeout);

      setTimeout(() => {
        fecharPagamento();
      }, 3000);
    }

    // ==========================
    // PIX EXPIRADO
    // ==========================
    if (data.status === "expirado") {

      clearInterval(pollingPagamento);
      clearTimeout(pollingTimeout);

      setTimeout(() => {
        fecharPagamento();
      }, 3000);
    }

  } catch (err) {
    console.error("Erro polling:", err);
  }

}, 5000);

  pollingTimeout = setTimeout(() => {

    clearInterval(pollingPagamento);

    console.log("Polling encerrado após 2 minutos");

  }, 120000);

}

async function liberarConteudo(messageId) {
  console.log("Conteúdo liberado via polling", messageId);
  fecharPopupPix();

  const el = document.querySelector(`.chat-conteudo[data-id="${messageId}"]`);
  if (!el) return;

  try {
    const res = await fetch(`/api/chat/conteudo/${messageId}`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) return;

    const midias = await res.json();

    const todasLiberadas = midias.every(m => m.liberado !== false);

    if (todasLiberadas) {
      conteudosLiberados.add(Number(messageId));
      el.classList.remove("bloqueado");
      el.classList.add("livre");
    }

    el.innerHTML = `
      <div class="pacote-grid">
        ${midias.map((m,index) => `
          <div class="midia-item ${m.liberado !== false ? "midia-livre" : "midia-bloqueada"}"
               data-index="${index}"
               data-liberado="${m.liberado !== false ? "true" : "false"}">
            ${
              m.liberado !== false
                ? (
                    m.tipo_media === "video"
                      ? `<video src="${m.url}" muted playsinline></video>`
                      : `<img src="${m.url}">`
                  )
                : `
                  <div class="midia-preview" style="background-image:url('${m.thumbnail_url || m.url}')"></div>
                  <div class="midia-lock">🔒</div>
                `
            }
          </div>
        `).join("")}
      </div>
    `;

    abrirConteudo(messageId, 0);
  } catch (err) {
    console.error("Erro liberar conteúdo:", err);
  }
}

async function marcarConteudoVisto(messageId){

  await fetch("/api/conteudo/visto",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer "+localStorage.getItem("token")
    },
    body:JSON.stringify({message_id:messageId})
  });
}

function copiarPix() {

  const campo = document.getElementById("pixCopia");
  if (!campo) return;

  const codigo = campo.value.trim();
  if (!codigo) {
    alert("Nenhum código Pix disponível.");
    return;
  }

  navigator.clipboard.writeText(codigo)
    .then(() => {
      alert("Pix copiado!");
    })
    .catch(() => {

      campo.select();
      document.execCommand("copy");
      alert("Pix copiado!");

    });

}

function resetarPixUI() {
  if (pollingPagamento) clearInterval(pollingPagamento);
  if (pollingTimeout) clearTimeout(pollingTimeout);

  const imgQr = document.getElementById("pixQr");
  if (imgQr) {
    imgQr.src = "";
    imgQr.classList.add("hidden");
  }

  const inputCopia = document.getElementById("pixCopia");
  if (inputCopia) inputCopia.value = "";

  const statusPix = document.getElementById("pixStatus");
  if (statusPix) statusPix.innerText = "";

  if (pagamentoAtual) {
    pagamentoAtual.orderId = null;
    pagamentoAtual.payment_id = null;
  }
}

// const btnConfirmar = document.getElementById("confirmarPagamento");

// if (btnConfirmar) {

//   btnConfirmar.onclick = async () => {

//     btnConfirmar.disabled = true;
//     btnConfirmar.innerText = "Processando...";

//     const { error, paymentIntent } = await stripe.confirmPayment({
//       elements,
//       redirect: "if_required"
//     });

//     if (error) {
//       alert(error.message || "Erro no pagamento");
//       btnConfirmar.disabled = false;
//       btnConfirmar.innerText = "Confirmar desbloqueio";
//       return;
//     }

//     if (paymentIntent && paymentIntent.status === "succeeded") {

//   fecharPagamento();

//   if (pagamentoAtual?.conteudo_id) {

//     const messageId = pagamentoAtual.conteudo_id;

//     await liberarConteudo(messageId);

//     // abrir automaticamente a primeira mídia
//     setTimeout(() => {
//       abrirConteudo(messageId, 0);
//     }, 200);

//   }

//   pagamentoEmProcesso = false;
// }

// };

// }

const btnConfirmar = document.getElementById("confirmarPagamento");

if (btnConfirmar) {

  btnConfirmar.onclick = async () => {

    btnConfirmar.disabled = true;
    btnConfirmar.innerText = "Processando...";

    try {

      const resultado = await pagarComCartao();

      if (!resultado || !resultado.sucesso) {
        btnConfirmar.disabled = false;
        btnConfirmar.innerText = "Confirmar desbloqueio";
        return;
      }

      fecharPagamento();

      if (pagamentoAtual?.conteudo_id) {

        const messageId = pagamentoAtual.conteudo_id;

        await liberarConteudo(messageId);

        setTimeout(() => {
          abrirConteudo(messageId, 0);
        }, 200);

      }

      pagamentoEmProcesso = false;

    } catch (err) {

      console.error("Erro pagamento:", err);

      alert("Erro ao processar pagamento");

      btnConfirmar.disabled = false;
      btnConfirmar.innerText = "Confirmar desbloqueio";

    }

  };

}

// apenas log
socket.on("disconnect", reason => {
  console.warn("🔴 Socket desconectado:", reason);

});

