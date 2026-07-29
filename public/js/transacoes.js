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
    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.campo_nome")}</label>
    <input id="oc-nome" type="text" placeholder="${t("transacoes.placeholder_nome")}" style="${styleInput()}" />

    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.campo_nasc")}</label>
    <input id="oc-nasc" type="date" style="${styleInput()}" />

    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.campo_email")}</label>
    <input id="oc-email" type="email" placeholder="${t("transacoes.placeholder_email")}" style="${styleInput()}" />

    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.campo_dtpag")}</label>
    <input id="oc-dtpag" type="datetime-local" style="${styleInput()}" />

    ${extra}
  `;
}

function campoAnexo(label) {
  const lbl = label || t("transacoes.label_anexo");
  return `
    <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${lbl}</label>
    <input type="file" id="oc-anexo" accept="image/*,application/pdf" style="width:100%;font-size:13px;margin-bottom:14px;" />
  `;
}

function btnEnviar(fn) {
  return `<button data-send onclick='${fn}' style="
    width:100%;background:#6f3cff;color:#fff;border:none;border-radius:12px;
    padding:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px;">
    ${t("transacoes.btn_enviar_ocorrencia")}
  </button>
  <p style="font-size:12px;color:#9b87b8;margin-top:10px;text-align:center;">⏰ ${t("transacoes.prazo_resposta")}</p>`;
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
  if (btn) { btn.disabled = true; btn.textContent = t("transacoes.enviando"); }
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
        <h3 style="color:#6f3cff;margin:0 0 8px;">${t("transacoes.oc_registrada_titulo")}</h3>
        <p style="color:#5e5873;line-height:1.6;">${t("transacoes.oc_registrada_texto")}</p>
        <button onclick="fecharModal()" style="
          margin-top:20px;background:#6f3cff;color:#fff;border:none;border-radius:10px;
          padding:11px 32px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">
          ${t("transacoes.btn_fechar")}
        </button>
      </div>
    `);
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = t("transacoes.btn_enviar_ocorrencia"); }
    alert(t("transacoes.err_enviar"));
  }
}

