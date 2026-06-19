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
  lancamentos: 'Faturamentos',
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
  chargebacks: 'Chargebacks',
  despesas: 'Despesas Operacionais',
  suporte: 'Suporte ao Cliente',
  midias: 'Gestão de Mídias',
  'usuarios-confiaveis': 'Usuários Confiáveis',
  contestacoes: 'Contestações'
};

const pageLoaders = {};

// ========== NEWSLETTER ==========

// ── Newsletter state ──
let _nlTodosModelos = [];
let _nlSelecionadas = new Set();
let _nlModoEspecifico = false;

pageLoaders.newsletter = async function () {
  _nlSelecionadas.clear();
  _nlModoEspecifico = false;
  _nlTodosModelos = [];
  const radio = document.querySelector('input[name="nlDestinatarias"][value="todas"]');
  if (radio) radio.checked = true;
  const painel = document.getElementById('nl-selecao-painel');
  if (painel) painel.style.display = 'none';
  const btn = document.getElementById('btnEnviarNewsletter');
  if (btn) btn.textContent = 'Enviar para todas';

  try {
    const data = await fetchJSON('/admin/dashboard/newsletter/resumo');
    document.getElementById('newsletter-resumo').innerHTML =
      `📬 <strong>${data.total}</strong> modelos verificadas receberão o email.`;
  } catch {
    document.getElementById('newsletter-resumo').textContent = 'Erro ao carregar total.';
  }
  carregarHistoricoNewsletter();
};

async function alternarDestinatarias(modo) {
  _nlModoEspecifico = (modo === 'especificas');
  const painel = document.getElementById('nl-selecao-painel');
  const btn = document.getElementById('btnEnviarNewsletter');

  if (_nlModoEspecifico) {
    painel.style.display = 'block';
    btn.textContent = 'Enviar para selecionadas';
    if (_nlTodosModelos.length === 0) await carregarModelosNewsletter();
  } else {
    painel.style.display = 'none';
    btn.textContent = 'Enviar para todas';
    _nlSelecionadas.clear();
    renderizarChips();
  }
}

async function carregarModelosNewsletter() {
  const lista = document.getElementById('nl-lista-modelos');
  lista.innerHTML = '<div style="padding:12px; color:#aaa; text-align:center;">A carregar…</div>';
  try {
    _nlTodosModelos = await fetchJSON('/admin/dashboard/newsletter/modelos');
    renderizarListaModelos(_nlTodosModelos);
  } catch {
    lista.innerHTML = '<div style="padding:12px; color:#e53e3e; text-align:center;">Erro ao carregar modelos.</div>';
  }
}

function renderizarListaModelos(modelos) {
  const lista = document.getElementById('nl-lista-modelos');
  if (!modelos.length) {
    lista.innerHTML = '<div style="padding:12px; color:#aaa; text-align:center;">Nenhuma modelo encontrada.</div>';
    return;
  }
  lista.innerHTML = modelos.map(m => `
    <label style="display:flex; align-items:center; gap:8px; padding:7px 12px; cursor:pointer; transition:background .15s;"
      onmouseover="this.style.background='#f5f0ff'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${m.id}" ${_nlSelecionadas.has(m.id) ? 'checked' : ''}
        onchange="toggleModeloNewsletter(${m.id}, '${escapeHtml(m.nome)}', this.checked)">
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        <strong>${escapeHtml(m.nome)}</strong>
        <span style="color:#aaa; margin-left:6px; font-size:12px;">${escapeHtml(m.email)}</span>
      </span>
    </label>`).join('');
}

function filtrarModelosNewsletter() {
  const q = document.getElementById('nl-busca-modelo').value.toLowerCase();
  const filtrados = _nlTodosModelos.filter(m =>
    m.nome.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  );
  renderizarListaModelos(filtrados);
}

function toggleModeloNewsletter(id, nome, checked) {
  if (checked) _nlSelecionadas.add(id);
  else _nlSelecionadas.delete(id);
  renderizarChips();
  atualizarBotaoEnviar();
}

function selecionarTodasVisiveis() {
  const checkboxes = document.querySelectorAll('#nl-lista-modelos input[type=checkbox]');
  checkboxes.forEach(cb => {
    cb.checked = true;
    const id = Number(cb.value);
    const modelo = _nlTodosModelos.find(m => m.id === id);
    if (modelo) _nlSelecionadas.add(id);
  });
  renderizarChips();
  atualizarBotaoEnviar();
}

function limparSelecaoModelos() {
  _nlSelecionadas.clear();
  document.querySelectorAll('#nl-lista-modelos input[type=checkbox]').forEach(cb => cb.checked = false);
  renderizarChips();
  atualizarBotaoEnviar();
}

function renderizarChips() {
  const container = document.getElementById('nl-selecionadas-chips');
  const vazio = document.getElementById('nl-chips-vazio');
  if (_nlSelecionadas.size === 0) {
    container.innerHTML = '<span style="font-size:12px; color:#aaa;" id="nl-chips-vazio">Nenhuma selecionada</span>';
    return;
  }
  const chips = [..._nlSelecionadas].map(id => {
    const m = _nlTodosModelos.find(x => x.id === id);
    const nome = m ? escapeHtml(m.nome) : id;
    return `<span style="background:#ede7f6; color:#4b2a7b; border-radius:20px; padding:3px 10px; font-size:12px; display:flex; align-items:center; gap:4px;">
      ${nome}
      <button type="button" onclick="toggleModeloNewsletter(${id},'',false); document.querySelector('#nl-lista-modelos input[value=\\'${id}\\']') && (document.querySelector('#nl-lista-modelos input[value=\\'${id}\\']').checked=false)"
        style="background:none; border:none; cursor:pointer; color:#9b59b6; font-size:14px; line-height:1; padding:0 0 0 2px;">&times;</button>
    </span>`;
  }).join('');
  container.innerHTML = chips;
}

function atualizarBotaoEnviar() {
  const btn = document.getElementById('btnEnviarNewsletter');
  if (_nlModoEspecifico) {
    btn.textContent = _nlSelecionadas.size > 0
      ? `Enviar para ${_nlSelecionadas.size} modelo${_nlSelecionadas.size > 1 ? 's' : ''}`
      : 'Enviar para selecionadas';
  }
}

async function carregarHistoricoNewsletter() {
  const el = document.getElementById('newsletter-historico-lista');
  try {
    const data = await fetchJSON('/admin/dashboard/newsletter/historico');
    if (!data.length) { el.textContent = 'Nenhum envio registado ainda.'; return; }
    el.innerHTML = data.map(n => `
      <div style="padding:10px 0; border-bottom:1px solid #eee;">
        <strong>${escapeHtml(n.assunto)}</strong>
        <span style="color:#aaa; margin-left:8px; font-size:12px;">${new Date(n.criado_em).toLocaleString('pt-BR')}</span><br>
        <span style="color:#6f42c1;">${n.total_enviados} destinatárias</span>
        ${n.erro ? `<span style="color:#e53e3e; margin-left:8px;">${escapeHtml(n.erro)}</span>` : ''}
      </div>`).join('');
  } catch {
    el.textContent = 'Erro ao carregar histórico.';
  }
}

async function enviarNewsletter(e) {
  e.preventDefault();
  const assunto = document.getElementById('nlAssunto').value.trim();
  const mensagem = document.getElementById('nlMensagem').value.trim();
  const btn = document.getElementById('btnEnviarNewsletter');
  const status = document.getElementById('newsletter-status');

  if (_nlModoEspecifico && _nlSelecionadas.size === 0) {
    toast('Seleciona pelo menos uma modelo.', 'error');
    return;
  }

  const confirmMsg = _nlModoEspecifico
    ? `Confirma o envio para ${_nlSelecionadas.size} modelo(s) selecionada(s)?`
    : `Confirma o envio para todas as modelos verificadas?`;
  if (!confirm(confirmMsg)) return;

  const payload = { assunto, mensagem };
  if (_nlModoEspecifico) payload.modelo_ids = [..._nlSelecionadas];

  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'A enviar…';
  status.textContent = '';

  try {
    const res = await postJSON('/admin/dashboard/newsletter/enviar', payload);
    toast(`Newsletter enviada para ${res.total} modelo(s)!`, 'success');
    status.textContent = `✓ Enviado para ${res.total} modelo(s)`;
    document.getElementById('formNewsletter').reset();
    _nlSelecionadas.clear();
    renderizarChips();
    carregarHistoricoNewsletter();
  } catch (err) {
    toast('Erro ao enviar newsletter: ' + err.message, 'error');
    status.textContent = '✗ Falha no envio';
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function preVisualizarNewsletter() {
  const assunto = document.getElementById('nlAssunto').value.trim();
  const mensagem = document.getElementById('nlMensagem').value.trim();

  if (!mensagem) {
    toast('Escreva o conteúdo do email antes de pré-visualizar.', 'error');
    return;
  }

  // Se o conteúdo parece ser HTML completo, usa direto; senão envolve num wrapper simples
  const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(mensagem);
  const html = isHtml
    ? mensagem
    : `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;padding:16px;">${mensagem}</body></html>`;

  document.getElementById('nlPreviewAssunto').textContent = assunto ? `Assunto: ${assunto}` : '';
  document.getElementById('nlPreviewFrame').srcdoc = html;

  const modal = document.getElementById('modalPreviewNewsletter');
  modal.style.display = 'flex';
}

function fecharPreviewNewsletter() {
  const modal = document.getElementById('modalPreviewNewsletter');
  modal.style.display = 'none';
  document.getElementById('nlPreviewFrame').srcdoc = '';
}

// Fechar preview ao clicar fora
document.getElementById('modalPreviewNewsletter')?.addEventListener('click', function (e) {
  if (e.target === this) fecharPreviewNewsletter();
});

pageLoaders.suporte = function () {
  const iframe = document.getElementById('suporte-iframe');
  if (!iframe.src || iframe.src === window.location.href) {
    const tok = localStorage.getItem('token_admin') || localStorage.getItem('token') || '';
    iframe.src = '/admin/suporte.html?t=' + encodeURIComponent(tok);
  }
};

pageLoaders.midias = function () {
  const iframe = document.getElementById('midias-iframe');
  if (!iframe.src || iframe.src === window.location.href) {
    const tok = localStorage.getItem('token_admin') || localStorage.getItem('token') || '';
    iframe.src = '/admin/midias.html?t=' + encodeURIComponent(tok);
  }
};

function irParaPagina(page) {
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === page));
  pages.forEach(p => p.classList.remove('active'));
  const pageEl = $('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  $('pageTitle').textContent = pageTitles[page] || page;
  if (pageLoaders[page]) pageLoaders[page]();
}

navItems.forEach(item => {
  item.addEventListener('click', () => irParaPagina(item.dataset.page));
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
  localStorage.removeItem('token');
  window.location.href = '/admin/login.html';
}

async function carregarAdmin() {
  const res = await fetch("/admin/dashboard/name-admin", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token_admin")
    }
  });

  const data = await res.json();

  document.querySelector(".admin-badge").textContent = data.nome;
}

carregarAdmin();

// ========== 1. OVERVIEW ==========

let chartFat, chartAcessosOverview;

pageLoaders.overview = async function () {
  try {
    const data = await fetchJSON('/admin/dashboard/overview');

    $('kpi-modelos').textContent = Number(data.total_modelos ?? 0);
    $('kpi-clientes').textContent = Number(data.total_clientes ?? 0);
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
        <td>${Number(m.assinantes || 0)}</td>
      </tr>
    `).join('') || emptyRow(4);

  } catch (err) {
    console.error('Erro overview:', err);

    $('kpi-modelos').textContent = '--';
    $('kpi-clientes').textContent = '--';
    $('kpi-vips').textContent = '--';
    $('kpi-fat').textContent = '--';

    const tbody = $('tableTopModelos')?.querySelector('tbody');
    if (tbody) tbody.innerHTML = emptyRow(4);
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
    const data = await fetchJSON(`/admin/dashboard/acessos-origem?mes=${mes}`);

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

// ========== USUÁRIOS CONFIÁVEIS ==========

pageLoaders['usuarios-confiaveis'] = async function () {
  try {
    const data = await fetchJSON('/api/admin/usuarios-confiaveis');
    const tbody = $('tableUsuariosConfiaveis').querySelector('tbody');
    tbody.innerHTML = (data.usuarios || []).map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.email}</td>
        <td>${u.motivo || '—'}</td>
        <td>${fmtDateTime(u.criado_em)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="excluirUsuarioConfiavel(${u.id})">Excluir</button></td>
      </tr>
    `).join('') || emptyRow(5);
  } catch (err) {
    console.error('Erro usuarios-confiaveis:', err);
  }
};

