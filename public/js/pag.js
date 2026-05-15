window.__CLIENTE_VIP__ = false;
window.__VIP_READY__ = false;

let pagamentoAtual = window.pagamentoAtual || {};
let pagamentoEmProcesso = false;
window.pagamentoAtual = pagamentoAtual;
window.__PAGAMENTO_CONFIRMADO_ATUAL__ = null;
window.CURRENCY_ATUAL = "brl";

// Asaas — gateway de pagamentos

let pollingPixInterval = null;
let pollingCartaoInterval = null;

function whenSocketReady(cb, { timeoutMs = 8000, intervalMs = 50 } = {}) {
  if (window.socket) {
    cb(window.socket);
    return;
  }

  const startedAt = Date.now();

  const interval = setInterval(() => {
    if (window.socket) {
      clearInterval(interval);
      cb(window.socket);
      return;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      clearInterval(interval);
      console.warn("Socket não ficou disponível dentro do tempo esperado.");
    }
  }, intervalMs);
}

function selecionarMoeda(moeda) {
  window.CURRENCY_ATUAL = moeda === "usd" ? "usd" : "brl";

  document.querySelectorAll(".btn-moeda").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.moeda === window.CURRENCY_ATUAL);
  });

  // PIX só disponível em BRL
  const btnPix = document.getElementById("btnEscolherPix") || document.querySelector("[onclick*='pix']");
  if (btnPix) {
    btnPix.disabled = window.CURRENCY_ATUAL === "usd";
    btnPix.style.opacity = window.CURRENCY_ATUAL === "usd" ? "0.4" : "1";
    btnPix.title = window.CURRENCY_ATUAL === "usd" ? "Pix disponível apenas em Real (R$)" : "";
  }

  // CPF e telefone só visíveis em BRL
  const isUsd = window.CURRENCY_ATUAL === "usd";
  document.getElementById("campoCpf")?.classList.toggle("hidden", isUsd);
  document.getElementById("campoTelefone")?.classList.toggle("hidden", isUsd);
}

function abrirPopupPagamento() {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) return;

  popup.classList.remove("hidden");

  // reset moeda para BRL ao abrir
  window.CURRENCY_ATUAL = "brl";
  document.querySelectorAll(".btn-moeda").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.moeda === "brl");
  });

  const btnPix = document.getElementById("btnEscolherPix") || document.querySelector("[onclick*='pix']");
  if (btnPix) {
    btnPix.disabled = false;
    btnPix.style.opacity = "1";
    btnPix.title = "";
  }

  resetarEstadoPix();
  resetarEstadoCartao();

  document.getElementById("etapaPagamentoInicial")?.classList.remove("hidden");
  document.getElementById("etapaPagamentoPix")?.classList.add("hidden");
  document.getElementById("etapaPagamentoCartao")?.classList.add("hidden");

  prepararPagamento();
}

function validarDadosIniciaisPagamento() {
  const cpf = obterCpfValido();
  if (!cpf) {
    return false;
  }

  const telefone = obterTelefoneValido();
  if (!telefone) {
    return false;
  }

  const aceites = obterAceitesPagamento();
  if (!aceites) return false;

  return true;
}

function obterAceitesPagamento() {
  const aceitouTermos = !!document.getElementById("aceiteTermosPagamento")?.checked;
  const aceitouExecucaoImediata = !!document.getElementById("aceiteExecucaoImediata")?.checked;

if (!aceitouTermos) {
  alert(t("pag.aceite_termos_obrigatorio"));
  return null;
}

if (!aceitouExecucaoImediata) {
  alert(t("pag.aceite_execucao_obrigatorio"));
  return null;
}

  return {
    aceitou_termos: aceitouTermos,
    aceitou_execucao_imediata: aceitouExecucaoImediata,
    aceite_timestamp: new Date().toISOString(),
    versao_termos: "2026-04-06"
  };
}

function irParaEtapaPagamento(tipo) {
  document.getElementById("etapaPagamentoInicial")?.classList.add("hidden");
  document.getElementById("etapaPagamentoPix")?.classList.add("hidden");
  document.getElementById("etapaPagamentoCartao")?.classList.add("hidden");

  if (tipo === "pix") {
    document.getElementById("etapaPagamentoPix")?.classList.remove("hidden");
  }

  if (tipo === "cartao") {
    document.getElementById("etapaPagamentoCartao")?.classList.remove("hidden");
  }
}

function voltarEtapaPagamento() {
  resetarEstadoPix();
  resetarEstadoCartao();

  // Restaura visibilidade de CPF/telefone conforme moeda atual
  const isUsd = window.CURRENCY_ATUAL === "usd";
  document.getElementById("campoCpf")?.classList.toggle("hidden", isUsd);
  document.getElementById("campoTelefone")?.classList.toggle("hidden", isUsd);

  document.getElementById("etapaPagamentoPix")?.classList.add("hidden");
  document.getElementById("etapaPagamentoCartao")?.classList.add("hidden");
  document.getElementById("etapaPagamentoInicial")?.classList.remove("hidden");
}
function iniciarCartaoVip() {
  const oferta = window.OFERTA_ATUAL || null;
  const plano = window.PLANO_VIP_ATUAL || window.MODELO_VIP_ATUAL || null;
  const modeloId = Number(window.MODELO_ID_ATUAL);

  let valorBase = 0;
  let valorFinal = 0;
  let desconto = 0;

  if (oferta) {
    valorBase = Number(oferta.valor_base || oferta.valor || 0);
    valorFinal = Number(oferta.valor_promocional || oferta.valor || valorBase);
    desconto = Math.max(0, valorBase - valorFinal);
  } else if (plano) {
    valorBase = Number(plano.valor || plano.preco || plano.valor_mensal || 0);
    valorFinal = valorBase;
    desconto = 0;
  } else {
    console.error("VIP sem oferta e sem plano.");
    return;
  }

  if (!modeloId) {
    console.error("MODELO_ID_ATUAL inválido.");
    return;
  }

  definirPagamentoAtualCartao({
    tipo: "vip",
    modelo_id: modeloId,
    valor: valorFinal,
    valor_base: valorBase,
    desconto
  });

  preencherResumoVIP({ valorBase, desconto });

  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
}

