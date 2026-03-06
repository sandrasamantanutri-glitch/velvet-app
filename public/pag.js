localStorage.getItem("token")

window.__CLIENTE_VIP__ = false;
window.__VIP_READY__ = false;

let elements = null;
let stripe = null;
let cardElement;
let clientSecretAtual = null;

function whenSocketReady(cb) {
  if (window.socket) {
    cb(window.socket);
    return;
  }

  const interval = setInterval(() => {
    if (window.socket) {
      clearInterval(interval);
      cb(window.socket);
    }
  }, 50);
}
formCartao.addEventListener("submit", async (e) => {
  e.preventDefault();

  const cpf = document
    .getElementById("cpfPagamento")
    ?.value
    ?.replace(/\D/g, "");

  const aceitou_termos =
    document.getElementById("aceiteTermosPagamento")?.checked;

  if (!cpf || cpf.length !== 11) {
    alert("Informe um CPF válido.");
    return;
  }

  if (!aceitou_termos) {
    alert("Você precisa aceitar os termos.");
    return;
  }

  if (!elements) {
    alert("Pagamento não inicializado.");
    return;
  }

  const { error } = await stripe.confirmPayment({
    elements,
    redirect: "if_required"
  });

  if (error) {
    alert(error.message);
  }
});

function abrirPopupPagamento() {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) return;

  popup.classList.remove("hidden");

  // Reset visual PIX
  document.getElementById("pixQr")?.classList.add("hidden");
  document.getElementById("pixCodigo")?.classList.add("hidden");
  document.getElementById("btnCopiarPix")?.classList.add("hidden");
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
  document.getElementById("pixSucesso")?.classList.add("hidden");

  const pix = document.getElementById("conteudoPix");
  const cartao = document.getElementById("conteudoCartao");
  const tabsContainer = document.querySelector(".velvet-tabs");

  // 🎥 MÍDIA → só cartão
  if (window.PAGAMENTO_TIPO_ATUAL === "midia") {
    tabsContainer?.classList.add("hidden");
    pix?.classList.add("hidden");
    cartao?.classList.remove("hidden");
    iniciarCartaoMidia();
    return;
  }

  // 💜 VIP
  tabsContainer?.classList.remove("hidden");
  pix?.classList.remove("hidden");
  cartao?.classList.add("hidden");

  prepararPagamento();
}

