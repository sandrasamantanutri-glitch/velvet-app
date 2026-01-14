const token = localStorage.getItem("token");

async function carregarDashboard() {
  const res = await fetch("/api/modelo/dashboard-ganhos", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const data = await res.json();

  document.getElementById("totalGanhos").innerText =
    `$${Number(data.total).toFixed(2)}`;

  document.getElementById("saldo").innerText =
    `$${Number(data.saldoDisponivel).toFixed(2)}`;

  document.getElementById("proximoPagamento").innerText =
    data.proximoPagamento;

  renderMensal(data.mensal);
  renderDiario(data.diario);
}

function renderMensal(dados) {
  new Chart(document.getElementById("chartMensal"), {
    type: "line",
    data: {
      labels: dados.map(i => i.label),
      datasets: [{
        label: "Total",
        data: dados.map(i => Number(i.total)),
        borderColor: "#7B2CFF",
        tension: 0.3
      }]
    },
    options: { responsive: true }
  });
}

function renderDiario(dados) {
  new Chart(document.getElementById("chartDiario"), {
    type: "line",
    data: {
      labels: dados.map(i => i.label),
      datasets: [{
        label: "Total",
        data: dados.map(i => Number(i.total)),
        borderColor: "#00c2a8",
        tension: 0.3
      }]
    },
    options: { responsive: true }
  });
}

function mostrarMes() {
  document.getElementById("chartMes").style.display = "block";
  document.getElementById("chartDia").style.display = "none";
}

function mostrarDia() {
  document.getElementById("chartMes").style.display = "none";
  document.getElementById("chartDia").style.display = "block";
}

carregarDashboard();