function iniciarCartaoPremium() {
  const premium = window.PREMIUM_ATUAL;

  if (!premium?.premium_post_id) {
    console.error("PREMIUM_ATUAL inválido:", premium);
    return;
  }

  definirPagamentoAtualCartao({
    tipo: "premium",
    premium_post_id: Number(premium.premium_post_id),
    valor: Number(premium.preco || 0),
    descricao: premium.descricao || ""
  });

  preencherResumoMidia({
    valor: Number(premium.preco || 0),
    descricao: premium.descricao || ""
  });

  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
}

function iniciarCartaoMidia() {
  const midia = window.MIDIA_VENDA_ATUAL;

  if (!midia?.conteudo_id) {
    console.error("MIDIA_VENDA_ATUAL inválida:", midia);
    return;
  }

  definirPagamentoAtualCartao({
    tipo: "midia",
    conteudo_id: Number(midia.conteudo_id),
    valor: Number(midia.preco || 0),
    descricao: midia.descricao || ""
  });

  preencherResumoMidia({
    valor: Number(midia.preco || 0),
    descricao: midia.descricao || ""
  });

  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
}

function montarFormularioCartao() {
  return;
}

function bindFormularioCartao() {
  return;
}

function resetarEstadoCartao() {
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
  document.getElementById("formStripePagamento")?.classList.remove("hidden");

  const btn = document.getElementById("btnConfirmarStripe");
  if (btn) {
    btn.disabled = false;
    btn.innerText = (typeof t === "function" ? t("pagamento.btn_confirmar_stripe") : null) || "Confirmar pagamento";
  }

  const container = document.getElementById("asaas-card-form");
  if (container) {
    container.innerHTML = "";
    delete container.dataset.rendered;
  }
}

function mostrarLoadingCartao() {
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
  document.getElementById("cartaoLoading")?.classList.remove("hidden");
  document.getElementById("formStripePagamento")?.classList.add("hidden");
}

function renderFormAsaasCartao() {
  const container = document.getElementById("asaas-card-form");
  if (!container || container.dataset.rendered === "true") return;
  container.dataset.rendered = "true";

  container.innerHTML = `
    <div class="asaas-form-grid">
      <div class="asaas-campo">
        <label>Nome no cartão</label>
        <input type="text" id="asaas-holder-name" placeholder="Como está no cartão" autocomplete="cc-name" />
      </div>
      <div class="asaas-campo">
        <label>Número do cartão</label>
        <input type="text" id="asaas-card-number" placeholder="0000 0000 0000 0000" maxlength="19" autocomplete="cc-number" inputmode="numeric" />
      </div>
      <div class="asaas-linha">
        <div class="asaas-campo">
          <label>Validade</label>
          <input type="text" id="asaas-expiry" placeholder="MM/AA" maxlength="5" autocomplete="cc-exp" inputmode="numeric" />
        </div>
        <div class="asaas-campo">
          <label>CVV</label>
          <input type="text" id="asaas-cvv" placeholder="000" maxlength="4" autocomplete="cc-csc" inputmode="numeric" />
        </div>
      </div>
      <div class="asaas-linha">
        <div class="asaas-campo">
          <label>CEP</label>
          <input type="text" id="asaas-postal-code" placeholder="00000-000" maxlength="9" inputmode="numeric" />
        </div>
        <div class="asaas-campo">
          <label>Nº / Complemento</label>
          <input type="text" id="asaas-address-number" placeholder="Ex: 59 casa 1" maxlength="30" />
        </div>
      </div>
    </div>
  `;

  document.getElementById("asaas-card-number")?.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 16);
    e.target.value = v.replace(/(.{4})/g, "$1 ").trim();
  });

  document.getElementById("asaas-expiry")?.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (v.length >= 2) v = v.slice(0, 2) + "/" + v.slice(2);
    e.target.value = v;
  });

  document.getElementById("asaas-postal-code")?.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
    e.target.value = v;
  });
}

function obterDadosCartaoAsaas() {
  const holderName = (document.getElementById("asaas-holder-name")?.value || "").trim();
  const cardNumber = (document.getElementById("asaas-card-number")?.value || "").replace(/\s/g, "");
  const expiry    = (document.getElementById("asaas-expiry")?.value || "");
  const ccv       = (document.getElementById("asaas-cvv")?.value || "").trim();
  const postalCode = (document.getElementById("asaas-postal-code")?.value || "").replace(/\D/g, "");
  const addressNumber = (document.getElementById("asaas-address-number")?.value || "").trim();

  const [expMonth = "", expRest = ""] = expiry.split("/");
  const expYear = expRest.length === 2 ? "20" + expRest : expRest;

  if (!holderName)              { alert(t("pag.holder_name_obrigatorio") || "Informe o nome no cartão."); return null; }
  if (cardNumber.length < 13)   { alert(t("pag.card_number_invalido")    || "Número do cartão inválido."); return null; }
  if (expMonth.length !== 2 || expYear.length !== 4) { alert(t("pag.expiry_invalido") || "Validade inválida (MM/AA)."); return null; }
  if (ccv.length < 3)           { alert(t("pag.cvv_invalido")            || "CVV inválido."); return null; }
  if (postalCode.length !== 8)  { alert(t("pag.cep_invalido")            || "CEP inválido."); return null; }
  if (!addressNumber)           { alert(t("pag.address_number_obrigatorio") || "Informe o número do endereço."); return null; }

  return { holderName, cardNumber, expiryMonth: expMonth, expiryYear: expYear, ccv, postalCode, addressNumber };
}

