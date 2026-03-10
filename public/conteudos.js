// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}

document.addEventListener("DOMContentLoaded", () => {
  carregarConteudos();
  iniciarLazyLoading();



  const btnNovo = document.getElementById("btnNovoConteudo");
  const modal = document.getElementById("modalNovoConteudo");
  const btnFechar = document.getElementById("btnFecharModal");
  const btnEnviar = document.getElementById("btnEnviarConteudo");

  // 🔥 NOVO — mostrar nome do ficheiro
  const fileInput = document.getElementById("fileConteudo");
  const fileName = document.getElementById("fileName");

  if (fileInput) {
  fileInput.addEventListener("change", () => {

    const files = fileInput.files;

    if (!files || files.length === 0) {
      fileName.textContent = "Nenhum ficheiro selecionado";
      return;
    }

    if (files.length > 10) {
      alert("Você pode selecionar no máximo 10 arquivos.");
      fileInput.value = "";
      fileName.textContent = "Nenhum ficheiro selecionado";
      return;
    }

if (files.length === 1) {
  if (fileName) fileName.textContent = files[0].name;
} else {
  if (fileName) fileName.textContent = `${files.length} arquivos selecionados`;
}

  });
}

  if (btnNovo) {
    btnNovo.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
  }

  if (btnFechar) {
    btnFechar.addEventListener("click", fecharModalNovoConteudo);
  }

if (btnEnviar) {
  btnEnviar.addEventListener("click", () => {

    if (!fileInput) {
  alert("Campo de upload não encontrado.");
  return;
}

const files = fileInput.files;

    if (!files || files.length === 0) {
      alert("Selecione pelo menos um arquivo.");
      return;
    }

    if (files.length > 10) {
      alert("Você pode enviar no máximo 10 arquivos.");
      return;
    }

    const token = localStorage.getItem("token");

    const formData = new FormData();
    for (const file of files) {
      formData.append("file", file);
    }

    const progressContainer = document.getElementById("uploadProgressContainer");
    const progressBar = document.getElementById("uploadProgressBar");
    const progressText = document.getElementById("uploadPercent");

    progressContainer.classList.remove("hidden");
    btnEnviar.disabled = true;
    btnEnviar.textContent = "Enviando...";

    const xhr = new XMLHttpRequest();

    xhr.open("POST", "/api/conteudos", true);
    xhr.setRequestHeader("Authorization", "Bearer " + token);

    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = percent + "%";
        progressText.textContent = percent + "%";
      }
    };

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {

        progressBar.style.width = "100%";
        progressText.textContent = "100%";

        setTimeout(async () => {

          fecharModalNovoConteudo();
          await carregarConteudos();

          fileInput.value = "";
          fileName.textContent = "Nenhum ficheiro selecionado";

          progressBar.style.width = "0%";
          progressText.textContent = "0%";
          progressContainer.classList.add("hidden");

          btnEnviar.disabled = false;
          btnEnviar.textContent = "Enviar";

        }, 500);

      } else {
        alert("Erro ao enviar conteúdo");
        btnEnviar.disabled = false;
        btnEnviar.textContent = "Enviar";
      }
    };

    xhr.onerror = function () {
      alert("Erro na conexão");
      btnEnviar.disabled = false;
      btnEnviar.textContent = "Enviar";
    };

    xhr.send(formData);

  });
}

  const btnFecharViewer = document.getElementById("btnFecharViewer");
  const modalViewer = document.getElementById("modalVisualizarConteudo");

  if (btnFecharViewer) {
    btnFecharViewer.addEventListener("click", fecharViewer);
  }

  if (modalViewer) {
    modalViewer.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop")) {
        fecharViewer();
      }
    });
  }
});

async function carregarConteudos() {
  try {
    const res = await fetch("/api/conteudos?venda=true", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) throw new Error("Erro ao carregar conteúdos");

    const conteudos = await res.json();
    renderizarConteudos(conteudos);

  } catch (err) {
    console.error(err.message);
  }
}

let observer = null;