async function salvarUsuarioConfiavel(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await postJSON('/api/admin/usuarios-confiaveis', {
      email: form.get('email'),
      motivo: form.get('motivo')
    });
    toast('Usuário confiável adicionado!', 'success');
    closeAllModals();
    e.target.reset();
    pageLoaders['usuarios-confiaveis']();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function excluirUsuarioConfiavel(id) {
  if (!confirm('Remover este usuário da lista de confiáveis?')) return;
  try {
    await deleteJSON('/api/admin/usuarios-confiaveis/' + id);
    toast('Removido', 'success');
    pageLoaders['usuarios-confiaveis']();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ========== CONTESTAÇÕES ==========

function cartaoLabel(p) {
  if (p.card_brand && p.card_last4) {
    const exp = (p.card_exp_month && p.card_exp_year) ? ` (val. ${String(p.card_exp_month).padStart(2,'0')}/${p.card_exp_year})` : '';
    return `${p.card_brand.toUpperCase()} •••• ${p.card_last4}${exp}`;
  }
  return '—';
}

function tipoPagamentoLabel(tipo) {
  const map = {
    vip: 'Assinatura',
    midia: 'Mídia',
    premium: 'Premium',
    conteudo: 'Mídia',
    conteudo_cartao: 'Mídia',
    assinatura: 'Assinatura'
  };
  return map[tipo] || tipo || '—';
}

async function buscarContestacao() {
  const identificador = $('contestacaoIdentificador').value.trim();
  const resultado = $('contestacaoResultado');
  const btnPdf = $('btnGerarPdfContestacao');

  if (!identificador) {
    toast('Informe um email ou cliente_id', 'error');
    return;
  }

  resultado.innerHTML = '<div class="card"><p>Carregando...</p></div>';
  btnPdf.style.display = 'none';

  try {
    const data = await fetchJSON('/api/admin/contestacoes/' + encodeURIComponent(identificador));
    resultado.innerHTML = renderContestacao(data);
    btnPdf.style.display = '';
  } catch (err) {
    resultado.innerHTML = `<div class="card"><p>Erro: ${err.message}</p></div>`;
  }
}

function renderContestacao(data) {
  const c = data.cliente;

  const dadosPessoais = `
    <div class="card contestacao-print">
      <h3>1. Dados do Cliente</h3>
      <table class="table">
        <tbody>
          <tr><td>Nome</td><td>${c.nome || '—'}</td></tr>
          <tr><td>Nome completo</td><td>${c.nome_completo || '—'}</td></tr>
          <tr><td>Email</td><td>${c.email || '—'}</td></tr>
          <tr><td>Cliente ID</td><td>${c.cliente_id}</td></tr>
          <tr><td>CPF/Documento</td><td>${c.documento || c.cpf || '—'}</td></tr>
          <tr><td>Telefone</td><td>${c.telefone || '—'}</td></tr>
          <tr><td>Data de Nascimento</td><td>${fmtDate(c.data_nascimento)}</td></tr>
          <tr><td>Endereço</td><td>${[c.endereco, c.cidade, c.estado, c.pais_endereco].filter(Boolean).join(', ') || '—'}</td></tr>
          <tr><td>País (cadastro)</td><td>${c.pais_cliente || '—'}</td></tr>
          <tr><td>Conta criada em</td><td>${fmtDateTime(c.user_criado_em || c.cliente_criado_em)}</td></tr>
          <tr><td>Confirmação de maioridade</td><td>${c.age_confirmed ? 'Sim, em ' + fmtDateTime(c.age_confirmed_at) : 'Não registrado'}</td></tr>
          <tr><td>Último IP conhecido</td><td>${c.ultimo_ip || '—'}</td></tr>
          <tr><td>Último acesso (login)</td><td>${fmtDateTime(c.ultimo_acesso)}</td></tr>
          <tr><td>Origem de tráfego</td><td>${c.origem_trafego || '—'}</td></tr>
          <tr><td>Email verificado</td><td>${c.email_verificado ? 'Sim, em ' + fmtDateTime(c.user_criado_em) : 'Não'}</td></tr>
          <tr><td>Conta bloqueada</td><td>${c.bloqueado ? 'Sim' : 'Não'}</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const aceiteTermos = `
    <div class="card contestacao-print">
      <h3>2. Aceite de Termos de Uso</h3>
      <table class="table">
        <thead><tr><th>Data/Hora</th><th>Descrição</th><th>IP</th><th>User-Agent</th></tr></thead>
        <tbody>
          ${(data.aceite_termos || []).map(a => `
            <tr>
              <td>${fmtDateTime(a.created_at)}</td>
              <td>${a.descricao || '—'}</td>
              <td>${a.ip || '—'}</td>
              <td style="max-width:300px;word-break:break-all;">${a.user_agent || '—'}</td>
            </tr>
          `).join('') || emptyRow(4)}
        </tbody>
      </table>
    </div>
  `;

  const termosCompletos = `
    <div class="card contestacao-print">
      <h3>2.1 Termos Aceitos — Texto Completo (Política de Pagamentos, Reembolso e Cancelamento)</h3>
      <p style="font-size:12px;color:#666;margin-bottom:8px;">
        Texto vigente referente às versões dos termos aceitas pelo cliente (ver tabela acima).
        Documentos completos: <a href="/terms.html" target="_blank">Termos de Uso</a> ·
        <a href="/policies.html" target="_blank">Política de Utilização</a>
      </p>
      <div class="termos-completos-box" style="font-size:12px;line-height:1.6;background:#f9f9f9;padding:12px;border-radius:8px;">
        <h4>25.1 Política de Reembolso</h4>
        <ul>
          <li>Assinaturas, Diamantes e conteúdos pagos não são reembolsáveis, exceto quando exigido por lei ou nos casos previstos abaixo;</li>
          <li>O usuário é informado previamente sobre as condições da compra e deve concordar com os Termos antes de concluir a transação;</li>
          <li>O reembolso poderá ocorrer exclusivamente em casos de:</li>
        </ul>
        <ul>
          <li>cobrança em duplicidade;</li>
          <li>erro técnico comprovado;</li>
          <li>falha no sistema;</li>
          <li>não disponibilização do serviço após pagamento.</li>
        </ul>
        <p>A Velvet poderá solicitar comprovação para análise.</p>
        <h4>25.2 Conteúdos Pagos (Pay-Per-View e Chat)</h4>
        <ul>
          <li>Conteúdos pagos são liberados mediante pagamento adicional;</li>
          <li>Após o desbloqueio, o conteúdo é considerado entregue e consumido;</li>
          <li>Não há reembolso por insatisfação subjetiva;</li>
          <li>A Velvet não garante expectativa ou resultado em relação ao conteúdo adquirido.</li>
        </ul>
        <h4>25.3 Direito de Arrependimento</h4>
        <ul>
          <li>O usuário reconhece que os serviços e conteúdos digitais da Plataforma são disponibilizados de forma imediata após a confirmação do pagamento;</li>
          <li>Ao concluir a compra, o usuário declara ciência e concordância com a execução imediata do serviço;</li>
          <li>Dessa forma, o usuário concorda que o direito de arrependimento previsto no artigo 49 do Código de Defesa do Consumidor poderá não ser aplicável;</li>
          <li>O usuário será previamente informado sobre: liberação imediata do conteúdo; natureza digital do serviço; possível perda do direito de arrependimento.</li>
        </ul>
      </div>
    </div>
  `;

  const cartaoRows = (data.pagamentos_cartao || []).map(p => `
    <tr>
      <td>${p.modelo_id || '—'}</td>
      <td>${tipoPagamentoLabel(p.tipo)}</td>
      <td>${p.status}</td>
      <td>${money(p.valor)} ${p.currency ? p.currency.toUpperCase() : ''}</td>
      <td>${cartaoLabel(p)}</td>
      <td>${p.nome_cartao || '—'}</td>
      <td>${fmtDateTime(p.pago_em || p.created_at)}</td>
      <td>${p.aceite_ip || '—'}</td>
      <td style="max-width:160px;word-break:break-all;">${p.fingerprint || '—'}</td>
      <td>${p.cpf || p.documento || '—'}</td>
      <td>${p.telefone || '—'}</td>
      <td>${p.aceitou_termos ? `Sim (v${p.versao_termos || '?'} em ${fmtDateTime(p.aceite_timestamp)})` : 'Não'}</td>
      <td>${p.aceitou_execucao_imediata ? 'Sim' : 'Não'}</td>
      <td style="word-break:break-all;">${p.stripe_payment_intent_id || p.stripe_charge_id || '—'}</td>
    </tr>
  `).join('') || emptyRow(14);

  const pixRows = (data.pagamentos_pix || []).map(p => `
    <tr>
      <td>${p.modelo_id || '—'}</td>
      <td>${tipoPagamentoLabel(p.tipo)}</td>
      <td>${p.status}</td>
      <td>${money(p.valor)} ${p.currency ? p.currency.toUpperCase() : ''}</td>
      <td>${p.gateway || '—'}</td>
      <td>${fmtDateTime(p.pago_em || p.criado_em)}</td>
      <td>${p.aceite_ip || '—'}</td>
      <td style="max-width:160px;word-break:break-all;">${p.fingerprint || '—'}</td>
      <td>${p.cpf || '—'}</td>
      <td>${p.telefone || '—'}</td>
      <td>${p.aceitou_termos ? `Sim (v${p.versao_termos || '?'} em ${fmtDateTime(p.aceite_timestamp)})` : 'Não'}</td>
      <td>${p.aceitou_execucao_imediata ? 'Sim' : 'Não'}</td>
      <td style="word-break:break-all;">${p.pagarme_order_id || p.gateway_order_id || '—'}</td>
    </tr>
  `).join('') || emptyRow(13);

  const pagamentos = `
    <div class="card contestacao-print">
      <h3>3. Pagamentos com Cartão</h3>
      <table class="table">
        <thead><tr><th>Modelo ID</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Cartão</th><th>Nome no cartão</th><th>Pago em</th><th>IP</th><th>Fingerprint</th><th>CPF</th><th>Telefone</th><th>Aceite Termos</th><th>Execução Imediata</th><th>Order ID</th></tr></thead>
        <tbody>${cartaoRows}</tbody>
      </table>
    </div>
    <div class="card contestacao-print">
      <h3>3.1 Pagamentos via PIX</h3>
      <table class="table">
        <thead><tr><th>Modelo ID</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Gateway</th><th>Pago em</th><th>IP</th><th>Fingerprint</th><th>CPF</th><th>Telefone</th><th>Aceite Termos</th><th>Execução Imediata</th><th>Order ID</th></tr></thead>
        <tbody>${pixRows}</tbody>
      </table>
    </div>
  `;

  const vipRows = (data.vip_subscriptions || []).map(v => `
    <tr>
      <td>${v.modelo_nome}</td>
      <td>${v.ativo ? 'Ativa' : 'Inativa'}</td>
      <td>${money(v.valor_assinatura)}</td>
      <td>${money(v.valor_total)}</td>
      <td>${v.recorrente ? 'Sim (renovação automática)' : 'Não'}</td>
      <td>${fmtDateTime(v.created_at)}</td>
      <td>${fmtDateTime(v.expiration_at)}</td>
      <td style="word-break:break-all;">${v.stripe_subscription_id || v.gateway_subscription_id || '—'}</td>
      <td>${fmtDateTime(v.visualizacao_em)}</td>
      <td>${v.visualizacao_ip || '—'}</td>
    </tr>
  `).join('') || emptyRow(10);

  const vip = `
    <div class="card contestacao-print">
      <h3>4. Assinaturas VIP</h3>
      <table class="table">
        <thead><tr><th>Modelo</th><th>Status</th><th>Valor Assinatura</th><th>Valor Total</th><th>Recorrência</th><th>Início</th><th>Expira em</th><th>ID Assinatura</th><th>Liberado Acesso</th><th>IP</th></tr></thead>
        <tbody>${vipRows}</tbody>
      </table>
    </div>
  `;

  const premiumRows = (data.premium_unlocks || []).map(p => `
    <tr>
      <td>${p.modelo_nome}</td>
      <td>${p.tipo_conteudo || '—'}</td>
      <td>${p.post_descricao || '—'}</td>
      <td>${p.status}</td>
      <td>${money(p.valor_total)} ${p.currency ? p.currency.toUpperCase() : ''}</td>
      <td>${fmtDateTime(p.pago_em || p.created_at)}</td>
      <td>${p.aceite_ip || '—'}</td>
      <td>${fmtDateTime(p.visualizacao_em)}</td>
      <td style="word-break:break-all;">${p.pagarme_order_id || '—'}</td>
    </tr>
  `).join('') || emptyRow(9);

  const premium = `
    <div class="card contestacao-print">
      <h3>5. Conteúdo Premium Desbloqueado</h3>
      <table class="table">
        <thead><tr><th>Modelo</th><th>Tipo</th><th>Descrição</th><th>Status</th><th>Valor</th><th>Pago em</th><th>IP</th><th>Visto em</th><th>Order ID</th></tr></thead>
        <tbody>${premiumRows}</tbody>
      </table>
    </div>
  `;

  const midiaRows = (data.midias_chat || []).map(m => {
    const conteudos = (m.conteudos || []).map(c => `${c.tipo_conteudo}${c.descricao ? ' - ' + c.descricao : ''}`).join('<br>') || '—';
    return `
      <tr>
        <td>${m.modelo_nome}</td>
        <td>${conteudos}</td>
        <td>${m.status}</td>
        <td>${money(m.valor_total)} ${m.currency ? m.currency.toUpperCase() : ''}</td>
        <td>${m.metodo_pagamento || '—'}</td>
        <td>${fmtDateTime(m.pago_em || m.criado_em)}</td>
        <td>${fmtDateTime(m.visualizacao_em)}</td>
        <td>${m.visualizacao_ip || '—'}</td>
      </tr>
    `;
  }).join('') || emptyRow(8);

  const midias = `
    <div class="card contestacao-print">
      <h3>6. Mídias Desbloqueadas no Chat</h3>
      <table class="table">
        <thead><tr><th>Modelo</th><th>Conteúdo</th><th>Status</th><th>Valor</th><th>Método</th><th>Pago em</th><th>Visto em</th><th>IP</th></tr></thead>
        <tbody>${midiaRows}</tbody>
      </table>
    </div>
  `;

  const visitasRows = (data.visitas_perfil || []).map(v => `
    <tr>
      <td>${v.modelo_nome}</td>
      <td>${v.total_visitas}</td>
      <td>${fmtDateTime(v.primeira_visita)}</td>
      <td>${fmtDateTime(v.ultima_visita)}</td>
    </tr>
  `).join('') || emptyRow(4);

  const visitas = `
    <div class="card contestacao-print">
      <h3>7. Visitas a Perfis</h3>
      <table class="table">
        <thead><tr><th>Modelo</th><th>Total de Visitas</th><th>Primeira Visita</th><th>Última Visita</th></tr></thead>
        <tbody>${visitasRows}</tbody>
      </table>
    </div>
  `;

  const suporteBlocos = (data.suporte || []).map(s => `
    <div style="margin-bottom:12px;padding:8px;border:1px solid #333;border-radius:6px;">
      <strong>Conversa #${s.conversa_id}</strong> — ${s.status} — aberta em ${fmtDateTime(s.conversa_criada_em)}
      <ul style="margin:6px 0 0 16px;padding:0;">
        ${(s.mensagens || []).map(m => `<li><strong>${m.remetente}</strong> (${fmtDateTime(m.criado_em)}): ${m.texto}</li>`).join('') || '<li>Sem mensagens</li>'}
      </ul>
    </div>
  `).join('') || '<p>Nenhuma conversa de suporte encontrada.</p>';

  const suporte = `
    <div class="card contestacao-print">
      <h3>8. Histórico de Suporte</h3>
      ${suporteBlocos}
    </div>
  `;

  const riscoRows = (data.risco || []).map(r => `
    <tr>
      <td>${r.nivel || '—'}</td>
      <td>${r.motivo || '—'}</td>
      <td>${r.ip || '—'}</td>
      <td>${r.cpf || '—'}</td>
      <td style="max-width:160px;word-break:break-all;">${r.fingerprint || '—'}</td>
      <td>${r.ativo ? 'Sim' : 'Não'}</td>
      <td>${fmtDateTime(r.criado_em)}</td>
    </tr>
  `).join('') || emptyRow(7);

  const risco = `
    <div class="card contestacao-print">
      <h3>9. Antifraude / Risco</h3>
      <table class="table">
        <thead><tr><th>Nível</th><th>Motivo</th><th>IP</th><th>CPF</th><th>Fingerprint</th><th>Ativo</th><th>Registrado em</th></tr></thead>
        <tbody>${riscoRows}</tbody>
      </table>
    </div>
  `;

  const autoexclusaoRows = (data.autoexclusao || []).map(a => `
    <tr>
      <td>${a.motivo || '—'}</td>
      <td>${fmtDateTime(a.solicitado_em)}</td>
      <td>${a.ip || '—'}</td>
      <td>${a.origem || '—'}</td>
      <td style="max-width:300px;word-break:break-all;">${a.user_agent || '—'}</td>
    </tr>
  `).join('') || emptyRow(5);

  const autoexclusao = `
    <div class="card contestacao-print">
      <h3>10. Pedidos de Autoexclusão da Conta</h3>
      <table class="table">
        <thead><tr><th>Motivo</th><th>Solicitado em</th><th>IP</th><th>Origem</th><th>User-Agent</th></tr></thead>
        <tbody>${autoexclusaoRows}</tbody>
      </table>
    </div>
  `;

  return `
    <div class="contestacao-header" style="margin:12px 0;">
      <h2>Relatório de Contestação — ${c.nome || c.email} (Cliente #${c.cliente_id})</h2>
      <p style="color:#aaa;">Gerado em ${fmtDateTime(new Date().toISOString())}</p>
    </div>
    ${dadosPessoais}
    ${aceiteTermos}
    ${termosCompletos}
    ${pagamentos}
    ${vip}
    ${premium}
    ${midias}
    ${visitas}
    ${suporte}
    ${risco}
    ${autoexclusao}
  `;
}

// ========== 4. SEGURANÇA ==========

let segurancaPage = 1;
let securityLogsPage = 1;

pageLoaders.seguranca = function () {
  // Tabs da seção segurança
  const tabs = document.querySelectorAll('#segurancaTabs .tab');
  const contents = document.querySelectorAll('#page-seguranca .tab-content');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = $('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    };
  });

  // Aba logs clientes
  populateMonthSelect($('logMes'));
  buscarSecurityLogs(1);

  // Aba admin actions
  populateMonthSelect($('segurancaMes'));
  carregarSeguranca(1);
  $('segurancaMes').onchange = () => carregarSeguranca(1);

  $('logClienteId').addEventListener('keydown', e => {
    if (e.key === 'Enter') buscarSecurityLogs(1);
  });
};

const TIPO_LABELS = {
  assinatura_vip:          'Assinatura VIP',
  cancelamento_assinatura: 'Cancelamento de Assinatura',
  aceite_termos:           'Aceite de Termos',
  visualizacao_midia_chat: 'Visualização Mídia Chat',
  visualizacao_premium:    'Visualização Premium Feed',
  compra_midia_chat:       'Compra Mídia Chat',
  compra_premium:          'Compra Premium'
};

const TIPO_BADGES = {
  assinatura_vip:          'badge-success',
  cancelamento_assinatura: 'badge-error',
  aceite_termos:           'badge-info',
  visualizacao_midia_chat: 'badge-warning',
  visualizacao_premium:    'badge-warning',
  compra_midia_chat:       'badge-success',
  compra_premium:          'badge-success'
};

async function buscarSecurityLogs(page) {
  securityLogsPage = page;
  try {
    const cliente_id = ($('logClienteId').value || '').trim();
    const tipo = $('logTipo').value || '';
    const mes  = $('logMes').value || '';

    let url = `/admin/dashboard/security-logs?page=${page}&limit=25`;
    if (cliente_id) url += `&cliente_id=${encodeURIComponent(cliente_id)}`;
    if (tipo)       url += `&tipo=${encodeURIComponent(tipo)}`;
    if (mes)        url += `&mes=${encodeURIComponent(mes)}`;

    const data = await fetchJSON(url);

    const total = data.total || 0;
    const totalEl = $('logTotal');
    if (totalEl) totalEl.textContent = total ? `(${total} registros)` : '';

    const tbody = $('tableSecurityLogs').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => {
      const badgeClass = TIPO_BADGES[r.tipo] || 'badge-info';
      const label = TIPO_LABELS[r.tipo] || r.tipo;
      return `
        <tr>
          <td>${r.id}</td>
          <td><span class="badge ${badgeClass}">${label}</span></td>
          <td>${r.cliente_id || '—'}</td>
          <td>${r.cliente_nome || '—'}</td>
          <td>${r.modelo_id || '—'}</td>
          <td style="max-width:320px;white-space:normal;font-size:12px;">${r.descricao || '—'}</td>
          <td style="font-size:11px;">${r.ip || '—'}</td>
          <td>${fmtDateTime(r.created_at)}</td>
        </tr>
      `;
    }).join('') || emptyRow(8);

    buildPagination('paginationSecurityLogs', page, data.totalPages || 1, 'buscarSecurityLogs');
  } catch (err) {
    console.error('Erro security logs:', err);
  }
}

function limparFiltrosLogs() {
  $('logClienteId').value = '';
  $('logTipo').value = '';
  buscarSecurityLogs(1);
}

async function carregarSeguranca(page) {
  segurancaPage = page;

  try {
    const mes = $('segurancaMes').value;

    const data = await fetchJSON(
      `/admin/dashboard/seguranca?mes=${mes}&page=${page}&limit=20`
    );

    const tbody = $('tableSeguranca').querySelector('tbody');

    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.user_id || r.id || '—'}</td>
        <td>${r.tipo_user || 'admin'}</td>
        <td>${r.admin_email || r.admin_id || '—'}</td>
        <td>
          <strong>${r.acao || '—'}</strong>
          ${r.motivo ? `<br><small>${r.motivo}</small>` : ''}
        </td>
        <td>${fmtDateTime(r.data)}</td>
      </tr>
    `).join('') || emptyRow(5);

    buildPagination(
      'paginationSeguranca',
      page,
      data.totalPages || 1,
      'carregarSeguranca'
    );

  } catch (err) {
    console.error('Erro segurança:', err);
  }
}

// ========== 5. BLOQUEIOS ==========

pageLoaders.bloqueios = function () {
  carregarRisco(1);
  carregarBloqueados(1);
  carregarLogsRisco(1);
  carregarBloqs(1);
  
};

async function carregarRisco(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/cliente-risco?page=${page}&limit=20`);
    const tbody = $('tableRisco').querySelector('tbody');

    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.cliente_id || '—'}</td>
        <td><span class="badge badge-${r.nivel || 'default'}">${r.nivel || '—'}</span></td>
        <td>${r.bloqueio_ip ? 'Sim' : 'Não'}</td>
        <td>${r.bloqueio_cpf ? 'Sim' : 'Não'}</td>
        <td>${r.bloqueio_fingerprint ? 'Sim' : 'Não'}</td>
        <td>${r.motivo || '—'}</td>
        <td>${r.expira_em ? fmtDateTime(r.expira_em) : 'Permanente'}</td>
        <td>${r.criado_em ? fmtDateTime(r.criado_em) : '—'}</td>
        <td>${r.admin || '—'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editarRisco(${r.cliente_id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="excluirRisco(${r.cliente_id})">Excluir</button>
        </td>
      </tr>
    `).join('') || emptyRow(10);

    buildPagination('paginationRisco', page, data.totalPages || 1, 'carregarRisco');
  } catch (err) {
    console.error('Erro risco:', err);
  }
}

