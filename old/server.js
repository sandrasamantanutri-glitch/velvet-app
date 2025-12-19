
// ===============================
// SERVER.JS – VERSÃO ESTÁVEL
// ===============================

const chatsAtivos = {};
const unread = {};
const path = require("path");
const messagesFile = path.join(__dirname, "data", "messages.json");
const chats = path.join(__dirname, "chats.json");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
app.use(express.static("public"));
const multer = require("multer");
const onlineClientes = {};
const onlineModelos = {};
const conteudosServer = require("./conteudos.server");

const UNREAD_FILE = "unread.json";

const unreadMap = fs.existsSync(UNREAD_FILE)
  ? JSON.parse(fs.readFileSync(UNREAD_FILE, "utf8"))
  : {};


conteudosServer(app, io);
require("./conteudos.server")(app);

//blindagem vip

const SUBSCRIPTIONS_FILE = path.join(__dirname, "subscriptions.json");

function lerAssinaturas() {
  if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, "utf8"));
}

function salvarAssinaturas(data) {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2));
}

function verificarAssinatura(cliente, modelo) {
  const subs = lerAssinaturas();
  return subs[modelo]?.includes(cliente);
}

function adicionarAssinatura(cliente, modelo) {
  const subs = lerAssinaturas();

  if (!subs[modelo]) subs[modelo] = [];
  if (!subs[modelo].includes(cliente)) {
    subs[modelo].push(cliente);
    salvarAssinaturas(subs);
  }
}
////BLINDAGEM UNREAD
// ao atualizar unread
fs.writeFileSync(
  "unread.json",
  JSON.stringify(unreadMap, null, 2)
);

// ===============================
// MIDDLEWARES
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// PASTA BASE
// ===============================
const BASE_UPLOADS = path.join(__dirname, "uploads", "modelos");
if (!fs.existsSync(BASE_UPLOADS)) fs.mkdirSync(BASE_UPLOADS, { recursive: true });

// ===============================
// MULTER (AVATAR + CAPA)
// ===============================
const storageModelo = multer.diskStorage({
  destination: (req, file, cb) => {
    const modelo = req.body.modelo; // ✅ CORRETO
    if (!modelo) return cb(new Error("Modelo não informado"));

    const pastaModelo = path.join(BASE_UPLOADS, modelo);
    if (!fs.existsSync(pastaModelo)) {
      fs.mkdirSync(pastaModelo, { recursive: true });
    }

    cb(null, pastaModelo);
  },
  filename: (req, file, cb) => {
    if (file.fieldname === "avatar") cb(null, "avatar.jpg");
    else if (file.fieldname === "capa") cb(null, "capa.jpg");
    else cb(null, file.originalname);
  }
});


const uploadModelo = multer({ storage: storageModelo });

// ===============================
// ROTAS DE PERFIL
// ===============================

// 🔹 GET PERFIL COMPLETO
app.get("/getPerfil/:modelo", (req, res) => {
    const modelo = req.params.modelo;
    const pasta = path.join(BASE_UPLOADS, modelo);

    const avatarPath = path.join(pasta, "avatar.jpg");
    const capaPath   = path.join(pasta, "capa.jpg");
    const bioPath    = path.join(pasta, "bio.txt");

    res.json({
        nome: modelo,
        avatar: fs.existsSync(avatarPath)
            ? `/uploads/modelos/${modelo}/avatar.jpg`
            : "/assets/avatarDefault.png",
        capa: fs.existsSync(capaPath)
            ? `/uploads/modelos/${modelo}/capa.jpg`
            : "/assets/capaDefault.jpg",
        bio: fs.existsSync(bioPath)
            ? fs.readFileSync(bioPath, "utf8")
            : ""
    });
});

//ROTA VIP
app.get("/api/modelo/:modelo/vips", (req, res) => {
    try {
        const modelo = req.params.modelo;
        const subs = readJSON(SUBSCRIPTIONS_FILE, {});

        const clientes = subs[modelo] || [];

        res.json(clientes.map(cliente => ({
            cliente,
            since: null
        })));
    } catch (err) {
        console.error("Erro /vips:", err);
        res.status(500).json([]);
    }
});