async function confirmarPagamentoAsaasCartao() {
  if (pagamentoEmProcesso) return { sucesso: false };
  pagamentoEmProcesso = true;

  try {
    const cartao = obterDadosCartaoAsaas();
    if (!cartao) { pagamentoEmProcesso = false; return { sucesso: false }; }

    const aceites = obterAceitesPagamento();
    if (!aceites) { pagamentoEmProcesso = false; return { sucesso: false }; }

    const tipo = pagamentoAtual?.tipo || window.PAGAMENTO_TIPO_ATUAL;
    if (!tipo) { alert(t("pag.tipo_pagamento_nao_identificado")); pagamentoEmProcesso = false; return { sucesso: false }; }

    mostrarLoadingCartao();
    atualizarStatusCartao(t("pag.confirmando_pagamento") || "Processando...");

    const payload = {
      ...aceites,
      ...cartao,
      cpf: obterCpfValido(),
      telefone: window.CURRENCY_ATUAL !== "usd" ? obterTelefoneValido() : undefined,
      currency: window.CURRENCY_ATUAL || "brl",
      fingerprint: gerarFingerprint()
    };

    if (tipo === "vip")     { payload.modelo_id = pagamentoAtual.modelo_id; }
    if (tipo === "midia")   { payload.conteudo_id = pagamentoAtual.conteudo_id; payload.modelo_id = pagamentoAtual.modelo_id; }
    if (tipo === "premium") { payload.premium_post_id = pagamentoAtual.premium_post_id; payload.modelo_id = pagamentoAtual.modelo_id; }

    const res = await fetch(`/api/pagamento/${tipo}/cartao`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      document.getElementById("cartaoLoading")?.classList.add("hidden");
      document.getElementById("formStripePagamento")?.classList.remove("hidden");
      atualizarStatusCartao(t("pag.falha_pagamento") || "Falha no pagamento");
      alert(data.error || t("pag.erro_confirmar_pagamento") || "Erro no pagamento.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    if (data.payment_id) pagamentoAtual.payment_id = data.payment_id;

    if (data.status === "pago" || data.status === "CONFIRMED") {
      document.getElementById("cartaoLoading")?.classList.add("hidden");
      document.getElementById("cartaoSucesso")?.classList.remove("hidden");
    } else {
      atualizarStatusCartao(t("pag.aguardando_confirmacao") || "Aguardando...");
    }

    if (pagamentoAtual.payment_id) {
      iniciarPollingPagamento(
        pagamentoAtual.payment_id,
        pagamentoAtual.premium_post_id || pagamentoAtual.message_id || pagamentoAtual.modelo_id,
        "cartao"
      );
    }

    pagamentoEmProcesso = false;
    return { sucesso: true, aguardando_confirmacao: data.status !== "pago" };

  } catch (err) {
    console.error("Erro confirmarPagamentoAsaasCartao:", err);
    document.getElementById("cartaoLoading")?.classList.add("hidden");
    document.getElementById("formStripePagamento")?.classList.remove("hidden");
    atualizarStatusCartao(t("pag.falha_pagamento") || "Falha");
    alert(err.message || t("pag.erro_inesperado_pagamento") || "Erro inesperado.");
    pagamentoEmProcesso = false;
    return { sucesso: false };
  }
}

async function inicializarFluxoCartaoAsaas() {
  try {
    resetarEstadoCartao();

    const form = document.getElementById("formStripePagamento");
    const container = document.getElementById("asaas-card-form");
    const btn = document.getElementById("btnConfirmarStripe");

    if (!form || !container) throw new Error("Formulário de cartão não encontrado.");

    form.classList.remove("hidden");
    if (btn) btn.disabled = false;
    atualizarStatusCartao(t("pagamento.btn_confirmar_stripe") || "Confirmar pagamento");

    renderFormAsaasCartao();
    bindFormularioAsaasPagamento();
  } catch (err) {
    console.error("Erro ao inicializar fluxo cartão Asaas:", err);
    alert(err.message || t("pag.erro_preparar_cartao") || "Erro ao preparar pagamento.");
  }
}

async function mostrarMetodo(tipo) {
  alternarCamposPorMetodo(tipo);

  if (tipo === "pix") {
    if (!validarDadosIniciaisPagamento()) return;
    resetarEstadoCartao();
    resetarEstadoPix();
    irParaEtapaPagamento("pix");
    setTimeout(() => confirmarPix(), 200);
    return;
  }

  if (tipo === "cartao") {
    const aceites = obterAceitesPagamento();
    if (!aceites) return;
    resetarEstadoPix();
    irParaEtapaPagamento("cartao");
    if (window.PAGAMENTO_TIPO_ATUAL === "vip")     iniciarCartaoVip();
    if (window.PAGAMENTO_TIPO_ATUAL === "midia")   iniciarCartaoMidia();
    if (window.PAGAMENTO_TIPO_ATUAL === "premium") iniciarCartaoPremium();
    await inicializarFluxoCartaoAsaas();
    return;
  }

  console.warn("Método de pagamento inválido:", tipo);
}

function bindFormularioAsaasPagamento() {
  const form = document.getElementById("formStripePagamento");
  const btn  = document.getElementById("btnConfirmarStripe");

  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (btn) btn.disabled = true;
    atualizarStatusCartao(t("pag.processando") || "Processando...");

    try {
      const resultado = await confirmarPagamentoAsaasCartao();
      if (!resultado?.sucesso) {
        if (btn) btn.disabled = false;
        atualizarStatusCartao(t("pagamento.btn_confirmar_stripe") || "Confirmar pagamento");
      }
    } catch (err) {
      console.error("Erro submit Asaas:", err);
      if (btn) btn.disabled = false;
      atualizarStatusCartao(t("pagamento.btn_confirmar_stripe") || "Confirmar pagamento");
    }
  });
}

