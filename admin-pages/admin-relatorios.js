const hojeTotal = document.getElementById('hojeTotal');
const mesTotal = document.getElementById('mesTotal');
const anoTotal = document.getElementById('anoTotal');
const filtroMes = document.getElementById('filtroMes');

let chart;

function formatMoney(valor) {
  return valor.toLocaleString('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  });
}

async function carregarResumo() {
  const res = await fetch('/admin/relatorios/geral');
  const data = await res.json();

  const hoje = data.dia.midias + data.dia.assinaturas;
  const mes = data.mes.midias + data.mes.assinaturas;
  const ano = data.ano.midias + data.ano.assinaturas;

  hojeTotal.textContent = formatMoney(hoje);
  mesTotal.textContent = formatMoney(mes);
  anoTotal.textContent = formatMoney(ano);
}

async function carregarGrafico(mesSelecionado = null) {
  const res = await fetch('/admin/relatorios/diario?mes=' + (mesSelecionado || ''));
  const dados = await res.json();

  const labels = dados.map(d => d.dia);
  const valores = dados.map(d => d.total);

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById('grafico30dias'), {
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
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { ticks: { color: '#C9C9C9' } },
        y: { ticks: { color: '#C9C9C9' } }
      }
    }
  });
}

filtroMes.addEventListener('change', () => {
  carregarGrafico(filtroMes.value);
});

carregarResumo();
carregarGrafico();
