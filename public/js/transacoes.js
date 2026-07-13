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
  return isNaN(d) ? "—" : d.toLocaleString(getLocaleAtual());
}

function formatarValor(valor) {
  const n = Number(valor);
  return isNaN(n) ? "R$ 0,00" : n.toLocaleString(getLocaleAtual(), { style: "currency", currency: "BRL" });
}

// ================================================
// MODAL SYSTEM
// ================================================
let _resolveModal = null;

function abrirModal(html, opts = {}) {
  fecharModal();
  const overlay = document.createElement("div");
  overlay.id = "modal-ocorrencia";
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(20,12,40,.7);
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
  box.querySelector("[data-autofocus]")?.focus();
}

function fecharModal() {
  document.getElementById("modal-ocorrencia")?.remove();
  document.querySelectorAll(".dropdown-menu-oc").forEach(d => d.remove());
}

window.fecharModal = fecharModal;

// ================================================
// DROPDOWN ⁞
// ================================================
function toggleDropdown(e, itemsHtml) {
  e.stopPropagation();
  document.querySelectorAll(".dropdown-menu-oc").forEach(d => d.remove());
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "dropdown-menu-oc";
  menu.style.cssText = `
    position:fixed;z-index:9998;background:#fff;border-radius:12px;
    box-shadow:0 4px 24px rgba(111,60,255,.18);padding:6px 0;min-width:230px;
    top:${rect.bottom + 6}px;right:${window.innerWidth - rect.right}px;
    animation:fadeInModal .14s ease;
  `;
  menu.innerHTML = itemsHtml;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", fecharDropdowns, { once: true }), 10);
}

function fecharDropdowns() {
  document.querySelectorAll(".dropdown-menu-oc").forEach(d => d.remove());
}

function dropItem(label, icon, onclick, danger = false) {
  return `<button onclick="${onclick}" style="
    display:flex;align-items:center;gap:10px;width:100%;border:none;background:none;
    padding:11px 18px;font-size:14px;cursor:pointer;text-align:left;
    color:${danger ? "#c0392b" : "#1e1b2e"};font-family:inherit;
    transition:.15s;
  " onmouseover="this.style.background='#f7f3ff'" onmouseout="this.style.background='none'">
    <span>${icon}</span><span>${label}</span>
  </button>`;
}

// ================================================
// FORMULÁRIO GENÉRICO (envio de ocorrência)
// ================================================
function campoAnexo(label = "Print / Comprovante") {
  return `
    <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">${label}</label>
    <input type="file" id="oc-anexo" accept="image/*,application/pdf"
      style="width:100%;font-size:13px;margin-bottom:16px;" />
  `;
}

function camposBase(extra = "") {
  return `
    <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Nome completo *</label>
    <input id="oc-nome" type="text" placeholder="Seu nome completo" style="${styleInput()}" />

    <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Data de nascimento *</label>
    <input id="oc-nasc" type="date" style="${styleInput()}" />

    <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">E-mail da conta *</label>
    <input id="oc-email" type="email" placeholder="email@exemplo.com" style="${styleInput()}" />

    <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Data e hora do pagamento *</label>
    <input id="oc-dtpag" type="datetime-local" style="${styleInput()}" />

    ${extra}
  `;
}

function styleInput() {
  return `width:100%;box-sizing:border-box;border:1.5px solid #ddd8e6;border-radius:10px;
    padding:10px 12px;font-size:14px;margin-bottom:16px;font-family:inherit;outline:none;`;
}

function btnEnviar(onclick) {
  return `<button onclick="${onclick}" style="
    width:100%;background:#6f3cff;color:#fff;border:none;border-radius:12px;
    padding:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px;
  ">Enviar ocorrência</button>`;
}

function avisoResposta() {
  return `<p style="font-size:12px;color:#9b87b8;margin-top:12px;text-align:center;">
    ⏰ Prazo de resposta: 24 a 48 horas úteis.
  </p>`;
}