function atualizarStatusCartao(texto) {
  const btn =
    document.getElementById("btnConfirmarStripe") ||
    document.getElementById("btnConfirmarCartao") ||
    document.getElementById("confirmarPagamento");

  if (btn) {
    btn.innerText = texto;
  }
}

window.fecharPopupPagamento = function () {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) return;

  try {
    if (typeof pollingPixInterval !== "undefined" && pollingPixInterval) {
      clearInterval(pollingPixInterval);
      pollingPixInterval = null;
    }

    if (typeof pollingCartaoInterval !== "undefined" && pollingCartaoInterval) {
      clearInterval(pollingCartaoInterval);
      pollingCartaoInterval = null;
    }
  } catch (err) {
    console.error("Erro ao limpar intervals do popup:", err);
  }

  popup.classList.add("hidden");

  resetarEstadoPix();
  resetarEstadoCartao();

  document.getElementById("etapaPagamentoInicial")?.classList.remove("hidden");
  document.getElementById("etapaPagamentoPix")?.classList.add("hidden");
  document.getElementById("etapaPagamentoCartao")?.classList.add("hidden");

  pagamentoAtual = {};
  window.pagamentoAtual = pagamentoAtual;
  window.MIDIA_VENDA_ATUAL = null;
  pagamentoEmProcesso = false;

  limparPagamentoConfirmado();
};

function definirPagamentoAtualCartao(dados = {}) {
  pagamentoAtual = {
    ...pagamentoAtual,
    ...dados
  };

  window.pagamentoAtual = pagamentoAtual;
}

function prepararPagamento() {
  document.querySelector(".vip-detalhes")?.classList.add("hidden");
  document.querySelector(".midia-detalhes")?.classList.add("hidden");

  if (window.PAGAMENTO_TIPO_ATUAL === "vip") {
    const oferta = window.OFERTA_ATUAL || null;
    const plano = window.PLANO_VIP_ATUAL || window.MODELO_VIP_ATUAL || null;

    let valorBase = 0;
    let desconto = 0;

    if (oferta) {
      valorBase = Number(oferta.valor_base || oferta.valor || 0);
      const valorFinal = Number(
        oferta.valor_promocional || oferta.valor || valorBase
      );
      desconto = Math.max(0, valorBase - valorFinal);
    } else if (plano) {
      valorBase = Number(plano.valor || plano.preco || plano.valor_mensal || 0);
      desconto = 0;
      console.warn("Sem oferta VIP, usando valor do plano");
    } else {
      console.error("Nem OFERTA_ATUAL nem PLANO_VIP_ATUAL definidos para VIP");
      return;
    }

    preencherResumoVIP({
      valorBase,
      desconto
    });

    document.querySelector(".vip-detalhes")?.classList.remove("hidden");
    return;
  }

  if (window.PAGAMENTO_TIPO_ATUAL === "premium") {
    const premium = window.PREMIUM_ATUAL;

    if (!premium || !premium.preco) {
      console.error("PREMIUM_ATUAL inválido:", premium);
      return;
    }

    preencherResumoMidia({
      valor: Number(premium.preco),
      descricao: premium.descricao
    });

    document.querySelector(".midia-detalhes")?.classList.remove("hidden");
    return;
  }

  if (window.PAGAMENTO_TIPO_ATUAL === "midia") {
    const midia = window.MIDIA_VENDA_ATUAL;

    if (!midia || !midia.preco) {
      console.error("MIDIA_VENDA_ATUAL inválida:", midia);
      return;
    }

    preencherResumoMidia({
      valor: Number(midia.preco),
      descricao: midia.descricao
    });

    document.querySelector(".midia-detalhes")?.classList.remove("hidden");
    return;
  }
}

// Taxa Asaas: R$ 1,99 fixo + 10% do valor com desconto
function calcTaxaAsaas(valorComDesconto) {
  const taxa  = Number((1.99 + valorComDesconto * 0.10).toFixed(2));
  const total = Number((valorComDesconto + taxa).toFixed(2));
  return { taxa, total };
}

function preencherResumoVIP({ valorBase = 0, desconto = 0 }) {
  valorBase = Number(valorBase || 0);
  desconto  = Number(desconto  || 0);

  const valorComDesconto = Math.max(0, valorBase - desconto);
  const { taxa, total }  = calcTaxaAsaas(valorComDesconto);

  document.getElementById("vipValorBase").textContent =
    valorBase.toFixed(2).replace(".", ",");

  document.getElementById("vipDesconto").textContent =
    desconto.toFixed(2).replace(".", ",");

  document.getElementById("vipTaxa").textContent =
    taxa.toFixed(2).replace(".", ",");

  document.getElementById("vipTotal").textContent =
    total.toFixed(2).replace(".", ",");
}

