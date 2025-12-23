Authorization: "Bearer " + localStorage.removeItem("token");

fetch("/api/rota-protegida", {
  headers: {
    "Authorization": "Bearer " + token
  }
});

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "/";
}


(function () {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || role !== "cliente") {
    localStorage.clear();
    window.location.replace("/index.html");
    return;
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  const lista = document.getElementById("listaModelos");
  const token = localStorage.getItem("token");

  if (!lista) {
    console.error("listaModelos não encontrada");
    return;
  }

  fetch("/api/modelos", {
    headers: {
      Authorization: "Bearer " + token
    }
  })
    .then(res => {
      if (!res.ok) throw new Error("Erro ao carregar feed");
      return res.json();
    })
    .then(modelos => {
      console.log("📥 Modelos:", modelos);

      lista.innerHTML = "";

      if (!modelos || modelos.length === 0) {
        lista.innerHTML = "<p>Nenhuma modelo disponível</p>";
        return;
      }

      modelos.forEach(modelo => {
        const card = document.createElement("div");
        card.className = "modelItem";

        card.innerHTML = `
          <img
            src="${modelo.avatar || "/assets/avatarDefault.png"}"
            alt="${modelo.nome_exibicao || modelo.nome}">
        `;

        card.addEventListener("click", () => {
          localStorage.setItem(
            "modeloPerfil",
            modelo.nome_exibicao || modelo.nome
          );
          window.location.href = "profile.html";
        });

        lista.appendChild(card);
      });
    })
    .catch(err => {
      console.error("Erro feed:", err);
      lista.innerHTML = "<p>Erro ao carregar modelos</p>";
    });
});
