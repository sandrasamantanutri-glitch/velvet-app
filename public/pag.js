window.__CLIENTE_VIP__ = false;
window.__VIP_READY__ = false;

let pagamentoAtual = window.pagamentoAtual || {};
let pagamentoEmProcesso = false;
window.pagamentoAtual = pagamentoAtual;
window.__PAGAMENTO_CONFIRMADO_ATUAL__ = null;

const PAGARME_PUBLIC_KEY = "pk_oQW43ZaU7HPVnbj8";

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



function abrirPopupPagamento() {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) return;

  popup.classList.remove("hidden");

  document.getElementById("pixQr")?.classList.add("hidden");
  document.getElementById("pixCodigo")?.classList.add("hidden");
  document.getElementById("btnCopiarPix")?.classList.add("hidden");
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
  document.getElementById("pixSucesso")?.classList.add("hidden");

  const pix = document.getElementById("conteudoPix");
  const cartao = document.getElementById("conteudoCartao");
  const tabsContainer = document.querySelector(".velvet-tabs");

  if (window.PAGAMENTO_TIPO_ATUAL === "midia") {
    tabsContainer?.classList.add("hidden");
    pix?.classList.add("hidden");
    cartao?.classList.remove("hidden");
    iniciarCartaoMidia();
    return;
  }

  if (window.PAGAMENTO_TIPO_ATUAL === "premium") {
    tabsContainer?.classList.remove("hidden");
    pix?.classList.remove("hidden");
    cartao?.classList.add("hidden");
    prepararPagamento();
    return;
  }

  if (window.PAGAMENTO_TIPO_ATUAL === "vip") {
    tabsContainer?.classList.remove("hidden");
    pix?.classList.remove("hidden");
    cartao?.classList.add("hidden");
    prepararPagamento();
    return;
  }
}

