let todasTransacoes = [];

document.addEventListener("DOMContentLoaded", async () => {
  await carregarTransacoes();

  document
    .getElementById("filtroTipo")
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
// FILTRO APENAS POR TIPO
// ================================
function aplicarFiltros() {
  const tipoSelecionado =
    document.getElementById("filtroTipo").value;

  let filtradas = todasTransacoes;

  if (tipoSelecionado) {
    filtradas = filtradas.filter(t =>
      t.tipo === tipoSelecionado
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

        <button class="btn-reclamar"
          onclick="reclamar(${t.id}, '${t.tipo}')">
          Reclamar pagamento
        </button>
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
