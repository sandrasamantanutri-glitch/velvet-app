document.addEventListener("DOMContentLoaded", async () => {

  const token = localStorage.getItem("token");
  if (!token) return;

  const res = await fetch("/api/modelo/me", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const modelo = await res.json(); // 👈 PEGAR O OBJETO

  const modelo_id = modelo.id; // 👈 PEGAR O ID CERTO (modelos.id)

  const btn = document.querySelector(".btn-perfil-completo");
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `/perfil.html?modelo_id=${modelo_id}`;
  });

});
