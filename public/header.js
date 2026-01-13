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

  // 🔔 unread global (cliente)
  atualizarUnreadClienteHeader();
  atualizarUnreadModeloHeader();

});

async function initUsuario() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch("/api/me", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) throw new Error("não autenticado");

    const user = await res.json();

    // 🔑 guarda apenas para UX
    localStorage.setItem("role", user.role);
    localStorage.setItem("nome", user.nome);

    console.log("✅ Usuário autenticado:", user.role);

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
  <button onclick="location.href='/clientHome.html'">Feed de Modelos</button>
  <button onclick="location.href='/chatcliente.html'">Chat</button>
  <button onclick="location.href='/cliente-dados.html'">Meus Dados</button>
   <button onclick="location.href='/cliente-pages/transacoes.html'">
    Minhas Transações
  </button>
  <button class="logout-btn" onclick="logout()">Sair</button>
`;

const menuModelo = `
<div class="menu-header">Menu</div>

<button onclick="voltarParaPerfil()">Meu Perfil</button>
<button onclick="abrirConteudos()">Conteúdos</button>    
<button onclick="location.href='/chatmodelo.html'">Chat</button>
<button id="btnAlterarAvatar">Alterar foto do Perfil</button>
<button id="btnAlterarCapa">Alterar Capa</button>
<button onclick="abrirDados()">Meus Dados</button>
<button onclick="location.href='/modelo/relatorio'">Meus Ganhos</button>
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

  // se não existe, sai (ex: menu cliente)
  if (!btnAvatar || !btnCapa) return;

  const role = localStorage.getItem("role");
  const page = document.body.dataset.page; // "profile" ou undefined

  // 🔒 regra principal
  if (role !== "modelo" || page !== "profile") {
    btnAvatar.style.display = "none";
    btnCapa.style.display   = "none";
    return;
  }

  // ✅ só aqui eles ficam visíveis e funcionais
  btnAvatar.style.display = "block";
  btnCapa.style.display   = "block";

  btnAvatar.addEventListener("click", () => {
    document.getElementById("inputAvatar")?.click();
  });

  btnCapa.addEventListener("click", () => {
    document.getElementById("inputCapa")?.click();
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
// 🔔 BADGE GLOBAL DE MENSAGENS NÃO LIDAS
// =========================================================
function atualizarBadgeHeader(total) {
  const badge = document.getElementById("badgeUnread");
  if (!badge) return;

  if (!total || total <= 0) {
    badge.classList.add("hidden");
    badge.innerText = "0";
  } else {
    badge.innerText = total > 9 ? "9+" : total;
    badge.classList.remove("hidden");
  }
}

function initHeaderSocketModelo() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || role !== "modelo") return;

  const socket = io({
    transports: ["websocket"]
  });

  socket.on("connect", () => {
    socket.emit("auth", { token });
  });

  // 🔔 qualquer mensagem nova para a modelo
  socket.on("unreadUpdate", ({ modelo_id }) => {
    atualizarUnreadModeloHeader();
  });
}


async function atualizarUnreadClienteHeader() {
  const role = localStorage.getItem("role");
  if (role !== "cliente") return;

  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch("/api/chat/unread/cliente", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) return;

    const unreadIds = await res.json();

    atualizarBadgeHeader(unreadIds.length);
  } catch (e) {
    console.warn("Erro ao buscar unread cliente");
  }
}

async function atualizarUnreadModeloHeader() {
  const role = localStorage.getItem("role");
  if (role !== "modelo") return;

  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch("/api/chat/unread/modelo", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) return;

    const unreadIds = await res.json();

    // unreadIds = [cliente_id, cliente_id, ...]
    atualizarBadgeHeader(unreadIds.length);
  } catch (e) {
    console.warn("Erro ao buscar unread modelo");
  }
}

function voltarParaPerfil() {
  const params = new URLSearchParams(window.location.search);
  const modeloId = params.get("modelo");

  if (!modeloId) {
    alert("Modelo não identificada");
    return;
  }

  window.location.href = `/profile.html?modelo=${modeloId}`;
}

// =========================================================
// 🏠 LOGO → HOME POR ROLE (delegação global)
// =========================================================
document.addEventListener("click", (e) => {
  const logo = e.target.closest(".logo-app");
  if (!logo) return;
window.location.href = "/index.html";
  });

// =========================================================
// 💬 BOTÃO DE MENSAGENS → CHAT POR ROLE
// =========================================================
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#btnMensagem");
  if (!btn) return;

  const role = localStorage.getItem("role");

  if (role === "cliente") {
    window.location.href = "/chatcliente.html";
  } else if (role === "modelo") {
    window.location.href = "/chatmodelo.html";
  } else {
    window.location.href = "/index.html";
  }
});



// =========================================================
// LOGOUT
// =========================================================
function logout() {
  localStorage.clear();
  location.href = "www.velvet.lat/index.html";
}



