
const socket = window.socket;

if (!socket) {
  console.error("❌ Socket não disponível no chatmodelo");
}

console.log("ANTES DE TUDO → modeloPerfil =", localStorage.getItem("modeloPerfil"));

document.addEventListener("DOMContentLoaded", () => {
    const modelo = localStorage.getItem("modeloPerfil");

        // 🔐 BLINDAGEM DO CHAT
    if (modelo) {
        localStorage.setItem("chatModelo", modelo);
    }

    if (!modelo) {
        console.warn("Modelo não encontrado");
    } else {
        initPerfil(modelo);
        initBio(modelo);
        initFeed(modelo);
    }

    initModalMidia();
    aplicarPermissoes();
});

function aplicarPermissoes() {
    let role = localStorage.getItem("userRole");

    if (!role) {
        console.warn("userRole não definido, assumindo cliente");
        role = "cliente";
    }

    console.log("ROLE ATUAL:", role);

    document.querySelectorAll(".only-modelo").forEach(el => {
        el.style.display = role === "modelo" ? "" : "none";
    });

    document.querySelectorAll(".only-cliente").forEach(el => {
        el.style.display = role === "cliente" ? "" : "none";
    });
}

// MODELO ATUAL
const modelo = localStorage.getItem("modeloPerfil");

//PERFIL, AVATAR, CAPA, NOME
function initPerfil(modelo) {
    const avatarImg = document.getElementById("profileAvatar");
    const capaEl = document.getElementById("profileCapa");
    const nomeEl = document.getElementById("profileName");
    const capaImg = document.getElementById("profileCapa");


    fetch(`/getPerfil/${encodeURIComponent(modelo)}`)
        .then(res => res.json())
        .then(data => {
            if (avatarImg) {
                avatarImg.src =
                    (data.avatar || "/assets/avatarDefault.png") +
                    "?" + Date.now();
            }
            if (capaImg) {
                capaImg.src = (data.capa || "/assets/capaDefault.jpg") + "?v=" + Date.now();
            }

            if (nomeEl) {
                nomeEl.textContent =
                    data.nome || modelo;
            }
        })
        .catch(err => console.error("Erro perfil:", err));
}


//BIO (abrir, fechar, salvar, carregar)
function initBio(modelo) {
    const btnEditar = document.getElementById("btnEditarBio");
    const popup = document.getElementById("popupBio");
    const btnFechar = document.getElementById("btnFecharPopup");
    const btnSalvar = document.getElementById("btnSalvarBio");
    const bioText = document.getElementById("profileBio");
    const bioInput = document.getElementById("bioInput");

    if (!bioText) return;

    // carregar bio
    fetch(`/getPerfil/${encodeURIComponent(modelo)}`)
        .then(res => res.json())
        .then(data => {
            bioText.textContent = data.bio || "";
        });

    // abrir popup
    btnEditar?.addEventListener("click", () => {
        bioInput.value = bioText.textContent.trim();
        popup.classList.remove("hidden");
    });

    // fechar popup
    btnFechar?.addEventListener("click", () => {
        popup.classList.add("hidden");
    });

    // salvar bio
    btnSalvar?.addEventListener("click", () => {
        const novaBio = bioInput.value.trim();
        if (!novaBio) {
            alert("A bio não pode estar vazia");
            return;
        }

        fetch("/saveBio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelo, bio: novaBio })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                bioText.textContent = novaBio;
                popup.classList.add("hidden");
            }
        });
    });
}

