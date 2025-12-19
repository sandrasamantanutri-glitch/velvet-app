
// ===============================
// SERVER.JS – VERSÃO ESTÁVEL
// ===============================
require("dotenv").config();
const express = require("express");
const chatsAtivos = {};
const unread = {};
const path = require("path");
const messagesFile = path.join(__dirname, "messages.json");
const http = require("http")
const { Server } = require("socket.io");
const fs = require("fs");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
app.use(express.static("public"));
const multer = require("multer");
app.use("/assets", express.static(path.join(__dirname, "assets")));
const onlineClientes = {};
const onlineModelos = {};
const UNREAD_FILE = "unread.json";
const VIP_PRECO = 0.1;
const valorVip = 0.1; // 💰 preço da subscrição VIP

const unreadMap = fs.existsSync(UNREAD_FILE)
? JSON.parse(fs.readFileSync(UNREAD_FILE, "utf8")) : {};

require("dotenv").config({
  path: require("path").resolve(__dirname, ".env")
});
console.log(
  "MP TOKEN INICIA COM:",
  process.env.MP_ACCESS_TOKEN?.slice(0, 8)
);

const { MercadoPagoConfig, Payment } = require("mercadopago");

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const paymentClient = new Payment(mpClient);

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
fs.writeFileSync(
  "unread.json",
  JSON.stringify(unreadMap, null, 2)
);
// ===============================
// MIDDLEWARES
// ===============================
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
  const modelo = req.params.modelo;
  const subs = lerAssinaturas();
  res.json(subs[modelo] || []);
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

        const pasta = path.join(__dirname, "uploads", "modelos", modelo, "conteudos")

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
const pasta = path.join(__dirname, "uploads", "modelos", modelo, "conteudos");

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
const pasta = path.join(__dirname, "uploads", "modelos", req.query.modelo, "conteudos");
fs.mkdirSync(pasta, { recursive: true });
cb(null, pasta);
},
filename: (req, file, cb) => {
cb(null, Date.now() + path.extname(file.originalname));
}
})});


app.post("/uploadConteudo", uploadConteudo.single("conteudo"), (req, res) => {
  const modelo = req.query.modelo;
  const preco = Number(req.body.preco || 0);

  if (!modelo || !req.file) {
    return res.status(400).json({ success: false });
  }

  const id = Date.now().toString();

  const novo = {
    id,
    type: "conteudo",
    cliente: null,          // ainda não foi enviado
    modelo,
    from: modelo,
    arquivo: req.file.filename,
    tipo: req.file.mimetype.startsWith("video") ? "video" : "imagem",
    preco,
    timestamp: Date.now()
  };

  const messages = readMessages();
  messages.push(novo);
  saveMessages(messages);

  res.json({ success: true, id });
});


// APAGAR
app.delete("/deleteConteudo", (req, res) => {
const { modelo, id } = req.query;
const caminho = path.join(__dirname, "uploads", "modelos", modelo, "conteudos")
if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
res.json({ success: true });
});


// ===============================
// UTILITÁRIOS chat
// ===============================
function readMessages() {
    if (!fs.existsSync(messagesFile)) return [];
    return JSON.parse(fs.readFileSync(messagesFile, "utf8"));
}

function saveMessages(messages) {
    fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}


