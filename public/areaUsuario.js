const token = localStorage.getItem("token");

const idioma = localStorage.getItem("idioma") || "pt";

const translations = {
  pt: {
    page_title_user_area: "Área de Usuário",
    vip_subscribers: "assinantes VIP",
    earnings_today: "Ganhos de Hoje",
    earnings_month: "Ganhos do Mês",
    user_area: "Área de Usuário",
    creator_area: "Área do Criador",
    my_profile: "Meu Perfil",
    my_profile_desc: "Atualize suas informações de usuário",
    account: "Conta",
    account_desc: "Valide sua conta para começar a ganhar e atualize dados pessoais",
    chat: "Chat",
    chat_desc: "Aceda seu chat inbox",
    subscriptions_payments: "Assinaturas e Pagamentos",
    subscriptions_payments_desc: "Verifique suas assinaturas e transações financeiras",
    help: "Ajuda",
    help_desc: "Entre em contato com o suporte",
    contents: "Conteúdos",
    contents_desc: "Faça gestão das suas mídias privadas do chat",
    ppv: "PPV",
    ppv_desc: "Envie mensagem em massa para todos assinantes",
    subscription_offers: "Assinatura e Ofertas",
    subscription_offers_desc: "Defina o valor de sua assinatura e crie promoções",
    links: "Links",
    links_desc: "Link do seu perfil para divulgar nas redes sociais",
    earnings: "Ganhos",
    earnings_desc: "Seus ganhos diários, mensais e anuais",
    user_manual: "Manual de Usuário",
    user_manual_desc: "Baixar o guia completo de utilização da plataforma",
    terms_of_use: "Termos de Uso",
    privacy_policy: "Política de Privacidade",
    usage_policy: "Política de Utilização",
    footer_copy: "© 2026 Velvet. Todos os direitos reservados.",
    banner_validate_account: "Valide sua conta para começar a ganhar dinheiro com suas assinaturas VIP!",
    login_required: "Para ter acesso a essa página deve fazer seu login ou seu cadastro.",
    status_approved: "Dados pessoais aprovados. Alterações não são permitidas.",
    status_in_review: "Seus dados estão em análise.",
    status_rejected: "Dados rejeitados. Corrija as informações e envie novamente.",
    subscribers_load_error: "Erro ao carregar assinantes",
    no_subscribers_found: "Nenhum assinante encontrado",
    link_copied: "Link copiado!",
    personal_data_locked: "Seus dados pessoais já foram aprovados e não podem ser alterados.",
    personal_data_save_error: "Erro ao salvar dados pessoais",
    personal_data_connection_error: "Erro de conexão ao salvar os dados",
    personal_data_saved: "Dados pessoais salvos com sucesso",
    name_required: "O nome é obrigatório",
    data_save_error: "Erro ao salvar dados",
    data_saved: "Dados salvos com sucesso",
    profile_cover_alt: "Capa do perfil",
    change_cover_title: "Alterar capa",
    profile_avatar_alt: "Foto de Perfil",
    change_avatar_title: "Alterar avatar",
    vip_subscribers_desc: "Acompanhe de perto seus seguidores"
  },

  en: {
    page_title_user_area: "User Area",
    vip_subscribers: "VIP subscribers",
    earnings_today: "Today's Earnings",
    earnings_month: "Monthly Earnings",
    user_area: "User Area",
    creator_area: "Creator Area",
    my_profile: "My Profile",
    my_profile_desc: "Update your user information",
    account: "Account",
    account_desc: "Verify your account to start earning and update personal data",
    chat: "Chat",
    chat_desc: "Access your inbox chat",
    subscriptions_payments: "Subscriptions and Payments",
    subscriptions_payments_desc: "Check your subscriptions and financial transactions",
    help: "Help",
    help_desc: "Contact support",
    contents: "Content",
    contents_desc: "Manage your private chat media",
    ppv: "PPV",
    ppv_desc: "Send mass messages to all subscribers",
    subscription_offers: "Subscription and Offers",
    subscription_offers_desc: "Set your subscription price and create promotions",
    links: "Links",
    links_desc: "Your profile link to share on social media",
    earnings: "Earnings",
    earnings_desc: "Your daily, monthly and yearly earnings",
    user_manual: "User Manual",
    user_manual_desc: "Download the complete platform usage guide",
    terms_of_use: "Terms of Use",
    privacy_policy: "Privacy Policy",
    usage_policy: "Usage Policy",
    footer_copy: "© 2026 Velvet. All rights reserved.",
    banner_validate_account: "Verify your account to start earning money from your VIP subscriptions!",
    login_required: "To access this page, you must log in or create an account.",
    status_approved: "Personal data approved. Changes are not allowed.",
    status_in_review: "Your data is under review.",
    status_rejected: "Data rejected. Correct the information and submit again.",
    subscribers_load_error: "Error loading subscribers",
    no_subscribers_found: "No subscribers found",
    link_copied: "Link copied!",
    personal_data_locked: "Your personal data has already been approved and cannot be changed.",
    personal_data_save_error: "Error saving personal data",
    personal_data_connection_error: "Connection error while saving personal data",
    personal_data_saved: "Personal data saved successfully",
    name_required: "Name is required",
    data_save_error: "Error saving data",
    data_saved: "Data saved successfully",
    profile_cover_alt: "Profile cover",
    change_cover_title: "Change cover",
    profile_avatar_alt: "Profile picture",
    change_avatar_title: "Change profile picture",
    vip_subscribers_desc: "Follow your subscribers closely"
  },

  es: {
    page_title_user_area: "Área de Usuario",
    vip_subscribers: "suscriptores VIP",
    earnings_today: "Ganancias de Hoy",
    earnings_month: "Ganancias del Mes",
    user_area: "Área de Usuario",
    creator_area: "Área del Creador",
    my_profile: "Mi Perfil",
    my_profile_desc: "Actualiza tu información de usuario",
    account: "Cuenta",
    account_desc: "Valida tu cuenta para empezar a ganar y actualiza tus datos personales",
    chat: "Chat",
    chat_desc: "Accede a tu chat inbox",
    subscriptions_payments: "Suscripciones y Pagos",
    subscriptions_payments_desc: "Consulta tus suscripciones y transacciones financieras",
    help: "Ayuda",
    help_desc: "Ponte en contacto con soporte",
    contents: "Contenidos",
    contents_desc: "Gestiona tus medios privados del chat",
    ppv: "PPV",
    ppv_desc: "Envía mensajes masivos a todos los suscriptores",
    subscription_offers: "Suscripción y Ofertas",
    subscription_offers_desc: "Define el valor de tu suscripción y crea promociones",
    links: "Links",
    links_desc: "Link de tu perfil para divulgar en redes sociales",
    earnings: "Ganancias",
    earnings_desc: "Tus ganancias diarias, mensuales y anuales",
    user_manual: "Manual de Usuario",
    user_manual_desc: "Descargar la guía completa de uso de la plataforma",
    terms_of_use: "Términos de Uso",
    privacy_policy: "Política de Privacidad",
    usage_policy: "Política de Utilización",
    footer_copy: "© 2026 Velvet. Todos los derechos reservados.",
    banner_validate_account: "¡Valida tu cuenta para empezar a ganar dinero con tus suscripciones VIP!",
    login_required: "Para acceder a esta página debes iniciar sesión o registrarte.",
    status_approved: "Datos personales aprobados. No se permiten cambios.",
    status_in_review: "Tus datos están en revisión.",
    status_rejected: "Datos rechazados. Corrige la información y envíala nuevamente.",
    subscribers_load_error: "Error al cargar suscriptores",
    no_subscribers_found: "No se encontraron suscriptores",
    link_copied: "¡Link copiado!",
    personal_data_locked: "Tus datos personales ya fueron aprobados y no pueden modificarse.",
    personal_data_save_error: "Error al guardar los datos personales",
    personal_data_connection_error: "Error de conexión al guardar los datos",
    personal_data_saved: "Datos personales guardados con éxito",
    name_required: "El nombre es obligatorio",
    data_save_error: "Error al guardar los datos",
    data_saved: "Datos guardados con éxito",
    profile_cover_alt: "Portada del perfil",
    change_cover_title: "Cambiar portada",
    profile_avatar_alt: "Foto de perfil",
    change_avatar_title: "Cambiar foto de perfil",
    vip_subscribers_desc: "Sigue de cerca a tus suscriptores"
  }
};

