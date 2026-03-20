const token = localStorage.getItem("token");
const params = new URLSearchParams(window.location.search);
const cliente_id = Number(params.get("cliente_id"));

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarData(data) {
  if (!data) return "-";

  try {
    return new Date(data).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return data;
  }
}

function obterLabelTipo(tipo) {
  return tipo === "assinatura" ? "Assinatura" : "Mídia";
}

function obterClasseBadge(tipo) {
  return tipo === "assinatura"
    ? "badge badge-assinatura"
    : "badge badge-conteudo";
}

function renderTransacoes(lista) {
  const container = document.getElementById("listaTransacoes");

  if (!container) return;

  if (!Array.isArray(lista) || !lista.length) {
    container.innerHTML = `<div class="estado-vazio">Nenhuma transação encontrada para este cliente.</div>`;
    return;
  }

  container.innerHTML = lista.map(item => `
    <div class="transacao-item">
      <div class="transacao-esquerda">
        <span class="${obterClasseBadge(item.tipo)}">${obterLabelTipo(item.tipo)}</span>

        <div class="transacao-meta">
          <strong>ID transação:</strong> ${item.id} · <strong>tipo:</strong> ${item.tipo || "-"}
        </div>

        <div class="transacao-data">
          <strong>Data e hora:</strong> ${formatarData(item.created_at)}
        </div>
      </div>

      <div class="transacao-direita">
        <div class="transacao-valor">
          <strong>Valor:</strong> ${formatarMoeda(item.valor_modelo)} de valor_modelo
        </div>

        <div class="transacao-status">
          <strong>Status:</strong> ${item.status || "-"}
        </div>
      </div>
    </div>
  `).join("");
}

function preencherResumo(lista) {
  const totalCompras = document.getElementById("totalCompras");
  const valorTotalPago = document.getElementById("valorTotalPago");
  const totalConteudos = document.getElementById("totalConteudos");
  const totalAssinaturas = document.getElementById("totalAssinaturas");

  const total = lista.length;
  const soma = lista.reduce((acc, item) => acc + Number(item.valor_modelo || 0), 0);
  const qtdConteudos = lista.filter(item => item.tipo === "midia").length;
  const qtdAssinaturas = lista.filter(item => item.tipo === "assinatura").length;

  if (totalCompras) totalCompras.textContent = total;
  if (valorTotalPago) valorTotalPago.textContent = formatarMoeda(soma);
  if (totalConteudos) totalConteudos.textContent = qtdConteudos;
  if (totalAssinaturas) totalAssinaturas.textContent = qtdAssinaturas;
}

function preencherCliente(cliente, total) {
  const nome = document.getElementById("clienteNome");
  const avatar = document.getElementById("clienteAvatar");
  const resumo = document.getElementById("clienteResumo");

  if (nome) nome.textContent = cliente?.nome || "Cliente";
  if (avatar) avatar.src = cliente?.avatar_url || "/assets/avatar.png";
  if (resumo) resumo.textContent = `${total} transação(ões) encontrada(s)`;
}

async function carregarTransacoesCliente() {
  const lista = document.getElementById("listaTransacoes");

  if (!token) {
    if (lista) {
      lista.innerHTML = `<div class="estado-vazio">Token não encontrado.</div>`;
    }
    return;
  }

  if (!cliente_id) {
    if (lista) {
      lista.innerHTML = `<div class="estado-vazio">cliente_id inválido.</div>`;
    }
    return;
  }

  try {
    const res = await fetch(`/api/modelo/clientes/${cliente_id}/transacoes`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (lista) {
        lista.innerHTML = `<div class="estado-vazio">${data.error || "Erro ao carregar transações."}</div>`;
      }
      return;
    }

    preencherCliente(data.cliente, data.totalRegistros || 0);
    preencherResumo(data.registros || []);
    renderTransacoes(data.registros || []);

  } catch (err) {
    console.error("Erro carregarTransacoesCliente:", err);

    if (lista) {
      lista.innerHTML = `<div class="estado-vazio">Erro ao carregar transações.</div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  carregarTransacoesCliente();
});