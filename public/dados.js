document.addEventListener("DOMContentLoaded", () => {

  const botoes = document.querySelectorAll(".btn-perfil-completo");

  if (!botoes.length) {
    console.log("Nenhum botão de perfil encontrado.");
    return;
  }

  botoes.forEach(btn => {

    btn.addEventListener("click", (e) => {
      e.preventDefault();

      const modeloId = Number(btn.dataset.modeloId);

      if (!modeloId) {
        console.error("modelo_id inválido:", btn.dataset.modeloId);
        return;
      }

      window.location.href = `/perfil.html?modelo_id=${modeloId}`;
    });

  });

});
