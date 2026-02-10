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
const os = require("os");
const { exec } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const authAdmin = require("./middleware/authAdmin");

app.use("/app", express.static("app"));
app.use(express.static("public"));
app.use((req, res, next) => {
  console.log("➡️ REQ:", req.method, req.url);
  next();
});
app.set("trust proxy", 1);
const server = http.createServer(app);
const multer = require("multer");
const onlineClientes = {};
const onlineModelos = {};
const AWS = require("aws-sdk");
const multerS3 = require("multer-s3");

const { MercadoPagoConfig, Payment } = require("mercadopago");
const CONTEUDOS_FILE = "conteudos.json";
const MODELOS_FILE = "modelos.json";
const COMPRAS_FILE = "compras.json";
const bodyParser = require("body-parser");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin-pages")));
app.use("/icons", express.static(path.join(__dirname, "icons")));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  "https://www.velvet.lat",
  "https://app-production-e7e1.up.railway.app",
  "https://velvet-test-production.up.railway.app",
  "https://velvet-test-production.up.railway.app/app",
   "https://www.velvet.lat/app/"
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

const s3Privado = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.B2_ENDPOINT),
  accessKeyId: process.env.B2_KEY_ID_PRIV,
  secretAccessKey: process.env.B2_APP_KEY_PRIV,
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

      // 👇 AQUI entra a regra
      const pasta =
        req.user.role === "modelo" ? "modelos" : "clientes";

      const caminho = `velvet/${pasta}/${req.user.id}/${Date.now()}.${ext}`;

      cb(null, caminho);
    }
  })
});

// ===============================
// BACKBLAZE B2 (VERIFICAÇÃO - PRIVADO)
// ===============================
const uploadVerificacao = multer({
  storage: multerS3({
    s3: s3Privado,
    bucket: process.env.B2_BUCKET_PRIVATE,
    acl: "private",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = file.originalname.split(".").pop();
      const nome = `verificacao/${req.user.id}/${Date.now()}-${file.fieldname}.${ext}`;
      cb(null, nome);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});


app.use(express.static(path.join(__dirname, "public")));


// 📦 FEED CANÔNICO (FONTE ÚNICA)
async function buscarFeedCompletoPorUserId(user_id) {
  const result = await db.query(`
    SELECT
      id,
      url,
      tipo,
      tipo_conteudo,
      preco,
      descricao,
      thumbnail_url,
      criado_em
    FROM conteudos
    WHERE user_id = $1
    ORDER BY id DESC
  `, [user_id]);

  return result.rows;
}


async function gerarThumbnailVideo(videoUrl) {
  const tmpDir = os.tmpdir();
  const videoPath = path.join(tmpDir, `video-${Date.now()}.mp4`);
  const thumbPath = path.join(tmpDir, `thumb-${Date.now()}.jpg`);

  // 1️⃣ BAIXA O VÍDEO (Node puro, sem curl)
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error("Falha ao baixar vídeo");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(videoPath, buffer);

  // 2️⃣ GERA THUMB COM FFMPEG
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ["1"],
        filename: path.basename(thumbPath),
        folder: tmpDir,
        size: "400x?"
      })
      .on("end", resolve)
      .on("error", reject);
  });

  // 3️⃣ UPLOAD DA THUMB PARA O BACKBLAZE (👇 ESTE TRECHO QUE VOCÊ PERGUNTOU)
  const thumbBuffer = fs.readFileSync(thumbPath);

  const upload = await s3.upload({
    Bucket: process.env.B2_BUCKET,
    Key: `thumbs/thumb-${Date.now()}.jpg`,
    Body: thumbBuffer,
    ContentType: "image/jpeg",
    ACL: "public-read"
  }).promise();

  // 4️⃣ LIMPA ARQUIVOS TEMPORÁRIOS
  fs.unlinkSync(videoPath);
  fs.unlinkSync(thumbPath);

  // 5️⃣ RETORNA URL DA THUMB
  return upload.Location;
}

async function uploadThumbB2(buffer) {
  const key = `thumbs/thumb-${Date.now()}.jpg`;

  const result = await s3.upload({
    Bucket: process.env.B2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "image/jpeg",
    ACL: "public-read"
  }).promise();

  return result.Location;
}

function gerarSignedUrl(key) {
  return s3Privado.getSignedUrl("getObject", {
    Bucket: process.env.B2_BUCKET_PRIVADO,
    Key: key,
    Expires: 60 * 5 // 5 minutos
  });
}

