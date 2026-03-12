// ===============================
// SOCKET GLOBAL
function carregarHeader() {
  // evita duplicar
  if (document.querySelector(".app-header")) {
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
    })
    .catch(err => console.error("Erro ao carregar header:", err));
}

const menuVisitante = `
  <div class="menu-header">Bem-vindo à Velvet</div>

  <button onclick="abrirPopupVelvet({ tipo: 'login' })">
    Entrar / Criar conta
  </button>
`;

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

    // 🔑 SEMPRE atualiza
    localStorage.setItem("role", user.role);
    localStorage.setItem("nome", user.nome);

    // limpa flag pós-registro sem afetar lógica
    if (localStorage.getItem("post_register_action") === "just_registered") {
      setTimeout(() => {
        localStorage.removeItem("post_register_action");
      }, 1000);
    }

  } catch (e) {
    console.warn("Sessão inválida no header");

    localStorage.clear();

    if (!window.location.pathname.includes("index")) {
      window.location.href = "/index.html";
    }
  }
}

// =========================================================
//BADGE GLOBAL DE MENSAGENS NÃO LIDAS
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

  // socket desativado por enquanto
  if (typeof io === "undefined") {
    console.warn("Socket.IO não carregado — notificações desativadas");
    return;
  }

  const socket = io({
    transports: ["websocket"]
  });

  socket.on("connect", () => {
    socket.emit("auth", { token });
  });

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

    // unreadIds 
    atualizarBadgeHeader(unreadIds.length);
  } catch (e) {
    console.warn("Erro ao buscar unread modelo");
  }
}
// =========================================================
// INIT HEADER (ORDEM CORRETA)
document.addEventListener("DOMContentLoaded", async () => {

  await initUsuario();        // 🔑 carrega dados do usuário
  carregarHeader();           // 🔥 monta o header

  atualizarUnreadClienteHeader();
  atualizarUnreadModeloHeader();
  initHeaderSocketModelo();

});
// =========================================================
// LOGO → HOME POR ROLE

document.addEventListener("click", (e) => {
  const logo = e.target.closest(".logo-app");
  if (!logo) return;

  const role = localStorage.getItem("role");

  if (role === "modelo") {
    window.location.href = "/feed.html";
  } else if (role === "cliente") {
    window.location.href = "/feed.html";
  } else {
    window.location.href = "/index.html";
  }
});

// =========================================================
// LOGOUT 
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#btnLogout");
  if (!btn) return;

  e.preventDefault();

  // limpa tudo da sessão
  localStorage.clear();

  // vai para o index
  window.location.href = "/index.html";
});

// =========================================================

document.addEventListener("click", (e) => {

  const avatar = e.target.closest("#linkPerfil");
  if (!avatar) return;

  e.preventDefault();
  e.stopPropagation();

  const modeloId = localStorage.getItem("modelo_id");

  if (!modeloId) {
    console.warn("Apenas criadoras verificadas tem perfil publico");
    return;
  }

  window.location.href = `/perfil.html?id=${modeloId}`;

});
// =========================================================

async function irParaInbox() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/index.html";
    return;
  }

  const res = await fetch("/api/me", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const user = await res.json();

  if (user.role === "modelo") {
    window.location.href = "/inbox.html";
  } else {
    window.location.href = "/inboxc.html";
  }
}



