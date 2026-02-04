const ofertas = [
  { id: 1, titulo: "Mensal", valor: 39.90, ativa: true },
  { id: 2, titulo: "Trimestral", valor: 99.90, ativa: false }
];

let abaAtual = "ativas";

const lista = document.getElementById("listaOfertas");

function renderOfertas() {
  lista.innerHTML = "";

  ofertas
    .filter(o => (abaAtual === "ativas" ? o.ativa : !o.ativa))
    .forEach(o => {
      const card = document.createElement("div");
      card.className = "oferta-card";

      card.innerHTML = `
        <h4>${o.titulo}</h4>
        <div class="valor">R$ ${o.valor.toFixed(2)}</div>

        <div class="acoes">
          ${
            o.ativa
              ? `<button class="btn-desativar" onclick="toggleOferta(${o.id})">Desativar</button>`
              : `<button class="btn-ativar" onclick="toggleOferta(${o.id})">Ativar</button>`
          }
        </div>
      `;

      lista.appendChild(card);
    });
}

function toggleOferta(id) {
  const oferta = ofertas.find(o => o.id === id);
  if (oferta) {
    oferta.ativa = !oferta.ativa;
    renderOfertas();
  }
}

/* tabs */
document.querySelectorAll(".ofertas-tabs .tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    abaAtual = tab.dataset.tab;
    renderOfertas();
  };
});

/* criar oferta */
document.getElementById("btnCriarOferta").onclick = () => {
  alert("Abrir modal de criação de oferta");
};

renderOfertas();


