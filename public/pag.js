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


function abrirPopupPagamento() {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) {
    console.error("popupPagamentoVelvet não encontrado");
    if (!popup) return;
  }

  popup.classList.remove("hidden");

  document.getElementById("pixQr")?.classList.add("hidden");
  document.getElementById("pixCodigo")?.classList.add("hidden");
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
  document.getElementById("pixSucesso")?.classList.add("hidden");


  //MÍDIA → SÓ CARTÃO
if (window.PAGAMENTO_TIPO_ATUAL === "midia") {

  // 🔥 ESCONDE COMPLETAMENTE O BLOCO DE MÉTODOS
  const tabsContainer = document.querySelector(".velvet-tabs");
  if (tabsContainer) {
    tabsContainer.style.display = "none";
  }

  // 🔥 GARANTE QUE PIX NUNCA APAREÇA
  const pix = document.getElementById("conteudoPix");
  if (pix) pix.style.display = "none";

  // 🔥 MOSTRA CARTÃO
  const cartao = document.getElementById("conteudoCartao");
  if (cartao) cartao.style.display = "block";

  // 🔥 Detalhes
  document.querySelector(".vip-detalhes")?.classList.add("hidden");
  document.querySelector(".midia-detalhes")?.classList.remove("hidden");

  iniciarCartaoMidia();
  return;
}

//vip

const tabsContainer = document.querySelector(".velvet-tabs");
if (tabsContainer) {
  tabsContainer.style.display = "flex";
}

document.getElementById("conteudoPix").style.display = "block";
document.getElementById("conteudoCartao").style.display = "none";

prepararPagamento();
  //Pix automático para VIP
  setTimeout(() => {
    pagarComPix({
      tipo: "vip",
      modelo_id: window.MODELO_ID_ATUAL
    });
  }, 0);
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
      console.error("Oferta VIP não carregada");
      return;
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

 if (window.PAGAMENTO_TIPO_ATUAL === "midia") {
 document.querySelector(".velvet-tabs")?.classList.add("hidden");
  pix.classList.add("hidden");
    cartao.classList.remove("hidden");
    return;
  }

  document.querySelector(".velvet-tabs")?.classList.remove("hidden");
 pix.classList.toggle("hidden", tipo !== "pix");
  cartao.classList.toggle("hidden", tipo !== "cartao");

  document
    .querySelectorAll(".velvet-tabs .tab")
    .forEach(tab => {
      tab.classList.toggle(
        "active",
        tab.dataset.metodo === tipo
      );
    });

  if (tipo === "cartao") {
    pagarComCartao({
      tipo: "vip",
      modelo_id: window.MODELO_ID_ATUAL
    });
  }

  if (tipo === "pix") {
    pagarComPix({
      tipo: "vip",
      modelo_id: window.MODELO_ID_ATUAL
    });
  }
}



