// ================================================
// TRANSAÇÕES — UX antifraude / anticontestação
// ================================================

let todasTransacoes = [];
let transacoesFiltradas = [];
let paginaAtual = 1;
const itensPorPagina = 10;

function getToken() { return localStorage.getItem("token"); }

function getLocaleAtual() {
  return typeof getCurrentLanguage === "function"
    ? getCurrentLanguage()
    : (localStorage.getItem("idioma") || "pt");
}

function formatarData(data) {
  if (!data) return "—";
  const d = new Date(data);
  return isNaN(d) ? "—" : d.toLocaleDateString(getLocaleAtual(), { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatarValor(valor) {
  const n = Number(valor);
  return isNaN(n) ? "R$ 0,00" : n.toLocaleString(getLocaleAtual(), { style: "currency", currency: "BRL" });
}

function diasRestantes(dataStr) {
  if (!dataStr) return null;
  const diff = new Date(dataStr) - new Date();
  return Math.ceil(diff / 86400000);
}

// ================================================
// MODAL SYSTEM
// ================================================
function abrirModal(html, opts = {}) {
  fecharModal();
  const overlay = document.createElement("div");
  overlay.id = "modal-ocorrencia";
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(20,12,40,.72);
    display:flex;align-items:center;justify-content:center;padding:16px;
    animation:fadeInModal .18s ease;
  `;
  const box = document.createElement("div");
  box.style.cssText = `
    background:#fff;border-radius:18px;padding:28px 24px 24px;
    max-width:520px;width:100%;max-height:90vh;overflow-y:auto;
    box-shadow:0 8px 40px rgba(111,60,255,.18);position:relative;
  `;
  box.innerHTML = `
    <button onclick="fecharModal()" style="
      position:absolute;top:14px;right:16px;background:none;border:none;
      font-size:20px;cursor:pointer;color:#9b87b8;line-height:1;
    ">✕</button>
    ${html}
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  if (!opts.noClose) overlay.addEventListener("click", e => { if (e.target === overlay) fecharModal(); });
}

function fecharModal() {
  document.getElementById("modal-ocorrencia")?.remove();
  fecharDropdowns();
}
window.fecharModal = fecharModal;

// ================================================
// DROPDOWN ⁞ — dois níveis
// ================================================
function fecharDropdowns() {
  document.querySelectorAll(".dd-oc").forEach(d => d.remove());
}

function abrirDropdown(e, items) {
  e.stopPropagation();
  fecharDropdowns();
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const menu = criarMenuDD(items);
  menu.style.top  = rect.bottom + 6 + "px";
  menu.style.right = window.innerWidth - rect.right + "px";
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", fecharDropdowns, { once: true }), 10);
}

function criarMenuDD(items) {
  const menu = document.createElement("div");
  menu.className = "dd-oc";
  menu.style.cssText = `
    position:fixed;z-index:9998;background:#fff;border-radius:14px;
    box-shadow:0 4px 28px rgba(111,60,255,.16);padding:6px 0;min-width:220px;
    animation:fadeInModal .14s ease;
  `;
  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.style.cssText = "border-top:1px solid #f0eaf9;margin:4px 0;";
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement("button");
    btn.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;gap:10px;
      width:100%;border:none;background:none;padding:11px 16px;
      font-size:14px;cursor:pointer;text-align:left;font-family:inherit;
      color:${item.danger ? "#c0392b" : "#1e1b2e"};transition:.13s;
    `;
    btn.innerHTML = `<span style="display:flex;align-items:center;gap:9px;">${item.icon ? `<span>${item.icon}</span>` : ""}<span>${item.label}</span></span>${item.sub ? '<span style="color:#bbb;font-size:12px;">›</span>' : ""}`;
    btn.addEventListener("mouseover", () => btn.style.background = "#f7f3ff");
    btn.addEventListener("mouseout",  () => btn.style.background = "none");

    if (item.sub) {
      // Submenu inline — expande abaixo ao clicar
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const existing = menu.querySelector(".dd-sub");
        if (existing) { existing.remove(); return; }
        menu.querySelectorAll(".dd-sub").forEach(s => s.remove());
        const sub = criarSubDD(item.sub);
        btn.insertAdjacentElement("afterend", sub);
      });
    } else if (item.action) {
      btn.addEventListener("click", e => { e.stopPropagation(); fecharDropdowns(); item.action(); });
    }
    menu.appendChild(btn);
  });
  return menu;
}

function criarSubDD(items) {
  const sub = document.createElement("div");
  sub.className = "dd-sub";
  sub.style.cssText = `
    background:#f7f3ff;border-radius:0 0 10px 10px;
    padding:4px 0 4px 0;border-top:1px solid #ede8ff;
  `;
  items.forEach(item => {
    const btn = document.createElement("button");
    btn.style.cssText = `
      display:flex;align-items:center;gap:9px;width:100%;border:none;
      background:none;padding:10px 20px 10px 28px;font-size:13px;
      cursor:pointer;text-align:left;font-family:inherit;
      color:${item.danger ? "#c0392b" : "#5e5873"};transition:.13s;
    `;
    btn.innerHTML = `${item.icon ? `<span>${item.icon}</span>` : ""}<span>${item.label}</span>`;
    btn.addEventListener("mouseover", () => btn.style.background = "#ede8ff");
    btn.addEventListener("mouseout",  () => btn.style.background = "none");
    btn.addEventListener("click", e => { e.stopPropagation(); fecharDropdowns(); item.action(); });
    sub.appendChild(btn);
  });
  return sub;
}

// ================================================
// HELPERS DE FORMULÁRIO
// ================================================
function styleInput() {
  return `width:100%;box-sizing:border-box;border:1.5px solid #ddd8e6;border-radius:10px;
    padding:10px 12px;font-size:14px;margin-bottom:14px;font-family:inherit;outline:none;`;
}

function camposBase(extra = "") {
  return `
    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Nome completo *</label>
    <input id="oc-nome" type="text" placeholder="Seu nome completo" style="${styleInput()}" />

    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Data de nascimento *</label>
    <input id="oc-nasc" type="date" style="${styleInput()}" />

    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">E-mail da conta *</label>
    <input id="oc-email" type="email" placeholder="email@exemplo.com" style="${styleInput()}" />

    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Data e hora do pagamento *</label>
    <input id="oc-dtpag" type="datetime-local" style="${styleInput()}" />

    ${extra}
  `;
}

function campoAnexo(label = "Print / Comprovante") {
  return `
    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${label}</label>
    <input type="file" id="oc-anexo" accept="image/*,application/pdf" style="width:100%;font-size:13px;margin-bottom:14px;" />
  `;
}

function btnEnviar(fn) {
  return `<button data-send onclick="${fn}" style="
    width:100%;background:#6f3cff;color:#fff;border:none;border-radius:12px;
    padding:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px;">
    Enviar ocorrência
  </button>
  <p style="font-size:12px;color:#9b87b8;margin-top:10px;text-align:center;">⏰ Prazo de resposta: 24 a 48 horas úteis.</p>`;
}

function valoresBase() {
  return {
    nome:  document.getElementById("oc-nome")?.value?.trim(),
    nasc:  document.getElementById("oc-nasc")?.value,
    email: document.getElementById("oc-email")?.value?.trim(),
    dtpag: document.getElementById("oc-dtpag")?.value,
  };
}

async function lerAnexo() {
  const file = document.getElementById("oc-anexo")?.files?.[0];
  if (!file) return { base64: null, filename: null };
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload  = e => resolve({ base64: e.target.result.split(",")[1], filename: file.name });
    r.onerror = () => resolve({ base64: null, filename: null });
    r.readAsDataURL(file);
  });
}

async function enviarOcorrencia(payload) {
  const btn = document.querySelector("#modal-ocorrencia [data-send]");
  if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
  try {
    const res = await fetch("/api/cliente/ocorrencia", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error();
    abrirModal(`
      <div style="text-align:center;padding:16px 0;">
        <div style="font-size:48px;margin-bottom:12px;">✅</div>
        <h3 style="color:#6f3cff;margin:0 0 8px;">Ocorrência registrada!</h3>
        <p style="color:#5e5873;line-height:1.6;">Nossa equipe analisará seu caso e responderá em até <strong>24–48 horas úteis</strong>.</p>
        <button onclick="fecharModal()" style="
          margin-top:20px;background:#6f3cff;color:#fff;border:none;border-radius:10px;
          padding:11px 32px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">
          Fechar
        </button>
      </div>
    `);
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = "Enviar ocorrência"; }
    alert("Erro ao enviar. Tente novamente ou contacte contato@velvet.lat.");
  }
}

// ================================================
// MODAL ARREPENDIMENTO (igual para VIP e Mídia)
// ================================================
function modalArrependimento(aceiteTimestamp, aceiteIp) {
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 12px;">Direito de Arrependimento</h3>

    <div style="background:#f3eff5;border-radius:12px;padding:16px 18px;margin-bottom:14px;">
      <p style="margin:0 0 8px;font-weight:700;color:#1e1b2e;font-size:14px;">📋 Políticas de Utilização da Velvet</p>
      <p style="margin:0;font-size:13px;color:#5e5873;line-height:1.7;">
        <em>"O art. 49 do CDC garante o direito de arrependimento em 7 dias para contratos celebrados online.
        No entanto, ao adquirir conteúdo digital com entrega imediata, o usuário solicita expressamente o
        início imediato do acesso e é informado de que, com isso,
        <strong>pode perder o direito de arrependimento</strong>."</em>
      </p>
      <a href="/policies.html#secao-2" target="_blank"
        style="display:inline-block;margin-top:10px;font-size:13px;color:#6f3cff;font-weight:600;">
        Ver Políticas completas →
      </a>
    </div>

    <div style="background:#fff0e8;border-left:4px solid #e67e22;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
      <p style="margin:0 0 6px;font-weight:700;color:#e67e22;font-size:13px;">🔒 Registramos seu aceite:</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#5e5873;line-height:1.9;">
        <li><strong>Horário:</strong> ${aceiteTimestamp ? formatarData(aceiteTimestamp) : "registrado no sistema"}</li>
        <li><strong>IP:</strong> ${aceiteIp || "registrado no sistema"}</li>
        <li>Você marcou a caixa <em>"Li e aceito as Políticas de Utilização, incluindo a Política de Reembolso"</em></li>
        <li>Você marcou a caixa <em>"Li e aceito os Termos de Uso"</em></li>
      </ul>
    </div>

    <div style="background:#fff5f5;border-left:4px solid #e74c3c;border-radius:8px;padding:12px 16px;margin-bottom:18px;">
      <p style="margin:0;font-size:13px;color:#c0392b;line-height:1.7;">
        ⚠️ <strong>Atenção:</strong> Contestações (chargeback) frequentes, infundadas ou fraudulentas
        podem resultar em <strong>suspensão ou bloqueio permanente da conta</strong> e encaminhamento
        às autoridades competentes (Lei n.º 8.137/1990 e Código Penal).
      </p>
    </div>

    <p style="font-size:13px;color:#9b87b8;margin:0 0 16px;">
      Dúvidas: <a href="mailto:contato@velvet.lat" style="color:#6f3cff;font-weight:600;">contato@velvet.lat</a>
    </p>
    <button onclick="fecharModal()" style="
      width:100%;background:#6f3cff;color:#fff;border:none;border-radius:12px;
      padding:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">
      Entendido
    </button>
  `);
}

// ================================================
// MODAIS — REEMBOLSO VIP
// ================================================
window.modalCancelar = function(id, validaAte) {
  const dtLabel = validaAte ? formatarData(validaAte) : "o fim do período atual";
  abrirModal(`
    <h3 style="color:#c0392b;margin:0 0 14px;">⚠️ Cancelar assinatura</h3>
    <div style="background:#fff5f5;border-left:4px solid #e74c3c;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0 0 6px;font-weight:700;color:#c0392b;">O cancelamento <u>não gera reembolso</u>.</p>
      <p style="margin:0;color:#5e5873;font-size:13px;line-height:1.6;">
        Seu acesso permanece ativo até <strong>${dtLabel}</strong> e não será renovado após essa data.
      </p>
    </div>
    <div style="display:flex;gap:12px;">
      <button onclick="fecharModal()" style="
        flex:1;background:#f3eff5;color:#1e1b2e;border:none;border-radius:10px;
        padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">
        Voltar
      </button>
      <button onclick="confirmarCancelamento(${id})" style="
        flex:1;background:#c0392b;color:#fff;border:none;border-radius:10px;
        padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
        Sim, cancelar
      </button>
    </div>
  `, { noClose: true });
};

window.confirmarCancelamento = async function(id) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = "Cancelando…"; }
  try {
    const res = await fetch(`/api/cliente/subscricoes/${id}/cancelar`, {
      method: "PUT", headers: { Authorization: "Bearer " + getToken() }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || "Erro ao cancelar."); fecharModal(); return; }
    const ate = data.valida_ate ? formatarData(data.valida_ate) : "o fim do período";
    abrirModal(`
      <div style="text-align:center;padding:16px 0;">
        <div style="font-size:44px;margin-bottom:12px;">📋</div>
        <h3 style="color:#6f3cff;margin:0 0 8px;">Cancelamento registrado</h3>
        <p style="color:#5e5873;line-height:1.6;">
          Seu acesso permanece <strong>ativo até ${ate}</strong>.<br>
          Não será renovado após essa data.
        </p>
        <button onclick="fecharModal();carregarSubscricoes();" style="
          margin-top:20px;background:#6f3cff;color:#fff;border:none;border-radius:10px;
          padding:11px 32px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">
          Entendido
        </button>
      </div>
    `);
  } catch { alert("Erro inesperado."); fecharModal(); }
};

