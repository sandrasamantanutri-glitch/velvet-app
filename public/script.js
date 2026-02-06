// ===============================
// INDEX — SCRIPT LIMPO (VELVET)
// ===============================

// 🔁 REDIRECIONAMENTO SE LOGADO
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (token && role) { // * && * true
  window.location.href =
    role === "modelo" ? "/perfil.html" : "/clientHome.html";
}

const ref = localStorage.getItem("ref_modelo");
const src = localStorage.getItem("origem_trafego");

// ===============================
// ESTADO GLOBAL

let modalMode = "login"; 
let pendingAction = null; 

// AGE GATE
// ===============================
window.openAgeGate = function (action) {
  pendingAction = action;

  const confirmed = localStorage.getItem("ageConfirmed");
  if (confirmed === "true") {
    proceedAfterAge();
    return;
  }

  closeAllModals();
  document.getElementById("ageModal")?.classList.remove("hidden");
};

function confirmAge(isAdult) {
  if (!isAdult) {
    alert("Você precisa ter 18 anos ou mais para acessar a Plataforma.");
    
    document.getElementById("ageModal")?.classList.add("hidden");
    window.location.href = "/index.html";
    return;
  }

  localStorage.setItem("ageConfirmed", "true");
  document.getElementById("ageModal")?.classList.add("hidden");
  proceedAfterAge();
}

function proceedAfterAge() {
  if (pendingAction === "login") {
    openLoginModal();
  }

  if (pendingAction === "register") {
    openLoginModal();
    setRegisterMode();
  }

  pendingAction = null;
}

function closeAllModals() {
  document.getElementById("loginModal")?.classList.add("hidden");
  document.getElementById("legalModal")?.classList.add("hidden");
  document.getElementById("ageModal")?.classList.add("hidden");
}


// ===============================
// MODAL LOGIN / REGISTER
// ===============================
window.selectRole = function () {
  openLoginModal();
};

window.startRegister = function () {
  openAgeGate("register");
};

function openLoginModal() {
  modalMode = "login";
  updateModal();
  document.getElementById("loginModal")?.classList.remove("hidden");
}

window.closeLoginModal = function () {
  document.getElementById("loginModal")?.classList.add("hidden");
};

function setRegisterMode() {
  modalMode = "register";
  updateModal();
}

window.switchToLogin = function () {
  modalMode = "login";
  updateModal();
};

function updateModal() {
  const title = document.getElementById("modalTitle");
  const submit = document.getElementById("modalSubmit");
  const roleSelect = document.getElementById("registerRole");

  const nome = document.getElementById("registerNome");
  const nascimento = document.getElementById("registerNascimento");
  const senhaConfirm = document.getElementById("registerSenhaConfirm");
  const legal = document.getElementById("registerLegal");

  const switchLogin = document.getElementById("switchToLogin");
  const switchRegister = document.querySelector(".modal-switch");

  if (modalMode === "login") {
    title.textContent = "Entrar";
    submit.textContent = "Entrar";
    submit.onclick = login;
    roleSelect.classList.add("hidden");
    switchRegister.classList.remove("hidden");
    switchLogin.classList.add("hidden");
  } else {
    title.textContent = "Criar Conta";
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
  const email = loginEmail.value.trim();
  const senha = loginSenha.value.trim();

  if (!email || !senha) {
    alert("Preencha email e senha");
    return;
  }

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha })
  });

  const data = await res.json();
  if (!res.ok) return alert(data.erro);

  localStorage.setItem("token", data.token);
  localStorage.setItem("role", data.role);

  if (data.role === "modelo") {
  window.location.href = "/perfil.html";
  return;
}
// 🔥 CLIENTE
if (ref) {
  // simula clique no feed
  localStorage.setItem("modelo_id", ref);
  localStorage.removeItem("ref_modelo");

  window.location.href = "/perfil.html";
} else {
  window.location.href = "/clientHome.html";
}

}
// ===============================
// REGISTER
// ===============================

