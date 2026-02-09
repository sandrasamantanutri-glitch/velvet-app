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

  if (btnNovo) {
    btnNovo.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
  }

  if (btnFechar) {
    btnFechar.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }

   if (btnEnviar) {
    btnEnviar.addEventListener("click", async () => {
      const fileInput = document.getElementById("fileConteudo");
      const tipoSelect = document.getElementById("tipoConteudo");

      const file = fileInput.files[0];
      const tipo = tipoSelect.value;

      if (!file) {
        alert("Selecione um arquivo");
        return;
      }

      const token = localStorage.getItem("token");
      if (!token) {
        alert("Sessão expirada");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("tipo", tipo);
      formData.append("tipo_conteudo", "venda");

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

        // ✅ sucesso
        fecharModalNovoConteudo();
        await carregarConteudos();

        // reset
        fileInput.value = "";
        tipoSelect.value = "imagem";

      } catch (err) {
        console.error("Erro upload:", err.message);
        alert("Erro ao enviar conteúdo");
      } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = "Enviar";
      }
    });
  }
});

function fecharModalNovoConteudo() {
  const modal = document.getElementById("modalNovoConteudo");
  if (modal) modal.classList.add("hidden");
}

async function carregarConteudos() {
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Sessão expirada");
    return;
  }

  try {
    const res = await fetch("/api/conteudos?venda=true", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      throw new Error("Erro ao carregar conteúdos");
    }

    const conteudos = await res.json();
    renderizarConteudos(conteudos);

  } catch (err) {
    console.error("Erro:", err.message);
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

  conteudos.forEach(conteudo => {
    const card = criarCardConteudo(conteudo);
    grid.appendChild(card);
  });
}

function criarCardConteudo(conteudo) {
  const card = document.createElement("div");
  card.className = "card-conteudo";

  const thumb = document.createElement("img");
  thumb.className = "card-thumb";
  thumb.src = conteudo.thumbnail_url || conteudo.url;
  thumb.alt = conteudo.titulo || "Conteúdo";

  const info = document.createElement("div");
  info.className = "card-info";

  card.appendChild(thumb);
  card.appendChild(info);

  card.addEventListener("click", () => {
    console.log("Abrir conteúdo:", conteudo.id);
  });

  return card;
}