// 🔹 SALVAR BIO
app.post("/saveBio", (req, res) => {
    const { bio, modelo } = req.body;
    if (!modelo) return res.status(400).json({ success: false });

    const pasta = path.join(BASE_UPLOADS, modelo);
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });

    fs.writeFileSync(path.join(pasta, "bio.txt"), bio || "");
    res.json({ success: true });
});

// ===============================
// UPLOAD AVATAR E CAPA
// ===============================
const uploadAvatar = multer({ storage: multer.memoryStorage() });

app.post("/uploadAvatar", uploadAvatar.single("avatar"), (req, res) => {
  try {
    const { modelo } = req.body;

    if (!modelo || !req.file) {
      return res.status(400).json({ success: false });
    }

    const pastaModelo = path.join(__dirname, "uploads", "modelos", modelo);
    if (!fs.existsSync(pastaModelo)) {
      fs.mkdirSync(pastaModelo, { recursive: true });
    }

    const caminhoAvatar = path.join(pastaModelo, "avatar.jpg");
    fs.writeFileSync(caminhoAvatar, req.file.buffer);

    res.json({
      success: true,
      avatar: `/uploads/modelos/${modelo}/avatar.jpg`
    });
  } catch (err) {
    console.error("❌ ERRO UPLOAD AVATAR:", err);
    res.status(500).json({ success: false });
  }
});

const uploadCapa = multer({ storage: multer.memoryStorage() });
app.post("/uploadCapa", uploadCapa.single("capa"), (req, res) => {
  try {
    const { modelo } = req.body;

    if (!modelo) {
      return res.status(400).json({ success: false, error: "Modelo não enviado" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: "Arquivo não enviado" });
    }

    const pastaModelo = path.join(__dirname, "uploads", "modelos", modelo);

    if (!fs.existsSync(pastaModelo)) {
      fs.mkdirSync(pastaModelo, { recursive: true });
    }

    const caminhoCapa = path.join(pastaModelo, "capa.jpg");
    fs.writeFileSync(caminhoCapa, req.file.buffer);

    res.json({
      success: true,
      capa: `/uploads/modelos/${modelo}/capa.jpg`
    });

  } catch (err) {
    console.error("❌ ERRO UPLOAD CAPA:", err);
    res.status(500).json({ success: false, error: "Erro interno no servidor" });
  }
});


// ===============================
// FEED – MÍDIAS
// ===============================

const storageMidias = multer.diskStorage({
    destination: (req, file, cb) => {
        const modelo = req.query.modelo;
        if (!modelo) return cb(new Error("Modelo não informado"));

        const pasta = path.join(BASE_UPLOADS, modelo, "midias");
        if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
        cb(null, pasta);
    },
    filename: (req, file, cb) => {
        const nome = Date.now() + path.extname(file.originalname);
        cb(null, nome);
    }
});

const uploadMidia = multer({ storage: storageMidias });

// 🔹 UPLOAD MÍDIA
app.post("/uploadMidia", uploadMidia.single("midia"), (req, res) => {
    const modelo = req.query.modelo;
    const url = `/uploads/modelos/${modelo}/midias/${req.file.filename}`;
    res.json({ url });
});

// 🔹 GET MÍDIAS
app.get("/getMidias/:modelo", (req, res) => {
    const modelo = req.params.modelo;
    const pasta = path.join(BASE_UPLOADS, modelo, "midias");

    if (!fs.existsSync(pasta)) return res.json({ midias: [] });

    const arquivos = fs.readdirSync(pasta).map(f => `/uploads/modelos/${modelo}/midias/${f}`);
    res.json({ midias: arquivos });
});

// 🔹 DELETE MÍDIA
app.post("/deleteMidia", (req, res) => {
    const { url } = req.body;
    if (!url) return res.json({ success: false });

    const filePath = path.join(__dirname, url);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return res.json({ success: true });
    }
    res.json({ success: false });
});

//======================ATUALIZA FEED
app.get("/getModelos", (req, res) => {
    const base = path.join(__dirname, "uploads", "modelos");

    if (!fs.existsSync(base)) {
        return res.json({ modelos: [] });
    }

    const modelos = fs.readdirSync(base)
        .filter(nome => fs.statSync(path.join(base, nome)).isDirectory())
        .map(nome => {
            const avatarPath = path.join(base, nome, "avatar.jpg");

            return {
                nome,
                avatar: fs.existsSync(avatarPath)
                    ? `/uploads/modelos/${nome}/avatar.jpg`
                    : "/assets/avatarDefault.png"
            };
        });

    res.json({ modelos });
});

