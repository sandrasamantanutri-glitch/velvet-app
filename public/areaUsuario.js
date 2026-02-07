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


async function carregarResumoModelo() {
  const elHoje = document.getElementById("areaUsuarioGanhosHoje");
  const elMes  = document.getElementById("areaUsuarioGanhosMes");

  if (!elHoje && !elMes) return;

  try {
    const res = await fetch("/api/modelo/financeiro", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) return;

    const data = await res.json();

    const ganhosHoje =
      Number(data.hoje.midias || 0) +
      Number(data.hoje.assinaturas || 0);

    const ganhosMes =
      Number(data.mes.midias || 0) +
      Number(data.mes.assinaturas || 0);

    if (elHoje) {
      elHoje.innerText = `R$ ${ganhosHoje.toFixed(2).replace(".", ",")}`;
    }

    if (elMes) {
      elMes.innerText = `R$ ${ganhosMes.toFixed(2).replace(".", ",")}`;
    }

  } catch (err) {
    console.error("Erro carregarResumoModelo:", err);
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

  // ===============================
  // 📸 AVATAR / CAPA
  // ===============================
  const avatar = document.getElementById("profileAvatar");
  if (avatar && modelo.avatar) avatar.src = modelo.avatar;

  const capa = document.getElementById("profileCapa");
  if (capa && modelo.capa) capa.src = modelo.capa;

  // ===============================
  // 👤 NOME VISUAL (só onde existir)
  // ===============================
  const profileName = document.getElementById("profileName");
  if (profileName) {
    profileName.textContent = modelo.nome_exibicao || "";
  }

  // ===============================
  // 📝 FORMULÁRIO (só no dados.html)
  // ===============================
  const form = document.getElementById("formDadosModelo");
  if (form) {
    form.nome_exibicao.value = modelo.nome_exibicao || "";
    form.instagram.value    = modelo.instagram || "";
    form.tiktok.value       = modelo.tiktok || "";
    form.local.value        = modelo.local || "";
    form.bio.value          = modelo.bio || "";
  }

  // ===============================
  // 👑 VIP COUNT
  // ===============================
  if (typeof carregarVipCountModelo === "function") {
    carregarVipCountModelo(modelo.user_id ?? modelo.id);
  }
}


function normalizarInstagram(username) {
  if (!username) return null;

  return username
    .trim()
    .replace(/^@/, "") // remove @ do início
    .replace(/\s+/g, ""); // remove espaços
}

