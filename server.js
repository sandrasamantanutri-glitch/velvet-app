console.log("SERVIDOR INICIADO - O SENHOR EH MEU PASTOR E NADA ME FALTARA!")

// ===============================
// VARIAVEIS
// ===============================

require("dotenv").config();      //PRIMEIRO
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
const FormData = require("form-data");
const webpush = require("web-push");

const os = require("os");
const { exec } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");


const server = http.createServer(app);
const multer = require("multer");
const onlineModelos = new Map();
const onlineClientes = new Map();
const AWS = require("aws-sdk");
const multerS3 = require("multer-s3");

const ffmpegPath = require("ffmpeg-static");
const authCliente = require("./middleware/authCliente");
const authModelo = require("./middleware/authModelo");
const auth = require("./middleware/auth");

const crypto = require("crypto");
const axios = require("axios");

const { Resend } = require("resend");
const { enviarEmailValidacao } = require("./email");
const rateLimit = require("express-rate-limit");

module.exports = uploadCloudflareImage;
module.exports = uploadVideoCloudflare;

app.set("trust proxy", 1);
ffmpeg.setFfmpegPath(ffmpegPath);

const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const allowedOrigins = [
  "https://www.velvet.lat",
  "https://velvet-test-production.up.railway.app",
  "https://velvet-app-production.up.railway.app",
  "https://velvet-app.onrender.com"
];

const io = new Server(server, {
  cors: {
    origin: [
      "https://www.velvet.lat",
      "https://velvet-app.onrender.com",
      "https://velvet-app-production.up.railway.app",
      "https://velvet-test-production.up.railway.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket"],
  
});

// ===========================
// WEBPUSH
// ===========================
if (
  process.env.VAPID_SUBJECT &&
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log("VAPID configurado com sucesso");
} else {
  console.warn("VAPID não configurado. Push desativado por enquanto.");
}

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

// app.use((req, res, next) => {
//   return res.sendFile(
//     path.join(__dirname, "public", "manutencao.html")
//   );
// });

// ===============================
// WEBHOOKS
// ===============================

app.post("/api/webhook/pagarme", express.raw({ type: "*/*" }), async (req, res) => {
  console.log("======================================");
  console.log("🔥 WEBHOOK PAGARME RECEBIDO");
  console.log("URL:", req.originalUrl);
  console.log("METHOD:", req.method);

  let event = null;

  try {
    const raw = req.body?.toString("utf8") || "";
    event = raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Erro parse webhook:", err);
    return res.status(400).send("invalid body");
  }

  if (!event || typeof event !== "object") {
    console.log("Evento inválido (sem objeto)");
    return res.status(200).send("ok");
  }

  if (!event.type) {
    console.log("Evento sem type:", event);
    return res.status(200).send("ok");
  }

  console.log("Evento:", event.type);
  console.log("EventID:", event.id);

  const eventId = event.id || null;
  const eventType = String(event.type || "").toLowerCase();

  // Pode vir como charge ou como order dependendo do evento
  const data = event.data || {};
  const isOrderEvent = eventType.startsWith("order.");
  const isChargeEvent = eventType.startsWith("charge.");

  const order = isOrderEvent ? data : (data.order || null);
  const charge = isChargeEvent ? data : (data.charges?.[0] || null);

  const orderId = order?.id || charge?.order?.id || null;
  const chargeId = charge?.id || null;
  const metadata = order?.metadata || charge?.metadata || charge?.order?.metadata || {};

  console.log("OrderID:", orderId);
  console.log("ChargeID:", chargeId);
  console.log("Metadata:", metadata);

  if (!orderId) {
    console.log("🚨 orderId ausente");
    return res.status(200).send("ok");
  }

  // status normalizado do evento
const gatewayStatus = String(charge?.status || order?.status || "").toLowerCase();
const isPaidEvent =
  eventType === "order.paid" ||
  eventType === "charge.paid" ||
  ["paid"].includes(gatewayStatus);

const isFailedEvent =
  eventType === "order.payment_failed" ||
  eventType === "charge.payment_failed" ||
  eventType === "charge.failed" ||
  eventType === "order.canceled" ||
  eventType === "charge.canceled";

  const isRefundedEvent =
    eventType === "charge.refunded";

  const isChargebackEvent =
    eventType === "charge.chargedback";

  // valor pago em reais
  const amountCentavos =
    Number(charge?.amount ?? order?.amount ?? 0);

  const valorPago = amountCentavos / 100;

  console.log("Valor pago:", valorPago);

  const client = await db.connect();
  let dadosParaEmitir = null;

  try {
    console.log("🔹 BEGIN");
    await client.query("BEGIN");

    /* =====================================================
       IDEMPOTÊNCIA
    ===================================================== */

    console.log("🔎 Verificando evento duplicado");

    const jaProcessado = await client.query(
      `
      SELECT 1
      FROM pagarme_events
      WHERE id = $1
      FOR UPDATE
      `,
      [eventId]
    );

    console.log("Evento já processado?", jaProcessado.rowCount);

    if (jaProcessado.rowCount > 0) {
      console.log("Evento já existia, ignorando");
      await client.query("ROLLBACK");
      return res.status(200).send("ok");
    }

    await client.query(
      `
      INSERT INTO pagarme_events (id, type)
      VALUES ($1, $2)
      `,
      [eventId, event.type]
    );

    console.log("Evento registrado em pagarme_events");

    /* =====================================================
       BUSCAR PAGAMENTO LOCAL (PIX OU CARTÃO)
    ===================================================== */

    let pagamento = null;
    let tabelaPagamento = null;
    let metodoPagamento = null;

    const pagamentoPixRes = await client.query(
      `
      SELECT *
      FROM pagamentos_pix
      WHERE gateway = 'pagarme'
        AND pagarme_order_id = $1
      FOR UPDATE
      `,
      [orderId]
    );

    if (pagamentoPixRes.rowCount > 0) {
      pagamento = pagamentoPixRes.rows[0];
      tabelaPagamento = "pagamentos_pix";
      metodoPagamento = "pix";
    } else {
      const pagamentoCartaoRes = await client.query(
        `
        SELECT *
        FROM pagamentos_cartao
        WHERE pagarme_order_id = $1
        FOR UPDATE
        `,
        [orderId]
      );

      if (pagamentoCartaoRes.rowCount > 0) {
        pagamento = pagamentoCartaoRes.rows[0];
        tabelaPagamento = "pagamentos_cartao";
        metodoPagamento = "cartao";
      }
    }

    if (!pagamento) {
      console.log("🚨 Pagamento não encontrado:", orderId);
      await client.query("ROLLBACK");
      return res.status(200).send("ok");
    }

    console.log("Pagamento encontrado em", tabelaPagamento, pagamento);

    const cliente_id = pagamento.cliente_id;
const modelo_id = pagamento.modelo_id || Number(metadata.modelo_id || 0) || null;
const message_id =
  pagamento.message_id ||
  pagamento.conteudo_id ||
  Number(metadata.message_id || 0) ||
  null;

const valorEsperado = Number(pagamento.valor || metadata.valor_total || 0);

    console.log("cliente_id:", cliente_id);
    console.log("modelo_id:", modelo_id);
    console.log("valor esperado:", valorEsperado);
    console.log("message_id:", message_id);

    /* =====================================================
       EVENTOS DE FALHA / ESTORNO / CHARGEBACK
    ===================================================== */

if (isFailedEvent) {
  console.log("❌ Evento de falha");

  if (tabelaPagamento === "pagamentos_pix") {
    await client.query(
      `
      UPDATE pagamentos_pix
      SET status = 'falhou'
      WHERE id = $1
      `,
      [pagamento.id]
    );
  } else {
    await client.query(
      `
      UPDATE pagamentos_cartao
      SET status = 'falhou',
          updated_at = NOW()
      WHERE id = $1
      `,
      [pagamento.id]
    );
  }

  await client.query("COMMIT");
  return res.status(200).send("ok");
}

if (isRefundedEvent) {
  console.log("↩️ Evento de estorno");

  if (tabelaPagamento === "pagamentos_pix") {
    await client.query(
      `
      UPDATE pagamentos_pix
      SET status = 'estornado'
      WHERE id = $1
      `,
      [pagamento.id]
    );
  } else {
    await client.query(
      `
      UPDATE pagamentos_cartao
      SET status = 'estornado',
          updated_at = NOW()
      WHERE id = $1
      `,
      [pagamento.id]
    );
  }

  await client.query("COMMIT");
  return res.status(200).send("ok");
}

   if (isChargebackEvent) {
  console.log("🚨 Evento de chargeback");

  if (tabelaPagamento === "pagamentos_pix") {
    await client.query(
      `
      UPDATE pagamentos_pix
      SET status = 'chargeback'
      WHERE id = $1
      `,
      [pagamento.id]
    );
  } else {
    await client.query(
      `
      UPDATE pagamentos_cartao
      SET status = 'chargeback',
          updated_at = NOW()
      WHERE id = $1
      `,
      [pagamento.id]
    );
  }

  await client.query("COMMIT");
  return res.status(200).send("ok");
}

if (!isPaidEvent) {
  console.log("Evento não é de pagamento confirmado, ignorando:", eventType);
  await client.query("ROLLBACK");
  return res.status(200).send("ok");
}

    /* =====================================================
       JÁ PAGO
    ===================================================== */

const statusLocal = String(pagamento.status || "").toLowerCase().trim();
const pagamentoJaFinalizado = ["pago"].includes(statusLocal);

if (pagamentoJaFinalizado) {
  console.log("Pagamento já estava pago");
  await client.query("ROLLBACK");
  return res.status(200).send("ok");
}

    /* =====================================================
       VALIDAÇÃO DE VALOR
    ===================================================== */

    if (valorEsperado > 0 && Math.abs(Number(valorPago) - Number(valorEsperado)) > 0.01) {
      console.log("🚨 Valor divergente", valorPago, valorEsperado);
      await client.query("ROLLBACK");
      return res.status(200).send("ok");
    }

    console.log("Valor validado");

    /* =====================================================
       MIDIA
    ===================================================== */

    if (metadata.tipo === "conteudo_pix" || metadata.tipo === "conteudo_cartao") {
      console.log("💰 Processando compra de mídia");

      const conteudoRes = await client.query(
        `
        SELECT preco
        FROM messages
        WHERE id = $1
        LIMIT 1
        `,
        [message_id]
      );

      if (!conteudoRes.rowCount) {
        console.log("🚨 mensagem não encontrada:", message_id);
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const valorBase = Number(Number(conteudoRes.rows[0].preco).toFixed(2));
      const taxaGateway = Number((valorBase * 0.15).toFixed(2));
      const valorBruto = valorBase;

      const valores = await calcularValores({
        modelo_id,
        valor_bruto: valorBase,
        taxa_gateway: taxaGateway
      });

      console.log("Valores calculados:", valores);

      await client.query(
        `
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
        VALUES ($1,$2,$3,$4,$4,$5,'pago',$6,NOW())
        ON CONFLICT (message_id,cliente_id)
        DO UPDATE SET
          status='pago',
          metodo_pagamento=$6,
          pago_em=NOW(),
          valor_total=$5
        `,
        [
          message_id,
          cliente_id,
          modelo_id,
          valorBase,
          valorPago,
          metodoPagamento
        ]
      );

      console.log("conteudo_pacotes atualizado");

      const conteudo_ids =
        await marcarConteudoComoLiberadoPorPagamento(client, {
          message_id,
          cliente_id,
          modelo_id
        });

      console.log("Conteúdos liberados:", conteudo_ids);

      await client.query(
        `
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
          created_at
        )
        VALUES (
          $1,$2,'midia',
          $3,$4,$5,$6,$7,'pago',NOW()
        )
        `,
        [
          modelo_id,
          cliente_id,
          valorBruto,
          Number(valores.valor_modelo || 0),
          Number(valores.agency_fee || 0),
          Number(valores.velvet_fee || 0),
          taxaGateway
        ]
      );

      console.log("transacoes_agency (midia) inserido");

      dadosParaEmitir = {
        tipo: "conteudo",
        cliente_id,
        modelo_id,
        message_id,
        conteudo_ids
      };
    }

    /* =====================================================
       VIP
    ===================================================== */

   if (metadata.tipo === "vip") {

  console.log("⭐ Processando VIP");
  console.log("VIP metadata:", metadata);
  console.log("VIP cliente_id:", cliente_id);
  console.log("VIP modelo_id:", modelo_id);
  console.log("VIP valorPago:", valorPago);
  console.log("VIP orderId:", orderId);

  const vipExistente = await client.query(
    `
    SELECT id, ativo, expiration_at
    FROM vip_subscriptions
    WHERE cliente_id = $1
      AND modelo_id = $2
    LIMIT 1
    FOR UPDATE
    `,
    [cliente_id, modelo_id]
  );

  console.log("vipExistente.rowCount:", vipExistente.rowCount);
  console.log("vipExistente.rows:", vipExistente.rows);


  const primeiraAssinatura = vipExistente.rowCount === 0;

  console.log("Primeira assinatura?", primeiraAssinatura);

  let valorBase = Number(
    metadata.valor_assinatura ??
    metadata.valor_base ??
    pagamento.valor ??
    0
  );

  if (!Number.isFinite(valorBase) || valorBase <= 0) {
    console.log(
      "🚨 valorBase inválido:",
      metadata.valor_assinatura,
      metadata.valor_base,
      pagamento.valor
    );
    await client.query("ROLLBACK");
    return res.status(200).send("ok");
  }

  valorBase = Number(valorBase.toFixed(2));

  const taxaTransacao = Number(metadata.taxa_transacao || 0);
  const taxaPlataforma = Number(metadata.taxa_plataforma || 0);

  const taxaGateway = Number((valorBase * 0.15).toFixed(2));
  const valorBruto = valorBase;

  const valores = await calcularValores({
    modelo_id,
    valor_bruto: valorBase,
    taxa_gateway: taxaGateway
  });

  const valorModelo = Number(valores.valor_modelo || 0);
  const agencyFee = Number(valores.agency_fee || 0);
  const velvetFee = Number(valores.velvet_fee || 0);

  console.log("Valores VIP:", {
    valorBruto,
    valorModelo,
    agencyFee,
    velvetFee,
    taxaGateway
  });

  let novaExpiracao;

  if (
    vipExistente.rowCount > 0 &&
    vipExistente.rows[0].expiration_at &&
    new Date(vipExistente.rows[0].expiration_at) > new Date()
  ) {

    // renovação antecipada: soma 1 mês sobre a data atual de vencimento
    novaExpiracao = new Date(vipExistente.rows[0].expiration_at);
    novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);

    console.log("Renovando VIP ativo. Nova expiração:", novaExpiracao);
  } else {

    // primeira assinatura ou assinatura expirada
    novaExpiracao = new Date();
    novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);

    console.log("Ativando/Reativando VIP. Nova expiração:", novaExpiracao);
  }

  if (vipExistente.rowCount > 0) {
    await client.query(
      `
      UPDATE vip_subscriptions
      SET
        ativo = true,
        updated_at = NOW(),
        expiration_at = $3,
        valor_assinatura = $4,
        taxa_transacao = $5,
        taxa_plataforma = $6,
        valor_total = $7,
        recorrente = false,
        gateway_subscription_id = $8
      WHERE cliente_id = $1
        AND modelo_id = $2
      `,
      [
        cliente_id,
        modelo_id,
        novaExpiracao,
        valorBase,
        taxaTransacao,
        taxaPlataforma,
        valorPago,
        orderId
      ]
    );

    console.log("vip_subscriptions atualizado (UPDATE)");

  } else {
    await client.query(
      `
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
        $1, $2, true,
        NOW(), NOW(),
        $3, $4, $5, $6, $7,
        false, $8
      )
      `,
      [
        cliente_id,
        modelo_id,
        novaExpiracao,
        valorBase,
        taxaTransacao,
        taxaPlataforma,
        valorPago,
        orderId
      ]
    );

    console.log("vip_subscriptions atualizado (INSERT)");
  }

  await client.query(
    `
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
      created_at
    )
    VALUES (
      $1,$2,'assinatura',
      $3,$4,$5,$6,$7,'pago',NOW()
    )
    `,
    [
      modelo_id,
      cliente_id,
      valorBruto,
      valorModelo,
      agencyFee,
      velvetFee,
      taxaGateway
    ]
  );

  console.log("transacoes_agency (vip) inserido");

  if (primeiraAssinatura) {
    await client.query(
      `
      INSERT INTO messages (
        cliente_id,
        modelo_id,
        text,
        sender,
        tipo,
        created_at,
        lida,
        visto,
        deletada
      )
      VALUES ($1,$2,$3,'modelo','texto',NOW(),false,false,false)
      `,
      [
        cliente_id,
        modelo_id,
        "Oii!! Bem vindo, como vc chama?🔥"
      ]
    );
     console.log("Mensagem de boas-vindas enviada");
  }

  dadosParaEmitir = {
    tipo: "vip",
    cliente_id,
    modelo_id
  };

   console.log("✅ Bloco VIP finalizado com sucesso");
}

/* =====================================================
 MARCAR PAGAMENTO COMO PAGO
===================================================== */

console.log("Marcando pagamento como pago");

if (tabelaPagamento === "pagamentos_pix") {
  await client.query(
    `
    UPDATE pagamentos_pix
    SET status = 'pago',
        pago_em = NOW()
    WHERE id = $1
    `,
    [pagamento.id]
  );
} else if (tabelaPagamento === "pagamentos_cartao") {
  await client.query(
    `
    UPDATE pagamentos_cartao
    SET status = 'pago',
        pago_em = NOW(),
        updated_at = NOW()
    WHERE id = $1
    `,
    [pagamento.id]
  );
}

    console.log("Pagamento atualizado");

/* =====================================================
       COMMIT
 ===================================================== */

await client.query("COMMIT");
console.log("COMMIT realizado");

/* =====================================================
       SOCKET
 ===================================================== */

    try {
      console.log("Emitindo eventos socket");

      if (dadosParaEmitir?.tipo === "conteudo") {
        const sala = `chat_${dadosParaEmitir.cliente_id}_${dadosParaEmitir.modelo_id}`;

        console.log("Emitindo conteudoLiberado para", sala);

        io.to(sala).emit("conteudoLiberado", {
          message_id: Number(dadosParaEmitir.message_id),
          conteudo_ids: dadosParaEmitir.conteudo_ids || []
        });
      }

      if (dadosParaEmitir?.tipo === "vip") {
        const sala = `chat_${dadosParaEmitir.cliente_id}_${dadosParaEmitir.modelo_id}`;

        console.log("Emitindo vipAtivado para", sala);

        io.to(sala).emit("vipAtivado", {
          cliente_id: Number(dadosParaEmitir.cliente_id),
          modelo_id: Number(dadosParaEmitir.modelo_id)
        });
      }
    } catch (e) {
      console.error("Erro emitir socket:", e);
    }

    console.log("✅ PAGAMENTO FINALIZADO");
    return res.status(200).send("ok");

  } catch (err) {
    await client.query("ROLLBACK");

    console.error("🔥 ERRO WEBHOOK PAGARME:", err);

    return res.status(500).send("erro");

  } finally {
    client.release();
    console.log("🔚 conexão liberada");
  }
});

