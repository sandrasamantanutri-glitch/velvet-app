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
    const res = await fetch("/api/verificacao/status", {
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
      statusContainer.classList.add("status-verificacao", "status-em-analise");
      html = `
        <strong>${t("verificacao.status_label")}</strong>
        <span class="status-texto">${t("verificacao.status_em_analise")}</span>
        <p class="status-descricao">${t("verificacao.desc_em_analise")}</p>
      `;
      break;

    case "aprovado":
      statusContainer.classList.add("status-verificacao", "status-aprovado");
      html = `
        <strong>${t("verificacao.status_label")}</strong>
        <span class="status-texto">${t("verificacao.status_aprovado")}</span>
        <p class="status-descricao">${t("verificacao.desc_aprovado")}</p>
      `;
      break;

    case "recusado":
      statusContainer.classList.add("status-verificacao", "status-recusado");
      html = `
        <strong>${t("verificacao.status_label")}</strong>
        <span class="status-texto">${t("verificacao.status_recusado")}</span>
        <p class="status-descricao">${t("verificacao.desc_recusado")}</p>
        ${verificacao.motivo
          ? `<p class="status-motivo">${t("verificacao.motivo_label")} ${verificacao.motivo}</p>`
          : ""}
      `;
      break;

    case "bloqueado":
      statusContainer.classList.add("status-verificacao", "status-bloqueado");
      html = `
        <strong>${t("verificacao.status_label")}</strong>
        <span class="status-texto">${t("verificacao.status_bloqueado")}</span>
        <p class="status-descricao">${t("verificacao.desc_bloqueado")}</p>
      `;
      break;

    default:
      statusContainer.style.display = "none";
      return;
  }

  statusContainer.innerHTML = html;
  statusContainer.style.display = "block";
}
  function controlarFormulario(status) {
  if (!form) return;

  if (!status || status === "pendente" || status === "recusado") {
    form.style.display = "block";
  } else {
    form.style.display = "none";
  }
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const btnSubmit = form.querySelector('button[type="submit"]');

  try {
    const token = localStorage.getItem("token");

    const confirmacaoIdentidade = document.getElementById("confirmacao_identidade")?.checked;
    const aceitePrivacidade = document.getElementById("aceite_privacidade")?.checked;
    const aceiteTermosCriador = document.getElementById("aceite_termos_criador")?.checked;

    if (!confirmacaoIdentidade) {
  alert(t("verificacao.alert_confirmar_identidade"));
  return;
}

if (!aceitePrivacidade) {
  alert(t("verificacao.alert_aceite_privacidade"));
  return;
}

if (!aceiteTermosCriador) {
  alert(t("verificacao.alert_aceite_termos"));
  return;
}

    if (btnSubmit) btnSubmit.disabled = true;

    const formData = new FormData(form);

    formData.set("confirmacao_identidade", "true");
    formData.set("aceite_privacidade", "true");
    formData.set("aceite_termos_criador", "true");
    formData.set("versao_privacidade", "2026-04-06");
    formData.set("versao_termos_criador", "2026-04-06");

    const res = await fetch("/api/verificacao", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      },
      body: formData
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(payload?.erro || t("verificacao.alert_falha_envio"));
    }

    renderStatus({ status: "em_analise" });
    controlarFormulario("em_analise");
  } catch (err) {
    console.error(err);
    alert(err.message || t("verificacao.alert_falha_envio"));
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
});

try {
  const verificacao = await buscarStatusVerificacao();
  renderStatus(verificacao);
  controlarFormulario(verificacao?.status || "pendente");
} catch (err) {
  console.error(err);
  controlarFormulario("pendente");
}


});

function abrirConfirmacaoExclusao() {
  const modal = document.getElementById("modalExcluirConta");
  if (modal) {
    modal.classList.remove("hidden");
  }
}

function fecharModalExclusao() {
  const modal = document.getElementById("modalExcluirConta");
  if (modal) {
    modal.classList.add("hidden");
  }

  // limpa campo e erro ao fechar
  const senhaInput = document.getElementById("senhaConfirmacao");
  const erro = document.getElementById("erroExclusao");

  if (senhaInput) senhaInput.value = "";
  if (erro) erro.classList.add("hidden");
}

async function confirmarExclusaoConta() {
  const token = localStorage.getItem("token");
  const senha = document.getElementById("senhaConfirmacao").value;
  const erro = document.getElementById("erroExclusao");

  erro.classList.add("hidden");

if (!senha || senha.length < 4) {
  erro.textContent = t("conta.erro_senha_curta");
  erro.classList.remove("hidden");
  return;
}

  try {
    const res = await fetch("/api/conta/excluir", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ senha })
    });

    if (res.ok) {
   localStorage.clear();
   window.location.href = "/index.html";
    } else {
   const data = await res.json().catch(() => ({}));

   erro.textContent = data.error || t("conta.erro_excluir_interno");
   erro.classList.remove("hidden");
  }


  } catch (err) {
    erro.textContent = t("conta.erro_conexao");
    erro.classList.remove("hidden");
  }
}


