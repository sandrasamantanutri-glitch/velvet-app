const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

let MODELO_ID = null;
let EH_DONA = false;

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

  await carregarPerfil();
  await carregarFeed();
  await aplicarRegrasDeAcesso();

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

  img.style.display="none";
  video.style.display="none";

  if(item.tipo === "video"){
    video.src = item.url;
    video.style.display="block";
    video.play();
  }else{
    img.src = item.url;
    img.style.display="block";
  }

  modal.classList.remove("hidden");

}

document.getElementById("fecharModal")?.addEventListener("click",()=>{

  const modal = document.getElementById("modalMidia");
  const video = document.getElementById("modalVideo");

  video.pause();
  video.src="";

  modal.classList.add("hidden");

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