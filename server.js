// ===============================
// SERVER.JS 
// ===============================
require("dotenv").config();      // 🔑 PRIMEIRO
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
console.log("JWT_SECRET carregado?", JWT_SECRET);
const cors = require("cors");
const express = require("express");
const db = require("./db");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
app.use(express.json());
app.use(express.static("public"));
const multer = require("multer");
app.use("/assets", express.static(path.join(__dirname, "assets")));
const onlineClientes = {};
const onlineModelos = {};
const cloudinary = require("cloudinary").v2;
const { MercadoPagoConfig, PreApproval } = require("mercadopago");
const CONTEUDOS_FILE = "conteudos.json";
const MODELOS_FILE = "modelos.json";
const COMPRAS_FILE = "compras.json";
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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

app.use(cors({
  origin: ["https://velvet-app-production.up.railway.app"],
  credentials: true
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const io = new Server(server, {
  cors: {
    origin: "https://velvet-app-production.up.railway.app",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// ===============================
//FUNCOES
// ===============================
async function limparUnread(cliente_id, modelo_id) {
  await db.query(
    `
    UPDATE unread
    SET has_unread = false
    WHERE cliente_id = $1 AND modelo_id = $2
    `,
    [cliente_id, modelo_id]
  );
}

async function buscarUnreadCliente(cliente_id) {
  const result = await db.query(
    `
    SELECT modelo_id
    FROM unread
    WHERE cliente_id = $1
    AND unread_for = 'cliente'
    AND has_unread = true
    `,
    [cliente_id]
  );
  return result.rows.map(r => r.modelo_id);
}

async function buscarUnreadModelo(modelo_id) {
  const result = await db.query(
    `
    SELECT cliente_id
    FROM unread
    WHERE modelo_id = $1
    AND unread_for = 'modelo'
    AND has_unread = true
    `,
    [modelo_id]
  );
  return result.rows.map(r => r.cliente_id);
}
// STOP SE NAO PREENCHER OS DADOS COMPLETOS
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

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function authCliente(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "cliente") {
      return res.status(403).json({ error: "Acesso negado (não é cliente)" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function authModelo(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "modelo") {
      return res.status(403).json({ error: "Acesso negado (não é modelo)" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function onlyModelo(req, res, next) {
  if (!req.user || req.user.role !== "modelo") {
    return res.status(403).json({ error: "Apenas modelos podem fazer upload" });
  }
  next();
}


function lerModelos() {
  if (!fs.existsSync(MODELOS_FILE)) {
    fs.writeFileSync(MODELOS_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(MODELOS_FILE, "utf8"));
}
// ===============================
// SOCKET.IO – CHAT ESTÁVEL
// ===============================
io.on("connection", socket => {
  console.log("🔥 Socket conectado:", socket.id);

  socket.user = null;

// 🔐 AUTENTICAÇÃO DO SOCKET
socket.on("auth", ({ token }) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    console.log("🔐 Socket autenticado:", decoded.id, decoded.role);
  } catch (err) {
    console.log("❌ Token inválido");
    socket.disconnect();
  }
});

// 🔌 REGISTRO DE SOCKET ONLINE
socket.on("loginCliente", (cliente_id) => {
  onlineClientes[cliente_id] = socket.id;
  console.log("🟢 Cliente online:", cliente_id, socket.id);
});

socket.on("loginModelo", (modelo_id) => {
  onlineModelos[modelo_id] = socket.id;
  console.log("🟣 Modelo online:", modelo_id, socket.id);
});

socket.on("disconnect", () => {
  for (const [id, sid] of Object.entries(onlineClientes)) {
    if (sid === socket.id) delete onlineClientes[id];
  }
  for (const [id, sid] of Object.entries(onlineModelos)) {
    if (sid === socket.id) delete onlineModelos[id];
  }
});

// 📥 ENTRAR NA SALA DO CHAT

socket.on("joinChat", ({ sala }) => {
  if (!sala) return;
  socket.join(sala);
  console.log("🟪 Entrou na sala:", sala);
});

// 💬 ENVIAR MENSAGEM (ÚNICO)
socket.on("sendMessage", async ({ cliente_id, modelo_id, text }) => {
  if (!socket.user) {
    console.log("❌ Socket sem usuário");
    return;
  }
  
  // 🔒 segurança por role
  if (socket.user.role === "cliente" && socket.user.id !== cliente_id) return;
  if (socket.user.role === "modelo"  && socket.user.id !== modelo_id) return;

  if (!cliente_id || !modelo_id || !text) {
    console.log("❌ sendMessage inválido", { cliente_id, modelo_id, text });
    return;
  }

  const sala = `chat_${cliente_id}_${modelo_id}`;
  const sender = socket.user.role;               // "cliente" | "modelo"
  const unreadFor = sender === "cliente" ? "modelo" : "cliente";

  try {
    // 1️⃣ SALVA NO BANCO E RETORNA ID 🔥
const result = await db.query(`
  INSERT INTO messages
    (cliente_id, modelo_id, sender, tipo, text)
  VALUES ($1, $2, $3, 'texto', $4)
  RETURNING id
`, 
[cliente_id, modelo_id, sender, text]);

const messageId = result.rows[0].id;

    // 2️⃣ MARCA COMO NÃO LIDA PARA QUEM NÃO ENVIOU
    await db.query(
      `
      INSERT INTO unread (cliente_id, modelo_id, unread_for, has_unread)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (cliente_id, modelo_id)
      DO UPDATE SET
        unread_for = EXCLUDED.unread_for,
        has_unread = true
      `,
      [cliente_id, modelo_id, unreadFor]
    );

    // 3️⃣ AVISO DE NÃO LIDA (TEMPO REAL)
    if (unreadFor === "modelo") {
      const sidModelo = onlineModelos[modelo_id];
      if (sidModelo) {
        io.to(sidModelo).emit("unreadUpdate", {
          cliente_id,
          modelo_id,
          unread: true
        });
      }
    }

    if (unreadFor === "cliente") {
      const sidCliente = onlineClientes[cliente_id];
      if (sidCliente) {
        io.to(sidCliente).emit("unreadUpdate", {
          cliente_id,
          modelo_id,
          unread: true
        });
      }
    }

 // 7️⃣ META UPDATE (status / horário)
 // 🔥 ENVIA PARA A SALA (CLIENTE + MODELO)
io.to(sala).emit("newMessage", {
  id: messageId,
  cliente_id,
  modelo_id,
  sender,
  tipo: "texto",
  text,
  created_at: new Date()
 });

  } catch (err) {
    console.error("🔥 ERRO AO SALVAR MENSAGEM:", err);
  }
});

// 📜 HISTÓRICO DO CHAT
socket.on("getHistory", async ({ cliente_id, modelo_id }) => {
  if (!socket.user) return;

  try {
    // 1️⃣ limpa NÃO LIDO apenas para quem está abrindo o chat
    await db.query(
   `UPDATE unread
   SET has_unread = false
   WHERE cliente_id = $1
    AND modelo_id = $2
    AND unread_for = $3
   `,
   [
    cliente_id,
    modelo_id,
    socket.user.role   // 'cliente' | 'modelo'
  ]
 );

    // 2️⃣ busca histórico base
    const result = await db.query(
      `
  SELECT
  m.id,
  m.cliente_id,
  m.modelo_id,
  m.sender,
  m.tipo,
  m.text,       
  m.preco,
  m.visto,
  m.created_at
FROM messages m
WHERE m.cliente_id = $1
  AND m.modelo_id = $2
ORDER BY m.created_at ASC

      `,
      [cliente_id, modelo_id]
    );

    // 3️⃣ tratar mensagens de conteúdo / pacote
    for (const msg of result.rows) {

      if (msg.tipo !== "conteudo") continue;

      // 🔎 buscar mídias ligadas à mensagem
      const midiasRes = await db.query(
        `
        SELECT
          c.url,
          c.tipo AS tipo_media
        FROM messages_conteudos mc
        JOIN conteudos c ON c.id = mc.conteudo_id
        WHERE mc.message_id = $1
        `,
        [msg.id]
      );

      const midias = midiasRes.rows;

      msg.quantidade = midias.length;

      // 🔐 REGRAS DE VISUALIZAÇÃO
      if (
        socket.user.role === "cliente" &&
        Number(msg.preco) > 0 &&
        msg.visto !== true
      ) {
        // 🚫 cliente não liberado
        msg.midias = [];
        msg.bloqueado = true;
      } else {
        // ✅ modelo sempre vê tudo
        // ✅ cliente vê se gratuito ou comprado
        msg.midias = midias;
        msg.bloqueado = false;
      }
    }

    // 4️⃣ envia histórico SOMENTE para quem pediu
    socket.emit("chatHistory", result.rows);

  } catch (err) {
    console.error("❌ Erro getHistory:", err);
  }
 });

 // 📦 ENVIO DE CONTEÚDO (1 ou N mídias)
socket.on("sendConteudo", async ({ cliente_id, modelo_id, conteudos_ids, preco }) => {
  if (!socket.user || socket.user.role !== "modelo") return;

  if (!Array.isArray(conteudos_ids) || conteudos_ids.length === 0) return;

  const sala = `chat_${cliente_id}_${modelo_id}`;

  try {
    // 1️⃣ cria a mensagem principal (pacote)
    const msgRes = await db.query(
      `
      INSERT INTO messages
        (cliente_id, modelo_id, sender, tipo, preco, visto, created_at)
      VALUES
        ($1, $2, 'modelo', 'conteudo', $3, false, NOW())
      RETURNING id
      `,
      [cliente_id, modelo_id, preco]
    );

    const messageId = msgRes.rows[0].id;

    // 2️⃣ associa todas as mídias à mensagem
    for (const conteudo_id of conteudos_ids) {
      await db.query(
        `
        INSERT INTO messages_conteudos (message_id, conteudo_id)
        VALUES ($1, $2)
        `,
        [messageId, conteudo_id]
      );
    }

    // 3️⃣ busca URLs + tipo das mídias (🔥 ESSENCIAL)
    const midiasRes = await db.query(
      `
      SELECT
        c.url,
        c.tipo AS tipo_media
      FROM conteudos c
      WHERE c.id = ANY($1)
      `,
      [conteudos_ids]
    );

    const midias = midiasRes.rows;

    // 4️⃣ envia realtime COMPLETO
    // 🔓 modelo sempre vê tudo
    // 🔒 cliente recebe bloqueado se preço > 0
    io.to(sala).emit("newMessage", {
      id: messageId,
      cliente_id,
      modelo_id,
      sender: "modelo",
      tipo: "conteudo",
      preco,
      quantidade: midias.length,
      midias: midias,                 // 🔥 MODELO vê / CLIENTE será filtrado no front
      bloqueado: Number(preco) > 0,   // 🔒 cliente decide pelo bloqueado
      created_at: new Date()
    });

  } catch (err) {
    console.error("❌ Erro sendConteudo:", err);
  }
 });

 // 👁️ CLIENTE VISUALIZOU CONTEÚDO
socket.on("marcarConteudoVisto", async ({ message_id, cliente_id, modelo_id }) => {
  if (!socket.user || socket.user.role !== "cliente") return;

  try {
    // 1️⃣ marca como visto no banco
    await db.query(
      `
      UPDATE messages
      SET visto = true
      WHERE id = $1
        AND cliente_id = $2
        AND modelo_id = $3
      `,
      [message_id, cliente_id, modelo_id]
    );

    const sala = `chat_${cliente_id}_${modelo_id}`;

    // 2️⃣ avisa MODELO em tempo real
    io.to(sala).emit("conteudoVisto", {
      message_id
    });

  } catch (err) {
    console.error("❌ Erro marcarConteudoVisto:", err);
  }
 });


});
// ===============================
//ROTA GET
// ===============================
app.get("/api/conteudos", authModelo, async (req, res) => {
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

// 🌟 FEED OFICIAL DE MODELOS (CLIENTE)
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


// 👀 FEED PÚBLICO DA MODELO (CLIENTE)
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


// 🌟 FEED PÚBLICO DE MODELOS (CLIENTE)
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

// 📄 BUSCAR DADOS DO CLIENTE
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

// 💬 MODELOS COM CHAT (CLIENTE)
app.get("/api/cliente/modelos", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json([]);
    }

const result = await db.query(`
  SELECT m.user_id AS id, m.nome
  FROM vip_assinaturas v
  JOIN modelos m ON m.user_id = v.modelo_id
  WHERE v.cliente_id = $1
  ORDER BY m.nome
`, [req.user.id]);

res.json(result.rows);


  } catch (err) {
    console.error("Erro modelos chat cliente:", err);
    res.status(500).json([]);
  }
});

// 📄 DADOS DA MODELO
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

app.get("/api/chat/unread/cliente", authCliente, async (req, res) => {
  const ids = await buscarUnreadCliente(req.user.id);
  res.json(ids);
});

app.get("/api/chat/unread/modelo", authModelo, async (req, res) => {
  const ids = await buscarUnreadModelo(req.user.id);
  res.json(ids);
});


//GANHOS
app.get("/api/modelo/ganhos", authModelo, async (req, res) => {
  const modelo_id = req.user.id;

  const result = await db.query(
    `SELECT * FROM transactions
     WHERE modelo_id = $1
     ORDER BY created_at DESC`,
    [modelo_id]
  );

  res.json(result.rows);
});

// 👤 IDENTIDADE DO CLIENTE (JWT)
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
app.get("/api/vip/status/:modelo_id", auth, async (req, res) => {
  const cliente_id = req.user.id;
  const { modelo_id } = req.params;

  const result = await db.query(
    `SELECT 1 FROM vip_assinaturas 
     WHERE cliente_id = $1 AND modelo_id = $2`,
    [cliente_id, modelo_id]
  );

  res.json({ vip: result.rowCount > 0 });
});

app.get("/api/modelo/vips", auth, authModelo, async (req, res) => {
  const modelo_id = req.user.id;

  const result = await db.query(`
    SELECT c.nome AS cliente
    FROM vip_assinaturas v
    JOIN clientes c ON c.user_id = v.cliente_id
    WHERE v.modelo_id = $1
    ORDER BY c.nome
  `, [modelo_id]);

  res.json(result.rows);
});

app.get(
  "/conteudos.html",
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
  authModelo,
  authModeloCompleto,
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "chatmodelo.html"));
  }
);

app.get("/api/modelo/publico/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "SELECT id, nome, bio, avatar, capa FROM modelos WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro perfil público:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

//ROTA CLIENTE PERFIL
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
// CHAT — LISTA PARA CLIENTE
// ===============================
app.get("/api/chat/cliente", authCliente, async (req, res) => {
  try {
    const clienteId = req.user.id;

    const { rows } = await db.query(`
      SELECT 
        m.user_id AS modelo_id,
        m.nome,
        m.avatar
      FROM vip_assinaturas v
      JOIN modelos m ON m.user_id = v.modelo_id
      WHERE v.cliente_id = $1
    `, [clienteId]);

    res.json(rows);
  } catch (err) {
    console.error("Erro chat cliente:", err);
    res.status(500).json({ error: "Erro ao carregar chats" });
  }
});


/// ===============================
// CHAT — LISTA PARA MODELO
// ===============================
app.get("/api/chat/modelo", authModelo, async (req, res) => {
  try {
    const modeloId = req.user.id;

    const { rows } = await db.query(`
SELECT 
  c.user_id AS cliente_id,
  c.nome,
  cd.avatar,

  MAX(m.created_at)
    FILTER (WHERE m.sender = 'modelo')
    AS ultima_msg_modelo_ts

FROM vip_assinaturas v

JOIN clientes c 
  ON c.user_id = v.cliente_id

LEFT JOIN clientes_dados cd       -- ✅ JOIN QUE FALTAVA
  ON cd.user_id = c.user_id

LEFT JOIN messages m 
  ON m.cliente_id = c.user_id
 AND m.modelo_id = $1

WHERE v.modelo_id = $1

GROUP BY c.user_id, c.nome, cd.avatar   -- ✅ GROUP BY COMPLETO
ORDER BY ultima_msg_modelo_ts DESC NULLS LAST

    `, [modeloId]);

    res.json(rows);

  } catch (err) {
    console.error("❌ Erro ao buscar chats da modelo:", err);
    res.status(500).json({ error: "Erro ao buscar chats" });
  }
});

// ===============================
// 📄 DADOS DE UM CLIENTE (por ID)
// ===============================
app.get("/api/cliente/:id", authModelo, async (req, res) => {
  const clienteId = req.params.id;

  try {
    const result = await db.query(
      `
      SELECT
        c.user_id,
        c.nome,
        cd.avatar
      FROM clientes c
      LEFT JOIN clientes_dados cd
        ON cd.user_id = c.user_id
      WHERE c.user_id = $1
      `,
      [clienteId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar cliente:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ===============================
// ROTA POST
// ===============================
app.put("/api/modelo/bio", authModelo, async (req, res) => {
  try {
    const { bio } = req.body;

    if (!bio || typeof bio !== "string") {
      return res.status(400).json({ error: "Bio invávisto" });
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


// 📄 DADOS DO CLIENTE
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


// 📸 AVATAR DO CLIENTE
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


// UPLOAD AVATAR E CAPA
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


app.post(
  "/api/conteudos/upload",
  auth,
  authModelo,
  upload.single("conteudo"),
  uploadConteudo
);
// ===============================
// 🗑 EXCLUIR CONTEÚDO (MODELO)
// ===============================
app.delete(
  "/api/conteudos/:id",
  auth,
  authModelo,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await db.query(
        `
        SELECT url
        FROM conteudos
        WHERE id = $1 AND user_id = $2
        `,
        [id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Conteúdo não encontrado" });
      }

      await db.query(
        `
        DELETE FROM conteudos
        WHERE id = $1 AND user_id = $2
        `,
        [id, req.user.id]
      );

      res.json({ success: true });

    } catch (err) {
      console.error("Erro ao excluir conteúdo:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);

// ===============================
// 🗑 EXCLUIR MIDIA (PERFIL MODELO)
// ===============================
app.delete(
  "/api/midias/:id",
  auth,
  authModelo,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await db.query(
        "SELECT url FROM midias WHERE id = $1 AND user_id = $2",
        [id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Mídia não encontrada" });
      }

      const url = result.rows[0].url;

      // 🔥 remove do Cloudinary
      const publicId = url
        .split("/")
        .slice(-2)
        .join("/")
        .replace(/\.[^/.]+$/, "");

      await cloudinary.uploader.destroy(publicId);

      // 🗑 remove do banco
      await db.query(
        "DELETE FROM midias WHERE id = $1 AND user_id = $2",
        [id, req.user.id]
      );

      res.json({ success: true });

    } catch (err) {
      console.error("Erro ao excluir mídia:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);


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

// ⭐ VIP SIMPLES – ATIVAR NO CLICK
app.post("/api/vip/ativar", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json({ error: "Apenas clientes" });
    }

    const { modelo_id } = req.body;
    if (!modelo_id) {
      return res.status(400).json({ error: "Modelo invávisto" });
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

  const clienteNomeResult = await db.query(
    "SELECT nome FROM clientes WHERE user_id = $1",
    [req.user.id]
  );

  const cliente_nome =
    clienteNomeResult.rows[0]?.nome || "Novo cliente";

  const sid = onlineModelos[modelo_id];
  if (sid) {
    io.to(sid).emit("novoAssinante", {
      cliente_id: req.user.id,
      nome: cliente_nome
    });
  }
}

    res.json({ success: true });

  } catch (err) {
    console.error("Erro VIP simples:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});