// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

// ===============================
// ESTADO
// ===============================
let modelo_id = null;

// ===============================
// DOM
// ===============================
const fileInput    = document.getElementById("conteudoFile");
const fileNameSpan = document.getElementById("fileName");
const lista        = document.getElementById("listaConteudos");

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await carregarModelo();
  bindFileInput();
  listarConteudos();
});

// ===============================
// MODELO (JWT)
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

  modelo_id = user.id;
}

// ===============================
// INPUT FILE
// ===============================
function bindFileInput() {
  fileInput.addEventListener("change", () => {
    fileNameSpan.textContent =
      fileInput.files.length
        ? fileInput.files[0].name
        : "Nenhum ficheiro selecionado";
  });
}

// ===============================
// UPLOAD
// ===============================
async function uploadConteudo() {
  const file = fileInput.files[0];
  if (!file) {
    alert("Selecione um ficheiro");
    return;
  }

  const fd = new FormData();
  fd.append("conteudo", file);

  const res = await fetch("/api/conteudos/upload", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });

  if (!res.ok) {
    alert("Erro ao enviar conteúdo");
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

  if (!res.ok) {
    alert("Erro ao carregar conteúdos");
    return;
  }

  const conteudos = await res.json();
  lista.innerHTML = "";

  if (!conteudos.length) {
    lista.innerHTML = "<p>Nenhum conteúdo enviado ainda.</p>";
    return;
  }

  conteudos.forEach(c => adicionarMidia(c));
}

// ===============================
// ADICIONAR MÍDIA (IGUAL PROFILE)
// ===============================
function adicionarMidia(conteudo) {
  const { id, url, tipo } = conteudo;
  const isVideo = tipo === "video";

  const card = document.createElement("div");
  card.className = "midiaCard";

  const img = document.createElement("img");
  img.className = "midiaThumb";

  if (isVideo) {
    // 🎥 vídeo → thumbnail
    img.src = url.replace(/\.(mp4|webm|ogg|mov)$/i, ".jpg");
    img.onerror = () => {
      img.src = "/assets/capaDefault.jpg";
    };
  } else {
    // 🖼️ imagem normal
    img.src = url;
  }

  img.addEventListener("click", () => {
    abrirModalMidia(url, isVideo);
  });

  const btnExcluir = document.createElement("button");
  btnExcluir.className = "btn-excluir";
  btnExcluir.textContent = "✕";
  btnExcluir.onclick = (e) => {
    e.stopPropagation();
    excluirConteudo(id);
  };

  card.appendChild(img);
  card.appendChild(btnExcluir);

  // 🔥 ESTA LINHA ESTAVA FALTANDO
  lista.appendChild(card);
}

// ===============================
// MODAL
// ===============================
function abrirModalMidia(url, isVideo) {
  const modal = document.getElementById("modalMidia");
  const img   = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  img.style.display = "none";
  video.style.display = "none";

  if (isVideo) {
    video.src = url;
    video.style.display = "block";
    video.play();
  } else {
    img.src = url;
    img.style.display = "block";
  }

  modal.classList.remove("hidden");
}

document.getElementById("fecharModal")?.addEventListener("click", () => {
  const modal = document.getElementById("modalMidia");
  const video = document.getElementById("modalVideo");

  video.pause();
  video.src = "";
  modal.classList.add("hidden");
});

// ===============================
// EXCLUIR
// ===============================
async function excluirConteudo(id) {
  if (!confirm("Excluir este conteúdo?")) return;

  const res = await fetch(`/api/conteudos/${id}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token }
  });

  if (res.ok) {
    listarConteudos();
  } else {
    alert("Erro ao excluir conteúdo");
  }
}
