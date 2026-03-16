document.addEventListener("DOMContentLoaded", () => {

   const menu = document.getElementById("footerModelo");

  const btnPerfil = document.getElementById("btnAvatar");
  const btnMedia = document.getElementById("btnPost");
  const btnConteudos = document.getElementById("btnConteudos");
  const btnVip = document.getElementById("btnVip");
  const btnLinks = document.getElementById("btnLinks");

  // =========================
  // FECHAR MENU AO CLICAR FORA
  // =========================

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !e.target.closest(".footer-btn")) {
      fecharMenu();
    }
  });

  // =========================
  // BOTÃO POST
  // =========================

  btnMedia?.addEventListener("click", () => {

    abrirMenu(`
      <button id="menuPostFeed">Postar no Feed</button>
      <button id="menuPostPremium">Postar no Premium</button>
    `);

  });

  // =========================
  // CONTEÚDOS
  // =========================

  btnConteudos?.addEventListener("click", () => {
    window.location.href = "/conteudos.html";
  });

  // =========================
  // VIP
  // =========================

  btnVip?.addEventListener("click", () => {
    window.location.href = "/ofertas.html";
  });

  // =========================
  // LINKS
  // =========================

  btnLinks?.addEventListener("click", () => {
    window.location.href = "/links.html";
  });

  // =========================
  // PERFIL
  // =========================

  btnPerfil?.addEventListener("click", () => {

    const modeloId = localStorage.getItem("modelo_id");

    if (!modeloId) {
      console.warn("modelo_id não encontrado no localStorage");
      return;
    }

    window.location.href = `/perfil.html?id=${modeloId}`;

  });

  // =========================
  // ABRIR MENU
  // =========================

  function abrirMenu(html) {

    menu.innerHTML = html;
    menu.classList.remove("hidden");

    registrarEventosMenu();

  }

  function fecharMenu() {
    menu.classList.add("hidden");
  }

  // =========================
  // REGISTRAR EVENTOS DO MENU
  // =========================

  function registrarEventosMenu(){

    const btnFeed = document.getElementById("menuPostFeed");
    const btnPremium = document.getElementById("menuPostPremium");

    if(btnFeed){
      btnFeed.onclick = postarFeed;
    }

    // if(btnPremium){
    //   btnPremium.onclick = postarPremium;
    // }

  }

  // =========================
  // POSTAR NO FEED
  // =========================

  function postarFeed(){

    const popup = document.getElementById("popupUploadFeed");

    if(!popup) return;

    popup.classList.remove("hidden");

  }

  // =========================
  // POSTAR PREMIUM
  // =========================

// function postarPremium(){

//   const popup = document.getElementById("popupUploadPremium");

//   if(!popup) return;

//   popup.classList.remove("hidden");

// }

});