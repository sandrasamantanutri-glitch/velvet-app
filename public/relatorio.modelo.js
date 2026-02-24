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

 const totalMesAtual =
  Number(data.mes.midias || 0) +
  Number(data.mes.assinaturas || 0);

  document.getElementById("totalMesAtual").innerText =
  `R$ ${totalMesAtual.toFixed(2)}`;

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
async function carregarTransacoes(pagina = 1) {
  const lista = document.getElementById("listaTransacoes");
  const paginacao = document.getElementById("paginacaoTransacoes");

  if (!lista) {
    console.warn("listaTransacoes não existe nesta página");
    return;
  }

  lista.innerHTML = "Carregando transações...";
  if (paginacao) paginacao.innerHTML = "";

  const token = localStorage.getItem("token");
  if (!token) {
    lista.innerText = "Você não está logada.";
    return;
  }

  try {
    const res = await fetch(`/api/transacoes?page=${pagina}`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      lista.innerText = "Erro ao carregar transações.";
      return;
    }

    const data = await res.json();
    const dados = data.registros;

    lista.innerHTML = "";

    if (!dados.length) {
      lista.innerText = "Nenhuma transação encontrada.";
      return;
    }

    paginaAtualTransacoes = data.paginaAtual;

    dados.forEach(t => {
      lista.innerHTML += `
        <div class="transacao">
          <strong>#${t.codigo}</strong> · ${t.tipo}<br>
          ${new Date(t.created_at).toLocaleDateString("pt-BR")}<br>
          Valor: ${emReais(t.valor)}
        </div>
      `;
    });

    // 🔢 PAGINAÇÃO
    if (paginacao && data.totalPaginas > 1) {
      renderizarPaginacaoTransacoes(data.totalPaginas);
    }

  } catch (err) {
    console.error(err);
    lista.innerText = "Erro inesperado.";
  }
}