// ================================================
// MODAL ARREPENDIMENTO (igual para VIP e Mídia)
// ================================================
function modalArrependimento(aceiteTimestamp, aceiteIp) {
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 12px;">Direito de Arrependimento</h3>

    <div style="background:#f3eff5;border-radius:12px;padding:16px 18px;margin-bottom:14px;">
      <p style="margin:0 0 8px;font-weight:700;color:#1e1b2e;font-size:14px;">
        📋 Entenda como funciona
      </p>

      <p style="margin:0;font-size:13px;color:#5e5873;line-height:1.75;">
        O <strong>art. 49 do Código de Defesa do Consumidor (CDC)</strong>
        garante, em regra, o direito de desistir de compras realizadas pela internet
        no prazo de até <strong>7 dias</strong>.
      </p>

      <p style="margin:10px 0 0;font-size:13px;color:#5e5873;line-height:1.75;">
        <strong>Entretanto, conteúdos e serviços digitais possuem regras específicas.</strong>
        Na Velvet, o acesso à assinatura ou à mídia é liberado
        <strong>imediatamente após a confirmação do pagamento</strong>.
      </p>

      <p style="margin:10px 0 0;font-size:13px;color:#5e5873;line-height:1.75;">
        Antes de concluir a compra, você concordou com nossos
        <strong>Termos de Uso</strong> e com a
        <strong>Política de Utilização e Reembolso</strong>, autorizando
        expressamente o início imediato da prestação do serviço.
      </p>

      <p style="margin:10px 0 0;font-size:13px;color:#5e5873;line-height:1.75;">
        <strong>Por esse motivo, após a liberação do acesso ao conteúdo, o direito de arrependimento pode não ser aplicável</strong>,
        não sendo devido reembolso apenas porque houve mudança de ideia,
        arrependimento ou desistência após o acesso ao serviço.
      </p>

      <p style="margin:10px 0 0;font-size:13px;color:#5e5873;line-height:1.75;">
        <strong>Isso não impede a análise de casos legítimos</strong>, como cobrança em duplicidade,
        erro comprovado no processamento do pagamento ou impossibilidade técnica de fornecer
        o serviço, que continuam sendo tratados conforme nossa Política de Reembolso.
      </p>

      <a href="/policies.html#secao-2" target="_blank"
        style="display:inline-block;margin-top:12px;font-size:13px;color:#6f3cff;font-weight:700;">
        Ler as Políticas completas →
      </a>
    </div>

    <p style="background:#fff7ec;border-left:4px solid #f39c12;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
        Você aceitou os <strong>Termos de Uso</strong>, e as <strong>Políticas de Utilização e Reembolso</strong>.<br>
        Você autorizou o início imediato do acesso ao conteúdo digital.</p>

       <p style="margin:0 0 8px;font-weight:700;color:#d68910;font-size:13px;">
        ✅Seu aceite foi registrado em sistema, asim como:</p>
       <ul style="margin:0;padding-left:18px;font-size:13px;color:#5e5873;line-height:1.8;">
        <strong>Data e horário de aceite e seu </strong><strong>Endereço IP</strong></ul>
        </p>
      </div>

    <div style="background:#eef8ff;border-left:4px solid #3498db;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
      <p style="margin:0;font-size:13px;color:#2c3e50;line-height:1.75;">
        💬 <strong>Teve algum problema com a compra?</strong><br>
        Antes de solicitar uma contestação (chargeback) junto ao banco ou à operadora do cartão,
        entre em contato conosco. A maioria dos problemas pode ser resolvida rapidamente pelo suporte.
      </p>
    </div>

    <div style="background:#fff5f5;border-left:4px solid #e74c3c;border-radius:8px;padding:12px 16px;margin-bottom:18px;">
      <p style="margin:0;font-size:13px;color:#c0392b;line-height:1.75;">
        ⚠️ <strong>Importante:</strong> Contestações (chargebacks) realizadas após a utilização do serviço,
        ou de forma falsa, abusiva ou fraudulenta, poderão resultar na
        <strong>suspensão ou encerramento permanente da conta</strong>,
        cancelamento dos acessos e adoção das medidas administrativas e judiciais cabíveis,
        nos termos da legislação brasileira.
      </p>
    </div>

    <p style="font-size:13px;color:#9b87b8;margin:0 0 16px;">
      Dúvidas? Entre em contato pelo e-mail
      <a href="mailto:contato@velvet.lat" style="color:#6f3cff;font-weight:700;">
        contato@velvet.lat
      </a>
    </p>

    <button onclick="fecharModal()" style="
      width:100%;
      background:#6f3cff;
      color:#fff;
      border:none;
      border-radius:12px;
      padding:12px;
      font-size:15px;
      font-weight:700;
      cursor:pointer;
      font-family:inherit;">
      Entendido
    </button>
  `);
}

// ================================================
// MODAIS — REEMBOLSO VIP
// ================================================
window.modalCancelar = function(id, validaAte) {
  const dtLabel = validaAte ? formatarData(validaAte) : t("transacoes.fim_periodo_atual");
  abrirModal(`
    <h3 style="color:#c0392b;margin:0 0 14px;">⚠️ ${t("transacoes.cancelar_titulo")}</h3>
    <div style="background:#fff5f5;border-left:4px solid #e74c3c;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0 0 6px;font-weight:700;color:#c0392b;">${t("transacoes.cancelamento_sem_reembolso")}</p>
      <p style="margin:0;color:#5e5873;font-size:13px;line-height:1.6;">
        ${t("transacoes.cancelamento_acesso_ate").replace("{data}", `<strong>${dtLabel}</strong>`)}
      </p>
    </div>
    <div style="display:flex;gap:12px;">
      <button onclick="fecharModal()" style="
        flex:1;background:#f3eff5;color:#1e1b2e;border:none;border-radius:10px;
        padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">
        ${t("transacoes.btn_voltar")}
      </button>
      <button onclick="confirmarCancelamento(${id})" style="
        flex:1;background:#c0392b;color:#fff;border:none;border-radius:10px;
        padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
        ${t("transacoes.sim_cancelar")}
      </button>
    </div>
  `, { noClose: true });
};

window.confirmarCancelamento = async function(id) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = t("transacoes.cancelando"); }
  try {
    const res = await fetch(`/api/cliente/subscricoes/${id}/cancelar`, {
      method: "PUT", headers: { Authorization: "Bearer " + getToken() }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || t("transacoes.err_cancelar_msg")); fecharModal(); return; }
    const ate = data.valida_ate ? formatarData(data.valida_ate) : t("transacoes.fim_periodo");
    abrirModal(`
      <div style="text-align:center;padding:16px 0;">
        <div style="font-size:44px;margin-bottom:12px;">📋</div>
        <h3 style="color:#6f3cff;margin:0 0 8px;">${t("transacoes.cancelamento_registrado")}</h3>
        <p style="color:#5e5873;line-height:1.6;">
          ${t("transacoes.cancelamento_acesso_ate").replace("{data}", `<strong>${ate}</strong>`)}
        </p>
        <button onclick="fecharModal();carregarSubscricoes();" style="
          margin-top:20px;background:#6f3cff;color:#fff;border:none;border-radius:10px;
          padding:11px 32px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">
          ${t("transacoes.entendido")}
        </button>
      </div>
    `);
  } catch { alert(t("transacoes.err_inesperado_msg")); fecharModal(); }
};

function modalVipNaoLiberou(modeloNome) {
  abrirModal(`
    <h3 style="color:#6f3cff;margin:0 0 4px;">${t("transacoes.vip_nao_liberou_titulo")}</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">${t("transacoes.vip_nao_liberou_desc")}</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.label_nome_criadora")}</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="${t("transacoes.placeholder_criadora")}" style="${styleInput()}" />
      ${campoAnexo()}
    `)}
    ${btnEnviar("enviarVipNaoLiberou()")}
  `);
}
window.enviarVipNaoLiberou = async function() {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert(t("transacoes.preencha_campos"));
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
    <h3 style="color:#6f3cff;margin:0 0 4px;">${t("transacoes.propaganda_titulo")}</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">${t("transacoes.propaganda_desc")}</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.label_nome_influencer")}</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="${t("transacoes.placeholder_criadora")}" style="${styleInput()}" />
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.label_descricao_ocorrido")}</label>
      <textarea id="oc-desc" rows="3" placeholder="${t("transacoes.placeholder_descricao_prop")}" style="${styleInput()}resize:vertical;"></textarea>
      ${campoAnexo()}
    `)}
    ${btnEnviar(`enviarPropaganda("${subtipo || "assinatura"}")`)}
  `);
}
window.enviarPropaganda = async function(subtipo) {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email) return alert(t("transacoes.preencha_campos"));
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
    <h3 style="color:#6f3cff;margin:0 0 4px;">${t("transacoes.modelo_errada_titulo")}</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">${t("transacoes.modelo_errada_desc")}</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.label_influencer_engano")}</label>
      <input id="oc-modelo-engano" type="text" placeholder="${t("transacoes.placeholder_criadora")}" style="${styleInput()}" />
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.label_influencer_certa")}</label>
      <input id="oc-modelo-certa" type="text" placeholder="${t("transacoes.placeholder_criadora_certa")}" style="${styleInput()}" />
      ${campoAnexo()}
    `)}
    ${btnEnviar("enviarModeloErrada()")}
  `);
}
window.enviarModeloErrada = async function() {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert(t("transacoes.preencha_campos"));
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
    <h3 style="color:#6f3cff;margin:0 0 4px;">${t("transacoes.midia_nao_desbloqueou_titulo")}</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">${t("transacoes.midia_nao_desbloqueou_desc")}</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.label_nome_influencer")}</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="${t("transacoes.placeholder_criadora")}" style="${styleInput()}" />
      ${campoAnexo()}
    `)}
    ${btnEnviar(`enviarMidiaNaoDesbloqueou(${midiaId || "null"}, "${subtipo || "midia"}")`)}
  `);
}
window.enviarMidiaNaoDesbloqueou = async function(midiaId, subtipo) {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert(t("transacoes.preencha_campos"));
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
    <h3 style="color:#6f3cff;margin:0 0 4px;">${t("transacoes.midia_errada_titulo")}</h3>
    <p style="color:#9b87b8;font-size:13px;margin:0 0 16px;">${t("transacoes.midia_errada_desc")}</p>
    ${camposBase(`
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.label_nome_criadora")}</label>
      <input id="oc-modelo" type="text" value="${modeloNome || ""}" placeholder="${t("transacoes.placeholder_criadora")}" style="${styleInput()}" />
      <label style="display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#5e5873;">${t("transacoes.label_qual_midia")}</label>
      <textarea id="oc-desc" rows="3" placeholder="${t("transacoes.placeholder_midia_desc")}" style="${styleInput()}resize:vertical;"></textarea>
      ${campoAnexo()}
    `)}
    ${btnEnviar(`enviarMidiaErrada(${midiaId || "null"})`)}
  `);
}
window.enviarMidiaErrada = async function(midiaId) {
  const { nome, nasc, email, dtpag } = valoresBase();
  if (!nome || !email || !dtpag) return alert(t("transacoes.preencha_campos"));
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
    lista.innerHTML = `<div class="estado-vazio">${t("transacoes.nenhuma_subscricao_encontrada")}</div>`;
    return;
  }

  subscricoes.forEach(v => {
    const ativa    = Boolean(v.ativo) && new Date(v.expiration_at) > new Date() && !v.cancelado_em;
    const cancelada = Boolean(v.cancelado_em);
    const dias     = diasRestantes(v.expiration_at);
    const expiraLabel = v.expiration_at
      ? t("transacoes.expira_em").replace("{data}", formatarData(v.expiration_at)) + (dias !== null && dias >= 0 ? ` (${dias}${t("transacoes.dias_suffix")})` : "")
      : "—";

    let badgeHtml, acoesHtml;

    if (ativa) {
      badgeHtml = `<span class="sub-badge sub-ativa">${t("transacoes.badge_ativa")}</span>`;
      acoesHtml = `<button class="btn-opcoes" id="btn-sub-${v.id}">⁞</button>`;
    } else if (cancelada) {
      badgeHtml = `<span class="sub-badge sub-cancelada">${t("transacoes.badge_cancelada")}</span>`;
      acoesHtml = `<button class="btn-renovar" onclick="renovarSubscricao(${v.modelo_id})">${t("transacoes.btn_renovar")}</button>`;
    } else {
      badgeHtml = `<span class="sub-badge sub-expirada">${t("transacoes.badge_expirada")}</span>`;
      acoesHtml = `<button class="btn-renovar" onclick="renovarSubscricao(${v.modelo_id})">${t("transacoes.btn_renovar")}</button>`;
    }

    const row = document.createElement("div");
    row.className = "sub-row";
    row.innerHTML = `
      <div class="sub-row-info">
        <span class="sub-modelo">${v.modelo || "—"}</span>
        ${badgeHtml}
        <span class="sub-expira">${expiraLabel}</span>
        ${cancelada ? `<span class="sub-aviso">${t("transacoes.acesso_mantido_ate").replace("{data}", formatarData(v.expiration_at))}</span>` : ""}
      </div>
      <div class="sub-row-acao">${acoesHtml}</div>
    `;
    lista.appendChild(row);

    if (ativa) {
      const btn = row.querySelector(`#btn-sub-${v.id}`);
      btn.addEventListener("click", e => {
        abrirDropdown(e, [
          {
            label: t("transacoes.cancelar_assinatura"), icon: "🚫", danger: true,
            action: () => window.modalCancelar(v.id, v.expiration_at)
          },
          { separator: true },
          {
            label: t("transacoes.reembolso"), icon: "💬",
            sub: [
              { label: t("transacoes.vip_nao_liberou_label"), icon: "⚠️", action: () => modalVipNaoLiberou(v.modelo) },
              { label: t("transacoes.propaganda_enganosa"),    icon: "🚨", action: () => modalPropaganda(v.modelo, "assinatura") },
              { label: t("transacoes.arrependimento_label"),   icon: "📋", action: () => modalArrependimento(v.aceite_timestamp, v.aceite_ip) },
              { label: t("transacoes.assinei_influencer_errada"), icon: "🔄", action: () => modalModeloErrada() },
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
    vip:          () => t("transacoes.tipo_subscricao_vip"),
    assinatura:   () => t("transacoes.tipo_subscricao_vip"),
    midia_premium:() => t("transacoes.tipo_midia_premium"),
    midia_chat:   () => t("transacoes.tipo_midia_chat"),
    midia:        () => t("transacoes.tipo_midia"),
    conteudo:     () => t("transacoes.tipo_conteudo"),
  };
  return map[tipo] ? map[tipo]() : tipo || "—";
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
    lista.innerHTML = `<div class="estado-vazio">${t("transacoes.nenhuma_transacao")}</div>`;
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
            label: t("transacoes.reembolso"), icon: "💬",
            sub: [
              { label: t("transacoes.vip_nao_liberou_label"), icon: "⚠️", action: () => modalVipNaoLiberou(tr.modelo_nome) },
              { label: t("transacoes.propaganda_enganosa"),   icon: "🚨", action: () => modalPropaganda(tr.modelo_nome, "assinatura") },
              { label: t("transacoes.arrependimento_label"),  icon: "📋", action: () => modalArrependimento(tr.aceite_timestamp, tr.aceite_ip) },
              { label: t("transacoes.assinei_influencer_errada"), icon: "🔄", action: () => modalModeloErrada() },
            ]
          }
        ]);
      });
    } else if (isMidia) {
      btn.addEventListener("click", e => {
        abrirDropdown(e, [
          {
            label: t("transacoes.reembolso"), icon: "💬",
            sub: [
              { label: t("transacoes.midia_nao_desbloqueou_label"), icon: "⚠️", action: () => modalMidiaNaoDesbloqueou(tr.id, tr.modelo_nome, subtipoMidia) },
              { label: t("transacoes.propaganda_enganosa"),         icon: "🚨", action: () => modalPropaganda(tr.modelo_nome, subtipoMidia) },
              { label: t("transacoes.arrependimento_label"),        icon: "📋", action: () => modalArrependimento(tr.aceite_timestamp, tr.aceite_ip) },
              { label: t("transacoes.desbloqueei_midia_errada"),   icon: "🔄", action: () => modalMidiaErrada(tr.id, tr.modelo_nome) },
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
  } else if (tipo === "midia_premium") {
    transacoesFiltradas = todasTransacoes.filter(t => t.tipo === "midia_premium" || t.tipo === "midia");
  } else if (tipo === "midia_chat") {
    transacoesFiltradas = todasTransacoes.filter(t => t.tipo === "midia_chat" || t.tipo === "conteudo");
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
  lista.removeAttribute("data-i18n");
  lista.innerHTML = `<div class="estado-vazio">${t("transacoes.carregando")}</div>`;
  try {
    const res = await fetch("/api/cliente/transacoes", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) { lista.innerHTML = `<div class="estado-vazio">${t("transacoes.erro_transacoes")}</div>`; return; }
    todasTransacoes = await res.json();
    if (!Array.isArray(todasTransacoes)) todasTransacoes = [];
    aplicarFiltros();
  } catch {
    lista.innerHTML = `<div class="estado-vazio">${t("transacoes.erro_transacoes")}</div>`;
  }
}

async function carregarSubscricoes() {
  const lista = document.getElementById("listaSubscricoes");
  if (!lista) return;
  lista.removeAttribute("data-i18n");
  lista.innerHTML = `<div class="estado-vazio">${t("transacoes.carregando")}</div>`;
  try {
    const res = await fetch("/api/cliente/subscricoes", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) { lista.innerHTML = `<div class="estado-vazio">${t("transacoes.erro_subscricoes")}</div>`; return; }
    const data = await res.json();
    renderSubscricoes(Array.isArray(data) ? data : []);
  } catch {
    lista.innerHTML = `<div class="estado-vazio">${t("transacoes.erro_subscricoes")}</div>`;
  }
}

window.carregarSubscricoes = carregarSubscricoes;
window.renovarSubscricao = id => { window.location.href = `/perfil.html?id=${id}`; };

// ================================================
// OCORRÊNCIAS DO CLIENTE
// ================================================
function OC_TIPO_LABEL(tipo) {
  const map = {
    vip_nao_liberou:       "transacoes.oc_tipo_vip_nao_liberou",
    propaganda:            "transacoes.oc_tipo_propaganda",
    arrependimento:        "transacoes.oc_tipo_arrependimento",
    modelo_errada:         "transacoes.oc_tipo_influencer_errada",
    midia_nao_desbloqueou: "transacoes.oc_tipo_midia_nao_desbloqueou",
    midia_errada:          "transacoes.oc_tipo_midia_errada",
    cancelamento_vip:      "transacoes.oc_tipo_cancelamento_vip",
  };
  return map[tipo] ? t(map[tipo]) : tipo;
}

function OC_STATUS_LABEL(status) {
  const map = {
    aberta:   "transacoes.oc_aberta",
    pendente: "transacoes.oc_em_analise",
    fechada:  "transacoes.oc_encerrada",
  };
  return map[status] ? t(map[status]) : status;
}

function renderOcorrencias(ocorrencias) {
  const lista = document.getElementById("listaOcorrencias");
  if (!lista) return;
  lista.innerHTML = "";

  if (!Array.isArray(ocorrencias) || !ocorrencias.length) {
    lista.innerHTML = `<div class="estado-vazio">${t("transacoes.nenhuma_ocorrencia")}</div>`;
    return;
  }

  ocorrencias.forEach(oc => {
    const statusClass = { aberta: "oc-aberta", pendente: "oc-pendente", fechada: "oc-fechada" }[oc.status] || "oc-aberta";
    const card = document.createElement("div");
    card.className = "oc-card";
    card.innerHTML = `
      <div class="oc-header">
        <span class="oc-tipo">${OC_TIPO_LABEL(oc.tipo)}</span>
        <span class="oc-badge ${statusClass}">${OC_STATUS_LABEL(oc.status)}</span>
        <span class="oc-data">${formatarData(oc.criado_em)}</span>
      </div>
      ${oc.modelo_nome ? `<div class="oc-meta">${t("transacoes.oc_influencer_label")} <strong>${oc.modelo_nome}</strong></div>` : ""}
      ${oc.descricao    ? `<div class="oc-desc">${oc.descricao}</div>` : ""}
      ${oc.anexo_filename ? `<div class="oc-meta">📎 Anexo enviado: ${oc.anexo_filename}</div>` : ""}
      ${oc.resposta ? `
        <div class="oc-resposta">
          <div class="oc-resposta-label">📋 Resposta do suporte${oc.resposta_at ? ` — ${formatarData(oc.resposta_at)}` : ""}:</div>
          <div class="oc-resposta-texto">${oc.resposta}</div>
          ${oc.anexo_resposta_filename ? `<div style="margin-top:6px;font-size:12px;">📎 ${oc.anexo_resposta_filename}</div>` : ""}
        </div>
      ` : (oc.status !== "fechada" ? `<div class="oc-aguardando">⏳ ${t("transacoes.oc_aguardando")}</div>` : "")}
    `;
    lista.appendChild(card);
  });
}

async function carregarOcorrencias() {
  const lista = document.getElementById("listaOcorrencias");
  if (!lista) return;
  lista.removeAttribute("data-i18n");
  lista.innerHTML = `<div class="estado-vazio">${t("transacoes.carregando")}</div>`;
  try {
    const res = await fetch("/api/cliente/ocorrencias", {
      headers: { Authorization: "Bearer " + getToken() }
    });
    if (!res.ok) { lista.innerHTML = `<div class="estado-vazio">${t("transacoes.erro_ocorrencias")}</div>`; return; }
    renderOcorrencias(await res.json());
  } catch {
    lista.innerHTML = `<div class="estado-vazio">${t("transacoes.erro_ocorrencias")}</div>`;
  }
}

window.carregarOcorrencias = carregarOcorrencias;

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

    /* ---- ocorrências ---- */
    .oc-card {
      background:#fff;border:1.5px solid #e5d9ff;border-radius:14px;
      padding:16px 18px;margin-bottom:10px;
    }
    .oc-header {
      display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;
    }
    .oc-tipo { font-weight:700;color:#1e1b2e;font-size:14px; }
    .oc-data { font-size:13px;color:#9b87b8;margin-left:auto; }
    .oc-meta { font-size:13px;color:#5e5873;margin-bottom:4px; }
    .oc-desc { font-size:13px;color:#5e5873;margin-bottom:6px;line-height:1.5; }
    .oc-badge {
      display:inline-block;padding:3px 11px;border-radius:20px;font-size:12px;font-weight:700;
    }
    .oc-aberta   { background:#fff0e8;color:#e67e22; }
    .oc-pendente { background:#e8f0ff;color:#2c5fe6; }
    .oc-fechada  { background:#e6f9ee;color:#1a7a40; }
    .oc-resposta {
      background:#f7f3ff;border-left:4px solid #6f3cff;border-radius:0 8px 8px 0;
      padding:10px 14px;margin-top:10px;font-size:13px;color:#1e1b2e;
    }
    .oc-resposta-label { font-weight:700;margin-bottom:4px;color:#6f3cff; }
    .oc-resposta-texto { line-height:1.6; }
    .oc-aguardando { font-size:12px;color:#9b87b8;margin-top:8px; }
  `;
  document.head.appendChild(s);
}

// ================================================
// INIT
// ================================================
document.addEventListener("DOMContentLoaded", async () => {
  const i18nTimeout = new Promise(resolve => setTimeout(resolve, 3000));
  await Promise.race([
    typeof whenI18nReady === "function" ? whenI18nReady() : Promise.resolve(),
    i18nTimeout
  ]);

  if (!getToken()) { window.location.href = "/index.html"; return; }

  injectCSS();

  if (localStorage.getItem("role") === "modelo") {
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("ativa"));
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("ativa"));
    const aviso = document.createElement("div");
    aviso.style.cssText = "text-align:center;padding:32px 16px;color:#555;line-height:1.7;font-size:15px;";
    aviso.innerHTML = `
      <p>${t("transacoes.modelo_aviso1")}</p>
      <p>${t("transacoes.modelo_aviso2")}</p>
      <p>${t("transacoes.modelo_aviso3")} <a href="/relatorio.html" style="color:#6f3cff;font-weight:600;">${t("transacoes.ganhos_link")}</a>.</p>
    `;
    document.querySelector(".tabs")?.after(aviso);
    return;
  }

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
      if (tab === "ocorrencias") await carregarOcorrencias();
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
