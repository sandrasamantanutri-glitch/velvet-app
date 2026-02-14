// ===============================
// AUTH GUARD — CLIENT HOME
// ===============================
const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "/index.html";
}

function logout() {
  localStorage.clear();
  window.location.href = "/index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const lista = document.getElementById("listaModelos");

  if (!lista) {
    console.error("❌ listaModelos não encontrada no index.html");
    return;
  }

  const token = localStorage.getItem("token");
  if (!token) {
    lista.innerHTML =
      "<p>Entre para ver as modelos disponíveis.</p>";
    return;
  }

  // 🔹 Busca os modelos do backend
  fetch("/api/modelos", {
    headers: {
      Authorization: "Bearer " + token
    }
  })
    .then(res => {
      if (!res.ok) throw new Error();
      return res.json();
    })
    .then(modelos => {
      lista.innerHTML = "";

      if (!Array.isArray(modelos) || modelos.length === 0) {
        lista.innerHTML = "<p>Nenhuma modelo disponível</p>";
        return;
      }

      modelos.forEach(modelo => {
        const card = document.createElement("div");
        card.className = "modelo-card";

        card.innerHTML = `
          <img src="${modelo.avatar || "/assets/avatar.png"}" alt="${modelo.nome_exibicao || "Modelo"}">
        `;

        // 🔹 Clique no card
card.onclick = () => {
  window.location.href = `perfil.html?modelo_id=${id}`; // perfil público
};
        lista.appendChild(card);
      });
    })
    .catch(err => {
      console.error("Erro ao carregar o feed:", err);
      lista.innerHTML = "<p>Erro ao carregar o feed.</p>";
    });
});

