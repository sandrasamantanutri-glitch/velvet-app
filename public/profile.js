window.socket = io();
const tokenAtual = localStorage.getItem("token");
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

window.__CLIENTE_VIP__ = false;

let modo = "publico";
let user_id = null;

// VISUALIZACAO MEU PERFIL
if (tokenAtual && !modeloParam) {
  modo = "privado";
}


// PERFIL PÚBLICO PARAM=ID NA URL
if (modeloParam) {
  user_id = Number(modeloParam);
}

// ASSINATURAS/OFERTAS ///////
const ofertaCard = document.getElementById("oferta-card");
const btnAssinar = document.getElementById("btn-assinar");

if (btnAssinar) {
  btnAssinar.disabled = true;
}

function autenticarSocket() {
  const tokenAtual = localStorage.getItem("token");
  if (!tokenAtual || !window.socket) return;

  window.socket.emit("auth", { token: tokenAtual });

  const role = localStorage.getItem("role");
  if (role === "cliente") {
    window.socket.emit("loginCliente");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  autenticarSocket();
});


/////PERFIL ///
const btnUpload = document.querySelector(".btn-mais");
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
    const conteudo_id = window.MIDIA_VENDA_ATUAL?.conteudo_id;
if (!conteudo_id) return;

const tokenAtual = localStorage.getItem("token");
if (!tokenAtual) return;

