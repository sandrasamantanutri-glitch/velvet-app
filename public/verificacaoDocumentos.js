document.addEventListener("DOMContentLoaded", async () => {
  const statusContainer = document.getElementById("statusContainer");
  const form = document.getElementById("formDocumentos");
  const token = localStorage.getItem("token");

  if (!token) {
    console.warn("Usuário não autenticado");
    return;
  }

  // ===============================
  // BUSCAR STATUS NO BACKEND
  // ===============================
  async function buscarStatusVerificacao() {
    const res = await fetch("/api/modelo/verificacao/status", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      throw new Error("Erro ao buscar status da verificação");
    }

    return await res.json();
  }

  // ===============================
  // RENDERIZA STATUS
  // ===============================
  function renderStatus(verificacao) {
    if (!statusContainer) return;

    statusContainer.innerHTML = "";
    statusContainer.className = "";

    let html = "";

    switch (verificacao.status) {
      case "em_analise":
        statusContainer.classList.add(
          "status-verificacao",
          "status-em-analise"
        );
        html = `
          <strong>Status da verificação:</strong>
          <span class="status-texto">Em análise</span>
          <p class="status-descricao">
            Seus documentos foram recebidos e estão sendo analisados.
          </p>
        `;
        break;

      case "aprovado":
        statusContainer.classList.add(
          "status-verificacao",
          "status-aprovado"
        );
        html = `
          <strong>Status da verificação:</strong>
          <span class="status-texto">Aprovada</span>
          <p class="status-descricao">
            Sua identidade foi verificada com sucesso.
          </p>
        `;
        break;

      case "recusado":
        statusContainer.classList.add(
          "status-verificacao",
          "status-recusado"
        );
        html = `
          <strong>Status da verificação:</strong>
          <span class="status-texto">Recusada</span>
          <p class="status-descricao">
            Não foi possível validar seus documentos.
          </p>
          ${
            verificacao.motivo
              ? `<p class="status-motivo">Motivo: ${verificacao.motivo}</p>`
              : ""
          }
        `;
        break;

      case "bloqueado":
        statusContainer.classList.add(
          "status-verificacao",
          "status-bloqueado"
        );
        html = `
          <strong>Status da verificação:</strong>
          <span class="status-texto">Conta bloqueada</span>
          <p class="status-descricao">
            Entre em contato com o suporte.
          </p>
        `;
        break;

      default:
        // pendente → não exibe bloco
        statusContainer.style.display = "none";
        return;
    }

    statusContainer.innerHTML = html;
    statusContainer.style.display = "block";
  }

  // ===============================
  // CONTROLE DO FORMULÁRIO
  // ===============================
  function controlarFormulario(status) {
    if (!form) return;

    if (status === "pendente" || status === "recusado") {
      form.style.display = "block";
    } else {
      form.style.display = "none";
    }
  }

  // ===============================
  // SUBMIT REAL (ainda sem upload)
  // ===============================
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const token = localStorage.getItem("token");
  const formData = new FormData(form);

  const res = await fetch("/api/modelo/verificacao", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    },
    body: formData
  });

  if (!res.ok) {
    throw new Error("Falha no envio");
  }

  renderStatus({ status: "em_analise" });
  controlarFormulario("em_analise");
});


  // ===============================
  // INIT
  // ===============================
  try {
    const verificacao = await buscarStatusVerificacao();
    renderStatus(verificacao);
    controlarFormulario(verificacao.status);
  } catch (err) {
    console.error(err);
  }
});
