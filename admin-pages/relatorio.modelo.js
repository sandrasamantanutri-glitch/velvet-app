// ===============================
// 📊 RELATÓRIO DE GANHOS — MODELO
// ===============================

async function carregarResumoModelo() {
  try {
    const res = await fetch("/api/modelo/ganhos-resumo", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      console.error("Erro ao carregar ganhos da modelo");
      return;
    }

    const data = await res.json();

    // -------------------------------
    // 🔹 HOJE
    // -------------------------------
    document.getElementById("hojeMidias").innerText =
      `R$ ${Number(data.midias?.hoje || 0).toFixed(2)}`;

    document.getElementById("hojeAssinaturas").innerText =
      `R$ ${Number(data.assinaturas?.hoje || 0).toFixed(2)}`;

    // -------------------------------
    // 🔹 MÊS ATUAL
    // -------------------------------
    document.getElementById("mesMidias").innerText =
      `R$ ${Number(data.midias?.mes || 0).toFixed(2)}`;

    document.getElementById("mesAssinaturas").innerText =
      `R$ ${Number(data.assinaturas?.mes || 0).toFixed(2)}`;

    // -------------------------------
    // 🔹 ACUMULADO TOTAL
    // -------------------------------
    const acumulado =
      Number(data.midias?.total || 0) +
      Number(data.assinaturas?.total || 0);

    document.getElementById("acumuladoAnterior").innerText =
      `R$ ${acumulado.toFixed(2)}`;

  } catch (err) {
    console.error("Erro carregarResumoModelo:", err);
  }
}

// ===============================
// 🚀 INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  carregarResumoModelo();
});