//APP POST ROTAS ////
//MIDIAS DO FEED
app.post(
  "/api/upload",
  auth,
  authModelo,
  uploadB2.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Arquivo não enviado" });
      }

      const isVideo = req.file.mimetype.startsWith("video");

      const {
        tipo_conteudo,
        preco,
        descricao
      } = req.body;

      const publicUrl = `${process.env.B2_PUBLIC_URL}/${req.file.key}`;
      let thumbnailUrl = null;

      // 🔥 GERA THUMBNAIL SE FOR VÍDEO
      if (isVideo) {
        try {
          thumbnailUrl = await gerarThumbnailVideo(publicUrl);
        } catch (err) {
          console.error("Erro ao gerar thumbnail:", err);
        }
      }

      await db.query(
        `
        INSERT INTO conteudos
        (user_id, url, tipo, tipo_conteudo, preco, descricao, thumbnail_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          req.user.id,
          publicUrl,
          isVideo ? "video" : "imagem",
          tipo_conteudo || "feed",
          preco || null,
          descricao || null,
          thumbnailUrl
        ]
      );

      res.json({ success: true });

    } catch (err) {
      console.error("Erro /api/upload:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);

//OFERTAS
app.post("/api/ofertas", authModelo, async (req, res) => {
  try {
    const userId = req.user.id;

    const modeloRes = await db.query(
      `SELECT id FROM modelos WHERE user_id = $1`,
      [userId]
    );

    if (modeloRes.rows.length === 0) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    const modeloId = modeloRes.rows[0].id;

    const { nome, limite, dias, desconto, mensagem } = req.body;

    if (
      !nome ||
      limite <= 0 ||
      dias <= 0 ||
      desconto === undefined ||
      desconto < 0 ||
      desconto > 90
    ) {
      return res.status(400).json({ erro: "Dados inválidos" });
    }

    const VALOR_BASE = Number(process.env.VALOR_BASE_VIP || 0);
    const VALOR_MINIMO = Number(process.env.VALOR_MINIMO_VIP || 0);

    let valorPromocional =
      VALOR_BASE * (1 - desconto / 100);

    if (valorPromocional < VALOR_MINIMO) {
      valorPromocional = VALOR_MINIMO;
    }

    const dataFim = new Date();
    dataFim.setDate(dataFim.getDate() + Number(dias));

    const result = await db.query(
      `
      INSERT INTO ofertas (
        modelo_id,
        nome,
        limite_assinaturas,
        assinaturas_usadas,
        desconto_percentual,
        valor_base,
        valor_promocional,
        data_inicio,
        data_fim,
        mensagem,
        ativa
      )
      VALUES ($1,$2,$3,0,$4,$5,$6,NOW(),$7,$8,true)
      RETURNING *
      `,
      [
        modeloId,
        nome,
        limite,
        desconto,
        VALOR_BASE,
        valorPromocional,
        dataFim,
        mensagem
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("🔥 ERRO AO CRIAR OFERTA 🔥", err);
    res.status(500).json({ erro: "Erro interno ao criar oferta" });
  }
});

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


app.post("/api/pagamento/vip/cartao", authCliente, async (req, res) => {
  try {
    const { modelo_id } = req.body;
    const cliente_id = req.user.id;

    if (!modelo_id) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    // 🔍 BUSCAR OFERTA ATIVA (FONTE DA VERDADE)
    const ofertaRes = await db.query(`
      SELECT valor_promocional
      FROM ofertas
      WHERE modelo_id = $1
        AND ativa = true
        AND NOW() BETWEEN data_inicio AND data_fim
      LIMIT 1
    `, [modelo_id]);

    if (ofertaRes.rows.length === 0) {
      return res.status(400).json({
        error: "Oferta VIP indisponível"
      });
    }

    const valorAssinatura = Number(ofertaRes.rows[0].valor_promocional);

    // 🔥 TAXAS (BACKEND)
    const taxaTransacao  = Number((valorAssinatura * 0.10).toFixed(2)); // 10%
    const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2)); // 5%

    const valorTotal = Number(
      (valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    // Stripe trabalha em centavos
    const amount = Math.round(valorTotal * 100);

    // 💳 PAYMENT INTENT
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
      error: "Erro ao criar pagamento com cartão",
      detalhe: err.message
    });
  }
});


const servercontent = require("./servercontent");

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

    socket.emit("authOk"); // 👈 AVISA O CLIENTE
    console.log("🔐 Socket autenticado:", decoded.id, decoded.role);
  } catch (err) {
    socket.disconnect();
  }
});


socket.on("loginModelo", (modelo_id) => {
  onlineModelos[modelo_id] = socket.id;
  console.log("🟣 Modelo online:", modelo_id, socket.id);
});

// 📥 ENTRAR NA SALA DO CHAT

socket.on("joinChat", ({ sala }) => {
  if (!sala) return;
  socket.join(sala);
  console.log("🟪 Entrou na sala:", sala);
});

socket.on("joinInbox", ({ sala }) => {
  if (!sala) return;
  socket.join(sala);
  console.log("📬 Inbox conectada:", sala);
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
    (cliente_id, modelo_id, sender, tipo, text, visto)
  VALUES ($1, $2, $3, 'texto', $4, false)
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

 // 🔥 ENVIA PARA A SALA (CLIENTE + MODELO)
// 🔥 AVISA CHAT (ambos na sala)
io.to(sala).emit("newMessage", {
  id: messageId,
  cliente_id,
  modelo_id,
  sender,
  tipo: "texto",
  text,
  created_at: new Date()
});

// 🔔 AVISA INBOX DO MODELO
io.to(`inbox_modelo_${modelo_id}`).emit("inboxMessage", {
  cliente_id,
  modelo_id,
  sender,
  text,
  created_at: new Date()
});

// 🔔 AVISA INBOX DO CLIENTE
io.to(`inbox_cliente_${cliente_id}`).emit("inboxMessage", {
  cliente_id,
  modelo_id,
  sender,
  text,
  created_at: new Date()
});

} catch (err) {
    console.error("🔥 ERRO AO SALVAR MENSAGEM:", err);
  }
});

// 📜 HISTÓRICO DO CHAT
socket.on("getHistory", async ({ cliente_id, modelo_id }) => {
  console.log("📜 getHistory:", { cliente_id, modelo_id });
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
   if (socket.user.role === "cliente") {
    // marca mensagens da MODELO como lidas
    await db.query(`
      UPDATE messages
      SET lida = true
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND sender = 'modelo'
        AND lida = false
    `, [cliente_id, modelo_id]);

    // avisa a MODELO (recibo de leitura)
    io.to(`inbox_modelo_${modelo_id}`).emit("mensagemLida", {
      cliente_id,
      modelo_id
    });

     io.to(`inbox_cliente_${cliente_id}`).emit("inboxMessage", {
    cliente_id,
    modelo_id
    });
  }

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

// 🔥 CHAT (modelo + cliente)
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

// 🔔 INBOX DA MODELO
io.to(`inbox_modelo_${modelo_id}`).emit("inboxMessage", {
  cliente_id,
  modelo_id,
  sender: "modelo",
  tipo: "conteudo",
  textoPreview:
    Number(preco) > 0
      ? `📦 Conteúdo pago (${midias.length})`
      : `📦 Conteúdo (${midias.length})`,
  created_at: new Date()
});

// 🔔 INBOX DO CLIENTE
io.to(`inbox_cliente_${cliente_id}`).emit("inboxMessage", {
  cliente_id,
  modelo_id,
  sender: "modelo",
  tipo: "conteudo",
  textoPreview:
    Number(preco) > 0
      ? `📦 Conteúdo pago (${midias.length})`
      : `📦 Conteúdo (${midias.length})`,
  created_at: new Date()
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

socket.on("editarMensagem", async ({ id, text }) => {
  try {
    if (!id || !text) return;

    await db.query(
      `
      UPDATE messages
      SET text = $1,
          updated_at = NOW()
      WHERE id = $2
        AND sender = 'modelo'
      `,
      [text, id]
    );

    io.emit("mensagemEditada", {
      id,
      text
    });
  } catch (err) {
    console.error("Erro ao editar mensagem:", err);
  }
});
socket.on("excluirMensagem", async ({ id }) => {
  try {
    if (!id) return;

    await db.query(
      `
      DELETE FROM messages
      WHERE id = $1
        AND sender = 'modelo'
      `,
      [id]
    );

    io.emit("mensagemExcluida", { id });
  } catch (err) {
    console.error("Erro ao excluir mensagem:", err);
  }
});

  // CLIENTE ONLINE
  socket.on("loginCliente", async (cliente_id) => {
  socket.cliente_id = cliente_id;
  onlineClientes[cliente_id] = socket.id;

  console.log("🟢 Cliente online:", cliente_id, socket.id);

  try {
    await db.query(
      `UPDATE clientes SET last_seen = NULL WHERE user_id = $1`,
      [cliente_id]
    );
  } catch (err) {
    console.error("Erro atualizar last_seen (online):", err);
  }
});




});


// ===============================
//ROTA GET
// ===============================
app.get(
  "/api/modelo/chat/:id",
  auth, // cliente OU modelo
  async (req, res) => {
    const modelo_id = Number(req.params.id);

    const result = await db.query(`
      SELECT
        id,
        nome_exibicao,
        user_id,
        avatar,
        last_seen
      FROM modelos
      WHERE id = $1
    `, [modelo_id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Modelo não encontrado" });
    }

    res.json(result.rows[0]);
  }
);

app.get("/api/usuario/dados", auth, async (req, res) => {
  try {
    let result;

    if (req.user.role === "modelo") {
      result = await db.query(
        "SELECT * FROM modelos_dados WHERE user_id = $1",
        [req.user.id]
      );
    } else if (req.user.role === "cliente") {
      result = await db.query(
        "SELECT * FROM clientes_dados WHERE user_id = $1",
        [req.user.id]
      );
    } else {
      return res.json({});
    }

    res.json(result.rows[0] || {});
  } catch (err) {
    console.error("ERRO GET /api/usuario/dados:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

//CONTAGEMVIPS
app.get("/api/modelo/:id/vip-count", async (req, res) => {
  const modelo_id = Number(req.params.id);

  if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json({ total: 0 });
  }

  try {
    const result = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM vip_subscriptions
      WHERE modelo_id = $1
        AND ativo = true
        AND expiration_at > NOW()
      `,
      [modelo_id]
    );

    res.json({ total: result.rows[0].total });

  } catch (err) {
    console.error("Erro contar VIPs:", err);
    res.status(500).json({ total: 0 });
  }
});


