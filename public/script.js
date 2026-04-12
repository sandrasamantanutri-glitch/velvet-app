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

// ===============================
// INDEX — VELVET
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
        // token inválido → limpa e segue como visitante
        localStorage.clear();
      }
    })
    .catch(() => {
      localStorage.clear();
    });
}

const refModelo = localStorage.getItem("ref_modelo");
const srcOrigem = localStorage.getItem("origem_trafego");

// ===============================
// I18N
const DEFAULT_LANG = "pt";

const TRANSLATIONS = {
  pt: {
    enter: "Entrar",
    createAccount: "Criar conta",
    forgotPassword: "Esqueci minha senha",
    contact: "Contato",
    termsOfUse: "Termos de Uso",
    usagePolicies: "Políticas de Utilização",
    privacyPolicies: "Políticas de Privacidade",
    loginTitle: "Entrar",
    registerTitle: "Criar Conta",
    email: "Email",
    password: "Senha",
    repeatPassword: "Repita a sua senha",
    fullName: "Nome Completo",
    birthDate: "Data de Nascimento",
    wantMember: "Quero ser membro",
    wantCreator: "Quero criar conteúdo",
    registerLegalText: "Ao criar meu registro, declaro ter mais de 18 anos e estar de acordo com os",
    alreadyHaveAccount: "Já tem conta?",
    noAccount: "Não tem conta?",
    loginAction: "Entrar",
    registerAction: "Criar conta",
    forgotTitle: "Recuperar senha",
    registeredEmailPlaceholder: "Seu email cadastrado",
    sendCode: "Enviar código",
    spamHint: "Se não encontrar o email, verifique o lixo eletrônico ou spam.",
    rememberedPassword: "Lembrou da senha?",
    backToLogin: "Voltar ao login",
    codePlaceholder: "Código de 6 dígitos",
    newPasswordPlaceholder: "Nova senha",
    confirmNewPasswordPlaceholder: "Confirmar nova senha",
    changePassword: "Alterar senha",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Senha",
    registerRepeatPasswordPlaceholder: "Repita a sua senha",
    fullNamePlaceholder: "Nome completo",
    birthDatePlaceholder: "",
    ageGateTitle: "Alguns conteúdos desta plataforma podem não ser adequados para menores de 18 anos",
    ageGateText: "Ao continuar, você declara que possui 18 anos ou mais e concorda com os Termos e Políticas da Velvet disponíveis para consulta em nossa pagina inicial.",
    ageGateConfirm: "Sou maior de 18",
    ageGateDeny: "Sou menor",
    mustBeAdult: "Para respeitar os termos legais, você deve ter 18 anos ou mais para acessar a plataforma.",
    fillEmailPassword: "Preencha email e senha",
    invalidLogin: "Login e/ou senha inválidos",
    passwordMismatch: "As senhas não coincidem",
    passwordMinLength: "A senha deve ter pelo menos 6 caracteres",
    fillAllFields: "Preencha todos os campos",
    registerError: "Erro ao criar conta",
    enterYourEmail: "Digite seu email",
    resetError: "Erro ao redefinir senha",
    passwordChangedSuccess: "Senha alterada com sucesso! Faça login.",
    wantCreator: "Quero ser criador",
    howItWorks: "Como funciona",
    stepCreateAccount: "Cria a tua conta",
    stepDiscover: "Descobre criadores",
    stepConnect: "Conecta e interage",
    stepMedia: "Acede ás mídias do criador"
    },

  en: {
    enter: "Sign in",
    createAccount: "Create account",
    forgotPassword: "Forgot my password",
    contact: "Contact",
    termsOfUse: "Terms of Use",
    usagePolicies: "Usage Policies",
    privacyPolicies: "Privacy Policy",
    loginTitle: "Sign in",
    registerTitle: "Create Account",
    email: "Email",
    password: "Password",
    repeatPassword: "Repeat your password",
    fullName: "Full Name",
    birthDate: "Date of Birth",
    wantMember: "I want to be a member",
    wantCreator: "I want to create content",
    registerLegalText: "By creating my account, I declare that I am over 18 years old and agree to the",
    alreadyHaveAccount: "Already have an account?",
    noAccount: "Don't have an account?",
    loginAction: "Sign in",
    registerAction: "Create account",
    forgotTitle: "Reset password",
    registeredEmailPlaceholder: "Your registered email",
    sendCode: "Send code",
    spamHint: "If you can't find the email, check your junk mail or spam folder.",
    rememberedPassword: "Remembered your password?",
    backToLogin: "Back to login",
    codePlaceholder: "6-digit code",
    newPasswordPlaceholder: "New password",
    confirmNewPasswordPlaceholder: "Confirm new password",
    changePassword: "Change password",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    registerRepeatPasswordPlaceholder: "Repeat your password",
    fullNamePlaceholder: "Full name",
    birthDatePlaceholder: "",
    birthDatePlaceholder: "",
    ageGateTitle: "Some content on this platform may not be suitable for users under 18 years old",
    ageGateText: "By continuing, you confirm that you are 18 years of age or older and agree to Velvet's Terms and Policies available on our homepage.",
    ageGateConfirm: "I am 18 or older",
    ageGateDeny: "I am under 18",
    mustBeAdult: "To comply with legal terms, you must be 18 years of age or older to access the platform.",
    fillEmailPassword: "Enter your email and password",
    invalidLogin: "Invalid email and/or password",
    passwordMismatch: "Passwords do not match",
    passwordMinLength: "Password must be at least 6 characters long",
    fillAllFields: "Fill in all fields",
    registerError: "Error creating account",
    enterYourEmail: "Enter your email",
    resetError: "Error resetting password",
    passwordChangedSuccess: "Password changed successfully! Please sign in.",
    wantCreator: "I want to be a creator",
    howItWorks: "How it works",
    stepCreateAccount: "Create your account",
    stepDiscover: "Discover creators",
    stepConnect: "Connect and interact",
    stepMedia: "Access the creator's media"
    
  },

  es: {
    enter: "Entrar",
    createAccount: "Crear cuenta",
    forgotPassword: "Olvidé mi contraseña",
    contact: "Contacto",
    termsOfUse: "Términos de Uso",
    usagePolicies: "Políticas de Uso",
    privacyPolicies: "Políticas de Privacidad",
    loginTitle: "Entrar",
    registerTitle: "Crear Cuenta",
    email: "Correo electrónico",
    password: "Contraseña",
    repeatPassword: "Repite tu contraseña",
    fullName: "Nombre completo",
    birthDate: "Fecha de nacimiento",
    wantMember: "Quiero ser miembro",
    wantCreator: "Quiero crear contenido",
    registerLegalText: "Al crear mi registro, declaro que tengo más de 18 años y que estoy de acuerdo con",
    alreadyHaveAccount: "¿Ya tienes cuenta?",
    noAccount: "¿No tienes cuenta?",
    loginAction: "Entrar",
    registerAction: "Crear cuenta",
    forgotTitle: "Recuperar contraseña",
    registeredEmailPlaceholder: "Tu correo registrado",
    sendCode: "Enviar código",
    spamHint: "Si no encuentras el correo, revisa la carpeta de correo no deseado o spam.",
    rememberedPassword: "¿Recordaste tu contraseña?",
    backToLogin: "Volver al inicio de sesión",
    codePlaceholder: "Código de 6 dígitos",
    newPasswordPlaceholder: "Nueva contraseña",
    confirmNewPasswordPlaceholder: "Confirmar nueva contraseña",
    changePassword: "Cambiar contraseña",
    emailPlaceholder: "Correo electrónico",
    passwordPlaceholder: "Contraseña",
    registerRepeatPasswordPlaceholder: "Repite tu contraseña",
    fullNamePlaceholder: "Nombre completo",
    birthDatePlaceholder: "",
    ageGateTitle: "Algunos contenidos de esta plataforma pueden no ser adecuados para menores de 18 años",
    ageGateText: "Al continuar, declaras que tienes 18 años o más y aceptas los Términos y Políticas de Velvet disponibles para consulta en nuestra página de inicio.",
    ageGateConfirm: "Soy mayor de 18",
    ageGateDeny: "Soy menor",
    mustBeAdult: "Para cumplir con los términos legales, debes tener 18 años o más para acceder a la plataforma.",
    fillEmailPassword: "Completa correo y contraseña",
    invalidLogin: "Correo y/o contraseña inválidos",
    passwordMismatch: "Las contraseñas no coinciden",
    passwordMinLength: "La contraseña debe tener al menos 6 caracteres",
    fillAllFields: "Completa todos los campos",
    registerError: "Error al crear la cuenta",
    enterYourEmail: "Escribe tu correo",
    resetError: "Error al restablecer la contraseña",
    passwordChangedSuccess: "¡Contraseña cambiada con éxito! Inicia sesión.",
    wantCreator: "Quiero ser creador",
    howItWorks: "Cómo funciona",
    stepCreateAccount: "Crea tu cuenta",
    stepDiscover: "Descubre creadores",
    stepConnect: "Conecta e interactúa",
    stepMedia: "Accede a las mídias del creador"
    }
};