async function register() {
  const email = loginEmail.value.trim();
  const senha = loginSenha.value.trim();
  const senhaConfirm = registerSenhaConfirm.value.trim();
  const role = registerRole.value;
  const nome = registerNome.value.trim();
  const nascimento = registerNascimento.value;

  if (!email || !senha || !senhaConfirm || !role || !nome || !nascimento) {
    alert("Preencha todos os campos");
    return;
  }

  if (senha !== senhaConfirm) {
    alert("As senhas não coincidem");
    return;
  }

  if (senha.length < 6) {
    alert("A senha deve ter pelo menos 6 caracteres");
    return;
  }

  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      senha,
      role,
      nome,
      data_nascimento: nascimento,
      ageConfirmed: true
    })
  });

  const data = await res.json();
if (!res.ok) {
  alert(data.erro || "Erro ao criar conta");
  return;
}

// 🔐 LOGIN AUTOMÁTICO APÓS REGISTRO
localStorage.setItem("token", data.token);
localStorage.setItem("role", data.role);

// opcional, se backend já devolver
if (data.role === "cliente" && data.cliente_id) {
  localStorage.setItem("cliente_id", data.cliente_id);
}

alert("Conta criada com sucesso!");

// 📍 DECIDE O FLUXO PELO CONTEXTO
const ESTA_NO_PERFIL = window.location.pathname.includes("perfil");

if (ESTA_NO_PERFIL) {
  // 🔥 abre popup de pagamento (pag.js já está carregado)
  document
    .getElementById("escolhaPagamento")
    ?.classList.remove("hidden");
} else {
  // 🏠 index → vai para home do cliente
  window.location.href = "/clientHome.html";
}
}

// ===============================
// MODAL LEGAL (TERMOS / POLÍTICAS)
// ===============================
window.openLegalModal = function (event, url) {
  event.preventDefault();

  closeAllModals();

  const modal = document.getElementById("legalModal");
  const iframe = document.getElementById("modalFrame");

  if (!modal || !iframe) {
    console.error("❌ Modal legal não encontrado no DOM");
    return;
  }

  iframe.src = url;
  modal.classList.remove("hidden");
};

window.closeLegalModal = function () {
  const modal = document.getElementById("legalModal");
  const iframe = document.getElementById("modalFrame");

  if (iframe) iframe.src = "";
  if (modal) modal.classList.add("hidden");
};



window.logout = function () {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("ageConfirmed"); 
  window.location.href = "https://www.velvet.lat";
};

// ===============================
// ESQUECI MINHA SENHA – MODAL
// ===============================

function openForgot() {
  closeAllModals();
  document.getElementById("forgotModal").classList.remove("hidden");
  document.getElementById("forgotStepEmail").classList.remove("hidden");
  document.getElementById("forgotStepCode").classList.add("hidden");
}

function closeForgotModal() {
  document.getElementById("forgotModal").classList.add("hidden");
}

// 1️⃣ envia código
async function sendResetCode() {
  const email = document.getElementById("forgotEmail").value.trim();
  if (!email) {
    alert("Digite seu email");
    return;
  }

  await fetch("/api/password/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
   // mostra aviso de spam
  document.getElementById("forgotSpamHint").classList.remove("hidden");

  // troca step
  document.getElementById("forgotStepEmail").classList.add("hidden");
  document.getElementById("forgotStepCode").classList.remove("hidden");
}

// 2️⃣ confirma código + nova senha
async function confirmReset() {
  const email = document.getElementById("forgotEmail").value.trim();
  const codigo = document.getElementById("forgotCode").value.trim();
  const novaSenha = document
    .getElementById("forgotNewPassword")
    .value.trim();
  const confirmarSenha = document
    .getElementById("forgotConfirmPassword")
    .value.trim();

  if (!codigo || !novaSenha || !confirmarSenha) {
    alert("Preencha todos os campos");
    return;
  }

  if (novaSenha !== confirmarSenha) {
    alert("As senhas não coincidem");
    return;
  }

  if (novaSenha.length < 6) {
    alert("A senha deve ter pelo menos 6 caracteres");
    return;
  }

  const res = await fetch("/api/password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, codigo, novaSenha })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || "Erro ao redefinir senha");
    return;
  }

  alert("Senha alterada com sucesso! Faça login.");
  closeForgotModal();
  openLoginModal();
}



