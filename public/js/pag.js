window.__CLIENTE_VIP__ = false;
window.__VIP_READY__ = false;

let pagamentoAtual = window.pagamentoAtual || {};
let pagamentoEmProcesso = false;
window.pagamentoAtual = pagamentoAtual;
window.__PAGAMENTO_CONFIRMADO_ATUAL__ = null;
window.CURRENCY_ATUAL = "brl";

// Stripe — gateway de pagamentos
let stripeInstance = null;
let stripePaymentElement = null;
let stripeElements = null;
let currentPaymentIntentId = null;

async function getStripeInstance() {
  if (stripeInstance) return stripeInstance;
  const res = await fetch("/api/stripe/pk");
  if (!res.ok) throw new Error("Falha ao carregar configuração de pagamento.");
  const { key } = await res.json();
  stripeInstance = Stripe(key);
  return stripeInstance;
}

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

  const isUsd = window.CURRENCY_ATUAL === "usd";
  document.getElementById("campoTelefone")?.classList.toggle("hidden", isUsd);
}

function abrirPopupPagamento() {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) return;

  popup.classList.remove("hidden");

  inicializarSelectsPagamento();

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
  const aceites = obterAceitesPagamento();
  if (!aceites) return false;
  return true;
}

function obterAceitesPagamento() {
  const aceitouTermos = !!document.getElementById("aceiteTermosPagamento")?.checked;

  if (!aceitouTermos) {
    alert(t("pag.aceite_termos_obrigatorio"));
    return null;
  }

  return {
    aceitou_termos: true,
    aceitou_politicas: true,
    aceitou_execucao_imediata: true,
    aceite_timestamp: new Date().toISOString(),
    versao_termos: "2026-07-28"
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

  const isUsd = window.CURRENCY_ATUAL === "usd";
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

  if (stripePaymentElement) {
    try { stripePaymentElement.unmount(); } catch (_) {}
    stripePaymentElement = null;
  }
  stripeElements = null;
  currentPaymentIntentId = null;

  const container = document.getElementById("stripe-card-form");
  if (container) {
    container.innerHTML = "";
    delete container.dataset.rendered;
  }

  const form = document.getElementById("formStripePagamento");
  if (form) delete form.dataset.bound;
}

function mostrarLoadingCartao() {
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
  document.getElementById("cartaoLoading")?.classList.remove("hidden");
  document.getElementById("formStripePagamento")?.classList.add("hidden");
}

async function renderFormCartao() {
  const container = document.getElementById("stripe-card-form");
  if (!container || container.dataset.rendered === "true") return;
  container.dataset.rendered = "true";

  container.innerHTML = `<div style="text-align:center;padding:24px 0;opacity:0.6;font-size:0.9rem;">⏳ ${typeof t === "function" ? t("pagamento.preparando") || "Preparando pagamento…" : "Preparando pagamento…"}</div>`;

  try {
    const stripe = await getStripeInstance();
    const tipo = window.PAGAMENTO_TIPO_ATUAL;

    // Collect aceites (already validated by mostrarMetodo before reaching here)
    const aceites = obterAceitesPagamento();
    if (!aceites) {
      container.innerHTML = "";
      delete container.dataset.rendered;
      return;
    }

    // Moeda da cobrança: BRL por defeito. Outras moedas requerem taxa_cambio.
    // O Payment Element mostra métodos compatíveis; o banco do cliente converte automaticamente.
    const currency = "brl";
    const payload = { ...aceites, currency, fingerprint: gerarFingerprint() };

    if (tipo === "vip") {
      payload.modelo_id = window.MODELO_ID_ATUAL;
      const telefoneEl = document.getElementById("phonePagamento");
      const ddiEl = document.getElementById("ddiPagamento");
      if (telefoneEl) {
        const num = String(telefoneEl.value || "").replace(/\D/g, "");
        if (num.length >= 5) payload.telefone = (ddiEl?.value || "") + num;
      }
    }
    if (tipo === "midia") {
      payload.conteudo_id = window.MIDIA_VENDA_ATUAL?.conteudo_id;
    }
    if (tipo === "premium") {
      payload.premium_post_id = window.PREMIUM_ATUAL?.premium_post_id;
    }

    const res = await fetch(`/api/pagamento/${tipo}/criar-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.client_secret) {
      throw new Error(data.error || "Erro ao iniciar pagamento.");
    }

    currentPaymentIntentId = data.payment_id;
    pagamentoAtual.payment_id = data.payment_id;

    stripeElements = stripe.elements({
      clientSecret: data.client_secret,
      locale: "auto",
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: "#8b5cf6",
          colorBackground: "#ffffff",
          colorText: "#1e1e26",
          colorDanger: "#ef4444",
          fontFamily: "Poppins, system-ui, -apple-system, sans-serif",
          borderRadius: "12px",
          fontSizeBase: "15px"
        },
        rules: {
          ".Input": {
            border: "1.5px solid #e5e7eb",
            boxShadow: "none",
            padding: "12px 14px"
          },
          ".Input:focus": {
            border: "1.5px solid #8b5cf6",
            boxShadow: "0 0 0 3px rgba(139,92,246,0.12)"
          },
          ".Label": {
            fontWeight: "600",
            fontSize: "11px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#6b7280"
          },
          ".Tab": { border: "1.5px solid #e5e7eb", borderRadius: "10px" },
          ".Tab--selected": { border: "1.5px solid #8b5cf6", color: "#8b5cf6" },
          ".Tab:focus": { boxShadow: "0 0 0 3px rgba(139,92,246,0.12)" }
        }
      }
    });

    stripePaymentElement = stripeElements.create("payment", {
      layout: { type: "tabs", defaultCollapsed: false }
    });

    // Resumo de valor + conversor de moeda
    const valorBrlDisplay = data.valor_brl || 0;
    const wrapper = document.createElement("div");
    wrapper.id = "stripe-resumo-wrapper";
    wrapper.innerHTML = `
      <div id="stripe-resumo-preco" style="
        background:#f8f5ff;border:1.5px solid #e9d5ff;border-radius:12px;
        padding:12px 16px;margin-bottom:14px;font-size:0.93rem;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span style="color:#6b7280;font-weight:600;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;">Total cobrado</span>
          <strong id="stripe-valor-principal" style="color:#8b5cf6;font-size:1.1rem;">
            R$ ${valorBrlDisplay.toFixed(2).replace(".", ",")}
          </strong>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <label style="font-size:0.78rem;color:#6b7280;white-space:nowrap;">Ver no meu país:</label>
          <select id="stripe-select-pais" style="
            flex:1;min-width:160px;border:1.5px solid #e5e7eb;border-radius:8px;
            padding:5px 10px;font-size:0.85rem;color:#1e1e26;background:#fff;
            cursor:pointer;outline:none;
          ">
            <option value="">— seleciona —</option>
            <option value="PT|EUR">🇵🇹 Portugal (EUR)</option>
            <option value="BR|BRL">🇧🇷 Brasil (BRL)</option>
            <option value="US|USD">🇺🇸 EUA (USD)</option>
            <option value="GB|GBP">🇬🇧 Reino Unido (GBP)</option>
            <option value="CO|COP">🇨🇴 Colômbia (COP)</option>
            <option value="VE|USD">🇻🇪 Venezuela (USD)</option>
            <option value="MX|MXN">🇲🇽 México (MXN)</option>
            <option value="AR|ARS">🇦🇷 Argentina (ARS)</option>
            <option value="CL|CLP">🇨🇱 Chile (CLP)</option>
            <option value="PE|PEN">🇵🇪 Peru (PEN)</option>
            <option value="UY|UYU">🇺🇾 Uruguai (UYU)</option>
            <option value="DE|EUR">🇩🇪 Alemanha (EUR)</option>
            <option value="FR|EUR">🇫🇷 França (EUR)</option>
            <option value="NL|EUR">🇳🇱 Holanda (EUR)</option>
            <option value="ES|EUR">🇪🇸 Espanha (EUR)</option>
            <option value="IT|EUR">🇮🇹 Itália (EUR)</option>
            <option value="CH|CHF">🇨🇭 Suíça (CHF)</option>
            <option value="SE|SEK">🇸🇪 Suécia (SEK)</option>
            <option value="NO|NOK">🇳🇴 Noruega (NOK)</option>
            <option value="DK|DKK">🇩🇰 Dinamarca (DKK)</option>
            <option value="AU|AUD">🇦🇺 Austrália (AUD)</option>
            <option value="CA|CAD">🇨🇦 Canadá (CAD)</option>
            <option value="JP|JPY">🇯🇵 Japão (JPY)</option>
            <option value="AE|AED">🇦🇪 Emirados (AED)</option>
            <option value="SG|SGD">🇸🇬 Singapura (SGD)</option>
          </select>
        </div>
        <div id="stripe-preco-convertido" style="margin-top:8px;font-size:0.85rem;color:#6b7280;min-height:20px;"></div>
      </div>
    `;

    container.innerHTML = "";
    container.appendChild(wrapper);

    const mountDiv = document.createElement("div");
    mountDiv.id = "stripe-payment-element-mount";
    container.appendChild(mountDiv);
    stripePaymentElement.mount(mountDiv);

    // Conversor de moeda em tempo real
    const _fxCache = {};
    document.getElementById("stripe-select-pais")?.addEventListener("change", async (e) => {
      const [, moeda] = (e.target.value || "").split("|");
      const el = document.getElementById("stripe-preco-convertido");
      if (!el) return;

      if (!moeda || moeda === "BRL") {
        el.textContent = "";
        return;
      }

      el.textContent = "Calculando…";
      try {
        if (!_fxCache[moeda]) {
          const r = await fetch(`https://api.frankfurter.app/latest?from=BRL&to=${moeda}`);
          const d = await r.json();
          _fxCache[moeda] = d.rates?.[moeda] || null;
        }
        const taxa = _fxCache[moeda];
        if (!taxa) { el.textContent = ""; return; }
        const convertido = (valorBrlDisplay * taxa).toFixed(2);
        el.innerHTML = `≈ <strong>${moeda} ${Number(convertido).toLocaleString("en", { minimumFractionDigits: 2 })}</strong> <span style="opacity:0.5;font-size:0.78rem;">(taxa indicativa)</span>`;
      } catch {
        el.textContent = "";
      }
    });

  } catch (err) {
    console.error("Erro ao montar Payment Element:", err);
    if (container) {
      container.innerHTML = `<p style="color:#fa755a;text-align:center;padding:16px 0;">${err.message || (typeof t === "function" ? t("pagamento.card_form_error") : "Erro ao carregar formulário")}</p>`;
      delete container.dataset.rendered;
    }
  }
}

