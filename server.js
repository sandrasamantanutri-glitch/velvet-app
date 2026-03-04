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


const os = require("os");
const { exec } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");

app.set("trust proxy", 1);
const server = http.createServer(app);
const multer = require("multer");
const onlineModelos = new Map();
const onlineClientes = new Map();
const AWS = require("aws-sdk");
const multerS3 = require("multer-s3");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ffmpegPath = require("ffmpeg-static");
const authCliente = require("./middleware/authCliente");
const authModelo = require("./middleware/authModelo");
const auth = require("./middleware/auth");
const authAdmin = require("./middleware/authAdmin");
const crypto = require("crypto");
const axios = require("axios");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const { enviarEmailValidacao } = require("./email");

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
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024 
  }
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
      return res.status(400).send("Invalid signature");
    }

    if (
      event.type !== "payment_intent.succeeded" &&
      event.type !== "charge.dispute.created"
    ) {
      return res.status(200).send("ok");
    }

    const client = await db.connect();
    let dadosParaEmitir = null;

    try {

      await client.query("BEGIN");

      /* ================== IDEMPOTÊNCIA ================== */

      const jaProcessado = await client.query(
        "SELECT 1 FROM stripe_events WHERE id=$1 FOR UPDATE",
        [event.id]
      );

      if (jaProcessado.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      await client.query(
        "INSERT INTO stripe_events (id,type) VALUES ($1,$2)",
        [event.id, event.type]
      );

      /* ================== PAGAMENTO SUCESSO ================== */

      if (event.type === "payment_intent.succeeded") {

        const pi = event.data.object;
        const metadata = pi.metadata || {};
        const tipo = metadata.tipo;

        const cliente_id = Number(metadata.cliente_id);
        const modelo_id  = Number(metadata.modelo_id);
        const valorPago  = pi.amount / 100;

        const valorMeta = Number(metadata.valor_total || 0);

        if (valorMeta && valorPago !== valorMeta) {
          console.log("🚨 Valor divergente Stripe");
          await client.query("ROLLBACK");
          return res.status(200).send("ok");
        }

  /* ================== VIP CARTÃO ================== */
if (tipo === "vip") {
  const expiration = new Date();
  expiration.setMonth(expiration.getMonth() + 1);

  const valorPago = pi.amount / 100;

  const taxaExtra =
    Number(metadata.taxa_transacao || 0) +
    Number(metadata.taxa_plataforma || 0);

  const valorBase = Number((valorPago - taxaExtra).toFixed(2));

  const valores = await calcularValores({
    modelo_id,
    valor_bruto: valorBase,
    taxa_gateway: 0
  });

  await client.query(`
    INSERT INTO vip_subscriptions (
  cliente_id, modelo_id, ativo,
  created_at, updated_at, expiration_at,
  valor_assinatura, taxa_transacao,
  taxa_plataforma, valor_total,
  recorrente, gateway_subscription_id
)
VALUES ($1,$2,true,NOW(),NOW(),$3,$4,$5,$6,$7,false,$8)
ON CONFLICT (cliente_id,modelo_id)
DO UPDATE SET
  ativo=true,
  expiration_at=$3,
  updated_at=NOW(),
  valor_assinatura=$4,
  taxa_transacao=$5,
  taxa_plataforma=$6,
  valor_total=$7,
  recorrente=false,
  gateway_subscription_id=$8
  `,[
    cliente_id,
    modelo_id,
    expiration,
    valorBase,
    Number(metadata.taxa_transacao || 0),
    Number(metadata.taxa_plataforma || 0),
    valorPago,
    pi.id
  ]);

  await client.query(`
    INSERT INTO transacoes_agency (
      modelo_id,
      cliente_id,
      tipo,
      valor_bruto,
      valor_modelo,
      agency_fee,
      velvet_fee,
      taxa_gateway,
      status,
      created_at,
      aceitou_termos,
      aceite_ip,
      aceite_data
    )
    VALUES (
      $1,$2,'assinatura',
      $3,$4,$5,$6,$7,
      'pago',NOW(),true,$8,NOW()
    )
  `,[
    modelo_id,
    cliente_id,
    valorBase,
    valores.valor_modelo,
    valores.agency_fee,
    valores.velvet_fee,
    taxaExtra,
    metadata.aceite_ip || null
  ]);

  const mensagem = await enviarBoasVindasVip({
    client,
    cliente_id,
    modelo_id
  });

  dadosParaEmitir = {
    tipo: "vip",
    cliente_id,
    modelo_id,
    mensagemBoasVindas: mensagem
  };
}

/* ================== CONTEÚDO CARTÃO ================== */
if (tipo === "conteudo_cartao") {

  const message_id = Number(metadata.message_id);

  const valorPago = pi.amount / 100;

  const taxaExtra =
    Number(metadata.taxa_transacao || 0) +
    Number(metadata.taxa_plataforma || 0);

  const valorBase = Number((valorPago - taxaExtra).toFixed(2));

  const valores = await calcularValores({
    modelo_id,
    valor_bruto: valorBase,
    taxa_gateway: 0
  });

  await client.query(`
    UPDATE pagamentos_cartao
    SET status='pago'
    WHERE stripe_payment_intent_id=$1
  `,[pi.id]);

  await client.query(`
    UPDATE pagamento_tentativas
    SET status='pago'
    WHERE payment_intent_id=$1
  `,[pi.id]);

  await client.query(`
    INSERT INTO conteudo_pacotes (
      modelo_id, cliente_id,
      preco, valor_base,
      taxa_transacao, taxa_plataforma,
      valor_total, status,
      payment_id, metodo_pagamento,
      pago_em, message_id
    )
    VALUES (
      $1,$2,$3,$3,$4,$5,$6,
      'pago',$7,'cartao',NOW(),$8
    )
    ON CONFLICT DO NOTHING
  `,[
    modelo_id,
    cliente_id,
    valorBase,
    Number(metadata.taxa_transacao || 0),
    Number(metadata.taxa_plataforma || 0),
    valorPago,
    pi.id,
    message_id
  ]);

  await client.query(`
    INSERT INTO transacoes_agency (
      modelo_id,
      cliente_id,
      tipo,
      valor_bruto,
      valor_modelo,
      agency_fee,
      velvet_fee,
      taxa_gateway,
      status,
      created_at,
      aceitou_termos,
      aceite_ip,
      aceite_data
    )
    VALUES (
      $1,$2,'midia',
      $3,$4,$5,$6,$7,
      'pago',NOW(),true,$8,NOW()
    )
  `,[
    modelo_id,
    cliente_id,
    valorBase,
    valores.valor_modelo,
    valores.agency_fee,
    valores.velvet_fee,
    taxaExtra,
    metadata.aceite_ip || null
  ]);

  dadosParaEmitir = {
    tipo: "conteudo_cartao",
    cliente_id,
    modelo_id,
    message_id
  };
}
}

/* ================== CHARGEBACK ================== */

      if (event.type === "charge.dispute.created") {

        const dispute = event.data.object;
        const pi = await stripe.paymentIntents.retrieve(dispute.payment_intent);
        const metadata = pi.metadata || {};

        const cliente_id = Number(metadata.cliente_id);
        const cpf = metadata.cpf;

        if (cliente_id) {
          await client.query(
            "UPDATE clientes SET bloqueado=true WHERE id=$1",
            [cliente_id]
          );
        }

        if (cpf) {
          await client.query(
            `INSERT INTO cpfs_bloqueados (cpf,motivo)
             VALUES ($1,'Chargeback Stripe')
             ON CONFLICT DO NOTHING`,
            [cpf]
          );
        }
      }

      await client.query("COMMIT");

/* ================== EMISSÃO SOCKET ================== */

      if (dadosParaEmitir?.tipo === "vip") {

        const socketId = onlineClientes[dadosParaEmitir.cliente_id];

        if (socketId) {
          io.to(socketId).emit("vipAtivado", {
            modelo_id: dadosParaEmitir.modelo_id
          });
          if (dadosParaEmitir.mensagemBoasVindas) {
      io.to(socketId).emit("newMessage", dadosParaEmitir.mensagemBoasVindas);
    }
  }
}

      if (dadosParaEmitir?.tipo === "conteudo_cartao") {

        const socketId = onlineClientes[dadosParaEmitir.cliente_id];

        if (socketId) {
          io.to(socketId).emit("conteudoVisto", {
            message_id: dadosParaEmitir.message_id
          });
        }
      }

      return res.status(200).send("ok");

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("🔥 ERRO WEBHOOK STRIPE:", err);
      return res.status(500).send("erro");

    } finally {
      client.release();
    }
  }
);