//OFERTAS QUANDO ENCERRAR
app.get("/api/ofertas", authModelo, async (req, res) => {
  const modeloRes = await db.query(
    `SELECT id FROM modelos WHERE user_id = $1`,
    [req.user.id]
  );

  if (modeloRes.rows.length === 0) {
    return res.json([]);
  }

  const modeloId = modeloRes.rows[0].id;

  await db.query("SELECT encerrar_ofertas_expiradas()");

  const result = await db.query(
    `
    SELECT *
    FROM ofertas
    WHERE modelo_id = $1
    ORDER BY created_at DESC
    `,
    [modeloId]
  );

  res.json(result.rows);
});


//ATIVAS
app.get("/api/ofertas/ativa/:modelo_id", async (req, res) => {
  try {
    const modeloId = Number(req.params.modelo_id);

    const result = await db.query(
      `
      SELECT
        id,
        modelo_id,
        nome,
        desconto_percentual,
        valor_base,
        valor_promocional,
        data_fim
      FROM ofertas
      WHERE modelo_id = $1
        AND ativa = true
        AND data_fim > NOW()
      LIMIT 1
      `,
      [modeloId]
    );

    if (result.rows.length === 0) {
      return res.json({ ativa: false });
    }

    res.json({
      ativa: true,
      oferta: result.rows[0]
    });

  } catch (err) {
    console.error("Erro buscar oferta ativa:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});


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
    nome: dados.nome || "Modelo",
    local: dados.nome || "",
  });
});

