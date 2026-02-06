function getUsuarioLogado() {
  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload; // { id, role, ... }
  } catch {
    return null;
  }
}

const modelo_id = localStorage.getItem("modelo_id");

// ===============================
// 👩‍💼 ÁREA DA MODELO – VIP COUNT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  carregarVipCountModelo();
    const usuario = getUsuarioLogado();

  if (!usuario) {
    console.log("Visitante não logado");
    return;
  }

  console.log("Usuário logado:", usuario);

  // 🔥 decide o que carregar
  if (usuario.role === "modelo") {
    carregarAreaModelo(usuario.id);
  }

  if (usuario.role === "cliente") {
    carregarAreaCliente(usuario.id);
  }
});

async function carregarVipCountModelo() {
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

async function carregarAreaModelo(user_id) {
  const res = await fetch("/api/modelo/me", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) return;

  const modelo = await res.json();

  // exemplo:
  document.getElementById("profileName").textContent = modelo.nome;
  document.getElementById("profileAvatar").src = modelo.avatar;
  document.getElementById("profileCapa").src = modelo.capa;

  // VIP count
  carregarVipCountModelo(modelo.id);
}

async function carregarAreaCliente(user_id) {
  const res = await fetch("/api/cliente/me", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) return;

  const cliente = await res.json();

  console.log("Cliente logado:", cliente);
}

