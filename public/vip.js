fetch("/api/rota-protegida", {
  headers: {
    "Authorization": "Bearer " + localStorage.removeItem("token")
  }
});

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "/";
}

document.addEventListener("DOMContentLoaded", () => {
  const btnVip = document.getElementById("btnVip");

  if (!btnVip) {
    console.error("❌ Botão VIP não encontrado");
    return;
  }

  console.log("✅ Botão VIP encontrado");

  btnVip.addEventListener("click", async () => {
    console.log("🌟 Clique no botão VIP");

    const token = localStorage.getItem("token");
    const modeloId = localStorage.getItem("modeloId");

    if (!token) {
      alert("Você precisa estar logado");
      return;
    }

    if (!modeloId) {
      alert("Modelo não identificada");
      return;
    }

    try {
      const res = await fetch("/api/vip/assinatura", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          modelo_id: modeloId
        })
      });

      const data = await res.json();
      console.log("📥 Resposta VIP:", data);

      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert("Erro ao iniciar assinatura VIP");
      }

    } catch (err) {
      console.error("Erro VIP:", err);
      alert("Erro ao processar VIP");
    }
  });
});



