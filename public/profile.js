window.socket = io();
const token = window.token;
const role = localStorage.getItem("role");
const params = new URLSearchParams(window.location.search);
const modeloParam = params.get("id");
const refParam = params.get("ref") || params.get("id");
const srcParam = params.get("src");


if (refParam) localStorage.setItem("ref_modelo", refParam);
if (srcParam) localStorage.setItem("origem_trafego", srcParam);

if (refParam || srcParam) {
  fetch("/api/track-acesso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: refParam,
      src: srcParam,
      page: "perfil"
    })
  }).catch(() => {});
}


let modo = "publico";
let modelo_id = null;

// VISUALIZACAO MEU PERFIL
if (token && !modeloParam) {
  modo = "privado";
}


// PERFIL PÚBLICO PARAM=ID NA URL
if (modeloParam) {
  modelo_id = Number(modeloParam);
}

// ASSINATURAS/OFERTAS ///////
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

/////PERFIL ///
const btnUpload = document.querySelector(".btn-upload");
const avatarImg  = document.getElementById("profileAvatar");
const capaImg    = document.getElementById("profileCapa");
const nomeEl     = document.getElementById("profileName");
const profileBio = document.getElementById("profileBio");
const inputAvatar = document.getElementById("inputAvatar");
const inputCapa   = document.getElementById("inputCapa");
const listaMidias = document.getElementById("listaMidias");
const btnVip  = document.getElementById("btnVip");
const btnSalvarBio = document.getElementById("btnSalvarBio");
const bioInput     = document.getElementById("bioInput");
const localEl = document.getElementById("local-texto");
const inputUpload = document.getElementById("inputUpload");

//  CONTEÚDO LIBERADO (PÓS-PAGAMENTO)/////
socket.on("conteudoVisto", async ({ message_id }) => {
  try {
    // 🔒 fecha popup de pagamento (se ainda estiver aberto)
    fecharPopupPagamento?.();

    // 🧠 se não sabemos qual mídia foi comprada, recarrega feed
    if (!window.MIDIA_VENDA_ATUAL?.conteudo_id) {
      await carregarFeedBase();
      return;
    }

    // busca a mídia liberada no backend (segurança)
    const conteudo_id = window.MIDIA_VENDA_ATUAL.conteudo_id;
    const res = await fetch(
      `/api/conteudo/liberado/${message_id}`,
      {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      }
    );

    if (!res.ok) {
      console.warn("Conteúdo liberado, mas não foi possível buscar mídia");
      await carregarFeedBase();
      return;
    }

    const midias = await res.json();
    if (!midias || !midias.length) return;

    const midia = midias[0];

    // ABRE AUTOMATICAMENTE
    abrirModalMidia(
      midia.url,
      midia.tipo === "video"
    );

    //limpa estado
    window.MIDIA_VENDA_ATUAL = null;

    // 🔄 atualiza feed (pra não cobrar de novo)
    await carregarFeedBase();
  } catch (err) {
    console.error("Erro ao liberar mídia:", err);
  }
});

///////////////////////////////// FUNCOES ///////////////////////////////////
function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch (e) {
    return null;
  }
}

// function exigirCadastro(motivo = "Para continuar, crie sua conta") {
//   console.log("🔥 exigirCadastro chamado");
//   window.AUTH_MENSAGEM = motivo;
//   openAgeGate("register");
// }

// function exigirLogin() {
//   console.error("openAgeGate não carregado");
//   openAgeGate("login");
// }