async function lerAnexo() {
  const file = document.getElementById("oc-anexo")?.files?.[0];
  if (!file) return { base64: null, filename: null };
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve({ base64: e.target.result.split(",")[1], filename: file.name });
    reader.onerror = () => resolve({ base64: null, filename: null });
    reader.readAsDataURL(file);
  });
}

function valoresBase() {
  return {
    nome: document.getElementById("oc-nome")?.value?.trim(),
    nasc: document.getElementById("oc-nasc")?.value,
    email: document.getElementById("oc-email")?.value?.trim(),
    dtpag: document.getElementById("oc-dtpag")?.value,
  };
}

async function enviarOcorrencia(payload) {
  const btn = document.querySelector("#modal-ocorrencia button[data-send]");
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
    alert("Erro ao enviar. Tente novamente ou contate contato@velvet.lat.");
  }
}

// ================================================
// MODAIS — ASSINATURA VIP
// ================================================
window.modalCancelar = function(id, validaAte) {
  fecharDropdowns();
  const dtLabel = validaAte ? formatarData(validaAte) : "o fim do período atual";
  abrirModal(`
    <h3 style="color:#c0392b;margin:0 0 14px;">⚠️ Cancelar assinatura</h3>
    <p style="color:#1e1b2e;line-height:1.7;margin:0 0 10px;">
      Tem certeza que deseja cancelar sua assinatura VIP?
    </p>
    <div style="background:#fff5f5;border-left:4px solid #e74c3c;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0 0 6px;font-weight:700;color:#c0392b;">O cancelamento <u>não gera reembolso</u>.</p>
      <p style="margin:0;color:#5e5873;font-size:13px;line-height:1.6;">
        O valor pago pelos dias restantes <strong>não será devolvido</strong>.
        Seu acesso permanece ativo até <strong>${dtLabel}</strong> e não será renovado após essa data.
      </p>
    </div>
    <p style="font-size:13px;color:#9b87b8;margin-bottom:20px;">
      Se tiver dúvidas sobre reembolso, use a opção <em>"Problema com minha assinatura"</em> neste menu.
    </p>
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
  const btn = document.querySelector("#modal-ocorrencia button[onclick^='confirmarCancelamento']");
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
          Sua assinatura permanece <strong>ativa até ${ate}</strong>.<br>
          Após essa data, o acesso será encerrado automaticamente e não será renovado.
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

window.modalVipNaoLiberou = function(modeloNome) {
  fecharDropdowns();
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Paguei e o VIP não liberou</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 18px;">Preencha os dados abaixo para nossa equipe analisar e ativar seu acesso.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      ${campoAnexo("Print do perfil bloqueado / comprovante de pagamento")}
    `)}
    ${btnEnviar("enviarVipNaoLiberou()")}
    ${avisoResposta()}
  `);
};

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

window.modalPropagandaVip = function(modeloNome) {
  fecharDropdowns();
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Propaganda enganosa / Golpe</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 18px;">Descreva o que aconteceu. Nossa equipe analisará e tomará as medidas cabíveis.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Descreva o que aconteceu</label>
      <textarea id="oc-desc" rows="3" placeholder="Ex: o perfil prometia X mas entregou Y..." style="${styleInput()}resize:vertical;"></textarea>
      ${campoAnexo("Print da propaganda / evidência")}
    `)}
    ${btnEnviar("enviarPropagandaVip()")}
    ${avisoResposta()}
  `);
};

window.enviarPropagandaVip = async function() {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email) return alert("Preencha todos os campos obrigatórios (*).");
  const { base64, filename } = await lerAnexo();
  await enviarOcorrencia({
    tipo: "propaganda", subtipo: "assinatura",
    nome_completo: nome, nascimento: nasc, email, data_pagamento: dtpag,
    modelo_nome: document.getElementById("oc-modelo")?.value?.trim(),
    descricao: document.getElementById("oc-desc")?.value?.trim(),
    anexo_base64: base64, anexo_filename: filename
  });
};

window.modalArrependimentoVip = function(aceiteTimestamp, aceiteIp) {
  fecharDropdowns();
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 12px;">Direito de Arrependimento</h3>

    <div style="background:#f3eff5;border-radius:12px;padding:16px 18px;margin-bottom:14px;">
      <p style="margin:0 0 10px;font-weight:700;color:#1e1b2e;font-size:14px;">📋 Trecho das Políticas de Utilização da Velvet</p>
      <p style="margin:0;font-size:13px;color:#5e5873;line-height:1.7;">
        <em>"O art. 49 do CDC garante o direito de arrependimento em 7 dias para contratos celebrados online.
        No entanto, ao adquirir conteúdo digital com entrega imediata, o usuário solicita expressamente o
        início imediato do acesso e é informado de que, com isso, <strong>pode perder o direito de arrependimento</strong>."</em>
      </p>
      <a href="/policies.html#secao-2" target="_blank"
        style="display:inline-block;margin-top:10px;font-size:13px;color:#6f3cff;font-weight:600;">
        Ver Políticas completas →
      </a>
    </div>

    <div style="background:#fff0e8;border-left:4px solid #e67e22;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
      <p style="margin:0 0 6px;font-weight:700;color:#e67e22;font-size:13px;">🔒 Registramos seu aceite com as seguintes informações:</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#5e5873;line-height:1.9;">
        <li><strong>Horário do aceite:</strong> ${aceiteTimestamp ? formatarData(aceiteTimestamp) : "registrado no sistema"}</li>
        <li><strong>IP de origem:</strong> ${aceiteIp || "registrado no sistema"}</li>
        <li>Você marcou a caixa <em>"Li e aceito as Políticas de Utilização, incluindo a Política de Reembolso"</em></li>
        <li>Você marcou a caixa <em>"Li e aceito os Termos de Uso"</em></li>
      </ul>
    </div>

    <div style="background:#fff5f5;border-left:4px solid #e74c3c;border-radius:8px;padding:12px 16px;margin-bottom:18px;">
      <p style="margin:0;font-size:13px;color:#c0392b;line-height:1.7;">
        ⚠️ <strong>Atenção:</strong> Pedidos de contestação (chargeback) frequentes, infundados ou fraudulentos
        podem resultar em <strong>suspensão ou bloqueio permanente da conta</strong>, identificação como fraude
        e encaminhamento de denúncia para as autoridades competentes, nos termos da legislação brasileira
        (Lei n.º 8.137/1990 e Código Penal).
      </p>
    </div>

    <p style="font-size:13px;color:#9b87b8;margin:0 0 16px;">
      Se ainda tiver dúvidas, entre em contato:
      <a href="mailto:contato@velvet.lat" style="color:#6f3cff;font-weight:600;">contato@velvet.lat</a>
    </p>

    <button onclick="fecharModal()" style="
      width:100%;background:#6f3cff;color:#fff;border:none;border-radius:12px;
      padding:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">
      Entendido
    </button>
  `);
};

