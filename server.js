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

// app.use((req, res, next) => {
//   return res.sendFile(
//     path.join(__dirname, "public", "manutencao.html")
//   );
// });

const nodemailer = require("nodemailer");
const os = require("os");
const { exec } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const authAdmin = require("./middleware/authAdmin");
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
const authCliente = require("./middleware/authCliente");
const authModelo = require("./middleware/authModelo");
const auth = require("./middleware/auth");

ffmpeg.setFfmpegPath(ffmpegPath);

const allowedOrigins = [
  "https://www.velvet.lat",
  "https://app-production-e7e1.up.railway.app",
  "https://velvet-test-production.up.railway.app",
  "https://velvet-test-production.up.railway.app/app",
   "https://www.velvet.lat/app/"
];
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
  accessKeyId: process.env.B2_KEY_ID_PRIVATE,
  secretAccessKey: process.env.B2_APP_KEY_PRIVATE,
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

app.post(
  "/webhook/stripe",
  express.raw({ type: "*/*" }),
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

    console.log("🔔 Webhook recebido:", event.type);

    try {

      // =====================================================
      // 💰 PAYMENT INTENT SUCCEEDED
      // =====================================================
      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object;

        if (pi.status !== "succeeded") {
          return res.json({ received: true });
        }

        // =====================================================
        // 📦 CONTEÚDO PPV
        // =====================================================
        if (pi.metadata?.tipo === "conteudo") {

          const cliente_id = Number(pi.metadata.cliente_id);
          const modelo_id = Number(pi.metadata.modelo_id);
          const message_id = Number(pi.metadata.message_id);
          const valor_base = Number(pi.metadata.valor_base);
          const taxa_transacao = Number(pi.metadata.taxa_transacao);
          const taxa_plataforma = Number(pi.metadata.taxa_plataforma);

          if (!cliente_id || !modelo_id || !message_id) {
            console.error("❌ Metadata PPV inválida:", pi.metadata);
            return res.json({ received: true });
          }

          const valor_total = Number((pi.amount / 100).toFixed(2));

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
              valor_base,
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
            message_id
          });
        }

        // =====================================================
        // ⭐ VIP — PRIMEIRO PAGAMENTO
        // =====================================================
        if (pi.metadata?.tipo === "vip") {

          const cliente_id = Number(pi.metadata.cliente_id);
          const modelo_id = Number(pi.metadata.modelo_id);
          const valor_assinatura = Number(pi.metadata.valor_assinatura);
          const taxa_transacao = Number(pi.metadata.taxa_transacao);
          const taxa_plataforma = Number(pi.metadata.taxa_plataforma);

          if (!cliente_id || !modelo_id) {
            console.error("❌ Metadata VIP inválida:", pi.metadata);
            return res.json({ received: true });
          }

          await ativarVipAssinatura({
            cliente_id,
            modelo_id,
            valor_assinatura,
            taxa_transacao,
            taxa_plataforma,
            stripe_payment_id: pi.id
          });

          const sid = onlineClientes[cliente_id];
          if (sid) {
            io.to(sid).emit("vipAtivado", {
              modelo_id
            });
          }

          console.log("⭐ VIP ativado:", cliente_id, modelo_id);
        }
      }

      // =====================================================
      // 🔁 RENOVAÇÃO AUTOMÁTICA VIP
      // =====================================================
      if (event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object;

        if (
          !invoice.subscription ||
          invoice.billing_reason !== "subscription_cycle"
        ) {
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

      // =====================================================
      // ❌ FALHA NA RENOVAÇÃO VIP
      // =====================================================
      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object;
        console.warn(
          "❌ Falha na renovação VIP:",
          invoice.subscription
        );
      }

      return res.json({ received: true });

    } catch (err) {
      console.error("🔥 ERRO WEBHOOK STRIPE:", err);
      return res.status(500).json({
        error: "Webhook processing failed"
      });
    }
  }
);


app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin-pages")));
app.use("/icons", express.static(path.join(__dirname, "icons")));
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

app.use("/app", express.static("app"));
app.use(express.static("public"));
app.use((req, res, next) => {
  console.log("➡️ REQ:", req.method, req.url);
  next();
});

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


// 📦 FEED CANÔNICO (FONTE ÚNICA)
async function buscarFeedCompletoPorModeloId(modelo_id) {
  const result = await db.query(
    `
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
    WHERE modelo_id = $1
      AND (
        tipo_conteudo != 'venda'
        OR (tipo_conteudo = 'venda' AND COALESCE(preco, 0) > 0)
      )
    ORDER BY id DESC
    `,
    [modelo_id]
  );

  return result.rows;
}

async function gerarThumbnailVideo(videoUrl, modelo_id) {

  const timestamp = Date.now();
  const tmpDir = os.tmpdir();

  const videoPath = path.join(tmpDir, `video-${timestamp}.mp4`);
  const thumbPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);

  try {

    // 1️⃣ Download vídeo
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error("Falha ao baixar vídeo");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(videoPath, buffer);

    // 2️⃣ Gerar thumb
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

    // 3️⃣ Upload Backblaze
    const thumbBuffer = fs.readFileSync(thumbPath);

    const upload = await s3.upload({
      Bucket: process.env.B2_BUCKET,
      Key: `modelos/${modelo_id}/thumbs/${timestamp}.jpg`,
      Body: thumbBuffer,
      ContentType: "image/jpeg",
      ACL: "public-read"
    }).promise();

    return upload.Location;

  } finally {
    // 4️⃣ Limpeza garantida
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }
}

const crypto = require("crypto");

async function uploadThumbB2(buffer, { modelo_id }) {

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Buffer inválido para upload de thumbnail");
  }

  if (!modelo_id) {
    throw new Error("modelo_id é obrigatório para organizar storage");
  }

  const unique = crypto.randomUUID();

  const key = `modelos/${modelo_id}/thumbs/${unique}.jpg`;

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

  if (!key || typeof key !== "string") {
    throw new Error("Key inválida para signed URL");
  }

  // Opcional: restringir prefixo
  if (!key.startsWith("modelos/")) {
    throw new Error("Acesso inválido ao arquivo");
  }

  return s3Privado.getSignedUrl("getObject", {
    Bucket: process.env.B2_BUCKET_PRIVATE,
    Key: key,
    Expires: 60 * 5
  });
}


