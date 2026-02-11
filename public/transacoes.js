document.addEventListener("DOMContentLoaded", carregarTransacoes);

async function carregarTransacoes() {
  const token = localStorage.getItem("token");

  const res = await fetch("/api/transacoes_cliente", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const lista = document.getElementById("listaTransacoes");

  if (!res.ok) {
    lista.innerHTML = "Erro ao carregar transações.";
    return;
  }

  const transacoes = await res.json();

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
          ${t.tipo === "assinatura" ? "Assinatura VIP" : "Conteúdo Premium"}
        </div>
        <div class="transacao-data">
          ${new Date(t.created_at).toLocaleString()}
        </div>
        <div class="transacao-valor">
          R$ ${Number(t.valor).toFixed(2)}
        </div>
        ${
          t.status !== "pago"
            ? `<button class="btn-reclamar" onclick="reclamar(${t.id})">
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

function reclamar(id, tipo) {
  window.location.href =
    `/contato.html?transacao_id=${id}&tipo=${tipo}`;

  carregarTransacoes();
}
