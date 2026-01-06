// =====================================================
// 🔐 FETCH COM AUTENTICAÇÃO (JWT)
// =====================================================
function authFetch(url, options = {}) {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: "Bearer " + token
    }
  });
}

// =====================================================
// 🎛️ FILTROS (ANO / MÊS)
// =====================================================
const filtroAno = document.getElementById("filtroAno");
const filtroMes = document.getElementById("filtroMes");

// =====================================================
// 📊 GRÁFICO DIÁRIO DO MÊS
// =====================================================
let graficoMensal;
async function carregarGraficoMensal() {
  const mes = filtroMes.value; // já vem 2025-12

  const res = await authFetch(
    `/content/api/transacoes/diario?mes=${mes}`
  );
  if (!res || !res.ok) return;

  const dados = await res.json();

  if (graficoMensal) graficoMensal.destroy();

  graficoMensal = new Chart(
    document.getElementById("graficoMensal"),
    {
      type: "bar",
      data: {
        labels: dados.map(d => d.dia),
        datasets: [{
          label: "Ganhos diários",
          data: dados.map(d => Number(d.total_modelo))
        }]
      }
    }
  );
}

// =====================================================
// 📈 GRÁFICO ANUAL (GANHOS MENSAIS)
// =====================================================
let graficoAnual;
async function carregarGraficoAnual() {
  const ano = filtroAno.value;

  const res = await authFetch(
    `/content/api/transacoes/resumo-anual?ano=${ano}`
  );
  if (!res || !res.ok) return;

  const dados = await res.json();

  if (graficoAnual) graficoAnual.destroy();

  graficoAnual = new Chart(
    document.getElementById("graficoAnual"),
    {
      type: "line",
      data: {
        labels: dados.map(d =>
          new Date(d.mes).toISOString().slice(0, 7)
        ),
        datasets: [{
          label: "Ganhos mensais",
          data: dados.map(d => Number(d.total_modelo))
        }]
      }
    }
  );
}

// =====================================================
// ⚠️ GRÁFICO DE CHARGEBACKS
// =====================================================
let graficoChargebacks;

async function carregarGraficoChargebacks() {
  const mes = filtroMes.value; // 2025-12

  const inicio = `${mes}-01`;
  const fim = `${mes}-31`;

  const res = await authFetch(
    `/content/api/relatorios/chargebacks?inicio=${inicio}&fim=${fim}`
  );
  if (!res || !res.ok) return;

  const dados = await res.json();

  if (graficoChargebacks) graficoChargebacks.destroy();

  graficoChargebacks = new Chart(
    document.getElementById("graficoChargebacks"),
    {
      type: "doughnut",
      data: {
        labels: ["Chargebacks"],
        datasets: [{
          data: [dados.length]
        }]
      }
    }
  );
}


// =====================================================
// 🚨 ALERTAS DE RISCO
// =====================================================
async function carregarAlertas() {
  const res = await authFetch("/content/api/alertas/risco");
  if (!res || !res.ok) return;

  const alertas = await res.json();
  const lista = document.getElementById("listaAlertas");

  lista.innerHTML = "";

  alertas.forEach(a => {
    const li = document.createElement("li");
    li.textContent = a.mensagem;
    lista.appendChild(li);
  });
}


// =====================================================
// 📤 EXPORTAÇÕES (EXCEL / PDF)
// =====================================================
async function exportarExcel() {
  const ano = filtroAno.value;
  const mes = filtroMes.value;

  const res = await authFetch(
    `/api/export/resumo-mensal/excel?mes=${ano}-${mes}`
  );
  if (!res || !res.ok) return;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `resumo-${ano}-${mes}.xlsx`;
  a.click();

  URL.revokeObjectURL(url);
}

async function exportarPDF() {
  const ano = filtroAno.value;
  const mes = filtroMes.value;

  const res = await authFetch(
    `/api/export/resumo-mensal/pdf?mes=${ano}-${mes}`
  );
  if (!res || !res.ok) return;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `resumo-${ano}-${mes}.pdf`;
  a.click();

  URL.revokeObjectURL(url);
}

// =====================================================
// 🚀 INICIALIZAÇÃO DA PÁGINA
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  carregarGraficoAnual();
  carregarGraficoMensal();
  carregarGraficoChargebacks();
  carregarAlertas();

  filtroAno.addEventListener("change", () => {
    carregarGraficoAnual();
    carregarGraficoMensal();
    carregarGraficoChargebacks();
  });

  filtroMes.addEventListener("change", () => {
    carregarGraficoMensal();
    carregarGraficoChargebacks();
  });
});