//APP POST ROTAS ////
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

      // 🔁 1️⃣ Converter users.id → modelos.id
      const modeloRes = await db.query(
        `SELECT id FROM modelos WHERE user_id = $1`,
        [req.user.id]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }

      const modelo_id = modeloRes.rows[0].id;

      const isVideo = req.file.mimetype.startsWith("video");

      const {
        tipo_conteudo,
        preco,
        descricao
      } = req.body;

      const publicUrl = `${process.env.B2_PUBLIC_URL}/${req.file.key}`;
      let thumbnailUrl = null;

      // 🔥 2️⃣ GERA THUMBNAIL SE FOR VÍDEO
      if (isVideo) {
        try {
          thumbnailUrl = await gerarThumbnailVideo(publicUrl, modelo_id);
        } catch (err) {
          console.error("Erro ao gerar thumbnail:", err);
        }
      }

      // 🔥 3️⃣ Inserir usando modelo_id (não user_id)
      await db.query(
        `
        INSERT INTO conteudos
        (modelo_id, url, tipo, tipo_conteudo, preco, descricao, thumbnail_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          modelo_id,
          publicUrl,
          isVideo ? "video" : "imagem",
          tipo_conteudo || "feed",
          preco ? Number(preco) : null,
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

    // 1️⃣ Buscar modelo
    const modeloRes = await db.query(
      `SELECT id FROM modelos WHERE user_id = $1`,
      [userId]
    );

    if (modeloRes.rowCount === 0) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    const modeloId = modeloRes.rows[0].id;

    // 2️⃣ Buscar plano
    const planoRes = await db.query(
      `SELECT valor_mensal FROM modelos_planos WHERE modelo_id = $1`,
      [modeloId]
    );

    if (planoRes.rowCount === 0) {
      return res.status(400).json({
        erro: "Defina primeiro o plano de assinatura."
      });
    }

    const VALOR_BASE = Number(planoRes.rows[0].valor_mensal);
    const VALOR_MINIMO = Number((VALOR_BASE * 0.5).toFixed(2));

    // 3️⃣ Dados
    const { nome, limite, dias, desconto, mensagem } = req.body;

    const limiteNum = Number(limite);
    const diasNum = Number(dias);
    const descontoNum = Number(desconto);

    if (
      !nome ||
      !Number.isFinite(limiteNum) || limiteNum <= 0 ||
      !Number.isFinite(diasNum) || diasNum <= 0 ||
      !Number.isFinite(descontoNum) || descontoNum < 0 || descontoNum > 50
    ) {
      return res.status(400).json({ erro: "Dados inválidos" });
    }

    let valorPromocional = Number(
      (VALOR_BASE * (1 - descontoNum / 100)).toFixed(2)
    );

    if (valorPromocional < VALOR_MINIMO) {
      valorPromocional = VALOR_MINIMO;
    }

    const dataFim = new Date();
    dataFim.setDate(dataFim.getDate() + diasNum);

    // 🔥 Desativar anteriores
    await db.query(
      `UPDATE ofertas SET ativa = false WHERE modelo_id = $1`,
      [modeloId]
    );

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
        limiteNum,
        descontoNum,
        VALOR_BASE,
        valorPromocional,
        dataFim,
        mensagem || null
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("🔥 ERRO AO CRIAR OFERTA 🔥", err);
    res.status(500).json({ erro: "Erro interno ao criar oferta" });
  }
});


app.post("/api/pagamento/vip/cartao", authCliente, async (req, res) => {
  try {

    const modelo_id = Number(req.body.modelo_id);

    if (!modelo_id || !Number.isInteger(modelo_id)) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    // 🔁 Converter users.id → clientes.id
    const clienteRes = await db.query(
      `SELECT id FROM clientes WHERE user_id = $1`,
      [req.user.id]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = clienteRes.rows[0].id;

    // 1️⃣ Verificar oferta ativa
    const ofertaRes = await db.query(`
      SELECT valor_promocional
      FROM ofertas
      WHERE modelo_id = $1
        AND ativa = true
        AND NOW() BETWEEN data_inicio AND data_fim
      LIMIT 1
    `, [modelo_id]);

    let valorAssinatura;

    if (ofertaRes.rowCount > 0) {
      valorAssinatura = Number(ofertaRes.rows[0].valor_promocional);
    } else {

      const planoRes = await db.query(`
        SELECT valor_mensal
        FROM modelos_planos
        WHERE modelo_id = $1
      `, [modelo_id]);

      if (planoRes.rowCount === 0) {
        return res.status(400).json({
          error: "Plano VIP não definido"
        });
      }

      valorAssinatura = Number(planoRes.rows[0].valor_mensal);

      if (!valorAssinatura || valorAssinatura <= 0) {
        return res.status(400).json({
          error: "Valor inválido para assinatura"
        });
      }
    }

    // 🔥 TAXAS
    const taxaTransacao  = Number((valorAssinatura * 0.10).toFixed(2));
    const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2));

    const valorTotal = Number(
      (valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    const amount = Math.round(valorTotal * 100);

    // 💳 Criar PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "brl",
      payment_method_types: ["card"],
      metadata: {
        tipo: "vip",
        cliente_id: String(cliente_id),
        modelo_id: String(modelo_id),
        valor_assinatura: String(valorAssinatura),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma)
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

  if (!cliente_id || !Number.isInteger(cliente_id)) {
    throw new Error("cliente_id inválido");
  }

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

  if (!modelo_id || !Number.isInteger(modelo_id)) {
    throw new Error("modelo_id inválido");
  }

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

async function ativarVipAssinatura({
  cliente_id,
  modelo_id,
  valor_assinatura,
  taxa_transacao,
  taxa_plataforma
}) {
  // 🔒 Validação básica de IDs
  if (
    !Number.isInteger(cliente_id) ||
    !Number.isInteger(modelo_id)
  ) {
    throw new Error("IDs inválidos em ativarVipAssinatura");
  }

  // 🔢 Garantir números
  const valorBase = Number(valor_assinatura);
  const taxaTrans = Number(taxa_transacao);
  const taxaPlat  = Number(taxa_plataforma);

  let valor_total = Number(
    (valorBase + taxaTrans + taxaPlat).toFixed(2)
  );

  // 🔒 Regra mínima (ex: MercadoPago PIX BR)
  if (!valor_total || isNaN(valor_total) || valor_total < 1) {
    valor_total = 1.00;
  }

  const expiration_at = new Date();
  expiration_at.setDate(expiration_at.getDate() + 30);

  // =========================================
  // 💎 INSERT / UPDATE VIP (IDEMPOTENTE)
  // =========================================
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
      valorBase,
      taxaTrans,
      taxaPlat,
      valor_total,
      expiration_at
    ]
  );

  // =========================================
  // 💬 MENSAGEM AUTOMÁTICA DE BOAS-VINDAS
  // =========================================
  const existeMsg = await db.query(
    `
    SELECT 1
    FROM messages
    WHERE cliente_id = $1
      AND modelo_id = $2
    LIMIT 1
    `,
    [cliente_id, modelo_id]
  );

  if (existeMsg.rowCount === 0) {

    const textoBoasVindas = `Bem-vindo! Como você chama? ❤️‍🔥`;

    const msgRes = await db.query(
      `
      INSERT INTO messages
        (cliente_id, modelo_id, sender, tipo, text, created_at)
      VALUES
        ($1, $2, 'modelo', 'texto', $3, NOW())
      RETURNING *
      `,
      [cliente_id, modelo_id, textoBoasVindas]
    );

    const mensagem = msgRes.rows[0];

    // 🔔 Marcar como não lida para o cliente
    await db.query(
      `
      INSERT INTO unread (cliente_id, modelo_id, unread_for, has_unread)
      VALUES ($1, $2, 'cliente', true)
      ON CONFLICT (cliente_id, modelo_id)
      DO UPDATE SET has_unread = true
      `,
      [cliente_id, modelo_id]
    );

    // 🔥 Realtime para cliente (se online)
    const sidCliente = onlineClientes[cliente_id];
    if (sidCliente) {
      io.to(sidCliente).emit("newMessage", mensagem);
    }
  }

  // =========================================
  // 🚨 AVISAR MODELO: NOVO VIP
  // =========================================
  const sidModelo = onlineModelos[modelo_id];

  if (sidModelo) {

    const nomeRes = await db.query(
      `SELECT nome FROM clientes WHERE id = $1`,
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
io.on("connection", (socket) => {
  console.log("🔥 Socket conectado:", socket.id);

  socket.user = null;

  // 🔐 AUTENTICAÇÃO DO SOCKET
  socket.on("auth", (data) => {

    if (!data || !data.token) {
      return socket.disconnect();
    }

    try {
      const decoded = jwt.verify(
        data.token,
        process.env.JWT_SECRET
      );

      if (!decoded || !decoded.id || !decoded.role) {
        return socket.disconnect();
      }

      socket.user = {
        id: decoded.id,      // users.id
        role: decoded.role   // cliente | modelo
      };

      socket.emit("authOk");

      console.log(
        "🔐 Socket autenticado:",
        socket.user.id,
        socket.user.role
      );

    } catch (err) {
      socket.disconnect();
    }
  });

socket.on("loginModelo", async () => {

  if (!socket.user || socket.user.role !== "modelo") {
    return socket.disconnect();
  }

  const result = await db.query(
    "SELECT id FROM modelos WHERE user_id = $1",
    [socket.user.id] // 🔒 usa ID autenticado
  );

  if (result.rowCount === 0) return;

  const modeloIdReal = result.rows[0].id;

  socket.modelo_id = modeloIdReal;
  onlineModelos[modeloIdReal] = socket.id;

  console.log("🟣 Modelo online:", modeloIdReal);
});

// 📥 ENTRAR NA SALA DO CHAT

socket.on("joinChat", async ({ cliente_id, modelo_id }) => {

  if (!socket.user) return socket.disconnect();

  if (
    !Number.isInteger(cliente_id) ||
    !Number.isInteger(modelo_id)
  ) return;

  // 🔒 Verifica se usuário pertence à conversa
  if (socket.user.role === "cliente") {

    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [socket.user.id]
    );

    if (clienteRes.rowCount === 0) return;

    const clienteIdReal = clienteRes.rows[0].id;

    if (clienteIdReal !== cliente_id) return;

  } else if (socket.user.role === "modelo") {

    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [socket.user.id]
    );

    if (modeloRes.rowCount === 0) return;

    const modeloIdReal = modeloRes.rows[0].id;

    if (modeloIdReal !== modelo_id) return;
  } else {
    return;
  }

  const sala = `chat_${cliente_id}_${modelo_id}`;

  socket.join(sala);

  console.log("🟪 Entrou na sala segura:", sala);
});

socket.on("joinInbox", async () => {

  if (!socket.user) return socket.disconnect();

  if (socket.user.role === "cliente") {

    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [socket.user.id]
    );

    if (!clienteRes.rowCount) return;

    const cliente_id = clienteRes.rows[0].id;

    const sala = `inbox_cliente_${cliente_id}`;

    socket.join(sala);

    console.log("📬 Inbox cliente conectada:", sala);

  } else if (socket.user.role === "modelo") {

    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [socket.user.id]
    );

    if (!modeloRes.rowCount) return;

    const modelo_id = modeloRes.rows[0].id;

    const sala = `inbox_modelo_${modelo_id}`;

    socket.join(sala);

    console.log("📬 Inbox modelo conectada:", sala);
  }
});


// 💬 ENVIAR MENSAGEM (ÚNICO)
socket.on("sendMessage", async ({ cliente_id, modelo_id, text }) => {

  if (!socket.user) {
    console.log("❌ Socket sem usuário");
    return socket.disconnect();
  }

  if (
    !Number.isInteger(cliente_id) ||
    !Number.isInteger(modelo_id) ||
    !text || typeof text !== "string"
  ) {
    console.log("❌ sendMessage inválido");
    return;
  }

  try {

    // 🔒 VALIDAR IDENTIDADE REAL
    if (socket.user.role === "cliente") {

      const clienteRes = await db.query(
        "SELECT id FROM clientes WHERE user_id = $1",
        [socket.user.id]
      );

      if (!clienteRes.rowCount) return;

      const clienteIdReal = clienteRes.rows[0].id;

      if (clienteIdReal !== cliente_id) return;

    } else if (socket.user.role === "modelo") {

      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [socket.user.id]
      );

      if (!modeloRes.rowCount) return;

      const modeloIdReal = modeloRes.rows[0].id;

      if (modeloIdReal !== modelo_id) return;

    } else {
      return;
    }

    const sala = `chat_${cliente_id}_${modelo_id}`;
    const sender = socket.user.role;
    const unreadFor = sender === "cliente" ? "modelo" : "cliente";

    // 1️⃣ SALVAR NO BANCO
    const result = await db.query(`
      INSERT INTO messages
        (cliente_id, modelo_id, sender, tipo, text, visto)
      VALUES ($1, $2, $3, 'texto', $4, false)
      RETURNING id, created_at
    `,
    [cliente_id, modelo_id, sender, text]);

    const message = result.rows[0];

    // 2️⃣ MARCAR COMO NÃO LIDA
    await db.query(`
      INSERT INTO unread (cliente_id, modelo_id, unread_for, has_unread)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (cliente_id, modelo_id)
      DO UPDATE SET
        unread_for = EXCLUDED.unread_for,
        has_unread = true
    `,
    [cliente_id, modelo_id, unreadFor]);

    // 3️⃣ REALTIME SALA CHAT
    io.to(sala).emit("newMessage", {
      id: message.id,
      cliente_id,
      modelo_id,
      sender,
      tipo: "texto",
      text,
      created_at: message.created_at
    });

    // 4️⃣ INBOX MODELO
    io.to(`inbox_modelo_${modelo_id}`).emit("inboxMessage", {
      cliente_id,
      modelo_id,
      sender,
      text,
      created_at: message.created_at
    });

    // 5️⃣ INBOX CLIENTE
    io.to(`inbox_cliente_${cliente_id}`).emit("inboxMessage", {
      cliente_id,
      modelo_id,
      sender,
      text,
      created_at: message.created_at
    });

  } catch (err) {
    console.error("🔥 ERRO AO SALVAR MENSAGEM:", err);
  }
});

// 📜 HISTÓRICO DO CHAT
socket.on("getHistory", async ({ cliente_id, modelo_id }) => {

  if (!socket.user) return socket.disconnect();

  if (
    !Number.isInteger(cliente_id) ||
    !Number.isInteger(modelo_id)
  ) return;

  try {

    // 🔒 VALIDAR IDENTIDADE REAL
    if (socket.user.role === "cliente") {

      const clienteRes = await db.query(
        "SELECT id FROM clientes WHERE user_id = $1",
        [socket.user.id]
      );

      if (!clienteRes.rowCount) return;

      const clienteIdReal = clienteRes.rows[0].id;

      if (clienteIdReal !== cliente_id) return;

    } else if (socket.user.role === "modelo") {

      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [socket.user.id]
      );

      if (!modeloRes.rowCount) return;

      const modeloIdReal = modeloRes.rows[0].id;

      if (modeloIdReal !== modelo_id) return;

    } else {
      return;
    }

    // ===================================
    // 1️⃣ LIMPAR UNREAD
    // ===================================
    await db.query(
      `
      UPDATE unread
      SET has_unread = false
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND unread_for = $3
      `,
      [cliente_id, modelo_id, socket.user.role]
    );

    // ===================================
    // 2️⃣ MARCAR COMO LIDA (SE CLIENTE)
    // ===================================
    if (socket.user.role === "cliente") {

      await db.query(`
        UPDATE messages
        SET lida = true
        WHERE cliente_id = $1
          AND modelo_id = $2
          AND sender = 'modelo'
          AND lida = false
      `, [cliente_id, modelo_id]);

      io.to(`inbox_modelo_${modelo_id}`).emit("mensagemLida", {
        cliente_id,
        modelo_id
      });
    }

    // ===================================
    // 3️⃣ BUSCAR HISTÓRICO
    // ===================================
    const result = await db.query(
      `
      SELECT
        id,
        cliente_id,
        modelo_id,
        sender,
        text,
        tipo,
        preco,
        visto,
        conteudo_id,
        pacote_id,
        created_at
      FROM messages
      WHERE cliente_id = $1
        AND modelo_id = $2
      ORDER BY created_at ASC
      `,
      [cliente_id, modelo_id]
    );

    // ===================================
    // 4️⃣ TRATAR MENSAGENS DE CONTEÚDO
    // ===================================
    for (const msg of result.rows) {

      if (msg.tipo !== "conteudo") continue;

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

      if (Number(msg.preco) > 0) {

        const pagoRes = await db.query(`
          SELECT 1
          FROM conteudo_pacotes
          WHERE message_id = $1
            AND cliente_id = $2
            AND status = 'pago'
          LIMIT 1
        `, [msg.id, cliente_id]);

        const pago = pagoRes.rowCount > 0;

        msg.visto = pago;
        msg.bloqueado = !pago;

      } else {
        msg.visto = true;
        msg.bloqueado = false;
      }

      msg.midias = midias;
    }

    // ===================================
    // 5️⃣ ENVIAR APENAS PARA QUEM PEDIU
    // ===================================
    socket.emit("chatHistory", result.rows);

  } catch (err) {
    console.error("❌ Erro getHistory:", err);
  }
});

socket.on("sendConteudo", async ({
  cliente_id,
  modelo_id,
  conteudos_ids,
  preco
}) => {

  try {

    if (!socket.user || socket.user.role !== "modelo") {
      return socket.disconnect();
    }

    if (
      !Number.isInteger(cliente_id) ||
      !Number.isInteger(modelo_id)
    ) return;

    if (!Array.isArray(conteudos_ids)) return;

    // 🔒 1️⃣ VALIDAR MODELO REAL
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [socket.user.id]
    );

    if (!modeloRes.rowCount) return;

    const modeloIdReal = modeloRes.rows[0].id;

    if (modeloIdReal !== modelo_id) return;

    // 🔒 2️⃣ SANITIZAR IDS
    conteudos_ids = conteudos_ids
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0);

    if (conteudos_ids.length === 0) return;

    // 🔒 3️⃣ VALIDAR QUE OS CONTEÚDOS PERTENCEM À MODELO
    const validosRes = await db.query(
      `
      SELECT id
      FROM conteudos
      WHERE id = ANY($1)
        AND modelo_id = $2
      `,
      [conteudos_ids, modelo_id]
    );

    const idsValidos = validosRes.rows.map(r => r.id);

    if (idsValidos.length === 0) return;

    const precoNum = Number(preco) || 0;

    const sala = `chat_${cliente_id}_${modelo_id}`;

    // 4️⃣ CRIAR MENSAGEM
    const msgRes = await db.query(
      `
      INSERT INTO messages
        (cliente_id, modelo_id, sender, tipo, preco, visto, created_at)
      VALUES
        ($1, $2, 'modelo', 'conteudo', $3, false, NOW())
      RETURNING id, created_at
      `,
      [cliente_id, modelo_id, precoNum]
    );

    const message = msgRes.rows[0];

    // 5️⃣ ASSOCIAR MÍDIAS
    for (const conteudo_id of idsValidos) {
      await db.query(
        `
        INSERT INTO messages_conteudos (message_id, conteudo_id)
        VALUES ($1, $2)
        `,
        [message.id, conteudo_id]
      );
    }

    // 6️⃣ BUSCAR MÍDIAS
    const midiasRes = await db.query(
      `
      SELECT url, tipo AS tipo_media
      FROM conteudos
      WHERE id = ANY($1)
      `,
      [idsValidos]
    );

    const midias = midiasRes.rows;

    // 7️⃣ MARCAR UNREAD PARA CLIENTE
    await db.query(`
      INSERT INTO unread (cliente_id, modelo_id, unread_for, has_unread)
      VALUES ($1, $2, 'cliente', true)
      ON CONFLICT (cliente_id, modelo_id)
      DO UPDATE SET has_unread = true
    `, [cliente_id, modelo_id]);

    // 🔥 CHAT
    io.to(sala).emit("newMessage", {
      id: message.id,
      cliente_id,
      modelo_id,
      sender: "modelo",
      tipo: "conteudo",
      preco: precoNum,
      visto: false,
      quantidade: midias.length,
      midias,
      bloqueado: precoNum > 0,
      created_at: message.created_at
    });

    // 🔔 INBOX MODELO
    io.to(`inbox_modelo_${modelo_id}`).emit("inboxMessage", {
      cliente_id,
      modelo_id,
      sender: "modelo",
      tipo: "conteudo",
      textoPreview:
        precoNum > 0
          ? `📦 Conteúdo pago (${midias.length})`
          : `📦 Conteúdo (${midias.length})`,
      created_at: message.created_at
    });

    // 🔔 INBOX CLIENTE
    io.to(`inbox_cliente_${cliente_id}`).emit("inboxMessage", {
      cliente_id,
      modelo_id,
      sender: "modelo",
      tipo: "conteudo",
      textoPreview:
        precoNum > 0
          ? `📦 Conteúdo pago (${midias.length})`
          : `📦 Conteúdo (${midias.length})`,
      created_at: message.created_at
    });

  } catch (err) {
    console.error("❌ Erro sendConteudo:", err);
  }
});

socket.on("marcarConteudoVisto", async ({
  message_id,
  cliente_id,
  modelo_id
}) => {
  try {

    if (!socket.user || socket.user.role !== "cliente") {
      return socket.disconnect();
    }

    if (
      !Number.isInteger(message_id) ||
      !Number.isInteger(cliente_id) ||
      !Number.isInteger(modelo_id)
    ) return;

    // 🔒 CONVERTER users.id → cliente_id real
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [socket.user.id]
    );

    if (!clienteRes.rowCount) return;

    const clienteIdReal = clienteRes.rows[0].id;

    if (clienteIdReal !== cliente_id) return;

    // ✅ marcar como visto
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

    // 🔥 avisar sala
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

    if (!socket.user || socket.user.role !== "modelo") {
      return socket.disconnect();
    }

    if (
      !Number.isInteger(id) ||
      !text ||
      typeof text !== "string" ||
      text.trim().length === 0
    ) return;

    // 🔒 converter users.id → modelo_id
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [socket.user.id]
    );

    if (!modeloRes.rowCount) return;

    const modeloIdReal = modeloRes.rows[0].id;

    // 🔒 verificar se a mensagem pertence à modelo
    const msgRes = await db.query(
      `
      SELECT cliente_id, modelo_id
      FROM messages
      WHERE id = $1
        AND sender = 'modelo'
      `,
      [id]
    );

    if (!msgRes.rowCount) return;

    const { cliente_id, modelo_id } = msgRes.rows[0];

    if (modelo_id !== modeloIdReal) return;

    // 🔒 opcional: limitar edição a 15 minutos
    await db.query(
      `
      UPDATE messages
      SET text = $1,
          updated_at = NOW()
      WHERE id = $2
        AND modelo_id = $3
      `,
      [text.trim(), id, modeloIdReal]
    );

    // 🔥 emitir apenas para sala correta
    const sala = `chat_${cliente_id}_${modelo_id}`;

    io.to(sala).emit("mensagemEditada", {
      id,
      text: text.trim()
    });

  } catch (err) {
    console.error("Erro ao editar mensagem:", err);
  }
});


socket.on("excluirMensagem", async ({ id }) => {
  try {

    if (!socket.user || socket.user.role !== "modelo") {
      return socket.disconnect();
    }

    if (!Number.isInteger(id)) return;

    // 🔒 converter users.id → modelo_id
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [socket.user.id]
    );

    if (!modeloRes.rowCount) return;

    const modeloIdReal = modeloRes.rows[0].id;

    // 🔒 verificar mensagem
    const msgRes = await db.query(
      `
      SELECT cliente_id, modelo_id
      FROM messages
      WHERE id = $1
        AND sender = 'modelo'
      `,
      [id]
    );

    if (!msgRes.rowCount) return;

    const { cliente_id, modelo_id } = msgRes.rows[0];

    if (modelo_id !== modeloIdReal) return;

    // 🔥 excluir
    await db.query(
      `
      DELETE FROM messages
      WHERE id = $1
        AND modelo_id = $2
      `,
      [id, modeloIdReal]
    );

    // 🔔 emitir apenas para sala correta
    const sala = `chat_${cliente_id}_${modelo_id}`;

    io.to(sala).emit("mensagemExcluida", { id });

  } catch (err) {
    console.error("Erro ao excluir mensagem:", err);
  }
});

  // CLIENTE ONLINE
socket.on("loginCliente", async () => {
  try {

    if (!socket.user || socket.user.role !== "cliente") {
      return socket.disconnect();
    }

    // 🔒 converter users.id → cliente_id real
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [socket.user.id]
    );

    if (!clienteRes.rowCount) return;

    const clienteIdReal = clienteRes.rows[0].id;

    socket.cliente_id = clienteIdReal;
    onlineClientes[clienteIdReal] = socket.id;

    console.log("🟢 Cliente online:", clienteIdReal, socket.id);

    // 🔒 atualizar last_seen corretamente
    await db.query(
      `UPDATE clientes SET last_seen = NULL WHERE id = $1`,
      [clienteIdReal]
    );

  } catch (err) {
    console.error("Erro atualizar last_seen (online):", err);
  }
});

socket.on("disconnect", async () => {
  if (socket.cliente_id) {
    delete onlineClientes[socket.cliente_id];

    await db.query(
      `UPDATE clientes SET last_seen = NOW() WHERE id = $1`,
      [socket.cliente_id]
    );
  }
});


});


// ===============================
//ROTA GET
// ===============================
//VALOR ASISNATURA
app.get("/api/modelo/planos/me", auth, authModelo, async (req, res) => {
  try {

    const plano = await db.query(
      `SELECT * FROM modelos_planos WHERE modelo_id = $1`,
      [req.modelo_id]
    );

    res.json(plano.rows[0] || null);

  } catch (err) {
    console.error("Erro buscar plano:", err);
    res.status(500).json({ erro: "Erro ao buscar plano" });
  }
});


app.get(
  "/api/modelo/chat/:id",
  auth,
  async (req, res) => {
    const modelo_id = Number(req.params.id);

    if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    try {
      const result = await db.query(
        `
        SELECT
          id,
          nome_exibicao,
          avatar,
          last_seen
        FROM modelos
        WHERE id = $1
        `,
        [modelo_id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }

      res.json(result.rows[0]);

    } catch (err) {
      console.error("Erro buscar modelo chat:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);


app.get("/api/usuario/dados", auth, async (req, res) => {
  try {
    let result;

    if (req.user.role === "modelo") {

      // 🔥 converter users.id → modelos.id
      const modeloRes = await db.query(
        `SELECT id FROM modelos WHERE user_id = $1`,
        [req.user.id]
      );

      if (!modeloRes.rows.length) {
        return res.json({});
      }

      const modelo_id = modeloRes.rows[0].id;

      result = await db.query(`
        SELECT 
          md.*,
          (
            SELECT v.status
            FROM modelos_verificacao v
            WHERE v.modelo_id = md.modelo_id
            ORDER BY v.criado_em DESC
            LIMIT 1
          ) AS status
        FROM modelos_dados md
        WHERE md.modelo_id = $1
      `, [modelo_id]);

    } else if (req.user.role === "cliente") {

      const clienteRes = await db.query(
        `SELECT id FROM clientes WHERE user_id = $1`,
        [req.user.id]
      );

      if (!clienteRes.rows.length) {
        return res.json({});
      }

      const cliente_id = clienteRes.rows[0].id;

      result = await db.query(
        `SELECT * FROM clientes_dados WHERE cliente_id = $1`,
        [cliente_id]
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


app.get("/api/usuario/perfil", auth, async (req, res) => {
  try {
    let result;

    if (req.user.role === "modelo") {

      // 🔥 converter users.id → modelos.id
      const modeloRes = await db.query(
        `SELECT id FROM modelos WHERE user_id = $1`,
        [req.user.id]
      );

      if (!modeloRes.rows.length) {
        return res.json({});
      }

      const modelo_id = modeloRes.rows[0].id;

      result = await db.query(
        `
        SELECT
          m.nome_exibicao,
          m.local,
          m.bio,
          md.instagram,
          md.tiktok
        FROM modelos m
        LEFT JOIN modelos_dados md
          ON md.modelo_id = m.id
        WHERE m.id = $1
        `,
        [modelo_id]
      );
    }

    if (req.user.role === "cliente") {

      const clienteRes = await db.query(
        `SELECT id FROM clientes WHERE user_id = $1`,
        [req.user.id]
      );

      if (!clienteRes.rows.length) {
        return res.json({});
      }

      const cliente_id = clienteRes.rows[0].id;

      result = await db.query(
        `
        SELECT
          cd.username,
          cd.instagram,
          cd.tiktok,
          cd.local,
          cd.bio
        FROM clientes_dados cd
        WHERE cd.cliente_id = $1
        `,
        [cliente_id]
      );
    }

    if (!result) {
      return res.status(403).json({});
    }

    const perfil = result.rows[0] || {};

    res.json({
      nome_exibicao: perfil.nome_exibicao || "",
      instagram: perfil.instagram || "",
      tiktok: perfil.tiktok || "",
      local: perfil.local || "",
      bio: perfil.bio || ""
    });

  } catch (err) {
    console.error("ERRO GET /api/usuario/perfil:", err);
    res.status(500).json({ erro: "Erro ao buscar perfil" });
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
  try {

    await db.query("SELECT encerrar_ofertas_expiradas()");

    const result = await db.query(
      `
      SELECT *
      FROM ofertas
      WHERE modelo_id = $1
      ORDER BY created_at DESC
      `,
      [req.modelo_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Erro buscar ofertas:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});


//ATIVAS
app.get("/api/ofertas/ativa/:modelo_id", async (req, res) => {
  try {
    const modelo_id = Number(req.params.modelo_id);

    if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
      return res.status(400).json({ ativa: false });
    }

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
      [modelo_id]
    );

    if (!result.rows.length) {
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
  try {

    const modelo_id = Number(req.params.modelo_id);

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
      [req.cliente_id, modelo_id]
    );

    res.json({
      vip: result.rowCount > 0,
      expiration_at: result.rows[0]?.expiration_at || null
    });

  } catch (err) {
    console.error("Erro buscar status VIP:", err);
    res.status(500).json({ error: "Erro interno" });
  }
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


app.get("/api/me", auth, async (req, res) => {
  try {

    if (req.user.role === "modelo") {

      const result = await db.query(
        `
        SELECT
          m.id AS modelo_id,
          m.nome_exibicao,
          m.avatar,
          m.capa,
          m.bio,
          m.local
        FROM modelos m
        WHERE m.user_id = $1
        `,
        [req.user.id]
      );

      if (!result.rows.length) {
        return res.json({ role: "modelo" });
      }

      return res.json({
        user_id: req.user.id,
        modelo_id: result.rows[0].modelo_id,
        role: "modelo",
        avatar: result.rows[0].avatar,
        capa: result.rows[0].capa,
        bio: result.rows[0].bio || "",
        nome: result.rows[0].nome_exibicao || "Modelo",
        local: result.rows[0].local || ""
      });
    }

    // cliente ou outro
    return res.json({
      user_id: req.user.id,
      role: req.user.role
    });

  } catch (err) {
    console.error("Erro /api/me:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});


// FEED PÚBLICO DA MODELO (SÓ SE VALIDADA) //***CHECK **** */
app.get("/api/modelo/publico/:modelo_id/feed", async (req, res) => {
  const modelo_id = Number(req.params.modelo_id);

  if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json([]);
  }

  try {

    // 🔒 validar se modelo está aprovado
    const verificado = await db.query(`
      SELECT status
      FROM modelos_verificacao
      WHERE modelo_id = $1
      ORDER BY criado_em DESC
      LIMIT 1
    `, [modelo_id]);

    if (!verificado.rows.length || verificado.rows[0].status !== "aprovado") {
      return res.status(403).json([]);
    }

    // 🔎 buscar feed diretamente por modelo_id
    const feedCompleto = await buscarFeedCompletoPorModeloId(modelo_id);

    let usuario = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        usuario = verificarJWT(token);
      } catch (err) {
        console.log("Erro JWT:", err.message);
      }
    }

    // 👑 DONA DO PERFIL
    if (usuario?.role === "modelo") {

      const modeloRes = await db.query(
        `SELECT id FROM modelos WHERE user_id = $1`,
        [usuario.id]
      );

      if (modeloRes.rows[0]?.id === modelo_id) {
        return res.json(feedCompleto);
      }
    }

    // 💎 CLIENTE VIP
    if (usuario?.role === "cliente") {

      const clienteRes = await db.query(
        `SELECT id FROM clientes WHERE user_id = $1`,
        [usuario.id]
      );

      const cliente_id = clienteRes.rows[0]?.id;

      if (cliente_id) {
        const vip = await verificarVip(cliente_id, modelo_id);
        if (vip) {
          return res.json(feedCompleto);
        }
      }
    }

    // 🔒 resto só free
    const apenasFree = feedCompleto.filter(
      c => c.tipo_conteudo !== "venda"
    );

    return res.json(apenasFree);

  } catch (err) {
    console.error("Erro feed público:", err);
    res.status(500).json([]);
  }
});


// PERFIL USUARIO (CLT,MODELO) //***********check******* */
app.get("/api/modelo/me", authModelo, async (req, res) => {
  try {

    const result = await db.query(`
      SELECT
        m.id AS modelo_id,
        m.user_id,
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
        ON md.modelo_id = m.id
      WHERE m.id = $1
    `, [req.modelo_id]);

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
        m.id AS modelo_id,
        m.nome_exibicao,
        m.avatar,

        COALESCE(v.total_vips, 0) AS total_vips

      FROM modelos m

      -- 🔒 Só modelos aprovadas
      JOIN LATERAL (
        SELECT status
        FROM modelos_verificacao
        WHERE modelo_id = m.id
        ORDER BY criado_em DESC
        LIMIT 1
      ) ver ON true

      -- 👑 Contagem de VIPs ativos
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_vips
        FROM vip_subscriptions
        WHERE modelo_id = m.id
          AND ativo = true
          AND expiration_at > NOW()
      ) v ON true

      WHERE ver.status = 'aprovado'

      ORDER BY total_vips DESC NULLS LAST, m.id DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("Erro feed modelos:", err);
    res.status(500).json([]);
  }
});



// MODELOS COM CHAT (CLIENTE)
app.get("/api/cliente/modelos", authCliente, async (req, res) => {
  try {

    const result = await db.query(`
      SELECT 
        m.id AS modelo_id,
        m.nome_exibicao
      FROM vip_subscriptions v
      JOIN modelos m 
        ON m.id = v.modelo_id
      WHERE v.cliente_id = $1
      AND v.ativo = true
      AND v.expiration_at > NOW()
      ORDER BY m.nome_exibicao
    `,
    [req.cliente_id]);

    res.json(result.rows);

  } catch (err) {
    console.error("Erro modelos chat cliente:", err);
    res.status(500).json([]);
  }
});


app.get("/api/health/db", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ DB ERROR:", err);
    res.status(500).json({
      status: "error"
    });
  }
});


app.get("/api/chat/unread/cliente", authCliente, async (req, res) => {
  try {

    const ids = await buscarUnreadCliente(req.cliente_id);

    res.json(ids);

  } catch (err) {
    console.error("Erro unread cliente:", err);
    res.status(500).json([]);
  }
});


app.get("/api/chat/unread/modelo", authModelo, async (req, res) => {
  try {

    const ids = await buscarUnreadModelo(req.modelo_id);

    res.json(ids);

  } catch (err) {
    console.error("Erro unread modelo:", err);
    res.status(500).json([]);
  }
});


// 👤 IDENTIDADE DO CLIENTE (JWT)
app.get("/api/cliente/me", authCliente, async (req, res) => {
  try {

    const result = await db.query(`
      SELECT
        c.id AS cliente_id,
        c.user_id,
        c.nome,
        cd.username,
        cd.avatar,
        cd.capa
      FROM clientes c
      LEFT JOIN clientes_dados cd
        ON cd.cliente_id = c.id
      WHERE c.id = $1
    `, [req.cliente_id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro /api/cliente/me:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});


//ROTA LISTA VIP
app.get("/api/modelo/vips", authModelo, async (req, res) => {
  try {

    const result = await db.query(
      `
      SELECT 
        c.id AS cliente_id,
        c.nome
      FROM vip_subscriptions v
      JOIN clientes c 
        ON c.id = v.cliente_id
      WHERE v.modelo_id = $1
      AND v.ativo = true
      AND v.expiration_at > NOW()
      ORDER BY c.nome
      `,
      [req.modelo_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Erro listar VIPs:", err);
    res.status(500).json([]);
  }
});


app.get(
  "/conteudos.html",
  authModelo,
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "conteudos.html"));
  }
);

app.get(
  "/chatmodelo.html",
  authModelo,
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "chatmodelo.html"));
  }
);

// 🌍 PERFIL PÚBLICO //*********CHECK******* */
app.get("/api/modelo/publico/:modelo_id", async (req, res) => {
  const modelo_id = Number(req.params.modelo_id);

  if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json({ error: "modelo_id inválido" });
  }

  try {

    const result = await db.query(`
      SELECT
        m.id AS modelo_id,
        m.nome_exibicao,
        m.bio,
        m.avatar,
        m.capa,
        m.local,
        md.instagram,
        md.tiktok
      FROM modelos m
      JOIN LATERAL (
        SELECT status
        FROM modelos_verificacao
        WHERE modelo_id = m.id
        ORDER BY criado_em DESC
        LIMIT 1
      ) v ON true
      LEFT JOIN modelos_dados md
        ON md.modelo_id = m.id
      WHERE m.id = $1
        AND v.status = 'aprovado'
      LIMIT 1;
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
  try {

    const { rows } = await db.query(`
      SELECT
        m.id AS modelo_id,
        m.nome_exibicao,
        m.avatar,

        msg.text        AS ultima_mensagem,
        msg.created_at  AS ultima_mensagem_em,
        msg.lida,
        msg.sender

      FROM vip_subscriptions v

      JOIN modelos m 
        ON m.id = v.modelo_id

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
    `, [req.cliente_id]);

    res.json(rows);

  } catch (err) {
    console.error("Erro chat cliente:", err);
    res.status(500).json([]);
  }
});


