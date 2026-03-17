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
let pagamentoEmProcesso = false;

const PAGARME_PUBLIC_KEY = "pk_oQW43ZaU7HPVnbj8";
// const stripe = Stripe("pk_live_51Spb5lRtYLPrY4c3L6pxRlmkDK6E0OSU93T5B75V4pY39rJ3FVyPEa6ZDDgqUiY1XCCEay6uQcItbZY4EcAOkoJn00TtsQ8bbz");

// // ===============================
// // SOCKET
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
    const res = await fetch("/api/cliente/me", {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) {
      console.error("Erro ao buscar cliente");
      return;
    }

    const cliente = await res.json();
    cliente_id = cliente.cliente_id;

    if (!cliente_id) {
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
    const input = document.getElementById("msgInput");

    if (sendBtn) {
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

    aplicarMascarasCamposCartao();
    bindFormularioCartao();

  } catch (err) {
    console.error("Erro DOMContentLoaded:", err);
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

    const grid = e.target.closest(".pacote-grid");
    if (!grid) return;

    const preco = Number(card.dataset.preco || 0);
    const messageId = Number(card.dataset.id || 0);
    const todasMidias = [...grid.querySelectorAll(".midia-item[data-index]")];

    if (!todasMidias.length) return;

    const pacoteTotalmenteLiberado =
      preco === 0 ||
      card.classList.contains("livre") ||
      conteudosLiberados.has(messageId) ||
      todasMidias.every(
        (m) =>
          m.classList.contains("midia-livre") ||
          m.dataset.liberado === "true"
      );

    // se NÃO estiver 100% liberado, qualquer clique no pacote abre pagamento
    if (preco > 0 && !pacoteTotalmenteLiberado) {
      e.preventDefault();
      e.stopPropagation();
      abrirPagamentoChat(preco, messageId);
      return;
    }

    // daqui para baixo: pacote 100% liberado
    e.preventDefault();
    e.stopPropagation();

    // tenta primeiro pelo elemento
    let midiaClicada = e.target.closest(".midia-item[data-index]");

    // fallback: identifica pela posição do clique
    if (!midiaClicada) {
      const x = e.clientX;
      const y = e.clientY;

      midiaClicada = todasMidias.find((m) => {
        const r = m.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
    }

    // fallback final: elemento visual mais próximo do ponto clicado
    if (!midiaClicada && document.elementsFromPoint) {
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      midiaClicada = els.find(
        (el) =>
          el instanceof Element &&
          el.matches(".midia-item[data-index]")
      );
    }

    if (!midiaClicada) return;

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
  <div class="msg-conteudo-wrap ${
        msg.sender === "modelo" ? "lado-modelo" : "lado-cliente"
  }">

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
  <div class="msg-conteudo-wrap ${
    msg.sender === "modelo" ? "lado-modelo" : "lado-cliente"
  }">
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

  const cpf = document.getElementById("cpfEscolha");
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
  pararPollingPagamento();

  const btn = document.getElementById("btnGerarPix");
  const btnCopiar = document.getElementById("btnCopiarPix");

  if (btn) {
    btn.disabled = true;
    btn.innerText = "Gerando Pix...";
  }

  try {
    if (!pagamentoAtual?.conteudo_id) {
      alert("Conteúdo inválido.");
      return;
    }

    const cpfLimpo = obterCpfValido();
    if (!cpfLimpo) return;

    const conteudo_id = Number(pagamentoAtual.conteudo_id);

    atualizarStatusPix(
      "⏳ Gerando seu código Pix...",
      "aguardando",
      "Isso pode levar alguns segundos. Não feche esta janela."
    );

    mostrarToastPagamento("Gerando Pix...", "info");

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
      atualizarStatusPix(
        "❌ Não foi possível gerar o Pix.",
        "erro",
        "Tente novamente em alguns instantes."
      );
      mostrarToastPagamento("Erro ao gerar Pix.", "erro", true);
      return;
    }

    const imgQr = document.getElementById("pixQr");
    const inputCopia = document.getElementById("pixCopia");

    if (data.qr_code_base64 && imgQr) {
      imgQr.src = "data:image/png;base64," + data.qr_code_base64;
      imgQr.classList.remove("hidden");
    }

    if (data.qr_code && inputCopia) {
      inputCopia.value = data.qr_code;
    }

    if (btnCopiar) {
      btnCopiar.disabled = !data.qr_code;
    }

    pagamentoAtual.payment_id = data.payment_id || data.order_id || null;
    pagamentoAtual.message_id = data.message_id || pagamentoAtual.conteudo_id;

    atualizarStatusPix(
      "✅ Pix gerado com sucesso.",
      "aguardando",
      "Agora faça o pagamento. Assim que identificarmos, vamos liberar automaticamente. Não feche esta janela."
    );

    mostrarToastPagamento("Pix gerado. Aguardando pagamento...", "info");

    if (pagamentoAtual.payment_id) {
      iniciarPollingPagamento(
        pagamentoAtual.payment_id,
        pagamentoAtual.message_id,
        "pix"
      );
    } else {
      console.warn("PIX criado sem payment_id retornado");
      atualizarStatusPix(
        "⚠️ Pix gerado, mas sem identificador de acompanhamento.",
        "erro",
        "Se o pagamento for feito, talvez seja necessário atualizar a conversa."
      );
    }
  } catch (err) {
    console.error("Erro Pix:", err);
    alert("Erro inesperado no Pix");
    atualizarStatusPix(
      "❌ Erro inesperado ao gerar o Pix.",
      "erro",
      "Tente novamente."
    );
    mostrarToastPagamento("Erro inesperado no Pix.", "erro", true);
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

function limparErrosCartao() {
  const ids = [
    "card_number_error",
    "card_holder_error",
    "card_exp_month_error",
    "card_exp_year_error",
    "card_cvv_error",
    "card_phone_error",
    "billing_line_1_error",
    "billing_zip_code_error",
    "billing_city_error",
    "billing_state_error"
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = "";
  });
}

function mostrarErroCartao(campo, mensagem) {
  const mapa = {
    card_number: "card_number_error",
    holder_name: "card_holder_error",
    exp_month: "card_exp_month_error",
    exp_year: "card_exp_year_error",
    cvv: "card_cvv_error"
  };

  const el = document.getElementById(mapa[campo]);
  if (el) el.innerText = mensagem;
}

function validarCamposCartao({ number, holder_name, exp_month, exp_year, cvv }) {
  let ok = true;

  limparErrosCartao();

  const numeroLimpo = String(number || "").replace(/\D/g, "");
  const nomeLimpo = String(holder_name || "").trim();
  const mesLimpo = String(exp_month || "").replace(/\D/g, "");
  const anoLimpo = String(exp_year || "").replace(/\D/g, "");
  const cvvLimpo = String(cvv || "").replace(/\D/g, "");

  if (numeroLimpo.length < 13 || numeroLimpo.length > 19) {
    mostrarErroCartao("card_number", "Número do cartão inválido.");
    ok = false;
  }

  if (!nomeLimpo || nomeLimpo.length < 3) {
    mostrarErroCartao("holder_name", "Informe o nome impresso no cartão.");
    ok = false;
  }

  const mesNum = Number(mesLimpo);
  if (!mesLimpo || mesLimpo.length < 1 || mesNum < 1 || mesNum > 12) {
    mostrarErroCartao("exp_month", "Mês inválido.");
    ok = false;
  }

  if (!anoLimpo || anoLimpo.length !== 4) {
    mostrarErroCartao("exp_year", "Ano inválido.");
    ok = false;
  }

  if (!cvvLimpo || cvvLimpo.length < 3 || cvvLimpo.length > 4) {
    mostrarErroCartao("cvv", "CVV inválido.");
    ok = false;
  }

  return ok;
}

async function pagarComCartao() {
  const cpf = obterCpfValido();
  if (!cpf) return { sucesso: false };

  pagamentoAtual.cpf = cpf;

  if (pagamentoEmProcesso) return { sucesso: false };
  pagamentoEmProcesso = true;

  try {
    if (!pagamentoAtual?.conteudo_id) {
      alert("Conteúdo inválido");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    const form = document.getElementById("formCartao");
    if (!form) {
      console.error("formCartao não encontrado");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    limparErrosCartao();

    // ===== DADOS DO CARTÃO =====
    const numero = form.querySelector("#card_number")?.value?.trim() || "";
    const nome = form.querySelector("#card_holder")?.value?.trim() || "";
    const mes = form.querySelector("#card_exp_month")?.value?.trim() || "";
    const ano = form.querySelector("#card_exp_year")?.value?.trim() || "";
    const cvv = form.querySelector("#card_cvv")?.value?.trim() || "";

    const valido = validarCamposCartao({
      number: numero,
      holder_name: nome,
      exp_month: mes,
      exp_year: ano,
      cvv
    });

    if (!valido) {
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    // ===== TELEFONE =====
    const telefoneBruto =
      form.querySelector("#card_phone")?.value?.trim() ||
      form.querySelector("#phone")?.value?.trim() ||
      "";

    const telefoneLimpo = telefoneBruto.replace(/\D/g, "");

    let phone_area_code = "";
    let phone_number = "";

    if (telefoneLimpo.length === 10) {
      phone_area_code = telefoneLimpo.slice(0, 2);
      phone_number = telefoneLimpo.slice(2);
    } else if (telefoneLimpo.length === 11) {
      phone_area_code = telefoneLimpo.slice(0, 2);
      phone_number = telefoneLimpo.slice(2);
    } else {
      alert("Informe um telefone válido com DDD.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    // ===== ENDEREÇO =====
    const enderecoLinha1 =
      form.querySelector("#billing_line_1")?.value?.trim() ||
      form.querySelector("#card_address")?.value?.trim() ||
      "";

    const enderecoLinha2 =
      form.querySelector("#billing_line_2")?.value?.trim() ||
      form.querySelector("#card_address_2")?.value?.trim() ||
      "";

    const cep =
      form.querySelector("#billing_zip_code")?.value?.trim() ||
      form.querySelector("#card_zipcode")?.value?.trim() ||
      "";

    const cidade =
      form.querySelector("#billing_city")?.value?.trim() ||
      form.querySelector("#card_city")?.value?.trim() ||
      "";

    const estado =
      form.querySelector("#billing_state")?.value?.trim() ||
      form.querySelector("#card_state")?.value?.trim() ||
      "";

    const pais =
      form.querySelector("#billing_country")?.value?.trim() ||
      "BR";

    const zipCodeLimpo = cep.replace(/\D/g, "");

    if (!enderecoLinha1) {
      alert("Informe o endereço.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    if (!zipCodeLimpo || zipCodeLimpo.length < 8) {
      alert("Informe um CEP válido.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    if (!cidade) {
      alert("Informe a cidade.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    if (!estado || estado.length < 2) {
      alert("Informe o estado.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    const conteudo_id = Number(pagamentoAtual.conteudo_id);

    atualizarStatusCartao("💳 Processando pagamento...");

    const payload = {
      conteudo_id,
      cpf: pagamentoAtual.cpf,
      phone_area_code,
      phone_number,
      billing_address: {
        line_1: enderecoLinha1,
        zip_code: zipCodeLimpo,
        city: cidade,
        state: estado.toUpperCase(),
        country: pais.toUpperCase(),
        ...(enderecoLinha2 ? { line_2: enderecoLinha2 } : {})
      },

      // PSP = dados brutos do cartão
      card_number: numero.replace(/\s/g, ""),
      card_holder_name: nome,
      card_exp_month: Number(mes),
      card_exp_year: Number(ano),
      card_cvv: cvv.replace(/\D/g, "")
    };

    console.log("Payload PSP /api/pagamento/midia/cartao:", payload);

    const res = await fetch("/api/pagamento/midia/cartao", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Erro retorno pagamento PSP:", data);
      alert(
        data?.error ||
          data?.detalhe ||
          "Erro no pagamento com cartão."
      );
      atualizarStatusCartao("❌ Falha no pagamento");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    pagamentoAtual.payment_id = data.payment_id || data.order_id || null;
    pagamentoAtual.message_id = data.message_id || conteudo_id;

    const valorMidia = Number(pagamentoAtual.valor || 0);
    const taxaTransacao = Number((valorMidia * 0.10).toFixed(2));
    const taxaPlataforma = Number((valorMidia * 0.05).toFixed(2));
    const valorTotal = Number(
      (valorMidia + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    const elValorConteudo = document.getElementById("cartaoValorConteudo");
    const elTaxaTransacao = document.getElementById("cartaoTaxaTransacao");
    const elTaxaPlataforma = document.getElementById("cartaoTaxaPlataforma");
    const elValorTotal = document.getElementById("cartaoValorTotal");

    if (elValorConteudo) elValorConteudo.innerText = valorBRL(valorMidia);
    if (elTaxaTransacao) elTaxaTransacao.innerText = valorBRL(taxaTransacao);
    if (elTaxaPlataforma) elTaxaPlataforma.innerText = valorBRL(taxaPlataforma);
    if (elValorTotal) elValorTotal.innerText = valorBRL(valorTotal);

    atualizarStatusCartao("⏳ Aguardando confirmação...");

    if (pagamentoAtual.payment_id) {
      iniciarPollingPagamento(
        pagamentoAtual.payment_id,
        pagamentoAtual.message_id,
        "cartao"
      );
    }

    pagamentoEmProcesso = false;
    return { sucesso: true, aguardando_confirmacao: true };
  } catch (err) {
    console.error("Erro no pagamento com cartão:", err);
    alert(err.message || "Erro inesperado ao processar cartão");
    atualizarStatusCartao("❌ Falha no pagamento");
    pagamentoEmProcesso = false;
    return { sucesso: false };
  }
}
    

function fecharPagamento() {
  const modal = document.getElementById("paymentModal");
  if (modal) modal.classList.add("hidden");

  const btnConfirmar = document.getElementById("confirmarPagamento");
  if (btnConfirmar) {
    btnConfirmar.disabled = false;
    btnConfirmar.innerText = "Confirmar desbloqueio";
  }

  const campos = [
    "card_number",
    "card_holder",
    "card_exp_month",
    "card_exp_year",
    "card_cvv",
    "card_phone",
    "billing_line_1",
    "billing_line_2",
    "billing_zip_code",
    "billing_city",
    "billing_state"
  ];

  campos.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  limparErrosCartao();
}


function atualizarStatusPix(texto, classe = "aguardando", detalhe = "") {
  const statusPix = document.getElementById("pixStatus");
  if (!statusPix) return;

  statusPix.innerHTML = `
    <div class="pix-status-titulo">${texto}</div>
    ${detalhe ? `<div class="pix-status-detalhe">${detalhe}</div>` : ""}
  `;

  statusPix.className = `pix-status ${classe}`;
}

function atualizarStatusCartao(texto) {
  const btnConfirmar = document.getElementById("confirmarPagamento");
  if (!btnConfirmar) return;

  btnConfirmar.innerText = texto;
}

function iniciarPollingPagamento(paymentId, messageId, tipo = "pix") {
  pararPollingPagamento();

  let tentativas = 0;

  const setStatus = (texto, classe = "aguardando", detalhe = "") => {
    if (tipo === "pix") {
      atualizarStatusPix(texto, classe, detalhe);
    } else {
      atualizarStatusCartao(texto);
    }
  };

  const verificar = async () => {
    tentativas++;

    try {
      const res = await fetch(`/api/pagamento/status/${paymentId}`, {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      });

      if (!res.ok) return;

      const data = await res.json();
      const status = (data.status || "").toLowerCase();

      if (
        status === "pending" ||
        status === "pendente" ||
        status === "waiting_payment" ||
        status === "aguardando_pagamento"
      ) {
        setStatus(
          "⏳ Aguardando pagamento...",
          "aguardando",
          "Assim que o pagamento cair, o conteúdo será liberado automaticamente. Não feche esta janela."
        );
        return;
      }

      if (status === "processing" || status === "processando") {
        setStatus(
          "💳 Pagamento identificado.",
          "processando",
          "Estamos confirmando com segurança. Isso pode levar alguns segundos."
        );
        mostrarToastPagamento("Pagamento identificado. Confirmando...", "info");
        return;
      }

      if (status === "authorized" || status === "authorizing") {
        setStatus(
          "🔐 Pagamento autorizado.",
          "processando",
          "Finalizando a liberação do seu conteúdo..."
        );
        return;
      }

      if (status === "paid" || status === "pago") {
        setStatus(
          "✅ Pagamento aprovado!",
          "pago",
          "Estamos liberando seu conteúdo agora..."
        );

        mostrarToastPagamento("Pagamento aprovado. Liberando conteúdo...", "sucesso");

        pararPollingPagamento();

        await liberarConteudo(messageId || data.message_id);

        setStatus(
          "🎉 Conteúdo desbloqueado com sucesso!",
          "pago",
          "Você já pode abrir sua mídia."
        );

        mostrarToastPagamento("Conteúdo desbloqueado com sucesso!", "sucesso", true);

        setTimeout(() => {
          if (tipo === "pix") {
            fecharPopupPix();
          } else {
            fecharPagamento();
          }
          esconderToastPagamento();
        }, 3200);

        return;
      }

      if (
        status === "failed" ||
        status === "falhou" ||
        status === "canceled" ||
        status === "cancelado"
      ) {
        setStatus(
          "❌ Pagamento não aprovado.",
          "erro",
          "Você pode tentar novamente."
        );
        mostrarToastPagamento("Pagamento não aprovado.", "erro", true);
        pararPollingPagamento();
        return;
      }

      if (status === "expired" || status === "expirado") {
        setStatus(
          "⌛ Pix expirado.",
          "erro",
          "Gere um novo código para tentar novamente."
        );
        mostrarToastPagamento("Pix expirado.", "erro", true);
        pararPollingPagamento();
      }
    } catch (err) {
      console.error("Erro polling:", err);

      if (tipo === "pix") {
        atualizarStatusPix(
          "⚠️ Estamos tentando confirmar seu pagamento...",
          "processando",
          "Se você já pagou, aguarde mais alguns segundos. Não feche esta janela."
        );
      }
    }
  };

  verificar();
  pollingPagamento = setInterval(verificar, 2500);

  pollingTimeout = setTimeout(() => {
    pararPollingPagamento();

    if (tipo === "pix") {
      atualizarStatusPix(
        "⌛ Tempo de verificação encerrado.",
        "erro",
        "Se você já pagou, atualize a conversa ou tente novamente."
      );
    } else {
      atualizarStatusCartao("Tentar novamente");
    }

    mostrarToastPagamento("Tempo de verificação encerrado.", "erro", true);
  }, 180000);
}

async function liberarConteudo(messageId) {
  if (!messageId) return;

  console.log("Conteúdo confirmado pelo backend:", messageId);

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
        ${midias.map((m, index) => `
          <div class="midia-item ${m.liberado !== false ? "midia-livre" : "midia-bloqueada"}"
               data-index="${index}"
               data-full="${m.url}"
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

    if (todasLiberadas && midias.length > 0) {
      setTimeout(() => {
        abrirConteudo(messageId, 0);
      }, 600);
    }
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
  pararPollingPagamento();

  const imgQr = document.getElementById("pixQr");
  if (imgQr) {
    imgQr.src = "";
    imgQr.classList.add("hidden");
  }

  const inputCopia = document.getElementById("pixCopia");
  if (inputCopia) inputCopia.value = "";

  const statusPix = document.getElementById("pixStatus");
  if (statusPix) {
    statusPix.innerText = "";
    statusPix.className = "pix-status aguardando";
  }

  if (pagamentoAtual) {
    pagamentoAtual.orderId = null;
    pagamentoAtual.payment_id = null;
    pagamentoAtual.message_id = null;
  }
}

function abrirModalCartao() {
  const cpf = obterCpfValido();
  if (!cpf) return;

  if (!pagamentoAtual?.conteudo_id || !pagamentoAtual?.valor) {
    alert("Conteúdo inválido");
    return;
  }

  pagamentoAtual.cpf = cpf;

  const valorMidia = Number(pagamentoAtual.valor || 0);
  const taxaTransacao = Number((valorMidia * 0.10).toFixed(2));
  const taxaPlataforma = Number((valorMidia * 0.05).toFixed(2));
  const valorTotal = Number(
    (valorMidia + taxaTransacao + taxaPlataforma).toFixed(2)
  );

  const elValorConteudo = document.getElementById("cartaoValorConteudo");
  const elTaxaTransacao = document.getElementById("cartaoTaxaTransacao");
  const elTaxaPlataforma = document.getElementById("cartaoTaxaPlataforma");
  const elValorTotal = document.getElementById("cartaoValorTotal");

  if (elValorConteudo) elValorConteudo.innerText = valorBRL(valorMidia);
  if (elTaxaTransacao) elTaxaTransacao.innerText = valorBRL(taxaTransacao);
  if (elTaxaPlataforma) elTaxaPlataforma.innerText = valorBRL(taxaPlataforma);
  if (elValorTotal) elValorTotal.innerText = valorBRL(valorTotal);

  const btnConfirmar = document.getElementById("confirmarPagamento");
  if (btnConfirmar) {
    btnConfirmar.disabled = false;
    btnConfirmar.innerText = "Confirmar desbloqueio";
  }

  atualizarStatusCartao("Confirmar desbloqueio");

  document.getElementById("escolhaPagamento").classList.add("hidden");
  document.getElementById("paymentModal").classList.remove("hidden");

  aplicarMascarasCamposCartao();
  bindFormularioCartao();
}

function bindFormularioCartao() {
  const formCartao = document.getElementById("formCartao");
  const btnConfirmar = document.getElementById("confirmarPagamento");

  if (!formCartao || formCartao.dataset.bound === "true") return;

  formCartao.dataset.bound = "true";

  formCartao.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.innerText = "Processando...";
    }

    try {
      const resultado = await pagarComCartao();

      if (!resultado || !resultado.sucesso) {
        if (btnConfirmar) {
          btnConfirmar.disabled = false;
          btnConfirmar.innerText = "Confirmar desbloqueio";
        }
        return;
      }

      if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.innerText = "Aguardando confirmação...";
      }
    } catch (err) {
      console.error("Erro pagamento:", err);
      alert("Erro ao processar pagamento");

      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.innerText = "Confirmar desbloqueio";
      }
    }
  });
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

function garantirToastPagamento() {
  let el = document.getElementById("toastPagamento");

  if (!el) {
    el = document.createElement("div");
    el.id = "toastPagamento";
    el.className = "toast-pagamento hidden";
    document.body.appendChild(el);
  }

  return el;
}

function mostrarToastPagamento(texto, tipo = "info", autoHide = false) {
  const el = garantirToastPagamento();

  el.innerText = texto;
  el.className = `toast-pagamento ${tipo}`;

  if (autoHide) {
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
      el.className = "toast-pagamento hidden";
    }, 3500);
  }
}

function esconderToastPagamento() {
  const el = document.getElementById("toastPagamento");
  if (!el) return;
  el.className = "toast-pagamento hidden";
}

function aplicarMascarasCamposCartao() {
  const numero = document.getElementById("card_number");
  const mes = document.getElementById("card_exp_month");
  const ano = document.getElementById("card_exp_year");
  const cvv = document.getElementById("card_cvv");
  const phone = document.getElementById("card_phone");
  const zip = document.getElementById("billing_zip_code");
  const state = document.getElementById("billing_state");

  if (numero) {
    numero.addEventListener("input", () => {
      let v = numero.value.replace(/\D/g, "").slice(0, 19);
      v = v.replace(/(\d{4})(?=\d)/g, "$1 ");
      numero.value = v;
    });
  }

  if (mes) {
    mes.addEventListener("input", () => {
      mes.value = mes.value.replace(/\D/g, "").slice(0, 2);
    });
  }

  if (ano) {
    ano.addEventListener("input", () => {
      ano.value = ano.value.replace(/\D/g, "").slice(0, 4);
    });
  }

  if (cvv) {
    cvv.addEventListener("input", () => {
      cvv.value = cvv.value.replace(/\D/g, "").slice(0, 4);
    });
  }

  if (phone) {
    phone.addEventListener("input", e => {
      let v = e.target.value.replace(/\D/g, "").slice(0, 11);

      if (v.length > 10) {
        v = v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
      } else if (v.length > 6) {
        v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
      } else if (v.length > 2) {
        v = v.replace(/^(\d{2})(\d{0,5}).*/, "($1) $2");
      } else if (v.length > 0) {
        v = v.replace(/^(\d*)/, "($1");
      }

      e.target.value = v;
    });
  }

  if (zip) {
    zip.addEventListener("input", e => {
      let v = e.target.value.replace(/\D/g, "").slice(0, 8);
      if (v.length > 5) v = v.replace(/^(\d{5})(\d{0,3}).*/, "$1-$2");
      e.target.value = v;
    });
  }

  if (state) {
    state.addEventListener("input", e => {
      e.target.value = e.target.value
        .replace(/[^a-zA-Z]/g, "")
        .toUpperCase()
        .slice(0, 2);
    });
  }
}

// apenas log
socket.on("disconnect", reason => {
  console.warn("🔴 Socket desconectado:", reason);

});

