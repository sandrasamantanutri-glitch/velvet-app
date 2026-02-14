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

      if (!modelos.length) {
        lista.innerHTML = "<p>Nenhuma modelo disponível</p>";
        return;
      }

      modelos.forEach(modelo => {
        const card = document.createElement("div");
        card.className = "modelo-card";

        card.innerHTML = `
          <img src="${modelo.avatar || "/assets/avatar.png"}">
        `;

card.onclick = () => {
  const modeloIdCard = Number(modelo.id);
  if (!modeloIdCard) return;

  const role = localStorage.getItem("role");
  const modeloLogado = Number(localStorage.getItem("modelo_id"));

  // 👑 Se for modelo e for o próprio perfil
  if (role === "modelo" && modeloLogado === modeloIdCard) {
    window.location.href = "perfil.html";
    return;
  }

  // 👀 Qualquer outro caso
  window.location.href = `perfil.html?id=${modeloIdCard}`;
};

        lista.appendChild(card);
      });
    })
    .catch(() => {
      lista.innerHTML =
        "<p>Erro ao carregar o feed.</p>";
    });
});