/// ===============================
// CHAT — LISTA PARA MODELO
// ===============================
app.get("/api/chat/modelo", authModelo, async (req, res) => {
  try {

    const { rows } = await db.query(`
      SELECT DISTINCT ON (c.id)
        c.id AS cliente_id,
        c.nome,
        cd.username,
        cd.avatar,

        msg.text       AS ultima_mensagem,
        msg.created_at AS ultima_mensagem_em,
        msg.sender     AS ultimo_sender,
        COALESCE(msg.visto, false) AS visto,
        COALESCE(msg.lida, false)  AS lida

      FROM vip_subscriptions v

      JOIN clientes c 
        ON c.id = v.cliente_id

      LEFT JOIN clientes_dados cd 
        ON cd.cliente_id = c.id

      LEFT JOIN LATERAL (
        SELECT text, created_at, visto, lida, sender
        FROM messages
        WHERE messages.cliente_id = c.id
          AND messages.modelo_id  = v.modelo_id
        ORDER BY created_at DESC
        LIMIT 1
      ) msg ON true

      WHERE v.modelo_id = $1
        AND v.ativo = true
        AND v.expiration_at > NOW()

      ORDER BY c.id, msg.created_at DESC NULLS LAST;
    `, [req.modelo_id]);

    res.json(rows);

  } catch (err) {
    console.error("Erro ao buscar chats da modelo:", err);
    res.status(500).json({ error: "Erro ao buscar chats" });
  }
});


