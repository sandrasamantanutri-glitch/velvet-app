// ===============================
// SOCKET GLOBAL (1x só)
// ===============================
function carregarHeader() {
  // evita duplicar
  if (document.querySelector(".app-header")) {
    montarMenuPorRole();
    initHeaderMenu();
    ligarBotoesPerfilModelo();
    return;
  }

  const container = document.getElementById("header-container");
  if (!container) {
    console.warn("❌ header-container não encontrado");
    return;
  }

  fetch("/header.html")
    .then(res => res.text())
    .then(html => {
      container.insertAdjacentHTML("afterbegin", html);

      // 🔑 AGORA os elementos existem
      montarMenuPorRole();
      initHeaderMenu();
      ligarBotoesPerfilModelo(); 
    })
    .catch(err => console.error("Erro ao carregar header:", err));
}

document.addEventListener("DOMContentLoaded", carregarHeader);



// =========================================================
// MENUS POR ROLE
// =========================================================
const menuCliente = `
  <div class="menu-header">Menu</div>
  <button onclick="location.href='clientHome.html'">Feed de Modelos</button>
  <button onclick="location.href='chatcliente.html'">Mensagens</button>
  <button onclick="location.href='configc.html'">Perfil</button>
  <hr class="menu-divider">
  <button class="logout-btn" onclick="logout()">Sair</button>
`;

const menuModelo = `
<div class="menu-header">Menu</div>

<button onclick="location.href='profile.html'">Meu Perfil</button>
<button onclick="abrirConteudos()">Conteúdos</button>    
<button onclick="location.href='chatmodelo.html'">Chat</button>
<button id="btnAlterarAvatar">Alterar foto do Perfil</button>
<button id="btnAlterarCapa">Alterar Capa</button>
<button onclick="location.href='configm.html'">Configurações</button>
<hr class="menu-divider">
<button class="logout-btn" onclick="logout()">Sair</button>
`;

function montarMenuPorRole() {
  let role = localStorage.getItem("user_role");

  if (!role) {
    role = "cliente";
    localStorage.setItem("user_role", "cliente");
  }

  const menu = document.getElementById("userMenu");
  if (!menu) return;

  menu.innerHTML = role === "modelo" ? menuModelo : menuCliente;
}

// =========================================================
// CONTROLE ABRIR / FECHAR MENU
// =========================================================
function initHeaderMenu() {
  const btn = document.getElementById("menuBtn");
  const menu = document.getElementById("userMenu");

  if (!btn || !menu) {
    console.warn("menuBtn ou userMenu não encontrado");
    return;
  }

  btn.addEventListener("click", e => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    menu.classList.remove("open");
  });

  menu.addEventListener("click", e => {
    e.stopPropagation();
  });
}

function abrirConteudos() {
    const role = localStorage.getItem("user_role");
    const modelo = localStorage.getItem("modeloPerfil");

    // 🔐 blindagem básica no frontend
    if (role !== "modelo" || !modelo) {
        alert("Acesso negado");
        return;
    }

    window.location.href = window.location.href = "public/conteudos.html";

}
function ligarBotoesPerfilModelo() {
  const btnAvatar = document.getElementById("btnAlterarAvatar");
  const btnCapa   = document.getElementById("btnAlterarCapa");

  btnAvatar?.addEventListener("click", () => {
    const input = document.getElementById("inputAvatar");
    if (!input) {
      console.warn("❌ inputAvatar não encontrado");
      return;
    }
    input.click();
  });

  btnCapa?.addEventListener("click", () => {
    const input = document.getElementById("inputCapa");
    if (!input) {
      console.warn("❌ inputCapa não encontrado");
      return;
    }
    input.click();
  });
}



// =========================================================
// LOGOUT
// =========================================================
function logout() {
  localStorage.clear();
  location.href = "index.html";
}
// carregar valor salvo
const socket = window.socket;
if (socket) {
  socket.on("novaMensagem", (data) => {
    console.log("📩 HEADER recebeu novaMensagem:", data);

    const total = Number(localStorage.getItem("unreadTotal") || 0) + 1;
    localStorage.setItem("unreadTotal", total);
    atualizarBadge(total);
  });
}