window.modalModeloErrada = function() {
  fecharDropdowns();
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Assinei a criadora errada</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 18px;">Vamos analisar o caso para tentar trocar sua assinatura. Preencha os dados abaixo.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora que assinou por engano</label>
      <input id="oc-modelo-engano" type="text" placeholder="Nome da criadora" style="${styleInput()}" />
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora que queria assinar</label>
      <input id="oc-modelo-certa" type="text" placeholder="Nome da criadora correta" style="${styleInput()}" />
      ${campoAnexo("Comprovante de pagamento (opcional)")}
    `)}
    ${btnEnviar("enviarModeloErrada()")}
    ${avisoResposta()}
  `);
};

window.enviarModeloErrada = async function() {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert("Preencha todos os campos obrigatórios (*).");
  const engano = document.getElementById("oc-modelo-engano")?.value?.trim();
  const certa = document.getElementById("oc-modelo-certa")?.value?.trim();
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
// MODAIS — MÍDIAS
// ================================================
window.modalMidiaNaoDesbloqueou = function(midiaId, modeloNome) {
  fecharDropdowns();
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Mídia não desbloqueou</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 18px;">Preencha os dados para nossa equipe verificar e liberar seu acesso.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Tipo de conteúdo</label>
      <select id="oc-subtipo" style="${styleInput()}">
        <option value="premium">Premium (post pago)</option>
        <option value="chat">Chat (mídia no chat)</option>
      </select>
      ${campoAnexo("Print da mídia ainda bloqueada")}
    `)}
    ${btnEnviar("enviarMidiaNaoDesbloqueou(" + (midiaId || "null") + ")")}
    ${avisoResposta()}
  `);
};

