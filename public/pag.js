const stripe = Stripe("pk_live_51Spb5lRtYLPrY4c3L6pxRlmkDK6E0OSU93T5B75V4pY39rJ3FVyPEa6ZDDgqUiY1XCCEay6uQcItbZY4EcAOkoJn00TtsQ8bbz");
window.__CLIENTE_VIP__ = false;
window.__VIP_READY__ = false;

const socket = io();

const params = new URLSearchParams(window.location.search);
const modeloParam = params.get("id");

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

let elements;
let cardElement;
let clientSecretAtual = null;

const formCartao = document.getElementById("formCartao");

if (formCartao) {
  formCartao.addEventListener("submit", async (e) => {
    e.preventDefault();

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required"
    });

    if (error) {
      alert(error.message);
    }
    // ⚠️ NÃO fecha popup aqui
    // quem fecha é o SOCKET (webhook)
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
  document.getElementById("conteudoPix")
    .classList.toggle("hidden", tipo !== "pix");

  document.getElementById("conteudoCartao")
    .classList.toggle("hidden", tipo !== "cartao");

  document.querySelectorAll(".velvet-tabs .tab")
    .forEach(t => t.classList.remove("active"));

  document
    .querySelector(`.tab[onclick*="${tipo}"]`)
    .classList.add("active");
}


async function pagarComPix({ tipo, modelo_id, valor_assinatura, message_id }) {
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

    // 🔥 mostra QR
    document.getElementById("pixQr").src =
      `data:image/png;base64,${data.qr_code}`;

    document.getElementById("pixCodigo").value =
      data.copia_cola;

    document.getElementById("pixLoading")
      .classList.add("hidden");

    document.getElementById("pixAguardando")
      .classList.remove("hidden");

  } catch (err) {
    console.error(err);
    alert("Erro ao gerar Pix");
    fecharPopupPagamento();
  }
}


function abrirPopupPagamentoPix({ qr_base64, copia_cola }) {
  const popup = document.getElementById("popupPagamentoVelvet");
  popup.classList.remove("hidden");

  const img = document.getElementById("pixQr");
  const input = document.getElementById("pixCodigo");

  img.src = `data:image/png;base64,${qr_base64}`;
  input.value = copia_cola;

  mostrarMetodo("pix");
}

function copiarPix() {
  const input = document.getElementById("pixCodigo");
  input.select();
  input.setSelectionRange(0, 99999);
  document.execCommand("copy");

  alert("Código Pix copiado 💜");
}

function abrirPopupPagamentoPixLoading() {
  document.getElementById("popupPagamentoVelvet")
    .classList.remove("hidden");

  document.getElementById("pixLoading")
    .classList.remove("hidden");

  document.getElementById("pixAguardando")
    .classList.add("hidden");

  document.getElementById("pixSucesso")
    .classList.add("hidden");

  document.getElementById("pixQr").src = "";
  document.getElementById("pixCodigo").value = "";

  mostrarMetodo("pix");
}

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


async function pagarComCartao({ tipo, message_id, modelo_id, valor_assinatura }) {
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

// 🔓 Conteúdo
socket.on("conteudoVisto", ({ message_id }) => {
  pagamentoConfirmado();
});

// 💜 VIP
socket.on("vipAtivado", ({ modelo_id }) => {
  pagamentoConfirmado();
  atualizarUIVip?.(modelo_id);
});







