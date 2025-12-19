const socket = window.socket;

if (!socket) {
  console.error("❌ Socket não disponível no chatmodelo");
}
// ===============================
// 📦 INIT
// ===============================
const modelo = localStorage.getItem("modeloPerfil");
console.log("PAINEL DE CONTEÚDOS DA MODELO:", modelo);

// mostra nome do ficheiro selecionado
const fileInput = document.getElementById("conteudoFile");
const fileNameSpan = document.getElementById("fileName");

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    fileNameSpan.textContent = fileInput.files[0].name;
  } else {
    fileNameSpan.textContent = "Nenhum ficheiro selecionado";
  }
});

// ===============================
// 📤 UPLOAD
// ===============================
function uploadConteudo() {
  const file = fileInput.files[0];

  if (!file) {
    alert("Selecione um ficheiro primeiro");
    return;
  }

  if (!modelo) {
    alert("Modelo não identificado");
    return;
  }

  const formData = new FormData();
  formData.append("arquivo", file);
  formData.append("modelo", modelo);

  fetch(`/api/conteudos/upload?modelo=${encodeURIComponent(modelo)}`, {
    method: "POST",
    body: formData
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert("Erro ao enviar conteúdo");
        return;
      }

      alert("Conteúdo enviado com sucesso!");
      fileInput.value = "";
      fileNameSpan.textContent = "Nenhum ficheiro selecionado";

      listarConteudos(); // 🔥 atualiza lista
    })
    .catch(err => {
      console.error("Erro no upload:", err);
      alert("Erro no upload");
    });
}

// ===============================
// 📋 LISTAR CONTEÚDOS
// ===============================
function listarConteudos() {
  if (!modelo) return;

  fetch(`/api/conteudos/listar?modelo=${encodeURIComponent(modelo)}`)
    .then(res => res.json())
    .then(conteudos => {
      const lista = document.getElementById("listaConteudos");
      lista.innerHTML = "";

      if (!conteudos.length) {
        lista.innerHTML = "<p>Nenhum conteúdo enviado ainda.</p>";
        return;
      }

     conteudos.forEach(c => {
  const card = document.createElement("div");
  card.className = "conteudo-card";

  const url = `/conteudo/abrir?modelo=${modelo}&conteudoId=${c.id}`;

  const media =
    c.tipo === "video"
      ? `<video src="${url}" muted></video>`
      : `<img src="${url}" />`;

  card.innerHTML = `
    ${media}
    <button class="btn-excluir" onclick="excluirConteudo('${c.id}')">
      ✕
    </button>
  `;

  lista.appendChild(card);
});

    })
    .catch(err => console.error("Erro ao listar conteúdos:", err));
}

function excluirConteudo(conteudoId) {
  const modelo = localStorage.getItem("modeloPerfil");
  if (!modelo) return;

  const confirmar = confirm("Deseja excluir este conteúdo?");
  if (!confirmar) return;

  fetch(`/api/conteudos/excluir?modelo=${encodeURIComponent(modelo)}&conteudoId=${encodeURIComponent(conteudoId)}`, {
    method: "DELETE"
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert("Erro ao excluir conteúdo");
        return;
      }

      listarConteudos(); // 🔥 atualiza grid
    })
    .catch(err => {
      console.error("Erro ao excluir:", err);
      alert("Erro ao excluir conteúdo");
    });
}


// ===============================
// ▶️ AUTO LOAD
// ===============================
listarConteudos();


/// ===========================
// MINIATURAS (PROTEGIDO)
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("conteudoFile");
  const preview = document.getElementById("previewConteudos");

  if (!input || !preview) return;

  input.addEventListener("change", () => {
    preview.innerHTML = "";

    Array.from(input.files).forEach(file => {
      const card = document.createElement("div");
      card.className = "preview-card";

      if (file.type.startsWith("image")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        card.appendChild(img);
      }

      if (file.type.startsWith("video")) {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        card.appendChild(video);
      }

      preview.appendChild(card);
    });
  });
});