function modalVipNaoLiberou(modeloNome) {
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">VIP não liberou após pagamento</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">Nossa equipe verificará e ativará seu acesso.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      ${campoAnexo("Print do perfil bloqueado / comprovante")}
    `)}
    ${btnEnviar("enviarVipNaoLiberou()")}
  `);
}
window.enviarVipNaoLiberou = async function() {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert("Preencha todos os campos obrigatórios (*).");
  const { base64, filename } = await lerAnexo();
  await enviarOcorrencia({
    tipo: "vip_nao_liberou", subtipo: "assinatura",
    nome_completo: nome, nascimento: nasc, email, data_pagamento: dtpag,
    modelo_nome: document.getElementById("oc-modelo")?.value?.trim(),
    descricao: "VIP não liberado após pagamento",
    anexo_base64: base64, anexo_filename: filename
  });
};

function modalPropaganda(modeloNome, subtipo) {
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Propaganda enganosa</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">Descreva o que aconteceu com evidências.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Nome da influencer</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Descreva o ocorrido</label>
      <textarea id="oc-desc" rows="3" placeholder="Ex: o perfil prometia X mas entregou Y..." style="${styleInput()}resize:vertical;"></textarea>
      ${campoAnexo("Print da propaganda / evidência")}
    `)}
    ${btnEnviar(`enviarPropaganda("${subtipo || "assinatura"}")`)}
  `);
}
window.enviarPropaganda = async function(subtipo) {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email) return alert("Preencha todos os campos obrigatórios (*).");
  const { base64, filename } = await lerAnexo();
  await enviarOcorrencia({
    tipo: "propaganda", subtipo,
    nome_completo: nome, nascimento: nasc, email, data_pagamento: dtpag,
    modelo_nome: document.getElementById("oc-modelo")?.value?.trim(),
    descricao: document.getElementById("oc-desc")?.value?.trim(),
    anexo_base64: base64, anexo_filename: filename
  });
};

