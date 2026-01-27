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
// 🎛️ FILTROS
// =====================================================
const filtroAno = document.getElementById("filtroAno");
const filtroPeriodo = document.getElementById("filtroPeriodo");
const filtroModelo = document.getElementById("filtroModelo");

// =====================================================
// 📊 GRÁFICO MENSAL (GANHOS DIÁRIOS)
// =====================================================
let graficoMensal;

async function carregarGraficoMensal() {
  const mes = filtroPeriodo.value;
  if (!/^\d{4}-\d{2}$/.test(mes)) return;

  let url = `/api/transacoes/diario?mes=${mes}`;
  if (filtroModelo?.value) url += `&modelo_id=${filtroModelo.value}`;

  const res = await authFetch(url);
  if (!res?.ok) return;

  const dados = await res.json();
  if (!Array.isArray(dados) || dados.length === 0) return;

  const labels = dados.map(d => d.dia);
  const valores = dados.map(d =>
    Number(d.ganhos_midias || 0) + Number(d.ganhos_assinaturas || 0)
  );

  if (graficoMensal) graficoMensal.destroy();

  graficoMensal = new Chart(
    document.getElementById("graficoMensal"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Ganhos diários",
          data: valores,
          backgroundColor: "#7B2CFF"
        }]
      }
    }
  );
}

// =====================================================
// 📈 GRÁFICO ANUAL
// =====================================================
let graficoAnual;

async function carregarGraficoAnual() {
  const ano = filtroAno.value;

  let url = `/api/transacoes/resumo-anual?ano=${ano}`;
  if (filtroModelo?.value) url += `&modelo_id=${filtroModelo.value}`;

  const res = await authFetch(url);
  if (!res?.ok) return;

  const dados = await res.json();
  if (!Array.isArray(dados)) return;

  if (graficoAnual) graficoAnual.destroy();

  graficoAnual = new Chart(
    document.getElementById("graficoAnual"),
    {
      type: "bar",
      data: {
        labels: dados.map(d => d.mes.slice(0, 7)),
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
// 🍰 ASSINATURAS x MÍDIAS
// =====================================================
let graficoAssinaturasMidias;

async function carregarGraficoAssinaturasMidias() {
  const mes = filtroPeriodo.value;
  if (!/^\d{4}-\d{2}$/.test(mes)) return;

  const res = await authFetch(`/api/transacoes/resumo-mensal?mes=${mes}`);
  if (!res?.ok) return;

  const dados = await res.json();

  const assinaturas = Number(dados.total_assinaturas || 0);
  const midias = Number(dados.total_midias || 0);

  if (graficoAssinaturasMidias) graficoAssinaturasMidias.destroy();

  graficoAssinaturasMidias = new Chart(
    document.getElementById("graficoAssinaturasMidias"),
    {
      type: "doughnut",
      data: {
        labels: ["Assinaturas", "Mídias"],
        datasets: [{
          data: [assinaturas, midias],
          backgroundColor: ["#7B2CFF", "#E0D4FF"]
        }]
      }
    }
  );
}

// =====================================================
// ⚠️ CHARGEBACKS
// =====================================================
let graficoChargebacks;

async function carregarGraficoChargebacks() {
  const mes = filtroPeriodo.value;
  if (!/^\d{4}-\d{2}$/.test(mes)) return;

  const res = await authFetch(
    `/api/relatorios/chargebacks?inicio=${mes}-01&fim=${mes}-31`
  );
  if (!res?.ok) return;

  const dados = await res.json();
  if (graficoChargebacks) graficoChargebacks.destroy();

  graficoChargebacks = new Chart(
    document.getElementById("graficoChargebacks"),
    {
      type: "doughnut",
      data: {
        labels: ["Chargebacks"],
        datasets: [{ data: [dados.length] }]
      }
    }
  );
}

// =====================================================
// 📤 EXPORTAÇÕES
// =====================================================
async function exportarExcel() {
  const mes = filtroPeriodo.value;
  const res = await authFetch(`/api/export/resumo-mensal/excel?mes=${mes}`);
  if (!res?.ok) return;

  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `resumo-${mes}.xlsx`;
  a.click();
}

async function exportarPDF() {
  const mes = filtroPeriodo.value;
  const res = await authFetch(`/api/export/resumo-mensal/pdf?mes=${mes}`);
  if (!res?.ok) return;

  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `resumo-${mes}.pdf`;
  a.click();
}

// =====================================================
// 📋 MODELOS (FILTRO)
// =====================================================
async function carregarModelos() {
  if (!filtroModelo) return;

  const res = await authFetch("/api/allmessage/modelos");
  if (!res?.ok) return;

  const modelos = await res.json();
  modelos.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.nome;
    filtroModelo.appendChild(opt);
  });
}

// =====================================================
// 🚀 INIT
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  carregarModelos();
  carregarGraficoMensal();
  carregarGraficoAnual();
  carregarGraficoAssinaturasMidias();
  carregarGraficoChargebacks();

  filtroModelo?.addEventListener("change", () => {
    carregarGraficoMensal();
    carregarGraficoAnual();
    carregarGraficoAssinaturasMidias();
  });
});
