let todasTransacoes = [];
let paginaAtual = 1;
const itensPorPagina = 10;

document.addEventListener("DOMContentLoaded", async () => {
  await carregarTransacoes();

  document
    .getElementById("filtroTipo")
    const filtro = document.getElementById("filtroTipo");

if (filtro) {
  filtro.addEventListener("change", aplicarFiltros);
}
});

// ================================
// CARREGAR
// ================================
async function carregarTransacoes() {
  const token = localStorage.getItem("token");
  const lista = document.getElementById("listaTransacoes");

  const res = await fetch("/api/cliente/transacoes", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) {
    lista.innerHTML = `
  <div class="erro-transacoes">
    Erro ao carregar transações.<br>
    No momento, apenas clientes podem processar pagamentos.
  </div>
`;
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
  const paginacao = document.getElementById("paginacao");

  if (!transacoes.length) {
    lista.innerHTML = "Nenhuma transação encontrada.";
    paginacao.innerHTML = "";
    return;
  }

  lista.innerHTML = "";

  const inicio = (paginaAtual - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const paginaItems = transacoes.slice(inicio, fim);

  paginaItems.forEach(t => {
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

  gerarPaginacao(transacoes.length);
}

function gerarPaginacao(totalItens) {
  const paginacao = document.getElementById("paginacao");
  paginacao.innerHTML = "";

  const totalPaginas = Math.ceil(totalItens / itensPorPagina);

  for (let i = 1; i <= totalPaginas; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;

    if (i === paginaAtual) {
      btn.classList.add("ativa");
    }

    btn.addEventListener("click", () => {
      paginaAtual = i;
      renderTransacoes(todasTransacoes);
    });

    paginacao.appendChild(btn);
  }
}

// ================================
// RECLAMAR
// ================================
function reclamar(id, tipo) {
  window.location.href =
    `/contato.html?transacao_id=${id}&tipo=${tipo}`;
}
