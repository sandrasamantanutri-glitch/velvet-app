/* ===============================
   DADOS (mock por enquanto)
=============================== */

const token = localStorage.getItem("token");
const ofertas = [
  {
    id: 1,
    ativa: true,
    nome: "Assinatura",
    valor_original: 20,
    desconto: 5,
    valor_final: 19,
    inicio: "2026-02-04",
    fim: "2026-02-10",
    limite: 10,
    usadas: 0
  }
];

let abaAtual = "ativas";

const lista = document.getElementById("ofertasLista");
const btnCriar = document.getElementById("btnCriarOferta");

if (!lista) {
  console.error("Elemento #ofertasLista não encontrado");
}

/* ===============================
   RENDER
=============================== */
function renderOfertas() {
  if (!lista) return;

  lista.innerHTML = "";

  const temOfertaAtiva = ofertas.some(o => o.ativa);

  if (btnCriar) {
    btnCriar.style.display = temOfertaAtiva ? "none" : "block";
  }

  ofertas
    .filter(o => (abaAtual === "ativas" ? o.ativa : !o.ativa))
    .forEach(o => {
      const dias = diasRestantes(o.fim);

      const card = document.createElement("div");
      card.className = "oferta-card";

      card.innerHTML = `
        <div class="oferta-header">
          <h3>${o.nome}</h3>
        </div>

        <div class="status ${o.ativa ? "status-ativa" : "status-inativa"}">
          <span class="dot"></span>
          ${o.ativa ? "Oferta ativa" : "Oferta encerrada"}
        </div>

        <div class="oferta-info">
          ${
            o.ativa
              ? `Termina em ${dias} dias (${formatarData(o.fim)})`
              : `Encerrada em ${formatarData(o.fim)}`
          }
        </div>

        <div class="valores-box">
          <div><span>Valor original</span><strong>R$ ${o.valor_original.toFixed(2)}</strong></div>
          <div class="desconto"><span>Desconto</span><strong>-${o.desconto}%</strong></div>
          <div><span>Valor final</span><strong>R$ ${o.valor_final.toFixed(2)}</strong></div>
        </div>

        <div class="oferta-detalhes">
          <div><span>Início:</span><span>${formatarData(o.inicio)}</span></div>
          <div><span>Fim:</span><span>${formatarData(o.fim)}</span></div>
          <div><span>Participantes:</span><span>${o.usadas}/${o.limite}</span></div>
        </div>

        ${
          o.ativa
            ? `<button class="btn-encerrar" onclick="encerrarOferta(${o.id})">
                 Encerrar oferta
               </button>`
            : ""
        }
      `;

      lista.appendChild(card);
    });
}

/* ===============================
   AÇÕES
=============================== */
function encerrarOferta(id) {
  const oferta = ofertas.find(o => o.id === id);
  if (!oferta) return;

  oferta.ativa = false;
  renderOfertas();
}

/* ===============================
   HELPERS
=============================== */
function diasRestantes(fim) {
  const hoje = new Date();
  const dataFim = new Date(fim);
  return Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));
}

function formatarData(data) {
  return new Date(data).toLocaleDateString("pt-BR");
}

/* ===============================
   TABS
=============================== */
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    abaAtual = tab.dataset.tab;
    renderOfertas();
  };
});

/* ===============================
   BOTÃO CRIAR OFERTA
=============================== */
if (btnCriar) {
  btnCriar.onclick = abrirModalCriarOferta;
}

renderOfertas();

