const form = document.getElementById("contatoForm");
const status = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  status.className = "status";
  status.textContent = t("contato.contact_sending");
  status.style.color = "#7B2CFF";

  const formData = new FormData(form);

  try {
    const response = await fetch("/api/contato", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error();

    status.className = "status success";
    status.textContent = t("contato.contact_success");
    form.reset();
  } catch {
    status.className = "status error";
    status.textContent = t("contato.contact_error");
  }
});




