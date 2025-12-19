// ===============================
// SOCKET GLOBAL (1x só)
// ===============================
function carregarHeader() {
  // evita duplicar
  if (document.querySelector(".app-header")) {
    montarMenuPorRole();
    initHeaderMenu();
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
<button onclick="alterarAvatar()">Alterar foto do Perfil</button>
<button onclick="alterarCapa()">Alterar Capa</button>
<button onclick="location.href='configm.html'">Configurações</button>
<hr class="menu-divider">
<button class="logout-btn" onclick="logout()">Sair</button>
`;

function montarMenuPorRole() {
  let role = localStorage.getItem("userRole");

  if (!role) {
    role = "cliente";
    localStorage.setItem("userRole", "cliente");
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
    const role = localStorage.getItem("userRole");
    const modelo = localStorage.getItem("modeloPerfil");

    // 🔐 blindagem básica no frontend
    if (role !== "modelo" || !modelo) {
        alert("Acesso negado");
        return;
    }

    window.location.href = window.location.href = "public/conteudos.html";

}

// =========================================================
// LOGOUT
// =========================================================
function logout() {
  localStorage.clear();
  location.href = "index.html";
}
// ===============================
// ALTERAR CAPA e avatar
// ===============================
window.alterarCapa = function () {
  const input = document.getElementById("inputCapa");
  if (!input) {
    alert("Input de capa não encontrado");
    return;
  }
  input.click();
};

const inputCapa = document.getElementById("inputCapa");

inputCapa?.addEventListener("change", () => {
  const file = inputCapa.files[0];
  if (!file) return;

  const modelo = localStorage.getItem("modeloPerfil");
  if (!modelo) {
    alert("Modelo não identificado");
    return;
  }

  const formData = new FormData();
  formData.append("capa", file);
  formData.append("modelo", modelo);

  fetch("/uploadCapa", {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      document.getElementById("profileCapa").src =
        data.capa + "?v=" + Date.now();
    } else {
      alert("Erro ao salvar capa");
    }
  })
  .catch(err => console.error("Erro upload capa.", err));
});

window.alterarAvatar = function () {
  const input = document.getElementById("inputAvatar");
  if (!input) {
    alert("Input de capa não encontrado");
    return;
  }
  input.click();
};

const inputAvatar = document.getElementById("inputAvatar");

inputAvatar?.addEventListener("change", () => {
  const file = inputAvatar.files[0];
  if (!file) return;

  const modelo = localStorage.getItem("modeloPerfil");
  if (!modelo) {
    alert("Modelo não identificado");
    return;
  }

  const formData = new FormData();
  formData.append("avatar", file);
  formData.append("modelo", modelo);

  fetch("/uploadAvatar", {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      document.getElementById("profileAvatar").src =
        data.avatar + "?v=" + Date.now();
    } else {
      alert("Erro ao salvar avatar");
    }
  })
  .catch(err => console.error("Erro upload do avatar.", err));
});
const badge = document.getElementById("badgeUnread");

function atualizarBadge(total) {
  if (!badge) return;

  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
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

