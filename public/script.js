// ===============================
// LOGIN / REGISTER — INDEX
// ===============================

// Se já estiver logado, redireciona
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (token && role) {
  if (role === "modelo") {
    window.location.href = "/profile.html";
  } else if (role === "cliente") {
    window.location.href = "/clientHome.html";
  }
}

// ===============================
// MODAL STATE
// ===============================
let modalMode = "login"; // login | register

// ===============================
// UI CONTROLS
// ===============================
function selectRole() {
  openLoginModal();
}

function openLoginModal() {
  modalMode = "login";
  updateModal();
  document.getElementById("loginModal").classList.remove("hidden");
}

function closeLoginModal() {
  document.getElementById("loginModal").classList.add("hidden");
}

function switchToRegister() {
  modalMode = "register";
  updateModal();
}

function switchToLogin() {
  modalMode = "login";
  updateModal();
}

function updateModal() {
  const title = document.getElementById("modalTitle");
  const submit = document.getElementById("modalSubmit");
  const roleSelect = document.getElementById("registerRole");
  const switchLogin = document.getElementById("switchToLogin");
  const switchRegister = document.querySelector(".modal-switch");

  if (modalMode === "login") {
    title.textContent = "Entrar no Velvet";
    submit.textContent = "Entrar";
    submit.onclick = login;
    roleSelect.classList.add("hidden");
    switchRegister.classList.remove("hidden");
    switchLogin.classList.add("hidden");
  } else {
    title.textContent = "Criar conta no Velvet";
    submit.textContent = "Criar conta";
    submit.onclick = register;
    roleSelect.classList.remove("hidden");
    switchRegister.classList.add("hidden");
    switchLogin.classList.remove("hidden");
  }
}

// ===============================
// LOGIN
// ===============================
async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value.trim();

  if (!email || !senha) {
    alert("Preencha email e senha");
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.erro || "Erro no login");
      return;
    }

    // 🔐 SALVAR SESSÃO
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);

    // 🔁 REDIRECIONAR
    if (data.role === "modelo") {
      window.location.href = "/profile.html";
    } else {
      window.location.href = "/clientHome.html";
    }

  } catch (err) {
    console.error(err);
    alert("Erro de conexão com o servidor");
  }
}

// ===============================
// REGISTER
// ===============================
async function register() {
  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value.trim();
  const role  = document.getElementById("registerRole").value;

  if (!email || !senha || !role) {
    alert("Preencha todos os campos");
    return;
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        senha,
        role,
        nome: email.split("@")[0]
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.erro || "Erro ao criar conta");
      return;
    }

    alert("Conta criada com sucesso! Agora faça login.");
    switchToLogin();

  } catch (err) {
    console.error(err);
    alert("Erro de conexão com o servidor");
  }
}

// ===============================
// LOGOUT (caso reutilize)
// ===============================
function logout() {
  localStorage.clear();
  window.location.href = "/index.html";
}