function prepararPagamento() {
  // limpa resumos visuais antes de preencher
  document.querySelector(".vip-detalhes")?.classList.add("hidden");
  document.querySelector(".midia-detalhes")?.classList.add("hidden");

  // ===============================
  // 💎 VIP
  // ===============================
  if (window.PAGAMENTO_TIPO_ATUAL === "vip") {
    const oferta = window.OFERTA_ATUAL || null;
    const plano = window.PLANO_VIP_ATUAL || window.MODELO_VIP_ATUAL || null;

    let valorBase = 0;
    let valorFinal = 0;
    let desconto = 0;

    if (oferta) {
      valorBase = Number(oferta.valor_base || oferta.valor || 0);
      valorFinal = Number(
        oferta.valor_promocional || oferta.valor || valorBase
      );
      desconto = Math.max(0, valorBase - valorFinal);
    } else if (plano) {
      valorBase = Number(plano.valor || plano.preco || plano.valor_mensal || 0);
      valorFinal = valorBase;
      desconto = 0;

      console.warn("Sem oferta VIP, usando valor do plano");
    } else {
      console.error("Nem OFERTA_ATUAL nem PLANO_VIP_ATUAL definidos para VIP");
      return;
    }

    preencherResumoVIP({
      valorBase,
      valorFinal,
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
}

function preencherResumoVIP({ valorBase = 0, desconto = 0 }) {
  const taxaPerc =
    typeof TAXA_TRANSACAO === "number" ? TAXA_TRANSACAO : 0.15;

  valorBase = Number(valorBase || 0);
  desconto = Number(desconto || 0);

  const valorComDesconto = Math.max(0, valorBase - desconto);
  const taxa = valorComDesconto * taxaPerc;
  const total = valorComDesconto + taxa;

  document.getElementById("vipValorBase").textContent =
    valorBase.toFixed(2).replace(".", ",");

  document.getElementById("vipDesconto").textContent =
    desconto.toFixed(2).replace(".", ",");

  document.getElementById("vipTaxa").textContent =
    taxa.toFixed(2).replace(".", ",");

  document.getElementById("vipTotal").textContent =
    total.toFixed(2).replace(".", ",");
}

function preencherResumoMidia({ valor = 0, descricao = "" }) {
  valor = Number(valor || 0);

  const taxa = valor * 0.15;
  const total = valor + taxa;

  document.getElementById("midiaValorBase").textContent =
    valor.toFixed(2).replace(".", ",");

  document.getElementById("midiaTaxa").textContent =
    taxa.toFixed(2).replace(".", ",");

  document.getElementById("midiaTotal").textContent =
    total.toFixed(2).replace(".", ",");

const boxMidia =
  document.querySelector(".midia-beneficios") ||
  document.querySelector(".vip-beneficios");

if (boxMidia) {
  boxMidia.innerHTML = `
    <strong>Conteúdo exclusivo</strong><br>
    ${descricao || "Acesso imediato após pagamento"}
  `;
  }
}

function valorBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function mostrarMetodo(tipo) {
  const pix = document.getElementById("conteudoPix");
  const cartao = document.getElementById("conteudoCartao");

  if (!pix || !cartao) return;

if (tipo === "cartao") {
  resetarEstadoPix();
  pix.classList.add("hidden");
  cartao.classList.remove("hidden");

  if (window.PAGAMENTO_TIPO_ATUAL === "vip") iniciarCartaoVip();
  if (window.PAGAMENTO_TIPO_ATUAL === "midia") iniciarCartaoMidia();
  if (window.PAGAMENTO_TIPO_ATUAL === "premium") iniciarCartaoPremium();
}

  if (tipo === "pix") {
    resetarEstadoCartao();
    cartao.classList.add("hidden");
    pix.classList.remove("hidden");
  }

  document.querySelectorAll(".velvet-tabs .tab").forEach(tab => {
    tab.classList.remove("active");
  });

  const abaAtiva = document.querySelector(
    `.velvet-tabs .tab[data-metodo="${tipo}"]`
  );

  abaAtiva?.classList.add("active");
}


function montarFormularioCartao({ limpar = true } = {}) {
  const form = document.getElementById("formCartao");
  if (!form) return;

  form.classList.remove("hidden");

  if (!limpar) return;

  const campos = [
    "card_number",
    "card_holder",
    "card_exp_month",
    "card_exp_year",
    "card_cvv",
    "card_phone",
    "billing_line_1",
    "billing_line_2",
    "billing_zip_code",
    "billing_city",
    "billing_state",
    "billing_country"
  ];

  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function obterCpfValido() {
  const input =
    document.getElementById("cpfPagamento") ||
    document.getElementById("cpfEscolha");

  if (!input) {
    alert("Campo de CPF não encontrado.");
    return null;
  }

  const cpf = String(input.value || "").replace(/\D/g, "");

  if (cpf.length !== 11) {
    alert("Informe um CPF válido para continuar.");
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
    alert("Campo de telefone não encontrado.");
    return null;
  }

  const telefone = String(input.value || "").replace(/\D/g, "");

  if (telefone.length < 10 || telefone.length > 11) {
    alert("Informe um telefone válido com DDD.");
    input.focus();
    return null;
  }

  return telefone;
}

function atualizarStatusCartao(texto) {
  const btn =
    document.getElementById("btnConfirmarCartao") ||
    document.getElementById("confirmarPagamento");

  if (btn) btn.innerText = texto;
}

function limparErrosCartao() {
  const ids = [
    "card_number_error",
    "card_holder_error",
    "card_exp_month_error",
    "card_exp_year_error",
    "card_cvv_error",
    "card_phone_error",
    "billing_line_1_error",
    "billing_zip_code_error",
    "billing_city_error",
    "billing_state_error"
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = "";
  });
}

function mostrarErroCartao(campo, mensagem) {
  const mapa = {
    card_number: "card_number_error",
    holder_name: "card_holder_error",
    exp_month: "card_exp_month_error",
    exp_year: "card_exp_year_error",
    cvv: "card_cvv_error",
    phone: "card_phone_error",
    billing_line_1: "billing_line_1_error",
    billing_zip_code: "billing_zip_code_error",
    billing_city: "billing_city_error",
    billing_state: "billing_state_error"
  };

  const el = document.getElementById(mapa[campo]);
  if (el) el.innerText = mensagem;
}

function validarCamposCartao({ number, holder_name, exp_month, exp_year, cvv }) {
  let ok = true;

  limparErrosCartao();

  const numeroLimpo = String(number || "").replace(/\D/g, "");
  const nomeLimpo = String(holder_name || "").trim();
  const mesLimpo = String(exp_month || "").replace(/\D/g, "");
  const anoLimpo = String(exp_year || "").replace(/\D/g, "");
  const cvvLimpo = String(cvv || "").replace(/\D/g, "");

  if (numeroLimpo.length < 13 || numeroLimpo.length > 19) {
    mostrarErroCartao("card_number", "Número do cartão inválido.");
    ok = false;
  }

  if (!nomeLimpo || nomeLimpo.length < 3) {
    mostrarErroCartao("holder_name", "Informe o nome impresso no cartão.");
    ok = false;
  }

  const mesNum = Number(mesLimpo);
  if (!mesLimpo || mesNum < 1 || mesNum > 12) {
    mostrarErroCartao("exp_month", "Mês inválido.");
    ok = false;
  }

  if (!anoLimpo || anoLimpo.length !== 4) {
    mostrarErroCartao("exp_year", "Ano inválido.");
    ok = false;
  }

  if (!cvvLimpo || cvvLimpo.length < 3 || cvvLimpo.length > 4) {
    mostrarErroCartao("cvv", "CVV inválido.");
    ok = false;
  }

  return ok;
}

function aplicarMascarasCamposCartao() {
  const numero = document.getElementById("card_number");
  const mes = document.getElementById("card_exp_month");
  const ano = document.getElementById("card_exp_year");
  const cvv = document.getElementById("card_cvv");

  const phoneCartao = document.getElementById("card_phone");
  const phonePix = document.getElementById("phonePagamento");

  const zip = document.getElementById("billing_zip_code");
  const state = document.getElementById("billing_state");

  // =========================
  // CARTÃO
  // =========================
  if (numero && !numero.dataset.maskBound) {
    numero.dataset.maskBound = "true";
    numero.addEventListener("input", () => {
      let v = numero.value.replace(/\D/g, "").slice(0, 19);
      v = v.replace(/(\d{4})(?=\d)/g, "$1 ");
      numero.value = v;
    });
  }

  if (mes && !mes.dataset.maskBound) {
    mes.dataset.maskBound = "true";
    mes.addEventListener("input", () => {
      mes.value = mes.value.replace(/\D/g, "").slice(0, 2);
    });
  }

  if (ano && !ano.dataset.maskBound) {
    ano.dataset.maskBound = "true";
    ano.addEventListener("input", () => {
      ano.value = ano.value.replace(/\D/g, "").slice(0, 4);
    });
  }

  if (cvv && !cvv.dataset.maskBound) {
    cvv.dataset.maskBound = "true";
    cvv.addEventListener("input", () => {
      cvv.value = cvv.value.replace(/\D/g, "").slice(0, 4);
    });
  }

  // =========================
  // TELEFONE (reutilizável)
  // =========================
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

  aplicarMascaraTelefone(phoneCartao);
  aplicarMascaraTelefone(phonePix);

  // =========================
  // CEP
  // =========================
  if (zip && !zip.dataset.maskBound) {
    zip.dataset.maskBound = "true";
    zip.addEventListener("input", e => {
      let v = e.target.value.replace(/\D/g, "").slice(0, 8);
      if (v.length > 5) v = v.replace(/^(\d{5})(\d{0,3}).*/, "$1-$2");
      e.target.value = v;
    });
  }

  // =========================
  // ESTADO
  // =========================
  if (state && !state.dataset.maskBound) {
    state.dataset.maskBound = "true";
    state.addEventListener("input", e => {
      e.target.value = e.target.value
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 2)
        .toUpperCase();
    });
  }
}

function bindFormularioCartao() {
  const formCartao = document.getElementById("formCartao");
  const btnConfirmar =
    document.getElementById("btnConfirmarCartao") ||
    document.getElementById("confirmarPagamento");

  if (!formCartao || formCartao.dataset.bound === "true") return;

  formCartao.dataset.bound = "true";

  formCartao.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.innerText = "Processando...";
    }

    try {
      const resultado = await pagarComCartao();

      if (!resultado || !resultado.sucesso) {
        if (btnConfirmar) {
          btnConfirmar.disabled = false;
          btnConfirmar.innerText = "Confirmar pagamento";
        }
        return;
      }

      if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.innerText = "Aguardando confirmação...";
      }
    } catch (err) {
      console.error("Erro pagamento:", err);
      alert("Erro ao processar pagamento");

      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.innerText = "Confirmar pagamento";
      }
    }
  });
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

  pagamentoAtual = {
    tipo: "vip",
    modelo_id: modeloId,
    valor: valorFinal,
    valor_base: valorBase,
    desconto
  };
  window.pagamentoAtual = pagamentoAtual;

  preencherResumoVIP({ valorBase, desconto });
  montarFormularioCartao();
  aplicarMascarasCamposCartao();
  bindFormularioCartao();
}


