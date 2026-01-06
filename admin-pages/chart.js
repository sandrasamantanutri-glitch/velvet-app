<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

function authFetch(url, options = {}) {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  return authFetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: "Bearer " + token
    }
  });
}


async function carregarGraficoMensal(ano) {
  const res = await authFetch(`/api/transacoes/resumo-anual?ano=${ano}`);
  const dados = await res.json();

  const labels = dados.map(d => 
    new Date(d.mes).toLocaleDateString("pt-BR", { month: "short" })
  );

  const valores = dados.map(d => Number(d.total_modelo));

  new Chart(document.getElementById("graficoMensal"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Ganhos do Modelo",
        data: valores,
        tension: 0.4,
        fill: true,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      }
    }
  });
}


async function carregarGraficoTipos(mes) {
  const res = await authFetch(`/api/transacoes/resumo-mensal?mes=${mes}`);
  const d = await res.json();

  new Chart(document.getElementById("graficoTipos"), {
    type: "bar",
    data: {
      labels: ["Assinaturas", "Mídias"],
      datasets: [{
        data: [
          Number(d.total_assinaturas),
          Number(d.total_midias)
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      }
    }
  });
}


async function exportarExcel() {
  const mes = document.getElementById("filtroMes").value;

  const res = await authFetch(
    `/api/export/resumo-mensal/excel?mes=${mes}`
  );

  if (!res || !res.ok) {
    alert("Erro ao exportar Excel");
    return;
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `resumo-${mes}.xlsx`;
  document.body.appendChild(a);
  a.click();

  a.remove();
  window.URL.revokeObjectURL(url);
}



async function exportarPDF() {
  const mes = document.getElementById("filtroMes").value;

  const res = await authFetch(
    `/api/export/resumo-mensal/pdf?mes=${mes}`
  );

  if (!res || !res.ok) {
    alert("Erro ao exportar PDF");
    return;
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `resumo-${mes}.pdf`;
  document.body.appendChild(a);
  a.click();

  a.remove();
  window.URL.revokeObjectURL(url);
}



async function fecharMes() {
  if (!confirm("Tem certeza que deseja fechar este mês?")) return;

  await authauthFetch("/api/admin/fechar-mes", {
    method: "POST"
  });

  alert("Mês fechado com sucesso");
}

let graficoAnual;

async function carregarGraficoAnualLinha(ano) {
  const res = await authauthFetch(`/api/transacoes/resumo-anual?ano=${ano}`);
  const dados = await res.json();

  const labels = dados.map(d =>
    new Date(d.mes).toLocaleDateString("pt-BR", { month: "short" })
  );

  const valores = dados.map(d => Number(d.total_modelo));

  if (graficoAnual) graficoAnual.destroy();

  graficoAnual = new Chart(
    document.getElementById("graficoAnual"),
    {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Ganhos do Modelo",
          data: valores,
          tension: 0.4,
          fill: true,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        }
      }
    }
  );
}

async function carregarGraficoAnualBarras(ano) {
  const res = await authauthFetch(`/api/transacoes/resumo-anual?ano=${ano}`);
  const dados = await res.json();

  const labels = dados.map(d =>
    new Date(d.mes).toLocaleDateString("pt-BR", { month: "short" })
  );

  const valores = dados.map(d => Number(d.total_modelo));

  if (graficoAnual) graficoAnual.destroy();

  graficoAnual = new Chart(
    document.getElementById("graficoAnual"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Ganhos do Modelo",
          data: valores
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        }
      }
    }
  );
}

let graficoMensal;

