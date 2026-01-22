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
const nodemailer = require("nodemailer");
app.use((req, res, next) => {
  console.log("➡️ REQ:", req.method, req.url);
  next();
});
app.set("trust proxy", 1);
const server = http.createServer(app);
const multer = require("multer");
const onlineClientes = {};
const onlineModelos = {};

const cloudinary = require("cloudinary").v2;
const AWS = require("aws-sdk");
const multerS3 = require("multer-s3");

const { MercadoPagoConfig, Payment } = require("mercadopago");
const CONTEUDOS_FILE = "conteudos.json";
const MODELOS_FILE = "modelos.json";
const COMPRAS_FILE = "compras.json";
const bodyParser = require("body-parser");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin-pages")));

const allowedOrigins = [
  "https://velvet.lat",
  "https://www.velvet.lat",
  "https://app-production-e7e1.up.railway.app",
  "https://velvet-test-production.up.railway.app"
];
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman, mobile, SW

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS bloqueado: " + origin));
  },
  credentials: true
}));

// ===============================
// BACKBLAZE B2 (UPLOAD NOVO)
// ===============================
const s3 = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.B2_ENDPOINT),
  accessKeyId: process.env.B2_KEY_ID,
  secretAccessKey: process.env.B2_APP_KEY,
  region: process.env.B2_REGION,
  signatureVersion: "v4",
  s3ForcePathStyle: true
});

const uploadB2 = multer({
  storage: multerS3({
    s3,
    bucket: process.env.B2_BUCKET,
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = file.originalname.split(".").pop();
      const nome = `velvet/${req.user.id}/${Date.now()}.${ext}`;
      cb(null, nome);
    }
  })
});

// ===============================
// BACKBLAZE – CONTEÚDOS DE VENDA (COM THUMBNAIL REAL)
// ===============================
app.post(
  "/api/conteudos/upload",
  auth,
  authModelo,
  uploadB2.fields([
    { name: "conteudo", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
  ]),
  async (req, res) => {
    const file = req.files.conteudo?.[0];
    const thumb = req.files.thumbnail?.[0];

    if (!file) {
      return res.status(400).json({ error: "Arquivo não enviado" });
    }

    const isVideo = file.mimetype.startsWith("video");
    const thumbnailUrl = thumb?.location || null;

    await db.query(
      `
      INSERT INTO conteudos
        (user_id, url, tipo, tipo_conteudo, thumbnail_url)
      VALUES ($1, $2, $3, 'venda', $4)
      `,
      [
        req.user.id,
        file.location,
        isVideo ? "video" : "imagem",
        thumbnailUrl
      ]
    );

    res.json({
      success: true,
      url: file.location,
      thumbnail_url: thumbnailUrl
    });
  }
);

// ===============================
// FEED – UPLOAD NOVO (MESMO PIPELINE DE CONTEÚDOS)
// ===============================
app.post(
  "/api/feed/upload",
  auth,
  authModelo,
  uploadB2.fields([
    { name: "midia", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
  ]),
  async (req, res) => {
    const file = req.files.midia?.[0];
    const thumb = req.files.thumbnail?.[0];

    if (!file) {
      return res.status(400).json({ error: "Arquivo não enviado" });
    }

    const isVideo = file.mimetype.startsWith("video");
    const thumbnailUrl = thumb?.location || null;

    await db.query(
      `
      INSERT INTO conteudos
        (user_id, url, tipo, tipo_conteudo, thumbnail_url)
      VALUES ($1, $2, $3, 'feed', $4)
      `,
      [
        req.user.id,
        file.location,
        isVideo ? "video" : "imagem",
        thumbnailUrl
      ]
    );

    res.json({
      success: true,
      url: file.location,
      thumbnail_url: thumbnailUrl
    });
  }
);

app.use(express.static(path.join(__dirname, "public")));
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook Stripe inválido:", err.message);
      return res.status(400).send("Webhook Error");
    }

    try {
      // =====================================
      // 💰 PAYMENT INTENT SUCCEEDED
      // =====================================
      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object;

        // ===============================
        // 📦 CONTEÚDO PPV
        // ===============================
        if (pi.metadata?.tipo === "conteudo") {
          const {
            cliente_id,
            modelo_id,
            message_id,
            valor_base,
            taxa_transacao,
            taxa_plataforma
          } = pi.metadata;

          const valor_total = pi.amount / 100;

          await db.query(
            `
            INSERT INTO conteudo_pacotes (
              message_id,
              cliente_id,
              modelo_id,
              preco,
              valor_base,
              taxa_transacao,
              taxa_plataforma,
              valor_total,
              status,
              payment_id,
              metodo_pagamento,
              pago_em
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pago',$9,'cartao',NOW())
            ON CONFLICT (message_id, cliente_id)
            DO NOTHING
            `,
            [
              message_id,
              cliente_id,
              modelo_id,
              valor_base, // preco
              valor_base,
              taxa_transacao,
              taxa_plataforma,
              valor_total,
              pi.id
            ]
          );

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

          console.log("✅ CONTEÚDO PAGO (CARTÃO):", message_id);

          const sala = `chat_${cliente_id}_${modelo_id}`;
          io.to(sala).emit("conteudoVisto", {
            message_id: Number(message_id)
          });
        }

        // ===============================
        // ⭐ VIP — PRIMEIRO PAGAMENTO
        // ===============================
        if (pi.metadata?.tipo === "vip") {
          await ativarVipAssinatura({
            cliente_id: pi.metadata.cliente_id,
            modelo_id: pi.metadata.modelo_id,
            valor_assinatura: pi.metadata.valor_assinatura,
            taxa_transacao: pi.metadata.taxa_transacao,
            taxa_plataforma: pi.metadata.taxa_plataforma
          });

          // 🔔 realtime
          const sid = onlineClientes[pi.metadata.cliente_id];
          if (sid) {
            io.to(sid).emit("vipAtivado", {
              modelo_id: pi.metadata.modelo_id
            });
          }
        }
      }

      // =====================================
      // 🔁 RENOVAÇÃO AUTOMÁTICA VIP
      // =====================================
      if (event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object;

        if (!invoice.subscription) {
          return res.json({ received: true });
        }

        const subscriptionId = invoice.subscription;

        await db.query(
          `
          UPDATE vip_subscriptions
          SET
            expiration_at = CASE
              WHEN expiration_at > NOW()
              THEN expiration_at + INTERVAL '30 days'
              ELSE NOW() + INTERVAL '30 days'
            END,
            ativo = true
          WHERE stripe_subscription_id = $1
          `,
          [subscriptionId]
        );

        console.log("🔁 VIP renovado:", subscriptionId);
      }

      // =====================================
      // ❌ FALHA NA RENOVAÇÃO VIP
      // =====================================
      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object;
        console.warn(
          "❌ Falha na renovação VIP:",
          invoice.subscription
        );
      }

      res.json({ received: true });
    } catch (err) {
      console.error("🔥 ERRO WEBHOOK STRIPE:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const rateLimit = require("express-rate-limit");

// 🔒 Rate limit para autenticação (login / register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 tentativas
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas. Tente novamente em alguns minutos."
  }
});

