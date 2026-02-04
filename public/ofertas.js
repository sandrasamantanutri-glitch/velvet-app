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
