const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

let MODELO_ID = null;
let EH_DONA = false;

// socket.on("vipAtivado", async ({ modelo_id }) => {
//   if (modelo_id === MODELO_ID) {
//     await aplicarRegrasDeAcesso();
//   }
// });

document.addEventListener("DOMContentLoaded", async () => {

  const role = localStorage.getItem("role");

  // =========================
  // PARAMETROS URL
  // =========================

  const params = new URLSearchParams(window.location.search);
  MODELO_ID = Number(params.get("modelo_id") || params.get("id"));

  if (!MODELO_ID) {
    console.warn("modelo_id não encontrado na URL");
    return;
  }

  // =========================
  // FECHAR POPUP UPLOAD
  // =========================

  const uploadBackdrop = document.getElementById("uploadBackdrop");
  const uploadClose = document.getElementById("uploadClose");

  uploadBackdrop?.addEventListener("click", fecharPopupUpload);
  uploadClose?.addEventListener("click", fecharPopupUpload);

  // =========================
  // VERIFICAR SE É DONA
  // =========================

  const modeloLogado = Number(localStorage.getItem("modelo_id"));
  EH_DONA = role === "modelo" && modeloLogado === MODELO_ID;

  if (!EH_DONA) {
    document.getElementById("btn-upload")?.remove();
  }

  iniciarTabs();

  // =========================
  // MODAL MIDIA
  // =========================

  const modal = document.getElementById("modalMidia");
  const btnFechar = document.getElementById("fecharModal");

  function fecharModalMidia(){

    const video = document.getElementById("modalVideo");

    if(video){
      video.pause();
      video.src = "";
    }

    modal.classList.add("hidden");
  }

  // botão X
  btnFechar?.addEventListener("click", fecharModalMidia);

  // clique fora
  modal?.addEventListener("click", (e) => {

    if (e.target.classList.contains("modal-backdrop")) {
      fecharModalMidia();
    }

  });

  // tecla ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModalMidia();
  });

  // =========================
  // BOTÃO ASSINAR
  // =========================

  const btnAssinar = document.getElementById("btn-assinar");

  btnAssinar?.addEventListener("click", () => {

    const tokenAtual = localStorage.getItem("token");

    if (!tokenAtual) {
      abrirPopupLoginObrigatorio();
      return;
    }

    const roleAtual = localStorage.getItem("role");
    const modeloLogado = Number(localStorage.getItem("modelo_id"));

    // modelo não pode assinar outra modelo
    if (roleAtual === "modelo" && modeloLogado !== MODELO_ID) {
      alert("No momento, modelo não pode assinar outra modelo.");
      return;
    }

    if (window.__CLIENTE_VIP__) {
      window.location.href = `/chatc.html?modelo_id=${MODELO_ID}`;
      return;
    }

    window.abrirFluxoVIP();
  });

  document.getElementById("btn-vip-chat")?.addEventListener("click", () => {
    window.location.href = `/chatc.html?modelo_id=${MODELO_ID}`;
  });


  // =========================
  // CARREGAMENTO
  // =========================

  await carregarPerfil();
  await carregarOfertaAtiva();
  await carregarFeed();
  await aplicarRegrasDeAcesso();


});

// =================================
// LINK GENÉRICO "ASSINAR VIP"
// =================================

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

