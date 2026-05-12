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

function getFeedText(key, fallback = "") {
  if (typeof t === "function") return t(key);
  return fallback;
}

// ===============================
// RENDER CARD
// ===============================
function criarCard(modelo) {
  const card = document.createElement("div");
  card.className = "modelo-card";

  const foto = modelo.capa || modelo.avatar || "/assets/avatar.png";
  const avatar = modelo.avatar || "/assets/avatar.png";

  // badge de ranking
  let badgeRank = "";
  if (modelo.top1) badgeRank = `<span class="badge badge-top1">🥇 #1</span>`;
  else if (modelo.top2) badgeRank = `<span class="badge badge-top2">🥈 #2</span>`;
  else if (modelo.top3) badgeRank = `<span class="badge badge-top3">🥉 #3</span>`;

  // badges de destaque
  const badges = [];
  if (modelo.online)          badges.push(`<span class="badge badge-online">● Online</span>`);
  if (modelo.responsiva)      badges.push(`<span class="badge badge-responsiva">💬 Responsiva</span>`);
  if (modelo.ativa_conteudo)  badges.push(`<span class="badge badge-conteudo">🔥 Ativa</span>`);
  if (modelo.is_new)          badges.push(`<span class="badge badge-new">✨ Nova</span>`);
  if (modelo.total_premium > 0) badges.push(`<span class="badge badge-premium">💎 Premium</span>`);

  const fasFormatado = modelo.total_fas >= 1000
    ? (modelo.total_fas / 1000).toFixed(1) + "k"
    : modelo.total_fas;

  card.innerHTML = `
    <div class="modelo-foto" style="background-image:url('${foto}')">
      <div class="modelo-foto-overlay"></div>
      ${badgeRank}
      <div class="card-badges">${badges.join("")}</div>
      <img class="avatar-flutuante" src="${avatar}" alt="${modelo.nome_exibicao || ""}">
    </div>
    <div class="modelo-info">
      <div class="modelo-header">
        <span class="modelo-nome">${modelo.nome_exibicao || ""}</span>
        ${modelo.online ? '<span class="dot-online"></span>' : ''}
      </div>
      <div class="modelo-bio">${modelo.bio || ""}</div>
      <div class="modelo-footer">
        <span class="fas-contador">❤️ ${fasFormatado} fãs</span>
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
function renderSecao(containerId, modelos, emptyMsg) {
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
// RENDER FEED COMPLETO
// ===============================
window.renderFeed = async function () {
  const wrapper = document.getElementById("listaModelos");
  if (!wrapper) return;

  wrapper.innerHTML = `<div class="feed-loading">Carregando...</div>`;

  try {
    const res = await fetch("/api/modelos", {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) throw new Error("Erro ao buscar modelos");

    const { online, novas, emAlta, recomendadas } = await res.json();

    wrapper.innerHTML = `
      ${online.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">🟢 Online agora</h2>
        <div class="feed-grid" id="sec-online"></div>
      </section>` : ""}

      ${recomendadas.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">⭐ Recomendadas para você</h2>
        <div class="feed-grid" id="sec-recomendadas"></div>
      </section>` : ""}

      <section class="feed-secao">
        <h2 class="feed-secao-titulo">🔥 Em alta</h2>
        <div class="feed-grid" id="sec-emalta"></div>
      </section>

      ${novas.length ? `
      <section class="feed-secao">
        <h2 class="feed-secao-titulo">✨ Novas na plataforma</h2>
        <div class="feed-grid" id="sec-novas"></div>
      </section>` : ""}
    `;

    renderSecao("sec-online", online);
    renderSecao("sec-recomendadas", recomendadas);
    renderSecao("sec-emalta", emAlta, "Nenhuma modelo disponível");
    renderSecao("sec-novas", novas);

  } catch (err) {
    console.error("Erro ao carregar o feed:", err);
    wrapper.innerHTML = `<p class="feed-erro">Erro ao carregar o feed.</p>`;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  window.renderFeed();
});
