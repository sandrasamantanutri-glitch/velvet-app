// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");
if (!token) window.location.href = "/index.html";

// ===============================
// HELPERS
// ===============================
function fmtPreco(valor) {
  const n = Number(valor) || 0;
  return n.toFixed(2).replace(".", ",");
}

function tempoRelativo(dataIso) {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("updates.tempo_agora");
  if (min < 60) return t("updates.tempo_minutos").replace("{n}", min);
  const horas = Math.floor(min / 60);
  if (horas < 24) return t("updates.tempo_horas").replace("{n}", horas);
  const dias = Math.floor(horas / 24);
  return t("updates.tempo_dias").replace("{n}", dias);
}

function tf(key, fallback) {
  try { const v = t(key); return (v && v !== key) ? v : fallback; } catch (_) { return fallback; }
}

function getLang() {
  return (localStorage.getItem("idioma") || document.documentElement.lang || "pt").slice(0, 2).toLowerCase();
}

function langLabel(pt, en, es) {
  const lang = getLang();
  if (lang === "en") return en;
  if (lang === "es") return es;
  return pt;
}

function getCapaUrl() {
  const lang = getLang();
  if (lang === "en") return "/assets/capaen.png";
  if (lang === "es") return "/assets/capaes.png";
  return "/assets/capapt.png";
}

