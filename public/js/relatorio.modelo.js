// ===============================
// RELATÓRIO DE GANHOS — MODELO
// ===============================

let paginaAtualTransacoes = 1;
let statusAtual = null;
window.cbTotalMes = 0;

function emReais(valor) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function obterMesAtualSP() {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  return `${partes.find(p => p.type === "year").value}-${partes.find(p => p.type === "month").value}`;
}

function formatarDataHoraSP(dataIso) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(dataIso));
}

function nomeMes(yyyymm) {
  const [ano, mes] = yyyymm.split("-").map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// ===============================
// FILTRO DE MÊS
// ===============================
function popularFiltroMes() {
  const sel = document.getElementById("filtroMes");
  if (!sel) return;

  const mesAtual = obterMesAtualSP();
  const [anoAtual, mesAtualNum] = mesAtual.split("-").map(Number);

  for (let i = 0; i < 12; i++) {
    let m = mesAtualNum - i;
    let a = anoAtual;
    if (m <= 0) { m += 12; a -= 1; }
    const val = `${a}-${String(m).padStart(2, "0")}`;
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.addEventListener("change", () => {
    const val = sel.value;
    const eh_atual = val === mesAtual;
    carregarResumoModelo(eh_atual ? null : val);

    // mostra/oculta seções que só existem no mês atual
    const secoesApenasAtual = ["secaoHoje", "secaoAssinantes", "secaoMesAnterior", "secaoStatusMes"];
    secoesApenasAtual.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = eh_atual ? "" : "none";
    });

    // seção de situação só para mês filtrado
    const secaoFiltro = document.getElementById("secaoStatusFiltro");
    if (secaoFiltro) secaoFiltro.style.display = eh_atual ? "none" : "";
  });
}

// ===============================
// RESUMO FINANCEIRO
// ===============================
async function carregarResumoModelo(mes = null) {
  try {
    const url = mes ? `/api/modelo/financeiro?mes=${mes}` : "/api/modelo/financeiro";
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + localStorage.getItem("token") }
    });
    if (!res.ok) return;
    const data = await res.json();

    if (data.modelo) {
      window._modeloNome = data.modelo.nome;
      window._modeloId   = data.modelo.id;
    }

    const midias       = Number(data.mes?.midias      || 0);
    const assinaturas  = Number(data.mes?.assinaturas || 0);
    const bloqueadoMes = Number(data.bloqueado?.mes   || 0);
    const liberadoMes  = midias + assinaturas;
    const totalMes     = liberadoMes + bloqueadoMes;

    // Label hero
    const label = document.getElementById("labelMesAtual");
    if (label) label.textContent = mes ? `Total — ${nomeMes(mes)}` : `Total do mês`;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set("totalMesAtual",   emReais(totalMes));
    set("mesMidias",       emReais(midias));
    set("mesAssinaturas",  emReais(assinaturas));

    if (mes) {
      // SITUAÇÃO DO MÊS FILTRADO
      const bloqFiltro = Number(data.bloqueado?.mes || 0);
      set("liberadoFiltroMes",  emReais(liberadoMes));
      set("bloqueadoFiltroMes", emReais(bloqFiltro));
    }

    if (!mes) {
      // HOJE
      const hMidias      = Number(data.hoje?.midias      || 0);
      const hAssinaturas = Number(data.hoje?.assinaturas || 0);
      const bloqHoje     = Number(data.bloqueado?.hoje   || 0);
      const libHoje      = hMidias + hAssinaturas;

      set("hojeMidias",      emReais(hMidias));
      set("hojeAssinaturas", emReais(hAssinaturas));

      // ASSINANTES
      const totalAss = data.assinantes?.total ?? 0;
      const hojeAss  = data.assinantes?.hoje  ?? 0;
      set("totalAssinantes", totalAss);
      const badgeEl = document.getElementById("assinantesHoje");
      if (badgeEl) badgeEl.textContent = `+${hojeAss} hoje`;

      // SITUAÇÃO VALORES
      set("liberadoHoje",  emReais(libHoje));
      set("bloqueadoHoje", emReais(bloqHoje));
      set("liberadoMes",   emReais(liberadoMes));
      set("bloqueadoMes",  emReais(bloqueadoMes));

      // MÊS ANTERIOR
      const amMidias      = Number(data.mesAnterior?.midias      || 0);
      const amAssinaturas = Number(data.mesAnterior?.assinaturas || 0);
      const amBloqueado   = Number(data.bloqueado?.mesAnterior   || 0);
      const amLiberado    = amMidias + amAssinaturas;
      const amTotal       = amLiberado + amBloqueado;

      set("totalMesAnterior",       emReais(amTotal));
      set("mesAnteriorMidias",      emReais(amMidias));
      set("mesAnteriorAssinaturas", emReais(amAssinaturas));
      set("liberadoMesAnterior",    emReais(amLiberado));
      set("bloqueadoMesAnterior",   emReais(amBloqueado));

      const labelAnt = document.getElementById("labelMesAnterior");
      if (labelAnt) {
        const [a, m] = obterMesAtualSP().split("-").map(Number);
        const dAnt = new Date(a, m - 2, 1);
        labelAnt.textContent = dAnt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      }
    }

  } catch (err) {
    console.error("Erro carregarResumoModelo:", err);
  }
}

