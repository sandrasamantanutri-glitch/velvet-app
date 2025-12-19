const socket = window.socket;

if (!socket) {
  console.error("❌ Socket não disponível no chatmodelo");
}

document.addEventListener("DOMContentLoaded", () => {
  const btnVip = document.getElementById("btnVip");
  if (!btnVip) return;

  btnVip.addEventListener("click", () => {
    const cliente = localStorage.getItem("clientName");
    const modelo  = localStorage.getItem("modeloSelecionado"); 
    // modeloPerfil é o nome da modelo vista no perfil

    if (!cliente || !modelo) {
      alert("Erro: cliente ou modelo não identificados.");
      return;
    }

    fetch("/subscribeVIP", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        cliente,
        modelo
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert("🎉 Agora você é VIP!");
          btnVip.textContent = "✅ VIP Ativo";
          btnVip.disabled = true;
        } else {
          alert("Erro ao assinar VIP.");
        }
      })
      .catch(err => {
        console.error("Erro VIP:", err);
        alert("Erro no servidor.");
      });
  });
});

