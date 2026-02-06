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

 const token = localStorage.getItem("token");
// ===============================
// 👩‍💼 ÁREA DA MODELO – VIP COUNT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
carregarResumoModelo();
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

async function carregarVipCountModelo(modelo_id) {
  console.log("🔥 carregarVipCountModelo chamada com:", modelo_id);

  const token = localStorage.getItem("token");
  console.log("🔐 token existe?", !!token);
  if (!token || !modelo_id) {
    console.warn("VIP count: dados insuficientes");
    return;
  }

  try {
    const res = await fetch(`/api/modelo/${modelo_id}/vip-count`, {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) return;

    const { total } = await res.json();

    const el = document.getElementById("vip-total");
    if (el) el.textContent = total;

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

// ===============================
// 📸 UPLOAD CAPA / AVATAR
// ===============================

const btnCapa = document.getElementById("btnCapa");
const btnAvatar = document.getElementById("btnAvatar");
const inputCapa = document.getElementById("inputCapa");
const inputAvatar = document.getElementById("inputAvatar");
const capaImg    = document.getElementById("profileCapa");
const avatarImg  = document.getElementById("profileAvatar");

// abrir seletor
btnCapa?.addEventListener("click", () => inputCapa.click());
btnAvatar?.addEventListener("click", () => inputAvatar.click());

// upload CAPA
inputCapa?.addEventListener("change", async () => {
  const file = inputCapa.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("capa", file);

  const res = await fetch("/uploadCapa", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    },
    body: fd
  });

  const data = await res.json();

  if (data.url) {
    capaImg.src = data.url; // 🔥 atualiza na hora
  } else {
    alert("Erro ao atualizar capa");
  }
});

// upload AVATAR
inputAvatar?.addEventListener("change", async () => {
  const file = inputAvatar.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("avatar", file);

  const res = await fetch("/uploadAvatar", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token
    },
    body: fd
  });

  const data = await res.json();

  if (data.url) {
    avatarImg.src = data.url; // 🔥 atualiza na hora
  } else {
    alert("Erro ao atualizar avatar");
  }
});

async function carregarResumoModelo() {
  try {
    const res = await fetch("/api/modelo/financeiro", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      console.error("Erro ao carregar ganhos da modelo");
      return;
    }

    const data = await res.json();

    const ganhosHoje =
      Number(data.hoje.midias || 0) +
      Number(data.hoje.assinaturas || 0);

    const ganhosMes =
      Number(data.mes.midias || 0) +
      Number(data.mes.assinaturas || 0);

    document.getElementById("areaUsuarioGanhosHoje").innerText =
      `R$ ${ganhosHoje.toFixed(2).replace(".", ",")}`;

    document.getElementById("areaUsuarioGanhosMes").innerText =
      `R$ ${ganhosMes.toFixed(2).replace(".", ",")}`;

  } catch (err) {
    console.error("Erro carregarResumoModelo:", err);
  }
}