function iniciarCartaoMidia() {
  const midia = window.MIDIA_VENDA_ATUAL;

  if (!midia?.conteudo_id) {
    console.error("MIDIA_VENDA_ATUAL inválida:", midia);
    return;
  }

  pagamentoAtual = {
    tipo: "midia",
    conteudo_id: Number(midia.conteudo_id),
    valor: Number(midia.preco || 0),
    descricao: midia.descricao || ""
  };
  window.pagamentoAtual = pagamentoAtual;

  preencherResumoMidia({
    valor: Number(midia.preco || 0),
    descricao: midia.descricao || ""
  });

  montarFormularioCartao();
  aplicarMascarasCamposCartao();
  bindFormularioCartao();
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

function iniciarCartaoPremium() {
  const premium = window.PREMIUM_ATUAL;

  if (!premium?.premium_post_id) {
    console.error("PREMIUM_ATUAL inválido:", premium);
    return;
  }

  pagamentoAtual = {
    tipo: "premium",
    premium_post_id: Number(premium.premium_post_id),
    valor: Number(premium.preco || 0),
    descricao: premium.descricao || ""
  };

  window.pagamentoAtual = pagamentoAtual;

  preencherResumoMidia({
    valor: Number(premium.preco || 0),
    descricao: premium.descricao || ""
  });

  montarFormularioCartao();
  aplicarMascarasCamposCartao();
  bindFormularioCartao();
}

function resetarEstadoCartao() {
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");

  [
    "card_number",
    "card_holder",
    "card_exp_month",
    "card_exp_year",
    "card_cvv",
    "card_phone",
    "billing_line_1",
    "billing_line_2",
    "billing_zip_code",
    "billing_city",
    "billing_state",
    "billing_country"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

window.pagarComPix = async function ({ tipo, modelo_id, conteudo_id, premium_post_id }) {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Sessão expirada. Faça login novamente.");
      return;
    }

    const cpf = document
      .getElementById("cpfPagamento")
      ?.value
      ?.replace(/\D/g, "");

    const aceitou_termos = document
      .getElementById("aceiteTermosPagamento")
      ?.checked;

    // 🔒 VALIDAÇÃO ÚNICA
    if (!aceitou_termos || !cpf || cpf.length !== 11) {
      alert("Você precisa indicar seu CPF e aceitar os termos para continuar.");
      return;
    }

    abrirPopupPagamentoPixLoading();

    let url = "";
    let body = {};

if (tipo === "vip") {
  const modeloIdFinal = Number(modelo_id || window.MODELO_ID_ATUAL);

  if (!modeloIdFinal) {
    console.error("modelo_id inválido:", modelo_id, window.MODELO_ID_ATUAL);
    alert("Erro interno: modelo não identificado.");
    return;
  }

  url = "/api/pagamento/vip/pix";

const telefoneLimpo = obterTelefoneValido();
if (!telefoneLimpo) return;

body = {
  tipo: "vip",
  modelo_id: modeloIdFinal,
  cpf,
  telefone: telefoneLimpo,
  aceitou_termos,
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
    fingerprint: gerarFingerprint()
  };
}

    if (tipo === "midia") {
      url = "/api/pagamento/midia/pix";
      body = {
        tipo: "midia",
        conteudo_id,
        cpf,
        aceitou_termos,
        fingerprint: gerarFingerprint()
      };
    }

    if (!url) {
  alert("Tipo de pagamento inválido.");
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

    qr.src = data.qr_code_url;
    codigo.value = data.copia_cola;

    qr.classList.remove("hidden");
    codigo.classList.remove("hidden");
    btnCopiar?.classList.remove("hidden");

    document.getElementById("pixLoading")?.classList.add("hidden");
    document.getElementById("pixAguardando")?.classList.remove("hidden");

    console.log("PIX RESPONSE:", data);
    if (!data.qr_code_url) {
  alert("Erro ao gerar QR Code PIX");
  return;
}
    iniciarVerificacaoPix(data.order_id);

  } catch (err) {
    document.getElementById("pixLoading")?.classList.add("hidden");
    alert(err.message || "Erro ao gerar Pix");
  }
};

async function copiarPix() {
  const input = document.getElementById("pixCodigo");

  if (!input || !input.value) {
    alert("Código Pix indisponível no momento.");
    return;
  }

  try {
    input.select?.();
    input.setSelectionRange?.(0, 99999);
    await navigator.clipboard.writeText(input.value);
    alert("Código Pix copiado 💜");
  } catch (err) {
    console.error("Erro ao copiar Pix:", err);
    alert("Não foi possível copiar o código Pix.");
  }
}

function abrirPopupPagamentoPixLoading() {
  const popup = document.getElementById("popupPagamentoVelvet");
  popup?.classList.remove("hidden");

  // reseta cartão também
  resetarEstadoCartao();

  // mostra PIX loading
  document.getElementById("conteudoPix")?.classList.remove("hidden");
  document.getElementById("conteudoCartao")?.classList.add("hidden");

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
document.getElementById("formCartao")?.classList.add("hidden");

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

  // 🔒 UI de sucesso (igual você já tem)
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("pix-aguardando-anim");
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");

  document.getElementById("pixSucesso")?.classList.remove("hidden");
  document.getElementById("cartaoSucesso")?.classList.remove("hidden");

  // ⏳ pequeno delay pra UX
  setTimeout(async () => {
    fecharPopupPagamento();

    // 🔥 BUSCA A MÍDIA LIBERADA
    const res = await fetch(`/api/conteudo/liberado/${message_id}`, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) return;

    const midias = await res.json();

    if (!midias.length) return;

    const midia = midias[0];

    // 🎬 ABRE AUTOMATICAMENTE
    abrirModalMidia(
      midia.url,
      midia.tipo === "video"
    );

  }, 1200);
 });
 

});

