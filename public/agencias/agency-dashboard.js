/* ========================================
   VELVET agency DASHBOARD — JS
   ======================================== */

  const token = localStorage.getItem("token_agency");

if (!token) {
  window.location.href = "/agencias/login.html";
  throw new Error("Sem token agency");
}

async function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: token ? `Bearer ${token}` : ""
    }
  });
}

async function fetchJSON(url) {
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postJSON(url, body) {
  const res = await authFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.erro || err.error || err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

async function putJSON(url, body) {
  const res = await authFetch(url, {
    method: 'PUT',
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.erro || err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

async function deleteJSON(url) {
  const res = await authFetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

// ========== HELPERS ==========

function $(id) { return document.getElementById(id); }

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast active ' + type;
  setTimeout(() => t.className = 'toast', 3500);
}

function emptyRow(cols) {
  return `<tr class="empty-row"><td colspan="${cols}">Nenhum registro encontrado</td></tr>`;
}

function badgeStatus(status) {
  const map = {
    pendente: 'badge-warning',
    aprovado: 'badge-success',
    rejeitado: 'badge-danger',
    pago: 'badge-success',
    ativo: 'badge-success',
    normal: 'badge-success',
    em_analise: 'badge-info',
    expirado: 'badge-muted',
    falhou: 'badge-danger',
    iniciado: 'badge-info',
    cancelado: 'badge-danger'
  };
  return `<span class="badge ${map[status] || 'badge-muted'}">${status || '—'}</span>`;
}

function populateMonthSelect(el, startYear = 2025) {
  const now = new Date();
  const months = [];
  for (let y = now.getFullYear(); y >= startYear; y--) {
    const maxM = (y === now.getFullYear()) ? now.getMonth() + 1 : 12;
    for (let m = maxM; m >= 1; m--) {
      const val = `${y}-${String(m).padStart(2, '0')}`;
      const label = new Date(y, m - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      months.push({ val, label });
    }
  }
  el.innerHTML = months.map((m, i) =>
    `<option value="${m.val}" ${i === 0 ? 'selected' : ''}>${m.label}</option>`
  ).join('');
}

function buildPagination(containerId, currentPage, totalPages, callback) {
  const container = $(containerId);
  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }
  let html = '';
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  if (currentPage > 1) html += `<button onclick="${callback}(${currentPage - 1})">&laquo;</button>`;
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="${callback}(${i})">${i}</button>`;
  }
  if (currentPage < totalPages) html += `<button onclick="${callback}(${currentPage + 1})">&raquo;</button>`;
  container.innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

async function carregarAgencia() {
  const res = await fetch("/agency/dashboard/name-agency", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token_agency")
    }
  });

  const data = await res.json();

  document.querySelector(".agency-badge").textContent = data.nome;
}

carregarAgencia();

// ========== NAVIGATION ==========

const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitles = {
  overview: 'Visão Geral',
  acessos: 'Acessos por Origem',
  agency: 'Agência',
  fechamento: 'Fechamentos Mensais',
  bancarios: 'Dados Bancários',
  modelos: 'Modelos',
  ranking: 'Ranking',
  'pagamentos-agencia': 'Pagamentos',
  ofertas: 'Ofertas',
  assinaturas: 'Assinaturas',
  feed: 'Feed',
  premium: 'Premium',
  conteudos: 'Conteúdos',
  links: 'Links',
  'avatar-capa': 'Avatar e Capa',
  'bio-perfil': 'Bio e Perfil'
};

const pageLoaders = {};

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    pages.forEach(p => p.classList.remove('active'));
    const pageEl = $('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    $('pageTitle').textContent = pageTitles[page] || page;
    if (pageLoaders[page]) pageLoaders[page]();
  });
});

// Sidebar toggle
$('sidebarToggle').addEventListener('click', () => {
  $('sidebar').classList.toggle('collapsed');
});

// Mobile sidebar toggle
document.querySelector('.topbar-menu-btn')?.addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('mobile-open');
  document.querySelector('.sidebar-overlay').classList.toggle('active');
});

document.querySelector('.sidebar-overlay')?.addEventListener('click', () => {
  document.querySelector('.sidebar').classList.remove('mobile-open');
  document.querySelector('.sidebar-overlay').classList.remove('active');
});

// Tab handling
document.querySelectorAll('.tabs').forEach(tabGroup => {
  tabGroup.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabGroup.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const parent = tabGroup.parentElement;
      parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const target = parent.querySelector('#tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
});

// ========== MODALS ==========

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  const overlay = document.getElementById('modalOverlay');
  if (modal) modal.classList.add('active');
  if (overlay) overlay.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');

  const overlay = document.getElementById('modalOverlay');
  const aindaExisteModalAberto = document.querySelector('.modal.active');

  if (overlay && !aindaExisteModalAberto) {
    overlay.classList.remove('active');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.classList.remove('active');
}

function logout() {
  localStorage.removeItem('token_agency');
  window.location.href = '/agencias/login.html';
}

function abrirResetSenha() {
  const el = document.getElementById('novaSenha');
  if (el) el.value = '';
  openModal('modalAgency');
}

// ========== 1. OVERVIEW ==========

let chartFat, chartAcessosOverview;

pageLoaders.overview = async function () {
  try {
    const data = await fetchJSON('/agency/dashboard/overview');

    $('kpi-modelos').textContent = Number(data.total_modelos ?? 0);
    $('kpi-vips').textContent = Number(data.vips_ativos ?? 0);
    $('kpi-fatd').textContent = money(Number(data.faturamento_dia ?? 0));
    $('kpi-fatm').textContent = money(Number(data.faturamento_mes ?? 0));

    // Chart faturamento últimos 12 meses
    if (chartFat) {
      chartFat.destroy();
      chartFat = null;
    }

    chartFat = new Chart($('chartOverviewFat'), {
      type: 'bar',
      data: {
        labels: (data.faturamento_12m || []).map(d => d.mes),
        datasets: [{
          label: 'Faturamento',
          data: (data.faturamento_12m || []).map(d => Number(d.total || 0)),
          backgroundColor: 'rgba(123,44,255,0.7)',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });

    // Chart acessos por origem do mês atual
    if (chartAcessosOverview) {
      chartAcessosOverview.destroy();
      chartAcessosOverview = null;
    }

    chartAcessosOverview = new Chart($('chartOverviewAcessos'), {
      type: 'doughnut',
      data: {
        labels: (data.acessos_origem || []).map(d => d.origem),
        datasets: [{
          data: (data.acessos_origem || []).map(d => Number(d.total || 0)),
          backgroundColor: ['#7B2CFF', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });

    // Top 5 modelos do mês
    const tbody = $('tableTopModelos').querySelector('tbody');
    tbody.innerHTML = (data.top_modelos || []).map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${m.nome || 'Modelo #' + m.modelo_id}</td>
        <td>${money(Number(m.ganhos || 0))}</td>
        <td>${money(Number(m.ganhos_agencia || 0))}</td>
        <td>${Number(m.assinantes || 0)}</td>
      </tr>
    `).join('') || emptyRow(5);

  } catch (err) {
    console.error('Erro overview:', err);

    $('kpi-modelos').textContent = '--';
    $('kpi-vips').textContent = '--';
    $('kpi-fatd').textContent = '--';
    $('kpi-fatm').textContent = '--';

    const tbody = $('tableTopModelos')?.querySelector('tbody');
    if (tbody) tbody.innerHTML = emptyRow(5);
  }
};

// ========== 2. ACESSOS ==========

let chartAcessosBar, chartAcessosPie;

pageLoaders.acessos = async function () {
  populateMonthSelect($('acessosMes'));
  await carregarAcessos();
  $('acessosMes').onchange = carregarAcessos;
};

async function carregarAcessos() {
  try {
    const mes = $('acessosMes').value;
    const data = await fetchJSON(`/agency/dashboard/acessos-origem?mes=${mes}`);

    $('kpi-insta').textContent = data.instagram ?? 0;
    $('kpi-tiktok').textContent = data.tiktok ?? 0;
    $('kpi-direto').textContent = data.direto ?? 0;
    $('kpi-totalAcessos').textContent = data.total ?? 0;

    if (data.diario) {
      if (chartAcessosBar) chartAcessosBar.destroy();
      chartAcessosBar = new Chart($('chartAcessosBar'), {
        type: 'bar',
        data: {
          labels: data.diario.map(d => d.dia),
          datasets: [
            { label: 'Instagram', data: data.diario.map(d => d.instagram), backgroundColor: '#7B2CFF', borderRadius: 4 },
            { label: 'TikTok', data: data.diario.map(d => d.tiktok), backgroundColor: '#3B82F6', borderRadius: 4 },
            { label: 'Direto', data: data.diario.map(d => d.direto), backgroundColor: '#10B981', borderRadius: 4 }
          ]
        },
        options: { plugins: { legend: { position: 'top' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
      });
    }

    if (data.distribuicao) {
      if (chartAcessosPie) chartAcessosPie.destroy();
      chartAcessosPie = new Chart($('chartAcessosPie'), {
        type: 'doughnut',
        data: {
          labels: ['Instagram', 'TikTok', 'Direto', 'Outros'],
          datasets: [{
            data: [data.instagram, data.tiktok, data.direto, (data.total - data.instagram - data.tiktok - data.direto)],
            backgroundColor: ['#7B2CFF', '#3B82F6', '#10B981', '#9CA3AF']
          }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
      });
    }

    const tbody = $('tableAcessosTop').querySelector('tbody');
    tbody.innerHTML = (data.top_modelos || []).map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${m.nome || 'Modelo #' + m.modelo_id}</td>
        <td>${m.instagram ?? 0}</td>
        <td>${m.tiktok ?? 0}</td>
        <td>${m.direto ?? 0}</td>
        <td><strong>${m.total ?? 0}</strong></td>
      </tr>
    `).join('') || emptyRow(6);

  } catch (err) {
    console.error('Erro acessos:', err);
  }
}

// ========== 3. agency ==========

pageLoaders.agency = async function () {
  try {
    const data = await fetchJSON('/agency/dashboard/agency');
    const tbody = $('tableAgency').querySelector('tbody');
    const agencia = (data || [])[0];

    tbody.innerHTML = agencia ? `
      <tr>
        <td>${agencia.id}</td>
        <td>${escapeHtml(agencia.nome || '—')}</td>
        <td>${agencia.email}</td>
        <td>${fmtDateTime(agencia.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="abrirResetSenha()">Resetar Senha</button>
        </td>
      </tr>
    ` : emptyRow(5);

    if (agencia) {
      const inpAg = $('inputPercentualAgencia');
      const inpMod = $('inputPercentualModelo');
if (inpAg) inpAg.value = (agencia.percentual_agencia * 100).toFixed(2);
if (inpMod) inpMod.value = (agencia.percentual_modelo * 100).toFixed(2);
      atualizarSoma();
    }
  } catch (err) {
    console.error('Erro agency:', err);
  }
};

function atualizarSoma() {
  const ag  = Number($('inputPercentualAgencia')?.value || 0);
  const mod = Number($('inputPercentualModelo')?.value || 0);

  const velvet = 20;
  const total = velvet + ag + mod;

  const info = $('percentualSomaInfo');
  if (!info) return;

  if (ag + mod > 80) {
    info.style.color = 'var(--red)';
    info.textContent = `❌ Excede limite: ${total.toFixed(2)}% (máx: 100%)`;
  } else if (ag + mod === 80) {
    info.style.color = 'var(--green)';
    info.textContent = `✔ Perfeito: ${total.toFixed(2)}%`;
  } else {
    info.style.color = 'var(--text-muted)';
    info.textContent = `Total: ${total.toFixed(2)}% (Velvet ${velvet}% + Agência ${ag}% + Modelo ${mod}%)`;
  }
}

async function salvarPercentuais(e) {
  e.preventDefault();

  const ag  = Number($('inputPercentualAgencia').value);
  const mod = Number($('inputPercentualModelo').value);

  const velvet = 20;

  if (ag + mod > (100 - velvet)) {
    toast(
      `Soma inválida: Velvet ${velvet}% + Agência ${ag}% + Modelo ${mod}% = ${velvet + ag + mod}%`,
      'error'
    );
    return;
  }

  try {
    await putJSON('/agency/dashboard/agency/percentuais', {
      percentual_agencia: ag,
      percentual_modelo: mod
    });

    toast('Percentuais atualizados com sucesso!', 'success');
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function resetSenha() {
  const senha = document.getElementById('novaSenha').value;

  if (!senha || senha.length < 6) {
    toast('Senha inválida (mínimo 6 caracteres)', 'error');
    return;
  }

  try {
    await putJSON('/agency/dashboard/agency/reset-password', { senha });
    toast('Senha atualizada com sucesso', 'success');
    closeModal('modalAgency');
  } catch (err) {
    console.error('Erro reset senha:', err);
    toast('Erro ao atualizar senha', 'error');
  }
}


// ========== 7. FECHAMENTO ==========

let fechamentosAgencyCache = [];

pageLoaders.fechamento = async function () {
  try {
    const data = await fetchJSON('/agency/dashboard/fechamentos-agency');
    fechamentosAgencyCache = data.rows || [];

    $('kpi-fat-geral-modelo').textContent = money(data.totais_gerais?.faturamento_modelo);
    $('kpi-fat-geral-agencia').textContent = money(data.totais_gerais?.faturamento_agencia);

    const tbody = $('tableFechamento').querySelector('tbody');
    tbody.innerHTML = fechamentosAgencyCache.map(r => `
      <tr>
        <td>${r.ano}</td>
        <td>${r.mes}</td>
        <td>${money(r.total_bruto)}</td>
        <td>${money(r.total_agencia)}</td>
        <td>${money(r.total_modelo)}</td>
        <td>${money(r.total_bruto_midia)}</td>
        <td>${money(r.total_bruto_assinatura)}</td>
        <td>${fmtDateTime(r.created_at)}</td>
        <td><button class="btn btn-primary" onclick="abrirDetalheFechamentoAgency(${r.id})">Ver detalhe</button></td>
      </tr>
    `).join('') || emptyRow(9);
  } catch (err) {
    console.error('Erro fechamento:', err);
    toast('Erro ao carregar fechamentos', 'error');
  }
};

async function gerarFechamentoAgency() {
  const mesInput = $('novoFechamentoMes').value;
  if (!mesInput) return toast('Selecione o mês', 'error');
  const [ano, mes] = mesInput.split('-').map(Number);
  const despesaChatterRaw = $('novoFechamentoDespesaChatter').value;
  const despesaChatter = despesaChatterRaw !== '' ? Number(despesaChatterRaw) : null;

  try {
    await postJSON('/agency/dashboard/fechamentos-agency', { ano, mes, despesa_chatter: despesaChatter });
    toast('Fechamento gerado!', 'success');
    pageLoaders.fechamento();
  } catch (err) {
    toast('Erro: ' + (err.message || 'Não foi possível gerar o fechamento'), 'error');
  }
}

let fechamentoDetalheAtual = null;

async function abrirDetalheFechamentoAgency(id) {
  try {
    const f = await fetchJSON(`/agency/dashboard/fechamentos-agency/${id}`);
    fechamentoDetalheAtual = f;

    const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    $('fechDetalheTitulo').textContent = `Fechamento — ${meses[f.mes]}/${f.ano}`;

    const liquido = Number(f.total_agencia) - Number(f.despesa_chatter);

    $('fechDetalheCorpo').innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card purple"><span>Faturado Agência</span><strong>${money(f.total_agencia)}</strong></div>
        <div class="kpi-card red"><span>Despesa Chatter</span><strong>${money(f.despesa_chatter)}</strong></div>
        <div class="kpi-card green"><span>Líquido Agência</span><strong>${money(liquido)}</strong></div>
      </div>
      <table class="table">
        <thead><tr><th>Modelo</th><th>Mídias</th><th>Assinaturas</th><th>Total</th></tr></thead>
        <tbody>
          ${(f.modelos || []).map(m => `
            <tr>
              <td>${escapeHtml(m.nome_exibicao || m.nome || ('Modelo #' + m.modelo_id))}</td>
              <td>${money(m.total_midias)}</td>
              <td>${money(m.total_assinaturas)}</td>
              <td>${money(m.total_geral)}</td>
            </tr>
          `).join('') || emptyRow(4)}
        </tbody>
      </table>
    `;

    openModal('modalFechamentoDetalhe');
  } catch (err) {
    toast('Erro ao abrir detalhe: ' + err.message, 'error');
  }
}

function imprimirFechamentoAgency() {
  const f = fechamentoDetalheAtual;
  if (!f) return;

  const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const liquido = Number(f.total_agencia) - Number(f.despesa_chatter);

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Fechamento — ${meses[f.mes]}/${f.ano}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; font-size:13px; color:#111; padding:40px; }
      h1 { font-size:20px; margin-bottom:4px; }
      .sub { color:#666; font-size:12px; margin-bottom:32px; }
      table { width:100%; border-collapse:collapse; margin-top:16px; }
      td, th { padding:6px 8px; border-bottom:1px solid #e5e7eb; }
      th { background:#f3f4f6; font-weight:600; font-size:12px; text-align:left; }
      .resumo { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin:24px 0; }
      .card { border:1px solid #e5e7eb; border-radius:8px; padding:16px; }
      .card-label { font-size:11px; color:#666; text-transform:uppercase; margin-bottom:4px; }
      .card-value { font-size:20px; font-weight:700; }
      .green { color:#16a34a; } .red { color:#dc2626; } .purple { color:#6366f1; }
      @media print { body { padding:20px; } }
    </style>
  </head><body>
    <h1>Velvet Agências — Fechamento Mensal</h1>
    <div class="sub">${meses[f.mes]} de ${f.ano} &nbsp;·&nbsp; Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>

    <div class="resumo">
      <div class="card"><div class="card-label">Faturado Agência</div><div class="card-value purple">${money(f.total_agencia)}</div></div>
      <div class="card"><div class="card-label">Despesa Chatter</div><div class="card-value red">${money(f.despesa_chatter)}</div></div>
      <div class="card"><div class="card-label">Líquido Agência</div><div class="card-value green">${money(liquido)}</div></div>
    </div>

    <h2>Detalhamento por Modelo</h2>
    <table>
      <thead><tr><th>Modelo</th><th>Mídias</th><th>Assinaturas</th><th>Total</th></tr></thead>
      <tbody>
        ${(f.modelos || []).map(m => `
          <tr>
            <td>${m.nome_exibicao || m.nome || ('Modelo #' + m.modelo_id)}</td>
            <td>${money(m.total_midias)}</td>
            <td>${money(m.total_assinaturas)}</td>
            <td>${money(m.total_geral)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ========== 8. DADOS BANCÁRIOS ==========

pageLoaders.bancarios = function () {
  carregarBancarios(1);
  $('bancariosFiltro').onchange = () => carregarBancarios(1);
};

async function carregarBancarios(page) {
  try {
    const status = $('bancariosFiltro').value;
    const data = await fetchJSON(`/agency/dashboard/dados-bancarios?page=${page}&limit=20&status=${status}`);
    const tbody = $('tableBancarios').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.modelo_id}</td>
        <td>${r.modelo_nome || 'Modelo #' + r.modelo_id}</td>
        <td>${r.tipo}</td>
        <td>${r.pix_chave || '—'}</td>
        <td>${r.titular_nome}</td>
        <td>${badgeStatus(r.status)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editarBancario(${r.id})">Editar</button>
          ${r.status === 'pendente' ? `
            <button class="btn btn-sm btn-success" onclick="aprovarBancario(${r.id})">Aprovar</button>
            <button class="btn btn-sm btn-danger" onclick="rejeitarBancario(${r.id})">Rejeitar</button>
          ` : ''}
        </td>
      </tr>
    `).join('') || emptyRow(7);
    buildPagination('paginationBancarios', page, data.totalPages || 1, 'carregarBancarios');
  } catch (err) { console.error('Erro bancários:', err); }
}

async function abrirModalNovoDadoBancario() {
  try {
    const modelos = await fetchJSON('/agency/dashboard/modelos-lista');
    const select = $('novoBancarioModeloId');
    select.innerHTML = modelos.map(m => `<option value="${m.id}">${escapeHtml(m.nome)}</option>`).join('');
    $('formNovoDadoBancario').reset();
    openModal('modalNovoDadoBancario');
  } catch (err) {
    toast('Erro ao carregar modelos: ' + err.message, 'error');
  }
}

async function salvarNovoDadoBancario(e) {
  e.preventDefault();
  const form = new FormData(e.target);

  try {
    await postJSON('/agency/dashboard/dados-bancarios', {
      modelo_id: Number(form.get('modelo_id')),
      tipo: form.get('tipo'),
      pix_tipo: form.get('pix_tipo'),
      pix_chave: form.get('pix_chave'),
      banco: form.get('banco'),
      agencia: form.get('agencia'),
      conta: form.get('conta'),
      conta_tipo: form.get('conta_tipo'),
      titular_nome: form.get('titular_nome'),
      titular_documento: form.get('titular_documento'),
      confirmado_titular: form.get('confirmado_titular') === 'on'
    });
    toast('Dados bancários cadastrados!', 'success');
    closeModal('modalNovoDadoBancario');
    carregarBancarios(1);
  } catch (err) {
    toast('Erro ao salvar: ' + err.message, 'error');
  }
}

async function aprovarBancario(id) {
  try {
    await putJSON('/agency/dashboard/dados-bancarios/' + id, { status: 'aprovado' });
    toast('Dados bancários aprovados!', 'success');
    carregarBancarios(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function rejeitarBancario(id) {
  const motivo = prompt('Motivo da rejeição:');
  if (!motivo) return;
  try {
    await putJSON('/agency/dashboard/dados-bancarios/' + id, { status: 'rejeitado', motivo_rejeicao: motivo });
    toast('Dados bancários rejeitados', 'success');
    carregarBancarios(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function editarBancario(id) {
  try {
    const data = await fetchJSON('/agency/dashboard/dados-bancarios/' + id);
    openEditModal('Editar Dados Bancários', '/agency/dashboard/dados-bancarios/' + id, 'PUT', [
      { name: 'tipo', label: 'Tipo', value: data.tipo },
      { name: 'pix_tipo', label: 'Tipo PIX', value: data.pix_tipo },
      { name: 'pix_chave', label: 'Chave PIX', value: data.pix_chave },
      { name: 'banco', label: 'Banco', value: data.banco },
      { name: 'agencia', label: 'Agência', value: data.agencia },
      { name: 'conta', label: 'Conta', value: data.conta },
      { name: 'titular_nome', label: 'Titular Nome', value: data.titular_nome },
      { name: 'titular_documento', label: 'Titular Documento', value: data.titular_documento },
      { name: 'status', label: 'Status', type: 'select', value: data.status, options: ['pendente', 'aprovado', 'rejeitado'] }
    ], () => carregarBancarios(1));
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 9. MODELOS ==========

let modelosSearchTimeout;

pageLoaders.modelos = function () {
  carregarModelos(1);
  $('modelosBusca').oninput = () => {
    clearTimeout(modelosSearchTimeout);
    modelosSearchTimeout = setTimeout(() => carregarModelos(1), 400);
  };
};

async function carregarModelos(page) {
  try {
    const busca = $('modelosBusca').value;
    const data = await fetchJSON(`/agency/dashboard/modelos?page=${page}&limit=20&busca=${encodeURIComponent(busca)}`);
    const tbody = $('tableModelos').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.nome}</td>
        <td>${r.email || '—'}</td>
        <td>${r.verificada ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-muted">Não</span>'}</td>
        <td>${r.feed ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-muted">Não</span>'}</td>
        <td>${r.agencia_nome || '—'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editarModelo(${r.id})">Editar</button>
          <button class="btn btn-sm btn-ghost" onclick="verDadosModelo(${r.id})">Dados</button>
        </td>
      </tr>
    `).join('') || emptyRow(7);
    buildPagination('paginationModelos', page, data.totalPages || 1, 'carregarModelos');
  } catch (err) { console.error('Erro modelos:', err); }
}

async function editarModelo(id) {
  try {
    const [data, agencias] = await Promise.all([
      fetchJSON('/agency/dashboard/modelos/' + id),
    ]);

    openEditModal('Editar Modelo #' + id, '/agency/dashboard/modelos/' + id, 'PUT', [
      { name: 'nome', label: 'Nome', value: data.nome || '' },
      { name: 'nome_exibicao', label: 'Nome Exibição', value: data.nome_exibicao || '' },
      { name: 'bio', label: 'Bio', type: 'textarea', value: data.bio || '' },
      { name: 'local', label: 'Local', value: data.local || '' },
      { name: 'genero', label: 'Gênero', type: 'select', value: data.genero || '', options: [
          { value: '', label: 'Selecione...' },
          { value: 'mulher', label: 'Mulher' },
          { value: 'homem', label: 'Homem' },
          { value: 'nao_binario', label: 'Não binário' }
        ]
      },
      { name: 'created_at_view', label: 'Criado em', value: fmtDateTime(data.created_at), disabled: true},
      { name: 'ativo', label: 'Ativo', type: 'checkbox', value: !!data.ativo }
    ], () => carregarModelos(1));
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function verDadosModelo(id) {
  try {
    const data = await fetchJSON('/agency/dashboard/modelos-dados/' + id);
    openEditModal('Dados do Modelo #' + id, '/agency/dashboard/modelos-dados/' + id, 'PUT', [
      { name: 'nome_completo', label: 'Nome Completo', value: data.nome_completo },
      { name: 'data_nascimento', label: 'Nascimento', type: 'date', value: data.data_nascimento },
      { name: 'telefone', label: 'Telefone', value: data.telefone },
      { name: 'endereco', label: 'Endereço', value: data.endereco },
      { name: 'pais', label: 'País', value: data.pais },
      { name: 'estado', label: 'Estado', value: data.estado },
      { name: 'cidade', label: 'Cidade', value: data.cidade },
      { name: 'instagram', label: 'Instagram', value: data.instagram },
      { name: 'tiktok', label: 'TikTok', value: data.tiktok },
      { name: 'vip_preco', label: 'Preço VIP', type: 'number', value: data.vip_preco }
    ], () => carregarModelos(1));
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 10. RANKING ==========

let chartRanking;

pageLoaders.ranking = async function () {
  populateMonthSelect($('rankingMes'));
  await carregarRanking();

  $('rankingMes').onchange = carregarRanking;
};

async function carregarRanking() {
  try {
    const mes = $('rankingMes')?.value || '';
    const url = mes
      ? `/agency/dashboard/ranking?mes=${encodeURIComponent(mes)}`
      : '/agency/dashboard/ranking';

    const data = await fetchJSON(url);

    const tbody = $('tableRanking').querySelector('tbody');
    tbody.innerHTML = (data || []).map((r, i) => `
      <tr>
        <td><strong>${i + 1}</strong></td>
        <td>${r.nome || 'Modelo #' + r.modelo_id}</td>
        <td>${money(r.ganhos_total)}</td>
        <td>${money(r.ganhos_agencia)}</td>
        <td>${fmtDateTime(r.atualizado_em)}</td>
      </tr>
    `).join('') || emptyRow(5);

    const top10 = (data || []).slice(0, 10);

    if (chartRanking) chartRanking.destroy();

    chartRanking = new Chart($('chartRanking'), {
      type: 'bar',
      data: {
        labels: top10.map(r => r.nome || '#' + r.modelo_id),
        datasets: [{
          label: 'Ganhos do mês',
          data: top10.map(r => Number(r.ganhos_total || 0)),
          backgroundColor: 'rgba(123,44,255,0.7)',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true }
        }
      }
    });
  } catch (err) {
    console.error('Erro ranking:', err);
  }
}

// ========== 15. PAGAMENTOS ==========

pageLoaders['pagamentos-agencia'] = async function () {
  await carregarPagamentosAgenciaRecebidos();
  await carregarPagamentosModelosRecebidos();
};

async function carregarPagamentosAgenciaRecebidos() {
  try {
    const rows = await fetchJSON('/agency/dashboard/pagamentos-recebidos');
    const tbody = $('tablePagAgencia').querySelector('tbody');
    tbody.innerHTML = (rows || []).map(r => `
      <tr>
        <td>${money(r.valor)}</td>
        <td>${String(r.mes).padStart(2, '0')}/${r.ano}</td>
        <td>${fmtDate(r.data)}</td>
        <td>${escapeHtml(r.descricao || '—')}</td>
      </tr>
    `).join('') || emptyRow(4);
  } catch (err) {
    console.error('Erro pagamentos recebidos agência:', err);
  }
}

async function carregarPagamentosModelosRecebidos() {
  try {
    const rows = await fetchJSON('/agency/dashboard/pagamentos-modelos-recebidos');
    const tbody = $('tablePagModelos').querySelector('tbody');
    tbody.innerHTML = (rows || []).map(r => `
      <tr>
        <td>${escapeHtml(r.nome_exibicao || r.nome || ('Modelo #' + r.modelo_id))}</td>
        <td>${fmtDate(r.mes)}</td>
        <td>${money(r.total_midias)}</td>
        <td>${money(r.total_assinaturas)}</td>
        <td>${money(r.total_geral)}</td>
        <td>${badgeStatus(r.status)}</td>
        <td>${fmtDateTime(r.pago_em)}</td>
        <td>
          ${r.recibo_pdf_signed_url
            ? `<a href="${r.recibo_pdf_signed_url}" target="_blank" class="btn btn-sm btn-ghost">Abrir Recibo</a>`
            : `<span class="badge badge-muted">Sem recibo</span>`}
        </td>
      </tr>
    `).join('') || emptyRow(8);
  } catch (err) {
    console.error('Erro pagamentos recebidos modelos:', err);
  }
}

// ========== GENERIC EDIT MODAL ==========

let editCallback = null;
let editUrl = '';
let editMethod = 'PUT';

function openEditModal(title, url, method, fields, callback) {
  editUrl = url;
  editMethod = method;
  editCallback = callback;

  $('modalEditTitle').textContent = title;
  const container = $('modalEditFields');

  function escapeHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatDate(v) {
    if (!v) return '';
    try {
      return new Date(v).toISOString().split('T')[0];
    } catch {
      return '';
    }
  }

  container.innerHTML = fields.map(f => {
    const disabled = f.disabled ? 'disabled' : '';
    const required = f.required ? 'required' : '';

    // ✔️ CHECKBOX
    if (f.type === 'checkbox') {
      return `<label class="checkbox-label">
        <input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''} ${disabled}>
        ${f.label}
      </label>`;
    }

    // ✔️ TEXTAREA
    if (f.type === 'textarea') {
      return `<label>${f.label}
        <textarea name="${f.name}" ${disabled} ${required}>${escapeHtml(f.value)}</textarea>
      </label>`;
    }

    // ✔️ SELECT
    if (f.type === 'select') {
      return `<label>${f.label}
        <select name="${f.name}" ${disabled} ${required}>
          ${(f.options || []).map(o => {
            const val = typeof o === 'object' ? o.value : o;
            const label = typeof o === 'object' ? o.label : o;
            return `<option value="${escapeHtml(val)}"
              ${String(val) === String(f.value ?? '') ? 'selected' : ''}>
              ${escapeHtml(label)}
            </option>`;
          }).join('')}
        </select>
      </label>`;
    }

    // ✔️ DATE FIX (CRÍTICO)
    let value = f.value ?? '';
    if (f.type === 'date') {
      value = formatDate(value);
    }

    // ✔️ NUMBER STEP DINÂMICO
    let step = '';
    if (f.type === 'number') {
      step = f.step ? `step="${f.step}"` : 'step="any"';
    }

    return `<label>${f.label}
      <input
        type="${f.type || 'text'}"
        name="${f.name}"
        value="${escapeHtml(value)}"
        ${step}
        ${disabled}
        ${required}
      >
    </label>`;
  }).join('');

  openModal('modalEdit');
}

async function salvarEdicao(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = {};

  const container = $('modalEditFields');
  container.querySelectorAll('input, textarea, select').forEach(el => {
    if (el.type === 'checkbox') {
      body[el.name] = el.checked;
    } else if (el.type === 'number') {
      body[el.name] = el.value ? Number(el.value) : null;
    } else {
      body[el.name] = el.value || null;
    }
  });

  console.log('body enviado:', body);

  try {
    if (editMethod === 'PUT') {
      await putJSON(editUrl, body);
    } else {
      await postJSON(editUrl, body);
    }
    toast('Salvo com sucesso!', 'success');
    closeAllModals();
    if (editCallback) editCallback();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ========== 16. GESTÃO DE MODELOS (Ofertas, Assinaturas, Feed, Premium, Conteúdos, Links, Avatar/Capa, Bio/Perfil) ==========

async function popularSelectModeloSeVazio(selectId) {
  const select = $(selectId);
  if (!select.options.length) {
    const modelos = await fetchJSON('/agency/dashboard/modelos-lista');
    select.innerHTML = modelos.map(m => `<option value="${m.id}">${escapeHtml(m.nome)}</option>`).join('');
  }
  return Number(select.value) || null;
}

// ---------- OFERTAS ----------

pageLoaders.ofertas = async function () {
  await popularSelectModeloSeVazio('ofertasModeloSelect');
  carregarOfertasAgency();
};

function abrirFormNovaOferta() {
  $('formNovaOferta').reset();
  $('formNovaOfertaCard').style.display = 'block';
}

async function carregarOfertasAgency() {
  const modeloId = Number($('ofertasModeloSelect').value);
  if (!modeloId) return;

  try {
    const rows = await fetchJSON(`/agency/dashboard/ofertas?modelo_id=${modeloId}`);
    const tbody = $('tableOfertas').querySelector('tbody');
    tbody.innerHTML = (rows || []).map(o => `
      <tr>
        <td>${escapeHtml(o.nome)}</td>
        <td>${o.desconto_percentual}%</td>
        <td>${money(o.valor_promocional)}</td>
        <td>${o.limite_assinaturas}</td>
        <td>${o.assinaturas_usadas}</td>
        <td>${fmtDateTime(o.data_fim)}</td>
        <td>${o.ativa ? '<span class="badge badge-success">Ativa</span>' : '<span class="badge badge-muted">Encerrada</span>'}</td>
        <td>
          ${o.ativa ? `<button class="btn btn-primary" onclick="encerrarOfertaAgency(${o.id})">Encerrar</button>` : ''}
          <button class="btn btn-primary" onclick="excluirOfertaAgency(${o.id})">Excluir</button>
        </td>
      </tr>
    `).join('') || emptyRow(8);
  } catch (err) {
    toast('Erro ao carregar ofertas: ' + err.message, 'error');
  }
}

async function salvarNovaOferta(e) {
  e.preventDefault();
  const modeloId = Number($('ofertasModeloSelect').value);
  const form = new FormData(e.target);

  try {
    await postJSON('/agency/dashboard/ofertas', {
      modelo_id: modeloId,
      nome: form.get('nome'),
      limite: form.get('limite'),
      dias: form.get('dias'),
      desconto: form.get('desconto')
    });
    toast('Oferta criada!', 'success');
    $('formNovaOfertaCard').style.display = 'none';
    carregarOfertasAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function encerrarOfertaAgency(id) {
  if (!confirm('Encerrar esta oferta?')) return;
  try {
    await putJSON(`/agency/dashboard/ofertas/${id}/encerrar`, {});
    toast('Oferta encerrada!', 'success');
    carregarOfertasAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function excluirOfertaAgency(id) {
  if (!confirm('Excluir esta oferta permanentemente?')) return;
  try {
    await deleteJSON(`/agency/dashboard/ofertas/${id}`);
    toast('Oferta excluída!', 'success');
    carregarOfertasAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ---------- ASSINATURAS ----------

pageLoaders.assinaturas = async function () {
  await popularSelectModeloSeVazio('assinaturasModeloSelect');
  carregarAssinaturaAgency();
};

async function carregarAssinaturaAgency() {
  const modeloId = Number($('assinaturasModeloSelect').value);
  if (!modeloId) return;

  try {
    const data = await fetchJSON(`/agency/dashboard/assinaturas?modelo_id=${modeloId}`);
    $('assinaturaValorMensal').value = data.valor_mensal;
    $('assinaturaDesconto').value = data.desconto_trimestral || 0;
    $('assinaturaValorTrimestral').value = data.valor_trimestral ? money(data.valor_trimestral) : '—';
  } catch (err) {
    toast('Erro ao carregar assinatura: ' + err.message, 'error');
  }
}

async function salvarAssinaturaAgency(e) {
  e.preventDefault();
  const modeloId = Number($('assinaturasModeloSelect').value);
  const form = new FormData(e.target);

  try {
    await putJSON('/agency/dashboard/assinaturas', {
      modelo_id: modeloId,
      valor_mensal: form.get('valor_mensal'),
      desconto_trimestral: form.get('desconto_trimestral')
    });
    toast('Assinatura atualizada!', 'success');
    carregarAssinaturaAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ---------- GALERIA / LIGHTBOX (Feed, Premium, Conteúdos) ----------

function htmlThumbMidia(url, thumb, isVideo) {
  const thumbSrc = thumb || url;
  const playIcon = isVideo
    ? `<div class="play-icon-overlay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>`
    : '';
  return `
    <div class="grid-media-thumb-wrap" onclick="abrirLightboxMidia('${url}', '${isVideo ? 'video' : 'imagem'}')">
      <img src="${thumbSrc}">
      ${playIcon}
    </div>
  `;
}

function abrirLightboxMidia(url, tipo) {
  const isStreamPlayer = /iframe\.videodelivery\.net|cloudflarestream\.com/.test(url);
  $('lightboxMidiaCorpo').innerHTML = tipo === 'video'
    ? (isStreamPlayer
        ? `<iframe src="${url}" style="width:100%;height:100%;border:0;" allow="autoplay; fullscreen" allowfullscreen></iframe>`
        : `<video src="${url}" controls autoplay></video>`)
    : `<img src="${url}">`;
  openModal('modalLightboxMidia');
}

// ---------- FEED ----------

pageLoaders.feed = async function () {
  await popularSelectModeloSeVazio('feedModeloSelect');
  carregarFeedAgency();
};

async function carregarFeedAgency() {
  const modeloId = Number($('feedModeloSelect').value);
  if (!modeloId) return;

  try {
    const rows = await fetchJSON(`/agency/dashboard/feed?modelo_id=${modeloId}`);
    $('gridFeed').innerHTML = (rows || []).map(c => `
      <div class="grid-media-item">
        ${htmlThumbMidia(c.url, c.thumbnail_url, c.tipo === 'video')}
        <div class="grid-media-footer">
          <span>${fmtDate(c.criado_em)}</span>
          <button onclick="excluirFeedAgency(${c.id})">Excluir</button>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-muted);font-size:13px;">Nenhum post no feed.</p>';
  } catch (err) {
    toast('Erro ao carregar feed: ' + err.message, 'error');
  }
}

async function salvarNovoFeed(e) {
  e.preventDefault();
  const modeloId = Number($('feedModeloSelect').value);
  const form = new FormData(e.target);
  form.set('modelo_id', modeloId);

  try {
    const res = await authFetch('/agency/dashboard/feed', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`);
    toast('Publicado no feed!', 'success');
    e.target.reset();
    carregarFeedAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function excluirFeedAgency(id) {
  if (!confirm('Excluir este post do feed?')) return;
  try {
    await deleteJSON(`/agency/dashboard/feed/${id}`);
    toast('Post excluído!', 'success');
    carregarFeedAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ---------- PREMIUM ----------

pageLoaders.premium = async function () {
  await popularSelectModeloSeVazio('premiumModeloSelect');
  carregarPremiumAgency();
};

async function carregarPremiumAgency() {
  const modeloId = Number($('premiumModeloSelect').value);
  if (!modeloId) return;

  try {
    const rows = await fetchJSON(`/agency/dashboard/premium?modelo_id=${modeloId}`);
    $('gridPremium').innerHTML = (rows || []).map(p => `
      <div class="grid-media-item">
        ${htmlThumbMidia(p.url, p.thumb_url, p.tipo === 'video')}
        <div class="grid-media-footer">
          <span>${money(p.preco)}</span>
          <button onclick="excluirPremiumAgency(${p.id})">Excluir</button>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-muted);font-size:13px;">Nenhum post premium.</p>';
  } catch (err) {
    toast('Erro ao carregar premium: ' + err.message, 'error');
  }
}

async function salvarNovoPremium(e) {
  e.preventDefault();
  const modeloId = Number($('premiumModeloSelect').value);
  const form = new FormData(e.target);
  form.set('modelo_id', modeloId);

  try {
    const res = await authFetch('/agency/dashboard/premium', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`);
    toast('Publicado no premium!', 'success');
    e.target.reset();
    carregarPremiumAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function excluirPremiumAgency(id) {
  if (!confirm('Excluir este post premium?')) return;
  try {
    await deleteJSON(`/agency/dashboard/premium/${id}`);
    toast('Post excluído!', 'success');
    carregarPremiumAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ---------- CONTEÚDOS (VENDA) ----------

pageLoaders.conteudos = async function () {
  await popularSelectModeloSeVazio('conteudosModeloSelect');
  carregarConteudosAgency();
};

async function carregarConteudosAgency() {
  const modeloId = Number($('conteudosModeloSelect').value);
  if (!modeloId) return;

  try {
    const rows = await fetchJSON(`/agency/dashboard/conteudos?modelo_id=${modeloId}`);
    $('gridConteudos').innerHTML = (rows || []).map(c => `
      <div class="grid-media-item">
        ${htmlThumbMidia(c.url, c.thumbnail_url, c.tipo === 'video')}
        <div class="grid-media-footer">
          <span>${money(c.preco)}</span>
          <button onclick="excluirConteudoAgency(${c.id})">Excluir</button>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-muted);font-size:13px;">Nenhum conteúdo cadastrado.</p>';
  } catch (err) {
    toast('Erro ao carregar conteúdos: ' + err.message, 'error');
  }
}

async function salvarNovoConteudo(e) {
  e.preventDefault();
  const modeloId = Number($('conteudosModeloSelect').value);
  const form = new FormData(e.target);
  form.set('modelo_id', modeloId);

  try {
    const res = await authFetch('/agency/dashboard/conteudos', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`);
    toast('Conteúdo publicado!', 'success');
    e.target.reset();
    carregarConteudosAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function excluirConteudoAgency(id) {
  if (!confirm('Excluir este conteúdo?')) return;
  try {
    await deleteJSON(`/agency/dashboard/conteudos/${id}`);
    toast('Conteúdo excluído!', 'success');
    carregarConteudosAgency();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ---------- LINKS ----------

pageLoaders.links = async function () {
  await popularSelectModeloSeVazio('linksModeloSelect');
  carregarLinksAgency();
};

function copiarLinkAgency(inputId) {
  const input = $(inputId);
  navigator.clipboard.writeText(input.value).then(() => toast('Copiado!', 'success'));
}

function carregarLinksAgency() {
  const modeloId = Number($('linksModeloSelect').value);
  if (!modeloId) return;

  const base = `https://bio.mypagess.workers.dev/?id=${modeloId}`;
  $('linkInstagramAgency').value = `${base}&src=instagram`;
  $('linkTiktokAgency').value = `${base}&src=tiktok`;
  $('linkDiretoAgency').value = base;
}

// ---------- AVATAR E CAPA ----------

pageLoaders['avatar-capa'] = async function () {
  await popularSelectModeloSeVazio('avatarCapaModeloSelect');
  carregarAvatarCapaAgency();
  iniciarCapaEditorAgency();
};

let _capaEditorIniciado = false;
function iniciarCapaEditorAgency() {
  if (_capaEditorIniciado) return;
  _capaEditorIniciado = true;

  const btnCapa = $('btnCapaAgency');
  const inputCapa = $('inputCapaAgency');
  const imgCapa = $('previewCapaAgency');

  btnCapa?.addEventListener('click', () => inputCapa.click());
  imgCapa?.addEventListener('click', () => inputCapa.click());

  inputCapa?.addEventListener('change', async () => {
    const file = inputCapa.files[0];
    if (!file) return;
    inputCapa.value = '';

    const blob = await openCapaEditor(file);
    if (!blob) return;

    const modeloId = Number($('avatarCapaModeloSelect').value);
    const fd = new FormData();
    fd.append('capa', blob, 'capa.jpg');
    fd.set('modelo_id', modeloId);

    try {
      const res = await authFetch('/agency/dashboard/capa', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`);
      toast('Capa atualizada!', 'success');
      imgCapa.src = data.capa + '?t=' + Date.now();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    }
  });
}

async function carregarAvatarCapaAgency() {
  const modeloId = Number($('avatarCapaModeloSelect').value);
  if (!modeloId) return;

  try {
    const data = await fetchJSON(`/agency/dashboard/perfil?modelo_id=${modeloId}`);
    $('previewAvatarAgency').src = data.avatar || '/assets/avatar.png';
    $('previewCapaAgency').src = (data.capa || '/assets/capa.png') + '?t=' + Date.now();
  } catch (err) {
    toast('Erro ao carregar avatar/capa: ' + err.message, 'error');
  }
}

async function salvarAvatarAgency(e) {
  e.preventDefault();
  const modeloId = Number($('avatarCapaModeloSelect').value);
  const form = new FormData(e.target);
  form.set('modelo_id', modeloId);

  try {
    const res = await authFetch('/agency/dashboard/avatar', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`);
    toast('Avatar atualizado!', 'success');
    $('previewAvatarAgency').src = data.avatar + '?t=' + Date.now();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ---------- BIO E PERFIL ----------

pageLoaders['bio-perfil'] = async function () {
  await popularSelectModeloSeVazio('perfilModeloSelect');
  carregarPerfilAgency();
};

async function carregarPerfilAgency() {
  const modeloId = Number($('perfilModeloSelect').value);
  if (!modeloId) return;

  try {
    const data = await fetchJSON(`/agency/dashboard/perfil?modelo_id=${modeloId}`);
    const form = $('formPerfilAgency');
    form.nome_exibicao.value = data.nome_exibicao || '';
    form.local.value = data.local || '';
    form.bio.value = data.bio || '';
    form.classificacao_conteudo.value = data.classificacao_conteudo || '';
    form.instagram.value = data.instagram || '';
    form.tiktok.value = data.tiktok || '';
  } catch (err) {
    toast('Erro ao carregar perfil: ' + err.message, 'error');
  }
}

async function salvarPerfilAgency(e) {
  e.preventDefault();
  const modeloId = Number($('perfilModeloSelect').value);
  const form = new FormData(e.target);

  try {
    await putJSON('/agency/dashboard/perfil', {
      modelo_id: modeloId,
      nome_exibicao: form.get('nome_exibicao'),
      local: form.get('local'),
      bio: form.get('bio'),
      classificacao_conteudo: form.get('classificacao_conteudo') || null,
      instagram: form.get('instagram'),
      tiktok: form.get('tiktok')
    });
    toast('Perfil atualizado!', 'success');
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ========== FORMULÁRIOS CHAT ==========

pageLoaders["formularios-chat"] = function () {
  carregarChatForms();
};

async function carregarChatForms() {
  const loading = $("loadingChatForms");
  const table   = $("tableChatForms");
  try {
    loading.style.display = "block";
    table.style.display   = "none";

    const rows = await fetchJSON("/agency/dashboard/chat-forms");

    const tbody = table.querySelector("tbody");
    tbody.innerHTML = rows.map(r => {
      const link = `${location.origin}/formulario-chat.html?modelo=${r.id}`;
      const estado = r.preenchido
        ? `<span class="badge-preenchido">✅ Preenchido</span>`
        : `<span class="badge-vazio">⏳ Pendente</span>`;
      const data = r.preenchido_em ? new Date(r.preenchido_em).toLocaleDateString("pt-BR") : "—";

      return `<tr>
        <td>${r.id}</td>
        <td><strong>${r.nome}</strong></td>
        <td>${estado}</td>
        <td>${data}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-ghost" onclick="copiarLinkForm('${link}', this)">📋 Copiar link</button>
          ${r.preenchido
            ? `<a class="btn btn-sm btn-primary" href="/formulario-chat-ver.html?modelo=${r.id}" target="_blank" rel="noopener noreferrer">👁 Ver</a>`
            : ""}
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="5" style="text-align:center;color:#888;">Nenhuma modelo encontrada</td></tr>`;

    loading.style.display = "none";
    table.style.display   = "table";
  } catch (err) {
    loading.textContent = "Erro ao carregar formulários.";
    console.error(err);
  }
}

function copiarLinkForm(link, btn) {
  navigator.clipboard.writeText(link).then(() => {
    const orig = btn.textContent;
    btn.textContent = "✅ Copiado!";
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

const LABELS_FORM = {
  nome: "Nome",
  apelido: "Apelido",
  data_nascimento: "Data de nascimento",
  signo: "Signo",
  estado_civil: "Estado civil",
  filhos: "Filhos",
  cidade_estado: "Cidade / Estado",
  mora_atualmente: "Mora atualmente",
  mora_sozinha: "Mora sozinha?",
  estuda: "Estuda?",
  trabalha_alem: "Trabalha além da Velvet?",
  numero_calcado: "Número do calçado",
  personalidade_5_palavras: "Personalidade em 5 palavras",
  timida_extrovertida: "Tímida ou extrovertida?",
  estilo_personalidade: "Estilo de personalidade",
  ciumenta: "Ciumenta?",
  caseira_sair: "Caseira ou gosta de sair?",
  praia_piscina: "Praia ou piscina?",
  campo_cidade: "Campo ou cidade?",
  frio_calor: "Frio ou calor?",
  manha_noite: "Matutina ou noturna?",
  maior_sonho: "Maior sonho",
  hobbies: "Hobbies",
  esportes_favoritos: "Esportes favoritos",
  musica_favorita: "Música favorita",
  artistas_favoritos: "Artistas favoritos",
  filmes_favoritos: "Filmes favoritos",
  series_favoritas: "Séries favoritas",
  livros_favoritos: "Livros favoritos",
  jogos_favoritos: "Jogos favoritos",
  cor_favorita: "Cor favorita",
  estacao_favorita: "Estação favorita",
  marca_roupa: "Marca de roupa favorita",
  comida_favorita: "Comida favorita",
  sobremesa_favorita: "Sobremesa favorita",
  bebida_favorita: "Bebida favorita",
  bebida_alcoolica: "Bebida alcoólica",
  fast_food: "Fast food favorito",
  doce_salgado: "Doce ou salgado?",
  cafe_cha: "Café ou chá?",
  cozinha: "Cozinha?",
  melhor_viagem: "Melhor viagem",
  proximo_destino: "Próximo destino dos sonhos",
  pais_conhecer: "País que gostaria de conhecer",
  lugar_nao_moraria: "Lugar onde nunca moraria",
  tem_animais: "Tem animais?",
  nome_animais: "Nome dos animais",
  animal_favorito: "Animal favorito",
  alergia_animal: "Alergia a animais?",
  atividade_fisica: "Atividade física",
  assiste_futebol: "Assiste futebol?",
  time_favorito: "Time favorito",
  gosta_videogames: "Gosta de videogames?",
  assiste_anime: "Assiste anime?",
  assiste_streamers: "Assiste streamers?",
  redes_sociais: "Redes sociais",
  cor_cabelo: "Cor natural do cabelo",
  usa_extensoes: "Usa extensões?",
  tatuagens: "Tatuagens",
  piercings: "Piercings",
  altura: "Altura",
  peso: "Peso",
  preferencia_tratamento: "Como trata os fãs",
  apelidos: "Apelidos com fãs",
  apelidos_custom: "Apelidos personalizados",
  conversa_nao_gosta: "Conversa que não gosta",
  assuntos_proibidos: "Assuntos proibidos",
  mentiras_manter: "Mentiras a manter",
  palavras_nao_gosta: "Palavras que não gosta",
  promessas_nao_fazer: "Promessas a nunca fazer",
  faria_personalizados: "Faria conteúdos personalizados?",
  conteudo_favorito: "Conteúdo que mais gosta de produzir",
  como_escrever: "Como escrever pelo chat",
  nivel_intimidade: "Nível de intimidade",
  chamar_pelo_nome: "Chamar pelo nome?",
  girias: "Gírias",
  perguntas_frequentes: "Perguntas frequentes dos fãs",
  curiosidades: "Curiosidades",
  informacao_importante: "Informação importante"
};

const SECOES_FORM = [
  { titulo: "👤 Informações Pessoais", campos: ["nome","apelido","data_nascimento","signo","estado_civil","filhos","cidade_estado","mora_atualmente","mora_sozinha","estuda","trabalha_alem","numero_calcado"] },
  { titulo: "💜 Personalidade", campos: ["personalidade_5_palavras","timida_extrovertida","estilo_personalidade","ciumenta","caseira_sair","praia_piscina","campo_cidade","frio_calor","manha_noite","maior_sonho"] },
  { titulo: "🎵 Gostos Pessoais", campos: ["hobbies","esportes_favoritos","musica_favorita","artistas_favoritos","filmes_favoritos","series_favoritas","livros_favoritos","jogos_favoritos","cor_favorita","estacao_favorita","marca_roupa"] },
  { titulo: "🍔 Comida", campos: ["comida_favorita","sobremesa_favorita","bebida_favorita","bebida_alcoolica","fast_food","doce_salgado","cafe_cha","cozinha"] },
  { titulo: "✈️ Viagens", campos: ["melhor_viagem","proximo_destino","pais_conhecer","lugar_nao_moraria"] },
  { titulo: "🐶 Animais", campos: ["tem_animais","nome_animais","animal_favorito","alergia_animal"] },
  { titulo: "🎮 Lifestyle", campos: ["atividade_fisica","assiste_futebol","time_favorito","gosta_videogames","assiste_anime","assiste_streamers","redes_sociais"] },
  { titulo: "💄 Aparência", campos: ["cor_cabelo","usa_extensoes","tatuagens","piercings","altura","peso"] },
  { titulo: "❤️ Relacionamento com Fãs", campos: ["preferencia_tratamento","apelidos","apelidos_custom","conversa_nao_gosta"] },
  { titulo: "🚫 Limites", campos: ["assuntos_proibidos","mentiras_manter","palavras_nao_gosta","promessas_nao_fazer"] },
  { titulo: "💎 Conteúdo", campos: ["faria_personalizados","conteudo_favorito"] },
  { titulo: "💬 Estilo do Chat", campos: ["como_escrever","nivel_intimidade","chamar_pelo_nome","girias"] },
  { titulo: "📝 Observações", campos: ["perguntas_frequentes","curiosidades","informacao_importante"] }
];

async function verFormularioChat(modeloId, nomeModelo) {
  try {
    const data = await fetchJSON(`/agency/dashboard/chat-form/${modeloId}`);
    const r = data.form?.respostas || {};

    $("modalFormChatTitulo").textContent = `Formulário — ${nomeModelo}`;

    const html = SECOES_FORM.map(sec => {
      const linhas = sec.campos.map(campo => {
        const val = r[campo];
        const valorTexto = Array.isArray(val)
          ? (val.length ? val.join(", ") : "")
          : (val || "");
        return `<div class="form-chat-row">
          <span class="form-chat-label">${LABELS_FORM[campo] || campo}</span>
          <span class="form-chat-valor">${valorTexto}</span>
        </div>`;
      }).join("");

      return `<div class="form-chat-section">
        <h4>${sec.titulo}</h4>
        ${linhas}
      </div>`;
    }).join("");

    $("modalFormChatConteudo").innerHTML = html;
    $("overlayFormChat").classList.remove("hidden");
    $("modalFormChat").classList.remove("hidden");
  } catch (err) {
    toast("Erro ao carregar formulário: " + err.message, "error");
  }
}

function fecharModalFormChat() {
  $("overlayFormChat").classList.add("hidden");
  $("modalFormChat").classList.add("hidden");
}

// ========== INIT ==========

document.addEventListener('DOMContentLoaded', () => {
  if (!token) {
    window.location.href = '/agency/login';
    return;
  }

  document.getElementById('inputPercentualAgencia')?.addEventListener('input', atualizarSoma);
  document.getElementById('inputPercentualModelo')?.addEventListener('input', atualizarSoma);

  pageLoaders.overview();
});
