const mensagemInput = document.getElementById("mensagem");
const precoInput = document.getElementById("preco");
const midiasInput = document.getElementById("midias");
const preview = document.getElementById("preview");

const btnEnviar = document.getElementById("btnEnviar");
const btnTeste = document.getElementById("btnTeste");

const token = localStorage.getItem("token");

// 🔍 PREVIEW DE MIDIAS
midiasInput.addEventListener("change", () => {
  preview.innerHTML = "";

  Array.from(midiasInput.files).forEach(file => {
    const url = URL.createObjectURL(file);

    if (file.type.startsWith("video")) {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      preview.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = url;
      preview.appendChild(img);
    }
  });
});

// 🚀 ENVIO
async function enviarAllMessage(modoTeste = false) {
  const texto = mensagemInput.value.trim();
  const preco = Number(precoInput.value);

  if (!texto || !preco || preco < 1) {
    alert("Preencha a mensagem e um preço válido.");
    return;
  }

  const formData = new FormData();
  formData.append("texto", texto);
  formData.append("preco", preco);
  formData.append("modo_teste", modoTeste);

  Array.from(midiasInput.files).forEach(file => {
    formData.append("midias", file);
  });

  btnEnviar.disabled = true;
  btnTeste.disabled = true;

  try {
    const res = await fetch("/api/allmessage", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      },
      body: formData
    });

    if (!res.ok) throw new Error("Erro ao enviar");

    alert(modoTeste
      ? "✅ AllMessage de teste enviado!"
      : "✅ AllMessage enviado para todos os assinantes!"
    );

    mensagemInput.value = "";
    precoInput.value = "";
    midiasInput.value = "";
    preview.innerHTML = "";

  } catch (err) {
    console.error(err);
    alert("Erro ao enviar AllMessage.");
  } finally {
    btnEnviar.disabled = false;
    btnTeste.disabled = false;
  }
}

btnEnviar.onclick = () => enviarAllMessage(false);
btnTeste.onclick = () => enviarAllMessage(true);
