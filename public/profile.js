//REFATURADO

//ELEMENTOS PERFIL

const avatarImg  = document.getElementById("profileAvatar");
const capaImg    = document.getElementById("profileCapa");
const nomeEl     = document.getElementById("profileName");
const profileBio = document.getElementById("profileBio");


//ELEMENTOS BIO
const btnSalvarBio = document.getElementById("btnSalvarBio");
const bioInput = document.getElementById("bioInput");

//ELEMENTOS FEED
const inputAvatar = document.getElementById("inputAvatar");
const inputCapa   = document.getElementById("inputCapa");
const inputMedia  = document.getElementById("inputMedia");
const listaMidias = document.getElementById("listaMidias");
// ===============================
// PERFIL BASE (FONTE DA VERDADE)
// ===============================
async function carregarPerfil() {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch("/api/modelo/me", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) {
      alert("Acesso negado");
      window.location.href = "/";
      return;
    }

    const modelo = await res.json();
    aplicarPerfilNoDOM(modelo);

  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
  }
}

//CARREGA PERFIL/FEED

document.addEventListener("DOMContentLoaded", () => {
  carregarPerfil();
  carregarFeed();
});

//LOGOUT
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "/";
}

//CARREGAR FEED
function carregarFeed() {
  if (!listaMidias) return;

  fetch("/api/feed/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("token") }
  })
    .then(r => r.json())
    .then(feed => {
      listaMidias.innerHTML = "";
      feed.forEach(item => adicionarMidia(item.url));
    })
    .catch(err => console.error("Erro feed:", err));
}

//UPLOAD MIDIAS
if (inputMedia) {
  inputMedia.addEventListener("change", async () => {
    const file = inputMedia.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("midia", file);

    const res = await fetch("/uploadMidia", {
      method: "POST",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
      body: fd
    });

    const data = await res.json();
    if (data.url) {
      adicionarMidia(data.url);
      inputMedia.value = "";
    }
  });
}

//ADICIONAR MIDIA
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

  // 🔴 BOTÃO EXCLUIR (SÓ MODELO)
  const btnExcluir = document.createElement("button");
  btnExcluir.className = "btnExcluirMidia only-modelo";
  btnExcluir.textContent = "Excluir";

  btnExcluir.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!confirm("Deseja excluir esta mídia?")) return;

    const res = await fetch("/api/midia/excluir", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({ url })
    });

    if (res.ok) {
      card.remove();
    } else {
      alert("Erro ao excluir mídia");
    }
  });

  card.appendChild(el);
  card.appendChild(btnExcluir);
  listaMidias.appendChild(card);
}

// ===============================
// MODAL DE MÍDIA
// ===============================
function abrirMidia(url) {
  const modal = document.getElementById("modalMidia");
  const img   = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

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
document.getElementById("fecharModal")?.addEventListener("click", fecharModal);

function fecharModal() {
  const modal = document.getElementById("modalMidia");
  const video = document.getElementById("modalVideo");

  modal.classList.add("hidden");
  document.body.style.overflow = "";

  video.pause();
  video.src = "";
}

document.getElementById("modalMidia")?.addEventListener("click", (e) => {
  if (e.target.id === "modalMidia") {
    fecharModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModal();
});
// ===============================
// INITS DOM
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem("role"); // "modelo" ou "cliente"

  document.body.classList.remove("role-modelo", "role-cliente");

  if (role === "modelo") {
    document.body.classList.add("role-modelo");
  }

  if (role === "cliente") {
    document.body.classList.add("role-cliente");
  }
});

function aplicarPerfilNoDOM(modelo) {
  if (nomeEl) nomeEl.textContent = modelo.nome;
  if (profileBio) profileBio.textContent = modelo.bio || "";

  if (avatarImg && modelo.avatar) {
    avatarImg.src = modelo.avatar;
  }

  if (capaImg && modelo.capa) {
    capaImg.src = modelo.capa; // 🔥 AQUI ESTAVA O ERRO
  }
}


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
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
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
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
      body: fd
    });

    if (res.ok) {
      capaImg.src = URL.createObjectURL(file);
    } else {
      alert("Erro ao atualizar capa");
    }
  });
}