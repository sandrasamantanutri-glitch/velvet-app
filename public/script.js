const socket = io();
/* ===========================
    VARIÁVEIS PRINCIPAIS
=========================== */
let role = null;
let myName = null;
let currentClient = null;
let clientCredits = 20;

/* ===========================
   SELEÇÃO DE PAPEL (LOGIN)
=========================== */
function selectRole(r) {
    // esconde os dois
    document.getElementById("creatorNameBox").classList.add("hidden");
    document.getElementById("clientNameBox").classList.add("hidden");

    // mostra o correto
    if (r === "creator") {
        document.getElementById("creatorNameBox").classList.remove("hidden");
    }

    if (r === "client") {
        document.getElementById("clientNameBox").classList.remove("hidden");
    }
}

/* ===========================
    LOGIN
=========================== */
function enterCreator() {
    console.log("🔥 ENTER CREATOR FOI CHAMADO");

    const name = document.getElementById("creatorName")?.value?.trim();
    console.log("👉 Nome digitado:", name);

    if (!name) {
        alert("Digite seu nome!");
        return;
    }

    localStorage.setItem("userRole", "modelo");
    localStorage.setItem("modeloPerfil", name);

    console.log("✅ userRole:", localStorage.getItem("userRole"));
    console.log("✅ modeloPerfil:", localStorage.getItem("modeloPerfil"));

    window.location.href = "profile.html";
}


function enterClient() {
    const name = document.getElementById("clientName").value.trim();
    if (!name) return alert("Digite seu nome!");

    localStorage.setItem("userRole", "cliente");  // ✅ CONSISTENTE
    localStorage.setItem("clientName", name);

    window.location.href = "clientHome.html";
}


/* ===========================
    LISTA DE CLIENTES NA CRIADORA
=========================== */
socket.on("updateList", ({ users, online }) => {
    const list = document.getElementById("clientList");
    if (!list) return;

    list.innerHTML = "";

    users.forEach(name => {
        const li = document.createElement("li");
        li.innerHTML = `
            ${name}
            <span class="${online[name] ? "onlineDot" : "offlineDot"}">●</span>
        `;
        li.onclick = () => openClientChat(name);
        list.appendChild(li);
    });
});

/* ===========================
    LISTA DE MODELOS NO CLIENTE
=========================== */
socket.on("updateModelList", models => {
    const list = document.getElementById("modelList");
    if (!list) return;

    list.innerHTML = "";

    models.forEach(m => {
        const li = document.createElement("li");
        li.innerHTML = `
            ${m.name}
            <span class="${m.online ? "onlineDot" : "offlineDot"}">●</span>
        `;
        li.onclick = () => openModelChat(m.name);
        list.appendChild(li);
    });
});

/* ===========================
    ABRIR CHAT NA CRIADORA
=========================== */
function openClientChat(name) {
    currentClient = name;

    document.getElementById("headerClientName").innerText = name;

    socket.emit("checkStatus", name);

    loadConversation(name);
}

/* ===========================
    STATUS CLIENTE
=========================== */
socket.on("clientStatus", ({ username, online }) => {
    document.getElementById("clientStatusText").innerHTML = `
        <span class="${online ? "onlineDot" : "offlineDot"}">●</span>
        ${online ? "Online" : "Offline"}
    `;
});

/* ===========================
    ABRIR CHAT DO CLIENTE
=========================== */
function openModelChat(modelName) {
    document.getElementById("clientHeaderName").innerText = modelName;
}

/* ===========================
    ENVIO DA CRIADORA
=========================== */
function sendCreatorMsg() {
    if (!currentClient) return alert("Selecione um cliente!");

    const msg = document.getElementById("creatorMsg").value.trim();
    if (!msg) return;

    // mostrar mensagem local
    addMessage_CreatorSide({ msg, sender: "Criadora" });

    socket.emit("registerUser", {
    name: creatorName,
    type: "model"
});
    socket.emit("registerUser", {
    name: clientName,
    type: "client"
});

    document.getElementById("creatorMsg").value = "";
}

/* ===========================
    RECEBIMENTO NA CRIADORA
=========================== */
socket.on("newMessageCreator", ({ user, text }) => {

    if (!currentClient) {
        currentClient = user;
        document.getElementById("headerClientName").innerText = user;
    }

    addMessage_CreatorSide({
        sender: user,
        msg: text
    });

});   // <-- FECHAMENTO CORRETO DO socket.on("newMessageCreator")

