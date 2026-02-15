const token = localStorage.getItem("token");

function getUsuarioLogado() {
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload; // { id, role, ... }
  } catch {
    return null;
  }
}

 

async function buscarDadosPessoais() {
  if (!token) return null;

  const res = await fetch("/api/usuario/perfil", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return null;
  return await res.json();
}

function paginaTem(id) {
  return document.getElementById(id) !== null;
}

function preencherFormulario(formId, dados) {
  const form = document.getElementById(formId);
  if (!form || !dados) return;

  Object.keys(dados).forEach((campo) => {
    if (form[campo] !== undefined) {
      form[campo].value = dados[campo] ?? "";
    }
  });
}

function bloquearFormulario(form) {
  if (!form) return;

  form.querySelectorAll("input, select, textarea, button").forEach(el => {
    el.disabled = true;
  });

  form.style.pointerEvents = "none";
  form.style.opacity = "0.6";
}


function mostrarStatusVerificacao(status) {
  const box = document.getElementById("statusVerificacao");
  if (!box) return;

  box.style.display = "block";
  box.className = "status-box";

  if (status === "aprovado") {
    box.classList.add("status-aprovado");
    box.innerText =
      "Dados pessoais aprovados. Alterações não são permitidas.";
  }

  if (status === "em_analise") {
    box.innerText =
      "Seus dados estão em análise.";
  }

  if (status === "rejeitado") {
    box.innerText =
      "Dados rejeitados. Corrija as informações e envie novamente.";
  }
}

async function irParaInbox() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/index.html";
    return;
  }

  const res = await fetch("/api/me", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const user = await res.json();

  if (user.role === "modelo") {
    window.location.href = "/inbox.html";
  } else {
    window.location.href = "/inboxc.html";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");
  if (!token) return;

  const res = await fetch("/api/me", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const user = await res.json();

  // 🔒 role REAL e confiável
  document.body.classList.add(`role-${user.role}`);

   if (user.role === "modelo") {
    const resDados = await fetch("/api/usuario/dados", {
      headers: { Authorization: "Bearer " + token }
    });

    if (resDados.ok) {
      const dados = await resDados.json();

      if (dados.status === "aprovado") {
        document.getElementById("areaBanner")?.classList.add("hidden");
      }
    }
  }

  // PERFIL VISUAL
  carregarPerfilBase(user);
  carregarDadosUsuario();
  carregarDadosPessoais();

  // SOMENTE MODELO
  if (user.role === "modelo") {
    carregarResumoModelo();
    carregarAreaModelo(user.id);

    if (document.getElementById("listaAssinantes")) {
      carregarAssinantes();
    }
  }

  const btn = document.getElementById("btnPerfilCompleto");
  btn.href = `/perfil.html?modelo_id=${user.id}`;
});


let assinantesCache = [];
let paginaAtual = 1;
const LIMITE_POR_PAGINA = 10;

async function carregarAssinantes() {
  const token = localStorage.getItem("token");
  if (!token) return;

  const tbody = document.getElementById("listaAssinantes");
  if (!tbody) return;

  try {
    const res = await fetch("/api/modelo/assinantes", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) throw new Error("Erro ao buscar assinantes");

    assinantesCache = await res.json();
    paginaAtual = 1;

    renderizarPagina();
    configurarBotoes();

  } catch (err) {
    console.error("Erro carregar assinantes:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="7">Erro ao carregar assinantes</td>
      </tr>
    `;
  }
}

async function carregarPerfilBase(usuario) {
  const token = localStorage.getItem("token");
  if (!token || !usuario?.role) return;

  const endpoint =
    usuario.role === "modelo"
      ? "/api/modelo/me"
      : "/api/cliente/me";

  const res = await fetch(endpoint, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    console.error("Erro ao carregar perfil:", res.status);
    return;
  }

  const perfil = await res.json();

  // 📸 AVATAR
  const avatar = document.getElementById("profileAvatar");
  if (avatar && perfil.avatar) avatar.src = perfil.avatar;

  // 🖼️ CAPA
  const capa = document.getElementById("profileCapa");
  if (capa && perfil.capa) capa.src = perfil.capa;

  // 👤 NOME
  const profileName = document.getElementById("profileName");
  if (profileName) {
    profileName.textContent =
      perfil.nome_exibicao || perfil.username || "";
  }
}


function renderizarPagina() {
  const tbody = document.getElementById("listaAssinantes");
  const inicio = (paginaAtual - 1) * LIMITE_POR_PAGINA;
  const fim = inicio + LIMITE_POR_PAGINA;

  const pagina = assinantesCache.slice(inicio, fim);

  tbody.innerHTML = "";

  if (pagina.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">Nenhum assinante encontrado</td>
      </tr>
    `;
    return;
  }

  pagina.forEach(a => {
    const total =
      Number(a.total_assinaturas) + Number(a.total_midias);

    tbody.innerHTML += `
      <tr>
        <td class="assinante-nome">${a.nome_cliente}</td>
        <td>
          <span class="badge ${a.ativo ? "badge-ativo" : "badge-inativo"}">
            ${a.ativo ? "Ativo" : "Inativo"}
          </span>
        </td>
        <td>${formatarData(a.expiration_at)}</td>
        <td>${formatarData(a.ultima_renovacao)}</td>
        <td>R$ ${Number(a.total_assinaturas).toFixed(2)}</td>
        <td>R$ ${Number(a.total_midias).toFixed(2)}</td>
        <td class="total-geral">R$ ${total.toFixed(2)}</td>
      </tr>
    `;
  });

  atualizarPaginacao();
}

function configurarBotoes() {
  document.getElementById("btnAnterior")?.addEventListener("click", () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      renderizarPagina();
    }
  });

  document.getElementById("btnProximo")?.addEventListener("click", () => {
    const totalPaginas = Math.ceil(
      assinantesCache.length / LIMITE_POR_PAGINA
    );

    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      renderizarPagina();
    }
  });
}

