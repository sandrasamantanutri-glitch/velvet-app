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

// ── Classificação de conteúdo ──
const CLASSIF = {
  social:  {
    emoji: "🌍", label: "Social",
    desc: "Conteúdos do dia a dia, como fotos, vídeos, viagens, lifestyle, gaming, fitness, moda e muito mais."
  },
  premium: {
    emoji: "🔥", label: "Premium",
    desc: "Conteúdo mais sensual, como ensaios de biquíni, lingerie, cosplay e outras publicações com maior apelo visual, sem nudez ou conteúdo explícito."
  },
  adulto: {
    emoji: "🔞", label: "18+",
    desc: "Conteúdo destinado exclusivamente a maiores de 18 anos VERIFICADOS, que pode incluir nudez ou conteúdo sexual explícito."
  }
};

function getClassificacao(modelo) {
  if (modelo.classificacao_conteudo === "adulto")  return "adulto";
  if (modelo.classificacao_conteudo === "premium") return "premium";
  if (!modelo.classificacao_conteudo && modelo.total_premium > 0) return "premium";
  return "social";
}

function getBadge(modelo) {
  if (modelo.top1) return "🏆 TOP 1";
  if (modelo.top2) return "🏆 TOP 2";
  if (modelo.top3) return "🏆 TOP 3";
  if (modelo.online) return "🟢 Chat Ativo";
  if (modelo.ativa_conteudo) return "📸 Atualiza Sempre";
  if (modelo.is_new) return "✨ Novidade";
  return "";
}

const CHECK_SVG = `<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="2,6 5,9 10,3" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const TIKTOK_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.7a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg>`;

const INSTA_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ig-f2" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f09433"/><stop offset="50%" stop-color="#dc2743"/><stop offset="100%" stop-color="#bc1888"/></linearGradient></defs><path fill="url(#ig-f2)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`;

// ── Render card ──
function criarCard(modelo) {
  const card = document.createElement("div");
  card.className = "modelo-card";

  const foto   = modelo.capa || modelo.avatar || "/assets/avatar.png";
  const avatar = modelo.avatar || "/assets/avatar.png";

  const classif = getClassificacao(modelo);
  const cl      = CLASSIF[classif];
  const badge   = getBadge(modelo);

  const redeIconSocial = modelo.tiktok ? TIKTOK_SVG : (modelo.instagram ? INSTA_SVG : "");
  const redeIconAvatar = modelo.tiktok ? TIKTOK_SVG : (modelo.instagram ? INSTA_SVG : "");

  const seguidoresHtml = redeIconSocial
    ? `<div class="card-social">
        <span class="card-social-icon">${redeIconSocial}</span>
        <div class="card-social-info">
          <div class="card-social-count">${modelo.seguidores || ""}</div>
          <div class="card-social-label">Seguidores</div>
        </div>
       </div>`
    : "";

  const avatarRedeHtml = redeIconAvatar
    ? `<span class="card-avatar-rede">${redeIconAvatar}</span>`
    : "";

  card.innerHTML = `
    <!-- tooltip de classificação aparece no hover do card -->
    <div class="card-classif-hint">
      <span class="hint-emoji">${cl.emoji}</span>
      <div class="hint-body">
        <div class="hint-label">${cl.emoji} ${cl.label}</div>
        <div class="hint-desc">${cl.desc}</div>
      </div>
    </div>

    <div class="card-foto" style="background-image:url('${foto}')"></div>
    <div class="card-overlay"></div>

    <div class="card-info">
      <div class="card-info-main">
        <div class="card-nome-row">
          <span class="card-nome">${modelo.nome_exibicao || ""}</span>
          <span class="card-check">${CHECK_SVG}</span>
        </div>
        <div class="card-bio">${modelo.bio || ""}</div>
        <div class="card-badge-row">
          ${badge ? `<span class="card-badge">${badge}</span>` : ""}
        </div>
        <div class="card-footer">
          ${seguidoresHtml}
        </div>
      </div>
      <div class="card-right">
        <div class="card-avatar-wrap">
          <img class="card-avatar" src="${avatar}" alt="${modelo.nome_exibicao || ""}">
          ${avatarRedeHtml}
        </div>
        <div class="card-classif">${cl.emoji} ${cl.label}</div>
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

// ── Render seção ──
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

// ── Feed principal (lógica idêntica ao feed.js) ──
let feedFiltroGenero = "";
let feedFiltroBusca  = "";

window.renderFeed = async function () {
  const wrapper = document.getElementById("listaModelos");
  if (!wrapper) return;

  const tLoading = (typeof t === "function") ? t("feed.loading") : "Carregando...";
  wrapper.innerHTML = `<div class="feed-loading">${tLoading}</div>`;

  try {
    const params = new URLSearchParams();
    if (feedFiltroGenero) params.set("genero", feedFiltroGenero);
    if (feedFiltroBusca)  params.set("q", feedFiltroBusca);

    const res = await fetch("/api/modelos?" + params.toString(), {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) throw new Error("Erro ao buscar modelos");

    const { online, novas, emAlta, recomendadas, descubraMais } = await res.json();

    const total = online.length + recomendadas.length + emAlta.length + novas.length + (descubraMais?.length || 0);

    if (total === 0) {
      const tEmpty = (typeof t === "function") ? t("feed.sem_resultados") : "Nenhuma criadora encontrada.";
      wrapper.innerHTML = `<p class="feed-sem-resultados">${tEmpty}</p>`;
      return;
    }

    const secOnline = (typeof t === "function") ? t("feed.sec_online")       : "🟢 Online agora";
    const secRec    = (typeof t === "function") ? t("feed.sec_recomendadas") : "⭐ Recomendadas para você";
    const secAlta   = (typeof t === "function") ? t("feed.sec_emalta")       : "🔥 Em alta";
    const secNovas  = (typeof t === "function") ? t("feed.sec_novas")        : "✨ Novidades na plataforma";
    const secDesc   = (typeof t === "function") ? t("feed.sec_descubra")     : "🌎 Descubra mais";

    wrapper.innerHTML = `
      ${online.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">${secOnline}</h2>
        <div class="feed-grid" id="sec-online"></div>
      </section>` : ""}

      ${recomendadas.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">${secRec}</h2>
        <div class="feed-grid" id="sec-recomendadas"></div>
      </section>` : ""}

      <section class="feed-secao">
        <h2 class="feed-secao-titulo">${secAlta}</h2>
        <div class="feed-grid" id="sec-emalta"></div>
      </section>

      ${novas.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">${secNovas}</h2>
        <div class="feed-grid" id="sec-novas"></div>
      </section>` : ""}

      ${descubraMais?.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">${secDesc}</h2>
        <div class="feed-grid" id="sec-descubra"></div>
      </section>` : ""}
    `;

    renderSecao("sec-online",       online);
    renderSecao("sec-recomendadas", recomendadas);
    renderSecao("sec-emalta",       emAlta);
    renderSecao("sec-novas",        novas);
    renderSecao("sec-descubra",     descubraMais || []);

  } catch (err) {
    console.error("Erro feed2:", err);
    wrapper.innerHTML = `<p class="feed-erro">Erro ao carregar o feed.</p>`;
  }
};

// ── Filtros ──
function initFiltros() {
  const chipsContainer = document.getElementById("feedChipsGenero");
  const inputBusca     = document.getElementById("feedBuscaNome");

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
  window.addEventListener("languageChanged", () => window.renderFeed());
});