async function carregarPerfil(){

  try{

    const res = await fetch(`/api/modelo/publico/${MODELO_ID}`);

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

async function carregarFeed(){

  const gridFree = document.getElementById("listaMidias");
  const gridPaid = document.getElementById("midias-paid");

  gridFree.innerHTML = "";
  gridPaid.innerHTML = "";

  try{

    const res = await fetch(`/api/modelo/publico/${MODELO_ID}/feed`);
    const feed = await res.json();

    if(!Array.isArray(feed)) return;

    const ehVip = window.__CLIENTE_VIP__ === true;
    const tokenAtual = localStorage.getItem("token");

    feed.forEach(item=>{

      const card = document.createElement("div");
      card.className = "midia-thumb";

      const img = document.createElement("img");

      const url = item.url || "";
      const thumbnail = item.thumbnail_url || url;

      img.src = thumbnail;
      img.onerror = () => img.src = "/assets/capa.png";

      card.appendChild(img);

      // detectar se é vídeo
      const ehVideo =
        url.includes(".mp4") ||
        url.includes(".webm") ||
        url.includes(".mov");

      if(ehVideo){
        const icon = document.createElement("div");
        icon.className = "video-icon";
        icon.innerHTML = "▶";
        card.appendChild(icon);
      }

      // =========================
      // BLOQUEIO DE ACESSO
      // =========================

      let bloqueado = false;

      if (!EH_DONA) {

        // conteúdo pago sempre bloqueado
        if (item.tipo_conteudo === "venda") {
          bloqueado = true;
        }

        // conteúdo free exige VIP
        if (item.tipo_conteudo !== "venda" && !ehVip) {
          bloqueado = true;
        }

      }

      if (bloqueado) {
        card.classList.add("locked");
      }

      // =========================
      // BOTÃO EXCLUIR (SÓ DONA)
      // =========================

      if (EH_DONA) {

        const btnExcluir = document.createElement("button");
        btnExcluir.className = "btn-excluir-midia";
        btnExcluir.innerHTML = "🗑";

        btnExcluir.onclick = async (e) => {

          e.stopPropagation();

          if (!confirm("Deseja excluir este conteúdo?")) return;

          try {

            const tokenAtual = localStorage.getItem("token");

            const res = await fetch(`/api/conteudos/${item.id}`, {
              method: "DELETE",
              headers: {
                Authorization: "Bearer " + tokenAtual
              }
            });

            if (!res.ok) {
              alert("Erro ao excluir conteúdo");
              return;
            }

            card.remove();

          } catch (err) {
            console.error("Erro excluir:", err);
          }

        };

        card.appendChild(btnExcluir);
      }

      // =========================
      // CLICK NA MIDIA
      // =========================

      card.addEventListener("click", () => {

        // visitante não abre
        if (!tokenAtual) return;

        if (EH_DONA) {
          abrirMidia(item);
          return;
        }

        // não VIP
        if (!ehVip) {
          abrirFluxoVIP();
          return;
        }

        abrirMidia(item);

      });


    });

  }catch(e){
    console.error("erro feed",e);
  }

}

async function aplicarRegrasDeAcesso() {

  const ofertaCard = document.getElementById("oferta-card");
  const vipCard = document.getElementById("vip-card");
  const btnAssinar = document.getElementById("btn-assinar");

  const tokenAtual = localStorage.getItem("token");

  // estado padrão
  window.__CLIENTE_VIP__ = false;

  const ehModelo = role === "modelo";
  const ehCliente = role === "cliente";

  // ==========================
  // MODELO DONA DO PERFIL
  // ==========================

  if (EH_DONA) {

    window.__CLIENTE_VIP__ = false;

    if (ofertaCard) ofertaCard.style.display = "block";
    if (vipCard) vipCard.classList.add("hidden");

    if (btnAssinar) {
      btnAssinar.disabled = true;
      btnAssinar.style.cursor = "not-allowed";

      if (window.OFERTA_ATUAL) {
        btnAssinar.textContent =
          `Assinar VIP por ${valorBRL(window.OFERTA_ATUAL.valor_promocional)}`;
      }
    }

    return;
  }

  // ==========================
  // VISITANTE
  // ==========================

  if (!tokenAtual) {
    if (ofertaCard) ofertaCard.style.display = "block";
    if (vipCard) vipCard.classList.add("hidden");
    return;
  }

  // ==========================
  // CLIENTE / MODELO VISITANTE
  // ==========================

  if (ehCliente || ehModelo) {

    try {

      const res = await fetch(`/api/vip/status/${MODELO_ID}`, {
        headers: {
          Authorization: "Bearer " + tokenAtual
        }
      });

      const data = res.ok ? await res.json() : { vip: false };
      const vip = data.vip;

      if (vip) {

        window.__CLIENTE_VIP__ = true;

        if (ofertaCard) ofertaCard.style.display = "none";
        if (vipCard) vipCard.classList.remove("hidden");

      } else {

        window.__CLIENTE_VIP__ = false;

        if (ofertaCard) ofertaCard.style.display = "block";
        if (vipCard) vipCard.classList.add("hidden");

        if (btnAssinar && window.OFERTA_ATUAL) {
          btnAssinar.disabled = false;
          btnAssinar.textContent =
            `Assinar VIP por ${valorBRL(window.OFERTA_ATUAL.valor_promocional)}`;
        }

      }

    } catch (err) {

      console.error("Erro ao verificar VIP:", err);

      window.__CLIENTE_VIP__ = false;

      if (ofertaCard) ofertaCard.style.display = "block";
      if (vipCard) vipCard.classList.add("hidden");

    }

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

let OFERTA_ATUAL = null;

async function carregarOfertaAtiva() {

  console.log("🧪 carregarOfertaAtiva chamado com modelo_id =", MODELO_ID);

  const ofertaCard = document.getElementById("oferta-card");
  const btnAssinar = document.getElementById("btn-assinar");
  const precoDescontoEl = document.getElementById("preco-desconto");
  const precoOriginalEl = document.getElementById("preco-original");
  const descontoEl = document.getElementById("oferta-desconto");

  if (!ofertaCard) {
    console.warn("ofertaCard não encontrado");
    return;
  }

  try {

    const res = await fetch(`/api/ofertas/ativa/${MODELO_ID}`);

    if (!res.ok) {
      ofertaCard.style.display = "none";
      OFERTA_ATUAL = null;
      return;
    }

    const data = await res.json();

    // =========================
    // SEM PROMOÇÃO
    // =========================

    if (!data.ativa) {

      const valor = Number(data.valor_base) || 20;

      OFERTA_ATUAL = {
        valor_base: valor,
        valor_promocional: valor,
        desconto_percentual: 0
      };

      window.OFERTA_ATUAL = OFERTA_ATUAL;

      precoDescontoEl.textContent = valorBRL(valor);
      precoOriginalEl.textContent = "";

      if (descontoEl)
        descontoEl.style.display = "none";

      if (btnAssinar)
        btnAssinar.textContent =
          `Assinar VIP por ${valorBRL(valor)}`;

      ofertaCard.style.display = "block";

      return;
    }

    // =========================
    // COM PROMOÇÃO
    // =========================

    const oferta = data.oferta;

    OFERTA_ATUAL = {
      id: oferta.id,
      modelo_id: oferta.modelo_id,
      valor_base: Number(oferta.valor_base),
      valor_promocional: Number(oferta.valor_promocional),
      desconto_percentual: Number(oferta.desconto_percentual || 0)
    };

    window.OFERTA_ATUAL = OFERTA_ATUAL;

    if (descontoEl && OFERTA_ATUAL.desconto_percentual > 0) {
      descontoEl.textContent =
        `Economize ${OFERTA_ATUAL.desconto_percentual}%`;
      descontoEl.style.display = "inline-block";
    } else if (descontoEl) {
      descontoEl.style.display = "none";
    }

    if (precoDescontoEl)
      precoDescontoEl.textContent =
        valorBRL(OFERTA_ATUAL.valor_promocional);

    if (precoOriginalEl)
      precoOriginalEl.textContent =
        valorBRL(OFERTA_ATUAL.valor_base);

    ofertaCard.style.display = "block";

    if (btnAssinar) {
      btnAssinar.disabled = false;
      btnAssinar.textContent =
        `Assinar VIP por ${valorBRL(OFERTA_ATUAL.valor_promocional)}`;
    }

  } catch (err) {

    console.error("Erro ao carregar oferta:", err);

    ofertaCard.style.display = "none";
    OFERTA_ATUAL = null;

  }
}

function valorBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
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

  // 🔥 SALVA QUE DEVE ABRIR VIP DEPOIS DO LOGIN
  localStorage.setItem("post_login_action", "open_vip_payment");

  if (typeof openAgeGate === "function") {
    openAgeGate("login");
  } else {
    console.error("openAgeGate não carregado ainda");

    const intervalo = setInterval(() => {
      if (typeof openAgeGate === "function") {
        clearInterval(intervalo);
        openAgeGate("login");
      }
    }, 100);
  }
};


modal.querySelector(".btn-register").onclick = () => {
  modal.remove();

  // 🔥 SALVA QUE DEVE ABRIR VIP DEPOIS DO REGISTRO
  localStorage.setItem("post_login_action", "open_vip_payment");

  openAgeGate("register");
};


  document.body.appendChild(modal);
}

const uploadArea = document.getElementById("uploadArea");
const inputFile = document.getElementById("fileFeed");
const previewContainer = document.getElementById("previewContainer");
const progressFill = document.getElementById("uploadProgress");
const progressBox = document.getElementById("uploadProgressBox");
const progressText = document.getElementById("progressText");

let arquivoSelecionado = null;

uploadArea?.addEventListener("click", () => inputFile.click());

inputFile?.addEventListener("change", (e) => {

  const file = e.target.files[0];
  if(!file) return;

  arquivoSelecionado = file;

  previewContainer.innerHTML = "";

  const url = URL.createObjectURL(file);

  if(file.type.startsWith("video")){
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    previewContainer.appendChild(video);
  }else{
    const img = document.createElement("img");
    img.src = url;
    previewContainer.appendChild(img);
  }

});

document.getElementById("btnEnviarFeed")?.addEventListener("click", () => {

  if(!arquivoSelecionado){
    alert("Selecione uma mídia");
    return;
  }

  const maxSize = 100 * 1024 * 1024;

  if(arquivoSelecionado.size > maxSize){
    alert("Arquivo muito grande (máx 100MB)");
    return;
  }

  enviarUploadFeed();

});

function iniciarTabs(){

  const tabs = document.querySelectorAll(".midias-tabs .tab");
  const grids = document.querySelectorAll(".midias-grid");

  tabs.forEach(tab => {

    tab.addEventListener("click", () => {

      tabs.forEach(t => t.classList.remove("active"));
      grids.forEach(g => g.classList.remove("active"));

      tab.classList.add("active");

      const tipo = tab.dataset.tab;

      if(tipo === "free"){
        document.getElementById("listaMidias")?.classList.add("active");
      }

      if(tipo === "paid"){
        document.getElementById("midias-paid")?.classList.add("active");
      }

    });

  });

}

function enviarUploadFeed(){

  const token = localStorage.getItem("token");

  const form = new FormData();
  form.append("file", arquivoSelecionado);
  form.append("tipo", "feed");
  form.append("modelo_id", MODELO_ID);

  const xhr = new XMLHttpRequest();

  xhr.open("POST", "/api/upload");

  xhr.setRequestHeader("Authorization", "Bearer " + token);

  progressBox.classList.remove("hidden");

  xhr.upload.onprogress = function(e){

    if(!e.lengthComputable) return;

    const percent = Math.round((e.loaded / e.total) * 100);

    progressFill.style.width = percent + "%";
    progressText.textContent = percent + "%";

  };

  xhr.onload = async function(){

    if(xhr.status !== 200){
      alert("Erro no upload");
      return;
    }

    fecharPopupUpload();

    await carregarFeed();

  };

  xhr.onerror = function(){
    alert("Erro de rede no upload");
  };

  xhr.send(form);

}

function fecharPopupUpload(){

  const popup = document.getElementById("popupUploadFeed");

  if(popup){
    popup.classList.add("hidden");
  }

}