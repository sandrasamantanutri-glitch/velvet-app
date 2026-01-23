// AUTH
async function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password, role })
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
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
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
    window.location.replace("/frontend/inbox.html");

  } catch (err) {
    console.error("ERRO LOGIN:", err);
    alert("Erro de conexão");
  }
}
