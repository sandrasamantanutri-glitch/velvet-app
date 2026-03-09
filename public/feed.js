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
    console.error("❌ listaModelos não encontrada");
    return;
  }

  fetch("/api/modelos", {
    headers: {
      Authorization: "Bearer " + token
    }
  })
  .then(res => {
    if (!res.ok) throw new Error("Erro ao buscar modelos");
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

  // lógica do ícone no lugar do avatar
  const avatarIcon = modelo.top1
    ? "/assets/top1.png"
    : modelo.is_new
      ? "/assets/new.png"
      : (modelo.avatar || "/assets/avatar.png");

  card.innerHTML = `

    <div class="modelo-foto">

      <img 
        src="${modelo.avatar || "/assets/avatar.png"}"
        class="foto-principal"
      >

    </div>

    <div class="modelo-info">

      <div class="modelo-header">

        <img 
          src="${avatarIcon}"
          class="avatar-mini"
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

  })
  .catch(err => {

    console.error("Erro ao carregar o feed:", err);

    lista.innerHTML = "<p>Erro ao carregar o feed.</p>";

  });

});