function iconeVerificado() {
  return `<svg class="card-verificado" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 0l1.8 2.1 2.7-.5.9 2.6 2.6.9-.5 2.7L17.5 10l-1.5 2.2.5 2.7-2.6.9-.9 2.6-2.7-.5L8 19.5l-2.2-1.5-2.7.5-.9-2.6-2.6-.9.5-2.7L-1.5 10 0 7.8l-.5-2.7 2.6-.9.9-2.6 2.7.5L8 0z" transform="scale(0.84)" fill="#7b2cff"/>
    <path d="M5.5 8.5l2 2 3-3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
}

// ===============================
// BANNER
// ===============================
function renderBanner() {
  const bannerImg = document.getElementById("bannerCapa");
  if (bannerImg) bannerImg.src = getCapaUrl();
}

// ===============================
// CRIADORAS
// ===============================
function extrairCriadoras(eventos) {
  const seen = new Set();
  return eventos.reduce((acc, ev) => {
    if (!seen.has(ev.modelo_id)) {
      seen.add(ev.modelo_id);
      acc.push({ id: ev.modelo_id, nome: ev.nome_exibicao, avatar: ev.avatar });
    }
    return acc;
  }, []);
}

function renderCriadoras(criadoras) {
  const section = document.getElementById("criadorasSection");
  const scroll = document.getElementById("criadorasScroll");
  if (!section || !scroll) return;
  if (!criadoras.length) { section.style.display = "none"; return; }

  section.style.display = "";
  const titulo = langLabel("Influencers com novidades", "Creators with updates", "Influencers con novedades");
  const verTodas = langLabel("Ver todas", "See all", "Ver todas");

  document.getElementById("criadorasTitulo").textContent = "⚡ " + titulo;
  document.querySelector(".criadoras-ver-todas").textContent = verTodas + " →";

  scroll.innerHTML = criadoras.map(c => {
    const nome = (c.nome || "").split(" ")[0];
    const av = c.avatar || "/assets/avatar.png";
    return `
      <div class="criadora-item" onclick="window.location.href='/perfil.html?modelo_id=${c.id}'">
        <div class="criadora-avatar-wrap">
          <img class="criadora-avatar" src="${av}" alt="${nome}" onerror="this.src='/assets/avatar.png'">
          <span class="criadora-dot"></span>
        </div>
        <span class="criadora-nome">${nome}</span>
      </div>`;
  }).join("") + `
    <div class="criadora-item" onclick="window.location.href='/feed.html'">
      <div class="criadora-avatar-wrap" style="width:54px;height:54px;border-radius:50%;border:2px dashed #c4b5fd;display:flex;align-items:center;justify-content:center;font-size:22px;color:#7b2cff;background:#f3eeff">+</div>
      <span class="criadora-nome">${verTodas}</span>
    </div>`;
}

// ===============================
// FILTROS
// ===============================
let filtroAtivo = "todos";

function renderFiltros() {
  const tabs = document.getElementById("filtroTabs");
  if (!tabs) return;

  const labels = {
    todos:      langLabel("Todas",           "All",            "Todas"),
    oferta:     langLabel("Ofertas",          "Offers",         "Ofertas"),
    fotos:      langLabel("Conteúdos Feed",    "Feed content",   "Contenidos Feed"),
    chat:       langLabel("Chat",             "Chat",           "Chat"),
    assinatura: langLabel("Feed - VIP",       "Feed - VIP",   "Feed - VIP"),
  };

  tabs.innerHTML = Object.entries(labels).map(([key, label]) =>
    `<button class="filtro-tab${key === filtroAtivo ? " active" : ""}" data-filtro="${key}">${label}</button>`
  ).join("");

  const sortBtn = document.querySelector(".filtro-sort");
  if (sortBtn) sortBtn.textContent = langLabel("Mais recentes ▾", "Most recent ▾", "Más recientes ▾");

  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".filtro-tab");
    if (!btn) return;
    tabs.querySelectorAll(".filtro-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    filtroAtivo = btn.dataset.filtro;
    aplicarFiltro(filtroAtivo);
  });
}

function aplicarFiltro(filtro) {
  const cards = document.querySelectorAll(".update-card[data-tipo]");
  cards.forEach(card => {
    const tipo = card.dataset.tipo;
    let visible = true;
    if (filtro === "oferta")     visible = tipo === "oferta";
    else if (filtro === "fotos") visible = tipo === "feed" || tipo === "premium";
    else if (filtro === "chat")  visible = tipo === "chat";
    else if (filtro === "assinatura") visible = tipo === "feed";
    card.style.display = visible ? "" : "none";
  });
}

// ===============================
// PREVIEW DIREITO DO CARD
// ===============================
function cardAssetHTML(assetName, overlayText) {
  const overlay = overlayText
    ? `<div class="card-preview-overlay">${overlayText}</div>`
    : "";
  return `<div class="card-preview card-preview--asset">${overlay}<img src="/assets/${assetName}.png" alt=""></div>`;
}

function thumbGridHTML(thumbs, qtdTotal, locked) {
  const pair = (thumbs || []).filter(Boolean).slice(0, 2);
  const extras = (qtdTotal || 0) - pair.length;
  const lockedClass = locked ? " card-thumb--locked" : "";
  const cells = pair.map((src, i) => {
    const badge = (i === 1 && extras > 0) ? `<div class="card-thumb-extra-badge">+${extras}</div>` : "";
    return `<div class="card-thumb${lockedClass}"><img src="${src}" alt="" onerror="this.parentElement.style.background='#2a1550'">${badge}</div>`;
  });
  // fill to 2 cells if fewer
  while (cells.length < 2) cells.push(`<div class="card-thumb${lockedClass}"></div>`);
  return `<div class="card-preview-grid">${cells.join("")}</div>`;
}

function previewHTML(ev) {
  if (ev.tipo === "oferta") {
    const pct = ev.desconto_percentual ? `${ev.desconto_percentual}%` : null;
    return cardAssetHTML("carddescont", pct);
  }
  if (ev.tipo === "chat")   return cardAssetHTML("cardchat");

  const thumbs = (ev.thumbs || []).filter(Boolean);

  if (ev.tipo === "feed") {
    const locked = !ev.is_vip;
    if (!locked && thumbs.length) return thumbGridHTML(thumbs, ev.qtd, false);
    if (locked  && thumbs.length) return thumbGridHTML(thumbs, ev.qtd, true);
    return cardAssetHTML(locked ? "cardfeed" : "card2");
  }

  if (ev.tipo === "premium") {
    return thumbs.length ? thumbGridHTML(thumbs, ev.qtd, true) : cardAssetHTML("cardpremium");
  }

  return cardAssetHTML("card2");
}

// ===============================
// CABECALHO DO CARD
// ===============================
function cardHeader(ev, tagClasse, tagTexto) {
  const avatar = ev.avatar || "/assets/avatar.png";
  const tempo  = ev.evento_em ? tempoRelativo(ev.evento_em) : "";
  return `
    <div class="card-header">
      <img class="card-avatar" src="${avatar}" alt="" onerror="this.src='/assets/avatar.png'">
      <div class="card-nome-wrap">
        <span class="card-nome">${ev.nome_exibicao || ""}</span>
        <svg class="card-verificado" viewBox="0 0 20 20" fill="#7b2cff" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="9"/>
          <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </div>
      <span class="card-tempo">${tempo}</span>
      <span class="card-tag ${tagClasse}">${tagTexto}</span>
    </div>`;
}

// ===============================
// RENDER POR TIPO
// ===============================
function renderEventoFeed(ev) {
  const locked = !ev.is_vip;
  const tagClasse = locked ? "tag--vip" : "tag--nova-pub";
  const tagTexto  = locked
    ? tf("updates.tag_vip", "VIP")
    : langLabel("Nova publicação", "New post", "Nueva publicación");

  const titulo    = t("updates.texto_feed").replace("{n}", ev.qtd || 1);
  const subtexto  = locked
    ? tf("updates.lock_vip", "Conteúdo exclusivo para assinantes.")
    : "";
  const ctaTexto  = locked
    ? t("updates.cta_assinar").replace("{valor}", fmtPreco(ev.valor_assinatura))
    : t("updates.cta_perfil");
  const ctaHref   = `/perfil.html?modelo_id=${ev.modelo_id}`;
  const ctaClass  = locked ? "card-cta card-cta--fill" : "card-cta card-cta--outline";

  return `
    <div class="update-card" data-tipo="feed">
      ${cardHeader(ev, tagClasse, tagTexto)}
      <div class="card-body">
        <div class="card-info">
          <div class="card-titulo">${titulo}</div>
          ${subtexto ? `<div class="card-subtexto">${subtexto}</div>` : ""}
          <a class="${ctaClass}" href="${ctaHref}">${ctaTexto}</a>
        </div>
        ${previewHTML(ev)}
      </div>
    </div>`;
}

function renderEventoPremium(ev) {
  const titulo   = t("updates.texto_premium").replace("{n}", ev.qtd || 1);
  const preco    = ev.preco ? t("updates.preco_label").replace("{preco}", fmtPreco(ev.preco)) : "";
  const subtexto = ev.descricao || tf("updates.lock_premium", "Conteúdo Premium.");

  return `
    <div class="update-card" data-tipo="premium">
      ${cardHeader(ev, "tag--premium", tf("updates.tag_premium", "Premium"))}
      <div class="card-body">
        <div class="card-info">
          <div class="card-titulo">${titulo}</div>
          <div class="card-subtexto">${subtexto}${preco ? ` · ${preco}` : ""}</div>
          <a class="card-cta card-cta--fill" href="/perfil.html?modelo_id=${ev.modelo_id}&tab=paid">
            ${tf("updates.cta_desbloquear", "Desbloquear")}
          </a>
        </div>
        ${previewHTML(ev)}
      </div>
    </div>`;
}

function renderEventoChat(ev) {
  const titulo   = t("updates.texto_chat").replace("{n}", ev.qtd || 1);
  const subtexto = tf("updates.lock_chat", "Conteúdo exclusivo no chat.");

  return `
    <div class="update-card" data-tipo="chat">
      ${cardHeader(ev, "tag--chat", tf("updates.tag_chat", "Chat"))}
      <div class="card-body">
        <div class="card-info">
          <div class="card-titulo">${titulo}</div>
          <div class="card-subtexto">${subtexto}</div>
          <a class="card-cta card-cta--outline" href="/chatc.html?modelo_id=${ev.modelo_id}">
            ${tf("updates.cta_chat", "Ver no chat")}
          </a>
        </div>
        ${previewHTML(ev)}
      </div>
    </div>`;
}

function renderEventoOferta(ev) {
  const titulo   = t("updates.oferta_texto").replace("{nome}", ev.nome_exibicao || "");
  const subtexto = t("updates.oferta_desconto").replace("{percentual}", ev.desconto_percentual || 0)
    + (ev.mensagem ? ` — ${ev.mensagem}` : "");

  return `
    <div class="update-card" data-tipo="oferta">
      ${cardHeader(ev, "tag--oferta", tf("updates.tag_oferta", "Oferta"))}
      <div class="card-body">
        <div class="card-info">
          <div class="card-titulo">${titulo}</div>
          <div class="card-subtexto">${subtexto}</div>
          <a class="card-cta card-cta--outline" href="/perfil.html?modelo_id=${ev.modelo_id}">
            ${tf("updates.cta_oferta", "Ver oferta")}
          </a>
        </div>
        ${previewHTML(ev)}
      </div>
    </div>`;
}

function renderEvento(ev) {
  switch (ev.tipo) {
    case "feed":    return renderEventoFeed(ev);
    case "premium": return renderEventoPremium(ev);
    case "chat":    return renderEventoChat(ev);
    case "oferta":  return renderEventoOferta(ev);
    default:        return "";
  }
}

// ===============================
// RENDER PRINCIPAL
// ===============================
let _eventosCache = null;

function renderCards(eventos) {
  const wrapper = document.getElementById("listaUpdates");
  if (!wrapper) return;
  renderCriadoras(extrairCriadoras(eventos));
  wrapper.innerHTML = eventos.map(renderEvento).join("");
  aplicarFiltro(filtroAtivo);
}

async function renderUpdates() {
  const wrapper = document.getElementById("listaUpdates");
  if (!wrapper) return;

  wrapper.innerHTML = `<div class="updates-loading">${tf("updates.loading", "Carregando...")}</div>`;

  renderBanner();
  renderFiltros();

  try {
    const res = await fetch("/api/updates", {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) throw new Error("Erro ao buscar updates");

    const { eventos } = await res.json();

    if (!eventos || !eventos.length) {
      wrapper.innerHTML = `<p class="updates-vazio">${tf("updates.vazio", "Nenhuma novidade por aqui ainda.")}</p>`;
      document.getElementById("criadorasSection")?.style && (document.getElementById("criadorasSection").style.display = "none");
      return;
    }

    _eventosCache = eventos;
    renderCards(eventos);

    fetch("/api/updates/marcar-visto", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    }).catch(() => {});

  } catch (err) {
    console.error("Erro ao carregar updates:", err);
    wrapper.innerHTML = `<p class="updates-erro">${tf("updates.erro", "Erro ao carregar as novidades.")}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof whenI18nReady === "function") await whenI18nReady();
  renderUpdates();
  window.addEventListener("languageChanged", () => {
    renderBanner();
    renderFiltros();
    if (_eventosCache) renderCards(_eventosCache);
  });
});
