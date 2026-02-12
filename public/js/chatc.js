const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

const socket = io({
  transports: ["websocket"]
});

  socket.emit("auth", { token });

let cliente_id = null;
let modelo_id = null;
let chatAtivo = null;
const mensagensRenderizadas = new Set();
const conteudosLiberados = new Set();
let elements;
let pagamentoAtual = {};
// 🔐 SOCKET AUTH

socket.on("connect", () => {
  socket.emit("auth", {
    token: localStorage.getItem("token")
  });
});

const params = new URLSearchParams(location.search);
modelo_id = Number(params.get("modelo_id"));

const chatBox = document.getElementById("chatBox");

chatBox.addEventListener("scroll", () => {
  if (chatBox.scrollTop === 0 && !carregandoHistorico) {
    carregarMensagensAntigas();
  }
});

const input = document.getElementById("msgInput");


// 📜 HISTÓRICO
socket.on("chatHistory", mensagens => {
  const chat = document.getElementById("chatBox");
  if (!chat || !mensagens.length) return;

  // 🧹 limpa antes
  chat.innerHTML = "";

  mensagens.forEach(m => {
     if (m.tipo === "conteudo") {
      if (m.visto === true || Number(m.preco) === 0) {
        conteudosLiberados.add(Number(m.id));
      }
    }
    renderMensagem(m);
  });

  atualizarStatusPorResponder(mensagens);
});

// // 🔥 força scroll pro final
  // requestAnimationFrame(() => {
  //   chat.scrollTop = chat.scrollHeight;
  // });

  // ultimoTimestamp = mensagens[0].created_at;

  socket.on("chatMetaUpdate", data => {
  atualizarListaComMeta(data);
});

// 💬 NOVA MENSAGEM
socket.on("newMessage", msg => {

  // 🔒 se a mensagem NÃO é deste chat, ignora
  if (Number(msg.modelo_id) !== Number(modelo_id)) return;

  // ✅ renderiza sempre no chat aberto
  renderMensagem(msg);

  // ❗ SÓ marca "Não visto" se EU NÃO fui quem enviou
  if (msg.sender !== "cliente") {
    atualizarItemListaComNovaMensagem(msg);
    contarChatsNaoLidosCliente();
  }
});

socket.on("conteudoVisto", async ({ message_id }) => {

  console.log("🔓 Conteúdo liberado:", message_id);
  conteudosLiberados.add(Number(message_id));

  fecharPopupPix();

  /* ==========================
     🔄 ATUALIZA CARD NO CHAT
  ========================== */
  const card = document.querySelector(
    `.chat-conteudo[data-id="${message_id}"]`
  );

  if (!card) return;

  const res = await fetch(`/api/chat/conteudo/${message_id}`, {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) return;

  const midias = await res.json();

  card.classList.remove("bloqueado");
  card.classList.add("livre");

card.innerHTML = `
  <div class="pacote-grid">
    ${midias.map((m, index) => `
  <div class="midia-item"
       onclick="abrirConteudoSeguro(${message_id}, ${index})">
    ${
      m.tipo_media === "video"
        ? `<video src="${m.url}" muted playsinline></video>`
        : `<img src="${m.url}" />`
    }
  </div>
`).join("")}

  </div>
 `;
 const toast = document.getElementById("toastPagamento");

if (toast) {
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

 card.classList.remove("bloqueado");
card.classList.add("livre");
card.removeAttribute("data-preco");

});

socket.on("unreadUpdate", ({ modelo_id, unread }) => {
  if (!unread) return;

  const li = [...document.querySelectorAll("#listaModelos li")]
    .find(el => Number(el.dataset.modeloId) === Number(modelo_id));

  if (!li) return;

  li.classList.add("nao-visto");

  const badge = li.querySelector(".badge");
  badge.innerText = "Não visto";
  badge.classList.remove("hidden");

  // 🔔 ATUALIZA HEADER
  contarChatsNaoLidosCliente();
});


// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 valida cliente
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const me = await res.json();
  cliente_id = me.id;

  await carregarInfoModelo(modelo_id);

  const sendBtn = document.getElementById("sendBtn");
  const input   = document.getElementById("messageInput");
  sendBtn.onclick = enviarMensagem;

   input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // 🚫 impede quebra de linha
    enviarMensagem();
  }
  });
  // const avatarEl = document.getElementById("chatAvatar");

  //   avatarEl.onerror = () => {
  // avatarEl.src =
  //   "/assets/avatar.png";
  // };

  document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-desbloquear");
  if (!btn) return;

 const preco = btn.dataset.preco;
 const messageId = btn.dataset.messageId;