function getRoom(cliente, modelo) {
    return `${cliente}__${modelo}`;
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

const COMPRAS_FILE = "compras.json";

function readCompras() {
  if (!fs.existsSync(COMPRAS_FILE)) return [];
  return JSON.parse(fs.readFileSync(COMPRAS_FILE, "utf8"));
}

function saveCompras(data) {
  fs.writeFileSync(COMPRAS_FILE, JSON.stringify(data, null, 2));
}

function isConteudoPago(cliente, modelo, conteudoId) {
  const compras = readCompras();
  return compras.some(
    c =>
      c.cliente === cliente &&
      c.modelo === modelo &&
      c.conteudoId === conteudoId &&
      c.status === "pago"
  );
}




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
        const history = readMessages()
  .filter(m => m.cliente === cliente && m.modelo === modelo)
  .map(m => {
    if (m.type === "conteudo") {
      m.pago = isConteudoPago(cliente, modelo, m.id);
    }
    return m;
  });

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

        if (from === cliente && !verificarAssinatura(cliente, modelo)) {
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

socket.on("sendContent", ({ cliente, modelo, conteudoId, preco }) => {

  // 🛑 SE JÁ FOI PAGO, ENVIA DIRETO DESBLOQUEADO
  if (isConteudoPago(cliente, modelo, conteudoId)) {
    console.log("⚠️ Conteúdo já pago, enviando desbloqueado");

    const caminho = path.join(
      __dirname,
      "uploads",
      "modelos",
      modelo,
      "conteudos",
      conteudoId
    );

    if (!fs.existsSync(caminho)) {
      console.error("Conteúdo não encontrado:", caminho);
      return;
    }

    const tipo = conteudoId.endsWith(".mp4") ? "video" : "imagem";

    const novo = {
      type: "conteudo",
      id: conteudoId,
      arquivo: conteudoId,
      tipo,
      preco: 0,          // 🔑 SEMPRE ZERO
      pago: true,        // 🔑 MARCA COMO PAGO
      cliente,
      modelo,
      from: modelo,
      timestamp: Date.now()
    };

    const messages = readMessages();
    messages.push(novo);
    saveMessages(messages);

    io.to(`${cliente}__${modelo}`).emit("newMessage", novo);
    console.log("🔓 Conteúdo já pago enviado desbloqueado");

    return; // ⛔ MUITO IMPORTANTE
  }

  // 🔒 CASO NORMAL → ENVIA BLOQUEADO
  const tipo = conteudoId.endsWith(".mp4") ? "video" : "imagem";

  const novo = {
    type: "conteudo",
    id: conteudoId,
    arquivo: conteudoId,
    tipo,
    preco: preco ?? 0,
    cliente,
    modelo,
    from: modelo,
    timestamp: Date.now()
  };

  const messages = readMessages();
  messages.push(novo);
  saveMessages(messages);

  io.to(`${cliente}__${modelo}`).emit("newMessage", novo);
});

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("❌ Socket desconectado:", socket.id);
  });

});

//-------------------------------------------------------------------------------------------- 
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


app.get("/conteudo/abrir", (req, res) => {
  const { modelo, conteudoId } = req.query;

  if (!modelo || !conteudoId) {
    return res.status(400).send("Dados inválidos");
  }

  const caminho = path.join(__dirname, "uploads", "modelos", modelo, "conteudos", conteudoId);

  console.log("🔎 Tentando abrir:", caminho);


  if (!fs.existsSync(caminho)) {
    console.log("❌ NÃO EXISTE");
    return res.status(404).send("Arquivo não encontrado");
  }

  console.log("✅ EXISTE");
  res.sendFile(caminho);
});


//***************************************************************************************************************** */

app.post("/api/pagamentos/criar", async (req, res) => {
  try {
    const { cliente, modelo, conteudoId, preco } = req.body;
    const valor = Number(preco);

    if (isNaN(valor) || valor <= 0) {
  return res.status(400).json({ error: "Preço inválido" });
}

    if (!cliente || !modelo || !conteudoId) {
      return res.status(400).json({ error: "Dados inválidos" });
    }

    const payment = await paymentClient.create({
      body: {
      transaction_amount: valor,
      description: `Conteúdo ${conteudoId}`,
      payment_method_id: "pix",
      payer: {
        email: "teste@teste.com"
      },
      external_reference: `${cliente}_${modelo}_${conteudoId}`,
      metadata: { cliente, modelo, conteudoId },
      notification_url:
        "https://nontemperamental-teresa-peaked.ngrok-free.dev/api/pagamentos/webhook"
    }
    });

    res.json({
      pix: payment.point_of_interaction.transaction_data
    });

  } catch (err) {
    console.error("Erro criar pagamento:", err);
    res.status(500).json({ error: "Erro ao criar pagamento" });
  }
});