window.enviarMidiaNaoDesbloqueou = async function(midiaId) {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert("Preencha todos os campos obrigatórios (*).");
  const { base64, filename } = await lerAnexo();
  await enviarOcorrencia({
    tipo: "midia_nao_desbloqueou",
    subtipo: document.getElementById("oc-subtipo")?.value,
    nome_completo: nome, nascimento: nasc, email, data_pagamento: dtpag,
    modelo_nome: document.getElementById("oc-modelo")?.value?.trim(),
    midia_id: midiaId || null,
    descricao: "Mídia não desbloqueou após pagamento",
    anexo_base64: base64, anexo_filename: filename
  });
};

window.modalPropagandaMidia = function(modeloNome) {
  fecharDropdowns();
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Propaganda enganosa / Golpe</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 18px;">Descreva o que aconteceu com evidências para analisarmos.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Descreva o ocorrido</label>
      <textarea id="oc-desc" rows="3" placeholder="Ex: a prévia mostrava X mas o conteúdo era Y..." style="${styleInput()}resize:vertical;"></textarea>
      ${campoAnexo("Print da propaganda / evidência")}
    `)}
    ${btnEnviar("enviarPropagandaMidia()")}
    ${avisoResposta()}
  `);
};

window.enviarPropagandaMidia = async function() {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email) return alert("Preencha todos os campos obrigatórios (*).");
  const { base64, filename } = await lerAnexo();
  await enviarOcorrencia({
    tipo: "propaganda", subtipo: "midia",
    nome_completo: nome, nascimento: nasc, email, data_pagamento: dtpag,
    modelo_nome: document.getElementById("oc-modelo")?.value?.trim(),
    descricao: document.getElementById("oc-desc")?.value?.trim(),
    anexo_base64: base64, anexo_filename: filename
  });
};

window.modalArrependimentoMidia = function(aceiteTimestamp, aceiteIp) {
  modalArrependimentoVip(aceiteTimestamp, aceiteIp);
};