console.log("DEBUG pagamento:", preco, messageId);
abrirPagamentoChat(preco, messageId);

 });

 socket.emit("loginCliente", cliente_id);
  socket.emit("loginModelo", modelo_id);

  sala = `chat_${cliente_id}_${modelo_id}`;
  socket.emit("joinChat", { sala });
  socket.emit("getHistory", { cliente_id, modelo_id });


});

// ===============================
// FUNÇÕES
// ===============================

async function abrirPagamentoChat(valor, conteudoId) {
  pagamentoAtual = {
    valor,
    message_id: conteudoId
  };

  if (!valor || !conteudoId) {
    alert("Erro: dados inválidos");
    return;
  }

  document
    .getElementById("escolhaPagamento")
    .classList.remove("hidden");
}

function scrollParaFinal() {
  const chat = document.getElementById("chatBox");
  if (!chat) return;

  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}

function avisoMidiaEmBreve() {
   document
    .getElementById("popupMidiaEmBreve")
    .classList.remove("hidden");
  alert("🚧 Em breve será possível enviar mídias! =)");
}

function fecharEscolha() {
  document
    .getElementById("escolhaPagamento")
    .classList.add("hidden");
}

async function carregarCliente() {
  const res = await fetch("/api/cliente/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();
  cliente_id = data.id;

 document.getElementById("clienteNomeTitulo").innerText =
  data.username || data.nome;

  socket.emit("loginCliente", cliente_id);
}

function atualizarItemListaComNovaMensagem(msg) {

  // 🚫 cliente NÃO marca Não visto para mensagens dele mesmo
  if (msg.sender === "cliente") return;

  const li = [...document.querySelectorAll("#listaModelos li")]
    .find(el => Number(el.dataset.modeloId) === msg.modelo_id);

  if (!li) return;

  li.dataset.status = "nao-visto";

  const badge = li.querySelector(".badge");
  badge.innerText = "Não visto";
  badge.classList.remove("hidden");

  li.dataset.lastTime = Date.now();

  organizarListaModelos?.();
}

function enviarMensagem() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  if (!modelo_id) {
  alert("Selecione uma modelo para conversar.");
  return;
}

// ❌ erro real de sessão
if (!cliente_id) {
  alert("Erro de sessão. Recarregue a página.");
  return;
}

  socket.emit("sendMessage", {
    cliente_id,
    modelo_id,
    text
  });

  const item = [...document.querySelectorAll("#listaModelos li")]
  .find(li => Number(li.dataset.modeloId) === modelo_id);

if (item) {
  item.querySelector(".badge").classList.add("hidden");
}
  input.value = "";
}

