// ===============================
// 📊 RELATÓRIO DE GANHOS — MODELO
// ===============================

async function carregarResumoModelo() {
  try {
    const res = await fetch("/api/modelo/financeiro", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      console.error("Erro ao carregar ganhos da modelo");
      return;
    }

    const data = await res.json();

   // HOJE
document.getElementById("hojeMidias").innerText =
  `R$ ${Number(data.hoje.midias || 0).toFixed(2)}`;

document.getElementById("hojeAssinaturas").innerText =
  `R$ ${Number(data.hoje.assinaturas || 0).toFixed(2)}`;

  // ASSINANTES
document.getElementById("totalAssinantes").innerText =
  data.assinantes?.total ?? 0;

document.getElementById("assinantesHoje").innerText =
  data.assinantes?.hoje ?? 0;

// MÊS
document.getElementById("mesMidias").innerText =
  `R$ ${Number(data.mes.midias || 0).toFixed(2)}`;

document.getElementById("mesAssinaturas").innerText =
  `R$ ${Number(data.mes.assinaturas || 0).toFixed(2)}`;

// ACUMULADO
const acumulado =
  Number(data.total.midias || 0) +
  Number(data.total.assinaturas || 0);

document.getElementById("acumuladoAnterior").innerText =
  `R$ ${Number(data.total.acumulado_2026 || 0).toFixed(2)}`;

  } catch (err) {
    console.error("Erro carregarResumoModelo:", err);
  }
}

// ===============================
// 🧭 CONTROLE DE TABS
// ===============================
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {

    // ativa tab
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    // mostra conteúdo
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    // lazy load
    if (btn.dataset.tab === "transacoes") {
      carregarTransacoes?.();
    }

    if (btn.dataset.tab === "pagamentos") {
      carregarPagamentos?.();
    }
  });
});

async function carregarTransacoes() {
  try {
    const token = localStorage.getItem("token");

    if (!token) {
      document.getElementById("lista").innerText =
        "Você não está logada.";
      return;
    }

    const res = await fetch("/api/transacoes", {
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    if (!res.ok) {
      document.getElementById("lista").innerText =
        "Erro ao carregar transações.";
      return;
    }

    const dados = await res.json();
    const lista = document.getElementById("lista");
    lista.innerHTML = "";

    if (!dados.length) {
      lista.innerText = "Você ainda não realizou nenhuma compra.";
      return;
    }

    dados.forEach(t => {
      const div = document.createElement("div");
      div.className = "transacao";

      div.innerHTML = `
        <div class="linha">
<strong>
  #${t.tipo === "conteudo" ? "C" : "A"}-${t.codigo}
</strong>
${t.tipo === "conteudo" ? "Conteúdo" : "Assinatura"}


        </div>

        <div class="linha">
          Data: ${new Date(t.created_at).toLocaleString()}
        </div>

        <div class="linha">
          Valor: ${emReais(t.valor)}
        </div>

        <div class="linha">
          Status: <strong>${t.status}</strong>
        </div>

        ${
          t.tipo === "conteudo"
            ? `<div class="linha">Conteúdo ID: ${t.message_id}</div>`
            : ""
        }

        ${
          t.tipo === "assinatura"
            ? `<div class="linha">Assinatura VIP</div>`
            : ""
        }
      `;

      lista.appendChild(div);
    });

  } catch (err) {
    console.error(err);
    document.getElementById("lista").innerText =
      "Erro inesperado.";
  }
}

function emReais(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

carregarTransacoes();


// ===============================
// 🚀 INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  carregarResumoModelo();
});