const servercontent = require("./servercontent");

const requireRole = require("./middleware/requireRole");
// ===============================
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


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const io = new Server(server, {
  cors: {
    origin: [
      "https://velvet.lat",
      "https://www.velvet.lat",
      "https://app-production-e7e1.up.railway.app",
      "https://velvet-test-production.up.railway.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// ===============================
//FUNCOES
// ===============================

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
      INSERT INTO conteudos (user_id, url, tipo, tipo_conteudo)
      VALUES ($1, $2, $3, 'venda')
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

async function ativarVipAssinatura({
  cliente_id,
  modelo_id,
  valor_assinatura,
  taxa_transacao,
  taxa_plataforma
}) {
  let valor_total = Number(
  (
    Number(valor_assinatura) +
    Number(taxa_transacao) +
    Number(taxa_plataforma)
  ).toFixed(2)
);

// 🔒 Regra do MercadoPago PIX (BR)
if (!valor_total || isNaN(valor_total) || valor_total < 1) {
  valor_total = 1.00;
 }

  const expiration_at = new Date();
  expiration_at.setDate(expiration_at.getDate() + 30); // VIP mensal

  await db.query(
    `
    INSERT INTO vip_subscriptions (
      cliente_id,
      modelo_id,
      valor_assinatura,
      taxa_transacao,
      taxa_plataforma,
      valor_total,
      ativo,
      created_at,
      updated_at,
      expiration_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW(),$7)
    ON CONFLICT (cliente_id, modelo_id)
    DO UPDATE SET
      valor_assinatura = EXCLUDED.valor_assinatura,
      taxa_transacao   = EXCLUDED.taxa_transacao,
      taxa_plataforma  = EXCLUDED.taxa_plataforma,
      valor_total      = EXCLUDED.valor_total,
      ativo            = true,
      updated_at       = NOW(),
      expiration_at    = CASE
      WHEN vip_subscriptions.expiration_at > NOW()
      THEN vip_subscriptions.expiration_at + INTERVAL '30 days'
      ELSE EXCLUDED.expiration_at
      END
      `,
    [
      cliente_id,
      modelo_id,
      valor_assinatura,
      taxa_transacao,
      taxa_plataforma,
      valor_total,
      expiration_at
    ]
  );
  // ===============================
// 💬 MENSAGEM AUTOMÁTICA DE BOAS-VINDAS (PRODUÇÃO)
// ===============================
const existeMsg = await db.query(`
  SELECT 1
  FROM messages
  WHERE cliente_id = $1
    AND modelo_id = $2
  LIMIT 1
`, [cliente_id, modelo_id]);

if (existeMsg.rowCount === 0) {

  const textoBoasVindas = `Bem-vindo! Como você chama? ❤️‍🔥`;

  const msgRes = await db.query(`
    INSERT INTO messages
      (cliente_id, modelo_id, sender, tipo, text, created_at)
    VALUES
      ($1, $2, 'modelo', 'texto', $3, NOW())
    RETURNING *
  `, [cliente_id, modelo_id, textoBoasVindas]);

  const mensagem = msgRes.rows[0];

  // 🔔 marca como não lida para o cliente
  await db.query(`
    INSERT INTO unread (cliente_id, modelo_id, unread_for, has_unread)
    VALUES ($1, $2, 'cliente', true)
    ON CONFLICT (cliente_id, modelo_id)
    DO UPDATE SET has_unread = true
  `, [cliente_id, modelo_id]);

  // 🔥 envia em tempo real SE estiver online
  const sidCliente = onlineClientes[cliente_id];
  if (sidCliente) {
    io.to(sidCliente).emit("newMessage", mensagem);
  }
}
// ===============================
// 🚨 AVISA A MODELO: NOVO VIP
// ===============================
const sidModelo = onlineModelos[modelo_id];
if (sidModelo) {

  const nomeRes = await db.query(
    "SELECT nome FROM clientes WHERE user_id = $1",
    [cliente_id]
  );

  const nomeCliente = nomeRes.rows[0]?.nome || "Novo VIP";

  io.to(sidModelo).emit("novoAssinante", {
    cliente_id,
    nome: nomeCliente
  });
}
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
socket.on("sendMessage", async (data) => {
  if (!socket.user) return;

  const {
    cliente_id,
    modelo_id,
    text,
    tipo = "texto",
    conteudos = [],
    preco = 0
  } = data;

  // 🔒 segurança por role
  if (socket.user.role === "cliente" && socket.user.id !== cliente_id) return;
  if (socket.user.role === "modelo"  && socket.user.id !== modelo_id) return;

  if (!cliente_id || !modelo_id) return;

  const sala = `chat_${cliente_id}_${modelo_id}`;
  const sender = socket.user.role;
  const unreadFor = sender === "cliente" ? "modelo" : "cliente";

  try {
    // ===============================
    // 🟢 TEXTO (FLUXO ANTIGO, IGUAL)
    // ===============================
    if (tipo === "texto") {
      if (!text) return;

      const result = await db.query(`
        INSERT INTO messages
          (cliente_id, modelo_id, sender, tipo, text)
        VALUES ($1, $2, $3, 'texto', $4)
        RETURNING id, created_at
      `, [cliente_id, modelo_id, sender, text]);

      const messageId = result.rows[0].id;
      const createdAt = result.rows[0].created_at;

      await marcarUnread(cliente_id, modelo_id, unreadFor);

      io.to(sala).emit("newMessage", {
        id: messageId,
        cliente_id,
        modelo_id,
        sender,
        tipo: "texto",
        text,
        created_at: createdAt
      });

      atualizarListas(cliente_id, modelo_id, text, sender);
      return;
    }

    // ===============================
    // 🟣 CONTEÚDO (NOVO FLUXO)
    // ===============================
    if (tipo === "conteudo" && conteudos.length > 0) {
      const result = await db.query(`
        INSERT INTO messages
          (cliente_id, modelo_id, sender, tipo, preco)
        VALUES ($1, $2, $3, 'conteudo', $4)
        RETURNING id, created_at
      `, [cliente_id, modelo_id, sender, preco]);

      const messageId = result.rows[0].id;
      const createdAt = result.rows[0].created_at;

      const r = await db.query(`
        SELECT id, url, tipo, thumbnail_url
        FROM conteudos
        WHERE id = ANY($1)
      `, [conteudos]);

      await marcarUnread(cliente_id, modelo_id, unreadFor);

      io.to(sala).emit("newMessage", {
        id: messageId,
        cliente_id,
        modelo_id,
        sender,
        tipo: "conteudo",
        conteudos: r.rows,
        preco,
        created_at: createdAt
      });

      atualizarListas(cliente_id, modelo_id, "📦 Conteúdo", sender);
    }

  } catch (err) {
    console.error("🔥 ERRO sendMessage:", err);
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
 io.to(`modelo_${modelo_id}`).emit("listUpdate");
io.to(`cliente_${cliente_id}`).emit("listUpdate");

io.to(`modelo_${modelo_id}`).emit("chatListSeen", {
  chat_id: cliente_id
});

io.to(`cliente_${cliente_id}`).emit("chatListSeen", {
  chat_id: modelo_id
});


    // 2️⃣ busca histórico base
    const result = await db.query(
      `
SELECT
  id,
  cliente_id,
  modelo_id,
  sender,
  text,          -- ✅ EXISTE
  tipo,          -- texto | conteudo
  preco,
  visto,
  conteudo_id,
  pacote_id,
  created_at
FROM messages
WHERE cliente_id = $1
  AND modelo_id  = $2
ORDER BY created_at ASC;

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

 

// 📦 ENVIO DE CONTEÚDO (1 ou N mídias) — BLOCO FINAL CORRETO
socket.on("sendConteudo", async ({ cliente_id, modelo_id, conteudos_ids, preco }) => {
  try {
    // 🔒 valida socket
    if (!socket.user || socket.user.role !== "modelo") return;

    // 🔒 valida array
    if (!Array.isArray(conteudos_ids)) return;

    // 🔒 sanitiza ids
    conteudos_ids = conteudos_ids.filter(
      id => Number.isInteger(id) && id > 0
    );

    if (conteudos_ids.length === 0) {
      console.log("⛔ Nenhum conteudo_id válido recebido");
      return;
    }

    const sala = `chat_${cliente_id}_${modelo_id}`;

    // 🔒 valida existência real no banco
    const validosRes = await db.query(
      `
      SELECT id
      FROM conteudos
      WHERE id = ANY($1)
      `,
      [conteudos_ids]
    );

    const idsValidos = validosRes.rows.map(r => r.id);

    if (idsValidos.length === 0) {
      console.log("⛔ Nenhum conteudo_id existe no banco");
      return;
    }

    // 1️⃣ cria mensagem principal
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

    // 2️⃣ associa mídias válidas
    for (const conteudo_id of idsValidos) {
      await db.query(
        `
        INSERT INTO messages_conteudos (message_id, conteudo_id)
        VALUES ($1, $2)
        `,
        [messageId, conteudo_id]
      );
    }

    // 3️⃣ busca mídias finais
    const midiasRes = await db.query(
      `
      SELECT
        c.url,
        c.tipo AS tipo_media
      FROM conteudos c
      WHERE c.id = ANY($1)
      `,
      [idsValidos]
    );

    const midias = midiasRes.rows;

    // 4️⃣ envia para a sala (modelo + cliente)
    io.to(sala).emit("newMessage", {
      id: messageId,
      cliente_id,
      modelo_id,
      sender: "modelo",
      tipo: "conteudo",
      preco,
      visto: false,
      quantidade: midias.length,
      midias,
      bloqueado: Number(preco) > 0,
      created_at: new Date()
    });

    io.to(`modelo_${modelo_id}`).emit("chatListUpdate", {
  chat_id: cliente_id,
  last_message: "[Conteúdo]",
  last_time: new Date(),
  unread_delta: 0
});

io.to(`cliente_${cliente_id}`).emit("chatListUpdate", {
  chat_id: modelo_id,
  last_message: "[Conteúdo]",
  last_time: new Date(),
  unread_delta: 1
});

  } catch (err) {
    console.error("❌ Erro sendConteudo:", err);
  }
});


 // 👁️ CLIENTE VISUALIZOU CONTEÚDO
socket.on("conteudoVisto", async ({ message_id }) => {
  console.log("🔓 Conteúdo liberado:", message_id);

  conteudosLiberados.add(Number(message_id));

  // ✅ FECHA POPUP PIX SEM CONDIÇÃO
  fecharPopupPix();

  // 🔄 ATUALIZA CARD NO CHAT
  const card = document.querySelector(
    `.chat-conteudo[data-id="${message_id}"]`
  );

  if (!card) return;

  const res = await fetch(`/api/chat/conteudo/${message_id}`, {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  if (!res.ok) return;

  const midias = await res.json();

  // 🔥 REMOVE ESTADO DE BLOQUEIO COMPLETAMENTE
  card.classList.remove("bloqueado");
  card.classList.add("livre");
  card.removeAttribute("data-preco");

  // 🔥 REMOVE BOTÃO DESBLOQUEAR
  const info = card.querySelector(".conteudo-info");
  if (info) info.remove();

  // 🔥 RENDERIZA MÍDIAS
  card.innerHTML = `
    <div class="pacote-grid">
      ${midias.map((m, index) => `
        <div class="midia-item"
             onclick="abrirConteudoSeguro(${message_id}, ${index})">
          ${
            m.tipo_media === "video"
              ? `<video src="${m.url}" muted playsinline></video>`
              : `<img src="${m.url}" />`
          }
        </div>
      `).join("")}
    </div>
  `;
});

socket.on("marcarConteudoVisto", async ({ message_id, cliente_id, modelo_id }) => {
  try {
    // 🔒 segurança
    if (!socket.user || socket.user.role !== "cliente") return;
    if (socket.user.id !== cliente_id) return;

    // ✅ marca como visto (grátis OU pago)
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

    // 🔥 avisa cliente + modelo
    const sala = `chat_${cliente_id}_${modelo_id}`;
    io.to(sala).emit("conteudoVisto", {
      message_id: Number(message_id)
    });

  } catch (err) {
    console.error("❌ Erro marcarConteudoVisto:", err);
  }
});

});
// ===============================
//ROTA GET
// ===============================
app.get("/api/vip/status/:modelo_id", authCliente, async (req, res) => {
  const cliente_id = req.user.id;
  const modelo_id = Number(req.params.modelo_id);

  // 🔒 validação param
  if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json({ error: "modelo_id inválido" });
  }

  const result = await db.query(
    `
   SELECT expiration_at
   FROM vip_subscriptions
   WHERE cliente_id = $1
   AND modelo_id = $2
   AND ativo = true
   AND expiration_at > NOW()
   LIMIT 1
    `,
    [cliente_id, modelo_id]
   );

   res.json({
   vip: result.rowCount > 0,
   expiration_at: result.rows[0]?.expiration_at || null
  });
});

// ✅ NOVA — só para app / PWA
app.get("/api/app/state-v2", auth, (req, res) => {
  if (!req.user || !req.user.role) {
    return res.status(401).json({ next: "logout" });
  }

  if (req.user.role === "modelo") {
    return res.json({ next: "modelo" });
  }

  if (req.user.role === "cliente") {
    return res.json({ next: "cliente" });
  }

  return res.json({ next: "logout" });
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
      SELECT id, url, tipo, thumbnail_url, criado_em
FROM conteudos
WHERE user_id = $1
  AND tipo_conteudo = 'feed'
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

app.get("/api/modelo/:id/feed", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json([]);
    }

    const { id } = req.params;

    const result = await db.query(`
      SELECT id, url, tipo, thumbnail_url
FROM conteudos
WHERE user_id = $1
  AND tipo_conteudo = 'feed'
ORDER BY criado_em DESC
    `, [id]);

    res.json(result.rows);

  } catch (err) {
    console.error("Erro feed público da modelo:", err);
    res.status(500).json([]);
  }
});

app.get("/api/modelo/publico/:id/feed", async (req, res) => {
  const modelo_id = Number(req.params.id);

  if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json([]);
  }

  try {
    const result = await db.query(`
      SELECT id, url, tipo, thumbnail_url
      FROM conteudos
      WHERE user_id = $1
        AND tipo_conteudo = 'feed'
      ORDER BY criado_em DESC
    `, [modelo_id]);

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

// BUSCAR DADOS DO CLIENTE
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

// MODELOS COM CHAT (CLIENTE)
app.get("/api/cliente/modelos", auth, async (req, res) => {
  try {
    if (req.user.role !== "cliente") {
      return res.status(403).json([]);
    }

const result = await db.query(`
  SELECT m.user_id AS id, m.nome
  FROM vip_subscriptions v
  JOIN modelos m ON m.user_id = v.modelo_id
  WHERE v.cliente_id = $1
  AND v.ativo = true
  AND v.expiration_at > NOW()
  ORDER BY m.nome
`, 
[req.user.id]);


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


// 👤 IDENTIDADE DO CLIENTE (JWT)
app.get("/api/cliente/me", auth, async (req, res) => {
  if (req.user.role !== "cliente") {
    return res.status(403).json({ error: "Apenas cliente" });
  }

  const result = await db.query(`
    SELECT
      c.user_id AS id,
      cd.username,
      c.nome
    FROM clientes c
    LEFT JOIN clientes_dados cd
      ON cd.user_id = c.user_id
    WHERE c.user_id = $1
  `, [req.user.id]);

  res.json(result.rows[0]);
});


//ROTA LISTA VIP
app.get("/api/modelo/vips", auth, authModelo, async (req, res) => {
  const modelo_id = req.user.id;

  const result = await db.query(
  `
  SELECT c.nome AS cliente
  FROM vip_subscriptions v
  JOIN clientes c ON c.user_id = v.cliente_id
  WHERE v.modelo_id = $1
  AND v.ativo = true
  AND v.expiration_at > NOW()
  ORDER BY c.nome
  `,
  [modelo_id]
);


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
  const modelo_id = Number(req.params.id);

if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json({ error: "modelo_id inválido" });
  }

  try {
    const result = await db.query(
      `
      SELECT
        m.user_id AS id,
        m.nome,
        m.bio,
        m.avatar,
        m.capa
      FROM modelos m
      WHERE m.user_id = $1
      `,
      [modelo_id]
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
      FROM vip_subscriptions v
      JOIN modelos m ON m.user_id = v.modelo_id
      WHERE v.cliente_id = $1
      AND v.ativo = true
      AND v.expiration_at > NOW()
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
  cd.username,
  c.nome,
  cd.avatar,

  MAX(m.created_at)
    FILTER (WHERE m.sender = 'modelo')
    AS ultima_msg_modelo_ts,

  CASE
    WHEN COUNT(m.id) = 0 THEN 'novo'
    ELSE 'normal'
  END AS status

FROM vip_subscriptions v
JOIN clientes c ON c.user_id = v.cliente_id
LEFT JOIN clientes_dados cd ON cd.user_id = c.user_id
LEFT JOIN messages m
  ON m.cliente_id = c.user_id
 AND m.modelo_id = $1

WHERE v.modelo_id = $1
AND v.ativo = true
AND v.expiration_at > NOW()

GROUP BY c.user_id, cd.username, c.nome, cd.avatar

ORDER BY
  CASE WHEN COUNT(m.id) = 0 THEN 0 ELSE 1 END,
  ultima_msg_modelo_ts DESC NULLS LAST;
  
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

app.get("/api/chat/conteudo/:message_id", authCliente, async (req, res) => {
  const message_id = Number(req.params.message_id);

  // 🔒 validação de param
  if (!Number.isInteger(message_id) || message_id <= 0) {
    return res.status(400).json({ error: "message_id inválido" });
  }

  try {
    const result = await db.query(
      `
      SELECT
        c.url,
        c.tipo AS tipo_media
      FROM messages_conteudos mc
      JOIN conteudos c ON c.id = mc.conteudo_id
      JOIN messages m ON m.id = mc.message_id
      WHERE mc.message_id = $1
        AND m.cliente_id = $2
      `,
      [message_id, req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro buscar conteúdo liberado:", err);
    res.status(500).json([]);
  }
});


// 🔒 CONTEÚDOS JÁ VISTOS POR CLIENTE (MODELO)
app.get("/api/chat/conteudos-vistos/:cliente_id", authModelo, async (req, res) => {
  const modelo_id  = req.user.id;
  const cliente_id = Number(req.params.cliente_id);

if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
  return res.status(400).json({ error: "cliente_id inválido" });
}

  try {
    const result = await db.query(`
      SELECT DISTINCT mc.conteudo_id
      FROM messages m
      JOIN messages_conteudos mc ON mc.message_id = m.id
      WHERE m.modelo_id = $1
        AND m.cliente_id = $2
        AND m.visto = true
    `, [modelo_id, cliente_id]);

    res.json(result.rows.map(r => r.conteudo_id));
  } catch (err) {
    console.error("Erro buscar conteudos vistos:", err);
    res.status(500).json([]);
  }
});

app.get("/modelo/relatorio", (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "admin-pages", "relatorio.html")
  );
});

app.get(
  "/api/chat/conteudo-status/:message_id",
  authCliente,
  async (req, res) => {
    const message_id = Number(req.params.message_id);

    if (!Number.isInteger(message_id)) {
      return res.status(400).json({ liberado: false });
    }

    const result = await db.query(
      `
      SELECT visto
      FROM messages
      WHERE id = $1
        AND cliente_id = $2
      `,
      [message_id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.json({ liberado: false });
    }

    res.json({ liberado: result.rows[0].visto === true });
  }
);

// 📦 CONTEÚDOS DA MODELO (PARA POPUP)
app.get("/api/conteudos/me", authModelo, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT
        id,
        url,
        tipo,
        thumbnail_url
      FROM conteudos
      WHERE user_id = $1
        AND tipo_conteudo = 'venda'
      ORDER BY id DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro carregar conteudos:", err);
    res.status(500).json([]);
  }
});

// ===============================
// LISTA DE CHATS APP (NOVA ROTA)
// ===============================
app.get("/api/chats", auth, async (req, res) => {
  console.log("API /chats", {
  userId: req.user.id,
  role: req.user.role
   });
  const userId = req.user.id;
  const role = req.user.role;

  let query;
  let params = [userId];

  if (role === "modelo") {
    query = `
    SELECT
      c.user_id AS cliente_id,
      c.nome    AS other_name,

      MAX(m.created_at) AS last_time,

      (
        SELECT m2.text
        FROM messages m2
        WHERE m2.cliente_id = c.user_id
          AND m2.modelo_id = $1
        ORDER BY m2.created_at DESC
        LIMIT 1
      ) AS last_message,

      COALESCE(u.has_unread, false) AS has_unread,
      u.unread_for

    FROM vip_subscriptions v
    JOIN clientes c
      ON c.user_id = v.cliente_id

    LEFT JOIN messages m
      ON m.cliente_id = c.user_id
     AND m.modelo_id = $1

    LEFT JOIN unread u
      ON u.cliente_id = c.user_id
     AND u.modelo_id = $1

    WHERE v.modelo_id = $1
      AND v.ativo = true
      AND v.expiration_at > NOW()

    GROUP BY
      c.user_id,
      c.nome,
      u.has_unread,
      u.unread_for

    ORDER BY last_time DESC NULLS LAST
  `;
  }

  if (role === "cliente") {
    query = `
    SELECT
      m.cliente_id,
      m.modelo_id,

      mo.user_id AS other_id,
      mo.nome    AS other_name,
      mo.avatar  AS other_avatar,

      MAX(m.created_at) AS last_time,

      (
        SELECT m2.text
        FROM messages m2
        WHERE m2.cliente_id = m.cliente_id
          AND m2.modelo_id = m.modelo_id
        ORDER BY m2.created_at DESC
        LIMIT 1
      ) AS last_message,

      COALESCE(u.has_unread, false) AS has_unread,
      u.unread_for

    FROM messages m
    JOIN modelos mo
      ON mo.user_id = m.modelo_id

    LEFT JOIN unread u
      ON u.cliente_id = m.cliente_id
     AND u.modelo_id = m.modelo_id

    WHERE m.cliente_id = $1

    GROUP BY
      m.cliente_id,
      m.modelo_id,
      mo.user_id,
      mo.nome,
      mo.avatar,
      u.has_unread,
      u.unread_for

    ORDER BY last_time DESC
  `;
}
  const result = await db.query(query, params);

const chats = result.rows.map(r => {
  if (role === "modelo") {
    return {
      chat_id: r.cliente_id,          // ✅ cliente
      name: r.other_name,
      avatar: null,                   // modelo não busca avatar aqui
      last_message: r.last_message ?? "",
      time: r.last_time,
      unread: r.has_unread && r.unread_for === "modelo" ? 1 : 0
    };
  }

  // role === "cliente"
  return {
    chat_id: r.modelo_id,             // ✅ modelo
    name: r.other_name,
    avatar: r.other_avatar ?? null,   // ✅ existe só aqui
    last_message: r.last_message ?? "",
    time: r.last_time,
    unread: r.has_unread && r.unread_for === "cliente" ? 1 : 0
  };
});
res.json(chats);
});

// ===============================
// CHAT — MENSAGENS (MODELO)
// ===============================
app.get("/api/chat/messages/:cliente_id", authModelo, async (req, res) => {
  try {
    const clienteId = req.params.cliente_id;
    const modeloId = req.user.id;

    const { rows } = await db.query(`
      SELECT
        id,
        text,
        sender,
        created_at,
        tipo,
        conteudo_id,
        preco,
        visto,
        lida
      FROM messages
      WHERE cliente_id = $1
        AND modelo_id = $2
      ORDER BY created_at ASC
    `, [clienteId, modeloId]);

    res.json(rows);

  } catch (err) {
    console.error("❌ Erro mensagens chat:", err);
    res.status(500).json({ error: "Erro ao carregar mensagens" });
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

//DADOS CLIENTE
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


// AVATAR DO CLIENTE
app.post(
  "/api/cliente/avatar",
  auth,
  upload.single("avatar"),
  async (req, res) => {
    try {
      if (req.user.role !== "cliente") {
        return res.status(403).json({ error: "Apenas clientes" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      // ☁️ upload no Cloudinary
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: `velvet/clientes/${req.user.id}/avatar`,
            transformation: [{ width: 400, height: 400, crop: "fill" }]
          },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });

      // 🔄 tenta atualizar avatar (perfil já existente)
      const update = await db.query(
        `
        UPDATE clientes_dados
        SET avatar = $1, atualizado_em = NOW()
        WHERE user_id = $2
        `,
        [result.secure_url, req.user.id]
      );

      // 🚫 se ainda não preencheu "Meus Dados"
      if (update.rowCount === 0) {
        return res.status(400).json({
          error: "Preencha seus dados antes de adicionar uma foto de perfil."
        });
      }

      // ✅ sucesso
      res.json({ url: result.secure_url });

    } catch (err) {
      console.error("Erro avatar cliente:", err);
      res.status(500).json({ error: "Erro ao atualizar avatar" });
    }
  }
);

app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const { email, senha, role, nome, ageConfirmed, ref, src } = req.body;

    // 🔒 validação básica
    if (!email || !senha || !role) {
      return res.status(400).json({ erro: "Dados inválidos" });
    }

    // 📧 validação de email (CORREÇÃO)
    if (!emailValido(email)) {
      return res.status(400).json({ erro: "Email inválido" });
    }

    // 🔞 validação obrigatória +18
    if (ageConfirmed !== true) {
      return res.status(400).json({
        erro: "Confirmação de idade obrigatória (+18)"
      });
    }

    const hash = await bcrypt.hash(senha, 10);

    // 👤 cria usuário + salva declaração +18
    const userResult = await db.query(
      `
      INSERT INTO public.users
        (email, password_hash, role, age_confirmed, age_confirmed_at)
      VALUES
        ($1, $2, $3, true, NOW())
      RETURNING id
      `,
      [email, hash, role]
    );

    const userId = userResult.rows[0].id;

    // 👠 modelo
    if (role === "modelo") {
      const nomeModelo = nome || email.split("@")[0];

      await db.query(
        `
        INSERT INTO public.modelos (user_id, nome)
        VALUES ($1, $2)
        `,
        [userId, nomeModelo]
      );
    }

    // 👤 cliente
    if (role === "cliente") {
      await db.query(
        `
        INSERT INTO public.clientes (user_id, nome, origem_trafego, ref_modelo)
        VALUES ($1, $2, $3, $4)
        `,
        [ 
      userId, nome || email.split("@")[0], src || null, ref ? Number(ref) : null ]
      );
    }

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
app.post("/api/login", authLimiter, async (req, res) => {
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
  { expiresIn: "24h" }
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

// ===============================
// 🗑 EXCLUIR CONTEÚDO (MODELO)
// ===============================

// 🗑 EXCLUIR CONTEÚDO (MODELO)
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

      const url = result.rows[0].url;

      try {
        await excluirArquivoFisico(url);
      } catch (e) {
        console.warn("⚠️ Falha ao apagar arquivo físico:", e.message);
      }

      await db.query(
        `DELETE FROM conteudos WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );

      res.json({ success: true });

    } catch (err) {
      console.error("Erro ao excluir conteúdo:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);

//DELETAR CONTA
app.delete("/api/conta/excluir", auth, async (req, res) => {
  const userId = req.user.id;
  const senhaInformada = req.body.senha;

  if (!senhaInformada) {
    return res.status(400).json({ error: "Senha obrigatória" });
  }

  const client = await db.connect();
  try {
    // 🔐 busca hash da senha
    const userRes = await client.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const senhaHash = userRes.rows[0].password_hash;
    const senhaOk = await bcrypt.compare(senhaInformada, senhaHash);

    if (!senhaOk) {
      return res.status(401).json({ error: "Senha inválida" });
    }

    await client.query("BEGIN");

    // 🔥 A PARTIR DAQUI É EXCLUSÃO TOTAL (como antes)
    await client.query("DELETE FROM messages WHERE cliente_id = $1 OR modelo_id = $1", [userId]);
    await client.query("DELETE FROM vip_subscriptions WHERE cliente_id = $1 OR modelo_id = $1", [userId]);
    await client.query("DELETE FROM conteudo_pacotes WHERE modelo_id = $1", [userId]);
    await client.query("DELETE FROM modelos_dados WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM clientes_dados WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);

    await client.query("COMMIT");

    res.json({ ok: true });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ERRO EXCLUIR CONTA:", err);
    res.status(500).json({ error: "Erro ao excluir conta" });
  } finally {
    client.release();
  }
});



app.post(
  "/uploadMidia",
  auth,
  onlyModelo,
  uploadB2.single("midia"),
  async (req, res) => {
    const isVideo = req.file.mimetype.startsWith("video");

    let thumbnailUrl = null;

    try {
      if (isVideo) {
        const videoStream = await s3.getObject({
          Bucket: process.env.B2_BUCKET,
          Key: decodeURIComponent(req.file.location.split(".com/")[1])
        }).createReadStream();

        await new Promise((resolve, reject) => {
          const write = fs.createWriteStream(tempVideo);
          videoStream.pipe(write);
          write.on("finish", resolve);
          write.on("error", reject);
        });

        // ===============================
        // 2. Gera thumbnail REAL
        // ===============================
        await gerarThumbnail(tempVideo, tempThumb);

        // ===============================
        // 3. Upload thumbnail no B2
        // ===============================
        const thumbKey = `velvet/feed/${req.user.id}/thumb-${Date.now()}.jpg`;

        const thumbUpload = await s3.upload({
          Bucket: process.env.B2_BUCKET,
          Key: thumbKey,
          Body: fs.createReadStream(tempThumb),
          ContentType: "image/jpeg",
          ACL: "public-read"
        }).promise();

        thumbnailUrl = thumbUpload.Location;

        // limpeza
        fs.unlinkSync(tempVideo);
        fs.unlinkSync(tempThumb);
      }

      // ===============================
      // 4. Salva no banco
      // ===============================
      const tipo = isVideo ? "video" : "imagem";

      await db.query(
        `
        INSERT INTO conteudos (user_id, url, tipo, tipo_conteudo, thumbnail_url)
        VALUES ($1, $2, $3, 'feed', $4)
        `,
        [req.user.id, req.file.location, tipo, thumbnailUrl]
      );

      res.json({
        success: true,
        url: req.file.location,
        thumbnail_url: thumbnailUrl
      });

    } catch (err) {
      console.error("❌ Erro upload com thumbnail:", err);
      res.status(500).json({ error: "Erro ao processar vídeo" });
    }
  }
);

app.post("/api/pagamento/vip/pix", authCliente, async (req, res) => {
  try {
    const { modelo_id, valor_assinatura } = req.body;

    const cliente_id = req.user.id;

    // 🔒 VALIDAÇÕES
    const valorAssinatura = Number(valor_assinatura);

    if (!modelo_id || !valorAssinatura || valorAssinatura <= 0) {
      return res.status(400).json({ error: "Dados inválidos" });
    }

    // 🔥 TAXAS OFICIAIS (BACKEND É A FONTE DA VERDADE)
    const taxaTransacao  = Number((valorAssinatura * 0.10).toFixed(2)); // 10%
    const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2)); // 5%

    let valorTotal = Number(
      (valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    // 🔒 Regra MercadoPago PIX (mínimo R$1,00)
    if (valorTotal < 1) {
      valorTotal = 1.00;
    }

    const mp = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const payment = new Payment(mp);

    const pagamento = await payment.create({
      body: {
        transaction_amount: valorTotal,
        description: "Assinatura VIP",
        payment_method_id: "pix",
        payer: {
          email: "contat@velvet.lat"
        },
        metadata: {
          tipo: "vip",
          cliente_id,
          modelo_id,
          valor_assinatura: valorAssinatura,
          taxa_transacao: taxaTransacao,
          taxa_plataforma: taxaPlataforma
        }
      }
    });

    return res.json({
      qr_code: pagamento.point_of_interaction.transaction_data.qr_code_base64,
      copia_cola:
        pagamento.point_of_interaction.transaction_data.qr_code,
      payment_id: pagamento.id
    });

  } catch (err) {
    console.error("❌ Erro PIX VIP:", err);
    return res.status(500).json({
      error: "Erro ao gerar pagamento PIX"
    });
  }
});


// ===============================
// WEBHOOK MERCADOPAGO
// ===============================
app.post("/webhook/mercadopago", async (req, res) => {
  try {
    const paymentId = req.body?.data?.id;
    if (!paymentId) return res.sendStatus(200);

    const mp = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const payment = new Payment(mp);
    const pagamento = await payment.get({ id: paymentId });

    // ⏳ só processa se aprovado
    if (pagamento.status !== "approved") {
      return res.sendStatus(200);
    }

    const tipo = pagamento.metadata?.tipo;
    if (!tipo) return res.sendStatus(200);

    // ===============================
    // 🔥 VIP
    // ===============================
    if (tipo === "vip") {
      const {
        cliente_id,
        modelo_id,
        valor_assinatura,
        taxa_transacao,
        taxa_plataforma
      } = pagamento.metadata;

      await ativarVipAssinatura({
        cliente_id,
        modelo_id,
        valor_assinatura,
        taxa_transacao,
        taxa_plataforma
      });

      // realtime
      const socketId = onlineClientes[cliente_id];
      if (socketId) {
        io.to(socketId).emit("vipAtivado", { modelo_id });
      }

      console.log("✅ VIP ATIVADO:", cliente_id, modelo_id);
    }

    // ===============================
    // 🔓 CONTEÚDO
    // ===============================
if (tipo === "conteudo") {
  const {
    cliente_id,
    modelo_id,
    message_id,
    valor_base,
    taxa_transacao,
    taxa_plataforma
  } = pagamento.metadata;

  const valor_total = pagamento.transaction_amount;

  // 1️⃣ Buscar o preço real do conteúdo
  const precoResult = await db.query(`
    SELECT preco
    FROM messages
    WHERE id = $1
  `, [message_id]);

  if (precoResult.rowCount === 0) {
    throw new Error("Conteúdo não encontrado para calcular preço");
  }

  const preco = Number(precoResult.rows[0].preco);

  // 2️⃣ Registrar pagamento do conteúdo (PIX)
  await db.query(
    `
    INSERT INTO conteudo_pacotes (
      message_id,
      cliente_id,
      modelo_id,
      preco,
      valor_base,
      taxa_transacao,
      taxa_plataforma,
      valor_total,
      status,
      payment_id,
      metodo_pagamento,
      pago_em
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pago',$9,'pix',NOW())
    ON CONFLICT (message_id, cliente_id)
    DO NOTHING
    `,
    [
      message_id,
      cliente_id,
      modelo_id,
      preco,          // ✅ CORRETO: usa o preço do banco
      valor_base,
      taxa_transacao,
      taxa_plataforma,
      valor_total,
      pagamento.id
    ]
  );

  // 3️⃣ Liberar conteúdo no chat
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
io.to(sala).emit("conteudoVisto", {
  message_id: Number(message_id)
});

  console.log("✅ CONTEÚDO PAGO (PIX) REGISTRADO:", message_id);
}

    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Erro webhook MercadoPago:", err);
    return res.sendStatus(500);
  }
});


app.post("/api/pagamento/vip/cartao", authCliente, async (req, res) => {
  try {
    const { modelo_id, valor_assinatura } = req.body;

    const cliente_id = req.user.id;

    // 🔒 VALIDAÇÕES BÁSICAS
    const valorAssinatura = Number(valor_assinatura);

    if (!modelo_id || !valorAssinatura || valorAssinatura <= 0) {
      return res.status(400).json({ error: "Dados inválidos" });
    }

    // 🔥 TAXAS OFICIAIS (BACKEND É A FONTE DA VERDADE)
    const taxaTransacao  = Number((valorAssinatura * 0.10).toFixed(2)); // 10%
    const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2)); // 5%

    const valorTotal = Number(
      (valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    // Stripe trabalha em centavos
    const amount = Math.round(valorTotal * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "brl",
      payment_method_types: ["card"],
      metadata: {
        tipo: "vip",
        cliente_id,
        modelo_id,
        valor_assinatura: valorAssinatura,
        taxa_transacao: taxaTransacao,
        taxa_plataforma: taxaPlataforma
      }
    });

    return res.json({
      clientSecret: paymentIntent.client_secret
    });

  } catch (err) {
    console.error("❌ Erro Stripe VIP:", err);
    return res.status(500).json({
      error: "Erro ao criar pagamento com cartão"
    });
  }
});


app.post("/api/pagamento/conteudo/pix", authCliente, async (req, res) => {
  try {
    const { message_id } = req.body;

    if (!message_id) {
      return res.status(400).json({ error: "message_id inválido" });
    }

    // 🔎 busca preço + modelo_id (OBRIGATÓRIO)
    const result = await db.query(
      `
      SELECT preco, modelo_id
      FROM messages
      WHERE id = $1
        AND cliente_id = $2
        AND tipo = 'conteudo'
      `,
      [message_id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conteúdo não encontrado" });
    }

    const { preco, modelo_id } = result.rows[0];

    const valorBase = Number(preco);
    const taxaTransacao  = Number((valorBase * 0.10).toFixed(2));
    const taxaPlataforma = Number((valorBase * 0.05).toFixed(2));

    let valorTotal = valorBase + taxaTransacao + taxaPlataforma;
    if (valorTotal < 1) valorTotal = 1;

    const mpClient = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const payment = new Payment(mpClient);

    const pix = await payment.create({
      body: {
        transaction_amount: valorTotal,
        payment_method_id: "pix",
        description: `Conteúdo ${message_id}`,
        external_reference: `conteudo_${message_id}`,
        payer: {
          email: "cliente@velvet.lat"
        },
        metadata: {
          tipo: "conteudo",
          cliente_id: req.user.id,
          modelo_id: modelo_id,
          message_id: Number(message_id)
        }
      }
    });

    res.json({
      qr_code: pix.point_of_interaction.transaction_data.qr_code_base64,
      copia_cola:
        pix.point_of_interaction.transaction_data.qr_code
    });

  } catch (err) {
    console.error("❌ Erro PIX conteúdo:", err);
    res.status(500).json({ error: "Erro ao gerar PIX" });
  }
});


app.post(
  "/api/pagamento/conteudo/cartao",
  authCliente,
  async (req, res) => {
    try {
      const { message_id } = req.body;

      if (!message_id) {
        return res.status(400).json({ error: "message_id inválido" });
      }

      // 🔎 busca preço + modelo_id
      const result = await db.query(
        `
        SELECT preco, modelo_id
        FROM messages
        WHERE id = $1
          AND cliente_id = $2
          AND tipo = 'conteudo'
        `,
        [message_id, req.user.id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Conteúdo não encontrado" });
      }

      const { preco, modelo_id } = result.rows[0];

      const valorBase = Number(preco);
      const taxaTransacao  = Number((valorBase * 0.10).toFixed(2));
      const taxaPlataforma = Number((valorBase * 0.05).toFixed(2));

      let valorTotal = valorBase + taxaTransacao + taxaPlataforma;
      if (valorTotal < 1) valorTotal = 1;

      // Stripe trabalha em centavos
      const amount = Math.round(valorTotal * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "brl",
        payment_method_types: ["card"],
        metadata: {
          tipo: "conteudo",
          cliente_id: req.user.id,
          modelo_id,
          message_id: Number(message_id),
          valor_base: valorBase,
          taxa_transacao: taxaTransacao,
          taxa_plataforma: taxaPlataforma
        }
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        valor_base: valorBase,
        taxa_transacao: taxaTransacao,
        taxa_plataforma: taxaPlataforma,
        valor_total: valorTotal
      });

    } catch (err) {
      console.error("❌ Erro cartão conteúdo:", err);
      res.status(500).json({ error: "Erro ao iniciar pagamento" });
    }
  }
);

app.post(
  "/api/track-acesso",
  express.json(), // 🔒 garante body
  async (req, res) => {
  try {
    const { ref, src } = req.body;

    if (!ref && !src) {
      return res.json({ ok: true });
    }

    await db.query(`
      INSERT INTO acessos_origem (modelo_id, origem, ip, user_agent)
      VALUES ($1, $2, $3, $4)
    `, [
      ref?.replace("modelo_", "") || null,
      src || "desconhecido",
      req.ip,
      req.headers["user-agent"]
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro track acesso:", err);
    res.status(500).json({ error: "Erro ao registrar acesso" });
  }
});

//RENOVAÇÃO VIP
// POST /api/vip/cartao/assinatura
app.post("/api/vip/cartao/assinatura", authCliente, async (req, res) => {
  const { modelo_id } = req.body;
  const cliente_id = req.user.id;

  // 1) Criar (ou recuperar) customer
  const customer = await stripe.customers.create({
    metadata: { cliente_id }
  });

  // 2) Criar assinatura
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: "price_1Ss0jzRtYLPrY4c3clhTxyWD" }],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
    metadata: { cliente_id, modelo_id }
  });

  // 3) Criar VIP inicial (30 dias)
  await db.query(`
    INSERT INTO vip_subscriptions (
      cliente_id, modelo_id, ativo,
      expiration_at, recorrente, stripe_subscription_id
    ) VALUES (
      $1, $2, true,
      NOW() + INTERVAL '30 days',
      true, $3
    )
    ON CONFLICT (cliente_id, modelo_id)
    DO UPDATE SET
      recorrente = true,
      stripe_subscription_id = $3
  `, [cliente_id, modelo_id, subscription.id]);

  res.json({
    clientSecret: subscription.latest_invoice.payment_intent.client_secret
  });
});

// POST /api/vip/cancelar
app.post("/api/vip/cancelar", authCliente, async (req, res) => {
  const { modelo_id } = req.body;
  const cliente_id = req.user.id;

  const vip = await db.query(`
    SELECT stripe_subscription_id
    FROM vip_subscriptions
    WHERE cliente_id = $1 AND modelo_id = $2 AND recorrente = true
  `, [cliente_id, modelo_id]);

  if (!vip.rowCount) {
    return res.status(404).json({ error: "Assinatura não encontrada" });
  }

  await stripe.subscriptions.del(vip.rows[0].stripe_subscription_id);

  await db.query(`
    UPDATE vip_subscriptions
    SET recorrente = false
    WHERE cliente_id = $1 AND modelo_id = $2
  `, [cliente_id, modelo_id]);

  res.json({ ok: true });
});

//ESQUECI MINHA SENHA
app.post("/api/password/forgot", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email obrigatório" });
    }

    // 🔒 nunca revele se o email existe
    const userRes = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (userRes.rowCount === 0) {
      return res.json({ ok: true });
    }

    const userId = userRes.rows[0].id;

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await db.query(
      "INSERT INTO password_resets (user_id, codigo, expires_at) VALUES ($1, $2, $3)",
      [userId, codigo, expires]
    );

    // 📧 ENVIO EMAIL (SENDGRID WEB API)
    await sgMail.send({
      to: email,                          // 🔴 email do usuário
      from: process.env.EMAIL_FROM,       // 🔴 email da plataforma
      subject: "Recuperação de senha – Velvet",
      html: `
        <p>Seu código de recuperação é:</p>
        <h2>${codigo}</h2>
        <p>Este código expira em 15 minutos.</p>
      `
    });

    return res.json({ ok: true });

  } catch (error) {
    console.error("❌ ERRO PASSWORD FORGOT:", error.response?.body || error);
    return res.status(500).json({ error: "Erro ao enviar código" });
  }
});

//confirmar codigo e nova senha
app.post("/api/password/reset", async (req, res) => {
  try {
    const { email, codigo, novaSenha } = req.body;

    if (!email || !codigo || !novaSenha) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({ error: "Senha muito curta" });
    }

    const userRes = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (userRes.rowCount === 0) {
      return res.status(400).json({ error: "Código inválido" });
    }

    const userId = userRes.rows[0].id;

    const resetRes = await db.query(`
      SELECT id
      FROM password_resets
      WHERE user_id = $1
        AND codigo = $2
        AND usado = false
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, codigo]);

    if (resetRes.rowCount === 0) {
      return res.status(400).json({ error: "Código inválido ou expirado" });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await db.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [senhaHash, userId]
    );

    await db.query(
      "UPDATE password_resets SET usado = true WHERE id = $1",
      [resetRes.rows[0].id]
    );

    return res.json({ success: true });

  } catch (error) {
    console.error("❌ ERRO PASSWORD RESET:", error);
    return res.status(500).json({ error: "Erro ao redefinir senha" });
  }
});


// ===============================
// 📩 FALE CONOSCO / CONTATO
// ===============================
app.post("/api/contato", async (req, res) => {
  try {
    const { nome, email, assunto, mensagem } = req.body;

    if (!nome || !email || !assunto || !mensagem) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    await sgMail.send({
      to: process.env.EMAIL_FROM,
      from: process.env.EMAIL_FROM,
      replyTo: email,
      subject: `[Contato] ${assunto}`,
      html: `
        <h3>Novo contato pelo site</h3>
        <p><b>Nome:</b> ${nome}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Assunto:</b> ${assunto}</p>
        <p><b>Mensagem:</b></p>
        <p>${mensagem}</p>
      `
    });

    return res.json({ success: true });

  } catch (error) {
    console.error("❌ Erro contato:", error.response?.body || error);
    return res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});






// ===============================
// 🔥 MIDDLEWARE GLOBAL DE ERRO
// ===============================
app.use((err, req, res, next) => {
  console.error("🔥 ERRO GLOBAL:", {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  res.status(500).json({
    error: "Erro interno do servidor"
  });
});

process.on("unhandledRejection", reason => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", err => {
  console.error("❌ Uncaught Exception:", err);
});

// ===============================
// EXPIRA VIP
// ===============================
setInterval(async () => {
  try {
    await db.query(`
      UPDATE vip_subscriptions
      SET ativo = false
      WHERE ativo = true
        AND expiration_at <= NOW()
    `);
  } catch (err) {
    console.error("Erro ao expirar VIPs:", err);
  }
}, 60 * 60 * 1000); // roda a cada 1 hora

app.use("/", servercontent);

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});