// ===============================
// ROTAS GLOBAIS
// ===============================

app.use(express.json());
const { router: servercontentRouter, calcularValores } = require('./servercontent');
app.use("/api", servercontentRouter);
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin-pages")));
app.use("/icons", express.static(path.join(__dirname, "icons")));
app.use(express.urlencoded({ extended: true }));
app.use("/app", express.static("app"));
app.use(express.static("public"));
app.use((req, res, next) => {
  console.log("➡️ REQ:", req.method, req.url);
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS bloqueado: " + origin));
  },
  credentials: true
}));


app.use((err, req, res, next) => {

  const isProduction = process.env.NODE_ENV === "production";

  console.error("🔥 ERRO GLOBAL:", {
    message: err.message,
    path: req.originalUrl,
    method: req.method,
    stack: isProduction ? undefined : err.stack
  });

  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message
    });
  }

  return res.status(500).json({
    error: "Erro interno do servidor"
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 tentativas
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas. Tente novamente em alguns minutos."
  }
});

// app.use("/api", manutencaoClientes);
// const MANUTENCAO_CLIENTES = true;
// const EXCECOES_MANUTENCAO = [
//   "emersondoido@gmail.com",
//   "emersondoido92@gmail.com"
// ];

// ===============================
// FUNÇÕES
// ===============================

async function marcarConteudoComoLiberadoPorPagamento(
  client,
  { message_id, cliente_id, modelo_id }
) {
  const mid = Number(message_id);
  const cid = Number(cliente_id);
  const moid = Number(modelo_id);

  if (!Number.isInteger(mid) || mid <= 0) throw new Error("message_id inválido");
  if (!Number.isInteger(cid) || cid <= 0) throw new Error("cliente_id inválido");
  if (!Number.isInteger(moid) || moid <= 0) throw new Error("modelo_id inválido");

  const up = await client.query(
`
UPDATE messages
SET visto = true,
    updated_at = NOW()
WHERE id = $1
AND cliente_id = $2
AND modelo_id = $3
RETURNING id
`,
[mid, cid, moid]
);

  if (!up.rowCount) {
    throw new Error("messages não encontrada / não pertence ao cliente/modelo");
  }

  const conteudos = await client.query(
    `
    SELECT mc.conteudo_id
      FROM messages_conteudos mc
     WHERE mc.message_id = $1
    `,
    [mid]
  );

  return conteudos.rows
    .map((r) => Number(r.conteudo_id))
    .filter((n) => Number.isInteger(n) && n > 0);
}

// ===========================
// EMAIL E CPF VALIDO
// ===========================

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarCPF(cpf) {
const cpfLimpo = String(cpf || "").replace(/\D/g, "");

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  let soma = 0;
  let resto;

  for (let i = 1; i <= 9; i++)
    soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);

  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++)
    soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);

  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;

  return resto === parseInt(cpf.substring(10, 11));
}

// ===========================
// MSG NÃO LIDA 
// ===========================

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

// ===========================
// ATUALIZACAO INBOX
// ===========================

function emitirInboxUpdate(io, { cliente_id, modelo_id, sender, text, created_at }) {
  const payload = {
    cliente_id,
    modelo_id,
    ultima_mensagem: text,
    ultima_mensagem_em: created_at,
    sender,
    visto: false,
    lida: false
  };

  io.to(`inbox_modelo_${modelo_id}`).emit("inboxMessage", payload);
  io.to(`inbox_cliente_${cliente_id}`).emit("inboxMessage", payload);
}

// ===========================
// UPLOAD MIDIAS
// ===========================

async function uploadCloudflareImage(fileBuffer, filename) {

  const form = new FormData();
  form.append("file", fileBuffer, filename);

  const res = await axios.post(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/images/v1`,
    form,
    {
      headers: {
        Authorization: `Bearer ${process.env.CF_IMAGES_TOKEN}`,
        ...form.getHeaders()
      }
    }
  );

  return res.data.result;
}

async function uploadVideoCloudflare(buffer, filename) {
  try {

    const form = new FormData();
    form.append("file", buffer, filename);

    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/stream`,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.CF_STREAM_TOKEN}`,
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    if (!res.data || !res.data.success) {
      throw new Error("Falha no upload para Cloudflare Stream");
    }

    return res.data.result; // retorna uid, thumbnail, etc

  } catch (err) {

    console.error("Erro upload Cloudflare:", err.response?.data || err.message);
    throw err;

  }
}

// ===========================
// MARCAR MIDIA VISTA
// ===========================

async function buscarConteudosJaPossuidosPorCliente(client, { cliente_id, modelo_id }) {
  const result = await client.query(
    `
    SELECT DISTINCT mc.conteudo_id
    FROM messages m
    JOIN messages_conteudos mc
      ON mc.message_id = m.id
    WHERE m.modelo_id = $1
      AND m.cliente_id = $2
      AND m.visto = true
      AND m.deletada IS NOT TRUE
    `,
    [modelo_id, cliente_id]
  );

  return new Set(
    result.rows
      .map(r => Number(r.conteudo_id))
      .filter(id => Number.isInteger(id) && id > 0)
  );
}

// ===========================
// ENVIAR PUSH
// ===========================

async function enviarPush(subscription, mensagem, url = "/inbox.html") {
  const payload = JSON.stringify({
    title: "Nova mensagem",
    body: mensagem,
    url
  });

  await webpush.sendNotification(subscription, payload);
}

async function notificarNovaMensagem(userIdDestino, textoMensagem, url = "/inbox.html") {
  try {
    if (
      !process.env.VAPID_SUBJECT ||
      !process.env.VAPID_PUBLIC_KEY ||
      !process.env.VAPID_PRIVATE_KEY
    ) {
      console.warn("Push ignorado: VAPID não configurado");
      return;
    }

    const subRes = await db.query(
      `
      SELECT subscription_json
      FROM push_subscriptions
      WHERE user_id = $1
      LIMIT 1
      `,
      [userIdDestino]
    );

    if (subRes.rowCount === 0) {
      console.log("Usuário sem subscription push:", userIdDestino);
      return;
    }

    const subscription = subRes.rows[0].subscription_json;

    await enviarPush(subscription, textoMensagem, url);
    console.log("Push enviado para user_id:", userIdDestino);
  } catch (err) {
    console.error("Erro ao enviar push:", err);

    if (err.statusCode === 404 || err.statusCode === 410) {
      await db.query(
        `DELETE FROM push_subscriptions WHERE user_id = $1`,
        [userIdDestino]
      );
      console.log("Subscription removida por expiração:", userIdDestino);
    }
  }
}

// function manutencaoClientes(req, res, next) {
//   if (!MANUTENCAO_CLIENTES) return next();
//   if (!req.user) return next();
//   if (req.user.role !== "cliente") return next();
//   if (EXCECOES_MANUTENCAO.includes(req.user.email)) {
//     return next();
//   }
//   return res.status(503).json({
//     error: "Plataforma em atualização. Aguarde alguns minutos e tente novamente."
//   });
// }

// // 📦 FEED CANÔNICO (FONTE ÚNICA)
// async function buscarFeedCompletoPorModeloId(modelo_id) {
//   const result = await db.query(
//     `
//     SELECT
//       id,
//       url,
//       tipo,
//       tipo_conteudo,
//       preco,
//       descricao,
//       thumbnail_url,
//       criado_em
//     FROM conteudos
//     WHERE modelo_id = $1
//       AND ativo = TRUE   -- 🔥 FILTRO QUE FALTAVA
//       AND (
//         tipo_conteudo != 'venda'
//         OR (tipo_conteudo = 'venda' AND COALESCE(preco, 0) > 0)
//       )
//     ORDER BY id DESC
//     `,
//     [modelo_id]
//   );

//   return result.rows;
// }


// ===========================
// SOCKETS
// ===========================

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Sem token"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id || !decoded?.role) {
      return next(new Error("Token inválido"));
    }

    socket.user = {
      id: decoded.id,
      role: decoded.role
    };

    return next();
  } catch (err) {
    console.error("❌ Erro auth socket:", err);
    return next(new Error("Falha na autenticação"));
  }
});