//PERFIL ///
async function carregarPerfilBase() {

  // 🔐 PERFIL PRIVADO
  if (modo === "privado") {
    const res = await fetch("/api/modelo/me", {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) throw new Error("Perfil não encontrado");

    const perfil = await res.json();
    modelo_id = Number(perfil.id);
    aplicarPerfilNoDOM(perfil);
    return;
  }

  // 🌍 PERFIL PÚBLICO
  if (!modelo_id || isNaN(Number(modelo_id))) {
    console.warn("modelo_id inválido:", modelo_id);
    return;
  }

  const res = await fetch(`/api/modelo/publico/${modelo_id}`);
  if (!res.ok) throw new Error("Perfil público não encontrado");

  const modelo = await res.json();
  modelo_id = Number(modelo.id);
  aplicarPerfilNoDOM(modelo);
}


//ESPECIAL E PRA VOCE //
async function carregarFeedBase() {
  if (!listaMidias || !modelo_id) return;

  const res = await fetch(`/api/modelo/publico/${modelo_id}/feed`, {
    headers: token
      ? { Authorization: "Bearer " + token }
      : {}
  });

  if (!res.ok) {
    console.error("Erro ao carregar feed");
    return;
  }

  const feed = await res.json();

  if (!Array.isArray(feed)) {
    console.warn("Feed inválido:", feed);
    return;
  }

  const gridFeed = document.getElementById("listaMidias");
  const gridEspecial = document.getElementById("midias-paid");

  if (gridFeed) gridFeed.innerHTML = "";
  if (gridEspecial) gridEspecial.innerHTML = "";

  feed.forEach(adicionarMidia);
}


async function aplicarRegrasDeAcesso() {

  // MODELO
  if (role === "modelo" && modo === "privado") {
  ofertaCard.style.display = "block";

  if (btnAssinar) {
    btnAssinar.disabled = true;
    btnAssinar.style.cursor = "not-allowed";
  }

  return;
  }

  // VISITANTE
  if (!role) {
    ofertaCard.style.display = "block";
    //bloquearMidias?.("login");
    return;
  }

  // CLIENTE
  if (role === "cliente") {
    try {
      const res = await fetch(`/api/vip/status/${modelo_id}`, {
        headers: { Authorization: "Bearer " + token }
      });
      const { vip } = res.ok ? await res.json() : { vip: false };

      if (vip) {
        ofertaCard.style.display = "none";

      } else {
        ofertaCard.style.display = "block";
      }
    } catch {
      ofertaCard.style.display = "block";
    }
  }
}

async function iniciarPerfil() {
  try {
    await carregarPerfilBase();   
    await carregarOfertaAtiva();  
    await carregarFeedBase();     
    await aplicarRegrasDeAcesso();
  }
 catch (err) {
  console.error("🔥 ERRO REAL AO INICIAR PERFIL 🔥");
  console.error(err);
  console.trace();
  alert(err.message || err);
 }
}

function aplicarPerfilNoDOM(modelo) {
  nomeEl.textContent = modelo.nome_exibicao || "";
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

//🌐 REDES SOCIAIS ////
const igLink = document.getElementById("link-instagram");
const ttLink = document.getElementById("link-tiktok");

// Instagram
if (modelo.instagram && igLink) {
  igLink.href = `https://instagram.com/${modelo.instagram}`;
  igLink.style.display = "inline-block";
} else if (igLink) {
  igLink.style.display = "none";
}

// TikTok
if (modelo.tiktok && ttLink) {
  ttLink.href = `https://www.tiktok.com/@${modelo.tiktok}`;
  ttLink.style.display = "inline-block";
} else if (ttLink) {
  ttLink.style.display = "none";
}
}

// ===============================
// DOM
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  aplicarRoleNoBody();

  try {
    await iniciarPerfil();
  } catch (err) {
    console.error("Erro ao iniciar perfil:", err);
    return;
  }

  // PÓS-REGISTRO AUTOMÁTICO
  const postRegisterAction =
    localStorage.getItem("post_register_action");

  if (postRegisterAction === "open_payment") {
    localStorage.removeItem("post_register_action");
    window.abrirFluxoVIP();
  }

  // CLIQUE MANUAL NO BOTÃO ASSINAR
  btnAssinar?.addEventListener("click", () => {
    window.abrirFluxoVIP();
  });

  // LINK "assinar o perfil" DENTRO DO POPUP DE MÍDIA
  document.addEventListener("click", (e) => {
    if (e.target.closest(".link-assinar-vip")) {
      e.preventDefault();
      window.abrirFluxoVIP();
    }
  });

});

 // TABS DE MÍDIA (FEED / ESPECIAL) //

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
  console.log("🧪 carregarOfertaAtiva chamado com modelo_id =", modelo_id);
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

    // salva a oferta globalmente (não usar DOM depois)
    OFERTA_ATUAL = {
      id: oferta.id,
      modelo_id: oferta.modelo_id,
      valor_base: Number(oferta.valor_base),
      valor_promocional: Number(oferta.valor_promocional),
      desconto_percentual: Number(oferta.desconto_percentual || 0)
    };

    // badge de desconto
    if (descontoEl && OFERTA_ATUAL.desconto_percentual > 0) {
      descontoEl.textContent =
        `Economize ${OFERTA_ATUAL.desconto_percentual}%`;
      descontoEl.style.display = "inline-block";
    } else if (descontoEl) {
      descontoEl.style.display = "none";
    }

    // preços no layout
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