function desbloquearConteudo(cliente, modelo, conteudoId) {
  const compras = readCompras();

  // 🔒 evita duplicar compra
  const jaPago = compras.some(
    c =>
      c.cliente === cliente &&
      c.modelo === modelo &&
      c.conteudoId === conteudoId &&
      c.status === "pago"
  );

  if (!jaPago) {
    compras.push({
      cliente,
      modelo,
      conteudoId,
      status: "pago",
      data: Date.now()
    });

    saveCompras(compras);
  }

  // 🔔 avisa em tempo real
  io.to(`${cliente}__${modelo}`).emit("conteudoDesbloqueado", {
    cliente,
    modelo,
    conteudoId
  });

  console.log("🔓 Conteúdo desbloqueado:", cliente, modelo, conteudoId);
}


app.post("/api/pagamentos/webhook", async (req, res) => {
  try {
    console.log("🔔 WEBHOOK RECEBIDO:", req.body);

    const paymentId =
      req.body?.data?.id ||
      req.body?.resource;

    if (!paymentId) {
      console.log("⚠️ Webhook sem paymentId");
      return res.sendStatus(200);
    }

    const payment = await paymentClient.get({ id: paymentId });

    console.log("💰 STATUS:", payment.status);
    console.log("📦 METADATA:", payment.metadata);

    if (payment.status !== "approved") {
      return res.sendStatus(200);
    }
    const tipo = payment.metadata?.tipo;

// 🌟 PAGAMENTO VIP
if (tipo === "vip") {
  const { cliente, modelo } = payment.metadata;

  adicionarAssinatura(cliente, modelo);

  // 🔔 avisa o cliente em tempo real
  const sid = onlineClientes[cliente];
  if (sid) {
    io.to(sid).emit("vipAtivo", { modelo });
  }

  console.log("🌟 VIP ATIVADO:", cliente, modelo);
  return res.sendStatus(200);
}


    const { cliente, modelo } = payment.metadata || {};
    const conteudoId =
      payment.metadata?.conteudoId ||
      payment.metadata?.conteudo_id;

    if (!cliente || !modelo || !conteudoId) {
      console.log("❌ METADATA INCOMPLETA");
      return res.sendStatus(200);
    }

    desbloquearConteudo(cliente, modelo, conteudoId);

    console.log("🔓 CONTEÚDO DESBLOQUEADO");

    return res.sendStatus(200);

  } catch (err) {
    console.error("🔥 ERRO WEBHOOK:", err);
    return res.sendStatus(500);
  }
});

/////////////ROTA PGMT VIP//////////////////
app.post("/api/vip/criar", async (req, res) => {
  try {
    const { cliente, modelo } = req.body;

    if (!cliente || !modelo) {
      return res.status(400).json({ error: "Dados inválidos" });
    }

    // 🛑 Já é VIP?
    if (verificarAssinatura(cliente, modelo)) {
      return res.status(409).json({ error: "Cliente já é VIP" });
    }

    const payment = await paymentClient.create({
      body: {
        transaction_amount: valorVip,
        description: `VIP ${modelo}`,
        payment_method_id: "pix",
        payer: { email: "teste@teste.com" },

        metadata: {
          tipo: "vip",   // 🔑 DIFERENCIADOR
          cliente,
          modelo
        },

        notification_url:
          "https://nontemperamental-teresa-peaked.ngrok-free.dev/api/pagamentos/webhook"
      }
    });

   res.json({
  pix: payment.point_of_interaction.transaction_data,
  preco: VIP_PRECO
});


  } catch (err) {
    console.error("Erro criar VIP:", err);
    res.status(500).json({ error: "Erro ao criar VIP" });
  }
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});