// ===============================
// TRANSAÇÕES
// ===============================

function obterMesAnteriorSP() {
  const [ano, mes] = obterMesAtualSP().split("-").map(Number);
  const d = new Date(ano, mes - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function renderTransacoes(dados) {
  return dados.map(tr => {
    const pendente = tr.disponibilidade === "pendente";
    return `
      <div class="transacao">
        <strong>#${tr.codigo}</strong> · ${tr.tipo}<br>
        ${formatarDataHoraSP(tr.created_at)}<br>
        ${t("relatorio.valor")}: ${emReais(tr.valor)}<br>
        <span class="${pendente ? 'status-pendente' : 'status-liberado'}">
          ${pendente ? t("relatorio.status_pendente") : t("relatorio.status_liberado")}
        </span>
      </div>
    `;
  }).join("");
}

async function carregarTransacoes(pagina = 1) {
  const lista     = document.getElementById("listaTransacoes");
  const paginacao = document.getElementById("paginacaoTransacoes");
  if (!lista) return;

  lista.innerHTML = t("relatorio.carregando_transacoes");
  if (paginacao) paginacao.innerHTML = "";

  const token = localStorage.getItem("token");
  if (!token) { lista.innerText = t("relatorio.nao_autenticada"); return; }

  try {
    const mesAtual    = obterMesAtualSP();
    const mesAnterior = obterMesAnteriorSP();
    const headers     = { Authorization: "Bearer " + token };

    const [resAtual, resAnterior] = await Promise.all([
      fetch(`/api/transacoes?mes=${mesAtual}&page=${pagina}`,    { headers }),
      fetch(`/api/transacoes?mes=${mesAnterior}&page=1`,         { headers })
    ]);

    if (!resAtual.ok) { lista.innerText = t("relatorio.erro_transacoes"); return; }

    const dataAtual    = await resAtual.json();
    const dataAnterior = resAnterior.ok ? await resAnterior.json() : { registros: [], totalLiberado: 0, totalPendente: 0 };

    const totalLiberado = (dataAtual.totalLiberado || 0) + (dataAnterior.totalLiberado || 0);
    const totalPendente = (dataAtual.totalPendente || 0) + (dataAnterior.totalPendente || 0);

    const resumoEl = document.getElementById("resumoDisponibilidadeTransacoes");
    if (resumoEl) {
      resumoEl.innerHTML = `
        <span class="resumo-liberado">${t("relatorio.transacoes_liberadas")}: ${emReais(totalLiberado)}</span>
        <span class="resumo-pendente">${t("relatorio.transacoes_pendentes")}: ${emReais(totalPendente)}</span>
      `;
    }

    const dadosAtual    = dataAtual.registros    || [];
    const dadosAnterior = dataAnterior.registros || [];

    lista.innerHTML = "";

    if (!dadosAtual.length && !dadosAnterior.length) {
      lista.innerText = t("relatorio.sem_transacoes");
      return;
    }

    if (dadosAtual.length) {
      lista.innerHTML += `<p class="rel-sec-lbl" style="margin:8px 0 4px">${nomeMes(mesAtual)}</p>`;
      lista.innerHTML += renderTransacoes(dadosAtual);
    }

    if (dadosAnterior.length) {
      lista.innerHTML += `<p class="rel-sec-lbl" style="margin:16px 0 4px">${nomeMes(mesAnterior)}</p>`;
      lista.innerHTML += renderTransacoes(dadosAnterior);
    }

    paginaAtualTransacoes = dataAtual.paginaAtual || 1;
    if (paginacao && (dataAtual.totalPaginas || 1) > 1) renderizarPaginacaoTransacoes(dataAtual.totalPaginas);

  } catch (err) {
    console.error(err);
    lista.innerText = t("relatorio.erro_inesperado");
  }
}

function renderizarPaginacaoTransacoes(totalPaginas) {
  const paginacao = document.getElementById("paginacaoTransacoes");
  if (!paginacao) return;
  paginacao.innerHTML = `
    <button class="pag-btn" ${paginaAtualTransacoes === 1 ? "disabled" : ""}
      onclick="carregarTransacoes(${paginaAtualTransacoes - 1})">${t("relatorio.anterior")}</button>
    <span class="pag-info">${paginaAtualTransacoes} / ${totalPaginas}</span>
    <button class="pag-btn" ${paginaAtualTransacoes === totalPaginas ? "disabled" : ""}
      onclick="carregarTransacoes(${paginaAtualTransacoes + 1})">${t("relatorio.proxima")}</button>
  `;
}

// ===============================
// PAGAMENTOS
// ===============================
async function abrirReciboModelo(id) {
  const win = window.open('', '_blank');
  if (!win) { alert('Permita pop-ups neste site para ver o recibo'); return; }
  win.document.write('<html><body style="font-family:sans-serif;padding:40px;color:#555">A carregar recibo...</body></html>');
  try {
    const res = await fetch(`/api/modelo/pagamentos/${id}/recibo`, {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (err) {
    win.document.open();
    win.document.write('<html><body style="padding:40px"><h2>Erro ao gerar recibo</h2><p>' + err.message + '</p></body></html>');
    win.document.close();
  }
}

async function carregarPagamentos() {
  const lista = document.getElementById("listaPagamentos");
  if (!lista) return;

  lista.innerHTML = t("relatorio.carregando_pagamentos");
  const token = localStorage.getItem("token");
  if (!token) { lista.innerText = t("relatorio.nao_autenticada"); return; }

  try {
    const res = await fetch("/api/modelo/pagamentos", {
      headers: { Authorization: "Bearer " + token }
    });
    const dados = await res.json();
    lista.innerHTML = "";

    if (!dados.length) { lista.innerText = t("relatorio.sem_pagamentos"); return; }

    dados.forEach(p => {
      const inicio = new Date(p.mes);
      const fim = new Date(inicio);
      fim.setMonth(fim.getMonth() + 1);
      fim.setDate(fim.getDate() - 1);

      const statusTexto = p.status === "pago" ? "Pago" : "Pendente";
      const statusCor   = p.status === "pago" ? "#22c55e" : "#f59e0b";
      const pagoEm = p.pago_em ? new Date(p.pago_em).toLocaleDateString("pt-BR") : "—";

      const midias      = Number(p.total_midias      || 0);
      const assinaturas = Number(p.total_assinaturas || 0);
      const chargebacks = Number(p.chargebacks       || 0);
      const bonus       = Number(p.bonus             || 0);
      const saldoBruto  = midias + assinaturas + chargebacks;
      const pagoLiquido = Number(p.total_geral       || 0);

      const pdfBtn = p.status === 'pago'
        ? `<button onclick="abrirReciboModelo(${p.id})"
              style="display:inline-block;margin-top:12px;padding:8px 16px;background:#7c3aed;color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;">
             🖨️ Ver / Imprimir Recibo
           </button>`
        : '';

      lista.innerHTML += `
        <div class="transacao" style="padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <strong style="font-size:15px;">${inicio.toLocaleDateString("pt-BR")} até ${fim.toLocaleDateString("pt-BR")}</strong>
            <span style="font-size:12px;font-weight:700;color:${statusCor};background:${statusCor}18;padding:3px 10px;border-radius:20px;">
              ${statusTexto}${pagoEm !== "—" ? " · " + pagoEm : ""}
            </span>
          </div>
          <div style="font-size:14px;line-height:2;">
            <div style="display:flex;justify-content:space-between;">
              <span style="font-weight:600;">Saldo Bruto</span><span style="font-weight:600;">${emReais(saldoBruto)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding-left:12px;color:#555;">
              <span>Mídias</span><span>${emReais(midias)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding-left:12px;color:#555;">
              <span>Assinaturas</span><span>${emReais(assinaturas)}</span>
            </div>
            ${chargebacks > 0 ? `<div style="display:flex;justify-content:space-between;padding-left:12px;color:#e53e3e;"><span>Chargebacks</span><span>− ${emReais(chargebacks)}</span></div>` : ''}
            <hr style="border:none;border-top:1px solid #eee;margin:6px 0;">
            ${bonus > 0 ? `<div style="display:flex;justify-content:space-between;color:#7c3aed;"><span>Bônus</span><span>+ ${emReais(bonus)}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;margin-top:4px;">
              <span>Pago Líquido</span><span style="color:#22c55e;">${emReais(pagoLiquido)}</span>
            </div>
          </div>
          ${pdfBtn}
        </div>
      `;
    });

  } catch (err) {
    console.error(err);
    lista.innerText = t("relatorio.erro_pagamentos");
  }
}

// ===============================
// CHARGEBACKS
// ===============================
function renderChargebackCards(dados, lista, emptyMsg) {
  const valorModeloOf = r => Number(r.valor_modelo ?? r.valor ?? 0);
  const tipoLabel     = { assinatura: "Assinatura VIP", midia: "Mídia", conteudo: "Mídia", premium: "Premium" };
  const gatewayLabel  = { cartao: "💳 Cartão", pix: "🏦 PIX" };

  if (!dados.length) {
    lista.innerHTML = `<p style="color:#888;text-align:center;padding:16px;">${emptyMsg}</p>`;
    return 0;
  }

  lista.innerHTML = "";
  dados.forEach(r => {
    const val  = valorModeloOf(r);
    const tipo = tipoLabel[r.tipo]    || r.tipo    || "—";
    const gw   = gatewayLabel[r.gateway] || r.gateway || "—";
    lista.innerHTML += `
      <div class="rel-cb-card">
        <div class="rel-cb-row">
          <strong class="rel-cb-valor">− ${emReais(val)}</strong>
          <span class="rel-cb-tipo">${tipo}</span>
        </div>
        <div class="rel-cb-meta">
          <span>📅 Compra: ${r.data_compra_fmt || "—"}</span>
          <span>⚠️ Contestação: ${r.data_fmt || "—"}</span><br>
          <span>Cliente: ${r.cliente_id || "—"}</span>
          <span>${gw}</span>
        </div>
      </div>
    `;
  });
  return dados.reduce((s, r) => s + valorModeloOf(r), 0);
}

async function carregarChargebacks() {
  const lista  = document.getElementById("listaChargebacks");
  const resumo = document.getElementById("resumoChargebacks");
  if (!lista) return;

  lista.innerHTML = "Carregando chargebacks...";

  const token   = localStorage.getItem("token");
  const headers = { Authorization: "Bearer " + token };
  const mesAnt  = obterMesAnteriorSP();

  try {
    const [resAtual, resAnt] = await Promise.all([
      fetch("/api/modelo/chargebacks",             { headers }),
      fetch(`/api/modelo/chargebacks?mes=${mesAnt}`, { headers })
    ]);

    if (!resAtual.ok) { lista.innerHTML = "Erro ao carregar chargebacks."; return; }

    const dados    = await resAtual.json();
    const dadosAnt = resAnt.ok ? await resAnt.json() : [];

    const valorModeloOf = r => Number(r.valor_modelo ?? r.valor ?? 0);
    const totalMes = dados.reduce((s, r) => s + valorModeloOf(r), 0);
    window.cbTotalMes = totalMes;

    if (resumo) {
      resumo.innerHTML = `
        <div class="rel-cb-res-card">
          <p>Qtd. este mês</p>
          <strong>${dados.length}</strong>
        </div>
        <div class="rel-cb-res-card">
          <p>Valor este mês</p>
          <strong>${emReais(totalMes)}</strong>
        </div>
      `;
    }

    renderChargebackCards(dados, lista, "Nenhum chargeback este mês.");

    // Mês anterior
    const secaoAnt = document.getElementById("secaoChargebacksAnterior");
    if (secaoAnt) {
      secaoAnt.style.display = "";
      const labelAnt = document.getElementById("labelChargebacksAnterior");
      if (labelAnt) labelAnt.textContent = nomeMes(mesAnt);

      const totalAnt = dadosAnt.reduce((s, r) => s + valorModeloOf(r), 0);
      const resumoAnt = document.getElementById("resumoChargebacksAnterior");
      if (resumoAnt) {
        resumoAnt.innerHTML = `
          <div class="rel-cb-res-card">
            <p>Qtd. mês anterior</p>
            <strong>${dadosAnt.length}</strong>
          </div>
          <div class="rel-cb-res-card">
            <p>Valor mês anterior</p>
            <strong>${emReais(totalAnt)}</strong>
          </div>
        `;
      }

      const listaAnt = document.getElementById("listaChargebacksAnterior");
      if (listaAnt) renderChargebackCards(dadosAnt, listaAnt, "Nenhum chargeback no mês anterior.");
    }

  } catch (err) {
    console.error("Erro chargebacks:", err);
    lista.innerHTML = "Erro ao carregar chargebacks.";
  }
}

// ===============================
// DADOS BANCÁRIOS
// ===============================
function alteracaoBloqueada() {
  return new Date().getDate() >= 1 && new Date().getDate() <= 5;
}

function mostrarStatusDadosBancarios(status) {
  const box = document.getElementById("statusDadosBancarios");
  if (!box) return;
  if (status === "aprovado") {
    box.style.display = "block";
    box.className = "status-box status-aprovado";
    box.innerText = t("relatorio.status_aprovado");
  } else {
    box.style.display = "none";
  }
}

function mostrarAviso(texto) {
  let aviso = document.getElementById("avisoDadosBancarios");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "avisoDadosBancarios";
    aviso.className = "status-box";
    aviso.style.background = "#fff7e6";
    aviso.style.color = "#9a6b00";
    aviso.style.marginBottom = "16px";
    document.getElementById("tab-dados-bancarios").prepend(aviso);
  }
  aviso.innerText = texto;
}

function liberarFormulario(form) {
  if (!form) return;
  form.querySelectorAll("input, select, textarea").forEach(el => el.disabled = false);
}

function bloquearFormulario(form) {
  if (!form) return;
  form.querySelectorAll("input, select, textarea").forEach(el => el.disabled = true);
}

async function carregarDadosBancarios() {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/modelo/dados-bancarios", {
    headers: { Authorization: "Bearer " + token }
  });
  if (!res.ok) return;

  const dados = await res.json();
  if (!dados) return;

  statusAtual = dados.status;
  mostrarStatusDadosBancarios(statusAtual);

  const tipoRecebimento = document.getElementById("tipoRecebimento");
  const titularNome     = document.getElementById("titularNome");
  const titularDocumento = document.getElementById("titularDocumento");
  const confirmarTitular = document.getElementById("confirmarTitular");
  const pixCampos       = document.getElementById("pixCampos");
  const pixTipo         = document.getElementById("pixTipo");
  const pixChave        = document.getElementById("pixChave");
  const transferenciaCampos = document.getElementById("transferenciaCampos");
  const banco           = document.getElementById("banco");
  const agencia         = document.getElementById("agencia");
  const conta           = document.getElementById("conta");
  const contaTipo       = document.getElementById("contaTipo");
  const form            = document.getElementById("formDadosBancarios");
  const btnAlterar      = document.getElementById("btnAlterarDados");

  tipoRecebimento.value  = dados.tipo;
  titularNome.value      = dados.titular_nome;
  titularDocumento.value = dados.titular_documento;
  confirmarTitular.checked = true;

  if (dados.tipo === "pix") {
    pixCampos.style.display = "block";
    transferenciaCampos.style.display = "none";
    pixTipo.value  = dados.pix_tipo;
    pixChave.value = dados.pix_chave;
  }
  if (dados.tipo === "transferencia") {
    transferenciaCampos.style.display = "block";
    pixCampos.style.display = "none";
    banco.value    = dados.banco;
    agencia.value  = dados.agencia;
    conta.value    = dados.conta;
    contaTipo.value = dados.conta_tipo;
  }

  if (alteracaoBloqueada()) {
    bloquearFormulario(form);
    if (btnAlterar) btnAlterar.style.display = "none";
    mostrarAviso(t("relatorio.bloqueio_periodo"));
    return;
  }
  if (statusAtual === "aprovado") {
    bloquearFormulario(form);
    if (btnAlterar) btnAlterar.style.display = "inline-block";
    return;
  }
  if (statusAtual === "pendente" || statusAtual === "alteracao_pendente") {
    bloquearFormulario(form);
    if (btnAlterar) btnAlterar.style.display = "none";
    if (statusAtual === "alteracao_pendente") mostrarAviso(t("relatorio.alteracao_pendente"));
    return;
  }
  liberarFormulario(form);
}

// ===============================
// IMPRESSÃO / PDF
// ===============================
function imprimirRelatorio() {
  const sel = document.getElementById("filtroMes");
  const mes = sel ? sel.value : obterMesAtualSP();
  const mesNome = nomeMes(mes);

  const totalEl     = document.getElementById("totalMesAtual");
  const midiasEl    = document.getElementById("mesMidias");
  const assEl       = document.getElementById("mesAssinaturas");
  const bloqueadoEl = document.getElementById("bloqueadoMes");

  const total  = totalEl?.textContent  || "R$ 0,00";
  const midias = midiasEl?.textContent || "R$ 0,00";
  const ass    = assEl?.textContent    || "R$ 0,00";
  const cbTotal = window.cbTotalMes || 0;

  function parseReais(el) {
    if (!el) return 0;
    return parseFloat(el.textContent.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
  }

  const midiasNum    = parseReais(midiasEl);
  const assNum       = parseReais(assEl);
  const bloqueadoNum = parseReais(bloqueadoEl);

  // Liberado mês anterior = Stripe do mês passado liberado AGORA → conta neste mês
  const mesAtual = obterMesAtualSP();
  let libAntNum = 0;
  if (mes === mesAtual) {
    libAntNum = parseReais(document.getElementById("liberadoMesAnterior"));
  }

  // Ganhos Totais = o que efetivamente entrou neste mês (pendentes Stripe NÃO entram)
  const ganhosTotal = midiasNum + assNum + libAntNum;
  const liquidoNum  = ganhosTotal - cbTotal;

  const nomeModelo = window._modeloNome || "—";
  const modeloId   = window._modeloId   || "—";

  document.getElementById("printConteudo").innerHTML = `
    <div class="print-titulo">Relatório de Ganhos</div>
    <div class="print-sub">${mesNome}</div>
    <div class="print-modelo">Modelo: <strong>${nomeModelo}</strong> &nbsp;·&nbsp; ID: <strong>#${modeloId}</strong></div>

    <div class="print-sec">Ganhos do mês</div>
    <div class="print-linha"><span>Ganhos Totais</span><span>${emReais(ganhosTotal)}</span></div>
    <div class="print-linha sub"><span>Assinaturas</span><span>${ass}</span></div>
    <div class="print-linha sub"><span>Mídias</span><span>${midias}</span></div>
    ${libAntNum > 0 ? `<div class="print-linha sub"><span>Liberado mês anterior (Stripe)</span><span>${emReais(libAntNum)}</span></div>` : ""}
    ${cbTotal > 0 ? `<div class="print-linha sub neg"><span>Chargebacks</span><span>− ${emReais(cbTotal)}</span></div>` : ""}

    <div class="print-linha total"><span>Ganhos Líquidos</span><span>${emReais(liquidoNum)}</span></div>

    ${bloqueadoNum > 0 ? `
    <div class="print-sec" style="margin-top:20px;">Retenção Stripe — libera no próximo mês</div>
    <div class="print-linha hold"><span>Pendentes de Liberação</span><span>${emReais(bloqueadoNum)}</span></div>
    ` : ""}
  `;

  window.print();
}

// ===============================
// ACCORDION
// ===============================
const _carregado = {};

function inicializarAccordion() {
  // Ganhos usa <div> para poder ter elementos interativos internos
  const toggleGanhos = document.getElementById("toggleGanhos");
  if (toggleGanhos) {
    _carregado["corpo-ganhos"] = true; // já carregado por carregarResumoModelo
    toggleGanhos.addEventListener("click", () => {
      const item = document.getElementById("acordGanhos");
      item.classList.toggle("acord-aberto");
    });
  }

  // Demais accordions usam <button>
  document.querySelectorAll("button.acord-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".acord-item");
      const target = btn.dataset.target;
      const aberto = item.classList.contains("acord-aberto");

      // fecha todos
      document.querySelectorAll(".acord-item.acord-aberto").forEach(i => i.classList.remove("acord-aberto"));

      if (!aberto) {
        item.classList.add("acord-aberto");

        // lazy-load na primeira abertura
        if (!_carregado[target]) {
          _carregado[target] = true;
          if (target === "tab-transacoes")      carregarTransacoes(1);
          if (target === "tab-pagamentos")      carregarPagamentos();
          if (target === "tab-chargebacks")     carregarChargebacks();
          if (target === "tab-dados-bancarios") carregarDadosBancarios();
        }
      }
    });
  });
}

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await inicializarIdioma();

  popularFiltroMes();
  carregarResumoModelo();
  inicializarAccordion();

  // FORM DADOS BANCÁRIOS — eventos (wiring permanente)
  const form = document.getElementById("formDadosBancarios");
  if (!form) return;

  const tipoRecebimento = document.getElementById("tipoRecebimento");
  const pixCampos       = document.getElementById("pixCampos");
  const transferenciaCampos = document.getElementById("transferenciaCampos");
  const pixTipo         = document.getElementById("pixTipo");
  const pixChave        = document.getElementById("pixChave");
  const banco           = document.getElementById("banco");
  const agencia         = document.getElementById("agencia");
  const conta           = document.getElementById("conta");
  const contaTipo       = document.getElementById("contaTipo");
  const titularNome     = document.getElementById("titularNome");
  const titularDocumento = document.getElementById("titularDocumento");
  const confirmarTitular = document.getElementById("confirmarTitular");
  const justificativa   = document.getElementById("justificativa");
  const btnAlterar      = document.getElementById("btnAlterarDados");

  tipoRecebimento.addEventListener("change", () => {
    pixCampos.style.display = tipoRecebimento.value === "pix" ? "block" : "none";
    transferenciaCampos.style.display = tipoRecebimento.value === "transferencia" ? "block" : "none";
  });

  btnAlterar?.addEventListener("click", () => {
    if (statusAtual !== "aprovado") return;
    liberarFormulario(form);
    const jBox = document.getElementById("justificativaBox");
    jBox.style.display = "block";
    justificativa.disabled = false;
    justificativa.focus();
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const endpoint = statusAtual === "aprovado"
        ? "/api/modelo/dados-bancarios/alterar"
        : "/api/modelo/dados-bancarios";

      const payload = {
        tipo: tipoRecebimento.value,
        pix_tipo: pixTipo.value,
        pix_chave: pixChave.value,
        banco: banco.value,
        agencia: agencia.value,
        conta: conta.value,
        conta_tipo: contaTipo.value,
        titular_nome: titularNome.value,
        titular_documento: titularDocumento.value,
        confirmado_titular: confirmarTitular.checked,
        justificativa: justificativa?.value?.trim() || null
      };

      if (statusAtual === "aprovado" && !payload.justificativa) {
        alert(t("relatorio.justificativa_obrigatoria"));
        return;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify(payload)
      });

      const text = await res.text();
      let r = {};
      try { r = text ? JSON.parse(text) : {}; } catch { r = { error: text }; }

      if (!res.ok) { alert(t("relatorio.erro_envio")); return; }

      alert(t("relatorio.sucesso_envio"));
      statusAtual = statusAtual === "aprovado" ? "alteracao_pendente" : "pendente";
      bloquearFormulario(form);
      mostrarStatusDadosBancarios(statusAtual);
      const jBox = document.getElementById("justificativaBox");
      if (jBox) jBox.style.display = "none";
      await carregarDadosBancarios();

    } catch (err) {
      console.error("Erro submit dados bancários:", err);
      alert(t("relatorio.erro_envio_console"));
    }
  });
});
