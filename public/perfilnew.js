const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (token && window.io) {
  const socket = io();
  socket.emit("auth", { token });
}

// ===============================
// PERFIL.JS — VERSÃO BLINDADA
// ===============================

(() => {
  "use strict";

  // ===============================
  // STATE
  // ===============================
  const state = {
    token: localStorage.getItem("token"),
    role: localStorage.getItem("role"),
    modeloId: null,
    modo: "publico"
  };

  // ===============================
  // DOM CACHE
  // ===============================
  const dom = {};

  // ===============================
  // INIT
  // ===============================
  document.addEventListener("DOMContentLoaded", () => {
    cacheDOM();
    definirModo();
    aplicarRoleNoBody();
    iniciarPerfil();

    document.querySelectorAll(".tab").forEach(btn => {

  btn.addEventListener("click", () => {

    document.querySelectorAll(".tab").forEach(t =>
      t.classList.remove("active")
    );

    btn.classList.add("active");

    const tab = btn.dataset.tab;

    document.querySelectorAll(".midias-grid").forEach(grid =>
      grid.classList.remove("active")
    );

    if(tab === "free"){
      document.getElementById("listaMidias").classList.add("active");
    }

    if(tab === "paid"){
      document.getElementById("midias-paid").classList.add("active");
    }

  });

 });

 });

  // ===============================
  // DOM
  // ===============================
  function cacheDOM() {
    dom.avatar = document.getElementById("perfil-avatar");
    dom.capa   = document.getElementById("perfil-capa");
    dom.nome   = document.getElementById("perfil-nome");
    dom.bio    = document.getElementById("perfil-bio");
    dom.local  = document.getElementById("local-texto");

    dom.midiasFree = document.getElementById("midias-free");
    dom.midiasPaid = document.getElementById("midias-paid");
  }

  // ===============================
  // MODO
  // ===============================
  function definirModo() {
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get("id");

    if (state.token && state.role === "modelo" && !paramId) {
      state.modo = "privado";
      state.modeloId = localStorage.getItem("modelo_id");
      return;
    }

    if (paramId) {
      state.modo = "publico";
      state.modeloId = Number(paramId);
      return;
    }

    state.modo = "publico";
  }

  // ===============================
  // ROLE VISUAL
  // ===============================
  function aplicarRoleNoBody() {
    document.body.classList.remove("role-modelo", "role-cliente", "role-publico");

    if (state.role === "modelo") {
      document.body.classList.add("role-modelo");
    } else if (state.role === "cliente") {
      document.body.classList.add("role-cliente");
    } else {
      document.body.classList.add("role-publico");
    }
  }

  // ===============================
  // PERFIL FLOW
  // ===============================
  function iniciarPerfil() {

    if (state.modo === "privado" && state.role === "modelo") {
      carregarPerfilPrivado();
      carregarFeedPrivado();
      return;
    }

    if (state.modo === "publico" && state.modeloId) {
      carregarPerfilPublico();
      carregarFeedPublico();
      return;
    }

    aplicarDefaults();
  }

  // ===============================
  // PERFIL PRIVADO
  // ===============================
  async function carregarPerfilPrivado() {

    try {

      const res = await fetch("/api/modelo/me", {
        headers: { Authorization: "Bearer " + state.token }
      });

      if (!res.ok) throw new Error("perfil privado não encontrado");

      const modelo = await res.json();

      state.modeloId = modelo.id;

      localStorage.setItem("modelo_id", modelo.id);

      aplicarPerfilNoDOM(modelo);

    } catch {

      aplicarDefaults();

    }

  }

  // ===============================
  // PERFIL PÚBLICO
  // ===============================
  async function carregarPerfilPublico() {

    try {

      const res = await fetch(`/api/modelo/publico/${state.modeloId}`);

      if (!res.ok) throw new Error("perfil público não encontrado");

      const modelo = await res.json();

      aplicarPerfilNoDOM(modelo);

    } catch {

      aplicarDefaults();

    }

  }

  // ===============================
  // DOM PERFIL
  // ===============================
  function aplicarPerfilNoDOM(modelo) {

    if (dom.nome) {
      dom.nome.textContent =
        typeof modelo.nome === "string"
          ? modelo.nome
          : "";
    }

    if (dom.bio) {
      dom.bio.textContent =
        typeof modelo.bio === "string"
          ? modelo.bio
          : "";
    }

    if (dom.avatar) {

      dom.avatar.src =
        typeof modelo.avatar === "string" && modelo.avatar !== ""
          ? modelo.avatar
          : "/assets/avatar.png";

      dom.avatar.onerror = () => {
        dom.avatar.src = "/assets/avatar.png";
      };

    }

    if (dom.capa) {

      dom.capa.src =
        typeof modelo.capa === "string" && modelo.capa !== ""
          ? modelo.capa
          : "/assets/capa.png";

      dom.capa.onerror = () => {
        dom.capa.src = "/assets/capa.png";
      };

    }

    if (dom.local) {

      const cidade = typeof modelo.cidade === "string" ? modelo.cidade : "";
      const estado = typeof modelo.estado === "string" ? modelo.estado : "";

      dom.local.textContent =
        [cidade, estado].filter(Boolean).join(" • ");

    }

  }

  // ===============================
  // DEFAULTS
  // ===============================
  function aplicarDefaults() {

    if (dom.nome)  dom.nome.textContent = "";
    if (dom.bio)   dom.bio.textContent  = "";

    if (dom.avatar) dom.avatar.src = "/assets/avatar.png";
    if (dom.capa)   dom.capa.src   = "/assets/capa.png";
    if (dom.local)  dom.local.textContent = "";

  }

  // ===============================
  // FEED
  // ===============================
  async function carregarFeedPrivado() {

    if (!dom.midiasFree || !dom.midiasPaid) return;

    try {

      const res = await fetch("/api/feed/me", {
        headers: { Authorization: "Bearer " + state.token }
      });

      const feed = await res.json();

      renderFeed(feed);

    } catch {}

  }

  async function carregarFeedPublico() {

    if (!dom.midiasFree || !dom.midiasPaid) return;

    try {

      const res = await fetch(`/api/modelo/publico/${state.modeloId}/feed`);

      const feed = await res.json();

      renderFeed(feed);

    } catch {}

  }

  function renderFeed(feed) {

    dom.midiasFree.innerHTML = "";
    dom.midiasPaid.innerHTML = "";

    if (!Array.isArray(feed)) return;

    feed.forEach(item => {

      const container =
        item.tipo_conteudo === "paid"
          ? dom.midiasPaid
          : dom.midiasFree;

      const div = document.createElement("div");

      div.className = "midia-thumb";

      const img = document.createElement("img");

      img.src = item.thumbnail_url || item.url;

      img.onerror = () => img.src = "/assets/capaDefault.jpg";

      div.appendChild(img);

      container.appendChild(div);

    });

  }

  // ===============================
  // FUNÇÕES DO RODAPÉ
  // ===============================

  window.postarFeed = () => {
    window.location.href = "/modelo/postar-feed.html";
  };

  window.postarPremium = () => {
    window.location.href = "/modelo/postar-premium.html";
  };

  window.abrirConteudosVenda = () => {
    window.location.href = "/modelo/conteudos.html";
  };

  window.alterarVIP = () => {
    window.location.href = "/modelo/config-vip.html";
  };

  window.editarLinksPerfil = () => {
    window.location.href = "/modelo/links.html";
  };

})();