document.addEventListener("DOMContentLoaded", () => {
  carregarVerificacoes();
});

async function carregarVerificacoes() {
  const res = await fetch("/api/admin/verificacoes", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  const dados = await res.json();
  const container = document.getElementById("listaVerificacoes");

  container.innerHTML = "";

  dados.forEach(v => {
    const div = document.createElement("div");
    div.className = "card-verificacao";

    div.innerHTML = `
      <strong>${v.nome}</strong><br>
      Documento: ${v.doc_tipo}<br>
      <button onclick="verDocs(${v.id})">Ver documentos</button>
      <button onclick="aprovar(${v.id})">Aprovar</button>
      <button onclick="recusar(${v.id})">Recusar</button>
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

