window.socket = io();

// ===============================
// 👩‍💼 ÁREA DA MODELO – VIP COUNT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  carregarVipCountModelo();
});

async function carregarVipCountModelo() {
  const token = localStorage.getItem("token");
  const modelo_id = localStorage.getItem("modelo_id");

  if (!token || !modelo_id) {
    console.warn("Modelo não autenticada");
    return;
  }

  try {
    const res = await fetch(`/api/modelo/${modelo_id}/vip-count`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) {
      console.warn("Não foi possível carregar VIP count");
      return;
    }

    const { total } = await res.json();

    const el = document.getElementById("vip-total");
    if (el) {
      el.textContent = total;
    }

  } catch (err) {
    console.error("Erro ao carregar VIP count:", err);
  }
}
