// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");
if (!token) window.location.href = "/index.html";

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

function gridMidias(thumbs, locked) {
  if (locked) {
    return `<div class="update-midias-locked-placeholder"></div>`;
  }
  const lista = (thumbs || []).filter(Boolean).slice(0, 4);
  if (!lista.length) return "";
  return `
    <div class="update-midias">
      ${lista.map(src => `<img src="${src}" alt="">`).join("")}
    </div>
  `;
}

// ===============================
// RENDER POR TIPO DE EVENTO
// ===============================
function renderEventoFeed(ev) {
  const locked = !ev.is_vip;
  const corpo = locked
    ? `
      <div class="update-lock-label">${t("updates.lock_vip")}</div>
      <a class="update-cta" href="/perfil.html?modelo_id=${ev.modelo_id}">
        ${t("updates.cta_assinar").replace("{valor}", fmtPreco(ev.valor_assinatura))}
      </a>
    `
    : `
      <a class="update-cta update-cta--secundario" href="/perfil.html?modelo_id=${ev.modelo_id}">
        ${t("updates.cta_perfil")}
      </a>
    `;

  return `
    <div class="update-card">
      ${cabecalho(ev, "update-tag--vip", t("updates.tag_vip"))}
      <div class="update-texto">${t("updates.texto_feed").replace("{n}", ev.qtd)}</div>
      ${gridMidias(ev.thumbs, locked)}
      <div class="update-tempo">⏰ ${tempoRelativo(ev.evento_em)}</div>
      ${corpo}
    </div>
  `;
}

function renderEventoPremium(ev) {
  return `
    <div class="update-card">
      ${cabecalho(ev, "update-tag--premium", t("updates.tag_premium"))}
      <div class="update-texto">${t("updates.texto_premium").replace("{n}", ev.qtd)}</div>
      ${gridMidias(ev.thumbs, true)}
      ${ev.descricao ? `<div class="update-descricao">${ev.descricao}</div>` : ""}
      <div class="update-preco">${t("updates.preco_label").replace("{preco}", fmtPreco(ev.preco))}</div>
      <div class="update-tempo">⏰ ${tempoRelativo(ev.evento_em)}</div>
      <div class="update-lock-label">${t("updates.lock_premium")}</div>
      <a class="update-cta" href="/perfil.html?modelo_id=${ev.modelo_id}&tab=paid">
        ${t("updates.cta_desbloquear")}
      </a>
    </div>
  `;
}

function renderEventoChat(ev) {
  return `
    <div class="update-card">
      ${cabecalho(ev, "update-tag--chat", t("updates.tag_chat"))}
      <div class="update-texto">${t("updates.texto_chat").replace("{n}", ev.qtd)}</div>
      ${gridMidias(ev.thumbs, true)}
      <div class="update-tempo">⏰ ${tempoRelativo(ev.evento_em)}</div>
      <div class="update-lock-label">${t("updates.lock_chat")}</div>
      <a class="update-cta" href="/chatc.html?modelo_id=${ev.modelo_id}">
        ${t("updates.cta_chat")}
      </a>
    </div>
  `;
}

function renderEventoOferta(ev) {
  return `
    <div class="update-card">
      ${cabecalho(ev, "update-tag--oferta", t("updates.tag_oferta"))}
      <div class="update-texto">${t("updates.oferta_texto").replace("{nome}", ev.nome_exibicao || "")}</div>
      <div class="update-descricao">
        ${t("updates.oferta_desconto").replace("{percentual}", ev.desconto_percentual)}
        ${ev.mensagem ? ` — ${ev.mensagem}` : ""}
      </div>
      <div class="update-tempo">⏰ ${tempoRelativo(ev.evento_em)}</div>
      <a class="update-cta update-cta--secundario" href="/perfil.html?modelo_id=${ev.modelo_id}">
        ${t("updates.cta_oferta")}
      </a>
    </div>
  `;
}

function cabecalho(ev, tagClasse, tagTexto) {
  const avatar = ev.avatar || "/assets/avatar.png";
  return `
    <div class="update-header">
      <img class="update-avatar" src="${avatar}" alt="${ev.nome_exibicao || ""}">
      <span class="update-nome">${ev.nome_exibicao || ""}</span>
      <span class="update-tag ${tagClasse}">${tagTexto}</span>
    </div>
  `;
}

function renderEvento(ev) {
  switch (ev.tipo) {
    case "feed": return renderEventoFeed(ev);
    case "premium": return renderEventoPremium(ev);
    case "chat": return renderEventoChat(ev);
    case "oferta": return renderEventoOferta(ev);
    default: return "";
  }
}

// ===============================
// RENDER PRINCIPAL
// ===============================
async function renderUpdates() {
  const wrapper = document.getElementById("listaUpdates");
  if (!wrapper) return;

  wrapper.innerHTML = `<div class="updates-loading">${t("updates.loading")}</div>`;

  try {
    const res = await fetch("/api/updates", {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) throw new Error("Erro ao buscar updates");

    const { eventos } = await res.json();

    if (!eventos || !eventos.length) {
      wrapper.innerHTML = `<p class="updates-vazio">${t("updates.vazio")}</p>`;
    } else {
      wrapper.innerHTML = eventos.map(renderEvento).join("");
    }

    // marca como visto depois de renderizar — some o badge do header
    fetch("/api/updates/marcar-visto", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    }).catch(() => {});

  } catch (err) {
    console.error("Erro ao carregar updates:", err);
    wrapper.innerHTML = `<p class="updates-erro">${t("updates.erro")}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof whenI18nReady === "function") await whenI18nReady();
  renderUpdates();

  window.addEventListener("languageChanged", () => renderUpdates());
});
