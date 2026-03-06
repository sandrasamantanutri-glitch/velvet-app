document.addEventListener("DOMContentLoaded", () => {
  carregarVerificacoes();
});

async function carregarVerificacoes() {
  const res = await fetch("/api/admin/verificacoes", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) {
    console.error("Erro ao buscar verificações");
    return;
  }

  const dados = await res.json();

  if (!Array.isArray(dados)) {
    console.error("Resposta inesperada:", dados);
    return;
  }

  const container = document.getElementById("listaVerificacoes");
  container.innerHTML = "";

  dados.forEach(v => {
    const div = document.createElement("div");
    div.className = "card-verificacao";

    div.innerHTML = `
    <strong>${v.nome_exibicao}</strong>
    Documento: ${v.doc_tipo ?? "não enviado"}
      <button onclick="verDocs(${v.user_id})">Ver documentos</button>
      <button onclick="aprovar(${v.user_id})">Aprovar</button>
      <button onclick="recusar(${v.user_id})">Recusar</button>
    `;

    container.appendChild(div);
  });
}

async function verDocs(id) {
  const res = await fetch(`/api/admin/verificacao/${id}/documentos`, {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  const urls = await res.json();

  window.open(urls.doc_frente, "_blank");
  window.open(urls.selfie, "_blank");
}

async function aprovar(id) {
  await fetch(`/api/admin/verificacao/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({ status: "aprovado" })
  });

  carregarVerificacoes();
}

async function recusar(id) {
  const motivo = prompt("Motivo da recusa:");
  if (!motivo) return;

  await fetch(`/api/admin/verificacao/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({ status: "recusado", motivo })
  });

  carregarVerificacoes();
}