io.on("connection", (socket) => {
  console.log("🔥 Socket conectado:", socket.id, socket.user);

  socket.on("loginModelo", async () => {
    try {
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

      if (!onlineModelos.has(modeloIdReal)) {
        onlineModelos.set(modeloIdReal, new Set());
      }

      onlineModelos.get(modeloIdReal).add(socket.id);

      console.log("🟣 Modelo online:", modeloIdReal);
    } catch (err) {
      console.error("❌ Erro loginModelo:", err);
    }
  });




// 📥 ENTRAR NA SALA DO CHAT

socket.on("joinChat", async ({ cliente_id, modelo_id } = {}, callback) => {
    try {
      if (!socket.user) {
        callback?.({ ok: false, error: "Usuário não autenticado" });
        return;
      }

      cliente_id = Number(cliente_id);
      modelo_id = Number(modelo_id);

      if (
        !Number.isInteger(cliente_id) ||
        !Number.isInteger(modelo_id)
      ) {
        callback?.({ ok: false, error: "IDs inválidos" });
        return;
      }

      if (socket.user.role === "cliente") {
        const clienteRes = await db.query(
          "SELECT id FROM clientes WHERE user_id = $1",
          [socket.user.id]
        );

        if (clienteRes.rowCount === 0) {
          callback?.({ ok: false, error: "Cliente não encontrado" });
          return;
        }

        const clienteIdReal = clienteRes.rows[0].id;

        if (clienteIdReal !== cliente_id) {
          callback?.({ ok: false, error: "Cliente inválido" });
          return;
        }
      } else if (socket.user.role === "modelo") {
        const modeloRes = await db.query(
          "SELECT id FROM modelos WHERE user_id = $1",
          [socket.user.id]
        );

        if (modeloRes.rowCount === 0) {
          callback?.({ ok: false, error: "Modelo não encontrado" });
          return;
        }

        const modeloIdReal = modeloRes.rows[0].id;

        if (modeloIdReal !== modelo_id) {
          callback?.({ ok: false, error: "Modelo inválido" });
          return;
        }
      } else {
        callback?.({ ok: false, error: "Role inválida" });
        return;
      }

      const sala = `chat_${cliente_id}_${modelo_id}`;
      socket.join(sala);

      console.log("🟪 Entrou na sala segura:", sala);
      callback?.({ ok: true, sala });
    } catch (err) {
      console.error("❌ Erro no joinChat:", err);
      callback?.({ ok: false, error: "Erro interno ao entrar no chat" });
    }
  });


socket.on("joinInbox", async (payload, callback) => {
    try {
      if (typeof payload === "function") {
        callback = payload;
        payload = {};
      }

      if (!socket.user) {
        callback?.({ ok: false, error: "Usuário não autenticado" });
        return;
      }

      if (socket.user.role === "cliente") {
        const clienteRes = await db.query(
          "SELECT id FROM clientes WHERE user_id = $1",
          [socket.user.id]
        );

        if (!clienteRes.rowCount) {
          callback?.({ ok: false, error: "Cliente não encontrado" });
          return;
        }

        const cliente_id = clienteRes.rows[0].id;
        const sala = `inbox_cliente_${cliente_id}`;

        socket.join(sala);
        console.log("📬 Inbox cliente conectada:", sala);
        callback?.({ ok: true, sala, tipo: "cliente" });
        return;
      }

      if (socket.user.role === "modelo") {
        const modeloRes = await db.query(
          "SELECT id FROM modelos WHERE user_id = $1",
          [socket.user.id]
        );

        if (!modeloRes.rowCount) {
          callback?.({ ok: false, error: "Modelo não encontrado" });
          return;
        }

        const modelo_id = modeloRes.rows[0].id;
        const sala = `inbox_modelo_${modelo_id}`;

        socket.join(sala);
        console.log("📬 Inbox modelo conectada:", sala);
        callback?.({ ok: true, sala, tipo: "modelo" });
        return;
      }

      callback?.({ ok: false, error: "Role inválida" });
    } catch (err) {
      console.error("❌ Erro no joinInbox:", err);
      callback?.({ ok: false, error: "Erro interno ao entrar na inbox" });
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

      if (!onlineClientes.has(clienteIdReal)) {
        onlineClientes.set(clienteIdReal, new Set());
      }

      onlineClientes.get(clienteIdReal).add(socket.id);

      console.log("🟢 Cliente online:", clienteIdReal, socket.id);

      await db.query(
        `UPDATE clientes SET last_seen = NULL WHERE id = $1`,
        [clienteIdReal]
      );
    } catch (err) {
      console.error("❌ Erro loginCliente:", err);
    }
  });

  socket.on("disconnect", async () => {
    console.log("🔴 Socket desconectado:", socket.id);

    try {
      if (socket.cliente_id) {
        const set = onlineClientes.get(socket.cliente_id);

        if (set) {
          set.delete(socket.id);

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
    } catch (err) {
      console.error("❌ Erro no disconnect:", err);
    }
  });

// 💬 ENVIAR MENSAGEM (ÚNICO)
socket.on("sendMessage", async (data, callback) => {
  const { cliente_id, modelo_id, text, tempId } = data || {};

  const clienteIdNum = Number(cliente_id);
  const modeloIdNum = Number(modelo_id);

  if (!socket.user) {
    console.log("❌ Socket sem usuário");
    callback?.({ ok: false });
    return;
  }

  if (
    !Number.isInteger(clienteIdNum) ||
    !Number.isInteger(modeloIdNum) ||
    !text ||
    typeof text !== "string"
  ) {
    console.log("❌ sendMessage inválido");
    callback?.({ ok: false });
    return;
  }

  try {
    // 🔒 VALIDAR IDENTIDADE REAL
    if (socket.user.role === "cliente") {
      const clienteRes = await db.query(
        "SELECT id FROM clientes WHERE user_id = $1",
        [socket.user.id]
      );

      if (!clienteRes.rowCount) {
        callback?.({ ok: false });
        return;
      }

      const clienteIdReal = clienteRes.rows[0].id;

      if (clienteIdReal !== clienteIdNum) {
        callback?.({ ok: false });
        return;
      }

    } else if (socket.user.role === "modelo") {
      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [socket.user.id]
      );

      if (!modeloRes.rowCount) {
        callback?.({ ok: false });
        return;
      }

      const modeloIdReal = modeloRes.rows[0].id;

      if (modeloIdReal !== modeloIdNum) {
        callback?.({ ok: false });
        return;
      }

    } else {
      callback?.({ ok: false });
      return;
    }

    const sala = `chat_${clienteIdNum}_${modeloIdNum}`;
    const sender = socket.user.role;
    const unreadFor = sender === "cliente" ? "modelo" : "cliente";

    // 1️⃣ SALVAR NO BANCO
    const result = await db.query(
      `
      INSERT INTO messages
        (cliente_id, modelo_id, sender, tipo, text, visto)
      VALUES ($1, $2, $3, 'texto', $4, false)
      RETURNING id, created_at
      `,
      [clienteIdNum, modeloIdNum, sender, text]
    );

    const message = result.rows[0];

    // 2️⃣ MARCAR COMO NÃO LIDA
    await db.query(
      `
      INSERT INTO unread (cliente_id, modelo_id, unread_for, has_unread)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (cliente_id, modelo_id)
      DO UPDATE SET
        unread_for = EXCLUDED.unread_for,
        has_unread = true
      `,
      [clienteIdNum, modeloIdNum, unreadFor]
    );

    // 3️⃣ REALTIME CHAT
    io.to(sala).emit("newMessage", {
      id: message.id,
      tempId,
      cliente_id: clienteIdNum,
      modelo_id: modeloIdNum,
      sender,
      tipo: "texto",
      text,
      visto: false,
      created_at: message.created_at
    });

    // 4️⃣ ATUALIZAR INBOX
    emitirInboxUpdate(io, {
      cliente_id: clienteIdNum,
      modelo_id: modeloIdNum,
      sender,
      text,
      created_at: message.created_at
    });

    // 5️⃣ PUSH NOTIFICATION
    try {
      let userIdDestino = null;
      let pushUrl = "/inbox.html";

      if (sender === "cliente") {
        const modeloDestinoRes = await db.query(
          `
          SELECT user_id
          FROM modelos
          WHERE id = $1
          LIMIT 1
          `,
          [modeloIdNum]
        );

        userIdDestino = modeloDestinoRes.rows[0]?.user_id || null;
        pushUrl = "/inbox.html";
      } else if (sender === "modelo") {
        const clienteDestinoRes = await db.query(
          `
          SELECT user_id
          FROM clientes
          WHERE id = $1
          LIMIT 1
          `,
          [clienteIdNum]
        );

        userIdDestino = clienteDestinoRes.rows[0]?.user_id || null;
        pushUrl = "/inboxc.html";
      }

      console.log("[push] sender:", sender);
      console.log("[push] cliente_id:", clienteIdNum);
      console.log("[push] modelo_id:", modeloIdNum);
      console.log("[push] userIdDestino:", userIdDestino);

      if (userIdDestino) {
        await notificarNovaMensagem(
          userIdDestino,
          text.trim() ? text.trim().slice(0, 120) : "Você recebeu uma nova mensagem",
          pushUrl
        );
      }
    } catch (pushErr) {
      console.error("Erro ao disparar push de mensagem:", pushErr);
    }

    // ✅ ACK PARA QUEM ENVIOU
    callback?.({
      ok: true,
      message_id: message.id,
      tempId
    });

  } catch (err) {
    console.error("🔥 ERRO AO SALVAR MENSAGEM:", err);
    callback?.({ ok: false });
  }
});

// 📜 HISTÓRICO DO CHAT

socket.on("getHistory", async ({ cliente_id, modelo_id, offset = 0, limit = 20 } = {}) => {
  const clienteIdNum = Number(cliente_id);
  const modeloIdNum = Number(modelo_id);
  const offsetNum = Number(offset);
  const limitNum = Number(limit);

  if (!socket.user) return;

  if (
    !Number.isInteger(clienteIdNum) ||
    !Number.isInteger(modeloIdNum) ||
    !Number.isInteger(offsetNum) ||
    !Number.isInteger(limitNum)
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

      if (clienteIdReal !== clienteIdNum) return;

    } else if (socket.user.role === "modelo") {
      const modeloRes = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [socket.user.id]
      );

      if (!modeloRes.rowCount) return;

      const modeloIdReal = modeloRes.rows[0].id;

      if (modeloIdReal !== modeloIdNum) return;

    } else {
      return;
    }

    // 1️⃣ LIMPAR UNREAD
    await db.query(
      `
      UPDATE unread
      SET has_unread = false
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND unread_for = $3
      `,
      [clienteIdNum, modeloIdNum, socket.user.role]
    );

    // 2️⃣ MARCAR COMO LIDA (SE CLIENTE)
    if (socket.user.role === "cliente") {
      await db.query(
        `
        UPDATE messages
        SET lida = true
        WHERE cliente_id = $1
          AND modelo_id = $2
          AND sender = 'modelo'
          AND lida = false
        `,
        [clienteIdNum, modeloIdNum]
      );

      io.to(`inbox_modelo_${modeloIdNum}`).emit("mensagemLida", {
        cliente_id: clienteIdNum,
        modelo_id: modeloIdNum
      });
    }

    // 3️⃣ BUSCAR HISTÓRICO
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
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [clienteIdNum, modeloIdNum, limitNum, offsetNum]
    );

    const mensagens = result.rows.reverse();

    // 4️⃣ TRATAR MENSAGENS DE CONTEÚDO
    const mensagensConteudo = mensagens.filter(
      m => m.tipo === "conteudo" || m.tipo === "conteudo_ppv_mass"
    );

    const messageIds = mensagensConteudo.map(m => m.id);

    if (messageIds.length > 0) {
      const midiasRes = await db.query(
        `
        SELECT
          mc.message_id,
          mc.conteudo_id,
          c.url,
          c.thumbnail_url,
          c.tipo AS tipo_media
        FROM messages_conteudos mc
        JOIN conteudos c ON c.id = mc.conteudo_id
        WHERE mc.message_id = ANY($1)
        `,
        [messageIds]
      );

      const mapaMidias = {};

      for (const row of midiasRes.rows) {
        if (!mapaMidias[row.message_id]) {
          mapaMidias[row.message_id] = [];
        }

        mapaMidias[row.message_id].push({
          conteudo_id: Number(row.conteudo_id),
          url: row.url,
          thumbnail_url: row.thumbnail_url,
          tipo_media: row.tipo_media
        });
      }

      const pagosRes = await db.query(
        `
        SELECT message_id
        FROM conteudo_pacotes
        WHERE message_id = ANY($1)
          AND cliente_id = $2
          AND status = 'pago'
        `,
        [messageIds, clienteIdNum]
      );

      const pagosSet = new Set(
        pagosRes.rows.map(r => Number(r.message_id))
      );

      const conteudosPossuidosSet = await buscarConteudosJaPossuidosPorCliente(db, {
        cliente_id: clienteIdNum,
        modelo_id: modeloIdNum
      });

      for (const msg of mensagensConteudo) {
        const midias = mapaMidias[msg.id] || [];
        const pago = Number(msg.preco) > 0 ? pagosSet.has(Number(msg.id)) : true;
        const ehPPVMass = msg.tipo === "conteudo_ppv_mass";

        msg.midias = midias.map(midia => {
          const jaPossuia = ehPPVMass
            ? conteudosPossuidosSet.has(Number(midia.conteudo_id))
            : false;

          return {
            ...midia,
            ja_possuia: jaPossuia,
            liberado: pago || jaPossuia,
            bloqueado: !(pago || jaPossuia)
          };
        });

        msg.quantidade = msg.midias.length;

        if (Number(msg.preco) > 0) {
          msg.liberado = pago;
          msg.bloqueado = !pago;
          msg.tem_parcial_liberado = msg.midias.some(m => m.liberado);
          msg.tem_parcial_bloqueado = msg.midias.some(m => m.bloqueado);
        } else {
          msg.liberado = true;
          msg.bloqueado = false;
          msg.tem_parcial_liberado = msg.midias.length > 0;
          msg.tem_parcial_bloqueado = false;
        }
      }
    }

    // 5️⃣ ENVIAR APENAS PARA QUEM PEDIU
    socket.emit("chatHistory", mensagens);

  } catch (err) {
    console.error("❌ Erro getHistory:", err);
  }
});

