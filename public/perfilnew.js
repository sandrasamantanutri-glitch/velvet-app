const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

let modelo_id = null;
let EH_DONA = false;

  const btnAssinar = document.getElementById("btn-assinar");

document.addEventListener("DOMContentLoaded", async () => {

  // =========================
  // PARAMETROS URL
  // =========================

  const params = new URLSearchParams(window.location.search);
  modelo_id = Number(params.get("modelo_id") || params.get("id"));

  if (!modelo_id) {
    console.warn("modelo_id não encontrado na URL");
    return;
  }

  // =========================
  // VERIFICAR SE É DONA
  // =========================

  const modeloLogado = Number(localStorage.getItem("modelo_id"));
  EH_DONA = role === "modelo" && modeloLogado === modelo_id;

  if (!EH_DONA) {
    document.getElementById("btn-upload")?.remove();
  }

btnAssinar?.addEventListener("click", () => {

  const tokenAtual = localStorage.getItem("token");

  // 👀 VISITANTE
  if (!tokenAtual) {
    abrirPopupLoginObrigatorio();
    return;
  }

  const role = localStorage.getItem("role");
  const modeloLogado = Number(localStorage.getItem("modelo_id"));

  // 🚫 MODELO tentando assinar outra modelo
  if (role === "modelo" && modeloLogado !== modelo_id) {
    alert("No momento, modelo não pode assinar ou ver conteúdo exclusivo de outra modelo. Estamos trabalhando para que isso seja possível!!💜");
    return;
  }

  // 💎 JÁ VIP
  if (window.__CLIENTE_VIP__) {
    window.location.href = `/chatc.html?modelo_id=${modelo_id}`;
    return;
  }

  // 💳 ABRIR PAGAMENTO
  window.abrirFluxoVIP();

});


await carregarPerfil();
await carregarOfertaAtiva()
await aplicarRegrasDeAcesso();


});


async function carregarPerfil(){

  try{

    const res = await fetch(`/api/modelo/publico/${modelo_id}`);

    if(!res.ok) return;

    const modelo = await res.json();

    document.getElementById("profileName").textContent =
      modelo.nome_exibicao || "";

    document.getElementById("profileBio").textContent =
      modelo.bio || "";

      const avatar = document.getElementById("profileAvatar");
const capa = document.getElementById("profileCapa");

if (avatar) {
  avatar.src = modelo.avatar || "/assets/avatar.png";
  avatar.onerror = () => avatar.src = "/assets/avatar.png";
}

if (capa) {
  capa.src = modelo.capa || "/assets/capa.png";
  capa.onerror = () => capa.src = "/assets/capa.png";
}

    const localEl = document.getElementById("local-texto");

    if(localEl){
      localEl.textContent = modelo.local || "";
    }

    const ig = document.getElementById("link-instagram");
    const tt = document.getElementById("link-tiktok");

    if(modelo.instagram){
      ig.href = "https://instagram.com/" + modelo.instagram.replace("@","");
      ig.style.display = "inline-block";
    }else{
      ig.style.display = "none";
    }

    if(modelo.tiktok){
      tt.href = "https://tiktok.com/@" + modelo.tiktok.replace("@","");
      tt.style.display = "inline-block";
    }else{
      tt.style.display = "none";
    }

  }catch(e){
    console.error("erro perfil",e);
  }

}

function abrirMidia(item){

  const modal = document.getElementById("modalMidia");
  const img = document.getElementById("modalImg");
  const video = document.getElementById("modalVideo");

  img.style.display = "none";
  video.style.display = "none";

  const url = item.url || "";

  const ehVideo =
    url.includes(".mp4") ||
    url.includes(".webm") ||
    url.includes(".mov");

  if(ehVideo){

    video.src = url;
    video.style.display = "block";

    video.currentTime = 0;
    video.play().catch(()=>{});

  }else{

    img.src = url;
    img.style.display = "block";

  }

  modal.classList.remove("hidden");
}


function valorBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

async function aplicarRegrasDeAcesso() {
  const ofertaCard = document.getElementById("oferta-card");

  const tokenAtual = localStorage.getItem("token");

  // Estado padrão
  window.__CLIENTE_VIP__ = false;

  const ehModelo = role === "modelo";
  const ehCliente = role === "cliente";

  // ⚠️ DONA DO PERFIL
  const modeloLogado = Number(localStorage.getItem("modelo_id"));
  const ehDona = ehModelo && modeloLogado === modelo_id;

  // ===============================
  // 🟣 MODELO DONA DO PERFIL
  if (ehDona) {

    window.__CLIENTE_VIP__ = false;

    if (ofertaCard) ofertaCard.style.display = "block";

    if (btnAssinar) {
      btnAssinar.disabled = false;
      btnAssinar.style.cursor = "not-allowed";
      btnAssinar.textContent =
    `Assinar VIP por ${valorBRL(OFERTA_ATUAL.valor_promocional)}`;
    }

    return;
  }

  // ===============================
  // 👀 VISITANTE
  if (!tokenAtual) {
    if (ofertaCard) ofertaCard.style.display = "block";
    return;
  }

  // ===============================
  // 🔵 CLIENTE OU MODELO vendo outro perfil
if (ehCliente || ehModelo) {

  try {

    const res = await fetch(`/api/vip/status/${modelo_id}`, {
      headers: {
        Authorization: "Bearer " + tokenAtual
      }
    });

    const data = res.ok ? await res.json() : { vip: false };
    const vip = data.vip;

    const vipCard = document.getElementById("vip-card");
    const ofertaCard = document.getElementById("oferta-card");

    if (vip) {

      window.__CLIENTE_VIP__ = true;

      // 🔥 Esconde oferta normal
      if (ofertaCard) ofertaCard.style.display = "none";

      // 🔥 Mostra card exclusivo VIP
      if (vipCard) vipCard.classList.remove("hidden");

    } else {

      window.__CLIENTE_VIP__ = false;

      // 🔥 Mostra oferta normal
      if (ofertaCard) ofertaCard.style.display = "block";

      // 🔥 Esconde card VIP
      if (vipCard) vipCard.classList.add("hidden");

      if (btnAssinar) {
        btnAssinar.disabled = false;

        if (window.OFERTA_ATUAL) {
          btnAssinar.textContent =
            `Assinar VIP por ${valorBRL(window.OFERTA_ATUAL.valor_promocional)}`;
        }
      }

    }

  } catch (err) {

    console.error("Erro ao verificar VIP:", err);

    window.__CLIENTE_VIP__ = false;

    const vipCard = document.getElementById("vip-card");
    const ofertaCard = document.getElementById("oferta-card");

    if (ofertaCard) ofertaCard.style.display = "block";
    if (vipCard) vipCard.classList.add("hidden");

  }
}
}