function modalModeloErrada() {
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Assinei a influencer errada</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">Vamos analisar para tentar trocar sua assinatura.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">influencer assinada por engano</label>
      <input id="oc-modelo-engano" type="text" placeholder="Nome da criadora" style="${styleInput()}" />
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">influencer que queria assinar</label>
      <input id="oc-modelo-certa" type="text" placeholder="Nome da criadora correta" style="${styleInput()}" />
      ${campoAnexo("Comprovante de pagamento (opcional)")}
    `)}
    ${btnEnviar("enviarModeloErrada()")}
  `);
}
window.enviarModeloErrada = async function() {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert("Preencha todos os campos obrigatórios (*).");
  const engano = document.getElementById("oc-modelo-engano")?.value?.trim();
  const certa  = document.getElementById("oc-modelo-certa")?.value?.trim();
  const { base64, filename } = await lerAnexo();
  await enviarOcorrencia({
    tipo: "modelo_errada", subtipo: "assinatura",
    nome_completo: nome, nascimento: nasc, email, data_pagamento: dtpag,
    modelo_nome: engano,
    descricao: `Criadora assinada por engano: ${engano}. Criadora desejada: ${certa}`,
    anexo_base64: base64, anexo_filename: filename
  });
};

// ================================================
// MODAIS — REEMBOLSO MÍDIA
// ================================================
function modalMidiaNaoDesbloqueou(midiaId, modeloNome, subtipo) {
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Mídia não desbloqueou</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">Nossa equipe verificará e liberará seu acesso.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Nome da Influencer</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      ${campoAnexo("Print da mídia ainda bloqueada")}
    `)}
    ${btnEnviar(`enviarMidiaNaoDesbloqueou(${midiaId || "null"}, "${subtipo || "midia"}")`)}
  `);
}
window.enviarMidiaNaoDesbloqueou = async function(midiaId, subtipo) {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert("Preencha todos os campos obrigatórios (*).");
  const { base64, filename } = await lerAnexo();
  await enviarOcorrencia({
    tipo: "midia_nao_desbloqueou", subtipo,
    nome_completo: nome, nascimento: nasc, email, data_pagamento: dtpag,
    modelo_nome: document.getElementById("oc-modelo")?.value?.trim(),
    midia_id: midiaId || null,
    descricao: "Mídia não desbloqueou após pagamento",
    anexo_base64: base64, anexo_filename: filename
  });
};