// ===============================
// 📄 DADOS DE UM CLIENTE (por ID)
// ===============================
app.get("/api/cliente/:cliente_id", authModelo, async (req, res) => {
  const cliente_id = Number(req.params.cliente_id);

  if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
    return res.status(400).json({ error: "cliente_id inválido" });
  }

  try {
    const result = await db.query(`
      SELECT
        c.id AS cliente_id,
        c.nome,
        c.last_seen,
        cd.username,
        cd.avatar
      FROM clientes c
      LEFT JOIN clientes_dados cd
        ON cd.cliente_id = c.id
      WHERE c.id = $1
      LIMIT 1
    `, [cliente_id]);

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
      [message_id, req.cliente_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Erro buscar conteúdo liberado:", err);
    res.status(500).json([]);
  }
});



// 🔒 CONTEÚDOS JÁ VISTOS POR CLIENTE (MODELO)
app.get("/api/chat/conteudos-vistos/:cliente_id", authModelo, async (req, res) => {

  const cliente_id = Number(req.params.cliente_id);

  if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
    return res.status(400).json({ error: "cliente_id inválido" });
  }

  try {
    const result = await db.query(`
      SELECT DISTINCT mc.conteudo_id
      FROM messages m
      JOIN messages_conteudos mc 
        ON mc.message_id = m.id
      WHERE m.modelo_id = $1
        AND m.cliente_id = $2
        AND m.visto = true
    `, [req.modelo_id, cliente_id]);

    res.json(result.rows.map(r => r.conteudo_id));

  } catch (err) {
    console.error("Erro buscar conteudos vistos:", err);
    res.status(500).json([]);
  }
});


app.get("/modelo/relatorio", authModelo, (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "admin-pages", "relatorio.html")
  );
});

app.get(
  "/api/chat/conteudo-status/:message_id",
  authCliente,
  async (req, res) => {

    const message_id = Number(req.params.message_id);

    if (!Number.isInteger(message_id) || message_id <= 0) {
      return res.status(400).json({ liberado: false });
    }

    try {
      const result = await db.query(
        `
        SELECT visto
        FROM messages
        WHERE id = $1
          AND cliente_id = $2
        `,
        [message_id, req.cliente_id]  // 🔥 correto
      );

      if (result.rowCount === 0) {
        return res.json({ liberado: false });
      }

      res.json({ liberado: result.rows[0].visto === true });

    } catch (err) {
      console.error("Erro conteudo-status:", err);
      res.status(500).json({ liberado: false });
    }
  }
);