function preencherResumoMidia({ valor = 0, desconto = 0, descricao = "" }) {
  valor   = Number(valor   || 0);
  desconto = Number(desconto || 0);

  const valorComDesconto = Math.max(0, valor - desconto);
  const { taxa, total }  = calcTaxaAsaas(valorComDesconto);

  document.getElementById("midiaValorBase").textContent =
    valor.toFixed(2).replace(".", ",");

  const elDesc = document.getElementById("midiaDesconto");
  if (elDesc) elDesc.textContent = desconto.toFixed(2).replace(".", ",");

  document.getElementById("midiaTaxa").textContent =
    taxa.toFixed(2).replace(".", ",");

  document.getElementById("midiaTotal").textContent =
    total.toFixed(2).replace(".", ",");

const boxMidia =
  document.querySelector(".midia-beneficios") ||
  document.querySelector(".vip-beneficios");

if (boxMidia) {
  boxMidia.innerHTML = `
    ${descricao || "Acesso Imediato"}
  `;
  }
}

function valorBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function obterCpfValido() {
  const input =
    document.getElementById("cpfPagamento") ||
    document.getElementById("cpfEscolha");

  if (!input) {
   alert(t("pag.cpf_campo_nao_encontrado"));
    return null;
  }

  const cpf = String(input.value || "").replace(/\D/g, "");

  if (cpf.length !== 11) {
   alert(t("pag.cpf_invalido"));
    input.focus();
    return null;
  }

  return cpf;
}

function obterTelefoneValido() {
  const input =
    document.getElementById("phonePagamento") ||
    document.getElementById("card_phone") ||
    document.getElementById("phone");

  if (!input) {
    alert(t("pag.telefone_campo_nao_encontrado"));
    return null;
  }

  const telefone = String(input.value || "").replace(/\D/g, "");

  if (telefone.length < 10 || telefone.length > 11) {
    alert(t("pag.telefone_invalido"));
    input.focus();
    return null;
  }

  return telefone;
}

const phonePix = document.getElementById("phonePagamento");

function aplicarMascaraTelefone(input) {
  if (!input || input.dataset.maskBound) return;

  input.dataset.maskBound = "true";

  input.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 11);

    if (v.length > 10) {
      v = v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    } else if (v.length > 6) {
      v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    } else if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d{0,5}).*/, "($1) $2");
    } else if (v.length > 0) {
      v = v.replace(/^(\d*)/, "($1");
    }

    e.target.value = v;
  });
}

aplicarMascaraTelefone(phonePix);


function resetarEstadoPix() {
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
  document.getElementById("pixSucesso")?.classList.add("hidden");

  const qr = document.getElementById("pixQr");
  const codigo = document.getElementById("pixCodigo");
  const btn = document.getElementById("btnCopiarPix");

  if (qr) {
    qr.src = "";
    qr.classList.add("hidden");
  }

  if (codigo) {
    codigo.value = "";
    codigo.classList.add("hidden");
  }

  btn?.classList.add("hidden");
}

window.pagarComPix = async function ({ tipo, modelo_id, conteudo_id, premium_post_id }) {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
    alert(t("pag.sessao_expirada"));
      return;
    }

    const cpf = document
      .getElementById("cpfPagamento")
      ?.value
      ?.replace(/\D/g, "");

    const aceites = obterAceitesPagamento();
    if (!aceites || !cpf || cpf.length !== 11) {
    alert(t("pag.cpf_aceites_obrigatorios"));
      return;
    }

    const aceitou_termos = aceites.aceitou_termos;
    const aceitou_execucao_imediata = aceites.aceitou_execucao_imediata;
    const aceite_timestamp = aceites.aceite_timestamp;
    const versao_termos = aceites.versao_termos;

    abrirPopupPagamentoPixLoading();

    let url = "";
    let body = {};

    if (tipo === "vip") {
      const modeloIdFinal = Number(modelo_id || window.MODELO_ID_ATUAL);

      if (!modeloIdFinal) {
        console.error("modelo_id inválido:", modelo_id, window.MODELO_ID_ATUAL);
        alert(t("pag.modelo_nao_identificado"));
        return;
      }

      const telefoneLimpo = obterTelefoneValido();
      if (!telefoneLimpo) return;

      url = "/api/pagamento/vip/pix";
      body = {
        tipo: "vip",
        modelo_id: modeloIdFinal,
        cpf,
        telefone: telefoneLimpo,
        aceitou_termos,
        aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos,
        fingerprint: gerarFingerprint()
      };
    }

    if (tipo === "premium") {
      const telefoneLimpo = obterTelefoneValido();
      if (!telefoneLimpo) return;

      url = "/api/pagamento/premium/pix";
      body = {
        tipo: "premium",
        premium_post_id,
        cpf,
        telefone: telefoneLimpo,
        aceitou_termos,
        aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos,
        fingerprint: gerarFingerprint()
      };
    }

    if (tipo === "midia") {
      const telefoneLimpo = obterTelefoneValido();
      if (!telefoneLimpo) return;

      url = "/api/pagamento/midia/pix";
      body = {
        tipo: "midia",
        conteudo_id,
        cpf,
        telefone: telefoneLimpo,
        aceitou_termos,
        aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos,
        fingerprint: gerarFingerprint()
      };
    }

    if (!url) {
      alert(t("pag.tipo_pagamento_invalido"));
      return;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const erro = await lerErroResposta(res);
      throw new Error(erro);
    }

    const data = await res.json();

    const qr = document.getElementById("pixQr");
    const codigo = document.getElementById("pixCodigo");
    const btnCopiar = document.getElementById("btnCopiarPix");

    const qrCodeUrl =
      data.qr_code_url ||
      (data.qr_code_base64 ? `data:image/png;base64,${data.qr_code_base64}` : null);

    const copiaCola =
      data.copia_cola ||
      data.qr_code ||
      "";

    const orderId =
      data.order_id ||
      data.payment_id ||
      null;

    if (!qrCodeUrl || !orderId) {
     alert(t("pag.erro_gerar_qr"));
      return;
    }

    if (qr) {
      qr.src = qrCodeUrl;
      qr.classList.remove("hidden");
    }

    if (codigo) {
      codigo.value = copiaCola;
      codigo.classList.remove("hidden");
    }

    btnCopiar?.classList.remove("hidden");

    document.getElementById("pixLoading")?.classList.add("hidden");
    document.getElementById("pixAguardando")?.classList.remove("hidden");

    console.log("PIX RESPONSE:", data);

    iniciarVerificacaoPix(orderId);

  } catch (err) {
    document.getElementById("pixLoading")?.classList.add("hidden");
    alert(err.message || t("pag.erro_gerar_pix"));
  }
};

