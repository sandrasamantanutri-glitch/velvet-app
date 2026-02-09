document.addEventListener("DOMContentLoaded", () => {
  carregarModelo();
  carregarConteudos();

  document
    .getElementById("btnEnviar")
    ?.addEventListener("click", () => enviar(false));

  document
    .getElementById("btnTeste")
    ?.addEventListener("click", () => enviar(true));
});

// ===============================
// MODELO LOGADO
// ===============================
async function carregarModelo() {
  const token = localStorage.getItem("token");

  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const modelo = await res.json();

  const select = document.getElementById("modeloSelect");
  select.innerHTML = `
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

  const res = await fetch("/api/modelo/conteudos", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const conteudos = await res.json();
  const grid = document.getElementById("conteudosGrid");

  grid.innerHTML = "";

  conteudos.forEach(c => {
    const div = document.createElement("label");
    div.className = "conteudo-item";
    div.innerHTML = `
      <input type="checkbox" value="${c.id}">
      <img src="${c.thumbnail || c.url}" />
    `;
    grid.appendChild(div);
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