function getCurrentLang() {
  return localStorage.getItem("lang") || DEFAULT_LANG;
}

function t(key) {
  const lang = getCurrentLang();
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS[DEFAULT_LANG]?.[key] || key;
}

function applyTranslations() {
  const lang = getCurrentLang();

  document.documentElement.lang =
    lang === "pt" ? "pt-BR" :
    lang === "en" ? "en" :
    lang === "es" ? "es" : "pt-BR";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = t(key);
  });
}

// ===============================
// ESTADO GLOBAL

let modalMode = "login"; 
let pendingAction = null; 

// ===============================
// AGE GATE
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
    alert(t("mustBeAdult"));
    
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
}


// ===============================
// LOGIN / REGISTER
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
title.textContent = t("loginTitle");
submit.textContent = t("loginAction");
    submit.onclick = login;

    // 🔒 esconder TODOS os campos de registo
    registerFields.forEach(id =>
      document.getElementById(id)?.classList.add("hidden")
    );

    switchRegister.classList.remove("hidden");
    switchLogin.classList.add("hidden");

  } else {
title.textContent = t("registerTitle");
submit.textContent = t("registerAction");
    submit.onclick = register;

    // 🔓 mostrar TODOS os campos de registo
    registerFields.forEach(id =>
      document.getElementById(id)?.classList.remove("hidden")
    );

    switchRegister.classList.add("hidden");
    switchLogin.classList.remove("hidden");
  }
}