window.modalMidiaErrada = function(midiaId, modeloNome) {
  fecharDropdowns();
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">Desbloqueio de mídia errada</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 18px;">Vamos analisar e, se possível, desbloquear a mídia correta. Preencha os dados.</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Nome da criadora</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="Nome da criadora" style="${styleInput()}" />
      <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#5e5873;">Detalhes da mídia que queria desbloquear</label>
      <textarea id="oc-desc" rows="3" placeholder="Descreva a mídia que você queria (ex: vídeo do dia 10/04 no feed)" style="${styleInput()}resize:vertical;"></textarea>
      ${campoAnexo("Print da mídia paga (bloqueada ou desbloqueada por engano)")}
    `)}
    ${btnEnviar("enviarMidiaErrada(" + (midiaId || "null") + ")")}
    ${avisoResposta()}
  `);
};

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
// RENDER SUBSCRIÇÕES
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
    const ativa = Boolean(v.ativo) && new Date(v.expiration_at) > new Date() && !v.cancelado_em;
    const cancelada = Boolean(v.cancelado_em);
    const expirada = !v.ativo || new Date(v.expiration_at) <= new Date();

    let badge, acoes;

    if (ativa) {
      badge = `<span class="badge-status badge-ativa">Ativa</span>`;
      acoes = `
        <button class="btn-menu-oc" onclick='toggleDropdown(event, \`
          ${dropItem("Cancelar assinatura", "🚫", `modalCancelar(${v.id}, "${v.expiration_at}")`, true)}
          ${dropItem("VIP não liberou após pagamento", "⚠️", `modalVipNaoLiberou("${v.modelo || ""}")`)}
          ${dropItem("Propaganda enganosa / Golpe", "🚨", `modalPropagandaVip("${v.modelo || ""}")`)}
          ${dropItem("Direito de arrependimento", "📋", `modalArrependimentoVip("${v.aceite_timestamp || ""}", "${v.aceite_ip || ""}")`)}
          ${dropItem("Assinei a criadora errada", "🔄", `modalModeloErrada()`)}
        \`)'>⁞</button>
      `;
    } else if (cancelada) {
      badge = `<span class="badge-status badge-cancelada">Cancelada</span>`;
      acoes = `<button class="btn-renovar" onclick="renovarSubscricao(${v.modelo_id})">Renovar</button>`;
    } else {
      badge = `<span class="badge-status badge-expirada">Expirada</span>`;
      acoes = `<button class="btn-renovar" onclick="renovarSubscricao(${v.modelo_id})">Renovar</button>`;
    }

    const card = document.createElement("div");
    card.className = "sub-vip-card";
    card.innerHTML = `
      <div class="sub-vip-header">
        ${badge}
        <div class="sub-vip-acoes">${acoes}</div>
      </div>
      <div class="sub-vip-info">
        <div class="transacao-tipo">Subscrição VIP</div>
        <div><strong>Criadora:</strong> ${v.modelo || "—"}</div>
        <div><strong>Assinada em:</strong> ${formatarData(v.updated_at || v.created_at)}</div>
        <div><strong>Válida até:</strong> ${formatarData(v.expiration_at)}</div>
        ${cancelada ? `<div style="color:#e67e22;font-size:13px;font-weight:600;">⚠️ Cancelada em ${formatarData(v.cancelado_em)} — acesso mantido até a data acima.</div>` : ""}
        <div><strong>Renovação automática:</strong> ${v.recorrente ? "Sim" : "Não"}</div>
      </div>
    `;
    lista.appendChild(card);
  });
}