/*FUNCAOPAGINACONTEUDOS*/
function openConteudosPage() {
    window.open("/conteudos.html", "conteudosWindow", "width=900,height=700");
}

/* LISTA DE CONTEÚDOS */
socket.on("conteudoExclusivoLista", (conteudos) => {
    const lista = document.getElementById("listaConteudos");
    if (!lista) return;

    lista.innerHTML = "";

    conteudos.forEach(item => {
        const div = document.createElement("div");
        div.className = "card-conteudo";

        if (item.tipo === "image") {

            div.innerHTML = `
                <img src="${item.arquivo}">
            `;

        } else if (item.tipo === "video") {

            div.innerHTML = `
                <video controls preload="metadata">
                    <source src="${item.arquivo}" type="video/mp4">
                </video>
            `;

        }

        lista.appendChild(div);
    });  // <-- FECHA O forEach
});      // <-- FECHA o socket.on("conteudoExclusivoLista")


/* ===========================
    RECEBIMENTO NO CLIENTE
=========================== */
socket.on("newMessage", ({ from, text, fileBase64, locked, priceCredits }) => {
    addMessage_ClientSide({
        msg: text,
        sender: from
    });
});

/* ===========================
    MOSTRAR NO CHAT — CRIADORA
=========================== */
function addMessage_CreatorSide(data) {
    const box = document.getElementById("chatBoxCreator");
    const div = document.createElement("div");

    div.classList.add("msg");

    const isCreator = data.sender === "Criadora";

    if (isCreator) {
        div.classList.add("rightMsg", "creatorColor");
    } else {
        div.classList.add("leftMsg", "clientColor");
    }

    div.innerText = data.msg || "";
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

/* ===========================
FUNCAO DO MENU
=========================== */
async function uploadConteudoExclusivo() {
    const file = document.getElementById("conteudoFile").files[0];
    if (!file) return alert("Selecione um arquivo!");

    const form = new FormData();
    form.append("file", file);

    // 1) Envia arquivo real para o servidor
    const resp = await fetch("/upload", {
        method: "POST",
        body: form
    });

    const data = await resp.json();

    if (data.error) return alert("Erro no upload!");

    // 2) Envia somente a URL pelo socket
    socket.emit("conteudoExclusivoUpload", {
        nomeArquivo: file.name,
        url: data.url,
        tipo: data.tipo,
        mime: data.mime
    });
}
/* ===========================
    MOSTRAR NO CHAT — CLIENTE
=========================== */
function addMessage_ClientSide(data) {
    const box = document.getElementById("chatBoxClient");
    const div = document.createElement("div");

    div.classList.add("msg");

    const isCreator = data.sender === "Criadora";

    if (isCreator) {
        div.classList.add("rightMsg", "creatorColor");
    } else {
        div.classList.add("leftMsg", "clientColor");
    }

    div.innerText = data.msg || "";
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

/* ===========================
    ENVIO DO CLIENTE
=========================== */
function sendClientMsg() {
    const msg = document.getElementById("clientMsg").value.trim();
    if (!msg) return;

    addMessage_ClientSide({ msg, sender: myName });

    socket.emit("sendMessage", {
        sender: myName,
        to: "Criadora",
        text: msg
    });

    document.getElementById("clientMsg").value = "";
}

/* ===========================
    SISTEMA DE MÍDIA (Inalterado)
=========================== */
function openCreatorFile() { document.getElementById("creatorFile").click(); }

/* ===========================
    PAINEL LATERAL DA CRIADORA
=========================== */

function openCreatorPanel() {
    const panel = document.getElementById("creatorPanel");
    if (!panel) return;

    panel.classList.remove("hidden"); // painel aparece
    panel.classList.add("show");      // aplica CSS de abrir
}

function closeCreatorPanel() {
    const panel = document.getElementById("creatorPanel");
    if (!panel) return;

    panel.classList.remove("show");   // fecha visualmente
    panel.classList.add("hidden");    // some da tela
}

document.addEventListener("DOMContentLoaded", () => {

    const urlParams = new URLSearchParams(window.location.search);
    const userType = localStorage.getItem("userType");

    // ⚠️ Só força login cliente SE NÃO for modelo
    if (urlParams.get("abrirChat") === "true" && userType !== "modelo") {

        const savedName = localStorage.getItem("clientName");

        if (savedName) {
            selectRole("client");
            document.getElementById("clientName").value = savedName;
            enterClient();
        } else {
            selectRole("client");
        }
    }

});