window.pagarComPix = async function ({ tipo, modelo_id }) {
  try {
    // 🔥 PIX É EXCLUSIVO PARA VIP
    if (tipo !== "vip") {
      throw new Error("Pagamento Pix disponível apenas para VIP");
    }

    if (!token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    abrirPopupPagamentoPixLoading();

    modelo_id = modelo_id || window.MODELO_ID_ATUAL;
    if (!modelo_id || isNaN(Number(modelo_id))) {
      throw new Error("modelo_id inválido");
    }

    const url = "/api/pagamento/vip/pix";
    const body = { modelo_id };

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
      throw new Error(`Pix ${res.status}: ${erro}`);
    }

    const data = await res.json();

    // ===============================
    // 🧾 MOSTRAR QR
    // ===============================
    const qr = document.getElementById("pixQr");
    const codigo = document.getElementById("pixCodigo");
    const btnCopiar =
      document.querySelector("#conteudoPix .btn-secundario");

    qr.src = `data:image/png;base64,${data.qr_code}`;
    codigo.value = data.copia_cola;

    qr.classList.remove("hidden");
    codigo.classList.remove("hidden");
    btnCopiar?.classList.remove("hidden");

    document.getElementById("pixLoading")?.classList.add("hidden");
    document.getElementById("pixAguardando")?.classList.remove("hidden");

    // ===============================
    // 🔁 POLLING VIP
    // ===============================
    window.__INTERVALO_VIP__ &&
      clearInterval(window.__INTERVALO_VIP__);

    window.__INTERVALO_VIP__ = setInterval(async () => {
      try {
        if (
          document
            .getElementById("popupPagamentoVelvet")
            ?.classList.contains("hidden")
        ) {
          clearInterval(window.__INTERVALO_VIP__);
          return;
        }

        const res = await fetch(
          `/api/vip/status/${window.MODELO_ID_ATUAL}`,
          {
            headers: {
              Authorization:
                "Bearer " + localStorage.getItem("token")
            }
          }
        );

        if (!res.ok) return;

        const data = await res.json();

        if (data.vip === true) {
          clearInterval(window.__INTERVALO_VIP__);

          document
            .getElementById("pixAguardando")
            ?.classList.add("hidden");
          document
            .getElementById("pixSucesso")
            ?.classList.remove("hidden");

          setTimeout(() => {
            fecharPopupPagamento();
            location.reload();
          }, 1200);
        }
      } catch (err) {
        console.error("Erro polling VIP:", err);
      }
    }, 3000);

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

 socket.on("conteudoVisto", async ({ message_id }) => {

  // 🔒 UI de sucesso (igual você já tem)
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
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

async function pagarComCartao({ tipo, modelo_id }) {
  if (tipo !== "vip") {
    console.warn("pagarComCartao ignorado para tipo:", tipo);
    return;
  }

  initStripe();

  try {
    if (!token) throw new Error("Sessão expirada");

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
    // 💎 VIP
    // ===============================
    if (tipo === "vip") {
      modelo_id = modelo_id || window.MODELO_ID_ATUAL;

      if (!modelo_id) {
        throw new Error("modelo_id inválido");
      }

      url = "/api/pagamento/vip/cartao";
      body = { modelo_id };
    }

    // ===============================
    // 🔥 MÍDIA (perfil)
    // ===============================
    if (tipo === "midia") {
      conteudo_id =
        conteudo_id || window.MIDIA_VENDA_ATUAL?.conteudo_id;

      if (!conteudo_id) {
        throw new Error("conteudo_id inválido");
      }

      url = "/api/pagamento/midia/cartao";
      body = { conteudo_id };
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
  // 💎 CARTÃO É APENAS PARA VIP
  if (window.PAGAMENTO_TIPO_ATUAL !== "vip") {
    console.warn(
      "iniciarCartao ignorado para tipo:",
      window.PAGAMENTO_TIPO_ATUAL
    );
    return;
  }

  mostrarMetodo("cartao");

  pagarComCartao({
    tipo: "vip",
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

    // ✅ NÃO confirma aqui
    // O sucesso virá via webhook / socket / reload

  } catch (err) {
    console.error("❌ Erro inesperado:", err);
    alert("Erro ao confirmar pagamento");
  }
}


window.fecharPopupPagamento = function () {
  const popup = document.getElementById("popupPagamentoVelvet");
  if (!popup) return;

  // fecha popup
  popup.classList.add("hidden");

  // limpa estados PIX
  document.getElementById("pixLoading")?.classList.add("hidden");
  document.getElementById("pixAguardando")?.classList.add("hidden");
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
  if (!token) {
    alert("Sessão expirada");
    return;
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

window.abrirFluxoVIP = function () {
  fecharPopupPagamento?.();
  document.getElementById("modalMidia")?.classList.add("hidden");
  
  const roleAtual = localStorage.getItem("role");

  if (!roleAtual) {
    exigirCadastro(
      "Crie sua conta para assinar o perfil e acessar tudo 💜"
    );
    return;
  }

  if (!window.OFERTA_ATUAL || !window.OFERTA_ATUAL.modelo_id) {
    alert("Oferta VIP ainda não carregada. Aguarde um instante.");
    return;
  }

  window.PAGAMENTO_TIPO_ATUAL = "vip";
  window.MODELO_ID_ATUAL = window.OFERTA_ATUAL.modelo_id;

  preencherResumoVIP({
    valorBase: window.OFERTA_ATUAL.valor_base,
    desconto:
      window.OFERTA_ATUAL.valor_base -
      window.OFERTA_ATUAL.valor_promocional
  });

  abrirPopupPagamento();
  pagarComPix({ tipo: "vip" });
};