function t(key) {
  return translations[idioma]?.[key] || translations.pt[key] || key;
}

function getUsuarioLogado() {
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload; 
  } catch {
    return null;
  }
}

async function buscarDadosPessoais() {
  if (!token) return null;

  const res = await fetch("/api/usuario/perfil", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return null;
  return await res.json();
}

function paginaTem(id) {
  return document.getElementById(id) !== null;
}

function preencherFormulario(formId, dados) {
  const form = document.getElementById(formId);
  if (!form || !dados) return;

  Object.keys(dados).forEach((campo) => {
    if (form[campo] !== undefined) {
      form[campo].value = dados[campo] ?? "";
    }
  });
}

function bloquearFormulario(form) {
  if (!form) return;

  form.querySelectorAll("input, select, textarea, button").forEach(el => {
    el.disabled = true;
  });

  form.style.pointerEvents = "none";
  form.style.opacity = "0.6";
}


function mostrarStatusVerificacao(status) {
  const box = document.getElementById("statusVerificacao");
  if (!box) return;

  box.style.display = "block";
  box.className = "status-box";

if (status === "aprovado") {
  box.classList.add("status-aprovado");
  box.innerText = t("status_approved");
}

if (status === "em_analise") {
  box.innerText = t("status_in_review");
}

if (status === "rejeitado") {
  box.innerText = t("status_rejected");
}
}

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

document.addEventListener("DOMContentLoaded", async () => {
   aplicarTraducoes();
  const token = localStorage.getItem("token");
  if (!token) return;

  const res = await fetch("/api/me", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const user = await res.json();

  // 🔒 role REAL e confiável
  document.body.classList.add(`role-${user.role}`);

   if (user.role === "modelo") {
    const resDados = await fetch("/api/usuario/dados", {
      headers: { Authorization: "Bearer " + token }
    });

    if (resDados.ok) {
      const dados = await resDados.json();

      if (dados.status === "aprovado") {
        document.getElementById("areaBanner")?.classList.add("hidden");
      }
    }
  }

  // PERFIL VISUAL
  carregarPerfilBase(user);
  carregarDadosUsuario();
  carregarDadosPessoais();

  // SOMENTE MODELO
  if (user.role === "modelo") {
    carregarResumoModelo();
    carregarAreaModelo(user.id);

    if (document.getElementById("listaAssinantes")) {
      carregarAssinantes();
    }
  }
});


let assinantesCache = [];
let paginaAtual = 1;
const LIMITE_POR_PAGINA = 10;

async function carregarAssinantes() {
  const token = localStorage.getItem("token");
  if (!token) return;

  const tbody = document.getElementById("listaAssinantes");
  if (!tbody) return;

  try {
    const res = await fetch("/api/modelo/assinantes", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) throw new Error("Erro ao buscar assinantes");

    assinantesCache = await res.json();
    paginaAtual = 1;

    renderizarPagina();
    configurarBotoes();

  } catch (err) {
    console.error("Erro carregar assinantes:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="7">${t("subscribers_load_error")}</td>
      </tr>
    `;
  }
}

async function carregarPerfilBase(usuario) {
  const token = localStorage.getItem("token");
  if (!token || !usuario?.role) return;

  const endpoint =
    usuario.role === "modelo"
      ? "/api/modelo/me"
      : "/api/cliente/me";

  const res = await fetch(endpoint, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    console.error("Erro ao carregar perfil:", res.status);
    return;
  }

  const perfil = await res.json();

  // 📸 AVATAR
const avatar = document.getElementById("profileAvatar");
if (avatar) {
  avatar.src = perfil.avatar
    ? perfil.avatar + "?t=" + Date.now()
    : "/assets/avatar.png";
}

  // 🖼️ CAPA
const capa = document.getElementById("profileCapa");
if (capa) {
  capa.src = perfil.capa
    ? perfil.capa + "?t=" + Date.now()
    : "/assets/capa.png";
}

  // 👤 NOME
  const profileName = document.getElementById("profileName");
  if (profileName) {
    profileName.textContent =
      perfil.nome_exibicao || perfil.username || "";
  }
}


function renderizarPagina() {
  const tbody = document.getElementById("listaAssinantes");
  const inicio = (paginaAtual - 1) * LIMITE_POR_PAGINA;
  const fim = inicio + LIMITE_POR_PAGINA;

  const pagina = assinantesCache.slice(inicio, fim);

  tbody.innerHTML = "";

  if (pagina.length === 0) {
    tbody.innerHTML = `
      <tr>
       <td colspan="7">${t("no_subscribers_found")}</td>
      </tr>
    `;
    return;
  }

  pagina.forEach(a => {
    const total =
      Number(a.total_assinaturas) + Number(a.total_midias);

    tbody.innerHTML += `
      <tr>
        <td class="assinante-nome">${a.nome_cliente}</td>
<td>
  <span class="status-badge ${a.ativo ? "ativo" : "inativo"}">
    ${a.status_vip}
  </span>
</td>
        <td>${formatarData(a.expiration_at)}</td>
        <td>${formatarData(a.criado_em)}</td>
        <td>R$ ${Number(a.total_assinaturas).toFixed(2)}</td>
        <td>R$ ${Number(a.total_midias).toFixed(2)}</td>
        <td class="total-geral">R$ ${total.toFixed(2)}</td>
      </tr>
    `;
  });

  atualizarPaginacao();
}

function configurarBotoes() {
  document.getElementById("btnAnterior")?.addEventListener("click", () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      renderizarPagina();
    }
  });

  document.getElementById("btnProximo")?.addEventListener("click", () => {
    const totalPaginas = Math.ceil(
      assinantesCache.length / LIMITE_POR_PAGINA
    );

    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      renderizarPagina();
    }
  });
}

function atualizarPaginacao() {
  const totalPaginas = Math.ceil(
    assinantesCache.length / LIMITE_POR_PAGINA
  );

  document.getElementById("paginaAtual").textContent =
    `${paginaAtual} / ${totalPaginas}`;

  document.getElementById("btnAnterior").disabled =
    paginaAtual === 1;

  document.getElementById("btnProximo").disabled =
    paginaAtual === totalPaginas;
}

function getLocale() {
  if (idioma === "en") return "en-US";
  if (idioma === "es") return "es-ES";
  return "pt-BR";
}

function formatarData(data) {
  if (!data) return "-";
  return new Date(data).toLocaleDateString(getLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function gerarLinks(modelo_id) {
  const base = `https://www.velvet.lat/perfil.html?modelo_id=${modelo_id}`;

  document.getElementById("linkInstagram").value =
    `${base}&src=instagram`;

  document.getElementById("linkTiktok").value =
    `${base}&src=tiktok`;

  document.getElementById("linkDireto").value =
    base;
}

function copiarLink(id) {
  const input = document.getElementById(id);
  navigator.clipboard.writeText(input.value);
 alert(t("link_copied"));
}


async function carregarResumoModelo() {
  const elHoje = document.getElementById("areaUsuarioGanhosHoje");
  const elMes  = document.getElementById("areaUsuarioGanhosMes");

  if (!elHoje && !elMes) return;

  try {
    const res = await fetch("/api/modelo/financeiro", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) return;

    const data = await res.json();

    const ganhosHoje =
      Number(data.hoje.midias || 0) +
      Number(data.hoje.assinaturas || 0);

    const ganhosMes =
      Number(data.mes.midias || 0) +
      Number(data.mes.assinaturas || 0);

    if (elHoje) {
      elHoje.innerText = `R$ ${ganhosHoje.toFixed(2).replace(".", ",")}`;
    }

    if (elMes) {
      elMes.innerText = `R$ ${ganhosMes.toFixed(2).replace(".", ",")}`;
    }

  } catch (err) {
    console.error("Erro carregarResumoModelo:", err);
  }
}

function normalizarInstagram(username) {
  if (!username) return null;

  return username
    .trim()
    .replace(/^@/, "") // remove @ do início
    .replace(/\s+/g, ""); // remove espaços
}

async function carregarVipCountModelo(modelo_id) {
  console.log("🔥 carregarVipCountModelo chamada com:", modelo_id);

  const token = localStorage.getItem("token");
  console.log("🔐 token existe?", !!token);
  if (!token || !modelo_id) {
    console.warn("VIP count: dados insuficientes");
    return;
  }

  try {
    const res = await fetch("/api/modelo/me/vip-count", {
  headers: {
    Authorization: "Bearer " + token
  }
});
    if (!res.ok) return;

    const { total } = await res.json();

    const el = document.getElementById("vip-total");
    if (el) el.textContent = total;

  } catch (err) {
    console.error("Erro ao carregar VIP count:", err);
  }
}

async function carregarAreaModelo() {
  const res = await fetch("/api/modelo/me", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) return;

  const modelo = await res.json();
  console.log("Modelo logado:", modelo);


  // ===============================
  // 📸 AVATAR / CAPA
  // ===============================
  const avatar = document.getElementById("profileAvatar");
if (avatar) {
  avatar.src = modelo.avatar
    ? modelo.avatar + "?t=" + Date.now()
    : "/assets/avatar.png";
}

const capa = document.getElementById("profileCapa");
if (capa) {
  capa.src = modelo.capa
    ? modelo.capa + "?t=" + Date.now()
    : "/assets/capa.png";
}

  // ===============================
  // 👤 NOME VISUAL (só se existir)
  // ===============================
  const profileName = document.getElementById("profileName");
  if (profileName) {
    profileName.textContent = modelo.nome_exibicao || "";
  }

  // ===============================
  // 👑 VIP COUNT
  // ===============================
  carregarVipCountModelo(modelo.user_id ?? modelo.id);

  // 🔗 LINKS DO PERFIL
const linkInstagram = document.getElementById("linkInstagram");

if (linkInstagram) {
  if (!modelo?.modelo_id) {
    console.error("❌ modelo.id não veio do /api/modelo/me:", modelo);
    return;
  }

  gerarLinks(modelo.modelo_id);
}
}

async function carregarDadosUsuario() {
  const token = localStorage.getItem("token");
  if (!token) return;

  const usuario = getUsuarioLogado();
  if (!usuario) return;

  let endpoint;

  if (usuario.role === "modelo") {
    endpoint = "/api/modelo/me";
  } else {
    endpoint = "/api/cliente/me";
  }

  const res = await fetch(endpoint, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const dados = await res.json();

  const form = document.getElementById("formDadosUsuario");
  if (!form) return;

  // 🔥 Campo principal (mesmo input para ambos)
  if (form.nome_exibicao) {
    form.nome_exibicao.value =
      usuario.role === "modelo"
        ? dados.nome_exibicao || ""
        : dados.username || "";
  }

  // 🔥 Campos extras para ambos
  if (form.instagram) form.instagram.value = dados.instagram || "";
  if (form.tiktok) form.tiktok.value = dados.tiktok || "";
  if (form.local) form.local.value = dados.local || "";
  if (form.bio) form.bio.value = dados.bio || "";
}

async function carregarDadosPessoais() {
  if (!paginaTem("formDadosPessoais")) return;

  const token = localStorage.getItem("token");
  if (!token) return;

   const usuario = getUsuarioLogado();

  const res = await fetch("/api/usuario/dados", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const dados = await res.json();
 
if (
  usuario?.role === "modelo" &&
  dados.status === "aprovado"
) {
  document.getElementById("areaBanner")?.classList.add("hidden");
}

  const form = document.getElementById("formDadosPessoais");
  if (!form) return;

  // preencher campos
  form.nome_completo.value = dados.nome_completo || "";
  form.data_nascimento.value = dados.data_nascimento
    ? dados.data_nascimento.split("T")[0]
    : "";
  form.telefone.value = dados.telefone || "";
  form.endereco.value = dados.endereco || "";
  form.estado.value   = dados.estado || "";
  form.cidade.value   = dados.cidade || "";
  form.pais.value     = dados.pais || "";

   if (dados.status === "aprovado") {
    bloquearFormulario(form);
    mostrarStatusVerificacao("aprovado");
    document.querySelector(".btn-salvar")?.remove();
  }
}

function aplicarTraducoes() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    const key = el.dataset.i18nAlt;
    el.alt = t(key);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    el.title = t(key);
  });

  const titleEl = document.querySelector("title[data-i18n]");
  if (titleEl) {
    titleEl.textContent = t(titleEl.dataset.i18n);
  }
}

const btnCapa = document.getElementById("btnCapa");
const btnAvatar = document.getElementById("btnAvatar");
const inputCapa = document.getElementById("inputCapa");
const inputAvatar = document.getElementById("inputAvatar");
const capaImg = document.getElementById("profileCapa");
const avatarImg = document.getElementById("profileAvatar");

btnCapa?.addEventListener("click", () => inputCapa.click());
btnAvatar?.addEventListener("click", () => inputAvatar.click());

inputCapa?.addEventListener("change", async () => {
  const file = inputCapa.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("capa", file);

  const res = await fetch("/uploadCapa", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });

  const data = await res.json();

  if (data.capa) {
    capaImg.src = data.capa + "?t=" + Date.now();
  }
});

inputAvatar?.addEventListener("change", async () => {
  const file = inputAvatar.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("avatar", file);

  const res = await fetch("/uploadAvatar", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });

  const data = await res.json();
 if (data.avatar) {
  avatarImg.src = data.avatar + "?t=" + Date.now();
}
});

const formPessoais = document.getElementById("formDadosPessoais");

formPessoais?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const dados = {
    nome_completo: formPessoais.nome_completo.value.trim(),
    data_nascimento: formPessoais.data_nascimento.value,
    telefone: formPessoais.telefone.value.trim(),
    endereco: formPessoais.endereco.value.trim(),
    estado: formPessoais.estado.value.trim(),
    cidade: formPessoais.cidade.value.trim(),
    pais: formPessoais.pais.value.trim()
  };

  try {
    const res = await fetch("/api/usuario/dados", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify(dados)
    });

    if (res.status === 403) {
      alert(t("personal_data_locked"));
      bloquearFormulario(formPessoais);
      mostrarStatusVerificacao("aprovado");
      return;
    }

    if (!res.ok) {
      const erro = await res.text().catch(() => "");
      console.error("Erro ao salvar dados pessoais:", erro);
      alert(t("personal_data_save_error"));
      return;
    }

    alert(t("personal_data_saved"));
  } catch (err) {
    console.error("Erro na requisição:", err);
   alert(t("personal_data_connection_error"));
  }
});

