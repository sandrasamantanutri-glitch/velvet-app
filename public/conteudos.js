// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      observer.unobserve(img);
    }
  });
}, { rootMargin: "200px" });

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
  if (!file) return;

  const fd = new FormData();
  fd.append("conteudo", file);

  if (file.type.startsWith("video")) {
  const thumbBlob = await gerarThumbnailVideo(file);
  fd.append("thumbnail", thumbBlob, "thumb.jpg");
}

if (file.type.startsWith("image")) {
  const thumbBlob = await gerarThumbnailImagem(file);
  fd.append("thumbnail", thumbBlob, "thumb.jpg");
}

  const res = await fetch("/api/conteudos/upload", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });

  if (!res.ok) {
    alert("Erro ao enviar conteúdo");
    return;
  }

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

  const isMobile = window.innerWidth < 768;
const limite = isMobile ? 12 : conteudos.length;

conteudos.slice(0, limite).forEach(c => adicionarMidia(c));

}

// ===============================
// ADICIONAR MÍDIA (VERSÃO OTIMIZADA)
// ===============================
function adicionarMidia(conteudo) {
  const { id, url, tipo, thumbnail_url } = conteudo;
   if (!thumbnail_url) {
    console.warn("Conteúdo sem thumbnail:", conteudo);
    return;
  }
  const isVideo = tipo === "video";

  const card = document.createElement("div");
  card.className = "midiaCard";

  const img = document.createElement("img");
  img.className = "midiaThumb";

  // 🔥 otimizações mobile
  img.loading = "lazy";
  img.decoding = "async";

  // placeholder imediato
  img.src = "/assets/thumb-loading.jpg";

  // src real
  const realSrc = thumbnail_url;

  // lazy load real (só carrega quando aparecer)
  img.dataset.src = realSrc;
  observer.observe(img);

  img.onclick = () => abrirModalMidia(url, isVideo);

  const btnExcluir = document.createElement("button");
  btnExcluir.className = "btn-excluir";
  btnExcluir.textContent = "✕";
  btnExcluir.onclick = (e) => {
    e.stopPropagation();
    excluirConteudo(id);
  };

  card.appendChild(img);
  card.appendChild(btnExcluir);
  lista.appendChild(card);
}

// ===============================
// THUMBNAIL DE VÍDEO (LEGADO + NOVO)
// ===============================
function getVideoThumbnail(url, thumbnail_url) {
  // 🆕 Novo padrão (Backblaze)
  if (thumbnail_url) {
    return thumbnail_url;
  }

  // 🧓 Legado Cloudinary
  if (url && url.includes("cloudinary.com")) {
    return url.replace(/\.(mp4|webm|ogg|mov)$/i, ".jpg");
  }

  // 🚨 Fallback final
  return "/assets/capaDefault.jpg";
}


async function gerarThumbnailVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.addEventListener("loadeddata", () => {
      video.currentTime = 1;
    });

    video.addEventListener("seeked", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      canvas.toBlob(blob => {
        resolve(blob);
        URL.revokeObjectURL(video.src);
      }, "image/jpeg", 0.85);
    });

    video.addEventListener("error", reject);
  });
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

function storageFromUrl(url) {
  if (!url) return null;
  if (url.includes("cloudinary.com")) return "cloudinary";
  if (url.includes(process.env.B2_ENDPOINT)) return "backblaze";
  return "desconhecido";
}

async function excluirArquivoFisico(url) {
  const storage = storageFromUrl(url);

  if (storage === "cloudinary") {
    const publicId = url
      .split("/")
      .slice(-2)
      .join("/")
      .replace(/\.[^/.]+$/, "");

    await cloudinary.uploader.destroy(publicId);
  }

  if (storage === "backblaze") {
    const key = decodeURIComponent(url.split(".com/")[1]);

    await s3.deleteObject({
      Bucket: process.env.B2_BUCKET,
      Key: key
    }).promise();
  }
}

async function gerarThumbnailImagem(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      const size = 300;
      canvas.width = size;
      canvas.height = size;

      const scale = Math.max(
        size / img.width,
        size / img.height
      );

      const w = img.width * scale;
      const h = img.height * scale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;

      ctx.drawImage(img, x, y, w, h);

      canvas.toBlob(
        blob => resolve(blob),
        "image/jpeg",
        0.7 // 🔥 leve
      );
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}



