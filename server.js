
// ===============================
// SERVER.JS – VERSÃO ESTÁVEL
// ===============================
require("dotenv").config();      // 🔑 PRIMEIRO
const JWT_SECRET = process.env.JWT_SECRET;
console.log("JWT_SECRET carregado?", JWT_SECRET);

const cors = require("cors");
const express = require("express");
const db = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const chatsAtivos = {};
const unread = {};
const unreadMap = {};
const path = require("path");
const messagesFile = path.join(__dirname, "messages.json");
const http = require("http")
const { Server } = require("socket.io");
const fs = require("fs");
const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
app.use(express.static("public"));
const multer = require("multer");
app.use("/assets", express.static(path.join(__dirname, "assets")));
const onlineClientes = {};
const onlineModelos = {};
const UNREAD_FILE = "unread.json";

const cloudinary = require("cloudinary").v2;

const { MercadoPagoConfig, PreApproval } = require("mercadopago");

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const preApprovalClient = new PreApproval(mpClient);


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.error("❌ CLOUDINARY ENV NÃO CONFIGURADO");
  process.exit(1);
}
function authModelo(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: "Token ausente" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 GARANTA ISSO
    if (decoded.role !== "modelo") {
      return res.status(403).json({ erro: "Apenas modelos" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido" });
  }
}




///ROTA AUTENTIC

// ===============================
// 🔐 MIDDLEWARE DE AUTENTICAÇÃO
// ===============================
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Sem token" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}



function onlyModelo(req, res, next) {
  if (!req.user || req.user.role !== "modelo") {
    return res.status(403).json({ error: "Apenas modelos podem fazer upload" });
  }
  next();
}

app.use(cors({
  origin: ["https://velvet-app-production.up.railway.app"],
  credentials: true
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});


const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// ===============================
// 📦 CONTEÚDOS – MODELO (JWT)
// ===============================

const CONTEUDOS_FILE = "conteudos.json";

function lerConteudos() {
  if (!fs.existsSync(CONTEUDOS_FILE)) {
    fs.writeFileSync(CONTEUDOS_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(CONTEUDOS_FILE, "utf8"));
}

function salvarConteudos(data) {
  fs.writeFileSync(CONTEUDOS_FILE, JSON.stringify(data, null, 2));
}

// 📋 LISTAR CONTEÚDOS DA MODELO
function listarConteudos(req, res) {
  const modeloId = req.user.id;

  const conteudos = lerConteudos().filter(
    c => c.modeloId === modeloId
  );

  res.json(conteudos);
}

// 📤 UPLOAD DE CONTEÚDO
async function uploadConteudo(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo não enviado" });
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `velvet/${req.user.id}/conteudos`,
          resource_type: "auto"
        },
        (err, result) => (err ? reject(err) : resolve(result))
      ).end(req.file.buffer);
    });
    await db.query(
      `
      INSERT INTO conteudos (user_id, url, tipo)
      VALUES ($1, $2, $3)
      `,
      [req.user.id, result.secure_url, result.resource_type]
    );

    res.json({ success: true, url: result.secure_url });

  } catch (err) {
    console.error("Erro upload conteúdo:", err);
    res.status(500).json({ error: "Erro no upload" });
  }
}

async function excluirConteudo(req, res) {
  const { id } = req.params;

  try {
    const result = await db.query(
      "SELECT url FROM conteudos WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Conteúdo não encontrado" });
    }

    const url = result.rows[0].url;

    const publicId = url
      .split("/")
      .slice(-2)
      .join("/")
      .replace(/\.[^/.]+$/, "");

    await cloudinary.uploader.destroy(publicId);

    await db.query(
      "DELETE FROM conteudos WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Erro excluir conteúdo:", err);
    res.status(500).json({ error: "Erro ao excluir conteúdo" });
  }
}

async function clienteEhVip(clienteId, modeloId) {
  const result = await db.query(
    `
    SELECT 1
    FROM vip_assinaturas
    WHERE cliente_id = $1
      AND modelo_id = $2
    `,
    [clienteId, modeloId]
  );

  return result.rowCount > 0;
}


