// ===============================
// AUTH GUARD
// ===============================

// const stripe = Stripe("pk_live_51Spb5lRtYLPrY4c3L6pxRlmkDK6E0OSU93T5B75V4pY39rJ3FVyPEa6ZDDgqUiY1XCCEay6uQcItbZY4EcAOkoJn00TtsQ8bbz");
let elements;
window.__CLIENTE_VIP__ = false;

const socket = io();

const params = new URLSearchParams(window.location.search);
const modeloParam = params.get("id");

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

//DEFINIÇÃO SEGURA DE MODO
let modo = "publico";
if (token && role === "modelo" && !modeloParam) {
  modo = "privado";
}

if (role === "cliente" && modo === "privado") {
  window.location.href = "https://www.velvet.lat";
  throw new Error("Cliente não pode acessar profile privado");
}
if (modo === "publico") {
  localStorage.removeItem("modelo_id");
}

let modelo_id = modeloParam
  ? Number(modeloParam)
  : role === "modelo"
    ? localStorage.getItem("modelo_id")
    : null;

// autentica socket
socket.emit("auth", { token });

// registra cliente online
if (role === "cliente") {
  socket.emit("loginCliente", Number(decodeJWT(token).id));
}

function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch (e) {
    return null;
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "https://www.velvet.lat";
}

// ===============================
// ELEMENTOS DO PERFIL
// ===============================

// 🔒 Guard APENAS para perfil público
if (modo === "publico" && (!modelo_id || modelo_id === "undefined")) {
  alert("Modelo não identificada.");
  window.location.href = "/clientHome.html";
  throw new Error("modelo_id ausente no perfil público");
}

const avatarImg  = document.getElementById("profileAvatar");
const capaImg    = document.getElementById("profileCapa");
const nomeEl     = document.getElementById("profileName");
const profileBio = document.getElementById("profileBio");
const inputAvatar = document.getElementById("inputAvatar");
const inputCapa   = document.getElementById("inputCapa");
const listaMidias = document.getElementById("listaMidias");
const btnChat = document.getElementById("btnChat");
const btnVip  = document.getElementById("btnVip");
const btnSalvarBio = document.getElementById("btnSalvarBio");
const bioInput     = document.getElementById("bioInput");
const localEl = document.getElementById("local-texto");
const btnUpload = document.querySelector(".btn-upload");
const inputUpload = document.getElementById("inputUpload");

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  aplicarRoleNoBody();
  iniciarPerfil();

  // ===============================
  // VIP PIX
  // ===============================
  document.getElementById("btnVipPix")?.addEventListener("click", () => {
    fecharEscolha();
    abrirPopupPix();
  });

  document.getElementById("fecharPix")?.addEventListener("click", () => {
    document.getElementById("popupPix")?.classList.add("hidden");
  });

  // ===============================
  // VIP CARTÃO
  // ===============================
  document.getElementById("btnVipCartao")?.addEventListener("click", () => {
    fecharEscolha();
    pagarComCartao();
  });

  // ===============================
  // CHAT
  // ===============================
  btnChat?.addEventListener("click", () => {
    if (!role) {
      abrirPopupVelvet({ tipo: "login" });
      return;
    }
    if (!window.__CLIENTE_VIP__) {
      abrirPopupVelvet({ tipo: "vip" });
      return;
    }
    window.location.href = "/chatcliente.html";
  });

//   fecharModal?.addEventListener("click", (e) => {
//   e.preventDefault();
//   e.stopPropagation();

//   if (modalVideo) {
//     modalVideo.pause();
//     modalVideo.src = "";
//   }

//   modalMidia.classList.add("hidden");
//  });

});





// ===============================
// ROLE VISUAL
// ===============================
function aplicarRoleNoBody() {
  document.body.classList.remove("role-modelo", "role-cliente", "role-publico");
  if (role === "modelo") {
    document.body.classList.add("role-modelo");
  } 
  else if (role === "cliente") {
    document.body.classList.add("role-cliente");
  } 
  else {
    // VISITANTE
    document.body.classList.add("role-publico");
  }
}