//FEED (upload + listar + excluir)
function initFeed(modelo) {
    const inputMedia  = document.getElementById("inputMedia");
    const listaMidias = document.getElementById("listaMidias");
    const userType = localStorage.getItem("userRole");

    if (!inputMedia || !listaMidias) {
        console.warn("Feed não encontrado nesta página");
        return;
    }

    // =========================
    // 📥 CARREGAR MÍDIAS
    // =========================
    carregarMidias();

    function carregarMidias() {
        fetch(`/getMidias/${encodeURIComponent(modelo)}`)
            .then(res => res.json())
            .then(data => {
                listaMidias.innerHTML = "";
                data.midias.forEach(url => adicionarMidia(url));
            })
            .catch(err => console.error("Erro carregar mídias:", err));
    }

    // =========================
    // 📤 UPLOAD
    // =========================
    inputMedia.addEventListener("change", () => {
        const file = inputMedia.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("midia", file);
        formData.append("modelo", modelo);

        fetch(`/uploadMidia?modelo=${encodeURIComponent(modelo)}`, {
            method: "POST",
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            adicionarMidia(data.url);
            inputMedia.value = "";
        })
        .catch(err => console.error("Erro upload:", err));
    });

    // =========================
    // 🖼️ ADICIONAR NA TELA
    // =========================
    function adicionarMidia(url) {
        const card = document.createElement("div");
        card.classList.add("midiaCard");

        const ext = url.split(".").pop().toLowerCase();
        let midiaEl;

        if (["mp4", "webm", "ogg"].includes(ext)) {
            midiaEl = document.createElement("video");
            midiaEl.src = url;
            midiaEl.controls = true;
        } else {
            midiaEl = document.createElement("img");
            midiaEl.src = url;
        }

        midiaEl.classList.add("midiaThumb");
        midiaEl.addEventListener("click", () => abrirMidia(url));

        card.appendChild(midiaEl);

        // botão excluir (só modelo)
        if (userType === "modelo") {
            const btnExcluir = document.createElement("button");
            btnExcluir.textContent = "Excluir";
            btnExcluir.classList.add("btnExcluirMidia");

            btnExcluir.addEventListener("click", () => excluirMidia(url, card));
            card.appendChild(btnExcluir);
        }

        listaMidias.appendChild(card);
    }

    // =========================
    // 🗑️ EXCLUIR
    // =========================
    function excluirMidia(url, card) {
        if (!confirm("Deseja excluir esta mídia?")) return;

        fetch("/deleteMidia", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                card.remove();
            } else {
                alert("Erro ao excluir mídia.");
            }
        })
        .catch(err => console.error("Erro excluir mídia:", err));
    }
};

function initModalMidia() {
    const modal  = document.getElementById("modalMidia");
    const fechar = document.getElementById("fecharModal");
    const video  = document.getElementById("modalVideo");

    if (!modal || !fechar) return;

    function fecharModal() {
        modal.classList.add("hidden");
        document.body.style.overflow = "";

        if (video) {
            video.pause();
            video.src = "";
        }
    }

    fechar.addEventListener("click", fecharModal);

    modal.addEventListener("click", e => {
        if (e.target === modal) fecharModal();
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !modal.classList.contains("hidden")) {
            fecharModal();
        }
    });

};

function abrirMidia(url) {
  const modal = document.getElementById("modalMidia");
  const img   = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  if (!modal || !img || !video) {
    console.warn("Modal de mídia não encontrado");
    return;
  }

  const ext = url.split(".").pop().toLowerCase();

  // garantir que o modal aparece
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";

  // reset
  img.style.display = "none";
  video.style.display = "none";
  video.pause();
  video.src = "";

  if (["mp4", "webm", "ogg"].includes(ext)) {
    video.src = url;
    video.style.display = "block";
    video.play();
  } else {
    img.src = url;
    img.style.display = "block";
  }
}

// ================================
// BOTÃO ENVIAR MENSAGEM (CLIENTE)
// ================================
document.addEventListener("DOMContentLoaded", () => {
    const btnChat = document.getElementById("btnChat");
    if (!btnChat) return;

    btnChat.addEventListener("click", () => {
    const cliente = localStorage.getItem("clientName");

    // 🔥 MODELO ATUAL DO PERFIL ABERTO
    const modelo = localStorage.getItem("modeloPerfil");

    if (!cliente || !modelo) {
        alert("Erro ao abrir chat");
        return;
    }

    // 🧠 LIMPAR CHAT ANTIGO
    localStorage.removeItem("chatModelo");

    // ✅ DEFINIR CHAT CORRETO
    localStorage.setItem("chatCliente", cliente);
    localStorage.setItem("chatModelo", modelo);

    window.location.href = "chatCliente.html";
});
});

// ======================================
// VIP — BLOCO ÚNICO E LIMPO
// ======================================

document.addEventListener("DOMContentLoaded", () => {
    initVip();
});

function initVip() {
    const btnVip  = document.getElementById("btnVip");
    const cliente = localStorage.getItem("clientName");
    const modelo  = localStorage.getItem("modeloPerfil");

    console.log("VIP INIT →", cliente, modelo);

    if (!btnVip || !cliente || !modelo) return;

    fetch(`/api/modelo/${modelo}/vips`)
        .then(res => res.json())
        .then(vips => {
            const jaVip = vips.some(v => v.cliente === cliente);
            if (jaVip) marcarVipAtivo(btnVip);
        });

    btnVip.onclick = () => assinarVip(btnVip, cliente, modelo);
}

function assinarVip(btnVip, cliente, modelo) {
    fetch("/api/subscribeVIP", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, modelo })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            marcarVipAtivo(btnVip);
        }
    });
}

function marcarVipAtivo(btnVip) {
    btnVip.textContent = "✅ VIP Ativo";
    btnVip.disabled = true;
    btnVip.classList.add("vip-ativo");
}

