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


// 📊 RELATÓRIO DIÁRIO (GRÁFICO 30 DIAS) - ADMIN ONLY
router.get('/admin/relatorios/diario', authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { mes } = req.query;

    // valida mês (opcional)
    if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return res.status(400).json({
        error: "Formato de mês inválido (YYYY-MM)"
      });
    }

    const inicio = mes ? `${mes}-01` : null;
    const fim = mes ? `${mes}-31` : null;

    const query = `
      SELECT
        dia,
        SUM(total) AS total
      FROM (
        -- 📦 MÍDIAS
        SELECT
          DATE(criado_em) AS dia,
          valor_total AS total
        FROM conteudo_pacotes
        WHERE
          status = 'pago'
          ${mes ? 'AND criado_em BETWEEN $1 AND $2' : ''}

        UNION ALL

        -- ⭐ ASSINATURAS
        SELECT
          DATE(created_at) AS dia,
          valor_total AS total
        FROM vip_subscriptions
        WHERE
          ativo = true
          ${mes ? 'AND created_at BETWEEN $1 AND $2' : ''}
      ) t
      GROUP BY dia
      ORDER BY dia ASC
      LIMIT 31
    `;

    const params = mes ? [inicio, fim] : [];

    const result = await db.query(query, params);

    // formata exatamente como o JS espera
    const resposta = result.rows.map(r => ({
      dia: String(new Date(r.dia).getDate()).padStart(2, '0'),
      total: Number(r.total)
    }));

    res.json(resposta);

  } catch (err) {
    console.error("❌ Erro relatório diário:", err);
    res.status(500).json([]);
  }
});
