document.addEventListener("DOMContentLoaded", () => {

  const role = localStorage.getItem("role");

  if (role !== "modelo") return;

  const menu = document.getElementById("footerMenu");

  const btnMedia = document.getElementById("btnMedia");
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
      <button onclick="postarPremium()">Postar no Premium</button>
    `);

  });

  // =========================
  // CONTEUDOS
  // =========================

  btnConteudos?.addEventListener("click", () => {

    abrirMenu(`
      <button onclick="novoConteudo()">Adicionar conteúdo para venda</button>
      <button onclick="gerenciarConteudos()">Gerenciar conteúdos</button>
    `);

  });

  // =========================
  // VIP
  // =========================

  btnVip?.addEventListener("click", () => {

    abrirMenu(`
      <button onclick="alterarVIP()">Alterar preço VIP</button>
      <button onclick="criarOferta()">Criar oferta</button>
    `);

  });

  // =========================
  // LINKS
  // =========================

  btnLinks?.addEventListener("click", () => {

    abrirMenu(`
      <button onclick="editarLinks()">Editar links do perfil</button>
    `);

  });

});


// =========================
// FUNÇÕES
// =========================

function postarFeed(){
  window.location.href="/modelo/postar-feed.html";
}

function postarPremium(){
  window.location.href="/modelo/postar-premium.html";
}

function novoConteudo(){
  window.location.href="/modelo/conteudos-upload.html";
}

function gerenciarConteudos(){
  window.location.href="/modelo/conteudos.html";
}

function alterarVIP(){
  window.location.href="/modelo/config-vip.html";
}

function criarOferta(){
  window.location.href="/modelo/ofertas.html";
}

function editarLinks(){
  window.location.href="/modelo/links.html";
}