// 📦 CONTEÚDOS DA MODELO (PARA POPUP)
app.get("/api/conteudos", authModelo, async (req, res) => {
  const { venda } = req.query;

  try {
    let where = "c.modelo_id = $1";
    const params = [req.modelo_id];

    if (venda === "true") {
      where += " AND c.tipo_conteudo = 'venda'";
    }

    const result = await db.query(
      `
      SELECT
        c.id,
        c.modelo_id,
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


app.get("/api/verificacao/status", auth, async (req, res) => {
  try {

    if (req.user.role === "modelo") {

      const result = await db.query(
        `
        SELECT status, motivo_rejeicao
        FROM modelos_verificacao
        WHERE modelo_id = $1
        ORDER BY criado_em DESC
        LIMIT 1
        `,
        [req.modelo_id]
      );

      return res.json(result.rows[0] || { status: "pendente", motivo: null });
    }

    if (req.user.role === "cliente") {

      const result = await db.query(
        `
        SELECT status, motivo_rejeicao
        FROM clientes_verificacao
        WHERE cliente_id = $1
        ORDER BY criado_em DESC
        LIMIT 1
        `,
        [req.cliente_id]
      );

      return res.json(result.rows[0] || { status: "pendente", motivo: null });
    }

    return res.json({ status: "pendente", motivo: null });

  } catch (err) {
    console.error("Erro status verificação:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});


app.get("/api/modelo/assinantes", authModelo, async (req, res) => {
  try {

    const result = await db.query(
      `
      SELECT
        c.id    AS cliente_id,
        c.nome  AS nome_cliente,

        v.ativo,
        v.expiration_at,
        v.updated_at AS ultima_renovacao,

        COALESCE(
          SUM(DISTINCT (v.valor_assinatura * 0.7)),
          0
        ) AS total_assinaturas,

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
      [req.modelo_id]   // 🔥 CORRETO
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Erro listar assinantes:", err);
    res.status(500).json({ erro: "Erro ao listar assinantes" });
  }
});

app.get("/api/chat/cliente/:cliente_id", authModelo, async (req, res) => {

  const cliente_id = Number(req.params.cliente_id);

  if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
    return res.status(400).json({ error: "cliente_id inválido" });
  }

  try {
    const result = await db.query(`
      SELECT
        c.id AS cliente_id,
        c.nome,
        c.last_seen,
        cd.username,
        cd.avatar
      FROM clientes c
      LEFT JOIN clientes_dados cd
        ON cd.cliente_id = c.id
      WHERE c.id = $1
      LIMIT 1
    `, [cliente_id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro buscar cliente:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});


app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "manifest.json"));
});


// ===============================
// ROTA POST
// ===============================

app.put("/api/modelo/planos", authModelo, async (req, res) => {
  try {

    const { valor_mensal, desconto_trimestral } = req.body;

    const mensal = Number(valor_mensal);
    const desconto = Number(desconto_trimestral) || 0;

    if (!mensal || mensal < 20) {
      return res.status(400).json({ erro: "Valor mínimo R$ 20" });
    }

    if (desconto < 0 || desconto > 30) {
      return res.status(400).json({ erro: "Desconto inválido" });
    }

    const valorTrimestral = (mensal * 3) * (1 - desconto / 100);

    // 🔥 verificar se já existe plano
    const existe = await db.query(
      `SELECT modelo_id FROM modelos_planos WHERE modelo_id = $1`,
      [req.modelo_id]
    );

    if (existe.rows.length > 0) {
      await db.query(`
        UPDATE modelos_planos
        SET valor_mensal = $1,
            desconto_trimestral = $2,
            valor_trimestral = $3,
            updated_at = NOW()
        WHERE modelo_id = $4
      `, [mensal, desconto, valorTrimestral, req.modelo_id]);
    } else {
      await db.query(`
        INSERT INTO modelos_planos
        (modelo_id, valor_mensal, desconto_trimestral, valor_trimestral)
        VALUES ($1, $2, $3, $4)
      `, [req.modelo_id, mensal, desconto, valorTrimestral]);
    }

    res.json({ sucesso: true });

  } catch (err) {
    console.error("Erro salvar plano:", err);
    res.status(500).json({ erro: "Erro ao salvar plano" });
  }
});