socket.on("sendConteudo", async ({
  cliente_id,
  modelo_id,
  conteudos_ids,
  preco
} = {}) => {
  const clienteIdNum = Number(cliente_id);
  const modeloIdNum = Number(modelo_id);

  try {
    if (!socket.user || socket.user.role !== "modelo") {
      return;
    }

    if (
      !Number.isInteger(clienteIdNum) ||
      !Number.isInteger(modeloIdNum)
    ) return;

    if (!Array.isArray(conteudos_ids)) return;

    // 🔒 1️⃣ VALIDAR MODELO REAL
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [socket.user.id]
    );

    if (!modeloRes.rowCount) return;

    const modeloIdReal = modeloRes.rows[0].id;

    if (modeloIdReal !== modeloIdNum) return;

    // 🔒 2️⃣ SANITIZAR IDS
    const conteudosIdsNum = conteudos_ids
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0);

    if (conteudosIdsNum.length === 0) return;

    // 🔒 3️⃣ VALIDAR QUE OS CONTEÚDOS PERTENCEM À MODELO
    const validosRes = await db.query(
      `
      SELECT id
      FROM conteudos
      WHERE id = ANY($1)
        AND modelo_id = $2
      `,
      [conteudosIdsNum, modeloIdNum]
    );

    const idsValidos = validosRes.rows.map(r => r.id);

    if (idsValidos.length === 0) return;

    let precoNum = Number(preco);

    if (!Number.isFinite(precoNum) || precoNum < 0) {
      precoNum = 0;
    }

    precoNum = Number(precoNum.toFixed(2));

    const sala = `chat_${clienteIdNum}_${modeloIdNum}`;

    // 4️⃣ CRIAR MENSAGEM
    const msgRes = await db.query(
      `
      INSERT INTO messages
        (cliente_id, modelo_id, sender, tipo, preco, visto, created_at)
      VALUES
        ($1, $2, 'modelo', 'conteudo', $3, false, NOW())
      RETURNING id, created_at
      `,
      [clienteIdNum, modeloIdNum, precoNum]
    );

    const message = msgRes.rows[0];

    // 5️⃣ ASSOCIAR MÍDIAS
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
    await db.query(
      `
      INSERT INTO unread (cliente_id, modelo_id, unread_for, has_unread)
      VALUES ($1, $2, 'cliente', true)
      ON CONFLICT (cliente_id, modelo_id)
      DO UPDATE SET has_unread = true
      `,
      [clienteIdNum, modeloIdNum]
    );

    // 🔥 CHAT
    io.to(sala).emit("newMessage", {
      id: message.id,
      cliente_id: clienteIdNum,
      modelo_id: modeloIdNum,
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
    io.to(`inbox_modelo_${modeloIdNum}`).emit("inboxMessage", {
      cliente_id: clienteIdNum,
      modelo_id: modeloIdNum,
      sender: "modelo",
      tipo: "conteudo",
      textoPreview:
        precoNum > 0
          ? `📦 Conteúdo pago (${midias.length})`
          : `📦 Conteúdo (${midias.length})`,
      created_at: message.created_at
    });

    // 🔔 INBOX CLIENTE
    io.to(`inbox_cliente_${clienteIdNum}`).emit("inboxMessage", {
      cliente_id: clienteIdNum,
      modelo_id: modeloIdNum,
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
} = {}) => {
  const messageIdNum = Number(message_id);
  const clienteIdNum = Number(cliente_id);
  const modeloIdNum = Number(modelo_id);

  try {
    if (!socket.user || socket.user.role !== "cliente") {
      return socket.disconnect();
    }

    if (
      !Number.isInteger(messageIdNum) ||
      !Number.isInteger(clienteIdNum) ||
      !Number.isInteger(modeloIdNum)
    ) return;

    // 🔒 CONVERTER users.id → cliente_id real
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [socket.user.id]
    );

    if (!clienteRes.rowCount) return;

    const clienteIdReal = clienteRes.rows[0].id;

    if (clienteIdReal !== clienteIdNum) return;

    // ✅ marcar como visto
    await db.query(
      `
      UPDATE messages
      SET visto = true
      WHERE id = $1
        AND cliente_id = $2
        AND modelo_id = $3
      `,
      [messageIdNum, clienteIdNum, modeloIdNum]
    );

    // 🔥 avisar sala
    const sala = `chat_${clienteIdNum}_${modeloIdNum}`;

    io.to(sala).emit("conteudoVisto", {
      message_id: messageIdNum
    });

  } catch (err) {
    console.error("❌ Erro marcarConteudoVisto:", err);
  }
});

socket.on("editarMensagem", async ({ id, text } = {}) => {
  try {

    if (!socket.user || socket.user.role !== "modelo") {
      return;
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


socket.on("excluirMensagem", async ({ id } = {}) => {
  try {

    if (!socket.user || socket.user.role !== "modelo") return;

    const messageId = Number(id);
    if (!Number.isInteger(messageId)) return;

    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [socket.user.id]
    );

    if (!modeloRes.rowCount) return;

    const modeloIdReal = modeloRes.rows[0].id;

    const msgRes = await db.query(`
      SELECT cliente_id, modelo_id
      FROM messages
      WHERE id = $1
      AND sender = 'modelo'
    `,[messageId]);

    if (!msgRes.rowCount) return;

    const { cliente_id, modelo_id } = msgRes.rows[0];

    if (modelo_id !== modeloIdReal) return;

    const del = await db.query(`
      UPDATE messages
      SET deletada = true
      WHERE id = $1
      AND modelo_id = $2
      AND sender = 'modelo'
    `,[messageId, modeloIdReal]);

    if (del.rowCount === 0) return;

    console.log("DELETE rows:", del.rowCount);

    const sala = `chat_${cliente_id}_${modelo_id}`;

    io.to(sala).emit("mensagemExcluida", {
      id: messageId
    });

  } catch (err) {
    console.error("Erro ao excluir mensagem:", err);
  }
});



});

// ===============================
// ROTAS GET - BUSCA DE DADOS
// ===============================

// ===========================
// HEALTH DB
// ===========================

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

// ===========================
// MANIFEST
// ===========================

app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "manifest.json"));
});

// ===========================
// PUBLIC KEY
// ===========================

app.get("/api/push/public-key", (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({ error: "Chave pública não configurada" });
  }

  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// ===========================
// VALOR ASSINATURA
// ===========================

app.get("/api/modelo/planos/me", auth, authModelo, async (req, res) => {
  try {

    const plano = await db.query(
  `SELECT COALESCE(valor_mensal, 20.00) AS valor_mensal
   FROM modelos_planos
   WHERE modelo_id = $1
   LIMIT 1`,
  [req.modelo_id]
);

res.json(plano.rows[0] || { valor_mensal: 20 });

  } catch (err) {
    console.error("Erro buscar plano:", err);
    res.status(500).json({ erro: "Erro ao buscar plano" });
  }
});

// ===========================
// INFO MODELO NO CHAT
// ===========================

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

// ===========================
// DADOS.HTML
// ===========================

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

// ===========================
// PERFIL.HTML
// ===========================

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

// ===========================
// VIPS.HTML
// ===========================

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

// ===========================
// OFERTAS ENCERRADAS
// ===========================

app.get("/api/ofertas", authModelo, async (req, res) => {
  try {

    await db.query("SELECT encerrar_ofertas_expiradas()");

    const result = await db.query(
      `
      SELECT *
      FROM ofertas
      WHERE modelo_id = $1
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [req.modelo_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Erro buscar ofertas:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ===========================
// OFERTA ATIVAS
// ===========================

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

// ===========================
// STATUS VIP
// ===========================

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
      ORDER BY expiration_at DESC
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

// ===========================
// PWA
// ===========================

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

// ===========================
// PERFIL MODELO
// ===========================

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

    return res.json({
      user_id: req.user.id,
      role: req.user.role
    });

  } catch (err) {
    console.error("Erro /api/me:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ===========================
// FEED DO PERFIL
// ===========================

app.get("/api/modelo/publico/:id/feed", async (req, res) => {

  const modeloId = Number(req.params.id);

const { rows } = await db.query(`
SELECT id,url,thumbnail_url,tipo,tipo_conteudo,preco,descricao
FROM conteudos
WHERE modelo_id = $1
AND ativo = TRUE
AND tipo_conteudo = 'feed'
AND (preco IS NULL OR preco = 0)
ORDER BY id DESC
`,[modeloId]);

  res.json(rows);

});

// ===========================
// PREMIUM PERFIL
// ===========================

app.get("/api/modelo/publico/:id/premium", async (req, res) => {

  const modeloId = Number(req.params.id);

  const { rows } = await db.query(`
    SELECT 
      id,
      url,
      thumbnail_url,
      tipo,
      tipo_conteudo,
      preco,
      descricao,
      criado_em
    FROM conteudos
    WHERE modelo_id = $1
      AND tipo_conteudo = 'venda'
      AND preco IS NOT NULL
      AND preco > 0
    ORDER BY id DESC
  `,[modeloId]);

  res.json(rows);

});


// ===========================
// PERFIL MODELO VERIFICADA
// ===========================

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

// ===========================
// FEED.HTML
// ===========================

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
  m.bio,

  COALESCE(r.ganhos_mes, 0) AS ganhos_total,

  ver.verificado_em AS aprovado_em,

  CASE 
    WHEN ver.verificado_em >= NOW() - INTERVAL '5 days'
    THEN true
    ELSE false
  END AS is_new

FROM modelos m

JOIN LATERAL (
  SELECT status, verificado_em
  FROM modelos_verificacao
  WHERE modelo_id = m.id
  ORDER BY verificado_em DESC
  LIMIT 1
) ver ON true

LEFT JOIN LATERAL (

  SELECT SUM(valor_modelo) AS ganhos_mes
  FROM transacoes_agency t
  WHERE t.modelo_id = m.id
  AND date_trunc('month', t.created_at) = date_trunc('month', NOW())

) r ON true

WHERE ver.status = 'aprovado'
AND m.feed = true

ORDER BY ganhos_total DESC
`);

    const modelos = result.rows;

    // definir ranking top
    modelos.forEach((m, i) => {
      if (i === 0) m.top1 = true;
      if (i === 1) m.top2 = true;
      if (i === 2) m.top3 = true;
    });

    res.json(modelos);

  } catch (err) {
    console.error("Erro feed modelos:", err);
    res.status(500).json([]);
  }
});

// ===========================
// PERFIL PUBLICO MODELO
// ===========================

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

// ===========================
// INFO MODELOS NO CHAT CLT
// ===========================

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

// ===========================
// NÃO LIDAS CLIENTE
// ===========================

app.get("/api/chat/unread/cliente", authCliente, async (req, res) => {
  try {

    const ids = await buscarUnreadCliente(req.cliente_id);

    res.json(ids);

  } catch (err) {
    console.error("Erro unread cliente:", err);
    res.status(500).json([]);
  }
});

// ===========================
// MSG NÃO LIDA - MODELOS
// ===========================

app.get("/api/chat/unread/modelo", authModelo, async (req, res) => {
  try {

    const ids = await buscarUnreadModelo(req.modelo_id);

    res.json(ids);

  } catch (err) {
    console.error("Erro unread modelo:", err);
    res.status(500).json([]);
  }
});

// ===========================
// INFOS CLIENTE
// ===========================

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

// ===========================
// LISTA VIPS
// ===========================

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

// ===========================
// CONTEUDOS.HTML
// ===========================

app.get( "/conteudos.html", authModelo, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "conteudos.html"));
  }
);

// =============================
// LISTA INBOX CLIENTE
// =============================

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

/// ===========================
// LISTA INBOX MODELO
// ============================

app.get("/api/chat/modelo", authModelo, async (req, res) => {
  try {

    const userId = req.user.id;

    const modeloResult = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [userId]
    );

    if (modeloResult.rows.length === 0) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    const modeloId = modeloResult.rows[0].id;
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const { rows } = await db.query(`

      SELECT
  c.id AS cliente_id,
  c.nome,
  cd.username,
  cd.avatar AS avatar,
  msg.text       AS ultima_mensagem,
  msg.created_at AS ultima_mensagem_em,
  msg.sender     AS ultimo_sender,
  COALESCE(msg.visto, false) AS visto,
  COALESCE(msg.lida, false)  AS lida,
  COALESCE(g.total_gasto,0) AS total_gasto,

  CASE
    WHEN COALESCE(g.total_gasto,0) >= 300 THEN '$$$'
    WHEN COALESCE(g.total_gasto,0) >= 200 THEN '$$'
    WHEN COALESCE(g.total_gasto,0) > 100 THEN '$'
    ELSE ''
  END AS spend_level

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

LEFT JOIN LATERAL (
  SELECT SUM(valor_bruto) AS total_gasto
  FROM transacoes_agency t
  WHERE t.cliente_id = c.id
    AND t.modelo_id  = $1
    AND t.status = 'pago'
    AND t.tipo = 'midia'
) g ON true

WHERE v.modelo_id = $1
  AND v.ativo = true
  AND v.expiration_at > NOW()

ORDER BY ultima_mensagem_em DESC NULLS LAST
LIMIT $2 OFFSET $3;

    `, [modeloId, limit, offset]);

    res.json(rows);

  } catch (err) {
    console.error("Erro ao buscar chats da modelo:", err);
    res.status(500).json({ error: "Erro ao buscar chats" });
  }
});

// =============================
// INFOS CLIENTE CHAT MODELO
// =============================

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

// ===========================
// INFO CLIENTE CHAT
// ===========================

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

// ===========================
// MENSAGEM COM CONTEUDO
// ===========================

app.get("/api/chat/conteudo/:message_id", authCliente, async (req, res) => {
  const message_id = Number(req.params.message_id);

  if (!Number.isInteger(message_id) || message_id <= 0) {
    return res.status(400).json({ error: "message_id inválido" });
  }

  try {
    const messageCheck = await db.query(
      `
      SELECT id, visto, preco, modelo_id, pacote_id, tipo
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

    const pagoRes = await db.query(
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

    const pacotePago = !!pagoRes.rowCount;
    const mensagemLiberada = mensagem.visto === true || pacotePago;

    const result = await db.query(
      `
      SELECT
        mc.conteudo_id,
        c.url,
        c.tipo AS tipo_media,
        c.thumbnail_url
      FROM messages_conteudos mc
      JOIN conteudos c ON c.id = mc.conteudo_id
      WHERE mc.message_id = $1
      `,
      [message_id]
    );

    // conteúdo grátis ou mensagem totalmente liberada
    if (preco <= 0 || mensagemLiberada) {
      return res.json(
        result.rows.map(row => ({
          conteudo_id: Number(row.conteudo_id),
          url: row.url,
          tipo_media: row.tipo_media,
          thumbnail_url: row.thumbnail_url,
          liberado: true,
          bloqueado: false,
          ja_possuia: true
        }))
      );
    }

    // daqui pra baixo: mensagem paga e ainda não liberada por completo

    const ehMass = mensagem.tipo === "conteudo_ppv_mass";
    // envio pago normal continua igual
    if (!ehMass) {
      return res.status(403).json({ error: "Conteúdo não liberado" });
    }

    // PPV mass: libera individualmente o que o cliente já possuía
    const conteudosPossuidosSet = await buscarConteudosJaPossuidosPorCliente(db, {
      cliente_id: req.cliente_id,
      modelo_id: Number(mensagem.modelo_id)
    });

    const midias = result.rows.map(row => {
      const conteudoId = Number(row.conteudo_id);
      const jaPossuia = conteudosPossuidosSet.has(conteudoId);

      return {
        conteudo_id: conteudoId,
        url: row.url,
        tipo_media: row.tipo_media,
        thumbnail_url: row.thumbnail_url,
        ja_possuia: jaPossuia,
        liberado: jaPossuia,
        bloqueado: !jaPossuia
      };
    });

    const algumaLiberada = midias.some(m => m.liberado);

    if (!algumaLiberada) {
      return res.status(403).json({ error: "Conteúdo não liberado" });
    }

    return res.json(midias);

  } catch (err) {
    console.error("Erro buscar conteúdo liberado:", err);
    res.status(500).json([]);
  }
});


// ===========================
// CHAT CONTEUDOS JA VISTOS
// ===========================

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

// ===========================
// CHAT STATUS CONTEUDO
// ===========================

app.get("/api/chat/conteudo-status/:message_id", authCliente, async (req, res) => {
  const message_id = Number(req.params.message_id);
  if (!Number.isInteger(message_id) || message_id <= 0) {
    return res.status(400).json({ liberado: false });
  }

  try {
    const msg = await db.query(
      `SELECT visto, preco FROM messages WHERE id = $1 AND cliente_id = $2`,
      [message_id, req.cliente_id]
    );
    if (!msg.rowCount) return res.json({ liberado: false });

    const { visto } = msg.rows[0];

    if (visto === true) return res.json({ liberado: true });

    const pago = await db.query(
      `
      SELECT 1
      FROM conteudo_pacotes
      WHERE message_id = $1 AND cliente_id = $2 AND status = 'pago'
      LIMIT 1
      `,
      [message_id, req.cliente_id]
    );

    return res.json({ liberado: !!pago.rowCount });
  } catch (err) {
    console.error("Erro conteudo-status:", err);
    return res.status(500).json({ liberado: false });
  }
});

// ===========================
// MIDIAS NO POPUP CHAT
// ===========================

app.get("/api/conteudos", authModelo, async (req, res) => {

  const { page = 1, limit = 10 } = req.query;

  try {

    const pagina = Number(page);
    const limite = Number(limit);
    const offset = (pagina - 1) * limite;

    const params = [req.modelo_id, limite, offset];

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
      WHERE
        c.modelo_id = $1
        AND c.ativo = TRUE
        AND c.tipo_conteudo = 'venda'
      ORDER BY c.criado_em DESC
      LIMIT $2
      OFFSET $3
      `,
      params
    );

    const totalRes = await db.query(
      `
      SELECT COUNT(*)
      FROM conteudos c
      WHERE
        c.modelo_id = $1
        AND c.ativo = TRUE
        AND c.tipo_conteudo = 'venda'
      `,
      [req.modelo_id]
    );

    const total = Number(totalRes.rows[0].count);
    const totalPaginas = Math.ceil(total / limite);

    res.json({
      conteudos: result.rows,
      total,
      totalPaginas,
      paginaAtual: pagina
    });

  } catch (err) {
    console.error("Erro listar conteúdos:", err);
    res.status(500).json({ error: "Erro ao listar conteúdos" });
  }

});


