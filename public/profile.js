// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const stripe = Stripe("pk_live_51SlJ2zJb9evIocfiAuPn5wzOJqWqn4e356uasq214hRTPsdQGawPec3iIcD43ufhBvjQYMLKmKRMKnjwmC88iIT1006lA5XqGE");
let elements;
window.__CLIENTE_VIP__ = false;

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}


function logout() {
  localStorage.clear();
  window.location.href = "/index.html";
}
const modo = role === "cliente" ? "publico" : "privado";

// ===============================
// ELEMENTOS DO PERFIL
// ===============================
let modelo_id = localStorage.getItem("modelo_id");

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
const inputMedia  = document.getElementById("inputMedia");
const listaMidias = document.getElementById("listaMidias");
const btnChat = document.getElementById("btnChat");
const btnVip  = document.getElementById("btnVip");
const btnSalvarBio = document.getElementById("btnSalvarBio");
const bioInput     = document.getElementById("bioInput");

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  aplicarRoleNoBody();
  iniciarPerfil();
  iniciarUploads();
  iniciarBioPopup();

  document.getElementById("fecharPagamento")
  ?.addEventListener("click", fecharPagamentoCartao);
});

// ===============================
// ROLE VISUAL
// ===============================
function aplicarRoleNoBody() {
  document.body.classList.remove("role-modelo", "role-cliente");
  if (role === "modelo") document.body.classList.add("role-modelo");
  if (role === "cliente") document.body.classList.add("role-cliente");
}

// ===============================
// PERFIL
// ===============================
function iniciarPerfil() {
  if (modo === "privado") {
    carregarPerfil();
    carregarFeed();
  }

  if (modo === "publico") {
    carregarPerfilPublico();
}
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
  const res = await fetch(`/api/modelo/publico/${modelo_id}`, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const modelo = await res.json();
  localStorage.setItem("modelo_id", modelo.id);
  modelo_id = modelo.id;

  aplicarPerfilNoDOM(modelo);

  // 🔐 VERIFICAR VIP
  const vipRes = await fetch(`/api/vip/status/${modelo_id}`, {
    headers: { Authorization: "Bearer " + token }
  });

  let isVip = false;

  if (vipRes.ok) {
    const vipData = await vipRes.json();
    if (vipData.vip) {
      isVip = true;

      if (btnVip) {
        btnVip.textContent = "VIP ativo";
        btnVip.disabled = true;
      }
    }
  }

  // ✅ 1️⃣ DEFINE VIP GLOBAL (ESSENCIAL)
  window.__CLIENTE_VIP__ = isVip;

  // ✅ 2️⃣ AGORA SIM carrega o feed
  carregarFeedPublico();
}


// ===============================
// CHAT
// ===============================
btnChat?.addEventListener("click", () => {
  localStorage.setItem("modelo_id", modelo_id);
  window.location.href = "/chatcliente.html";
});


// ===============================
// VIP
// ===============================
btnVip?.addEventListener("click", () => {
  if (!modelo_id) {
    alert("Modelo não identificada");
    return;
  }

  // 🔑 mesmo estado usado no chat
  window.pagamentoAtual = {
    tipo: "vip",
    valor: 0.10,
    modelo_id
  };

  // 🔓 abre o MESMO modal de escolha (Pix / Cartão)
  document
    .getElementById("escolhaPagamento")
    .classList.remove("hidden");
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
      feed.forEach(item => adicionarMidia(item.id, item.url));
    });
}

function carregarFeedPublico() {
  if (!listaMidias) return;

  fetch(`/api/modelo/${modelo_id}/feed`, {
    headers: { Authorization: "Bearer " + token }
  })
    .then(r => r.json())
    .then(data => {
      // 🔎 SUPORTE A QUALQUER FORMATO
      const feed = Array.isArray(data) ? data : data.feed || data.midias || [];

      listaMidias.innerHTML = "";

      feed.forEach(item => {
        adicionarMidia(item.id, item.url);
      });
    });
}

function fecharEscolha() {
  document
    .getElementById("escolhaPagamento")
    .classList.add("hidden");
}