// ================================================
// RENDER TRANSAÇÕES
// ================================================
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
  const inicio = (paginaAtual - 1) * itensPorPagina;
  const pagina = transacoes.slice(inicio, inicio + itensPorPagina);

  lista.innerHTML = "";

  pagina.forEach(tr => {
    const isMidia = tr.tipo === "midia" || tr.tipo === "conteudo";
    const isVip = tr.tipo === "assinatura" || tr.tipo === "vip";
    const tipoLabel = isVip ? "Assinatura VIP" : isMidia ? "Conteúdo / Mídia" : (tr.tipo || "—");
    const tipoClasse = isVip ? "tipo-assinatura" : "tipo-conteudo";

    let menuItems = "";
    if (isVip) {
      menuItems = `
        ${dropItem("VIP não liberou após pagamento", "⚠️", `modalVipNaoLiberou("${tr.modelo_nome || tr.modelo || ""}")`)}
        ${dropItem("Propaganda enganosa / Golpe", "🚨", `modalPropagandaVip("${tr.modelo_nome || tr.modelo || ""}")`)}
        ${dropItem("Direito de arrependimento", "📋", `modalArrependimentoVip("${tr.aceite_timestamp || ""}", "${tr.aceite_ip || ""}")`)}
        ${dropItem("Assinei a criadora errada", "🔄", `modalModeloErrada()`)}
      `;
    } else if (isMidia) {
      menuItems = `
        ${dropItem("Mídia não desbloqueou", "⚠️", `modalMidiaNaoDesbloqueou(${tr.id || "null"}, "${tr.modelo_nome || tr.modelo || ""}")`)}
        ${dropItem("Propaganda enganosa / Golpe", "🚨", `modalPropagandaMidia("${tr.modelo_nome || tr.modelo || ""}")`)}
        ${dropItem("Direito de arrependimento", "📋", `modalArrependimentoMidia("${tr.aceite_timestamp || ""}", "${tr.aceite_ip || ""}")`)}
        ${dropItem("Desbloqueio de mídia errada", "🔄", `modalMidiaErrada(${tr.id || "null"}, "${tr.modelo_nome || tr.modelo || ""}")`)}
      `;
    }

    const card = document.createElement("div");
    card.className = "transacao-card";
    card.innerHTML = `
      <div class="transacao-header">
        <span class="tipo-badge ${tipoClasse}">${tipoLabel}</span>
        ${menuItems ? `<button class="btn-menu-oc" onclick='toggleDropdown(event, \`${menuItems}\`)'>⁞</button>` : ""}
      </div>
      <div class="transacao-body">
        ${tr.modelo || tr.modelo_nome ? `<div><strong>Criadora:</strong> ${tr.modelo || tr.modelo_nome}</div>` : ""}
        <div><strong>Data:</strong> ${formatarData(tr.created_at)}</div>
        <div><strong>Valor:</strong> ${formatarValor(tr.valor)}</div>
        <div><strong>Status:</strong> <span class="status-badge status-${(tr.status || "").toLowerCase()}">${tr.status || "—"}</span></div>
      </div>
    `;
    lista.appendChild(card);
  });

  gerarPaginacao(transacoes);
}

function gerarPaginacao(transacoes) {
  const paginacao = document.getElementById("paginacao");
  if (!paginacao) return;
  paginacao.innerHTML = "";
  const totalPaginas = Math.ceil(transacoes.length / itensPorPagina);
  if (totalPaginas <= 1) return;
  for (let i = 1; i <= totalPaginas; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = i;
    if (i === paginaAtual) btn.classList.add("ativa");
    btn.addEventListener("click", () => { paginaAtual = i; renderTransacoes(transacoesFiltradas); });
    paginacao.appendChild(btn);
  }
}

function aplicarFiltros() {
  const filtro = document.getElementById("filtroTipo");
  const tipoSelecionado = filtro ? filtro.value : "";
  paginaAtual = 1;
  transacoesFiltradas = !tipoSelecionado
    ? [...todasTransacoes]
    : todasTransacoes.filter(tr => tr.tipo === tipoSelecionado);
  renderTransacoes(transacoesFiltradas);
}

// ================================================
// CARREGAMENTO DE DADOS
// ================================================
async function carregarTransacoes() {
  const lista = document.getElementById("listaTransacoes");
  const token = getToken();
  if (!lista) return;
  try {
    const res = await fetch("/api/cliente/transacoes", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) { lista.innerHTML = `<div class="estado-vazio">Erro ao carregar transações.</div>`; return; }
    const data = await res.json();
    todasTransacoes = Array.isArray(data) ? data : [];
    paginaAtual = 1;
    aplicarFiltros();
  } catch {
    lista.innerHTML = `<div class="estado-vazio">Erro ao carregar transações.</div>`;
  }
}

async function carregarSubscricoes() {
  const lista = document.getElementById("listaSubscricoes");
  const token = getToken();
  if (!lista) return;
  lista.innerHTML = `<div class="estado-vazio">Carregando…</div>`;
  try {
    const res = await fetch("/api/cliente/subscricoes", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) { lista.innerHTML = `<div class="estado-vazio">Erro ao carregar assinaturas.</div>`; return; }
    const data = await res.json();
    renderSubscricoes(Array.isArray(data) ? data : []);
  } catch {
    lista.innerHTML = `<div class="estado-vazio">Erro ao carregar assinaturas.</div>`;
  }
}