async function copiarPix() {
  const input = document.getElementById("pixCodigo");

  if (!input || !input.value) {
   alert(t("pag.pix_indisponivel"));
    return;
  }

  try {
    input.select?.();
    input.setSelectionRange?.(0, 99999);
    await navigator.clipboard.writeText(input.value);
    alert(t("pag.pix_copiado"));
  } catch (err) {
    console.error("Erro ao copiar Pix:", err);
    alert(t("pag.erro_copiar_pix"));
  }
}

function abrirPopupPagamentoPixLoading() {
  const popup = document.getElementById("popupPagamentoVelvet");
  popup?.classList.remove("hidden");

  resetarEstadoCartao();
  resetarEstadoPix();

  document.getElementById("etapaPagamentoInicial")?.classList.add("hidden");
  document.getElementById("etapaPagamentoCartao")?.classList.add("hidden");
  document.getElementById("etapaPagamentoPix")?.classList.remove("hidden");

  document.getElementById("pixLoading")?.classList.remove("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
  document.getElementById("pixSucesso")?.classList.add("hidden");

  const qr = document.getElementById("pixQr");
  const codigo = document.getElementById("pixCodigo");
  const btnCopiar = document.getElementById("btnCopiarPix");

  if (qr) {
    qr.src = "";
    qr.classList.add("hidden");
  }

  if (codigo) {
    codigo.value = "";
    codigo.classList.add("hidden");
  }

  btnCopiar?.classList.add("hidden");
}

whenSocketReady((socket) => {

  socket.on("vipAtivado", async ({ cliente_id, modelo_id }) => {
    const meuClienteId = window.CLIENTE_ID;

    if (Number(cliente_id) !== Number(meuClienteId)) return;

    const confirmId = `vip_${cliente_id}_${modelo_id}`;
    if (!marcarPagamentoConfirmado(confirmId)) return;

    document.getElementById("pixLoading")?.classList.add("hidden");
    document.getElementById("pixAguardando")?.classList.add("hidden");
    document.getElementById("cartaoLoading")?.classList.add("hidden");
    document.getElementById("formStripePagamento")?.classList.add("hidden");

    document.getElementById("pixSucesso")?.classList.remove("hidden");
    document.getElementById("cartaoSucesso")?.classList.remove("hidden");

    setTimeout(async () => {
      fecharPopupPagamento();
      await aplicarRegrasDeAcesso?.();
      await carregarFeedBase?.();
      await carregarFeed?.();
      await carregarPremium?.();
    }, 1200);
  });

socket.on("conteudoVisto", async ({ message_id }) => {
  const confirmId = `midia_${message_id}`;
  if (!marcarPagamentoConfirmado(confirmId)) return;

  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("formStripePagamento")?.classList.add("hidden");

  document.getElementById("pixSucesso")?.classList.remove("hidden");
  document.getElementById("cartaoSucesso")?.classList.remove("hidden");

  setTimeout(async () => {
    window.fecharPopupPagamento?.();
    document.getElementById("popupPagamentoVelvet")?.classList.add("hidden");

    const res = await fetch(`/api/chat/conteudo/${message_id}`, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) return;

    const midias = await res.json();
    if (!midias.length) return;

    const midia = midias[0];

    abrirModalMidia(
      midia.url,
      midia.tipo_media === "video"
    );
  }, 800);
});

});

function pagamentoConfirmado() {
  // PIX
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");

  // Cartão
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("formStripePagamento")?.classList.add("hidden");

  // Sucesso
  document.getElementById("pixSucesso")?.classList.remove("hidden");
  document.getElementById("cartaoSucesso")?.classList.remove("hidden");

  setTimeout(() => {
    fecharPopupPagamento();
  }, 1200);
}

window.confirmarPix = function () {
  if (window.PAGAMENTO_TIPO_ATUAL === "vip") {
    return pagarComPix({
      tipo: "vip",
      modelo_id: window.MODELO_ID_ATUAL
    });
  }

  if (window.PAGAMENTO_TIPO_ATUAL === "midia") {
    return pagarComPix({
      tipo: "midia",
      conteudo_id: window.MIDIA_VENDA_ATUAL?.conteudo_id
    });
  }

 if (window.PAGAMENTO_TIPO_ATUAL === "premium") {
    return pagarComPix({
      tipo: "premium",
      premium_post_id: window.PREMIUM_ATUAL?.premium_post_id
    });
  }
};

function gerarFingerprint() {
  return btoa(
    navigator.userAgent +
    screen.width +
    screen.height +
    new Date().getTimezoneOffset()
  );
}

function iniciarVerificacaoPix(orderId) {
  if (pollingPixInterval) {
    clearInterval(pollingPixInterval);
    pollingPixInterval = null;
  }

  pollingPixInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/pagamento/status/${orderId}`, {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      });

      if (!res.ok) return;

      const data = await res.json();
      const tipoAtual =
        data.tipo || window.PAGAMENTO_TIPO_ATUAL || pagamentoAtual?.tipo;

      if (data.status === "pago") {
        clearInterval(pollingPixInterval);
        pollingPixInterval = null;

        const confirmId = montarConfirmIdPagamento(tipoAtual, data, orderId);

        if (!marcarPagamentoConfirmado(confirmId)) return;

        document.getElementById("pixAguardando")?.classList.add("hidden");
        document.getElementById("pixSucesso")?.classList.remove("hidden");

        // =========================
        // VIP
        // =========================
        if (tipoAtual === "vip") {
          setTimeout(async () => {
            fecharPopupPagamento();

            if (typeof window.atualizarPerfilPosPagamento === "function") {
              await window.atualizarPerfilPosPagamento();
            } else {
              await aplicarRegrasDeAcesso?.();
              await carregarFeed?.();
              await carregarPremium?.();
            }
          }, 1500);

          return;
        }

        // =========================
        // PREMIUM
        // =========================
        if (tipoAtual === "premium") {
          if (data.premium_post_id) {
            if (!window.PREMIUM_ATUAL) window.PREMIUM_ATUAL = {};
            window.PREMIUM_ATUAL.premium_post_id = Number(data.premium_post_id);
          }

          setTimeout(async () => {
            fecharPopupPagamento();

            if (typeof window.atualizarPerfilPosPagamento === "function") {
              await window.atualizarPerfilPosPagamento();
            } else {
              await carregarPremium?.();
              await abrirPremiumLiberadoAtual?.();
            }
          }, 1200);

          return;
        }

        // =========================
        // MIDIA
        // =========================
        const messageId = data.message_id;

        setTimeout(async () => {
          fecharPopupPagamento();

          if (!messageId) return;

          const resLiberado = await fetch(`/api/chat/conteudo/${messageId}`, {
            headers: {
              Authorization: "Bearer " + localStorage.getItem("token")
            }
          });

          if (!resLiberado.ok) return;

          const midias = await resLiberado.json();
          if (!midias.length) return;

          abrirModalMidia(midias[0].url, midias[0].tipo_media === "video");
        }, 1200);

        return;
      }

      // =========================
      // PIX EXPIRADO
      // =========================
      if (data.status === "expirado") {
        clearInterval(pollingPixInterval);
        pollingPixInterval = null;

        document.getElementById("pixAguardando")?.classList.add("hidden");

       alert(t("pag.pix_expirado"));
        return;
      }

      // =========================
      // PAGAMENTO FALHOU
      // =========================
      if (data.status === "falhou") {
        clearInterval(pollingPixInterval);
        pollingPixInterval = null;

        document.getElementById("pixAguardando")?.classList.add("hidden");

       alert(t("pag.pagamento_nao_aprovado"));
        return;
      }

    } catch (err) {
      console.error("Erro verificação PIX:", err);
    }
  }, 5000);
}

function marcarPagamentoConfirmado(id) {
  if (!id) return false;
  if (window.__PAGAMENTO_CONFIRMADO_ATUAL__ === id) return false;
  window.__PAGAMENTO_CONFIRMADO_ATUAL__ = id;
  return true;
}

function limparPagamentoConfirmado() {
  window.__PAGAMENTO_CONFIRMADO_ATUAL__ = null;
}

function iniciarPollingPagamento(paymentId, refId = null, metodo = "cartao") {
  if (!paymentId) return;

  if (pollingCartaoInterval) {
    clearInterval(pollingCartaoInterval);
    pollingCartaoInterval = null;
  }

  pollingCartaoInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/pagamento/status/${paymentId}`, {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      });

      if (!res.ok) return;

      const data = await res.json();
      const tipoAtual =
        data.tipo || window.PAGAMENTO_TIPO_ATUAL || pagamentoAtual?.tipo;

      if (data.status === "pago") {
        clearInterval(pollingCartaoInterval);
        pollingCartaoInterval = null;

        const confirmId = montarConfirmIdPagamento(tipoAtual, data, refId || paymentId);

        if (!marcarPagamentoConfirmado(confirmId)) return;

        document.getElementById("pixLoading")?.classList.add("hidden");
        document.getElementById("pixAguardando")?.classList.add("hidden");
        document.getElementById("cartaoLoading")?.classList.add("hidden");
        document.getElementById("formStripePagamento")?.classList.add("hidden");

        document.getElementById("pixSucesso")?.classList.remove("hidden");
        document.getElementById("cartaoSucesso")?.classList.remove("hidden");

        // =========================
        // VIP
        // =========================
        if (tipoAtual === "vip") {
          setTimeout(async () => {
            fecharPopupPagamento();

            if (typeof window.atualizarPerfilPosPagamento === "function") {
              await window.atualizarPerfilPosPagamento();
            } else {
              await aplicarRegrasDeAcesso?.();
              await carregarFeed?.();
              await carregarPremium?.();
            }
          }, 1200);

          return;
        }

        // =========================
        // PREMIUM
        // =========================
        if (tipoAtual === "premium") {
          if (data.premium_post_id) {
            if (!window.PREMIUM_ATUAL) window.PREMIUM_ATUAL = {};
            window.PREMIUM_ATUAL.premium_post_id = Number(data.premium_post_id);
          }

          setTimeout(async () => {
            fecharPopupPagamento();

            if (typeof window.atualizarPerfilPosPagamento === "function") {
              await window.atualizarPerfilPosPagamento();
            } else {
              await carregarPremium?.();
              await abrirPremiumLiberadoAtual?.();
            }
          }, 1200);

          return;
        }

        // =========================
        // MIDIA
        // =========================
        const messageId = data.message_id || refId;

        pagamentoConfirmado();

        if (!messageId) {
          return;
        }

        setTimeout(async () => {
          if (typeof window.finalizarPagamentoEAbrirMidia === "function") {
            await window.finalizarPagamentoEAbrirMidia(messageId);
            return;
          }

          const liberado = await fetch(`/api/chat/conteudo/${messageId}`, {
            headers: {
              Authorization: "Bearer " + localStorage.getItem("token")
            }
          });

          if (!liberado.ok) return;

          const midias = await liberado.json();
          if (!midias.length) return;

          abrirModalMidia(midias[0].url, midias[0].tipo_media === "video");
        }, 1300);

        return;
      }

      if (data.status === "falhou" || data.status === "expirado") {
        clearInterval(pollingCartaoInterval);
        pollingCartaoInterval = null;

        document.getElementById("cartaoLoading")?.classList.add("hidden");
        document.getElementById("formStripePagamento")?.classList.remove("hidden");
        atualizarStatusCartao(t("pag.falha_pagamento"));
      }

    } catch (err) {
      console.error("Erro polling cartão:", err);
    }
  }, 5000);
}

