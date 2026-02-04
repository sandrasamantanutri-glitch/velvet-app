const ofertasMock = [
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

function diasRestantes(fim) {
  const hoje = new Date();
  const dataFim = new Date(fim);
  return Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));
}

function renderOfertas() {
  lista.innerHTML = "";

  ofertasMock
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

        <div class="status">
          <span class="dot"></span>
          Oferta ativa
        </div>

        <div class="oferta-info">
          Termina em ${dias} dias (${formatarData(o.fim)})
        </div>

        <div class="valores-box">
          <div class="valores-linha">
            <span>Valor original</span>
            <strong>R$ ${o.valor_original.toFixed(2)}</strong>
          </div>
          <div class="valores-linha desconto">
            <span>Desconto</span>
            <strong>-${o.desconto}%</strong>
          </div>
          <div class="valores-linha">
            <span>Valor final</span>
            <strong>R$ ${o.valor_final.toFixed(2)}</strong>
          </div>
        </div>

        <div class="oferta-detalhes">
          <div><span>Oferta:</span><span>Desconto na assinatura</span></div>
          <div><span>Início da campanha:</span><span>${formatarData(o.inicio)}</span></div>
          <div><span>Fim da campanha:</span><span>${formatarData(o.fim)}</span></div>
          <div><span>Quantidade de participantes:</span><span>${o.usadas}/${o.limite}</span></div>
        </div>

        <button class="btn-encerrar" onclick="encerrarOferta(${o.id})">
          Encerrar oferta
        </button>
      `;

      lista.appendChild(card);
    });
}

function formatarData(data) {
  return new Date(data).toLocaleDateString("pt-BR");
}

function encerrarOferta(id) {
  const oferta = ofertasMock.find(o => o.id === id);
  if (oferta) {
    oferta.ativa = false;
    renderOfertas();
  }
}

/* tabs */
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    abaAtual = tab.dataset.tab;
    renderOfertas();
  };
});

renderOfertas();
