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
});

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

  const titulo = document.createElement("h3");
  titulo.textContent = conteudo.titulo || "Conteúdo sem título";

  const preco = document.createElement("div");
  preco.className = "card-preco";
  preco.textContent = `R$ ${Number(conteudo.preco).toFixed(2)}`;

  info.appendChild(titulo);
  info.appendChild(preco);

  card.appendChild(thumb);
  card.appendChild(info);

  card.addEventListener("click", () => {
    console.log("Abrir conteúdo:", conteudo.id);
    // depois: abrir modal / editar / detalhes
  });

  return card;
}
