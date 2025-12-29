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

async function carregarDadosCliente() {
  const res = await fetch("/api/cliente/dados", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) return;

  const dados = await res.json();
  if (!dados) return;

  document.getElementById("username").value = dados.username || "";
  document.getElementById("nomeCompleto").value = dados.nome_completo || "";
  document.getElementById("dataNascimento").value =
    dados.data_nascimento
      ? dados.data_nascimento.split("T")[0]
      : "";
  document.getElementById("pais").value = dados.pais || "";

  // document.getElementById("nomeCartao").value = dados.nome_cartao || "";
  // document.getElementById("ultimos4").value = dados.ultimos4_cartao || "";
  // document.getElementById("bandeira").value = dados.bandeira_cartao || "";

  if (dados.avatar) {
    document.getElementById("avatarPreview").src = dados.avatar;
  }
}


const form = document.getElementById("dadosForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const dataNascimento = new Date(
    document.getElementById("dataNascimento").value
  );

  const hoje = new Date();
  const idade =
    hoje.getFullYear() - dataNascimento.getFullYear();

  if (idade < 18) {
    alert("Você precisa ter mais de 18 anos.");
    return;
  }

  const payload = {
    username: document.getElementById("username").value,
    nome_completo: document.getElementById("nomeCompleto").value,
    data_nascimento: document.getElementById("dataNascimento").value,
    pais: document.getElementById("pais").value,

    // nome_cartao: document.getElementById("nomeCartao").value,
    // ultimos4_cartao: document.getElementById("ultimos4").value,
    // bandeira_cartao: document.getElementById("bandeira").value
  };

  const res = await fetch("/api/cliente/dados", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert("Dados salvos com sucesso!");
  } else {
    alert("Erro ao salvar dados");
  }
});

const inputAvatar = document.getElementById("inputAvatar");
const avatarPreview = document.getElementById("avatarPreview");

if (inputAvatar) {
  inputAvatar.addEventListener("change", async () => {
    const file = inputAvatar.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("avatar", file);

    const res = await fetch("/api/cliente/avatar", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: fd
    });

    const data = await res.json();

    if (data.url) {
      avatarPreview.src = data.url;
    } else {
      alert("Erro ao atualizar foto");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  carregarDadosCliente();
});

