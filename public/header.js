// ===============================
// SOCKET GLOBAL (1x só)
// ===============================
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


document.addEventListener("DOMContentLoaded", () => {
  
  initUsuario();
  carregarHeader();

  // 🔔 unread global (cliente)
  atualizarUnreadClienteHeader();
  atualizarUnreadModeloHeader();

});

async function initUsuario() {
  if (localStorage.getItem("post_register_action") === "just_registered") {
  // libera depois da primeira carga
  setTimeout(() => {
    localStorage.removeItem("post_register_action");
  }, 1000);
  return;
}

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

    // ⚠️ NÃO sobrescreve role
    if (!localStorage.getItem("role")) {
      localStorage.setItem("role", user.role);
    }

    localStorage.setItem("nome", user.nome);

  } catch (e) {
  console.warn("Sessão inválida no header");

  // 🔥 limpa sessão quebrada
  localStorage.clear();

  // 🔁 redireciona com segurança
  if (!window.location.pathname.includes("index")) {
    window.location.href = "/index.html";
  }
}
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

// =========================================================
// 🏠 LOGO → HOME POR ROLE (delegação global)
// =========================================================
document.addEventListener("click", (e) => {
  const logo = e.target.closest(".logo-app");
  if (!logo) return;

  const role = localStorage.getItem("role");

  if (role === "modelo") {
    window.location.href = "/profile.html";
  } else if (role === "cliente") {
    window.location.href = "/clientHome.html";
  } else {
    window.location.href = "/index.html";
  }
});

// =========================================================
// 💬 BOTÃO DE MENSAGENS → CHAT POR ROLE
// =========================================================
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#btnMensagem");
  if (!btn) return;

  const role = localStorage.getItem("role");

  if (role === "cliente") {
    window.location.href = "/inbox.html";
  } else if (role === "modelo") {
    window.location.href = "/inbox.html";
  } else {
    abrirPopupVelvet({ tipo: "login" });
  }
});

// =========================================================
// LOGOUT 
// =========================================================
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#btnLogout");
  if (!btn) return;

  e.preventDefault();

  // limpa tudo da sessão
  localStorage.clear();

  // vai para o index
  window.location.href = "/index.html";
});


