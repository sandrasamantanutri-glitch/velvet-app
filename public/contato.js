const form = document.getElementById("contatoForm");
const status = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  status.textContent = "Enviando...";
  status.style.color = "#cfc3ff";

  const data = Object.fromEntries(new FormData(form));

  try {
    // 🔁 depois você liga isso no backend
    console.log("Contato enviado:", data);

    status.textContent = "Mensagem enviada com sucesso 💜";
    status.style.color = "#7bffb3";
    form.reset();

  } catch (err) {
    status.textContent = "Erro ao enviar mensagem.";
    status.style.color = "#ff7b7b";
  }
});
