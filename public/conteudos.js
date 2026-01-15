// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

// ===============================
// ESTADO
// ===============================
let modeloId = null;

// ===============================
// DOM
// ===============================
const fileInput = document.getElementById("conteudoFile");
const fileNameSpan = document.getElementById("fileName");
const lista = document.getElementById("listaConteudos");

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", init);

async function init() {
  await carregarModelo();
  bindFileInput();
  listarConteudos();
}

// ===============================
// MODELO
// ===============================
async function carregarModelo() {
  const res = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const user = await res.json();

  if (user.role !== "modelo") {
    alert("Acesso restrito à modelo");
    window.location.href = "/index.html";
    throw new Error("Usuário não é modelo");
  }

  modeloId = user.id;
}

// ===============================
// INPUT FILE
// ===============================
function bindFileInput() {
  fileInput.addEventListener("change", () => {
    fileNameSpan.textContent = fileInput.files.length
      ? fileInput.files[0].name
      : "Nenhum ficheiro selecionado";
  });
}

// ===============================
// UPLOAD
// ===============================
async function uploadConteudo() {
  const file = fileInput.files[0];
  if (!file) return alert("Selecione um ficheiro");

  const fd = new FormData();
  fd.append("conteudo", file);

  const res = await fetch("/api/conteudos/upload", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });

  if (!res.ok) {
    alert(await res.text());
    return;
  }

  fileInput.value = "";
  fileNameSpan.textContent = "Nenhum ficheiro selecionado";

  listarConteudos();
}

// ===============================
// LISTAR CONTEÚDOS
// ===============================
async function listarConteudos() {
  const res = await fetch("/api/conteudos/me", {
    headers: { Authorization: "Bearer " + token }
  });

  const conteudos = await res.json();
  lista.innerHTML = "";

  if (!conteudos.length) {
    lista.innerHTML = "<p>Nenhum conteúdo enviado ainda.</p>";
    return;
  }

  conteudos.forEach(renderConteudoCard);
}

// ===============================
// RENDER CARD (🔥 FIX PRINCIPAL)
// ===============================
function renderConteudoCard(c) {
  const card = document.createElement("div");
  card.className = "conteudo-card loading";

  let media;

  if (c.tipo === "video") {
    media = document.createElement("video");
    media.src = c.url;
    media.muted = true;
    media.onloadeddata = () => card.classList.remove("loading");
    media.onclick = () => abrirModalMidia(c.url, true);
  } else {
    media = document.createElement("img");
    media.src = c.url;
    media.loading = "lazy";
    media.onload = () => card.classList.remove("loading");
    media.onclick = () => abrirModalMidia(c.url, false);
  }

  const btn = document.createElement("button");
  btn.className = "btn-excluir";
  btn.textContent = "✕";
  btn.onclick = (e) => {
    e.stopPropagation();
    excluirConteudo(c.id);
  };

  card.append(media, btn);
  lista.appendChild(card);
}

// ===============================
// MODAL
// ===============================
function abrirModalMidia(url, isVideo) {
  const modal = document.getElementById("modalMidia");
  const img = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  img.style.display = "none";
  video.style.display = "none";

  if (isVideo) {
    video.src = url;
    video.onloadeddata = () => video.play();
    video.style.display = "block";
  } else {
    img.src = url;
    img.onload = () => (img.style.display = "block");
  }

  modal.classList.remove("hidden");
}

document.getElementById("fecharModal").onclick = () => {
  const modal = document.getElementById("modalMidia");
  const video = document.getElementById("modalVideo");

  video.pause();
  video.src = "";
  modal.classList.add("hidden");
};

// ===============================
// EXCLUIR
// ===============================
async function excluirConteudo(id) {
  if (!confirm("Excluir conteúdo?")) return;

  await fetch(`/api/conteudos/${id}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token }
  });

  listarConteudos();
}
