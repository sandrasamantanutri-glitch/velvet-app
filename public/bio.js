document.addEventListener("DOMContentLoaded", () => {

  const btnEditarBio   = document.getElementById("btnEditarBio");
  const popupBio       = document.getElementById("popupBio");
  const btnSalvarBio   = document.getElementById("btnSalvarBio");
  const btnFecharPopup = document.getElementById("btnFecharPopup");
  const bioInput       = document.getElementById("bioInput");
  const bioText        = document.getElementById("profileBio");

  if (!btnEditarBio || !popupBio) {
    console.warn("BIO: elementos não encontrados");
    return;
  }

  // ABRIR POPUP
  btnEditarBio.addEventListener("click", () => {
    bioInput.value = bioText.textContent.trim();
    popupBio.classList.remove("hidden");
  });

  // FECHAR POPUP
  btnFecharPopup.addEventListener("click", () => {
    popupBio.classList.add("hidden");
  });

  // SALVAR BIO
  btnSalvarBio.addEventListener("click", () => {
    const novaBio = bioInput.value.trim();
    if (!novaBio) return alert("A bio não pode estar vazia");

    const modelo = localStorage.getItem("creatorName");
    if (!modelo) return alert("Modelo não identificada");

    fetch("/saveBio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelo, bio: novaBio })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        bioText.innerHTML = novaBio.replace(/\n/g, "<br>");
        popupBio.classList.add("hidden");
      } else {
        alert("Erro ao salvar bio");
      }
    })
    .catch(err => {
      console.error(err);
      alert("Erro de servidor");
    });
  });

});
