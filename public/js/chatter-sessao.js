// ===========================
// IDENTIFICAÇÃO DE QUEM ATENDE (chat-agency.html)
// Pede código + PIN antes de liberar o chat. O servidor registra a entrada e a
// saída; aqui só guardamos o token da sessão, que vale enquanto a aba existir.
// ===========================
window.chatterSessao = (() => {
  const CHAVE = "chatter_sessao";
  const el = id => document.getElementById(id);

  const ler = () => sessionStorage.getItem(CHAVE);

  function chamar(caminho, opcoes = {}) {
    return fetch("/api/chatter" + caminho, {
      ...opcoes,
      headers: {
        "Authorization": "Bearer " + localStorage.getItem("token"),
        "X-Chatter-Sessao": ler() || "",
        "Content-Type": "application/json"
      }
    });
  }

  function mostrarTela(estado, mensagem = "") {
    el("chatterTela").hidden = false;
    el("agencyWrap").inert = true;
    el("chatterForm").hidden = estado !== "form";
    el("chatterTentar").hidden = estado !== "erro";
    el("chatterAviso").textContent = mensagem;
  }

  function liberar(nome) {
    el("chatterTela").hidden = true;
    el("agencyWrap").inert = false;
    if (!nome) return;
    el("chatterNome").textContent = "Atendendo: " + nome;
    el("chatterAtual").hidden = false;
  }

  // Resolve com o nome de quem entrou, quando o formulário for aceito
  function pedirIdentificacao() {
    mostrarTela("form");
    el("chatterCodigo").focus();

    return new Promise(resolve => {
      el("chatterForm").onsubmit = async e => {
        e.preventDefault();
        const botao = el("chatterEntrar");
        botao.disabled = true;
        el("chatterAviso").textContent = "";
        try {
          const res = await chamar("/entrar", {
            method: "POST",
            body: JSON.stringify({
              codigo: el("chatterCodigo").value,
              pin: el("chatterPin").value
            })
          });
          if (res.status === 401) return logout();
          const dados = await res.json().catch(() => ({}));
          if (!res.ok) {
            el("chatterAviso").textContent = dados.erro || dados.error || "Não foi possível entrar.";
            el("chatterPin").value = "";
            return;
          }
          sessionStorage.setItem(CHAVE, dados.token);
          resolve(dados.nome);
        } catch (_) {
          el("chatterAviso").textContent = "Sem conexão. Tente novamente.";
        } finally {
          botao.disabled = false;
        }
      };
    });
  }

  // Só resolve quando o chat pode ser usado
  async function garantir() {
    while (true) {
      try {
        const res = await chamar("/status");
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error("HTTP " + res.status);
        const { obrigatorio, sessao } = await res.json();

        if (!obrigatorio) return liberar();
        if (sessao) return liberar(sessao.nome);

        sessionStorage.removeItem(CHAVE);
        return liberar(await pedirIdentificacao());
      } catch (err) {
        console.error("Erro ao verificar identificação:", err);
        mostrarTela("erro", "Não foi possível verificar sua identificação.");
        await new Promise(resolve => { el("chatterTentar").onclick = resolve; });
        mostrarTela("carregando", "Verificando…");
      }
    }
  }

  // Sessão encerrada: recarrega para o próximo começar do zero
  function encerrada() {
    sessionStorage.removeItem(CHAVE);
    location.reload();
  }

  document.addEventListener("DOMContentLoaded", () => {
    el("chatterSair").addEventListener("click", async () => {
      if (!confirm("Registrar sua saída deste chat?")) return;
      try {
        const res = await chamar("/sair", { method: "POST" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        encerrada();
      } catch (_) {
        alert("Não foi possível registrar a saída. Tente novamente.");
      }
    });
  });

  return { ler, garantir, encerrada };
})();