// ===============================
// LOGIN
async function login() {
  const email = loginEmail.value.trim();
  const senha = loginSenha.value.trim();

  // validação básica
  if (!email || !senha) {
    alert(t("fillEmailPassword"));
    return;
  }

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || t("invalidLogin"));
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

// ===============================
// REGISTER
async function register() {
  const email = loginEmail.value.trim();
  const senha = loginSenha.value.trim();
  const senhaConfirm = registerSenhaConfirm.value.trim();
  const role = registerRole.value;
  const nome = registerNome.value.trim();
  const nascimento = registerNascimento.value;

  if (senha !== senhaConfirm) {
    alert(t("passwordMismatch"));
    return;
  }

  if (senha.length < 6) {
    alert(t("passwordMinLength"));
    return;
  }

  if (!email || !senha || !senhaConfirm || !role || !nome || !nascimento) {
    alert(t("fillAllFields"));
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
    alert(data.error || t("registerError"));
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

// ===============================
// MODAL LEGAL (TERMOS / POLÍTICAS)
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

// ===============================
// ESQUECI MINHA SENHA – MODAL
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
  const email = document.getElementById("forgotEmail").value.trim();
  if (!email) {
   alert(t("enterYourEmail"));
    return;
  }

  await fetch("/api/password/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  document.getElementById("forgotSpamHint").classList.remove("hidden");
  document.getElementById("forgotStepEmail").classList.add("hidden");
  document.getElementById("forgotStepCode").classList.remove("hidden");
}

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
   alert(t("fillAllFields"));
    return;
  }

  if (novaSenha !== confirmarSenha) {
    alert(t("passwordMismatch"));
    return;
  }

  if (novaSenha.length < 6) {
    alert(t("passwordMinLength"));
    return;
  }

  const res = await fetch("/api/password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, codigo, novaSenha })
  });

  const data = await res.json();

  if (!res.ok) {
   alert(data.error || t("resetError"));
    return;
  }

  alert(t("passwordChangedSuccess"));
  closeForgotModal();
  openLoginModal();
}

function setupLanguageSwitcher() {
  const select = document.getElementById("languageSwitcher");
  if (!select) return;

  select.value = getCurrentLang();

select.addEventListener("change", (e) => {
  localStorage.setItem("lang", e.target.value);
  applyTranslations();
  updateModal();
});
}

document.addEventListener("DOMContentLoaded", () => {
  setupLanguageSwitcher();
  applyTranslations();
});

