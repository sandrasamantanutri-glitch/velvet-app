document.addEventListener("DOMContentLoaded", async () => {
  await carregarModelo();

  document
    .getElementById("btnAbrirConteudos")
    ?.addEventListener("click", abrirPopupConteudos);

  document
    .getElementById("btnFecharConteudos")
    ?.addEventListener("click", fecharPopupConteudos);

  document
    .getElementById("btnEnviar")
    ?.addEventListener("click", () => enviar(false));
});

async function abrirPopupConteudos() {
  const popup = document.getElementById("popupConteudos");
  popup.classList.remove("hidden");

  const grid = document.getElementById("conteudosGrid");
  grid.innerHTML = "Carregando...";

  const token = localStorage.getItem("token");

  // ⚠️ NO PPV usamos USER_ID da modelo (não modelos.id)
  const modeloUserId = document.getElementById("modeloSelect").value;

  const res = await fetch(
    `/api/allmessage/conteudos/${modeloUserId}`,
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
async function carregarConteudos() {
  const token = localStorage.getItem("token");
  const modelo_id = document.getElementById("modeloSelect").value;

  const res = await fetch(
    `/api/allmessage/conteudos/${modelo_id}`,
    {
      headers: { Authorization: "Bearer " + token }
    }
  );

  const conteudos = await res.json();

if (!Array.isArray(conteudos)) {
  console.warn("Resposta inesperada:", conteudos);
  return;
}

  const grid = document.getElementById("conteudosGrid");

  grid.innerHTML = "";

  conteudos.forEach(c => {
    const item = document.createElement("label");
    item.className = "conteudo-item";

    item.innerHTML = `
      <input type="checkbox" value="${c.id}">
      <img src="${c.thumbnail || c.url}">
    `;

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

// ===============================
// ENVIO (TESTE OU REAL)
// ===============================
async function enviar(modoTeste) {
  const modelo_id = document.getElementById("modeloSelect").value;
  const texto = document.getElementById("mensagem").value.trim();
  const preco = Number(document.getElementById("preco").value);

  const conteudos = Array.from(
    document.querySelectorAll("#conteudosGrid input:checked")
  ).map(i => Number(i.value));

  // 🔒 validações front
  if (!texto) {
    alert("Digite a mensagem");
    return;
  }

  if (!preco || preco <= 0) {
    alert("Informe um preço válido");
    return;
  }

  if (conteudos.length === 0) {
    alert("Selecione ao menos um conteúdo");
    return;
  }

  if (!modoTeste) {
    const ok = confirm(
      "Enviar esta mensagem PPV para TODOS os assinantes VIP?"
    );
    if (!ok) return;
  }

  const payload = {
    modelo_id,
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
    alert(data.error || "Erro ao enviar PPV");
    return;
  }

  alert(
    modoTeste
      ? "Mensagem de teste enviada com sucesso 💜"
      : `PPV enviado para ${data.enviados} assinantes 💜`
  );
}