// ===========================
// STATUS INBOX/CHAT
// ===========================

app.get("/api/verificacao/status", auth, async (req, res) => {
  try {

    const userId = req.user.id;

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

    return res.json({ status: "pendente", motivo: null });

  } catch (err) {
    console.error("Erro status verificação:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ===========================
// RELATORIO.HTML
// ===========================

app.get("/modelo/relatorio", authModelo, (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "admin-pages", "relatorio.html")
  );
});

// ===========================
// VIPS.HTML - LISTA
// ===========================

app.get("/api/modelo/assinantes", authModelo, async (req, res) => {
  try {
    const result = await db.query(
      `
      WITH vip_status AS (
        SELECT
          v.cliente_id,
          v.modelo_id,
          BOOL_OR(v.ativo) AS ativo,
          MAX(v.expiration_at) AS expiration_at,
          MAX(v.created_at) AS criado_em
        FROM vip_subscriptions v
        WHERE v.modelo_id = $1
        GROUP BY v.cliente_id, v.modelo_id
      ),
      financeiros AS (
        SELECT
          t.cliente_id,
          t.modelo_id,

          COALESCE(SUM(
            CASE
              WHEN LOWER(COALESCE(t.tipo, '')) = 'assinatura'
               AND t.status = 'pago'
              THEN COALESCE(t.valor_modelo, 0)
              ELSE 0
            END
          ), 0)::numeric(10,2) AS total_assinaturas,

          COALESCE(SUM(
            CASE
              WHEN LOWER(COALESCE(t.tipo, '')) IN ('conteudo', 'midia')
               AND t.status = 'pago'
              THEN COALESCE(t.valor_modelo, 0)
              ELSE 0
            END
          ), 0)::numeric(10,2) AS total_midias

        FROM transacoes_agency t
        WHERE t.modelo_id = $1
        GROUP BY t.cliente_id, t.modelo_id
      )
      SELECT
        c.id AS cliente_id,
        c.nome AS nome_cliente,

        CASE
          WHEN vs.ativo = true
           AND vs.expiration_at IS NOT NULL
           AND vs.expiration_at > NOW()
            THEN 'VIP'
          WHEN vs.ativo = true
            THEN 'Ativo'
          ELSE 'Não ativo'
        END AS status_vip,

        vs.ativo,
        vs.expiration_at,
        vs.criado_em,

        COALESCE(f.total_assinaturas, 0)::numeric(10,2) AS total_assinaturas,
        COALESCE(f.total_midias, 0)::numeric(10,2) AS total_midias

      FROM vip_status vs
      JOIN clientes c
        ON c.id = vs.cliente_id
      LEFT JOIN financeiros f
        ON f.cliente_id = vs.cliente_id
       AND f.modelo_id = vs.modelo_id

      ORDER BY
        vs.criado_em DESC NULLS LAST,
        c.nome ASC
      `,
      [req.modelo_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Erro listar assinantes:", err);
    res.status(500).json({ erro: "Erro ao listar assinantes" });
  }
});

// =============================
// STATUS PAGAMENTOS VIP/MIDIAS
// ============================

app.get("/api/pagamento/status/:orderId", auth, async (req, res) => {
  try {
    const { orderId } = req.params;

    function normalizarStatus(status) {
      const s = String(status || "").toLowerCase().trim();

      if (["paid", "succeeded", "authorized", "captured", "pago"].includes(s)) {
        return "pago";
      }

      if (["failed", "refused", "denied", "cancelled", "canceled", "falhou"].includes(s)) {
        return "falhou";
      }

      if (["expired", "expirado"].includes(s)) {
        return "expirado";
      }

      if (["processing", "pending", "pendente", "created"].includes(s)) {
        return "pendente";
      }

      if (["chargedback", "chargeback", "refunded", "estornado"].includes(s)) {
        return "falhou";
      }

      return "pendente";
    }

    const pixRes = await db.query(
      `
      SELECT status, message_id, modelo_id, 'pix' AS metodo
      FROM pagamentos_pix
      WHERE pagarme_order_id = $1
      LIMIT 1
      `,
      [orderId]
    );

    if (pixRes.rowCount > 0) {
      const row = pixRes.rows[0];
      return res.json({
        status: normalizarStatus(row.status),
        raw_status: row.status,
        message_id: row.message_id || null,
        modelo_id: row.modelo_id || null,
        metodo: row.metodo
      });
    }

    const cartaoRes = await db.query(
      `
      SELECT status, conteudo_id AS message_id, modelo_id, 'cartao' AS metodo
      FROM pagamentos_cartao
      WHERE pagarme_order_id = $1
      LIMIT 1
      `,
      [orderId]
    );

    if (cartaoRes.rowCount > 0) {
      const row = cartaoRes.rows[0];
      return res.json({
        status: normalizarStatus(row.status),
        raw_status: row.status,
        message_id: row.message_id || null,
        modelo_id: row.modelo_id || null,
        metodo: row.metodo
      });
    }

    return res.json({ status: "pendente" });
  } catch (err) {
    console.error("Erro status pagamento:", err);
    return res.status(500).json({ error: "erro ao consultar status" });
  }
});

// =============================
// ANOTACOES DO CLIENTE CHAT
// ============================

app.get("/api/chat/cliente/:cliente_id/anotacoes", authModelo, async (req, res) => {
  try {
    const cliente_id = Number(req.params.cliente_id);
    const userId = req.user.id;

    if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
      return res.status(400).json({ error: "cliente_id inválido" });
    }

    const modeloRes = await db.query(
      `SELECT id FROM modelos WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (!modeloRes.rowCount) {
      return res.status(403).json({ error: "Modelo não encontrada" });
    }

    const modelo_id = Number(modeloRes.rows[0].id);

    const result = await db.query(
      `
      SELECT
        resumo_curto,
        nota_privada,
        updated_at
      FROM cliente_notas_modelo
      WHERE modelo_id = $1
        AND cliente_id = $2
      LIMIT 1
      `,
      [modelo_id, cliente_id]
    );

    if (!result.rowCount) {
      return res.json({
        resumo_curto: "",
        nota_privada: "",
        updated_at: null
      });
    }

    return res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro ao buscar anotações do cliente:", err);
    return res.status(500).json({ error: "Erro interno ao buscar anotações" });
  }
});


// ==================================
// ROTAS PUT - ATUALIZAR DADOS
// ==================================

// ===========================
// ALTERAR PLANO ASSINATURA
// ===========================

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

// ===========================
// ALTERAR OFERTAS
// ===========================

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

// ===========================
// ALTERAR INFOS PERFIL
// ===========================

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

// ===========================
// EDITAR CONTEUDOS?
// ===========================

// app.put("/api/conteudos/:id", authModelo, async (req, res) => {
//   const conteudo_id = Number(req.params.id);

//   if (!Number.isInteger(conteudo_id) || conteudo_id <= 0) {
//     return res.status(400).json({ error: "ID inválido" });
//   }

//   const { tipo, url, thumbnail_url } = req.body;

//   if (!tipo || !url) {
//     return res.status(400).json({
//       error: "Campos obrigatórios: tipo e url"
//     });
//   }

//   try {
//     const result = await db.query(
//       `
//       UPDATE conteudos
//       SET
//         tipo = $1,
//         url = $2,
//         thumbnail_url = $3
//       WHERE id = $4
//         AND modelo_id = $5
//       RETURNING
//         id,
//         tipo,
//         url,
//         thumbnail_url,
//         modelo_id
//       `,
//       [tipo, url, thumbnail_url || null, conteudo_id, req.modelo_id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         error: "Conteúdo não encontrado"
//       });
//     }

//     res.json(result.rows[0]);

//   } catch (err) {
//     console.error("Erro editar conteúdo:", err);
//     res.status(500).json({ error: "Erro ao editar conteúdo" });
//   }
// });


// ===========================
// EDITAR DADOS DO PERFIL
// ===========================

app.put("/api/usuario/perfil", auth, async (req, res) => {
  try {

    const {
      nome_exibicao,
      instagram,
      tiktok,
      local,
      bio
    } = req.body;


    // CLIENTE
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

// MODELO

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

// ===========================
// ATUALIZAR DADOS
// ===========================

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

 // MODELO
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

// CLIENTE

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

// ===========================
// ATUALIZAR INFOS CLIENTE
// ===========================

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

// ===========================
// CANCELAR VIP
// ===========================

app.put("/api/cliente/subscricoes/:id/cancelar", auth, async (req, res) => {
  try {

    const subscriptionId = req.params.id;

    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [req.user.id]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    const clienteId = clienteRes.rows[0].id;

    const subRes = await db.query(
      `SELECT id, ativo 
       FROM vip_subscriptions
       WHERE id = $1 AND cliente_id = $2`,
      [subscriptionId, clienteId]
    );

    if (!subRes.rowCount) {
      return res.status(403).json({ error: "Subscrição inválida." });
    }

    if (!subRes.rows[0].ativo) {
      return res.status(400).json({ error: "Esta subscrição já está cancelada." });
    }

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

// =============================
// ATUALIZAR INFOS CLT CHAT
// ============================

app.put("/api/chat/cliente/:cliente_id/anotacoes", authModelo, async (req, res) => {
  try {
    const cliente_id = Number(req.params.cliente_id);
    const userId = req.user.id;

    if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
      return res.status(400).json({ error: "cliente_id inválido" });
    }

    let { resumo_curto, nota_privada } = req.body || {};

    resumo_curto = String(resumo_curto || "").trim();
    nota_privada = String(nota_privada || "").trim();

    if (resumo_curto.length > 120) {
      return res.status(400).json({ error: "Resumo curto deve ter no máximo 120 caracteres" });
    }

    const modeloRes = await db.query(
      `SELECT id FROM modelos WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (!modeloRes.rowCount) {
      return res.status(403).json({ error: "Modelo não encontrada" });
    }

    const modelo_id = Number(modeloRes.rows[0].id);

    const result = await db.query(
      `
      INSERT INTO cliente_notas_modelo (
        modelo_id,
        cliente_id,
        resumo_curto,
        nota_privada,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (modelo_id, cliente_id)
      DO UPDATE SET
        resumo_curto = EXCLUDED.resumo_curto,
        nota_privada = EXCLUDED.nota_privada,
        updated_at = NOW()
      RETURNING
        resumo_curto,
        nota_privada,
        updated_at
      `,
      [modelo_id, cliente_id, resumo_curto || null, nota_privada || null]
    );

    return res.json({
      ok: true,
      ...result.rows[0]
    });

  } catch (err) {
    console.error("Erro ao salvar anotações do cliente:", err);
    return res.status(500).json({ error: "Erro interno ao salvar anotações" });
  }
});

// ================================
// APP POST - CRIAR/ENVIAR DADOS
// ===============================

// ===========================
// UPLOAD MIDIA - FEED
// ===========================

app.post("/api/upload", auth, authModelo, uploadB2.array("file", 10), async (req, res) => {

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
      const tipoFinal = tipo_conteudo || "feed";

      for (const file of req.files) {

        const mimetype = file.mimetype || "";

        let tipo;
        let publicUrl = null;
        let thumbnailUrl = null;

        if (mimetype.startsWith("image/")) {
          tipo = "imagem";
        } 
        else if (mimetype.startsWith("video/")) {
          tipo = "video";
        } 
        else {
          continue;
        }

        if (tipo === "imagem") {

          const form = new FormData();
          form.append("file", file.buffer, file.originalname);

          const response = await axios.post(
            `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/images/v1`,
            form,
            {
              headers: {
                Authorization: `Bearer ${process.env.CF_IMAGES_TOKEN}`,
                ...form.getHeaders()
              }
            }
          );

          if (!response.data || !response.data.success) {
            throw new Error("Erro upload Cloudflare Images");
          }

          const imageId = response.data.result.id;

          publicUrl =
            `https://imagedelivery.net/${process.env.CF_ACCOUNT_HASH}/${imageId}/public`;

            thumbnailUrl = publicUrl;
        }

        if (tipo === "video") {

          const form = new FormData();
          form.append("file", file.buffer, file.originalname);

          const response = await axios.post(
            `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/stream`,
            form,
            {
              headers: {
                Authorization: `Bearer ${process.env.CF_STREAM_TOKEN}`,
                ...form.getHeaders()
              },
              maxContentLength: Infinity,
              maxBodyLength: Infinity
            }
          );

          if (!response.data || !response.data.success) {
            throw new Error("Erro upload Cloudflare Stream");
          }

          const videoId = response.data.result.uid;

          publicUrl = `https://iframe.videodelivery.net/${videoId}`;

          const thumbnailUrl =
          `https://videodelivery.net/${videoId}/thumbnails/thumbnail.jpg`;
        }

        await db.query(
          `
          INSERT INTO conteudos
          (modelo_id, url, thumbnail_url, tipo, tipo_conteudo, preco, descricao)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
          [
            modelo_id,
            publicUrl,
            thumbnailUrl,
            tipo,
            tipoFinal,
            preco ? Number(preco) : null,
            descricao || null
          ]
        );
      }

      res.json({ success: true });

    } catch (err) {

      console.error("Erro /api/upload:", err);

      res.status(500).json({
        error: "Erro interno"
      });

    }
  }
);

// ===========================
// INSERIR OFERTAS
// ===========================

app.post("/api/ofertas", authModelo, async (req, res) => {
  try {

    const userId = req.user.id;

    const modeloRes = await db.query(
      `SELECT id FROM modelos WHERE user_id = $1`,
      [userId]
    );

    if (modeloRes.rowCount === 0) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    const modeloId = modeloRes.rows[0].id;

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

    const { nome, limite, dias, desconto } = req.body;

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
  ativa
)
VALUES ($1,$2,$3,0,$4,$5,$6,NOW(),$7,true)
RETURNING *
      `,
      [
        modeloId,
        nome,
        limiteNum,
        descontoNum,
        VALOR_BASE,
        valorPromocional,
        dataFim
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("🔥 ERRO AO CRIAR OFERTA 🔥", err);
    res.status(500).json({ erro: "Erro interno ao criar oferta" });
  }
});

// ===========================
// DADOS.HTML CLIENTE
// ===========================

app.post("/api/cliente/dados", authCliente, async (req, res) => {
  try {

    const {
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

// ===========================
// CADASTRO
// ===========================

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


    // MODELO
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

    // CLIENTE
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

    // GERAR TOKEN

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

// ===========================
// LOGIN
// ===========================

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
      { expiresIn: "60d" }
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

// ===========================
// AVATAR
// ===========================

app.post( "/uploadAvatar", auth, uploadB2.single("avatar"), async (req, res) => {

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

// ===========================
// CAPA
// ===========================

app.post( "/uploadCapa", auth, uploadB2.single("capa"),  async (req, res) => {

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

// ===========================
// DADOS MODELO
// ===========================

app.post("/api/modelo/dados", auth, authModelo, async (req, res) => {

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

// ===========================
// EXCLUIR MIDIA DE CONTEUDOS
// ===========================

app.delete("/api/conteudos/:id", authModelo, async (req, res) => {
  const userId = req.user.id;
  const conteudo_id = Number(req.params.id);

  try {

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

// ===========================
// EXCLUIR CONTA
// ===========================

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

    // MODELO
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

    // CLIENTE
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

    // APAGA O USER

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

// ===========================
// EXCLUIR PCT MIDIA CHAT
// ===========================

app.delete("/api/chat/pacote/:message_id", authModelo, async (req, res) => {

  const message_id = Number(req.params.message_id);

  if (!Number.isInteger(message_id)) {
    return res.status(400).json({ error: "message_id inválido" });
  }

  try {

    const msgRes = await db.query(`
      SELECT id, modelo_id, cliente_id, visto
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

    if (mensagem.visto === true) {
      return res.status(400).json({
        error: "Conteúdo já visualizado não pode ser excluído."
      });
    }

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

    // marcar deletada
    await db.query(`
      UPDATE messages
      SET deletada = true
      WHERE id = $1
    `, [message_id]);

    io.to(`chat_${mensagem.cliente_id}_${mensagem.modelo_id}`)
      .emit("mensagemExcluida", { id: message_id });

    res.json({ success: true });

  } catch (err) {
    console.error("Erro excluir pacote:", err);
    res.status(500).json({ error: "Erro ao excluir pacote" });
  }
});

// ===========================
// VIP PIX
// ===========================

app.post("/api/pagamento/vip/pix", auth, async (req, res) => {

console.log("=================================");
console.log("🔥 NOVO PIX VIP");
console.log("BODY:", req.body);

const client = await db.connect();

try {

const { modelo_id, cpf, aceitou_termos, fingerprint } = req.body;
const userId = req.user.id;

console.log("User:", userId);
console.log("Modelo:", modelo_id);

if (!aceitou_termos) {
return res.status(400).json({ error: "É necessário aceitar os termos." });
}

const cpfLimpo = String(cpf || "").replace(/\D/g, "");

if (!cpfLimpo) {
  return res.status(400).json({ error: "CPF obrigatório." });
}

if (!validarCPF(cpfLimpo)) {
  return res.status(400).json({ error: "CPF inválido." });
}
console.log("CPF limpo:", cpfLimpo);

if (!modelo_id || !Number.isInteger(Number(modelo_id))) {
return res.status(400).json({ error: "modelo_id inválido" });
}

const ip =
req.headers["x-forwarded-for"]?.split(",")[0] ||
req.socket.remoteAddress;

console.log("IP:", ip);

console.log("ENV PAGARME KEY EXISTE:", !!process.env.PAGARME_SECRET_KEY);

await client.query("BEGIN");

/* =========================
CLIENTE
========================= */

console.log("Buscando cliente...");

const clienteRes = await client.query(
"SELECT id, bloqueado FROM clientes WHERE user_id=$1",
[userId]
);

console.log("Cliente encontrado:", clienteRes.rowCount);

if (!clienteRes.rowCount) {
await client.query("ROLLBACK");
return res.status(404).json({ error: "Cliente não encontrado" });
}

const { id: cliente_id, bloqueado } = clienteRes.rows[0];

console.log("cliente_id:", cliente_id);
console.log("bloqueado:", bloqueado);

if (bloqueado) {
await client.query("ROLLBACK");
return res.status(403).json({ error: "Conta bloqueada." });
}

/* =========================
PLANO VIP
========================= */

console.log("Buscando plano VIP...");

const planoRes = await client.query(`
SELECT valor_mensal
FROM modelos_planos
WHERE modelo_id = $1
LIMIT 1
`, [modelo_id]);

console.log("Plano VIP encontrado:", planoRes.rowCount);

if (!planoRes.rowCount) {
await client.query("ROLLBACK");
return res.status(400).json({ error: "Plano VIP não encontrado" });
}

let valorBase = Number(planoRes.rows[0].valor_mensal) || 0;

console.log("Valor base:", valorBase);

/* =========================
OFERTA
========================= */

console.log("Buscando oferta...");

const ofertaRes = await client.query(`
SELECT valor_promocional
FROM ofertas
WHERE modelo_id = $1
AND ativa = true
AND (data_inicio IS NULL OR data_inicio <= NOW())
AND (data_fim IS NULL OR data_fim >= NOW())
LIMIT 1
`, [modelo_id]);

if (ofertaRes.rowCount) {
valorBase = Number(ofertaRes.rows[0].valor_promocional);
console.log("Oferta aplicada:", valorBase);
}

if (!valorBase || valorBase <= 0) {
await client.query("ROLLBACK");
return res.status(400).json({ error: "Valor inválido" });
}

/* =========================
CALCULO
========================= */

const valorCentavos = Math.round(valorBase * 100);
const taxaTransacaoCentavos = Math.round(valorCentavos * 0.10);
const taxaPlataformaCentavos = Math.round(valorCentavos * 0.05);

const amount =
valorCentavos +
taxaTransacaoCentavos +
taxaPlataformaCentavos;

console.log("VALORES:");
console.log("base:", valorBase);
console.log("centavos:", amount);

/* =========================
CRIAR ORDER PAGARME
========================= */

console.log("Criando order Pagar.me...");

const valorAssinatura = Number(valorBase.toFixed(2));
const taxaTransacao = Number((valorAssinatura * 0.10).toFixed(2));
const taxaPlataforma = Number((valorAssinatura * 0.05).toFixed(2));
const valorTotal = Number((valorAssinatura + taxaTransacao + taxaPlataforma).toFixed(2));

const payload = {
  items: [{
    amount,
    description: "Assinatura VIP Velvet",
    quantity: 1
  }],

  customer: {
    name: req.user.nome || "Cliente Velvet",
    email: req.user.email,
    document: cpfLimpo,
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

    valor_base: String(valorAssinatura),
    valor_assinatura: String(valorAssinatura),
    taxa_transacao: String(taxaTransacao),
    taxa_plataforma: String(taxaPlataforma),
    valor_total: String(valorTotal),
    taxa_gateway: "0.15",

    aceite_ip: ip,
    fingerprint: fingerprint || ""
  }
};

console.log("Payload enviado ao pagarme:");
console.log(JSON.stringify(payload,null,2));

const pagarmeResponse = await axios.post(
"https://api.pagar.me/core/v5/orders",
payload,
{
headers:{
Authorization:`Basic ${Buffer
.from(process.env.PAGARME_SECRET_KEY + ":")
.toString("base64")}`,
"Content-Type":"application/json"
}
}
);

console.log("Resposta bruta pagarme:", pagarmeResponse.status);

const order = pagarmeResponse.data;

console.log("ORDER COMPLETA:");
console.log(JSON.stringify(order,null,2));

const charge = order.charges?.[0];
const pixData = charge?.last_transaction;

console.log("Charge:", charge);
console.log("PixData:", pixData);

if (!pixData?.qr_code) {

console.error("QR NÃO GERADO");
console.error("ORDER:", JSON.stringify(order,null,2));

await client.query("ROLLBACK");

return res.status(500).json({
error:"Erro ao gerar QR"
});
}

/* =========================
REGISTRAR PIX
========================= */

console.log("Registrando pagamento no banco...");

await client.query(`
INSERT INTO pagamentos_pix
(cliente_id,modelo_id,valor,status,gateway,pagarme_order_id,criado_em,aceite_ip,aceitou_termos,cpf,fingerprint)
VALUES ($1,$2,$3,'pendente','pagarme',$4,NOW(),$5,true,$6,$7)
`,
[
cliente_id,
modelo_id,
amount/100,
order.id,
ip,
cpfLimpo,
fingerprint || ""
]
);

console.log("Pagamento registrado");

await client.query("COMMIT");

console.log("COMMIT realizado");

console.log("PIX criado com sucesso");

return res.json({
qr_code_url: pixData.qr_code_url,
copia_cola: pixData.qr_code,
expires_at: pixData?.expires_at || null,
order_id: order.id
});

} catch (err) {

console.error("=================================");
console.error("🔥 ERRO PIX VIP");
console.error("message:", err.message);
console.error("stack:", err.stack);

if (err.response) {
console.error("STATUS:", err.response.status);
console.error("DATA:", err.response.data);
}

try {
console.log("ROLLBACK executado");
await client.query("ROLLBACK");
} catch (rollbackErr) {
console.error("Erro no rollback:", rollbackErr);
}

return res.status(500).json({
error:"Erro ao gerar pagamento"
});

} finally {

client.release();
console.log("Conexão DB liberada");

}

});

// ===========================
// MIDIA PIX
// ===========================

app.post("/api/pagamento/midia/pix", auth, async (req, res) => {

  const client = await db.connect();

  try {

    const { conteudo_id, cpf } = req.body;
    const userId = req.user.id;

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    if (!conteudo_id) {
      return res.status(400).json({ error: "Conteúdo inválido." });
    }

    if (!cpf) {
      return res.status(400).json({ error: "CPF obrigatório." });
    }

    const cpfLimpo = cpf.replace(/\D/g, "");

    if (!validarCPF(cpfLimpo)) {
      return res.status(400).json({ error: "CPF inválido." });
    }

    /* ================================
       CLIENTE
    ================================ */

    const clienteRes = await client.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = clienteRes.rows[0].id;

    /* ================================
       BUSCAR MIDIA
    ================================ */

    const conteudo = await client.query(
      `SELECT preco, modelo_id
       FROM messages
       WHERE id = $1
       AND cliente_id = $2`,
      [conteudo_id, cliente_id]
    );

    if (!conteudo.rowCount) {
      return res.status(404).json({ error: "Conteúdo não encontrado" });
    }

    const { preco, modelo_id } = conteudo.rows[0];

    const precoNum = Number(preco);

    const taxaTransacao = Number((precoNum * 0.10).toFixed(2));
    const taxaPlataforma = Number((precoNum * 0.05).toFixed(2));

    const valorTotal = Number(
      (precoNum + taxaTransacao + taxaPlataforma).toFixed(2)
    );

    const valorCentavos = Math.round(valorTotal * 100);

    /* ================================
       VERIFICAR SE JA COMPROU
    ================================ */

    const jaComprado = await client.query(
      `SELECT 1
       FROM pagamentos_pix
       WHERE cliente_id = $1
       AND message_id = $2
       AND status = 'pago'
       LIMIT 1`,
      [cliente_id, conteudo_id]
    );

    if (jaComprado.rowCount > 0) {
      return res.status(400).json({
        error: "Conteúdo já adquirido."
      });
    }

    await client.query("BEGIN");

    /* ================================
       EXPIRAR PIX ANTIGOS
    ================================ */

    await client.query(`
      UPDATE pagamentos_pix
      SET status = 'expirado'
      WHERE status = 'pendente'
      AND expires_at < NOW()
    `);

    /* ================================
       REUTILIZAR PIX EXISTENTE
    ================================ */

    const pixExistente = await client.query(
      `
      SELECT pagarme_order_id, qr_code
      FROM pagamentos_pix
      WHERE cliente_id = $1
      AND message_id = $2
      AND status = 'pendente'
      AND expires_at > NOW()
      LIMIT 1
      `,
      [cliente_id, conteudo_id]
    );

    if (pixExistente.rowCount > 0) {

      await client.query("ROLLBACK");

      return res.json({
        qr_code: pixExistente.rows[0].qr_code,
        payment_id: pixExistente.rows[0].pagarme_order_id,
        status: "pendente"
      });

    }

    /* ================================
       CRIAR PIX PAGARME
    ================================ */

    const pagarmeResponse = await axios.post(
      "https://api.pagar.me/core/v5/orders",
      {
        items: [{
          amount: valorCentavos,
          description: "Midia Velvet",
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
          pix: { expires_in: 1800 }
        }],

        metadata: {
          tipo: "conteudo_pix",
          message_id: conteudo_id,
          cliente_id,
          modelo_id,
          valor_base: precoNum,
          taxa_transacao: taxaTransacao,
          taxa_plataforma: taxaPlataforma
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

    if (!pixData?.qr_code) {
      throw new Error("Erro ao gerar PIX no Pagar.me");
    }

    /* ================================
       QR CODE BASE64
    ================================ */

    let qrCodeBase64 = null;

    try {

      const img = await axios.get(
        pixData.qr_code_url,
        { responseType: "arraybuffer" }
      );

      qrCodeBase64 = Buffer
        .from(img.data, "binary")
        .toString("base64");

    } catch (err) {

      console.error("Erro converter QR:", err);

    }

    /* ================================
       SALVAR PIX
    ================================ */

    await client.query(
      `INSERT INTO pagamentos_pix
      (cliente_id, modelo_id, message_id, qr_code, valor, status, gateway, pagarme_order_id, criado_em, expires_at)
      VALUES ($1,$2,$3,$4,$5,'pendente','pagarme',$6,NOW(),NOW() + INTERVAL '15 minutes')`,
      [
        cliente_id,
        modelo_id,
        conteudo_id,
        pixData.qr_code,
        valorTotal,
        order.id
      ]
    );

    await client.query("COMMIT");

    return res.json({
      qr_code: pixData.qr_code,
      qr_code_base64: qrCodeBase64,
      payment_id: order.id
    });

  } catch (err) {

    console.error("Erro gerar PIX:", err);

    try { await client.query("ROLLBACK"); } catch {}

    return res.status(500).json({
      error: "Erro ao gerar pagamento PIX"
    });

  } finally {

    client.release();

  }

});

// ===========================
// VIP CARTAO
// ===========================

app.post("/api/pagamento/vip/cartao", authCliente, async (req, res) => {
  const client = await db.connect();
  let cliente_id = null;

  try {
    await client.query("BEGIN");

    const {
      modelo_id,
      cpf,
      aceitou_termos,
      fingerprint,
      apenas_intent,

      billing_address,
      phone_area_code,
      phone_number,

      // PSP
      card_id,

      // dados brutos
      card_number,
      card_holder_name,
      card_exp_month,
      card_exp_year,
      card_cvv,

      // legado
      card_token
    } = req.body || {};

    const userId = req.user.id;

    /* =====================================================
       VALIDAÇÕES INICIAIS
    ===================================================== */
    if (!modelo_id || !Number.isInteger(Number(modelo_id))) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    const modeloIdNum = Number(modelo_id);
    const cpfLimpo = cpf ? String(cpf).replace(/\D/g, "") : null;

    if (!apenas_intent) {
      if (!aceitou_termos) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Você precisa aceitar os termos." });
      }

      if (!cpfLimpo) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "CPF obrigatório." });
      }

      if (!validarCPF(cpfLimpo)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "CPF inválido." });
      }

      if (!fingerprint) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Fingerprint obrigatório." });
      }

      // aqui mudamos a regra antiga do card_token
      const enviouCardId = !!(card_id && typeof card_id === "string");
      const enviouCardBruto =
        !!card_number &&
        !!card_holder_name &&
        !!card_exp_month &&
        !!card_exp_year &&
        !!card_cvv;

      const enviouCardTokenLegado =
        !!(card_token && typeof card_token === "string");

      if (!enviouCardId && !enviouCardBruto && !enviouCardTokenLegado) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error:
            "Envie card_id, card_token ou os dados completos do cartão."
        });
      }
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    /* =====================================================
       BLOQUEIOS
    ===================================================== */
    const ipBloqueado = await client.query(
      "SELECT 1 FROM ips_bloqueados WHERE ip = $1 LIMIT 1",
      [ip]
    );

    if (ipBloqueado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "IP bloqueado." });
    }

    const clienteRes = await client.query(
      `
      SELECT
        c.id,
        c.bloqueado,
        COALESCE(NULLIF(TRIM(c.nome), ''), split_part(u.email, '@', 1)) AS nome,
        u.email
      FROM clientes c
      JOIN users u ON u.id = c.user_id
      WHERE c.user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    cliente_id = clienteRes.rows[0].id;

    const nomeCliente = String(clienteRes.rows[0].nome || "").trim();
    const emailCliente = String(clienteRes.rows[0].email || "").trim().toLowerCase();

    if (clienteRes.rows[0].bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    if (!nomeCliente || nomeCliente.length < 3) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Nome do cliente inválido." });
    }

    if (!emailCliente || !emailCliente.includes("@")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "E-mail do cliente inválido." });
    }

    if (cpfLimpo) {
      const cpfBloqueado = await client.query(
        "SELECT 1 FROM cpfs_bloqueados WHERE cpf = $1 LIMIT 1",
        [cpfLimpo]
      );

      if (cpfBloqueado.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "CPF bloqueado." });
      }
    }

    /* =====================================================
       ATUALIZAR CLIENTE
    ===================================================== */
    if (cpfLimpo) {
      await client.query(
        `
        UPDATE clientes
        SET cpf = $1, ultimo_ip = $2
        WHERE id = $3
        `,
        [cpfLimpo, ip, cliente_id]
      );
    } else {
      await client.query(
        `
        UPDATE clientes
        SET ultimo_ip = $1
        WHERE id = $2
        `,
        [ip, cliente_id]
      );
    }

    /* =====================================================
       EVITAR VIP JÁ ATIVO
    ===================================================== */

const tentativaVipRecenteRes = await client.query(
  `
  SELECT 1
  FROM pagamentos_cartao
  WHERE cliente_id = $1
    AND modelo_id = $2
    AND tipo = 'vip'
    AND created_at > NOW() - INTERVAL '3 minutes'
    AND LOWER(COALESCE(status, '')) IN ('pending', 'pendente', 'processing')
  LIMIT 1
  `,
  [cliente_id, modeloIdNum]
);

if (tentativaVipRecenteRes.rowCount > 0) {
  await client.query("ROLLBACK");
  return res.status(400).json({
    error: "Já existe uma tentativa recente de pagamento para este VIP."
  });
}

    /* =====================================================
       BUSCAR PLANO
    ===================================================== */
    const planoRes = await client.query(
      `
      SELECT valor_mensal
      FROM modelos_planos
      WHERE modelo_id = $1
      LIMIT 1
      `,
      [modeloIdNum]
    );

    if (!planoRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Plano VIP não definido" });
    }

    let valorBase = Number(planoRes.rows[0].valor_mensal);

    /* =====================================================
       OFERTA
    ===================================================== */
    const ofertaRes = await client.query(
      `
      SELECT id, desconto_percentual, valor_promocional
      FROM ofertas
      WHERE modelo_id = $1
        AND ativa = true
        AND (data_inicio IS NULL OR data_inicio <= NOW())
        AND (data_fim IS NULL OR data_fim >= NOW())
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [modeloIdNum]
    );

    let valorAssinatura = valorBase;
    let oferta_id = null;

    if (ofertaRes.rowCount) {
      oferta_id = ofertaRes.rows[0].id;

      if (ofertaRes.rows[0].valor_promocional) {
        valorAssinatura = Number(ofertaRes.rows[0].valor_promocional);
      } else if (ofertaRes.rows[0].desconto_percentual) {
        const desconto = Number(ofertaRes.rows[0].desconto_percentual);
        valorAssinatura = valorBase - (valorBase * desconto / 100);
      }
    }

    valorAssinatura = Number(valorAssinatura.toFixed(2));

    if (!valorAssinatura || valorAssinatura <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor inválido" });
    }

    /* =====================================================
       CÁLCULO
    ===================================================== */
    const valorCentavos = Math.round(valorAssinatura * 100);
    const taxaTransacaoCentavos = Math.round(valorCentavos * 0.10);
    const taxaPlataformaCentavos = Math.round(valorCentavos * 0.05);

    const amount =
      valorCentavos +
      taxaTransacaoCentavos +
      taxaPlataformaCentavos;

    const taxaTransacao = taxaTransacaoCentavos / 100;
    const taxaPlataforma = taxaPlataformaCentavos / 100;
    const valorTotal = amount / 100;

    /* =====================================================
       APENAS INTENT
    ===================================================== */
    if (apenas_intent) {
      await client.query("COMMIT");
      return res.json({
        ok: true,
        apenas_intent: true,
        modelo_id: modeloIdNum,
        valor_assinatura: valorAssinatura,
        taxa_transacao: taxaTransacao,
        taxa_plataforma: taxaPlataforma,
        valor_total: valorTotal,
        oferta_id
      });
    }

    /* =====================================================
       BILLING / TELEFONE
    ===================================================== */
    if (
      !billing_address ||
      !billing_address.line_1 ||
      !billing_address.zip_code ||
      !billing_address.city ||
      !billing_address.state ||
      !billing_address.country
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "billing_address incompleto" });
    }

    const billingAddress = {
      line_1: String(billing_address.line_1).trim(),
      zip_code: String(billing_address.zip_code).replace(/\D/g, ""),
      city: String(billing_address.city).trim(),
      state: String(billing_address.state).trim(),
      country: String(billing_address.country).trim().toUpperCase()
    };

    if (billing_address.line_2) {
      billingAddress.line_2 = String(billing_address.line_2).trim();
    }

    if (billingAddress.zip_code.length < 8) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "CEP inválido." });
    }

    const areaCode = String(phone_area_code || "").replace(/\D/g, "");
    const phoneNumber = String(phone_number || "").replace(/\D/g, "");

    if (!areaCode || areaCode.length < 2 || !phoneNumber || phoneNumber.length < 8) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Telefone inválido." });
    }

    /* =====================================================
       CREDIT CARD NODE
    ===================================================== */
    let creditCardNode = null;

    if (card_id && typeof card_id === "string") {
      creditCardNode = {
        installments: 1,
        statement_descriptor: "VELVET",
        operation_type: "auth_and_capture",
        card_id: card_id.trim(),
        billing_address: billingAddress
      };
    } else if (card_token && typeof card_token === "string") {
      // compatibilidade com legado
      creditCardNode = {
        card_token: card_token.trim(),
        installments: 1,
        statement_descriptor: "VELVET"
      };
    } else {
      const number = String(card_number || "").replace(/\s+/g, "");
      const holderName = String(card_holder_name || "").trim();
      const expMonth = Number(card_exp_month);
      const expYear = Number(card_exp_year);
      const cvv = String(card_cvv || "").replace(/\D/g, "");

      if (!number || !holderName || !expMonth || !expYear || !cvv) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error:
            "Envie card_id, card_token ou os dados completos do cartão."
        });
      }

      creditCardNode = {
        installments: 1,
        statement_descriptor: "VELVET",
        operation_type: "auth_and_capture",
        card: {
          number,
          holder_name: holderName,
          exp_month: expMonth,
          exp_year: expYear,
          cvv,
          billing_address: billingAddress
        }
      };
    }

    /* =====================================================
       CRIAR ORDER PAGARME
    ===================================================== */
    const paymentPayload = {
      payment_method: "credit_card",
      amount,
      credit_card: creditCardNode,
      antifraud_enabled: true
    };

    const pagarmeBody = {
      closed: true,
      customer: {
        name: nomeCliente,
        email: emailCliente,
        document: cpfLimpo,
        type: "individual",
        address: billingAddress,
        phones: {
          mobile_phone: {
            country_code: "55",
            area_code: areaCode,
            number: phoneNumber
          }
        }
      },
      items: [
        {
          amount,
          description: "Assinatura VIP",
          quantity: 1,
          code: `vip_${modeloIdNum}_${cliente_id}`
        }
      ],
      payments: [paymentPayload],
      metadata: {
        tipo: "vip",
        cliente_id: String(cliente_id),
        modelo_id: String(modeloIdNum),
        oferta_id: oferta_id ? String(oferta_id) : "",
        valor_assinatura: String(valorAssinatura),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma),
        valor_total: String(valorTotal),
        cpf: cpfLimpo || "",
        aceite_ip: ip || ""
      }
    };

    console.log("=== VIP PSP BODY FINAL ===");
    console.log(JSON.stringify(pagarmeBody, null, 2));

    const pagarmeRes = await axios.post(
      "https://api.pagar.me/core/v5/orders",
      pagarmeBody,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(process.env.PAGARME_SECRET_KEY + ":").toString("base64"),
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const order = pagarmeRes.data;
    const charge = order?.charges?.[0] || null;
    const gatewayStatusRaw = charge?.status || order?.status || "pending";
    const gatewayStatus = String(gatewayStatusRaw).toLowerCase();

    await client.query(
      `
      INSERT INTO pagamentos_cartao
      (
        cliente_id,
        modelo_id,
        pagarme_order_id,
        valor,
        tipo,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      `,
      [
        cliente_id,
        modeloIdNum,
        order.id,
        valorTotal,
        "vip",
        gatewayStatus
      ]
    );

    await client.query(
      `
      INSERT INTO pagamento_tentativas
      (
        cliente_id,
        metodo,
        fingerprint_pagamento,
        status,
        pagarme_order_id,
        ip
      )
      VALUES ($1, 'cartao', $2, $3, $4, $5)
      `,
      [
        cliente_id,
        fingerprint || null,
        gatewayStatus,
        order.id,
        ip
      ]
    );

    await client.query("COMMIT");

    return res.json({
      order_id: order.id,
      charge_id: charge?.id || null,
      status: gatewayStatus,
      valor_assinatura: valorAssinatura,
      taxa_transacao: taxaTransacao,
      taxa_plataforma: taxaPlataforma,
      valor_total: valorTotal
    });
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("Erro VIP Pagarme:", err.response?.data || err);

    try {
      if (cliente_id && req.body?.fingerprint) {
        await client.query(
          `
          INSERT INTO pagamento_tentativas
          (cliente_id, metodo, fingerprint_pagamento, status, ip)
          VALUES ($1, 'cartao', $2, 'recusado', $3)
          `,
          [cliente_id, req.body.fingerprint, req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || null]
        );
      }
    } catch (logErr) {
      console.error("Erro ao registrar tentativa recusada:", logErr);
    }

    const gatewayMessage =
      err.response?.data?.message ||
      err.response?.data?.errors?.[0]?.message ||
      err.response?.data?.error ||
      "Erro ao criar pagamento com cartão";

    return res.status(err.response?.status || 500).json({
      error: gatewayMessage,
      gateway_error: err.response?.data || null
    });
  } finally {
    client.release();
  }
});

// ===========================
// MIDIA CARTAO
// ===========================

app.post("/api/pagamento/midia/cartao", auth, async (req, res) => {
  const requestId =
    "cartao_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

  const startedAt = Date.now();
  let client;

  try {
    console.log("\n==============================");
    console.log("🔥 INICIO /api/pagamento/midia/cartao");
    console.log("requestId:", requestId);
    console.log("timestamp:", new Date().toISOString());
    console.log("BODY bruto:", req.body);
    console.log("USER bruto:", req.user);

    client = await db.connect();
    console.log("✅ db.connect OK");

    const {
      conteudo_id,
      fingerprint,
      cpf,
      billing_address,
      phone_area_code,
      phone_number,

      // PSP
      card_id,

      // se vierem dados brutos do cartão
      card_number,
      card_holder_name,
      card_exp_month,
      card_exp_year,
      card_cvv,

      // legado - vamos rejeitar
      card_token
    } = req.body || {};

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    if (!conteudo_id || !Number.isInteger(Number(conteudo_id))) {
      return res.status(400).json({ error: "conteudo_id inválido" });
    }

    // PSP: não usar card_token nessa rota
    if (card_token) {
      return res.status(400).json({
        error:
          "Sua conta é PSP. Esta rota não aceita card_token. Envie card_id ou os dados completos do cartão."
      });
    }

    const cpfLimpo = String(cpf || "").replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ error: "CPF inválido" });
    }

    const conteudoId = Number(conteudo_id);

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    await client.query("BEGIN");
    console.log("✅ BEGIN OK");

const clienteRes = await client.query(
  `
  SELECT
    c.id,
    c.bloqueado,
    COALESCE(NULLIF(TRIM(c.nome), ''), split_part(u.email, '@', 1)) AS nome,
    u.email
  FROM clientes c
  JOIN users u ON u.id = c.user_id
  WHERE c.user_id = $1
  LIMIT 1
  `,
  [userId]
);

    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const {
      id: cliente_id,
      bloqueado,
      email,
      nome
    } = clienteRes.rows[0];

    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const messageRes = await client.query(
      `
      SELECT preco, modelo_id
      FROM messages
      WHERE id = $1
        AND cliente_id = $2
      LIMIT 1
      `,
      [conteudoId, cliente_id]
    );

    if (!messageRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Conteúdo não encontrado" });
    }

    const { preco, modelo_id } = messageRes.rows[0];

    if (!preco || Number(preco) <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Conteúdo não está à venda." });
    }

    const jaComprado = await client.query(
      `
      SELECT 1
      FROM conteudo_pacotes
      WHERE message_id = $1
        AND cliente_id = $2
        AND status = 'pago'
      LIMIT 1
      `,
      [conteudoId, cliente_id]
    );

    if (jaComprado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Conteúdo já adquirido." });
    }

    const pedidoPendente = await client.query(
      `
      SELECT 1
      FROM pagamentos_cartao
      WHERE cliente_id = $1
        AND conteudo_id = $2
        AND status IN ('iniciado', 'pending', 'processing', 'pendente')
      LIMIT 1
      `,
      [cliente_id, conteudoId]
    );

    if (pedidoPendente.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Já existe um pagamento em processamento para este conteúdo."
      });
    }

    const valorCentavos = Math.round(Number(preco) * 100);
    const taxaTransacaoCentavos = Math.round(valorCentavos * 0.10);
    const taxaPlataformaCentavos = Math.round(valorCentavos * 0.05);
    const amount =
      valorCentavos +
      taxaTransacaoCentavos +
      taxaPlataformaCentavos;

    if (!Number.isInteger(amount) || amount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor do pagamento inválido." });
    }

    const valorBase = valorCentavos / 100;
    const taxaTransacao = taxaTransacaoCentavos / 100;
    const taxaPlataforma = taxaPlataformaCentavos / 100;
    const total = amount / 100;

    // billing obrigatório e sem fallback fake
    if (
      !billing_address ||
      !billing_address.line_1 ||
      !billing_address.zip_code ||
      !billing_address.city ||
      !billing_address.state ||
      !billing_address.country
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "billing_address incompleto"
      });
    }

    const billingAddress = {
      line_1: String(billing_address.line_1).trim(),
      zip_code: String(billing_address.zip_code).replace(/\D/g, ""),
      city: String(billing_address.city).trim(),
      state: String(billing_address.state).trim(),
      country: String(billing_address.country).trim().toUpperCase()
    };

    if (billing_address.line_2) {
      billingAddress.line_2 = String(billing_address.line_2).trim();
    }

    if (billingAddress.zip_code.length < 8) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "CEP inválido." });
    }

    const areaCode = String(phone_area_code || "").replace(/\D/g, "");
    const phoneNumber = String(phone_number || "").replace(/\D/g, "");

    if (!areaCode || areaCode.length < 2 || !phoneNumber || phoneNumber.length < 8) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Telefone inválido." });
    }

    const nomeCompleto = String(nome || "").trim();
    if (!nomeCompleto || nomeCompleto.length < 3) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Nome do cliente inválido." });
    }

    if (!email || !String(email).includes("@")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "E-mail do cliente inválido." });
    }

    let creditCardNode = null;

    // opção 1: cartão salvo
    if (card_id && typeof card_id === "string") {
      creditCardNode = {
        installments: 1,
        statement_descriptor: "VELVET",
        operation_type: "auth_and_capture",
        card_id: card_id.trim(),
        billing_address: billingAddress
      };
    } else {
      // opção 2: dados brutos do cartão
      const number = String(card_number || "").replace(/\s+/g, "");
      const holderName = String(card_holder_name || "").trim();
      const expMonth = Number(card_exp_month);
      const expYear = Number(card_exp_year);
      const cvv = String(card_cvv || "").replace(/\D/g, "");

      if (!number || !holderName || !expMonth || !expYear || !cvv) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error:
            "Para PSP, envie card_id ou os dados completos do cartão (number, holder_name, exp_month, exp_year, cvv)."
        });
      }

      creditCardNode = {
        installments: 1,
        statement_descriptor: "VELVET",
        operation_type: "auth_and_capture",
        card: {
          number,
          holder_name: holderName,
          exp_month: expMonth,
          exp_year: expYear,
          cvv,
          billing_address: billingAddress
        }
      };
    }

    const paymentPayload = {
      payment_method: "credit_card",
      amount,
      credit_card: creditCardNode,
      antifraud_enabled: true
    };

    const pagarmeBody = {
      closed: true,
      customer: {
        name: nomeCompleto,
        email: String(email).trim().toLowerCase(),
        document: cpfLimpo,
        type: "individual",
        address: billingAddress,
        phones: {
          mobile_phone: {
            country_code: "55",
            area_code: areaCode,
            number: phoneNumber
          }
        }
      },
      items: [
        {
          amount,
          description: "Conteúdo premium",
          quantity: 1,
          code: `conteudo_${conteudoId}`
        }
      ],
      payments: [paymentPayload],
      metadata: {
        tipo: "conteudo_cartao",
        message_id: String(conteudoId),
        cliente_id: String(cliente_id),
        modelo_id: String(modelo_id),
        valor_midia: String(valorBase),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma),
        valor_total: String(total),
        aceite_ip: ip || ""
      }
    };

    console.log("=== PSP BODY FINAL ===");
    console.log(JSON.stringify(pagarmeBody, null, 2));
    console.log("payments[0].amount =", pagarmeBody?.payments?.[0]?.amount);
    console.log(
      "payments[0].credit_card.card_id =",
      pagarmeBody?.payments?.[0]?.credit_card?.card_id || null
    );
    console.log(
      "payments[0].credit_card.card.number existe? =",
      !!pagarmeBody?.payments?.[0]?.credit_card?.card?.number
    );

    const pagarmeHeaders = {
      Authorization:
        "Basic " +
        Buffer.from(process.env.PAGARME_SECRET_KEY + ":").toString("base64"),
      "Content-Type": "application/json"
    };

    const pagarmeRes = await axios.post(
      "https://api.pagar.me/core/v5/orders",
      pagarmeBody,
      {
        headers: pagarmeHeaders,
        timeout: 30000
      }
    );

    const order = pagarmeRes.data;
    const charge = order?.charges?.[0] || null;
    const gatewayStatusRaw = charge?.status || order?.status || "pending";
    const gatewayStatus = String(gatewayStatusRaw).toLowerCase();

    await client.query(
      `
      INSERT INTO pagamentos_cartao
      (
        cliente_id,
        modelo_id,
        conteudo_id,
        pagarme_order_id,
        valor,
        tipo,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      `,
      [
        cliente_id,
        modelo_id,
        conteudoId,
        order.id,
        total,
        "conteudo_cartao",
        gatewayStatus
      ]
    );

    await client.query(
      `
      INSERT INTO pagamento_tentativas
      (
        cliente_id,
        metodo,
        fingerprint_pagamento,
        status,
        pagarme_order_id,
        conteudo_id,
        ip
      )
      VALUES ($1, 'cartao', $2, $3, $4, $5, $6)
      `,
      [
        cliente_id,
        fingerprint || null,
        gatewayStatus,
        order.id,
        conteudoId,
        ip
      ]
    );

    await client.query("COMMIT");

    return res.json({
      order_id: order.id,
      charge_id: charge?.id || null,
      status: gatewayStatus,
      total,
      valorBase,
      taxaTransacao,
      taxaPlataforma
    });
  } catch (err) {
    console.error("\n==============================");
    console.error("💥 ERRO EM /api/pagamento/midia/cartao");
    console.error("requestId:", requestId);
    console.error("tempo até erro ms:", Date.now() - startedAt);
    console.error("err.message:", err.message);

    if (err.response) {
      console.error("response.status:", err.response.status);
      console.error(
        "response.data:",
        typeof err.response.data === "object"
          ? JSON.stringify(err.response.data, null, 2)
          : err.response.data
      );
    }

    if (err.config?.data) {
      console.error("=== AXIOS DATA ENVIADA ===");
      console.error(
        typeof err.config.data === "string"
          ? err.config.data
          : JSON.stringify(err.config.data, null, 2)
      );
    }

    try {
      if (client) await client.query("ROLLBACK");
    } catch (e) {
      console.error("❌ Erro no rollback:", e.message);
    }

    return res.status(500).json({
      error: "Erro interno ao processar pagamento com cartão",
      detalhe: err.message,
      gateway_status: err.response?.status || null,
      gateway_error: err.response?.data || null,
      requestId
    });
  } finally {
    if (client) {
      try {
        client.release();
      } catch (_) {}
    }
  }
});

// ===========================
// CANCELAR VIP??
// ===========================

app.post("/api/vip/cancelar", auth, async (req, res) => {
  try {
    const { modelo_id } = req.body;
    const userId = req.user.id;

    if (!modelo_id || isNaN(Number(modelo_id))) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

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

// ===========================
// ESQUECI A SENHA
// ===========================

app.post("/api/password/forgot", async (req, res) => {
  const client = await db.connect();

  try {
    let { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email obrigatório" });
    }

    email = email.trim().toLowerCase();

    await client.query("BEGIN");

    const userRes = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (userRes.rowCount === 0) {
      await client.query("COMMIT");
      return res.json({ ok: true });
    }

    const userId = userRes.rows[0].id;

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

// ===========================
// REGISTAR NOVA SENHA
// ===========================

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

// =============================
// FALE CONOSCO / CONTATO
// =============================

app.post("/api/contato", async (req, res) => {
  try {
    let { nome, email, assunto, mensagem } = req.body;

    if (!nome || !email || !assunto || !mensagem) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    nome = nome.trim().slice(0, 100);
    email = email.trim().toLowerCase().slice(0, 150);
    assunto = assunto.trim().slice(0, 150);
    mensagem = mensagem.trim().slice(0, 2000);

    // 🔒 validação simples de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Email inválido" });
    }

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

// ===========================
// MARCAR LIDO MODELO
// ===========================

app.post("/api/chat/modelo/marcar-lido/:cliente_id", authModelo, async (req, res) => {

    const userId = req.user.id;
    const cliente_id = Number(req.params.cliente_id);

    if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
      return res.status(400).json({ error: "cliente_id inválido" });
    }

    try {
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

// ===========================
// VERIFICACAO PERFIL
// ===========================

app.post("/api/verificacao", auth, uploadVerificacao.fields([ { name: "doc_frente", maxCount: 1 }, { name: "doc_verso", maxCount: 1 }, { name: "selfie", maxCount: 1 }]), async (req, res) => {

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

      // MODELO
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

      // 👤 CLIENTE
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


      // ROLE INVÁLIDA
      return res.status(403).json({ erro: "Role inválida" });

    } catch (err) {
      console.error("❌ Erro upload verificação:", err);
      return res.status(500).json({ erro: "Erro ao enviar documentos" });
    }
  }
);

// ===========================
// CARREGAR MIDIAS CONTEUDOS
// ===========================

app.post("/api/conteudos", authModelo, uploadB2.array("file", 10), async (req, res) => {

    const userId = req.user.id;
    const { preco, descricao } = req.body;

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

  const { mimetype, originalname, buffer } = file;

  let tipo;

  if (mimetype.startsWith("image/")) {
    tipo = "imagem";
  }
  else if (mimetype.startsWith("video/")) {
    tipo = "video";
  }
  else {
    continue;
  }

  let url = null;
  let thumbnailUrl = null;

  // IMAGEM
  if (tipo === "imagem") {

    const form = new FormData();
    form.append("file", buffer, originalname);

    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/images/v1`,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.CF_IMAGES_TOKEN}`,
          ...form.getHeaders()
        }
      }
    );

    const imageId = response.data.result.id;

    url =
      `https://imagedelivery.net/${process.env.CF_ACCOUNT_HASH}/${imageId}/public`;

    thumbnailUrl = url;
  }

  // VIDEO
  if (tipo === "video") {

    const form = new FormData();
    form.append("file", buffer, originalname);

    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/stream`,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.CF_STREAM_TOKEN}`,
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const videoId = response.data.result.uid;

    url = `https://iframe.videodelivery.net/${videoId}`;

    thumbnailUrl =
      `https://videodelivery.net/${videoId}/thumbnails/thumbnail.jpg`;
  }

  const result = await db.query(
    `
    INSERT INTO conteudos (
      modelo_id,
      url,
      thumbnail_url,
      tipo,
      tipo_conteudo,
      preco,
      descricao,
      criado_em
    )
    VALUES ($1,$2,$3,$4,'venda',$5,$6,NOW())
    RETURNING *
    `,
    [
      modelo_id,
      url,
      thumbnailUrl,
      tipo,
      preco || 0,
      descricao || null
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

// ===========================
// MARCAR CONTEUDO VISTO CHAT
// ===========================

app.post("/api/conteudo/visto", auth, async (req, res) => {

  const { message_id } = req.body;

  const clienteRes = await db.query(
    "SELECT id FROM clientes WHERE user_id = $1",
    [req.user.id]
  );

  if (!clienteRes.rowCount) {
    return res.status(404).json({ error: "Cliente não encontrado" });
  }

  const cliente_id = clienteRes.rows[0].id;

  await db.query(`
    UPDATE messages
    SET visto = true,
        updated_at = NOW()
    WHERE id = $1
    AND cliente_id = $2
  `,[message_id, cliente_id]);

  res.json({ ok: true });

});

// ===========================
// ATIVAR PUSH
// ===========================

app.post("/api/notificacoes/inscrever", auth, async (req, res) => {

  try {
    const userId = req.user.id;
    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Subscription inválida" });
    }

    await db.query(
      `
      INSERT INTO push_subscriptions (user_id, subscription_json, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        subscription_json = EXCLUDED.subscription_json,
        updated_at = NOW()
      `,
      [userId, JSON.stringify(subscription)]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao salvar subscription:", err);
    return res.status(500).json({ error: "Erro ao salvar subscription" });
  }
});

// ===========================
// DESATIVAR PUSH
// ===========================

app.post("/api/notificacoes/desinscrever", auth, async (req, res) => {

  try {
    const userId = req.user.id;

    await db.query(
      `
      DELETE FROM push_subscriptions
      WHERE user_id = $1
      `,
      [userId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao remover subscription:", err);
    return res.status(500).json({ error: "Erro ao remover subscription" });
  }
});

// ===========================
// ENCERRAR OFERTA MANUAL
// ===========================

app.patch("/api/ofertas/:id/encerrar", authModelo, async (req, res) => {
  try {
    const ofertaId = Number(req.params.id);
    const userId = req.user.id;

    if (!Number.isInteger(ofertaId) || ofertaId <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

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