function renderMensagem(msg) {
  const msgKey = msg.id ?? `${msg.sender}-${msg.created_at}`;
  if (mensagensRenderizadas.has(msgKey)) return;
  mensagensRenderizadas.add(msgKey);

  const chat = document.getElementById("chatBox");
  if (!chat) return;

  const div = document.createElement("div");

  div.className =
    msg.sender === "modelo"
      ? "msg msg-modelo"
      : "msg msg-cliente";

  /* ✉️ TEXTO */
  if (msg.tipo === "texto") {
    div.innerText = msg.text;
  }

  /* 📦 CONTEÚDO */
  else if (msg.tipo === "conteudo") {

    const liberado =
  msg.visto === true ||
  conteudosLiberados.has(Number(msg.id)) ||
  Number(msg.preco) === 0;


    // 🔓 LIBERADO
  if (liberado) {
  div.innerHTML = `
    <div class="chat-conteudo livre premium"
         data-id="${msg.id}"
         data-qtd="${msg.quantidade ?? msg.midias.length}">
      <div class="pacote-grid">
        ${msg.midias.map((m, index) => `
          <div class="midia-item"
               onclick="abrirConteudoSeguro(${msg.id}, ${index})">
            ${
              (m.tipo_media || m.tipo) === "video"
                ? `<video src="${m.url}" muted playsinline></video>`
                : `<img src="${m.url}" />`
            }
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

    // 🔒 BLOQUEADO
    else {
      div.innerHTML = `
        <div class="chat-conteudo bloqueado premium"
     data-id="${msg.id}"
     data-preco="${msg.preco}"
     data-qtd="${msg.quantidade ?? 1}">
          <div class="pacote-grid">
            ${Array(msg.quantidade ?? 1).fill("").map(() =>
  `<div class="midia-item placeholder"
       onclick="avisarConteudoBloqueado()"></div>`
).join("")}
          </div>

         <div class="conteudo-info">
  <span class="status-bloqueado">
    ${msg.quantidade ?? 1} mídia(s)
  </span>

  <span class="preco-bloqueado">
    R$ ${Number(msg.preco).toFixed(2)}
  </span>

<button class="btn-desbloquear"
  data-preco="${msg.preco}"
  data-message-id="${msg.id}">
  Desbloquear
</button>
</div>
</div>
      `;
    }
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function avisarConteudoBloqueado() {
  alert("Você precisa desbloquear a mídia para ver o conteúdo.");
}

function marcarNaoVisto(msg) {
  document.querySelectorAll("#listaModelos li").forEach(li => {
    if (Number(li.dataset.modeloId) === msg.modelo_id) {
      li.classList.add("nao-visto");
      li.querySelector(".badge").classList.remove("hidden");
    }
  });
}

function adicionarMensagemNoChat(msg) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;

  const div = document.createElement("div");
  div.className = msg.sender === "cliente" ? "msg cliente" : "msg modelo";
  div.innerText = msg.text;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function atualizarStatusPorResponder(mensagens) {
  if (!mensagens || mensagens.length === 0) return;

  const ultima = mensagens[mensagens.length - 1];
  const minhaRole = localStorage.getItem("role"); // cliente | modelo

  const item = [...document.querySelectorAll(".chat-item")]
    .find(li =>
      minhaRole === "cliente"
        ? Number(li.dataset.modeloId) === ultima.modelo_id
        : Number(li.dataset.clienteId) === ultima.cliente_id
    );

  if (!item) return;

  const badge = item.querySelector(".badge");

  // ✅ última mensagem NÃO foi minha → por responder
  if (ultima.sender !== minhaRole) {
    badge.innerText = "Por responder";
    badge.classList.remove("hidden");
    item.classList.remove("nao-visto");
  }
  // ✅ última mensagem foi minha → limpa tudo
  else {
    badge.classList.add("hidden");
    item.classList.remove("nao-visto");
  }
}

async function abrirConteudoSeguro(message_id, index = 0) {
  const modal = document.getElementById("modalConteudo");
  const midiaBox = document.getElementById("modalMidia");
  
  conteudosLiberados.add(Number(message_id));
  socket.emit("marcarConteudoVisto", {
  message_id,
  cliente_id,
  modelo_id
 });

  if (!modal || !midiaBox) {
    console.error("❌ Modal de conteúdo não encontrado no DOM");
    return;
  }

  modal.classList.remove("hidden");
  midiaBox.innerHTML = "<p>Carregando...</p>";

  try {
    const res = await fetch(`/api/chat/conteudo/${message_id}`, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      midiaBox.innerHTML = "<p>Erro ao carregar conteúdo.</p>";
      return;
    }

    const midias = await res.json();
    const midia = midias[index];

    if (!midia) {
  midiaBox.innerHTML = "<p>Erro ao abrir mídia.</p>";
  return;
}

     midiaBox.innerHTML =
      (midia.tipo_media || midia.tipo) === "video"
        ? `<video src="${midia.url}" controls autoplay></video>`
        : `<img src="${midia.url}" />`;

  } catch (err) {
    console.error("Erro abrir conteúdo:", err);
    midiaBox.innerHTML = "<p>Erro inesperado.</p>";
  }
}

function fecharConteudo() {
  const modal = document.getElementById("modalConteudo");
  const midia = document.getElementById("modalMidia");

  modal.classList.add("hidden");
  midia.innerHTML = "";
}

document.addEventListener("click", e => {
  if (
    e.target.classList.contains("modal-backdrop") ||
    e.target.classList.contains("modal-fechar")
  ) {
    fecharConteudo();
  }
});

document.getElementById("confirmarPagamento").onclick = async () => {
  const { error, paymentIntent } = await stripe.confirmPayment({
    elements,
    redirect: "if_required"
  });

  if (error) {
    alert(error.message);
    return;
  }

  // 🔓 pagamento confirmado → abrir conteúdo
  document.getElementById("paymentModal").classList.add("hidden");
  document.getElementById("payment-element").innerHTML = "";

  if (pagamentoAtual.message_id) {
    abrirConteudoSeguro(pagamentoAtual.message_id);
    pagamentoAtual = {};
  }
};

// ===============================
// ⚡ PIX — CONTEÚDO (BOTÃO)
// ===============================
function pagarComPix() {
  // 1️⃣ fecha popup de escolha
  document
    .getElementById("escolhaPagamento")
    .classList.add("hidden");

  // 2️⃣ valida dados salvos
  if (
    !pagamentoAtual ||
    !pagamentoAtual.message_id ||
    !pagamentoAtual.valor
  ) {
    alert("Conteúdo inválido");
    return;
  }

  // 3️⃣ chama Pix com dados CORRETOS
  abrirPixConteudo(
    pagamentoAtual.message_id,
    Number(pagamentoAtual.valor)
  );
}


let intervaloConfirmacaoPix = null;

async function abrirPixConteudo(message_id, preco) {
  if (!message_id || Number(preco) <= 0) {
    alert("Conteúdo inválido");
    return;
  }

  // 🔐 guarda estado do pagamento
  pagamentoAtual = {
    message_id: Number(message_id),
    preco: Number(preco)
  };

  // 💰 cálculos
  const taxaTransacao  = Number((preco * 0.10).toFixed(2));
  const taxaPlataforma = Number((preco * 0.05).toFixed(2));
  const valorTotal     = Number(
    (preco + taxaTransacao + taxaPlataforma).toFixed(2)
  );

  // 🧾 UI
  document.getElementById("pixValorBase").innerText = valorBRL(preco);
  document.getElementById("pixTaxaTransacao").innerText = valorBRL(taxaTransacao);
  document.getElementById("pixTaxaPlataforma").innerText = valorBRL(taxaPlataforma);
  document.getElementById("pixValorTotal").innerText = valorBRL(valorTotal);

  document.getElementById("popupPix").classList.remove("hidden");

  try {
    // 🔗 cria pagamento Pix
    const res = await fetch("/api/pagamento/conteudo/pix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({ message_id })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao gerar PIX");
      return;
    }

    // 🧾 QR Code
    document.getElementById("pixQr").src =
      "data:image/png;base64," + data.qr_code;

    document.getElementById("pixCopia").value =
      data.copia_cola;

    // 🔁 POLLING — confirma pagamento pelo BANCO (verdade final)
    if (intervaloConfirmacaoPix) {
      clearInterval(intervaloConfirmacaoPix);
    }

    intervaloConfirmacaoPix = setInterval(async () => {
      try {
        const statusRes = await fetch(
          `/api/chat/conteudo-status/${pagamentoAtual.message_id}`,
          {
            headers: {
              Authorization: "Bearer " + localStorage.getItem("token")
            }
          }
        );

        if (!statusRes.ok) return;

        const status = await statusRes.json();

        if (status.liberado === true) {
          clearInterval(intervaloConfirmacaoPix);
          intervaloConfirmacaoPix = null;

          // 🔓 fecha popup
          fecharPopupPix();

          // 🔄 força atualização do chat
          socket.emit("conteudoVisto", {
            message_id: pagamentoAtual.message_id
          });

          pagamentoAtual = {};
        }
      } catch (err) {
        console.error("Erro polling Pix:", err);
      }
    }, 3000);

  } catch (err) {
    console.error("Erro Pix:", err);
    alert("Erro inesperado no Pix");
  }
}


async function pagarComCartao() {
  document.getElementById("escolhaPagamento").classList.add("hidden");

  if (!pagamentoAtual?.message_id) {
    alert("Conteúdo inválido");
    return;
  }

  const res = await fetch("/api/pagamento/conteudo/cartao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({
      message_id: pagamentoAtual.message_id
    })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Erro no pagamento");
    return;
  }

  // valores
  document.getElementById("cartaoValorConteudo").innerText =
    valorBRL(data.valor_base);

  document.getElementById("cartaoTaxaTransacao").innerText =
    valorBRL(data.taxa_transacao);

  document.getElementById("cartaoTaxaPlataforma").innerText =
    valorBRL(data.taxa_plataforma);

  document.getElementById("cartaoValorTotal").innerText =
    valorBRL(data.valor_total);

  // Stripe Elements
  elements = stripe.elements({
    clientSecret: data.clientSecret
  });

  const paymentElement = elements.create("payment");
  paymentElement.mount("#payment-element");

  document.getElementById("paymentModal").classList.remove("hidden");
}

