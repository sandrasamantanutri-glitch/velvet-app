const modeloSelect = document.getElementById("modeloSelect");
const mensagemInput = document.getElementById("mensagem");
const precoInput = document.getElementById("preco");
const conteudosGrid = document.getElementById("conteudosGrid");

const btnEnviar = document.getElementById("btnEnviar");
const btnTeste = document.getElementById("btnTeste");

const token = localStorage.getItem("token");
let conteudosSelecionados = [];

// 🔹 carregar modelos
async function carregarModelos() {
  const res = await fetch("/api/modelos", {
    headers: { Authorization: "Bearer " + token }
  });

  const modelos = await res.json();

  modeloSelect.innerHTML = `<option value="">Selecione</option>`;
  modelos.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.nome;
    modeloSelect.appendChild(opt);
  });
}

// 🔹 carregar conteúdos da modelo
async function carregarConteudos(modeloId) {
  conteudosGrid.innerHTML = "";
  conteudosSelecionados = [];

  const res = await fetch(`/api/conteudos/modelo/${modeloId}`, {
    headers: { Authorization: "Bearer " + token }
  });

  const conteudos = await res.json();

  conteudos.forEach(c => {
    const item = document.createElement("div");
    item.className = "conteudo-item";

    const img = document.createElement("img");
    img.src = c.thumbnail_url || c.url;

    item.appendChild(img);

    item.onclick = () => {
      item.classList.toggle("ativo");

      if (conteudosSelecionados.includes(c.id)) {
        conteudosSelecionados = conteudosSelecionados.filter(id => id !== c.id);
      } else {
        conteudosSelecionados.push(c.id);
      }
    };

    conteudosGrid.appendChild(item);
  });
}

modeloSelect.onchange = () => {
  if (modeloSelect.value) {
    carregarConteudos(modeloSelect.value);
  }
};

// 🚀 envio
async function enviar(modoTeste) {
  if (!modeloSelect.value || !mensagemInput.value || !precoInput.value) {
    alert("Preencha todos os campos.");
    return;
  }

  if (conteudosSelecionados.length === 0) {
    alert("Selecione ao menos um conteúdo.");
    return;
  }

  const payload = {
    modelo_id: modeloSelect.value,
    texto: mensagemInput.value,
    preco: precoInput.value,
    conteudos: conteudosSelecionados,
    modo_teste: modoTeste
  };

  const res = await fetch("/api/allmessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    alert("Erro ao enviar AllMessage");
    return;
  }

  alert("✅ AllMessage enviado com sucesso");
}

btnEnviar.onclick = () => enviar(false);
btnTeste.onclick = () => enviar(true);

carregarModelos();