function prepararPagamento() {

  // 🔄 limpa resumos visuais antes de preencher
  document.querySelector(".vip-detalhes")?.classList.add("hidden");
  document.querySelector(".midia-detalhes")?.classList.add("hidden");

  // ===============================
  // 💎 VIP
  // ===============================
  if (window.PAGAMENTO_TIPO_ATUAL === "vip") {

if (!window.OFERTA_ATUAL) {
  console.warn("Sem oferta VIP, usando valor padrão");
}

    const valorBase  = Number(OFERTA_ATUAL.valor_base);
    const valorPromo = Number(OFERTA_ATUAL.valor_promocional);
    const desconto   = valorBase - valorPromo;

    preencherResumoVIP({
      valorBase,
      desconto
    });

    document.querySelector(".vip-detalhes")?.classList.remove("hidden");
    return;
  }

  // ===============================
  // 🔥 MÍDIA
  // ===============================
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


function preencherResumoVIP({ valorBase, desconto = 0 }) {
  const taxaPerc =
    typeof TAXA_TRANSACAO === "number" ? TAXA_TRANSACAO : 0.15;

  const valorComDesconto = valorBase - desconto;
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

function preencherResumoMidia({ valor, descricao }) {

  const taxa = valor * 0.15;
  const total = valor + taxa;

  document.getElementById("midiaValorBase").textContent =
    valor.toFixed(2).replace(".", ",");

  document.getElementById("midiaTaxa").textContent =
    taxa.toFixed(2).replace(".", ",");

  document.getElementById("midiaTotal").textContent =
    total.toFixed(2).replace(".", ",");

  document.querySelector(".vip-beneficios").innerHTML = `
    <strong>Conteúdo exclusivo</strong><br>
    ${descricao || "Acesso imediato após pagamento"}
  `;
}

function mostrarMetodo(tipo) {
  const pix = document.getElementById("conteudoPix");
  const cartao = document.getElementById("conteudoCartao");

  if (!pix || !cartao) return;

if (tipo === "cartao") {
  resetarEstadoPix();

  pix.classList.add("hidden");
  cartao.classList.remove("hidden");

  pagarComCartao({
    tipo: "vip",
    modelo_id: window.MODELO_ID_ATUAL,
    apenasIntent: true
  });
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


function montarStripeVazio() {
  if (cardElement) return;

  initStripe();

  elements = stripe.elements();
  cardElement = elements.create("payment");
  cardElement.mount("#card-element");
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

function resetarEstadoCartao() {
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");

  if (cardElement) {
    cardElement.unmount();
    cardElement = null;
    elements = null;
  }

  const cardEl = document.getElementById("card-element");
  if (cardEl) {
    cardEl.innerHTML = "";
  }
}

window.pagarComPix = async function ({ tipo, modelo_id, conteudo_id }) {
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
      url = "/api/pagamento/vip/pix";
      body = {
        tipo: "vip",
        modelo_id,
        cpf,
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

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const erro = await res.text();
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

function copiarPix() {
  const input = document.getElementById("pixCodigo");
  input.select();
  input.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(input.value);

  alert("Código Pix copiado 💜");
}

function abrirPopupPagamentoPixLoading() {
  const popup = document.getElementById("popupPagamentoVelvet");
  popup.classList.remove("hidden");

  // estados iniciais
  document.getElementById("pixLoading")?.classList.remove("hidden");
  document.getElementById("pixAguardando")?.classList.add("pix-aguardando-anim");
  document.getElementById("pixSucesso")?.classList.add("hidden");

  // limpa dados antigos
  const qr = document.getElementById("pixQr");
  const codigo = document.getElementById("pixCodigo");
  const btnCopiar = document.querySelector("#conteudoPix .btn-secundario");

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

  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.remove("hidden");

  setTimeout(async () => {

    fecharPopupPagamento();

    atualizarUIVip?.(modelo_id);

    await aplicarRegrasDeAcesso?.();
    await carregarFeedBase?.();

  }, 1200);

});

 socket.on("conteudoVisto", async ({ message_id }) => {

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


function initStripe() {
  if (stripe) return stripe;

  stripe = Stripe(window.STRIPE_PUBLIC_KEY);
  return stripe;
}

async function pagarComCartao({ tipo, modelo_id, apenasIntent = false }) {
  initStripe();

  try {
    const token = localStorage.getItem("token");

    if (!token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    // 🔄 limpa estado anterior
    if (cardElement) {
      cardElement.unmount();
      cardElement = null;
      elements = null;
    }

    document.getElementById("cartaoLoading")
      ?.classList.remove("hidden");

    document.getElementById("formCartao")
      ?.classList.add("hidden");

    let url = "";
    let body = {};

    // ===============================
    // 🔐 VALIDAR CPF + TERMOS (OBRIGATÓRIO PARA TODOS)
    // ===============================

    const cpf = document
      .getElementById("cpfPagamento")
      ?.value
      ?.replace(/\D/g, "");

    const aceitou_termos = document
      .getElementById("aceiteTermosPagamento")
      ?.checked;

      if (!apenasIntent) {

  if (!cpf || cpf.length !== 11) {
    alert("Informe um CPF válido.");
    return;
  }

  if (!aceitou_termos) {
    alert("Você precisa aceitar os termos.");
    return;
  }

}

    // ===============================
    // 💎 VIP
    // ===============================

    if (tipo === "vip") {

      modelo_id = modelo_id || window.MODELO_ID_ATUAL;

      if (!modelo_id) {
        throw new Error("modelo_id inválido");
      }

      url = "/api/pagamento/vip/cartao";

body = {
  modelo_id,
  cpf: apenasIntent ? "" : cpf,
  aceitou_termos: apenasIntent ? false : aceitou_termos,
  fingerprint: apenasIntent ? "init" : gerarFingerprint(),
  apenas_intent: apenasIntent
};
    }

    // ===============================
    // 🔥 MÍDIA
    // ===============================

    if (tipo === "midia") {

      const conteudo_id =
        window.MIDIA_VENDA_ATUAL?.conteudo_id;

      if (!conteudo_id) {
        throw new Error("conteudo_id inválido");
      }

      url = "/api/pagamento/midia/cartao";

      body = {
        conteudo_id,
        cpf,
        aceitou_termos,
        fingerprint: gerarFingerprint()
      };
    }

    if (!url) {
      throw new Error("Tipo de pagamento inválido");
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
      const erro = await res.text();
      throw new Error(`Erro cartão ${res.status}: ${erro}`);
    }

    const data = await res.json();
    const clientSecretAtual = data.clientSecret;

    if (!clientSecretAtual) {
      throw new Error("clientSecret inválido");
    }

    elements = stripe.elements({ clientSecret: clientSecretAtual });

    const cardEl = document.getElementById("card-element");
    cardEl.innerHTML = "";

    cardElement = elements.create("payment");
    cardElement.mount("#card-element");

    document.getElementById("cartaoLoading")
      ?.classList.add("hidden");

    document.getElementById("formCartao")
      ?.classList.remove("hidden");

  } catch (err) {
    console.error("❌ Erro cartão:", err);
    alert(err.message || "Erro ao iniciar pagamento com cartão");
  }
}

window.iniciarCartao = function () {
  mostrarMetodo("cartao");
};

function pagamentoConfirmado() {
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("pix-aguardando-anim");

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

let pagamentoEmProcesso = false;

async function confirmarPagamentoCartao() {

  if (pagamentoEmProcesso) return;

  pagamentoEmProcesso = true;

  try {

    if (!elements) {
      alert("Pagamento não inicializado");
      pagamentoEmProcesso = false;
      return;
    }

    const btn = document.getElementById("btnConfirmarCartao");

    if (btn) {
      btn.disabled = true;
      btn.innerText = "Processando...";
    }

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required"
    });

    if (error) {

      alert(error.message);

      pagamentoEmProcesso = false;

      if (btn) {
        btn.disabled = false;
        btn.innerText = "Pagar";
      }

      return;
    }

    // pagamento aprovado no Stripe
    document.getElementById("cartaoSucesso")?.classList.remove("hidden");

    console.log("Stripe aprovado, aguardando webhook...");

  } catch (err) {

    console.error("Erro confirmar cartão:", err);
    alert("Erro ao confirmar pagamento");

    pagamentoEmProcesso = false;

  }
}

window.fecharPopupPagamento = function () {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) return;

  // fecha popup
  popup.classList.add("hidden");

  // limpa estados PIX
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("pix-aguardando-anim");
  document.getElementById("pixSucesso")?.classList.add("hidden");

  // limpa estados cartão
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("cartaoSucesso")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");

  // esconde conteúdos
  document.getElementById("conteudoPix")?.classList.add("hidden");
  document.getElementById("conteudoCartao")?.classList.add("hidden");
};

window.confirmarPix = function () {
  if (window.PAGAMENTO_TIPO_ATUAL !== "midia") return;

  pagarComPix({
    tipo: "midia",
    conteudo_id: window.MIDIA_VENDA_ATUAL?.conteudo_id
  });
};


async function iniciarCartaoMidia() {
  initStripe();
const token = localStorage.getItem("token");

if (!token) {
  throw new Error("Sessão expirada. Faça login novamente.");
  }

  const res = await fetch("/api/pagamento/midia/cartao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({
      conteudo_id: window.MIDIA_VENDA_ATUAL?.conteudo_id
    })
  });

  if (!res.ok) {
    const erro = await res.text();
    throw new Error(erro || "Erro ao iniciar pagamento");
  }

  const data = await res.json();

  // 🔎 resumo vindo do server
  document.getElementById("midiaValorBase").textContent =
    data.resumo.valor_base.toFixed(2);

  document.getElementById("midiaTaxa").textContent =
    (data.resumo.taxa_transacao + data.resumo.taxa_plataforma).toFixed(2);

  document.getElementById("midiaTotal").textContent =
    data.resumo.total.toFixed(2);

  // 💳 Stripe (usa os IDs REAIS do HTML)
  const cardEl = document.getElementById("card-element");
  if (!cardEl) {
    console.error("❌ card-element não encontrado no DOM");
    return;
  }

  cardEl.innerHTML = "";

  elements = stripe.elements({ clientSecret: data.clientSecret });
  const payment = elements.create("payment");
  payment.mount("#card-element");

  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.remove("hidden");
}

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

  // evita múltiplos polling simultâneos
  if (pollingPixInterval) {
    clearInterval(pollingPixInterval);
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

      // =========================
      // PAGAMENTO APROVADO
      // =========================

      if (data.status === "pago") {

        clearInterval(pollingPixInterval);
        pollingPixInterval = null;

        document.getElementById("pixAguardando")?.classList.add("hidden");
        document.getElementById("pixSucesso")?.classList.remove("hidden");

        // =========================
        // VIP
        // =========================

        if (window.PAGAMENTO_TIPO_ATUAL === "vip") {

          setTimeout(async () => {

            fecharPopupPagamento();

            atualizarUIVip?.();
            await aplicarRegrasDeAcesso?.();
            await carregarFeedBase?.();

          }, 1500);

        }

        // =========================
        // MIDIA
        // =========================

        else {

          const messageId = data.message_id;

          setTimeout(async () => {

            fecharPopupPagamento();

            const res = await fetch(`/api/conteudo/liberado/${messageId}`, {
              headers: {
                Authorization: "Bearer " + localStorage.getItem("token")
              }
            });

            if (!res.ok) return;

            const midias = await res.json();

            if (!midias.length) return;

            abrirModalMidia(
              midias[0].url,
              midias[0].tipo === "video"
            );

          }, 1200);

        }

      }

      // =========================
      // PIX EXPIRADO
      // =========================

      if (data.status === "expirado") {

        clearInterval(pollingPixInterval);
        pollingPixInterval = null;

        document.getElementById("pixAguardando")?.classList.add("hidden");

        alert("Este Pix expirou. Gere um novo.");

      }

      // =========================
      // PAGAMENTO FALHOU
      // =========================

      if (data.status === "falhou") {

        clearInterval(pollingPixInterval);
        pollingPixInterval = null;

        document.getElementById("pixAguardando")?.classList.add("hidden");

        alert("Pagamento não aprovado.");

      }

    } catch (err) {

      console.error("Erro verificação PIX:", err);

    }

  }, 5000);

}


document.getElementById("btnGerarPix")?.addEventListener("click", () => {

  if (window.PAGAMENTO_TIPO_ATUAL === "vip") {
    pagarComPix({
      tipo: "vip",
      modelo_id: window.MODELO_ID_ATUAL
    });
  }

  if (window.PAGAMENTO_TIPO_ATUAL === "midia") {
    pagarComPix({
      tipo: "midia",
      conteudo_id: window.MIDIA_VENDA_ATUAL?.conteudo_id
    });
  }

});



