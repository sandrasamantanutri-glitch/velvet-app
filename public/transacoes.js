// 🔥 variável global
let todasTransacoes = [];

document.addEventListener("DOMContentLoaded", async () => {
  await carregarTransacoes();

  document
    .getElementById("filtroTipo")
    .addEventListener("change", aplicarFiltros);

  document
    .getElementById("filtroStatus")
    .addEventListener("change", aplicarFiltros);
});

// ================================
// CARREGAR
// ================================
async function carregarTransacoes() {
  const token = localStorage.getItem("token");
  const lista = document.getElementById("listaTransacoes");

  const res = await fetch("/api/transacoes_cliente", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) {
    lista.innerHTML = "Erro ao carregar transações.";
    return;
  }

  todasTransacoes = await res.json();

  renderTransacoes(todasTransacoes);
}

// ================================
// FILTROS
// ================================
function aplicarFiltros() {
  const tipoSelecionado =
    document.getElementById("filtroTipo").value;

  const statusSelecionado =
    document.getElementById("filtroStatus").value;

  let filtradas = todasTransacoes;

  if (tipoSelecionado) {
    filtradas = filtradas.filter(t =>
      t.tipo === tipoSelecionado
    );
  }

  if (statusSelecionado) {
    filtradas = filtradas.filter(t =>
      t.status === statusSelecionado
    );
  }

  renderTransacoes(filtradas);
}

// ================================
// RENDER
// ================================
function renderTransacoes(transacoes) {
  const lista = document.getElementById("listaTransacoes");

  if (!transacoes.length) {
    lista.innerHTML = "Nenhuma transação encontrada.";
    return;
  }

  lista.innerHTML = "";

  transacoes.forEach(t => {
    const card = document.createElement("div");
    card.className = "transacao-card";

    card.innerHTML = `
      <div class="transacao-info">
        <div class="transacao-tipo">
          ${t.tipo === "assinatura"
            ? "Assinatura VIP"
            : "Conteúdo Premium"}
        </div>

        <div class="transacao-data">
          ${new Date(t.created_at).toLocaleString()}
        </div>

        <div class="transacao-valor">
          R$ ${Number(t.valor).toFixed(2)}
        </div>

        ${
          t.status !== "pago"
            ? `<button class="btn-reclamar"
                onclick="reclamar(${t.id}, '${t.tipo}')">
                Reclamar pagamento
              </button>`
            : ""
        }
      </div>

      <div class="transacao-status status-${t.status}">
        ${t.status.toUpperCase()}
      </div>
    `;

    lista.appendChild(card);
  });
}

// ================================
// RECLAMAR
// ================================
function reclamar(id, tipo) {
  window.location.href =
    `/contato.html?transacao_id=${id}&tipo=${tipo}`;
}