app.put("/api/ofertas/:id/encerrar", authModelo, async (req, res) => {
  try {

    const ofertaId = Number(req.params.id);

    if (!Number.isInteger(ofertaId) || ofertaId <= 0) {
      return res.status(400).json({ erro: "ID inválido" });
    }

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
      [ofertaId, req.modelo_id]   // 🔥 usa direto
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

app.put("/api/modelo/me", authModelo, async (req, res) => {
  try {

    const { nome_exibicao, instagram, tiktok, local, bio } = req.body;

    if (!nome_exibicao || !nome_exibicao.trim()) {
      return res.status(400).json({
        error: "nome_exibicao é obrigatório"
      });
    }

    const nomeFinal   = nome_exibicao.trim();
    const localFinal  = local?.trim()   || null;
    const bioFinal    = bio?.trim()     || null;
    const instaFinal  = instagram?.trim() || null;
    const tiktokFinal = tiktok?.trim()   || null;

    // 🔥 Atualiza tabela modelos
    await db.query(
      `
      UPDATE modelos
      SET
        nome_exibicao = $1,
        local = $2,
        bio   = $3
      WHERE id = $4
      `,
      [nomeFinal, localFinal, bioFinal, req.modelo_id]
    );

    // 🔥 Atualiza tabela modelos_dados usando modelo_id
    await db.query(
      `
      INSERT INTO modelos_dados (modelo_id, instagram, tiktok)
      VALUES ($1, $2, $3)
      ON CONFLICT (modelo_id)
      DO UPDATE SET
        instagram = EXCLUDED.instagram,
        tiktok = EXCLUDED.tiktok
      `,
      [req.modelo_id, instaFinal, tiktokFinal]
    );

    res.json({ sucesso: true });

  } catch (err) {
    console.error("ERRO PUT /api/modelo/me:", err);
    res.status(500).json({
      erro: "Erro ao salvar dados da modelo"
    });
  }
});



app.put("/api/conteudos/:id", authModelo, async (req, res) => {

  const conteudo_id = Number(req.params.id);

  if (!Number.isInteger(conteudo_id) || conteudo_id <= 0) {
    return res.status(400).json({ error: "ID inválido" });
  }

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
        AND modelo_id = $5
      RETURNING
        id,
        tipo,
        url,
        thumbnail_url,
        modelo_id
      `,
      [tipo, url, thumbnail_url || null, conteudo_id, req.modelo_id]
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


app.put("/api/usuario/perfil", auth, async (req, res) => {
  try {

    const {
      nome_exibicao,
      instagram,
      tiktok,
      local,
      bio
    } = req.body;

    // ===============================
    // 👤 CLIENTE
    // ===============================
    if (req.user.role === "cliente") {

      const clienteRes = await db.query(
        `SELECT id FROM clientes WHERE user_id = $1`,
        [req.user.id]
      );

      if (!clienteRes.rows.length) {
        return res.status(404).json({ erro: "Cliente não encontrado" });
      }

      const clienteId = clienteRes.rows[0].id;

      // garante que exista linha em clientes_dados
      const existe = await db.query(
        `SELECT 1 FROM clientes_dados WHERE cliente_id = $1`,
        [clienteId]
      );

      if (existe.rows.length === 0) {
        await db.query(
          `
          INSERT INTO clientes_dados (cliente_id, nome_completo)
          VALUES ($1, (SELECT nome FROM clientes WHERE id = $1))
          `,
          [clienteId]
        );
      }

      await db.query(
        `
        UPDATE clientes_dados
        SET
          username      = COALESCE($1, username),
          instagram     = COALESCE($2, instagram),
          tiktok        = COALESCE($3, tiktok),
          local         = COALESCE($4, local),
          bio           = COALESCE($5, bio),
          atualizado_em = NOW()
        WHERE cliente_id = $6
        `,
        [
          nome_exibicao ?? null,
          instagram ?? null,
          tiktok ?? null,
          local ?? null,
          bio ?? null,
          clienteId
        ]
      );

      return res.json({ ok: true });
    }

    // ===============================
    // 👠 MODELO
    // ===============================
    if (req.user.role === "modelo") {

      const modeloRes = await db.query(
        `SELECT id FROM modelos WHERE user_id = $1`,
        [req.user.id]
      );

      if (!modeloRes.rows.length) {
        return res.status(404).json({ erro: "Modelo não encontrado" });
      }

      const modeloId = modeloRes.rows[0].id;

      await db.query(
        `
        UPDATE modelos
        SET
          nome_exibicao = COALESCE($1, nome_exibicao),
          local         = COALESCE($2, local),
          bio           = COALESCE($3, bio),
          atualizado_em = NOW()
        WHERE id = $4
        `,
        [
          nome_exibicao ?? null,
          local ?? null,
          bio ?? null,
          modeloId
        ]
      );

      await db.query(
        `
        INSERT INTO modelos_dados (modelo_id, instagram, tiktok)
        VALUES ($1, $2, $3)
        ON CONFLICT (modelo_id) DO UPDATE
        SET
          instagram     = COALESCE(EXCLUDED.instagram, modelos_dados.instagram),
          tiktok        = COALESCE(EXCLUDED.tiktok, modelos_dados.tiktok),
          atualizado_em = NOW()
        `,
        [
          modeloId,
          instagram ?? null,
          tiktok ?? null
        ]
      );

      return res.json({ ok: true });
    }

    return res.status(403).json({ erro: "Tipo de usuário inválido" });

  } catch (err) {
    console.error("ERRO PUT /api/usuario/perfil:", err);
    res.status(500).json({ erro: "Erro ao salvar perfil" });
  }
});


//DADOS CLIENTE
app.post("/api/cliente/dados", authCliente, async (req, res) => {
  try {

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
        (cliente_id, username, nome_completo, data_nascimento, pais,
         nome_cartao, ultimos4_cartao, bandeira_cartao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (cliente_id)
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
      req.cliente_id,
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

    const userId = req.user.id;

    // 🔁 Converter users.id → modelos.id
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [userId]
    );

    if (modeloRes.rowCount === 0) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    const modelo_id = modeloRes.rows[0].id;

    // 🔒 Verificar status usando modelo_id correto
    const verificacao = await db.query(`
      SELECT status
      FROM modelos_verificacao
      WHERE modelo_id = $1
      ORDER BY criado_em DESC
      LIMIT 1
    `, [modelo_id]);

    if (
      verificacao.rowCount > 0 &&
      verificacao.rows[0].status === "aprovado"
    ) {
      return res.status(403).json({
        erro: "Dados pessoais já aprovados e não podem ser alterados"
      });
    }

    // ✅ Salvar usando modelo_id (NÃO user_id)
    await db.query(`
      INSERT INTO modelos_dados
        (modelo_id, nome_completo, data_nascimento, telefone, endereco, estado, cidade, pais, atualizado_em)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (modelo_id)
      DO UPDATE SET
        nome_completo = EXCLUDED.nome_completo,
        data_nascimento = EXCLUDED.data_nascimento,
        telefone = EXCLUDED.telefone,
        endereco = EXCLUDED.endereco,
        estado = EXCLUDED.estado,
        cidade = EXCLUDED.cidade,
        pais = EXCLUDED.pais,
        atualizado_em = NOW()
    `, [
      modelo_id,
      nome_completo?.trim() || null,
      data_nascimento || null,
      telefone?.trim() || null,
      endereco?.trim() || null,
      estado?.trim() || null,
      cidade?.trim() || null,
      pais?.trim() || null
    ]);

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

      // 🔎 Buscar modelo_id da verificação
      const verificacaoRes = await db.query(
        `SELECT modelo_id FROM modelos_verificacao WHERE id = $1`,
        [id]
      );

      if (verificacaoRes.rowCount === 0) {
        return res.status(404).json({ erro: "Verificação não encontrada" });
      }

      const modelo_id = verificacaoRes.rows[0].modelo_id;

      // 🔁 Converter modelo_id → user_id
      const modeloRes = await db.query(
        `SELECT user_id FROM modelos WHERE id = $1`,
        [modelo_id]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({ erro: "Modelo não encontrado" });
      }

      const user_id = modeloRes.rows[0].user_id;

      // ✅ Atualizar verificação
      await db.query(
        `
        UPDATE modelos_verificacao
        SET
          status = $1,
          motivo = $2,
          atualizado_em = NOW()
        WHERE id = $3
        `,
        [status, motivo || null, id]
      );

      // 🚀 Se aprovado → promover para modelo
      if (status === "aprovado") {
        await db.query(
          `UPDATE users SET role = 'modelo' WHERE id = $1`,
          [user_id]
        );
      }

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

      const userId = req.user.id;

      // 🔁 Converter users.id → clientes.id
      const clienteRes = await db.query(
        `SELECT id FROM clientes WHERE user_id = $1`,
        [userId]
      );

      if (clienteRes.rowCount === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }

      const cliente_id = clienteRes.rows[0].id;

      // ☁️ Upload no Cloudinary
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: `velvet/clientes/${cliente_id}/avatar`,
            transformation: [
              { width: 400, height: 400, crop: "fill" }
            ]
          },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });

      // 🔄 Atualizar via cliente_id
      const update = await db.query(
        `
        UPDATE clientes_dados
        SET avatar = $1,
            atualizado_em = NOW()
        WHERE cliente_id = $2
        `,
        [result.secure_url, cliente_id]
      );

      if (update.rowCount === 0) {
        return res.status(400).json({
          error: "Preencha seus dados antes de adicionar uma foto de perfil."
        });
      }

      res.json({ url: result.secure_url });

    } catch (err) {
      console.error("Erro avatar cliente:", err);
      res.status(500).json({ error: "Erro ao atualizar avatar" });
    }
  }
);


app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const {
      email,
      senha,
      role,
      nome_completo,
      data_nascimento,
      ageConfirmed,
      ref,
      src
    } = req.body;

    // ===============================
    // 🔒 VALIDAÇÕES BÁSICAS
    // ===============================
    if (!email || !senha || !role || !nome_completo || !data_nascimento) {
      return res.status(400).json({
        erro: "Todos os campos obrigatórios devem ser preenchidos"
      });
    }

    if (!emailValido(email)) {
      return res.status(400).json({ erro: "Email inválido" });
    }

    if (!["modelo", "cliente"].includes(role)) {
      return res.status(400).json({ erro: "Tipo de conta inválido" });
    }

    if (ageConfirmed !== true) {
      return res.status(400).json({
        erro: "Confirmação de idade obrigatória (+18)"
      });
    }

    // ===============================
    // 🔥 VALIDAÇÃO REAL DE IDADE
    // ===============================
    const nascimento = new Date(data_nascimento);
    const hoje = new Date();

    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mesDiff = hoje.getMonth() - nascimento.getMonth();

    if (
      mesDiff < 0 ||
      (mesDiff === 0 && hoje.getDate() < nascimento.getDate())
    ) {
      idade--;
    }

    if (idade < 18) {
      return res.status(400).json({
        erro: "É necessário ter 18 anos ou mais para se registrar"
      });
    }

    // ===============================
    // 🔐 CRIAR USER
    // ===============================
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

    let modeloId = null;
    let clienteId = null;

    // ===============================
    // 👠 MODELO
    // ===============================
    if (role === "modelo") {

      // criar modelo base
      const modeloResult = await db.query(
        `
        INSERT INTO public.modelos (user_id)
        VALUES ($1)
        RETURNING id
        `,
        [userId]
      );

      modeloId = modeloResult.rows[0].id;

      // dados pessoais via modelo_id
      await db.query(
        `
        INSERT INTO public.modelos_dados
          (modelo_id, nome_completo, data_nascimento, criado_em, atualizado_em)
        VALUES
          ($1, $2, $3, NOW(), NOW())
        `,
        [modeloId, nome_completo, data_nascimento]
      );
    }

    // ===============================
    // 👤 CLIENTE
    // ===============================
    if (role === "cliente") {

      const nomePublico = nome_completo.split(" ")[0];

      const clienteResult = await db.query(
        `
        INSERT INTO public.clientes
          (user_id, nome, origem_trafego, ref_modelo)
        VALUES
          ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          userId,
          nomePublico,
          src || null,
          ref ? Number(ref) : null
        ]
      );

      clienteId = clienteResult.rows[0].id;

      await db.query(
        `
        INSERT INTO public.clientes_dados
          (cliente_id, username, nome_completo, data_nascimento, criado_em, atualizado_em)
        VALUES
          ($1, $2, $3, $4, NOW(), NOW())
        `,
        [
          clienteId,
          nomePublico,
          nome_completo,
          data_nascimento
        ]
      );
    }

    // ===============================
    // 🎟 GERAR TOKEN
    // ===============================
    const token = jwt.sign(
      {
        id: userId,   // sempre users.id
        email,
        role
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.status(201).json({
      token,
      role,
      modelo_id: modeloId,
      cliente_id: clienteId
    });

  } catch (err) {
    console.error("ERRO REGISTER:", err);

    if (err.code === "23505") {
      return res.status(409).json({ erro: "Email já registrado" });
    }

    return res.status(500).json({
      erro: "Erro interno no servidor"
    });
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
      `SELECT id, email, password_hash, role 
       FROM public.users 
       WHERE email = $1`,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const user = result.rows[0];

    const senhaOk = await bcrypt.compare(senha, user.password_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    const token = jwt.sign(
      {
        id: user.id,          // sempre users.id
        email: user.email,
        role: user.role.toLowerCase()
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      token,
      role: user.role.toLowerCase()
    });

  } catch (err) {
    console.error("🔥 ERRO LOGIN:", err);
    return res.status(500).json({ error: "Erro interno no login" });
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

        // modelos pode usar user_id
        await db.query(
          "UPDATE modelos SET avatar = $1 WHERE user_id = $2",
          [url, userId]
        );

      } 
      else if (req.user.role === "cliente") {

        // 🔁 converter users.id → cliente_id
        const clienteRes = await db.query(
          "SELECT id FROM clientes WHERE user_id = $1",
          [userId]
        );

        if (clienteRes.rowCount === 0) {
          return res.status(404).json({ error: "Cliente não encontrado" });
        }

        const cliente_id = clienteRes.rows[0].id;

        await db.query(
          `
          UPDATE clientes_dados
          SET avatar = $1,
              atualizado_em = NOW()
          WHERE cliente_id = $2
          `,
          [url, cliente_id]
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

        // modelos pode usar user_id
        await db.query(
          "UPDATE modelos SET capa = $1 WHERE user_id = $2",
          [url, userId]
        );

      } 
      else if (req.user.role === "cliente") {

        // 🔁 converter users.id → cliente_id
        const clienteRes = await db.query(
          "SELECT id FROM clientes WHERE user_id = $1",
          [userId]
        );

        if (clienteRes.rowCount === 0) {
          return res.status(404).json({ error: "Cliente não encontrado" });
        }

        const cliente_id = clienteRes.rows[0].id;

        await db.query(
          `
          UPDATE clientes_dados
          SET capa = $1,
              atualizado_em = NOW()
          WHERE cliente_id = $2
          `,
          [url, cliente_id]
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

      const userId = req.user.id;

      // 🔁 converter users.id → modelo_id
      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [userId]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }

      const modelo_id = modeloRes.rows[0].id;

      await db.query(
        `
        INSERT INTO modelos_dados
          (modelo_id, nome_exibicao, nome_completo, data_nascimento,
           telefone, endereco, pais, instagram, tiktok, criado_em, atualizado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
        ON CONFLICT (modelo_id)
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
          modelo_id,
          nome_exibicao,
          nome_completo,
          data_nascimento,
          telefone,
          endereco,
          pais,
          instagram,
          tiktok
        ]
      );

      // 🔥 sincronizar nome público no perfil base
      await db.query(
        "UPDATE modelos SET nome = $1 WHERE id = $2",
        [nome_exibicao, modelo_id]
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
  const userId = req.user.id;
  const conteudo_id = Number(req.params.id);

  try {

    // 🔁 converter users.id → modelo_id
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [userId]
    );

    if (modeloRes.rowCount === 0) {
      return res.status(404).json({ error: "Modelo não encontrado" });
    }

    const modelo_id = modeloRes.rows[0].id;

    // 🔥 deletar usando modelo_id
    const result = await db.query(
      `
      DELETE FROM conteudos
      WHERE id = $1
        AND modelo_id = $2
      RETURNING id
      `,
      [conteudo_id, modelo_id]
    );

    if (result.rowCount === 0) {
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
  const role = req.user.role;
  const senhaInformada = req.body.senha;

  if (!senhaInformada) {
    return res.status(400).json({ error: "Senha obrigatória" });
  }

  const client = await db.connect();

  try {
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

    // ===============================
    // 👠 SE FOR MODELO
    // ===============================
    if (role === "modelo") {

      const modeloRes = await client.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [userId]
      );

      if (modeloRes.rowCount > 0) {
        const modelo_id = modeloRes.rows[0].id;

        await client.query("DELETE FROM messages WHERE modelo_id = $1", [modelo_id]);
        await client.query("DELETE FROM vip_subscriptions WHERE modelo_id = $1", [modelo_id]);
        await client.query("DELETE FROM conteudo_pacotes WHERE modelo_id = $1", [modelo_id]);
        await client.query("DELETE FROM conteudos WHERE modelo_id = $1", [modelo_id]);
        await client.query("DELETE FROM modelos_dados WHERE modelo_id = $1", [modelo_id]);
        await client.query("DELETE FROM modelos WHERE id = $1", [modelo_id]);
      }
    }

    // ===============================
    // 👤 SE FOR CLIENTE
    // ===============================
    if (role === "cliente") {

      const clienteRes = await client.query(
        "SELECT id FROM clientes WHERE user_id = $1",
        [userId]
      );

      if (clienteRes.rowCount > 0) {
        const cliente_id = clienteRes.rows[0].id;

        await client.query("DELETE FROM messages WHERE cliente_id = $1", [cliente_id]);
        await client.query("DELETE FROM vip_subscriptions WHERE cliente_id = $1", [cliente_id]);
        await client.query("DELETE FROM clientes_dados WHERE cliente_id = $1", [cliente_id]);
        await client.query("DELETE FROM clientes WHERE id = $1", [cliente_id]);
      }
    }

    // ===============================
    // 🔥 FINALMENTE APAGA O USER
    // ===============================
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


app.post("/api/pagamento/vip/pix", auth, async (req, res) => {
  try {
    const { modelo_id } = req.body;
    const userId = req.user.id;

    if (!modelo_id || isNaN(Number(modelo_id))) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    // 🔁 Converter users.id → cliente_id
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = clienteRes.rows[0].id;

    /* ===============================
       1️⃣ VERIFICAR VIP ATIVO
    =============================== */
    const vipAtivo = await db.query(`
      SELECT 1
      FROM vip_subscriptions
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND expiration_at > NOW()
      LIMIT 1
    `, [cliente_id, modelo_id]);

    if (vipAtivo.rowCount > 0) {
      return res.status(400).json({
        error: "Você já é VIP deste modelo."
      });
    }

    /* ===============================
       2️⃣ BUSCAR OFERTA OU PLANO
    =============================== */
    const ofertaRes = await db.query(`
      SELECT valor_promocional
      FROM ofertas
      WHERE modelo_id = $1
        AND ativa = true
        AND NOW() BETWEEN data_inicio AND data_fim
      LIMIT 1
    `, [modelo_id]);

    let valorAssinatura;

    if (ofertaRes.rowCount > 0) {
      valorAssinatura = Number(ofertaRes.rows[0].valor_promocional);
    } else {
      const planoRes = await db.query(`
        SELECT valor_mensal
        FROM modelos_planos
        WHERE modelo_id = $1
      `, [modelo_id]);

      if (planoRes.rowCount === 0) {
        return res.status(400).json({
          error: "Plano VIP não definido"
        });
      }

      valorAssinatura = Number(planoRes.rows[0].valor_mensal);
    }

    if (!valorAssinatura || valorAssinatura <= 0) {
      return res.status(400).json({
        error: "Valor inválido para assinatura"
      });
    }

    /* ===============================
       3️⃣ TAXAS
    =============================== */
    const taxaTransacao  = Number((valorAssinatura * 0.10).toFixed(2));
    const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2));

    let valorTotal = Number(
      (valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    if (!valorTotal || isNaN(valorTotal) || valorTotal < 1) {
      valorTotal = 1.00;
    }

    /* ===============================
       4️⃣ BUSCAR EMAIL REAL DO CLIENTE
    =============================== */
    const userRes = await db.query(
      `SELECT email FROM users WHERE id = $1`,
      [userId]
    );

    const emailCliente =
      userRes.rows[0]?.email || "contato@velvet.lat";

    /* ===============================
       5️⃣ CRIAR PIX MERCADO PAGO
    =============================== */
    const mp = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const payment = new Payment(mp);

    const pagamento = await payment.create({
      body: {
        transaction_amount: valorTotal,
        description: "Assinatura VIP",
        payment_method_id: "pix",
        payer: { email: emailCliente },
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

    /* ===============================
       6️⃣ SALVAR PAGAMENTO PENDENTE
    =============================== */
    await db.query(`
      INSERT INTO pagamentos_pix (
        cliente_id,
        modelo_id,
        valor,
        status,
        mp_payment_id
      )
      VALUES ($1,$2,$3,'pendente',$4)
    `, [
      cliente_id,
      modelo_id,
      valorTotal,
      pagamento.id
    ]);

    /* ===============================
       7️⃣ RETORNAR QR CODE
    =============================== */
    res.json({
      qr_code:
        pagamento.point_of_interaction.transaction_data.qr_code_base64,
      copia_cola:
        pagamento.point_of_interaction.transaction_data.qr_code
    });

  } catch (err) {
    console.error("🔥 ERRO PIX VIP:", err);
    res.status(500).json({
      error: "Erro ao gerar Pix VIP"
    });
  }
});


app.post("/api/pagamento/midia/cartao", auth, async (req, res) => {
  try {
    const { conteudo_id } = req.body;
    const userId = req.user.id;

    if (!conteudo_id) {
      return res.status(400).json({ error: "conteudo_id inválido" });
    }

    // 🔁 converter users.id → cliente_id
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = clienteRes.rows[0].id;

    // 1️⃣ buscar conteúdo corretamente
    const conteudoRes = await db.query(`
      SELECT preco, modelo_id
      FROM conteudos
      WHERE id = $1
        AND tipo_conteudo = 'venda'
    `, [conteudo_id]);

    if (conteudoRes.rowCount === 0) {
      return res.status(404).json({ error: "Conteúdo não encontrado" });
    }

    const { preco, modelo_id } = conteudoRes.rows[0];
    const precoNum = Number(preco);

    // 2️⃣ taxas
    const taxaTransacao  = Number((precoNum * 0.10).toFixed(2));
    const taxaPlataforma = Number((precoNum * 0.05).toFixed(2));
    const total = Number((precoNum + taxaTransacao + taxaPlataforma).toFixed(2));

    // 3️⃣ criar message técnico
    const msgRes = await db.query(`
      INSERT INTO messages
        (cliente_id, modelo_id, sender, tipo, preco, visto)
      VALUES
        ($1,$2,'modelo','conteudo',$3,false)
      RETURNING id
    `, [cliente_id, modelo_id, precoNum]);

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
        valor_base: precoNum,
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

  } catch (err) {
    console.error("🔥 ERRO CARTÃO MIDIA:", err);
    res.status(500).json({ error: "Erro ao gerar pagamento" });
  }
});

// ===============================
// WEBHOOK MERCADOPAGO
// ===============================
app.post("/webhook/mercadopago", async (req, res) => {
  console.log("🔥 WEBHOOK MP RECEBIDO");
  console.log("BODY:", JSON.stringify(req.body, null, 2));

  const client = await db.connect();

  try {
    const paymentId = req.body?.data?.id;
    if (!paymentId) return res.sendStatus(200);

    const mp = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    });

    const payment = new Payment(mp);
    const pagamento = await payment.get({ id: paymentId });

    if (pagamento.status !== "approved") {
      return res.sendStatus(200);
    }

    console.log("STATUS MP:", pagamento.status);
    console.log("METADATA MP:", pagamento.metadata);

    const tipo = pagamento.metadata?.tipo;
    if (!tipo) return res.sendStatus(200);

    await client.query("BEGIN");

    /* =====================================================
       🔥 VIP
    ===================================================== */
    if (tipo === "vip") {

      const cliente_id = Number(pagamento.metadata.cliente_id);
      const modelo_id  = Number(pagamento.metadata.modelo_id);
      const valor_assinatura = Number(pagamento.metadata.valor_assinatura);
      const taxa_transacao   = Number(pagamento.metadata.taxa_transacao);
      const taxa_plataforma  = Number(pagamento.metadata.taxa_plataforma);

      // 🔒 evitar duplicação
      const jaPago = await client.query(`
        SELECT 1
        FROM pagamentos_pix
        WHERE mp_payment_id = $1
          AND status = 'pago'
        LIMIT 1
      `, [paymentId]);

      if (jaPago.rowCount === 0) {

        await ativarVipAssinatura({
          cliente_id,
          modelo_id,
          valor_assinatura,
          taxa_transacao,
          taxa_plataforma
        });

        await client.query(`
          UPDATE pagamentos_pix
          SET status = 'pago'
          WHERE mp_payment_id = $1
        `, [paymentId]);

        console.log("✅ VIP ATIVADO:", cliente_id, modelo_id);
      }
    }

    /* =====================================================
       🔓 CONTEÚDO
    ===================================================== */
    if (tipo === "conteudo") {

      const cliente_id = Number(pagamento.metadata.cliente_id);
      const modelo_id  = Number(pagamento.metadata.modelo_id);
      const message_id = Number(pagamento.metadata.message_id);
      const valor_base = Number(pagamento.metadata.valor_base);
      const taxa_transacao  = Number(pagamento.metadata.taxa_transacao);
      const taxa_plataforma = Number(pagamento.metadata.taxa_plataforma);
      const valor_total = Number(pagamento.transaction_amount);

      // 🔒 evitar reprocessamento
      const jaProcessado = await client.query(`
        SELECT 1
        FROM conteudo_pacotes
        WHERE payment_id = $1
        LIMIT 1
      `, [pagamento.id]);

      if (jaProcessado.rowCount === 0) {

        // buscar preço real do banco
        const precoResult = await client.query(`
          SELECT preco
          FROM messages
          WHERE id = $1
        `, [message_id]);

        if (precoResult.rowCount === 0) {
          throw new Error("Conteúdo não encontrado para calcular preço");
        }

        const preco = Number(precoResult.rows[0].preco);

        // registrar pagamento
        await client.query(`
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
        `, [
          message_id,
          cliente_id,
          modelo_id,
          preco,
          valor_base,
          taxa_transacao,
          taxa_plataforma,
          valor_total,
          pagamento.id
        ]);

        // liberar conteúdo no chat
        await client.query(`
          UPDATE messages
          SET visto = true
          WHERE id = $1
            AND cliente_id = $2
            AND modelo_id = $3
        `, [message_id, cliente_id, modelo_id]);

        const sala = `chat_${cliente_id}_${modelo_id}`;

        io.to(sala).emit("conteudoVisto", {
          message_id
        });

        console.log("✅ CONTEÚDO PAGO (PIX) REGISTRADO:", message_id);
      }
    }

    await client.query("COMMIT");
    return res.sendStatus(200);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erro webhook MercadoPago:", err);
    return res.sendStatus(500);
  } finally {
    client.release();
  }
});


app.post("/api/pagamento/conteudo/pix", auth, async (req, res) => {
  try {
    const { message_id } = req.body;
    const userId = req.user.id;

    if (!message_id) {
      return res.status(400).json({ error: "message_id inválido" });
    }

    // 🔁 converter users.id → cliente_id
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = clienteRes.rows[0].id;

    // 🔎 buscar preço + modelo_id corretamente
    const result = await db.query(
      `
      SELECT preco, modelo_id
      FROM messages
      WHERE id = $1
        AND cliente_id = $2
        AND tipo = 'conteudo'
      `,
      [message_id, cliente_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Conteúdo não encontrado" });
    }

    const { preco, modelo_id } = result.rows[0];

    const valorBase = Number(preco);
    const taxaTransacao  = Number((valorBase * 0.10).toFixed(2));
    const taxaPlataforma = Number((valorBase * 0.05).toFixed(2));

    let valorTotal = Number(
      (valorBase + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    if (!valorTotal || valorTotal < 1) {
      valorTotal = 1;
    }

    // 🔎 buscar email real do cliente
    const userRes = await db.query(
      "SELECT email FROM users WHERE id = $1",
      [userId]
    );

    const emailCliente =
      userRes.rows[0]?.email || "cliente@velvet.lat";

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
          email: emailCliente
        },
        metadata: {
          tipo: "conteudo",
          cliente_id: cliente_id,
          modelo_id: modelo_id,
          message_id: Number(message_id),
          valor_base: valorBase,
          taxa_transacao: taxaTransacao,
          taxa_plataforma: taxaPlataforma
        }
      }
    });

    res.json({
      qr_code:
        pix.point_of_interaction.transaction_data.qr_code_base64,
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
  auth,
  async (req, res) => {
    try {
      const { message_id } = req.body;
      const userId = req.user.id;

      if (!message_id) {
        return res.status(400).json({ error: "message_id inválido" });
      }

      // 🔁 Converter users.id → cliente_id
      const clienteRes = await db.query(
        "SELECT id FROM clientes WHERE user_id = $1",
        [userId]
      );

      if (clienteRes.rowCount === 0) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }

      const cliente_id = clienteRes.rows[0].id;

      // 🔎 Buscar preço + modelo_id corretamente
      const result = await db.query(
        `
        SELECT preco, modelo_id
        FROM messages
        WHERE id = $1
          AND cliente_id = $2
          AND tipo = 'conteudo'
        `,
        [message_id, cliente_id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Conteúdo não encontrado" });
      }

      const { preco, modelo_id } = result.rows[0];

      const valorBase = Number(preco);
      const taxaTransacao  = Number((valorBase * 0.10).toFixed(2));
      const taxaPlataforma = Number((valorBase * 0.05).toFixed(2));

      let valorTotal = Number(
        (valorBase + taxaTransacao + taxaPlataforma).toFixed(2)
      );

      if (!valorTotal || valorTotal < 1) {
        valorTotal = 1;
      }

      // Stripe trabalha em centavos
      const amount = Math.round(valorTotal * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "brl",
        automatic_payment_methods: { enabled: true },
        metadata: {
          tipo: "conteudo",
          cliente_id,
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
  express.json(),
  async (req, res) => {
    try {
      const { ref, src } = req.body;

      if (!ref && !src) {
        return res.json({ ok: true });
      }

      let modelo_id = null;

      if (ref && ref.startsWith("modelo_")) {
        const idExtraido = Number(ref.replace("modelo_", ""));

        if (!isNaN(idExtraido) && idExtraido > 0) {

          // 🔎 validar se modelo existe
          const modeloRes = await db.query(
            "SELECT 1 FROM modelos WHERE id = $1",
            [idExtraido]
          );

          if (modeloRes.rowCount > 0) {
            modelo_id = idExtraido;
          }
        }
      }

      await db.query(`
        INSERT INTO acessos_origem (
          modelo_id,
          origem,
          ip,
          user_agent,
          criado_em
        )
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        modelo_id,
        src || "desconhecido",
        req.ip,
        req.headers["user-agent"] || null
      ]);

      res.json({ ok: true });

    } catch (err) {
      console.error("Erro track acesso:", err);
      res.status(500).json({ error: "Erro ao registrar acesso" });
    }
  }
);

//RENOVAÇÃO VIP
// POST /api/vip/cartao/assinatura
app.post("/api/vip/cartao/assinatura", auth, async (req, res) => {
  try {
    const { modelo_id } = req.body;
    const userId = req.user.id;

    if (!modelo_id || isNaN(Number(modelo_id))) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    // 🔁 Converter users.id → cliente_id
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = clienteRes.rows[0].id;

    // 🔎 validar se modelo existe
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE id = $1",
      [modelo_id]
    );

    if (modeloRes.rowCount === 0) {
      return res.status(404).json({ error: "Modelo não encontrado" });
    }

    // 1️⃣ Criar customer Stripe
    const customer = await stripe.customers.create({
      metadata: { cliente_id }
    });

    // 2️⃣ Criar assinatura (incompleta até pagamento)
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: "price_1Ss0jzRtYLPrY4c3clhTxyWD" }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        cliente_id,
        modelo_id
      }
    });

    // ⚠️ NÃO ativar VIP ainda
    // VIP deve ser ativado no webhook quando pagamento for confirmado

    await db.query(`
      INSERT INTO vip_subscriptions (
        cliente_id,
        modelo_id,
        ativo,
        expiration_at,
        recorrente,
        stripe_subscription_id
      )
      VALUES ($1, $2, false, NULL, true, $3)
      ON CONFLICT (cliente_id, modelo_id)
      DO UPDATE SET
        recorrente = true,
        stripe_subscription_id = $3
    `, [
      cliente_id,
      modelo_id,
      subscription.id
    ]);

    res.json({
      clientSecret:
        subscription.latest_invoice.payment_intent.client_secret
    });

  } catch (err) {
    console.error("❌ Erro assinatura cartão:", err);
    res.status(500).json({ error: "Erro ao iniciar assinatura" });
  }
});


