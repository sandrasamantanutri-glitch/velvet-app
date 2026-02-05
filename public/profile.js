// ===============================
// AUTH GUARD
// ===============================
// window.__CLIENTE_VIP__ = false;
// window.__VIP_READY__ = false;

window.socket = io();

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

const params = new URLSearchParams(window.location.search);
const modeloParam = params.get("id");

let modo = "publico";
if (!modeloParam && role === "modelo" && token) {
}

if (role === "modelo" && token && !modeloParam) {
  modo = "privado";
}
if (role === "cliente" && modo === "privado") {
  window.location.href = "/";
  throw new Error("Cliente não pode acessar profile privado");
}

let modelo_id = null;

if (modeloParam) { modelo_id = Number(modeloParam);
}

if (!modeloParam && modo === "privado") {
  modelo_id = Number(localStorage.getItem("modelo_id"));
}

const ofertaCard = document.getElementById("oferta-card");
const btnAssinar = document.getElementById("btn-assinar");
if (btnAssinar) btnAssinar.disabled = true;

if (token) {
  window.socket.emit("auth", { token });

  if (role === "cliente") {
    const payload = decodeJWT(token);
    if (payload?.id) {
      window.socket.emit("loginCliente", Number(payload.id));
    }
  }
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
const inputUpload = document.getElementById("inputUpload");

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
const btnUpload = document.querySelector(".btn-upload");
if (role !== "modelo" || !token) {
  btnUpload?.remove();
}

async function carregarPerfilBase() {
  // MODELO (perfil próprio)
  if (modo === "privado" && role === "modelo") {
    const res = await fetch("/api/modelo/me", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error("Modelo não encontrado");

    const modelo = await res.json();
    modelo_id = Number(modelo.id);
    aplicarPerfilNoDOM(modelo);
    return;
  }

  // PERFIL PÚBLICO (cliente / visitante / vip)
  const res = await fetch(`/api/modelo/publico/${modelo_id}`);
  if (!res.ok) throw new Error("Perfil público não encontrado");

  const modelo = await res.json();
  modelo_id = Number(modelo.id);
  aplicarPerfilNoDOM(modelo);
}

async function carregarFeedBase() {
  if (!listaMidias) return;

  // MODELO
  if (modo === "privado" && role === "modelo") {
    const res = await fetch("/api/feed/me", {
      headers: { Authorization: "Bearer " + token }
    });
    const feed = await res.json();
    listaMidias.innerHTML = "";
    feed.forEach(adicionarMidia);
    return;
  }

  // PÚBLICO
  const res = await fetch(`/api/modelo/publico/${modelo_id}/feed`);
  const data = await res.json();
  const feed = Array.isArray(data) ? data : data.feed || [];
  listaMidias.innerHTML = "";
  feed.forEach(adicionarMidia);
}

// async function aplicarRegrasDeAcesso() {

//   // MODELO
//   if (role === "modelo" && modo === "privado") {
//     ofertaCard.style.display = "block";
//     btnChat?.classList.remove("hidden");
//     liberarMidias?.();
//     return;
//   }

//   // VISITANTE (sem login)
//   if (!role) {
//     ofertaCard.style.display = "block";
//     bloquearMidias?.("login");
//     return;
//   }

//   // CLIENTE
//   if (role === "cliente") {
//     try {
//       const res = await fetch(`/api/vip/status/${modelo_id}`, {
//         headers: { Authorization: "Bearer " + token }
//       });
//       const { vip } = res.ok ? await res.json() : { vip: false };

//       if (vip) {
//         ofertaCard.style.display = "none";
//         btnChat?.classList.remove("hidden");
//         liberarMidias?.();
//       } else {
//         ofertaCard.style.display = "block";
//         bloquearMidias?.("vip");
//       }
//     } catch {
//       ofertaCard.style.display = "block";
//       bloquearMidias?.("vip");
//     }
//   }
// }

async function iniciarPerfil() {
  try {
    await carregarPerfilBase();   // sempre
    await carregarOfertaAtiva();  // sempre
    await carregarFeedBase();     // sempre
    // await aplicarRegrasDeAcesso();// decide acesso
  }
 catch (err) {
  console.error("🔥 ERRO REAL AO INICIAR PERFIL 🔥");
  console.error(err);
  console.trace();
  alert(err.message || err);
}
}


// ===============================
// DOM
// ===============================

document.addEventListener("DOMContentLoaded", async () => {
  aplicarRoleNoBody();

  try {
    await iniciarPerfil(); // 🔥 perfil + oferta + feed + regras
  } catch (err) {
    console.error("Erro ao iniciar perfil:", err);
    return;
  }

  // 🔔 clique do botão assinar (apenas dispara pagamento)
  btnAssinar?.addEventListener("click", () => {
    if (!OFERTA_ATUAL || !OFERTA_ATUAL.modelo_id) {
      alert("Oferta ainda não carregada. Aguarde um instante.");
      return;
    }

    window.PAGAMENTO_TIPO_ATUAL = "vip";
    window.MODELO_ID_ATUAL = OFERTA_ATUAL.modelo_id;

    preencherResumoVIP({
      valorBase: OFERTA_ATUAL.valor_base,
      desconto:
        OFERTA_ATUAL.valor_base -
        OFERTA_ATUAL.valor_promocional
    });

    pagarComPix({ tipo: "vip" });
  });
});

// ===============================
// TABS DE MÍDIA (FEED / ESPECIAL)
// ===============================
document.querySelectorAll(".midias-tabs .tab").forEach(tab => {
  tab.addEventListener("click", () => {

    // troca visual das abas
    document
      .querySelectorAll(".midias-tabs .tab")
      .forEach(t => t.classList.remove("active"));

    tab.classList.add("active");

    // esconde todos os grids
    document
      .querySelectorAll(".midias-grid")
      .forEach(g => g.classList.remove("active"));

    const tipo = tab.dataset.tab;

    if (tipo === "free") {
      document
        .getElementById("listaMidias")
        ?.classList.add("active");
    }

    if (tipo === "paid") {
      document
        .getElementById("midias-paid")
        ?.classList.add("active");
    }
  });
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

function valorBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

let OFERTA_ATUAL = null;

async function carregarOfertaAtiva() {
  if (!modelo_id || isNaN(Number(modelo_id))) {
    console.warn("⏳ Oferta aguardando modelo_id válido");
    return;
  }

  const precoDescontoEl = document.getElementById("preco-desconto");
  const precoOriginalEl = document.getElementById("preco-original");
  const descontoEl = document.getElementById("oferta-desconto");

  if (!ofertaCard || !precoDescontoEl || !precoOriginalEl) {
    console.warn("Elementos da oferta não encontrados");
    return;
  }

  try {
    const res = await fetch(`/api/ofertas/ativa/${modelo_id}`);

    if (!res.ok) {
      ofertaCard.style.display = "none";
      OFERTA_ATUAL = null;
      return;
    }

    const data = await res.json();

    if (!data.ativa || !data.oferta) {
      ofertaCard.style.display = "none";
      OFERTA_ATUAL = null;
      return;
    }

    const oferta = data.oferta;

    // 🔥 salva a oferta globalmente (não usar DOM depois)
    OFERTA_ATUAL = {
      id: oferta.id,
      modelo_id: oferta.modelo_id,
      valor_base: Number(oferta.valor_base),
      valor_promocional: Number(oferta.valor_promocional),
      desconto_percentual: Number(oferta.desconto_percentual || 0)
    };

    // 🎯 badge de desconto
    if (descontoEl && OFERTA_ATUAL.desconto_percentual > 0) {
      descontoEl.textContent =
        `Economize ${OFERTA_ATUAL.desconto_percentual}%`;
      descontoEl.style.display = "inline-block";
    } else if (descontoEl) {
      descontoEl.style.display = "none";
    }

    // 💰 preços no layout
    precoDescontoEl.textContent =
      valorBRL(OFERTA_ATUAL.valor_promocional);

    precoOriginalEl.textContent =
      valorBRL(OFERTA_ATUAL.valor_base);

    ofertaCard.style.display = "block";
    
    if (btnAssinar) btnAssinar.disabled = false;

  } catch (err) {
    console.error("Erro ao carregar oferta:", err);
    ofertaCard.style.display = "none";
    OFERTA_ATUAL = null;
  }
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
  const token = localStorage.getItem("token");

  if (!token || role !== "modelo") {
    alert("Apenas modelos autenticadas podem enviar mídias.");
    throw new Error("Upload não autorizado");
  }

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
    headers: {
      Authorization: "Bearer " + token
    },
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
    thumbnail_url,
    preco,
    descricao
  } = conteudo;

  const isVideo = tipo === "video";

  const card = document.createElement("div");
  card.className = "midiaCard";

  // ===== WRAPPER DA MÍDIA =====
  const mediaWrapper = document.createElement("div");
  mediaWrapper.className = "midiaWrapper";

  const img = document.createElement("img");
  img.className = "midiaThumb";
  img.src = isVideo
    ? getVideoThumbnail(url, thumbnail_url)
    : url;

  mediaWrapper.appendChild(img);

  // 💰 PREÇO (SÓ ESPECIAL)
  if (tipo_conteudo === "venda" && preco) {
    const priceTag = document.createElement("div");
    priceTag.className = "midia-preco";
    priceTag.textContent = `R$ ${Number(preco).toFixed(2)}`;
    mediaWrapper.appendChild(priceTag);
  }

  card.appendChild(mediaWrapper);

  // 📝 DESCRIÇÃO (SÓ ESPECIAL)
  if (tipo_conteudo === "venda" && descricao) {
    const desc = document.createElement("div");
    desc.className = "midia-descricao";
    desc.textContent = descricao;
    card.appendChild(desc);
  }

 card.onclick = () => {
  // modelo abre tudo direto
  if (role === "modelo") {
    abrirModalMidia(url, isVideo);
    return;
  }

  // especial (venda) → abre modal de venda
  if (tipo_conteudo === "venda") {
    abrirModalVenda(conteudo);
    return;
  }

  // feed normal
  abrirModalMidia(url, isVideo);
};

  // 🗑️ EXCLUIR (MODELO)
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

  // ===== GRID DESTINO =====
  const gridDestino =
    tipo_conteudo === "venda"
      ? document.getElementById("midias-paid")
      : document.getElementById("listaMidias");

  gridDestino?.appendChild(card);
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

function atualizarUIVip(modelo_id) {
  const btnVip = document.getElementById("btnVip");

  if (!btnVip) return;

  btnVip.textContent = "VIP ativo 💜";
  btnVip.disabled = true;
}