// ===============================
// MIDDLEWARES
// ===============================
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// ATUALIZAR BIO DO MODELO
// ===============================
// ===============================
// ATUALIZAR BIO DO MODELO (POSTGRES)
// ===============================
app.put("/api/modelo/bio", authModelo, async (req, res) => {
  try {
    const { bio } = req.body;

    if (!bio || typeof bio !== "string") {
      return res.status(400).json({ error: "Bio inválida" });
    }

    await db.query(
      "UPDATE public.modelos SET bio = $1 WHERE user_id = $2",
      [bio, req.user.id]
    );

    console.log("BIO SALVA NO BANCO:", req.user.id);

    res.json({ success: true });

  } catch (err) {
    console.error("Erro ao salvar bio:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.get("/api/conteudos", auth, authModelo, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT id, url, tipo, preco, criado_em
      FROM conteudos
      WHERE user_id = $1
      ORDER BY criado_em DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro listar conteúdos:", err);
    res.status(500).json({ error: "Erro ao listar conteúdos" });
  }
});


app.get("/api/me", auth, (req, res) => {
  if (req.user.role !== "modelo") {
    return res.json(req.user);
  }

  const modelos = lerModelos();
  const dados = modelos[req.user.id] || {};

  res.json({
    id: req.user.id,
    role: "modelo",
    avatar: dados.avatar,
    capa: dados.capa,
    bio: dados.bio || "",
    nome: dados.nome || "Modelo"
  });
});


app.get("/api/feed/me", auth, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT id, url, tipo, criado_em
      FROM midias
      WHERE user_id = $1
      ORDER BY criado_em DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro carregar feed:", err);
    res.status(500).json({ error: "Erro ao carregar feed" });
  }
});

// ===============================
// 🌟 FEED OFICIAL DE MODELOS (CLIENTE)
// ===============================
app.get("/api/feed/modelos", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json({ error: "Apenas clientes" });
    }

    const result = await db.query(`
      SELECT
        m.user_id,
        COALESCE(md.nome_exibicao, m.nome) AS nome,
        m.avatar
      FROM modelos m
      JOIN modelos_dados md ON md.user_id = m.user_id
      ORDER BY md.atualizado_em DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("Erro feed modelos:", err);
    res.status(500).json([]);
  }
});

//ROTA CLIENTE PERFIL
// ===============================
// 👀 PERFIL PÚBLICO DA MODELO (CLIENTE)
// ===============================
app.get("/api/modelo/publico/:nome", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json({ error: "Apenas clientes" });
    }

    const { nome } = req.params;

    const result = await db.query(`
      SELECT
        m.user_id AS id,   -- 🔥 ESSENCIAL
        m.nome,
        m.avatar,
        m.capa,
        m.bio
      FROM modelos m
      WHERE m.nome = $1
    `, [nome]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro perfil público:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ===============================
// 👀 FEED PÚBLICO DA MODELO (CLIENTE)
// ===============================
app.get("/api/modelo/:nome/feed", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json({ error: "Apenas clientes" });
    }

    const { nome } = req.params;

    const result = await db.query(`
      SELECT
        c.url,
        c.tipo
      FROM conteudos c
      JOIN modelos m ON m.user_id = c.user_id
      WHERE m.nome = $1
      ORDER BY c.criado_em DESC
    `, [nome]);

    res.json(result.rows);

  } catch (err) {
    console.error("Erro feed público:", err);
    res.status(500).json([]);
  }
});

//ROTA CLIENTE DADOS
// ===============================
// 📄 DADOS DO CLIENTE
// ===============================
app.post("/api/cliente/dados", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json({ error: "Apenas clientes" });
    }

    const {
      username,
      nome_completo,
      data_nascimento,
      pais,
      nome_cartao,
      ultimos4_cartao,
      bandeira_cartao
    } = req.body;

    await db.query(`
      INSERT INTO clientes_dados
        (user_id, username, nome_completo, data_nascimento, pais,
         nome_cartao, ultimos4_cartao, bandeira_cartao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        nome_completo = EXCLUDED.nome_completo,
        data_nascimento = EXCLUDED.data_nascimento,
        pais = EXCLUDED.pais,
        nome_cartao = EXCLUDED.nome_cartao,
        ultimos4_cartao = EXCLUDED.ultimos4_cartao,
        bandeira_cartao = EXCLUDED.bandeira_cartao,
        atualizado_em = NOW()
    `, [
      req.user.id,
      username,
      nome_completo,
      data_nascimento,
      pais,
      nome_cartao || null,
      ultimos4_cartao || null,
      bandeira_cartao || null
    ]);

    res.json({ success: true });

  } catch (err) {
    console.error("Erro salvar dados cliente:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ===============================
// 📸 AVATAR DO CLIENTE
// ===============================
app.post(
  "/api/cliente/avatar",
  auth,
  upload.single("avatar"),
  async (req, res) => {
    try {
      if (req.user.role !== "cliente") {
        return res.status(403).json({ error: "Apenas clientes" });
      }

      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: `velvet/clientes/${req.user.id}/avatar`,
            transformation: [{ width: 400, height: 400, crop: "fill" }]
          },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });

      await db.query(
        "UPDATE clientes_dados SET avatar = $1 WHERE user_id = $2",
        [result.secure_url, req.user.id]
      );

      res.json({ url: result.secure_url });

    } catch (err) {
      console.error("Erro avatar cliente:", err);
      res.status(500).json({ error: "Erro ao atualizar avatar" });
    }
  }
);

//ROTA USER
app.post("/api/register", async (req, res) => {
  try {
    const { email, senha, role, nome } = req.body;

    if (!email || !senha || !role) {
      return res.status(400).json({ erro: "Dados inválidos" });
    }

    const hash = await bcrypt.hash(senha, 10);

    const userResult = await db.query(
      `INSERT INTO public.users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, hash, role]
    );

    const userId = userResult.rows[0].id;

    if (role === "modelo") {
      const nomeModelo = nome || email.split("@")[0];

      await db.query(
  `INSERT INTO public.modelos (user_id, nome)
   VALUES ($1, $2)`,
  [userId, nomeModelo]
);

    }

    if (role === "cliente") {
      await db.query(
  `INSERT INTO public.clientes (user_id, nome)
   VALUES ($1, $2)`,
  [userId, nome || email.split("@")[0]]
);
    }

    // ✅ FINAL LIMPO
    return res.status(201).json({ sucesso: true });

  } catch (err) {
    console.error("ERRO REGISTER:", err);

    // email duplicado
    if (err.code === "23505") {
      return res.status(409).json({ erro: "Email já registado" });
    }

    return res.status(500).json({ erro: "Erro interno no servidor" });
  }
});

