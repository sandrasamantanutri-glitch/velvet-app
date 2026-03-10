const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

let modelo_id = null;
let EH_DONA = false;

  const btnAssinar = document.getElementById("btn-assinar");

document.addEventListener("DOMContentLoaded", async () => {

  // =========================
  // PARAMETROS URL
  // =========================

  const params = new URLSearchParams(window.location.search);
  modelo_id = Number(params.get("modelo_id") || params.get("id"));

  if (!modelo_id) {
    console.warn("modelo_id não encontrado na URL");
    return;
  }

  // =========================
  // VERIFICAR SE É DONA
  // =========================

  const modeloLogado = Number(localStorage.getItem("modelo_id"));
  EH_DONA = role === "modelo" && modeloLogado === modelo_id;

  if (!EH_DONA) {
    document.getElementById("btn-upload")?.remove();
  }

btnAssinar?.addEventListener("click", () => {

   if (EH_DONA) {
    return;
   }

  // 👀 VISITANTE
const tokenAtual = localStorage.getItem("token");
if (!tokenAtual) {
  abrirPopupLoginObrigatorio();
  return;
}

  const role = localStorage.getItem("role");
  const modeloLogado = Number(localStorage.getItem("modelo_id"));

  // 🚫 MODELO tentando assinar outra modelo
  if (role === "modelo" && modeloLogado !== modelo_id) {
    alert("No momento, modelo não pode assinar ou ver conteúdo exclusivo de outra modelo. Estamos trabalhando para que isso seja possível!!💜");
    return;
  }

  // 💎 JÁ VIP
  if (window.__CLIENTE_VIP__) {
    window.location.href = `/chatc.html?modelo_id=${modelo_id}`;
    return;
  }

  // 💳 ABRIR PAGAMENTO
  window.abrirFluxoVIP();

});

await carregarPerfil();
await carregarOfertaAtiva();
await aplicarRegrasDeAcesso();
await carregarFeed();
await carregarPremium();




const btnEnviarFeed = document.getElementById("btnEnviarFeed");

btnEnviarFeed?.addEventListener("click", async () => {

  const file = fileInput.files[0];

  if (!file) {
    alert("Selecione uma mídia");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("tipo_conteudo", "feed");

  try {

    const res = await fetch("/api/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao enviar");
      return;
    }

    alert("Post publicado!");

    document.getElementById("popupUploadFeed").classList.add("hidden");

    fileInput.value = "";
    preview.innerHTML = "";

    carregarFeed(); // recarrega o feed

  } catch (err) {
    console.error(err);
    alert("Erro no upload");
  }

    document.getElementById("uploadClose")?.addEventListener("click", () => {
    document.getElementById("popupUploadFeed").classList.add("hidden");
  });

  document.getElementById("uploadBackdrop")?.addEventListener("click", () => {
    document.getElementById("popupUploadFeed").classList.add("hidden");
  });

});

const filePremium = document.getElementById("filePremium");
const previewPremium = document.getElementById("previewPremium");

document.getElementById("uploadAreaPremium")
?.addEventListener("click", () => {
  filePremium.click();
});

filePremium?.addEventListener("change", () => {

  const file = filePremium.files[0];
  if(!file) return;

  const url = URL.createObjectURL(file);

  previewPremium.innerHTML =
    file.type.startsWith("video")
      ? `<video src="${url}" controls></video>`
      : `<img src="${url}">`;

});

document.getElementById("btnEnviarPremium")
?.addEventListener("click", async () => {

  const file = filePremium.files[0];
  const descricao = document.getElementById("premiumTexto").value;
  const preco = document.getElementById("premiumPreco").value;

  if(!file){
    alert("Selecione uma mídia");
    return;
  }

  if(!preco){
    alert("Informe o preço");
    return;
  }

  const form = new FormData();
  form.append("file", file);
  form.append("descricao", descricao);
  form.append("preco", preco);

  const res = await fetch("/api/conteudos", {
    method:"POST",
    headers:{
      Authorization:"Bearer " + token
    },
    body:form
  });

  if(!res.ok){
    alert("Erro ao publicar");
    return;
  }

  document.getElementById("popupUploadPremium")
    .classList.add("hidden");

  filePremium.value = "";
  previewPremium.innerHTML = "";

  carregarPremium();

});

// ===============================
// TABS FEED / PREMIUM
// ===============================

const tabs = document.querySelectorAll(".midias-tabs .tab");
const feedGrid = document.getElementById("listaMidias");
const premiumGrid = document.getElementById("midias-paid");

tabs.forEach(tab => {

  tab.addEventListener("click", () => {

    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    const tipo = tab.dataset.tab;

    if (tipo === "free") {
      feedGrid.classList.add("active");
      premiumGrid.classList.remove("active");
    }

    if (tipo === "paid") {
      premiumGrid.classList.add("active");
      feedGrid.classList.remove("active");
    }

  });

});



});


