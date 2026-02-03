let userId = null;

fetch("/api/modelo/me")
  .then(res => {
    if (!res.ok) throw new Error("Não autenticada");
    return res.json();
  })
  .then(modelo => {
    userId = modelo.id;

    document.getElementById("perfil-nome").textContent = modelo.nome;
    document.getElementById("perfil-bio").textContent = modelo.bio || "";

    document.getElementById("perfil-avatar").src =
      modelo.avatar_url || "/assets/avatar.png";

    document.getElementById("perfil-capa").src =
      modelo.capa_url || "/assets/capa.png";

    const localEl = document.querySelector(".local-icons");
    const textoLocal = document.getElementById("local-texto");

    if (modelo.cidade && modelo.estado) {
      textoLocal.textContent = `${modelo.cidade} - ${modelo.estado}`;
      localEl.style.display = "flex";
    } else {
      localEl.style.display = "none";
    }

    // 🔥 só carrega mídias DEPOIS de saber quem é a modelo
    carregarConteudos("feed");
  })
  .catch(err => {
    console.error("Erro ao carregar perfil:", err);
  });

const gridFree = document.getElementById("midias-free");
const gridPaid = document.getElementById("midias-paid");
const tabs = document.querySelectorAll(".midias-tabs .tab");

function carregarConteudos(tipoConteudo) {
  if (!userId) return;
  const grid = tipoConteudo === "feed" ? gridFree : gridPaid;
  grid.innerHTML = "";

  fetch(`/conteudos/${userId}?aba=${tipoConteudo}`)
    .then(res => res.json())
    .then(conteudos => {
      conteudos.forEach(c => {
        const card = document.createElement("div");
        card.className = "midia-card";

        const isVideo = c.tipo === "video";
        const thumb = isVideo ? c.thumb : c.url;

  if (c.tipo_conteudo === "venda") {
  card.innerHTML = `
    <div class="thumb-wrapper especial">
      <button class="btn-delete" title="Excluir">✕</button>

      <img src="${thumb}" loading="lazy" class="midia-thumb">

      <span class="lock">🔒</span>

      <div class="especial-preco-overlay">
        R$ ${Number(c.preco || 0).toFixed(2)}
      </div>
    </div>

    <div class="midia-descricao">
      ${c.descricao || "Conteúdo exclusivo"}
    </div>
  `;

  card.onclick = () => abrirModalVenda(c);
}
else {
  card.innerHTML = `
  <div class="thumb-wrapper">
  <button class="btn-delete" title="Excluir">✕</button>
          <img src="${thumb}" loading="lazy" class="midia-thumb">
          ${isVideo ? '<span class="play">▶</span>' : ''}
          </div>
          ${c.descricao ? `
            <div class="midia-descricao">
            ${c.descricao}
            </div>
            ` : ""}
            `;
            card.onclick = () => abrirConteudo(c);
          }


        const btnDelete = card.querySelector(".btn-delete");
        btnDelete.onclick = (e) => {
          e.stopPropagation();
          excluirMidia(c.id);
        };

        grid.appendChild(card);
      });
    })
    .catch(err => {
      console.error("Erro ao carregar conteúdos:", err);
    });
}

function abrirModalVenda(c) {
  const modal = document.createElement("div");
  modal.className = "modal-midia";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>

    <div class="modal-conteudo venda-modal">
      <img src="${c.thumb}" class="midia-thumb">

      <h3>Conteúdo Exclusivo</h3>
      <p>${c.descricao || "Conteúdo exclusivo para desbloqueio"}</p>

      <button class="btn-comprar">
        Desbloquear por R$ ${Number(c.preco).toFixed(2)}
      </button>
    </div>
  `;

  modal.querySelector(".modal-backdrop").onclick = () => modal.remove();

  document.body.appendChild(modal);
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
        0.7
      );
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function abrirConteudo(c) {
  const modal = document.createElement("div");
  modal.className = "modal-midia";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-conteudo">
      ${ c.tipo === "video" ? `<video src="${c.url}" autoplay muted loop controls playsinline preload="metadata"></video>
          `
          : `<img src="${c.url}" alt="Conteúdo">
          `
      }
    </div>
  `;

  // fecha SOMENTE clicando fora do conteúdo
  modal.querySelector(".modal-backdrop").addEventListener("click", () => {
    modal.remove();
  });

  // impede clique dentro de fechar o modal
  modal.querySelector(".modal-conteudo").addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.body.appendChild(modal);
}


tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    // ativa visual da aba
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    // mostra/esconde grids
    document.querySelectorAll(".midias-grid").forEach(g => g.classList.remove("active"));

    if (tab.dataset.tab === "free") {
      gridFree.classList.add("active");
      carregarConteudos("feed");
    } else {
      gridPaid.classList.add("active");
      carregarConteudos("venda");
    }
  });
});

async function excluirMidia(id) {
  const confirmar = confirm("Tem certeza que deseja excluir esta mídia?");
  if (!confirmar) return;

  try {
    const res = await fetch(`/conteudos/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      throw new Error("Erro ao excluir");
    }

    // 🔄 atualiza grid após excluir
    const abaAtiva = document.querySelector(".midias-tabs .tab.active");
    if (abaAtiva?.dataset.tab === "paid") {
      carregarConteudos("venda");
    } else {
      carregarConteudos("feed");
    }

  } catch (err) {
    console.error(err);
    alert("Erro ao excluir mídia");
  }
}

//UPLOAD BUTTON //doms
document.addEventListener("DOMContentLoaded", () => {
  const btnUpload = document.querySelector(".btn-upload");
  const inputUpload = document.getElementById("inputUpload");

  if (!btnUpload || !inputUpload) return;

  btnUpload.addEventListener("click", (e) => {
    e.preventDefault(); // 🚫 impede reload
    inputUpload.click(); // abre seletor
  });

  inputUpload.addEventListener("change", () => {
    const file = inputUpload.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    abrirPreviewUpload(file, url);
  });
});



function abrirPreviewUpload(file, url) {
  const modal = document.createElement("div");
  modal.className = "modal-midia";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-conteudo upload-preview">
      ${
        file.type.startsWith("video")
          ? `<video src="${url}" controls autoplay muted playsinline></video>`
          : `<img src="${url}">`
      }
      <div class="upload-box">
      <p class="upload-titulo">Escolha onde deseja adicionar a mídia:</p>
     <div class="upload-opcoes">
  <button class="upload-tab active" data-value="feed">🎁 Pra você</button>
  <button class="upload-tab" data-value="venda">🔥 Especial</button>
</div>

<input type="hidden" name="tipo_conteudo" value="feed">


  <div class="upload-especial hidden">
    <input
      type="number"
      id="upload-preco"
      placeholder="Preço (R$)"
      min="0"
      step="0.01"
    >

    <textarea
      id="upload-descricao"
      placeholder="Descrição do conteúdo"
      rows="3"
    ></textarea>
  </div>

  <button class="btn-confirmar">Publicar</button>
   </div>
  `;

  const fecharModal = () => {
    URL.revokeObjectURL(url);
    modal.remove();
  };

  modal.querySelector(".modal-backdrop").onclick = fecharModal;

  const tabs = modal.querySelectorAll(".upload-tab");
  const hiddenTipo = modal.querySelector("input[name='tipo_conteudo']");
  const boxEspecial = modal.querySelector(".upload-especial");

  tabs.forEach(tab => {
  tab.onclick = () => {
     tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

     const valor = tab.dataset.value;
    hiddenTipo.value = valor;
     boxEspecial.classList.toggle("hidden", valor !== "venda");
     };
  });
  const btnPublicar = modal.querySelector(".btn-confirmar");
  btnPublicar.onclick = async () => {
  btnPublicar.disabled = true;
  btnPublicar.textContent = "Enviando...";
  
  try {
    const tipoConteudo = hiddenTipo.value;
    const preco = modal.querySelector("#upload-preco")?.value;
    const descricao = modal.querySelector("#upload-descricao")?.value;

    await enviarMidia(file, {
        tipo_conteudo: tipoConteudo,
        preco,
        descricao
    });

    const abaAtiva = document.querySelector(".midias-tabs .tab.active");
     carregarConteudos(
        abaAtiva?.dataset.tab === "paid" ? "venda" : "feed"
      );
      
    fecharModal();
   } catch (err) {
    console.error(err);
    btnPublicar.disabled = false;
    btnPublicar.textContent = "Publicar";
    alert("Erro ao enviar mídia");
    }
  };
  
  document.body.appendChild(modal);
}

async function enviarMidia(file, dados = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("user_id", userId);

  if (dados.tipo_conteudo) {
    formData.append("tipo_conteudo", dados.tipo_conteudo);
  }

  if (dados.tipo_conteudo === "venda") {
    formData.append("preco", dados.preco || 0);
    formData.append("descricao", dados.descricao || "");
  }

  const res = await fetch("/upload", {
    method: "POST",
    body: formData
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "Erro no upload");
  }

  return JSON.parse(text);
}