function abrirModalCriarOferta() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>

    <div class="modal-box">
      <h3>Criar oferta</h3>

      <div class="form-group">
        <label>Nome da oferta</label>
        <input type="text" id="oferta-titulo" placeholder="Ex: Mensal Premium">
      </div>

      <div class="form-group">
        <label>Valor da assinatura</label>
        <input type="number" id="oferta-valor" placeholder="Ex: 39.90" step="0.01">
      </div>

      <div class="form-group">
        <label>Duração</label>
        <select id="oferta-duracao">
          <option value="1">Mensal (1 mês)</option>
          <option value="3">Trimestral (3 meses)</option>
          <option value="6">Semestral (6 meses)</option>
          <option value="12">Anual (12 meses)</option>
        </select>
      </div>

      <div class="form-group switch">
        <input type="checkbox" id="oferta-ativa" checked>
        <label for="oferta-ativa">Ativar oferta imediatamente</label>
      </div>

      <div class="modal-acoes">
        <button class="btn-cancelar">Cancelar</button>
        <button class="btn-salvar">Criar oferta</button>
      </div>
    </div>
  `;

  // fechar

  modal.querySelector(".modal-backdrop").onclick = () => modal.remove();
  modal.querySelector(".btn-cancelar").onclick = () => modal.remove();

  // salvar
  modal.querySelector(".btn-salvar").onclick = () => {
    const titulo = modal.querySelector("#oferta-titulo").value.trim();
    const valor = parseFloat(modal.querySelector("#oferta-valor").value);
    const duracao = modal.querySelector("#oferta-duracao").value;
    const ativa = modal.querySelector("#oferta-ativa").checked;

    if (!titulo || !valor) {
      alert("Preencha nome e valor da oferta");
      return;
    }

    // 🔥 aqui depois entra o fetch pro backend
    ofertas.push({
      id: Date.now(),
      titulo,
      valor,
      duracao,
      ativa
    });

    modal.remove();
    renderOfertas();
  };

  document.body.appendChild(modal);

}
document.getElementById("btnCriarOferta").onclick = abrirModalCriarOferta;

function abrirModalCriarOferta() {
  let step = 1;

  const dados = {
    nome: "",
    limite: 0,
    dias: 1,
    desconto: 0,
    mensagem: ""
  };

  const VALOR_BASE = 39.9;
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

  function render() {
    btnVoltar.disabled = step === 1;

    /* STEP 1 */
    if (step === 1) {
      content.innerHTML = `
        <h3>Nome da oferta</h3>
        <input id="nome" placeholder="Ex: Oferta VIP Fevereiro">
      `;
    }

    /* STEP 2 */
    if (step === 2) {
      content.innerHTML = `
        <h3>Número máximo de assinaturas</h3>
        <input id="limite" type="number" min="1" placeholder="Ex: 100">
      `;
    }

    /* STEP 3 */
    if (step === 3) {
      const hoje = new Date();
      const fim = new Date();
      fim.setDate(hoje.getDate() + dados.dias);

      content.innerHTML = `
        <h3>Tempo ativo da oferta</h3>

        <input type="range" min="1" max="15" value="${dados.dias}" id="dias">

        <p class="info">
          Sua oferta ficará ativa até
          <strong>${fim.toLocaleDateString()}</strong>
        </p>
      `;

      content.querySelector("#dias").oninput = e => {
        dados.dias = Number(e.target.value);
        render();
      };
    }

    /* STEP 4 */
    if (step === 4) {
      content.innerHTML = `
        <h3>Desconto da oferta</h3>

        <div class="descontos">
          ${[5,10,15,20].map(p => `
            <button data-p="${p}" class="${dados.desconto === p ? "active" : ""}">
              ${p}%
            </button>
          `).join("")}
        </div>

        <p class="desc">
          Desconto válido para assinaturas de 1 mês
        </p>

        <div class="precos">
          <div>Valor normal: <strong>R$ ${VALOR_BASE.toFixed(2)}</strong></div>
          <div>Valor promocional:
            <strong>
              R$ ${calcularValor().toFixed(2)}
            </strong>
          </div>
        </div>
      `;

      content.querySelectorAll(".descontos button").forEach(btn => {
        btn.onclick = () => {
          dados.desconto = Number(btn.dataset.p);
          render();
        };
      });
    }

    /* STEP 5 */
    if (step === 5) {
      content.innerHTML = `
        <h3>Mensagem da oferta</h3>
        <textarea id="msg" rows="4"
          placeholder="Ex: Aproveite essa oferta exclusiva por tempo limitado">
        </textarea>
      `;
    }

    /* STEP 6 */
    if (step === 6) {
      content.innerHTML = `
        <h3>Resumo da oferta</h3>

        <ul class="resumo">
          <li><strong>${dados.nome}</strong></li>
          <li>Limite: ${dados.limite} assinaturas</li>
          <li>Ativa por: ${dados.dias} dias</li>
          <li>Desconto: ${dados.desconto}%</li>
          <li>Preço final: R$ ${calcularValor().toFixed(2)}</li>
        </ul>

        <p class="info">${dados.mensagem}</p>
      `;

      btnAvancar.textContent = "Concluir";
    }
  }

  function calcularValor() {
    const v = VALOR_BASE * (1 - dados.desconto / 100);
    return v < VALOR_MINIMO ? VALOR_MINIMO : v;
  }

  btnAvancar.onclick = () => {
    if (step === 1) dados.nome = content.querySelector("#nome").value;
    if (step === 2) dados.limite = Number(content.querySelector("#limite").value);
    if (step === 5) dados.mensagem = content.querySelector("#msg").value;

    if (step < 6) {
      step++;
      render();
    } else {
      console.log("OFERTA CRIADA:", dados);
      modal.remove();
    }
  };

  btnVoltar.onclick = () => {
    if (step > 1) {
      step--;
      btnAvancar.textContent = "Avançar";
      render();
    }
  };

  render();
  document.body.appendChild(modal);
}

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


function diasRestantes(fim) {
  const hoje = new Date();
  const dataFim = new Date(fim);
  return Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));
}

function renderOfertas() {
  lista.innerHTML = "";

  const temOfertaAtiva = ofertasMock.some(o => o.ativa);
  const btnCriar = document.getElementById("btnCriarOferta");

  // controla botão criar oferta
  if (btnCriar) {
    btnCriar.style.display = temOfertaAtiva ? "none" : "block";
  }

  ofertasMock
    .filter(o => (abaAtual === "ativas" ? o.ativa : !o.ativa))
    .forEach(o => {
      const dias = diasRestantes(o.fim);
      const statusTexto = o.ativa ? "Oferta ativa" : "Oferta encerrada";
      const statusClasse = o.ativa ? "status-ativa" : "status-inativa";

      const card = document.createElement("div");
      card.className = "oferta-card";

      card.innerHTML = `
        <div class="oferta-header">
          <h3>${o.nome}</h3>
          <span class="toggle">⌄</span>
        </div>

        <div class="status ${statusClasse}">
          <span class="dot"></span>
          ${statusTexto}
        </div>

        <div class="oferta-info">
          ${
            o.ativa
              ? `Termina em ${dias} dias (${formatarData(o.fim)})`
              : `Encerrada em ${formatarData(o.fim)}`
          }
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
          <div>
            <span>Quantidade de participantes:</span>
            <span>${o.usadas}/${o.limite}</span>
          </div>
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

function encerrarOferta(id) {
  const oferta = ofertasMock.find(o => o.id === id);
  if (!oferta) return;

  oferta.ativa = false;

  renderOfertas();
}

function formatarData(data) {
  return new Date(data).toLocaleDateString("pt-BR");
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

function podeCriarOferta(ofertas) {
  return !ofertas.some(o => o.ativa);
}


