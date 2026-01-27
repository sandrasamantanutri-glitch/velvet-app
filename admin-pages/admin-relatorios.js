const hojeTotal = document.getElementById('hojeTotal');
const mesTotal = document.getElementById('mesTotal');
const anoTotal = document.getElementById('anoTotal');
const filtroMes = document.getElementById('filtroMes');

let chart;

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}


const token = localStorage.getItem('token');

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  });

  if (!res.ok) {
    // sessão inválida ou não-admin
    console.error('Erro ao aceder:', res.status);
    throw new Error('Unauthorized');
  }

  return res.json();
}

async function carregarResumo() {
  try {
    const data = await fetchJSON('/admin/relatorios/geral');

    const hoje = data.dia.midias + data.dia.assinaturas;
    const mes = data.mes.midias + data.mes.assinaturas;
    const ano = data.ano.midias + data.ano.assinaturas;

    hojeTotal.textContent = formatMoney(hoje);
    mesTotal.textContent = formatMoney(mes);
    anoTotal.textContent = formatMoney(ano);

  } catch (err) {
    console.error('Erro resumo:', err);
  }
}

async function carregarGrafico(mesSelecionado = '') {
  try {
    const dados = await fetchJSON(
      '/admin/relatorios/diario?mes=' + mesSelecionado
    );

    const labels = dados.map(d => d.dia);
    const valores = dados.map(d => d.total);

    if (chart) chart.destroy();

    chart = new Chart(
      document.getElementById('grafico30dias'),
      {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Faturamento (€)',
            data: valores,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          plugins: { legend: { display: false } }
        }
      }
    );

  } catch (err) {
    console.error('Erro gráfico:', err);
  }
}

filtroMes.addEventListener('change', () => {
  carregarGrafico(filtroMes.value);
});

// INIT
carregarResumo();
carregarGrafico();