function atualizarPaginacao() {
  const totalPaginas = Math.ceil(
    assinantesCache.length / LIMITE_POR_PAGINA
  );

  document.getElementById("paginaAtual").textContent =
    `${paginaAtual} / ${totalPaginas}`;

  document.getElementById("btnAnterior").disabled =
    paginaAtual === 1;

  document.getElementById("btnProximo").disabled =
    paginaAtual === totalPaginas;
}

function formatarData(data) {
  if (!data) return "-";
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function gerarLinks(modelo_id) {
  const base = `https://www.velvet.lat/perfil.html?modelo_id=${modelo_id}`;

  document.getElementById("linkInstagram").value =
    `${base}&src=instagram`;

  document.getElementById("linkTiktok").value =
    `${base}&src=tiktok`;

  document.getElementById("linkDireto").value =
    base;
}

function copiarLink(id) {
  const input = document.getElementById(id);
  navigator.clipboard.writeText(input.value);
  alert("Link copiado!");
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

function normalizarInstagram(username) {
  if (!username) return null;

  return username
    .trim()
    .replace(/^@/, "") // remove @ do início
    .replace(/\s+/g, ""); // remove espaços
}

async function carregarVipCountModelo(modelo_id) {
  console.log("🔥 carregarVipCountModelo chamada com:", modelo_id);

  const token = localStorage.getItem("token");
  console.log("🔐 token existe?", !!token);
  if (!token || !modelo_id) {
    console.warn("VIP count: dados insuficientes");
    return;
  }

  try {
    const res = await fetch("/api/modelo/me/vip-count", {
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

async function carregarAreaModelo(modelo) {
  const res = await fetch("/api/modelo/me", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) return;

  const modelo = await res.json();
  console.log("Modelo logado:", modelo);


  // ===============================
  // 📸 AVATAR / CAPA
  // ===============================
  const avatar = document.getElementById("profileAvatar");
  if (avatar && modelo.avatar) avatar.src = modelo.avatar;

  const capa = document.getElementById("profileCapa");
  if (capa && modelo.capa) capa.src = modelo.capa;

  // ===============================
  // 👤 NOME VISUAL (só se existir)
  // ===============================
  const profileName = document.getElementById("profileName");
  if (profileName) {
    profileName.textContent = modelo.nome_exibicao || "";
  }

  // ===============================
  // 📝 FORMULÁRIO (dados.html)
  // ===============================
  // const form = document.getElementById("formDadosModelo");
  // if (paginaTem("formDadosModelo")) {
  //   form.nome_exibicao.value = modelo.nome_exibicao || "";
  //   form.instagram.value    = modelo.instagram || "";
  //   form.tiktok.value       = modelo.tiktok || "";
  //   form.local.value        = modelo.local || "";
  //   form.bio.value          = modelo.bio || "";
  // }

  // ===============================
  // 👑 VIP COUNT
  // ===============================
  carregarVipCountModelo(modelo.user_id ?? modelo.id);

 // 🔗 LINKS DO PERFIL
 if (document.getElementById("linkInstagram")) {
  gerarLinks(modelo.id);
 }

}

async function carregarDadosUsuario() {
  const token = localStorage.getItem("token");
  if (!token) return;

  const res = await fetch("/api/usuario/perfil", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const dados = await res.json();

  const form = document.getElementById("formDadosUsuario");
  if (!form) return;

  Object.keys(dados).forEach(campo => {
    if (form[campo] !== undefined) {
      form[campo].value = dados[campo] ?? "";
    }
  });
}


async function carregarDadosPessoais() {
  if (!paginaTem("formDadosPessoais")) return;

  const token = localStorage.getItem("token");
  if (!token) return;

   const usuario = getUsuarioLogado();

  const res = await fetch("/api/usuario/dados", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (!res.ok) return;

  const dados = await res.json();
 
if (
  usuario?.role === "modelo" &&
  dados.status === "aprovado"
) {
  document.getElementById("areaBanner")?.classList.add("hidden");
}

  const form = document.getElementById("formDadosPessoais");
  if (!form) return;

  // preencher campos
  form.nome_completo.value = dados.nome_completo || "";
  form.data_nascimento.value = dados.data_nascimento
    ? dados.data_nascimento.split("T")[0]
    : "";
  form.telefone.value = dados.telefone || "";
  form.endereco.value = dados.endereco || "";
  form.estado.value   = dados.estado || "";
  form.cidade.value   = dados.cidade || "";
  form.pais.value     = dados.pais || "";

   if (dados.status === "aprovado") {
    bloquearFormulario(form);
    mostrarStatusVerificacao("aprovado");
    document.querySelector(".btn-salvar")?.remove();
  }
}


const btnCapa = document.getElementById("btnCapa");
const btnAvatar = document.getElementById("btnAvatar");
const inputCapa = document.getElementById("inputCapa");
const inputAvatar = document.getElementById("inputAvatar");
const capaImg = document.getElementById("profileCapa");
const avatarImg = document.getElementById("profileAvatar");

btnCapa?.addEventListener("click", () => inputCapa.click());
btnAvatar?.addEventListener("click", () => inputAvatar.click());

inputCapa?.addEventListener("change", async () => {
  const file = inputCapa.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("capa", file);

  const res = await fetch("/uploadCapa", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });

  const data = await res.json();
  if (data.url) capaImg.src = data.url;
});

inputAvatar?.addEventListener("change", async () => {
  const file = inputAvatar.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("avatar", file);

  const res = await fetch("/uploadAvatar", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });

  const data = await res.json();
  if (data.url) avatarImg.src = data.url;
});

const formPessoais = document.getElementById("formDadosPessoais");

formPessoais?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const dados = {
    nome_completo: formPessoais.nome_completo.value.trim(),
    data_nascimento: formPessoais.data_nascimento.value,
    telefone: formPessoais.telefone.value.trim(),
    endereco: formPessoais.endereco.value.trim(),
    estado: formPessoais.estado.value.trim(),
    cidade: formPessoais.cidade.value.trim(),
    pais: formPessoais.pais.value.trim()
  };

  const res = await fetch("/api/usuario/dados", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(dados)
  });

if (res.status === 403) {
  alert("Seus dados pessoais já foram aprovados e não podem ser alterados.");
  bloquearFormulario(formPessoais);
  mostrarStatusVerificacao("aprovado");
  return;
}

if (!res.ok) {
  alert("Erro ao salvar dados pessoais");
  return;
}

  alert("Dados pessoais salvos com sucesso");
});

const formModelo = document.getElementById("formDadosUsuario");

formModelo?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const dados = {
    nome_exibicao: formModelo.nome_exibicao.value.trim(),
    instagram: normalizarInstagram(formModelo.instagram.value),
    tiktok: formModelo.tiktok.value.trim(),
    local: formModelo.local.value.trim(),
    bio: formModelo.bio.value.trim()
  };

  if (!dados.nome_exibicao) {
    alert("O nome de exibição é obrigatório");
    return;
  }

  const res = await fetch("/api/usuario/perfil", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(dados)
  });

  if (!res.ok) {
    alert("Erro ao salvar dados");
    return;
  }

  alert("Dados salvos com sucesso");
});