async function confirmarPagamentoCartao() {
  if (pagamentoEmProcesso) return { sucesso: false };
  pagamentoEmProcesso = true;

  try {
    if (!stripeInstance || !stripeElements) {
      alert("Formulário de pagamento não inicializado. Recarregue a página.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    mostrarLoadingCartao();
    atualizarStatusCartao(t("pag.confirmando_pagamento") || "Processando...");

    // Payment Element trata 3DS, Apple Pay, Google Pay, iDEAL etc. automaticamente.
    // redirect:'if_required' evita redirect desnecessário para métodos que não precisam.
    const { error, paymentIntent } = await stripeInstance.confirmPayment({
      elements: stripeElements,
      confirmParams: {
        return_url: window.location.href
      },
      redirect: "if_required"
    });

    if (error) {
      document.getElementById("cartaoLoading")?.classList.add("hidden");
      document.getElementById("formStripePagamento")?.classList.remove("hidden");
      atualizarStatusCartao(t("pagamento.btn_confirmar_stripe") || "Confirmar pagamento");
      alert(error.message);
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    const paymentId = currentPaymentIntentId || pagamentoAtual?.payment_id;

    if (paymentIntent?.status === "succeeded") {
      document.getElementById("cartaoLoading")?.classList.add("hidden");
      document.getElementById("cartaoSucesso")?.classList.remove("hidden");
    } else {
      atualizarStatusCartao(t("pag.aguardando_confirmacao") || "Aguardando confirmação…");
    }

    if (paymentId) {
      iniciarPollingPagamento(
        paymentId,
        pagamentoAtual?.premium_post_id || pagamentoAtual?.message_id || pagamentoAtual?.modelo_id,
        "cartao"
      );
    }

    pagamentoEmProcesso = false;
    return { sucesso: true };

  } catch (err) {
    console.error("Erro confirmarPagamento:", err);
    document.getElementById("cartaoLoading")?.classList.add("hidden");
    document.getElementById("formStripePagamento")?.classList.remove("hidden");
    atualizarStatusCartao(t("pag.falha_pagamento") || "Falha");
    alert(err.message || t("pag.erro_inesperado_pagamento") || "Erro inesperado.");
    pagamentoEmProcesso = false;
    return { sucesso: false };
  }
}

async function inicializarFluxoCartao() {
  try {
    resetarEstadoCartao();

    const form = document.getElementById("formStripePagamento");
    const container = document.getElementById("stripe-card-form");
    const btn = document.getElementById("btnConfirmarStripe");

    if (!form || !container) throw new Error("Formulário de cartão não encontrado.");

    form.classList.remove("hidden");
    if (btn) btn.disabled = false;
    atualizarStatusCartao(t("pagamento.btn_confirmar_stripe") || "Confirmar pagamento");

    await renderFormCartao();
    bindFormularioPagamento();
  } catch (err) {
    console.error("Erro ao inicializar fluxo cartão:", err);
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
    await inicializarFluxoCartao();
    return;
  }

  console.warn("Método de pagamento inválido:", tipo);
}

function bindFormularioPagamento() {
  const form = document.getElementById("formStripePagamento");
  const btn  = document.getElementById("btnConfirmarStripe");

  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (btn) btn.disabled = true;
    atualizarStatusCartao(t("pag.processando") || "Processando...");

    try {
      const resultado = await confirmarPagamentoCartao();
      if (!resultado?.sucesso) {
        if (btn) btn.disabled = false;
        atualizarStatusCartao(t("pagamento.btn_confirmar_stripe") || "Confirmar pagamento");
      }
    } catch (err) {
      console.error("Erro submit pagamento:", err);
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
    document.getElementById("campoTelefone")?.classList.remove("hidden");
    document.getElementById("blocoEndereco")?.classList.remove("hidden");
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
    document.getElementById("campoTelefone")?.classList.remove("hidden");
    document.getElementById("blocoEndereco")?.classList.remove("hidden");
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
    document.getElementById("campoTelefone")?.classList.remove("hidden");
    document.getElementById("blocoEndereco")?.classList.remove("hidden");
    return;
  }
}

function preencherResumoVIP({ valorBase = 0, desconto = 0 }) {
  valorBase = Number(valorBase || 0);
  desconto  = Number(desconto  || 0);

  const valorComDesconto = Math.max(0, valorBase - desconto);
  const taxa  = Number((valorComDesconto * 0.15).toFixed(2));
  const total = Number((valorComDesconto + taxa).toFixed(2));

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
  valor    = Number(valor   || 0);
  desconto = Number(desconto || 0);

  const valorComDesconto = Math.max(0, valor - desconto);
  const taxa  = Number((valorComDesconto * 0.15).toFixed(2));
  const total = Number((valorComDesconto + taxa).toFixed(2));

  document.getElementById("midiaValorBase").textContent =
    valor.toFixed(2).replace(".", ",");

  const elDesc = document.getElementById("midiaDesconto");
  if (elDesc) elDesc.textContent = desconto > 0 ? desconto.toFixed(2).replace(".", ",") : "—";

  document.getElementById("midiaTaxa").textContent =
    taxa.toFixed(2).replace(".", ",");

  document.getElementById("midiaTotal").textContent =
    total.toFixed(2).replace(".", ",");

  const boxMidia =
    document.querySelector(".midia-beneficios") ||
    document.querySelector(".vip-beneficios");

  if (boxMidia) {
    const extras = descricao ? `<li>✓ ${descricao}</li>` : "";
    boxMidia.innerHTML = `
      <div class="beneficios-card">
        <span class="beneficios-titulo">${t("pagamento.midia_beneficios_titulo")}</span>
        <ul class="beneficios-lista">
          <li>✓ ${t("pagamento.midia_beneficio1")}</li>
          <li>✓ ${t("pagamento.midia_beneficio2")}</li>
          ${extras}
        </ul>
      </div>
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
  const ddiSelect = document.getElementById("ddiPagamento");
  const input     = document.getElementById("phonePagamento");

  if (!input) {
    alert(t("pag.telefone_campo_nao_encontrado"));
    return null;
  }

  const ddi    = String(ddiSelect?.value || "").trim();
  const numero = String(input.value || "").replace(/\D/g, "");

  if (numero.length < 5) {
    alert(t("pag.telefone_invalido") || "Preencha o número de telefone.");
    input.focus();
    return null;
  }

  return ddi + numero;
}

async function buscarCepPagamento() {
  const cepInput = document.getElementById("cepPagamento");
  const feedback = document.getElementById("campoCepFeedback");
  if (!cepInput) return;

  const cep = String(cepInput.value).replace(/\D/g, "");
  if (cep.length !== 8) {
    alert(t("pag.cep_digitos"));
    cepInput.focus();
    return;
  }

  if (feedback) { feedback.textContent = t("pag.cep_buscando"); feedback.classList.remove("hidden"); }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();

    if (data.erro) {
      if (feedback) feedback.textContent = t("pag.cep_nao_encontrado");
      return;
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
    set("enderecoPagamento", data.logradouro);
    set("cidadePagamento",   data.localidade);
    set("estadoPagamento",   data.uf);

    if (feedback) { feedback.textContent = ""; feedback.classList.add("hidden"); }
    document.getElementById("numeroPagamento")?.focus();
  } catch {
    if (feedback) feedback.textContent = t("pag.cep_erro_conexao");
  }
}

function obterEnderecoValido() {
  const pais      = String(document.getElementById("paisPagamento")?.value     || "").trim();
  const estado    = String(document.getElementById("estadoPagamento")?.value   || "").trim();
  const cidade    = String(document.getElementById("cidadePagamento")?.value   || "").trim();
  const rua       = String(document.getElementById("enderecoPagamento")?.value || "").trim();
  const endereco2 = String(document.getElementById("endereco2Pagamento")?.value || "").trim();
  const cep       = String(document.getElementById("cepPagamento")?.value      || "").trim();

  if (!pais)   { alert(t("pag.endereco_pais_obrigatorio"));   document.getElementById("paisPagamento")?.focus();     return null; }
  if (!estado) { alert(t("pag.endereco_estado_obrigatorio")); document.getElementById("estadoPagamento")?.focus();   return null; }
  if (!cidade) { alert(t("pag.endereco_cidade_obrigatoria")); document.getElementById("cidadePagamento")?.focus();   return null; }
  if (!rua)    { alert(t("pag.endereco_rua_obrigatoria"));    document.getElementById("enderecoPagamento")?.focus(); return null; }
  if (!cep)    { alert(t("pag.endereco_cep_obrigatorio"));    document.getElementById("cepPagamento")?.focus();      return null; }

  return { pais, estado, cidade, rua, endereco2, cep };
}

// ── PAÍSES E DDI ─────────────────────────────────────────────────────────────
const PAISES_PAGAMENTO = [
  { code: "PT", name: "Portugal",             ddi: "+351" },
  { code: "BR", name: "Brasil",               ddi: "+55"  },
  { code: "AO", name: "Angola",               ddi: "+244" },
  { code: "MZ", name: "Moçambique",           ddi: "+258" },
  { code: "CV", name: "Cabo Verde",           ddi: "+238" },
  { code: "ST", name: "São Tomé e Príncipe",  ddi: "+239" },
  { code: "GW", name: "Guiné-Bissau",         ddi: "+245" },
  { code: "TL", name: "Timor-Leste",          ddi: "+670" },
  { code: "ES", name: "Espanha",              ddi: "+34"  },
  { code: "FR", name: "França",               ddi: "+33"  },
  { code: "DE", name: "Alemanha",             ddi: "+49"  },
  { code: "GB", name: "Reino Unido",          ddi: "+44"  },
  { code: "IT", name: "Itália",               ddi: "+39"  },
  { code: "NL", name: "Países Baixos",        ddi: "+31"  },
  { code: "BE", name: "Bélgica",              ddi: "+32"  },
  { code: "CH", name: "Suíça",               ddi: "+41"  },
  { code: "AT", name: "Áustria",             ddi: "+43"  },
  { code: "SE", name: "Suécia",              ddi: "+46"  },
  { code: "NO", name: "Noruega",              ddi: "+47"  },
  { code: "DK", name: "Dinamarca",            ddi: "+45"  },
  { code: "FI", name: "Finlândia",           ddi: "+358" },
  { code: "IE", name: "Irlanda",              ddi: "+353" },
  { code: "LU", name: "Luxemburgo",           ddi: "+352" },
  { code: "GR", name: "Grécia",              ddi: "+30"  },
  { code: "PL", name: "Polónia",             ddi: "+48"  },
  { code: "US", name: "Estados Unidos",       ddi: "+1"   },
  { code: "CA", name: "Canadá",              ddi: "+1"   },
  { code: "MX", name: "México",              ddi: "+52"  },
  { code: "AR", name: "Argentina",            ddi: "+54"  },
  { code: "CO", name: "Colômbia",            ddi: "+57"  },
  { code: "CL", name: "Chile",               ddi: "+56"  },
  { code: "PE", name: "Peru",                ddi: "+51"  },
  { code: "UY", name: "Uruguai",             ddi: "+598" },
  { code: "PY", name: "Paraguai",            ddi: "+595" },
  { code: "BO", name: "Bolívia",             ddi: "+591" },
  { code: "VE", name: "Venezuela",            ddi: "+58"  },
  { code: "EC", name: "Equador",              ddi: "+593" },
  { code: "AU", name: "Austrália",           ddi: "+61"  },
  { code: "NZ", name: "Nova Zelândia",        ddi: "+64"  },
  { code: "JP", name: "Japão",              ddi: "+81"  },
  { code: "SG", name: "Singapura",            ddi: "+65"  },
  { code: "IN", name: "Índia",              ddi: "+91"  },
  { code: "CN", name: "China",               ddi: "+86"  },
  { code: "AE", name: "Emirados Árabes",    ddi: "+971" },
  { code: "SA", name: "Arábia Saudita",     ddi: "+966" },
  { code: "MA", name: "Marrocos",            ddi: "+212" },
  { code: "ZA", name: "África do Sul",      ddi: "+27"  },
  { code: "NG", name: "Nigéria",            ddi: "+234" },
];

function inicializarSelectsPagamento() {
  const selPais = document.getElementById("paisPagamento");
  const selDdi  = document.getElementById("ddiPagamento");

  if (selPais && !selPais.dataset.populated) {
    selPais.dataset.populated = "true";
    PAISES_PAGAMENTO.forEach(p => {
      const opt = document.createElement("option");
      opt.value       = p.code;
      opt.textContent = p.name;
      selPais.appendChild(opt);
    });
    selPais.value = "PT";
    selPais.addEventListener("change", atualizarDdiPorPais);
  }

  if (selDdi && !selDdi.dataset.populated) {
    selDdi.dataset.populated = "true";
    PAISES_PAGAMENTO.forEach(p => {
      const opt = document.createElement("option");
      opt.value       = p.ddi;
      opt.textContent = `${p.ddi} ${p.name}`;
      selDdi.appendChild(opt);
    });
    selDdi.value = "+351";
  }

  atualizarBotaoBuscarCep();
}

function atualizarDdiPorPais() {
  const selPais = document.getElementById("paisPagamento");
  const selDdi  = document.getElementById("ddiPagamento");
  if (!selPais || !selDdi) return;
  const pais = PAISES_PAGAMENTO.find(p => p.code === selPais.value);
  if (pais) selDdi.value = pais.ddi;
  atualizarBotaoBuscarCep();
}

function atualizarBotaoBuscarCep() {
  const selPais  = document.getElementById("paisPagamento");
  const btn      = document.getElementById("btnBuscarCepPag");
  const cepInput = document.getElementById("cepPagamento");
  if (!btn) return;
  const isBR = selPais?.value === "BR";
  btn.style.display = isBR ? "" : "none";
  if (cepInput) {
    cepInput.maxLength = isBR ? 9 : 20;
    if (isBR) {
      cepInput.placeholder = "00000-000";
    } else {
      (typeof whenI18nReady === "function" ? whenI18nReady() : Promise.resolve())
        .then(() => { cepInput.placeholder = t("pagamento.codigo_postal_label"); });
    }
  }
}

async function salvarEnderecoCliente({ pais, estado, cidade, endereco, endereco2, cep, telefone }) {
  try {
    const token = localStorage.getItem("token");
    if (!token) return;
    await fetch("/api/cliente/endereco", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ pais, estado, cidade, endereco, endereco2, cep, telefone })
    });
  } catch (err) {
    console.warn("salvarEnderecoCliente:", err);
  }
}


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

    const aceites = obterAceitesPagamento();
    if (!aceites) return;

    const aceitou_termos = aceites.aceitou_termos;
    const aceitou_politicas = aceites.aceitou_politicas;
    const aceitou_execucao_imediata = aceites.aceitou_execucao_imediata;
    const aceite_timestamp = aceites.aceite_timestamp;
    const versao_termos = aceites.versao_termos;

    // ── Coletar e validar todos os campos ANTES de mostrar loading ──────────
    let url = "";
    let body = {};

    if (tipo === "vip") {
      const modeloIdFinal = Number(modelo_id || window.MODELO_ID_ATUAL);
      if (!modeloIdFinal) { alert(t("pag.modelo_nao_identificado")); return; }
      const telefone = obterTelefoneValido();
      if (!telefone) return;
      const endereco = obterEnderecoValido();
      if (!endereco) return;

      url = "/api/pagamento/vip/pix";
      body = { tipo: "vip", modelo_id: modeloIdFinal, telefone, endereco,
               aceitou_termos, aceitou_politicas, aceitou_execucao_imediata, aceite_timestamp, versao_termos,
               fingerprint: gerarFingerprint() };
    }

    if (tipo === "premium") {
      const telefone = obterTelefoneValido();
      if (!telefone) return;
      const endereco = obterEnderecoValido();
      if (!endereco) return;

      url = "/api/pagamento/premium/pix";
      body = { tipo: "premium", premium_post_id, telefone, endereco,
               aceitou_termos, aceitou_politicas, aceitou_execucao_imediata, aceite_timestamp, versao_termos,
               fingerprint: gerarFingerprint() };
    }

    if (tipo === "midia") {
      const telefone = obterTelefoneValido();
      if (!telefone) return;
      const endereco = obterEnderecoValido();
      if (!endereco) return;

      url = "/api/pagamento/midia/pix";
      body = { tipo: "midia", conteudo_id, telefone, endereco,
               aceitou_termos, aceitou_politicas, aceitou_execucao_imediata, aceite_timestamp, versao_termos,
               fingerprint: gerarFingerprint() };
    }

    if (!url) {
      alert(t("pag.tipo_pagamento_invalido"));
      return;
    }

    // Salva dados na clientes_dados (fire & forget)
    const telefoneCompleto = obterTelefoneValido();
    if (body.endereco) {
      salvarEnderecoCliente({
        pais:      body.endereco.pais,
        estado:    body.endereco.estado,
        cidade:    body.endereco.cidade,
        endereco:  body.endereco.rua,
        endereco2: body.endereco.endereco2,
        cep:       body.endereco.cep,
        telefone:  telefoneCompleto || body.telefone
      });
    }

    // Todos os campos válidos → avança para loading
    abrirPopupPagamentoPixLoading();

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errData;
      try { errData = await res.json(); } catch { errData = {}; }

      if (errData.primeiro_vip) {
        voltarEtapaPagamento();
        alert("PIX disponível apenas para renovação VIP. Para assinar pela primeira vez, use o cartão de crédito, ou peça autorização para cobrança via PIX ao suporte.");
        return;
      }

      throw new Error(errData?.error || errData?.message || "Erro ao gerar PIX.");
    }

    const data = await res.json();

    const qr = document.getElementById("pixQr");
    const codigo = document.getElementById("pixCodigo");
    const btnCopiar = document.getElementById("btnCopiarPix");

    const rawB64 = data.qr_code_base64 || null;
    const qrCodeImg = rawB64
      ? (rawB64.startsWith("data:") ? rawB64 : `data:image/png;base64,${rawB64}`)
      : null;

    const copiaCola =
      data.copia_cola ||
      data.qr_code ||
      "";

    const orderId =
      data.order_id ||
      data.payment_id ||
      null;

    if (!orderId) {
      alert(t("pag.erro_gerar_qr"));
      return;
    }

    if (qr) {
      if (qrCodeImg) {
        qr.src = qrCodeImg;
        qr.classList.remove("hidden");
      } else if (copiaCola && typeof QRCode !== "undefined") {
        QRCode.toDataURL(copiaCola, { width: 256, margin: 2 }, (err, url) => {
          if (!err) {
            qr.src = url;
            qr.classList.remove("hidden");
          }
        });
      }
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
  if (tipo === "cartao") {
    document.getElementById("blocoEndereco")?.classList.add("hidden");
    document.getElementById("campoTelefone")?.classList.add("hidden");
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


// ── Confirmação VIP (anti-chargeback) ────────────────────────────────────────
let _metodoVIPPendente = null;

function renderCategoriaVIP(categoria) {
  const defs = {
    social: {
      nome: t("vip_confirm.cat_social_nome"),
      desc: t("vip_confirm.cat_social_desc")
    },
    premium: {
      nome: t("vip_confirm.cat_premium_nome"),
      desc: t("vip_confirm.cat_premium_desc")
    },
    adulto: {
      nome: t("vip_confirm.cat_adulto_nome"),
      desc: t("vip_confirm.cat_adulto_desc")
    }
  };
  const cat = defs[categoria] || defs.social;
  return `<div class="vip-confirm-cat-card"><div><strong>${cat.nome}</strong><p>${cat.desc}</p></div></div>`;
}

function abrirConfirmacaoVIP(metodo) {
  if (window.PAGAMENTO_TIPO_ATUAL !== "vip") {
    mostrarMetodo(metodo);
    return;
  }
  _metodoVIPPendente = metodo;
  document.getElementById("popupPagamentoVelvet")?.classList.add("hidden");

  const nomeEl = document.getElementById("vipConfirmNome");
  if (nomeEl) nomeEl.textContent = document.getElementById("profileName")?.textContent?.trim() || "";

  const box = document.getElementById("vipConfirmCategoriaBox");
  if (box) box.innerHTML = renderCategoriaVIP(window.MODELO_CATEGORIA_ATUAL || "social");

  const popup = document.getElementById("popupConfirmacaoVIP");
  if (popup) popup.classList.remove("hidden");
}

function fecharConfirmacaoVIP() {
  _metodoVIPPendente = null;
  document.getElementById("popupConfirmacaoVIP")?.classList.add("hidden");
  document.getElementById("popupPagamentoVelvet")?.classList.remove("hidden");
}

function confirmarVIPEContinuar() {
  const checkbox = document.getElementById("aceiteTermosPagamento");
  if (checkbox) checkbox.checked = true;
  const metodo = _metodoVIPPendente;
  _metodoVIPPendente = null;
  document.getElementById("popupConfirmacaoVIP")?.classList.add("hidden");
  document.getElementById("popupPagamentoVelvet")?.classList.remove("hidden");
  if (metodo) mostrarMetodo(metodo);
}

document.addEventListener("DOMContentLoaded", () => {
  inicializarSelectsPagamento();
  bindFormularioPagamento();

  document.getElementById("btnGerarPix")?.addEventListener("click", () => {
    confirmarPix();
  });
});



