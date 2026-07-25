// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");
if (!token) window.location.href = "/index.html";

async function logout() {
  const token = localStorage.getItem("token");
  if (token) {
    try { await fetch("/api/logout", { method: "POST", headers: { Authorization: "Bearer " + token } }); } catch (_) {}
  }
  localStorage.clear();
  window.location.href = "/index.html";
}

// ===============================
// HELPERS
// ===============================
const CLASSIF_INFO = {
  social: {
    emoji: "🌍",
    label: "Social",
    desc: "Conteúdos do dia a dia, como fotos, vídeos, viagens, lifestyle, gaming, fitness, moda e muito mais."
  },
  premium: {
    emoji: "🔥",
    label: "Premium",
    desc: "Conteúdo mais exclusivo e sensual, como ensaios de biquíni, lingerie, cosplay e outras publicações com maior apelo visual, sem nudez ou conteúdo explícito."
  },
  adulto: {
    emoji: "🔞",
    label: "18+",
    desc: "Conteúdo destinado exclusivamente a maiores de 18 anos VERIFICADOS, que pode incluir nudez ou conteúdo sexual explícito."
  }
};

function getClassificacao(modelo) {
  if (modelo.classificacao_conteudo === "adulto") return "adulto";
  if (modelo.classificacao_conteudo === "premium") return "premium";
  if (!modelo.classificacao_conteudo && modelo.total_premium > 0) return "premium";
  return "social";
}

function getBadge(modelo) {
  if (modelo.top1) return { cls: "badge-top1", text: "🏆 TOP 1" };
  if (modelo.top2) return { cls: "badge-top2", text: "🏆 TOP 2" };
  if (modelo.top3) return { cls: "badge-top3", text: "🏆 TOP 3" };
  if (modelo.online) return { cls: "badge-chat", text: "🟢 Chat Ativo" };
  if (modelo.ativa_conteudo) return { cls: "badge-ativa", text: "📸 Atualiza Sempre" };
  if (modelo.is_new) return { cls: "badge-new", text: "✨ Novidade" };
  return null;
}

function getRedeInfo(modelo) {
  if (modelo.tiktok) return { icon: "/assets/tiktok.png", alt: "TikTok" };
  if (modelo.instagram) return { icon: "/assets/insta.png", alt: "Instagram" };
  return null;
}

