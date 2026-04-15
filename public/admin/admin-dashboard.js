/* ========================================
   VELVET ADMIN DASHBOARD — JS
   ======================================== */

  const token = localStorage.getItem("token_admin");

if (!token) {
  window.location.href = "/admin/login.html";
  throw new Error("Sem token admin");
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
  const res = await authFetch(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.erro || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function putJSON(url, body) {
  const res = await authFetch(url, { method: 'PUT', body: JSON.stringify(body) });
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

// ========== NAVIGATION ==========

const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitles = {
  overview: 'Visao Geral',
  acessos: 'Acessos por Origem',
  admins: 'Administradores',
  seguranca: 'Seguranca & Historico',
  bloqueios: 'Bloqueios',
  verificacoes: 'Verificacoes',
  fechamento: 'Fechamento Mensal',
  bancarios: 'Dados Bancarios',
  modelos: 'Modelos',
  ranking: 'Ranking',
  financeiro: 'Financeiro (Rastreio)',
  transacoes: 'Transacoes por Modelo',
  password: 'Reset de Senhas',
  vip: 'Assinaturas VIP',
  'pagamentos-modelo': 'Pagamentos a Modelos',
  agencias: 'Agencias',
  feed: 'Feed'
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

function openModal(id) {
  $('modalOverlay').classList.add('active');
  $(id).classList.add('active');
}

function closeAllModals() {
  $('modalOverlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/admin/login.html';
}

// ========== 1. OVERVIEW ==========

let chartFat, chartAcessosOverview;

pageLoaders.overview = async function () {
  try {
    const data = await fetchJSON('/admin/dashboard/overview');
    $('kpi-modelos').textContent = data.total_modelos ?? '--';
    $('kpi-clientes').textContent = data.total_clientes ?? '--';
    $('kpi-vips').textContent = data.vips_ativos ?? '--';
    $('kpi-fat').textContent = money(data.faturamento_mes);

    // Chart faturamento
    if (data.faturamento_12m) {
      if (chartFat) chartFat.destroy();
      chartFat = new Chart($('chartOverviewFat'), {
        type: 'bar',
        data: {
          labels: data.faturamento_12m.map(d => d.mes),
          datasets: [{
            label: 'Faturamento',
            data: data.faturamento_12m.map(d => d.total),
            backgroundColor: 'rgba(123,44,255,0.7)',
            borderRadius: 6
          }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    }

    // Chart acessos
    if (data.acessos_origem) {
      if (chartAcessosOverview) chartAcessosOverview.destroy();
      chartAcessosOverview = new Chart($('chartOverviewAcessos'), {
        type: 'doughnut',
        data: {
          labels: data.acessos_origem.map(d => d.origem),
          datasets: [{
            data: data.acessos_origem.map(d => d.total),
            backgroundColor: ['#7B2CFF', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']
          }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
      });
    }

    // Top modelos
    const tbody = $('tableTopModelos').querySelector('tbody');
    tbody.innerHTML = (data.top_modelos || []).map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${m.nome || 'Modelo #' + m.modelo_id}</td>
        <td>${money(m.ganhos)}</td>
        <td>${m.assinantes ?? 0}</td>
      </tr>
    `).join('') || emptyRow(4);

  } catch (err) {
    console.error('Erro overview:', err);
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
    const data = await fetchJSON(`/admin/dashboard/acessos?mes=${mes}`);

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

// ========== 3. ADMINS ==========

pageLoaders.admins = async function () {
  try {
    const data = await fetchJSON('/admin/dashboard/admins');
    const tbody = $('tableAdmins').querySelector('tbody');
    tbody.innerHTML = (data || []).map(a => `
      <tr>
        <td>${a.id}</td>
        <td>${a.email}</td>
        <td>${fmtDateTime(a.created_at)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="excluirAdmin(${a.id})">Excluir</button></td>
      </tr>
    `).join('') || emptyRow(4);
  } catch (err) {
    console.error('Erro admins:', err);
  }
};

async function salvarAdmin(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await postJSON('/admin/dashboard/admins', {
      email: form.get('email'),
      senha: form.get('senha')
    });
    toast('Admin criado com sucesso!', 'success');
    closeAllModals();
    e.target.reset();
    pageLoaders.admins();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function excluirAdmin(id) {
  if (!confirm('Tem certeza que deseja excluir este admin?')) return;
  try {
    await deleteJSON('/admin/dashboard/admins/' + id);
    toast('Admin excluído', 'success');
    pageLoaders.admins();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ========== 4. SEGURANÇA ==========

let segurancaPage = 1;
let exclusoesPage = 1;

pageLoaders.seguranca = function () {
  populateMonthSelect($('segurancaMes'));
  carregarSeguranca(1);
  carregarExclusoes(1);
  $('segurancaMes').onchange = () => carregarSeguranca(1);
};

async function carregarSeguranca(page) {
  segurancaPage = page;
  try {
    const mes = $('segurancaMes').value;
    const data = await fetchJSON(`/admin/dashboard/seguranca?mes=${mes}&page=${page}&limit=20`);
    const tbody = $('tableSeguranca').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.modelo_nome || r.modelo_id || '—'}</td>
        <td>${r.admin_email || r.admin_id || '—'}</td>
        <td>${r.motivo || '—'}</td>
        <td>${fmtDateTime(r.data)}</td>
      </tr>
    `).join('') || emptyRow(5);
    buildPagination('paginationSeguranca', page, data.totalPages || 1, 'carregarSeguranca');
  } catch (err) {
    console.error('Erro segurança:', err);
  }
}

async function carregarExclusoes(page) {
  exclusoesPage = page;
  try {
    const data = await fetchJSON(`/admin/dashboard/exclusoes?page=${page}&limit=20`);
    const tbody = $('tableExclusoes').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.email || '—'}</td>
        <td>${r.nome_completo || '—'}</td>
        <td>${r.motivo || '—'}</td>
        <td>${fmtDateTime(r.criado_em)}</td>
      </tr>
    `).join('') || emptyRow(5);
    buildPagination('paginationExclusoes', page, data.totalPages || 1, 'carregarExclusoes');
  } catch (err) {
    console.error('Erro exclusões:', err);
  }
}

// ========== 5. BLOQUEIOS ==========

pageLoaders.bloqueios = function () {
  carregarRisco(1);
  carregarBloqueados(1);
  carregarCpfs(1);
  carregarIps(1);
};

// RISCO
async function carregarRisco(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/cliente-risco?page=${page}&limit=20`);
    const tbody = $('tableRisco').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.cliente_id}</td>
        <td>${r.bloqueio_ip ? 'Sim' : 'Não'}</td>
        <td>${r.bloqueio_cpf ? 'Sim' : 'Não'}</td>
        <td>${fmtDateTime(r.bloqueado_ate)}</td>
        <td>${fmtDateTime(r.criado_em)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editarRisco(${r.cliente_id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="excluirRisco(${r.cliente_id})">Excluir</button>
        </td>
      </tr>
    `).join('') || emptyRow(6);
    buildPagination('paginationRisco', page, data.totalPages || 1, 'carregarRisco');
  } catch (err) {
    console.error('Erro risco:', err);
  }
}

async function salvarRisco(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await postJSON('/admin/dashboard/cliente-risco', {
      cliente_id: form.get('cliente_id'),
      bloqueio_ip: form.get('bloqueio_ip') === 'on',
      bloqueio_cpf: form.get('bloqueio_cpf') === 'on',
      bloqueado_ate: form.get('bloqueado_ate') || null
    });
    toast('Cliente de risco adicionado!', 'success');
    closeAllModals();
    e.target.reset();
    carregarRisco(1);
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function excluirRisco(clienteId) {
  if (!confirm('Remover cliente da lista de risco?')) return;
  try {
    await deleteJSON('/admin/dashboard/cliente-risco/' + clienteId);
    toast('Removido da lista de risco', 'success');
    carregarRisco(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function editarRisco(clienteId) {
  try {
    const data = await fetchJSON('/admin/dashboard/cliente-risco/' + clienteId);
    openEditModal('Editar Cliente Risco', '/admin/dashboard/cliente-risco/' + clienteId, 'PUT', [
      { name: 'bloqueio_ip', label: 'Bloqueio IP', type: 'checkbox', value: data.bloqueio_ip },
      { name: 'bloqueio_cpf', label: 'Bloqueio CPF', type: 'checkbox', value: data.bloqueio_cpf },
      { name: 'bloqueado_ate', label: 'Bloqueado até', type: 'datetime-local', value: data.bloqueado_ate ? data.bloqueado_ate.slice(0, 16) : '' }
    ], () => carregarRisco(1));
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// BLOQUEADOS
async function carregarBloqueados(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/clientes-bloqueados?page=${page}&limit=20`);
    const tbody = $('tableBloqueados').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.email || '—'}</td>
        <td>${r.nome_completo || '—'}</td>
        <td>${fmtDate(r.data_nascimento)}</td>
        <td>${r.motivo || '—'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editarBloqueado(${r.id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="excluirBloqueado(${r.id})">Excluir</button>
        </td>
      </tr>
    `).join('') || emptyRow(6);
    buildPagination('paginationBloqueados', page, data.totalPages || 1, 'carregarBloqueados');
  } catch (err) { console.error('Erro bloqueados:', err); }
}

async function salvarBloqueado(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await postJSON('/admin/dashboard/clientes-bloqueados', Object.fromEntries(form));
    toast('Cliente bloqueado adicionado!', 'success');
    closeAllModals();
    e.target.reset();
    carregarBloqueados(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function excluirBloqueado(id) {
  if (!confirm('Remover da lista?')) return;
  try {
    await deleteJSON('/admin/dashboard/clientes-bloqueados/' + id);
    toast('Removido', 'success');
    carregarBloqueados(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function editarBloqueado(id) {
  try {
    const data = await fetchJSON('/admin/dashboard/clientes-bloqueados/' + id);
    openEditModal('Editar Cliente Bloqueado', '/admin/dashboard/clientes-bloqueados/' + id, 'PUT', [
      { name: 'email', label: 'Email', value: data.email },
      { name: 'nome_completo', label: 'Nome Completo', value: data.nome_completo },
      { name: 'motivo', label: 'Motivo', type: 'textarea', value: data.motivo }
    ], () => carregarBloqueados(1));
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// CPFs
async function carregarCpfs(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/cpfs-bloqueados?page=${page}&limit=20`);
    const tbody = $('tableCpfs').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.cpf}</td>
        <td>${r.motivo || '—'}</td>
        <td>${fmtDateTime(r.created_at)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="excluirCpf('${r.cpf}')">Excluir</button></td>
      </tr>
    `).join('') || emptyRow(4);
    buildPagination('paginationCpfs', page, data.totalPages || 1, 'carregarCpfs');
  } catch (err) { console.error('Erro cpfs:', err); }
}

async function salvarCpf(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await postJSON('/admin/dashboard/cpfs-bloqueados', Object.fromEntries(form));
    toast('CPF bloqueado!', 'success');
    closeAllModals();
    e.target.reset();
    carregarCpfs(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function excluirCpf(cpf) {
  if (!confirm('Desbloquear CPF?')) return;
  try {
    await deleteJSON('/admin/dashboard/cpfs-bloqueados/' + cpf);
    toast('CPF desbloqueado', 'success');
    carregarCpfs(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// IPs
async function carregarIps(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/ips-bloqueados?page=${page}&limit=20`);
    const tbody = $('tableIps').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.ip}</td>
        <td>${fmtDateTime(r.criado_em)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="excluirIp(${r.id})">Excluir</button></td>
      </tr>
    `).join('') || emptyRow(4);
    buildPagination('paginationIps', page, data.totalPages || 1, 'carregarIps');
  } catch (err) { console.error('Erro ips:', err); }
}

async function salvarIp(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await postJSON('/admin/dashboard/ips-bloqueados', Object.fromEntries(form));
    toast('IP bloqueado!', 'success');
    closeAllModals();
    e.target.reset();
    carregarIps(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function excluirIp(id) {
  if (!confirm('Desbloquear IP?')) return;
  try {
    await deleteJSON('/admin/dashboard/ips-bloqueados/' + id);
    toast('IP desbloqueado', 'success');
    carregarIps(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 6. VERIFICAÇÕES ==========

let currentVerificacao = null;
let currentVerificacaoTipo = null;

pageLoaders.verificacoes = function () {
  carregarVerModelos(1);
  carregarVerClientes(1);
};

async function carregarVerModelos(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/verificacoes/modelos?page=${page}&limit=20`);
    const tbody = $('tableVerModelos').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.modelo_nome || 'Modelo #' + r.modelo_id}</td>
        <td>${r.documento_tipo || '—'}</td>
        <td>${badgeStatus(r.status)}</td>
        <td>${fmtDateTime(r.criado_em)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="verVerificacao(${r.id}, 'modelo')">Ver</button>
        </td>
      </tr>
    `).join('') || emptyRow(6);
    buildPagination('paginationVerModelos', page, data.totalPages || 1, 'carregarVerModelos');
  } catch (err) { console.error('Erro ver modelos:', err); }
}

async function carregarVerClientes(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/verificacoes/clientes?page=${page}&limit=20`);
    const tbody = $('tableVerClientes').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.cliente_nome || 'Cliente #' + r.cliente_id}</td>
        <td>${r.documento_tipo || '—'}</td>
        <td>${badgeStatus(r.status)}</td>
        <td>${fmtDateTime(r.criado_em)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="verVerificacao(${r.id}, 'cliente')">Ver</button>
        </td>
      </tr>
    `).join('') || emptyRow(6);
    buildPagination('paginationVerClientes', page, data.totalPages || 1, 'carregarVerClientes');
  } catch (err) { console.error('Erro ver clientes:', err); }
}

async function verVerificacao(id, tipo) {
  try {
    const data = await fetchJSON(`/admin/dashboard/verificacoes/${tipo}/${id}`);
    currentVerificacao = id;
    currentVerificacaoTipo = tipo;

    $('modalVerTitle').textContent = `Verificação #${id} — ${tipo === 'modelo' ? 'Modelo' : 'Cliente'}`;

    let html = '<div class="ver-info">';
    html += `<p><strong>Status:</strong> ${badgeStatus(data.status)}</p>`;
    html += `<p><strong>Tipo documento:</strong> ${data.documento_tipo || '—'}</p>`;
    html += `<p><strong>Declaração:</strong> ${data.declaracao ? 'Sim' : 'Não'}</p>`;
    if (data.motivo_rejeicao) html += `<p><strong>Motivo rejeição:</strong> ${data.motivo_rejeicao}</p>`;
    html += '</div>';

    html += '<div class="ver-docs">';
    if (data.doc_frente_url) html += `<img src="${data.doc_frente_url}" alt="Doc Frente">`;
    if (data.doc_verso_url) html += `<img src="${data.doc_verso_url}" alt="Doc Verso">`;
    if (data.selfie_url) html += `<img src="${data.selfie_url}" alt="Selfie">`;
    html += '</div>';

    $('modalVerContent').innerHTML = html;

    const showActions = data.status === 'pendente' || data.status === 'em_analise';
    $('btnAprovar').style.display = showActions ? '' : 'none';
    $('btnRejeitar').style.display = showActions ? '' : 'none';

    openModal('modalVerificacao');
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function aprovarVerificacao() {
  try {
    await putJSON(`/admin/dashboard/verificacoes/${currentVerificacaoTipo}/${currentVerificacao}`, { status: 'aprovado' });
    toast('Verificação aprovada!', 'success');
    closeAllModals();
    pageLoaders.verificacoes();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function rejeitarVerificacao() {
  const motivo = prompt('Motivo da rejeição:');
  if (!motivo) return;
  try {
    await putJSON(`/admin/dashboard/verificacoes/${currentVerificacaoTipo}/${currentVerificacao}`, { status: 'rejeitado', motivo_rejeicao: motivo });
    toast('Verificação rejeitada', 'success');
    closeAllModals();
    pageLoaders.verificacoes();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 7. FECHAMENTO ==========

pageLoaders.fechamento = async function () {
  try {
    const data = await fetchJSON('/admin/dashboard/fechamento');
    const tbody = $('tableFechamento').querySelector('tbody');
    tbody.innerHTML = (data || []).map(r => `
      <tr>
        <td>${r.ano}</td>
        <td>${r.mes}</td>
        <td>${money(r.total_bruto)}</td>
        <td>${money(r.total_taxas)}</td>
        <td>${money(r.total_velvet)}</td>
        <td>${money(r.total_modelos)}</td>
        <td>${money(r.total_assinaturas)}</td>
        <td>${money(r.total_midias)}</td>
        <td>${fmtDateTime(r.fechado_em)}</td>
      </tr>
    `).join('') || emptyRow(9);
  } catch (err) { console.error('Erro fechamento:', err); }
};

async function criarFechamento() {
  if (!confirm('Criar fechamento para o mês atual?')) return;
  try {
    await postJSON('/admin/dashboard/fechamento', {});
    toast('Fechamento criado!', 'success');
    pageLoaders.fechamento();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 8. DADOS BANCÁRIOS ==========

pageLoaders.bancarios = function () {
  carregarBancarios(1);
  $('bancariosFiltro').onchange = () => carregarBancarios(1);
};

async function carregarBancarios(page) {
  try {
    const status = $('bancariosFiltro').value;
    const data = await fetchJSON(`/admin/dashboard/dados-bancarios?page=${page}&limit=20&status=${status}`);
    const tbody = $('tableBancarios').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
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

async function aprovarBancario(id) {
  try {
    await putJSON('/admin/dashboard/dados-bancarios/' + id, { status: 'aprovado' });
    toast('Dados bancários aprovados!', 'success');
    carregarBancarios(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function rejeitarBancario(id) {
  const motivo = prompt('Motivo da rejeição:');
  if (!motivo) return;
  try {
    await putJSON('/admin/dashboard/dados-bancarios/' + id, { status: 'rejeitado', motivo_rejeicao: motivo });
    toast('Dados bancários rejeitados', 'success');
    carregarBancarios(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function editarBancario(id) {
  try {
    const data = await fetchJSON('/admin/dashboard/dados-bancarios/' + id);
    openEditModal('Editar Dados Bancários', '/admin/dashboard/dados-bancarios/' + id, 'PUT', [
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
    const data = await fetchJSON(`/admin/dashboard/modelos?page=${page}&limit=20&busca=${encodeURIComponent(busca)}`);
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
    const data = await fetchJSON('/admin/dashboard/modelos/' + id);
    openEditModal('Editar Modelo #' + id, '/admin/dashboard/modelos/' + id, 'PUT', [
      { name: 'nome', label: 'Nome', value: data.nome },
      { name: 'nome_exibicao', label: 'Nome Exibição', value: data.nome_exibicao },
      { name: 'verificada', label: 'Verificada', type: 'checkbox', value: data.verificada },
      { name: 'feed', label: 'No Feed', type: 'checkbox', value: data.feed },
      { name: 'bio', label: 'Bio', type: 'textarea', value: data.bio },
      { name: 'local', label: 'Local', value: data.local },
      { name: 'agencia_id', label: 'Agência ID', type: 'number', value: data.agencia_id },
      { name: 'ativo', label: 'Ativo', type: 'checkbox', value: data.ativo }
    ], () => carregarModelos(1));
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function verDadosModelo(id) {
  try {
    const data = await fetchJSON('/admin/dashboard/modelos-dados/' + id);
    openEditModal('Dados do Modelo #' + id, '/admin/dashboard/modelos-dados/' + id, 'PUT', [
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
  try {
    const data = await fetchJSON('/admin/dashboard/ranking');
    const tbody = $('tableRanking').querySelector('tbody');
    tbody.innerHTML = (data || []).map((r, i) => `
      <tr>
        <td><strong>${i + 1}</strong></td>
        <td>${r.nome || 'Modelo #' + r.modelo_id}</td>
        <td>${money(r.ganhos_total)}</td>
        <td>${fmtDateTime(r.atualizado_em)}</td>
      </tr>
    `).join('') || emptyRow(4);

    const top10 = (data || []).slice(0, 10);
    if (chartRanking) chartRanking.destroy();
    chartRanking = new Chart($('chartRanking'), {
      type: 'bar',
      data: {
        labels: top10.map(r => r.nome || '#' + r.modelo_id),
        datasets: [{
          label: 'Ganhos Total',
          data: top10.map(r => r.ganhos_total),
          backgroundColor: 'rgba(123,44,255,0.7)',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  } catch (err) { console.error('Erro ranking:', err); }
};

// ========== 11. FINANCEIRO (RASTREIO) ==========

pageLoaders.financeiro = function () {
  carregarCartao(1);
};

// Generic financial table loader
function makeFinLoader(endpoint, tableId, paginationId, mapper, fnName) {
  window[fnName] = async function (page) {
    try {
      const data = await fetchJSON(`/admin/dashboard/${endpoint}?page=${page}&limit=20`);
      const tbody = $(tableId).querySelector('tbody');
      tbody.innerHTML = (data.rows || []).map(mapper).join('') || emptyRow(8);
      buildPagination(paginationId, page, data.totalPages || 1, fnName);
    } catch (err) { console.error(`Erro ${endpoint}:`, err); }
  };
}

makeFinLoader('pagamentos-cartao', 'tableCartao', 'paginationCartao', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.cliente_id}</td>
    <td>${r.modelo_id || '—'}</td>
    <td>${money(r.valor)}</td>
    <td>${r.tipo || '—'}</td>
    <td>${r.gateway || '—'}</td>
    <td>${badgeStatus(r.status)}</td>
    <td>${fmtDateTime(r.created_at)}</td>
  </tr>
`, 'carregarCartao');

makeFinLoader('pagamentos-pix', 'tablePix', 'paginationPix', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.cliente_id}</td>
    <td>${r.modelo_id}</td>
    <td>${money(r.valor)}</td>
    <td>${badgeStatus(r.status)}</td>
    <td>${r.gateway || '—'}</td>
    <td>${fmtDateTime(r.criado_em)}</td>
  </tr>
`, 'carregarPix');

makeFinLoader('pagamento-tentativas', 'tableTentativas', 'paginationTentativas', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.cliente_id}</td>
    <td>${r.metodo || '—'}</td>
    <td>${badgeStatus(r.status)}</td>
    <td>${r.gateway || '—'}</td>
    <td>${r.cpf || '—'}</td>
    <td>${r.ip || '—'}</td>
    <td>${fmtDateTime(r.criado_em)}</td>
  </tr>
`, 'carregarTentativas');

makeFinLoader('pagarme-events', 'tablePagarme', 'paginationPagarme', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.type || '—'}</td>
    <td>${fmtDateTime(r.created_at)}</td>
  </tr>
`, 'carregarPagarme');

makeFinLoader('stripe-events', 'tableStripe', 'paginationStripe', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.type || '—'}</td>
    <td>${fmtDateTime(r.created_at)}</td>
  </tr>
`, 'carregarStripeEvents');

makeFinLoader('conteudo-pacotes', 'tablePacotes', 'paginationPacotes', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.modelo_id}</td>
    <td>${r.cliente_id}</td>
    <td>${money(r.preco)}</td>
    <td>${badgeStatus(r.status)}</td>
    <td>${r.metodo_pagamento || '—'}</td>
    <td>${fmtDateTime(r.criado_em)}</td>
  </tr>
`, 'carregarPacotes');

makeFinLoader('premium-unlocks', 'tablePremium', 'paginationPremium', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.premium_post_id}</td>
    <td>${r.cliente_id}</td>
    <td>${r.modelo_id}</td>
    <td>${money(r.valor_total)}</td>
    <td>${badgeStatus(r.status)}</td>
    <td>${r.metodo_pagamento || '—'}</td>
    <td>${fmtDateTime(r.created_at)}</td>
  </tr>
`, 'carregarPremium');

// Tab click -> load data
document.querySelectorAll('#financeiroTabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const map = {
      'fin-cartao': 'carregarCartao',
      'fin-pix': 'carregarPix',
      'fin-tentativas': 'carregarTentativas',
      'fin-pagarme': 'carregarPagarme',
      'fin-stripe': 'carregarStripeEvents',
      'fin-pacotes': 'carregarPacotes',
      'fin-premium': 'carregarPremium'
    };
    const fn = map[tab.dataset.tab];
    if (fn && window[fn]) window[fn](1);
  });
});

// ========== 12. TRANSAÇÕES (por modelo) ==========

pageLoaders.transacoes = async function () {
  populateMonthSelect($('transacoesMes'));
  await carregarModelosSelect('transacoesModelo');
  carregarTransacoes(1);
  $('transacoesModelo').onchange = () => carregarTransacoes(1);
  $('transacoesMes').onchange = () => carregarTransacoes(1);
};

async function carregarModelosSelect(selectId) {
  try {
    const modelos = await fetchJSON('/admin/dashboard/modelos-lista');
    const select = $(selectId);
    const first = select.options[0];
    select.innerHTML = '';
    select.appendChild(first);
    (modelos || []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.nome;
      select.appendChild(opt);
    });
  } catch (err) { console.error('Erro carregar modelos select:', err); }
}

async function carregarTransacoes(page) {
  try {
    const modelo = $('transacoesModelo').value;
    const mes = $('transacoesMes').value;
    const data = await fetchJSON(`/admin/dashboard/transacoes-agency?page=${page}&limit=20&modelo_id=${modelo}&mes=${mes}`);

    $('kpi-bruto').textContent = money(data.totais?.bruto);
    $('kpi-modelo').textContent = money(data.totais?.modelo);
    $('kpi-velvet').textContent = money(data.totais?.velvet);
    $('kpi-agency').textContent = money(data.totais?.agency);

    const tbody = $('tableTransacoes').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.modelo_nome || r.modelo_id}</td>
        <td>${r.cliente_id}</td>
        <td>${r.tipo}</td>
        <td>${money(r.valor_bruto)}</td>
        <td>${money(r.valor_modelo)}</td>
        <td>${money(r.velvet_fee)}</td>
        <td>${money(r.agency_fee)}</td>
        <td>${badgeStatus(r.status)}</td>
        <td>${fmtDateTime(r.created_at)}</td>
      </tr>
    `).join('') || emptyRow(10);
    buildPagination('paginationTransacoes', page, data.totalPages || 1, 'carregarTransacoes');
  } catch (err) { console.error('Erro transações:', err); }
}

// ========== 13. PASSWORD RESETS ==========

pageLoaders.password = function () {
  carregarPasswordResets(1);
};

async function carregarPasswordResets(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/password-resets?page=${page}&limit=20`);
    const tbody = $('tablePassword').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.user_id}</td>
        <td>${r.codigo}</td>
        <td>${fmtDateTime(r.expires_at)}</td>
        <td>${r.usado ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-muted">Não</span>'}</td>
        <td>${fmtDateTime(r.criado_em)}</td>
      </tr>
    `).join('') || emptyRow(6);
    buildPagination('paginationPassword', page, data.totalPages || 1, 'carregarPasswordResets');
  } catch (err) { console.error('Erro password:', err); }
}

async function resetarSenha(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  if (!confirm('Tem certeza que deseja resetar a senha deste usuário?')) return;
  try {
    await postJSON('/admin/dashboard/password-reset', {
      user_id: form.get('user_id'),
      nova_senha: form.get('nova_senha')
    });
    toast('Senha resetada com sucesso!', 'success');
    closeAllModals();
    e.target.reset();
    carregarPasswordResets(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 14. VIP SUBSCRIPTIONS ==========

let vipSearchTimeout;

pageLoaders.vip = function () {
  carregarVip(1);
  $('vipBusca').oninput = () => {
    clearTimeout(vipSearchTimeout);
    vipSearchTimeout = setTimeout(() => carregarVip(1), 400);
  };
};

async function carregarVip(page) {
  try {
    const busca = $('vipBusca').value;
    const data = await fetchJSON(`/admin/dashboard/vip-subscriptions?page=${page}&limit=20&busca=${encodeURIComponent(busca)}`);
    const tbody = $('tableVip').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.cliente_id}</td>
        <td>${r.modelo_nome || r.modelo_id}</td>
        <td>${money(r.valor_total)}</td>
        <td>${r.ativo ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-muted">Não</span>'}</td>
        <td>${fmtDateTime(r.expiration_at)}</td>
        <td>${r.recorrente ? 'Sim' : 'Não'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editarVip(${r.id})">Editar</button>
        </td>
      </tr>
    `).join('') || emptyRow(8);
    buildPagination('paginationVip', page, data.totalPages || 1, 'carregarVip');
  } catch (err) { console.error('Erro vip:', err); }
}

async function editarVip(id) {
  try {
    const data = await fetchJSON('/admin/dashboard/vip-subscriptions/' + id);
    openEditModal('Editar VIP #' + id, '/admin/dashboard/vip-subscriptions/' + id, 'PUT', [
      { name: 'ativo', label: 'Ativo', type: 'checkbox', value: data.ativo },
      { name: 'recorrente', label: 'Recorrente', type: 'checkbox', value: data.recorrente },
      { name: 'valor_assinatura', label: 'Valor Assinatura', type: 'number', value: data.valor_assinatura },
      { name: 'valor_total', label: 'Valor Total', type: 'number', value: data.valor_total },
      { name: 'expiration_at', label: 'Expira em', type: 'datetime-local', value: data.expiration_at ? new Date(data.expiration_at).toISOString().slice(0, 16) : '' }
    ], () => carregarVip(1));
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 15. PAGAMENTOS A MODELOS ==========

pageLoaders['pagamentos-modelo'] = async function () {
  await carregarModelosSelect('pgtoModeloFiltro');
  carregarPgtoModelo(1);
  $('pgtoModeloFiltro').onchange = () => carregarPgtoModelo(1);
};

async function carregarPgtoModelo(page) {
  try {
    const modelo = $('pgtoModeloFiltro').value;
    const data = await fetchJSON(`/admin/dashboard/modelo-pagamentos?page=${page}&limit=20&modelo_id=${modelo}`);
    const tbody = $('tablePgtoModelo').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.modelo_nome || 'Modelo #' + r.modelo_id}</td>
        <td>${fmtDate(r.mes)}</td>
        <td>${money(r.total_midias)}</td>
        <td>${money(r.total_assinaturas)}</td>
        <td>${money(r.total_geral)}</td>
        <td>${badgeStatus(r.status)}</td>
        <td>${fmtDateTime(r.pago_em)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editarPgtoModelo(${r.id})">Editar</button>
        </td>
      </tr>
    `).join('') || emptyRow(9);
    buildPagination('paginationPgtoModelo', page, data.totalPages || 1, 'carregarPgtoModelo');
  } catch (err) { console.error('Erro pgto modelo:', err); }
}

async function salvarPagModelo(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await postJSON('/admin/dashboard/modelo-pagamentos', Object.fromEntries(form));
    toast('Pagamento registrado!', 'success');
    closeAllModals();
    e.target.reset();
    carregarPgtoModelo(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function editarPgtoModelo(id) {
  try {
    const data = await fetchJSON('/admin/dashboard/modelo-pagamentos/' + id);
    openEditModal('Editar Pagamento #' + id, '/admin/dashboard/modelo-pagamentos/' + id, 'PUT', [
      { name: 'total_midias', label: 'Total Mídias', type: 'number', value: data.total_midias },
      { name: 'total_assinaturas', label: 'Total Assinaturas', type: 'number', value: data.total_assinaturas },
      { name: 'total_geral', label: 'Total Geral', type: 'number', value: data.total_geral },
      { name: 'status', label: 'Status', type: 'select', value: data.status, options: ['pendente', 'pago'] },
      { name: 'recibo_url', label: 'Recibo URL', value: data.recibo_url }
    ], () => carregarPgtoModelo(1));
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 16. AGÊNCIAS ==========

pageLoaders.agencias = async function () {
  try {
    const data = await fetchJSON('/admin/dashboard/agencias');
    const tbody = $('tableAgencias').querySelector('tbody');
    tbody.innerHTML = (data || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.nome}</td>
        <td>${r.email}</td>
        <td>${r.percentual_agencia}%</td>
        <td>${r.percentual_modelo}%</td>
        <td>${r.percentual_plataforma}%</td>
        <td>${fmtDateTime(r.created_at)}</td>
      </tr>
    `).join('') || emptyRow(7);

    // Populate filter
    const select = $('agenciaFiltro');
    select.innerHTML = '<option value="">Selecione a agência</option>';
    (data || []).forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.nome;
      select.appendChild(opt);
    });

    $('agenciaFiltro').onchange = carregarModelosAgencia;
  } catch (err) { console.error('Erro agências:', err); }
};

async function carregarModelosAgencia() {
  const agenciaId = $('agenciaFiltro').value;
  if (!agenciaId) return;
  try {
    const data = await fetchJSON('/admin/dashboard/modelos-agencia/' + agenciaId);
    const tbody = $('tableModelosAgencia').querySelector('tbody');
    tbody.innerHTML = (data || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.nome}</td>
        <td>${fmtDateTime(r.agencia_desde)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="alterarAgenciaModelo(${r.id})">Alterar Agência</button>
        </td>
      </tr>
    `).join('') || emptyRow(4);
  } catch (err) { console.error('Erro modelos agência:', err); }
}

async function alterarAgenciaModelo(modeloId) {
  const novaAgencia = prompt('Novo ID da agência (deixe vazio para remover):');
  if (novaAgencia === null) return;
  try {
    await putJSON('/admin/dashboard/modelos/' + modeloId, {
      agencia_id: novaAgencia || null
    });
    toast('Agência alterada!', 'success');
    carregarModelosAgencia();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

// ========== 17. FEED ==========

let feedSearchTimeout;

pageLoaders.feed = function () {
  carregarFeed(1);
  $('feedBusca').oninput = () => {
    clearTimeout(feedSearchTimeout);
    feedSearchTimeout = setTimeout(() => carregarFeed(1), 400);
  };
};

async function carregarFeed(page) {
  try {
    const busca = $('feedBusca').value;
    const data = await fetchJSON(`/admin/dashboard/feed?page=${page}&limit=20&busca=${encodeURIComponent(busca)}`);
    const tbody = $('tableFeed').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.nome}</td>
        <td>${r.feed ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-muted">Não</span>'}</td>
        <td>${r.verificada ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-muted">Não</span>'}</td>
        <td>
          <button class="btn btn-sm ${r.feed ? 'btn-danger' : 'btn-success'}" onclick="toggleFeed(${r.id}, ${!r.feed})">
            ${r.feed ? 'Remover do Feed' : 'Adicionar ao Feed'}
          </button>
        </td>
      </tr>
    `).join('') || emptyRow(5);
    buildPagination('paginationFeed', page, data.totalPages || 1, 'carregarFeed');
  } catch (err) { console.error('Erro feed:', err); }
}

async function toggleFeed(modeloId, newVal) {
  try {
    await putJSON('/admin/dashboard/modelos/' + modeloId, { feed: newVal });
    toast(newVal ? 'Modelo adicionada ao feed!' : 'Modelo removida do feed!', 'success');
    carregarFeed(1);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
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
  container.innerHTML = fields.map(f => {
    if (f.type === 'checkbox') {
      return `<label class="checkbox-label">
        <input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}>
        ${f.label}
      </label>`;
    }
    if (f.type === 'textarea') {
      return `<label>${f.label}<textarea name="${f.name}">${f.value || ''}</textarea></label>`;
    }
    if (f.type === 'select') {
      return `<label>${f.label}<select name="${f.name}">
        ${(f.options || []).map(o => `<option value="${o}" ${o === f.value ? 'selected' : ''}>${o}</option>`).join('')}
      </select></label>`;
    }
    return `<label>${f.label}<input type="${f.type || 'text'}" name="${f.name}" value="${f.value ?? ''}" step="${f.type === 'number' ? '0.01' : ''}"></label>`;
  }).join('');

  openModal('modalEdit');
}

async function salvarEdicao(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = {};

  // Process form data, handling checkboxes
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

// ========== GLOBAL SEARCH ==========

let globalSearchTimeout;
$('globalSearch').addEventListener('input', (e) => {
  clearTimeout(globalSearchTimeout);
  globalSearchTimeout = setTimeout(() => {
    const q = e.target.value.trim();
    if (!q) return;
    // Navigate to modelos page and search
    document.querySelector('[data-page="modelos"]').click();
    $('modelosBusca').value = q;
    carregarModelos(1);
  }, 600);
});

// ========== INIT ==========

document.addEventListener('DOMContentLoaded', () => {
  if (!token) {
    window.location.href = '/admin/login';
    return;
  }
  pageLoaders.overview();
});