// FEED PÚBLICO DA MODELO (SÓ SE VALIDADA)
app.get("/api/modelo/publico/:id/feed", async (req, res) => {
  const modelo_id = Number(req.params.id);

  if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json([]);
  }

  try {
    // 🔒 garante validação
    const verificado = await db.query(`
      SELECT 1
      FROM modelos_verificacao
      WHERE modelo_id = $1
        AND status = 'aprovado'
      LIMIT 1
    `, [modelo_id]);

    if (!verificado.rows.length) {
      return res.status(403).json([]);
    }

    const feed = await buscarFeedCompletoPorUserId(modelo_id);
    res.json(feed);

  } catch (err) {
    console.error("Erro feed público:", err);
    res.status(500).json([]);
  }
});


// PERFIL USUARIO (CLT,MODELO)
app.get("/api/modelo/me", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(`
      SELECT
        m.user_id AS id,
        m.nome_exibicao,
        m.bio,
        m.avatar,
        m.capa,
        m.local,
        m.verificada,
        md.instagram,
        md.tiktok
      FROM modelos m
      LEFT JOIN modelos_dados md
        ON md.user_id = m.user_id
      WHERE m.user_id = $1
    `, [userId]);

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Perfil não encontrado"
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro /api/modelo/me:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// 🌟 FEED GLOBAL DE MODELOS (SÓ VALIDADOS)
app.get("/api/modelos", auth, async (req, res) => {
  try {
    if (!["cliente", "modelo"].includes(req.user.role)) {
      return res.status(403).json([]);
    }

    const result = await db.query(`
      SELECT
        m.user_id,
        m.nome_exibicao,
        m.avatar
      FROM modelos m
      JOIN modelos_verificacao v
        ON v.modelo_id = m.user_id
      WHERE v.status = 'aprovado'
      ORDER BY v.created_at DESC
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
  c.nome,
  cd.avatar,
  cd.capa
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
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "conteudos.html"));
  }
);

app.get(
  "/chatmodelo.html",
  auth,
  authModelo,
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "chatmodelo.html"));
  }
);

// 🌍 PERFIL PÚBLICO
app.get("/api/modelo/publico/:id", async (req, res) => {
  const modelo_id = Number(req.params.id);

  if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json({ error: "modelo_id inválido" });
  }

  try {
    const result = await db.query(`
      SELECT
        m.user_id AS id,
        m.nome_exibicao,
        m.bio,
        m.avatar,
        m.capa,
        m.local,
        md.instagram,
        md.tiktok
      FROM modelos m
      JOIN modelos_verificacao v
        ON v.modelo_id = m.user_id
      LEFT JOIN modelos_dados md
        ON md.user_id = m.user_id
      WHERE m.user_id = $1
        AND v.status = 'aprovado'
      ORDER BY v.created_at DESC
      LIMIT 1
    `, [modelo_id]);

    if (!result.rows.length) {
      return res.status(403).json({
        error: "Perfil indisponível no momento"
      });
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
  const cliente_id = req.user.id;

  const { rows } = await db.query(`
    SELECT
      m.user_id AS modelo_id,
      m.nome_exibicao,
      m.avatar,

      msg.text        AS ultima_mensagem,
      msg.created_at  AS ultima_mensagem_em,
      msg.lida,
      msg.sender

    FROM vip_subscriptions v
    JOIN modelos m ON m.user_id = v.modelo_id

    LEFT JOIN LATERAL (
      SELECT text, created_at, lida, sender
      FROM messages
      WHERE messages.cliente_id = v.cliente_id
        AND messages.modelo_id  = v.modelo_id
      ORDER BY created_at DESC
      LIMIT 1
    ) msg ON true

    WHERE v.cliente_id = $1
      AND v.ativo = true
      AND v.expiration_at > NOW()
  `, [cliente_id]);

  res.json(rows);
});


/// ===============================
// CHAT — LISTA PARA MODELO
// ===============================
app.get("/api/chat/modelo", authModelo, async (req, res) => {
  try {
    const modeloId = req.user.id;

    const { rows } = await db.query(`
SELECT DISTINCT ON (c.user_id)
  c.user_id AS cliente_id,
  cd.username,
  c.nome,
  cd.avatar,

  m.text       AS ultima_mensagem,
  m.created_at AS ultima_mensagem_em,
  m.sender     AS ultimo_sender,

  COALESCE(m.visto, false) AS visto,
  COALESCE(m.lida, false)  AS lida

FROM vip_subscriptions v
JOIN clientes c ON c.user_id = v.cliente_id
LEFT JOIN clientes_dados cd ON cd.user_id = c.user_id
LEFT JOIN messages m
  ON m.cliente_id = c.user_id
 AND m.modelo_id  = $1

WHERE v.modelo_id = $1
  AND v.ativo = true
  AND v.expiration_at > NOW()

ORDER BY
  c.user_id,
  m.created_at DESC NULLS LAST;


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
        cd.username,
        cd.avatar,
        c.last_seen
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
app.get("/api/conteudos", authModelo, async (req, res) => {
  const modelo_id = req.user.id;
  const { venda } = req.query;

  try {
    let where = "c.user_id = $1";
    const params = [modelo_id];

    if (venda === "true") {
      where += " AND c.tipo_conteudo = 'venda'";
    }

    const result = await db.query(
      `
      SELECT
        c.id,
        c.user_id,
        c.tipo,
        c.tipo_conteudo,
        c.url,
        c.thumbnail_url,
        c.criado_em
      FROM conteudos c
      WHERE ${where}
      ORDER BY c.criado_em DESC
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro listar conteúdos:", err);
    res.status(500).json({ error: "Erro ao listar conteúdos" });
  }
});

app.get(
  "/api/modelo/verificacao/status",
  authModelo,
  async (req, res) => {
    try {
      const modeloId = req.user.id;

      const result = await db.query(
        `
        SELECT status, motivo
        FROM modelos_verificacao
        WHERE modelo_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [modeloId]
      );

      // nunca enviou documentos
      if (result.rows.length === 0) {
        return res.json({
          status: "pendente",
          motivo: null
        });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Erro status verificação:", err);
      res.status(500).json({
        erro: "Erro ao buscar status da verificação"
      });
    }
  }
);

app.get(
  "/api/admin/verificacoes",
  async (req, res) => {
    try {
      const result = await db.query(`
        SELECT
          m.user_id,
          m.nome_exibicao,
          m.avatar,
          m.verificada,
          m.created_at,
          CASE
            WHEN mv.user_id IS NOT NULL THEN 'enviado'
            ELSE 'não enviado'
          END AS status_documento
        FROM modelos m
        LEFT JOIN modelos_verificacao mv
          ON mv.user_id = m.user_id
        WHERE m.verificada = false
        ORDER BY m.created_at ASC;
      `);

      res.json(result.rows);
    } catch (err) {
      console.error("Erro listar verificações:", err);
      res.status(500).json({ erro: "Erro ao listar verificações" });
    }
  }
);


app.get(
  "/api/admin/verificacao/:user_id/documentos",
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await db.query(
        `
        SELECT doc_frente_url, doc_verso_url, selfie_url
        FROM modelos_verificacao
        WHERE id = $1
        `,
        [id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ erro: "Verificação não encontrada" });
      }

      const row = result.rows[0];

      res.json({
        doc_frente: gerarSignedUrl(row.doc_frente_url),
        doc_verso: row.doc_verso_url
          ? gerarSignedUrl(row.doc_verso_url)
          : null,
        selfie: gerarSignedUrl(row.selfie_url)
      });
    } catch (err) {
      console.error("Erro signed URL:", err);
      res.status(500).json({ erro: "Erro ao gerar URLs" });
    }
  }
);

app.get("/api/modelo/assinantes", authModelo, async (req, res) => {
  try {
    const modeloId = req.user.id;

    const result = await db.query(
      `SELECT
  c.id    AS cliente_id,
  c.nome  AS nome_cliente,

  v.ativo,
  v.expiration_at,
  v.updated_at AS ultima_renovacao,

  -- total líquido gasto em VIP (70%)
  COALESCE(
    SUM(
      DISTINCT (v.valor_assinatura * 0.7)
    ),
    0
  ) AS total_assinaturas,

  -- total líquido gasto em conteúdos (70%)
  COALESCE(
    SUM(cp.preco * 0.7),
    0
  ) AS total_midias

FROM vip_subscriptions v
JOIN clientes c
  ON c.id = v.cliente_id

LEFT JOIN conteudo_pacotes cp
  ON cp.cliente_id = c.id
 AND cp.modelo_id  = v.modelo_id

WHERE v.modelo_id = $1

GROUP BY
  c.id,
  c.nome,
  v.ativo,
  v.expiration_at,
  v.updated_at

ORDER BY v.expiration_at DESC;
`,
      [modeloId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro listar assinantes:", err);
    res.status(500).json({ erro: "Erro ao listar assinantes" });
  }
});



app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "manifest.json"));
});


// ===============================
// ROTA POST
// ===============================
app.put("/api/ofertas/:id/encerrar", authModelo, async (req, res) => {
  try {
    const ofertaId = Number(req.params.id);

    if (!Number.isInteger(ofertaId)) {
      return res.status(400).json({ erro: "ID inválido" });
    }

    // pega modelo_id corretamente
    const modeloRes = await db.query(
      `SELECT id FROM modelos WHERE user_id = $1`,
      [req.user.id]
    );

    if (modeloRes.rows.length === 0) {
      return res.status(403).json({ erro: "Modelo não encontrado" });
    }

    const modeloId = modeloRes.rows[0].id;

    // encerra oferta
    const result = await db.query(
      `
      UPDATE ofertas
      SET ativa = false,
          data_fim = NOW()
      WHERE id = $1
        AND modelo_id = $2
        AND ativa = true
      RETURNING *
      `,
      [ofertaId, modeloId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ erro: "Oferta não encontrada ou já encerrada" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Erro encerrar oferta:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

app.put("/api/modelo/me", auth, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { nome_exibicao, instagram, tiktok, local, bio } = req.body;

    if (!nome_exibicao || !nome_exibicao.trim()) {
      return res.status(400).json({
        error: "nome_exibicao é obrigatório"
      });
    }

    const nomeFinal  = nome_exibicao.trim();
    const localFinal = local?.trim() || null;
    const bioFinal   = bio?.trim()   || null;
    const instaFinal = instagram?.trim() || null;
    const tiktokFinal = tiktok?.trim() || null;

    await db.query(
      `
      UPDATE modelos
      SET
        nome_exibicao = $1,
        local = $2,
        bio   = $3
      WHERE user_id = $4
      `,
      [nomeFinal, localFinal, bioFinal, user_id]
    );

    // ===============================
    // MODELOS_DADOS (extras)
    // ===============================
    await db.query(
      `
      INSERT INTO modelos_dados (user_id, instagram, tiktok)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        instagram = EXCLUDED.instagram,
        tiktok = EXCLUDED.tiktok
      `,
      [user_id, instaFinal, tiktokFinal]
    );

    res.json({ sucesso: true });

  } catch (err) {
    console.error("ERRO PUT /api/modelo/me:", err);
    res.status(500).json({
      erro: "Erro ao salvar dados da modelo",
      detalhe: err.message
    });
  }
});

app.put("/api/conteudos/:id", authModelo, async (req, res) => {
  const modelo_id = req.user.id;
  const conteudo_id = Number(req.params.id);

  const { tipo, url, thumbnail_url } = req.body;

  if (!tipo || !url) {
    return res.status(400).json({
      error: "Campos obrigatórios: tipo e url"
    });
  }

  try {
    const result = await db.query(
      `
      UPDATE conteudos
      SET
        tipo = $1,
        url = $2,
        thumbnail_url = $3
      WHERE id = $4
        AND user_id = $5
      RETURNING
        id,
        tipo,
        url,
        thumbnail_url,
        user_id
      `,
      [tipo, url, thumbnail_url || null, conteudo_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Conteúdo não encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro editar conteúdo:", err);
    res.status(500).json({ error: "Erro ao editar conteúdo" });
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

app.put("/api/usuario/dados", auth, async (req, res) => {
  try {
    const {
      nome_completo,
      data_nascimento,
      telefone,
      endereco,
      estado,
      cidade,
      pais
    } = req.body;

    if (req.user.role === "modelo") {

  // 🔒 VERIFICAR STATUS DA IDENTIDADE
  const verificacao = await db.query(`
    SELECT status
    FROM modelos_verificacao
    WHERE modelo_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, [req.user.id]);

  if (
    verificacao.rows.length &&
    verificacao.rows[0].status === "aprovado"
  ) {
    return res.status(403).json({
      erro: "Dados pessoais já aprovados e não podem ser alterados"
    });
  }

  // 🔥 buscar nome_exibicao existente (obrigatório)
  const { rows } = await db.query(
    "SELECT nome_exibicao FROM modelos WHERE user_id = $1",
    [req.user.id]
  );

  const nome_exibicao = rows[0]?.nome_exibicao;

  if (!nome_exibicao) {
    return res.status(400).json({
      erro: "nome_exibicao obrigatório para atualizar dados do usuário"
    });
  }

  // ✅ segue com INSERT / UPDATE
  await db.query(`
    INSERT INTO modelos_dados
      (user_id, nome_exibicao, nome_completo, data_nascimento, telefone, endereco, estado, cidade, pais)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (user_id)
    DO UPDATE SET
      nome_completo = EXCLUDED.nome_completo,
      data_nascimento = EXCLUDED.data_nascimento,
      telefone = EXCLUDED.telefone,
      endereco = EXCLUDED.endereco,
      estado = EXCLUDED.estado,
      cidade = EXCLUDED.cidade,
      pais = EXCLUDED.pais
  `, [
    req.user.id,
    nome_exibicao,
    nome_completo?.trim() || null,
    data_nascimento || null,
    telefone?.trim() || null,
    endereco?.trim() || null,
    estado?.trim() || null,
    cidade?.trim() || null,
    pais?.trim() || null
  ]);
}

    if (req.user.role === "cliente") {
      await db.query(`
        INSERT INTO clientes_dados
          (user_id, nome_completo, data_nascimento, telefone, endereco, estado, cidade, pais)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id)
        DO UPDATE SET
          nome_completo = EXCLUDED.nome_completo,
          data_nascimento = EXCLUDED.data_nascimento,
          telefone = EXCLUDED.telefone,
          endereco = EXCLUDED.endereco,
          estado = EXCLUDED.estado,
          cidade = EXCLUDED.cidade,
          pais = EXCLUDED.pais
      `, [
        req.user.id,
        nome_completo?.trim() || null,
        data_nascimento || null,
        telefone?.trim() || null,
        endereco?.trim() || null,
        estado?.trim() || null,
        cidade?.trim() || null,
        pais?.trim() || null
      ]);
    }

    res.json({ sucesso: true });
  } catch (err) {
    console.error("ERRO PUT /api/usuario/dados:", err);
    res.status(500).json({ erro: err.message });
  }
});

app.put(
  "/api/admin/verificacao/:id",
  authAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, motivo } = req.body;

      if (!["aprovado", "recusado"].includes(status)) {
        return res.status(400).json({ erro: "Status inválido" });
      }

      await db.query(
        `
        UPDATE modelos_verificacao
        SET
          status = $1,
          motivo = $2,
          updated_at = NOW()
        WHERE id = $3
        `,
        [status, motivo || null, id]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error("Erro atualizar verificação:", err);
      res.status(500).json({ erro: "Erro ao atualizar status" });
    }
  }
);



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

    if (!email || !senha || !role) {
      return res.status(400).json({ erro: "Dados inválidos" });
    }

    if (!emailValido(email)) {
      return res.status(400).json({ erro: "Email inválido" });
    }

    if (ageConfirmed !== true) {
      return res.status(400).json({
        erro: "Confirmação de idade obrigatória (+18)"
      });
    }

    const hash = await bcrypt.hash(senha, 10);

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

    let clienteId = null;

    // 👠 modelo
    if (role === "modelo") {
      const nomeModelo = nome || email.split("@")[0];

      await db.query(
        `INSERT INTO public.modelos (user_id, nome) VALUES ($1, $2)`,
        [userId, nomeModelo]
      );
    }

    // 👤 cliente
    if (role === "cliente") {
      const clienteResult = await db.query(
        `
        INSERT INTO public.clientes (user_id, nome, origem_trafego, ref_modelo)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          userId,
          nome || email.split("@")[0],
          src || null,
          ref ? Number(ref) : null
        ]
      );

      clienteId = clienteResult.rows[0].id;
    }

    const token = jwt.sign(
      {
        id: userId,
        email,
        role: role.toLowerCase()
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.status(201).json({
      token,
      role: role.toLowerCase(),
      cliente_id: clienteId // 👈 agora o front recebe
    });

  } catch (err) {
    console.error("ERRO REGISTER:", err);

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
    role: user.role.toLowerCase()
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

app.post(
  "/uploadAvatar",
  auth,
  uploadB2.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Arquivo não enviado" });
      }

      const url = req.file.location;
      const userId = req.user.id;

      if (req.user.role === "modelo") {
        await db.query(
          "UPDATE modelos SET avatar = $1 WHERE user_id = $2",
          [url, userId]
        );
      } 
      else if (req.user.role === "cliente") {
        await db.query(
          `
          INSERT INTO clientes_dados (user_id, avatar)
          VALUES ($1, $2)
          ON CONFLICT (user_id)
          DO UPDATE SET avatar = EXCLUDED.avatar
          `,
          [userId, url]
        );
      } 
      else {
        return res.status(403).json({ error: "Role inválida" });
      }

      res.json({ url });

    } catch (err) {
      console.error("Erro upload avatar:", err);
      res.status(500).json({ error: "Erro ao atualizar avatar" });
    }
  }
);

app.post(
  "/uploadCapa",
  auth,
  uploadB2.single("capa"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Arquivo não enviado" });
      }

      const url = req.file.location;
      const userId = req.user.id;

      if (req.user.role === "modelo") {
        await db.query(
          "UPDATE modelos SET capa = $1 WHERE user_id = $2",
          [url, userId]
        );
      } 
      else if (req.user.role === "cliente") {
        await db.query(
          `
            UPDATE clientes_dados
            SET capa = $1, atualizado_em = NOW()
            WHERE user_id = $2
          `,
          [userId, url]
        );
      } 
      else {
        return res.status(403).json({ error: "Role inválida" });
      }

      res.json({ url });

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
        let {
        nome_exibicao,
        nome_completo,
        data_nascimento,
        telefone,
        endereco,
        pais,
        instagram,
        tiktok
      } = req.body;

      // 🔥 NORMALIZA REDES SOCIAIS (AQUI!)
      instagram = instagram?.replace("@", "").trim() || null;
      tiktok = tiktok?.replace("@", "").trim() || null;

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

// 🗑 EXCLUIR CONTEÚDO (MODELO)
app.delete("/api/conteudos/:id", authModelo, async (req, res) => {
  const user_id = req.user.id;
  const conteudo_id = Number(req.params.id);

  try {
    const result = await db.query(
      `
      DELETE FROM conteudos
      WHERE id = $1
        AND user_id = $2
      RETURNING id
      `,
      [conteudo_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Conteúdo não encontrado ou não pertence ao modelo"
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro apagar conteúdo:", err);
    res.status(500).json({ error: "Erro ao apagar conteúdo" });
  }
});



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

app.post("/api/pagamento/vip/pix", authCliente, async (req, res) => {
  try {
    const { modelo_id } = req.body;
    const cliente_id = req.user.id;

    if (!modelo_id || isNaN(Number(modelo_id))) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    // 🔍 BUSCA OFERTA ATIVA (FONTE DA VERDADE)
    const ofertaRes = await db.query(
      `
      SELECT valor_promocional
      FROM ofertas
      WHERE modelo_id = $1
        AND ativa = true
        AND NOW() BETWEEN data_inicio AND data_fim
      LIMIT 1
      `,
      [modelo_id]
    );

    if (ofertaRes.rows.length === 0) {
      return res.status(400).json({
        error: "Oferta VIP indisponível"
      });
    }

    const valorAssinatura = Number(ofertaRes.rows[0].valor_promocional);

    // 🔒 TAXAS CALCULADAS NO BACKEND
    const taxaTransacao  = Number((valorAssinatura * 0.10).toFixed(2));
    const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2));

    let valorTotal = Number(
      (valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    // 🔒 Regra MercadoPago PIX
    if (!valorTotal || isNaN(valorTotal) || valorTotal < 1) {
      valorTotal = 1.00;
    }

    // 💸 MERCADO PAGO
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
          email: "contato@velvet.lat"
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

    // 🔁 RETORNO PARA O FRONT
    res.json({
      qr_code: pagamento.point_of_interaction.transaction_data.qr_code_base64,
      copia_cola:
        pagamento.point_of_interaction.transaction_data.qr_code
    });

  } catch (err) {
    console.error("🔥 ERRO PIX VIP:", err);
    res.status(500).json({ error: "Erro ao gerar Pix VIP" });
  }
});

app.post("/api/pagamento/midia/cartao", authCliente, async (req, res) => {
  const { conteudo_id } = req.body;
  const cliente_id = req.user.id;

  if (!conteudo_id) {
    return res.status(400).json({ error: "conteudo_id inválido" });
  }

  // 1️⃣ buscar conteúdo
  const conteudoRes = await db.query(`
    SELECT c.preco, c.user_id AS modelo_id
    FROM conteudos c
    WHERE c.id = $1
      AND c.tipo_conteudo = 'venda'
  `, [conteudo_id]);

  if (conteudoRes.rowCount === 0) {
    return res.status(404).json({ error: "Conteúdo não encontrado" });
  }

  const { preco, modelo_id } = conteudoRes.rows[0];

  const precoNum = Number(preco);

// 2️⃣ taxas (backend decide)
const taxaTransacao  = Number((precoNum * 0.10).toFixed(2));
const taxaPlataforma = Number((precoNum * 0.05).toFixed(2));

const total = Number( (precoNum + taxaTransacao + taxaPlataforma).toFixed(2));

  // 3️⃣ criar message técnico
  const msgRes = await db.query(`
    INSERT INTO messages
      (cliente_id, modelo_id, sender, tipo, preco, visto)
    VALUES
      ($1,$2,'modelo','conteudo',$3,false)
    RETURNING id
  `, [cliente_id, modelo_id, preco]);

  const message_id = msgRes.rows[0].id;

  await db.query(`
    INSERT INTO messages_conteudos (message_id, conteudo_id)
    VALUES ($1,$2)
  `, [message_id, conteudo_id]);

  // 4️⃣ Stripe
  const pi = await stripe.paymentIntents.create({
    amount: Math.round(total * 100),
    currency: "brl",
    payment_method_types: ["card"],
    metadata: {
      tipo: "conteudo",
      message_id,
      cliente_id,
      modelo_id,
      valor_base: preco,
      taxa_transacao: taxaTransacao,
      taxa_plataforma: taxaPlataforma
    }
  });
  res.json({
  clientSecret: pi.client_secret,
  resumo: {
    valor_base: precoNum,
    taxa_transacao: taxaTransacao,
    taxa_plataforma: taxaPlataforma,
    total
  }
  });
});


// ===============================
// WEBHOOK MERCADOPAGO
// ===============================
app.post("/webhook/mercadopago", async (req, res) => {
  console.log("🔥 WEBHOOK MP RECEBIDO");
console.log("BODY:", JSON.stringify(req.body, null, 2));
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
    console.log("STATUS MP:", pagamento.status);
console.log("METADATA MP:", pagamento.metadata);

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
        automatic_payment_methods: { enabled: true },
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
        clientSecretAtual : data.clientSecret,
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

app.post("/api/chat/marcar-lido/:cliente_id", authModelo, async (req, res) => {
  const modelo_id = req.user.id;
  const cliente_id = Number(req.params.cliente_id);

  if (!Number.isInteger(cliente_id)) {
    return res.status(400).json({ error: "cliente_id inválido" });
  }

  try {
    await db.query(
      `
      UPDATE messages
      SET visto = true
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND sender = 'cliente'
        AND visto = false
      `,
      [cliente_id, modelo_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Erro marcar lido:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.post(
  "/api/modelo/verificacao",
  authModelo,
  uploadVerificacao.fields([
    { name: "doc_frente", maxCount: 1 },
    { name: "doc_verso", maxCount: 1 },
    { name: "selfie", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const modeloId = req.user.id;
      const { doc_tipo } = req.body;

      if (!doc_tipo) {
        return res.status(400).json({
          erro: "Tipo de documento obrigatório"
        });
      }

      if (!req.files?.doc_frente || !req.files?.selfie) {
        return res.status(400).json({
          erro: "Documento e selfie são obrigatórios"
        });
      }

      const docFrenteUrl = req.files.doc_frente[0].key;
      const docVersoUrl = req.files.doc_verso?.[0]?.key || null;
      const selfieUrl = req.files.selfie[0].key;

      await db.query(
        `
        INSERT INTO modelos_verificacao
        (modelo_id, doc_tipo, doc_frente_url, doc_verso_url, selfie_url, status)
        VALUES ($1,$2,$3,$4,$5,'em_analise')
        ON CONFLICT (modelo_id)
        DO UPDATE SET
          doc_tipo = $2,
          doc_frente_url = $3,
          doc_verso_url = $4,
          selfie_url = $5,
          status = 'em_analise',
          updated_at = NOW()
        `,
        [
          modeloId,
          doc_tipo,
          docFrenteUrl,
          docVersoUrl,
          selfieUrl
        ]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error("❌ Erro upload verificação:", err);
      res.status(500).json({ erro: "Erro ao enviar documentos" });
    }
  }
);

app.post(
  "/api/conteudos",
  authModelo,
  uploadB2.single("file"),
  async (req, res) => {
    const user_id = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        error: "Arquivo obrigatório"
      });
    }

    try {
      const { mimetype } = req.file;

      let tipo;
      if (mimetype.startsWith("image/")) {
        tipo = "imagem";
      } else if (mimetype.startsWith("video/")) {
        tipo = "video";
      } else {
        return res.status(400).json({
          error: "Tipo de arquivo não suportado"
        });
      }

      const url = req.file.location;
      const thumbnail_url = null; // vídeo → gerar depois

      const result = await db.query(
        `
        INSERT INTO conteudos (
          user_id,
          tipo,
          tipo_conteudo,
          url,
          thumbnail_url
        )
        VALUES ($1, $2, 'venda', $3, $4)
        RETURNING
          id,
          user_id,
          tipo,
          tipo_conteudo,
          url,
          thumbnail_url,
          criado_em
        `,
        [
          user_id,
          tipo,
          url,
          thumbnail_url
        ]
      );

      res.json(result.rows[0]);

    } catch (err) {
      console.error("Erro ao carregar conteúdo:", err);
      res.status(500).json({
        error: "Erro ao carregar conteúdo"
      });
    }
  }
);

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

//ENCERRAR OFERTA MANUALMENTE
app.patch("/api/ofertas/:id/encerrar", auth, async (req, res) => {
  const result = await db.query(
    `
    UPDATE ofertas
    SET ativa = false
    WHERE id = $1 AND modelo_id = $2
    RETURNING *
    `,
    [req.params.id, req.user.id]
  );

  res.json(result.rows[0]);
});


// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});