async function carregarPerfil(){

  try{

    const res = await fetch(`/api/modelo/publico/${modelo_id}`);

    if(!res.ok) return;

    const modelo = await res.json();

    document.getElementById("profileName").textContent =
      modelo.nome_exibicao || "";

    document.getElementById("profileBio").textContent =
      modelo.bio || "";

      const avatar = document.getElementById("profileAvatar");
const capa = document.getElementById("profileCapa");

if (avatar) {
  avatar.src = modelo.avatar || "/assets/avatar.png";
  avatar.onerror = () => avatar.src = "/assets/avatar.png";
}

if (capa) {
  capa.src = modelo.capa || "/assets/capa.png";
  capa.onerror = () => capa.src = "/assets/capa.png";
}

    const localEl = document.getElementById("local-texto");

    if(localEl){
      localEl.textContent = modelo.local || "";
    }

    const ig = document.getElementById("link-instagram");
    const tt = document.getElementById("link-tiktok");

    if(modelo.instagram){
      ig.href = "https://instagram.com/" + modelo.instagram.replace("@","");
      ig.style.display = "inline-block";
    }else{
      ig.style.display = "none";
    }

    if(modelo.tiktok){
      tt.href = "https://tiktok.com/@" + modelo.tiktok.replace("@","");
      tt.style.display = "inline-block";
    }else{
      tt.style.display = "none";
    }

  }catch(e){
    console.error("erro perfil",e);
  }

}

function abrirMidia(item){

  const modal = document.getElementById("modalMidia");
  const img = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  img.style.display = "none";
  video.style.display = "none";

  const url = item.url || "";

  const ehVideo =
    url.includes(".mp4") ||
    url.includes(".webm") ||
    url.includes(".mov");

  if(ehVideo){

    video.src = url;
    video.style.display = "block";

    video.currentTime = 0;
    video.play().catch(()=>{});

  }else{

    img.src = url;
    img.style.display = "block";

  }

  modal.classList.remove("hidden");
}


function valorBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

async function aplicarRegrasDeAcesso() {
  const ofertaCard = document.getElementById("oferta-card");

  const tokenAtual = localStorage.getItem("token");

  // Estado padrão
  window.__CLIENTE_VIP__ = false;

  const ehModelo = role === "modelo";
  const ehCliente = role === "cliente";

  // ⚠️ DONA DO PERFIL
  const modeloLogado = Number(localStorage.getItem("modelo_id"));
  const ehDona = ehModelo && modeloLogado === modelo_id;

  // ===============================
  // 🟣 MODELO DONA DO PERFIL
  if (ehDona) {

    window.__CLIENTE_VIP__ = false;

    if (ofertaCard) ofertaCard.style.display = "block";

    if (btnAssinar) {
      btnAssinar.disabled = false;
      btnAssinar.style.cursor = "not-allowed";
      btnAssinar.textContent =
    `Assinar VIP por ${valorBRL(window.OFERTA_ATUAL.valor_promocional)}`;
    }

    return;
  }

  // ===============================
  // 👀 VISITANTE
  if (!tokenAtual) {
    if (ofertaCard) ofertaCard.style.display = "block";
    return;
  }

  // ===============================
  // 🔵 CLIENTE OU MODELO vendo outro perfil
if (ehCliente || ehModelo) {

  try {

    const res = await fetch(`/api/vip/status/${modelo_id}`, {
      headers: {
        Authorization: "Bearer " + tokenAtual
      }
    });

    const data = res.ok ? await res.json() : { vip: false };
    const vip = data.vip;

    const vipCard = document.getElementById("vip-card");
    const ofertaCard = document.getElementById("oferta-card");

    if (vip) {

      window.__CLIENTE_VIP__ = true;

      // 🔥 Esconde oferta normal
      if (ofertaCard) ofertaCard.style.display = "none";

      // 🔥 Mostra card exclusivo VIP
      if (vipCard) vipCard.classList.remove("hidden");

    } else {

      window.__CLIENTE_VIP__ = false;

      // 🔥 Mostra oferta normal
      if (ofertaCard) ofertaCard.style.display = "block";

      // 🔥 Esconde card VIP
      if (vipCard) vipCard.classList.add("hidden");

      if (btnAssinar) {
        btnAssinar.disabled = false;

        if (window.OFERTA_ATUAL) {
          btnAssinar.textContent =
            `Assinar VIP por ${valorBRL(window.OFERTA_ATUAL.valor_promocional)}`;
        }
      }

    }

  } catch (err) {

    console.error("Erro ao verificar VIP:", err);

    window.__CLIENTE_VIP__ = false;

    const vipCard = document.getElementById("vip-card");
    const ofertaCard = document.getElementById("oferta-card");

    if (ofertaCard) ofertaCard.style.display = "block";
    if (vipCard) vipCard.classList.add("hidden");

  }
}
}

