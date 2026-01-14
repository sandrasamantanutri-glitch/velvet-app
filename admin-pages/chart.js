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
const filtroPeriodo = document.getElementById("filtroPeriodo");
const filtroModelo = document.getElementById("filtroModelo");


// =====================================================
// 📊 GRÁFICO DIÁRIO DO MÊS
// =====================================================
let graficoMensal;

async function carregarGraficoMensal() {
  const mes = filtroPeriodo.value; // ex: 2025-12

let url = `/content/api/transacoes/diario?mes=${mes}`;

if (filtroModelo.value) {
  url += `&modelo_id=${filtroModelo.value}`;
}

const res = await authFetch(url);


  if (!res || !res.ok) {
    console.error("Erro ao buscar ganhos diários");
    return;
  }

  const dados = await res.json();
  console.log("GANHOS DIARIOS:", dados);

  // 🔴 se não houver dados, avisa
  if (!Array.isArray(dados) || dados.length === 0) {
    console.warn("Nenhum dado retornado para", mes);
    return;
  }

  // 🔹 adapta aos nomes vindos do backend
  const labels = dados.map(d =>
    d.dia ?? d.dia_venda ?? d.data ?? ""
  );

  const valores = dados.map(d =>
    Number(d.total ?? d.total_modelo ?? d.valor ?? 0)
  );

  if (graficoMensal) graficoMensal.destroy();

  if (!/^\d{4}-\d{2}$/.test(mes)) {
  console.error("MÊS INVÁLIDO ENVIADO:", mes);
  return;
}


  graficoMensal = new Chart(
    document.getElementById("graficoMensal"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Ganhos diários",
            data: valores,
            backgroundColor: "#7B2CFF"
          }
        ]
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

  let url = `/content/api/transacoes/resumo-anual?ano=${ano}`;

if (filtroModelo.value) {
  url += `&modelo_id=${filtroModelo.value}`;
}

const res = await authFetch(url);


  if (filtroModelo.value) {
  url += `&modelo_id=${filtroModelo.value}`;
}

  if (!res || !res.ok) {
    console.error("Erro ao carregar resumo anual");
    return;
  }

  const dados = await res.json();

  if (graficoAnual) graficoAnual.destroy();

  graficoAnual = new Chart(
    document.getElementById("graficoAnual"),
    {
      type: "bar", // 🔥 tipo fixo
      data: {
        labels: dados.map(d =>
          new Date(d.mes).toISOString().slice(0, 7)
        ),
        datasets: [{
          label: "Ganhos mensais",
          data: dados.map(d => Number(d.total_modelo)),
          backgroundColor: "#7B2CFF"
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
  const mes = filtroPeriodo.value;

  const inicio = `${mes}-01`;
  const fim = `${mes}-31`;

  const res = await authFetch(`/content/api/relatorios/chargebacks?inicio=${inicio}&fim=${fim}`);
  if (!res || !res.ok) return;

  const dados = await res.json();

  if (graficoChargebacks) graficoChargebacks.destroy();

  if (!/^\d{4}-\d{2}$/.test(mes)) {
  console.error("MÊS INVÁLIDO ENVIADO:", mes);
  return;
 }


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

  const lista = document.getElementById("listaAlertas");
  if (!lista) return; // 🔒 evita crash

  const alertas = await res.json();
  lista.innerHTML = "";

  alertas.forEach(a => {
    const li = document.createElement("li");
    li.textContent = a.mensagem || a.nivel;
    lista.appendChild(li);
  });
}



// =====================================================
// 📤 EXPORTAÇÕES (EXCEL / PDF)
// =====================================================
async function exportarExcel() {
  const ano = filtroAno.value;
  const mes = filtroPeriodo.value;

  const res = await authFetch(`/content/api/export/resumo-mensal/excel?mes=${mes}`);
  if (!res || !res.ok) return;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `resumo-${ano}-${mes}.xlsx`;
  a.click();

  URL.revokeObjectURL(url);

  if (!/^\d{4}-\d{2}$/.test(mes)) {
  console.error("MÊS INVÁLIDO ENVIADO:", mes);
  return;
  }
}


async function exportarPDF() {
  const ano = filtroAno.value;
  const mes = filtroPeriodo.value;

  const res = await authFetch(`/content/api/export/resumo-mensal/pdf?mes=${mes}`);
  if (!res || !res.ok) return;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `resumo-${ano}-${mes}.pdf`;
  a.click();

  URL.revokeObjectURL(url);

  if (!/^\d{4}-\d{2}$/.test(mes)) {
  console.error("MÊS INVÁLIDO ENVIADO:", mes);
  return;
  }
}

// =====================================================
// 🍰 GRÁFICO ASSINATURAS x MÍDIAS
// =====================================================
let graficoAssinaturasMidias;

async function carregarGraficoAssinaturasMidias() {
  const mes = filtroPeriodo.value; // ex: 2026-01

  if (!/^\d{4}-\d{2}$/.test(mes)) {
    console.error("MÊS INVÁLIDO:", mes);
    return;
  }

  const res = await authFetch("/api/modelo/ganhos-resumo", {
  headers: {
    Authorization: "Bearer " + localStorage.getItem("token")
  }
})
  if (!res || !res.ok) {
    console.error("Erro ao buscar resumo mensal");
    return;
  }

  const dados = await res.json();

  const assinaturas = Number(dados.total_assinaturas || 0);
  const midias = Number(dados.total_midias || 0);

  if (graficoAssinaturasMidias) {
    graficoAssinaturasMidias.destroy();
  }

  graficoAssinaturasMidias = new Chart(
    document.getElementById("graficoAssinaturasMidias"),
    {
      type: "doughnut",
      data: {
        labels: ["Assinaturas", "Mídias"],
        datasets: [
          {
            data: [assinaturas, midias],
            backgroundColor: ["#7B2CFF", "#E0D4FF"]
          }
        ]
      },
      options: {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        boxWidth: 12,
        font: { size: 12 }
      }
    }
  }
}

    }
  );
}

async function carregarResumoModelo() {
  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtual = hoje.slice(0, 7);

  // 🔹 Ganhos de hoje
  const resHoje = await authFetch(
    `/content/api/transacoes/diario?mes=${mesAtual}`
  );
  if (!resHoje || !resHoje.ok) return;

  const dadosHoje = await resHoje.json();

  const hojeData = dadosHoje.find(
    d => d.dia === hoje
  );

  document.getElementById("hojeMidias").innerText =
    `$${Number(hojeData?.ganhos_midias || 0).toFixed(2)}`;

  document.getElementById("hojeAssinaturas").innerText =
    `$${Number(hojeData?.ganhos_assinaturas || 0).toFixed(2)}`;

  // 🔹 Acumulado do mês
  const resMes = await authFetch(
    `/content/api/transacoes/resumo-mensal?mes=${mesAtual}`
  );
  if (!resMes || !resMes.ok) return;

  const mes = await resMes.json();

  document.getElementById("mesMidias").innerText =
    `$${Number(mes.total_midias || 0).toFixed(2)}`;

  document.getElementById("mesAssinaturas").innerText =
    `$${Number(mes.total_assinaturas || 0).toFixed(2)}`;

  // 🔹 Acumulado meses anteriores
  const resAno = await authFetch(
    `/content/api/transacoes/resumo-anual?ano=${new Date().getFullYear()}`
  );
  if (!resAno || !resAno.ok) return;

  const ano = await resAno.json();

  const acumuladoAnterior = ano
    .filter(m => m.mes.slice(0,7) < mesAtual)
    .reduce((acc, m) => acc + Number(m.total_modelo), 0);

  document.getElementById("acumuladoAnterior").innerText =
    `$${acumuladoAnterior.toFixed(2)}`;
}

async function carregarModelos() {
  const res = await authFetch("/content/api/modelos");
  if (!res || !res.ok) return;

  const modelos = await res.json();

  modelos.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.nome;
    filtroModelo.appendChild(opt);
  });
}



// =====================================================
// 🚀 INICIALIZAÇÃO DA PÁGINA
// =====================================================
document.addEventListener("DOMContentLoaded", () => {

  // 🔹 ADMIN
  if (document.getElementById("graficoAnual")) {
    carregarGraficoAnual();
  }

  if (document.getElementById("graficoMensal")) {
    carregarGraficoMensal();
  }

  if (document.getElementById("graficoChargebacks")) {
    carregarGraficoChargebacks();
  }

  if (document.getElementById("graficoAssinaturasMidias")) {
    carregarGraficoAssinaturasMidias();
  }
  
  if (filtroModelo) {
  filtroModelo.addEventListener("change", () => {
    carregarGraficoMensal();
    carregarGraficoAnual();
    carregarGraficoAssinaturasMidias();
  });
}

  // 🔹 MODELO
  if (document.getElementById("hojeMidias")) {
    carregarResumoModelo();
  }

});


