// ===============================
// PROFILE.JS — LIMPO (JWT ONLY)
// ===============================

// 🔐 PROTEÇÃO DE ACESSO
(function () {
  const token = localStorage.getItem("auth_token");
  const role = localStorage.getItem("user_role");

  if (!token || role !== "modelo") {
    localStorage.clear();
    window.location.href = "/index.html";
  }
})();

const token = localStorage.getItem("auth_token");

// ===============================
// ELEMENTOS
// ===============================
const avatarImg = document.getElementById("profileAvatar");
const capaImg   = document.getElementById("profileCapa");
const nomeEl    = document.getElementById("profileNome");

const inputAvatar = document.getElementById("inputAvatar");
const inputCapa   = document.getElementById("inputCapa");
const inputMedia  = document.getElementById("inputMedia");
const listaMidias = document.getElementById("listaMidias");

const btnSalvarBio = document.getElementById("btnSalvarBio");
const bioInput = document.getElementById("bioInput");
const profileBio = document.getElementById("profileBio");

if (btnSalvarBio) {
  btnSalvarBio.addEventListener("click", async () => {
    const novaBio = bioInput.value.trim();

    const res = await fetch("/api/modelo/bio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ bio: novaBio })
    });

    if (res.ok) {
      profileBio.textContent = novaBio;
      document.getElementById("popupBio").classList.add("hidden");
    } else {
      alert("Erro ao salvar bio");
    }
  });
}

// ===============================
// PERFIL BÁSICO
// ===============================
function initPerfil() {
  fetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  })
    .then(r => r.json())
    .then(user => {
        document.body.classList.remove("role-modelo", "role-cliente");
        document.body.classList.add(`role-${user.role}`);
        
      if (avatarImg) {
        avatarImg.src = (user.avatar || "/assets/avatarDefault.png") + "?v=" + Date.now();
      }
      if (capaImg) {
        capaImg.src = (user.capa || "/assets/capaDefault.jpg") + "?v=" + Date.now();
      }
      if (nomeEl) {
        nomeEl.textContent = "Modelo";
      }
      if (profileBio) {
  profileBio.textContent = user.bio || "";
}
    })
    .catch(err => console.error("Erro perfil:", err));
}
// ===============================
// FEED (LISTAR)
// ===============================
function carregarFeed() {
  if (!listaMidias) return;

  fetch("/api/feed/me", {
    headers: { Authorization: "Bearer " + token }
  })
    .then(r => r.json())
    .then(feed => {
      listaMidias.innerHTML = "";
      feed.forEach(item => adicionarMidia(item.url));
    })
    .catch(err => console.error("Erro feed:", err));
}

// ===============================
// FEED (UPLOAD)
// ===============================
if (inputMedia) {
  inputMedia.addEventListener("change", async () => {
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
    if (data.url) {
      adicionarMidia(data.url);
      inputMedia.value = "";
    }
  });
}

// ===============================
// ADICIONAR MÍDIA NA TELA
// ===============================
function adicionarMidia(url) {
  const card = document.createElement("div");
  card.className = "midiaCard";

  const ext = url.split(".").pop().toLowerCase();
  let el;

  if (["mp4", "webm", "ogg"].includes(ext)) {
    el = document.createElement("video");
    el.src = url;
    el.controls = true;
  } else {
    el = document.createElement("img");
    el.src = url;
  }

  el.className = "midiaThumb";
  el.addEventListener("click", () => abrirMidia(url));

  card.appendChild(el);
  listaMidias.appendChild(card);
}

// ===============================
// MODAL DE MÍDIA
// ===============================
function abrirMidia(url) {
  const modal = document.getElementById("modalMidia");
  const img   = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  img.style.display = "none";
  video.style.display = "none";
  video.pause();

  const ext = url.split(".").pop().toLowerCase();
  if (["mp4", "webm", "ogg"].includes(ext)) {
    video.src = url;
    video.style.display = "block";
    video.play();
  } else {
    img.src = url;
    img.style.display = "block";
  }
}

document.getElementById("fecharModal")?.addEventListener("click", () => {
  document.getElementById("modalMidia").classList.add("hidden");
  document.body.style.overflow = "";
});

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  initPerfil();
  carregarFeed();
});

document.addEventListener("trocar-avatar", () => {
  if (inputAvatar) inputAvatar.click();
});

document.addEventListener("trocar-capa", () => {
  if (inputCapa) inputCapa.click();
});


if (inputAvatar) {
  inputAvatar.addEventListener("change", async () => {
    const file = inputAvatar.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("avatar", file);

    const res = await fetch("/uploadAvatar", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: fd
    });

    if (res.ok) {
      avatarImg.src = URL.createObjectURL(file);
    } else {
      alert("Erro ao atualizar avatar");
    }
  });
}
if (inputCapa) {
  inputCapa.addEventListener("change", async () => {
    const file = inputCapa.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("capa", file);

    const res = await fetch("/uploadCapa", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: fd
    });

    if (res.ok) {
      capaImg.src = URL.createObjectURL(file);
    } else {
      alert("Erro ao atualizar capa");
    }
  });
}

