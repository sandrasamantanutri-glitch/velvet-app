let todasTransacoes = [];
let paginaAtual = 1;
const itensPorPagina = 10;

const token = localStorage.getItem("token");

document.addEventListener("DOMContentLoaded", async () => {
const tabs = document.querySelectorAll(".tab-btn");

tabs.forEach(btn => {
  btn.addEventListener("click", () => {

    document.querySelectorAll(".tab-btn")
      .forEach(b => b.classList.remove("ativa"));

    document.querySelectorAll(".tab-content")
      .forEach(c => c.classList.remove("ativa"));

    btn.classList.add("ativa");

    const tab = btn.dataset.tab;

    const content = document.getElementById("tab-" + tab);

    if (content) {
      content.classList.add("ativa");
    }

    if (tab === "subscricoes") {
      carregarSubscricoes();
    }

  });
  });

  await carregarTransacoes();

  const abaAtiva = document.querySelector(".tab-btn.ativa");
if (abaAtiva && abaAtiva.dataset.tab === "subscricoes") {
  await carregarSubscricoes();
}

  // ================================
  // FILTRO (com proteção)
  // ================================
  const filtro = document.getElementById("filtroTipo");

  if (filtro) {
    filtro.addEventListener("change", aplicarFiltros);
  }

});

// ================================
// CARREGAR
// ================================
async function carregarTransacoes() {
  const lista = document.getElementById("listaTransacoes");

  const res = await fetch("/api/cliente/transacoes", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) {
    lista.innerHTML = `
  <div class="erro-transacoes">
    Não existem transações.<br>
  </div>
`;
    return;
  }

  todasTransacoes = await res.json();

  renderTransacoes(todasTransacoes);
}

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

function reclamar(id, tipo) {
  window.location.href =
    `/contato.html?transacao_id=${id}&tipo=${tipo}`;
}

async function carregarSubscricoes() {
 const lista = document.getElementById("listaSubscricoes");

  const res = await fetch("/api/cliente/subscricoes", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) {
    lista.innerHTML = "Erro ao carregar subscrições.";
    return;
  }

  const subscricoes = await res.json();

  renderSubscricoes(subscricoes);
}

function renderSubscricoes(subscricoes) {
  const lista = document.getElementById("listaSubscricoes");
  lista.innerHTML = "";

  if (!subscricoes.length) {
    lista.innerHTML = "Você não possui subscrições.";
    return;
  }

  subscricoes.forEach(v => {

    const ativa = v.ativo && new Date(v.expiration_at) > new Date();

    const statusBadge = ativa
      ? `<span class="badge-status badge-ativa">Ativa</span>`
      : `<span class="badge-status badge-expirada">Expirada</span>`;

    const card = document.createElement("div");
    card.className = "sub-vip-card";

    card.innerHTML = `
      <div class="sub-vip-info">

        ${statusBadge}

        <div class="transacao-tipo">
          Subscrição VIP
        </div>

        <div>
          <strong>Criadora:</strong> ${v.modelo}
        </div>

        <div>
          <strong>Data da assinatura/renovação:</strong>
          ${new Date(v.created_at).toLocaleDateString()}
        </div>

        <div>
          <strong>Termina em:</strong>
          ${new Date(v.expiration_at).toLocaleDateString()}
        </div>

        <div>
          <strong>Renovação automática:</strong>
          ${v.recorrente ? "Sim" : "Não"}
        </div>

        ${
          ativa
            ? `<button class="btn-cancelar"
                 onclick="cancelarSubscricao(${v.id})">
                 Cancelar subscrição
               </button>`
            : `<button class="btn-renovar"
                 onclick="renovarSubscricao(${v.modelo_id})">
                 Renovar subscrição
               </button>`
        }

      </div>
    `;

    lista.appendChild(card);

  });

}

async function cancelarSubscricao(id) {

  if (!confirm("Tem certeza que deseja cancelar esta subscrição?")) {
    return;
  }

  try {

    const res = await fetch(
      `/api/cliente/subscricoes/${id}/cancelar`,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token
        }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      mostrarMensagem(data.error || "Erro ao cancelar.", "erro");
      return;
    }

    mostrarMensagem(data.message || "Cancelada com sucesso.");

    // 🔄 Atualizar imediatamente
    await carregarSubscricoes();

  } catch (err) {
    mostrarMensagem("Erro inesperado.", "erro");
  }
}
window.cancelarSubscricao = cancelarSubscricao;

function mostrarMensagem(texto, tipo = "sucesso") {

  let msg = document.getElementById("msgSub");

  if (!msg) {
    msg = document.createElement("div");
    msg.id = "msgSub";
    msg.className = "msg-feedback";
    document.querySelector("#tab-subscricoes")
      .prepend(msg);
  }

  msg.innerText = texto;
  msg.className = "msg-feedback " + tipo;

  setTimeout(() => {
    msg.remove();
  }, 3000);
}

function renovarSubscricao(modeloId) {
  window.location.href = `/perfil.html?id=${modeloId}`;
}

window.renovarSubscricao = renovarSubscricao;