let OFERTA_ATUAL = null;
async function carregarOfertaAtiva() {
  console.log("🧪 carregarOfertaAtiva chamado com modelo_id =", modelo_id);

  const ofertaCard = document.getElementById("oferta-card");
  const precoDescontoEl = document.getElementById("preco-desconto");
  const precoOriginalEl = document.getElementById("preco-original");
  const descontoEl = document.getElementById("oferta-desconto");

 if (!ofertaCard) {
  console.warn("ofertaCard não encontrado");
  return;
}
  try {
    const res = await fetch(`/api/ofertas/ativa/${modelo_id}`);

    if (!res.ok) {
      ofertaCard.style.display = "none";
      OFERTA_ATUAL = null;
      return;
    }

    const data = await res.json();

    if (!data.ativa) {

  const valor = Number(data.valor_base) || 20;

  OFERTA_ATUAL = {
    valor_base: valor,
    valor_promocional: valor,
    desconto_percentual: 0
  };

  if (precoDescontoEl)
    precoDescontoEl.textContent = valorBRL(valor);

  if (precoOriginalEl)
    precoOriginalEl.textContent = "";

  if (descontoEl)
    descontoEl.style.display = "none";

  if (btnAssinar)
    btnAssinar.textContent =
      `Assinar VIP por ${valorBRL(valor)}`;

  ofertaCard.style.display = "block";
  return;
}
    const oferta = data.oferta;
    OFERTA_ATUAL = {
      id: oferta.id,
      modelo_id: oferta.modelo_id,
      valor_base: Number(oferta.valor_base),
      valor_promocional: Number(oferta.valor_promocional),
      desconto_percentual: Number(oferta.desconto_percentual || 0)
    };
      window.OFERTA_ATUAL = OFERTA_ATUAL;

    if (descontoEl && OFERTA_ATUAL.desconto_percentual > 0) {
      descontoEl.textContent = `Economize ${OFERTA_ATUAL.desconto_percentual}%`;
      descontoEl.style.display = "inline-block";
    } else if (descontoEl) {
      descontoEl.style.display = "none";
    }

    if (precoDescontoEl) {
  precoDescontoEl.textContent =
    valorBRL(OFERTA_ATUAL.valor_promocional);
}

if (precoOriginalEl) {
  precoOriginalEl.textContent =
    valorBRL(OFERTA_ATUAL.valor_base);
}

    ofertaCard.style.display = "block";

    if (btnAssinar) {
  btnAssinar.disabled = false;
  btnAssinar.textContent =
    `Assinar VIP por ${valorBRL(OFERTA_ATUAL.valor_promocional)}`;
}

  } catch (err) {
    console.error("Erro ao carregar oferta:", err);
    ofertaCard.style.display = "none";
    OFERTA_ATUAL = null;
  }
}

function abrirPopupLoginObrigatorio() {

  const modal = document.createElement("div");
  modal.className = "modal-login-obrigatorio";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-box-login">
      <h3>🔒 Acesso necessário</h3>
      <p>É necessário estar logado para esta ação.</p>

      <div class="login-acoes">
        <button class="btn-login">Ja tenho conta</button>
        <button class="btn-register">Não tenho conta</button>
      </div>
    </div>
  `;

  modal.querySelector(".modal-backdrop").onclick = () => modal.remove();

  modal.querySelector(".btn-login").onclick = () => {
    modal.remove();
    openAgeGate("login");
  };

  modal.querySelector(".btn-register").onclick = () => {
    modal.remove();
    openAgeGate("register");
  };

  document.body.appendChild(modal);
}

function abrirFluxoVIP() {

  const roleAtual = localStorage.getItem("role");

  if (!roleAtual) {
    abrirPopupLoginObrigatorio();
    return;
  }

  if (!modelo_id) {
    alert("Erro ao identificar modelo.");
    return;
  }

  window.PAGAMENTO_TIPO_ATUAL = "vip";

  const valorBase = window.OFERTA_ATUAL?.valor_base ?? 20;
  const valorPromocional =
    window.OFERTA_ATUAL?.valor_promocional ?? valorBase;

  preencherResumoVIP({
    valorBase: valorBase,
    desconto: valorBase - valorPromocional
  });

  abrirPopupPagamento();
}