// UPLOAD AVATAR
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

// UPLOAD CAPA
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
// function abrirModalVenda(c) {
//   const modal = document.createElement("div");
//   modal.className = "modal-midia";
//   modal.innerHTML = `
//     <div class="modal-backdrop"></div>

//     <div class="modal-conteudo venda-modal">
//       <img
//         src="${getVideoThumbnail(c.url, c.thumbnail_url)}"
//         class="midia-thumb"
//       >

//       <h3>Conteúdo Exclusivo</h3>
//       <p>${c.descricao || "Conteúdo exclusivo para desbloqueio"}</p>

//       <button class="btn-comprar">
//         Desbloquear por R$ ${Number(c.preco).toFixed(2)}
//       </button>
//     </div>
//   `;

//   modal.querySelector(".modal-backdrop").onclick = () => modal.remove();
//   document.body.appendChild(modal);
// }

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
  <button type="button" class="modal-close-upload">✕</button>

      ${
        file.type.startsWith("video")
          ? `<video src="${url}" controls autoplay muted playsinline></video>`
          : `<img src="${url}">`
      }

      <div class="upload-box">
        <p class="upload-titulo">Escolha onde deseja adicionar a mídia:</p>

        <div class="upload-opcoes">
          <button type="button" class="upload-tab active" data-value="feed">🎁 Pra você</button>
          <button type="button" class="upload-tab" data-value="venda">🔥 Especial</button>
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

        <button type="button" class="btn-confirmar">Publicar</button>
      </div>
    </div>
  `;

  // 🔹 Adiciona primeiro ao DOM
  document.body.appendChild(modal);

  const fecharModal = () => {
    URL.revokeObjectURL(url);
    modal.remove();
  };

  modal.querySelector(".modal-backdrop")
    .addEventListener("click", fecharModal);

  const tabs = modal.querySelectorAll(".upload-tab");
  const hiddenTipo = modal.querySelector("input[name='tipo_conteudo']");
  const boxEspecial = modal.querySelector(".upload-especial");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const valor = tab.dataset.value;
      hiddenTipo.value = valor;
      boxEspecial.classList.toggle("hidden", valor !== "venda");
    });
  });

  const btnPublicar = modal.querySelector(".btn-confirmar");

  btnPublicar.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("CLIQUE OK");
    console.log("FILE:", file);

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
        await carregarFeedBase();

        if (tipoConteudo === "venda") {
          document.querySelector('[data-tab="paid"]')?.click();
        } else {
          document.querySelector('[data-tab="free"]')?.click();
        }
      }

      fecharModal();

    } catch (err) {
      console.error("Erro no upload:", err);
      btnPublicar.disabled = false;
      btnPublicar.textContent = "Publicar";
      alert("Erro ao enviar mídia");
    }
  });
}

function mostrarLoading() {
  document.body.classList.add("loading");
}

function esconderLoading() {
  document.body.classList.remove("loading");
}

//2º FUNÇÃO
async function enviarMidia(file, dados = {}) {
  console.log("=== ENVIAR MIDIA CHAMADO ===");
  console.log("Token:", token);
  console.log("Role:", role);
  console.log("File recebido:", file);

  if (!file) {
    throw new Error("Arquivo não recebido");
  }

  if (!token || role !== "modelo") {
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

  console.log("Enviando para /api/upload ...");

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    },
    body: formData
  });

  console.log("Status da resposta:", res.status);

  const texto = await res.text();
  console.log("Resposta do servidor:", texto);

  if (!res.ok) {
    throw new Error(texto);
  }

  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
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

  // WRAPPER DA MÍDIA
  const mediaWrapper = document.createElement("div");
  mediaWrapper.className = "midiaWrapper";

  const img = document.createElement("img");
  img.className = "midiaThumb";
  img.src = isVideo
    ? getVideoThumbnail(url, thumbnail_url)
    : url;

  mediaWrapper.appendChild(img);

  // PREÇO (SÓ ESPECIAL)
  if (tipo_conteudo === "venda" && preco) {
    const priceTag = document.createElement("div");
    priceTag.className = "midia-preco";
    priceTag.textContent = `R$ ${Number(preco).toFixed(2)}`;
    mediaWrapper.appendChild(priceTag);
  }

  card.appendChild(mediaWrapper);

  // DESCRIÇÃO (SÓ ESPECIAL)
  if (tipo_conteudo === "venda" && descricao) {
    const desc = document.createElement("div");
    desc.className = "midia-descricao";
    desc.textContent = descricao;
    card.appendChild(desc);
  }

  const deveBloquear =
  tipo_conteudo === "venda" &&
  role !== "modelo";

if (deveBloquear) {
  card.classList.add("locked");
}
 card.onclick = () => {
   if (tipo_conteudo === "venda") {

  if (role === "modelo") {
    abrirModalMidia(url, isVideo);
    return;
  }

   if (!role) {
      exigirCadastro("Crie sua conta para acessar conteúdos exclusivos");
      return;
    }

    window.PAGAMENTO_TIPO_ATUAL = "midia";
    window.MODELO_ID_ATUAL = modelo_id;
     window.MIDIA_VENDA_ATUAL = {
      conteudo_id: id,
      preco: Number(preco),
      descricao
    };

     abrirPopupPagamento();
    return;
  }
  // feed normal
  abrirModalMidia(url, isVideo);
 };

  // EXCLUIR (MODELO)
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

  // GRID DESTINO 
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

  // BACKBLAZE OU QUALQUER OUTRO → fallback
  return "/assets/capa.png";
}

function abrirModalMidia(url, isVideo) {
  const modal = document.getElementById("modalMidia");
  const img = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  img.style.display = "none";
  video.style.display = "none";

  // LIMPA ESTADO ANTERIOR
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
  e.stopPropagation(); 

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

// async function pagarComCartaoRecorrente() {
//   fecharEscolha();

//   // 🔓 ABRE MODAL
//   document.getElementById("paymentModal").classList.remove("hidden");

//   // 🔁 CRIA ASSINATURA (NÃO payment intent)
//   const res = await fetch("/api/vip/cartao/assinatura", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: "Bearer " + token
//     },
//     body: JSON.stringify({
//       modelo_id
//     })
//   });

//   const data = await res.json();

//   if (!res.ok) {
//     alert(data.error || "Erro ao criar assinatura");
//     return;
//   }

//   // 🔐 USA O clientSecret DA ASSINATURA
//   elements = stripe.elements({ clientSecret: data.clientSecret });

//   const paymentElement = elements.create("payment");
//   paymentElement.mount("#payment-element");
// }

function atualizarUIVip(modelo_id) {
  const btnVip = document.getElementById("btnVip");

  if (!btnVip) return;

  btnVip.textContent = "VIP ativo 💜";
  btnVip.disabled = true;
}

// window.abrirPopupPagamento = function () {
//   const popup = document.getElementById("popupPagamentoVelvet");
//   if (!popup) return;

//   popup.classList.remove("hidden");

//   // reset visual
//   document.querySelector(".vip-detalhes")?.classList.add("hidden");
//   document.querySelector(".midia-detalhes")?.classList.add("hidden");
//   document.querySelector(".velvet-tabs")?.classList.remove("hidden");
//   document.getElementById("conteudoPix")?.classList.remove("hidden");
//   document.getElementById("conteudoCartao")?.classList.add("hidden");

//   // ===============================
//   // 🔥 MÍDIA
//   // ===============================
//   if (window.PAGAMENTO_TIPO_ATUAL === "midia") {
//     document.querySelector(".velvet-tabs")?.classList.add("hidden");
//     document.getElementById("conteudoPix")?.classList.add("hidden");
//     document.getElementById("conteudoCartao")?.classList.remove("hidden");

//     document.querySelector(".midia-detalhes")?.classList.remove("hidden");

//     iniciarCartaoMidia();
//     return;
//   }

  // ===============================
  // 💎 VIP
  // ===============================
//   if (window.PAGAMENTO_TIPO_ATUAL === "vip") {
//     document.querySelector(".vip-detalhes")?.classList.remove("hidden");
//     mostrarMetodo("pix");
//     return;
//   }
// };

// window.fecharPopupPagamento = function () {
//   const popup = document.getElementById("popupPagamentoVelvet");
//   if (!popup) return;

//   popup.classList.add("hidden");

//   document.getElementById("pixLoading")?.classList.add("hidden");
//   document.getElementById("pixAguardando")?.classList.add("hidden");
//   document.getElementById("pixSucesso")?.classList.add("hidden");

//   document.getElementById("cartaoLoading")?.classList.add("hidden");
//   document.getElementById("formCartao")?.classList.add("hidden");
//   document.getElementById("cartaoSucesso")?.classList.add("hidden");
// };


//BTN DE UPLOAD
if (role !== "modelo" || !token) {
  btnUpload?.remove();
}