const res = await fetch(
  `/api/conteudo/liberado/${conteudo_id}`,
  {
    headers: {
      Authorization: "Bearer " + tokenAtual
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
function exigirCadastro(motivo = "Para continuar, crie sua conta") {
  console.log("🔥 exigirCadastro chamado");
  window.AUTH_MENSAGEM = motivo;
  openAgeGate("register");
}

function exigirLogin() {
  console.error("openAgeGate não carregado");
  openAgeGate("login");
}


//PERFIL ///
async function carregarPerfilBase() {
  try {
    const tokenAtual = localStorage.getItem("token");

    // ===============================
    // 🔐 PERFIL PRIVADO (dona logada)
    // ===============================
    if (modo === "privado") {

      if (!tokenAtual) {
        throw new Error("Token não encontrado para perfil privado");
      }

      const res = await fetch("/api/modelo/me", {
        headers: {
          Authorization: "Bearer " + tokenAtual
        }
      });

      if (!res.ok) {
        throw new Error("Perfil privado não encontrado");
      }

      const perfil = await res.json();

      user_id = Number(perfil.user_id);
      window.MODELO_ID_ATUAL = Number(perfil.modelo_id);

      aplicarPerfilNoDOM(perfil);
      return;
    }

    // ===============================
    // 🌍 PERFIL PÚBLICO
    // ===============================
    if (!user_id || isNaN(Number(user_id))) {
      console.warn("user_id inválido:", user_id);
      return;
    }

    const res = await fetch(`/api/modelo/publico/${user_id}`);
    if (!res.ok) {
      throw new Error("Perfil público não encontrado");
    }

    const modelo = await res.json();

    user_id = Number(modelo.user_id);
    window.MODELO_ID_ATUAL = Number(modelo.id);

    aplicarPerfilNoDOM(modelo);

  } catch (err) {
    console.error("Erro ao carregar perfil base:", err);
  }
}


async function carregarFeedBase() {

  if (!listaMidias || !user_id) return;

  const tokenAtual = localStorage.getItem("token");

  const res = await fetch(`/api/modelo/publico/${user_id}/feed`, {
    headers: tokenAtual
      ? { Authorization: "Bearer " + tokenAtual }
      : {}
  });
  if (!res.ok) {
    console.error("Erro ao carregar feed");
    return;
  }

  const feed = await res.json();
  console.log("FEED RECEBIDO:", feed);

  if (!Array.isArray(feed)) {
    console.warn("Feed inválido:", feed);
    return;
  }

  const gridFeed = document.getElementById("listaMidias");
  const gridEspecial = document.getElementById("midias-paid");

  if (gridFeed) gridFeed.innerHTML = "";
  if (gridEspecial) gridEspecial.innerHTML = "";

  const ehDona =
    role === "modelo" &&
    modo === "privado";

  const ehVip =
    window.__CLIENTE_VIP__ === true;

  feed.forEach(conteudo => {

    if (
      conteudo.tipo_conteudo === "venda" &&
      (!conteudo.preco || Number(conteudo.preco) <= 0)
    ) {
      return;
    }
console.log("FEED RECEBIDO:", feed);
    adicionarMidia(conteudo, {
      ehDona,
      ehVip
    });

  });

}
function adicionarMidia(conteudo, contexto) {

  const { ehDona, ehVip } = contexto;

  const {
    id,
    url,
    tipo,
    tipo_conteudo,
    thumbnail_url,
    preco,
    descricao
  } = conteudo;

  const isVenda = tipo_conteudo === "venda";
  const isVideo = tipo === "video";

  const card = document.createElement("div");
  card.className = "midiaCard";

  // ===============================
  // 🎨 WRAPPER VISUAL
  // ===============================

  const mediaWrapper = document.createElement("div");
  mediaWrapper.className = "midiaWrapper";

  const img = document.createElement("img");
  img.className = "midiaThumb";
  img.src = isVideo
    ? getVideoThumbnail(url, thumbnail_url)
    : url;

  img.onerror = () => {
    img.src = "/assets/capa.png";
  };

  mediaWrapper.appendChild(img);

  // PREÇO (SÓ ESPECIAL)
  if (isVenda && preco) {
    const priceTag = document.createElement("div");
    priceTag.className = "midia-preco";
    priceTag.textContent = `R$ ${Number(preco).toFixed(2)}`;
    mediaWrapper.appendChild(priceTag);
  }

  card.appendChild(mediaWrapper);

  // DESCRIÇÃO (SÓ ESPECIAL)
  if (isVenda && descricao) {
    const desc = document.createElement("div");
    desc.className = "midia-descricao";
    desc.textContent = descricao;
    card.appendChild(desc);
  }

  // ===============================
  // 🔒 DEFINIR BLOQUEIO
  // ===============================

  let bloqueado = false;

  if (!ehDona) {
    if (isVenda) bloqueado = true;
    if (!isVenda && !ehVip) bloqueado = true;
  }

  if (bloqueado) {
    card.classList.add("locked");
  }

  // ===============================
  // 🔥 BOTÃO EXCLUIR (SÓ DONA)
  // ===============================

  if (ehDona) {
    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btnExcluirMidia";
    btnExcluir.textContent = "✕";

    btnExcluir.onclick = (e) => {
      e.stopPropagation();
      excluirMidia(id, card);
    };

    card.appendChild(btnExcluir);
  }

  // ===============================
  // 🖱️ COMPORTAMENTO DE CLIQUE
  // ===============================

  card.onclick = () => {

    if (ehDona) {
      abrirModalMidia(url, isVideo);
      return;
    }

    if (isVenda) {
      abrirPopupPagamentoVenda(conteudo);
      return;
    }

    if (!ehVip) {
      abrirFluxoVIP();
      return;
    }

    abrirModalMidia(url, isVideo);
  };

  // ===============================
  // 📦 GRID DESTINO
  // ===============================

  const gridDestino =
    isVenda
      ? document.getElementById("midias-paid")
      : document.getElementById("listaMidias");

  gridDestino?.appendChild(card);
}


async function aplicarRegrasDeAcesso() {

  const tokenAtual = localStorage.getItem("token");

  // Estado padrão
  window.__CLIENTE_VIP__ = false;

  const ehModelo = role === "modelo";
  const ehCliente = role === "cliente";
  const ehDona = ehModelo && modo === "privado";

  // ===============================
  // 🟣 MODELO DONA DO PERFIL
  // ===============================
  if (ehDona) {

    window.__CLIENTE_VIP__ = false;

    if (ofertaCard) ofertaCard.style.display = "block";

    if (btnAssinar) {
      btnAssinar.disabled = true;
      btnAssinar.style.cursor = "not-allowed";
      btnAssinar.textContent = "Seu perfil";
    }

    return;
  }

  // ===============================
  // 👀 VISITANTE
  // ===============================
  if (!tokenAtual) {
    if (ofertaCard) ofertaCard.style.display = "block";
    return;
  }

  // ===============================
  // 🔵 CLIENTE OU MODELO (vendo outro perfil)
  // ===============================
  if (ehCliente || (ehModelo && modo === "publico")) {

    try {
      const res = await fetch(`/api/vip/status/${MODELO_ID_ATUAL}`, {
        headers: {
          Authorization: "Bearer " + tokenAtual
        }
      });

      const { vip } = res.ok ? await res.json() : { vip: false };

      if (vip) {

        window.__CLIENTE_VIP__ = true;

        if (btnAssinar) {
          btnAssinar.disabled = true;
          btnAssinar.textContent = "VIP ativo 💜";
        }

        if (ofertaCard) {
          ofertaCard.style.display = "none";
        }

      } else {

        window.__CLIENTE_VIP__ = false;

        if (btnAssinar) {
          btnAssinar.disabled = false;
          btnAssinar.textContent = "Assinar VIP";
        }

        if (ofertaCard) {
          ofertaCard.style.display = "block";
        }

      }

    } catch (err) {
      console.error("Erro ao verificar VIP:", err);

      window.__CLIENTE_VIP__ = false;

      if (ofertaCard) {
        ofertaCard.style.display = "block";
      }
    }

  }
}

//////////////////////////////////////////////////////

async function iniciarPerfil() {

  try {

    // ===============================
    // 1️⃣ CARREGAR PERFIL BASE
    // ===============================

    await carregarPerfilBase();

    if (!user_id || !window.MODELO_ID_ATUAL) {
      throw new Error("IDs do perfil não definidos corretamente");
    }

    // ===============================
    // 2️⃣ APLICAR REGRAS DE ACESSO
    // ===============================

    await aplicarRegrasDeAcesso();

    // ===============================
    // 3️⃣ CARREGAR OFERTA
    // ===============================

    await carregarOfertaAtiva();

    // ===============================
    // 4️⃣ CARREGAR FEED
    // ===============================

    await carregarFeedBase();

  } catch (err) {

    console.error("🔥 ERRO AO INICIAR PERFIL 🔥");
    console.error(err);

    // fallback visual mínimo
    if (document.getElementById("listaMidias")) {
      document.getElementById("listaMidias").innerHTML =
        "<p style='padding:20px;text-align:center;'>Erro ao carregar perfil.</p>";
    }

  }

}


function aplicarPerfilNoDOM(modelo) {

  if (nomeEl)
    nomeEl.textContent = modelo.nome_exibicao || "";

  if (profileBio)
    profileBio.textContent = modelo.bio || "";

  if (avatarImg)
    avatarImg.src = modelo.avatar || "/assets/avatar.png";

  if (capaImg)
    capaImg.src = modelo.capa || "/assets/capa.png";

  const localEl = document.getElementById("local-texto");

  if (localEl && localEl.parentElement) {
    const local = [modelo.local]
      .filter(Boolean)
      .join(" • ");

    localEl.textContent = local || "";
    localEl.parentElement.style.display = local ? "" : "none";
  }

  // ===============================
  // 🌐 REDES SOCIAIS
  // ===============================

  const igLink = document.getElementById("link-instagram");
  const ttLink = document.getElementById("link-tiktok");

  // Instagram
  if (igLink) {
    const igUser = modelo.instagram?.replace("@", "");
    if (igUser) {
      igLink.href = `https://instagram.com/${igUser}`;
      igLink.style.display = "inline-block";
    } else {
      igLink.style.display = "none";
    }
  }

  // TikTok
  if (ttLink) {
    const ttUser = modelo.tiktok?.replace("@", "");
    if (ttUser) {
      ttLink.href = `https://www.tiktok.com/@${ttUser}`;
      ttLink.style.display = "inline-block";
    } else {
      ttLink.style.display = "none";
    }
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

  if (role !== "modelo" || !tokenAtual) {
    btnUpload?.remove();
  }

  // ===============================
  // 🔄 PÓS-REGISTRO
  // ===============================

  const postRegisterAction = localStorage.getItem("post_register_action");

  if (postRegisterAction === "open_payment") {
    localStorage.removeItem("post_register_action");
    window.abrirFluxoVIP();
  }

  // ===============================
  // 🎯 BOTÃO ASSINAR
  // ===============================

  // ===============================
// 🎯 BOTÃO ASSINAR
// ===============================

btnAssinar?.addEventListener("click", () => {

  const tokenAtual = localStorage.getItem("token");

  if (!tokenAtual) {
    abrirPopupLoginObrigatorio();
    return;
  }

  window.abrirFluxoVIP();
});


// ===============================
// 🔗 LINKS VIP DINÂMICOS
// ===============================

document.addEventListener("click", (e) => {

  const linkVip = e.target.closest(".link-assinar-vip");
  if (!linkVip) return;

  e.preventDefault();

  const tokenAtual = localStorage.getItem("token");

  if (!tokenAtual) {
    abrirPopupLoginObrigatorio();
    return;
  }

  window.abrirFluxoVIP();
});

  // ===============================
  // 🗂 TABS DE MÍDIA
  // ===============================

  const tabs = document.querySelectorAll(".midias-tabs .tab");

  tabs.forEach(tab => {

    tab.addEventListener("click", () => {

      tabs.forEach(t => t.classList.remove("active"));

      document
        .querySelectorAll(".midias-grid")
        .forEach(g => g.classList.remove("active"));

      tab.classList.add("active");

      const tipo = tab.dataset.tab;

      if (tipo === "free") {
        document.getElementById("listaMidias")
          ?.classList.add("active");
      }

      if (tipo === "paid") {
        document.getElementById("midias-paid")
          ?.classList.add("active");
      }

    });

  });

});

// ===============================
// ROLE VISUAL
// ===============================
function aplicarRoleNoBody() {
  const body = document.body;
  body.classList.remove("role-modelo", "role-cliente", "role-publico");

  const roleClass = role === "modelo"
    ? "role-modelo"
    : role === "cliente"
      ? "role-cliente"
      : "role-publico";

  body.classList.add(roleClass);
}

function valorBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}


let OFERTA_ATUAL = null;
async function carregarOfertaAtiva() {
  console.log("🧪 carregarOfertaAtiva chamado com user_id =", user_id);
  if (!user_id || isNaN(Number(user_id))) {
    console.warn("⏳ Oferta aguardando user_id válido");
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
    const res = await fetch(`/api/ofertas/ativa/${user_id}`);

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
  modelo_id: oferta.modelo_id,   // 🔥 ADICIONE ISSO
  valor_base: Number(oferta.valor_base),
  valor_promocional: Number(oferta.valor_promocional),
  desconto_percentual: Number(oferta.desconto_percentual || 0)
};

    window.OFERTA_ATUAL = OFERTA_ATUAL;
    
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

// ===============================
// 🖼 UPLOAD AVATAR
// ===============================

inputAvatar?.addEventListener("change", async () => {

  const file = inputAvatar.files?.[0];
  if (!file) return;

  const tokenAtual = localStorage.getItem("token");
  if (!tokenAtual) {
    abrirPopupLoginObrigatorio();
    return;
  }

  const fd = new FormData();
  fd.append("avatar", file);

  try {
    const res = await fetch("/uploadAvatar", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + tokenAtual
      },
      body: fd
    });

    const data = await res.json();

    if (data.url && avatarImg) {
      avatarImg.src = data.url;
    } else {
      alert("Erro ao atualizar avatar");
    }

  } catch (err) {
    console.error("Erro upload avatar:", err);
    alert("Erro ao enviar avatar");
  }

});


// ===============================
// 🖼 UPLOAD CAPA
// ===============================

inputCapa?.addEventListener("change", async () => {

  const file = inputCapa.files?.[0];
  if (!file) return;

  const tokenAtual = localStorage.getItem("token");
  if (!tokenAtual) {
    abrirPopupLoginObrigatorio();
    return;
  }

  const fd = new FormData();
  fd.append("capa", file);

  try {
    const res = await fetch("/uploadCapa", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + tokenAtual
      },
      body: fd
    });

    const data = await res.json();

    if (data.url && capaImg) {
      capaImg.src = data.url;
    } else {
      alert("Erro ao atualizar capa");
    }

  } catch (err) {
    console.error("Erro upload capa:", err);
    alert("Erro ao enviar capa");
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

function abrirPopupLoginObrigatorio() {

  const modal = document.createElement("div");
  modal.className = "modal-login-obrigatorio";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-box-login">
      <h3>🔒 Acesso necessário</h3>
      <p>É necessário estar logado para esta ação.</p>

      <div class="login-acoes">
        <button class="btn-login">Ja tenho conta</button>
        <button class="btn-register">Não tenho conta</button>
      </div>
    </div>
  `;

  modal.querySelector(".modal-backdrop").onclick = () => modal.remove();

  modal.querySelector(".btn-login").onclick = () => {
    console.log("CLIQUE LOGIN");
    modal.remove();
    openAgeGate("login");
  };

  modal.querySelector(".btn-register").onclick = () => {
    modal.remove();
    openAgeGate("register");
  };

  document.body.appendChild(modal);
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

modal.querySelector(".modal-close-upload")
  ?.addEventListener("click", (e) => {
    e.stopPropagation();
    fecharModal();
  });


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

  const tokenAtual = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  console.log("Token existe?", !!tokenAtual);
  console.log("Role:", role);
  console.log("File recebido:", file);

  if (!file) {
    throw new Error("Arquivo não recebido");
  }

  if (!tokenAtual || role !== "modelo") {
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
      Authorization: "Bearer " + tokenAtual
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


function getVideoThumbnail(url, thumbnail_url) {
  if (thumbnail_url) return thumbnail_url;
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

window.abrirFluxoVIP = function () {
  fecharPopupPagamento?.();
  document.getElementById("modalMidia")?.classList.add("hidden");
  
  const role = localStorage.getItem("role");

  if (!role) {
    exigirCadastro(
      "Crie sua conta para assinar o perfil e acessar tudo 💜"
    );
    return;
  }

  if (!window.OFERTA_ATUAL || !window.OFERTA_ATUAL.modelo_id) {
    alert("Oferta VIP ainda não carregada. Aguarde um instante.");
    return;
  }

  window.PAGAMENTO_TIPO_ATUAL = "vip";
  window.MODELO_ID_ATUAL = window.OFERTA_ATUAL.modelo_id;

  preencherResumoVIP({
    valorBase: window.OFERTA_ATUAL.valor_base,
    desconto:
      window.OFERTA_ATUAL.valor_base -
      window.OFERTA_ATUAL.valor_promocional
  });

  abrirPopupPagamento();
};


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

  const tokenAtual = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!tokenAtual || role !== "modelo") {
    alert("Ação não autorizada");
    return;
  }

  const res = await fetch(`/api/conteudos/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + tokenAtual
    }
  });

  if (res.ok) {
    card?.remove();
  } else {
    alert("Erro ao excluir mídia");
  }
}

function atualizarUIVip() {
  if (btnAssinar) {
    btnAssinar.textContent = "VIP ativo 💜";
    btnAssinar.disabled = true;
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
//       Authorization: "Bearer " + tokenAtual
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