function fecharPagamento() {
  const modal = document.getElementById("paymentModal");
  if (modal) modal.classList.add("hidden");

  // limpa Stripe Elements
  const el = document.getElementById("payment-element");
  if (el) el.innerHTML = "";

  elements = null;
}


function copiarPix() {
  const input = document.getElementById("pixCopia");

  if (!input || !input.value) {
    alert("Código Pix indisponível");
    return;
  }

  // método moderno
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(input.value)
      .then(() => {
        alert("Código Pix copiado!");
      })
      .catch(() => {
        fallbackCopiarPix(input);
      });
  } else {
    fallbackCopiarPix(input);
  }
}

function fallbackCopiarPix(input) {
  input.removeAttribute("readonly");
  input.select();
  input.setSelectionRange(0, 99999); // mobile
  document.execCommand("copy");
  input.setAttribute("readonly", true);

  alert("Código Pix copiado!");
}

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

function atualizarBadgeComTempo(li) {
  const badge = li.querySelector(".badge");
  const tempo = li.querySelector(".tempo");

  const status = li.dataset.status;
  const lastTime = Number(li.dataset.lastTime || 0);

  // 🔔 BADGE
  if (badge) {
    if (status === "novo") {
      badge.innerText = "Novo";
      badge.classList.remove("hidden");
    }
    else if (status === "nao-visto") {
      badge.innerText = "Não visto";
      badge.classList.remove("hidden");
    }
    else if (status === "por-responder") {
      badge.innerText = "Por responder";
      badge.classList.remove("hidden");
    }
    else {
      badge.classList.add("hidden");
    }
  }

  // ⏱ TEMPO
  if (tempo) {
    tempo.innerText = lastTime > 0 ? formatarTempo(lastTime) : "";
  }
}