window.carregarSubscricoes = carregarSubscricoes;
window.renovarSubscricao = (modeloId) => { window.location.href = `/perfil.html?id=${modeloId}`; };

// ================================================
// INIT
// ================================================
document.addEventListener("DOMContentLoaded", async () => {
  await whenI18nReady();

  const token = getToken();
  if (!token) { window.location.href = "/index.html"; return; }

  // Tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("ativa"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("ativa"));
      btn.classList.add("ativa");
      const tab = btn.dataset.tab;
      document.getElementById("tab-" + tab)?.classList.add("ativa");
      if (tab === "subscricoes") await carregarSubscricoes();
      if (tab === "transacoes") aplicarFiltros();
    });
  });

  // Filtro
  const filtroTipo = document.getElementById("filtroTipo");
  if (filtroTipo) filtroTipo.addEventListener("change", aplicarFiltros);

  // Fechar dropdown ao clicar fora
  document.addEventListener("click", e => {
    if (!e.target.closest(".btn-menu-oc") && !e.target.closest(".dropdown-menu-oc")) {
      fecharDropdowns();
    }
  });

  // Carregamento inicial
  await carregarTransacoes();
  const abaAtiva = document.querySelector(".tab-btn.ativa");
  if (abaAtiva?.dataset.tab === "subscricoes") await carregarSubscricoes();

  // CSS dinâmico
  const style = document.createElement("style");
  style.textContent = `
    @keyframes fadeInModal { from { opacity:0; transform:scale(.97); } to { opacity:1; transform:scale(1); } }

    .sub-vip-card {
      background:#f7f3ff;border-radius:14px;padding:18px;margin-bottom:14px;
      border:1.5px solid #e5d9ff;
    }
    .sub-vip-header {
      display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;
    }
    .sub-vip-acoes { display:flex;gap:8px;align-items:center; }
    .sub-vip-info > div { margin-bottom:5px;font-size:14px;color:#1e1b2e; }

    .transacao-card {
      background:#fff;border-radius:14px;padding:16px 18px;margin-bottom:12px;
      border:1.5px solid #e5d9ff;
    }
    .transacao-header {
      display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;
    }
    .transacao-body > div { margin-bottom:4px;font-size:14px;color:#1e1b2e; }

    .badge-status {
      display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;
    }
    .badge-ativa { background:#e6f9ee;color:#1a7a40; }
    .badge-expirada { background:#ffeee8;color:#c0392b; }
    .badge-cancelada { background:#fff0e8;color:#e67e22; }

    .tipo-badge { display:inline-block;padding:3px 10px;border-radius:16px;font-size:12px;font-weight:600; }
    .tipo-assinatura { background:#ede9ff;color:#6f3cff; }
    .tipo-conteudo { background:#e8f4ff;color:#2980b9; }

    .status-badge { font-size:13px;font-weight:600; }
    .status-paid,.status-pago { color:#1a7a40; }
    .status-pending,.status-pendente { color:#e67e22; }
    .status-failed,.status-cancelado { color:#c0392b; }

    .btn-menu-oc {
      background:none;border:1.5px solid #ddd8e6;border-radius:8px;
      padding:4px 10px;font-size:18px;cursor:pointer;color:#6f3cff;
      line-height:1;font-weight:700;transition:.15s;
    }
    .btn-menu-oc:hover { background:#f3eff5;border-color:#6f3cff; }

    .btn-renovar {
      background:none;border:1.5px solid #6f3cff;color:#6f3cff;border-radius:10px;
      padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s;
    }
    .btn-renovar:hover { background:#6f3cff;color:#fff; }

    .estado-vazio { text-align:center;padding:32px;color:#9b87b8;font-size:15px; }
  `;
  document.head.appendChild(style);
});
