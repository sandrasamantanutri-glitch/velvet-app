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

  const btnNovo = document.getElementById("btnNovoConteudo");
  const modal = document.getElementById("modalNovoConteudo");
  const btnFechar = document.getElementById("btnFecharModal");
  const btnEnviar = document.getElementById("btnEnviarConteudo");

  // 🔥 NOVO — mostrar nome do ficheiro
  const fileInput = document.getElementById("fileConteudo");
  const fileName = document.getElementById("fileName");

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length > 0) {
        fileName.textContent = fileInput.files[0].name;
      } else {
        fileName.textContent = "Nenhum ficheiro selecionado";
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
    btnEnviar.addEventListener("click", async () => {

      const file = fileInput.files[0];

      if (!file) {
        alert("Selecione um arquivo");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      try {
        btnEnviar.disabled = true;
        btnEnviar.textContent = "Enviando...";

        const res = await fetch("/api/conteudos", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token
          },
          body: formData
        });

        if (!res.ok) {
          const erro = await res.text();
          throw new Error(erro || "Erro ao enviar conteúdo");
        }

        fecharModalNovoConteudo();
        await carregarConteudos();

        // 🔥 reset visual
        fileInput.value = "";
        fileName.textContent = "Nenhum ficheiro selecionado";

      } catch (err) {
        console.error("Erro upload:", err.message);
        alert("Erro ao enviar conteúdo");
      } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = "Enviar";
      }
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

if (c.tipo === "video") {
  img.src = c.thumbnail_url || "/assets/capa.png";
} else {
  img.src = c.url;
}

  card.appendChild(img);

  // ▶ OVERLAY PARA VÍDEO
  if (c.tipo === "video") {
    const overlay = document.createElement("div");
    overlay.className = "play-overlay";

    const icon = document.createElement("span");
    icon.textContent = "▶";

    overlay.appendChild(icon);
    card.appendChild(overlay);
  }

  // ❌ BOTÃO EXCLUIR
  const btnExcluir = document.createElement("button");
  btnExcluir.className = "btn-excluir";
  btnExcluir.innerHTML = "×";

  btnExcluir.addEventListener("click", async (e) => {
    e.stopPropagation(); // ⛔ não abre o viewer

    const ok = confirm("Deseja excluir este conteúdo?");
    if (!ok) return;

    await excluirConteudo(c.id);
  });

  // clique no card abre viewer
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
    const video = document.createElement("video");
    video.src = conteudo.url;
    video.controls = true;
    video.autoplay = true;
    viewer.appendChild(video);
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

