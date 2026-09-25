// ============================================================
// contrato-assinatura.js
// Gestão do passo 4 do onboarding: assinatura do contrato ZapSign
// O contrato só fica disponível após o envio dos documentos (passo 3)
// ============================================================

(function () {
  "use strict";

  // ── Elementos ────────────────────────────────────────────────
  const secaoContrato      = document.getElementById("secaoContrato");
  const contratoJaAssinado = document.getElementById("contratoJaAssinado");
  const contratoAssinadoData = document.getElementById("contratoAssinadoData");
  const contratoAAssinar   = document.getElementById("contratoAAssinar");
  const contratoLoadingMsg = document.getElementById("contratoLoadingMsg");
  const contratoIframeWrap = document.getElementById("contratoIframeWrap");
  const iframeContrato     = document.getElementById("iframeContrato");
  const contratoAcoesExternas = document.getElementById("contratoAcoesExternas");
  const linkAssinaturaExterno  = document.getElementById("linkAssinaturaExterno");
  const contratoPollingMsg = document.getElementById("contratoPollingMsg");
  const contratoErro       = document.getElementById("contratoErro");

  if (!secaoContrato) return; // Só corre em conta.html

  // ── Estado ──────────────────────────────────────────────────
  let pollingInterval = null;
  let pollingAttempts = 0;
  const MAX_POLLING = 120; // ~10 min a cada 5s

  // ── Helpers ──────────────────────────────────────────────────
  function mostrarErro(msg) {
    if (!contratoErro) return;
    contratoErro.textContent = msg;
    contratoErro.style.display = "block";
  }

  function esconderErro() {
    if (!contratoErro) return;
    contratoErro.style.display = "none";
  }

  function bloquearContrato() {
    if (!secaoContrato) return;
    secaoContrato.style.opacity = "0.4";
    secaoContrato.style.pointerEvents = "none";
    secaoContrato.style.userSelect = "none";
    if (!secaoContrato.querySelector(".bloqueio-overlay")) {
      const overlay = document.createElement("div");
      overlay.className = "bloqueio-overlay";
      overlay.innerHTML = `<p class="bloqueio-msg">🔒 Envia os documentos de identidade (Passo 3) antes de assinar o contrato</p>`;
      secaoContrato.style.position = "relative";
      secaoContrato.appendChild(overlay);
    }
  }

  function desbloquearContrato() {
    if (!secaoContrato) return;
    secaoContrato.style.opacity = "";
    secaoContrato.style.pointerEvents = "";
    secaoContrato.style.userSelect = "";
    const overlay = secaoContrato.querySelector(".bloqueio-overlay");
    if (overlay) overlay.remove();
  }

  function mostrarContratoAssinado(assinadoEm) {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    if (contratoJaAssinado) contratoJaAssinado.classList.remove("hidden");
    if (contratoAAssinar)   contratoAAssinar.style.display = "none";
    if (contratoAssinadoData && assinadoEm) {
      const d = new Date(assinadoEm);
      contratoAssinadoData.textContent = `Assinado em ${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
  }

  function mostrarFormularioAssinatura(signUrl) {
    if (contratoLoadingMsg) contratoLoadingMsg.style.display = "none";

    if (iframeContrato && contratoIframeWrap) {
      const iframeUrl = signUrl + (signUrl.includes("?") ? "&" : "?") + "iframe=true";
      iframeContrato.src = iframeUrl;
      contratoIframeWrap.classList.remove("hidden");
    }

    if (linkAssinaturaExterno && contratoAcoesExternas) {
      linkAssinaturaExterno.href = signUrl;
      contratoAcoesExternas.classList.remove("hidden");
    }

    iniciarPolling();
  }

  // ── Polling ──────────────────────────────────────────────────
  function iniciarPolling() {
    if (pollingInterval) return;
    if (contratoPollingMsg) contratoPollingMsg.classList.remove("hidden");
    pollingInterval = setInterval(verificarStatus, 5000);
  }

  async function verificarStatus() {
    pollingAttempts++;
    if (pollingAttempts > MAX_POLLING) {
      clearInterval(pollingInterval);
      pollingInterval = null;
      if (contratoPollingMsg) contratoPollingMsg.classList.add("hidden");
      mostrarErro("O tempo de verificação expirou. Actualiza a página após assinar.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const resp = await fetch("/api/verificacao/contrato/status", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.assinado) {
        mostrarContratoAssinado(data.assinado_em);
      }
    } catch (_) {
      // Silencioso — tentar novamente
    }
  }

  // ── Inicialização ─────────────────────────────────────────────
  async function init() {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Verificar se os documentos já foram enviados
    try {
      const docResp = await fetch("/api/verificacao/status", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (docResp.ok) {
        const docData = await docResp.json();
        const docEnviados = docData.status && docData.status !== "pendente";
        if (!docEnviados) {
          bloquearContrato();
          return;
        }
      }
    } catch (_) {
      // Se falhar a verificação, bloquear por precaução
      bloquearContrato();
      return;
    }

    desbloquearContrato();

    try {
      const statusResp = await fetch("/api/verificacao/contrato/status", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!statusResp.ok) {
        if (statusResp.status === 401 || statusResp.status === 403) return;
        throw new Error("Erro ao verificar contrato");
      }

      const statusData = await statusResp.json();

      if (statusData.assinado) {
        mostrarContratoAssinado(statusData.assinado_em);
        return;
      }

      if (statusData.sign_url) {
        mostrarFormularioAssinatura(statusData.sign_url);
        return;
      }

      // Gerar novo contrato no ZapSign
      if (contratoLoadingMsg) {
        contratoLoadingMsg.style.display = "block";
        const p = contratoLoadingMsg.querySelector("p");
        if (p) p.textContent = "A gerar o contrato...";
      }

      const criarResp = await fetch("/api/verificacao/contrato", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      });

      const criarData = await criarResp.json();

      if (!criarResp.ok) {
        if (contratoLoadingMsg) contratoLoadingMsg.style.display = "none";
        if (criarData.erro && criarData.erro.includes("dados pessoais")) {
          secaoContrato.style.display = "none";
        } else {
          mostrarErro(criarData.erro || "Erro ao preparar o contrato. Tenta novamente.");
        }
        return;
      }

      if (criarData.ja_assinado) {
        mostrarContratoAssinado(null);
        return;
      }

      if (criarData.sign_url) {
        mostrarFormularioAssinatura(criarData.sign_url);
      }

    } catch (err) {
      console.error("[Contrato] Erro:", err);
      if (contratoLoadingMsg) contratoLoadingMsg.style.display = "none";
      mostrarErro("Não foi possível carregar o contrato. Tenta actualizar a página.");
    }
  }

  // Ouvir evento emitido após envio bem-sucedido dos documentos
  document.addEventListener("documentosEnviados", () => {
    init();
    setTimeout(() => {
      secaoContrato.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 400);
  });

  // Ouvir evento do passo anterior (dados pessoais guardados)
  document.addEventListener("dadosPessoaisGuardados", () => {
    // Apenas bloquear — docs ainda não foram enviados
    bloquearContrato();
  });

  // Correr init() assim que a página carrega (para quem já passou os passos anteriores)
  init();

})();