function modalMidiaErrada(midiaId, modeloNome) {
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Desbloqueei a mídia errada</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">Vamos analisar para desbloquear a mídia correta.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">Qual mídia queria desbloquear?</label>
      <textarea id="oc-desc" rows="3" placeholder="Ex: vídeo do dia 10/04 no feed" style="${styleInput()}resize:vertical;"></textarea>
      ${campoAnexo("Print da mídia paga")}
    `)}
    ${btnEnviar(`enviarMidiaErrada(${midiaId || "null"})`)}
  `);
}
window.enviarMidiaErrada = async function(midiaId) {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert("Preencha todos os campos obrigatórios (*).");
  const { base64, filename } = await lerAnexo();
  await enviarOcorrencia({
    tipo: "midia_errada", subtipo: "midia",
    nome_completo: nome, nascimento: nasc, email, data_pagamento: dtpag,
    modelo_nome: document.getElementById("oc-modelo")?.value?.trim(),
    midia_id: midiaId || null,
    descricao: document.getElementById("oc-desc")?.value?.trim(),
    anexo_base64: base64, anexo_filename: filename
  });
};

// ================================================
// RENDER SUBSCRIÇÕES — layout em linha
// ================================================
function renderSubscricoes(subscricoes) {
  const lista = document.getElementById("listaSubscricoes");
  if (!lista) return;
  lista.innerHTML = "";

  if (!Array.isArray(subscricoes) || !subscricoes.length) {
    lista.innerHTML = `<div class="estado-vazio">Nenhuma assinatura encontrada.</div>`;
    return;
  }

  subscricoes.forEach(v => {
    const ativa    = Boolean(v.ativo) && new Date(v.expiration_at) > new Date() && !v.cancelado_em;
    const cancelada = Boolean(v.cancelado_em);
    const dias     = diasRestantes(v.expiration_at);
    const expiraLabel = v.expiration_at ? `Expira em ${formatarData(v.expiration_at)}${dias !== null && dias >= 0 ? ` (${dias}d)` : ""}` : "—";

    let badgeHtml, acoesHtml;

    if (ativa) {
      badgeHtml = `<span class="sub-badge sub-ativa">Ativa</span>`;
      acoesHtml = `<button class="btn-opcoes" id="btn-sub-${v.id}">⁞</button>`;
    } else if (cancelada) {
      badgeHtml = `<span class="sub-badge sub-cancelada">Cancelada</span>`;
      acoesHtml = `<button class="btn-renovar" onclick="renovarSubscricao(${v.modelo_id})">Renovar</button>`;
    } else {
      badgeHtml = `<span class="sub-badge sub-expirada">Expirada</span>`;
      acoesHtml = `<button class="btn-renovar" onclick="renovarSubscricao(${v.modelo_id})">Renovar</button>`;
    }

    const row = document.createElement("div");
    row.className = "sub-row";
    row.innerHTML = `
      <div class="sub-row-info">
        <span class="sub-modelo">${v.modelo || "—"}</span>
        ${badgeHtml}
        <span class="sub-expira">${expiraLabel}</span>
        ${cancelada ? `<span class="sub-aviso">Acesso mantido até ${formatarData(v.expiration_at)}</span>` : ""}
      </div>
      <div class="sub-row-acao">${acoesHtml}</div>
    `;
    lista.appendChild(row);

    if (ativa) {
      const btn = row.querySelector(`#btn-sub-${v.id}`);
      btn.addEventListener("click", e => {
        abrirDropdown(e, [
          {
            label: "Cancelar assinatura", icon: "🚫", danger: true,
            action: () => window.modalCancelar(v.id, v.expiration_at)
          },
          { separator: true },
          {
            label: "Reembolso", icon: "💬",
            sub: [
              { label: "VIP não liberou após pagamento", icon: "⚠️", action: () => modalVipNaoLiberou(v.modelo) },
              { label: "Propaganda enganosa",    icon: "🚨", action: () => modalPropaganda(v.modelo, "assinatura") },
              { label: "Arrependimento",      icon: "📋", action: () => modalArrependimento(v.aceite_timestamp, v.aceite_ip) },
              { label: "Assinei a influencer errada",      icon: "🔄", action: () => modalModeloErrada() },
            ]
          },
        ]);
      });
    }
  });
}

