const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

let MODELO_ID = null;
let EH_DONA = false;

document.addEventListener("DOMContentLoaded", async () => {

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
  // VERIFICAR SE É DONA
  // =========================

  const modeloLogado = Number(localStorage.getItem("modelo_id"));
  EH_DONA = role === "modelo" && modeloLogado === MODELO_ID;

  if (!EH_DONA) {
    document.getElementById("btn-upload")?.remove();
  }


await carregarPerfil();
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
  const btnAssinar = document.getElementById("btn-assinar");

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
    `Assinar VIP por ${valorBRL(OFERTA_ATUAL.valor_promocional)}`;
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