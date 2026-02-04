/* ===============================
   DADOS (mock por enquanto)
=============================== */
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
          <span>⌄</span>
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