app.post(
  "/webhook/pagarme",
  express.raw({ type: "*/*" }),
  async (req, res) => {

    let event;

    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      console.log("🚨 Body inválido");
      return res.status(400).send("invalid");
    }

    console.log("🔥 WEBHOOK PAGARME:", event.type);

    /* =====================================================
       PROCESSAR APENAS charge.paid
    ===================================================== */

    if (event.type !== "charge.paid") {
      return res.status(200).send("ok");
    }

    const eventId = event.id;
    const charge = event.data;
    const metadata = charge.metadata || {};
    const orderId = charge.order?.id;
    const valorPago = charge.amount / 100;
    const valorTotalMeta = Number(metadata.valor_total || 0);

    // 🔎 DEBUG AQUI
console.log("============== DEBUG WEBHOOK ==============");
console.log("EVENT ID:", eventId);
console.log("ORDER ID:", orderId);
console.log("VALOR PAGO:", valorPago);
console.log("METADATA:", metadata);
console.log("TIPO:", metadata.tipo);
console.log("============================================");

    if (!orderId) {
      return res.status(200).send("ok");
    }

    /* =====================================================
       1️⃣ IDEMPOTÊNCIA GLOBAL
    ===================================================== */

    const jaProcessado = await db.query(
      "SELECT 1 FROM pagarme_events WHERE id=$1",
      [eventId]
    );

    if (jaProcessado.rowCount > 0) {
      return res.status(200).send("ok");
    }

    await db.query(
      "INSERT INTO pagarme_events (id,type) VALUES ($1,$2)",
      [eventId, event.type]
    );

    const client = await db.connect();

    let dadosParaEmitir = null;

    try {
      await client.query("BEGIN");

      /* =====================================================
         2️⃣ LOCK PAGAMENTO
      ===================================================== */

      const pagamentoRes = await client.query(`
        SELECT *
        FROM pagamentos_pix
        WHERE pagarme_order_id = $1
        FOR UPDATE
      `,[orderId]);

      if (!pagamentoRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const pagamento = pagamentoRes.rows[0];

      if (pagamento.status === "pago") {
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

  const {
  cliente_id,
  modelo_id,
  valor,
  message_id
} = pagamento;

/* =====================================================
3️⃣ VALIDAR VALOR
===================================================== */
const valorComparacao = valorTotalMeta || Number(charge.amount) / 100;

if (Number(valorComparacao) !== Number(valor)) {
  console.log("🚨 Valor divergente webhook");
  await client.query("ROLLBACK");
  return res.status(200).send("ok");
}
//=====================================================
// MIDIA
if (metadata.tipo === "conteudo_pix") {

  const valorBase = Number(metadata.valor_base || 0);
  const taxaTransacao = Number(metadata.taxa_transacao || 0);
  const taxaPlataforma = Number(metadata.taxa_plataforma || 0);

  if (!valorBase || !valorTotalMeta) {
    console.log("🚨 Metadata incompleto em conteudo_pix");
    await client.query("ROLLBACK");
    return res.status(200).send("ok");
  }

  const taxaExtra = taxaTransacao + taxaPlataforma;

  const valores = await calcularValores({
    modelo_id,
    valor_bruto: valorBase,
    taxa_gateway: 0
  });

  // 🔹 Registro pacote
  await client.query(`
    INSERT INTO conteudo_pacotes (
      message_id,
      cliente_id,
      modelo_id,
      preco,
      valor_base,
      valor_total,
      status,
      metodo_pagamento,
      pago_em
    )
    VALUES ($1,$2,$3,$4,$4,$5,'pago','pix',NOW())
    ON CONFLICT (message_id,cliente_id)
     DO UPDATE SET
    status = 'pago',
    metodo_pagamento = 'pix',
    pago_em = NOW(),
    preco = EXCLUDED.preco,
    valor_base = EXCLUDED.valor_base,
    valor_total = EXCLUDED.valor_total
  `,[
    message_id,
    cliente_id,
    modelo_id,
    valorBase,
    valorPago
  ]);

  // 🔹 Registro financeiro oficial
  await client.query(`
    INSERT INTO transacoes_agency (
      modelo_id,
      cliente_id,
      tipo,
      valor_bruto,
      valor_modelo,
      agency_fee,
      velvet_fee,
      taxa_gateway,
      status,
      created_at,
      aceitou_termos,
      aceite_ip,
      aceite_data
    )
    VALUES (
      $1,$2,'midia',
      $3,$4,$5,$6,$7,
      'pago',NOW(),true,$8,NOW()
    )
  `,[
    modelo_id,
    cliente_id,
    valorBase,
    valores.valor_modelo,
    valores.agency_fee,
    valores.velvet_fee,
    taxaExtra,
    metadata.aceite_ip || null
  ]);

const upd = await client.query(`
  UPDATE messages
  SET visto = true,
      updated_at = NOW()
  WHERE id = $1
    AND cliente_id = $2
    AND modelo_id = $3
  RETURNING id
`, [message_id, cliente_id, modelo_id]);

if (!upd.rowCount) {
  console.log("🚨 Não atualizou messages.visto — IDs não bateram", {
    message_id,
    cliente_id,
    modelo_id
  });
}

  dadosParaEmitir = {
    tipo: "conteudo_pix",
    cliente_id,
    modelo_id,
    conteudo_id: message_id
  };
}


if (metadata.tipo === "vip") {

  const expiration = new Date();
  expiration.setMonth(expiration.getMonth() + 1);

  const valorPago = charge.amount / 100;

  const taxaExtra =
    Number(metadata.taxa_transacao || 0) +
    Number(metadata.taxa_plataforma || 0);

  const valorBase = Number((valorPago - taxaExtra).toFixed(2));

  const valores = await calcularValores({
    modelo_id,
    valor_bruto: valorBase,
    taxa_gateway: 0
  });

  await client.query(`

    INSERT INTO vip_subscriptions (
  cliente_id,
  modelo_id,
  ativo,
  created_at,
  updated_at,
  expiration_at,
  valor_assinatura,
  taxa_transacao,
  taxa_plataforma,
  valor_total,
  recorrente,
  gateway_subscription_id
)
VALUES (
  $1,$2,true,
  NOW(),NOW(),
  $3,$4,$5,$6,$7,
  false,$8
)
ON CONFLICT (cliente_id,modelo_id)
DO UPDATE SET
  ativo=true,
  expiration_at=$3,
  updated_at=NOW(),
  valor_assinatura=$4,
  taxa_transacao=$5,
  taxa_plataforma=$6,
  valor_total=$7,
  recorrente=false,
  gateway_subscription_id=$8

  `,[
    cliente_id,
    modelo_id,
    expiration,
    valorBase,
    Number(metadata.taxa_transacao || 0),
    Number(metadata.taxa_plataforma || 0),
    valorPago,
    orderId
  ]);

  await client.query(`
    INSERT INTO transacoes_agency (
      modelo_id,
      cliente_id,
      tipo,
      valor_bruto,
      valor_modelo,
      agency_fee,
      velvet_fee,
      taxa_gateway,
      status,
      created_at,
      aceitou_termos,
      aceite_ip,
      aceite_data
    )
    VALUES (
      $1,$2,'assinatura',
      $3,$4,$5,$6,$7,
      'pago',NOW(),true,$8,NOW()
    )
  `,[
    modelo_id,
    cliente_id,
    valorBase,
    valores.valor_modelo,
    valores.agency_fee,
    valores.velvet_fee,
    taxaExtra,
    metadata.aceite_ip || null
  ]);

  const mensagem = await enviarBoasVindasVip({
    client,
    cliente_id,
    modelo_id
  });

  dadosParaEmitir = {
    tipo: "vip",
    cliente_id,
    modelo_id,
    mensagemBoasVindas: mensagem
  };
}
/* =====================================================
MARCAR PAGAMENTO COMO PAGO
===================================================== */

      await client.query(`
        UPDATE pagamentos_pix
        SET status='pago',
            pago_em=NOW()
        WHERE id=$1
      `,[pagamento.id]);

      console.log("Pagamento encontrado:", pagamento);

      await client.query("COMMIT");

console.log("✅ PAGAMENTO FINALIZADO");
console.log("Dados para emitir:", dadosParaEmitir);

if (dadosParaEmitir) {

  // 🔥 VIP PIX
  if (dadosParaEmitir.tipo === "vip") {

    const socketId = onlineClientes[dadosParaEmitir.cliente_id];

    if (socketId) {
      io.to(socketId).emit("vipAtivado", {
        modelo_id: dadosParaEmitir.modelo_id
      });
    }

    if (dadosParaEmitir.mensagemBoasVindas) {
  io.to(socketId).emit("newMessage", dadosParaEmitir.mensagemBoasVindas);
}  
console.log("📡 VIP ativado enviado para cliente:", dadosParaEmitir.cliente_id);

  }

  // CONTEÚDO PIX
  if (dadosParaEmitir.tipo === "conteudo_pix") {

    const sala = `chat_${dadosParaEmitir.cliente_id}_${dadosParaEmitir.modelo_id}`;

    io.to(sala).emit("conteudoVisto", {
      message_id: Number(dadosParaEmitir.conteudo_id)
    });

    console.log("📡 Evento conteudoVisto enviado para sala:", sala);
  }
}

return res.status(200).send("ok");

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("🔥 ERRO WEBHOOK COMPLETO:", err);
      return res.status(500).send("erro");

    } finally {
      client.release();
    }
  }
);


app.use(express.json());
const { router: servercontentRouter, calcularValores } = require('./servercontent');
app.use("/api", servercontentRouter);

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin-pages")));
app.use("/icons", express.static(path.join(__dirname, "icons")));
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

function gerarHash(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

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
      AND ativo = TRUE   -- 🔥 FILTRO QUE FALTAVA
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

function gerarUrlPrivada(key){
  return s3Privado.getSignedUrl("getObject", {
    Bucket: process.env.B2_BUCKET_PRIVATE, 
    Key: key,
    Expires: 60 * 5 
  });
}

async function gerarThumbnailVideo(videoBuffer, modelo_id) {

  const timestamp = Date.now();
  const tmpDir = os.tmpdir();

  const videoPath = path.join(tmpDir, `video-${timestamp}.tmp`);
  const thumbPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);

  try {

    // 1️⃣ Salva o buffer direto (sem baixar do B2)
    fs.writeFileSync(videoPath, videoBuffer);

    // 2️⃣ Gera thumbnail
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

    // 3️⃣ Upload da thumb para o B2
    const thumbBuffer = fs.readFileSync(thumbPath);

    const upload = await s3.upload({
      Bucket: process.env.B2_BUCKET,
      Key: `velvet/modelos/${modelo_id}/thumbs/${timestamp}.jpg`,
      Body: thumbBuffer,
      ContentType: "image/jpeg",
      ACL: "public-read"
    }).promise();

    return upload.Location;

  } finally {
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }
}

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
  uploadB2.array("file", 10),
  async (req, res) => {
    try {

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "Arquivo não enviado" });
      }

      const modeloRes = await db.query(
        `SELECT id FROM modelos WHERE user_id = $1`,
        [req.user.id]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }

      const modelo_id = modeloRes.rows[0].id;

      const { tipo_conteudo, preco, descricao } = req.body;

      for (const file of req.files) {

        const mimetype = file.mimetype || "";

        let tipo;
        if (mimetype.startsWith("image/")) {
          tipo = "imagem";
        } else if (mimetype.startsWith("video/")) {
          tipo = "video";
        } else {
          continue;
        }

        const caminho = `velvet/modelos/${req.user.id}/${Date.now()}-${file.originalname}`;

        // 🚀 Upload manual igual /api/conteudos
        const uploadResult = await s3.upload({
          Bucket: process.env.B2_BUCKET,
          Key: caminho,
          Body: file.buffer,
          ContentType: mimetype,
          ACL: "public-read"
        }).promise();

        const publicUrl = uploadResult.Location;

        let thumbnailUrl = null;

        if (tipo === "video") {
          try {
            thumbnailUrl = await gerarThumbnailVideo(file.buffer, modelo_id);
          } catch (err) {
            console.error("Erro ao gerar thumbnail:", err);
          }
        }

        const hash = gerarHash(file.buffer);

        await db.query(
          `
         INSERT INTO conteudos
  (modelo_id, url, tipo, tipo_conteudo, preco, descricao, thumbnail_url, hash, tamanho)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            modelo_id,
            publicUrl,
            tipo,
            tipo_conteudo || "feed",
            preco ? Number(preco) : null,
            descricao || null,
            thumbnailUrl,
            hash,
            file.size
          ]
        );
      }

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

  const client = await db.connect();
  let cliente_id;

  try {

    await client.query("BEGIN");

const { modelo_id, cpf, aceitou_termos, fingerprint, apenas_intent } = req.body;
    const userId = req.user.id;

    /* =====================================================
       🔎 VALIDAÇÕES INICIAIS
    ===================================================== */

    if (!modelo_id || !Number.isInteger(Number(modelo_id))) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "modelo_id inválido" });
    }

if (!apenas_intent) {

  if (!aceitou_termos) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: "Você precisa aceitar os termos." });
  }

  if (!cpf || cpf.length < 11) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: "CPF obrigatório." });
  }

  if (!fingerprint) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: "Fingerprint obrigatório." });
  }

}
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    /* =====================================================
       🔒 BLOQUEIOS
    ===================================================== */

    const ipBloqueado = await client.query(
      "SELECT 1 FROM ips_bloqueados WHERE ip = $1",
      [ip]
    );

    if (ipBloqueado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "IP bloqueado." });
    }

    const clienteRes = await client.query(
      "SELECT id, bloqueado FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    cliente_id = clienteRes.rows[0].id;

    if (clienteRes.rows[0].bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const cpfBloqueado = await client.query(
      "SELECT 1 FROM cpfs_bloqueados WHERE cpf = $1",
      [cpf]
    );

    if (cpfBloqueado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "CPF bloqueado." });
    }

    /* =====================================================
       🔒 BLOQUEIO POR RECUSAS
    ===================================================== */

    const tentativas = await client.query(`
      SELECT COUNT(*) FROM pagamento_tentativas
      WHERE fingerprint_pagamento = $1
      AND status = 'recusado'
      AND created_at > NOW() - INTERVAL '24 hours'
    `, [fingerprint]);

    if (Number(tentativas.rows[0].count) >= 2) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "Forma de pagamento bloqueada por múltiplas recusas."
      });
    }

    /* =====================================================
       🔄 ATUALIZAR CLIENTE
    ===================================================== */

    await client.query(
      "UPDATE clientes SET cpf = $1, ultimo_ip = $2 WHERE id = $3",
      [cpf, ip, cliente_id]
    );

    /* =====================================================
       🔥 BUSCAR PLANO
    ===================================================== */

    const planoRes = await client.query(`
      SELECT valor_mensal
      FROM modelos_planos
      WHERE modelo_id = $1
      LIMIT 1
    `, [modelo_id]);

    if (!planoRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Plano VIP não definido" });
    }

    let valorBase = Number(planoRes.rows[0].valor_mensal);

    /* =====================================================
       🔥 OFERTA
    ===================================================== */

    const ofertaRes = await client.query(`
      SELECT id, desconto_percentual, valor_promocional
      FROM ofertas
      WHERE modelo_id = $1
        AND ativa = true
        AND (data_inicio IS NULL OR data_inicio <= NOW())
        AND (data_fim IS NULL OR data_fim >= NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `, [modelo_id]);

    let valorAssinatura = valorBase;
    let oferta_id = null;

    if (ofertaRes.rowCount) {

      oferta_id = ofertaRes.rows[0].id;

      if (ofertaRes.rows[0].valor_promocional) {
        valorAssinatura = Number(ofertaRes.rows[0].valor_promocional);
      } else if (ofertaRes.rows[0].desconto_percentual) {
        const desconto = Number(ofertaRes.rows[0].desconto_percentual);
        valorAssinatura =
          valorBase - (valorBase * desconto / 100);
      }
    }

    valorAssinatura = Number(valorAssinatura.toFixed(2));

    if (!valorAssinatura || valorAssinatura <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor inválido" });
    }

/* =====================================================
   💰 CÁLCULO CONSISTENTE
===================================================== */

const valorCentavos = Math.round(valorAssinatura * 100);

const taxaTransacaoCentavos  = Math.round(valorCentavos * 0.10);
const taxaPlataformaCentavos = Math.round(valorCentavos * 0.05);

const amount =
  valorCentavos +
  taxaTransacaoCentavos +
  taxaPlataformaCentavos;

const taxaTransacao  = (taxaTransacaoCentavos / 100);
const taxaPlataforma = (taxaPlataformaCentavos / 100);
const valorTotal     = (amount / 100);

/* =====================================================
   💳 CRIAR PAYMENT INTENT
===================================================== */

const paymentIntent = await stripe.paymentIntents.create({
  amount,
  currency: "brl",
  automatic_payment_methods: { enabled: true },
  metadata: {
    tipo: "vip",
    cliente_id: String(cliente_id),
    modelo_id: String(modelo_id),
    oferta_id: oferta_id ? String(oferta_id) : "",
    valor_assinatura: String(valorAssinatura),   
    taxa_transacao: String(taxaTransacao),
    taxa_plataforma: String(taxaPlataforma),
    valor_total: String(valorTotal),             
    cpf: cpf || "",
    aceite_ip: ip || ""
  }
});

await client.query(`
  INSERT INTO pagamento_tentativas
  (cliente_id, metodo, fingerprint_pagamento, status, payment_intent_id)
  VALUES ($1,'cartao',$2,'pendente',$3)
`, [cliente_id, fingerprint, paymentIntent.id]);
    await client.query("COMMIT");

    return res.json({
      clientSecret: paymentIntent.client_secret
    });

  } catch (err) {

    await client.query("ROLLBACK");

    console.error("❌ Erro Stripe VIP:", err);

    if (err.type === "StripeCardError" && cliente_id) {

      await client.query(`
        INSERT INTO pagamento_tentativas
        (cliente_id, metodo, fingerprint_pagamento, status)
        VALUES ($1,'cartao',$2,'recusado')
      `,[cliente_id, req.body.fingerprint]);

      return res.status(400).json({
        error: "Pagamento não autorizado."
      });
    }

    return res.status(500).json({
      error: "Erro ao criar pagamento com cartão"
    });

  } finally {
    client.release();
  }
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
  transports: ["websocket", "polling"],

  pingInterval: 25000,  
  pingTimeout: 60000     
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

async function enviarBoasVindasVip({
  client,
  cliente_id,
  modelo_id
}) {
  const existeMsg = await client.query(`
    SELECT 1
    FROM messages
    WHERE cliente_id = $1
      AND modelo_id = $2
    LIMIT 1
  `, [cliente_id, modelo_id]);

  if (existeMsg.rowCount === 0) {

    const textoBoasVindas = `Bem-vindo! Como você chama? ❤️‍🔥`;

    const msgRes = await client.query(`
      INSERT INTO messages
        (cliente_id, modelo_id, sender, tipo, text, created_at)
      VALUES
        ($1, $2, 'modelo', 'texto', $3, NOW())
      RETURNING *
    `, [cliente_id, modelo_id, textoBoasVindas]);

    const mensagem = msgRes.rows[0];

    await client.query(`
      INSERT INTO unread (cliente_id, modelo_id, unread_for, has_unread)
      VALUES ($1, $2, 'cliente', true)
      ON CONFLICT (cliente_id, modelo_id)
      DO UPDATE SET has_unread = true
    `, [cliente_id, modelo_id]);

    return mensagem;
  }

  return null;
}

function gerarCpfValido() {

  const gerarDigito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += base[i] * ((base.length + 1) - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const base = Array.from({ length: 9 }, () =>
    Math.floor(Math.random() * 9)
  );

  const d1 = gerarDigito(base);
  const d2 = gerarDigito([...base, d1]);

  return [...base, d1, d2].join("");
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
    [socket.user.id]
  );

  if (result.rowCount === 0) return;

  const modeloIdReal = result.rows[0].id;

  socket.modelo_id = modeloIdReal;

  // 🔥 salva como online
  if (!onlineModelos.has(modeloIdReal)) {
  onlineModelos.set(modeloIdReal, new Set());
}

onlineModelos.get(modeloIdReal).add(socket.id);

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
  visto: false,
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
        AND deletada IS NOT TRUE
      ORDER BY created_at ASC
      `,
      [cliente_id, modelo_id]
    );

// ===================================
// 4️⃣ TRATAR MENSAGENS DE CONTEÚDO (OTIMIZADO)
// ===================================
const mensagensConteudo = result.rows.filter(m => m.tipo === "conteudo");
const messageIds = mensagensConteudo.map(m => m.id);

if (messageIds.length > 0) {

  // buscar todas mídias de uma vez
  const midiasRes = await db.query(
    `
    SELECT
      mc.message_id,
      c.url,
      c.thumbnail_url,
      c.tipo AS tipo_media
    FROM messages_conteudos mc
    JOIN conteudos c ON c.id = mc.conteudo_id
    WHERE mc.message_id = ANY($1)
    `,
    [messageIds]
  );

  // organizar por message_id
  const mapaMidias = {};

  for (const row of midiasRes.rows) {
    if (!mapaMidias[row.message_id]) {
      mapaMidias[row.message_id] = [];
    }

    mapaMidias[row.message_id].push({
      url: row.url,
      thumbnail_url: row.thumbnail_url,
      tipo_media: row.tipo_media
    });
  }

  // buscar todos pagamentos de uma vez (OTIMIZAÇÃO)
  const pagosRes = await db.query(`
    SELECT message_id
    FROM conteudo_pacotes
    WHERE message_id = ANY($1)
      AND cliente_id = $2
      AND status = 'pago'
  `, [messageIds, cliente_id]);

  const pagosSet = new Set(
    pagosRes.rows.map(r => r.message_id)
  );

 // 5️⃣ aplicar nas mensagens
for (const msg of mensagensConteudo) {

  const midias = mapaMidias[msg.id] || [];

  msg.midias = midias;
  msg.quantidade = midias.length;

  if (Number(msg.preco) > 0) {

    const pago = pagosSet.has(msg.id);

    msg.liberado = pago;
    msg.bloqueado = !pago;

  } else {
    msg.liberado = true;
    msg.bloqueado = false;
  }
}
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

    let precoNum = Number(preco);

if (!Number.isFinite(precoNum) || precoNum < 0) {
  precoNum = 0;
}

precoNum = Number(precoNum.toFixed(2));

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

// 5️⃣ ASSOCIAR MÍDIAS (BATCH INSERT)
const values = idsValidos
  .map((_, i) => `($1, $${i + 2})`)
  .join(",");

await db.query(
  `
  INSERT INTO messages_conteudos (message_id, conteudo_id)
  VALUES ${values}
  `,
  [message.id, ...idsValidos]
);

    // 6️⃣ BUSCAR MÍDIAS
    const midiasRes = await db.query(
      `
      SELECT url, thumbnail_url, tipo AS tipo_media
FROM conteudos
WHERE id = ANY($1)
ORDER BY array_position($1, id)
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

    const messageId = Number(id);

if (
  !Number.isInteger(messageId) ||
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
      [messageId]
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
      [text.trim(), messageId, modeloIdReal]
    );

    const sala = `chat_${cliente_id}_${modelo_id}`;

    io.to(sala).emit("mensagemEditada", {
  id: messageId,
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

    const messageId = Number(id);
if (!Number.isInteger(messageId)) return;


 
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

   const del = await db.query(
  `
  UPDATE messages
  SET deletada = true
  WHERE id = $1
    AND modelo_id = $2
    AND sender = 'modelo'
  `,
  [messageId, modeloIdReal]
);

    console.log("DELETE rows:", del.rowCount);


    const sala = `chat_${cliente_id}_${modelo_id}`;

    io.to(sala).emit("mensagemExcluida", { id });

  } catch (err) {
    console.error("Erro ao excluir mensagem:", err);
  }
});


socket.on("loginCliente", async () => {
  try {

    if (!socket.user || socket.user.role !== "cliente") {
      return socket.disconnect();
    }

    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [socket.user.id]
    );

    if (!clienteRes.rowCount) return;

    const clienteIdReal = clienteRes.rows[0].id;

    socket.cliente_id = clienteIdReal;

    // 🔥 salva como online
onlineClientes.set(clienteIdReal, new Set());
onlineClientes.get(clienteIdReal).add(socket.id);

    console.log("🟢 Cliente online:", clienteIdReal, socket.id);

    // 🔥 marca como online (last_seen = NULL)
    await db.query(
      `UPDATE clientes SET last_seen = NULL WHERE id = $1`,
      [clienteIdReal]
    );

  } catch (err) {
    console.error("Erro atualizar last_seen (online):", err);
  }
});

socket.on("disconnect", async () => {
  console.log("🔴 Socket desconectado:", socket.id);

  // 🔵 CLIENTE
  if (socket.cliente_id) {

    const set = onlineClientes.get(socket.cliente_id);

    if (set) {
      set.delete(socket.id);

      // 🔥 Só fica offline se NÃO houver mais sockets
      if (set.size === 0) {
        onlineClientes.delete(socket.cliente_id);

        await db.query(
          `UPDATE clientes SET last_seen = NOW() WHERE id = $1`,
          [socket.cliente_id]
        );

        console.log("⚫ Cliente offline:", socket.cliente_id);
      }
    }
  }

  // 🟣 MODELO
  if (socket.modelo_id) {

    const set = onlineModelos.get(socket.modelo_id);

    if (set) {
      set.delete(socket.id);

      if (set.size === 0) {
        onlineModelos.delete(socket.modelo_id);

        await db.query(
          `UPDATE modelos SET last_seen = NOW() WHERE id = $1`,
          [socket.modelo_id]
        );

        console.log("⚫ Modelo offline:", socket.modelo_id);
      }
    }
  }
});

socket.on("pingCheck", () => {
  socket.emit("pongCheck");
});

});

// ===============================
//ROTA GET
// ===============================
//VALOR ASISNATURA
app.get("/api/modelo/planos/me", auth, authModelo, async (req, res) => {
  try {

    const plano = await db.query(
      `SELECT
      COALESCE(NULLIF(valor_mensal, 0), 20.00) AS valor_mensal
      FROM modelos_planos 
      WHERE modelo_id = $1`,
      [req.modelo_id]
    );

     if (!result.rowCount) {
      return res.json({
        valor_mensal: 20
      });
    }
    
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
app.get("/api/modelo/me/vip-count", auth, async (req, res) => {
  try {
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [req.user.id]
    );

    if (!modeloRes.rows.length) {
      return res.json({ total: 0 });
    }

    const modelo_id = modeloRes.rows[0].id;

const result = await db.query(
  `
  SELECT COUNT(*)::int AS total
  FROM vip_subscriptions
  WHERE modelo_id = $1
    AND ativo = true
    AND created_at + INTERVAL '30 days' > NOW()
  `,
  [modelo_id]
);

    res.json({ total: result.rows[0]?.total || 0 });

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

    const ofertaRes = await db.query(
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

     if (ofertaRes.rowCount) {
      return res.json({
        ativa: true,
        oferta: ofertaRes.rows[0]
      });
    }

    // ===============================
    // 🔥 2️⃣ NÃO TEM OFERTA → BUSCAR PREÇO BASE
    // ===============================

    const precoRes = await db.query(`
      SELECT
        COALESCE(
          NULLIF(mp.valor_mensal, 0),
          NULLIF(md.vip_preco, 0),
          20.00
        ) AS valor_base
      FROM modelos m
      LEFT JOIN modelos_planos mp
        ON mp.modelo_id = m.id
      LEFT JOIN modelos_dados md
        ON md.modelo_id = m.id
      WHERE m.id = $1
      LIMIT 1
    `, [modelo_id]);

    const valorBase =
      precoRes.rowCount
        ? Number(precoRes.rows[0].valor_base)
        : 20.00;

    return res.json({
      ativa: false,
      valor_base: valorBase
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
    const feed = await buscarFeedCompletoPorModeloId(modelo_id);
    return res.json(feed);
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

    COALESCE(v.total_vips, 0) AS total_vips,

    -- Data da última aprovação
    ver.criado_em AS aprovado_em,

    -- Define se é NEW (últimos 7 dias)
    CASE 
      WHEN ver.criado_em >= NOW() - INTERVAL '7 days' 
      THEN true 
      ELSE false 
    END AS is_new

  FROM modelos m

  JOIN LATERAL (
    SELECT status, criado_em
    FROM modelos_verificacao
    WHERE modelo_id = m.id
    ORDER BY verificado_em DESC 
    LIMIT 1
  ) ver ON true

  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_vips
    FROM vip_subscriptions
    WHERE modelo_id = m.id
      AND ativo = true
      AND expiration_at > NOW()
  ) v ON true

  WHERE ver.status = 'aprovado'
  AND m.feed = true

  ORDER BY 
    total_vips DESC,
    is_new DESC,
    m.id DESC
`);

    const modelos = result.rows;

if (modelos.length > 0) {
  modelos[0].top1 = true; // 👑 primeira do ranking
}

res.json(modelos);

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
        cd.capa, 
        cd.instagram,
        cd.tiktok,
        cd.local,
        cd.bio
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
           COALESCE(
      NULLIF(mp.valor_mensal, 0),
      NULLIF(md.vip_preco, 0),
      20.00
    ) AS valor_assinatura,
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
      
      LEFT JOIN modelos_planos mp
        ON mp.modelo_id = m.id

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
        m.avatar AS avatar,

        msg.text        AS ultima_mensagem,
        msg.created_at  AS ultima_mensagem_em,
        msg.lida,
        msg.sender

      FROM vip_subscriptions v

      JOIN modelos m 
        ON m.id = v.modelo_id  -- 🔥 corrigido

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
         ORDER BY msg.created_at DESC NULLS LAST
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

    const userId = req.user.id;

    // 🔥 1️⃣ Buscar modelos.id da modelo logada
    const modeloResult = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [userId]
    );

    if (modeloResult.rows.length === 0) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    const modeloId = modeloResult.rows[0].id;

    // 🔥 2️⃣ Usar modeloId correto
    const { rows } = await db.query(`
      SELECT DISTINCT ON (c.id)
        c.id AS cliente_id,
        c.nome,
        cd.username,
        cd.avatar AS avatar,
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
          AND messages.modelo_id  = $1
        ORDER BY created_at DESC
        LIMIT 1
      ) msg ON true

      WHERE v.modelo_id = $1
        AND v.ativo = true
        AND v.expiration_at > NOW()

      ORDER BY c.id, msg.created_at DESC NULLS LAST;
    `, [modeloId]);

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
    // ✅ pega preco e visto
    const messageCheck = await db.query(
      `
      SELECT id, visto, preco
      FROM messages
      WHERE id = $1
        AND cliente_id = $2
      `,
      [message_id, req.cliente_id]
    );

    if (!messageCheck.rowCount) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const mensagem = messageCheck.rows[0];
    const preco = Number(mensagem.preco || 0);

    // 🔒 só libera se já foi paga (ou já marcado como visto)
    if (preco > 0 && mensagem.visto !== true) {
      const pago = await db.query(
        `
        SELECT 1
        FROM conteudo_pacotes
        WHERE message_id = $1
          AND cliente_id = $2
          AND status = 'pago'
        LIMIT 1
        `,
        [message_id, req.cliente_id]
      );

      if (!pago.rowCount) {
        return res.status(403).json({ error: "Conteúdo não liberado" });
      }
    }

    const result = await db.query(
      `
      SELECT
        c.url,
        c.tipo AS tipo_media
      FROM messages_conteudos mc
      JOIN conteudos c ON c.id = mc.conteudo_id
      WHERE mc.message_id = $1
      `,
      [message_id]
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
    let where = "c.modelo_id = $1 AND c.ativo = TRUE";
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

    const userId = req.user.id;

    // 🔹 1️⃣ Verificar se existe modelo
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [userId]
    );

    if (modeloRes.rows.length) {

      const modeloId = modeloRes.rows[0].id;

      const modeloVerificacao = await db.query(
        `
        SELECT status, motivo_rejeicao
        FROM modelos_verificacao
        WHERE modelo_id = $1
        ORDER BY criado_em DESC
        LIMIT 1
        `,
        [modeloId]
      );

      if (modeloVerificacao.rows.length) {
        return res.json(modeloVerificacao.rows[0]);
      }
    }

    // 🔹 2️⃣ Se não houver verificação como modelo, verificar como cliente
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (clienteRes.rows.length) {

      const clienteId = clienteRes.rows[0].id;

      const clienteVerificacao = await db.query(
        `
        SELECT status, motivo_rejeicao
        FROM clientes_verificacao
        WHERE cliente_id = $1
        ORDER BY criado_em DESC
        LIMIT 1
        `,
        [clienteId]
      );

      if (clienteVerificacao.rows.length) {
        return res.json(clienteVerificacao.rows[0]);
      }
    }

    // 🔹 3️⃣ Se não existir nada
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
      [req.modelo_id] 
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

app.get("/api/pagamento/status/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await db.query(
      `SELECT status
       FROM pagamentos_pix
       WHERE pagarme_order_id = $1`,
      [orderId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ status: "nao_encontrado" });
    }

    const status = result.rows[0].status;

    return res.json({ status });

  } catch (err) {
    console.error("Erro status pagamento:", err);
    return res.status(500).json({ error: "erro" });
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

await db.query(`
  INSERT INTO clientes_dados (
    cliente_id,
    username,
    instagram,
    tiktok,
    local,
    bio,
    atualizado_em
  )
  VALUES ($1, $2, $3, $4, $5, $6, NOW())
  ON CONFLICT (cliente_id)
  DO UPDATE SET
    username      = EXCLUDED.username,
    instagram     = EXCLUDED.instagram,
    tiktok        = EXCLUDED.tiktok,
    local         = EXCLUDED.local,
    bio           = EXCLUDED.bio,
    atualizado_em = NOW()
`, [
  clienteId,
  nome_exibicao,
  instagram || null,
  tiktok || null,
  local || null,
  bio || null
]);

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

// verifica se já existe registro
const existeDados = await db.query(
  `SELECT id FROM modelos_dados WHERE modelo_id = $1`,
  [modeloId]
);

if (existeDados.rows.length > 0) {

  // UPDATE
  await db.query(
    `
    UPDATE modelos_dados
    SET
      instagram     = COALESCE($1, instagram),
      tiktok        = COALESCE($2, tiktok),
      atualizado_em = NOW()
    WHERE modelo_id = $3
    `,
    [
      instagram ?? null,
      tiktok ?? null,
      modeloId
    ]
  );

} else {

  // INSERT
  await db.query(
    `
    INSERT INTO modelos_dados (modelo_id, instagram, tiktok)
    VALUES ($1, $2, $3)
    `,
    [
      modeloId,
      instagram ?? null,
      tiktok ?? null
    ]
  );
}
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
      nome_exibicao,
      instagram,
      tiktok,
      local,
      bio,
      avatar,
      avatar_thumb,
      capa
    } = req.body;

    await db.query(`
      INSERT INTO clientes_dados (
        cliente_id,
        username,
        nome_completo,
        data_nascimento,
        pais,
        nome_exibicao,
        instagram,
        tiktok,
        local,
        bio,
        avatar,
        avatar_thumb,
        capa,
        criado_em,
        atualizado_em
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
        NOW(),NOW()
      )
      ON CONFLICT (cliente_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        nome_completo = EXCLUDED.nome_completo,
        data_nascimento = EXCLUDED.data_nascimento,
        pais = EXCLUDED.pais,
        nome_exibicao = EXCLUDED.nome_exibicao,
        instagram = EXCLUDED.instagram,
        tiktok = EXCLUDED.tiktok,
        local = EXCLUDED.local,
        bio = EXCLUDED.bio,
        avatar = EXCLUDED.avatar,
        avatar_thumb = EXCLUDED.avatar_thumb,
        capa = EXCLUDED.capa,
        atualizado_em = NOW()
    `, [
      req.cliente_id,
      username,
      nome_completo,
      data_nascimento,
      pais,
      nome_exibicao || null,
      instagram || null,
      tiktok || null,
      local || null,
      bio || null,
      avatar || null,
      avatar_thumb || null,
      capa || null
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

    /* =====================================================
       🔵 MODELO
    ===================================================== */
    if (req.user.role === "modelo") {

      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [userId]
      );

      if (!modeloRes.rowCount) {
        return res.status(404).json({ erro: "Modelo não encontrado" });
      }

      const modelo_id = modeloRes.rows[0].id;

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

      return res.json({ sucesso: true });
    }

    /* =====================================================
       🟢 CLIENTE
    ===================================================== */
    if (req.user.role === "cliente") {

      const clienteRes = await db.query(
        "SELECT id FROM clientes WHERE user_id = $1",
        [userId]
      );

      if (!clienteRes.rowCount) {
        return res.status(404).json({ erro: "Cliente não encontrado" });
      }

      const cliente_id = clienteRes.rows[0].id;

      const verificacao = await db.query(`
        SELECT status
        FROM clientes_verificacao
        WHERE cliente_id = $1
        ORDER BY criado_em DESC
        LIMIT 1
      `, [cliente_id]);

      if (
        verificacao.rowCount > 0 &&
        verificacao.rows[0].status === "aprovado"
      ) {
        return res.status(403).json({
          erro: "Dados pessoais já aprovados e não podem ser alterados"
        });
      }

      await db.query(`
        INSERT INTO clientes_dados
          (cliente_id, nome_completo, data_nascimento, telefone, endereco, estado, cidade, pais, atualizado_em)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (cliente_id)
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
        cliente_id,
        nome_completo?.trim() || null,
        data_nascimento || null,
        telefone?.trim() || null,
        endereco?.trim() || null,
        estado?.trim() || null,
        cidade?.trim() || null,
        pais?.trim() || null
      ]);

      return res.json({ sucesso: true });
    }

    return res.status(403).json({ erro: "Role inválida" });

  } catch (err) {
    console.error("ERRO PUT /api/usuario/dados:", err);
    res.status(500).json({ erro: err.message });
  }
});

app.put("/api/cliente/dados", authCliente, async (req, res) => {
  try {

    const {
      username,
      instagram,
      tiktok,
      local,
      bio
    } = req.body;

    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username obrigatório." });
    }

    await db.query(`
      INSERT INTO clientes_dados (
        cliente_id,
        username,
        instagram,
        tiktok,
        local,
        bio,
        criado_em,
        atualizado_em
      )
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
      ON CONFLICT (cliente_id)
      DO UPDATE SET
        username = COALESCE(EXCLUDED.username, clientes_dados.username),
        instagram = COALESCE(EXCLUDED.instagram, clientes_dados.instagram),
        tiktok = COALESCE(EXCLUDED.tiktok, clientes_dados.tiktok),
        local = COALESCE(EXCLUDED.local, clientes_dados.local),
        bio = COALESCE(EXCLUDED.bio, clientes_dados.bio),
        atualizado_em = NOW()
    `, [
      req.cliente_id,
      username.trim(),
      instagram || null,
      tiktok || null,
      local || null,
      bio || null
    ]);

    res.json({ success: true });

  } catch (err) {
    console.error("Erro atualizar dados cliente:", err);
    res.status(500).json({ error: "Erro interno." });
  }
});

app.put("/api/cliente/subscricoes/:id/cancelar", auth, async (req, res) => {
  try {

    const subscriptionId = req.params.id;

    // 🔁 users.id → clientes.id
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [req.user.id]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    const clienteId = clienteRes.rows[0].id;

    // 🔒 Verificar se a subscrição pertence ao cliente
    const subRes = await db.query(
      `SELECT id, ativo 
       FROM vip_subscriptions
       WHERE id = $1 AND cliente_id = $2`,
      [subscriptionId, clienteId]
    );

    if (!subRes.rowCount) {
      return res.status(403).json({ error: "Subscrição inválida." });
    }

    // 🔎 Se já estiver cancelada
    if (!subRes.rows[0].ativo) {
      return res.status(400).json({ error: "Esta subscrição já está cancelada." });
    }

    // 🔥 Cancelar recorrência
    await db.query(
      `UPDATE vip_subscriptions
       SET recorrente = false,
           ativo = false
       WHERE id = $1`,
      [subscriptionId]
    );

    return res.status(200).json({
      success: true,
      message: "Subscrição cancelada com sucesso."
    });

  } catch (err) {
    console.error("Erro ao cancelar:", err);
    return res.status(500).json({
      error: "Erro interno ao cancelar subscrição."
    });
  }
});

// app.put(
//   "/api/admin/verificacao/:id",
//   authAdmin,
//   async (req, res) => {
//     try {
//       const { id } = req.params;
//       const { status, motivo } = req.body;

//       if (!["aprovado", "recusado"].includes(status)) {
//         return res.status(400).json({ erro: "Status inválido" });
//       }

//       // 🔎 Buscar modelo_id da verificação
//       const verificacaoRes = await db.query(
//         `SELECT modelo_id FROM modelos_verificacao WHERE id = $1`,
//         [id]
//       );

//       if (verificacaoRes.rowCount === 0) {
//         return res.status(404).json({ erro: "Verificação não encontrada" });
//       }

//       const modelo_id = verificacaoRes.rows[0].modelo_id;

//       // 🔁 Converter modelo_id → user_id
//       const modeloRes = await db.query(
//         `SELECT user_id FROM modelos WHERE id = $1`,
//         [modelo_id]
//       );

//       if (modeloRes.rowCount === 0) {
//         return res.status(404).json({ erro: "Modelo não encontrado" });
//       }

//       const user_id = modeloRes.rows[0].user_id;

//       // ✅ Atualizar verificação
//       await db.query(
//         `
//         UPDATE modelos_verificacao
//         SET
//           status = $1,
//           motivo = $2,
//           atualizado_em = NOW()
//         WHERE id = $3
//         `,
//         [status, motivo || null, id]
//       );

//       // 🚀 Se aprovado → promover para modelo
//       if (status === "aprovado") {
//         await db.query(
//           `UPDATE users SET role = 'modelo' WHERE id = $1`,
//           [user_id]
//         );
//       }

//       res.json({ ok: true });

//     } catch (err) {
//       console.error("Erro atualizar verificação:", err);
//       res.status(500).json({ erro: "Erro ao atualizar status" });
//     }
//   }
// );

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
    // 🔒 VALIDAÇÕES
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

    const nomePublico = nome_completo.split(" ")[0];

    // ===============================
    // 👠 MODELO
    // ===============================
    if (role === "modelo") {

      const modeloResult = await db.query(
        `
        INSERT INTO public.modelos
          (user_id, nome, verificada, email_enviado_em, prazo_validacao)
        VALUES
          ($1, $2, 'false', NOW(), NOW() + INTERVAL '14 days')
        RETURNING id
        `,
        [userId, nomePublico]
      );

      modeloId = modeloResult.rows[0].id;

      await db.query(
        `
        INSERT INTO public.modelos_dados
          (modelo_id, nome_completo, data_nascimento, criado_em, atualizado_em)
        VALUES
          ($1, $2, $3, NOW(), NOW())
        `,
        [modeloId, nome_completo, data_nascimento]
      );

      console.log("📩 Tentando enviar email para:", email);
      await enviarEmailValidacao(email);
    }

    // ===============================
    // 👤 CLIENTE
    // ===============================
    if (role === "cliente") {

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
        id: userId,
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

    const role = user.role.toLowerCase();

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // 🔥 SE FOR MODELO, BUSCA O ID DA TABELA MODELOS
    if (role === "modelo") {

      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [user.id]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(400).json({ error: "Modelo não encontrado" });
      }

      return res.json({
        token,
        role,
        modelo_id: modeloRes.rows[0].id
      });
    }

    // 🔵 SE FOR CLIENTE
    return res.json({
      token,
      role
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

      const userId = req.user.id;

      const { mimetype, originalname, buffer } = req.file;

      const caminho = `velvet/avatars/${userId}/${Date.now()}-${originalname}`;

      // 🚀 Upload manual para Backblaze (igual conteudos)
      const uploadResult = await s3.upload({
        Bucket: process.env.B2_BUCKET,
        Key: caminho,
        Body: buffer,
        ContentType: mimetype,
        ACL: "public-read"
      }).promise();

      const avatarUrl = uploadResult.Location;

      // ==============================
      // MODELO
      // ==============================
      if (req.user.role === "modelo") {

        const modeloRes = await db.query(
          "SELECT id FROM modelos WHERE user_id = $1",
          [userId]
        );

        if (!modeloRes.rowCount) {
          return res.status(404).json({ error: "Modelo não encontrado" });
        }

        const modelo_id = modeloRes.rows[0].id;

        await db.query(
          "UPDATE modelos SET avatar = $1 WHERE id = $2",
          [avatarUrl, modelo_id]
        );
      }

      // ==============================
      // CLIENTE
      // ==============================
      else if (req.user.role === "cliente") {

        const clienteRes = await db.query(
          "SELECT id FROM clientes WHERE user_id = $1",
          [userId]
        );

        if (!clienteRes.rowCount) {
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
          [avatarUrl, cliente_id]
        );
      }

      else {
        return res.status(403).json({ error: "Role inválida" });
      }

      res.json({ avatar: avatarUrl });

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

      const userId = req.user.id;
      const { mimetype, originalname, buffer } = req.file;

      // 🔥 caminho único (evita cache)
      const caminho = `velvet/capas/${userId}/${Date.now()}-${originalname}`;

      // 🚀 Upload manual para Backblaze (igual avatar)
      const uploadResult = await s3.upload({
        Bucket: process.env.B2_BUCKET,
        Key: caminho,
        Body: buffer,
        ContentType: mimetype,
        ACL: "public-read",
        CacheControl: "no-cache"
      }).promise();

      const url = uploadResult.Location;

      // ==============================
      // MODELO
      // ==============================
      if (req.user.role === "modelo") {

        await db.query(
          "UPDATE modelos SET capa = $1 WHERE user_id = $2",
          [url, userId]
        );

      }

      // ==============================
      // CLIENTE
      // ==============================
      else if (req.user.role === "cliente") {

        const clienteRes = await db.query(
          "SELECT id FROM clientes WHERE user_id = $1",
          [userId]
        );

        if (!clienteRes.rowCount) {
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

      res.json({ capa: url });

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


// 🗑 DESATIVAR CONTEÚDO (MODELO) — SOFT DELETE
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

    // ✅ SOFT DELETE
    const result = await db.query(
      `
      UPDATE conteudos
      SET ativo = FALSE,
          deletado_em = NOW()
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
    console.error("Erro desativar conteúdo:", err);
    res.status(500).json({ error: "Erro ao desativar conteúdo" });
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

// 🗑 EXCLUIR PACOTE DE CONTEÚDO (MODELO)
app.delete("/api/chat/pacote/:message_id", authModelo, async (req, res) => {

  const message_id = Number(req.params.message_id);

  if (!Number.isInteger(message_id)) {
    return res.status(400).json({ error: "message_id inválido" });
  }

  try {

    // 1️⃣ verificar se pertence ao modelo
    const msgRes = await db.query(`
      SELECT id, modelo_id, visto
      FROM messages
      WHERE id = $1
    `, [message_id]);

    if (!msgRes.rowCount) {
      return res.status(404).json({ error: "Mensagem não encontrada" });
    }

    const mensagem = msgRes.rows[0];

    if (mensagem.modelo_id !== req.modelo_id) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    // ❌ Se já foi visto → NÃO pode excluir
    if (mensagem.visto === true) {
      return res.status(400).json({
        error: "Conteúdo já visualizado não pode ser excluído."
      });
    }

    // 2️⃣ verificar se já foi pago
    const pagoRes = await db.query(`
      SELECT 1
      FROM conteudo_pacotes
      WHERE message_id = $1
        AND status = 'pago'
      LIMIT 1
    `, [message_id]);

    if (pagoRes.rowCount > 0) {
      return res.status(400).json({
        error: "Conteúdo já pago não pode ser excluído."
      });
    }

    // 3️⃣ marcar mensagem como deletada
    await db.query(`
      UPDATE messages
      SET deletada = true
      WHERE id = $1
    `, [message_id]);

    res.json({ success: true });

  } catch (err) {
    console.error("Erro excluir pacote:", err);
    res.status(500).json({ error: "Erro ao excluir pacote" });
  }
});

app.post("/api/pagamento/vip/pix", auth, async (req, res) => {

  const client = await db.connect();

  try {

    const { modelo_id, cpf, aceitou_termos, fingerprint } = req.body;
    const userId = req.user.id;

    if (!aceitou_termos) {
      return res.status(400).json({ error: "É necessário aceitar os termos." });
    }

    if (!cpf || cpf.length !== 11) {
      return res.status(400).json({ error: "CPF obrigatório." });
    }

    if (!modelo_id || !Number.isInteger(Number(modelo_id))) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    await client.query("BEGIN");

    const clienteRes = await client.query(
      "SELECT id, bloqueado FROM clientes WHERE user_id=$1",
      [userId]
    );

    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const { id: cliente_id, bloqueado } = clienteRes.rows[0];

    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const planoRes = await client.query(`
      SELECT valor_mensal
      FROM modelos_planos
      WHERE modelo_id = $1
      LIMIT 1
    `, [modelo_id]);

    if (!planoRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Plano VIP não encontrado" });
    }

let valorBase = Number(planoRes.rows[0].valor_mensal) || 0;

const ofertaRes = await client.query(`
  SELECT valor_promocional
  FROM ofertas
  WHERE modelo_id = $1
  AND ativa = true
  AND NOW() BETWEEN data_inicio AND data_fim
  ORDER BY data_inicio DESC
  LIMIT 1
`, [modelo_id]);

if (ofertaRes.rowCount && Number(ofertaRes.rows[0].valor_promocional) > 0) {
  valorBase = Number(ofertaRes.rows[0].valor_promocional);
}

    if (!valorBase || valorBase <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor inválido para pagamento" });
    }

    const valorCentavos = Math.round(valorBase * 100);
    const taxaTransacaoCentavos  = Math.round(valorCentavos * 0.10);
    const taxaPlataformaCentavos = Math.round(valorCentavos * 0.05);

    const amount =
      valorCentavos +
      taxaTransacaoCentavos +
      taxaPlataformaCentavos;

    const taxaTransacao  = taxaTransacaoCentavos / 100;
    const taxaPlataforma = taxaPlataformaCentavos / 100;
    const total          = amount / 100;

    const pagarmeResponse = await axios.post(
      "https://api.pagar.me/core/v5/orders",
      {
        items: [{
          amount,
          description: "Assinatura VIP Velvet",
          quantity: 1
        }],
customer: {
  name: req.user.nome || "Cliente Velvet",
  email: req.user.email,
  document: cpf,
  type: "individual",
  phones: {
    mobile_phone: {
      country_code: "55",
      area_code: "11",
      number: "999999999"
    }
  }
},
        payments: [{
          payment_method: "pix",
          pix: { expires_in: 3600 }
        }],
        metadata: {
          tipo: "vip",
          cliente_id: String(cliente_id),
          modelo_id: String(modelo_id),
          aceite_ip: ip,
          fingerprint: fingerprint || "",
          valor_assinatura: String(valorBase),
          taxa_transacao: String(taxaTransacao),
          taxa_plataforma: String(taxaPlataforma),
          valor_total: String(total)
        }
      },
      {
        headers: {
          Authorization: `Basic ${Buffer
            .from(process.env.PAGARME_SECRET_KEY + ":")
            .toString("base64")}`,
          "Content-Type": "application/json"
        }
      }
    );

    const order = pagarmeResponse.data;

const charge = order.charges?.[0];
const pixData = charge?.last_transaction;

if (!charge || !pixData || !pixData.qr_code) {
  console.error("Resposta Pagar.me:", JSON.stringify(order, null, 2));
  await client.query("ROLLBACK");
  return res.status(500).json({
    error: "Erro ao gerar QR Code Pix"
  });
}

const modeloIdInt = Number(modelo_id);
const clienteIdInt = Number(cliente_id);
const totalNumber = Number(total);

await client.query(`
  INSERT INTO pagamentos_pix (
    cliente_id,
    modelo_id,
    valor,
    status,
    pagarme_order_id,
    criado_em,
    aceite_ip,
    aceitou_termos,
    cpf,
    fingerprint
  )
  VALUES ($1,$2,$3,'pendente',$4,NOW(),$5,true,$6,$7)
`,[
  clienteIdInt,
  modeloIdInt,
  totalNumber,
  order.id,
  ip,
  cpf,
  fingerprint || ""
]);

    await client.query("COMMIT");

    res.json({
  qr_code_url: pixData?.qr_code_url || null,
  copia_cola: pixData?.qr_code || null,
  expires_at: pixData?.expires_at || order.closed_at || null,
  order_id: order.id
});

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🔥 ERRO PIX VIP:", err.response?.data || err);
    res.status(500).json({ error: "Erro ao gerar pagamento PIX" });
  } finally {
    client.release();
  }
});

app.post("/api/pagamento/midia/pix", auth, async (req, res) => {
  const client = await db.connect();

  try {
    const { conteudo_id, fingerprint, cpf } = req.body;
    const userId = req.user.id;

    if (!conteudo_id || isNaN(conteudo_id)) {
      return res.status(400).json({ error: "conteudo_id inválido" });
    }

    const conteudoId = Number(conteudo_id);

    if (!cpf) {
      return res.status(400).json({ error: "CPF obrigatório." });
    }

    const cpfLimpo = String(cpf).replace(/\D/g, "");

    if (!/^[0-9]{11}$/.test(cpfLimpo)) {
      return res.status(400).json({ error: "CPF inválido." });
    }

    const safeFingerprint = String(fingerprint || "").slice(0, 255);

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    /* =====================================================
       🔒 BLOQUEIO IP
    ===================================================== */
    const ipBloqueado = await client.query(
      "SELECT 1 FROM ips_bloqueados WHERE ip = $1",
      [ip]
    );

    if (ipBloqueado.rowCount > 0) {
      return res.status(403).json({
        error: "IP bloqueado por atividade suspeita."
      });
    }

    /* =====================================================
       🔁 BUSCAR CLIENTE
    ===================================================== */
    const clienteRes = await client.query(
      "SELECT id, bloqueado FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const { id: cliente_id, bloqueado } = clienteRes.rows[0];

    if (bloqueado) {
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    /* =====================================================
       📦 BUSCAR CONTEÚDO
    ===================================================== */
    const messageRes = await client.query(
      "SELECT preco, modelo_id FROM messages WHERE id = $1",
      [conteudoId]
    );

    if (!messageRes.rowCount) {
      return res.status(404).json({ error: "Conteúdo não encontrado" });
    }

    const { preco, modelo_id } = messageRes.rows[0];

    if (!preco || isNaN(preco) || Number(preco) <= 0) {
      return res.status(400).json({ error: "Preço inválido." });
    }

    /* =====================================================
       🚫 EVITAR COMPRA DUPLICADA
    ===================================================== */
    const jaComprado = await client.query(
      `SELECT 1
       FROM pagamentos_pix
       WHERE message_id = $1
         AND cliente_id = $2
         AND status = 'pago'
       LIMIT 1`,
      [conteudoId, cliente_id]
    );

    if (jaComprado.rowCount > 0) {
      return res.status(400).json({
        error: "Conteúdo já adquirido."
      });
    }

    /* =====================================================
       💰 CÁLCULO
    ===================================================== */
    const valorCentavos = Math.round(Number(preco) * 100);
    const taxaTransacaoCentavos = Math.round(valorCentavos * 0.10);
    const taxaPlataformaCentavos = Math.round(valorCentavos * 0.05);

    const amount =
      valorCentavos +
      taxaTransacaoCentavos +
      taxaPlataformaCentavos;

    const taxaTransacao = taxaTransacaoCentavos / 100;
    const taxaPlataforma = taxaPlataformaCentavos / 100;
    const valorBaseReal = valorCentavos / 100;
    const total = amount / 100;

    /* =====================================================
       💳 CRIAR ORDEM PIX PAGAR.ME (SEM TRANSAÇÃO ABERTA)
    ===================================================== */
    const pagarmeResponse = await axios.post(
      "https://api.pagar.me/core/v5/orders",
      {
        items: [{
          amount,
          description: "Midias Velvet",
          quantity: 1
        }],
        customer: {
          name: req.user.nome || "Cliente Velvet",
          email: req.user.email,
          document: cpfLimpo,
          type: "individual"
        },
        payments: [{
          payment_method: "pix",
          pix: { expires_in: 3600 }
        }],
        metadata: {
  tipo: "conteudo_pix",
  message_id: String(conteudoId),
  cliente_id: String(cliente_id),
  modelo_id: String(modelo_id),
  aceite_ip: ip,
  fingerprint: safeFingerprint,
  valor_base: String(valorBaseReal),
  taxa_transacao: String(taxaTransacao),
  taxa_plataforma: String(taxaPlataforma),
  valor_total: String(total)
}
      },
      {
        headers: {
          Authorization: `Basic ${Buffer
            .from(process.env.PAGARME_SECRET_KEY + ":")
            .toString("base64")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `pix_${cliente_id}_${conteudoId}`
        }
      }
    );

    const order = pagarmeResponse.data;
    const charge = order.charges?.[0];
    const pixData = charge?.last_transaction;

    if (!charge || !pixData || !pixData.qr_code) {
      console.error("Resposta Pagar.me:", JSON.stringify(order, null, 2));
      return res.status(500).json({
        error: "Erro ao gerar QR Code Pix"
      });
    }

    /* =====================================================
       📝 AGORA SIM ABRE TRANSAÇÃO
    ===================================================== */
    await client.query("BEGIN");

    await client.query(`
      INSERT INTO pagamento_tentativas
      (cliente_id, metodo, status, pagarme_order_id)
      VALUES ($1,'pix','aguardando',$2)
    `, [cliente_id, order.id]);

    await client.query(`
      INSERT INTO pagamentos_pix (
        cliente_id,
        modelo_id,
        valor,
        status,
        pagarme_order_id,
        criado_em,
        aceite_ip,
        aceitou_termos,
        cpf,
        message_id
      )
      VALUES ($1,$2,$3,'pendente',$4,NOW(),$5,true,$6,$7)
    `, [
      cliente_id,
      modelo_id,
      total,
      order.id,
      ip,
      cpfLimpo,
      conteudoId
    ]);

    await client.query(
      "UPDATE clientes SET cpf = $1 WHERE id = $2 AND cpf IS NULL",
      [cpfLimpo, cliente_id]
    );

    await client.query("COMMIT");

    return res.json({
      qr_code_url: pixData.qr_code_url,
      copia_cola: pixData.qr_code,
      expires_at: pixData.expires_at,
      order_id: order.id
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🔥 ERRO PIX MIDIA PAGARME:", err.response?.data || err);
    return res.status(500).json({
      error: "Erro ao gerar pagamento PIX"
    });
  } finally {
    client.release();
  }
});

app.post("/api/pagamento/midia/cartao", auth, async (req, res) => {
  const client = await db.connect();

  try {
    const { conteudo_id } = req.body;
    const userId = req.user.id;

    if (!conteudo_id || !Number.isInteger(Number(conteudo_id))) {
      return res.status(400).json({ error: "conteudo_id inválido" });
    }

    const conteudoId = Number(conteudo_id);

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

     await client.query("BEGIN");

    /* 🔒 BUSCAR CLIENTE */
    const clienteRes = await client.query(
      "SELECT id, bloqueado FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const { id: cliente_id, bloqueado } = clienteRes.rows[0];

    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    /* 🔎 BUSCAR CONTEÚDO */
    const messageRes = await client.query(`
      SELECT preco, modelo_id
      FROM messages
      WHERE id = $1
    `, [conteudoId]);

    if (!messageRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Conteúdo não encontrado" });
    }

    const { preco, modelo_id } = messageRes.rows[0];

    if (!preco || Number(preco) <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Conteúdo não está à venda."
      });
    }

    /* 🚫 EVITAR COMPRA DUPLICADA (PIX OU CARTÃO) */
    const jaComprado = await client.query(`
      SELECT 1
      FROM conteudo_pacotes
      WHERE message_id = $1
        AND cliente_id = $2
        AND status = 'pago'
      LIMIT 1
    `, [conteudoId, cliente_id]);

    if (jaComprado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Conteúdo já adquirido."
      });
    }

    /* 💰 CÁLCULO EM CENTAVOS (PADRÃO WEBHOOK) */
    const valorCentavos = Math.round(Number(preco) * 100);

    const taxaTransacaoCentavos  = Math.round(valorCentavos * 0.10);
    const taxaPlataformaCentavos = Math.round(valorCentavos * 0.05);

    const amount =
      valorCentavos +
      taxaTransacaoCentavos +
      taxaPlataformaCentavos;

    const valorBase      = valorCentavos / 100;
    const taxaTransacao  = taxaTransacaoCentavos / 100;
    const taxaPlataforma = taxaPlataformaCentavos / 100;
    const total          = amount / 100;

    /* 💳 CRIAR PAYMENT INTENT */
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "brl",
      payment_method_types: ["card"],
      metadata: {
        tipo: "conteudo_cartao",
        message_id: String(conteudoId),
        cliente_id: String(cliente_id),
        modelo_id: String(modelo_id),

        valor_assinatura: String(valorBase),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma),
        valor_total: String(total),

        aceite_ip: ip
      }
    });

    /* 📝 REGISTRAR CONTROLE LOCAL */
    await client.query(`
      INSERT INTO pagamentos_cartao
      (cliente_id, conteudo_id, stripe_payment_intent_id, status)
      VALUES ($1,$2,$3,'iniciado')
    `, [cliente_id, conteudoId, paymentIntent.id]);

    await client.query("COMMIT");

    return res.json({
      clientSecret: paymentIntent.client_secret,
      total,
      valorBase,
      taxaTransacao,
      taxaPlataforma
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🔥 ERRO CARTÃO MIDIA:", err);
    return res.status(500).json({ error: "Erro ao gerar pagamento" });
  } finally {
    client.release();
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
  uploadB2.array("file", 10),
  async (req, res) => {
    const userId = req.user.id;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: "Arquivo obrigatório"
      });
    }

    try {
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
      const resultados = [];

      for (const file of req.files) {

        const hash = gerarHash(file.buffer);

        const duplicado = await db.query(
  `SELECT id FROM conteudos 
   WHERE modelo_id = $1 
   AND hash = $2 
   AND tamanho = $3`,
  [modelo_id, hash, file.size]
);

        if (duplicado.rowCount > 0) {
          continue; // apenas ignora o arquivo duplicado
        }

        const { mimetype, originalname } = file;

        let tipo;
        if (mimetype.startsWith("image/")) {
          tipo = "imagem";
        } else if (mimetype.startsWith("video/")) {
          tipo = "video";
        } else {
          continue;
        }

        // 📁 Caminho igual você já fazia
        const ext = originalname.split(".").pop();

        const caminho = `velvet/modelos/${userId}/${Date.now()}-${originalname}`;

        // 🚀 Upload manual para Backblaze
        const uploadResult = await s3.upload({
          Bucket: process.env.B2_BUCKET,
          Key: caminho,
          Body: file.buffer,
          ContentType: mimetype,
          ACL: "public-read"
        }).promise();

        const url = uploadResult.Location;
        let thumbnail_url = null;

        if (tipo === "video") {
          try {
            thumbnail_url = await gerarThumbnailVideo(file.buffer, modelo_id);
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
            hash,
            tamanho,
            criado_em
          )
          VALUES ($1, $2, 'venda', $3, $4, $5, $6, NOW())
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
            thumbnail_url,
            hash,
            file.size
          ]
        );

        resultados.push(result.rows[0]);
      }

      res.json(resultados);

    } catch (err) {
      console.error("Erro upload múltiplo:", err);
      res.status(500).json({
        error: "Erro ao carregar conteúdo"
      });
    }
  }
);

app.post("/api/admin/modelo/:id/reset-password", auth, authAdmin, async (req,res)=>{

const modelo_id = Number(req.params.id);

try{

// buscar user_id da modelo
const modeloRes = await db.query(`
SELECT user_id
FROM modelos
WHERE id = $1
`,[modelo_id]);

if(!modeloRes.rows.length){
return res.status(404).json({error:"Modelo não encontrada"});
}

const user_id = modeloRes.rows[0].user_id;

// gerar nova senha aleatória
const password = Math.random().toString(36).slice(-10);

// gerar hash
const password_hash = await bcrypt.hash(password, 10);

// atualizar password no users
await db.query(`
UPDATE users
SET password_hash = $1
WHERE id = $2
`,[
password_hash,
user_id
]);

// salvar histórico
await db.query(`
INSERT INTO admin_segurança_historico
(modelo_id, admin_id, motivo, data)
VALUES ($1,$2,$3,NOW())
`,[
modelo_id,
req.user.id,
"Reset de password"
]);

res.json({
password
});

}catch(err){
console.error("Erro reset password:",err);
res.status(500).json({error:"Erro reset password"});
}

});

// ===============================
// 🔥 MIDDLEWARE GLOBAL DE ERRO
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

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false,
//   },
// });

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});