// ================================================
// RENDER TRANSAÇÕES — layout em linha
// ================================================
function tipoLabel(tipo) {
  const map = {
    vip: "Assinatura VIP",
    assinatura: "Assinatura VIP",
    midia_premium: "Mídia Premium",
    midia_chat: "Mídia Chat",
    midia: "Mídia",
    conteudo: "Conteúdo",
  };
  return map[tipo] || tipo || "—";
}

function tipoClasse(tipo) {
  if (tipo === "vip" || tipo === "assinatura") return "tipo-vip";
  if (tipo === "midia_premium") return "tipo-premium";
  if (tipo === "midia_chat") return "tipo-chat";
  return "tipo-outro";
}

function renderTransacoes(transacoes) {
  const lista = document.getElementById("listaTransacoes");
  const paginacao = document.getElementById("paginacao");
  if (!lista || !paginacao) return;

  if (!Array.isArray(transacoes) || !transacoes.length) {
    lista.innerHTML = `<div class="estado-vazio">Nenhuma transação encontrada.</div>`;
    paginacao.innerHTML = "";
    return;
  }

  const totalPaginas = Math.ceil(transacoes.length / itensPorPagina);
  if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;
  const slice = transacoes.slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina);

  lista.innerHTML = "";

  slice.forEach((tr, idx) => {
    const isVip   = tr.tipo === "vip" || tr.tipo === "assinatura";
    const isMidia = tr.tipo === "midia_premium" || tr.tipo === "midia_chat" || tr.tipo === "midia" || tr.tipo === "conteudo";
    const subtipoMidia = tr.tipo === "midia_chat" ? "midia_chat" : "midia_premium";

    const row = document.createElement("div");
    row.className = "tr-row";
    row.id = `tr-row-${idx}`;
    row.innerHTML = `
      <div class="tr-row-info">
        <span class="tipo-badge ${tipoClasse(tr.tipo)}">${tipoLabel(tr.tipo)}</span>
        ${tr.modelo_nome ? `<span class="tr-modelo">${tr.modelo_nome}</span>` : ""}
        <span class="tr-data">${formatarData(tr.criado_em || tr.created_at)}</span>
        <span class="tr-valor">${formatarValor(tr.valor)}</span>
        <span class="tr-status status-${(tr.status || "").toLowerCase()}">${tr.status || "—"}</span>
      </div>
      ${isVip || isMidia ? `<button class="btn-opcoes" id="btn-tr-${idx}">⁞</button>` : ""}
    `;
    lista.appendChild(row);

    const btn = row.querySelector(`#btn-tr-${idx}`);
    if (!btn) return;

    if (isVip) {
      btn.addEventListener("click", e => {
        abrirDropdown(e, [
          {
            label: "Reembolso", icon: "💬",
            sub: [
              { label: "VIP não liberou após pagamento", icon: "⚠️", action: () => modalVipNaoLiberou(tr.modelo_nome) },
              { label: "Propaganda enganosa",    icon: "🚨", action: () => modalPropaganda(tr.modelo_nome, "assinatura") },
              { label: "Arrependimento",      icon: "📋", action: () => modalArrependimento(tr.aceite_timestamp, tr.aceite_ip) },
              { label: "Assinei influencer errada",      icon: "🔄", action: () => modalModeloErrada() },
            ]
          }
        ]);
      });
    } else if (isMidia) {
      btn.addEventListener("click", e => {
        abrirDropdown(e, [
          {
            label: "Reembolso", icon: "💬",
            sub: [
              { label: "Mídia não desbloqueou",       icon: "⚠️", action: () => modalMidiaNaoDesbloqueou(tr.id, tr.modelo_nome, subtipoMidia) },
              { label: "Propaganda enganosa", icon: "🚨", action: () => modalPropaganda(tr.modelo_nome, subtipoMidia) },
              { label: "Arrependimento",   icon: "📋", action: () => modalArrependimento(tr.aceite_timestamp, tr.aceite_ip) },
              { label: "Desbloqueei a mídia errada",  icon: "🔄", action: () => modalMidiaErrada(tr.id, tr.modelo_nome) },
            ]
          }
        ]);
      });
    }
  });

  gerarPaginacao(transacoes);
}