async function carregarGraficoMensal() {
  const ano = filtroAno.value;
  const mes = filtroMes.value;

  const res = await authauthFetch(`/api/transacoes/diario?mes=${ano}-${mes}`);
  const dados = await res.json();

  const labels = dados.map(d =>
    new Date(d.dia).getDate()
  );

  const valores = dados.map(d => Number(d.total_modelo));

  if (graficoMensal) graficoMensal.destroy();

  graficoMensal = new Chart(graficoMensalCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Ganhos",
        data: valores,
        tension: 0.4,
        fill: true,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

async function carregarGraficoAnual() {
  const ano = filtroAno.value;

  const res = await authauthFetch(`/api/transacoes/resumo-anual?ano=${ano}`);
  const dados = await res.json();

  const labels = dados.map(d =>
    new Date(d.mes).toLocaleDateString("pt-BR", { month: "short" })
  );

  const valores = dados.map(d => Number(d.total_modelo));

  if (graficoAnual) graficoAnual.destroy();

  graficoAnual = new Chart(graficoAnualCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Ganhos Mensais",
        data: valores
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

let graficoChargebacks;

async function carregarGraficoChargebacks() {
  const ano = filtroAno.value;
  const mes = filtroMes.value;

  const res = await authauthFetch(
    `/api/relatorios/chargebacks?inicio=${ano}-${mes}-01&fim=${ano}-${mes}-31`
  );
  const dados = await res.json();

  const labels = dados.map(d =>
    new Date(d.created_at).getDate()
  );

  const valores = dados.map(d => Number(d.valor_bruto));

  if (graficoChargebacks) graficoChargebacks.destroy();

  graficoChargebacks = new Chart(graficoChargebacksCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Valor em Chargeback",
        data: valores
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

let graficoMensalLinha;

async function graficoDiario(ano, mes) {
  const res = await authauthFetch(`/api/transacoes/diario?mes=${ano}-${mes}`);
  const dados = await res.json();

  const labels = dados.map(d => new Date(d.dia).getDate());
  const valores = dados.map(d => Number(d.total_modelo));

  if (graficoMensalLinha) graficoMensalLinha.destroy();

  graficoMensalLinha = new Chart(
    document.getElementById("graficoMensalLinha"),
    {
      type: "line",
      data: {
        labels,
        datasets: [{
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
}

let graficoMensalTipos;

async function graficoTipos(mes) {
  const res = await authauthFetch(`/api/transacoes/resumo-mensal?mes=${mes}`);
  const d = await res.json();

  if (graficoMensalTipos) graficoMensalTipos.destroy();

  graficoMensalTipos = new Chart(
    document.getElementById("graficoMensalTipos"),
    {
      type: "bar",
      data: {
        labels: ["Assinaturas", "Mídias"],
        datasets: [{
          data: [
            Number(d.total_assinaturas),
            Number(d.total_midias)
          ]
        }]
      },
      options: {
        plugins: { legend: { display: false } }
      }
    }
  );
}


let graficoMensalChargebacks;

async function graficoChargebacks(ano, mes) {
  const res = await authauthFetch(
    `/api/relatorios/chargebacks?inicio=${ano}-${mes}-01&fim=${ano}-${mes}-31`
  );
  const dados = await res.json();

  const labels = dados.map(c => new Date(c.created_at).getDate());
  const valores = dados.map(c => Number(c.valor_bruto));

  if (graficoMensalChargebacks) graficoMensalChargebacks.destroy();

  graficoMensalChargebacks = new Chart(
    document.getElementById("graficoMensalChargebacks"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [{ data: valores }]
      },
      options: {
        plugins: { legend: { display: false } }
      }
    }
  );
}

async function carregarAlertas() {
  const res = await authFetch("/api/alertas/risco");
  const dados = await res.json();

  let critico = 0, alto = 0, medio = 0;

  const tbody = document.getElementById("tabelaAlertas");
  tbody.innerHTML = "";

  dados.forEach(a => {
    if (a.nivel === "critico") critico++;
    if (a.nivel === "alto") alto++;
    if (a.nivel === "medio") medio++;

    tbody.innerHTML += `
      <tr>
        <td>#${a.cliente_id}</td>
        <td>${a.score}</td>
        <td>
          <span class="badge ${a.nivel}">
            ${a.nivel.toUpperCase()}
          </span>
        </td>
        <td>${new Date(a.atualizado_em).toLocaleString()}</td>
        <td>
          <button class="btn-acao btn-ver">Ver</button>
          <button class="btn-acao btn-bloquear">Bloquear</button>
        </td>
      </tr>
    `;
  });

  document.getElementById("alertaCritico").innerText = critico;
  document.getElementById("alertaAlto").innerText = alto;
  document.getElementById("alertaMedio").innerText = medio;
  document.getElementById("alertaTotal").innerText = dados.length;
}

document.addEventListener("DOMContentLoaded", carregarAlertas);


async function carregarResumoAnual(ano) {
  const res = await authFetch(`/api/transacoes/resumo-anual?ano=${ano}`);
  const dados = await res.json();

  let total = 0, assinaturas = 0, midias = 0, velvet = 0;

  dados.forEach(m => {
    total += Number(m.total_bruto);
    assinaturas += Number(m.total_assinaturas);
    midias += Number(m.total_midias);
    velvet += Number(m.total_velvet);
  });

  document.getElementById("anualTotal").innerText = `$${total.toFixed(2)}`;
  document.getElementById("anualAssinaturas").innerText = `$${assinaturas.toFixed(2)}`;
  document.getElementById("anualMidias").innerText = `$${midias.toFixed(2)}`;
  document.getElementById("anualVelvet").innerText = `$${velvet.toFixed(2)}`;
}




document.addEventListener("DOMContentLoaded", () => {
  carregarGraficoMensal(2025);
  carregarGraficoTipos("2025-12");

  document.getElementById("filtroAno").addEventListener("change", e => {
  carregarGraficoAnualLinha(e.target.value);
  // inicialização padrão
 document.addEventListener("DOMContentLoaded", () => {
  carregarGraficoAnualLinha(2025);
 });

 const filtroAno = document.getElementById("filtroAno");
 const filtroMes = document.getElementById("filtroMes");

 const graficoMensalCanvas = document.getElementById("graficoMensal");
 const graficoAnualCanvas = document.getElementById("graficoAnual");
 const graficoChargebacksCanvas = document.getElementById("graficoChargebacks");

 filtroAno.addEventListener("change", () => {
  carregarGraficoMensal();
  carregarGraficoAnual();
  carregarGraficoChargebacks();
 });

 filtroMes.addEventListener("change", () => {
  carregarGraficoMensal();
  carregarGraficoChargebacks();
 });

  carregarGraficoMensal();
  carregarGraficoAnual();
  carregarGraficoChargebacks();

  const ano = 2025;
  const mes = "12";

  graficoDiario(ano, mes);
  graficoTipos(`${ano}-${mes}`);
  graficoChargebacks(ano, mes);
  carregarResumoAnual(ano);
 });

});