window.OFERTA_ATUAL = null;
async function carregarOfertaAtiva() {
  console.log("🧪 carregarOfertaAtiva chamado com modelo_id =", modelo_id);

  const ofertaCard = document.getElementById("oferta-card");
  const precoDescontoEl = document.getElementById("preco-desconto");
  const precoOriginalEl = document.getElementById("preco-original");
  const descontoEl = document.getElementById("oferta-desconto");

 if (!ofertaCard) {
  console.warn("ofertaCard não encontrado");
  return;
}
  try {
    const res = await fetch(`/api/ofertas/ativa/${modelo_id}`);

    if (!res.ok) {
      ofertaCard.style.display = "none";
      window.OFERTA_ATUAL = null;
      return;
    }

    const data = await res.json();

    if (!data.ativa) {

  const valor = Number(data.valor_base) || 20;

  window.OFERTA_ATUAL = {
    valor_base: valor,
    valor_promocional: valor,
    desconto_percentual: 0
  };

  if (precoDescontoEl)
    precoDescontoEl.textContent = valorBRL(valor);

  if (precoOriginalEl)
    precoOriginalEl.textContent = "";

  if (descontoEl)
    descontoEl.style.display = "none";

  if (btnAssinar)
    btnAssinar.textContent =
      `Assinar VIP por ${valorBRL(valor)}`;

  ofertaCard.style.display = "block";
  return;
}
    const oferta = data.oferta;
    window.OFERTA_ATUAL = {
      id: oferta.id,
      modelo_id: oferta.modelo_id,
      valor_base: Number(oferta.valor_base),
      valor_promocional: Number(oferta.valor_promocional),
      desconto_percentual: Number(oferta.desconto_percentual || 0)
    };
      window.OFERTA_ATUAL = window.OFERTA_ATUAL;

    if (descontoEl && window.OFERTA_ATUAL.desconto_percentual > 0) {
      descontoEl.textContent = `Economize ${window.OFERTA_ATUAL.desconto_percentual}%`;
      descontoEl.style.display = "inline-block";
    } else if (descontoEl) {
      descontoEl.style.display = "none";
    }

    if (precoDescontoEl) {
  precoDescontoEl.textContent =
    valorBRL(window.OFERTA_ATUAL.valor_promocional);
}

if (precoOriginalEl) {
  precoOriginalEl.textContent =
    valorBRL(window.OFERTA_ATUAL.valor_base);
}

    ofertaCard.style.display = "block";

    if (btnAssinar) {
  btnAssinar.disabled = false;
  btnAssinar.textContent =
    `Assinar VIP por ${valorBRL(window.OFERTA_ATUAL.valor_promocional)}`;
}

  } catch (err) {
    console.error("Erro ao carregar oferta:", err);
    ofertaCard.style.display = "none";
    window.OFERTA_ATUAL = null;
  }
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
  modal.remove();

  // limpa ação pendente
  localStorage.removeItem("post_login_action");
  localStorage.removeItem("post_register_action");

  if (typeof openAgeGate === "function") {
    openAgeGate("login");
  } else {
    console.error("openAgeGate não carregado");
  }
};

  modal.querySelector(".btn-register").onclick = () => {
    modal.remove();
    localStorage.removeItem("post_login_action");
    openAgeGate("register");
  };

  document.body.appendChild(modal);
}

function abrirFluxoVIP() {

  const roleAtual = localStorage.getItem("role");

  if (!roleAtual) {
    abrirPopupLoginObrigatorio();
    return;
  }

  if (!modelo_id) {
    alert("Erro ao identificar modelo.");
    return;
  }

  window.PAGAMENTO_TIPO_ATUAL = "vip";

  const valorBase = window.OFERTA_ATUAL?.valor_base ?? 20;
  const valorPromocional =
    window.OFERTA_ATUAL?.valor_promocional ?? valorBase;

  preencherResumoVIP({
    valorBase: valorBase,
    desconto: valorBase - valorPromocional
  });

  abrirPopupPagamento();
}