//END POINT DE LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    const result = await db.query(
      "SELECT id, email, password_hash, role FROM public.users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const user = result.rows[0];

    const senhaOk = await bcrypt.compare(senha, user.password_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    const token = jwt.sign(
  {
    id: user.id,
    email: user.email,
    role: user.role.toLowerCase() // 🔥 AQUI
  },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);
    res.json({
  token,
  role: user.role.toLowerCase()
});

  } catch (err) {
    console.error("🔥 ERRO LOGIN:", err);
    res.status(500).json({ error: "Erro interno no login" });
  }
});


app.get("/api/modelo/me", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT m.*
       FROM public.modelos m
       WHERE m.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("ERRO /api/modelo/me:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ===============================
// 🌟 FEED PÚBLICO DE MODELOS (CLIENTE)
// ===============================
app.get("/api/modelos", auth, async (req, res) => {
  try {
    // 🔐 apenas clientes
    if (req.user.role !== "cliente") {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const result = await db.query(`
      SELECT
        m.user_id,
        m.nome AS nome,
        m.avatar,
        md.nome_exibicao
      FROM modelos m
      LEFT JOIN modelos_dados md ON md.user_id = m.user_id
      ORDER BY m.id DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("Erro feed modelos:", err);
    res.status(500).json([]);
  }
});

// ===============================
// UPLOAD AVATAR E CAPA
// ===============================

app.post(
  "/uploadAvatar",
  auth,
  onlyModelo,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: `velvet/${req.user.id}/avatar`,
            transformation: [{ width: 400, height: 400, crop: "fill" }]
          },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });

      await db.query(
        "UPDATE public.modelos SET avatar = $1 WHERE user_id = $2",
        [result.secure_url, req.user.id]
      );

      res.json({ url: result.secure_url });

    } catch (err) {
      console.error("Erro upload avatar:", err);
      res.status(500).json({ error: "Erro ao atualizar avatar" });
    }
  }
);



app.post(
  "/uploadCapa",
  auth,
  onlyModelo,
  upload.single("capa"),
  async (req, res) => {
    try {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: `velvet/${req.user.id}/capa`,
            transformation: [{ width: 1200, height: 400, crop: "fill" }]
          },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });

      await db.query(
        "UPDATE public.modelos SET capa = $1 WHERE user_id = $2",
        [result.secure_url, req.user.id]
      );

      res.json({ url: result.secure_url });

    } catch (err) {
      console.error("Erro upload capa:", err);
      res.status(500).json({ error: "Erro ao atualizar capa" });
    }
  }
);


// ===============================
// UTILITÁRIOS chat
// ===============================
const MODELOS_FILE = "modelos.json";

function lerModelos() {
  if (!fs.existsSync(MODELOS_FILE)) {
    fs.writeFileSync(MODELOS_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(MODELOS_FILE, "utf8"));
}

function salvarModelos(data) {
  fs.writeFileSync(MODELOS_FILE, JSON.stringify(data, null, 2));
}

const FEED_FILE = "feed.json";

function readFeed() {
  if (!fs.existsSync(FEED_FILE)) return [];
  return JSON.parse(fs.readFileSync(FEED_FILE));
}

function saveFeed(feed) {
  fs.writeFileSync(FEED_FILE, JSON.stringify(feed, null, 2));
}

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
// 📄 BUSCAR DADOS DO CLIENTE
// ===============================
app.get("/api/cliente/dados", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json({ error: "Apenas clientes" });
    }

    const result = await db.query(
      "SELECT * FROM clientes_dados WHERE user_id = $1",
      [req.user.id]
    );

    res.json(result.rows[0] || {});
  } catch (err) {
    console.error("Erro buscar dados cliente:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});





// ===============================
// SOCKET.IO
// ===============================
io.on("connection", socket => {
  console.log("🔥 Socket conectado:", socket.id);

  socket.authenticated = false;

  // 🔐 autenticação do socket
  socket.on("auth", ({ token }) => {
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      socket.authenticated = true;
    } catch {
      socket.disconnect();
    }
  });

  // login cliente
socket.on("loginCliente", cliente => {
  if (!socket.authenticated || socket.user.role !== "cliente") return;

  socket.role = "cliente";
  socket.cliente = cliente;
  onlineClientes[cliente] = socket.id;
});

socket.on("loginModelo", modelo => {
  if (!socket.authenticated || socket.user.role !== "modelo") return;

  socket.role = "modelo";
  socket.modelo = modelo;
  onlineModelos[modelo] = socket.id;
  socket.emit("unreadUpdate", unreadMap[modelo] ?? {});
});
  // entrar na sala
socket.on("joinRoom", ({ cliente, modelo }) => {
  if (!socket.authenticated) return;

  if (
    socket.role === "cliente" &&
    socket.cliente !== cliente
  ) return;

  if (
    socket.role === "modelo" &&
    socket.modelo !== modelo
  ) return;

    const room = getRoom(cliente, modelo);
    socket.join(room);

    const history = readMessages()
      .filter(m => m.cliente === cliente && m.modelo === modelo)
      .map(m => ({
        ...m,
        pago: m.type === "conteudo"
          ? isConteudoPago(cliente, modelo, m.id)
          : true
      }));

    socket.emit("chatHistory", history);

    if (socket.role === "cliente" && unreadMap[cliente]) {
      delete unreadMap[cliente][modelo];
      socket.emit("unreadUpdate", unreadMap[cliente]);
    }
  });

  socket.on("sendMessage", ({ cliente, modelo, text }) => {
  if (!socket.user) return;

  let from;

  // if (socket.role === "cliente") {
  //   if (!verificarAssinatura(cliente, modelo)) {
  //     socket.emit("errorMessage", "Apenas clientes VIP podem enviar mensagens.");
  //     return;
  //   }
  //   from = cliente;
  // }

  if (socket.role === "modelo") {
    from = modelo;
  }

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

  io.to(getRoom(cliente, modelo)).emit("newMessage", newMessage);

  // unread
  if (from === cliente) {
    unreadMap[modelo] ??= {};
    unreadMap[modelo][cliente] = true;
  }

  if (from === modelo) {
    unreadMap[cliente] ??= {};
    unreadMap[cliente][modelo] = true;
  }
});

async function excluirConteudo(req, res) {
  const { id } = req.params;
  const modeloId = req.user.id;

  let conteudos = lerConteudos();
  const conteudo = conteudos.find(
    c => c.id === id && c.modeloId === modeloId
  );

  if (!conteudo) {
    return res.status(404).json({ error: "Conteúdo não encontrado" });
  }

  const publicId = conteudo.url
    .split("/")
    .slice(-2)
    .join("/")
    .replace(/\.[^/.]+$/, "");

  await cloudinary.uploader.destroy(publicId);

  conteudos = conteudos.filter(c => c.id !== id);
  salvarConteudos(conteudos);

  res.json({ success: true });
}

//STOP SE NAO PREENCHER OS DADOS COMPLETOS
async function authModeloCompleto(req, res, next) {
  const result = await db.query(
    "SELECT 1 FROM modelos_dados WHERE user_id = $1",
    [req.user.id]
  );

  if (result.rowCount === 0) {
    return res.redirect("/dados-modelo.html");
  }

  next();
}

//PROTECAO CONTEUDOS E CHAT
app.get(
  "/conteudos.html",
  auth,
  auth,
  authModelo,
  authModeloCompleto,
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "conteudos.html"));
  }
);

app.get(
  "/chatmodelo.html",
  auth,
  auth,
  authModelo,
  authModeloCompleto,
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "chatmodelo.html"));
  }
);


  // disconnect
  socket.on("disconnect", () => {
    if (socket.modelo) delete unreadMap[socket.modelo];
    if (socket.cliente) delete unreadMap[socket.cliente];
    fs.writeFileSync(UNREAD_FILE, JSON.stringify(unreadMap, null, 2));
    console.log("❌ Socket desconectado:", socket.id);
  });
});

//-------------------------------------------------------------------------------------------- 
//ROTA LISTA VIP CLIENTES
// ===============================
// 💬 MODELOS COM CHAT (CLIENTE)
// ===============================
app.get("/api/cliente/modelos", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json([]);
    }

    const result = await db.query(`
      SELECT
        m.nome
      FROM vip_assinaturas v
      JOIN modelos m ON m.user_id = v.modelo_id
      WHERE v.cliente_id = $1
      ORDER BY m.nome
    `, [req.user.id]);

    res.json(result.rows.map(r => r.nome));

  } catch (err) {
    console.error("Erro modelos chat cliente:", err);
    res.status(500).json([]);
  }
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
// 📄 DADOS DA MODELO
// ===============================

// Buscar dados
app.get("/api/modelo/dados",
  auth,
  auth,
  authModelo,
  async (req, res) => {
    try {
      const result = await db.query(
        "SELECT * FROM modelos_dados WHERE user_id = $1",
        [req.user.id]
      );

      res.json(result.rows[0] || {});
    } catch (err) {
      console.error("Erro buscar dados modelo:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);

// Salvar / atualizar dados
app.post(
  "/api/modelo/dados",
  auth,
  authModelo,
  async (req, res) => {
    try {
      const {
        nome_exibicao,
        nome_completo,
        data_nascimento,
        telefone,
        endereco,
        pais,
        instagram,
        tiktok
      } = req.body;

      if (
        !nome_exibicao ||
        !nome_completo ||
        !data_nascimento ||
        !telefone ||
        !endereco ||
        !pais
      ) {
        return res.status(400).json({ error: "Dados obrigatórios em falta" });
      }

      await db.query(
        `
        INSERT INTO modelos_dados
          (user_id, nome_exibicao, nome_completo, data_nascimento,
           telefone, endereco, pais, instagram, tiktok)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id)
        DO UPDATE SET
          nome_exibicao = EXCLUDED.nome_exibicao,
          nome_completo = EXCLUDED.nome_completo,
          data_nascimento = EXCLUDED.data_nascimento,
          telefone = EXCLUDED.telefone,
          endereco = EXCLUDED.endereco,
          pais = EXCLUDED.pais,
          instagram = EXCLUDED.instagram,
          tiktok = EXCLUDED.tiktok,
          atualizado_em = NOW()
        `,
        [
          req.user.id,
          nome_exibicao,
          nome_completo,
          data_nascimento,
          telefone,
          endereco,
          pais,
          instagram || null,
          tiktok || null
        ]
      );

      // 🔥 sincroniza nome exibido no perfil
      await db.query(
        "UPDATE modelos SET nome = $1 WHERE user_id = $2",
        [nome_exibicao, req.user.id]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Erro salvar dados modelo:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);



//***************************************************************************************************************** */
app.post(
  "/api/conteudos/upload",
  auth,
  authModelo,
  upload.single("conteudo"),
  uploadConteudo
);

app.delete(
  "/api/conteudos/:id",
  auth,
  authModelo,
  excluirConteudo
);


// app.post("/api/pagamentos/criar", async (req, res) => {
//   try {
//     const { cliente, modelo, conteudoId, preco } = req.body;
//     const valor = Number(preco);

//     if (isNaN(valor) || valor <= 0) {
//   return res.status(400).json({ error: "Preço inválido" });
// }

//     if (!cliente || !modelo || !conteudoId) {
//       return res.status(400).json({ error: "Dados inválidos" });
//     }

//     const payment = await paymentClient.create({
//       body: {
//       transaction_amount: valor,
//       description: `Conteúdo ${conteudoId}`,
//       payment_method_id: "pix",
//       payer: {
//         email: "teste@teste.com"
//       },
//       external_reference: `${cliente}_${modelo}_${conteudoId}`,
//       metadata: { cliente, modelo, conteudoId },
//       notification_url:
//         "https://nontemperamental-teresa-peaked.ngrok-free.dev/api/pagamentos/webhook"
//     }
//     });

//     res.json({
//       pix: payment.point_of_interaction.transaction_data
//     });

//   } catch (err) {
//     console.error("Erro criar pagamento:", err);
//     res.status(500).json({ error: "Erro ao criar pagamento" });
//   }
// });

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


// app.post("/api/pagamentos/webhook", async (req, res) => {
//   try {
//     console.log("🔔 WEBHOOK RECEBIDO:", req.body);

//     const paymentId =
//       req.body?.data?.id ||
//       req.body?.resource;

//     if (!paymentId) {
//       console.log("⚠️ Webhook sem paymentId");
//       return res.sendStatus(200);
//     }

//     const payment = await paymentClient.get({ id: paymentId });

//     console.log("💰 STATUS:", payment.status);
//     console.log("📦 METADATA:", payment.metadata);

//     if (payment.status !== "approved") {
//       return res.sendStatus(200);
//     }
//     const tipo = payment.metadata?.tipo;

// //CONTEUDO PAGO
//     const { cliente, modelo } = payment.metadata || {};
//     const conteudoId =
//       payment.metadata?.conteudoId ||
//       payment.metadata?.conteudo_id;

//     if (!cliente || !modelo || !conteudoId) {
//       console.log("❌ METADATA INCOMPLETA");
//       return res.sendStatus(200);
//     }

//     desbloquearConteudo(cliente, modelo, conteudoId);

//     console.log("🔓 CONTEÚDO DESBLOQUEADO");

//     return res.sendStatus(200);

//   } catch (err) {
//     console.error("🔥 ERRO WEBHOOK:", err);
//     return res.sendStatus(500);
//   }
// });

app.post(
  "/uploadMidia",
  auth,
  onlyModelo,
  upload.single("midia"),
  async (req, res) => {
    try {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: `velvet/${req.user.id}/midias`,
            resource_type: "auto"
          },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });

      await db.query(
        "INSERT INTO midias (user_id, url, tipo) VALUES ($1, $2, $3)",
        [req.user.id, result.secure_url, result.resource_type]
      );

      res.json({ url: result.secure_url });

    } catch (err) {
      console.error("Erro upload midia:", err);
      res.status(500).json({ error: "Erro ao enviar mídia" });
    }
  }
);


app.get("/api/health/db", async (req, res) => {
  try {
    const result = await db.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: result.rows[0] });
  } catch (err) {
    console.error("❌ DB ERROR:", err);
    res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

//ganhos
app.get("/api/modelo/ganhos", authModelo, async (req, res) => {
  const modeloId = req.user.id;

  const result = await db.query(
    `SELECT * FROM transactions
     WHERE modelo_id = $1
     ORDER BY created_at DESC`,
    [modeloId]
  );

  res.json(result.rows);
});

//RELATORIO VENDAS
// ===============================
// DASHBOARD DE GANHOS DA MODELO
// ===============================
app.get("/api/modelo/dashboard-ganhos", authModelo, async (req, res) => {
  try {
    const modeloId = req.user.id;

    // TOTAL GERAL
    const totalResult = await db.query(
      `SELECT COALESCE(SUM(ganho_modelo), 0) AS total
       FROM transactions
       WHERE modelo_id = $1`,
      [modeloId]
    );

    // GANHOS POR MÊS
    const mensalResult = await db.query(
      `SELECT
         TO_CHAR(created_at, 'YYYY-MM') AS label,
         SUM(ganho_modelo) AS total
       FROM transactions
       WHERE modelo_id = $1
       GROUP BY label
       ORDER BY label`,
      [modeloId]
    );

    // GANHOS POR DIA
    const diarioResult = await db.query(
      `SELECT
         TO_CHAR(created_at, 'YYYY-MM-DD') AS label,
         SUM(ganho_modelo) AS total
       FROM transactions
       WHERE modelo_id = $1
       GROUP BY label
       ORDER BY label`,
      [modeloId]
    );

    // SALDO DISPONÍVEL (sem chargeback)
    const saldoResult = await db.query(
      `SELECT COALESCE(SUM(ganho_modelo), 0) AS saldo
       FROM transactions
       WHERE modelo_id = $1
       AND (chargeback_status IS NULL OR chargeback_status = '')`,
      [modeloId]
    );

    res.json({
      total: totalResult.rows[0].total,
      mensal: mensalResult.rows,
      diario: diarioResult.rows,
      saldoDisponivel: saldoResult.rows[0].saldo,
      proximoPagamento: "05-Jan-2026"
    });

  } catch (err) {
    console.error("Erro dashboard ganhos:", err);
    res.status(500).json({ error: "Erro ao carregar ganhos" });
  }
});

// ===============================
// ⭐ VIP SIMPLES – ATIVAR NO CLICK
// ===============================
app.post("/api/vip/ativar", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json({ error: "Apenas clientes" });
    }

    const { modelo_id } = req.body;
    if (!modelo_id) {
      return res.status(400).json({ error: "Modelo inválida" });
    }

    // evita duplicar
    const jaVip = await db.query(
      `
      SELECT 1
      FROM vip_assinaturas
      WHERE cliente_id = $1
        AND modelo_id = $2
      `,
      [req.user.id, modelo_id]
    );

    if (jaVip.rowCount === 0) {
      await db.query(
        `
        INSERT INTO vip_assinaturas
          (cliente_id, modelo_id)
        VALUES ($1, $2)
        `,
        [req.user.id, modelo_id]
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Erro VIP simples:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ===============================
// 👤 IDENTIDADE DO CLIENTE (JWT)
// ===============================
app.get("/api/cliente/me", auth, async (req, res) => {
  if (req.user.role !== "cliente") {
    return res.status(403).json({ error: "Apenas cliente" });
  }

  const result = await db.query(
    "SELECT nome FROM clientes WHERE user_id = $1",
    [req.user.id]
  );

  res.json({
    id: req.user.id,
    nome: result.rows[0]?.nome
  });
});

//ROTA LISTA VIP
app.get("/api/vip/status/:modeloId", auth, async (req, res) => {
  const clienteId = req.user.id;
  const { modeloId } = req.params;

  const result = await db.query(
    `SELECT 1 FROM vip_assinaturas 
     WHERE cliente_id = $1 AND modelo_id = $2`,
    [clienteId, modeloId]
  );

  res.json({ vip: result.rowCount > 0 });
});



// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});