// ===============================
// PERFIL
// ===============================
function iniciarPerfil() {

  // MODELO (perfil próprio)
  if (modo === "privado" && role === "modelo") {
    carregarPerfil();
    carregarFeed();
    return;
  }

  // CLIENTE ou VISITANTE (perfil público)
  if (modo === "publico" && modelo_id) {
    carregarPerfilPublico();
    return;
  }

  // fallback de segurança
  console.warn("Perfil inválido, redirecionando");
  window.location.href = "/index.html";
}


function valorBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

async function carregarPerfil() {
  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const modelo = await res.json();
  localStorage.setItem("modelo_id", modelo.id);
  modelo_id = modelo.id;

  aplicarPerfilNoDOM(modelo);
}

async function carregarPerfilPublico() {
  // PERFIL PÚBLICO → SEM TOKEN
  const res = await fetch(`/api/modelo/publico/${modelo_id}`);

  if (!res.ok) {
    alert("Perfil não encontrado");
    return;
  }

  const modelo = await res.json();

  aplicarPerfilNoDOM(modelo);

  // ===============================
// STATUS VIP (CLIENTE LOGADO)
// ===============================
if (role === "cliente") {
  try {
    const vipRes = await fetch(`/api/vip/status/${modelo_id}`, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (vipRes.ok) {
      const vipData = await vipRes.json();
      window.__CLIENTE_VIP__ = vipData.vip === true;

     if (window.__CLIENTE_VIP__) {
      btnVip.textContent = "VIP ativo";
      btnVip.disabled = true;
      btnChat?.classList.remove("hidden");
    } else {
      btnChat?.classList.add("hidden");
    }
  }
  } catch (err) {
    console.error("Erro ao verificar VIP:", err);
    window.__CLIENTE_VIP__ = false;
  }
  } else {
  window.__CLIENTE_VIP__ = false;

  if (btnVip) {
    btnVip.textContent = "Torne-se VIP";
    btnVip.disabled = false;
  }
}

carregarFeedPublico();
}

// ===============================
// VIP
// ===============================
btnVip?.addEventListener("click", async () => {

  // 👀 VISITANTE → popup Velvet
  if (!role) {
    abrirPopupVelvet({ tipo: "login" });
    return;
  }

  // 🔒 CLIENTE → verifica VIP
  try {
    const statusRes = await fetch(`/api/vip/status/${modelo_id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    });

    if (!statusRes.ok) {
      throw new Error("Falha ao verificar status VIP");
    }

    const statusData = await statusRes.json();

    if (statusData.vip === true) {
      alert("💜 Você já é VIP desta modelo");
      return;
    }

    // ✅ NÃO É VIP → ABRE POPUP DE PAGAMENTO
    document
      .getElementById("escolhaPagamento")
      ?.classList.remove("hidden");

  } catch (err) {
    console.error("Erro ao verificar status VIP:", err);
    alert("Erro ao verificar status VIP");
  }
});

// ===============================
// FEED
// ===============================
function carregarFeed() {
  if (!listaMidias) return;

  fetch("/api/feed/me", {
    headers: { Authorization: "Bearer " + token }
  })
    .then(r => r.json())
    .then(feed => {
      if (!Array.isArray(feed)) return;
      listaMidias.innerHTML = "";
      feed.forEach(item => adicionarMidia(item));
    });
}

function carregarFeedPublico() {
  if (!listaMidias) return;

  fetch(`/api/modelo/publico/${modelo_id}/feed`)

    .then(r => r.json())
    .then(data => {
      // 🔎 SUPORTE A QUALQUER FORMATO
      const feed = Array.isArray(data) ? data : data.feed || data.midias || [];

      listaMidias.innerHTML = "";

      feed.forEach(item => {
        adicionarMidia(item);
      });
    });
}

function fecharEscolha() {
  document
    .getElementById("escolhaPagamento")
    .classList.add("hidden");
}

// ===============================
// UPLOAD AVATAR
// ===============================
inputAvatar?.addEventListener("change", async () => {
  const file = inputAvatar.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("avatar", file);

  const res = await fetch("/uploadAvatar", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    },
    body: fd
  });

  const data = await res.json();

  if (data.url) {
    avatarImg.src = data.url; // 🔥 atualiza na hora
  } else {
    alert("Erro ao atualizar avatar");
  }
});

// ===============================
// UPLOAD CAPA
// ===============================
inputCapa?.addEventListener("change", async () => {
  const file = inputCapa.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("capa", file);

  const res = await fetch("/uploadCapa", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    },
    body: fd
  });

  const data = await res.json();

  if (data.url) {
    capaImg.src = data.url; // 🔥 atualiza na hora
  } else {
    alert("Erro ao atualizar capa");
  }
});

// ===============================
// MIDIA
// ===============================
function abrirModalVenda(c) {
  const modal = document.createElement("div");
  modal.className = "modal-midia";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>

    <div class="modal-conteudo venda-modal">
      <img
        src="${getVideoThumbnail(c.url, c.thumbnail_url)}"
        class="midia-thumb"
      >

      <h3>Conteúdo Exclusivo</h3>
      <p>${c.descricao || "Conteúdo exclusivo para desbloqueio"}</p>

      <button class="btn-comprar">
        Desbloquear por R$ ${Number(c.preco).toFixed(2)}
      </button>
    </div>
  `;

  modal.querySelector(".modal-backdrop").onclick = () => modal.remove();
  document.body.appendChild(modal);
}

//CARREGAR MIDIAS //
  btnUpload?.addEventListener("click", (e) => {
    e.preventDefault();
    inputUpload?.click();
  });

  inputUpload?.addEventListener("change", () => {
  const file = inputUpload.files[0];
  if (!file) return;

  if (!validarMidia(file)) {
    inputUpload.value = "";
    return;
  }

  const url = URL.createObjectURL(file);
  abrirPreviewUpload(file, url);

  inputUpload.value = "";
});


function validarMidia(file) {
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    alert("Arquivo muito grande");
    return false;
  }
  return true;
}

//1ºFUNÇÃO
function abrirPreviewUpload(file, url) {
  const modal = document.createElement("div");
  modal.className = "modal-midia";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-conteudo upload-preview">
      ${
        file.type.startsWith("video")
          ? `<video src="${url}" controls autoplay muted playsinline></video>`
          : `<img src="${url}">`
      }
      <div class="upload-box">
      <p class="upload-titulo">Escolha onde deseja adicionar a mídia:</p>
     <div class="upload-opcoes">
  <button class="upload-tab active" data-value="feed">🎁 Pra você</button>
  <button class="upload-tab" data-value="venda">🔥 Especial</button>
 </div>

 <input type="hidden" name="tipo_conteudo" value="feed">


  <div class="upload-especial hidden">
    <input
      type="number"
      id="upload-preco"
      placeholder="Preço (R$)"
      min="0"
      step="0.01"
    >

    <textarea
      id="upload-descricao"
      placeholder="Descrição do conteúdo"
      rows="3"
    ></textarea>
  </div>

  <button class="btn-confirmar">Publicar</button>
   </div>
  `;

  const fecharModal = () => {
    URL.revokeObjectURL(url);
    modal.remove();
  };

  modal.querySelector(".modal-backdrop").onclick = fecharModal;

  const tabs = modal.querySelectorAll(".upload-tab");
  const hiddenTipo = modal.querySelector("input[name='tipo_conteudo']");
  const boxEspecial = modal.querySelector(".upload-especial");

  tabs.forEach(tab => {
  tab.onclick = () => {
     tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

     const valor = tab.dataset.value;
    hiddenTipo.value = valor;
     boxEspecial.classList.toggle("hidden", valor !== "venda");
     };
  });
  const btnPublicar = modal.querySelector(".btn-confirmar");
  btnPublicar.onclick = async () => {
  btnPublicar.disabled = true;
  btnPublicar.textContent = "Enviando...";
  
  try {
    const tipoConteudo = hiddenTipo.value;
    const preco = modal.querySelector("#upload-preco")?.value;
    const descricao = modal.querySelector("#upload-descricao")?.value;
    
    if (tipoConteudo === "venda" && (!preco || Number(preco) <= 0)) {
      alert("Informe um preço válido");
      btnPublicar.disabled = false;
      btnPublicar.textContent = "Publicar";
      return;
    }

    await enviarMidia(file, {
        tipo_conteudo: tipoConteudo,
        preco,
        descricao
    });

     if (role === "modelo") {
  carregarFeed();
} else {
  carregarFeedPublico();
}
      
    fecharModal();
   } catch (err) {
    console.error(err);
    btnPublicar.disabled = false;
    btnPublicar.textContent = "Publicar";
    alert("Erro ao enviar mídia");
    }
  };
  
  document.body.appendChild(modal);
}

function mostrarLoading() {
  document.body.classList.add("loading");
}

function esconderLoading() {
  document.body.classList.remove("loading");
}

//2º FUNÇÃO
async function enviarMidia(file, dados = {}) {
  const formData = new FormData();
  formData.append("file", file);

  if (dados.tipo_conteudo) {
    formData.append("tipo_conteudo", dados.tipo_conteudo);
  }

  if (dados.tipo_conteudo === "venda") {
    formData.append("preco", dados.preco || 0);
    formData.append("descricao", dados.descricao || "");
  }

  const res = await fetch("/api/upload", {
  method: "POST",
  body: formData
 });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}


//3º Função
function adicionarMidia(conteudo) {
  const {
    id,
    url,
    tipo,
    tipo_conteudo,
    thumbnail_url
  } = conteudo;

  const isVideo = tipo === "video";

  if (!listaMidias) return;

  const card = document.createElement("div");
  card.className = "midiaCard";

  const img = document.createElement("img");
  img.className = "midiaThumb";
  img.src = isVideo
    ? getVideoThumbnail(url, thumbnail_url)
    : url;

  card.appendChild(img);

  const deveBloquear =
    role !== "modelo" && window.__CLIENTE_VIP__ !== true;

  if (deveBloquear) {
    card.classList.add("bloqueada");
    card.addEventListener("click", () => {
      abrirPopupVelvet({ tipo: role ? "vip" : "login" });
    });
  } else {
    card.addEventListener("click", () => {
      if (tipo_conteudo === "venda" && role !== "modelo") {
        abrirModalVenda(conteudo);
      } else {
        abrirModalMidia(url, isVideo);
      }
    });
  }

  if (role === "modelo") {
    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btnExcluirMidia";
    btnExcluir.textContent = "✕";
    btnExcluir.onclick = (e) => {
      e.stopPropagation();
      excluirMidia(id, card);
    };
    card.appendChild(btnExcluir);
  }

  img.onerror = () => {
    img.src = "/assets/capa.png";
  };

  listaMidias.appendChild(card);
}


//4º FUNÇÃO
function getVideoThumbnail(url, thumbnail_url) {
  if (thumbnail_url) return thumbnail_url;

  if (url && url.includes("cloudinary.com")) {
    return url.replace(/\.(mp4|webm|ogg|mov)$/i, ".jpg");
  }

  // 🔒 BACKBLAZE OU QUALQUER OUTRO → fallback
  return "/assets/capa.png";
}

function abrirModalMidia(url, isVideo) {
  const modal = document.getElementById("modalMidia");
  const img = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  img.style.display = "none";
  video.style.display = "none";

  // 🔥 LIMPA ESTADO ANTERIOR
  video.pause();
  video.src = "";
  img.src = "";

  if (isVideo) {
    video.src = url;
    video.style.display = "block";
    video.play();
  } else {
    img.src = url;
    img.style.display = "block";
  }

  modal.classList.remove("hidden");
}

// FECHAR MODAL
document.getElementById("fecharModal")?.addEventListener("click", (e) => {
  e.stopPropagation(); // 🔥 MUITO IMPORTANTE

  const modal = document.getElementById("modalMidia");
  const video = document.getElementById("modalVideo");

  video.pause();
  video.src = "";

  modal.classList.add("hidden");
});

async function excluirMidia(id, card) {
  if (!confirm("Excluir esta mídia?")) return;

  const res = await fetch(`/api/conteudos/${id}`, {

    method: "DELETE",
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (res.ok) {
    card.remove();
  } else {
    alert("Erro ao excluir mídia");
  }
}

// ===============================
// DOM PERFIL
// ===============================
function aplicarPerfilNoDOM(modelo) {
  nomeEl.textContent = modelo.nome || "";
  profileBio.textContent = modelo.bio || "";

  if (modelo.avatar) {
    avatarImg.src = modelo.avatar;
  }

  if (modelo.capa) {
    capaImg.src = modelo.capa;
  }

  const localEl = document.getElementById("local-texto");

  if (localEl) {
    const local = [modelo.local]
      .filter(Boolean)
      .join(" • ");

    if (local) {
      localEl.textContent = local;
    } else {
      // se não tiver local, esconde o bloco
      localEl.parentElement.style.display = "none";
    }
  }
}


async function abrirPopupPix() {
  if (!modelo_id) {
    alert("Modelo não identificada");
    return;
  }

  // 🔢 VALOR BASE (APENAS PARA UI)
  const valorAssinatura = 20.00;

  // 🔥 CÁLCULO APENAS VISUAL (BACKEND RECALCULA)
  const taxaTransacao  = Number((valorAssinatura * 0.10).toFixed(2));
  const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2));
  const valorTotal     = Number(
    (valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2)
  );

  // 🧾 PREENCHE UI
  document.getElementById("pixValorBase").innerText =
    valorBRL(valorAssinatura);

  document.getElementById("pixTaxaTransacao").innerText =
    valorBRL(taxaTransacao);

  document.getElementById("pixTaxaPlataforma").innerText =
    valorBRL(taxaPlataforma);

  document.getElementById("pixValorTotal").innerText =
    valorBRL(valorTotal);

  // 🔓 ABRE POPUP
  document.getElementById("popupPix").classList.remove("hidden");

  // 🔥 CRIA PIX NO BACKEND
  const res = await fetch("/api/pagamento/vip/pix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({
      modelo_id,
      valor_assinatura: valorAssinatura // 👈 SÓ ISSO
    })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || "Erro ao gerar PIX");
    return;
  }

  // 📲 MOSTRA PIX
  document.getElementById("pixQr").src =
    "data:image/png;base64," + data.qr_code;

  document.getElementById("pixCopia").value = data.copia_cola;

  // guarda id do pagamento
  window.__PIX_PAYMENT_ID__ = data.payment_id;
}

function copiarPix() {
  const textarea = document.getElementById("pixCopia");
  textarea.select();
  document.execCommand("copy");
  alert("Código Pix copiado 💜");
}

socket.on("vipAtivado", ({ modelo_id: modeloVip }) => {
  if (Number(modeloVip) !== Number(modelo_id)) return;

  // 🔒 fecha popup PIX
  document.getElementById("popupPix")?.classList.add("hidden");

  // 🔔 popup simples de sucesso
  mostrarVipAtivadoPopup();

  // 🔥 atualiza estado local
  window.__CLIENTE_VIP__ = true;

  // 🔘 botão vira VIP ativo
  if (btnVip) {
    btnVip.textContent = "VIP ativo";
    btnVip.disabled = true;
  }

  // 🔓 desbloqueia conteúdos
  carregarFeedPublico();
});

async function pagarComCartao() {
  fecharEscolha();

  // 🔢 VALOR BASE (ASSINATURA)
  const valorAssinatura = 20.00;

  // 🔥 TAXAS PERCENTUAIS (CORRETO)
  const taxaTransacao  = Number((valorAssinatura * 0.10).toFixed(2)); // 10%
  const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2)); // 5%

  const valorTotal = Number(
    (valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2)
  );

  // 🧾 UI
  document.getElementById("cartaoValorBase").innerText =
    valorBRL(valorAssinatura);

  document.getElementById("cartaoTaxaTransacao").innerText =
    valorBRL(taxaTransacao);

  document.getElementById("cartaoTaxaPlataforma").innerText =
    valorBRL(taxaPlataforma);

  document.getElementById("cartaoValorTotal").innerText =
    valorBRL(valorTotal);

  // 🔓 ABRE MODAL
  document.getElementById("paymentModal").classList.remove("hidden");

  // 🔥 CRIA PAYMENT INTENT
  const res = await fetch("/api/pagamento/vip/cartao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({
      modelo_id,
      valor_assinatura: valorAssinatura,
      taxa_transacao: taxaTransacao,
      taxa_plataforma: taxaPlataforma
    })
   });

   const data = await res.json();

   if (!res.ok) {
    alert(data.error || "Erro no pagamento");
    return;
  }

  elements = stripe.elements({ clientSecret: data.clientSecret });

  const paymentElement = elements.create("payment");
  paymentElement.mount("#payment-element");
}

 // ===============================
 // 💳 CONFIRMAR PAGAMENTO CARTÃO
 // ===============================
 document
  .querySelector("#paymentModal .btn-confirmar-desbloqueio")
  ?.addEventListener("click", async () => {

    if (!elements) {
      alert("Pagamento ainda não inicializado");
      return;
    }

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href // fallback se Stripe pedir redirect
      }
    });

    if (error) {
      alert(error.message);
    }
});

async function pagarComCartaoRecorrente() {
  fecharEscolha();

  // 🔓 ABRE MODAL
  document.getElementById("paymentModal").classList.remove("hidden");

  // 🔁 CRIA ASSINATURA (NÃO payment intent)
  const res = await fetch("/api/vip/cartao/assinatura", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({
      modelo_id
    })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || "Erro ao criar assinatura");
    return;
  }

  // 🔐 USA O clientSecret DA ASSINATURA
  elements = stripe.elements({ clientSecret: data.clientSecret });

  const paymentElement = elements.create("payment");
  paymentElement.mount("#payment-element");
}

function mostrarVipAtivadoPopup() {
  const popup = document.getElementById("popupVipAtivado");

  if (!popup) {
    console.warn("popupVipAtivado não encontrado no DOM");
    alert("VIP ativado com sucesso!");
    return;
  }

  popup.classList.remove("hidden");
}


function fecharVipAtivado() {
  document
    .getElementById("popupVipAtivado")
    .classList.add("hidden");
}

// ===============================
// 💜 POPUP VELVET ACESSO
// ===============================
function abrirPopupVelvet({ tipo }) {
  const popup = document.getElementById("popupVelvetAcesso");
  const texto = document.getElementById("popupVelvetTexto");
  const btn   = document.getElementById("btnVelvetAcao");

  if (!popup) return;

  if (tipo === "login") {
    texto.textContent =
      "Entre ou crie sua conta para acessar este conteúdo";
    btn.textContent = "Entrar / Criar conta";
    btn.onclick = () => {
      window.location.href = "/index.html";
    };
  }

  if (tipo === "vip") {
    texto.textContent =
      "Este conteúdo é exclusivo para membros VIP";
    btn.textContent = "Tornar-se VIP";
    btn.onclick = () => {
      popup.classList.add("hidden");
      document.getElementById("escolhaPagamento")?.classList.remove("hidden");
    };
  }

  popup.classList.remove("hidden");
}

// fechar clicando fora
document
  .getElementById("popupVelvetAcesso")
  ?.addEventListener("click", (e) => {
    if (e.target.id === "popupVelvetAcesso") {
      e.currentTarget.classList.add("hidden");
    }
  });

  function fecharPagamento() {
  const modal = document.getElementById("paymentModal");

  if (modal) {
    modal.classList.add("hidden");
  }

  // limpeza de segurança
  const paymentElement = document.getElementById("payment-element");
  if (paymentElement) {
    paymentElement.innerHTML = "";
  }

  elements = null;
}