async function carregarFeed() {

  const grid = document.getElementById("listaMidias");
  if (!grid) return;

  grid.innerHTML = "";

  try {

    const res = await fetch(`/api/modelo/publico/${modelo_id}/feed`);
    if (!res.ok) return;

    const midias = await res.json();

    if (!midias.length) {
      grid.innerHTML =
        "<p style='grid-column:1/-1;text-align:center;'>Sem posts ainda</p>";
      return;
    }

    const podeVer = EH_DONA || window.__CLIENTE_VIP__;

    midias.forEach(item => {

      const div = document.createElement("div");
      div.className = "midia-thumb";

      if (!podeVer) {
        div.classList.add("locked");
      }

      const url = item.thumbnail_url || item.url || "";

      const ehVideo =
        url.includes(".mp4") ||
        url.includes(".webm") ||
        url.includes(".mov");

      if (ehVideo) {

        div.innerHTML = `
          <video src="${url}" muted preload="metadata"></video>
          <span class="video-icon">▶</span>
        `;

      } else {

        div.innerHTML = `<img src="${url}">`;

      }

      div.onclick = () => {

        if (!podeVer) {
          abrirFluxoVIP();
          return;
        }

        abrirMidia(item);
      };

      // BOTÃO EXCLUIR
      if (EH_DONA) {

        const btnExcluir = document.createElement("button");
        btnExcluir.className = "btn-excluir-midia";
        btnExcluir.textContent = "✕";

        btnExcluir.onclick = (e) => {
          e.stopPropagation();
          excluirMidia(item.id, div);
        };

        div.appendChild(btnExcluir);

      }

      grid.appendChild(div);

    });

  } catch (err) {
    console.error("Erro ao carregar feed:", err);
  }

}

document.querySelector("#modalMidia .modal-backdrop")
?.addEventListener("click", () => {

  const modal = document.getElementById("modalMidia");
  modal.classList.add("hidden");

  const video = document.getElementById("modalVideo");
  if (video) {
    video.pause();
    video.currentTime = 0;
  }

});

const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileFeed");
const preview = document.getElementById("previewContainer");

uploadArea?.addEventListener("click", () => {
  fileInput.click();
});

fileInput?.addEventListener("change", () => {

  const file = fileInput.files[0];
  if (!file) return;

  preview.innerHTML = "";

  const url = URL.createObjectURL(file);

  if (file.type.startsWith("video")) {
    preview.innerHTML = `<video src="${url}" controls></video>`;
  } else {
    preview.innerHTML = `<img src="${url}">`;
  }

});

async function excluirMidia(id, elemento) {

  if (!confirm("Excluir esta mídia?")) return;

  try {

    const res = await fetch(`/api/conteudos/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao excluir");
      return;
    }

    elemento.remove();

  } catch (err) {

    console.error("Erro ao excluir mídia:", err);
    alert("Erro ao excluir mídia");

  }

}

async function carregarPremium(){

  const container = document.getElementById("midias-paid");
  if(!container) return;

  container.innerHTML = "";

  try{

    const res = await fetch(`/api/modelo/publico/${modelo_id}/premium`);
    if(!res.ok) return;

    const midias = await res.json();

    if(!midias.length){
      container.innerHTML =
      "<p style='text-align:center;'>Nenhum conteúdo premium ainda</p>";
      return;
    }

    midias.forEach(item => {

      const card = document.createElement("div");
      card.className = "midia-card-premium";

      const url = item.thumbnail_url || item.url;

      const ehVideo =
        url.includes(".mp4") ||
        url.includes(".webm") ||
        url.includes(".mov");

      card.innerHTML = `

        <div class="premium-header">
          <img class="premium-avatar"
          src="${document.getElementById("profileAvatar").src}">
          <span class="premium-username">
            ${document.getElementById("profileName").textContent}
          </span>
        </div>

        <div class="premium-media">
          ${
            ehVideo
            ? `<video src="${url}" muted controls></video>`
            : `<img src="${url}">`
          }
        </div>

        <div class="premium-info">
          ${item.descricao || ""}
          <div class="premium-preco">
            ${valorBRL(item.preco)}
          </div>
        </div>

      `;

      container.appendChild(card);

    });

  }catch(err){
    console.error("Erro carregar premium:", err);
  }

}