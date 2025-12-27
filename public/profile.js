// ===============================
// ELEMENTOS DO PERFIL
// ===============================
const avatarImg  = document.getElementById("profileAvatar");
const capaImg    = document.getElementById("profileCapa");
const nomeEl     = document.getElementById("profileName");
const profileBio = document.getElementById("profileBio");

const inputAvatar = document.getElementById("inputAvatar");
const inputCapa   = document.getElementById("inputCapa");
const inputMedia  = document.getElementById("inputMedia");
const listaMidias = document.getElementById("listaMidias");
const btnChat = document.getElementById("btnChat");
const btnVip = document.getElementById("btnVip");


const btnSalvarBio = document.getElementById("btnSalvarBio");
const bioInput     = document.getElementById("bioInput");

// ===============================
// ESTADO GLOBAL
// ===============================
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const modeloPublico = localStorage.getItem("modeloPerfil");
let modeloIdAtual = null;

let modo = "privado";
if (role === "cliente" && modeloPublico) modo = "publico";

console.log("🧭 PROFILE MODO:", modo, "| role:", role);

// ===============================
// GUARD MODELO PÚBLICO
// ===============================
if (modo === "publico" && !modeloPublico) {
  alert("Modelo não identificada");
  throw new Error("modeloPerfil não encontrado");
}

// ===============================
// INIT PRINCIPAL
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  aplicarRoleNoBody();
  iniciarBioPopup();
  iniciarPerfil();
  iniciarUploads();
  iniciarModalMidia();
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
// PERFIL / FEED
// ===============================
function iniciarPerfil() {
  if (modo === "privado") {
    carregarPerfil();
    carregarFeed();
  }

  if (modo === "publico") {
    carregarPerfilPublico();
    carregarFeedPublico();
    document.getElementById("btnvoltar")?.addEventListener("click", () => {
      localStorage.removeItem("modeloPerfil");
    });
  }
}

async function carregarPerfil() {
  try {
    const res = await fetch("/api/modelo/me", {
      headers: { Authorization: "Bearer " + token }
    });
    const modelo = await res.json();
    aplicarPerfilNoDOM(modelo);
  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
  }
}

async function carregarPerfilPublico() {
  const res = await fetch(`/api/modelo/publico/${modeloPublico}`, {
    headers: { Authorization: "Bearer " + token }
  });

  const modelo = await res.json();

  console.log("🧪 OBJETO MODELO RECEBIDO:", modelo);

  modeloIdAtual = modelo.id;
  console.log("🧩 Modelo carregada:", modeloIdAtual);

  aplicarPerfilNoDOM(modelo); // 🔥 ISSO ESTAVA FALTANDO

  if (btnVip) btnVip.disabled = false;
}

//BTN CHAT

btnChat?.addEventListener("click", () => {
  localStorage.setItem("chatModelo", nomeEl.textContent);
  window.location.href = "/chatcliente.html";
});

if (btnVip) {
  btnVip.addEventListener("click", async () => {
    if (!modeloIdAtual) {
      alert("Modelo não identificada");
      return;
    }

    try {
      const res = await fetch("/api/vip/ativar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ modelo_id: modeloIdAtual })
      });

      const data = await res.json();

      if (data.success) {
        btnVip.textContent = "VIP ativo 💜";
        btnVip.disabled = true;
        alert("VIP ativado com sucesso!");
      } else {
        alert(data.error || "Erro ao ativar VIP");
      }

    } catch (err) {
      console.error("Erro botão VIP:", err);
      alert("Erro de conexão");
    }
  });
}


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
      listaMidias.innerHTML = "";
      feed.forEach(item => adicionarMidia(item.url));
    });
}

function carregarFeedPublico() {
  if (!listaMidias) return;

  fetch(`/api/modelo/${modeloPublico}/feed`, {
    headers: { Authorization: "Bearer " + token }
  })
    .then(r => r.json())
    .then(feed => {
      listaMidias.innerHTML = "";
      feed.forEach(item => adicionarMidia(item.url));
    });
}

// ===============================
// BIO
// ===============================
function iniciarBioPopup() {
  const btnEditarBio   = document.getElementById("btnEditarBio");
  const popupBio       = document.getElementById("popupBio");
  const btnFecharPopup = document.getElementById("btnFecharPopup");

  if (!btnEditarBio || !popupBio) return;

  btnEditarBio.addEventListener("click", () => {
    bioInput.value = profileBio.textContent.trim();
    popupBio.classList.remove("hidden");
  });

  btnFecharPopup.addEventListener("click", () => {
    popupBio.classList.add("hidden");
  });
}

if (btnSalvarBio && bioInput) {
  btnSalvarBio.addEventListener("click", async () => {
    const bio = bioInput.value.trim();
    if (!bio) return alert("A bio não pode estar vazia");

    const res = await fetch("/api/modelo/bio", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ bio })
    });

    if (!res.ok) return alert("Erro ao salvar bio");

    profileBio.textContent = bio;
    alert("Biografia salva com sucesso!");
  });
}

// ===============================
// UPLOADS
// ===============================
function iniciarUploads() {
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
      if (data.url) adicionarMidia(data.url);
    });
  }

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

      if (res.ok) avatarImg.src = URL.createObjectURL(file);
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

      if (res.ok) capaImg.src = URL.createObjectURL(file);
    });
  }
}

// ===============================
// MÍDIAS
// ===============================
function adicionarMidia(url) {
  const card = document.createElement("div");
  card.className = "midiaCard";

  const ext = url.split(".").pop().toLowerCase();
  const el = ["mp4", "webm", "ogg"].includes(ext)
    ? Object.assign(document.createElement("video"), { src: url, controls: true })
    : Object.assign(document.createElement("img"), { src: url });

  el.className = "midiaThumb";
  el.addEventListener("click", () => abrirMidia(url));

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
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ url })
    });

    if (res.ok) card.remove();
  });

  card.append(el, btnExcluir);
  listaMidias.appendChild(card);
}

// ===============================
// MODAL
// ===============================
function iniciarModalMidia() {
  document.getElementById("fecharModal")?.addEventListener("click", fecharModal);

  document.getElementById("modalMidia")?.addEventListener("click", (e) => {
    if (e.target.id === "modalMidia") fecharModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModal();
  });
}

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

function fecharModal() {
  const modal = document.getElementById("modalMidia");
  const video = document.getElementById("modalVideo");

  modal.classList.add("hidden");
  document.body.style.overflow = "";
  video.pause();
  video.src = "";
}

//MODAL PIX
function abrirModalPix(pix) {
  document.getElementById("pixQr").src = pix.qr_code_base64;
  document.getElementById("pixCopia").value = pix.qr_code;
  document.getElementById("modalPix").classList.remove("hidden");
}


// ===============================
// DOM APLICAÇÃO PERFIL
// ===============================
function aplicarPerfilNoDOM(modelo) {
  if (nomeEl) nomeEl.textContent = modelo.nome;
  if (profileBio) profileBio.textContent = modelo.bio || "";
  if (avatarImg && modelo.avatar) avatarImg.src = modelo.avatar;
  if (capaImg && modelo.capa) capaImg.src = modelo.capa;
}

