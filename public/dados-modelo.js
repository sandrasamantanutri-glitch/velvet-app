// ===============================
// AUTH GUARD — CLIENT HOME
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

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("formDadosModelo");
  const msg = document.getElementById("msgStatus");

  // 🔐 proteção básica
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/";
    return;
  }

  // 🔄 carregar dados já existentes
  try {
    const res = await fetch("/api/modelo/dados", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (res.ok) {
      const dados = await res.json();
      if (dados.id) {
        gerarLinks(dados.id);
      }
      
  Object.keys(dados).forEach(campo => {
  if (!form[campo] || dados[campo] === null) return;

  if (campo === "data_nascimento") {
    // 🔑 converte para YYYY-MM-DD
    form[campo].value = dados[campo].split("T")[0];
  } else {
    form[campo].value = dados[campo];
  }
});
    }
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
  }

  // 💾 salvar dados
  form.addEventListener("submit", async e => {
    e.preventDefault();
    msg.textContent = "Salvando...";
    msg.className = "status";

    const body = Object.fromEntries(new FormData(form));

    // 🔞 valida 18+ no frontend (UX)
    const nascimento = new Date(body.data_nascimento);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }

    if (idade < 18) {
      msg.textContent = "É necessário ter 18 anos ou mais.";
      msg.classList.add("erro");
      return;
    }

    try {
      const res = await fetch("/api/modelo/dados", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (res.ok) {
        msg.textContent = "Dados salvos com sucesso!";
        msg.classList.add("sucesso");
      } else {
        msg.textContent = data.error || "Erro ao salvar dados";
        msg.classList.add("erro");
      }

    } catch (err) {
      msg.textContent = "Erro de conexão";
      msg.classList.add("erro");
    }
  });
});

function gerarLinks(modelo_id) {
  const base = `https://www.velvet.lat/modelo/${modelo_id}`;

  document.getElementById("linkInstagram").value =
    `${base}?src=instagram`;

  document.getElementById("linkTiktok").value =
    `${base}?src=tiktok`;

  document.getElementById("linkDireto").value =
    base;
}

function copiarLink(id) {
  const input = document.getElementById(id);
  input.select();
  input.setSelectionRange(0, 99999);
  document.execCommand("copy");
  alert("Link copiado!");
}

async function confirmarExclusaoConta() {
  const token = localStorage.getItem("token");
  const senha = document.getElementById("senhaConfirmacao").value;
  const erro = document.getElementById("erroExclusao");

  erro.classList.add("hidden");

  if (!senha || senha.length < 4) {
    erro.textContent = "Digite sua senha para continuar.";
    erro.classList.remove("hidden");
    return;
  }

  try {
    const res = await fetch("/api/conta/excluir", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ senha })
    });

    if (res.ok) {
   localStorage.clear();
   window.location.href = "/index.html";
    } else {
   const data = await res.json().catch(() => ({}));

   erro.textContent =
    data.error || "Erro interno ao excluir conta.";
   erro.classList.remove("hidden");
  }


  } catch (err) {
    erro.textContent = "Erro de conexão.";
    erro.classList.remove("hidden");
  }
}

function abrirConfirmacaoExclusao() {
  const modal = document.getElementById("modalExcluirConta");
  if (modal) {
    modal.classList.remove("hidden");
  }
}

function fecharModalExclusao() {
  const modal = document.getElementById("modalExcluirConta");
  if (modal) {
    modal.classList.add("hidden");
  }

  // limpa campo e erro ao fechar
  const senhaInput = document.getElementById("senhaConfirmacao");
  const erro = document.getElementById("erroExclusao");

  if (senhaInput) senhaInput.value = "";
  if (erro) erro.classList.add("hidden");
}




