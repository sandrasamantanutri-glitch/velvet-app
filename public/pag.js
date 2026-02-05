
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

const formCartao = document.getElementById("formCartao");

if (formCartao) {
  formCartao.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      alert("Pagamento não inicializado");
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
}


function abrirPopupPagamento(dados) {
  const popup = document.getElementById("popupPagamentoVelvet");
  popup.classList.remove("hidden");

  // PIX
  document.getElementById("pixQr").src = dados.pix.qr;
  document.getElementById("pixCodigo").value = dados.pix.codigo;

  // CARTÃO
  // Aqui você pode inicializar Stripe / MP
  // exemplo: initStripe(dados.cartao)
}

function fecharPopupPagamento() {
  document.getElementById("popupPagamentoVelvet")
    .classList.add("hidden");

  if (cardElement) {
    cardElement.unmount();
    cardElement = null;
  }
}


function mostrarMetodo(tipo) {
  const pix = document.getElementById("conteudoPix");
  const cartao = document.getElementById("conteudoCartao");

  pix.classList.toggle("hidden", tipo !== "pix");
  cartao.classList.toggle("hidden", tipo !== "cartao");

  document.querySelectorAll(".velvet-tabs .tab")
    .forEach(tab => {
      tab.classList.toggle(
        "active",
        tab.dataset.metodo === tipo
      );
    });
}

window.pagarComPix = async function ({
  tipo,
  modelo_id,
  valor_assinatura,
  message_id
}) {
  try {
    const token = localStorage.getItem("token");

    abrirPopupPagamentoPixLoading();

    let url = "";
    let body = {};

    if (tipo === "vip") {
      url = "/api/pagamento/vip/pix";
      body = { modelo_id, valor_assinatura };
    }

    if (tipo === "conteudo") {
      url = "/api/pagamento/conteudo/pix";
      body = { message_id };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error("Erro Pix");

    const data = await res.json();

    // mostra QR
    const qr = document.getElementById("pixQr");
    const codigo = document.getElementById("pixCodigo");
    const btnCopiar = document.querySelector("#conteudoPix .btn-secundario");

    qr.src = `data:image/png;base64,${data.qr_code}`;
    codigo.value = data.copia_cola;

    qr.classList.remove("hidden");
    codigo.classList.remove("hidden");
    btnCopiar?.classList.remove("hidden");

    document.getElementById("pixLoading")
      ?.classList.add("hidden");

    document.getElementById("pixAguardando")
      ?.classList.remove("hidden");

  } catch (err) {
    console.error(err);
    alert("Erro ao gerar Pix");
    fecharPopupPagamento();
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

  mostrarMetodo("pix");

  // estados iniciais
  document.getElementById("pixLoading")?.classList.remove("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
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

socket.on("vipAtivado", ({ modelo_id }) => {
  document.getElementById("pixAguardando")
    .classList.add("hidden");

  document.getElementById("pixSucesso")
    .classList.remove("hidden");

  setTimeout(() => {
    fecharPopupPagamento();
    atualizarUIVip(modelo_id);
  }, 1500);
});

socket.on("conteudoVisto", ({ message_id }) => {
  // esconde estados Pix
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");

  // esconde estados Cartão
  document.getElementById("cartaoLoading")?.classList.add("hidden");
  document.getElementById("formCartao")?.classList.add("hidden");

  // mostra sucesso genérico
  document.getElementById("pixSucesso")
    ?.classList.remove("hidden");

  document.getElementById("cartaoSucesso")
    ?.classList.remove("hidden");

  setTimeout(() => {
    fecharPopupPagamento();
  }, 1200);
});
})

function initStripe() {
  if (stripe) return stripe;

  stripe = Stripe(window.STRIPE_PUBLIC_KEY);
  return stripe;
}


async function pagarComCartao({ tipo, message_id, modelo_id, valor_assinatura }) {
    initStripe();
  try {
    const token = localStorage.getItem("token");
    mostrarMetodo("cartao");

    document.getElementById("cartaoLoading")
      .classList.remove("hidden");

    document.getElementById("formCartao")
      .classList.add("hidden");

    let url = "";
    let body = {};

    // 🔓 CONTEÚDO
    if (tipo === "conteudo") {
      url = "/api/pagamento/conteudo/cartao";
      body = { message_id };
    }

    // 💜 VIP avulso
    if (tipo === "vip") {
      url = "/api/pagamento/vip/cartao";
      body = { modelo_id, valor_assinatura };
    }

    // ⚠️ VIP recorrente (OUTRO fluxo – não usar aqui ainda)
    // if (tipo === "vip_recorrente") {
    //   url = "/api/vip/cartao/assinatura";
    //   body = { modelo_id };
    // }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error("Erro cartão");

    const data = await res.json();
    clientSecretAtual = data.clientSecret;

    elements = stripe.elements({ clientSecret: clientSecretAtual });
    cardElement = elements.create("payment");
    cardElement.mount("#card-element");

    document.getElementById("cartaoLoading")
      .classList.add("hidden");

    document.getElementById("formCartao")
      .classList.remove("hidden");

  } catch (err) {
    console.error("❌ Erro cartão:", err);
    alert("Erro ao iniciar pagamento com cartão");
  }
}

window.iniciarCartao = function () {
  console.log("💳 Iniciando pagamento com cartão");

  // mostra visualmente o cartão
  mostrarMetodo("cartao");

  // chama o backend / Stripe
  pagarComCartao({
    tipo: window.PAGAMENTO_TIPO_ATUAL,      // "vip" ou "conteudo"
    modelo_id: window.MODELO_ID_ATUAL,       // definido ao abrir popup
    valor_assinatura: window.VALOR_VIP_ATUAL // só para VIP
  });
};

function pagamentoConfirmado() {
  // Pix
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








