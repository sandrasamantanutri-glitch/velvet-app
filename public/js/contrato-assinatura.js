// ============================================================
// contrato-assinatura.js
// Passo 4 do onboarding: contrato lido numa janela com rolagem (pdf.js),
// assinatura desenhada com o dedo/rato, envio para o servidor (Cloudflare R2).
// O contrato só fica disponível após o envio dos documentos (passo 3).
// ============================================================

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const secaoContrato        = $("secaoContrato");
  if (!secaoContrato) return; // Só corre em conta.html

  const contratoJaAssinado   = $("contratoJaAssinado");
  const contratoAssinadoData = $("contratoAssinadoData");
  const contratoAAssinar     = $("contratoAAssinar");
  const loadingMsg           = $("contratoLoadingMsg");
  const viewer               = $("contratoViewer");
  const paginasEl            = $("contratoPaginas");
  const scrollHint           = $("contratoScrollHint");
  const canvas               = $("contratoCanvas");
  const canvasHint           = $("contratoCanvasHint");
  const btnLimpar            = $("btnContratoLimpar");
  const btnAssinar           = $("btnContratoAssinar");
  const chkAceite            = $("contratoAceite");
  const btnSalvar            = $("btnContratoSalvar");
  const btnImprimir          = $("btnContratoImprimir");
  const erroEl               = $("contratoErro");

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  // Idioma do contrato: o mesmo escolhido no site (pt / es / en)
  const idioma = () => {
    const l = (localStorage.getItem("idioma") || navigator.language || "pt").slice(0, 2).toLowerCase();
    return ["pt", "es", "en"].includes(l) ? l : "pt";
  };
  const tr = (key, fallback) => {
    try { const v = window.t && window.t("conta." + key); return v && v !== "conta." + key ? v : fallback; }
    catch (_) { return fallback; }
  };

  let carregado = false;
  let leuAteFim = false;
  let desenhou = false;
  let pdfBlobUrl = null;

  // ── Helpers ──────────────────────────────────────────────────
  function mostrarErro(msg) {
    if (!erroEl) return;
    erroEl.textContent = msg;
    erroEl.style.display = "block";
  }
  function esconderErro() { if (erroEl) erroEl.style.display = "none"; }

  function bloquearContrato() {
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
    secaoContrato.style.opacity = "";
    secaoContrato.style.pointerEvents = "";
    secaoContrato.style.userSelect = "";
    const overlay = secaoContrato.querySelector(".bloqueio-overlay");
    if (overlay) overlay.remove();
  }

  function mostrarContratoAssinado(assinadoEm) {
    if (contratoJaAssinado) contratoJaAssinado.classList.remove("hidden");
    if (contratoAAssinar)   contratoAAssinar.style.display = "none";
    if (contratoAssinadoData && assinadoEm) {
      const d = new Date(assinadoEm);
      contratoAssinadoData.textContent = `Assinado em ${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
  }

  function atualizarBotaoAssinar() {
    btnAssinar.disabled = !(leuAteFim && desenhou && chkAceite.checked);
  }

  // ── PDF: carregar e desenhar páginas ─────────────────────────
  async function buscarPdfBlob(download) {
    const resp = await fetch(`/api/verificacao/contrato/pdf?lang=${idioma()}${download ? "&download=1" : ""}`, { headers: authHeaders() });
    if (!resp.ok) {
      let msg = "Não foi possível carregar o contrato.";
      try { msg = (await resp.json()).erro || msg; } catch (_) {}
      throw new Error(msg);
    }
    return resp.blob();
  }

  async function renderizarPdf(blob) {
    if (!window.pdfjsLib) throw new Error("Leitor de PDF indisponível.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/js/vendor/pdfjs/pdf.worker.min.js";
    const data = new Uint8Array(await blob.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    paginasEl.innerHTML = "";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const larguraAlvo = Math.max(viewer.clientWidth - 20, 300);

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = (larguraAlvo / base.width) * dpr;
      const vp = page.getViewport({ scale });
      const c = document.createElement("canvas");
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      paginasEl.appendChild(c);
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    }
  }

  // ── Detetar leitura até ao fim ───────────────────────────────
  function verificarScroll() {
    if (leuAteFim) return;
    const fim = viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 40;
    if (fim) {
      leuAteFim = true;
      if (scrollHint) scrollHint.classList.add("hidden");
      atualizarBotaoAssinar();
    }
  }

  // ── Pad de assinatura ────────────────────────────────────────
  const ctx = canvas.getContext("2d");
  let desenhando = false;

  function ajustarCanvas() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    desenhou = false;
    canvasHint.classList.remove("hidden");
    atualizarBotaoAssinar();
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    desenhando = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!desenhando) return;
    e.preventDefault();
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    if (!desenhou) {
      desenhou = true;
      canvasHint.classList.add("hidden");
      atualizarBotaoAssinar();
    }
  });
  const fimTraco = () => { desenhando = false; };
  canvas.addEventListener("pointerup", fimTraco);
  canvas.addEventListener("pointercancel", fimTraco);
  canvas.addEventListener("pointerleave", fimTraco);

  btnLimpar.addEventListener("click", ajustarCanvas);
  chkAceite.addEventListener("change", atualizarBotaoAssinar);
  viewer.addEventListener("scroll", verificarScroll, { passive: true });

  // ── Salvar / Imprimir ────────────────────────────────────────
  btnSalvar.addEventListener("click", async () => {
    try {
      esconderErro();
      const blob = await buscarPdfBlob(true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contrato-velvet.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) { mostrarErro(err.message); }
  });

  btnImprimir.addEventListener("click", async () => {
    try {
      esconderErro();
      const blob = await buscarPdfBlob(false);
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      pdfBlobUrl = URL.createObjectURL(blob);
      // O leitor de PDF do navegador oferece imprimir
      const w = window.open(pdfBlobUrl, "_blank");
      if (!w) mostrarErro(tr("contrato_erro_popup", "Permite pop-ups para imprimir, ou usa 'Salvar PDF'."));
    } catch (err) { mostrarErro(err.message); }
  });

  // ── Enviar assinatura ────────────────────────────────────────
  btnAssinar.addEventListener("click", async () => {
    if (btnAssinar.disabled) return;
    esconderErro();
    btnAssinar.disabled = true;
    const textoOriginal = btnAssinar.textContent;
    btnAssinar.textContent = tr("contrato_enviando", "A enviar...");
    try {
      const resp = await fetch("/api/verificacao/contrato/assinar", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ assinatura: canvas.toDataURL("image/png"), aceite: true, lang: idioma() })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.erro || "Erro ao enviar a assinatura.");
      mostrarContratoAssinado(data.assinado_em || new Date().toISOString());
      secaoContrato.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      mostrarErro(err.message);
      btnAssinar.textContent = textoOriginal;
      atualizarBotaoAssinar();
    }
  });

  // ── Inicialização ─────────────────────────────────────────────
  async function carregarContrato() {
    if (carregado) return;
    carregado = true;
    loadingMsg.style.display = "block";
    try {
      const blob = await buscarPdfBlob(false);
      viewer.classList.remove("hidden");
      await renderizarPdf(blob);
      loadingMsg.style.display = "none";
      ajustarCanvas();
      if (scrollHint) scrollHint.classList.remove("hidden");
      verificarScroll();
    } catch (err) {
      carregado = false;
      loadingMsg.style.display = "none";
      viewer.classList.add("hidden");
      mostrarErro(err.message || tr("contrato_erro_carregar", "Não foi possível carregar o contrato. Tenta actualizar a página."));
    }
  }

  async function init() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const docResp = await fetch("/api/verificacao/status", { headers: authHeaders() });
      if (docResp.ok) {
        const docData = await docResp.json();
        if (!(docData.status && docData.status !== "pendente")) {
          bloquearContrato();
          return;
        }
      }
    } catch (_) {
      bloquearContrato();
      return;
    }

    desbloquearContrato();

    try {
      const resp = await fetch("/api/verificacao/contrato/status", { headers: authHeaders() });
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) return;
        throw new Error("Erro ao verificar contrato");
      }
      const data = await resp.json();
      if (data.assinado) {
        mostrarContratoAssinado(data.assinado_em);
        return;
      }
      if (data.pode_assinar === false) {
        secaoContrato.style.display = "none"; // dados pessoais em falta (passo 2)
        return;
      }
      await carregarContrato();
    } catch (err) {
      console.error("[Contrato] Erro:", err);
      loadingMsg.style.display = "none";
      mostrarErro(tr("contrato_erro_carregar", "Não foi possível carregar o contrato. Tenta actualizar a página."));
    }
  }

  document.addEventListener("documentosEnviados", () => {
    init();
    setTimeout(() => secaoContrato.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  });
  document.addEventListener("dadosPessoaisGuardados", bloquearContrato);
  window.addEventListener("resize", () => { if (!desenhou && viewer && !viewer.classList.contains("hidden")) ajustarCanvas(); });

  init();
})();