const formModelo = document.getElementById("formDadosUsuario");

formModelo?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const usuario = getUsuarioLogado();
  if (!usuario) return;

  const token = localStorage.getItem("token");
  const formData = new FormData(formModelo);

  const nomeDigitado = formData.get("nome_exibicao")?.trim() || "";

  if (!nomeDigitado) {
   alert(t("name_required"));
    return;
  }

  let endpoint;
  let dados;

  if (usuario.role === "modelo") {

    endpoint = "/api/usuario/perfil";

    dados = {
      nome_exibicao: nomeDigitado,
      instagram: normalizarInstagram(formData.get("instagram") || ""),
      tiktok: formData.get("tiktok")?.trim() || "",
      local: formData.get("local")?.trim() || "",
      bio: formData.get("bio")?.trim() || ""
    };

  } else {

    endpoint = "/api/cliente/dados";

    dados = {
      username: nomeDigitado,
      instagram: normalizarInstagram(formData.get("instagram") || ""),
      tiktok: formData.get("tiktok")?.trim() || "",
      local: formData.get("local")?.trim() || "",
      bio: formData.get("bio")?.trim() || ""
    };
  }

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(dados)
  });

  if (!res.ok) {
    alert(t("data_save_error"));
    return;
  }

  alert(t("data_saved"));

  await carregarPerfilBase(usuario);
});