function gerarPaginacao(transacoes) {
  const paginacao = document.getElementById("paginacao");
  if (!paginacao) return;
  paginacao.innerHTML = "";
  const total = Math.ceil(transacoes.length / itensPorPagina);
  if (total <= 1) return;
  for (let i = 1; i <= total; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = i;
    if (i === paginaAtual) btn.classList.add("ativa");
    btn.addEventListener("click", () => { paginaAtual = i; renderTransacoes(transacoesFiltradas); });
    paginacao.appendChild(btn);
  }
}

function aplicarFiltros() {
  const tipo = document.getElementById("filtroTipo")?.value || "";
  paginaAtual = 1;
  if (!tipo) {
    transacoesFiltradas = [...todasTransacoes];
  } else if (tipo === "vip") {
    transacoesFiltradas = todasTransacoes.filter(t => t.tipo === "vip" || t.tipo === "assinatura");
  } else {
    transacoesFiltradas = todasTransacoes.filter(t => t.tipo === tipo);
  }
  renderTransacoes(transacoesFiltradas);
}

// ================================================
// CARREGAMENTO
// ================================================
async function carregarTransacoes() {
  const lista = document.getElementById("listaTransacoes");
  if (!lista) return;
  lista.innerHTML = `<div class="estado-vazio">Carregando…</div>`;
  try {
    const res = await fetch("/api/cliente/transacoes", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) { lista.innerHTML = `<div class="estado-vazio">Erro ao carregar transações.</div>`; return; }
    todasTransacoes = await res.json();
    if (!Array.isArray(todasTransacoes)) todasTransacoes = [];
    aplicarFiltros();
  } catch {
    lista.innerHTML = `<div class="estado-vazio">Erro ao carregar transações.</div>`;
  }
}

