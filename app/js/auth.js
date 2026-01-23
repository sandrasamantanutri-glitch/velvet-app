// AUTH
async function register() {
  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;
  const role = document.getElementById("role").value;

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, senha, role })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro no registro");
      return;
    }

    alert("Registrado com sucesso");
  } catch (err) {
    console.error(err);
    alert("Erro de conexão");
  }
}

async function login() {
  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, senha })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Login inválido");
      return;
    }

    // salvar sessão
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);

    console.log("REDIRECT AGORA");

    // 🚀 REDIRECIONAMENTO FORÇADO
    window.location.replace("/app/inbox.html");

  } catch (err) {
    console.error("ERRO LOGIN:", err);
    alert("Erro de conexão");
  }
}