// POST /api/vip/cancelar
app.post("/api/vip/cancelar", auth, async (req, res) => {
  try {
    const { modelo_id } = req.body;
    const userId = req.user.id;

    if (!modelo_id || isNaN(Number(modelo_id))) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    // 🔁 Converter users.id → cliente_id
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = clienteRes.rows[0].id;

    const vip = await db.query(`
      SELECT stripe_subscription_id
      FROM vip_subscriptions
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND recorrente = true
      LIMIT 1
    `, [cliente_id, modelo_id]);

    if (vip.rowCount === 0) {
      return res.status(404).json({ error: "Assinatura não encontrada" });
    }

    const subscriptionId = vip.rows[0].stripe_subscription_id;

    // 🔒 cancelar no final do período
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    await db.query(`
      UPDATE vip_subscriptions
      SET recorrente = false
      WHERE cliente_id = $1
        AND modelo_id = $2
    `, [cliente_id, modelo_id]);

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ Erro cancelar VIP:", err);
    res.status(500).json({ error: "Erro ao cancelar assinatura" });
  }
});

//ESQUECI MINHA SENHA
app.post("/api/password/forgot", async (req, res) => {
  const client = await db.connect();

  try {
    let { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email obrigatório" });
    }

    email = email.trim().toLowerCase();

    await client.query("BEGIN");

    // 🔒 nunca revele se o email existe
    const userRes = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (userRes.rowCount === 0) {
      await client.query("COMMIT");
      return res.json({ ok: true });
    }

    const userId = userRes.rows[0].id;

    // 🔥 remover códigos antigos do mesmo usuário
    await client.query(
      "DELETE FROM password_resets WHERE user_id = $1",
      [userId]
    );

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await client.query(
      `
      INSERT INTO password_resets
        (user_id, codigo, expires_at, criado_em)
      VALUES
        ($1, $2, $3, NOW())
      `,
      [userId, codigo, expires]
    );

    await client.query("COMMIT");

    // 📧 Enviar email (fora da transaction)
    await sgMail.send({
      to: email,
      from: process.env.EMAIL_FROM,
      subject: "Recuperação de senha – Velvet",
      html: `
        <p>Seu código de recuperação é:</p>
        <h2>${codigo}</h2>
        <p>Este código expira em 15 minutos.</p>
      `
    });

    return res.json({ ok: true });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERRO PASSWORD FORGOT:", error.response?.body || error);
    return res.status(500).json({ error: "Erro ao enviar código" });
  } finally {
    client.release();
  }
});

