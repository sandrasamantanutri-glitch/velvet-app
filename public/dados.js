document.addEventListener("DOMContentLoaded", () => {

  const botoes = document.querySelectorAll(".btn-perfil-completo");

  if (!botoes.length) {
    console.log("Nenhum botão de perfil encontrado.");
    return;
  }

  botoes.forEach(btn => {

    btn.addEventListener("click", (e) => {
      e.preventDefault();

      const modelo = Number(btn.dataset.modelo.id);

      if (!modelo.id) {
        console.error("modelo_id inválido:", btn.dataset.model.id);
        return;
      }

      window.location.href = `/perfil.html?modelo_id=${modelo.id}`;
    });

  });

});
