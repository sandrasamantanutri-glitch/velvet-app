if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
      console.log("Service worker registrado");
    } catch (err) {
      console.error("Erro ao registrar service worker:", err);
    }
  });
}

window.token = localStorage.getItem("token");

const ESTA_NO_INDEX =
  window.location.pathname === "/" ||
  window.location.pathname.includes("index");

// apenas valida sessão
if (ESTA_NO_INDEX && token) {
  fetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  })
    .then(res => {
      if (!res.ok) {
        localStorage.clear();
      }
    })
    .catch(() => {
      localStorage.clear();
    });
}

const refModelo = localStorage.getItem("ref_modelo");
const srcOrigem = localStorage.getItem("origem_trafego");

// ESTADO GLOBAL

let modalMode = "login"; 
let pendingAction = null; 

window.openAgeGate = function (action) {

  // 🔥 LOGIN NÃO PASSA PELO AGE GATE
  if (action === "login") {
  closeAllModals();
  openLoginModal();
  return;
}

  // 🔐 REGISTRO PASSA PELO AGE GATE
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
    alert(t("index.mustBeAdult"));
    
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
  document.getElementById("forgotModal")?.classList.add("hidden");
}

window.selectRole = function () {
  openLoginModal();
};

window.startRegister = function () {
  localStorage.removeItem("ageConfirmed");
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
  localStorage.removeItem("ageConfirmed");
  updateModal();
}

window.switchToLogin = function () {
  modalMode = "login";
  updateModal();
};

function updateModal() {
  const title = document.getElementById("modalTitle");
  const submit = document.getElementById("modalSubmit");
  const switchLogin = document.getElementById("switchToLogin");
  const switchRegister = document.getElementById("switchToRegister");

  const registerFields = [
    "fieldSenha",
    "fieldNome",
    "fieldNascimento",
    "fieldPerfil"
  ];

  if (modalMode === "login") {
title.textContent = t("index.loginTitle");
submit.textContent = t("index.loginAction");
    submit.onclick = login;

    // 🔒 esconder TODOS os campos de registo
    registerFields.forEach(id =>
      document.getElementById(id)?.classList.add("hidden")
    );

    switchRegister.classList.remove("hidden");
    switchLogin.classList.add("hidden");

  } else {
title.textContent = t("index.registerTitle");
submit.textContent = t("index.registerAction");
    submit.onclick = register;

    // 🔓 mostrar TODOS os campos de registo
    registerFields.forEach(id =>
      document.getElementById(id)?.classList.remove("hidden")
    );

    switchRegister.classList.add("hidden");
    switchLogin.classList.remove("hidden");
  }
}

async function login() {
const email = loginEmail.value;
const senha = loginSenha.value;

  // validação básica
  if (!email || !senha) {
    alert(t("index.fillEmailPassword"));
    return;
  }

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || t("index.invalidLogin"));
    return;
  }

 localStorage.setItem("token", data.token);
localStorage.setItem("role", data.role);
localStorage.setItem("ageConfirmed", "true");

if (data.role === "modelo") {
  localStorage.setItem("modelo_id", data.modelo_id);
}

const actionRaw = localStorage.getItem("post_login_action");
const redirect = localStorage.getItem("redirect_after_auth");

let action = null;

try {
  action = actionRaw ? JSON.parse(actionRaw) : null;
} catch (e) {
  console.warn("post_login_action inválido:", actionRaw);
}

if (redirect) {
  localStorage.removeItem("redirect_after_auth");
  localStorage.removeItem("post_login_action");
  localStorage.removeItem("post_register_action");
  window.location.href = redirect;
  return;
}

window.location.href = "/feed.html";
}

async function register() {
const email = loginEmail.value;
const senha = loginSenha.value;
const senhaConfirm = registerSenhaConfirm.value;
const nome = registerNome.value;
const nascimento = registerNascimento.value;

  if (senha !== senhaConfirm) {
    alert(t("index.passwordMismatch"));
    return;
  }

  if (senha.length < 6) {
    alert(t("index.passwordMinLength"));
    return;
  }

  if (!email || !senha || !senhaConfirm || !role || !nome || !nascimento) {
    alert(t("index.fillAllFields"));
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
      nome_completo: nome,
      data_nascimento: nascimento,
      ageConfirmed: true
    })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || t("index.registerError"));
    return;
  }

  localStorage.setItem("token", data.token);
  localStorage.setItem("role", data.role);
  localStorage.setItem("ageConfirmed", "true");

  if (data.cliente_id) {
    localStorage.setItem("cliente_id", data.cliente_id);
  }

const actionRaw =
  localStorage.getItem("post_register_action") ||
  localStorage.getItem("post_login_action");

const redirect = localStorage.getItem("redirect_after_auth");

let action = null;

try {
  action = actionRaw ? JSON.parse(actionRaw) : null;
} catch (e) {
  console.warn("ação pós-auth inválida:", actionRaw);
}

const destinoFinal = redirect || action?.redirect;

if (destinoFinal) {
  localStorage.removeItem("redirect_after_auth");
  localStorage.removeItem("post_login_action");
  localStorage.removeItem("post_register_action");
  window.location.href = destinoFinal;
  return;
}

window.location.href = "/feed.html";
}

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
  window.location.href = "/index.html";
};

function openForgot() {
  closeAllModals();
  document.getElementById("forgotModal").classList.remove("hidden");
  document.getElementById("forgotStepEmail").classList.remove("hidden");
  document.getElementById("forgotStepCode").classList.add("hidden");
}

function closeForgotModal() {
  document.getElementById("forgotModal").classList.add("hidden");
}

async function sendResetCode() {
 const email = document.getElementById("forgotEmail").value;
  if (!email) {
    alert(t("index.enterYourEmail"));
    return;
  }

  // troca o step PRIMEIRO, independente do servidor
  document.getElementById("forgotSpamHint").classList.remove("hidden");
  document.getElementById("forgotStepEmail").classList.add("hidden");
  document.getElementById("forgotStepCode").classList.remove("hidden");

  fetch("/api/password/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  }).catch(() => {});
}

async function confirmReset() {
const email = document.getElementById("forgotEmail").value;
const codigo = document.getElementById("forgotCode").value;
const novaSenha = document.getElementById("forgotNewPassword").value;
const confirmarSenha = document.getElementById("forgotConfirmPassword").value;

  if (!codigo || !novaSenha || !confirmarSenha) {
   alert(t("index.fillAllFields"));
    return;
  }

  if (novaSenha !== confirmarSenha) {
    alert(t("index.passwordMismatch"));
    return;
  }

  if (novaSenha.length < 6) {
    alert(t("index.passwordMinLength"));
    return;
  }

  const res = await fetch("/api/password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, codigo, novaSenha })
  });

  const data = await res.json();

  if (!res.ok) {
   alert(data.error || t("index.resetError"));
    return;
  }

  alert(t("index.passwordChangedSuccess"));
  closeForgotModal();
  openLoginModal();
}

document.addEventListener("DOMContentLoaded", async () => {
  await whenI18nReady();
  updateModal();
});