function renderizarPaginacaoTransacoes(totalPaginas) {
  const paginacao = document.getElementById("paginacaoTransacoes");
  if (!paginacao) return;

  paginacao.innerHTML = "";

  for (let i = 1; i <= totalPaginas; i++) {
    paginacao.innerHTML += `
      <button
        class="pagina ${i === paginaAtualTransacoes ? "ativa" : ""}"
        onclick="carregarTransacoes(${i})">
        ${i}
      </button>
    `;
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
    lista.innerText = "Não autenticada.";
    return;
  }

  try {
    const res = await fetch("/api/modelo/pagamentos", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const dados = await res.json();
    lista.innerHTML = "";

    if (!dados.length) {
      lista.innerText = "Nenhum pagamento encontrado.";
      return;
    }

    dados.forEach(p => {
      const inicio = new Date(p.mes);
      const fim = new Date(inicio);
      fim.setMonth(fim.getMonth() + 1);
      fim.setDate(fim.getDate() - 1);

      const statusTexto = p.status === "pago" ? "Pago" : "Pendente";
      const pagoEm = p.pago_em
        ? new Date(p.pago_em).toLocaleDateString("pt-BR")
        : "—";

      lista.innerHTML += `
        <div class="transacao">
          <div class="linha">
            <strong>Período:</strong>
            ${inicio.toLocaleDateString("pt-BR")}
            até
            ${fim.toLocaleDateString("pt-BR")}
          </div>

          <div class="linha">
            <strong>Status:</strong> ${statusTexto}
          </div>

          <div class="linha">
            <strong>Pago em:</strong> ${pagoEm}
          </div>

          <div class="linha">
            <strong>Mídias:</strong> R$ ${Number(p.total_midias).toFixed(2)}
          </div>

          <div class="linha">
            <strong>Assinaturas:</strong> R$ ${Number(p.total_assinaturas).toFixed(2)}
          </div>

          <div class="linha">
            <strong>Total:</strong> R$ ${Number(p.total_geral).toFixed(2)}
          </div>
        </div>
      `;
    });

  } catch (err) {
    console.error(err);
    lista.innerText = "Erro ao carregar pagamentos.";
  }
}

function alteracaoBloqueada() {
  const hoje = new Date();
  const dia = hoje.getDate();

  // bloqueia do dia 5 até o dia do pagamento (10)
  return dia >= 5 && dia <= 10;
}

function mostrarStatusDadosBancarios(status) {
  const box = document.getElementById("statusDadosBancarios");
  if (!box) return;

  box.style.display = "block";
  box.className = "status-box";

  if (status === "aprovado") {
    box.classList.add("status-aprovado");
    box.innerText = "Status: Aprovado";
    return;
  }

  box.style.display = "none";
}

let statusAtual = null;

async function carregarDadosBancarios() {
  console.log("Form:", document.getElementById("formDadosBancarios"));
  const token = localStorage.getItem("token");
  const res = await fetch("/api/modelo/dados-bancarios", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const dados = await res.json();
  if (!dados) return;

  // 🔹 guarda status global
  statusAtual = dados.status;
  mostrarStatusDadosBancarios(statusAtual);

  // 🔹 inputs
  const tipoRecebimento = document.getElementById("tipoRecebimento");
  const titularNome = document.getElementById("titularNome");
  const titularDocumento = document.getElementById("titularDocumento");
  const confirmarTitular = document.getElementById("confirmarTitular");

  const pixCampos = document.getElementById("pixCampos");
  const pixTipo = document.getElementById("pixTipo");
  const pixChave = document.getElementById("pixChave");

  const transferenciaCampos = document.getElementById("transferenciaCampos");
  const banco = document.getElementById("banco");
  const agencia = document.getElementById("agencia");
  const conta = document.getElementById("conta");
  const contaTipo = document.getElementById("contaTipo");


const form = document.getElementById("formDadosBancarios");
const btnAlterar = document.getElementById("btnAlterarDados");


  // 🔹 preencher campos comuns
  tipoRecebimento.value = dados.tipo;
  titularNome.value = dados.titular_nome;
  titularDocumento.value = dados.titular_documento;
  confirmarTitular.checked = true;

  // 🔹 PIX
  if (dados.tipo === "pix") {
    pixCampos.style.display = "block";
    transferenciaCampos.style.display = "none";
    pixTipo.value = dados.pix_tipo;
    pixChave.value = dados.pix_chave;
  }

  // 🔹 TRANSFERÊNCIA
  if (dados.tipo === "transferencia") {
    transferenciaCampos.style.display = "block";
    pixCampos.style.display = "none";
    banco.value = dados.banco;
    agencia.value = dados.agencia;
    conta.value = dados.conta;
    contaTipo.value = dados.conta_tipo;
  }

  // 🔒 CONTROLE DE ESTADO
  if (statusAtual === "aprovado") {
  if (btnAlterar) {
  btnAlterar.style.display = "inline-block";
}
  return;
}

if (statusAtual === "pendente") {
  if (btnAlterar) {
  btnAlterar.style.display = "none";
}
  return;
}

  if (statusAtual === "alteracao_pendente") {
  btnAlterar.style.display = "none";
  mostrarAviso("Alteração enviada. Aguardando aprovação.");
  return;
}
 if (alteracaoBloqueada()) {
  btnAlterar.style.display = "none";
  mostrarAviso(
    "Alterações de dados bancários estão temporariamente bloqueadas devido ao período de pagamento."
  );
  return;
}
  liberarFormulario(document.getElementById("formDadosBancarios"));
}

function mostrarAviso(texto) {
  const aviso = document.createElement("div");
  aviso.className = "card";
  aviso.style.background = "#fff7e6";
  aviso.style.marginBottom = "16px";
  aviso.innerText = texto;

  document
    .getElementById("tab-dados-bancarios")
    .prepend(aviso);
}

function liberarFormulario(form) {
  if (!form) return;

  form.querySelectorAll("input, select, textarea").forEach(el => {
    el.disabled = false;
  });
}

function bloquearFormulario(form) {
  if (!form) return;

  form.querySelectorAll("input, select, textarea").forEach(el => {
    el.disabled = true;
  });
}


let paginaAtualTransacoes = 1;

document.addEventListener("DOMContentLoaded", () => {
  carregarResumoModelo();

  // ===============================
  // TABS
  // ===============================
  document.querySelectorAll(".tabs .tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const tabContent = document.getElementById(`tab-${btn.dataset.tab}`);
      if (tabContent) {
        tabContent.classList.add("active");
      }

      if (btn.dataset.tab === "transacoes") carregarTransacoes(1);
      if (btn.dataset.tab === "pagamentos") carregarPagamentos();
      if (btn.dataset.tab === "dados-bancarios") carregarDadosBancarios();
    });
  });

  // ===============================
  // FORM DADOS BANCÁRIOS
  // ===============================

  const form = document.getElementById("formDadosBancarios");

if (!form) {
  console.warn("Form de dados bancários não encontrado");
  return;
}

  const tipoRecebimento = document.getElementById("tipoRecebimento");
  const pixCampos = document.getElementById("pixCampos");
  const pixTipo = document.getElementById("pixTipo");
  const pixChave = document.getElementById("pixChave");

  const transferenciaCampos = document.getElementById("transferenciaCampos");
  const banco = document.getElementById("banco");
  const agencia = document.getElementById("agencia");
  const conta = document.getElementById("conta");
  const contaTipo = document.getElementById("contaTipo");

  const titularNome = document.getElementById("titularNome");
  const titularDocumento = document.getElementById("titularDocumento");
  const confirmarTitular = document.getElementById("confirmarTitular");
  const justificativa = document.getElementById("justificativa");

  const btnAlterar = document.getElementById("btnAlterarDados");

  // 🔁 troca de tipo
  tipoRecebimento.addEventListener("change", () => {
    pixCampos.style.display = tipoRecebimento.value === "pix" ? "block" : "none";
    transferenciaCampos.style.display =
      tipoRecebimento.value === "transferencia" ? "block" : "none";
  });

  // ✏️ botão alterar
  btnAlterar?.addEventListener("click", () => {
  if (statusAtual !== "aprovado") return;

  liberarFormulario(form);
  const justificativaBox = document.getElementById("justificativaBox");
  const justificativa = document.getElementById("justificativa");

  justificativaBox.style.display = "block";
  justificativa.disabled = false;
  justificativa.focus();
  document.getElementById("justificativaBox").style.display = "block";
 });


  // 📤 SUBMIT ÚNICO
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const endpoint =
      statusAtual === "aprovado"
        ? "/api/modelo/dados-bancarios/alterar"
        : "/api/modelo/dados-bancarios";

    const payload = {
      tipo: tipoRecebimento.value,
      pix_tipo: pixTipo.value,
      pix_chave: pixChave.value,
      banco: banco.value,
      agencia: agencia.value,
      conta: conta.value,
      conta_tipo: contaTipo.value,
      titular_nome: titularNome.value,
      titular_documento: titularDocumento.value,
      confirmado_titular: confirmarTitular.checked,
      justificativa: justificativa?.value || null
    };

    if (statusAtual === "aprovado" && !justificativa.value.trim()) {
  alert("Informe a justificativa para alteração dos dados.");
  return;
}

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify(payload)
    });

    const r = await res.json();
    if (!res.ok) {
      alert(r.error);
      return;
    }

    alert("Dados enviados para validação");

// 🔄 atualiza estado local
statusAtual =
  statusAtual === "aprovado"
    ? "alteracao_pendente"
    : "pendente";

// 🔒 bloqueia novamente
bloquearFormulario(form);

// 🟡 atualiza status visual
mostrarStatusDadosBancarios(statusAtual);

// 🧹 esconde justificativa
const justificativaBox = document.getElementById("justificativaBox");
if (justificativaBox) justificativaBox.style.display = "none";

// 🔁 recarrega dados (opcional, mas recomendado)
await carregarDadosBancarios();

  });
});