function montarConfirmIdPagamento(tipo, data = {}, refId = null) {
  if (tipo === "vip") {
    const clienteId = Number(data.cliente_id || window.CLIENTE_ID || 0);
    const modeloId = Number(data.modelo_id || refId || window.MODELO_ID_ATUAL || 0);

    if (clienteId && modeloId) {
      return `vip_${clienteId}_${modeloId}`;
    }

    return data.order_id || data.payment_id || `vip_${refId || "unknown"}`;
  }

  if (tipo === "premium") {
    return `premium_${data.premium_post_id || refId || data.order_id || data.payment_id}`;
  }

  if (tipo === "midia") {
    const messageId = data.message_id || refId;
    return messageId ? `midia_${messageId}` : (data.order_id || data.payment_id || null);
  }

  return data.order_id || data.payment_id || null;
}

function atualizarResumoCartaoPagamento(valorBase = 0) {
  const valor = Number(valorBase || 0);
  const taxaTransacao = Number((valor * 0.10).toFixed(2));
  const taxaPlataforma = Number((valor * 0.05).toFixed(2));
  const valorTotal = Number((valor + taxaTransacao + taxaPlataforma).toFixed(2));

  const elValorConteudo = document.getElementById("cartaoValorConteudo");
  const elTaxaTransacao = document.getElementById("cartaoTaxaTransacao");
  const elTaxaPlataforma = document.getElementById("cartaoTaxaPlataforma");
  const elValorTotal = document.getElementById("cartaoValorTotal");

  if (elValorConteudo) elValorConteudo.innerText = valorBRL(valor);
  if (elTaxaTransacao) elTaxaTransacao.innerText = valorBRL(taxaTransacao);
  if (elTaxaPlataforma) elTaxaPlataforma.innerText = valorBRL(taxaPlataforma);
  if (elValorTotal) elValorTotal.innerText = valorBRL(valorTotal);
}