//========================================
//ROTA CONTEUDOS
//=========================================
// LISTAR CONTEÚDOS
app.get("/getConteudos", (req, res) => {
const { modelo } = req.query;
const pasta = path.join("uploads", "modelos", modelo, "conteudos");


if (!fs.existsSync(pasta)) return res.json([]);


const arquivos = fs.readdirSync(pasta).map(nome => {
const ext = path.extname(nome);
return {
id: nome,
tipo: ext === ".mp4" ? "video" : "imagem",
url: `/uploads/modelos/${modelo}/conteudos/${nome}`
};
});


res.json(arquivos);
});


// UPLOAD CONTEÚDO
const uploadConteudo = multer({ storage: multer.diskStorage({
destination: (req, file, cb) => {
const pasta = path.join("uploads", "modelos", req.query.modelo, "conteudos");
fs.mkdirSync(pasta, { recursive: true });
cb(null, pasta);
},
filename: (req, file, cb) => {
cb(null, Date.now() + path.extname(file.originalname));
}
})});


app.post("/uploadConteudo", uploadConteudo.single("conteudo"), (req, res) => {
res.json({ success: true });
});

app.post("/api/subscribeVIP", (req, res) => {
    try {
        const { cliente, modelo } = req.body;

        if (!cliente || !modelo) {
            return res.status(400).json({ success: false });
        }

        const subs = readJSON(SUBSCRIPTIONS_FILE, {});

        // garante lista por modelo
        if (!Array.isArray(subs[modelo])) {
            subs[modelo] = [];
        }

        // evita duplicado
        if (!subs[modelo].includes(cliente)) {
            subs[modelo].push(cliente);
        }

        fs.writeFileSync(
            SUBSCRIPTIONS_FILE,
            JSON.stringify(subs, null, 2)
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Erro subscribeVIP:", err);
        res.status(500).json({ success: false });
    }
});

// APAGAR
app.delete("/deleteConteudo", (req, res) => {
const { modelo, id } = req.query;
const caminho = path.join("uploads", "modelos", modelo, "conteudos", id);
if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
res.json({ success: true });
});


// ===============================
// UTILITÁRIOS chat
// ===============================
function readMessages() {
    if (!fs.existsSync("messages.json")) return [];
    return JSON.parse(fs.readFileSync("messages.json"));
}

function saveMessages(messages) {
    fs.writeFileSync("messages.json", JSON.stringify(messages, null, 2));
}

function getRoom(cliente, modelo) {
    return `${cliente}__${modelo}`;
}

const subscriptionsFile = path.join(__dirname, "subscriptions.json");

function readSubscriptions() {
    try {
        return JSON.parse(fs.readFileSync(subscriptionsFile, "utf-8"));
    } catch {
        return [];
    }
}

function isVip(cliente, modelo) {
    const subs = readSubscriptions();

    // caso 1: array de objetos
    if (Array.isArray(subs)) {
        return subs.some(
            s => s.cliente === cliente && s.modelo === modelo && s.vip === true
        );
    }

    // caso 2: objeto { cliente: [modelos] }
    if (subs[cliente] && Array.isArray(subs[cliente])) {
        return subs[cliente].includes(modelo);
    }

    // caso 3: objeto { modelo: [clientes] }
    if (subs[modelo] && Array.isArray(subs[modelo])) {
        return subs[modelo].includes(cliente);
    }

    // caso 4: objeto { modelo: { cliente: true } }
    if (subs[modelo] && subs[modelo][cliente]) {
        return true;
    }

    return false;
}

function readJSON(file, fallback = []) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
        console.error("Erro ao ler JSON:", file, err);
        return fallback;
    }
}



