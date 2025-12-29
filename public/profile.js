// ===============================
// AUTH GUARD
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token) {
  window.location.href = "/index.html";
  throw new Error("Sem token");
}


function logout() {
  localStorage.clear();
  window.location.href = "/index.html";
}
const modo = role === "cliente" ? "publico" : "privado";

// ===============================
// ELEMENTOS DO PERFIL
// ===============================
let modelo_id = localStorage.getItem("modelo_id");

// 🔒 Guard APENAS para perfil público
if (modo === "publico" && (!modelo_id || modelo_id === "undefined")) {
  alert("Modelo não identificada.");
  window.location.href = "/clientHome.html";
  throw new Error("modelo_id ausente no perfil público");
}

const avatarImg  = document.getElementById("profileAvatar");
const capaImg    = document.getElementById("profileCapa");
const nomeEl     = document.getElementById("profileName");
const profileBio = document.getElementById("profileBio");
const inputAvatar = document.getElementById("inputAvatar");
const inputCapa   = document.getElementById("inputCapa");
const inputMedia  = document.getElementById("inputMedia");
const listaMidias = document.getElementById("listaMidias");
const btnChat = document.getElementById("btnChat");
const btnVip  = document.getElementById("btnVip");
const btnSalvarBio = document.getElementById("btnSalvarBio");
const bioInput     = document.getElementById("bioInput");

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  aplicarRoleNoBody();
  iniciarPerfil();
  iniciarUploads();
  iniciarBioPopup();
});

// ===============================
// ROLE VISUAL
// ===============================
function aplicarRoleNoBody() {
  document.body.classList.remove("role-modelo", "role-cliente");
  if (role === "modelo") document.body.classList.add("role-modelo");
  if (role === "cliente") document.body.classList.add("role-cliente");
}

// ===============================
// PERFIL
// ===============================
function iniciarPerfil() {
  if (modo === "privado") {
    carregarPerfil();
    carregarFeed();
  }

  if (modo === "publico") {
    carregarPerfilPublico();
    carregarFeedPublico();
  }
}

async function carregarPerfil() {
  const res = await fetch("/api/modelo/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const modelo = await res.json();
  localStorage.setItem("modelo_id", modelo.id);
  modelo_id = modelo.id;

  aplicarPerfilNoDOM(modelo);
}

async function carregarPerfilPublico() {
  const res = await fetch(`/api/modelo/publico/${modelo_id}`, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const modelo = await res.json();
  localStorage.setItem("modelo_id", modelo.id);
  modelo_id = modelo.id;

  aplicarPerfilNoDOM(modelo);

  // 🔐 VERIFICAR VIP (persistente)
  const vipRes = await fetch(`/api/vip/status/${modelo_id}`, {
    headers: { Authorization: "Bearer " + token }
  });

  if (vipRes.ok) {
    const vipData = await vipRes.json();
    if (vipData.vip && btnVip) {
      btnVip.textContent = "VIP ativo 💜";
      btnVip.disabled = true;
    }
  }
}

// ===============================
// CHAT
// ===============================
btnChat?.addEventListener("click", () => {
  localStorage.setItem("modelo_id", modelo_id);
  window.location.href = "/chatcliente.html";
});


// ===============================
// VIP
// ===============================
btnVip?.addEventListener("click", async () => {
  if (!modelo_id) {
    alert("Modelo não identificada");
    return;
  }

  const res = await fetch("/api/vip/ativar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ modelo_id })
  });

  const data = await res.json();

  if (data.success) {
    btnVip.textContent = "VIP ativo 💜";
    btnVip.disabled = true;
    alert("VIP ativado com sucesso!");
  } else {
    alert(data.error || "Erro ao ativar VIP");
  }
});

// ===============================
// FEED
// ===============================
function carregarFeed() {
  if (!listaMidias) return;

  fetch("/api/feed/me", {
    headers: { Authorization: "Bearer " + token }
  })
    .then(r => r.json())
    .then(feed => {
      if (!Array.isArray(feed)) return;
      listaMidias.innerHTML = "";
      feed.forEach(item => adicionarMidia(item.url));
    });
}

function carregarFeedPublico() {
  if (!listaMidias) return;

  fetch(`/api/modelo/${modelo_id}/feed`, {
    headers: { Authorization: "Bearer " + token }
  })
    .then(r => r.json())
    .then(feed => {
      if (!Array.isArray(feed)) return;
      listaMidias.innerHTML = "";
      feed.forEach(item => adicionarMidia(item.url));
    });
}

// ===============================
// BIO
// ===============================
function iniciarBioPopup() {
  const btnEditarBio = document.getElementById("btnEditarBio");
  const popupBio = document.getElementById("popupBio");
  const btnFecharPopup = document.getElementById("btnFecharPopup");

  if (!btnEditarBio || !popupBio) return;

  btnEditarBio.onclick = () => {
    bioInput.value = profileBio.textContent.trim();
    popupBio.classList.remove("hidden");
  };

  btnFecharPopup.onclick = () => popupBio.classList.add("hidden");
}

// ===============================
// UPLOAD AVATAR
// ===============================
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

// ===============================
// UPLOAD CAPA
// ===============================
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
    }
  });

btnSalvarBio?.addEventListener("click", async () => {
  const bio = bioInput.value.trim();
  if (!bio) return;

  const res = await fetch("/api/modelo/bio", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ bio })
  });

  if (res.ok) {
    profileBio.textContent = bio;

    // ✅ FECHA O POPUP
    const popupBio = document.getElementById("popupBio");
    popupBio.classList.add("hidden");
  } else {
    alert("Erro ao salvar bio");
  }
});


// ===============================
// UPLOADS
// ===============================
function iniciarUploads() {
  inputMedia?.addEventListener("change", async () => {
    const file = inputMedia.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("midia", file);

    const res = await fetch("/uploadMidia", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: fd
    });

    const data = await res.json();
    if (data.url) adicionarMidia(data.url);
  });
}

// ===============================
// MIDIA
// ===============================
function adicionarMidia(url) {
  const card = document.createElement("div");
  card.className = "midiaCard";

  const ext = url.split(".").pop().toLowerCase();
  const el = ["mp4","webm","ogg"].includes(ext)
    ? Object.assign(document.createElement("video"), { src: url, controls: true })
    : Object.assign(document.createElement("img"), { src: url });

  el.className = "midiaThumb";
  card.appendChild(el);
  listaMidias.appendChild(card);
}

// ===============================
// DOM PERFIL
// ===============================
function aplicarPerfilNoDOM(modelo) {
  nomeEl.textContent = modelo.nome;
  profileBio.textContent = modelo.bio || "";
  if (modelo.avatar) avatarImg.src = modelo.avatar;
  if (modelo.capa) capaImg.src = modelo.capa;
}
