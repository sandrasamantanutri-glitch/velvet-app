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
  <div class="modelo-avatar-wrapper">
    <img 
      src="${modelo.avatar || "/assets/avatar.png"}" 
      class="modelo-avatar"
    >

    ${
      modelo.top1
        ? `<img src="/assets/top1.png" class="badge-top1">`
        : ""
    }

     ${
      modelo.is_new
      ? `<img src="/assets/new.png" class="badge-new">`
        : ""
    }
  </div>
`;

        // 🔥 ID CORRETO
        card.onclick = () => {
          const modeloId = Number(modelo.modelo_id);
          if (!modeloId) return;

          window.location.href = `perfil.html?modelo_id=${modeloId}`;
        };

        lista.appendChild(card);
      });
    })
    .catch(err => {
      console.error("Erro ao carregar o feed:", err);
      lista.innerHTML = "<p>Erro ao carregar o feed.</p>";
    });
});