// ===============================
// SOCKET.IO
// ===============================
// ===============================
// SOCKET.IO
// ===============================
io.on("connection", socket => {
    console.log("🔥 Socket conectado:", socket.id);

    // LOGIN CLIENTE
    socket.on("loginCliente", cliente => {
        socket.role = "cliente";
        socket.cliente = cliente;
        onlineClientes[cliente] = socket.id;
    });

    // LOGIN MODELO
    socket.on("loginModelo", modelo => {
        socket.role = "modelo";
        socket.modelo = modelo;
        onlineModelos[modelo] = socket.id;
        socket.emit("unreadUpdate", unreadMap[modelo] ?? {});
    });

    // ENTRAR NA SALA
    socket.on("joinRoom", ({ cliente, modelo }) => {
        const room = `${cliente}__${modelo}`;
        socket.join(room);

        const history = readMessages().filter(
            m => m.cliente === cliente && m.modelo === modelo
        );
        socket.emit("chatHistory", history);

        if (socket.role === "cliente" && unreadMap[cliente]) {
            delete unreadMap[cliente][modelo];
            socket.emit("unreadUpdate", unreadMap[cliente]);
        }
    });

    socket.on("markAsRead", ({ cliente, modelo }) => {
    if (unreadMap[modelo]) {
        delete unreadMap[modelo][cliente];

        fs.writeFileSync(UNREAD_FILE, JSON.stringify(unreadMap, null, 2));
        
        socket.emit("unreadUpdate", unreadMap[modelo]);
    } });


    // ENVIAR MENSAGEM
    socket.on("sendMessage", ({ cliente, modelo, from, text }) => {

        if (from === cliente && !isVip(cliente, modelo)) {
            socket.emit("errorMessage", "Apenas clientes VIP podem enviar mensagens.");
            return;
        }

        const room = `${cliente}__${modelo}`;

        const newMessage = {
            cliente,
            modelo,
            from,
            text,
            timestamp: Date.now()
        };

        const messages = readMessages();
        messages.push(newMessage);
        saveMessages(messages);

        io.to(room).emit("newMessage", newMessage);

        // UNREAD
        if (from === cliente) {
            unreadMap[modelo] ??= {};
            unreadMap[modelo][cliente] = true;
            
            fs.writeFileSync(UNREAD_FILE, JSON.stringify(unreadMap, null, 2));

            const sid = onlineModelos[modelo];
            if (sid) io.to(sid).emit("unreadUpdate", unreadMap[modelo]);
        }

        if (from === modelo) {
            unreadMap[cliente] ??= {};
            unreadMap[cliente][modelo] = true;

            const sid = onlineClientes[cliente];
            if (sid) io.to(sid).emit("unreadUpdate", unreadMap[cliente]);
        }
    });
    

    // DISCONNECT
    socket.on("disconnect", () => {
        console.log("❌ Socket desconectado:", socket.id);
    });
});

//--------------------------------------------------------------------------------------------

app.get("/api/modelo/:modelo/clientes", (req, res) => {
    const modelo = req.params.modelo;
    const messages = readMessages();
    const subs = readSubscriptions();

    // clientes que já falaram
    const clientes = [...new Set(
        messages
            .filter(m => m.modelo === modelo)
            .map(m => m.cliente)
    )];

    // só VIPs
    const clientesVip = clientes.filter(cliente =>
        subs[cliente] && subs[cliente].includes(modelo)
    );

    res.json(clientesVip);
});


app.get("/api/cliente/:cliente/modelos", (req, res) => {
    const cliente = req.params.cliente;
    const messages = readMessages();

    const modelos = [...new Set(
        messages
            .filter(m => m.cliente === cliente)
            .map(m => m.modelo)
    )];

    res.json(modelos);
});

app.get("/api/modelo/:modelo/ultima-resposta", (req, res) => {
    try {
        const modelo = req.params.modelo;
        const messages = readMessages();

        const ultimas = {};

        messages.forEach(m => {
            if (m.modelo !== modelo) return;

            // considera texto OU conteúdo enviado pela modelo
            if (m.from === modelo) {
                ultimas[m.cliente] = m.timestamp;
            }
        });

        res.json(ultimas);
    } catch (err) {
        console.error("Erro ultima-resposta:", err);
        res.status(500).json({});
    }
});

// ===============================
// START SERVER
// ===============================
const PORT = 3000;
server.listen(PORT, () => {
    console.log("🚀 Chat server rodando em http://localhost:" + PORT);
});