async function buscarDadosClienteRisco() {
  const clienteId = document.getElementById('risco_cliente_id').value;

  if (!clienteId) {
    toast('Informe o Cliente ID', 'error');
    return;
  }

  try {
    const data = await fetchJSON(`/admin/dashboard/cliente-risco/lookup/${clienteId}`);

    document.getElementById('risco_cpf').value = data.cpf || '';
    document.getElementById('risco_ip').value = data.ip || '';
    document.getElementById('risco_fingerprint').value = data.fingerprint || '';

    const info = document.getElementById('risco_lookup_info');
    info.style.display = 'block';
    const fingerprintCurto = data.fingerprint
  ? data.fingerprint.slice(0, 24) + '...'
  : '—';

info.style.display = 'block';
info.innerHTML = `
  CPF: ${data.cpf || '—'}<br>
  IP: ${data.ip || '—'}<br>
  Fingerprint: <span title="${data.fingerprint || ''}">${fingerprintCurto}</span>
`;

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function salvarRisco(e) {
  e.preventDefault();

  const form = new FormData(e.target);

  try {
    await postJSON('/admin/dashboard/cliente-risco', {
      cliente_id: form.get('cliente_id'),
      cpf: form.get('cpf') || null,
      ip: form.get('ip') || null,
      fingerprint: form.get('fingerprint') || null,
      nivel: form.get('nivel'),
      motivo: form.get('motivo') || null,
      expira_em: form.get('expira_em') || null,
      bloqueio_ip: form.get('bloqueio_ip') === 'on',
      bloqueio_cpf: form.get('bloqueio_cpf') === 'on',
      bloqueio_fingerprint: form.get('bloqueio_fingerprint') === 'on'
    });

    toast('Cliente de risco adicionado!', 'success');
    closeAllModals();
    resetModalRisco(false);
    carregarRisco(1);

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function editarRisco(clienteId) {
  try {
    const data = await fetchJSON('/admin/dashboard/cliente-risco/' + clienteId);

    $('editar_risco_cliente_id').value = data.cliente_id;
    $('editar_risco_cliente_id_view').value = data.cliente_id;

    $('editar_risco_nivel').value = data.nivel || 'medio';
    $('editar_risco_motivo').value = data.motivo || '';

    $('editar_risco_expira_em').value = data.expira_em
      ? new Date(data.expira_em).toISOString().slice(0, 16)
      : '';

    $('editar_risco_bloqueio_ip').checked = !!data.bloqueio_ip;
    $('editar_risco_bloqueio_cpf').checked = !!data.bloqueio_cpf;
    $('editar_risco_bloqueio_fingerprint').checked = !!data.bloqueio_fingerprint;

    openModal('modalEditarRisco');

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function salvarEdicaoRisco(e) {
  e.preventDefault();

  const clienteId = $('editar_risco_cliente_id').value;

  try {
    await putJSON('/admin/dashboard/cliente-risco/' + clienteId, {
      nivel: $('editar_risco_nivel').value,
      motivo: $('editar_risco_motivo').value || null,
      expira_em: $('editar_risco_expira_em').value || null,
      bloqueio_ip: $('editar_risco_bloqueio_ip').checked,
      bloqueio_cpf: $('editar_risco_bloqueio_cpf').checked,
      bloqueio_fingerprint: $('editar_risco_bloqueio_fingerprint').checked
    });

    toast('Cliente de risco atualizado!', 'success');
    closeAllModals();
    carregarRisco(1);

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

function resetModalRisco(abrir = true) {
  const form = document.getElementById('formRisco');
  if (form) form.reset();

  ['risco_cpf', 'risco_ip', 'risco_fingerprint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const info = document.getElementById('risco_lookup_info');
  if (info) {
    info.style.display = 'none';
    info.textContent = '';
  }

  if (abrir) openModal('modalRisco');
}

async function excluirRisco(clienteId) {
  if (!confirm('Remover cliente da lista de risco?')) return;

  try {
    await deleteJSON('/admin/dashboard/cliente-risco/' + clienteId);
    toast('Cliente removido da lista de risco', 'success');
    carregarRisco(1);
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function carregarLogsRisco(page = 1) {
  try {
    const data = await fetchJSON(`/admin/dashboard/logs-clientes-risco?page=${page}&limit=20`);

    const tbody = document.querySelector("#tableLogsRisco tbody");

    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.cliente_id || '—'}</td>
        <td>${r.cpf || '—'}</td>
        <td>${r.ip || '—'}</td>
        <td title="${r.fingerprint || ''}"> ${r.fingerprint ? r.fingerprint.slice(0, 18) + '...' : '—'}</td>
        <td>${r.motivo || '—'}</td>
        <td><span class="status-bool ${r.ativo ? 'sim' : 'nao'}">${r.ativo ? 'Sim' : 'Não'}</span></td>
        <td>${fmtDate(r.criado_em)}</td>
        <td>${r.admin || '—'}</td>
      </tr>
    `).join("");

    buildPagination(
      'paginationLogsRisco',
      page,
      data.totalPages || 1,
      'carregarLogsRisco'
    );

  } catch (err) {
    console.error("Erro ao carregar logs de clientes risco:", err);
  }
}
//  
//DADOS CLIENTES BLOQUEADOS
async function carregarBloqueados(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/clientes-bloqueados?page=${page}&limit=20`);
    const tbody = $('tableBloqueados').querySelector('tbody');

    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.user_id || r.id || '—'}</td>
        <td>${r.email || '—'}</td>
        <td>${r.nome_completo || '—'}</td>
        <td>${fmtDate(r.data_nascimento)}</td>
        <td>${r.nivel || '—'}</td>
        <td>${r.bloqueio_ip ? 'Sim' : 'Não'}</td>
        <td>${r.bloqueio_cpf ? 'Sim' : 'Não'}</td>
        <td>${r.bloqueio_fingerprint ? 'Sim' : 'Não'}</td>
        <td>${r.motivo || '—'}</td>
        <td>${fmtDateTime ? fmtDateTime(r.desativado_em) : (r.desativado_em || '—')}</td>
        <td>${r.admin || '—'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editarBloqueado(${r.cliente_id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="excluirBloqueado(${r.cliente_id})">Excluir</button>
        </td>
      </tr>
    `).join('') || emptyRow(12);

    buildPagination('paginationBloqueados', page, data.totalPages || 1, 'carregarBloqueados');
  } catch (err) {
    console.error('Erro bloqueados:', err);
  }
}

async function buscarDadosClienteBloqueado() {
  const clienteId = $('bloqueado_cliente_id').value;

  if (!clienteId) {
    toast('Informe o Cliente ID', 'error');
    return;
  }

  try {
    const data = await fetchJSON(`/admin/dashboard/clientes-bloqueados/lookup/${clienteId}`);

    $('bloqueado_user_id').value = data.user_id || '';
    $('bloqueado_email').value = data.email || '';
    $('bloqueado_nome').value = data.nome_completo || '';
    $('bloqueado_nascimento').value = data.data_nascimento ? data.data_nascimento.slice(0, 10) : '';
    $('bloqueado_ativo').value = data.ativo === true ? 'true' : 'false';
    $('bloqueado_desativado_em').value = data.desativado_em || '';
    $('bloqueado_bloqueado').value = data.bloqueado === true ? 'true' : 'false';
    $('bloqueado_ip').value = data.ip || '';
    $('bloqueado_fingerprint').value = data.fingerprint || '';
    $('bloqueado_cpf').value = data.cpf || '';

    const info = $('bloqueado_lookup_info');
    info.style.display = 'block';
    info.innerHTML = `
      ID Users: ${data.user_id || '—'}<br>
      Cliente ID: ${data.cliente_id || '—'}<br>
      Email: ${data.email || '—'}<br>
      Nome: ${data.nome_completo || '—'}<br>
      Nascimento: ${data.data_nascimento ? fmtDate(data.data_nascimento) : '—'}<br>
      Ativo: ${data.ativo ? 'Sim' : 'Não'}<br>
      Desativado em: ${data.desativado_em ? fmtDateTime(data.desativado_em) : '—'}<br>
      Bloqueado: ${data.bloqueado ? 'Sim' : 'Não'}<br>
      CPF: ${data.cpf || '—'}<br>
      IP: ${data.ip || '—'}<br>
      Fingerprint: ${data.fingerprint || '—'}
    `;

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function salvarBloqueado(e) {
  e.preventDefault();

  const form = new FormData(e.target);

  try {
    await postJSON('/admin/dashboard/clientes-bloqueados', {
      cliente_id: form.get('cliente_id'),
      user_id: form.get('user_id') || null,
      email: form.get('email') || null,
      nome_completo: form.get('nome_completo') || null,
      data_nascimento: form.get('data_nascimento')?.trim() || null,

      ativo: false,
      bloqueado: true,

      ip: form.get('ip') || null,
      fingerprint: form.get('fingerprint') || null,
      cpf: form.get('cpf') || null,
      nivel: form.get('nivel') || null,
      motivo: form.get('motivo') || null,
      bloqueio_ip: form.get('bloqueio_ip') === 'on',
      bloqueio_cpf: form.get('bloqueio_cpf') === 'on',
      bloqueio_fingerprint: form.get('bloqueio_fingerprint') === 'on'
    });

    toast('Cliente bloqueado adicionado!', 'success');
    closeAllModals();
    resetModalBloqueado(false);
    carregarBloqueados(1);

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function excluirBloqueado(clienteId) {
  if (!confirm('Remover cliente da lista de bloqueados?')) return;

  try {
    await deleteJSON('/admin/dashboard/clientes-bloqueados/' + clienteId);
    toast('Cliente removido da lista de bloqueados', 'success');
    carregarBloqueados(1);
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function editarBloqueado(clienteId) {
  try {
    const data = await fetchJSON('/admin/dashboard/clientes-bloqueados/' + clienteId);

    $('editar_bloqueado_cliente_id').value = data.cliente_id;
    $('editar_bloqueado_cliente_id_view').value = data.cliente_id;

    $('editar_bloqueado_nivel').value = data.nivel || 'medio';
    $('editar_bloqueado_motivo').value = data.motivo || '';

    $('editar_bloqueado_bloqueio_ip').checked = !!data.bloqueio_ip;
    $('editar_bloqueado_bloqueio_cpf').checked = !!data.bloqueio_cpf;
    $('editar_bloqueado_bloqueio_fingerprint').checked = !!data.bloqueio_fingerprint;

    openModal('modalEditarBloqueado');

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function salvarEdicaoBloqueado(e) {
  e.preventDefault();

  const clienteId = $('editar_bloqueado_cliente_id').value;

  try {
    await putJSON('/admin/dashboard/clientes-bloqueados/' + clienteId, {
      nivel: $('editar_bloqueado_nivel').value,
      motivo: $('editar_bloqueado_motivo').value || null,
      bloqueio_ip: $('editar_bloqueado_bloqueio_ip').checked,
      bloqueio_cpf: $('editar_bloqueado_bloqueio_cpf').checked,
      bloqueio_fingerprint: $('editar_bloqueado_bloqueio_fingerprint').checked,

      ativo: false,
      bloqueado: true
    });

    toast('Cliente bloqueado atualizado!', 'success');
    closeAllModals();
    carregarBloqueados(1);

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

function resetModalBloqueado(abrir = true) {
  const form = $('formBloqueado');
  if (form) form.reset();

  [
    'bloqueado_user_id',
    'bloqueado_email',
    'bloqueado_nome',
    'bloqueado_nascimento',
    'bloqueado_ativo',
    'bloqueado_desativado_em',
    'bloqueado_bloqueado',
    'bloqueado_ip',
    'bloqueado_fingerprint',
    'bloqueado_cpf'
  ].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });

  const info = $('bloqueado_lookup_info');
  if (info) {
    info.style.display = 'none';
    info.textContent = '';
  }

  if (abrir) openModal('modalBloqueado');
}

async function carregarBloqs(page = 1) {
  try {
    const data = await fetchJSON(`/admin/dashboard/logs-clientes-bloqueados?page=${page}&limit=20`);

    const tbody = document.querySelector("#tableBloqs tbody");

    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.user_id || '—'}</td>
        <td>${r.cpf || '—'}</td>
        <td>${r.ip || '—'}</td>
        <td title="${r.fingerprint || ''}"> ${r.fingerprint ? r.fingerprint.slice(0, 18) + '...' : '—'}</td>
        <td>${r.email || '—'}</td>
        <td>${r.motivo || '—'}</td>
        <td><span class="status-bool ${r.bloqueado ? 'sim' : 'nao'}">${r.bloqueado ? 'Sim' : 'Não'}</span></td>
        <td>${fmtDate(r.criado_em)}</td>
        <td>${r.admin_email || '—'}</td>
      </tr>
    `).join("");
    
    buildPagination('paginationBloqs', page, data.totalPages || 1, 'carregarBloqs');

  } catch (err) {
    console.error("Erro ao carregar logs de clientes bloqueados:", err);
  }
}

// ========== 6. VERIFICAÇÕES ==========

let currentVerificacao = null;
let currentVerificacaoTipo = null;
let agenciasCache = [];

pageLoaders.verificacoes = function () {
  carregarVerModelos(1);
};

async function carregarVerModelos(page) {
  try {
    const data = await fetchJSON(`/admin/dashboard/verificacoes/modelos?page=${page}&limit=20`);
    const tbody = $('tableVerModelos').querySelector('tbody');

    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.modelo_id || r.id}</td>
        <td>${r.modelo_nome || 'Modelo #' + (r.modelo_id || r.id)}</td>
        <td>${r.documento_tipo || '—'}</td>
        <td>${badgeStatus(r.status)}</td>
        <td>${fmtDateTime(r.criado_em)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="verVerificacao(${r.modelo_id || r.id}, 'modelo')">Ver</button>
        </td>
      </tr>
    `).join('') || emptyRow(6);

    buildPagination('paginationVerModelos', page, data.totalPages || 1, 'carregarVerModelos');
  } catch (err) {
    console.error('Erro ver modelos:', err);
  }
}

async function carregarAgencias() {
  if (agenciasCache.length) return agenciasCache;
  agenciasCache = await fetchJSON('/admin/dashboard/agencias-lista');
  return agenciasCache;
}

async function verVerificacao(id, tipo) {
  try {
    const [data, agencias] = await Promise.all([
      fetchJSON(`/admin/dashboard/verificacoes/${tipo}/${id}`),
      carregarAgencias()
    ]);

    currentVerificacao = id;
    currentVerificacaoTipo = tipo;

    $('modalVerTitle').textContent = `Verificação #${id} — Modelo`;

    const showActions = data.status === 'pendente' || data.status === 'em_analise';

    let html = '<div class="ver-info">';
    html += `<p><strong>Status:</strong> ${badgeStatus(data.status)}</p>`;
    html += `<p><strong>Tipo documento:</strong> ${data.documento_tipo || '—'}</p>`;
    html += `<p><strong>Declaração:</strong> ${data.declaracao ? 'Sim' : 'Não'}</p>`;

    if (data.criado_em) {
      html += `<p><strong>Enviado em:</strong> ${fmtDateTime(data.criado_em)}</p>`;
    }

    if (data.verificado_em) {
      html += `<p><strong>Atualizado em:</strong> ${fmtDateTime(data.verificado_em)}</p>`;
    }

    if (data.motivo_rejeicao) {
      html += `<p><strong>Motivo rejeição:</strong> ${data.motivo_rejeicao}</p>`;
    }

    html += '</div>';

    if (showActions) {
      html += `
        <div class="ver-form-grid">
          <label>Nome de exibição
            <input id="ver_nome_exibicao" value="${escapeHtml(data.nome_exibicao || '')}">
          </label>

          <label>Local
            <input id="ver_local" value="${escapeHtml(data.local || '')}">
          </label>

          <label class="full">Bio
            <textarea id="ver_bio">${escapeHtml(data.bio || '')}</textarea>
          </label>

          <label>Nome completo
            <input id="ver_nome_completo" value="${escapeHtml(data.nome_completo || '')}">
          </label>

          <label>Data de nascimento
            <input type="date" id="ver_data_nascimento" value="${formatDateInput(data.data_nascimento)}">
          </label>

          <label>Telefone
            <input id="ver_telefone" value="${escapeHtml(data.telefone || '')}">
          </label>

          <label>Endereço
            <input id="ver_endereco" value="${escapeHtml(data.endereco || '')}">
          </label>

          <label>Pais
            <input id="ver_pais" value="${escapeHtml(data.pais || '')}">
          </label>

          <label>Estado
            <input id="ver_estado" value="${escapeHtml(data.estado || '')}">
          </label>

          <label>Cidade
            <input id="ver_cidade" value="${escapeHtml(data.cidade || '')}">
          </label>

          <label>VIP Preço
            <input type="number" step="0.01" id="ver_vip_preco" value="${data.vip_preco ?? ''}">
          </label>

          <label>Agência
            <select id="ver_agencia_id">
              <option value="">Sem agência</option>
              ${agencias.map(a => `
                <option value="${a.id}" ${String(a.id) === String(data.agencia_id) ? 'selected' : ''}>
                  ${escapeHtml(a.nome)}
                </option>
              `).join('')}
            </select>
          </label>

          <label class="full">Motivo da rejeição
            <textarea id="ver_motivo_rejeicao" placeholder="Preencha se for rejeitar"></textarea>
          </label>
        </div>
      `;
    } else {
      html += `
        <div class="ver-readonly-grid">
          <p><strong>Nome de exibição:</strong> ${data.nome_exibicao || '—'}</p>
          <p><strong>Local:</strong> ${data.local || '—'}</p>
          <p><strong>Nome completo:</strong> ${data.nome_completo || '—'}</p>
          <p><strong>Data nascimento:</strong> ${data.data_nascimento ? fmtDate(data.data_nascimento) : '—'}</p>
          <p><strong>Telefone:</strong> ${data.telefone || '—'}</p>
          <p><strong>Endereço:</strong> ${data.endereco || '—'}</p>
          <p><strong>País:</strong> ${data.pais || '—'}</p>
          <p><strong>Estado:</strong> ${data.estado || '—'}</p>
          <p><strong>Cidade:</strong> ${data.cidade || '—'}</p>
          <p><strong>VIP Preço:</strong> ${data.vip_preco ?? '—'}</p>
          <p><strong>Agência:</strong> ${data.agencia_nome || 'Sem agência'}</p>
          <p class="full"><strong>Bio:</strong> ${data.bio || '—'}</p>
        </div>
      `;
    }

    if (data.avatar_url || data.capa_url) {
  html += '<div class="ver-docs">';

  if (data.avatar_url) {
    html += `
      <div class="ver-doc-item">
        <div class="ver-doc-label">Foto de Perfil</div>
        <a href="${data.avatar_url}" target="_blank" rel="noopener noreferrer">
          <img src="${data.avatar_url}" alt="Foto de Perfil">
        </a>
      </div>
    `;
  } else {
    html += `
      <div class="ver-doc-item vazio">
        <div class="ver-doc-label">Foto de Perfil</div>
        <div class="img-vazia">Não enviada</div>
      </div>
    `;
  }

  if (data.capa_url) {
    html += `
      <div class="ver-doc-item">
        <div class="ver-doc-label">Capa</div>
        <a href="${data.capa_url}" target="_blank" rel="noopener noreferrer">
          <img src="${data.capa_url}" alt="Capa">
        </a>
      </div>
    `;
  } else {
    html += `
      <div class="ver-doc-item vazio">
        <div class="ver-doc-label">Capa</div>
        <div class="img-vazia">Não enviada</div>
      </div>
    `;
  }

  html += '</div>';
}

    const docs = [
      { label: '📄 Contrato Assinado', url: data.contrato_pdf_url },
      { label: '🪪 Documento Frente', url: data.doc_frente_url },
      { label: '🪪 Documento Verso', url: data.doc_verso_url },
      { label: '🤳 Selfie', url: data.selfie_url }
    ];

    if (showActions) {
      html += '<div class="ver-docs">';
      html += docs.map(doc => {
        if (!doc.url) {
          return `
            <div class="ver-doc-item vazio">
              <div class="ver-doc-label">${doc.label}</div>
              <div class="img-vazia">Não enviado</div>
            </div>
          `;
        }

        return `
          <div class="ver-doc-item">
            <div class="ver-doc-label">${doc.label}</div>
            <a href="${doc.url}" target="_blank" rel="noopener noreferrer">
              <img src="${doc.url}" alt="${doc.label}">
            </a>
          </div>
        `;
      }).join('');
      html += '</div>';
    } else {
      html += '<div class="ver-links"><h4>Documentos</h4>';
      html += docs.map(doc => `
        <p>
          <strong>${doc.label}:</strong>
          ${doc.url ? `<a href="${doc.url}" target="_blank" rel="noopener noreferrer">Abrir documento</a>` : 'Não enviado'}
        </p>
      `).join('');
      html += '</div>';
    }

    $('modalVerContent').innerHTML = html;
    $('btnAprovar').style.display = showActions ? '' : 'none';
    $('btnRejeitar').style.display = showActions ? '' : 'none';

    openModal('modalVerificacao');
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function aprovarVerificacao() {
  if (!currentVerificacao || !currentVerificacaoTipo) {
    toast('Nenhuma verificação selecionada.', 'error');
    return;
  }

  try {
    await putJSON(
      `/admin/dashboard/verificacoes/${currentVerificacaoTipo}/${currentVerificacao}`,
      {
        status: 'aprovado',
        dados: coletarDadosModeloModal()
      }
    );

    toast('Verificação aprovada!', 'success');
    closeAllModals();
    pageLoaders.verificacoes();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function rejeitarVerificacao() {
  if (!currentVerificacao || !currentVerificacaoTipo) {
    toast('Nenhuma verificação selecionada.', 'error');
    return;
  }

  const motivo = $('ver_motivo_rejeicao')?.value?.trim();

  if (!motivo) {
    toast('Informe o motivo da rejeição.', 'error');
    return;
  }

  try {
    await putJSON(
      `/admin/dashboard/verificacoes/${currentVerificacaoTipo}/${currentVerificacao}`,
      {
        status: 'rejeitado',
        motivo_rejeicao: motivo,
        dados: coletarDadosModeloModal()
      }
    );

    toast('Verificação rejeitada', 'success');
    closeAllModals();
    pageLoaders.verificacoes();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

function coletarDadosModeloModal() {
  return {
    nome_exibicao: $('ver_nome_exibicao')?.value?.trim() || null,
    local: $('ver_local')?.value?.trim() || null,
    bio: $('ver_bio')?.value?.trim() || null,
    nome_completo: $('ver_nome_completo')?.value?.trim() || null,
    data_nascimento: $('ver_data_nascimento')?.value || null,
    telefone: $('ver_telefone')?.value?.trim() || null,
    endereco: $('ver_endereco')?.value?.trim() || null,
    pais: $('ver_pais')?.value?.trim() || null,
    estado: $('ver_estado')?.value?.trim() || null,
    cidade: $('ver_cidade')?.value?.trim() || null,
    vip_preco: $('ver_vip_preco')?.value || null,
    agencia_id: $('ver_agencia_id')?.value || null
  };
}

// ========== 7. LANÇAMENTOS BANCÁRIOS ==========

pageLoaders.lancamentos = function () {
  const now = new Date();
  const mesEl = $('lancMes');
  const anoEl = $('lancAno');
  if (!mesEl._init) {
    mesEl.value = now.getMonth() + 1;
    anoEl.value = now.getFullYear();
    mesEl._init = true;
  }
  carregarLancamentos();
};

let _lancViewAgrupado = false;

function toggleViewLancamentos() {
  _lancViewAgrupado = !_lancViewAgrupado;
  $('btnToggleView').textContent = _lancViewAgrupado ? '☰ Detalhado' : '▤ Agrupado';
  if (window._lancamentosData) renderLancamentos(window._lancamentosData);
}

function renderLancamentos(data) {
  const tbody = $('tableLancamentos').querySelector('tbody');
  const nomes = { repasse_gateway: 'Repasse Gateway', pagamento_modelo: 'Pgto Modelo', pagamento_agencia: 'Pgto Agência', despesa: 'Despesa', outro: 'Outro' };
  const cores = { entrada: '#22c55e', saida: '#ef4444' };

  if (_lancViewAgrupado) {
    const grupos = {};
    (data.rows || []).forEach(r => {
      const key = r.categoria;
      if (!grupos[key]) grupos[key] = { categoria: r.categoria, tipo: r.tipo, itens: [], total: 0 };
      grupos[key].itens.push(r);
      grupos[key].total += Number(r.valor);
    });
    tbody.innerHTML = Object.values(grupos).map(g => `
      <tr style="cursor:pointer;" onclick="expandirGrupo('${g.categoria}')">
        <td colspan="2" style="font-weight:600;">${nomes[g.categoria] || g.categoria}
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(${g.itens.length} item${g.itens.length > 1 ? 's' : ''})</span>
        </td>
        <td><span style="color:${cores[g.tipo]};font-weight:600;">${g.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}</span></td>
        <td></td>
        <td></td>
        <td style="font-weight:700;">${money(g.total)}</td>
        <td>—</td>
        <td><span style="font-size:11px;color:var(--primary);" id="seta-${g.categoria}">▼ ver</span></td>
      </tr>
      <tr id="grupo-${g.categoria}" style="display:none;background:var(--hover);">
        <td colspan="8" style="padding:0;">
          <table style="width:100%;border-collapse:collapse;">
            ${g.itens.map(r => `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:6px 16px;width:110px;color:var(--text-muted);font-size:13px;">${fmtDate(r.data)}</td>
              <td style="padding:6px 8px;font-size:13px;">${r.descricao}</td>
              <td style="padding:6px 8px;font-size:13px;">${r.banco ? r.banco.charAt(0).toUpperCase() + r.banco.slice(1) : (r.modelo_nome || '—')}</td>
              <td style="padding:6px 8px;font-weight:600;font-size:13px;">${money(r.valor)}</td>
              <td colspan="4" style="padding:6px 8px;">
                <button class="btn btn-sm" onclick="event.stopPropagation();editarLancamento(${r.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deletarLancamento(${r.id})">🗑</button>
              </td>
            </tr>`).join('')}
          </table>
        </td>
      </tr>
    `).join('') || emptyRow(8);
  } else {
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${fmtDate(r.data)}</td>
        <td>${r.descricao}</td>
        <td><span style="color:${cores[r.tipo]};font-weight:600;">${r.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}</span></td>
        <td>${nomes[r.categoria] || r.categoria}</td>
        <td>${r.banco ? r.banco.charAt(0).toUpperCase() + r.banco.slice(1) : (r.modelo_nome || '—')}</td>
        <td style="font-weight:600;">${money(r.valor)}</td>
        <td style="font-size:12px;color:var(--text-muted);">${r.observacao || '—'}</td>
        <td>
          <button class="btn btn-sm" onclick="editarLancamento(${r.id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deletarLancamento(${r.id})">🗑</button>
        </td>
      </tr>
    `).join('') || emptyRow(8);
  }
}

function expandirGrupo(categoria) {
  const row = $(`grupo-${categoria}`);
  const seta = $(`seta-${categoria}`);
  if (!row) return;
  const aberto = row.style.display !== 'none';
  row.style.display = aberto ? 'none' : '';
  if (seta) seta.textContent = aberto ? '▼ ver' : '▲ fechar';
}

async function carregarLancamentos() {
  const mes = $('lancMes').value;
  const ano = $('lancAno').value;
  try {
    const data = await fetchJSON(`/admin/dashboard/lancamentos-bancarios?mes=${mes}&ano=${ano}`);

    renderLancamentos(data);

    const t = data.totais || {};
    $('lancTotalEntradas').textContent = money(t.entradas);
    $('lancTotalModelos').textContent = money(t.modelos);
    $('lancTotalAgencias').textContent = money(t.agencias);
    $('lancTotalDespesas').textContent = money(t.despesas);
    $('lancTotalSaldo').textContent = money(t.saldo);
    $('lancTotalSaldo').style.color = t.saldo >= 0 ? '#22c55e' : '#ef4444';

    window._lancamentosData = data;
  } catch (err) { console.error('Erro lancamentos:', err); }
}

function abrirModalLancamento(dados) {
  const modal = $('modalLancamento');
  modal.style.display = 'flex';
  $('lancEditId').value = dados?.id || '';
  $('modalLancTitulo').textContent = dados ? 'Editar Lançamento' : 'Novo Lançamento';
  $('lancData').value = dados?.data ? dados.data.split('T')[0] : new Date().toISOString().split('T')[0];
  $('lancValor').value = dados?.valor || '';
  $('lancDescricao').value = dados?.descricao || '';
  $('lancTipo').value = dados?.tipo || 'entrada';
  $('lancCategoria').value = dados?.categoria || 'repasse_gateway';
  $('lancBanco').value = dados?.banco || '';
  $('lancModeloNome').value = dados?.modelo_nome || '';
  $('lancObservacao').value = dados?.observacao || '';
  atualizarCamposModal();
}

function fecharModalLancamento() {
  $('modalLancamento').style.display = 'none';
  [$('lancData'), $('lancValor'), $('lancDescricao')].forEach(el => {
    el.disabled = false;
    if (el.closest('div')) el.closest('div').style.opacity = '';
  });
  $('lancDespesaTotal').style.display = 'none';
}

function atualizarCamposModal() {
  const tipo = $('lancTipo').value;
  const cat = $('lancCategoria').value;

  // Filtra categorias por tipo
  const opcs = $('lancCategoria').options;
  for (const op of opcs) {
    if (tipo === 'entrada') op.hidden = op.value !== 'repasse_gateway' && op.value !== 'outro';
    else op.hidden = op.value === 'repasse_gateway';
  }
  if (tipo === 'entrada' && !['repasse_gateway','outro'].includes($('lancCategoria').value)) {
    $('lancCategoria').value = 'repasse_gateway';
  }
  if (tipo === 'saida' && $('lancCategoria').value === 'repasse_gateway') {
    $('lancCategoria').value = 'pagamento_modelo';
  }

  const catAtual = $('lancCategoria').value;
  $('campoBanco').style.display = catAtual === 'repasse_gateway' ? '' : 'none';
  $('campoModelo').style.display = catAtual === 'pagamento_modelo' ? '' : 'none';
  $('campoAgencia').style.display = catAtual === 'pagamento_agencia' ? '' : 'none';
  $('campoDespesa').style.display = catAtual === 'despesa' ? '' : 'none';
  if (catAtual === 'despesa') carregarDespesasSelect();
  if (catAtual === 'pagamento_agencia') carregarAgenciasSelect();
}

async function carregarAgenciasSelect() {
  const sel = $('lancAgenciaSelect');
  if (!sel) return;
  try {
    const rows = await fetchJSON('/admin/dashboard/agencias-list');
    sel.innerHTML = '<option value="">— Selecione —</option>' +
      (rows || []).map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
  } catch (e) { console.error('Erro ao carregar agências:', e); }
}

async function carregarDespesasSelect() {
  const dataVal = $('lancData').value;
  let mes, ano;
  if (dataVal) {
    const d = new Date(dataVal + 'T12:00:00');
    mes = d.getMonth() + 1;
    ano = d.getFullYear();
  } else {
    mes = $('lancMes').value;
    ano = $('lancAno').value;
  }
  const lista = $('lancDespesaLista');
  lista.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:4px;">Carregando...</div>';
  try {
    const rows = await fetchJSON(`/admin/dashboard/despesas-list?mes=${mes}&ano=${ano}`);
    if (!rows.length) {
      lista.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:4px;">Nenhuma despesa cadastrada neste mês.</div>';
      return;
    }
    lista.innerHTML = rows.map(r => {
      const dataFmt = (r.data||'').split('T')[0].split('-').reverse().join('/');
      const label = `${dataFmt} · ${r.categoria} — ${r.descricao} (${money(r.valor)})`;
      return `<label style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:13px;" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
        <input type="checkbox" value="${r.id}" data-descricao="${r.categoria} — ${r.descricao}" data-valor="${r.valor}" data-data="${(r.data||'').split('T')[0]}" onchange="atualizarTotalDespesas()" style="width:15px;height:15px;flex-shrink:0;">
        <span>${label}</span>
      </label>`;
    }).join('');
    atualizarTotalDespesas();
  } catch (e) { console.error('Erro ao carregar despesas:', e); }
}

function atualizarTotalDespesas() {
  const checks = $('lancDespesaLista').querySelectorAll('input[type=checkbox]:checked');
  const totalEl = $('lancDespesaTotal');
  const camposManual = [$('lancData'), $('lancValor'), $('lancDescricao')];
  if (checks.length > 0) {
    const total = Array.from(checks).reduce((s, c) => s + Number(c.dataset.valor), 0);
    totalEl.textContent = `${checks.length} selecionada(s) · Total: ${money(total)}`;
    totalEl.style.display = '';
    camposManual.forEach(el => { el.closest('div') && (el.closest('div').style.opacity = '0.4'); el.disabled = true; });
  } else {
    totalEl.style.display = 'none';
    camposManual.forEach(el => { el.closest('div') && (el.closest('div').style.opacity = ''); el.disabled = false; });
  }
}

async function salvarLancamento() {
  const id = $('lancEditId').value;
  const categoria = $('lancCategoria').value;

  // Modo multi-despesa: checkboxes marcados
  if (categoria === 'despesa' && !id) {
    const checks = Array.from($('lancDespesaLista').querySelectorAll('input[type=checkbox]:checked'));
    if (checks.length > 0) {
      try {
        for (const c of checks) {
          const d = new Date(c.dataset.data + 'T12:00:00');
          await postJSON('/admin/dashboard/lancamentos-bancarios', {
            data: c.dataset.data,
            descricao: c.dataset.descricao,
            tipo: 'saida',
            categoria: 'despesa',
            banco: null,
            modelo_nome: null,
            valor: parseFloat(c.dataset.valor),
            observacao: null,
            mes: d.getMonth() + 1,
            ano: d.getFullYear()
          });
        }
        // Ajusta o filtro para o mês dos dados salvos antes de recarregar
        const primeiraData = new Date(checks[0].dataset.data + 'T12:00:00');
        $('lancMes').value = primeiraData.getMonth() + 1;
        $('lancAno').value = primeiraData.getFullYear();
        toast(`${checks.length} lançamento(s) criado(s)!`, 'success');
        fecharModalLancamento();
        carregarLancamentos();
      } catch (err) { toast('Erro: ' + err.message, 'error'); }
      return;
    }
  }

  // Modo manual (lançamento único)
  const mes = parseInt($('lancMes').value);
  const ano = parseInt($('lancAno').value);
  const body = {
    data: $('lancData').value,
    descricao: $('lancDescricao').value.trim(),
    tipo: $('lancTipo').value,
    categoria,
    banco: $('lancBanco').value || null,
    modelo_nome: categoria === 'pagamento_agencia'
      ? ($('lancAgenciaSelect').options[$('lancAgenciaSelect').selectedIndex]?.text || null)
      : ($('lancModeloNome').value.trim() || null),
    valor: parseFloat($('lancValor').value),
    observacao: $('lancObservacao').value.trim() || null,
    mes, ano
  };
  if (!body.data || !body.descricao || !body.valor) {
    toast('Preencha data, descrição e valor', 'error'); return;
  }
  try {
    if (id) await putJSON(`/admin/dashboard/lancamentos-bancarios/${id}`, body);
    else await postJSON('/admin/dashboard/lancamentos-bancarios', body);
    toast('Lançamento salvo!', 'success');
    fecharModalLancamento();
    carregarLancamentos();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function editarLancamento(id) {
  const data = window._lancamentosData?.rows?.find(r => r.id === id);
  if (data) abrirModalLancamento(data);
}

async function deletarLancamento(id) {
  if (!confirm('Excluir este lançamento?')) return;
  try {
    await deleteJSON(`/admin/dashboard/lancamentos-bancarios/${id}`);
    toast('Lançamento excluído', 'success');
    carregarLancamentos();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

function imprimirRelatorio() {
  const data = window._lancamentosData;
  if (!data) { toast('Carregue os dados primeiro', 'error'); return; }

  const meses = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const nomes = { repasse_gateway: 'Repasse Gateway', pagamento_modelo: 'Pagamento de Modelo', despesa: 'Despesa', outro: 'Outro' };
  const t = data.totais;

  const linhas = {
    entradas: data.rows.filter(r => r.tipo === 'entrada'),
    modelos:  data.rows.filter(r => r.categoria === 'pagamento_modelo'),
    agencias: data.rows.filter(r => r.categoria === 'pagamento_agencia'),
    despesas: data.rows.filter(r => r.categoria === 'despesa'),
    outros:   data.rows.filter(r => r.tipo === 'saida' && !['pagamento_modelo','pagamento_agencia','despesa'].includes(r.categoria)),
  };

  const tabelaHtml = (rows) => rows.map(r => `
    <tr>
      <td>${fmtDate(r.data)}</td>
      <td>${r.descricao}${r.modelo_nome ? ' — ' + r.modelo_nome : ''}${r.banco ? ' (' + r.banco.charAt(0).toUpperCase() + r.banco.slice(1) + ')' : ''}</td>
      <td style="text-align:right;">${money(r.valor)}</td>
    </tr>
  `).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Relatório Velvet — ${meses[data.mes]}/${data.ano}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; font-size:13px; color:#111; padding:40px; }
      h1 { font-size:20px; margin-bottom:4px; }
      .sub { color:#666; font-size:12px; margin-bottom:32px; }
      h2 { font-size:14px; font-weight:700; margin:24px 0 8px; padding-bottom:4px; border-bottom:2px solid #111; }
      table { width:100%; border-collapse:collapse; }
      td, th { padding:6px 8px; border-bottom:1px solid #e5e7eb; }
      th { background:#f3f4f6; font-weight:600; font-size:12px; text-align:left; }
      .total-row td { font-weight:700; border-top:2px solid #111; background:#f9fafb; }
      .resumo { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin:32px 0; }
      .card { border:1px solid #e5e7eb; border-radius:8px; padding:16px; }
      .card-label { font-size:11px; color:#666; text-transform:uppercase; margin-bottom:4px; }
      .card-value { font-size:20px; font-weight:700; }
      .green { color:#16a34a; } .orange { color:#ea580c; } .red { color:#dc2626; } .purple { color:#6366f1; }
      @media print { body { padding:20px; } }
    </style>
  </head><body>
    <h1>Velvet — Relatório Financeiro</h1>
    <div class="sub">${meses[data.mes]} de ${data.ano} &nbsp;·&nbsp; Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>

    <div class="resumo">
      <div class="card"><div class="card-label">Entradas (Líquido Recebido)</div><div class="card-value green">${money(t.entradas)}</div></div>
      <div class="card"><div class="card-label">Pagamentos a Modelos</div><div class="card-value orange">${money(t.modelos)}</div></div>
      <div class="card"><div class="card-label">Pagamentos a Agências</div><div class="card-value" style="color:#a855f7">${money(t.agencias)}</div></div>
      <div class="card"><div class="card-label">Despesas Operacionais</div><div class="card-value red">${money(t.despesas)}</div></div>
      <div class="card"><div class="card-label">Saldo da Empresa</div><div class="card-value purple">${money(t.saldo)}</div></div>
    </div>

    ${linhas.entradas.length ? `<h2>Entradas</h2>
    <table><thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${tabelaHtml(linhas.entradas)}</tbody>
    <tfoot><tr class="total-row"><td colspan="2">Total Entradas</td><td style="text-align:right;">${money(t.entradas)}</td></tr></tfoot>
    </table>` : ''}

    ${linhas.modelos.length ? `<h2>Pagamentos a Modelos</h2>
    <table><thead><tr><th>Data</th><th>Modelo</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${tabelaHtml(linhas.modelos)}</tbody>
    <tfoot><tr class="total-row"><td colspan="2">Total Modelos</td><td style="text-align:right;">${money(t.modelos)}</td></tr></tfoot>
    </table>` : ''}

    ${linhas.agencias.length ? `<h2>Pagamentos a Agências</h2>
    <table><thead><tr><th>Data</th><th>Agência</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${tabelaHtml(linhas.agencias)}</tbody>
    <tfoot><tr class="total-row"><td colspan="2">Total Agências</td><td style="text-align:right;">${money(t.agencias)}</td></tr></tfoot>
    </table>` : ''}

    ${linhas.despesas.length ? `<h2>Despesas Operacionais</h2>
    <table><thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${tabelaHtml(linhas.despesas)}</tbody>
    <tfoot><tr class="total-row"><td colspan="2">Total Despesas</td><td style="text-align:right;">${money(t.despesas)}</td></tr></tfoot>
    </table>` : ''}

    ${linhas.outros.length ? `<h2>Outros</h2>
    <table><thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${tabelaHtml(linhas.outros)}</tbody>
    <tfoot><tr class="total-row"><td colspan="2">Total Outros</td><td style="text-align:right;">${money(t.outros)}</td></tr></tfoot>
    </table>` : ''}

    <script>window.print();<\/script>
  </body></html>`);
  win.document.close();
}

// ========== 8. FECHAMENTO ==========

const MESES_NOMES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

pageLoaders.fechamento = function () {
  const now = new Date();
  if (!$('fechMes')._init) {
    $('fechMes').value = now.getMonth() + 1;
    $('fechMes')._init = true;
  }
  carregarFechamento();
};

async function carregarFechamento() {
  const mes = $('fechMes').value;
  const ano = $('fechAno').value;
  try {
    const d = await fetchJSON(`/admin/dashboard/fechamento/detalhe/${ano}/${mes}`);
    window._fechamentoAtual = d;
    renderFechamento(d);
  } catch (err) {
    $('fechamentoDetalhe').style.display = 'none';
    $('fechamentoVazio').style.display = '';
    $('fechamentoVazio').innerHTML = `Nenhum fechamento encontrado para ${MESES_NOMES[mes]}/${ano}. <br><button class="btn btn-primary" style="margin-top:10px" onclick="criarFechamento()">+ Criar agora</button>`;
  }
}

function renderFechamento(d) {
  const f = d.fechamento;
  $('fechamentoVazio').style.display = 'none';
  $('fechamentoDetalhe').style.display = '';
  $('fechObservacoes').value = f.observacoes || '';
  const btnImprimir = $('btnImprimirFechamento');
  if (btnImprimir) btnImprimir.style.display = '';

  const row = (label, val, cor) =>
    `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);">
      <span style="color:var(--text-muted);font-size:13px;">${label}</span>
      <span style="font-weight:600;${cor ? 'color:'+cor : ''}">${money(val)}</span>
    </div>`;

  const sep = (label, val, cor) =>
    `<div style="display:flex;justify-content:space-between;padding:7px 0;margin-top:4px;">
      <span style="font-weight:700;font-size:14px;">${label}</span>
      <span style="font-weight:700;font-size:15px;${cor ? 'color:'+cor : ''}">${money(val)}</span>
    </div>`;

  // ── PLATAFORMA ─────────────────────────────────────────────────────────────
  const brutoExpandId = 'fechBrutoDetalhe';
  $('fechPlataforma').innerHTML =
    // Bruto processado (expansível)
    `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="document.getElementById('${brutoExpandId}').style.display=document.getElementById('${brutoExpandId}').style.display==='none'?'block':'none'">
      <span style="color:var(--text-muted);font-size:13px;">▶ Bruto processado</span>
      <span style="font-weight:600;">${money(f.total_bruto)}</span>
    </div>
    <div id="${brutoExpandId}" style="display:none;padding:4px 0 4px 14px;">
      ${row('Assinaturas', f.total_assinaturas)}
      ${row('Mídias', f.total_midias)}
    </div>` +
    row('(+) Taxa gateway coletada', f.total_taxas, '#22c55e') +
    row('(+) Fee Velvet', f.total_velvet, '#6366f1') +
    row('(-) Fees agências', f.total_agency, '#ef4444') +
    row('(-) Repasse modelos', f.total_modelos, '#f97316');

  // ── SAÍDAS ──────────────────────────────────────────────────────────────────
  const cb = d.chargebacks;
  $('fechSaidas').innerHTML =
    row(`(-) Chargebacks (${cb.qtd} ocorr.)`, cb.total, '#ef4444') +
    row('(-) Despesas bancárias', d.banco.despesas, '#ef4444');

  // Listas dinâmicas de ajustes
  const taxas = (d.ajustes || []).filter(a => a.tipo === 'taxa_gateway');
  const retencoes = (d.ajustes || []).filter(a => a.tipo === 'retencao');

  const renderAjusteLista = (items) => items.map(a =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px;">
      <span style="color:var(--text-muted);flex:1;">${a.descricao}</span>
      <span style="font-weight:600;margin:0 8px;">${money(a.valor)}</span>
      <button onclick="deletarAjuste(${a.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;padding:0;">×</button>
    </div>`
  ).join('') || `<div style="font-size:12px;color:var(--text-muted);padding:3px 0;">Nenhuma entrada</div>`;

  $('listaFechTaxas').innerHTML = renderAjusteLista(taxas);
  $('listaFechRetencoes').innerHTML = renderAjusteLista(retencoes);

  // ── BANCO ────────────────────────────────────────────────────────────────────
  const b = d.banco;
  $('fechBanco').innerHTML =
    row('(+) Entradas recebidas', b.entradas, '#22c55e') +
    row('(-) Pago modelos', b.modelos, '#f97316') +
    row('(-) Pago agências', b.agencias, '#a855f7') +
    row('(-) Despesas lançadas', b.despesas, '#ef4444') +
    sep('Saldo banco (disponível real)', b.saldo, b.saldo >= 0 ? '#22c55e' : '#ef4444');

  // ── CONCILIAÇÃO ─────────────────────────────────────────────────────────────
  const diff = d.diferenca; // banco.saldo - velvet_liquido
  const difInexplicada = diff + d.total_retencoes; // se ≈ 0, retidos explicam tudo
  const diffColor = Math.abs(difInexplicada) < 100 ? '#22c55e' : (difInexplicada < 0 ? '#ef4444' : '#f97316');
  const diffMsg = Math.abs(difInexplicada) < 100
    ? '✅ Os valores retidos/bloqueados explicam toda a diferença.'
    : difInexplicada < 0
      ? `⚠️ Ainda faltam ${money(Math.abs(difInexplicada))} não explicados — há retenções não lançadas ou taxas adicionais.`
      : `ℹ️ O banco tem ${money(difInexplicada)} a mais que o esperado após retenções.`;

  const blk = (title) =>
    `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:10px 0 4px;">${title}</div>`;

  $('fechConciliacao').innerHTML =
    // Bloco 1: Velvet líquido estimado
    blk('1. O que a Velvet deveria ter ficado') +
    row('(+) Fee Velvet', f.total_velvet, '#6366f1') +
    row('(+) Taxa gateway coletada', f.total_taxas, '#22c55e') +
    row('(-) Taxas reais pagas aos gateways', d.total_taxas_reais, '#ef4444') +
    row(`(-) Chargebacks (${d.chargebacks.qtd})`, d.chargebacks.total, '#ef4444') +
    row('(-) Despesas bancárias', b.despesas, '#ef4444') +
    sep('= Velvet líquido estimado', d.velvet_liquido, d.velvet_liquido >= 0 ? '#6366f1' : '#ef4444') +

    // Bloco 2: O que ficou no banco
    blk('2. O que ficou no banco') +
    row('(+) Entradas recebidas', b.entradas, '#22c55e') +
    row('(-) Pago a modelos', b.modelos, '#f97316') +
    row('(-) Pago a agências', b.agencias, '#a855f7') +
    row('(-) Despesas bancárias', b.despesas, '#ef4444') +
    sep('= Saldo banco (disponível real)', b.saldo, b.saldo >= 0 ? '#22c55e' : '#ef4444') +

    // Bloco 3: Reconciliação de repasses (plataforma vs banco)
    (() => {
      const dModelos  = b.modelos - Number(f.total_modelos);   // + banco pagou mais; - banco pagou menos
      const dAgencias = b.agencias - Number(f.total_agency);
      const repRow = (label, plat, banco, delta) => {
        const cor = Math.abs(delta) < 5 ? '#22c55e' : Math.abs(delta) < 100 ? '#f59e0b' : '#ef4444';
        const sinal = delta >= 0 ? '+' : '';
        return `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:4px 12px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;">
          <span style="color:var(--text-muted);">${label}</span>
          <span style="text-align:right;color:#888;">plat: <b>${money(plat)}</b></span>
          <span style="text-align:right;color:#555;">banco: <b>${money(banco)}</b></span>
          <span style="text-align:right;font-weight:700;color:${cor};">${sinal}${money(Math.abs(delta))}</span>
        </div>`;
      };
      return blk('3. Reconciliação de repasses (plataforma vs banco)') +
        repRow('Modelos', f.total_modelos, b.modelos, dModelos) +
        repRow('Agências', f.total_agency, b.agencias, dAgencias) +
        `<div style="font-size:11px;color:var(--text-muted);padding:6px 2px;line-height:1.6;">
          Diferença esperada quando chargebacks são registrados após o pagamento às modelos/agências,
          ou quando há repasses de meses anteriores. Não é erro — é a diferença entre o calculado e o pago.
        </div>`;
    })() +

    // Bloco 4: Diferença e explicação pelos retidos
    blk('4. Diferença e conciliação') +
    row('Saldo banco', b.saldo) +
    row('(-) Velvet líquido estimado', d.velvet_liquido, '#6366f1') +
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border);">
      <span style="font-weight:600;font-size:13px;color:var(--text-muted);">Diferença bruta</span>
      <span style="font-weight:600;color:${diff < 0 ? '#ef4444' : '#22c55e'};">${money(diff)}</span>
    </div>` +
    row(`(+) Retido/bloqueado nos gateways (${retencoes.length} lançamento${retencoes.length !== 1 ? 's' : ''})`, d.total_retencoes, '#f97316') +
    `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid var(--border);margin-top:4px;">
      <span style="font-weight:800;font-size:14px;">Diferença inexplicada</span>
      <span style="font-weight:800;font-size:15px;color:${diffColor};">${money(difInexplicada)}</span>
    </div>` +
    `<div style="font-size:12px;margin-top:6px;padding:8px 10px;border-radius:6px;background:var(--bg-secondary);line-height:1.5;">${diffMsg}</div>`;

  // ── ANÁLISE ─────────────────────────────────────────────────────────────────
  const tipoStyle = {
    ok:      { bg:'#f0fdf4', border:'#22c55e', icon:'✅', color:'#15803d' },
    aviso:   { bg:'#fffbeb', border:'#f59e0b', icon:'⚠️', color:'#92400e' },
    alerta:  { bg:'#fef2f2', border:'#ef4444', icon:'🚨', color:'#991b1b' },
    critico: { bg:'#fef2f2', border:'#dc2626', icon:'🔴', color:'#7f1d1d' },
    info:    { bg:'#f0f9ff', border:'#3b82f6', icon:'ℹ️', color:'#1e40af' },
  };

  const alertasHtml = (d.analise && d.analise.length)
    ? d.analise.map(a => {
        const s = tipoStyle[a.tipo] || tipoStyle.info;
        return `<div style="padding:10px 14px;border-radius:8px;border-left:4px solid ${s.border};background:${s.bg};color:${s.color};line-height:1.5;font-size:13px;">${s.icon} ${a.texto}</div>`;
      }).join('')
    : `<div style="color:var(--text-muted);font-size:13px;">Sem alertas — dados dentro do esperado.</div>`;

  // Distribuição financeira recomendada
  let distribHtml = '';
  if (d.distrib && d.distrib.base > 0) {
    const dist = d.distrib;
    distribHtml = `
      <div style="margin-top:16px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);padding:8px 0 10px;">Distribuição recomendada do líquido Velvet</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="padding:12px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;">
            <div style="font-size:11px;color:#15803d;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">🏦 Caixa / Reserva empresa</div>
            <div style="font-size:18px;font-weight:700;color:#15803d;margin:4px 0;">${money(dist.caixa)}</div>
            <div style="font-size:11px;color:#166534;">20% — meta: 3–6 meses de despesas em caixa</div>
          </div>
          <div style="padding:12px;border-radius:10px;background:#faf5ff;border:1px solid #e9d5ff;">
            <div style="font-size:11px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">💼 Pró-labore (sócia/dona)</div>
            <div style="font-size:18px;font-weight:700;color:#7c3aed;margin:4px 0;">${money(dist.prolabore)}</div>
            <div style="font-size:11px;color:#6d28d9;">50% — remuneração mensal da empresa</div>
          </div>
          <div style="padding:12px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;">
            <div style="font-size:11px;color:#c2410c;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">🔄 Reinvestimento</div>
            <div style="font-size:18px;font-weight:700;color:#c2410c;margin:4px 0;">${money(dist.reinvestimento)}</div>
            <div style="font-size:11px;color:#9a3412;">15% — marketing, infra, melhorias</div>
          </div>
          <div style="padding:12px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;">
            <div style="font-size:11px;color:#1d4ed8;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">📈 Investimento longo prazo</div>
            <div style="font-size:18px;font-weight:700;color:#1d4ed8;margin:4px 0;">${money(dist.investimento)}</div>
            <div style="font-size:11px;color:#1e40af;">15% — mínimo 10% — patrimônio pessoal</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:8px;padding:0 2px;">
          Base: ${money(dist.base)} saldo banco real · Percentuais são referência — ajuste conforme mês e metas pessoais.
        </div>
      </div>`;
  }

  $('fechAnalise').innerHTML = alertasHtml + distribHtml;
}

function imprimirFechamento() {
  const d = window._fechamentoAtual;
  if (!d) return;
  const f = d.fechamento;
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const titulo = `Fechamento Mensal — ${meses[f.mes - 1]} / ${f.ano}`;

  const secPlat  = $('fechPlataforma')?.innerHTML || '';
  const secSaidas = $('fechSaidas')?.innerHTML || '';
  const secTaxas  = $('listaFechTaxas')?.innerHTML || '';
  const secRet    = $('listaFechRetencoes')?.innerHTML || '';
  const secBanco  = $('fechBanco')?.innerHTML || '';
  const secConc   = $('fechConciliacao')?.innerHTML || '';
  const secAnal   = $('fechAnalise')?.innerHTML || '';
  const obs       = $('fechObservacoes')?.value?.trim() || '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 32px 40px; }
    h1 { font-size: 22px; font-weight: 800; color: #6f42c1; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #888; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .card { border: 1px solid #e5e5f0; border-radius: 10px; padding: 16px; break-inside: avoid; }
    .card h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #888; margin-bottom: 12px; font-weight: 700; }
    .full { grid-column: 1 / -1; }
    /* neutraliza cores inline do DOM */
    div { line-height: 1.5; }
    /* botões e inputs: esconder */
    button, input, textarea, select { display: none !important; }
    /* separadores de totais */
    .sep-row { border-top: 2px solid #e5e5f0 !important; }
    .obs-box { background: #f8f7ff; border: 1px solid #e0d9ff; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #444; margin-top: 8px; white-space: pre-wrap; }
    .no-print { display: none !important; }
    .footer { margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px; font-size: 11px; color: #bbb; text-align: right; }
    @media print {
      body { padding: 16px 20px; }
      .card { border: 1px solid #ccc; }
    }
  </style>
</head>
<body>
  <h1>Velvet — ${titulo}</h1>
  <div class="subtitle">Gerado em ${new Date().toLocaleString('pt-BR')} · Documento interno — não compartilhar</div>

  <div class="grid">
    <div class="card">
      <h4>Plataforma — Processado</h4>
      ${secPlat}
    </div>
    <div class="card">
      <h4>Saídas &amp; Deduções</h4>
      ${secSaidas}
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid #eee;">
        <div style="font-size:10px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Taxas reais dos gateways</div>
        ${secTaxas}
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid #eee;">
        <div style="font-size:10px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Valores retidos / bloqueados</div>
        ${secRet}
      </div>
    </div>
    <div class="card">
      <h4>Conta Bancária — Real</h4>
      ${secBanco}
    </div>
    <div class="card">
      <h4>Conciliação</h4>
      ${secConc}
      ${obs ? `<div class="obs-box"><strong>Observações:</strong> ${obs}</div>` : ''}
    </div>
    <div class="card full">
      <h4>Análise</h4>
      ${secAnal}
    </div>
  </div>

  <div class="footer">Velvet App · Fechamento ${meses[f.mes - 1]}/${f.ano} · Uso interno</div>

  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1000,height=800');
  win.document.write(html);
  win.document.close();
}

async function salvarObservacoes() {
  const d = window._fechamentoAtual;
  if (!d) return;
  try {
    await putJSON(`/admin/dashboard/fechamento/${d.fechamento.id}`, {
      observacoes: $('fechObservacoes').value.trim() || null
    });
    toast('Observações salvas!', 'success');
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function adicionarAjuste(tipo) {
  const d = window._fechamentoAtual;
  if (!d) return;
  const isTaxa = tipo === 'taxa_gateway';
  const descEl = isTaxa ? $('novaFechTaxaDesc') : $('novaFechRetDesc');
  const valEl  = isTaxa ? $('novaFechTaxaValor') : $('novaFechRetValor');
  const desc = descEl.value.trim();
  const valor = parseFloat(valEl.value);
  if (!desc || !valor) return toast('Preencha descrição e valor', 'error');
  try {
    await postJSON('/admin/dashboard/fechamento-ajustes', {
      fechamento_id: d.fechamento.id, tipo, descricao: desc, valor,
    });
    descEl.value = '';
    valEl.value = '';
    toast('Adicionado!', 'success');
    carregarFechamento();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function deletarAjuste(id) {
  try {
    await fetch(`/admin/dashboard/fechamento-ajustes/${id}`, { method: 'DELETE' });
    toast('Removido!', 'success');
    carregarFechamento();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function recalcularFechamento() {
  const d = window._fechamentoAtual;
  if (!d) { toast('Carregue um fechamento primeiro', 'error'); return; }
  if (!confirm('Recalcular os totais com os dados atuais da plataforma e despesas?')) return;
  try {
    await postJSON(`/admin/dashboard/fechamento/${d.fechamento.id}/recalcular`, {});
    toast('Recalculado!', 'success');
    carregarFechamento();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function criarFechamento() {
  const mes = parseInt($('fechMes').value);
  const ano = parseInt($('fechAno').value);
  if (!confirm(`Criar fechamento de ${MESES_NOMES[mes]}/${ano}?`)) return;
  try {
    await postJSON('/admin/dashboard/fechamento', { ano, mes });
    toast('Fechamento criado!', 'success');
    carregarFechamento();
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
    const [data, agencias] = await Promise.all([
      fetchJSON('/admin/dashboard/modelos/' + id),
      fetchJSON('/admin/dashboard/agencias')
    ]);

    openEditModal('Editar Modelo #' + id, '/admin/dashboard/modelos/' + id, 'PUT', [
      { name: 'nome', label: 'Nome', value: data.nome || '' },
      { name: 'nome_exibicao', label: 'Nome Exibição', value: data.nome_exibicao || '' },
      { name: 'verificada', label: 'Verificada', type: 'checkbox', value: !!data.verificada },
      { name: 'feed', label: 'No Feed', type: 'checkbox', value: !!data.feed },
      { name: 'bio', label: 'Bio', type: 'textarea', value: data.bio || '' },
      { name: 'local', label: 'Local', value: data.local || '' },

      {
        name: 'agencia_id',
        label: 'Agência',
        type: 'select',
        value: data.agencia_id ?? '',
        options: [
          { value: '', label: 'Sem agência' },
          ...(agencias || []).map(ag => ({
            value: ag.id,
            label: ag.nome
          }))
        ]
      },

      {
        name: 'created_at_view',
        label: 'Criado em',
        value: fmtDateTime(data.created_at),
        disabled: true
      },

      { name: 'ativo', label: 'Ativo', type: 'checkbox', value: !!data.ativo }
    ], () => carregarModelos(1));

  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
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

async function carregarAgenciasSelect(selectId, agenciaIdAtual = null) {
  try {
    const data = await fetchJSON('/admin/dashboard/agencias');
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = `
      <option value="">Sem agência</option>
      ${(data || []).map(ag => `
        <option value="${ag.id}" ${String(ag.id) === String(agenciaIdAtual) ? 'selected' : ''}>
          ${ag.nome}
        </option>
      `).join('')}
    `;
  } catch (err) {
    console.error('Erro carregar agências:', err);
  }
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
      ? `/admin/dashboard/ranking?mes=${encodeURIComponent(mes)}`
      : '/admin/dashboard/ranking';

    const data = await fetchJSON(url);

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

// ========== 11. FINANCEIRO (RASTREIO) ==========

pageLoaders.financeiro = function () {
  popularSelectMesFinanceiro(12);

  const select = document.getElementById('selectMesFinanceiro');
  if (select && !select.dataset.bound) {
    select.addEventListener('change', recarregarAbaFinanceiroAtual);
    select.dataset.bound = '1';
  }

  carregarCartao(1);
};

function makeFinLoader(endpoint, tableId, paginationId, mapper, fnName) {
  window[fnName] = async function (page) {
    try {
      const mes = document.getElementById('selectMesFinanceiro')?.value || '';
      let url = `/admin/dashboard/${endpoint}?page=${page}&limit=20`;
      if (mes) url += `&mes=${encodeURIComponent(mes)}`;

      const data = await fetchJSON(url);
      const tbody = document.getElementById(tableId).querySelector('tbody');
      tbody.innerHTML = (data.rows || []).map(mapper).join('') || emptyRow(8);
      buildPagination(paginationId, page, data.totalPages || 1, fnName);
    } catch (err) {
      console.error(`Erro ${endpoint}:`, err);
    }
  };
}

makeFinLoader('pagamentos-cartao', 'tableCartao', 'paginationCartao', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.cliente_id}</td>
    <td>${r.modelo_id || '—'}</td>
    <td>${money(r.valor)}</td>
    <td>${r.tipo || '—'}</td>
    <td>${r.status === 'falhou' ? (r.motivo_recusa || '—') : '—'}</td>
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

makeFinLoader('stripe-events', 'tableStripe', 'paginationStripe', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.type || '—'}</td>
    <td>${fmtDateTime(r.created_at)}</td>
  </tr>
`, 'carregarStripeEvents');

makeFinLoader('safe2pay-events', 'tableSafe2pay', 'paginationSafe2pay', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.cliente_id ?? '—'}</td>
    <td>${r.modelo_id ?? '—'}</td>
    <td>${r.type || '—'}</td>
    <td>${fmtDateTime(r.created_at)}</td>
  </tr>
`, 'carregarSafe2payEvents');

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
    <td>${money(r.valor_base)}</td>
    <td>${badgeStatus(r.status)}</td>
    <td>${r.metodo_pagamento || '—'}</td>
    <td>${fmtDateTime(r.created_at)}</td>
  </tr>
`, 'carregarPremium');

makeFinLoader('vip-subscriptions', 'tableVips', 'paginationVips', r => `
  <tr>
    <td>${r.id}</td>
    <td>${r.modelo_id}</td>
    <td>${r.cliente_id}</td>
    <td>${money(r.valor_assinatura)}</td>
    <td>${badgeStatus(r.ativo ? 'ativo' : 'inativo')}</td>
    <td>${r.gateway_subscription_id || '—'}</td>
    <td>${fmtDateTime(r.updated_at)}</td>
  </tr>
`, 'carregarVips');

const tabLoaderMap = {
  'fin-cartao':     'carregarCartao',
  'fin-pix':        'carregarPix',
  'fin-stripe':     'carregarStripeEvents',
  'fin-safe2pay':   'carregarSafe2payEvents',
  'fin-pacotes':    'carregarPacotes',
  'fin-premium':    'carregarPremium',
  'fin-vips':       'carregarVips'
};

document.querySelectorAll('#financeiroTabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#financeiroTabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Alterna conteúdo visível
    document.querySelectorAll('#page-financeiro .tab-content').forEach(c => c.classList.remove('active'));
    const content = document.getElementById(`tab-${tab.dataset.tab}`);
    if (content) content.classList.add('active');

    const fn = tabLoaderMap[tab.dataset.tab];
    if (fn && window[fn]) window[fn](1);
  });
});


function popularSelectMesFinanceiro(qtdMeses = 12) {
  const select = document.getElementById('selectMesFinanceiro');
  if (!select) return;

  const hoje = new Date();
  let html = `<option value="">Todos os meses</option>`;

  for (let i = 0; i < qtdMeses; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    html += `<option value="${ano}-${mes}">${mes}/${ano}</option>`;
  }

  select.innerHTML = html;
}

function recarregarAbaFinanceiroAtual() {
  const aba = document.querySelector('#financeiroTabs .tab.active')?.dataset.tab;
  const fn = tabLoaderMap[aba];
  if (fn && window[fn]) window[fn](1);
}

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
    const modeloSelect = $('transacoesModelo');
    const modelo = modeloSelect.value;
    const modeloNome = modelo ? (modeloSelect.options[modeloSelect.selectedIndex]?.textContent || ('#' + modelo)) : 'Acumulado (todas)';
    const mes = $('transacoesMes').value;
    const data = await fetchJSON(`/admin/dashboard/transacoes-agency?page=${page}&limit=31&modelo_id=${modelo}&mes=${mes}`);

    $('kpi-bruto').textContent = money(data.totais?.bruto);
    $('kpi-modelo').textContent = money(data.totais?.modelo);
    $('kpi-velvet').textContent = money(data.totais?.velvet);
    $('kpi-agency').textContent = money(data.totais?.agency);
    $('kpi-gateway').textContent = money(data.totais?.gateway);
    $('kpi-chargebacks').textContent = money(data.totais?.chargebacks);

    const tbody = $('tableTransacoes').querySelector('tbody');
    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${fmtDate(r.dia)}</td>
        <td>${modeloNome}</td>
        <td>${money(r.ganhos_dia)}</td>
        <td>${money(r.ganhos_modelo)}</td>
        <td>${money(r.ganhos_velvet)}</td>
        <td>${money(r.ganhos_agencia)}</td>
        <td>${money(r.ganhos_gateway)}</td>
      </tr>
    `).join('') || emptyRow(7);
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
    const tbody = document.getElementById('tablePassword').querySelector('tbody');
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

async function submitResetSenha() {
  const identifier = document.getElementById('resetUserIdentifier').value.trim();
  const nova_senha = document.getElementById('resetNovaSenha').value;
  const msg = document.getElementById('resetSenhaMensagem');
  msg.textContent = '';

  if (!identifier) {
    msg.textContent = 'Informe o User ID ou e-mail.';
    return;
  }

  if (!nova_senha || nova_senha.length < 6) {
    msg.textContent = 'Senha deve ter no mínimo 6 caracteres.';
    return;
  }

  const isEmail = identifier.includes('@');
  const body = isEmail
    ? { email: identifier, nova_senha }
    : { user_id: Number(identifier), nova_senha };

  try {
    const data = await postJSON('/admin/dashboard/password-reset', body);

    closeModal('modalResetSenha');
    document.getElementById('resetUserIdentifier').value = '';
    document.getElementById('resetNovaSenha').value = '';
    msg.textContent = '';

    alert(data?.mensagem || 'Senha resetada com sucesso!');
    carregarPasswordResets(1);
  } catch (err) {
    msg.textContent = err.message || 'Erro ao resetar senha.';
    console.error('Erro reset senha:', err);
  }
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
    const data = await fetchJSON(`/admin/dashboard/vips?page=${page}&limit=20&busca=${encodeURIComponent(busca)}`);
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
  populateMonthSelect($('pgtoModeloMes'));
  await carregarPgtoModelo(1);
  $('pgtoModeloFiltro').onchange = () => carregarPgtoModelo(1);
  $('pgtoModeloMes').onchange = () => carregarPgtoModelo(1);
};

async function carregarModelosSelect(selectId, placeholder = 'Todos os modelos') {
  try {
    const data = await fetchJSON('/admin/dashboard/modelos-select');
    const select = $(selectId);

    if (!select) return;

    select.innerHTML = `
      <option value="">${placeholder}</option>
      ${(data || []).map(m => `
        <option value="${m.id}">
          ${m.nome_exibicao || m.nome || `Modelo #${m.id}`}
        </option>
      `).join('')}
    `;
  } catch (err) {
    console.error('Erro ao carregar modelos no select:', err);
  }
}

async function carregarPgtoModelo(page) {
  try {
    const modelo = $('pgtoModeloFiltro')?.value || '';
    const mes = $('pgtoModeloMes')?.value || '';

    const data = await fetchJSON(
      `/admin/dashboard/modelo-pagamentos?page=${page}&limit=20&modelo_id=${encodeURIComponent(modelo)}&mes=${encodeURIComponent(mes)}`
    );

    const tbody = $('tablePgtoModelo').querySelector('tbody');

    tbody.innerHTML = (data.rows || []).map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.nome_exibicao || r.modelo_nome || 'Modelo #' + r.modelo_id}</td>
        <td>${fmtDate(r.mes)}</td>
        <td>${money(r.total_midias)}</td>
        <td>${money(r.total_assinaturas)}</td>
        <td>${money(r.total_geral)}</td>
        <td>${badgeStatus(r.status)}</td>
        <td>${fmtDateTime(r.pago_em)}</td>
        <td>
          ${r.comprovativo_signed_url
            ? `<a href="${r.comprovativo_signed_url}" target="_blank" class="btn btn-sm btn-ghost">🧾 Ver</a>`
            : `<span class="badge badge-muted">—</span>`}
        </td>
        <td>
          ${r.status !== 'pago'
            ? `<button class="btn btn-sm btn-success" onclick="marcarPgtoModeloPago(${r.id})">Marcar pago</button>`
            : ''}
          <button class="btn btn-sm btn-ghost" onclick="abrirRecibo(${r.id})" title="Abrir recibo HTML">🖨️</button>
          <button class="btn btn-sm btn-ghost" onclick="editarPgtoModelo(${r.id})">Editar</button>
        </td>
      </tr>
    `).join('') || emptyRow(10);

    buildPagination('paginationPgtoModelo', page, data.totalPages || 1, 'carregarPgtoModelo');
  } catch (err) {
    console.error('Erro pgto modelo:', err);
  }
}

async function carregarSaldoPagModelo() {
  try {
    const modeloId = $('pagModeloId').value;

    if (!modeloId) {
      $('saldoDisponivelPgModelo').textContent = '—';
      return;
    }

    const data = await fetchJSON(`/admin/dashboard/modelo-pagamentos/saldo/${modeloId}`);
    $('saldoDisponivelPgModelo').textContent = money(data.saldo);
  } catch (err) {
    console.error('Erro saldo pgto modelo:', err);
    $('saldoDisponivelPgModelo').textContent = '—';
  }
}

function atualizarTotalPagModelo() {
  const midias = Number($('pagamentoTotalMidias').value || 0);
  const assinaturas = Number($('pagamentoTotalAssinaturas').value || 0);
  $('pagamentoTotalGeral').value = (midias + assinaturas).toFixed(2);
}

async function salvarPagModelo(e) {
  e.preventDefault();

  try {
    const form = $('formPagModelo');
    const formData = new FormData(form);

    const modeloId = Number(formData.get('modelo_id'));
    const midias = Number(formData.get('total_midias') || 0);
    const assinaturas = Number(formData.get('total_assinaturas') || 0);
    let total = Number(formData.get('total_geral') || 0);

    if (!modeloId) {
      toast('Selecione uma modelo', 'error');
      return;
    }

    if (!total) {
      total = midias + assinaturas;
      formData.set('total_geral', total);
    }

    const resSaldo = await fetchJSON(`/admin/dashboard/modelo-pagamentos/saldo/${modeloId}`);

    if (total > Number(resSaldo.saldo || 0)) {
      toast(`Saldo insuficiente. Disponível: ${money(resSaldo.saldo)}`, 'error');
      return;
    }

    const res = await authFetch('/admin/dashboard/modelo-pagamentos', {
      method: 'POST',
      body: formData
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.erro || data.message || `HTTP ${res.status}`);
    }

    toast('Pagamento registrado! Abrindo recibo...', 'success');
    closeAllModals();
    form.reset();
    $('saldoDisponivelPgModelo').textContent = '—';
    carregarPgtoModelo(1);

    if (data.id) {
      abrirRecibo(data.id);
    }
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

async function editarPgtoModelo(id) {
  try {
    const data = await fetchJSON('/admin/dashboard/modelo-pagamentos/' + id);
    openEditModal('Editar Pagamento #' + id, '/admin/dashboard/modelo-pagamentos/' + id, 'PUT', [
      { name: 'total_midias', label: 'Total Mídias', type: 'number', value: data.total_midias },
      { name: 'total_assinaturas', label: 'Total Assinaturas', type: 'number', value: data.total_assinaturas },
      { name: 'total_geral', label: 'Total Geral', type: 'number', value: data.total_geral },
      { name: 'status', label: 'Status', type: 'select', value: data.status, options: ['pendente', 'pago'] },
      { name: 'recibo_url', label: 'Recibo URL', value: data.recibo_url || '' }
    ], () => carregarPgtoModelo(1));
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
}

// ── Pré-visualização antes de marcar como pago ──────────────────────────────
let _pagamentoIdPendente = null;

function marcarPgtoModeloPago(id) {
  _pagamentoIdPendente = id;

  // Carregar pré-visualização no iframe — token via query param porque iframes não enviam headers
  const iframe = document.getElementById('iframePreviewRecibo');
  const btn    = document.getElementById('btnConfirmarPagamento');

  const tk = localStorage.getItem('token_admin') || '';
  if (iframe) iframe.src = `/admin/dashboard/modelo-pagamentos/${id}/recibo?token=${encodeURIComponent(tk)}`;
  if (btn)    btn.disabled = false;

  openModal('modalPreviewRecibo');
}

function fecharPreviewRecibo() {
  const iframe = document.getElementById('iframePreviewRecibo');
  if (iframe) iframe.src = '';
  _pagamentoIdPendente = null;
  closeModal('modalPreviewRecibo');
}

async function confirmarPagamentoComEmail() {
  const id = _pagamentoIdPendente;
  if (!id) return;

  const btn = document.getElementById('btnConfirmarPagamento');
  if (btn) { btn.disabled = true; btn.textContent = 'A processar...'; }

  // Abrir janela ANTES da chamada async — evita bloqueio de popup
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`
      <html><body style="font-family:sans-serif;padding:60px 40px;color:#555;text-align:center;">
        <div style="font-size:32px;margin-bottom:16px;">💜</div>
        <p style="font-size:16px;">A processar pagamento e gerar recibo PDF...</p>
      </body></html>
    `);
  }

  try {
    const data = await postJSON(`/admin/dashboard/modelo-pagamentos/${id}/pagar`, {});

    fecharPreviewRecibo();
    toast('Pagamento confirmado! Recibo enviado por email à modelo.', 'success');
    carregarPgtoModelo(1);

    // Abrir recibo HTML (único formato visível)
    if (win && !win.closed) {
      win.location.href = `/admin/dashboard/modelo-pagamentos/${id}/recibo`;
    }
  } catch (err) {
    if (win && !win.closed) win.close();
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar e enviar email à modelo'; }
    toast('Erro: ' + err.message, 'error');
  }
}

async function abrirRecibo(id) {
  // Abre a janela IMEDIATAMENTE (dentro do gesto do utilizador)
  // para não ser bloqueada como popup
  const win = window.open('', '_blank');
  if (!win) {
    toast('Permita pop-ups neste site para ver o recibo', 'warning');
    return;
  }
  win.document.write('<html><body style="font-family:sans-serif;padding:40px;color:#555">A carregar recibo...</body></html>');

  try {
    const res = await authFetch(`/admin/dashboard/modelo-pagamentos/${id}/recibo`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (err) {
    win.document.open();
    win.document.write('<html><body style="font-family:sans-serif;padding:40px"><h2>Erro ao gerar recibo</h2><p>' + err.message + '</p></body></html>');
    win.document.close();
    toast('Erro ao gerar recibo: ' + err.message, 'error');
  }
}

async function autoPreencherChargebacks() {
  const modeloId = $('pagModeloId')?.value;
  const mes      = $('pagMesRef')?.value; // formato YYYY-MM
  const input    = $('pagChargebacks');
  const info     = $('pagChargebacksInfo');
  if (!modeloId || !mes || !input) return;

  const [ano, mesNum] = mes.split('-').map(Number);
  try {
    const d = await fetchJSON(`/admin/dashboard/chargebacks-total-modelo?modelo_id=${modeloId}&ano=${ano}&mes=${mesNum}`);
    input.value = d.total.toFixed(2);
    if (info) {
      info.textContent = d.qtd > 0
        ? `${d.qtd} chargeback(s) registrado(s) neste mês — total preenchido automaticamente. Ajuste se necessário.`
        : 'Nenhum chargeback registrado neste mês para esta modelo.';
      info.style.color = d.qtd > 0 ? '#e53e3e' : '#888';
    }
  } catch (_) {
    if (info) info.textContent = 'Não foi possível buscar chargebacks automaticamente.';
  }
}

async function abrirModalPagModelo() {
  await carregarModelosSelect('pagModeloId', 'Selecione uma modelo');
  $('saldoDisponivelPgModelo').textContent = '—';
  $('formPagModelo').reset();
  openModal('modalPagModelo');
}

// ========== 16. AGÊNCIAS ==========

pageLoaders.agencias = async function () {
  try {
    const data = await fetchJSON('/admin/dashboard/agencias-list');

    agenciasCache = data || [];

    // Preenche select de agências no modal de pagamento e no modal de lançamento
    const optsAgencias = '<option value="">— Selecione —</option>' +
      (data || []).map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
    if ($('pagAgSelect')) $('pagAgSelect').innerHTML = optsAgencias;
    if ($('lancAgenciaSelect')) $('lancAgenciaSelect').innerHTML = optsAgencias;

    // Inicializa filtro de mês/ano do painel de pagamentos
    const now = new Date();
    if ($('pagAgMes') && !$('pagAgMes')._init) {
      $('pagAgMes').value = now.getMonth() + 1;
      $('pagAgMes')._init = true;
    }
    carregarPagamentosAgencias();

    const tbody = $('tableAgencias').querySelector('tbody');
    tbody.innerHTML = (data || []).map(r => `
      <tr>
        <td>${r.id ?? '—'}</td>
        <td>${r.nome ?? '—'}</td>
        <td>${r.email ?? '—'}</td>
        <td>${Number(r.percentual_agencia ?? 0).toFixed(0)}%</td>
        <td>${Number(r.percentual_modelo ?? 0).toFixed(0)}%</td>
        <td>${Number(r.percentual_plataforma ?? 0).toFixed(0)}%</td>
        <td>${r.created_at ? fmtDateTime(r.created_at) : '—'}</td>
        <td>
          <button
            class="btn btn-sm btn-primary"
            onclick="abrirEditarAgencia(${r.id}, '${(r.nome || '').replace(/'/g, "\\'")}', ${r.percentual_agencia ?? 0}, ${r.percentual_modelo ?? 0}, ${r.percentual_plataforma ?? 0})">
            Editar
          </button>
        </td>
      </tr>
    `).join('') || emptyRow(8);

    const select = $('agenciaFiltro');
    const valorAtual = select.value;

    select.innerHTML = '<option value="">Selecione a agência</option>';
    (data || []).forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.nome;
      if (String(valorAtual) === String(a.id)) opt.selected = true;
      select.appendChild(opt);
    });

    $('agenciaFiltro').onchange = carregarModelosAgencia;
  } catch (err) {
    console.error('Erro agências:', err);
  }
};

async function carregarPagamentosAgencias() {
  const mes = $('pagAgMes').value;
  const ano = $('pagAgAno').value;
  try {
    const rows = await fetchJSON(`/admin/dashboard/pagamentos-agencias?mes=${mes}&ano=${ano}`);
    const tbody = $('tablePagAgencias').querySelector('tbody');
    tbody.innerHTML = (rows || []).map(r => `
      <tr>
        <td>${fmtDate(r.data)}</td>
        <td>${r.agencia_nome}</td>
        <td style="font-weight:600;">${money(r.valor)}</td>
        <td style="font-size:12px;color:var(--text-muted);">${r.descricao || '—'}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deletarPagAgencia(${r.id})">🗑</button></td>
      </tr>
    `).join('') || emptyRow(5);
    const total = (rows || []).reduce((s, r) => s + Number(r.valor), 0);
    $('totalPagAgencias').textContent = total > 0 ? 'Total: ' + money(total) : '';
  } catch (err) { console.error('Erro pagamentos agências:', err); }
}

function abrirModalPagAgencia() {
  const now = new Date().toISOString().split('T')[0];
  $('pagAgData').value = now;
  $('pagAgValor').value = '';
  $('pagAgDescricao').value = '';
  $('pagAgSelect').value = '';
  $('modalPagAgencia').style.display = 'flex';
}

function fecharModalPagAgencia() {
  $('modalPagAgencia').style.display = 'none';
}

async function salvarPagAgencia() {
  const agencia_id = $('pagAgSelect').value;
  const valor = parseFloat($('pagAgValor').value);
  const data = $('pagAgData').value;
  const descricao = $('pagAgDescricao').value.trim();
  if (!agencia_id || !valor || !data) { toast('Preencha agência, data e valor', 'error'); return; }
  const d = new Date(data + 'T12:00:00');
  const mes = d.getMonth() + 1;
  const ano = d.getFullYear();
  try {
    await postJSON('/admin/dashboard/pagamentos-agencias', { agencia_id, valor, data, mes, ano, descricao });
    toast('Pagamento registrado!', 'success');
    fecharModalPagAgencia();
    carregarPagamentosAgencias();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function deletarPagAgencia(id) {
  if (!confirm('Excluir este pagamento?')) return;
  try {
    await deleteJSON(`/admin/dashboard/pagamentos-agencias/${id}`);
    toast('Pagamento excluído', 'success');
    carregarPagamentosAgencias();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

function abrirEditarAgencia(id, nome, percAg, percMod, percPlat) {
  openEditModal(
    'Editar Agência',
    `/admin/dashboard/agencias/${id}`,
    'PUT',
    [
      { name: 'percentual_agencia', label: '% Agência', type: 'number', value: percAg },
      { name: 'percentual_modelo', label: '% Modelo', type: 'number', value: percMod },
      { name: 'percentual_plataforma', label: '% Plataforma', type: 'number', value: percPlat }
    ],
    () => pageLoaders.agencias()
  );
}

function abrirAdicionarAgencia() {
  openEditModal(
    'Adicionar Agência',
    '/admin/dashboard/agencias',
    'POST',
    [
      { name: 'nome', label: 'Nome', type: 'text', value: '', required: true },
      { name: 'email', label: 'Email', type: 'email', value: '', required: false },
      { name: 'senha', label: 'Senha', type: 'password', value: '', required: true },
      { name: 'percentual_agencia', label: '% Agência', type: 'number', value: 0 },
      { name: 'percentual_modelo', label: '% Modelo', type: 'number', value: 0 },
      { name: 'percentual_plataforma', label: '% Plataforma', type: 'number', value: 0 }
    ],
    () => pageLoaders.agencias()
  );
}

async function carregarModelosAgencia() {
  const agenciaId = $('agenciaFiltro').value;
  const tbody = $('tableModelosAgencia').querySelector('tbody');

  if (!agenciaId) {
    tbody.innerHTML = emptyRow(4);
    return;
  }

  try {
    const data = await fetchJSON('/admin/dashboard/agencias/' + agenciaId + '/modelos');

    tbody.innerHTML = (data || []).map(r => `
      <tr>
        <td>${r.id ?? '—'}</td>
        <td>${r.nome ?? '—'}</td>
        <td>${r.agencia_desde ? fmtDateTime(r.agencia_desde) : '—'}</td>
        <td>
          <button
            class="btn btn-sm btn-primary"
            data-modelo-id="${r.id}"
            data-modelo-nome="${(r.nome || '').replace(/"/g, '&quot;')}"
            data-agencia-id="${r.agencia_id ?? ''}"
            onclick="abrirModalAlterarAgenciaModelo(this)">
            Alterar Agência
          </button>
        </td>
      </tr>
    `).join('') || emptyRow(4);
  } catch (err) {
    console.error('Erro modelos agência:', err);
    tbody.innerHTML = emptyRow(4);
  }
}

async function abrirModalAlterarAgenciaModelo(btn) {
  try {
    const modeloId = btn.dataset.modeloId;
    const nome = btn.dataset.modeloNome;
    const agenciaAtualId = btn.dataset.agenciaId || null;

    if (!agenciasCache.length) {
      agenciasCache = await fetchJSON('/admin/dashboard/agencias-list');
    }

    $('alterarAgenciaModeloId').value = modeloId;
    $('alterarAgenciaModeloNome').value = nome || '';

    const select = $('alterarAgenciaSelect');
    select.innerHTML = '<option value="">Sem agência</option>';

    agenciasCache.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.nome;
      if (agenciaAtualId && Number(agenciaAtualId) === Number(a.id)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    openModal('modalAlterarAgenciaModelo');
  } catch (err) {
    console.error('Erro ao abrir modal de agência:', err);
    toast('Erro ao carregar agências', 'error');
  }
}

async function salvarAlteracaoAgenciaModelo(event) {
  event.preventDefault();

  const modeloId = $('alterarAgenciaModeloId').value;
  const agencia_id = $('alterarAgenciaSelect').value;

  try {
    await putJSON(`/admin/dashboard/modelos/${modeloId}/agencia`, {
      agencia_id: agencia_id ? Number(agencia_id) : null
    });

    toast('Agência da modelo atualizada com sucesso!', 'success');
    closeModal('modalAlterarAgenciaModelo');

    await pageLoaders.agencias();
    await carregarModelosAgencia();
  } catch (err) {
    console.error('Erro ao salvar alteração de agência:', err);
    toast('Erro: ' + err.message, 'error');
  }
}

// ==================== 17. CHARGEBACKS ====================

let _chargebacksData = [];

pageLoaders.chargebacks = async function () {
  const select = $('chargebacksMes');
  if (select && !select.dataset.bound) {
    populateMonthSelect(select);
    select.value = '';
    select.insertAdjacentHTML('afterbegin', '<option value="">Todos os meses</option>');
    select.value = '';
    select.addEventListener('change', () => pageLoaders.chargebacks());
    select.dataset.bound = '1';
  }
  try {
    const mes = $('chargebacksMes')?.value || '';
    const data = await fetchJSON(`/admin/dashboard/chargebacks-list?mes=${encodeURIComponent(mes)}`);
    _chargebacksData = data;
    renderChargebacks(data);
  } catch (err) {
    console.error('Erro ao carregar chargebacks:', err);
    toast('Erro ao carregar chargebacks', 'error');
  }
};

function renderChargebacks(chargebacks) {
  const tbody = document.querySelector('#tableChargebacks tbody');
  if (!chargebacks || chargebacks.length === 0) {
    tbody.innerHTML = emptyRow(8);
    return;
  }

  tbody.innerHTML = chargebacks.map((cb, i) => {
    const motivoTxt = cb.motivo ? cb.motivo.slice(0, 60) + (cb.motivo.length > 60 ? '…' : '') : '—';
    const comproLink = cb.comprovante
      ? `<button class="btn-small btn-ghost" onclick="abrirComprovante(${cb.id})">Ver</button>`
      : '—';
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${{safe2pay:'Safe2Pay',stripe:'Stripe',pluggy:'Pluggy',pagarme:'Pagarme'}[cb.plataforma] || cb.plataforma || '—'}</strong></td>
      <td>${money(cb.valor)}</td>
      <td style="color:var(--text-muted);font-size:12px;">${fmtDate(cb.data)}</td>
      <td style="font-weight:600;">${cb.criado_em ? fmtDate(cb.criado_em) : '—'}</td>
      <td title="${cb.motivo || ''}">${motivoTxt}</td>
      <td>${comproLink}</td>
      <td>
        <button class="btn-small btn-primary" onclick="abrirEditarChargeback(${cb.id})">Editar</button>
      </td>
    </tr>`;
  }).join('');
}

async function abrirComprovante(id) {
  try {
    const res = await authFetch(`/admin/dashboard/chargebacks/${id}/comprovante`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { url } = await res.json();
    window.open(url, '_blank');
  } catch (err) {
    toast('Erro ao abrir comprovante: ' + err.message, 'error');
  }
}

function abrirEditarChargeback(id) {
  const cb = _chargebacksData.find(c => c.id === id);
  if (!cb) { toast('Chargeback não encontrado', 'error'); return; }

  const form = document.getElementById('formEditarChargeback');
  form.id_chargeback = id;
  form.elements['id'].value        = id;
  form.elements['plataforma'].value = cb.plataforma || '';
  form.elements['valor'].value      = cb.valor || '';
  form.elements['data'].value       = cb.data ? cb.data.slice(0, 10) : '';
  form.elements['motivo'].value     = cb.motivo || '';
  form.elements['email'].value      = cb.cliente_email || '';
  form.elements['modelo_id'].value  = cb.modelo_id || '';
  form.elements['tipo'].value       = cb.tipo || '';
  form.elements['gateway'].value    = cb.gateway || '';

  openModal('modalEditarChargeback');
}

async function salvarEdicaoChargeback(event) {
  event.preventDefault();
  const form = event.target;
  const id = form.elements['id'].value;
  const body = {
    plataforma: form.elements['plataforma'].value,
    valor:      Number(form.elements['valor'].value),
    data:       form.elements['data'].value,
    motivo:     form.elements['motivo'].value,
    email:      form.elements['email'].value,
    modelo_id:  form.elements['modelo_id'].value || null,
    tipo:       form.elements['tipo'].value || null,
    gateway:    form.elements['gateway'].value || null,
  };

  try {
    const res = await authFetch(`/admin/dashboard/chargebacks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.erro || errData.message || `HTTP ${res.status}`);
    }
    toast('Chargeback atualizado!', 'success');
    closeAllModals();
    pageLoaders.chargebacks();
  } catch (err) {
    console.error('Erro ao editar chargeback:', err);
    toast('Erro ao editar: ' + err.message, 'error');
  }
}

async function confirmarDeletarChargeback() {
  const form = document.getElementById('formEditarChargeback');
  const id = form.elements['id'].value;
  if (!id || !confirm('Tem certeza que deseja deletar este chargeback?')) return;
  await deletarChargeback(Number(id));
  closeAllModals();
}

async function salvarChargeback(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  try {
    const res = await authFetch('/admin/dashboard/chargebacks', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    toast('Chargeback registrado com sucesso!', 'success');
    closeAllModals();
    form.reset();
    pageLoaders.chargebacks();
  } catch (err) {
    console.error('Erro ao salvar chargeback:', err);
    toast('Erro ao salvar chargeback: ' + err.message, 'error');
  }
}

async function deletarChargeback(id) {
  if (!confirm('Tem certeza que deseja deletar este chargeback?')) return;

  try {
    await deleteJSON(`/admin/dashboard/chargebacks/${id}`);
    toast('Chargeback deletado com sucesso!', 'success');
    pageLoaders.chargebacks();
  } catch (err) {
    console.error('Erro ao deletar:', err);
    toast('Erro ao deletar chargeback', 'error');
  }
}

// ==================== 19. DESPESAS OPERACIONAIS ====================

pageLoaders.despesas = async function () {
  const select = $('despesasMes');
  if (select && !select.dataset.bound) {
    populateMonthSelect(select);
    select.addEventListener('change', () => pageLoaders.despesas());
    select.dataset.bound = '1';
  }
  try {
    const [ano, mes] = (select?.value || '').split('-');
    const qs = (ano && mes) ? `?mes=${Number(mes)}&ano=${Number(ano)}` : '';
    const data = await fetchJSON(`/admin/dashboard/despesas-list${qs}`);
    renderDespesas(data);
  } catch (err) {
    console.error('Erro ao carregar despesas:', err);
    toast('Erro ao carregar despesas', 'error');
  }
};

function renderDespesas(despesas) {
  const tbody = document.querySelector('#tableDespesas tbody');
  if (!despesas || despesas.length === 0) {
    tbody.innerHTML = emptyRow(7);
    return;
  }

  const categorias = {
    banco_dados: 'Supabase',
    render: 'Render',
    cloudflare: 'Cloudflare',
    hostinger: 'Hostinger',
    claude: 'Claude API',
    email: 'Resender',
    salario: 'Salário Equipe',
    endereco: 'Endereço Fiscal',
    contabilidade: 'Contabilidade',
    taxas_cnpj: 'TAXAS CNPJ',
    outro: 'Outro'
  };

  tbody.innerHTML = despesas.map((desp, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${categorias[desp.categoria] || desp.categoria}</strong></td>
      <td>${desp.descricao}</td>
      <td>${money(desp.valor)}</td>
      <td>${fmtDate(desp.data)}</td>
      <td>
        ${desp.comprovante ? `<a href="${desp.comprovante}" target="_blank" class="link">Ver</a>` : '—'}
      </td>
      <td>
        <button class="btn-small btn-ghost" onclick="deletarDespesa(${desp.id})">Deletar</button>
      </td>
    </tr>
  `).join('');
}

async function salvarDespesa(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  try {
    const res = await authFetch('/admin/dashboard/despesas', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    toast('Despesa registrada com sucesso!', 'success');
    closeAllModals();
    form.reset();
    pageLoaders.despesas();
  } catch (err) {
    console.error('Erro ao salvar despesa:', err);
    toast('Erro ao salvar despesa: ' + err.message, 'error');
  }
}

async function deletarDespesa(id) {
  if (!confirm('Tem certeza que deseja deletar esta despesa?')) return;

  try {
    await deleteJSON(`/admin/dashboard/despesas/${id}`);
    toast('Despesa deletada com sucesso!', 'success');
    pageLoaders.despesas();
  } catch (err) {
    console.error('Erro ao deletar:', err);
    toast('Erro ao deletar despesa', 'error');
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

// ========== EMAILS HOSTINGER ==========

async function salvarConfigEmail(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = {
    email: form.get('email'),
    senha: form.get('senha'),
    imap_host: form.get('imap_host'),
    imap_port: Number(form.get('imap_port')),
    smtp_host: form.get('smtp_host'),
    smtp_port: Number(form.get('smtp_port')),
    use_tls: document.getElementById('configTLS').checked
  };

  try {
    const res = await postJSON('/api/admin/email/config', body);
    toast('Email configurado com sucesso!', 'success');

    document.getElementById('emailConectado').style.display = 'block';
    document.getElementById('emailConectadoInfo').textContent = `Conectado em: ${body.email}`;

    setTimeout(() => sincronizarEmails(), 1000);
  } catch (err) {
    toast('Erro ao configurar: ' + err.message, 'error');
  }
}

async function desconectarEmail() {
  if (confirm('Tem certeza que deseja desconectar?')) {
    try {
      await postJSON('/api/admin/email/disconnect', {});
      document.getElementById('emailConectado').style.display = 'none';
      document.getElementById('formConfigEmail').reset();
      toast('Email desconectado', 'success');
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    }
  }
}

async function sincronizarEmails() {
  const btnSync = document.getElementById('btnSincronizar');
  btnSync.disabled = true;
  btnSync.textContent = '⏳ Sincronizando...';

  try {
    const data = await postJSON('/api/admin/email/sync', {});

    if (data.emails && Array.isArray(data.emails)) {
      const tbody = document.querySelector('#tableEmails tbody');
      tbody.innerHTML = '';

      data.emails.forEach(email => {
        const emailFromMatch = email.from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        const emailFrom = emailFromMatch ? emailFromMatch[1] : email.from;

        const row = `
          <tr>
            <td style="cursor:pointer;" onclick="verEmailDetalhes(${JSON.stringify(email).replace(/"/g, '&quot;')})">${escapeHtml(email.from || 'Desconhecido')}</td>
            <td style="cursor:pointer;" onclick="verEmailDetalhes(${JSON.stringify(email).replace(/"/g, '&quot;')})">${escapeHtml(email.subject || '(sem assunto)')}</td>
            <td style="cursor:pointer;" onclick="verEmailDetalhes(${JSON.stringify(email).replace(/"/g, '&quot;')})">${fmtDate(email.date)}</td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="arquivarEmail(${email.id})">🗑️ Arquivar</button>
            </td>
          </tr>
        `;
        tbody.innerHTML += row;
      });

      document.getElementById('tableEmails').style.display = 'table';
      document.getElementById('emailsVazio').style.display = 'none';
      toast('Emails sincronizados!', 'success');
    }
  } catch (err) {
    toast('Erro ao sincronizar: ' + err.message, 'error');
  } finally {
    btnSync.disabled = false;
    btnSync.textContent = '🔄 Sincronizar';
  }
}

let emailAtualAberto = null;

function verEmailDetalhes(email) {
  emailAtualAberto = email;
  document.getElementById('emailAssunto').textContent = email.subject || '(sem assunto)';
  document.getElementById('emailDe').textContent = email.from || 'Desconhecido';
  document.getElementById('emailPara').textContent = email.to || '—';
  document.getElementById('emailData').textContent = fmtDateTime(email.date);
  document.getElementById('emailCorpo').innerHTML = email.html || escapeHtml(email.text || '');

  openModal('modalVerEmail');
}

function responderEmail() {
  if (!emailAtualAberto) return;

  const emailDe = emailAtualAberto.from || '';
  const assunto = emailAtualAberto.subject || '';

  // Extrair endereço de email
  const emailMatch = emailDe.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const paraEmail = emailMatch ? emailMatch[1] : emailDe;

  const assuntoRe = assunto.startsWith('Re:') ? assunto : 'Re: ' + assunto;

  // Preencher o composer ANTES de abrir
  setTimeout(() => {
    document.getElementById('emailPara2').value = paraEmail;
    document.getElementById('emailAssunto2').value = assuntoRe;
    document.getElementById('emailMsg').value = '';
    document.getElementById('emailPara2').focus();
  }, 100);

  closeModal('modalVerEmail');
  abrirComposer();
}

function responderEmailDireto(emailDe, assunto) {
  const assuntoRe = assunto && !assunto.startsWith('Re:') ? 'Re: ' + assunto : assunto;

  // Extrair endereço de email
  const emailMatch = emailDe.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const paraEmail = emailMatch ? emailMatch[1] : emailDe;

  // Preencher o composer
  document.getElementById('emailPara2').value = paraEmail;
  document.getElementById('emailAssunto2').value = assuntoRe || '';
  document.getElementById('emailMsg').value = '';

  // Fechar modal anterior se aberto
  closeModal('modalVerEmail');
  abrirComposer();

  toast('Respondendo para: ' + paraEmail, 'success');
}

async function arquivarEmail(emailId) {
  if (!confirm('Tem certeza que deseja arquivar este email?')) return;

  try {
    await postJSON('/api/admin/email/archive', { id: emailId });
    toast('Email arquivado!', 'success');

    // Remover linha da tabela imediatamente
    const tbody = document.querySelector('#tableEmails tbody');
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row, idx) => {
      // Encontrar e remover a linha do email arquivado
      const button = row.querySelector('button[onclick*="arquivarEmail"]');
      if (button && button.onclick.toString().includes(emailId)) {
        row.remove();
      }
    });

    // Recarregar após 1 segundo
    setTimeout(() => sincronizarEmails(), 1000);
  } catch (err) {
    toast('Erro ao arquivar: ' + err.message, 'error');
  }
}


function abrirComposer() {
  document.getElementById('formEnviarEmail').reset();
  openModal('modalComposer');
}

async function enviarEmail(e) {
  e.preventDefault();
  const form = new FormData(e.target);

  try {
    await postJSON('/api/admin/email/send', {
      para: form.get('para'),
      assunto: form.get('assunto'),
      corpo: form.get('corpo')
    });

    toast('Email enviado com sucesso!', 'success');
    closeAllModals();
    document.getElementById('formEnviarEmail').reset();

    // Recarregar enviados após 1 segundo
    setTimeout(() => carregarEnviados(), 1000);
  } catch (err) {
    toast('Erro ao enviar: ' + err.message, 'error');
  }
}

async function carregarEnviados() {
  try {
    const data = await fetchJSON('/api/admin/email/sent');

    if (data.emails && Array.isArray(data.emails)) {
      const tbody = document.querySelector('#tableEnviados tbody');
      tbody.innerHTML = '';

      if (data.emails.length === 0) {
        document.getElementById('enviadosVazio').style.display = 'block';
        document.getElementById('tableEnviados').style.display = 'none';
        return;
      }

      data.emails.forEach(email => {
        const row = `
          <tr>
            <td>${escapeHtml(email.to || 'Desconhecido')}</td>
            <td>${escapeHtml(email.subject || '(sem assunto)')}</td>
            <td>${fmtDate(email.date)}</td>
            <td><span class="badge" style="background:#4CAF50; color:white; padding:4px 8px; border-radius:4px;">Enviado</span></td>
          </tr>
        `;
        tbody.innerHTML += row;
      });

      document.getElementById('tableEnviados').style.display = 'table';
      document.getElementById('enviadosVazio').style.display = 'none';
    }
  } catch (err) {
    console.error('Erro ao carregar enviados:', err);
    // Mostrar vazio se der erro
    document.getElementById('enviadosVazio').style.display = 'block';
    document.getElementById('tableEnviados').style.display = 'none';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== NOTIFICAÇÕES (SINO) ==========

const NOTIF_PAGINA_POR_TIPO = {
  verificacao_modelo: 'verificacoes',
  verificacao_cliente: 'verificacoes',
  dados_bancarios: 'bancarios',
  chat_suporte: 'suporte',
  email: 'emails'
};

function tocarSomNotificacao() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (err) {
    console.error('Erro ao tocar som de notificação:', err);
  }
}

function fmtNotifData(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderNotifList(rows) {
  const list = $('notifList');
  if (!rows || !rows.length) {
    list.innerHTML = '<div class="notif-empty">Nenhuma notificação por aqui.</div>';
    return;
  }
  list.innerHTML = rows.map(n => `
    <div class="notif-item ${n.lida ? '' : 'unread'}" data-id="${n.id}" data-tipo="${n.tipo}">
      <span class="notif-titulo">${escapeHtml(n.titulo)}</span>
      ${n.mensagem ? `<span class="notif-mensagem">${escapeHtml(n.mensagem)}</span>` : ''}
      <span class="notif-data">${fmtNotifData(n.criado_em)}</span>
    </div>
  `).join('');
}

function atualizarNotifBadge(totalNaoLidas) {
  const badge = $('notifBadge');
  if (totalNaoLidas > 0) {
    badge.textContent = totalNaoLidas > 99 ? '99+' : totalNaoLidas;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

async function carregarNotificacoes() {
  try {
    const data = await fetchJSON('/admin/dashboard/notificacoes?limit=30');
    renderNotifList(data.rows);
    atualizarNotifBadge(data.total_nao_lidas || 0);
  } catch (err) {
    console.error('Erro ao carregar notificações:', err);
  }
}

async function marcarNotificacaoLida(id) {
  try {
    await authFetch(`/admin/dashboard/notificacoes/${id}/lida`, { method: 'POST' });
  } catch (err) {
    console.error('Erro ao marcar notificação lida:', err);
  }
}

function initNotificacoes() {
  const bellBtn = $('notifBellBtn');
  const dropdown = $('notifDropdown');
  const wrap = $('notifBellWrap');

  carregarNotificacoes();

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const aberto = dropdown.style.display !== 'none';
    dropdown.style.display = aberto ? 'none' : 'block';
    if (!aberto) carregarNotificacoes();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) dropdown.style.display = 'none';
  });

  $('notifList').addEventListener('click', async (e) => {
    const item = e.target.closest('.notif-item');
    if (!item) return;
    const id = item.dataset.id;
    const tipo = item.dataset.tipo;
    item.classList.remove('unread');
    await marcarNotificacaoLida(id);
    carregarNotificacoes();
    dropdown.style.display = 'none';
    const pagina = NOTIF_PAGINA_POR_TIPO[tipo];
    if (pagina) irParaPagina(pagina);
  });

  $('notifMarcarTodasLidas').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await authFetch('/admin/dashboard/notificacoes/marcar-todas-lidas', { method: 'POST' });
      carregarNotificacoes();
    } catch (err) {
      console.error('Erro ao marcar todas como lidas:', err);
    }
  });

  if (window.io) {
    const socket = window.io({ auth: { token }, transports: ['websocket'] });
    socket.on('admin:notificacao', (notif) => {
      tocarSomNotificacao();
      bellBtn.classList.add('ringing');
      setTimeout(() => bellBtn.classList.remove('ringing'), 1300);
      carregarNotificacoes();
      toast(notif.titulo, 'info');
    });
  }
}

// ========== INIT ==========

document.addEventListener('DOMContentLoaded', () => {
  if (!token) {
    window.location.href = '/admin/login';
    return;
  }
  pageLoaders.overview();
  initNotificacoes();
});
