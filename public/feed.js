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

function getFeedText(key, fallback = "") {
  if (typeof t === "function") {
    return t(key);
  }
  return fallback;
}

function renderListaModelos(modelos) {
  const lista = document.getElementById("listaModelos");

  if (!lista) {
    console.error("❌ listaModelos não encontrada");
    return;
  }

  lista.innerHTML = "";

  if (!Array.isArray(modelos) || modelos.length === 0) {
    lista.innerHTML = `<p>${getFeedText("feed.empty", "Nenhuma modelo disponível")}</p>`;
    return;
  }

  modelos.forEach(modelo => {
    const card = document.createElement("div");
    card.className = "modelo-card";

    let avatarIcon = modelo.avatar || "/assets/avatar.png";

    if (modelo.top1) {
      avatarIcon = "/assets/top1.png";
    } else if (modelo.top2) {
      avatarIcon = "/assets/top2.png";
    } else if (modelo.top3) {
      avatarIcon = "/assets/top3.png";
    } else if (modelo.is_new) {
      avatarIcon = "/assets/new.png";
    }

    card.innerHTML = `
      <div class="modelo-foto">
        <img
          src="${modelo.avatar || "/assets/avatar.png"}"
          class="foto-principal"
          alt="${modelo.nome_exibicao || getFeedText("feed.modelo", "Modelo")}"
        >
      </div>

      <div class="modelo-info">
        <div class="modelo-header">
          <img
            src="${avatarIcon}"
            class="avatar-mini"
            alt=""
          >

          <span class="modelo-nome">
            ${modelo.nome_exibicao || ""}
          </span>
        </div>

        <div class="modelo-bio">
          ${modelo.bio || ""}
        </div>
      </div>
    `;

    card.onclick = () => {
      const modeloId = Number(modelo.modelo_id);
      if (!modeloId) return;

      window.location.href = `perfil.html?modelo_id=${modeloId}`;
    };

    lista.appendChild(card);
  });
}

window.renderFeed = async function () {
  const lista = document.getElementById("listaModelos");

  if (!lista) {
    console.error("❌ listaModelos não encontrada");
    return;
  }

  try {
    const res = await fetch("/api/modelos", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      throw new Error(getFeedText("feed.fetchError", "Erro ao buscar modelos"));
    }

    const modelos = await res.json();
    renderListaModelos(modelos);
  } catch (err) {
    console.error("Erro ao carregar o feed:", err);
    lista.innerHTML = `<p>${getFeedText("feed.error", "Erro ao carregar o feed.")}</p>`;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  window.renderFeed();
});