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

  // 🔕 não é página de feed → sai sem erro
  if (!lista) {
    console.log("ℹ️ feed.js carregado fora do feed");
    return;
  }

  const token = localStorage.getItem("token");

  // 🔒 se não tiver token, apenas mostra feed vazio ou CTA
  if (!token) {
    lista.innerHTML = "<p>Entre para ver as modelos disponíveis.</p>";
    return;
  }

  fetch("/api/feed/modelos", {
    headers: {
      Authorization: "Bearer " + token
    }
  })
    .then(res => {
      if (!res.ok) {
        throw new Error("Erro ao carregar feed de modelos");
      }
      return res.json();
    })
    .then(modelos => {
      console.log("📥 Modelos recebidos:", modelos);

      lista.innerHTML = "";

      if (!Array.isArray(modelos) || modelos.length === 0) {
        lista.innerHTML = "<p>Nenhuma modelo disponível</p>";
        return;
      }

      modelos.forEach(modelo => {
        const card = document.createElement("div");
        card.className = "modelItem";

        card.innerHTML = `
          <img
            src="${modelo.avatar || "/assets/avatar.png"}"
            alt="${modelo.nome || "Modelo"}">
        `;

        card.addEventListener("click", () => {
          const modeloId = modelo.id ?? modelo.user_id;

          if (!modeloId) {
            console.error("❌ Modelo sem id:", modelo);
            alert("Erro ao abrir perfil da modelo.");
            return;
          }

          localStorage.setItem("modelo_id", modeloId.toString());
          window.location.href = `index.html?id=${modeloId}`;
        });

        lista.appendChild(card);
      });
    })
    .catch(err => {
      console.error("Erro ao carregar feed de modelos:", err);
      lista.innerHTML =
        "<p>Não foi possível carregar o feed no momento.</p>";
    });
});
