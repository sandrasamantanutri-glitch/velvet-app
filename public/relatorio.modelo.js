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

async function carregarTransacoes() {
  const lista = document.getElementById("listaTransacoes");

  // 🛑 GUARDA DE SEGURANÇA
  if (!lista) {
    console.warn("listaTransacoes não existe nesta página");
    return;
  }

  lista.innerHTML = "Carregando transações...";

  const token = localStorage.getItem("token");
  if (!token) {
    lista.innerText = "Você não está logada.";
    return;
  }

  try {
    const res = await fetch("/api/transacoes", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      lista.innerText = "Erro ao carregar transações.";
      return;
    }

    const dados = await res.json();
    lista.innerHTML = "";

    if (!dados.length) {
      lista.innerText = "Nenhuma transação encontrada.";
      return;
    }

    dados.forEach(t => {
      lista.innerHTML += `
        <div class="transacao">
          <strong>#${t.codigo}</strong> · ${t.tipo}<br>
          ${new Date(t.created_at).toLocaleDateString("pt-BR")}<br>
          Valor: ${emReais(t.valor)}
        </div>
      `;
    });

  } catch (err) {
    console.error(err);
    lista.innerText = "Erro inesperado.";
  }
}


function emReais(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

async function carregarPagamentos() {
  const lista = document.getElementById("listaPagamentos");
  if (!lista) return;

  lista.innerHTML = "Carregando pagamentos...";

  const token = localStorage.getItem("token");
  if (!token) {
    lista.innerHTML = "Você não está logada.";
    return;
  }

  try {
    const res = await fetch("/api/modelo/pagamentos", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      lista.innerHTML = "Erro ao carregar pagamentos.";
      return;
    }

    const dados = await res.json();
    lista.innerHTML = "";

    if (!dados.length) {
      lista.innerHTML = "Nenhum pagamento encontrado.";
      return;
    }

    dados.forEach(p => {
      const mes = new Date(p.mes).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric"
      });

      lista.innerHTML += `
        <div class="transacao">
          <strong>${mes}</strong><br>
          Mídias: ${emReais(p.total_midias)}<br>
          Assinaturas: ${emReais(p.total_assinaturas)}<br>
          <strong>Total: ${emReais(p.total_geral)}</strong>
        </div>
      `;
    });

  } catch (err) {
    console.error(err);
    lista.innerHTML = "Erro inesperado.";
  }
}


// ===============================
// 🚀 INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  carregarResumoModelo();
  document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

      if (btn.dataset.tab === "transacoes") carregarTransacoes();
      if (btn.dataset.tab === "pagamentos") carregarPagamentos();
    });
  });
});

});
