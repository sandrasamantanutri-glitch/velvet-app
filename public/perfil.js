// ===============================
// AUTH GUARD
// ===============================

const stripe = Stripe("pk_live_51Spb5lRtYLPrY4c3L6pxRlmkDK6E0OSU93T5B75V4pY39rJ3FVyPEa6ZDDgqUiY1XCCEay6uQcItbZY4EcAOkoJn00TtsQ8bbz");
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
  window.location.href = "#######################################";
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
  window.location.href = "/index.html";
}

// 🔒 Guard APENAS para perfil público
if (modo === "publico" && (!modelo_id || modelo_id === "undefined")) {
  alert("Modelo não identificada.");
  window.location.href = "/clientHome.html";
  throw new Error("modelo_id ausente no perfil público");
}

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  aplicarRoleNoBody();
  iniciarPerfil();
  iniciarUploads();
  iniciarBioPopup();

  document.getElementById("btnVipPix")?.addEventListener("click", () => {
  fecharEscolha();
  abrirPopupPix(); // sua função existente
  });

 document.getElementById("fecharPix")?.addEventListener("click", () => {
 document.getElementById("popupPix")?.classList.add("hidden");
 });

 document.getElementById("btnVipCartao")?.addEventListener("click", () => {
 fecharEscolha();
 pagarComCartao(); // sua função Stripe
 });

  // btnChat?.addEventListener("click", () => {
  // if (!role) {
  //   abrirPopupVelvet({ tipo: "login" });
  //   return;
  // }
  // if (!window.__CLIENTE_VIP__) {
  //   abrirPopupVelvet({ tipo: "vip" });
  //   return;
  // }
  // window.location.href = "/chatcliente.html";

// });
const modalMidia = document.getElementById("modalMidia");
const fecharModal = document.getElementById("fecharModal");
const modalVideo = document.getElementById("modalVideo");