//confirmar codigo e nova senha
app.post("/api/password/reset", async (req, res) => {
  const client = await db.connect();

  try {
    let { email, codigo, novaSenha } = req.body;

    if (!email || !codigo || !novaSenha) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({ error: "Senha muito curta" });
    }

    email = email.trim().toLowerCase();

    await client.query("BEGIN");

    const userRes = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (userRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Código inválido" });
    }

    const userId = userRes.rows[0].id;

    const resetRes = await client.query(`
      SELECT id
      FROM password_resets
      WHERE user_id = $1
        AND codigo = $2
        AND usado = false
        AND expires_at > NOW()
      ORDER BY criado_em DESC
      LIMIT 1
    `, [userId, codigo]);

    if (resetRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Código inválido ou expirado" });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await client.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [senhaHash, userId]
    );

    await client.query(
      "UPDATE password_resets SET usado = true WHERE id = $1",
      [resetRes.rows[0].id]
    );

    await client.query("COMMIT");

    return res.json({ success: true });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERRO PASSWORD RESET:", error);
    return res.status(500).json({ error: "Erro ao redefinir senha" });
  } finally {
    client.release();
  }
});


// ===============================
// 📩 FALE CONOSCO / CONTATO
// ===============================
app.post("/api/contato", async (req, res) => {
  try {
    let { nome, email, assunto, mensagem } = req.body;

    if (!nome || !email || !assunto || !mensagem) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    // 🔒 normalizações
    nome = nome.trim().slice(0, 100);
    email = email.trim().toLowerCase().slice(0, 150);
    assunto = assunto.trim().slice(0, 150);
    mensagem = mensagem.trim().slice(0, 2000);

    // 🔒 validação simples de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Email inválido" });
    }

    // 🔒 escape básico contra HTML injection
    const escape = (str) =>
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    await sgMail.send({
      to: process.env.EMAIL_FROM,
      from: process.env.EMAIL_FROM,
      replyTo: email,
      subject: `[Contato] ${escape(assunto)}`,
      html: `
        <h3>Novo contato pelo site</h3>
        <p><b>Nome:</b> ${escape(nome)}</p>
        <p><b>Email:</b> ${escape(email)}</p>
        <p><b>Assunto:</b> ${escape(assunto)}</p>
        <p><b>Mensagem:</b></p>
        <p>${escape(mensagem).replace(/\n/g, "<br>")}</p>
      `
    });

    return res.json({ success: true });

  } catch (error) {
    console.error("❌ Erro contato:", error.response?.body || error);
    return res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});

app.post(
  "/api/chat/modelo/marcar-lido/:cliente_id",
  authModelo,
  async (req, res) => {

    const userId = req.user.id; // users.id
    const cliente_id = Number(req.params.cliente_id);

    if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
      return res.status(400).json({ error: "cliente_id inválido" });
    }

    try {
      // 🔁 users.id → modelo_id
      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [userId]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }

      const modelo_id = modeloRes.rows[0].id;

      const updateRes = await db.query(
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

      return res.json({
        success: true,
        atualizadas: updateRes.rowCount
      });

    } catch (err) {
      console.error("Erro marcar lido:", err);
      return res.status(500).json({ error: "Erro interno" });
    }
  }
);


app.post(
  "/api/chat/modelo/marcar-lido/:cliente_id",
  authModelo,
  async (req, res) => {

    const userId = req.user.id; // users.id
    const cliente_id = Number(req.params.cliente_id);

    if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
      return res.status(400).json({ error: "cliente_id inválido" });
    }

    try {

      // 🔁 users.id → modelo_id
      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [userId]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }

      const modelo_id = modeloRes.rows[0].id;

      const updateRes = await db.query(
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

      return res.json({
        success: true,
        atualizadas: updateRes.rowCount
      });

    } catch (err) {
      console.error("Erro marcar lido:", err);
      return res.status(500).json({ error: "Erro interno" });
    }
  }
);


app.post(
  "/api/verificacao",
  auth,
  uploadVerificacao.fields([
    { name: "doc_frente", maxCount: 1 },
    { name: "doc_verso", maxCount: 1 },
    { name: "selfie", maxCount: 1 }
  ]),
  async (req, res) => {
    try {

      const userId = req.user.id;
      const role = req.user.role;
      const { documento_tipo } = req.body;

      if (!documento_tipo) {
        return res.status(400).json({
          erro: "Tipo de documento obrigatório"
        });
      }

      if (!req.files?.doc_frente || !req.files?.selfie) {
        return res.status(400).json({
          erro: "Documento frente e selfie são obrigatórios"
        });
      }

      const docFrenteUrl = req.files.doc_frente[0].key;
      const docVersoUrl = req.files.doc_verso?.[0]?.key || null;
      const selfieUrl = req.files.selfie[0].key;

      // ===============================
      // 👠 MODELO
      // ===============================
      if (role === "modelo") {

        const modeloRes = await db.query(
          "SELECT id FROM modelos WHERE user_id = $1",
          [userId]
        );

        if (modeloRes.rowCount === 0) {
          return res.status(400).json({ erro: "Modelo não encontrado" });
        }

        const modeloId = modeloRes.rows[0].id;

        await db.query(`
          INSERT INTO modelos_verificacao
            (modelo_id, documento_tipo, doc_frente_url, doc_verso_url, selfie_url, status, criado_em)
          VALUES
            ($1,$2,$3,$4,$5,'em_analise', NOW())
          ON CONFLICT (modelo_id)
          DO UPDATE SET
            documento_tipo = EXCLUDED.documento_tipo,
            doc_frente_url = EXCLUDED.doc_frente_url,
            doc_verso_url = EXCLUDED.doc_verso_url,
            selfie_url = EXCLUDED.selfie_url,
            status = 'em_analise',
            atualizado_em = NOW()
        `, [
          modeloId,
          documento_tipo,
          docFrenteUrl,
          docVersoUrl,
          selfieUrl
        ]);

        return res.json({ ok: true });
      }

      // ===============================
      // 👤 CLIENTE
      // ===============================
      if (role === "cliente") {

        const clienteRes = await db.query(
          "SELECT id FROM clientes WHERE user_id = $1",
          [userId]
        );

        if (clienteRes.rowCount === 0) {
          return res.status(400).json({ erro: "Cliente não encontrado" });
        }

        const clienteId = clienteRes.rows[0].id;

        await db.query(`
          INSERT INTO clientes_verificacao
            (cliente_id, documento_tipo, doc_frente_url, doc_verso_url, selfie_url, status, criado_em)
          VALUES
            ($1,$2,$3,$4,$5,'em_analise', NOW())
          ON CONFLICT (cliente_id)
          DO UPDATE SET
            documento_tipo = EXCLUDED.documento_tipo,
            doc_frente_url = EXCLUDED.doc_frente_url,
            doc_verso_url = EXCLUDED.doc_verso_url,
            selfie_url = EXCLUDED.selfie_url,
            status = 'em_analise',
            atualizado_em = NOW()
        `, [
          clienteId,
          documento_tipo,
          docFrenteUrl,
          docVersoUrl,
          selfieUrl
        ]);

        return res.json({ ok: true });
      }

      // ===============================
      // 🚫 ROLE INVÁLIDA
      // ===============================
      return res.status(403).json({ erro: "Role inválida" });

    } catch (err) {
      console.error("❌ Erro upload verificação:", err);
      return res.status(500).json({ erro: "Erro ao enviar documentos" });
    }
  }
);


app.post(
  "/api/conteudos",
  authModelo,
  uploadB2.single("file"),
  async (req, res) => {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        error: "Arquivo obrigatório"
      });
    }

    try {
      // 🔁 users.id → modelo_id
      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [userId]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({
          error: "Modelo não encontrado"
        });
      }

      const modelo_id = modeloRes.rows[0].id;

      const { mimetype, location } = req.file;

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

      const url = location;
      let thumbnail_url = null;

      // 🔥 GERA THUMB SE FOR VÍDEO
      if (tipo === "video") {
        try {
          thumbnail_url = await gerarThumbnailVideo(url);
        } catch (err) {
          console.error("Erro ao gerar thumbnail:", err);
        }
      }

      const result = await db.query(
        `
        INSERT INTO conteudos (
          modelo_id,
          tipo,
          tipo_conteudo,
          url,
          thumbnail_url,
          criado_em
        )
        VALUES ($1, $2, 'venda', $3, $4, NOW())
        RETURNING
          id,
          modelo_id,
          tipo,
          tipo_conteudo,
          url,
          thumbnail_url,
          criado_em
        `,
        [
          modelo_id,
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
// ===============================
// 🔥 GLOBAL ERROR HANDLER
// ===============================
app.use((err, req, res, next) => {

  const isProduction = process.env.NODE_ENV === "production";

  console.error("🔥 ERRO GLOBAL:", {
    message: err.message,
    path: req.originalUrl,
    method: req.method,
    stack: isProduction ? undefined : err.stack
  });

  // Se erro já tiver status definido
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message
    });
  }

  return res.status(500).json({
    error: "Erro interno do servidor"
  });
});


// ===============================
// ❌ UNHANDLED PROMISE REJECTION
// ===============================
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);

  // Em produção, melhor derrubar o processo
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
});


// ===============================
// ❌ UNCAUGHT EXCEPTION
// ===============================
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);

  // Sempre derrubar processo em erro fatal
  process.exit(1);
});

//ENCERRAR OFERTA MANUALMENTE
app.patch("/api/ofertas/:id/encerrar", authModelo, async (req, res) => {
  try {
    const ofertaId = Number(req.params.id);
    const userId = req.user.id;

    if (!Number.isInteger(ofertaId) || ofertaId <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    // 🔁 users.id → modelo_id
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [userId]
    );

    if (modeloRes.rowCount === 0) {
      return res.status(404).json({ error: "Modelo não encontrado" });
    }

    const modelo_id = modeloRes.rows[0].id;

    const result = await db.query(
      `
      UPDATE ofertas
      SET ativa = false,
          atualizado_em = NOW()
      WHERE id = $1
        AND modelo_id = $2
      RETURNING *
      `,
      [ofertaId, modelo_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Oferta não encontrada ou não pertence ao modelo"
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro encerrar oferta:", err);
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