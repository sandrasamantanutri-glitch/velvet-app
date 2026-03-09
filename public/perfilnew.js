const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

let MODELO_ID = null;
let EH_DONA = false;

const socket = io();

socket.on("vipAtivado", async ({ modelo_id }) => {
  if (modelo_id === MODELO_ID) {
    await aplicarRegrasDeAcesso();
  }
});

document.addEventListener("DOMContentLoaded", async () => {

  const params = new URLSearchParams(window.location.search);
  MODELO_ID = Number(params.get("modelo_id") || params.get("id"));

  if (!MODELO_ID) {
    console.warn("modelo_id não encontrado na URL");
    return;
  }

  const modeloLogado = Number(localStorage.getItem("modelo_id"));
  EH_DONA = role === "modelo" && modeloLogado === MODELO_ID;

  if (!EH_DONA) {
    document.getElementById("btn-upload")?.remove();
  }

  iniciarTabs();

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

  // =========================
  // BOTÃO CHAT VIP
  // =========================

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

    feed.forEach(item=>{

      const card = document.createElement("div");
      card.className = "midia-thumb";

      const img = document.createElement("img");

      img.src = item.thumbnail_url || item.url;

      img.onerror = ()=> img.src="/assets/capa.png";

      card.appendChild(img);

      card.onclick = ()=> abrirMidia(item);

      if(item.tipo_conteudo === "venda"){
        gridPaid.appendChild(card);
      }else{
        gridFree.appendChild(card);
      }

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

  if(item.tipo_conteudo === "video"){
    video.src = item.url;
    video.style.display = "block";
    video.play();
  }else{
    img.src = item.url;
    img.style.display = "block";
  }

  modal.classList.remove("hidden");

}

const modal = document.getElementById("modalMidia");

modal?.addEventListener("click", (e) => {

  if (e.target === modal) {

    const video = document.getElementById("modalVideo");

    if (video) {
      video.pause();
      video.src = "";
    }

    modal.classList.add("hidden");
  }

});

function iniciarTabs(){

  const tabs = document.querySelectorAll(".tab");

  tabs.forEach(tab=>{

    tab.addEventListener("click",()=>{

      tabs.forEach(t=>t.classList.remove("active"));

      document
        .querySelectorAll(".midias-grid")
        .forEach(g=>g.classList.remove("active"));

      tab.classList.add("active");

      if(tab.dataset.tab==="free"){
        document.getElementById("listaMidias").classList.add("active");
      }

      if(tab.dataset.tab==="paid"){
        document.getElementById("midias-paid").classList.add("active");
      }

    });

  });

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
///////
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