fecharModal?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (modalVideo) {
    modalVideo.pause();
    modalVideo.src = "";
  }

  modalMidia.classList.add("hidden");
  });

  const btnUpload = document.querySelector(".btn-upload");
  const inputUpload = document.getElementById("inputUpload");

  if (!btnUpload || !inputUpload) return;

  btnUpload.addEventListener("click", (e) => {
    e.preventDefault(); // 🚫 impede reload
    inputUpload.click(); // abre seletor
  });

  inputUpload.addEventListener("change", () => {
    const file = inputUpload.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    abrirPreviewUpload(file, url);
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

function aplicarPerfilNoDOM(modelo) {
  const nomeEl = document.getElementById("perfil-nome");
  const profileBio = document.getElementById("perfil-bio");
  const avatarImg = document.getElementById("perfil-avatar");
  const capaImg = document.getElementById("perfil-capa");
  const localEl = document.querySelector(".local-icons");
  const textoLocal = document.getElementById("local-texto");

  nomeEl.textContent = modelo.nome || "";
  profileBio.textContent = modelo.bio || "";

  // 🔥 SUPORTA PERFIL PRIVADO E PÚBLICO
  avatarImg.src =
    modelo.avatar_url ||
    modelo.avatar ||
    "/assets/avatar.png";

  capaImg.src =
    modelo.capa_url ||
    modelo.capa ||
    "/assets/capa.png";

  if (modelo.cidade && modelo.estado) {
    textoLocal.textContent = `${modelo.cidade} - ${modelo.estado}`;
    localEl.style.display = "flex";
  } else {
    localEl.style.display = "none";
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
const gridFree = document.getElementById("midias-free");
const gridPaid = document.getElementById("midias-paid");
const tabs = document.querySelectorAll(".midias-tabs .tab");

function carregarConteudos(tipoConteudo) {
  if (!userId) return;
  const grid = tipoConteudo === "feed" ? gridFree : gridPaid;
  grid.innerHTML = "";

  fetch(`/conteudos/${userId}?aba=${tipoConteudo}`)
    .then(res => res.json())
    .then(conteudos => {
      conteudos.forEach(c => {
        const card = document.createElement("div");
        card.className = "midia-card";

        const isVideo = c.tipo === "video";
        const thumb = isVideo ? c.thumb : c.url;

  if (c.tipo_conteudo === "venda") {
  card.innerHTML = `
    <div class="thumb-wrapper especial">
      <button class="btn-delete" title="Excluir">✕</button>

      <img src="${thumb}" loading="lazy" class="midia-thumb">

      <span class="lock">🔒</span>

      <div class="especial-preco-overlay">
        R$ ${Number(c.preco || 0).toFixed(2)}
      </div>
    </div>

    <div class="midia-descricao">
      ${c.descricao || "Conteúdo exclusivo"}
    </div>
  `;

  card.onclick = () => abrirModalVenda(c);
 }
 else {
  card.innerHTML = `
  <div class="thumb-wrapper">
  <button class="btn-delete" title="Excluir">✕</button>
          <img src="${thumb}" loading="lazy" class="midia-thumb">
          ${isVideo ? '<span class="play">▶</span>' : ''}
          </div>
          ${c.descricao ? `
            <div class="midia-descricao">
            ${c.descricao}
            </div>
            ` : ""}
            `;
            card.onclick = () => abrirConteudo(c);
          }


        const btnDelete = card.querySelector(".btn-delete");
        btnDelete.onclick = (e) => {
          e.stopPropagation();
          excluirMidia(c.id);
        };

        grid.appendChild(card);
      });
    })
    .catch(err => {
      console.error("Erro ao carregar conteúdos:", err);
    });
}

function abrirModalVenda(c) {
  const modal = document.createElement("div");
  modal.className = "modal-midia";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>

    <div class="modal-conteudo venda-modal">
      <img src="${c.thumb}" class="midia-thumb">

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

async function gerarThumbnailVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.addEventListener("loadeddata", () => {
      video.currentTime = 1;
    });

    video.addEventListener("seeked", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      canvas.toBlob(blob => {
        resolve(blob);
        URL.revokeObjectURL(video.src);
      }, "image/jpeg", 0.85);
    });

    video.addEventListener("error", reject);
  });
}

async function gerarThumbnailImagem(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      const size = 300;
      canvas.width = size;
      canvas.height = size;

      const scale = Math.max(
        size / img.width,
        size / img.height
      );

      const w = img.width * scale;
      const h = img.height * scale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;

      ctx.drawImage(img, x, y, w, h);

      canvas.toBlob(
        blob => resolve(blob),
        "image/jpeg",
        0.7
      );
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function abrirConteudo(c) {
  const modal = document.createElement("div");
  modal.className = "modal-midia";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-conteudo">
      ${ c.tipo === "video" ? `<video src="${c.url}" autoplay muted loop controls playsinline preload="metadata"></video>
          `
          : `<img src="${c.url}" alt="Conteúdo">
          `
      }
    </div>
  `;

  // fecha SOMENTE clicando fora do conteúdo
  modal.querySelector(".modal-backdrop").addEventListener("click", () => {
    modal.remove();
  });

  // impede clique dentro de fechar o modal
  modal.querySelector(".modal-conteudo").addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.body.appendChild(modal);
}


tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    // ativa visual da aba
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    // mostra/esconde grids
    document.querySelectorAll(".midias-grid").forEach(g => g.classList.remove("active"));

    if (tab.dataset.tab === "free") {
      gridFree.classList.add("active");
      carregarConteudos("feed");
    } else {
      gridPaid.classList.add("active");
      carregarConteudos("venda");
    }
  });
});

async function excluirMidia(id) {
  const confirmar = confirm("Tem certeza que deseja excluir esta mídia?");
  if (!confirmar) return;

  try {
    const res = await fetch(`/conteudos/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      throw new Error("Erro ao excluir");
    }

    // 🔄 atualiza grid após excluir
    const abaAtiva = document.querySelector(".midias-tabs .tab.active");
    if (abaAtiva?.dataset.tab === "paid") {
      carregarConteudos("venda");
    } else {
      carregarConteudos("feed");
    }

  } catch (err) {
    console.error(err);
    alert("Erro ao excluir mídia");
  }
}

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

    await enviarMidia(file, {
        tipo_conteudo: tipoConteudo,
        preco,
        descricao
    });

    const abaAtiva = document.querySelector(".midias-tabs .tab.active");
     carregarConteudos(
        abaAtiva?.dataset.tab === "paid" ? "venda" : "feed"
      );
      
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

async function enviarMidia(file, dados = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("user_id", userId);

  if (dados.tipo_conteudo) {
    formData.append("tipo_conteudo", dados.tipo_conteudo);
  }

  if (dados.tipo_conteudo === "venda") {
    formData.append("preco", dados.preco || 0);
    formData.append("descricao", dados.descricao || "");
  }

  const res = await fetch("/upload", {
    method: "POST",
    body: formData
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "Erro no upload");
  }

  return JSON.parse(text);
}