function abrirModalCriarOferta() {
  let etapa = 1;

  const dados = {
    nome: "",
    limite: 0,
    dias: 1,
    desconto: 0,
    mensagem: ""
  };

  const VALOR_BASE = 20;
  const VALOR_MINIMO = 15;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>

    <div class="modal-box wizard">
      <div class="wizard-content"></div>

      <div class="wizard-acoes">
        <button class="btn-voltar" disabled>Voltar</button>
        <button class="btn-avancar">Avançar</button>
      </div>
    </div>
  `;

  const content = modal.querySelector(".wizard-content");
  const btnAvancar = modal.querySelector(".btn-avancar");
  const btnVoltar = modal.querySelector(".btn-voltar");

  modal.querySelector(".modal-backdrop").onclick = () => modal.remove();

  function calcularValor() {
    const v = VALOR_BASE * (1 - dados.desconto / 100);
    return v < VALOR_MINIMO ? VALOR_MINIMO : v;
  }

  function render() {
    btnVoltar.disabled = etapa === 1;
    btnAvancar.textContent = etapa === 6 ? "Fechar" : "Avançar";

    if (etapa === 1) {
      content.innerHTML = `
        <h3>Nome da oferta</h3>
        <input id="nome" placeholder="Ex: Oferta especial">
      `;
    }

    if (etapa === 2) {
      content.innerHTML = `
        <h3>Número máximo de assinaturas</h3>
        <input id="limite" type="number" min="1" placeholder="Ex: 10">
      `;
    }

    if (etapa === 3) {
      const fim = new Date();
      fim.setDate(fim.getDate() + dados.dias);

      content.innerHTML = `
        <h3>Quanto tempo ficará ativa</h3>
        <input type="range" min="1" max="15" value="${dados.dias}" id="dias">
        <p class="info">
          Sua oferta ficará ativa até
          <strong>${fim.toLocaleDateString("pt-BR")}</strong>
        </p>
      `;

      content.querySelector("#dias").oninput = e => {
        dados.dias = Number(e.target.value);
        render();
      };
    }

    if (etapa === 4) {
      content.innerHTML = `
        <h3>Desconto ideal da oferta</h3>

        <div class="descontos">
          ${[5,10,15,20].map(p => `
            <button class="btn-desc ${dados.desconto === p ? "active" : ""}" data-p="${p}">
              ${p}%
            </button>
          `).join("")}
        </div>

        <p class="info">
          Desconto válido para 1 mês<br>
          Valor mínimo: <strong>R$ 15,00</strong>
        </p>

        <div class="precos">
          <div>Valor normal: <strong>R$ ${VALOR_BASE.toFixed(2)}</strong></div>
          <div>Valor promocional:
            <strong>R$ ${calcularValor().toFixed(2)}</strong>
          </div>
        </div>
      `;

      content.querySelectorAll(".btn-desc").forEach(btn => {
        btn.onclick = () => {
          dados.desconto = Number(btn.dataset.p);
          render();
        };
      });
    }

    if (etapa === 5) {
      content.innerHTML = `
        <h3>Mensagem da oferta</h3>
        <textarea id="msg" rows="4"
          placeholder="Ex: Aproveite essa oferta exclusiva por tempo limitado">
        </textarea>
      `;
    }

    if (etapa === 6) {
      content.innerHTML = `
        <h3>🎉 Parabéns!</h3>
        <p>Você criou sua oferta com sucesso.</p>
      `;
    }
  }

  btnAvancar.onclick = async () => {
    if (etapa === 1) dados.nome = content.querySelector("#nome").value;
    if (etapa === 2) dados.limite = Number(content.querySelector("#limite").value);
    if (etapa === 5) dados.mensagem = content.querySelector("#msg").value;

    if (etapa < 6) {
      etapa++;
      render();
      return;
    }

    try {
      const res = await fetch("/api/ofertas", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome: dados.nome,
          limite: dados.limite,
          dias: dados.dias,
          desconto: dados.desconto,
          mensagem: dados.mensagem
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.erro || "Erro ao criar oferta");
        return;
      }

      ofertas.unshift(data);
      modal.remove();
      renderOfertas();

      alert("🎉 Oferta criada com sucesso!");

    } catch (err) {
      console.error(err);
      alert("Erro ao salvar oferta");
    }
  };

  btnVoltar.onclick = () => {
    if (etapa > 1) {
      etapa--;
      render();
    }
  };

  render();
  document.body.appendChild(modal);
}