async function carregarSubscricoes() {
  const lista = document.getElementById("listaSubscricoes");
  if (!lista) return;
  lista.innerHTML = `<div class="estado-vazio">Carregando…</div>`;
  try {
    const res = await fetch("/api/cliente/subscricoes", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) { lista.innerHTML = `<div class="estado-vazio">Erro ao carregar assinaturas.</div>`; return; }
    const data = await res.json();
    renderSubscricoes(Array.isArray(data) ? data : []);
  } catch {
    lista.innerHTML = `<div class="estado-vazio">Erro ao carregar assinaturas.</div>`;
  }
}

window.carregarSubscricoes = carregarSubscricoes;
window.renovarSubscricao = id => { window.location.href = `/perfil.html?id=${id}`; };

// ================================================
// CSS dinâmico
// ================================================
function injectCSS() {
  const s = document.createElement("style");
  s.textContent = `
    @keyframes fadeInModal { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }

    /* ---- linha subscrição ---- */
    .sub-row {
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      background:#f7f3ff;border:1.5px solid #e5d9ff;border-radius:14px;
      padding:14px 18px;margin-bottom:10px;
    }
    .sub-row-info {
      display:flex;align-items:center;flex-wrap:wrap;gap:10px;flex:1;min-width:0;
    }
    .sub-row-acao { flex-shrink:0; }
    .sub-modelo { font-weight:700;color:#1e1b2e;font-size:14px; }
    .sub-expira { font-size:13px;color:#5e5873; }
    .sub-aviso  { font-size:12px;color:#e67e22;font-weight:600; }

    .sub-badge {
      display:inline-block;padding:3px 11px;border-radius:20px;font-size:12px;font-weight:700;
    }
    .sub-ativa    { background:#e6f9ee;color:#1a7a40; }
    .sub-cancelada{ background:#fff0e8;color:#e67e22; }
    .sub-expirada { background:#ffeee8;color:#c0392b; }

    /* ---- linha transação ---- */
    .tr-row {
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      background:#fff;border:1.5px solid #e5d9ff;border-radius:14px;
      padding:13px 18px;margin-bottom:8px;
    }
    .tr-row-info {
      display:flex;align-items:center;flex-wrap:wrap;gap:10px;flex:1;min-width:0;
    }
    .tr-modelo { font-size:14px;font-weight:600;color:#1e1b2e; }
    .tr-data   { font-size:13px;color:#9b87b8; }
    .tr-valor  { font-size:14px;font-weight:700;color:#1e1b2e; }
    .tr-status { font-size:12px;font-weight:600; }
    .status-paid,.status-pago,.status-ativo { color:#1a7a40; }
    .status-pending,.status-pendente { color:#e67e22; }
    .status-failed,.status-cancelado,.status-falhou { color:#c0392b; }

    /* ---- badges tipo ---- */
    .tipo-badge { display:inline-block;padding:3px 10px;border-radius:16px;font-size:12px;font-weight:600; }
    .tipo-vip     { background:#ede9ff;color:#6f3cff; }
    .tipo-premium { background:#e8f4ff;color:#2980b9; }
    .tipo-chat    { background:#fff0f8;color:#c0392b; }
    .tipo-outro   { background:#f3f3f3;color:#666; }

    /* ---- botões ---- */
    .btn-opcoes {
      background:none;border:1.5px solid #ddd8e6;border-radius:8px;
      padding:5px 11px;font-size:18px;line-height:1;font-weight:700;
      cursor:pointer;color:#6f3cff;transition:.14s;flex-shrink:0;
    }
    .btn-opcoes:hover { background:#f3eff5;border-color:#6f3cff; }

    .btn-renovar {
      background:none;border:1.5px solid #6f3cff;color:#6f3cff;border-radius:10px;
      padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;
      font-family:inherit;transition:.14s;flex-shrink:0;
    }
    .btn-renovar:hover { background:#6f3cff;color:#fff; }

    .estado-vazio { text-align:center;padding:32px;color:#9b87b8;font-size:15px; }
  `;
  document.head.appendChild(s);
}

// ================================================
// INIT
// ================================================
document.addEventListener("DOMContentLoaded", async () => {
  await whenI18nReady();

  if (!getToken()) { window.location.href = "/index.html"; return; }

  injectCSS();

  // Tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("ativa"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("ativa"));
      btn.classList.add("ativa");
      const tab = btn.dataset.tab;
      document.getElementById("tab-" + tab)?.classList.add("ativa");
      if (tab === "subscricoes") await carregarSubscricoes();
      if (tab === "transacoes")  aplicarFiltros();
    });
  });

  document.getElementById("filtroTipo")?.addEventListener("change", aplicarFiltros);

  // Fechar dropdowns ao clicar fora
  document.addEventListener("click", e => {
    if (!e.target.closest(".btn-opcoes") && !e.target.closest(".dd-oc")) fecharDropdowns();
  });

  // Carga inicial — a aba ativa por padrão é "subscricoes"
  await carregarSubscricoes();
  await carregarTransacoes();
});