async function pagarComCartao() {
  fecharEscolha();

  // 🔥 CÁLCULOS (IGUAL AO PIX)
  const valorBase = Number(pagamentoAtual.valor);
  const taxaTransacao  = valorBase * 0.10;
  const taxaPlataforma = valorBase * 0.05;
  const valorTotal = valorBase + taxaTransacao + taxaPlataforma;

  // 🧾 MOSTRA DETALHAMENTO
  document.getElementById("cartaoValorTotal").innerText =
    valorBRL(valorTotal);

  document.getElementById("cartaoValorBase").innerText =
    valorBRL(valorBase);

  document.getElementById("cartaoTaxaTransacao").innerText =
    valorBRL(taxaTransacao);

  document.getElementById("cartaoTaxaPlataforma").innerText =
    valorBRL(taxaPlataforma);

  // 🔓 ABRE MODAL
  document
    .getElementById("paymentModal")
    .classList.remove("hidden");

  const res = await fetch("/api/pagamento/vip/cartao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({
      valor: pagamentoAtual.valor,
      modelo_id: pagamentoAtual.modelo_id
    })
  });

  const { clientSecret } = await res.json();

  elements = stripe.elements({ clientSecret });
  const paymentElement = elements.create("payment");
  paymentElement.mount("#payment-element");
}


async function pagarComPix() {
  fecharEscolha();

  // 🔥 ABRE O POPUP
  document
    .getElementById("popupPix")
    .classList.remove("hidden");

  try {
    const res = await fetch("/api/pagamento/vip/pix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({
        valor: pagamentoAtual.valor,
        modelo_id: pagamentoAtual.modelo_id
      })
    });

    if (!res.ok) {
      throw new Error("Erro ao gerar Pix");
    }

    const data = await res.json();

    // 🔥 CÁLCULOS (IGUAL AO CONTEÚDO)
    const valorBase = Number(pagamentoAtual.valor);
    const taxaTransacao  = valorBase * 0.10;
    const taxaPlataforma = valorBase * 0.05;
    const valorTotal = valorBase + taxaTransacao + taxaPlataforma;

    // 🧾 MOSTRA DETALHAMENTO
    document.getElementById("pixValorTotal").innerText =
      valorBRL(valorTotal);

    document.getElementById("pixValorBase").innerText =
      valorBRL(valorBase);

    document.getElementById("pixTaxaTransacao").innerText =
      valorBRL(taxaTransacao);

    document.getElementById("pixTaxaPlataforma").innerText =
      valorBRL(taxaPlataforma);

    // 📸 QR CODE
    document.getElementById("pixQr").src =
      "data:image/png;base64," + data.qrCode;

    document.getElementById("pixCopia").value =
      data.copiaCola || "";

    iniciarVerificacaoVip();

  } catch (err) {
    alert("Erro ao gerar pagamento Pix");
    console.error(err);

    document
      .getElementById("popupPix")
      .classList.add("hidden");
  }

  iniciarVerificacaoVip();
}

async function ativarVipNoFront() {
  window.__CLIENTE_VIP__ = true;

  // 🔒 botão VIP
  if (btnVip) {
    btnVip.textContent = "VIP ativo 💜";
    btnVip.disabled = true;
  }

  // 🔓 fecha popups
  document.getElementById("popupPix")?.classList.add("hidden");
  document.getElementById("paymentModal")?.classList.add("hidden");
  document.getElementById("escolhaPagamento")?.classList.add("hidden");

  // 🔄 recarrega feed já liberado
  carregarFeedPublico();
  localStorage.setItem("vip_modelo_id", modelo_id);
}

let vipCheckInterval = null;