// function abrirPreviewMidia(midia) {
//   let modal = document.getElementById("previewMidiaModal");

//   if (!modal) {
//     modal = document.createElement("div");
//     modal.id = "previewMidiaModal";
//     modal.className = "preview-modal";

//     modal.innerHTML = `
//       <div class="preview-backdrop"></div>
//       <div class="preview-box">
//         <span class="preview-close">×</span>
//         <div class="preview-content"></div>
//       </div>
//     `;

//     document.body.appendChild(modal);

//     const fechar = () => modal.remove();
//     modal.querySelector(".preview-backdrop").onclick = fechar;
//     modal.querySelector(".preview-close").onclick = fechar;
//   }

//   const content = modal.querySelector(".preview-content");
//   content.innerHTML = "";

//   if ((midia.tipo_media || midia.tipo) === "video") {
//     content.innerHTML = `<video src="${midia.url}" controls autoplay></video>`;
//   } else {
//     content.innerHTML = `<img src="${midia.url}" />`;
//   }
// }

function abrirPreviewAvatar(url) {
  let modal = document.getElementById("avatarPreviewModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "avatarPreviewModal";
    modal.className = "preview-modal open";

    modal.innerHTML = `
      <div class="preview-backdrop"></div>
      <div class="preview-box">
        <span class="preview-close">×</span>
        <img id="avatarPreviewImg" />
      </div>
    `;

    document.body.appendChild(modal);

    const fechar = () => modal.remove();
    modal.querySelector(".preview-backdrop").onclick = fechar;
    modal.querySelector(".preview-close").onclick = fechar;
  }

  const img = modal.querySelector("#avatarPreviewImg");
  img.src = url;

  modal.classList.add("open");
}
function formatarHora(data) {
  if (!data) return "";

  const d = new Date(data);
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function marcarComoLido(modelo_id) {
  try {
    fetch(`/api/chat/cliente/marcar-lido/${modelo_id}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });
  } catch (err) {
    console.error("Erro ao marcar como lido:", err);
  }
}

async function carregarInfoModelo(modelo_id) {
  try {
    const res = await fetch(`/api/modelo/chat/${modelo_id}`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) return;

    const modelo = await res.json();
    const avatar = document.getElementById("chatModeloAvatar");
    const nome   = document.getElementById("chatModeloNome");
    const status = document.getElementById("chatModeloStatus");

    if (avatar) {
      avatar.src = modelo.avatar || "/assets/avatar.png";
    }

    if (nome) {
      nome.innerText = modelo.nome_exibicao || "Modelo";
    }

    if (status) {
      if (modelo.last_seen) {
        status.innerText = `visto por último: ${formatarTempo(modelo.last_seen)}`;
      } else {
        status.innerText = "visto por último: agora";
      }
    }

  } catch (err) {
    console.error("Erro carregar modelo:", err);
  }
}
