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
await carregarPremium();
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