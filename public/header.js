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

document.addEventListener("DOMContentLoaded", () => {
  initUsuario();
  carregarHeader();
});
async function initUsuario() {
  const token = localStorage.getItem("token");

  if (!token) return;

  try {
    const res = await fetch("/api/me", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) throw new Error("não autenticado");

    const user = await res.json();

    // 🔑 guarda apenas para UX (não segurança)
    localStorage.setItem("role", user.role);
    localStorage.setItem("nome", user.nome);


    console.log("✅ Usuário autenticado:", role);

  } catch (e) {
  console.warn("Sessão inválida no header");
  localStorage.removeItem("role");
  localStorage.removeItem("nome");
}
}

// =========================================================
// MENUS POR ROLE
// =========================================================
const menuCliente = `
  <div class="menu-header">Menu</div>
  <button onclick="location.href='clientHome.html'">Feed de Modelos</button>
  <button onclick="location.href='chatcliente.html'">Mensagens</button>
  <button onclick="location.href='cliente-dados.html'">Meus Dados</button>
  <button class="logout-btn" onclick="logout()">Sair</button>
`;

const menuModelo = `
<div class="menu-header">Menu</div>

<button onclick="location.href='profile.html'">Meu Perfil</button>
<button onclick="abrirConteudos()">Conteúdos</button>    
<button onclick="location.href='chatmodelo.html'">Chat</button>
<button id="btnAlterarAvatar">Alterar foto do Perfil</button>
<button id="btnAlterarCapa">Alterar Capa</button>
<button onclick="abrirDados()">Meus Dados</button>
<hr class="menu-divider">
<button class="logout-btn" onclick="logout()">Sair</button>
`;

function montarMenuPorRole() {
  const role = localStorage.getItem("role");

const menu = document.getElementById("userMenu");
if (!menu) return;

if (role === "modelo") {
  menu.innerHTML = menuModelo;
} else if (role === "cliente") {
  menu.innerHTML = menuCliente;
} else {
  console.warn("❌ Role inválido:", role);
}
}

function abrirDados() {
  window.location.href = "/dados-modelo.html";
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

function abrirConteudos() {
  const role = localStorage.getItem("role");

  if (role !== "modelo") {
    alert("Acesso restrito à modelo.");
    return;
  }

  window.location.href = "/conteudos.html";
}


// =========================================================
// LOGOUT
// =========================================================
function logout() {
  localStorage.clear();
  location.href = "index.html";
}



