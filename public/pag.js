
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
const TAXA_TRANSACAO = 0.15;
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

function preencherResumoVIP({ valorBase, desconto = 0 }) {
  const valorComDesconto = valorBase - desconto;
  const taxa = valorComDesconto * TAXA_TRANSACAO;
  const total = valorComDesconto + taxa;

  document.getElementById("vipValorBase").textContent =
    valorBase.toFixed(2);

  document.getElementById("vipDesconto").textContent =
    desconto.toFixed(2);

  document.getElementById("vipTaxa").textContent =
    taxa.toFixed(2);

  document.getElementById("vipTotal").textContent =
    total.toFixed(2);

  // 🔒 guarda para PIX / CARTÃO
  window.VALOR_VIP_ATUAL = total;
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
  message_id
}) {
  try {
    const token = localStorage.getItem("token");

    // 🔒 blindagens essenciais
    if (!token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    if (tipo === "vip") {
      // garante modelo_id sempre válido
      modelo_id = modelo_id || window.MODELO_ID_ATUAL;

      if (!modelo_id || isNaN(Number(modelo_id))) {
        throw new Error("modelo_id inválido (front)");
      }
    }

    abrirPopupPagamentoPixLoading();

    let url = "";
    let body = {};

    if (tipo === "vip") {
      url = "/api/pagamento/vip/pix";
      body = { modelo_id };
    }

    if (tipo === "conteudo") {
      if (!message_id) {
        throw new Error("message_id inválido");
      }

      url = "/api/pagamento/conteudo/pix";
      body = { message_id };
    }

    // 🔎 LOG PARA DEBUG (pode remover depois)
    console.log("🟣 Pix payload enviado:", body);

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
      console.error("❌ Pix HTTP:", res.status, erro);
      throw new Error(`Pix ${res.status}: ${erro}`);
    }

    const data = await res.json();

    // 🧾 mostra QR
    const qr = document.getElementById("pixQr");
    const codigo = document.getElementById("pixCodigo");
    const btnCopiar =
      document.querySelector("#conteudoPix .btn-secundario");

    qr.src = `data:image/png;base64,${data.qr_code}`;
    codigo.value = data.copia_cola;

    qr.classList.remove("hidden");
    codigo.classList.remove("hidden");
    btnCopiar?.classList.remove("hidden");
    // mostra QR e estado aguardando
document.getElementById("pixLoading")?.classList.add("hidden");
document.getElementById("pixAguardando")?.classList.remove("hidden");

// ===============================
// 🔁 FALLBACK VIP (AQUI 👇)
// ===============================
if (tipo === "vip") {

  // limpa polling antigo (segurança)
  window.__INTERVALO_VIP__ && clearInterval(window.__INTERVALO_VIP__);

  window.__INTERVALO_VIP__ = setInterval(async () => {
    try {

      // popup foi fechado → para tudo
      if (
        document
          .getElementById("popupPagamentoVelvet")
          ?.classList.contains("hidden")
      ) {
        clearInterval(window.__INTERVALO_VIP__);
        return;
      }

      const res = await fetch(`/api/vip/status/${window.MODELO_ID_ATUAL}`, {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("token")
        }
      });

      if (!res.ok) return;

      const data = await res.json();

      if (data.vip === true) {
        clearInterval(window.__INTERVALO_VIP__);

        document.getElementById("pixAguardando")?.classList.add("hidden");
        document.getElementById("pixSucesso")?.classList.remove("hidden");

        setTimeout(() => {
          fecharPopupPagamento();
          location.reload();
        }, 1200);
      }

    } catch (err) {
      console.error("Erro polling VIP:", err);
    }
  }, 3000);
}

  } catch (err) {
    console.error("❌ Erro Pix FRONT:", err.message);

    document.getElementById("pixLoading")
      ?.classList.add("hidden");

    document.getElementById("pixAguardando")
      ?.classList.add("hidden");

    alert(err.message || "Erro ao gerar Pix. Tente novamente.");
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

async function pagarComCartao({ tipo, message_id, modelo_id }) {
  initStripe();

  try {
    const token = localStorage.getItem("token");

    mostrarMetodo("cartao");

    // 🔄 limpa estado anterior
    if (cardElement) {
      cardElement.unmount();
      cardElement = null;
      elements = null;
    }

    document.getElementById("cartaoLoading")
      .classList.remove("hidden");

    document.getElementById("formCartao")
      .classList.add("hidden");

    let url = "";
    let body = {};

    if (tipo === "conteudo") {
      url = "/api/pagamento/conteudo/cartao";
      body = { message_id };
    }

    if (tipo === "vip") {
       url = "/api/pagamento/vip/cartao"
      body = { modelo_id };
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
    clientSecretAtual = data.clientSecret;

    if (!clientSecretAtual) {
      throw new Error("client_secret inválido");
    }

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
  mostrarMetodo("cartao");

  pagarComCartao({
    tipo: window.PAGAMENTO_TIPO_ATUAL,
    modelo_id: window.MODELO_ID_ATUAL
  });
};

function pagamentoConfirmado() {
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

async function confirmarPagamentoCartao() {
  try {
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href
      }
    });

    if (error) {
      console.error("❌ Erro ao confirmar pagamento:", error);
      alert(error.message || "Erro ao processar pagamento");
      return;
    }

    // Se não houve erro imediato, o Stripe redireciona
    // ou confirma automaticamente
    pagamentoConfirmado();

  } catch (err) {
    console.error("❌ Erro inesperado:", err);
    alert("Erro ao confirmar pagamento");
  }
}