function iniciarVerificacaoVip() {
  if (vipCheckInterval) return;

  vipCheckInterval = setInterval(async () => {
    const res = await fetch(`/api/vip/status/${modelo_id}`, {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) return;

    const data = await res.json();

    if (data.vip) {
      clearInterval(vipCheckInterval);
      vipCheckInterval = null;
      ativarVipNoFront();
    }
  }, 4000); // a cada 4s
}




// ===============================
// BIO
// ===============================
function iniciarBioPopup() {
  const btnEditarBio = document.getElementById("btnEditarBio");
  const popupBio = document.getElementById("popupBio");
  const btnFecharPopup = document.getElementById("btnFecharPopup");

  if (!btnEditarBio || !popupBio) return;

  btnEditarBio.onclick = () => {
    bioInput.value = profileBio.textContent.trim();
    popupBio.classList.remove("hidden");
  };

  btnFecharPopup.onclick = () => popupBio.classList.add("hidden");
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
    }
  });

btnSalvarBio?.addEventListener("click", async () => {
  const bio = bioInput.value.trim();
  if (!bio) return;

  const res = await fetch("/api/modelo/bio", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ bio })
  });

  if (res.ok) {
    profileBio.textContent = bio;

    // ✅ FECHA O POPUP
    const popupBio = document.getElementById("popupBio");
    popupBio.classList.add("hidden");
  } else {
    alert("Erro ao salvar bio");
  }
});


// ===============================
// UPLOADS
// ===============================
function iniciarUploads() {
  inputMedia?.addEventListener("change", async () => {
    const file = inputMedia.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("midia", file);

    const res = await fetch("/uploadMidia", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: fd
    });

    const data = await res.json();
    if (data.url) carregarFeed();
  });
}

// ===============================
// MIDIA
// ===============================
function adicionarMidia(id, url) {
  const card = document.createElement("div");
  card.className = "midiaCard";

  const ext = url.split(".").pop().toLowerCase();
  const isVideo = ["mp4","webm","ogg"].includes(ext);

  const el = document.createElement(isVideo ? "video" : "img");
  el.src = url;
  el.className = "midiaThumb";
  if (isVideo) el.muted = true;

  // 🔒 BLOQUEIO PARA CLIENTE NÃO VIP
  if (role === "cliente" && !window.__CLIENTE_VIP__) {
    card.classList.add("bloqueada");

    card.addEventListener("click", () => {
      alert("🔒 Conteúdo exclusivo para membros VIP");
    });
  } else {
    el.addEventListener("click", () =>
      abrirModalMidia(url, isVideo)
    );
  }

  card.appendChild(el);
  if (role === "modelo") {
  const btnExcluir = document.createElement("button");
  btnExcluir.className = "btnExcluirMidia";
  btnExcluir.textContent = "Excluir";

  btnExcluir.onclick = () => excluirMidia(id, card);
  card.appendChild(btnExcluir);
}
  listaMidias.appendChild(card);
}


function abrirModalMidia(url, isVideo) {
  const modal = document.getElementById("modalMidia");
  const img = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  img.style.display = "none";
  video.style.display = "none";

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
document.getElementById("fecharModal")?.addEventListener("click", () => {
  const modal = document.getElementById("modalMidia");
  const video = document.getElementById("modalVideo");

  video.pause();
  video.src = "";
  modal.classList.add("hidden");
});
document.getElementById("fecharPix")?.addEventListener("click", () => {
  document.getElementById("popupPix").classList.add("hidden");
  window.pagamentoAtual = {};
});


async function excluirMidia(id, card) {
  if (!confirm("Excluir esta mídia?")) return;

  const res = await fetch(`/api/midias/${id}`, {

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
  nomeEl.textContent = modelo.nome;
  profileBio.textContent = modelo.bio || "";
  if (modelo.avatar) avatarImg.src = modelo.avatar;
  if (modelo.capa) capaImg.src = modelo.capa;
}

function fecharPopupPix() {
  document.getElementById("popupPix").classList.add("hidden");
}

function copiarPix() {
  const textarea = document.getElementById("pixCopia");
  textarea.select();
  textarea.setSelectionRange(0, 99999);
  document.execCommand("copy");
  alert("Código Pix copiado!");
}

function fecharPagamentoCartao() {
  const modal = document.getElementById("paymentModal");
  if (!modal) return;

  modal.classList.add("hidden");

  // limpa Stripe Elements (evita bug ao reabrir)
  const container = document.getElementById("payment-element");
  if (container) container.innerHTML = "";

  elements = null;
  window.pagamentoAtual = {};
}


