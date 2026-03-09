document.addEventListener("DOMContentLoaded", () => {

  const role = localStorage.getItem("role");

  if (role !== "modelo") return;

  const menu = document.getElementById("footerMenu");

  
  const btnPerfil = document.getElementById("btnAvatar");
  const btnMedia = document.getElementById("btnPost");
  const btnConteudos = document.getElementById("btnConteudos");
  const btnVip = document.getElementById("btnVip");
  const btnLinks = document.getElementById("btnLinks");

  function abrirMenu(html) {
    menu.innerHTML = html;
    menu.classList.remove("hidden");
  }

  function fecharMenu() {
    menu.classList.add("hidden");
  }

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !e.target.closest(".footer-btn")) {
      fecharMenu();
    }
  });

  // =========================
  // MIDIA
  // =========================

btnMedia?.addEventListener("click", () => {

  abrirMenu(`
    <button onclick="postarFeed()">Postar no Feed</button>
    <input type="file" id="inputUploadMidia" accept="image/*,video/*" hidden>
    <button onclick="postarPremium()">Postar no Premium</button>
  `);

});

  // =========================
  // CONTEUDOS
  // =========================

btnConteudos?.addEventListener("click", () => {
  gerenciarConteudos();
});

  // =========================
  // VIP
  // =========================

btnVip?.addEventListener("click", () => {
  alterarVIP();
});

  // =========================
  // LINKS
  // =========================

btnLinks?.addEventListener("click", () => {
  abrirLinks();
});

btnPerfil?.addEventListener("click", () => {
  abrirPerfil(modelo.modelo_id);
});


// =========================
// FUNÇÕES
// =========================

function postarPremium(){
  window.location.href="/modelo/postar-premium.html";
}

function gerenciarConteudos(){
  window.location.href="/conteudos.html";
}

function alterarVIP(){
  window.location.href="/ofertas.html";
}

function abrirPerfil(modelo_id){
  window.location.href = `/perfil.html?id=${modelo_id}`;
}


function abrirLinks() {
  window.location.href = "/links.html";
}

function postarFeed(){

  const input = document.getElementById("inputUploadMidia");

  if(!input) return;

  input.click();

  input.onchange = (e) => {

    const file = e.target.files[0];
    if(!file) return;

    const url = URL.createObjectURL(file);

    abrirPreviewUpload(file, url);

    input.value = "";

  };

}



});