document.addEventListener("DOMContentLoaded", () => {
  const btnVip = document.getElementById("btnVip");

  if (!btnVip) {
    console.error("❌ Botão VIP não encontrado");
    return;
  }

  console.log("✅ Botão VIP encontrado");

 btnVip.addEventListener("click", async () => {
  if (!modeloAtualId) {
    alert("Modelo não identificada");
    return;
  }

  const res = await fetch("/api/vip/assinatura", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({
      modelo_id: modeloAtualId
    })
  });

  const data = await res.json();
  if (data.init_point) {
    window.location.href = data.init_point;
  }
   else {
        alert("Erro ao iniciar assinatura VIP");
      };
});
});