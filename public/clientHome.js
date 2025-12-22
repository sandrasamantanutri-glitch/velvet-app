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



// =========================================================
// CLIENT HOME — FEED DE MODELOS (FETCH VERSION)
// =========================================================

console.log("clientHome.js carregado");

document.addEventListener("DOMContentLoaded", () => {
    const lista = document.getElementById("listaModelos");

    if (!lista) {
        console.error("listaModelos não encontrada");
        return;
    }

    fetch("/getModelos", {
  headers: {
    Authorization: "Bearer " + localStorage.getItem("token")
  }
})
  .then(res => {
    if (!res.ok) {
      throw new Error("Não autorizado ou erro no servidor");
    }
    return res.json();
  })
  .then(data => {
    console.log("📥 Modelos recebidas:", data);

    lista.innerHTML = "";

    if (!data.modelos || data.modelos.length === 0) {
      lista.innerHTML = "<p>Nenhuma modelo cadastrada</p>";
      return;
    }

    data.modelos.forEach(modelo => {
      const card = document.createElement("div");
      card.className = "modelItem";

      card.innerHTML = `
        <img 
          src="${modelo.avatar || "/assets/avatarDefault.png"}"
          alt="${modelo.nome}">
      `;

      card.addEventListener("click", () => {
        console.log("FEED CLIQUE → modelo:", modelo.nome);
        localStorage.setItem("modeloPerfil", modelo.nome);
        window.location.href = "profile.html";
      });

      lista.appendChild(card);
    });
  })
  .catch(err => {
    console.error("Erro ao carregar modelos:", err);
    lista.innerHTML = "<p>Erro ao carregar modelos</p>";
  });
})
