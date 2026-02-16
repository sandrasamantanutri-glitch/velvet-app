document.addEventListener("DOMContentLoaded", async () => {
  await carregarModelo();

  document
    .getElementById("btnAbrirConteudos")
    ?.addEventListener("click", abrirPopupConteudos);

    document
  .getElementById("btnConfirmarConteudos")
  ?.addEventListener("click", confirmarConteudosSelecionados);

document
  .getElementById("btnFecharConteudos")
  ?.addEventListener("click", fecharPopupConteudos);


  document
    .getElementById("btnEnviar")
    ?.addEventListener("click", () => enviar(false));
});


function fecharPopupConteudos() {
  const popup = document.getElementById("popupConteudos");
  if (!popup) return;

  popup.classList.add("hidden");
}

// ===============================
// MODELO LOGADO
// ===============================
async function carregarModelo() {
  const token = localStorage.getItem("token");

  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const modelo = await res.json();

  document.getElementById("modeloSelect").innerHTML = `
    <option value="${modelo.id}">
      ${modelo.nome_exibicao || "Modelo"}
    </option>
  `;
}

// ===============================
// CONTEÚDOS DA MODELO
// ===============================
async function abrirPopupConteudos() {
  const popup = document.getElementById("popupConteudos");
  popup.classList.remove("hidden");

  const grid = document.getElementById("conteudosGrid");
  grid.innerHTML = "Carregando...";

  const token = localStorage.getItem("token");
  const modelo_id = document.getElementById("modeloSelect").value;

  const res = await fetch(
    `/allmessage/conteudos/${modelo_id}`,
    {
      headers: {
        Authorization: "Bearer " + token
      }
    }
  );

  if (!res.ok) {
    grid.innerHTML = "Erro ao carregar conteúdos";
    return;
  }

  const conteudos = await res.json();

  if (!Array.isArray(conteudos) || conteudos.length === 0) {
    grid.innerHTML = "<p>Nenhum conteúdo de venda disponível.</p>";
    return;
  }

  grid.innerHTML = "";

  conteudos.forEach(c => {
    const item = document.createElement("div");
    item.className = "preview-item";
    item.dataset.conteudoId = c.id;

    item.innerHTML = `
      <img src="${c.thumbnail || c.url}" />
    `;

    item.onclick = () => {
      item.classList.toggle("selected");
    };

    grid.appendChild(item);
  });
}


// ===============================
// MOSTRAR SELECIONADOS
// ===============================
function renderizarSelecionados() {
  const container = document.getElementById("conteudosSelecionados");

  const selecionados = Array.from(
    document.querySelectorAll("#conteudosGrid input:checked")
  );

  container.innerHTML = "";

  selecionados.forEach(input => {
    const img = input.nextElementSibling.cloneNode();
    container.appendChild(img);
  });
}

async function enviar(modoTeste) {
  const modelo_id = document.getElementById("modeloSelect").value;
  const texto = document.getElementById("mensagem").value.trim();
  const preco = Number(document.getElementById("preco").value || 0);

  const conteudos = Array.from(
    document.querySelectorAll(".preview-item.selected")
  ).map(el => Number(el.dataset.conteudoId));

  if (!texto) {
    alert("Digite a mensagem");
    return;
  }

  if (!modoTeste) {
    const ok = confirm(
      "Enviar esta mensagem para TODOS os assinantes VIP?"
    );
    if (!ok) return;
  }
  const payload = {
  texto,
  preco,
  conteudos,
  modo_teste: modoTeste
};

  const res = await fetch("/api/allmessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || "Erro ao enviar mensagem");
    return;
  }

  alert(
    modoTeste
      ? "Mensagem enviada com sucesso 💜"
      : `Mensagem enviada para ${data.enviados} assinantes 💜`
  );

  window.location.reload();
}

function confirmarConteudosSelecionados() {
  const selecionados = Array.from(
    document.querySelectorAll(".preview-item.selected")
  );

  const container = document.getElementById("conteudosSelecionados");
  container.innerHTML = "";

  if (selecionados.length === 0) {
    container.innerHTML =
      "<span style='opacity:.6'>Nenhuma mídia selecionada</span>";
  }

  selecionados.forEach(item => {
    const img = item.querySelector("img, video").cloneNode(true);
    img.style.width = "70px";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    img.style.border = "2px solid #7B2CFF";
    container.appendChild(img);
  });

  fecharPopupConteudos();
}

