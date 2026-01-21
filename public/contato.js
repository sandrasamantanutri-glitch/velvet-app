const form = document.getElementById("contatoForm");
const status = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  status.textContent = "Enviando...";
  status.style.color = "#7B2CFF";

  const data = Object.fromEntries(new FormData(form));

  try {
    const response = await fetch("/api/contato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error();
    status.className = "status success";
    status.textContent = "Mensagem enviada com sucesso! Em breve vamos entrar em contato!";

    form.reset();

  } catch {
    status.className = "status error";
    status.textContent = "Erro ao enviar mensagem!! Tente novamente ou envie um email direto para: contato@velvet.lat";
  }
});