async function lerErroResposta(res) {
  try {
    const data = await res.json();
    return data?.error || data?.message || JSON.stringify(data);
  } catch {
    try {
      return await res.text();
    } catch {
      return "Erro desconhecido.";
    }
  }
}

function alternarCamposPorMetodo(tipo) {
  const blocoCPF = document.getElementById("campoCpf");
  const blocoTelefone = document.getElementById("campoTelefone");

  if (tipo === "pix") {
    blocoCPF?.classList.remove("hidden");
    blocoTelefone?.classList.remove("hidden");
  } else {
    blocoCPF?.classList.add("hidden");
    blocoTelefone?.classList.add("hidden");
  }
}

// formata valor na moeda correta (BRL ou USD)
function formatarMoeda(valor, currency = "brl") {
  const locale = currency === "usd" ? "en-US" : "pt-BR";
  const currencyCode = currency === "usd" ? "USD" : "BRL";

  return Number(valor || 0).toLocaleString(locale, {
    style: "currency",
    currency: currencyCode
  });
}

function atualizarResumoCartaoComDadosServidor(data) {
  const currency   = data.currency || "brl";
  const valorBase  = Number(data.valor_assinatura || data.valorBase || 0);
  const total      = Number(data.valor_total || data.total || 0);

  const resumoBox   = document.getElementById("cartaoResumoValor");
  const resumoTotal = document.getElementById("cartaoResumoTotal");

  if (resumoTotal) {
    resumoTotal.textContent = formatarMoeda(total, currency);
  }

  if (resumoBox) {
    resumoBox.classList.remove("hidden");
  }
}


document.addEventListener("DOMContentLoaded", () => {
  bindFormularioAsaasPagamento();

  document.getElementById("btnGerarPix")?.addEventListener("click", () => {
    confirmarPix();
  });
});



