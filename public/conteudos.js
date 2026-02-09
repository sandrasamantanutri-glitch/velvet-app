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
      const fileInput = document.getElementById("fileConteudo");

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
    img.src = c.thumbnail_url || c.url;

    card.appendChild(img);
    grid.appendChild(card);
  });
}

function fecharModalNovoConteudo() {
  const modal = document.getElementById("modalNovoConteudo");
  if (modal) modal.classList.add("hidden");
}