const CHECKMARK_SVG = `<svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"><polyline points="2,6 5,9 10,3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function buildTooltip(tipoAtivo) {
  return `
    <div class="classif-tooltip">
      ${Object.entries(CLASSIF_INFO).map(([key, info]) => `
        <div class="classif-tooltip-item${key === tipoAtivo ? " ativa" : ""}">
          <span class="classif-tooltip-item-icon">${info.emoji}</span>
          <div class="classif-tooltip-item-body">
            <strong>${info.emoji} ${info.label}</strong>
            ${info.desc}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ===============================
// RENDER CARD
// ===============================
function criarCard(modelo) {
  const card = document.createElement("div");
  card.className = "modelo-card";

  const foto = modelo.capa || modelo.avatar || "/assets/avatar.png";
  const avatarSrc = modelo.avatar || "/assets/avatar.png";

  const badge = getBadge(modelo);
  const classif = getClassificacao(modelo);
  const classifInfo = CLASSIF_INFO[classif];
  const rede = getRedeInfo(modelo);

  const badgeHtml = badge
    ? `<span class="card-badge ${badge.cls}">${badge.text}</span>`
    : "";

  const redeIconHtml = rede
    ? `<img class="card-avatar-rede" src="${rede.icon}" alt="${rede.alt}">`
    : "";

  const seguidoresHtml = rede
    ? `<div class="card-seguidores">
        <img src="${rede.icon}" alt="${rede.alt}">
        <div class="card-seguidores-info">
          <span class="card-seguidores-label">Seguidores</span>
        </div>
      </div>`
    : `<div></div>`;

  card.innerHTML = `
    <div class="card-foto" style="background-image:url('${foto}')"></div>
    <div class="card-gradient"></div>
    <div class="card-info">
      <div class="card-info-main">
        <div class="card-header-row">
          <span class="card-nome">${modelo.nome_exibicao || ""}</span>
          <span class="card-verificado">${CHECKMARK_SVG}</span>
          ${badgeHtml}
        </div>
        <div class="card-bio">${modelo.bio || ""}</div>
        <div class="card-footer-row">
          ${seguidoresHtml}
          <div class="card-classif">
            ${classifInfo.emoji} ${classifInfo.label}
            ${buildTooltip(classif)}
          </div>
        </div>
      </div>
      <div class="card-avatar-wrap">
        <img class="card-avatar-img" src="${avatarSrc}" alt="${modelo.nome_exibicao || ""}">
        ${redeIconHtml}
      </div>
    </div>
  `;

  card.onclick = () => {
    const modeloId = Number(modelo.modelo_id);
    if (!modeloId) return;
    window.location.href = `perfil.html?modelo_id=${modeloId}`;
  };

  return card;
}

// ===============================
// RENDER SEÇÃO
// ===============================
function renderSecao(containerId, modelos) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  if (!modelos || modelos.length === 0) {
    container.closest(".feed-secao")?.classList.add("feed-secao--vazia");
    return;
  }
  modelos.forEach(m => container.appendChild(criarCard(m)));
}

// ===============================
// RENDER FEED
// ===============================
let feedFiltroGenero = "";
let feedFiltroBusca = "";

window.renderFeed = async function () {
  const wrapper = document.getElementById("listaModelos");
  if (!wrapper) return;

  wrapper.innerHTML = `<div class="feed-loading">Carregando...</div>`;

  try {
    const params = new URLSearchParams();
    if (feedFiltroGenero) params.set("genero", feedFiltroGenero);
    if (feedFiltroBusca) params.set("q", feedFiltroBusca);

    const res = await fetch("/api/modelos?" + params.toString(), {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) throw new Error("Erro ao buscar modelos");

    const { online, novas, emAlta, recomendadas, descubraMais } = await res.json();

    const total = online.length + recomendadas.length + emAlta.length + novas.length + (descubraMais?.length || 0);

    if (total === 0) {
      wrapper.innerHTML = `<p class="feed-sem-resultados">Nenhuma criadora encontrada.</p>`;
      return;
    }

    wrapper.innerHTML = `
      ${online.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">🟢 Online agora</h2>
        <div class="feed-grid" id="sec-online"></div>
      </section>` : ""}

      ${recomendadas.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">⭐ Recomendadas</h2>
        <div class="feed-grid" id="sec-recomendadas"></div>
      </section>` : ""}

      <section class="feed-secao">
        <h2 class="feed-secao-titulo">🔥 Em alta</h2>
        <div class="feed-grid" id="sec-emalta"></div>
      </section>

      ${novas.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">✨ Novidades</h2>
        <div class="feed-grid" id="sec-novas"></div>
      </section>` : ""}

      ${descubraMais?.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">🌎 Descubra mais</h2>
        <div class="feed-grid" id="sec-descubra"></div>
      </section>` : ""}
    `;

    renderSecao("sec-online",       online);
    renderSecao("sec-recomendadas", recomendadas);
    renderSecao("sec-emalta",       emAlta);
    renderSecao("sec-novas",        novas);
    renderSecao("sec-descubra",     descubraMais || []);

  } catch (err) {
    console.error("Erro ao carregar feed2:", err);
    wrapper.innerHTML = `<p class="feed-erro">Erro ao carregar o feed.</p>`;
  }
};

// ===============================
// FILTROS
// ===============================
function initFiltros() {
  const chipsContainer = document.getElementById("feedChipsGenero");
  const inputBusca = document.getElementById("feedBuscaNome");

  chipsContainer?.addEventListener("click", (e) => {
    const chip = e.target.closest(".feed-chip");
    if (!chip) return;
    chipsContainer.querySelectorAll(".feed-chip").forEach(c => c.classList.remove("feed-chip--ativo"));
    chip.classList.add("feed-chip--ativo");
    feedFiltroGenero = chip.dataset.genero || "";
    window.renderFeed();
  });

  let debounceTimer;
  inputBusca?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      feedFiltroBusca = inputBusca.value.trim();
      window.renderFeed();
    }, 300);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof whenI18nReady === "function") await whenI18nReady();
  initFiltros();
  window.renderFeed();
});