function renderizarConteudos(conteudos) {

  const grid = document.getElementById("conteudosGrid");
  const vazio = document.getElementById("conteudosVazio");

  grid.innerHTML = "";

  if (!conteudos || conteudos.length === 0) {
    vazio.classList.remove("hidden");
    return;
  }

  vazio.classList.add("hidden");

  conteudos.forEach(c => {

    const card = document.createElement("div");
    card.className = "card-conteudo";

    const img = document.createElement("img");
    img.className = "card-thumb";

    let src;

    // ===============================
    // VIDEO (Cloudflare thumbnail)
    // ===============================

    if (c.tipo === "video") {

      src = c.thumbnail_url;

      if (!src && c.url && c.url.includes("videodelivery.net")) {

        const videoId = c.url
          .split("videodelivery.net/")[1]
          .split("?")[0];

        src = `https://videodelivery.net/${videoId}/thumbnails/thumbnail.jpg`;

      }

    } else {

      // ===============================
      // IMAGEM NORMAL
      // ===============================

      src = c.url;

    }

    // ===============================
    // LAZY LOADING
    // ===============================

    img.loading = "lazy";
    img.dataset.src = src || "/assets/capa.png";
    img.src = "/assets/placeholder.png";

    if (observer) observer.observe(img);

    card.appendChild(img);

    // ===============================
    // OVERLAY PLAY
    // ===============================

    if (c.tipo === "video") {

      const overlay = document.createElement("div");
      overlay.className = "play-overlay";

      const icon = document.createElement("span");
      icon.textContent = "▶";

      overlay.appendChild(icon);
      card.appendChild(overlay);

    }

    // ===============================
    // BOTÃO EXCLUIR
    // ===============================

    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btn-excluir";
    btnExcluir.innerHTML = "×";

    btnExcluir.addEventListener("click", async (e) => {

      e.stopPropagation();

      const ok = confirm("Deseja excluir este conteúdo?");
      if (!ok) return;

      await excluirConteudo(c.id);

    });

    // ===============================
    // ABRIR VIEWER
    // ===============================

    card.addEventListener("click", () => {
      abrirViewer(c);
    });

    card.appendChild(btnExcluir);

    grid.appendChild(card);

  });

}

function fecharModalNovoConteudo() {
  const modal = document.getElementById("modalNovoConteudo");
  if (modal) modal.classList.add("hidden");
}

function abrirViewer(conteudo) {

  const modal = document.getElementById("modalVisualizarConteudo");
  const viewer = document.getElementById("viewerConteudo");

  viewer.innerHTML = "";

  if (conteudo.tipo === "video") {

    // CLOUDFARE STREAM
    if (conteudo.url.includes("videodelivery.net")) {

      const videoId = conteudo.url.split("videodelivery.net/")[1].split("?")[0];

      const iframe = document.createElement("iframe");
      iframe.src = `https://iframe.videodelivery.net/${videoId}?autoplay=true`;
      iframe.allow =
        "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture";
      iframe.allowFullscreen = true;

      viewer.appendChild(iframe);

    } else {

      // fallback para mp4 antigo
      const video = document.createElement("video");
      video.src = conteudo.url;
      video.controls = true;
      video.autoplay = true;

      viewer.appendChild(video);

    }

  } else {

    const img = document.createElement("img");
    img.src = conteudo.url;
    viewer.appendChild(img);

  }

  modal.classList.remove("hidden");
}

function fecharViewer() {

  const modal = document.getElementById("modalVisualizarConteudo");
  const viewer = document.getElementById("viewerConteudo");

  const video = viewer.querySelector("video");
  const iframe = viewer.querySelector("iframe");

  if (video) {
    video.pause();
    video.src = "";
  }

  if (iframe) {
    iframe.src = "";
  }

  viewer.innerHTML = "";

  modal.classList.add("hidden");

}

async function excluirConteudo(conteudoId) {
  try {
    const res = await fetch(`/api/conteudos/${conteudoId}`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      const erro = await res.text();
      throw new Error(erro || "Erro ao excluir conteúdo");
    }

    // recarrega lista
    await carregarConteudos();

  } catch (err) {
    console.error("Erro ao excluir:", err.message);
    alert("Erro ao excluir conteúdo");
  }
}

function iniciarLazyLoading(){

  observer = new IntersectionObserver((entries) => {

    entries.forEach(entry => {

      if(entry.isIntersecting){

        const el = entry.target;

        const src = el.dataset.src;

        if(src){
          el.src = src;
          el.removeAttribute("data-src");
        }

        observer.unobserve(el);

      }

    });

  },{
    rootMargin: "200px"
  });

}