window.MIDIA_VENDA_ATUAL = null;


async function pagarComCartao(tipoParam = null) {
  const tipo = tipoParam || pagamentoAtual?.tipo || window.PAGAMENTO_TIPO_ATUAL || "midia";

  const cpf = obterCpfValido();
  if (!cpf) return { sucesso: false };

  pagamentoAtual = pagamentoAtual || {};
  pagamentoAtual.tipo = tipo;
  pagamentoAtual.cpf = cpf;

  if (pagamentoEmProcesso) return { sucesso: false };
  pagamentoEmProcesso = true;

  try {
    const form = document.getElementById("formCartao");
    if (!form) {
      console.error("formCartao não encontrado");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    limparErrosCartao();

    // =========================
    // DADOS DO CARTÃO
    // =========================
    const numero = form.querySelector("#card_number")?.value?.trim() || "";
    const nome = form.querySelector("#card_holder")?.value?.trim() || "";
    const mes = form.querySelector("#card_exp_month")?.value?.trim() || "";
    const ano = form.querySelector("#card_exp_year")?.value?.trim() || "";
    const cvv = form.querySelector("#card_cvv")?.value?.trim() || "";

    const valido = validarCamposCartao({
      number: numero,
      holder_name: nome,
      exp_month: mes,
      exp_year: ano,
      cvv
    });

    if (!valido) {
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    // =========================
    // TELEFONE
    // =========================

const telefoneBruto =
  document.getElementById("phonePagamento")?.value?.trim() ||
  form.querySelector("#card_phone")?.value?.trim() ||
  form.querySelector("#phone")?.value?.trim() ||
  "";

const telefone = telefoneBruto.replace(/\D/g, "");

if (telefone.length < 10 || telefone.length > 11) {
  alert("Informe um telefone válido com DDD.");
  pagamentoEmProcesso = false;
  return { sucesso: false };
}

const phone_area_code = telefone.slice(0, 2);
const phone_number = telefone.slice(2);

    // =========================
    // ENDEREÇO
    // =========================
    const enderecoLinha1 =
      form.querySelector("#billing_line_1")?.value?.trim() ||
      form.querySelector("#card_address")?.value?.trim() ||
      "";

    const enderecoLinha2 =
      form.querySelector("#billing_line_2")?.value?.trim() ||
      form.querySelector("#card_address_2")?.value?.trim() ||
      "";

    const cep =
      form.querySelector("#billing_zip_code")?.value?.trim() ||
      form.querySelector("#card_zipcode")?.value?.trim() ||
      "";

    const cidade =
      form.querySelector("#billing_city")?.value?.trim() ||
      form.querySelector("#card_city")?.value?.trim() ||
      "";

    const estado =
      form.querySelector("#billing_state")?.value?.trim() ||
      form.querySelector("#card_state")?.value?.trim() ||
      "";

    const pais =
      form.querySelector("#billing_country")?.value?.trim() || "BR";

    const zipCodeLimpo = cep.replace(/\D/g, "");

    if (!enderecoLinha1) {
      alert("Informe o endereço.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    if (!zipCodeLimpo || zipCodeLimpo.length < 8) {
      alert("Informe um CEP válido.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    if (!cidade) {
      alert("Informe a cidade.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

    if (!estado || estado.length < 2) {
      alert("Informe o estado.");
      pagamentoEmProcesso = false;
      return { sucesso: false };
    }

 if (tipo === "vip") {
  const modelo_id = Number(
    pagamentoAtual.modelo_id ||
    window.MODELO_ID_ATUAL
  );

  if (!modelo_id) {
    alert("Modelo inválido");
    pagamentoEmProcesso = false;
    return { sucesso: false };
  }

  const aceitou_termos = !!document.getElementById("aceiteTermosPagamento")?.checked;

  if (!aceitou_termos) {
    alert("Você precisa aceitar os termos.");
    pagamentoEmProcesso = false;
    return { sucesso: false };
  }

  const fingerprint = gerarFingerprint();

  atualizarStatusCartao("💳 Processando assinatura VIP...");

 const payload = {
  modelo_id,
  cpf: pagamentoAtual.cpf,
  telefone,
  aceitou_termos,
  fingerprint,
  billing_address: {
    line_1: enderecoLinha1,
    zip_code: zipCodeLimpo,
    city: cidade,
    state: estado.toUpperCase(),
    country: pais.toUpperCase(),
    ...(enderecoLinha2 ? { line_2: enderecoLinha2 } : {})
  },
  card_number: numero.replace(/\s/g, ""),
  card_holder_name: nome,
  card_exp_month: Number(mes),
  card_exp_year: Number(ano),
  card_cvv: cvv.replace(/\D/g, "")
};

  console.log("Payload PSP /api/pagamento/vip/cartao:", payload);

  mostrarLoadingCartao();

  const res = await fetch("/api/pagamento/vip/cartao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Erro retorno VIP cartão:", data);
    alert(data?.error || data?.detalhe || "Erro no pagamento VIP com cartão.");

    document.getElementById("cartaoLoading")?.classList.add("hidden");
    document.getElementById("formCartao")?.classList.remove("hidden");

    atualizarStatusCartao("❌ Falha no pagamento");
    pagamentoEmProcesso = false;
    return { sucesso: false };
  }

pagamentoAtual.payment_id = data.payment_id || data.order_id || null;
pagamentoAtual.assinatura_id = data.assinatura_id || null;

  atualizarStatusCartao("⏳ Aguardando confirmação...");

  if (pagamentoAtual.payment_id) {
    iniciarPollingPagamento(
  pagamentoAtual.payment_id,
  modelo_id,
  "cartao"
);
  }

  pagamentoEmProcesso = false;
  return { sucesso: true, aguardando_confirmacao: true };
}
    // =========================
    // PREMIUM
    // =========================
    if (tipo === "premium") {
      const premium_post_id = Number(pagamentoAtual.premium_post_id);

      if (!premium_post_id) {
        alert("Post premium inválido");
        pagamentoEmProcesso = false;
        return { sucesso: false };
      }

      const aceitou_termos = !!document.getElementById("aceiteTermosPagamento")?.checked;

      if (!aceitou_termos) {
        alert("Você precisa aceitar os termos.");
        pagamentoEmProcesso = false;
        return { sucesso: false };
      }

      atualizarStatusCartao("💳 Processando pagamento...");

      const payload = {
        premium_post_id,
        cpf: pagamentoAtual.cpf,
        aceitou_termos,
        fingerprint: gerarFingerprint(),
        phone_area_code,
        phone_number,
        billing_address: {
          line_1: enderecoLinha1,
          zip_code: zipCodeLimpo,
          city: cidade,
          state: estado.toUpperCase(),
          country: pais.toUpperCase(),
          ...(enderecoLinha2 ? { line_2: enderecoLinha2 } : {})
        },
        card_number: numero.replace(/\s/g, ""),
        card_holder_name: nome,
        card_exp_month: Number(mes),
        card_exp_year: Number(ano),
        card_cvv: cvv.replace(/\D/g, "")
      };

      mostrarLoadingCartao();

      const res = await fetch("/api/pagamento/premium/cartao", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Erro retorno PREMIUM cartão:", data);
        alert(data?.error || data?.detalhe || "Erro no pagamento premium com cartão.");

        document.getElementById("cartaoLoading")?.classList.add("hidden");
        document.getElementById("formCartao")?.classList.remove("hidden");

        atualizarStatusCartao("❌ Falha no pagamento");
        pagamentoEmProcesso = false;
        return { sucesso: false };
      }

 pagamentoAtual.payment_id = data.payment_id || data.order_id || null;
      pagamentoAtual.premium_post_id = data.premium_post_id || premium_post_id;
      
      atualizarResumoCartaoPagamento(pagamentoAtual.valor);

      atualizarStatusCartao("⏳ Aguardando confirmação...");

      if (pagamentoAtual.payment_id) {
        iniciarPollingPagamento(
          pagamentoAtual.payment_id,
          pagamentoAtual.premium_post_id,
          "cartao"
        );
      }

      pagamentoEmProcesso = false;
      return { sucesso: true, aguardando_confirmacao: true };
    }

    // =========================
// MÍDIA
// =========================
if (tipo === "midia") {
  const conteudo_id = Number(pagamentoAtual.conteudo_id);

  if (!conteudo_id) {
    alert("Conteúdo inválido");
    pagamentoEmProcesso = false;
    return { sucesso: false };
  }

  atualizarStatusCartao("💳 Processando pagamento...");

  const payload = {
    conteudo_id,
    cpf: pagamentoAtual.cpf,
    phone_area_code,
    phone_number,
    billing_address: {
      line_1: enderecoLinha1,
      zip_code: zipCodeLimpo,
      city: cidade,
      state: estado.toUpperCase(),
      country: pais.toUpperCase(),
      ...(enderecoLinha2 ? { line_2: enderecoLinha2 } : {})
    },
    card_number: numero.replace(/\s/g, ""),
    card_holder_name: nome,
    card_exp_month: Number(mes),
    card_exp_year: Number(ano),
    card_cvv: cvv.replace(/\D/g, "")
  };

  mostrarLoadingCartao();

  const res = await fetch("/api/pagamento/midia/cartao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Erro retorno MIDIA cartão:", data);
    alert(
      data?.error ||
      data?.detalhe ||
      "Erro no pagamento de conteúdo."
    );

    document.getElementById("cartaoLoading")?.classList.add("hidden");
    document.getElementById("formCartao")?.classList.remove("hidden");

    atualizarStatusCartao("❌ Falha no pagamento");
    pagamentoEmProcesso = false;
    return { sucesso: false };
  }

pagamentoAtual.payment_id = data.payment_id || data.order_id || null;
pagamentoAtual.message_id = data.message_id || null;
pagamentoAtual.conteudo_id = conteudo_id;

  atualizarResumoCartaoPagamento(pagamentoAtual.valor);

  atualizarStatusCartao("⏳ Aguardando confirmação...");

  if (pagamentoAtual.payment_id) {
    iniciarPollingPagamento(
      pagamentoAtual.payment_id,
      pagamentoAtual.message_id,
      "cartao"
    );
  }

  pagamentoEmProcesso = false;
  return { sucesso: true, aguardando_confirmacao: true };
}

    alert("Tipo de pagamento inválido");
    pagamentoEmProcesso = false;
    return { sucesso: false };

} catch (err) {
  console.error("Erro no pagamento com cartão:", err);
  alert(err.message || "Erro inesperado ao processar cartão");

  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.remove("hidden");

  atualizarStatusCartao("❌ Falha no pagamento");
  pagamentoEmProcesso = false;
  return { sucesso: false };
}
}


window.iniciarCartao = function () {
  mostrarMetodo("cartao");
};

function pagamentoConfirmado() {
  // PIX
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");

  // Cartão
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");

  // Sucesso
  document.getElementById("pixSucesso")?.classList.remove("hidden");
  document.getElementById("cartaoSucesso")?.classList.remove("hidden");

  setTimeout(() => {
    fecharPopupPagamento();
  }, 1200);
}

window.fecharPopupPagamento = function () {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) return;

  // para pollings ativos
  if (pollingPixInterval) {
    clearInterval(pollingPixInterval);
    pollingPixInterval = null;
  }

  if (pollingCartaoInterval) {
    clearInterval(pollingCartaoInterval);
    pollingCartaoInterval = null;
  }

  // fecha popup
  popup.classList.add("hidden");

  // limpa estados PIX
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
  document.getElementById("pixSucesso")?.classList.add("hidden");
  document.getElementById("pixQr")?.classList.add("hidden");

  const pixCodigo = document.getElementById("pixCodigo");
  if (pixCodigo) {
    pixCodigo.classList.add("hidden");
    pixCodigo.value = "";
  }

  document.getElementById("btnCopiarPix")?.classList.add("hidden");

  // limpa estados cartão
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");

  // esconde conteúdos
  document.getElementById("conteudoPix")?.classList.add("hidden");
  document.getElementById("conteudoCartao")?.classList.add("hidden");

  // reseta abas
  document.querySelectorAll(".velvet-tabs .tab").forEach(tab => {
    tab.classList.remove("active");
  });

  pagamentoAtual = {};
  window.pagamentoAtual = pagamentoAtual;
  window.MIDIA_VENDA_ATUAL = null;

  limparPagamentoConfirmado();
};

function mostrarLoadingCartao() {
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
  document.getElementById("cartaoLoading")?.classList.remove("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");
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

let pollingPixInterval = null;

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

          const resLiberado = await fetch(`/api/conteudo/liberado/${messageId}`, {
            headers: {
              Authorization: "Bearer " + localStorage.getItem("token")
            }
          });

          if (!resLiberado.ok) return;

          const midias = await resLiberado.json();
          if (!midias.length) return;

          abrirModalMidia(midias[0].url, midias[0].tipo === "video");
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

        alert("Este Pix expirou. Gere um novo.");
        return;
      }

      // =========================
      // PAGAMENTO FALHOU
      // =========================
      if (data.status === "falhou") {
        clearInterval(pollingPixInterval);
        pollingPixInterval = null;

        document.getElementById("pixAguardando")?.classList.add("hidden");

        alert("Pagamento não aprovado.");
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

let pollingCartaoInterval = null;

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
        document.getElementById("formCartao")?.classList.add("hidden");

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

        if (!messageId) {
          setTimeout(() => {
            fecharPopupPagamento();
          }, 1200);
          return;
        }

        setTimeout(async () => {
          fecharPopupPagamento();

          const liberado = await fetch(`/api/conteudo/liberado/${messageId}`, {
            headers: {
              Authorization: "Bearer " + localStorage.getItem("token")
            }
          });

          if (!liberado.ok) return;

          const midias = await liberado.json();
          if (!midias.length) return;

          abrirModalMidia(midias[0].url, midias[0].tipo === "video");
        }, 1200);

        return;
      }

      if (data.status === "falhou" || data.status === "expirado") {
        clearInterval(pollingCartaoInterval);
        pollingCartaoInterval = null;

        document.getElementById("cartaoLoading")?.classList.add("hidden");
        document.getElementById("formCartao")?.classList.remove("hidden");
        atualizarStatusCartao("❌ Falha no pagamento");
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

document.addEventListener("DOMContentLoaded", () => {
  aplicarMascarasCamposCartao();
  bindFormularioCartao();
});


document.getElementById("btnGerarPix")?.addEventListener("click", () => {
  if (window.PAGAMENTO_TIPO_ATUAL === "vip") {
    pagarComPix({ tipo: "vip", modelo_id: window.MODELO_ID_ATUAL });
  }

  if (window.PAGAMENTO_TIPO_ATUAL === "midia") {
    pagarComPix({ tipo: "midia", conteudo_id: window.MIDIA_VENDA_ATUAL?.conteudo_id });
  }

  if (window.PAGAMENTO_TIPO_ATUAL === "premium") {
    pagarComPix({ tipo: "premium", premium_post_id: window.PREMIUM_ATUAL?.premium_post_id });
  }
});



