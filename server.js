console.log("SERVIDOR INICIADO - O SENHOR EH MEU PASTOR E NADA ME FALTARA!")

// ===============================
// VARIAVEIS
// ===============================

require("dotenv").config();      //PRIMEIRO
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) console.error("⚠️  JWT_SECRET não configurado!");

const cors = require("cors");
const helmet = require("helmet");
const express = require("express");
const db = require("./db");
const { registrarLog } = require("./utils/securityLog");
const { criarNotificacaoAdmin } = require("./utils/notificacoesAdmin");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const app = express();
const FormData = require("form-data");
const webpush = require("web-push");
const admin = require("firebase-admin");

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (e) {
    console.warn("Firebase Admin não inicializado:", e.message);
  }
}

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
const PDFDocument = require("pdfkit");

// ── OTP pré-registo (em memória, TTL 15 min) ──────────────────────────────────
const otpPreRegistro = new Map();
// Limpar entradas expiradas a cada 10 minutos
setInterval(() => {
  const agora = Date.now();
  for (const [email, entry] of otpPreRegistro.entries()) {
    if (agora > entry.expiresAt) otpPreRegistro.delete(email);
  }
}, 10 * 60 * 1000);
// ──────────────────────────────────────────────────────────────────────────────

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { enviarEmailValidacao, enviarEmailBoasVindasCliente, enviarEmailBoasVindasModelo, enviarEmailContratoModelos, enviarEmailNotificacaoContratoAssinado, enviarEmailVerificacao, enviarEmailOTP, enviarFaturaVIP, enviarFaturaConteudo, enviarFaturaPremium, obterOuCriarAudienceVIP, adicionarContatoAudienceVIP, enviarCampanhaVIP } = require("./email");
const brevo = require("./brevo");
const rateLimit = require("express-rate-limit");
const compression = require('compression');
const cookieParser = require("cookie-parser");
const cookie = require("cookie");


app.set("trust proxy", 1);
ffmpeg.setFfmpegPath(ffmpegPath);

const allowedOrigins = [
  "https://www.velvet.lat",
  "https://velvet-test-production.up.railway.app",
  "https://velvet-app-production.up.railway.app",
  "https://velvet-app.onrender.com",
  "https://velvet-chatbox-test.onrender.com",
  "https://bio.mypagess.workers.dev"
];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://js.stripe.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://res.cloudinary.com",
        "https://*.r2.dev",
        "https://images.safe2pay.com.br",
        "https://api.ipag.com.br",
        "https://*.cloudflarestream.com",
        "https://videodelivery.net",
        "https://imagedelivery.net",
        "https://s3.us-east-005.backblazeb2.com",
        "https://velvet-app-production.up.railway.app"
      ],
      mediaSrc: [
        "'self'",
        "blob:",
        "https://res.cloudinary.com",
        "https://*.r2.dev",
        "https://*.cloudflarestream.com",
        "https://videodelivery.net",
        "https://s3.us-east-005.backblazeb2.com"
      ],
      connectSrc: [
        "'self'",
        "wss:",
        "https://api.stripe.com",
        "https://viacep.com.br",
        "https://velvet-test-production.up.railway.app",
        "https://velvet-app-production.up.railway.app",
        "https://res.cloudinary.com",
        "https://*.r2.dev",
        "https://cdn.jsdelivr.net",
        "https://app.zapsign.com.br",
        "https://api.frankfurter.app",
         "https://formspree.io"
      ],
      frameSrc: [
        "'self'",
        "https://js.stripe.com",
        "https://hooks.stripe.com",
        "https://iframe.videodelivery.net",
        "https://app.zapsign.com.br"
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS bloqueado: " + origin));
  },
  credentials: true
}));

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
// CLOUDFLARE R2 (UPLOAD)
// ===============================
const s3 = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
  signatureVersion: "v4",
  s3ForcePathStyle: true
});

const s3Privado = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
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
// CLOUDFLARE R2 (VERIFICAÇÃO - PRIVADO)
// ===============================
const uploadVerificacao = multer({
  storage: multerS3({
    s3: s3Privado,
    bucket: process.env.R2_BUCKET_PRIVATE,
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

// ===============================
// MODO MANUTENÇÃO
// ===============================
app.use((req, res, next) => {
  const MANUTENCAO = false; // mude para false para reativar o site

  if (!MANUTENCAO) return next();

  // Permite: página de manutenção, rotas de admin, webhooks críticos
  const liberados = [
    "/manutencao.html",
    "/api/webhook/",
    "/api/admin/",
    "/admin/",
    "/public/admin/",
  ];
  if (liberados.some((p) => req.path.startsWith(p))) return next();

  // Retorna a página de manutenção
  return res.status(503).sendFile(path.join(__dirname, "manutencao.html"));
});

// ===============================
// WEBHOOKS
// ===============================

// ===============================
// WEBHOOK ZAPSIGN — Contrato assinado
// ===============================

app.post("/api/webhook/zapsign", express.json(), async (req, res) => {
  try {
    console.log("[ZapSign Webhook]", JSON.stringify(req.body).slice(0, 400));
    const event = req.body;

    // ZapSign envia: { event_type: "sign_doc" | "signer_signed" | ..., document: { token, ... }, signer: { token, ... } }
    const eventType = event?.event_type || event?.type || "";
    const docToken = event?.document?.token || event?.doc?.token || event?.token || null;
    const signerStatus = event?.signer?.status || event?.document?.status || "";

    // Considera assinatura completa quando o documento fica "signed" ou o signatário "signed"
    const foiAssinado =
      eventType === "sign_doc" ||
      eventType === "signer_signed" ||
      signerStatus === "signed" ||
      event?.document?.status === "signed";

    if (!foiAssinado || !docToken) {
      return res.status(200).json({ ok: true, ignorado: true });
    }

    // Actualiza a modelo correspondente
    const upd = await db.query(
      `UPDATE modelos
          SET contrato_assinado = true,
              contrato_assinado_em = NOW()
        WHERE contrato_token = $1
       RETURNING id`,
      [docToken]
    );

    if (upd.rowCount === 0) {
      console.warn(`[ZapSign] Webhook: nenhuma modelo com token ${docToken}`);
      return res.status(200).json({ ok: true });
    }

    const modeloId = upd.rows[0].id;
    console.log(`[ZapSign] Contrato assinado — modelo id ${modeloId}`);

    // Descarregar o PDF assinado do ZapSign e guardar no R2, depois notificar admin
    if (typeof descarregarPDFAssinadoZapSign === "function") {
      descarregarPDFAssinadoZapSign(docToken, modeloId)
        .then(async (pdfR2Key) => {
          try {
            // Buscar dados da modelo para o email de notificação
            const mInfo = await db.query(
              `SELECT m.nome_completo, m.nome_exibicao, u.email, m.contrato_assinado_em
                 FROM modelos m
                 JOIN users u ON u.id = m.user_id
                WHERE m.id = $1`,
              [modeloId]
            );
            const info = mInfo.rows[0] || {};
            await enviarEmailNotificacaoContratoAssinado({
              nomeCompleto:  info.nome_completo,
              nomeExibicao:  info.nome_exibicao,
              emailModelo:   info.email,
              modeloId,
              assinadoEm:    info.contrato_assinado_em,
              pdfR2Key
            });
            console.log(`[ZapSign] Notificação de contrato assinado enviada para contato@velvet.lat`);
          } catch (emailErr) {
            console.warn(`[ZapSign Webhook] Falha ao enviar email de notificação: ${emailErr.message}`);
          }
        })
        .catch(err =>
          console.warn(`[ZapSign Webhook] Falha ao descarregar PDF: ${err.message}`)
        );
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[ZapSign Webhook] Erro:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});


// ── WEBHOOK SAFE2PAY (DESATIVADO — migrado para iPag, ver /api/webhook/ipag) ─
// app.post("/api/webhook/safe2pay", express.json(), async (req, res) => {
//   console.log("======================================");
//   console.log("🔥 WEBHOOK SAFE2PAY RECEBIDO");
//
//   if (process.env.SAFE2PAY_WEBHOOK_TOKEN) {
//     const tokenRecebido =
//       req.headers["x-api-key"] ||
//       req.headers["authorization"] || "";
//     const tokenLimpo = tokenRecebido.replace(/^Bearer\s+/i, "");
//     if (tokenLimpo !== process.env.SAFE2PAY_WEBHOOK_TOKEN) {
//       console.warn("🚨 Webhook Safe2Pay: token inválido");
//       return res.status(401).send("unauthorized");
//     }
//   }
//
//   const body        = req.body;
//   const idTx        = String(body?.IdTransaction || "");
//   const reference   = String(body?.Reference || "");
//   const statusCode  = String(body?.TransactionStatus?.Code || "");
//   const statusName  = String(body?.TransactionStatus?.Name || "").toUpperCase();
//   const valorPago   = Number(body?.Amount || 0);
//
//   console.log("IdTransaction:", idTx, "| Reference:", reference, "| Status:", statusCode, statusName);
//
//   if (!idTx) return res.status(200).send("ok");
//
//   const PAID_CODES   = ["3"];
//   const FAILED_CODES = ["6", "7", "8"];
//
//   const isPaidEvent   = PAID_CODES.includes(statusCode) || statusName.includes("AUTORIZ");
//   const isFailedEvent = FAILED_CODES.includes(statusCode) || statusName.includes("CANCEL") || statusName.includes("ESTORN");
//
//   if (!isPaidEvent && !isFailedEvent) {
//     console.log("Safe2Pay webhook: status ignorado:", statusCode, statusName);
//     return res.status(200).send("ok");
//   }
//
//   const novoStatus = isPaidEvent ? "pago" : "falhou";
//
//   const calcularValores =
//     req.app.get("calcularValores") ||
//     (async ({ valor_bruto }) => ({
//       valor_modelo: valor_bruto * 0.7,
//       agency_fee:   valor_bruto * 0.1,
//       velvet_fee:   valor_bruto * 0.05
//     }));
//
//   const client = await db.connect();
//   let dadosParaEmitir = null;
//
//   try {
//     await client.query("BEGIN");
//
//     /* ──────────────────────────────────────────────────
//        1. PREMIUM_UNLOCKS
//     ────────────────────────────────────────────────── */
//     const premiumRes = await client.query(
//       `SELECT * FROM premium_unlocks
//        WHERE pagarme_order_id = $1::text
//        LIMIT 1 FOR UPDATE`,
//       [idTx]
//     );
//
//     if (premiumRes.rowCount > 0) {
//       const row = premiumRes.rows[0];
//
//       if (row.status === "pago") {
//         await client.query("ROLLBACK");
//         return res.status(200).send("ok");
//       }
//
//       await client.query(
//         `UPDATE premium_unlocks
//          SET status = $1::text, pago_em = CASE WHEN $1::text = 'pago' THEN NOW() ELSE pago_em END,
//              updated_at = NOW()
//          WHERE id = $2`,
//         [novoStatus, row.id]
//       );
//
//       await client.query(
//         `INSERT INTO safe2pay_events (id, type, cliente_id, modelo_id, created_at)
//          VALUES ($1, $2, $3, $4, NOW())
//          ON CONFLICT (id) DO UPDATE SET type = excluded.type, cliente_id = excluded.cliente_id, modelo_id = excluded.modelo_id`,
//         [idTx, novoStatus, row.cliente_id || null, row.modelo_id || null]
//       );
//
//       if (isPaidEvent) {
//         const cliente_id      = Number(row.cliente_id);
//         const modelo_id       = Number(row.modelo_id);
//         const premium_post_id = Number(row.premium_post_id);
//         const valorBase       = Number(row.valor_base || valorPago);
//         const taxaGateway     = Number((valorBase * 0.15).toFixed(2));
//
//         const valores = await calcularValores({
//           modelo_id, valor_bruto: valorBase, taxa_gateway: taxaGateway
//         });
//
//         await client.query(
//           `INSERT INTO transacoes_agency
//              (modelo_id, cliente_id, tipo, valor_bruto,
//               valor_modelo, agency_fee, velvet_fee, taxa_gateway, status, created_at)
//            VALUES ($1,$2,'midia',$3,$4,$5,$6,$7,'pago',NOW())`,
//           [modelo_id, cliente_id, valorBase,
//            Number(valores.valor_modelo || 0), Number(valores.agency_fee || 0),
//            Number(valores.velvet_fee || 0), taxaGateway]
//         );
//
//         dadosParaEmitir = { tipo: "premium", cliente_id, modelo_id, premium_post_id, payment_id: idTx };
//       }
//
//       await client.query("COMMIT");
//
//       if (dadosParaEmitir) {
//         try {
//           const io = req.app.get("io");
//           if (io) {
//             io.to(`user_${dadosParaEmitir.cliente_id}`).emit("pagamento_confirmado", {
//               tipo: "premium",
//               premium_post_id: dadosParaEmitir.premium_post_id,
//               modelo_id:       dadosParaEmitir.modelo_id,
//               payment_id:      dadosParaEmitir.payment_id
//             });
//           }
//         } catch (e) { console.error("Erro socket premium webhook Safe2Pay:", e); }
//       }
//
//       console.log("✅ WEBHOOK SAFE2PAY PREMIUM FINALIZADO");
//       return res.status(200).send("ok");
//     }
//
//     /* ──────────────────────────────────────────────────
//        2. PAGAMENTOS_PIX — VIP ou Mídia
//     ────────────────────────────────────────────────── */
//     const pixRes = await client.query(
//       `SELECT * FROM pagamentos_pix
//        WHERE pagarme_order_id = $1
//        LIMIT 1 FOR UPDATE`,
//       [idTx]
//     );
//
//     if (pixRes.rowCount === 0) {
//       await client.query("ROLLBACK");
//       console.warn("Safe2Pay webhook: pagamento não encontrado:", idTx);
//       return res.status(200).send("ok");
//     }
//
//     const row = pixRes.rows[0];
//
//     if (row.status === "pago") {
//       await client.query("ROLLBACK");
//       return res.status(200).send("ok");
//     }
//
//     await client.query(
//       `UPDATE pagamentos_pix SET status = $1 WHERE pagarme_order_id = $2`,
//       [novoStatus, idTx]
//     );
//
//     await client.query(
//       `INSERT INTO safe2pay_events (id, type, cliente_id, modelo_id, created_at)
//        VALUES ($1, $2, $3, $4, NOW())
//        ON CONFLICT (id) DO UPDATE SET type = excluded.type, cliente_id = excluded.cliente_id, modelo_id = excluded.modelo_id`,
//       [idTx, novoStatus, row.cliente_id || null, row.modelo_id || null]
//     );
//
//     if (isPaidEvent) {
//       const cliente_id      = Number(row.cliente_id);
//       const modelo_id       = Number(row.modelo_id);
//       const message_id      = row.message_id ? Number(row.message_id) : null;
//       const isVip           = !message_id;
//       const valorBrutoTotal = Number(row.valor || valorPago);
//       const valorBase       = Number((valorBrutoTotal / 1.15).toFixed(2));
//       const taxaGateway     = Number((valorBrutoTotal - valorBase).toFixed(2));
//
//       const valores = await calcularValores({
//         modelo_id, valor_bruto: valorBase, taxa_gateway: taxaGateway
//       });
//
//       if (isVip) {
//         const vipExistente = await client.query(
//           `SELECT id, ativo, expiration_at
//            FROM vip_subscriptions
//            WHERE cliente_id = $1 AND modelo_id = $2
//            LIMIT 1 FOR UPDATE`,
//           [cliente_id, modelo_id]
//         );
//
//         let novaExpiracao;
//         if (
//           vipExistente.rowCount > 0 &&
//           vipExistente.rows[0].expiration_at &&
//           new Date(vipExistente.rows[0].expiration_at) > new Date()
//         ) {
//           novaExpiracao = new Date(vipExistente.rows[0].expiration_at);
//           novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
//         } else {
//           novaExpiracao = new Date();
//           novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
//         }
//
//         const primeiraAssinatura = vipExistente.rowCount === 0;
//
//         if (vipExistente.rowCount > 0) {
//           await client.query(
//             `UPDATE vip_subscriptions
//              SET ativo = true, updated_at = NOW(), expiration_at = $3,
//                  valor_assinatura = $4, taxa_transacao = $5, taxa_plataforma = 0,
//                  valor_total = $6, recorrente = false,
//                  gateway_subscription_id = $7,
//                  aviso_7_dias_enviado = false, aviso_24h_enviado = false
//              WHERE cliente_id = $1 AND modelo_id = $2`,
//             [cliente_id, modelo_id, novaExpiracao, valorBase, taxaGateway, valorBrutoTotal, idTx]
//           );
//         } else {
//           await client.query(
//             `INSERT INTO vip_subscriptions
//                (cliente_id, modelo_id, ativo, created_at, updated_at,
//                 expiration_at, valor_assinatura, taxa_transacao, taxa_plataforma,
//                 valor_total, recorrente, gateway_subscription_id)
//              VALUES ($1,$2,true,NOW(),NOW(),$3,$4,$5,0,$6,false,$7)`,
//             [cliente_id, modelo_id, novaExpiracao, valorBase, taxaGateway, valorBrutoTotal, idTx]
//           );
//         }
//
//         await client.query(
//           `INSERT INTO transacoes_agency
//              (modelo_id, cliente_id, tipo, valor_bruto,
//               valor_modelo, agency_fee, velvet_fee, taxa_gateway, status, created_at)
//            VALUES ($1,$2,'assinatura',$3,$4,$5,$6,$7,'pago',NOW())`,
//           [modelo_id, cliente_id, valorBase,
//            Number(valores.valor_modelo || 0), Number(valores.agency_fee || 0),
//            Number(valores.velvet_fee || 0), taxaGateway]
//         );
//
//         if (primeiraAssinatura) {
//           await client.query(
//             `INSERT INTO messages
//                (cliente_id, modelo_id, text, sender, tipo,
//                 created_at, lida, visto, deletada)
//              VALUES ($1,$2,$3,'modelo','texto',NOW(),false,false,false)`,
//             [cliente_id, modelo_id, "Oii!! Bem vindo(a), qual seu nome?🥰🔥"]
//           );
//         }
//
//         // Incrementa uso da oferta ativa (desativa se atingiu limite)
//         await client.query(`
//           UPDATE ofertas
//           SET assinaturas_usadas = assinaturas_usadas + 1,
//               ativa = CASE WHEN assinaturas_usadas + 1 >= limite_assinaturas THEN false ELSE ativa END
//           WHERE modelo_id = $1 AND ativa = true AND (data_fim IS NULL OR data_fim >= NOW())
//         `, [modelo_id]);
//
//         dadosParaEmitir = { tipo: "vip", cliente_id, modelo_id, primeiraAssinatura };
//
//       } else {
//         await client.query(
//           `INSERT INTO conteudo_pacotes
//              (message_id, cliente_id, modelo_id, preco, valor_base,
//               valor_total, status, metodo_pagamento, pago_em, currency,
//               valor_cobrado, taxa_cambio)
//            VALUES ($1,$2,$3,$4,$4,$5,'pago','pix',NOW(),'brl',$5,NULL)
//            ON CONFLICT (message_id, cliente_id) DO UPDATE
//              SET status='pago', metodo_pagamento='pix',
//                  pago_em=NOW(), valor_total=$5`,
//           [message_id, cliente_id, modelo_id, valorBase, valorBrutoTotal]
//         );
//
//         const conteudo_ids =
//           await marcarConteudoComoLiberadoPorPagamento(client, {
//             message_id, cliente_id, modelo_id
//           });
//
//         await client.query(
//           `INSERT INTO transacoes_agency
//              (modelo_id, cliente_id, tipo, valor_bruto,
//               valor_modelo, agency_fee, velvet_fee, taxa_gateway, status, created_at)
//            VALUES ($1,$2,'midia',$3,$4,$5,$6,$7,'pago',NOW())`,
//           [modelo_id, cliente_id, valorBase,
//            Number(valores.valor_modelo || 0), Number(valores.agency_fee || 0),
//            Number(valores.velvet_fee || 0), taxaGateway]
//         );
//
//         dadosParaEmitir = { tipo: "conteudo", cliente_id, modelo_id, message_id, conteudo_ids };
//       }
//     }
//
//     await client.query("COMMIT");
//
//     if (dadosParaEmitir) {
//       if (dadosParaEmitir.tipo === "vip") {
//         registrarLog(db, {
//           tipo: 'assinatura_vip',
//           cliente_id: dadosParaEmitir.cliente_id,
//           modelo_id:  dadosParaEmitir.modelo_id,
//           descricao:  `Assinatura VIP confirmada via PIX (Safe2Pay) — modelo_id ${dadosParaEmitir.modelo_id}`
//         });
//       } else if (dadosParaEmitir.tipo === "conteudo") {
//         registrarLog(db, {
//           tipo: 'compra_midia_chat',
//           cliente_id: dadosParaEmitir.cliente_id,
//           modelo_id:  dadosParaEmitir.modelo_id,
//           descricao:  `Mídia do chat desbloqueada via PIX (Safe2Pay) — message_id ${dadosParaEmitir.message_id}`
//         });
//       } else if (dadosParaEmitir.tipo === "premium") {
//         registrarLog(db, {
//           tipo: 'compra_premium',
//           cliente_id: dadosParaEmitir.cliente_id,
//           modelo_id:  dadosParaEmitir.modelo_id,
//           descricao:  `Premium desbloqueado via PIX (Safe2Pay) — premium_post_id ${dadosParaEmitir.premium_post_id}`
//         });
//       }
//     }
//
//     if (dadosParaEmitir) {
//       try {
//         const io = req.app.get("io");
//         if (io) {
//           if (dadosParaEmitir.tipo === "conteudo") {
//             const sala = `chat_${dadosParaEmitir.cliente_id}_${dadosParaEmitir.modelo_id}`;
//             io.to(sala).emit("conteudoLiberado", {
//               message_id:   Number(dadosParaEmitir.message_id),
//               conteudo_ids: dadosParaEmitir.conteudo_ids || []
//             });
//           }
//           if (dadosParaEmitir.tipo === "vip") {
//             const sala = `chat_${dadosParaEmitir.cliente_id}_${dadosParaEmitir.modelo_id}`;
//             io.to(sala).emit("vipAtivado", {
//               cliente_id: Number(dadosParaEmitir.cliente_id),
//               modelo_id:  Number(dadosParaEmitir.modelo_id)
//             });
//           }
//         }
//       } catch (e) { console.error("Erro socket webhook Safe2Pay:", e); }
//     }
//
//     // ── EMAIL FATURA SAFE2PAY (fire-and-forget) ──────────────────
//     if (dadosParaEmitir) {
//       (async () => {
//         try {
//           const ci = await buscarDadosEmailPagamento(db, {
//             cliente_id: dadosParaEmitir.cliente_id,
//             modelo_id:  dadosParaEmitir.modelo_id
//           });
//           if (!ci?.email) return;
//
//           const pagPix = await db.query(
//             `SELECT aceite_ip, aceite_timestamp, versao_termos, cpf, telefone, valor
//              FROM pagamentos_pix WHERE pagarme_order_id = $1 LIMIT 1`,
//             [idTx]
//           );
//           const pp = pagPix.rows[0] || {};
//
//           const base = {
//             nome:             ci.nome,
//             email:            ci.email,
//             modelo_nome:      ci.modelo_nome,
//             valor:            Number(pp.valor || valorPago),
//             metodo:           'pix',
//             card_info:        null,
//             cpf:              pp.cpf,
//             telefone:         pp.telefone || ci.tel_cad,
//             ip:               pp.aceite_ip,
//             aceite_timestamp: pp.aceite_timestamp,
//             versao_termos:    pp.versao_termos,
//             payment_ref:      idTx
//           };
//
//           if (dadosParaEmitir.tipo === 'vip') {
//             const vipR = await db.query(
//               `SELECT expiration_at FROM vip_subscriptions WHERE cliente_id = $1 AND modelo_id = $2 LIMIT 1`,
//               [dadosParaEmitir.cliente_id, dadosParaEmitir.modelo_id]
//             );
//             await enviarFaturaVIP({
//               ...base,
//               endereco:          ci.endereco_fmt,
//               primeiraAssinatura: dadosParaEmitir.primeiraAssinatura,
//               novaExpiracao:     vipR.rows[0]?.expiration_at
//             });
//             const audId = await obterOuCriarAudienceVIP(db, dadosParaEmitir.modelo_id, ci.modelo_nome);
//             await adicionarContatoAudienceVIP(audId, ci.email, ci.nome);
//           } else if (dadosParaEmitir.tipo === 'conteudo') {
//             await enviarFaturaConteudo(base);
//           }
//         } catch (emailErr) {
//           console.error('Erro email fatura Safe2Pay:', emailErr.message);
//         }
//       })();
//     }
//     // ─────────────────────────────────────────────────────────────
//
//     console.log("✅ WEBHOOK SAFE2PAY FINALIZADO");
//     return res.status(200).send("ok");
//
//   } catch (err) {
//     try { await client.query("ROLLBACK"); } catch (_) {}
//     console.error("🔥 ERRO WEBHOOK SAFE2PAY:", err);
//     return res.status(500).send("erro");
//   } finally {
//     client.release();
//   }
// });

// ── WEBHOOK IPAG ─────────────────────────────────────────────────────────────
app.post("/api/webhook/ipag", express.raw({ type: "*/*" }), async (req, res) => {
  console.log("======================================");
  console.log("🔥 WEBHOOK IPAG RECEBIDO");

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

  // Verificação de assinatura HMAC — quando configurada, é suficiente para autenticar o webhook.
  let hmacVerificado = false;
  if (process.env.IPAG_API_KEY) {
    const assinaturaRecebida = String(req.headers["x-ipag-signature"] || "");
    const assinaturaCalculada = crypto
      .createHmac("sha256", process.env.IPAG_API_KEY)
      .update(rawBody)
      .digest("hex");

    let assinaturaValida = false;
    try {
      assinaturaValida =
        assinaturaRecebida.length === assinaturaCalculada.length &&
        crypto.timingSafeEqual(Buffer.from(assinaturaRecebida), Buffer.from(assinaturaCalculada));
    } catch (_) {
      assinaturaValida = false;
    }

    if (!assinaturaValida) {
      console.warn("🚨 Webhook iPag: assinatura inválida");
      return res.status(400).send("invalid signature");
    }

    hmacVerificado = true;
    console.log("✅ Webhook iPag: assinatura HMAC válida");
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch (e) {
    console.error("🔥 ERRO WEBHOOK IPAG: body inválido", e);
    return res.status(400).send("invalid body");
  }

  const idTx        = String(body?.id || "");
  const statusCode  = String(body?.attributes?.status?.code || "");
  const statusName  = String(body?.attributes?.status?.message || "").toUpperCase();
  const valorPago   = Number(body?.attributes?.amount || 0);

  console.log("Id:", idTx, "| Order:", body?.attributes?.order_id, "| Status:", statusCode, statusName);

  if (!idTx) return res.status(200).send("ok");

  const PAID_CODES   = ["8"];        // CAPTURED
  const FAILED_CODES = ["3", "7", "9"]; // CANCELED, DECLINED, CHARGEDBACK

  const isPaidEvent   = PAID_CODES.includes(statusCode);
  const isFailedEvent = FAILED_CODES.includes(statusCode);

  // Verificação dupla via API iPag — só necessária quando não há HMAC configurado.
  // Quando HMAC foi verificado acima, o webhook já é autêntico e não precisamos consultar a API.
  if (isPaidEvent && !hmacVerificado) {
    let statusVerificado = null;
    let capturedVerificado = 0;
    let erroVerificacao = null;

    try {
      const txVerificada = await ipagRequest("GET", `/service/payment/${idTx}`);
      statusVerificado  = String(txVerificada?.attributes?.status?.code || "");
      capturedVerificado = Number(txVerificada?.attributes?.captured_amount || 0);
    } catch (errVerif) {
      erroVerificacao = errVerif.message;
    }

    const confirmado = !erroVerificacao && statusVerificado === "8" && capturedVerificado > 0;

    if (!confirmado) {
      const motivo = erroVerificacao
        ? `Falha ao consultar API iPag: ${erroVerificacao}`
        : `Webhook diz CAPTURED mas API retornou status=${statusVerificado} captured=${capturedVerificado}`;

      console.warn(`🚨 Webhook iPag suspeito — tx=${idTx} | ${motivo}`);

      let clienteIdSuspeito = null;
      let modeloIdSuspeito  = null;
      let tipoPagamento     = "desconhecido";
      try {
        const rPrem = await db.query(
          `SELECT cliente_id, modelo_id FROM premium_unlocks WHERE pagarme_order_id = $1 LIMIT 1`,
          [idTx]
        );
        if (rPrem.rowCount > 0) {
          clienteIdSuspeito = rPrem.rows[0].cliente_id;
          modeloIdSuspeito  = rPrem.rows[0].modelo_id;
          tipoPagamento     = "premium";
        } else {
          const rPix = await db.query(
            `SELECT cliente_id, modelo_id, message_id FROM pagamentos_pix WHERE pagarme_order_id = $1 LIMIT 1`,
            [idTx]
          );
          if (rPix.rowCount > 0) {
            clienteIdSuspeito = rPix.rows[0].cliente_id;
            modeloIdSuspeito  = rPix.rows[0].modelo_id;
            tipoPagamento     = rPix.rows[0].message_id ? "chat" : "assinatura_vip";
          }
        }
      } catch (_) {}

      // Loga e notifica para investigação — mas NÃO bloqueia a liberação.
      // Cliente já pagou: melhor liberar e investigar depois do que punir quem pagou.
      registrarLog(db, {
        tipo:       'webhook_suspeito_ipag',
        cliente_id: clienteIdSuspeito,
        modelo_id:  modeloIdSuspeito,
        descricao:  `[${tipoPagamento.toUpperCase()}] tx=${idTx} — ${motivo} (conteúdo liberado mesmo assim)`,
        ip:         req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
        user_agent: req.headers["user-agent"] || null
      });

      const ioSusp = req.app.get("io");
      criarNotificacaoAdmin(db, ioSusp, {
        tipo:         'webhook_suspeito_ipag',
        referencia_id: clienteIdSuspeito,
        titulo:       `⚠️ Webhook iPag suspeito (liberado) — ${tipoPagamento}`,
        mensagem:     `tx=${idTx} | ${motivo} | Conteúdo liberado — verifique depois`
      });
      // Continua para liberar o conteúdo normalmente
    }

    console.log(`✅ iPag API confirmou pagamento: tx=${idTx} status=${statusVerificado} captured=${capturedVerificado}`);
  }

  if (!isPaidEvent && !isFailedEvent) {
    console.log("iPag webhook: status ignorado:", statusCode, statusName);
    return res.status(200).send("ok");
  }

  const novoStatus = isPaidEvent ? "pago" : "falhou";

  const calcularValores =
    req.app.get("calcularValores") ||
    (async ({ valor_bruto }) => ({
      valor_modelo: valor_bruto * 0.7,
      agency_fee:   valor_bruto * 0.1,
      velvet_fee:   valor_bruto * 0.05
    }));

  const client = await db.connect();
  let dadosParaEmitir = null;

  try {
    await client.query("BEGIN");

    /* ──────────────────────────────────────────────────
       1. PREMIUM_UNLOCKS
    ────────────────────────────────────────────────── */
    const premiumRes = await client.query(
      `SELECT * FROM premium_unlocks
       WHERE pagarme_order_id = $1::text
       LIMIT 1 FOR UPDATE`,
      [idTx]
    );

    if (premiumRes.rowCount > 0) {
      const row = premiumRes.rows[0];

      if (row.status === "pago") {
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      await client.query(
        `UPDATE premium_unlocks
         SET status = $1::text, pago_em = CASE WHEN $1::text = 'pago' THEN NOW() ELSE pago_em END,
             updated_at = NOW()
         WHERE id = $2`,
        [novoStatus, row.id]
      );

      await client.query(
        `INSERT INTO safe2pay_events (id, type, cliente_id, modelo_id, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE SET type = excluded.type, cliente_id = excluded.cliente_id, modelo_id = excluded.modelo_id`,
        [idTx, novoStatus, row.cliente_id || null, row.modelo_id || null]
      );

      if (isPaidEvent) {
        const cliente_id      = Number(row.cliente_id);
        const modelo_id       = Number(row.modelo_id);
        const premium_post_id = Number(row.premium_post_id);
        const valorBase       = Number(row.valor_base || valorPago);
        const taxaGateway     = Number((valorBase * 0.15).toFixed(2));

        const valores = await calcularValores({
          modelo_id, valor_bruto: valorBase, taxa_gateway: taxaGateway
        });

        await client.query(
          `INSERT INTO transacoes_agency
             (modelo_id, cliente_id, tipo, valor_bruto,
              valor_modelo, agency_fee, velvet_fee, taxa_gateway, status, created_at,
              gateway, disponivel_em)
           VALUES ($1,$2,'midia',$3,$4,$5,$6,$7,'pago',NOW(),'ipag',NOW())`,
          [modelo_id, cliente_id, valorBase,
           Number(valores.valor_modelo || 0), Number(valores.agency_fee || 0),
           Number(valores.velvet_fee || 0), taxaGateway]
        );

        dadosParaEmitir = { tipo: "premium", cliente_id, modelo_id, premium_post_id, payment_id: idTx };
      }

      await client.query("COMMIT");

      if (dadosParaEmitir) {
        try {
          const io = req.app.get("io");
          if (io) {
            io.to(`user_${dadosParaEmitir.cliente_id}`).emit("pagamento_confirmado", {
              tipo: "premium",
              premium_post_id: dadosParaEmitir.premium_post_id,
              modelo_id:       dadosParaEmitir.modelo_id,
              payment_id:      dadosParaEmitir.payment_id
            });
          }
        } catch (e) { console.error("Erro socket premium webhook iPag:", e); }
      }

      console.log("✅ WEBHOOK IPAG PREMIUM FINALIZADO");
      return res.status(200).send("ok");
    }

    /* ──────────────────────────────────────────────────
       2. PAGAMENTOS_PIX — VIP ou Mídia
    ────────────────────────────────────────────────── */
    const pixRes = await client.query(
      `SELECT * FROM pagamentos_pix
       WHERE pagarme_order_id = $1
       LIMIT 1 FOR UPDATE`,
      [idTx]
    );

    if (pixRes.rowCount === 0) {
      await client.query("ROLLBACK");
      console.warn("iPag webhook: pagamento não encontrado:", idTx);
      return res.status(200).send("ok");
    }

    const row = pixRes.rows[0];

    if (row.status === "pago") {
      await client.query("ROLLBACK");
      return res.status(200).send("ok");
    }

    await client.query(
      `UPDATE pagamentos_pix SET status = $1 WHERE pagarme_order_id = $2`,
      [novoStatus, idTx]
    );

    await client.query(
      `INSERT INTO safe2pay_events (id, type, cliente_id, modelo_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET type = excluded.type, cliente_id = excluded.cliente_id, modelo_id = excluded.modelo_id`,
      [idTx, novoStatus, row.cliente_id || null, row.modelo_id || null]
    );

    if (isPaidEvent) {
      const cliente_id      = Number(row.cliente_id);
      const modelo_id       = Number(row.modelo_id);
      const message_id      = row.message_id ? Number(row.message_id) : null;
      const isVip           = !message_id;
      const valorBrutoTotal = Number(row.valor || valorPago);
      const valorBase       = Number((valorBrutoTotal / 1.15).toFixed(2));
      const taxaGateway     = Number((valorBrutoTotal - valorBase).toFixed(2));

      const valores = await calcularValores({
        modelo_id, valor_bruto: valorBase, taxa_gateway: taxaGateway
      });

      if (isVip) {
        const vipExistente = await client.query(
          `SELECT id, ativo, expiration_at
           FROM vip_subscriptions
           WHERE cliente_id = $1 AND modelo_id = $2
           LIMIT 1 FOR UPDATE`,
          [cliente_id, modelo_id]
        );

        let novaExpiracao;
        if (
          vipExistente.rowCount > 0 &&
          vipExistente.rows[0].expiration_at &&
          new Date(vipExistente.rows[0].expiration_at) > new Date()
        ) {
          novaExpiracao = new Date(vipExistente.rows[0].expiration_at);
          novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
        } else {
          novaExpiracao = new Date();
          novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
        }

        const primeiraAssinatura = vipExistente.rowCount === 0;

        if (vipExistente.rowCount > 0) {
          await client.query(
            `UPDATE vip_subscriptions
             SET ativo = true, updated_at = NOW(), expiration_at = $3,
                 valor_assinatura = $4, taxa_transacao = $5, taxa_plataforma = 0,
                 valor_total = $6, recorrente = false,
                 gateway_subscription_id = $7,
                 aviso_7_dias_enviado = false, aviso_24h_enviado = false
             WHERE cliente_id = $1 AND modelo_id = $2`,
            [cliente_id, modelo_id, novaExpiracao, valorBase, taxaGateway, valorBrutoTotal, idTx]
          );
        } else {
          await client.query(
            `INSERT INTO vip_subscriptions
               (cliente_id, modelo_id, ativo, created_at, updated_at,
                expiration_at, valor_assinatura, taxa_transacao, taxa_plataforma,
                valor_total, recorrente, gateway_subscription_id)
             VALUES ($1,$2,true,NOW(),NOW(),$3,$4,$5,0,$6,false,$7)`,
            [cliente_id, modelo_id, novaExpiracao, valorBase, taxaGateway, valorBrutoTotal, idTx]
          );
        }

        await client.query(
          `INSERT INTO transacoes_agency
             (modelo_id, cliente_id, tipo, valor_bruto,
              valor_modelo, agency_fee, velvet_fee, taxa_gateway, status, created_at,
              gateway, disponivel_em)
           VALUES ($1,$2,'assinatura',$3,$4,$5,$6,$7,'pago',NOW(),'ipag',NOW())`,
          [modelo_id, cliente_id, valorBase,
           Number(valores.valor_modelo || 0), Number(valores.agency_fee || 0),
           Number(valores.velvet_fee || 0), taxaGateway]
        );

        if (primeiraAssinatura) {
          const _boasVindas1109 = modelo_id === 859
            ? "¡Hola!! Bienvenido(a), cuál es tu nombre?🥰🔥"
            : "Oii!! Bem vindo(a), qual seu nome?🥰🔥";
          await client.query(
            `INSERT INTO messages
               (cliente_id, modelo_id, text, sender, tipo,
                created_at, lida, visto, deletada)
             VALUES ($1,$2,$3,'modelo','texto',NOW(),false,false,false)`,
            [cliente_id, modelo_id, _boasVindas1109]
          );
        }

        // Incrementa uso da oferta ativa (desativa se atingiu limite)
        await client.query(`
          UPDATE ofertas
          SET assinaturas_usadas = assinaturas_usadas + 1,
              ativa = CASE WHEN assinaturas_usadas + 1 >= limite_assinaturas THEN false ELSE ativa END
          WHERE modelo_id = $1 AND ativa = true AND (data_fim IS NULL OR data_fim >= NOW())
        `, [modelo_id]);

        dadosParaEmitir = { tipo: "vip", cliente_id, modelo_id, primeiraAssinatura };

      } else {
        await client.query(
          `INSERT INTO conteudo_pacotes
             (message_id, cliente_id, modelo_id, preco, valor_base,
              valor_total, status, metodo_pagamento, pago_em, currency,
              valor_cobrado, taxa_cambio)
           VALUES ($1,$2,$3,$4,$4,$5,'pago','pix',NOW(),'brl',$5,NULL)
           ON CONFLICT (message_id, cliente_id) DO UPDATE
             SET status='pago', metodo_pagamento='pix',
                 pago_em=NOW(), valor_total=$5`,
          [message_id, cliente_id, modelo_id, valorBase, valorBrutoTotal]
        );

        const conteudo_ids =
          await marcarConteudoComoLiberadoPorPagamento(client, {
            message_id, cliente_id, modelo_id
          });

        await client.query(
          `INSERT INTO transacoes_agency
             (modelo_id, cliente_id, tipo, valor_bruto,
              valor_modelo, agency_fee, velvet_fee, taxa_gateway, status, created_at,
              gateway, disponivel_em)
           VALUES ($1,$2,'midia',$3,$4,$5,$6,$7,'pago',NOW(),'ipag',NOW())`,
          [modelo_id, cliente_id, valorBase,
           Number(valores.valor_modelo || 0), Number(valores.agency_fee || 0),
           Number(valores.velvet_fee || 0), taxaGateway]
        );

        dadosParaEmitir = { tipo: "conteudo", cliente_id, modelo_id, message_id, conteudo_ids };
      }
    }

    await client.query("COMMIT");

    if (dadosParaEmitir) {
      if (dadosParaEmitir.tipo === "vip") {
        registrarLog(db, {
          tipo: 'assinatura_vip',
          cliente_id: dadosParaEmitir.cliente_id,
          modelo_id:  dadosParaEmitir.modelo_id,
          descricao:  `Assinatura VIP confirmada via PIX (iPag) — modelo_id ${dadosParaEmitir.modelo_id}`,
          ip:         row.aceite_ip || null
        });
      } else if (dadosParaEmitir.tipo === "conteudo") {
        registrarLog(db, {
          tipo: 'compra_midia_chat',
          cliente_id: dadosParaEmitir.cliente_id,
          modelo_id:  dadosParaEmitir.modelo_id,
          descricao:  `Mídia do chat desbloqueada via PIX (iPag) — message_id ${dadosParaEmitir.message_id}`,
          ip:         row.aceite_ip || null
        });
      } else if (dadosParaEmitir.tipo === "premium") {
        registrarLog(db, {
          tipo: 'compra_premium',
          cliente_id: dadosParaEmitir.cliente_id,
          modelo_id:  dadosParaEmitir.modelo_id,
          descricao:  `Premium desbloqueado via PIX (iPag) — premium_post_id ${dadosParaEmitir.premium_post_id}`,
          ip:         row.aceite_ip || null
        });
      }
    }

    if (dadosParaEmitir) {
      try {
        const io = req.app.get("io");
        if (io) {
          if (dadosParaEmitir.tipo === "conteudo") {
            const sala = `chat_${dadosParaEmitir.cliente_id}_${dadosParaEmitir.modelo_id}`;
            io.to(sala).emit("conteudoLiberado", {
              message_id:   Number(dadosParaEmitir.message_id),
              conteudo_ids: dadosParaEmitir.conteudo_ids || []
            });
          }
          if (dadosParaEmitir.tipo === "vip") {
            const sala = `chat_${dadosParaEmitir.cliente_id}_${dadosParaEmitir.modelo_id}`;
            io.to(sala).emit("vipAtivado", {
              cliente_id: Number(dadosParaEmitir.cliente_id),
              modelo_id:  Number(dadosParaEmitir.modelo_id)
            });
          }
        }
      } catch (e) { console.error("Erro socket webhook iPag:", e); }
    }

    // ── EMAIL FATURA IPAG (fire-and-forget) ──────────────────
    if (dadosParaEmitir) {
      (async () => {
        try {
          const ci = await buscarDadosEmailPagamento(db, {
            cliente_id: dadosParaEmitir.cliente_id,
            modelo_id:  dadosParaEmitir.modelo_id
          });
          if (!ci?.email) return;

          const pagPix = await db.query(
            `SELECT aceite_ip, aceite_timestamp, versao_termos, cpf, telefone, valor
             FROM pagamentos_pix WHERE pagarme_order_id = $1 LIMIT 1`,
            [idTx]
          );
          const pp = pagPix.rows[0] || {};

          const base = {
            nome:             ci.nome,
            email:            ci.email,
            modelo_nome:      ci.modelo_nome,
            valor:            Number(pp.valor || valorPago),
            metodo:           'pix',
            card_info:        null,
            cpf:              pp.cpf,
            telefone:         pp.telefone || ci.tel_cad,
            ip:               pp.aceite_ip,
            aceite_timestamp: pp.aceite_timestamp,
            versao_termos:    pp.versao_termos,
            payment_ref:      idTx
          };

          if (dadosParaEmitir.tipo === 'vip') {
            const vipR = await db.query(
              `SELECT expiration_at FROM vip_subscriptions WHERE cliente_id = $1 AND modelo_id = $2 LIMIT 1`,
              [dadosParaEmitir.cliente_id, dadosParaEmitir.modelo_id]
            );
            await enviarFaturaVIP({
              ...base,
              endereco:          ci.endereco_fmt,
              primeiraAssinatura: dadosParaEmitir.primeiraAssinatura,
              novaExpiracao:     vipR.rows[0]?.expiration_at
            });
            const audId = await obterOuCriarAudienceVIP(db, dadosParaEmitir.modelo_id, ci.modelo_nome);
            await adicionarContatoAudienceVIP(audId, ci.email, ci.nome);
          } else if (dadosParaEmitir.tipo === 'conteudo') {
            await enviarFaturaConteudo(base);
          }
        } catch (emailErr) {
          console.error('Erro email fatura iPag:', emailErr.message);
        }
      })();
    }
    // ─────────────────────────────────────────────────────────────

    console.log("✅ WEBHOOK IPAG FINALIZADO");
    return res.status(200).send("ok");

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("🔥 ERRO WEBHOOK IPAG:", err);
    return res.status(500).send("erro");
  } finally {
    client.release();
  }
});

// ── PLACEHOLDER para o antigo webhook pagarme (removido) ──
app.post("/api/webhook/pagarme_REMOVED", express.raw({ type: "*/*" }), async (req, res) => {
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

  if (!eventId) {
    console.log("🚨 event.id ausente");
    return res.status(200).send("ok");
  }

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

  const amountCentavos = Number(charge?.amount ?? order?.amount ?? 0);
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
  INSERT INTO pagarme_events (id, type, payload, received_at)
  VALUES ($1, $2, $3::jsonb, NOW())
  `,
  [eventId, event.type, JSON.stringify(event)]
);

    console.log("Evento registrado em pagarme_events");

    /* =====================================================
       BUSCAR PAGAMENTO LOCAL (SOMENTE PIX)
    ===================================================== */

    let pagamento = null;
    let tabelaPagamento = null;
    let metodoPagamento = "pix";

    // 1) PREMIUM PIX
    const premiumRes = await client.query(
      `
      SELECT *
      FROM premium_unlocks
      WHERE pagarme_order_id = $1
      FOR UPDATE
      `,
      [orderId]
    );

    if (premiumRes.rowCount > 0) {
      pagamento = premiumRes.rows[0];
      tabelaPagamento = "premium_unlocks";
      metodoPagamento = pagamento.metodo_pagamento || "pix";
    } else {
      // 2) PIX geral
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
      }
    }

    if (!pagamento) {
      console.log("🚨 Pagamento não encontrado:", orderId);
      await client.query("ROLLBACK");
      return res.status(200).send("ok");
    }

    console.log("Pagamento encontrado em", tabelaPagamento, pagamento);

    const cliente_id = Number(
      pagamento.cliente_id || metadata.cliente_id || 0
    ) || null;

    const modelo_id = Number(
      pagamento.modelo_id || metadata.modelo_id || 0
    ) || null;

    const message_id = Number(
      pagamento.message_id ||
      pagamento.conteudo_id ||
      metadata.message_id ||
      0
    ) || null;

    const premium_post_id = Number(
      pagamento.premium_post_id ||
      metadata.premium_post_id ||
      0
    ) || null;

    const valorEsperado = Number(
      pagamento.valor_total ||
      pagamento.valor ||
      metadata.valor_total ||
      0
    );

    const tipoPagamento = String(
      metadata.tipo ||
      pagamento.tipo ||
      ""
    ).toLowerCase().trim();

    let fluxoProcessado = false;

    console.log("cliente_id:", cliente_id);
    console.log("modelo_id:", modelo_id);
    console.log("valor esperado:", valorEsperado);
    console.log("message_id:", message_id);
    console.log("premium_post_id:", premium_post_id);
    console.log("tipoPagamento:", tipoPagamento);

    /* =====================================================
       EVENTOS DE FALHA / ESTORNO / CHARGEBACK
    ===================================================== */

    if (isFailedEvent) {
      console.log("❌ Evento de falha");

      if (tabelaPagamento === "premium_unlocks") {
        await client.query(
          `
          UPDATE premium_unlocks
          SET status = 'falhou',
              updated_at = NOW()
          WHERE id = $1
          `,
          [pagamento.id]
        );
      } else if (tabelaPagamento === "pagamentos_pix") {
        await client.query(
          `
          UPDATE pagamentos_pix
          SET status = 'falhou'
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

      if (tabelaPagamento === "premium_unlocks") {
        await client.query(
          `
          UPDATE premium_unlocks
          SET status = 'estornado',
              updated_at = NOW()
          WHERE id = $1
          `,
          [pagamento.id]
        );
      } else if (tabelaPagamento === "pagamentos_pix") {
        await client.query(
          `
          UPDATE pagamentos_pix
          SET status = 'estornado'
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

      if (tabelaPagamento === "premium_unlocks") {
        await client.query(
          `UPDATE premium_unlocks SET status = 'chargeback', updated_at = NOW() WHERE id = $1`,
          [pagamento.id]
        );
      } else if (tabelaPagamento === "pagamentos_pix") {
        await client.query(
          `UPDATE pagamentos_pix SET status = 'chargeback' WHERE id = $1`,
          [pagamento.id]
        );
      }

      // Propaga chargeback para transacoes_agency
      await client.query(`
        UPDATE transacoes_agency
        SET status = 'chargeback', gateway = 'pix'
        WHERE id = (
          SELECT id FROM transacoes_agency
          WHERE cliente_id = $1 AND modelo_id = $2 AND status = 'pago'
          ORDER BY created_at DESC LIMIT 1
        )
      `, [pagamento.cliente_id, pagamento.modelo_id]);

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
       MIDIA PIX
    ===================================================== */

    if (tipoPagamento === "conteudo" || tipoPagamento === "conteudo_pix") {
      console.log("💰 Processando compra de mídia PIX");

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

      fluxoProcessado = true;
      console.log("✅ Conteúdo atualizado com sucesso");
    }

    /* =====================================================
       PREMIUM PIX
    ===================================================== */

    if (
      tabelaPagamento === "premium_unlocks" ||
      ["premium", "premium_pix"].includes(tipoPagamento)
    ) {
      console.log("💎 Processando premium PIX");

      if (!premium_post_id || !cliente_id || !modelo_id) {
        console.log("🚨 premium sem premium_post_id, cliente_id ou modelo_id");
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      if (tabelaPagamento !== "premium_unlocks") {
        console.log("🚨 metadata premium recebida, mas pagamento não veio de premium_unlocks");
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const premiumPostRes = await client.query(
        `
        SELECT preco
        FROM premium_posts
        WHERE id = $1
        LIMIT 1
        `,
        [premium_post_id]
      );

      if (!premiumPostRes.rowCount) {
        console.log("🚨 premium_post não encontrado:", premium_post_id);
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const valorBase = Number(Number(premiumPostRes.rows[0].preco).toFixed(2));

      if (!Number.isFinite(valorBase) || valorBase <= 0) {
        console.log("🚨 valorBase premium inválido:", valorBase);
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const taxaGateway = Number((valorBase * 0.15).toFixed(2));
      const valorBruto = valorBase;

      const valores = await calcularValores({
        modelo_id,
        valor_bruto: valorBase,
        taxa_gateway: taxaGateway
      });

      await client.query(
        `
        UPDATE premium_unlocks
        SET status = 'pago',
            pago_em = NOW(),
            pagarme_order_id = $1,
            pagarme_charge_id = $2,
            updated_at = NOW()
        WHERE id = $3
        `,
        [orderId, chargeId, pagamento.id]
      );

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

      fluxoProcessado = true;
      console.log("✅ Premium atualizado com sucesso");
    }

    /* =====================================================
       VIP PIX
    ===================================================== */

    if (tipoPagamento === "vip" || tipoPagamento === "vip_pix") {
      console.log("⭐ Processando VIP PIX");

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

      const primeiraAssinatura = vipExistente.rowCount === 0;

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
        novaExpiracao = new Date(vipExistente.rows[0].expiration_at);
        novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
        console.log("Renovando VIP ativo. Nova expiração:", novaExpiracao);
      } else {
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
        const _boasVindas2038 = modelo_id === 859
          ? "¡Hola!! Bienvenido(a), cuál es tu nombre?🥰"
          : "Oii!! Bem vindo(a), qual seu nome?🥰";
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
            _boasVindas2038
          ]
        );
        console.log("Mensagem de boas-vindas enviada");
      }

      dadosParaEmitir = {
        tipo: "vip",
        cliente_id,
        modelo_id,
        primeiraAssinatura
      };

      fluxoProcessado = true;
      console.log("✅ Bloco VIP finalizado com sucesso");
    }

    /* =====================================================
       MARCAR PAGAMENTO COMO PAGO
    ===================================================== */

    if (!fluxoProcessado) {
      console.log("🚨 Nenhum fluxo de negócio foi processado para este pagamento:", {
        tabelaPagamento,
        tipoPagamento,
        metadata
      });
      await client.query("ROLLBACK");
      return res.status(200).send("ok");
    }

    console.log("Marcando pagamento como pago");

    if (tabelaPagamento === "pagamentos_pix") {
      await client.query(
        `
        UPDATE pagamentos_pix
        SET status = 'pago',
            pago_em = NOW(),
            pagarme_order_id = COALESCE(pagarme_order_id, $2)
        WHERE id = $1
        `,
        [pagamento.id, orderId]
      );
    } else if (tabelaPagamento === "premium_unlocks") {
      console.log("premium_unlocks já foi atualizado no bloco premium");
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

    // ── EMAIL FATURA PAGARME PIX (fire-and-forget) ───────────────
    if (dadosParaEmitir) {
      (async () => {
        try {
          const ci = await buscarDadosEmailPagamento(db, {
            cliente_id: dadosParaEmitir.cliente_id,
            modelo_id:  dadosParaEmitir.modelo_id
          });
          if (!ci?.email) return;

          const base = {
            nome:             ci.nome,
            email:            ci.email,
            modelo_nome:      ci.modelo_nome,
            valor:            Number(pagamento?.valor || 0),
            metodo:           'pix',
            card_info:        null,
            cpf:              pagamento?.cpf,
            telefone:         pagamento?.telefone || ci.tel_cad,
            ip:               pagamento?.aceite_ip,
            aceite_timestamp: pagamento?.aceite_timestamp,
            versao_termos:    pagamento?.versao_termos,
            payment_ref:      orderId
          };

          if (dadosParaEmitir.tipo === 'vip') {
            const vipR = await db.query(
              `SELECT expiration_at FROM vip_subscriptions WHERE cliente_id = $1 AND modelo_id = $2 LIMIT 1`,
              [dadosParaEmitir.cliente_id, dadosParaEmitir.modelo_id]
            );
            await enviarFaturaVIP({
              ...base,
              endereco:           ci.endereco_fmt,
              primeiraAssinatura: dadosParaEmitir.primeiraAssinatura ?? true,
              novaExpiracao:      vipR.rows[0]?.expiration_at
            });
            const audId = await obterOuCriarAudienceVIP(db, dadosParaEmitir.modelo_id, ci.modelo_nome);
            await adicionarContatoAudienceVIP(audId, ci.email, ci.nome);
          } else if (dadosParaEmitir.tipo === 'conteudo') {
            await enviarFaturaConteudo(base);
          }
        } catch (emailErr) {
          console.error('Erro email fatura Pagarme:', emailErr.message);
        }
      })();
    }
    // ─────────────────────────────────────────────────────────────

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

app.post("/api/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("======================================");
  console.log("🔥 WEBHOOK STRIPE RECEBIDO");
  console.log("URL:", req.originalUrl);
  console.log("METHOD:", req.method);

  let event = null;

  try {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      console.log("🚨 stripe-signature ausente");
      return res.status(400).send("missing signature");
    }

    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Erro validando assinatura do webhook Stripe:", err.message);
    return res.status(400).send("invalid signature");
  }

  if (!event || typeof event !== "object") {
    console.log("Evento inválido");
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

  if (!eventId) {
    console.log("🚨 event.id ausente");
    return res.status(200).send("ok");
  }

  const obj = event.data?.object || {};

  /* =====================================================
     NORMALIZAÇÃO STRIPE
  ===================================================== */

  let paymentIntentId = null;
  let chargeId = null;
  let metadata = {};
  let amountCentavos = 0;
  let gatewayStatus = "";
  let currency = null;

  if (eventType === "checkout.session.completed") {
    currency = obj.currency || null;
    paymentIntentId = obj.payment_intent || null;
    metadata = obj.metadata || {};
    amountCentavos = Number(obj.amount_total || 0);
    gatewayStatus = String(obj.payment_status || "").toLowerCase();
  } else if (eventType.startsWith("payment_intent.")) {
    currency = obj.currency || null;
    paymentIntentId = obj.id || null;
    metadata = obj.metadata || {};
    amountCentavos = Number(obj.amount_received || obj.amount || 0);
    gatewayStatus = String(obj.status || "").toLowerCase();
    chargeId =
      obj.latest_charge ||
      obj.charges?.data?.[0]?.id ||
      null;
  } else if (eventType.startsWith("charge.")) {
    currency = obj.currency || null;
    chargeId = obj.id || null;
    paymentIntentId = obj.payment_intent || null;
    metadata = obj.metadata || {};
    amountCentavos = Number(obj.amount || 0);
    gatewayStatus = String(obj.status || "").toLowerCase();
  }

  console.log("PaymentIntentID:", paymentIntentId);
  console.log("ChargeID:", chargeId);
  console.log("Metadata inicial:", metadata);

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
      FROM stripe_events
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
      INSERT INTO stripe_events (id, type)
      VALUES ($1, $2)
      `,
      [eventId, event.type]
    );

    console.log("Evento registrado em stripe_events");

    /* =====================================================
       BUSCAR PAGAMENTO LOCAL
    ===================================================== */

    let pagamento = null;
    let tabelaPagamento = null;
    let metodoPagamento = "cartao";

    // 1) PREMIUM
    const premiumRes = await client.query(
      `
      SELECT *
      FROM premium_unlocks
      WHERE (
        stripe_payment_intent_id = $1
        OR stripe_charge_id = $2
        OR stripe_checkout_session_id = $3
      )
      FOR UPDATE
      `,
      [
        paymentIntentId,
        chargeId,
        eventType === "checkout.session.completed" ? obj.id : null
      ]
    );

    if (premiumRes.rowCount > 0) {
      pagamento = premiumRes.rows[0];
      tabelaPagamento = "premium_unlocks";
      metodoPagamento = pagamento.metodo_pagamento || "cartao";
    } else {
      // 2) CARTÃO
      const pagamentoCartaoRes = await client.query(
        `
        SELECT *
        FROM pagamentos_cartao
        WHERE gateway = 'stripe'
          AND (
            stripe_payment_intent_id = $1
            OR stripe_charge_id = $2
            OR stripe_checkout_session_id = $3
          )
        FOR UPDATE
        `,
        [
          paymentIntentId,
          chargeId,
          eventType === "checkout.session.completed" ? obj.id : null
        ]
      );

      if (pagamentoCartaoRes.rowCount > 0) {
        pagamento = pagamentoCartaoRes.rows[0];
        tabelaPagamento = "pagamentos_cartao";
        metodoPagamento = pagamento.metodo_pagamento || "cartao";
      }
    }

    if (!pagamento) {
      console.log("🚨 Pagamento não encontrado:", {
        paymentIntentId,
        chargeId,
        checkoutSessionId: eventType === "checkout.session.completed" ? obj.id : null
      });
      await client.query("ROLLBACK");
      return res.status(200).send("ok");
    }

    console.log("Pagamento encontrado em", tabelaPagamento, pagamento);

    metadata = {
      ...(metadata || {}),
      ...(pagamento.metadata || {})
    };

    const cliente_id = Number(
      pagamento.cliente_id || metadata.cliente_id || 0
    ) || null;

    const modelo_id = Number(
      pagamento.modelo_id || metadata.modelo_id || 0
    ) || null;

    const message_id = Number(
      pagamento.message_id ||
      pagamento.conteudo_id ||
      metadata.message_id ||
      0
    ) || null;

    const premium_post_id = Number(
      pagamento.premium_post_id ||
      metadata.premium_post_id ||
      0
    ) || null;

    const valorEsperado = Number(
      pagamento.valor_total ||
      pagamento.valor ||
      metadata.valor_total ||
      0
    );

    const tipoPagamento = String(
      metadata.tipo ||
      pagamento.tipo ||
      ""
    ).toLowerCase().trim();

    const valorPago = Number(amountCentavos || 0) / 100;

    let fluxoProcessado = false;

    console.log("cliente_id:", cliente_id);
    console.log("modelo_id:", modelo_id);
    console.log("valor esperado:", valorEsperado);
    console.log("message_id:", message_id);
    console.log("premium_post_id:", premium_post_id);
    console.log("tipoPagamento:", tipoPagamento);
    console.log("valorPago:", valorPago);

    /* =====================================================
       MAPA DE EVENTOS STRIPE
    ===================================================== */

    const isPaidEvent =
      eventType === "checkout.session.completed" ||
      eventType === "payment_intent.succeeded" ||
      eventType === "charge.succeeded" ||
      gatewayStatus === "paid" ||
      gatewayStatus === "succeeded";

    const isFailedEvent =
      eventType === "payment_intent.payment_failed" ||
      eventType === "charge.failed";

    const isRefundedEvent =
      eventType === "charge.refunded";

    const isChargebackEvent =
      eventType === "charge.dispute.created";

    /* =====================================================
       EVENTOS DE FALHA / ESTORNO / CHARGEBACK
    ===================================================== */

    if (isFailedEvent) {
      console.log("❌ Evento de falha");

      const motivoRecusa =
        obj.last_payment_error?.message ||
        obj.last_payment_error?.decline_code ||
        obj.failure_message ||
        obj.outcome?.seller_message ||
        null;

      if (tabelaPagamento === "premium_unlocks") {
        await client.query(
          `
          UPDATE premium_unlocks
          SET status = 'falhou',
              updated_at = NOW(),
              stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
              stripe_charge_id = COALESCE($3, stripe_charge_id)
          WHERE id = $1
          `,
          [pagamento.id, paymentIntentId, chargeId]
        );
      } else {
        await client.query(
          `
          UPDATE pagamentos_cartao
          SET status = 'falhou',
              updated_at = NOW(),
              stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
              stripe_charge_id = COALESCE($3, stripe_charge_id),
              motivo_recusa = COALESCE($4, motivo_recusa)
          WHERE id = $1
          `,
          [pagamento.id, paymentIntentId, chargeId, motivoRecusa]
        );
      }

      await client.query("COMMIT");
      return res.status(200).send("ok");
    }

    if (isRefundedEvent) {
      console.log("↩️ Evento de estorno");

      if (tabelaPagamento === "premium_unlocks") {
        await client.query(
          `
          UPDATE premium_unlocks
          SET status = 'estornado',
              updated_at = NOW(),
              stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
              stripe_charge_id = COALESCE($3, stripe_charge_id)
          WHERE id = $1
          `,
          [pagamento.id, paymentIntentId, chargeId]
        );
      } else {
        await client.query(
          `
          UPDATE pagamentos_cartao
          SET status = 'estornado',
              updated_at = NOW(),
              stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
              stripe_charge_id = COALESCE($3, stripe_charge_id)
          WHERE id = $1
          `,
          [pagamento.id, paymentIntentId, chargeId]
        );
      }

      await client.query("COMMIT");
      return res.status(200).send("ok");
    }

    if (isChargebackEvent) {
      console.log("🚨 Evento de chargeback");

      if (tabelaPagamento === "premium_unlocks") {
        await client.query(
          `UPDATE premium_unlocks SET status='chargeback', updated_at=NOW(),
           stripe_payment_intent_id=COALESCE($2,stripe_payment_intent_id),
           stripe_charge_id=COALESCE($3,stripe_charge_id) WHERE id=$1`,
          [pagamento.id, paymentIntentId, chargeId]
        );
      } else {
        await client.query(
          `UPDATE pagamentos_cartao SET status='chargeback', updated_at=NOW(),
           stripe_payment_intent_id=COALESCE($2,stripe_payment_intent_id),
           stripe_charge_id=COALESCE($3,stripe_charge_id) WHERE id=$1`,
          [pagamento.id, paymentIntentId, chargeId]
        );
      }

      // Propaga chargeback para transacoes_agency
      await client.query(`
        UPDATE transacoes_agency
        SET status = 'chargeback', gateway = 'cartao'
        WHERE id = (
          SELECT id FROM transacoes_agency
          WHERE cliente_id = $1 AND modelo_id = $2 AND status = 'pago'
          ORDER BY created_at DESC LIMIT 1
        )
      `, [pagamento.cliente_id, pagamento.modelo_id]);

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

const moedaEsperada = String(pagamento.currency || metadata.currency || "").toLowerCase();
const moedaRecebida = String(currency || "").toLowerCase();

if (moedaEsperada && moedaRecebida && moedaEsperada !== moedaRecebida) {
  console.log("🚨 Moeda divergente:", moedaRecebida, moedaEsperada);
  await client.query("ROLLBACK");
  return res.status(200).send("ok");
}

if (valorEsperado > 0 && Math.abs(Number(valorPago) - Number(valorEsperado)) > 0.01) {
  console.log("🚨 Valor divergente", valorPago, valorEsperado);
  await client.query("ROLLBACK");
  return res.status(200).send("ok");
}

    console.log("Valor validado");

    /* =====================================================
       MIDIA
    ===================================================== */

    if (tipoPagamento === "conteudo" || tipoPagamento === "conteudo_cartao") {
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

      const taxaCambioMeta = Number(metadata?.taxa_cambio) || null;
      const currencyPago = String(pagamento?.currency || metadata?.currency || 'brl').toLowerCase();
      const valorTotalBrl = taxaCambioMeta
        ? Number((valorPago * taxaCambioMeta).toFixed(2))
        : valorPago;

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
          pago_em,
          currency,
          valor_cobrado,
          taxa_cambio,
          payment_id
        )
        VALUES ($1,$2,$3,$4,$4,$5,'pago',$6,NOW(),$7,$8,$9,$10)
        ON CONFLICT (message_id,cliente_id)
        DO UPDATE SET
          status='pago',
          metodo_pagamento=$6,
          pago_em=NOW(),
          valor_total=$5,
          currency=$7,
          valor_cobrado=$8,
          taxa_cambio=$9,
          payment_id=$10
        `,
        [
          message_id,
          cliente_id,
          modelo_id,
          valorBase,
          valorTotalBrl,
          metodoPagamento,
          currencyPago,
          valorPago,
          taxaCambioMeta,
          paymentIntentId
        ]
      );

      const conteudo_ids =
        await marcarConteudoComoLiberadoPorPagamento(client, {
          message_id,
          cliente_id,
          modelo_id
        });

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
          created_at,
          gateway,
          disponivel_em,
          stripe_payment_intent_id
        )
        VALUES (
          $1,$2,'midia',
          $3,$4,$5,$6,$7,'pago',NOW(),
          'stripe',NULL,$8
        )
        `,
        [
          modelo_id,
          cliente_id,
          valorBruto,
          Number(valores.valor_modelo || 0),
          Number(valores.agency_fee || 0),
          Number(valores.velvet_fee || 0),
          taxaGateway,
          paymentIntentId
        ]
      );

      dadosParaEmitir = {
        tipo: "conteudo",
        cliente_id,
        modelo_id,
        message_id,
        conteudo_ids
      };

      fluxoProcessado = true;
      console.log("✅ Conteúdo atualizado com sucesso");
    }

    /* =====================================================
       PREMIUM
    ===================================================== */

    if (
      tabelaPagamento === "premium_unlocks" ||
      ["premium", "premium_cartao"].includes(tipoPagamento)
    ) {
      console.log("💎 Processando premium");

      if (!premium_post_id || !cliente_id || !modelo_id) {
        console.log("🚨 premium sem premium_post_id, cliente_id ou modelo_id");
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const premiumPostRes = await client.query(
        `
        SELECT preco
        FROM premium_posts
        WHERE id = $1
        LIMIT 1
        `,
        [premium_post_id]
      );

      if (!premiumPostRes.rowCount) {
        console.log("🚨 premium_post não encontrado:", premium_post_id);
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const valorBase = Number(Number(premiumPostRes.rows[0].preco).toFixed(2));

      if (!Number.isFinite(valorBase) || valorBase <= 0) {
        console.log("🚨 valorBase premium inválido:", valorBase);
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const taxaGateway = Number((valorBase * 0.15).toFixed(2));
      const valorBruto = valorBase;

      const valores = await calcularValores({
        modelo_id,
        valor_bruto: valorBase,
        taxa_gateway: taxaGateway
      });

      await client.query(
        `
        UPDATE premium_unlocks
        SET status = 'pago',
            pago_em = NOW(),
            stripe_payment_intent_id = COALESCE($1, stripe_payment_intent_id),
            stripe_charge_id = COALESCE($2, stripe_charge_id),
            stripe_checkout_session_id = COALESCE($3, stripe_checkout_session_id),
            updated_at = NOW()
        WHERE id = $4
        `,
        [
          paymentIntentId,
          chargeId,
          eventType === "checkout.session.completed" ? obj.id : null,
          pagamento.id
        ]
      );

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
          created_at,
          gateway,
          disponivel_em,
          stripe_payment_intent_id
        )
        VALUES (
          $1,$2,'midia',
          $3,$4,$5,$6,$7,'pago',NOW(),
          'stripe',NULL,$8
        )
        `,
        [
          modelo_id,
          cliente_id,
          valorBruto,
          Number(valores.valor_modelo || 0),
          Number(valores.agency_fee || 0),
          Number(valores.velvet_fee || 0),
          taxaGateway,
          paymentIntentId
        ]
      );

      dadosParaEmitir = {
        tipo: "premium",
        cliente_id,
        modelo_id,
        premium_post_id,
        pagamento_id: pagamento.id
      };

      fluxoProcessado = true;
      console.log("✅ Premium atualizado com sucesso");
    }

    /* =====================================================
       VIP
    ===================================================== */

    if (tipoPagamento === "vip" || tipoPagamento === "vip_cartao") {
      console.log("⭐ Processando VIP");

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

      const primeiraAssinatura = vipExistente.rowCount === 0;

      // valor_assinatura = preço BASE da assinatura (sem taxa gateway)
      // valor_base_brl  = total cobrado em BRL (base * 1.15) — não usar como base de split
      let valorBase = Number(
        metadata.valor_assinatura ??
        metadata.valor_base ??
        0
      );
      if (!valorBase || !Number.isFinite(valorBase)) {
        // fallback: extrai base do total dividindo pela margem da gateway
        const total = Number(metadata.valor_base_brl ?? pagamento.valor_brl ?? pagamento.valor ?? 0);
        valorBase = Number((total / 1.15).toFixed(2));
      }

      if (!Number.isFinite(valorBase) || valorBase <= 0) {
        console.log("🚨 valorBase inválido:", valorBase);
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      valorBase = Number(valorBase.toFixed(2));

      const taxaCambioVip = Number(metadata.taxa_cambio) || null;
      const taxaTransacao = Number(metadata.taxa_transacao || 0);
      const taxaPlataforma = Number(metadata.taxa_plataforma || 0);

      const taxaGateway = Number((valorBase * 0.15).toFixed(2));
      const valorBruto = valorBase;
      const valorTotalBrl = taxaCambioVip
        ? Number((valorPago * taxaCambioVip).toFixed(2))
        : valorPago;

      const valores = await calcularValores({
        modelo_id,
        valor_bruto: valorBase,
        taxa_gateway: taxaGateway
      });

      const valorModelo = Number(valores.valor_modelo || 0);
      const agencyFee = Number(valores.agency_fee || 0);
      const velvetFee = Number(valores.velvet_fee || 0);

      let novaExpiracao;

      if (
        vipExistente.rowCount > 0 &&
        vipExistente.rows[0].expiration_at &&
        new Date(vipExistente.rows[0].expiration_at) > new Date()
      ) {
        novaExpiracao = new Date(vipExistente.rows[0].expiration_at);
        novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
      } else {
        novaExpiracao = new Date();
        novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
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
            gateway_subscription_id = $8,
             aviso_7_dias_enviado = false,
             aviso_24h_enviado = false
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
            valorTotalBrl,
            paymentIntentId || chargeId
          ]
        );
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
            valorTotalBrl,
            paymentIntentId || chargeId
          ]
        );
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
          created_at,
          gateway,
          disponivel_em,
          stripe_payment_intent_id
        )
        VALUES (
          $1,$2,'assinatura',
          $3,$4,$5,$6,$7,'pago',NOW(),
          'stripe',NULL,$8
        )
        `,
        [
          modelo_id,
          cliente_id,
          valorBruto,
          valorModelo,
          agencyFee,
          velvetFee,
          taxaGateway,
          paymentIntentId
        ]
      );

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
            modelo_id === 859
              ? "¡Hola!! Bienvenido(a), cuál es tu nombre?🥰"
              : "Oii!! Bem vindo(a), qual seu nome?🥰"
          ]
        );
      }

      // Incrementa uso da oferta ativa (desativa se atingiu limite)
      await client.query(`
        UPDATE ofertas
        SET assinaturas_usadas = assinaturas_usadas + 1,
            ativa = CASE WHEN assinaturas_usadas + 1 >= limite_assinaturas THEN false ELSE ativa END
        WHERE modelo_id = $1 AND ativa = true AND (data_fim IS NULL OR data_fim >= NOW())
      `, [modelo_id]);

      dadosParaEmitir = {
        tipo: "vip",
        cliente_id,
        modelo_id,
        primeiraAssinatura
      };

      fluxoProcessado = true;
      console.log("✅ Bloco VIP finalizado com sucesso");
    }

    /* =====================================================
       MARCAR PAGAMENTO COMO PAGO
    ===================================================== */

    if (!fluxoProcessado) {
      console.log("🚨 Nenhum fluxo de negócio foi processado para este pagamento:", {
        tabelaPagamento,
        tipoPagamento,
        metadata
      });
      await client.query("ROLLBACK");
      return res.status(200).send("ok");
    }

    console.log("Marcando pagamento como pago");

    if (tabelaPagamento === "pagamentos_cartao") {
      const taxaCambioWebhook = Number(metadata?.taxa_cambio) || null;
      const valorBrlWebhook = taxaCambioWebhook
        ? Number((valorPago * taxaCambioWebhook).toFixed(2))
        : valorPago;

      await client.query(
        `
        UPDATE pagamentos_cartao
        SET status = 'pago',
            pago_em = NOW(),
            updated_at = NOW(),
            stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
            stripe_charge_id = COALESCE($3, stripe_charge_id),
            stripe_checkout_session_id = COALESCE($4, stripe_checkout_session_id),
            valor_brl = COALESCE(valor_brl, $5),
            taxa_cambio = COALESCE(taxa_cambio, $6)
        WHERE id = $1
        `,
        [
          pagamento.id,
          paymentIntentId,
          chargeId,
          eventType === "checkout.session.completed" ? obj.id : null,
          valorBrlWebhook,
          taxaCambioWebhook
        ]
      );
    } else if (tabelaPagamento === "premium_unlocks") {
      console.log("premium_unlocks já foi atualizado no bloco premium");
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

        io.to(sala).emit("conteudoLiberado", {
          message_id: Number(dadosParaEmitir.message_id),
          conteudo_ids: dadosParaEmitir.conteudo_ids || []
        });
      }

      if (dadosParaEmitir?.tipo === "vip") {
        const sala = `chat_${dadosParaEmitir.cliente_id}_${dadosParaEmitir.modelo_id}`;

        io.to(sala).emit("vipAtivado", {
          cliente_id: Number(dadosParaEmitir.cliente_id),
          modelo_id: Number(dadosParaEmitir.modelo_id)
        });
      }

    } catch (e) {
      console.error("Erro emitir socket:", e);
    }

    // ── EMAIL FATURA STRIPE (fire-and-forget) ────────────────────
    if (dadosParaEmitir) {
      (async () => {
        try {
          const ci = await buscarDadosEmailPagamento(db, {
            cliente_id: dadosParaEmitir.cliente_id,
            modelo_id:  dadosParaEmitir.modelo_id
          });
          if (!ci?.email) return;

          const isCartao = tabelaPagamento === 'pagamentos_cartao';
          const card_info = (isCartao && pagamento?.card_brand) ? {
            brand:     pagamento.card_brand,
            last4:     pagamento.card_last4,
            exp_month: pagamento.card_exp_month,
            exp_year:  pagamento.card_exp_year
          } : null;

          const metodo = isCartao ? 'cartao' : 'pix';

          const base = {
            nome:             ci.nome,
            email:            ci.email,
            modelo_nome:      ci.modelo_nome,
            valor:            Number(pagamento?.valor || pagamento?.valor_total || valorPago),
            metodo,
            card_info,
            cpf:              pagamento?.cpf,
            telefone:         pagamento?.telefone || ci.tel_cad,
            ip:               pagamento?.aceite_ip,
            aceite_timestamp: pagamento?.aceite_timestamp,
            versao_termos:    pagamento?.versao_termos,
            payment_ref:      paymentIntentId || chargeId
          };

          if (dadosParaEmitir.tipo === 'vip') {
            const vipR = await db.query(
              `SELECT expiration_at FROM vip_subscriptions WHERE cliente_id = $1 AND modelo_id = $2 LIMIT 1`,
              [dadosParaEmitir.cliente_id, dadosParaEmitir.modelo_id]
            );
            await enviarFaturaVIP({
              ...base,
              endereco:           ci.endereco_fmt,
              primeiraAssinatura: dadosParaEmitir.primeiraAssinatura ?? true,
              novaExpiracao:      vipR.rows[0]?.expiration_at
            });
            const audId = await obterOuCriarAudienceVIP(db, dadosParaEmitir.modelo_id, ci.modelo_nome);
            await adicionarContatoAudienceVIP(audId, ci.email, ci.nome);
          } else if (dadosParaEmitir.tipo === 'conteudo') {
            await enviarFaturaConteudo(base);
          } else if (dadosParaEmitir.tipo === 'premium') {
            await enviarFaturaPremium(base);
          }
        } catch (emailErr) {
          console.error('Erro email fatura Stripe:', emailErr.message);
        }
      })();
    }
    // ─────────────────────────────────────────────────────────────

    console.log("✅ PAGAMENTO FINALIZADO");
    return res.status(200).send("ok");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🔥 ERRO WEBHOOK STRIPE:", err);
    return res.status(500).send("erro");
  } finally {
    client.release();
    console.log("🔚 conexão liberada");
  }
});

// ===============================
// ROTAS GLOBAIS
// ===============================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
const { router: servercontentRouter, calcularValores } = require('./servercontent');
app.use("/api", servercontentRouter);
app.set("calcularValores", calcularValores);
const adminDashboardRouter = require('./routes/adminDashboard');
const agencyDashboardRouter = require('./routes/agencyDashboard');
const adminEmailRouter = require('./routes/adminEmail');
const usuariosConfiaveisRouter = require('./routes/usuariosConfiaveis');
const modelosPixConfigRouter = require('./routes/modelosPixConfig');
const contestacoesRouter = require('./routes/contestacoes');
const suporteRouter = require('./routes/suporte');
const authAdmin = require('./middleware/authAdmin');

app.get("/api/stripe/pk", (req, res) => {
  const key = process.env.STRIPE_PUBLIC_KEY || "";
  if (!key) return res.status(500).json({ error: "Chave pública Stripe não configurada." });
  res.json({ key });
});

app.use("/admin/dashboard", adminDashboardRouter);
app.use('/agency/dashboard', agencyDashboardRouter);
app.use('/api/admin/email', auth, authAdmin, adminEmailRouter);
app.use('/api/admin/usuarios-confiaveis', auth, authAdmin, usuariosConfiaveisRouter);
app.use('/api/admin/modelos-pix-config', auth, authAdmin, modelosPixConfigRouter);
app.use('/api/admin/contestacoes', auth, authAdmin, contestacoesRouter);
app.use('/api/suporte', suporteRouter);

// ── CAMPANHAS VIP ─────────────────────────────────────────────
// POST /api/admin/campanhas/vip
// Body: { modelo_id, subject, html, nome_campanha }
// Envia broadcast para todos os VIPs ativos do modelo via Resend
app.post('/api/admin/campanhas/vip', auth, authAdmin, async (req, res) => {
  const { modelo_id, subject, html, nome_campanha } = req.body;

  if (!modelo_id || !subject || !html) {
    return res.status(400).json({ error: 'modelo_id, subject e html são obrigatórios.' });
  }

  try {
    const modeloRes = await db.query(
      'SELECT nome_exibicao, brevo_list_id FROM modelos WHERE id = $1',
      [modelo_id]
    );
    if (!modeloRes.rowCount) return res.status(404).json({ error: 'Modelo não encontrado.' });

    const { nome_exibicao, brevo_list_id } = modeloRes.rows[0];

    const audienceId = brevo_list_id
      || await obterOuCriarAudienceVIP(db, modelo_id, nome_exibicao);

    const totalVips = await db.query(
      `SELECT COUNT(*) FROM vip_subscriptions WHERE modelo_id = $1 AND ativo = true AND expiration_at > NOW()`,
      [modelo_id]
    );

    if (Number(totalVips.rows[0].count) === 0) {
      return res.status(200).json({ enviado: false, motivo: 'Nenhum VIP ativo para este modelo.' });
    }

    const broadcastId = await enviarCampanhaVIP({ audience_id: audienceId, subject, html, nome_campanha });

    registrarLog(db, {
      tipo: 'campanha_vip',
      modelo_id: Number(modelo_id),
      descricao: `Campanha enviada → broadcast ${broadcastId} (${totalVips.rows[0].count} VIPs) — "${subject}"`
    });

    return res.json({ enviado: true, broadcast_id: broadcastId, audience_id: audienceId });
  } catch (err) {
    console.error('Erro campanha VIP:', err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.set('io', io);
adminEmailRouter.iniciarMonitoramentoEmails(io);
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/icons", express.static(path.join(__dirname, "icons")));
app.use(express.urlencoded({ extended: true }));
app.use("/app", express.static("app"));
app.use(express.static("public"));
app.use((req, res, next) => {
  console.log("➡️ REQ:", req.method, req.url);
  next();
});
app.use(compression());



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
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Tente novamente em alguns minutos." }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitos uploads. Aguarde alguns minutos e tente novamente." }
});

const uploadAvatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas atualizações de perfil. Tente novamente em alguns minutos." }
});

const uploadVerificacaoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de envio de documentos atingido. Tente novamente em 1 hora." }
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
    SELECT u.modelo_id
    FROM unread u
    JOIN vip_subscriptions v
      ON v.cliente_id = u.cliente_id
     AND v.modelo_id  = u.modelo_id
     AND v.ativo = true
     AND v.expiration_at > NOW()
    WHERE u.cliente_id  = $1
      AND u.unread_for  = 'cliente'
      AND u.has_unread  = true
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
    SELECT u.cliente_id
    FROM unread u
    JOIN vip_subscriptions v
      ON v.cliente_id = u.cliente_id
     AND v.modelo_id  = u.modelo_id
     AND v.ativo = true
     AND v.expiration_at > NOW()
    WHERE u.modelo_id  = $1
      AND u.unread_for = 'modelo'
      AND u.has_unread = true
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

async function enviarPush(subscription, mensagem, url = "/inbox.html", remetente = "Nova mensagem") {
  const payload = JSON.stringify({
    title: remetente,
    body: mensagem,
    url
  });
  await webpush.sendNotification(subscription, payload);
}

async function enviarFCM(deviceToken, titulo, mensagem, url) {
  if (!admin.apps.length) return;
  await admin.messaging().send({
    token: deviceToken,
    notification: { title: titulo, body: mensagem },
    data: { url: url || "/inbox.html" },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default" } } }
  });
}

async function notificarNovaMensagem(userIdDestino, textoMensagem, url = "/inbox.html", remetente = "Nova mensagem") {
  const erros = [];

  // Web push (navegador)
  if (process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      const subRes = await db.query(
        `SELECT subscription_json FROM push_subscriptions WHERE user_id = $1`,
        [userIdDestino]
      );
      for (const row of subRes.rows) {
        try {
          await enviarPush(row.subscription_json, textoMensagem, url, remetente);
          console.log("Web push enviado para user_id:", userIdDestino);
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            // Subscription expirada/inválida — remove apenas este endpoint
            const endpoint = row.subscription_json?.endpoint;
            if (endpoint) {
              await db.query(
                `DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription_json->>'endpoint' = $2`,
                [userIdDestino, endpoint]
              );
            }
          } else {
            erros.push(err);
          }
        }
      }
    } catch (err) {
      erros.push(err);
    }
  }

  // FCM push (app Android/iOS)
  if (admin.apps.length) {
    try {
      const tokRes = await db.query(
        `SELECT token, platform FROM device_push_tokens WHERE user_id = $1`,
        [userIdDestino]
      );
      for (const row of tokRes.rows) {
        try {
          await enviarFCM(row.token, remetente, textoMensagem, url);
          console.log(`FCM enviado (${row.platform}) para user_id:`, userIdDestino);
        } catch (err) {
          if (err.code === "messaging/registration-token-not-registered") {
            await db.query(
              `DELETE FROM device_push_tokens WHERE user_id = $1 AND platform = $2`,
              [userIdDestino, row.platform]
            );
          } else {
            erros.push(err);
          }
        }
      }
    } catch (err) {
      erros.push(err);
    }
  }

  if (erros.length) {
    console.error("Erros ao enviar push:", erros);
  }
}

// ===========================
// CONVERSAO MOEDA R$/$
// ===========================
let _rateCache = { rate: null, at: 0 };

async function getBRLtoUSDRate() {
  const age = Date.now() - _rateCache.at;
  if (_rateCache.rate && age < 4 * 60 * 60 * 1000) return _rateCache.rate;
  const resp = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
  if (!resp.ok) throw new Error("Falha ao buscar taxa de câmbio");
  const data = await resp.json();
  const rate = data.rates?.BRL;
  if (!rate) throw new Error("Taxa BRL não encontrada na resposta de câmbio");
  _rateCache = { rate, at: Date.now() };
  return rate;
}

// ── Taxa PIX (15%: 10% transação + 5% plataforma) ───────────────────────────
function calcTaxaStripe(valorBase) {
  const taxaTransacao  = Number((valorBase * 0.10).toFixed(2));
  const taxaPlataforma = Number((valorBase * 0.05).toFixed(2));
  const valorTotal     = Number((valorBase + taxaTransacao + taxaPlataforma).toFixed(2));
  return { taxaTransacao, taxaPlataforma, valorTotal };
}

// ── Validação de titularidade do cartão ─────────────────────────────────────
function normalizarNome(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

// Verifica se o nome informado no cartão corresponde ao titular cadastrado,
// exigindo que pelo menos o primeiro e o último nome coincidam.
function nomesCorrespondem(nomeCadastro, nomeCartao) {
  const palavrasCadastro = normalizarNome(nomeCadastro);
  const palavrasCartao = normalizarNome(nomeCartao);

  if (!palavrasCadastro.length || !palavrasCartao.length) return true;

  const setCadastro = new Set(palavrasCadastro);
  const setCartao = new Set(palavrasCartao);

  const primeiroOk = setCadastro.has(palavrasCartao[0]) || setCartao.has(palavrasCadastro[0]);
  const ultimoOk =
    setCadastro.has(palavrasCartao[palavrasCartao.length - 1]) ||
    setCartao.has(palavrasCadastro[palavrasCadastro.length - 1]);

  return primeiroOk && ultimoOk;
}

// ── Safe2Pay PIX (DESATIVADO — migrado para iPag) ────────────────────────────
/*
const SAFE2PAY_BASE = "https://payment.safe2pay.com.br/v2";

async function safe2payRequest(method, path, body) {
  const url = `${SAFE2PAY_BASE}${path}`;
  console.log(`[Safe2Pay] ${method} ${url} | key_prefix=${(process.env.SAFE2PAY_API_KEY||"").slice(0,6)}`);
  const resp = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.SAFE2PAY_API_KEY
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await resp.json();
  console.log(`[Safe2Pay] response status=${resp.status} body=${JSON.stringify(data)}`);
  if (data.HasError) {
    throw new Error(`Safe2Pay error: ${JSON.stringify(data.Error || data)}`);
  }
  return data;
}

async function criarPixSafe2Pay({ valorTotal, nome, email, cpf, telefone, endereco, referencia, descricao }) {
  const appUrl = process.env.APP_URL || "https://velvet.lat";
  return safe2payRequest("POST", "/payment", {
    IsSandbox: false,
    Application: "Velvet",
    CallbackUrl: `${appUrl}/api/webhook/safe2pay`,
    Reference: referencia,
    Customer: {
      Name: nome,
      Email: email,
      Identity: cpf,
      Phone: telefone,
      Address: {
        ZipCode:      endereco.cep,
        Street:       endereco.rua,
        Number:       endereco.numero,
        Complement:   endereco.complemento || "",
        District:     endereco.bairro,
        StateInitials: endereco.estado,
        CityName:     endereco.cidade,
        CountryName:  "Brasil"
      }
    },
    Products: [{ Code: "001", Description: descricao, UnitPrice: valorTotal, Quantity: 1 }],
    PaymentMethod: "6",
    PaymentObject: {}
  });
}
*/

// Deriva URL de preview (variant pequena) para conteúdo bloqueado.
// Para imagens CF Images: troca /public → /thumbnail (ou CF_PREVIEW_VARIANT).
// Para vídeos CF Stream: já tem thumbnail próprio — retorna null (sem preview de vídeo).
// Retorna a URL de preview para conteúdo bloqueado.
// Usa o thumbnail_url do banco (imagem 40x40 gerada pelo sharp) quando diferente da url original.
// Nunca gera URLs com variantes CF Images que podem não existir.
function getPreviewUrl(fullUrl, thumbUrl) {
  if (thumbUrl && thumbUrl !== fullUrl && !thumbUrl.endsWith("/thumbnail")) {
    return thumbUrl;
  }
  return null;
}

// ── iPag PIX ──────────────────────────────────────────────────────────────────
const IPAG_BASE = process.env.IPAG_BASE_URL || "https://api.ipag.com.br";

async function ipagRequest(method, path, body) {
  const url = `${IPAG_BASE}${path}`;
  const auth = Buffer.from(`${process.env.IPAG_API_ID || ""}:${process.env.IPAG_API_KEY || ""}`).toString("base64");
  console.log(`[iPag] ${method} ${url} | api_id=${process.env.IPAG_API_ID || ""}`);
  const resp = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
      "x-api-version": "2"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await resp.json();
  console.log(`[iPag] response status=${resp.status} body=${JSON.stringify(data)}`);
  if (!resp.ok || data?.errors) {
    throw new Error(`iPag error: ${JSON.stringify(data)}`);
  }
  return data;
}

function formatarTelefoneIpag(tel) {
  let digits = String(tel || "").replace(/\D/g, "");
  // Remove o código do país Brasil (55) se vier junto — o iPag rejeita o 55 na frente
  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }
  // iPag espera DDD (2) + número (8-9 dígitos) = 10-11 dígitos
  if (digits.length >= 10 && digits.length <= 11) return digits;
  return "";
}

async function criarPixIpag({ valorTotal, nome, email, cpf, telefone, endereco, referencia }) {
  const appUrl = process.env.APP_URL || "https://velvet-app.onrender.com";
  const orderId = String(referencia || Date.now()).replace(/\D/g, "").slice(-16) || String(Date.now()).slice(-16);
  const telefoneIpag = formatarTelefoneIpag(telefone);
  return ipagRequest("POST", "/service/payment", {
    amount: Number(valorTotal),
    order_id: orderId,
    callback_url: `${appUrl}/api/webhook/ipag`,
    payment: {
      type: "pix",
      method: "pix",
      pix_expires_in: 60
    },
    customer: {
      name: nome,
      email: email,
      cpf_cnpj: cpf,
      phone: telefoneIpag,
      billing_address: {
        street:     endereco.rua,
        number:     (endereco.numero || endereco.endereco2 || "s/n").slice(0, 10),
        complement: endereco.endereco2  || "",
        district:   endereco.bairro     || "",
        city:       endereco.cidade,
        state:      endereco.estado,
        zipcode:    endereco.cep,
        country:    "BR"
      }
    }
  });
}

async function salvarEnderecoClientePix(dbClient, { cliente_id, telefone, endereco }) {
  const enderecoStr = [endereco.rua, endereco.endereco2]
    .filter(Boolean).join(", ");
  const paisStr = endereco.pais || "BR";
  await dbClient.query(`
    INSERT INTO clientes_dados (cliente_id, telefone, endereco, cidade, estado, pais, atualizado_em)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (cliente_id) DO UPDATE SET
      telefone   = COALESCE(EXCLUDED.telefone, clientes_dados.telefone),
      endereco   = EXCLUDED.endereco,
      cidade     = EXCLUDED.cidade,
      estado     = EXCLUDED.estado,
      pais       = EXCLUDED.pais,
      atualizado_em = NOW()
  `, [cliente_id, telefone || null, enderecoStr, endereco.cidade, endereco.estado, paisStr]);
}

async function buscarDadosEmailPagamento(dbPool, { cliente_id, modelo_id }) {
  const res = await dbPool.query(`
    SELECT u.email,
           COALESCE(cd.nome_completo, c.nome, '') AS nome,
           cd.telefone AS tel_cad,
           TRIM(CONCAT_WS(', ', cd.endereco, cd.cidade, cd.estado, cd.pais)) AS endereco_fmt,
           m.nome_exibicao AS modelo_nome
    FROM clientes c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
    LEFT JOIN modelos m ON m.id = $2
    WHERE c.id = $1
    LIMIT 1
  `, [cliente_id, modelo_id]);
  return res.rows[0] || null;
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
    // Aceita token via auth (usuários/agências) ou via cookie httpOnly (admin)
    let token = socket.handshake.auth?.token;
    if (!token) {
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");
      token = cookies.admin_session;
    }

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

  // ─── NOTIFICAÇÕES ADMIN (sino do dashboard) ─────────────────────────────
  if (socket.user?.role === "admin") {
    socket.join("admin_notificacoes");
    socket.join(`email_${socket.user.id}`);
  }

  // ─── SUPORTE AO CLIENTE ──────────────────────────────────────────────────
  socket.on("suporte:entrar", async ({ conversa_id }) => {
    if (!conversa_id) return;
    // Admin entra em qualquer sala
    if (socket.user?.role === "admin") {
      socket.join(`suporte_${conversa_id}`);
      return;
    }
    // Clientes logados só entram na sala da própria conversa
    try {
      const { rows } = await db.query(
        `SELECT sc.id FROM suporte_conversas sc
         LEFT JOIN clientes c ON c.id = sc.cliente_id
         WHERE sc.id = $1
           AND (sc.cliente_id IS NULL OR c.user_id = $2)`,
        [conversa_id, socket.user.id]
      );
      if (rows.length) socket.join(`suporte_${conversa_id}`);
    } catch (_) {}
  });

  socket.on("suporte:admin_entrar", () => {
    if (socket.user?.role === "admin") socket.join("suporte_admin");
  });

  socket.on("suporte:admin_entrar_conversa", ({ conversa_id }) => {
    if (socket.user?.role === "admin" && conversa_id) {
      socket.join(`suporte_${conversa_id}`);
    }
  });

  socket.on("suporte:typing", ({ conversa_id }) => {
    if (socket.user?.role === "admin" && conversa_id) {
      io.to(`suporte_${conversa_id}`).emit("suporte:typing");
    }
  });
  // ────────────────────────────────────────────────────────────────────────

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

        // 🔒 VIP check — cliente só pode entrar na sala se tiver VIP ativo
        const vipRes = await db.query(
          `SELECT 1 FROM vip_subscriptions
           WHERE cliente_id = $1 AND modelo_id = $2
             AND ativo = true AND expiration_at > NOW()
           LIMIT 1`,
          [clienteIdReal, modelo_id]
        );
        if (vipRes.rowCount === 0) {
          callback?.({ ok: false, error: "vip_required" });
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

      // 🔒 VIP check — cliente só pode enviar mensagem se tiver VIP ativo
      const vipCheck = await db.query(
        `SELECT 1 FROM vip_subscriptions
         WHERE cliente_id = $1 AND modelo_id = $2
           AND ativo = true AND expiration_at > NOW()
         LIMIT 1`,
        [clienteIdReal, modeloIdNum]
      );
      if (vipCheck.rowCount === 0) {
        callback?.({ ok: false, error: "vip_required" });
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
  let remetente = "Nova mensagem";

  if (sender === "cliente") {
    const modeloDestinoRes = await db.query(
      `SELECT user_id FROM modelos WHERE id = $1 LIMIT 1`,
      [modeloIdNum]
    );
    userIdDestino = modeloDestinoRes.rows[0]?.user_id || null;
    pushUrl = "/inbox.html";

    const nomeRes = await db.query(
      `SELECT nome FROM clientes WHERE id = $1 LIMIT 1`,
      [clienteIdNum]
    );
    remetente = nomeRes.rows[0]?.nome || "Cliente";

  } else if (sender === "modelo") {
    const clienteDestinoRes = await db.query(
      `SELECT user_id FROM clientes WHERE id = $1 LIMIT 1`,
      [clienteIdNum]
    );
    userIdDestino = clienteDestinoRes.rows[0]?.user_id || null;
    pushUrl = "/inboxc.html";

    const nomeRes = await db.query(
      `SELECT nome_exibicao FROM modelos WHERE id = $1 LIMIT 1`,
      [modeloIdNum]
    );
    remetente = nomeRes.rows[0]?.nome_exibicao || "Mensagem";
  }

  console.log("[push] sender:", sender);
  console.log("[push] cliente_id:", clienteIdNum);
  console.log("[push] modelo_id:", modeloIdNum);
  console.log("[push] userIdDestino:", userIdDestino);

  if (userIdDestino) {
    await notificarNovaMensagem(
      userIdDestino,
      text.trim() ? text.trim().slice(0, 120) : "Você recebeu uma nova mensagem",
      pushUrl,
      remetente
    );
  }
} catch (pushErr) {
  console.error("Erro ao disparar push de mensagem:", pushErr);
}
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

     if (socket.user.role === "modelo") {
       await db.query(
    `UPDATE messages
     SET lida = true
     WHERE cliente_id = $1
       AND modelo_id = $2
       AND sender = 'cliente'
       AND lida = false`,
    [clienteIdNum, modeloIdNum]
  );
      io.to(`inbox_modelo_${modeloIdNum}`).emit("unreadUpdate");
    }

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

       await db.query(
    `
    UPDATE clientes
    SET last_seen = NOW()
    WHERE id = $1
    `,
    [clienteIdNum]
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

      // Modelo dona do chat sempre recebe as URLs completas
      const ehModeloLogada = socket.user.role === "modelo";

      for (const msg of mensagensConteudo) {
        const midias = mapaMidias[msg.id] || [];
        const pago = Number(msg.preco) > 0 ? pagosSet.has(Number(msg.id)) : true;
        const ehPPVMass = msg.tipo === "conteudo_ppv_mass";

        msg.midias = midias.map(midia => {
          const jaPossuia = ehPPVMass
            ? conteudosPossuidosSet.has(Number(midia.conteudo_id))
            : false;
          const liberado = pago || jaPossuia;

          return {
            conteudo_id:   midia.conteudo_id,
            tipo_media:    midia.tipo_media,
            thumbnail_url: midia.thumbnail_url,
            // Modelo sempre recebe a URL real; cliente só se liberado
            url:           ehModeloLogada ? midia.url : (liberado ? midia.url : null),
            ja_possuia:    jaPossuia,
            liberado,
            bloqueado:     !liberado
          };
        });

        msg.quantidade = msg.midias.length;

        if (Number(msg.preco) > 0) {
          msg.liberado = pago;   // status real do cliente
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

    // 🔒 4️⃣ FILTRAR CONTEÚDOS JÁ POSSUÍDOS PELO CLIENTE
    const possuídosSet = await buscarConteudosJaPossuidosPorCliente(db, {
      cliente_id: clienteIdNum,
      modelo_id: modeloIdNum
    });

    const idsParaEnviar = idsValidos.filter(id => !possuídosSet.has(id));

    if (idsParaEnviar.length === 0) {
      return socket.emit("erroChatConteudo", {
        message: "O cliente já possui todos os conteúdos selecionados."
      });
    }

    let precoNum = Number(preco);

    if (!Number.isFinite(precoNum) || precoNum < 0) {
      precoNum = 0;
    }

    precoNum = Number(precoNum.toFixed(2));

    const sala = `chat_${clienteIdNum}_${modeloIdNum}`;

    // 5️⃣ CRIAR MENSAGEM
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

    // 6️⃣ ASSOCIAR MÍDIAS
    const values = idsParaEnviar
      .map((_, i) => `($1, $${i + 2})`)
      .join(",");

    await db.query(
      `
      INSERT INTO messages_conteudos (message_id, conteudo_id)
      VALUES ${values}
      `,
      [message.id, ...idsParaEnviar]
    );

    // 7️⃣ BUSCAR MÍDIAS
    const midiasRes = await db.query(
      `
      SELECT id AS conteudo_id, url, thumbnail_url, tipo AS tipo_media
      FROM conteudos
      WHERE id = ANY($1)
      ORDER BY array_position($1, id)
      `,
      [idsParaEnviar]
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
    const payloadBase = {
      id: message.id,
      cliente_id: clienteIdNum,
      modelo_id: modeloIdNum,
      sender: "modelo",
      tipo: "conteudo",
      preco: precoNum,
      visto: false,
      quantidade: midias.length,
      bloqueado: precoNum > 0,
      created_at: message.created_at
    };

    // Modelo (remetente) recebe URLs completas — é dono do conteúdo
    socket.emit("newMessage", { ...payloadBase, midias });

    // Cliente recebe preview borrado enquanto não pagar — URL real só após confirmação
    const midiasParaCliente = precoNum > 0
      ? midias.map(m => ({ conteudo_id: m.conteudo_id, thumbnail_url: getPreviewUrl(m.url, m.thumbnail_url), tipo_media: m.tipo_media, url: null }))
      : midias.map(m => ({ conteudo_id: m.conteudo_id, url: m.url, thumbnail_url: m.thumbnail_url, tipo_media: m.tipo_media }));
    socket.to(sala).emit("newMessage", { ...payloadBase, midias: midiasParaCliente });

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

    // 🔔 PUSH NOTIFICATION PARA O CLIENTE
    try {
      const clienteDestinoRes = await db.query(
        `SELECT user_id FROM clientes WHERE id = $1 LIMIT 1`,
        [clienteIdNum]
      );
      const userIdDestino = clienteDestinoRes.rows[0]?.user_id || null;

      if (userIdDestino) {
        const nomeRes = await db.query(
          `SELECT nome_exibicao FROM modelos WHERE id = $1 LIMIT 1`,
          [modeloIdNum]
        );
        const remetente = nomeRes.rows[0]?.nome_exibicao || "Mensagem";
        const textoPreview = precoNum > 0
          ? `📦 Conteúdo pago (${midias.length} mídia${midias.length !== 1 ? "s" : ""})`
          : `📦 Conteúdo (${midias.length} mídia${midias.length !== 1 ? "s" : ""})`;

        await notificarNovaMensagem(userIdDestino, textoPreview, "/inboxc.html", remetente);
      }
    } catch (pushErr) {
      console.error("Erro ao disparar push de conteúdo:", pushErr);
    }

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

    // buscar conteudo_ids da mensagem para atualizar o Set do popup da modelo
    const conteudosRes = await db.query(
      `SELECT conteudo_id FROM messages_conteudos WHERE message_id = $1`,
      [messageIdNum]
    );
    const conteudo_ids = conteudosRes.rows.map(r => r.conteudo_id);

    // 🔥 avisar sala
    const sala = `chat_${clienteIdNum}_${modeloIdNum}`;

    io.to(sala).emit("conteudoVisto", {
      message_id: messageIdNum,
      conteudo_ids
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

app.get("/api/modelo/chat/:id", auth, async (req, res) => {
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
        avatar AS avatar_url,
        last_seen
      FROM modelos
      WHERE id = $1
        AND ativo = true
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
});

// ===========================
// DADOS.HTML
// ===========================

app.get("/api/usuario/dados", auth, async (req, res) => {
  try {
    let result;

    if (req.user.role === "modelo") {
      const modeloRes = await db.query(
        `SELECT id
         FROM modelos
         WHERE user_id = $1
           AND ativo = true`,
        [req.user.id]
      );

      if (!modeloRes.rows.length) {
        return res.json({});
      }

      const modelo_id = modeloRes.rows[0].id;

      result = await db.query(
        `
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
          AND md.ativo = true
        `,
        [modelo_id]
      );

    } else if (req.user.role === "cliente") {
      const clienteRes = await db.query(
        `SELECT id
         FROM clientes
         WHERE user_id = $1
           AND ativo = true`,
        [req.user.id]
      );

      if (!clienteRes.rows.length) {
        return res.json({});
      }

      const cliente_id = clienteRes.rows[0].id;

      result = await db.query(
        `SELECT *
         FROM clientes_dados
         WHERE cliente_id = $1
           AND ativo = true`,
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
      const modeloRes = await db.query(
        `SELECT id
         FROM modelos
         WHERE user_id = $1
           AND ativo = true`,
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
          md.tiktok,
          md.classificacao_conteudo
        FROM modelos m
        LEFT JOIN modelos_dados md
          ON md.modelo_id = m.id
         AND md.ativo = true
        WHERE m.id = $1
          AND m.ativo = true
        `,
        [modelo_id]
      );
    }

    if (req.user.role === "cliente") {
      const clienteRes = await db.query(
        `SELECT id
         FROM clientes
         WHERE user_id = $1
           AND ativo = true`,
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
          AND cd.ativo = true
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
    AND expiration_at > NOW()
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

app.get("/api/cliente/restricao/:modelo_id", authCliente, async (req, res) => {
  try {
    const modelo_id = Number(req.params.modelo_id);
    if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }
    const { rowCount } = await db.query(
      "SELECT 1 FROM cliente_modelo_restricoes WHERE cliente_id = $1 AND modelo_id = $2",
      [req.cliente_id, modelo_id]
    );
    res.json({ restrito: rowCount > 0 });
  } catch (err) {
    console.error("Erro verificar restrição:", err);
    res.status(500).json({ error: "Erro interno" });
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
          AND m.ativo = true
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

    if (req.user.role === "cliente") {
      const clienteRes = await db.query(
        `
        SELECT c.id, c.nome, cd.avatar, cd.nome_exibicao
        FROM clientes c
        LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
        WHERE c.user_id = $1
          AND c.ativo = true
        LIMIT 1
        `,
        [req.user.id]
      );

      if (!clienteRes.rows.length) {
        return res.status(403).json({ error: "Conta desativada" });
      }

      const c = clienteRes.rows[0];
      return res.json({
        user_id: req.user.id,
        role: "cliente",
        nome: c.nome_exibicao || c.nome || "Membro",
        avatar: c.avatar || null
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

  // Verifica se o visitante tem VIP ativo para este modelo
  let podeVer = false;
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const uid = Number(decoded?.id || 0);
      const role = decoded?.role || null;

      if (role === "cliente" && uid) {
        const clienteRes = await db.query(
          `SELECT id FROM clientes WHERE user_id = $1 LIMIT 1`, [uid]
        );
        const cId = clienteRes.rows[0]?.id;
        if (cId) {
          // Bloquear se houver restrição admin
          const restQ = await db.query(
            `SELECT 1 FROM cliente_modelo_restricoes WHERE cliente_id = $1 AND modelo_id = $2`,
            [cId, modeloId]
          );
          if (restQ.rowCount) {
            return res.status(403).json({ error: "Acesso não permitido" });
          }

          const vipRes = await db.query(
            `SELECT 1 FROM vip_subscriptions
             WHERE cliente_id = $1 AND modelo_id = $2
               AND ativo = true AND expiration_at > NOW()
             LIMIT 1`,
            [cId, modeloId]
          );
          podeVer = vipRes.rowCount > 0;
        }
      } else if (role === "modelo" && uid) {
        // Modelo logada vê o próprio feed
        const mRes = await db.query(
          `SELECT id FROM modelos WHERE user_id = $1 LIMIT 1`, [uid]
        );
        const mId = Number(mRes.rows[0]?.id || 0);
        podeVer = mId > 0 && mId === modeloId;
      }
    } catch (err) {
      console.error("[feed/podeVer] erro ao verificar acesso:", err.message);
    }
  }

  const { rows } = await db.query(
    `
    SELECT c.id, c.url, c.thumbnail_url, c.tipo, c.tipo_conteudo, c.preco, c.descricao
    FROM conteudos c
    JOIN modelos m
      ON m.id = c.modelo_id
    WHERE c.modelo_id = $1
      AND m.ativo = true
      AND c.ativo = true
      AND c.tipo_conteudo = 'feed'
      AND (c.preco IS NULL OR c.preco = 0)
    ORDER BY c.id DESC
    `,
    [modeloId]
  );

  // VIP vê URLs reais; não-VIP recebe preview borrado (variant pequena do CF Images)
  res.json(rows.map(r => ({
    id:            r.id,
    tipo:          r.tipo,
    tipo_conteudo: r.tipo_conteudo,
    preco:         r.preco,
    descricao:     r.descricao,
    url:           podeVer ? r.url           : null,
    thumbnail_url: podeVer ? r.thumbnail_url : null,
  })));
});

// ===========================
// PERFIL MODELO VERIFICADA
// ===========================

app.get("/api/modelo/me", authModelo, async (req, res) => {
  try {
    const result = await db.query(
      `
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
        md.tiktok,
        md.classificacao_conteudo
      FROM modelos m
      LEFT JOIN modelos_dados md
        ON md.modelo_id = m.id
       AND md.ativo = true
      WHERE m.id = $1
        AND m.ativo = true
      `,
      [req.modelo_id]
    );

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
// SYNC SOCIAL (Instagram / TikTok)
// ===========================

async function fetchInstagramData(username) {
  const axios = require("axios");
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;

  // Tentativa 1: endpoint web com app-id
  try {
    const res = await axios.get(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
      {
        headers: {
          "x-ig-app-id": "936619743392459",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "pt-BR,pt;q=0.9",
          "Referer": "https://www.instagram.com/",
          "Origin": "https://www.instagram.com",
          "Sec-Fetch-Site": "same-origin",
        },
        timeout: 8000,
      }
    );
    const user = res.data?.data?.user;
    if (user) {
      return {
        foto: user.profile_pic_url_hd || user.profile_pic_url || null,
        seguidores: user.edge_followed_by?.count || 0,
      };
    }
  } catch (e) {
    console.warn("[SyncSocial] IG tentativa 1 falhou:", handle, e?.response?.status || e.message);
  }

  // Tentativa 2: página pública com scraping do JSON embutido
  try {
    const res = await axios.get(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      timeout: 10000,
    });
    const html = res.data;
    // tenta capturar follower count do JSON embutido
    const m = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
    if (m) {
      const picM = html.match(/"profile_pic_url_hd":"([^"]+)"/);
      return {
        foto: picM ? picM[1].replace(/\\u0026/g, "&") : null,
        seguidores: parseInt(m[1], 10),
      };
    }
  } catch (e) {
    console.warn("[SyncSocial] IG tentativa 2 falhou:", handle, e?.response?.status || e.message);
  }

  return null;
}

async function fetchTikTokData(username) {
  const axios = require("axios");
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.tiktok.com/",
  };

  // Tentativa 1: API interna do TikTok Web
  try {
    const res = await axios.get(
      `https://www.tiktok.com/api/user/detail/?uniqueId=${encodeURIComponent(handle)}&aid=1988&app_name=tiktok_web&device_platform=web_pc`,
      { headers, timeout: 10000 }
    );
    const user  = res.data?.userInfo?.user;
    const stats = res.data?.userInfo?.stats;
    if (user) {
      return {
        foto: user.avatarLarger || user.avatarMedium || null,
        seguidores: stats?.followerCount || 0,
      };
    }
  } catch (e) {
    console.warn("[SyncSocial] TT tentativa 1 falhou:", handle, e?.response?.status || e.message);
  }

  // Tentativa 2: scrape HTML com __UNIVERSAL_DATA_FOR_REHYDRATION__
  try {
    const res = await axios.get(`https://www.tiktok.com/@${encodeURIComponent(handle)}`, {
      headers, timeout: 12000,
    });
    const html = res.data;
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (match) {
      const json = JSON.parse(match[1]);
      const userData  = json?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.user;
      const statsData = json?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.stats;
      if (userData) {
        return {
          foto: userData.avatarLarger || userData.avatarMedium || null,
          seguidores: statsData?.followerCount || 0,
        };
      }
    }
    // Tentativa 3: regex direta no HTML
    const segM = html.match(/"followerCount":(\d+)/);
    const picM = html.match(/"avatarLarger":"([^"]+)"/);
    if (segM) {
      return {
        foto: picM ? picM[1].replace(/\\u002F/g, "/").replace(/\\u0026/g, "&") : null,
        seguidores: parseInt(segM[1], 10),
      };
    }
  } catch (e) {
    console.warn("[SyncSocial] TT tentativa 2/3 falhou:", handle, e?.response?.status || e.message);
  }

  return null;
}

async function syncSocialData(modeloId) {
  try {
    const row = await db.query(
      "SELECT instagram, tiktok FROM modelos_dados WHERE modelo_id = $1 AND ativo = true LIMIT 1",
      [modeloId]
    );
    if (!row.rows.length) return;
    const { instagram, tiktok } = row.rows[0];

    let igData = null;
    let ttData = null;
    if (instagram) igData = await fetchInstagramData(instagram);
    if (tiktok)    ttData = await fetchTikTokData(tiktok);

    await db.query(
      `UPDATE modelos_dados SET
        foto_instagram       = COALESCE($1, foto_instagram),
        seguidores_instagram = COALESCE($2, seguidores_instagram),
        foto_tiktok          = COALESCE($3, foto_tiktok),
        seguidores_tiktok    = COALESCE($4, seguidores_tiktok),
        social_sync_em       = NOW()
       WHERE modelo_id = $5 AND ativo = true`,
      [
        igData?.foto        ?? null,
        igData?.seguidores  ?? null,
        ttData?.foto        ?? null,
        ttData?.seguidores  ?? null,
        modeloId,
      ]
    );
    console.log("[SyncSocial] modelo", modeloId, "sincronizado —",
      igData ? `IG ${igData.seguidores} seg` : "sem IG",
      ttData ? `TT ${ttData.seguidores} seg` : "sem TT"
    );
  } catch (e) {
    console.error("[SyncSocial] erro modelo", modeloId, e.message);
  }
}

// Proxy de foto de perfil social — GET /api/social-photo?p=instagram|tiktok&h=handle
// Cache em memória por 6h; evita depender de URLs externas que expiram
const _socialPhotoCache = new Map(); // key → { buf, ct, ts }
const _SOCIAL_PHOTO_TTL = 6 * 60 * 60 * 1000;

// GET /api/social-photo?p=instagram|tiktok&h=handle&mid=modelo_id
// Prioridade: 1) rede social ao vivo  2) BD (preenchido manualmente)  3) avatar Velvet
app.get("/api/social-photo", async (req, res) => {
  const platform  = req.query.p;
  const handle    = (req.query.h || "").replace(/^@/, "").trim();
  const modeloId  = Number(req.query.mid) || null;

  if (!platform || !handle) return res.redirect("/assets/avatar.png");

  const key = `${platform}:${handle}`;
  const hit = _socialPhotoCache.get(key);
  if (hit && Date.now() - hit.ts < _SOCIAL_PHOTO_TTL) {
    res.set("Content-Type", hit.ct);
    res.set("Cache-Control", "public, max-age=21600");
    return res.send(hit.buf);
  }

  const axios = require("axios");

  async function serveUrl(photoUrl) {
    const imgRes = await axios.get(photoUrl, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const buf = Buffer.from(imgRes.data);
    const ct  = imgRes.headers["content-type"] || "image/jpeg";
    _socialPhotoCache.set(key, { buf, ct, ts: Date.now() });
    res.set("Content-Type", ct);
    res.set("Cache-Control", "public, max-age=21600");
    return res.send(buf);
  }

  // 1) Busca ao vivo na rede social
  try {
    let photoUrl = null;
    if (platform === "instagram") {
      const d = await fetchInstagramData(handle);
      photoUrl = d?.foto || null;
    } else if (platform === "tiktok") {
      const d = await fetchTikTokData(handle);
      photoUrl = d?.foto || null;
    }
    if (photoUrl) return await serveUrl(photoUrl);
  } catch (e) {
    console.warn("[SocialPhoto] rede social falhou:", key, e.message);
  }

  // 2) Fallback: foto salva no BD (preenchida manualmente)
  if (modeloId) {
    try {
      const dbRow = await db.query(
        `SELECT foto_instagram, foto_tiktok, avatar
         FROM modelos m
         JOIN modelos_dados md ON md.modelo_id = m.id AND md.ativo = true
         WHERE m.id = $1 LIMIT 1`,
        [modeloId]
      );
      const row = dbRow.rows[0];
      if (row) {
        const dbFoto = platform === "instagram" ? row.foto_instagram : row.foto_tiktok;
        if (dbFoto) return await serveUrl(dbFoto);
        // 3) Avatar da Velvet
        if (row.avatar) return await serveUrl(row.avatar);
      }
    } catch (e) {
      console.warn("[SocialPhoto] BD fallback falhou:", e.message);
    }
  }

  res.redirect("/assets/avatar.png");
});

// Endpoint admin: POST /api/admin/sync-social  (body: { modelo_id } ou sem body → todos)
app.post("/api/admin/sync-social", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  try {
    if (req.body?.modelo_id) {
      await syncSocialData(Number(req.body.modelo_id));
      return res.json({ ok: true });
    }
    // Sync de todos que têm instagram ou tiktok e não foram sincronizados nas últimas 24h
    const todos = await db.query(
      `SELECT modelo_id FROM modelos_dados
       WHERE ativo = true
         AND (instagram IS NOT NULL OR tiktok IS NOT NULL)
         AND (social_sync_em IS NULL OR social_sync_em < NOW() - INTERVAL '30 days')
       LIMIT 100`
    );
    const ids = todos.rows.map(r => r.modelo_id);
    // Processa em background para não bloquear a resposta
    res.json({ ok: true, total: ids.length });
    for (const id of ids) {
      await syncSocialData(id);
      await new Promise(r => setTimeout(r, 1500)); // throttle gentil
    }
  } catch (e) {
    console.error("[SyncSocial] endpoint erro:", e.message);
    res.status(500).json({ error: e.message });
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

    const clienteId = req.user.role === "cliente" ? req.user.id : null;

    const generosValidos = ["mulher", "homem", "nao_binario"];
    const genero = generosValidos.includes(req.query.genero) ? req.query.genero : null;
    const busca = req.query.q ? String(req.query.q).trim() : null;

    const result = await db.query(`
      SELECT
        m.id AS modelo_id,
        m.nome_exibicao,
        m.avatar,
        m.capa,
        m.bio,
        md2.genero,
        md2.instagram,
        md2.tiktok,
        md2.foto_instagram,
        md2.foto_tiktok,
        md2.seguidores_instagram,
        md2.seguidores_tiktok,
        md2.classificacao_conteudo,

        COALESCE(r.ganhos_mes, 0) AS ganhos_total,

        ver.verificado_em AS aprovado_em,

        CASE
          WHEN ver.verificado_em >= NOW() - INTERVAL '14 days'
          THEN true ELSE false
        END AS is_new,

        -- responsiva: >70% das msgs de clientes respondidas nos últimos 7 dias
        CASE
          WHEN COALESCE(resp.total_recebidas, 0) >= 5
           AND COALESCE(resp.total_respondidas, 0)::float
             / NULLIF(resp.total_recebidas, 0) >= 0.7
          THEN true ELSE false
        END AS responsiva,

        -- ativa no conteúdo: postou nos últimos 7 dias ou tem conteúdo premium
        CASE
          WHEN COALESCE(cont.recente, 0) > 0 OR COALESCE(cont.premium, 0) > 0
          THEN true ELSE false
        END AS ativa_conteudo,

        COALESCE(cont.premium, 0) AS total_premium,

        -- recomendada para este cliente (tem interação prévia ou assinatura ativa)
        CASE
          WHEN $1::int IS NOT NULL AND (
            COALESCE(inter.msgs, 0) > 0
            OR COALESCE(assin.ativa, false) = true
          )
          THEN true ELSE false
        END AS recomendada

      FROM modelos m

      LEFT JOIN modelos_dados md2
        ON md2.modelo_id = m.id
       AND md2.ativo = true

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
          AND t.status = 'pago'
          AND DATE_TRUNC('month', t.created_at AT TIME ZONE 'America/Sao_Paulo') = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
      ) r ON true

      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM vip_subscriptions v
        WHERE v.modelo_id = m.id AND v.ativo = true AND v.expiration_at > NOW()
      ) fas ON true

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE sender = 'cliente') AS total_recebidas,
          COUNT(*) FILTER (
            WHERE sender = 'modelo'
            AND EXISTS (
              SELECT 1 FROM messages m2
              WHERE m2.modelo_id = m.id
                AND m2.cliente_id = messages.cliente_id
                AND m2.sender = 'cliente'
                AND m2.created_at < messages.created_at
                AND m2.created_at >= NOW() - INTERVAL '7 days'
            )
          ) AS total_respondidas
        FROM messages
        WHERE modelo_id = m.id
          AND created_at >= NOW() - INTERVAL '7 days'
          AND deletada IS NOT TRUE
      ) resp ON true

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE criado_em >= NOW() - INTERVAL '7 days') AS recente,
          COUNT(*) FILTER (WHERE tipo_conteudo = 'venda' AND preco > 0) AS premium
        FROM conteudos
        WHERE modelo_id = m.id
      ) cont ON true

      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS msgs
        FROM messages
        WHERE modelo_id = m.id AND cliente_id = $1
          AND deletada IS NOT TRUE
        LIMIT 1
      ) inter ON ($1::int IS NOT NULL)

      LEFT JOIN LATERAL (
        SELECT true AS ativa
        FROM vip_subscriptions
        WHERE modelo_id = m.id AND cliente_id = $1
          AND ativo = true AND expiration_at > NOW()
        LIMIT 1
      ) assin ON ($1::int IS NOT NULL)

      WHERE ver.status = 'aprovado'
        AND m.feed = true
        AND m.ativo = true
        AND ($2::text IS NULL OR md2.genero = $2)
        AND ($3::text IS NULL OR m.nome_exibicao ILIKE '%' || $3 || '%')
        AND NOT EXISTS (
          SELECT 1 FROM cliente_modelo_restricoes r2
          JOIN clientes c2 ON c2.id = r2.cliente_id
          WHERE c2.user_id = $1 AND r2.modelo_id = m.id
        )
    `,
    [clienteId, genero, busca]
    );

    const modelos = result.rows;
    const onlineIds = new Set(onlineModelos.keys());

    // marca online
    modelos.forEach(m => {
      m.online = onlineIds.has(Number(m.modelo_id));
    });

    // seções
    const online      = modelos.filter(m => m.online);
    const novas       = modelos.filter(m => m.is_new);
    const emAlta      = [...modelos].sort((a, b) => b.ganhos_total - a.ganhos_total).slice(0, 20);
    const recomendadas = clienteId
      ? modelos.filter(m => m.recomendada)
      : [...modelos].sort(() => Math.random() - 0.5).slice(0, 10);

    // badges top1/2/3 na seção em alta
    emAlta.forEach((m, i) => {
      if (i === 0) m.top1 = true;
      if (i === 1) m.top2 = true;
      if (i === 2) m.top3 = true;
    });

    // Secção "Descubra mais": modelos sem nenhum badge de destaque
    const idsDestaque = new Set([
      ...online.map(m => m.modelo_id),
      ...novas.map(m => m.modelo_id),
      ...emAlta.map(m => m.modelo_id),
      ...recomendadas.map(m => m.modelo_id)
    ]);
    const descubraMais = modelos
      .filter(m =>
        !idsDestaque.has(m.modelo_id) &&
        !m.online &&
        !m.ativa_conteudo &&
        !m.is_new
      )
      .sort((a, b) => (a.nome_exibicao || "").localeCompare(b.nome_exibicao || "", "pt-BR"));

    res.json({ online, novas, emAlta, recomendadas, descubraMais });

  } catch (err) {
    console.error("Erro feed modelos:", err);
    res.status(500).json({ online: [], novas: [], emAlta: [], recomendadas: [] });
  }
});

// ===========================
// FEED DE NOVIDADES (UPDATES)
// ===========================

const MODELO_APROVADO_JOIN = `
  JOIN LATERAL (
    SELECT status FROM modelos_verificacao
    WHERE modelo_id = m.id
    ORDER BY verificado_em DESC
    LIMIT 1
  ) ver ON true
`;

async function buscarEventosUpdates(clienteId) {
  const [feedRes, chatRes, premiumRes, ofertaRes] = await Promise.all([
    // Novo conteúdo no Feed VIP
    db.query(`
      SELECT
        'feed' AS tipo,
        m.id AS modelo_id,
        m.nome_exibicao,
        m.avatar,
        (vs.id IS NOT NULL) AS is_vip,
        COALESCE(of.valor_promocional, NULLIF(mp.valor_mensal,0), NULLIF(md.vip_preco,0), 20.00) AS valor_assinatura,
        sub.qtd,
        sub.thumbs,
        sub.evento_em
      FROM (
        SELECT modelo_id, COUNT(*) AS qtd, MAX(criado_em) AS evento_em,
               array_agg(COALESCE(thumbnail_url, url) ORDER BY criado_em DESC) AS thumbs
        FROM conteudos
        WHERE tipo_conteudo = 'feed' AND ativo = true
          AND criado_em > NOW() - INTERVAL '14 days'
        GROUP BY modelo_id, date_trunc('hour', criado_em)
      ) sub
      JOIN modelos m ON m.id = sub.modelo_id
      ${MODELO_APROVADO_JOIN}
      LEFT JOIN vip_subscriptions vs ON vs.modelo_id = m.id AND vs.cliente_id = $1 AND vs.ativo = true AND vs.expiration_at > NOW()
      LEFT JOIN modelos_planos mp ON mp.modelo_id = m.id
      LEFT JOIN modelos_dados md ON md.modelo_id = m.id AND md.ativo = true
      LEFT JOIN LATERAL (
        SELECT valor_promocional FROM ofertas o2
        WHERE o2.modelo_id = m.id AND o2.ativa = true AND o2.data_fim > NOW()
        LIMIT 1
      ) of ON true
      WHERE ver.status = 'aprovado' AND m.feed = true AND m.ativo = true
      ORDER BY sub.evento_em DESC
      LIMIT 40
    `, [clienteId]),

    // Nova mídia disponível para desbloqueio no chat (conteúdos "à venda")
    db.query(`
      SELECT
        'chat' AS tipo,
        m.id AS modelo_id,
        m.nome_exibicao,
        m.avatar,
        (vs.id IS NOT NULL) AS is_vip,
        sub.qtd,
        sub.thumbs,
        sub.evento_em
      FROM (
        SELECT modelo_id, COUNT(*) AS qtd, MAX(criado_em) AS evento_em,
               array_agg(COALESCE(thumbnail_url, url) ORDER BY criado_em DESC) AS thumbs
        FROM conteudos
        WHERE tipo_conteudo = 'venda' AND ativo = true
          AND criado_em > NOW() - INTERVAL '14 days'
        GROUP BY modelo_id, date_trunc('hour', criado_em)
      ) sub
      JOIN modelos m ON m.id = sub.modelo_id
      ${MODELO_APROVADO_JOIN}
      LEFT JOIN vip_subscriptions vs ON vs.modelo_id = m.id AND vs.cliente_id = $1 AND vs.ativo = true AND vs.expiration_at > NOW()
      WHERE ver.status = 'aprovado' AND m.feed = true AND m.ativo = true
      ORDER BY sub.evento_em DESC
      LIMIT 40
    `, [clienteId]),

    // Novo conteúdo Premium (venda avulsa)
    db.query(`
      SELECT
        'premium' AS tipo,
        m.id AS modelo_id,
        m.nome_exibicao,
        m.avatar,
        p.id AS premium_post_id,
        p.descricao,
        p.preco,
        (SELECT COUNT(*) FROM premium_post_midias pm WHERE pm.premium_post_id = p.id AND pm.ativo = true) AS qtd,
        (SELECT array_agg(pm.thumb_url ORDER BY pm.ordem) FROM premium_post_midias pm WHERE pm.premium_post_id = p.id AND pm.ativo = true) AS thumbs,
        p.created_at AS evento_em
      FROM premium_posts p
      JOIN modelos m ON m.id = p.modelo_id
      ${MODELO_APROVADO_JOIN}
      WHERE ver.status = 'aprovado' AND m.feed = true AND m.ativo = true
        AND p.ativo = true AND p.created_at > NOW() - INTERVAL '14 days'
      ORDER BY p.created_at DESC
      LIMIT 40
    `),

    // Nova oferta/desconto na assinatura VIP
    db.query(`
      SELECT
        'oferta' AS tipo,
        m.id AS modelo_id,
        m.nome_exibicao,
        m.avatar,
        (vs.id IS NOT NULL) AS is_vip,
        o.desconto_percentual,
        o.valor_base,
        o.valor_promocional,
        o.mensagem,
        o.data_fim,
        o.created_at AS evento_em
      FROM ofertas o
      JOIN modelos m ON m.id = o.modelo_id
      ${MODELO_APROVADO_JOIN}
      LEFT JOIN vip_subscriptions vs ON vs.modelo_id = m.id AND vs.cliente_id = $1 AND vs.ativo = true AND vs.expiration_at > NOW()
      WHERE ver.status = 'aprovado' AND m.feed = true AND m.ativo = true
        AND o.ativa = true AND o.created_at > NOW() - INTERVAL '14 days'
      ORDER BY o.created_at DESC
      LIMIT 20
    `, [clienteId])
  ]);

  const eventos = [
    ...feedRes.rows,
    ...chatRes.rows,
    ...premiumRes.rows,
    ...ofertaRes.rows
  ].sort((a, b) => new Date(b.evento_em) - new Date(a.evento_em));

  return eventos;
}

async function buscarIdentidadeUpdates(req) {
  if (req.user.role === "cliente") {
    const r = await db.query(
      "SELECT id, updates_visto_em FROM clientes WHERE user_id = $1",
      [req.user.id]
    );
    if (!r.rowCount) return null;
    return { clienteId: r.rows[0].id, ultimaVisita: r.rows[0].updates_visto_em };
  }
  if (req.user.role === "modelo") {
    const r = await db.query(
      "SELECT id, updates_visto_em FROM modelos WHERE user_id = $1",
      [req.user.id]
    );
    if (!r.rowCount) return null;
    // Modelos ainda não assinam outras modelos: clienteId nulo apenas para visualização.
    return { clienteId: null, ultimaVisita: r.rows[0].updates_visto_em };
  }
  return null;
}

app.get("/api/updates", auth, async (req, res) => {
  try {
    const identidade = await buscarIdentidadeUpdates(req);
    if (!identidade) return res.json({ eventos: [], naoVistos: 0 });

    const { clienteId, ultimaVisita } = identidade;
    const eventos = await buscarEventosUpdates(clienteId);

    const naoVistos = ultimaVisita
      ? eventos.filter(e => new Date(e.evento_em) > new Date(ultimaVisita)).length
      : eventos.length;

    // Remove thumbnails de eventos bloqueados — nunca expõe URL para não-VIP
    const eventosSeguros = eventos.slice(0, 60).map(e => {
      if (!e.is_vip) {
        const { thumbs, ...resto } = e;
        return resto;
      }
      return e;
    });

    res.json({ eventos: eventosSeguros, naoVistos, ultimaVisita });
  } catch (err) {
    console.error("Erro ao buscar updates:", err);
    res.status(500).json({ eventos: [], naoVistos: 0 });
  }
});

app.get("/api/updates/contador", auth, async (req, res) => {
  try {
    const identidade = await buscarIdentidadeUpdates(req);
    if (!identidade) return res.json({ naoVistos: 0 });

    const { clienteId, ultimaVisita } = identidade;
    const eventos = await buscarEventosUpdates(clienteId);

    const naoVistos = ultimaVisita
      ? eventos.filter(e => new Date(e.evento_em) > new Date(ultimaVisita)).length
      : eventos.length;

    res.json({ naoVistos });
  } catch (err) {
    console.error("Erro ao buscar contador de updates:", err);
    res.status(500).json({ naoVistos: 0 });
  }
});

app.post("/api/updates/marcar-visto", auth, async (req, res) => {
  try {
    if (req.user.role === "cliente") {
      await db.query(
        "UPDATE clientes SET updates_visto_em = NOW() WHERE user_id = $1",
        [req.user.id]
      );
    } else if (req.user.role === "modelo") {
      await db.query(
        "UPDATE modelos SET updates_visto_em = NOW() WHERE user_id = $1",
        [req.user.id]
      );
    }

    res.json({ sucesso: true });
  } catch (err) {
    console.error("Erro ao marcar updates como visto:", err);
    res.status(500).json({ erro: "Erro interno" });
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
    const result = await db.query(
      `
      SELECT
        m.id AS modelo_id,
        m.nome_exibicao,
        m.bio,
        m.avatar,
        m.capa,
        m.local,
        COALESCE(md.classificacao_conteudo, 'social') AS classificacao_conteudo,
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
       AND md.ativo = true
      LEFT JOIN modelos_planos mp
        ON mp.modelo_id = m.id
      WHERE m.id = $1
        AND m.ativo = true
        AND v.status = 'aprovado'
      LIMIT 1
      `,
      [modelo_id]
    );

    if (!result.rows.length) {
      return res.status(403).json({
        error: "Perfil indisponível no momento"
      });
    }

    // Registra a visita ao perfil quando o visitante for um cliente autenticado
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.id && decoded.role === "cliente") {
          const clienteRes = await db.query(
            "SELECT id FROM clientes WHERE user_id = $1",
            [decoded.id]
          );
          if (clienteRes.rowCount) {
            const clienteId = clienteRes.rows[0].id;

            // Verifica restrição deste cliente a esta modelo
            const restQ = await db.query(
              "SELECT 1 FROM cliente_modelo_restricoes WHERE cliente_id = $1 AND modelo_id = $2",
              [clienteId, modelo_id]
            );
            if (restQ.rowCount) {
              return res.status(403).json({ error: "Perfil indisponível no momento" });
            }

            await db.query(
              `INSERT INTO modelo_visitas (cliente_id, modelo_id, criado_em) VALUES ($1, $2, NOW())`,
              [clienteId, modelo_id]
            );
          }
        }
      }
    } catch (_) {
      // token ausente/inválido — visita não é registrada, mas perfil continua sendo exibido
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
    const result = await db.query(
      `
      SELECT
        m.id AS modelo_id,
        m.nome_exibicao
      FROM vip_subscriptions v
      JOIN modelos m
        ON m.id = v.modelo_id
      WHERE v.cliente_id = $1
        AND v.ativo = true
        AND v.expiration_at > NOW()
        AND m.ativo = true
      ORDER BY m.nome_exibicao
      `,
      [req.cliente_id]
    );

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
    const result = await db.query(
      `
      SELECT
        c.id AS cliente_id,
        c.user_id,
        c.nome,
        cd.username,
        cd.avatar,
        cd.instagram,
        cd.tiktok,
        cd.local
      FROM clientes c
      LEFT JOIN clientes_dados cd
        ON cd.cliente_id = c.id
       AND cd.ativo = true
      WHERE c.id = $1
        AND c.ativo = true
      `,
      [req.cliente_id]
    );

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
// PREFERÊNCIAS DE EMAIL (CLIENTE)
// ===========================

app.get("/api/cliente/preferencias-email", authCliente, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT pref_novidades_plataforma, pref_novidades_criadoras, pref_ofertas
       FROM clientes WHERE id = $1 AND ativo = true`,
      [req.cliente_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Cliente não encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro GET /api/cliente/preferencias-email:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.patch("/api/cliente/preferencias-email", authCliente, async (req, res) => {
  const colunasValidas = {
    pref_novidades_plataforma: "pref_novidades_plataforma",
    pref_novidades_criadoras: "pref_novidades_criadoras",
    pref_ofertas: "pref_ofertas"
  };

  const { campo, valor } = req.body;
  const coluna = colunasValidas[campo];
  if (!coluna || typeof valor !== "boolean") {
    return res.status(400).json({ error: "Parâmetros inválidos" });
  }

  try {
    await db.query(
      `UPDATE clientes SET ${coluna} = $1 WHERE id = $2 AND ativo = true`,
      [valor, req.cliente_id]
    );

    const emailRes = await db.query(
      `SELECT u.email, c.nome FROM clientes c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [req.cliente_id]
    );

    if (emailRes.rows.length) {
      const { email, nome } = emailRes.rows[0];

      if (coluna === "pref_novidades_criadoras") {
        const vips = await db.query(
          `SELECT m.brevo_list_id FROM vip_subscriptions v
           JOIN modelos m ON m.id = v.modelo_id
           WHERE v.cliente_id = $1 AND v.ativo = true AND m.brevo_list_id IS NOT NULL`,
          [req.cliente_id]
        );
        for (const row of vips.rows) {
          if (!valor) {
            try { await brevo.removerContatoLista(row.brevo_list_id, email); } catch (e) { /* ignora */ }
          } else {
            try { await brevo.adicionarContatoLista(row.brevo_list_id, email, nome, "novidades_criadoras"); } catch (e) { /* ignora */ }
          }
        }
      } else if (coluna === "pref_novidades_plataforma") {
        if (!valor) {
          try { await brevo.removerContatoLista(brevo.GENERAL_LIST_ID, email); } catch (e) { /* ignora */ }
        } else {
          try { await brevo.adicionarContatoLista(brevo.GENERAL_LIST_ID, email, nome, "novidades_plataforma"); } catch (e) { /* ignora */ }
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro PATCH /api/cliente/preferencias-email:", err);
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
      ORDER BY
        CASE WHEN msg.sender = 'modelo' AND COALESCE(msg.lida, false) = false THEN 1 ELSE 2 END,
        msg.created_at DESC NULLS LAST
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

    if (modeloResult.rowCount === 0) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    const modeloId = modeloResult.rows[0].id;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows } = await db.query(
      `
      SELECT
        c.id AS cliente_id,
        c.nome,
        cd.username,
        cd.avatar AS avatar,
        COALESCE(cnm.resumo_curto, '') AS resumo_curto,

        msg.text       AS ultima_mensagem,
        msg.created_at AS ultima_mensagem_em,
        msg.sender     AS ultimo_sender,
        COALESCE(msg.visto, false) AS visto,
        COALESCE(msg.lida, false)  AS lida,

        COALESCE(g.total_gasto, 0) AS total_gasto,

        CASE
          WHEN COALESCE(g.total_gasto, 0) >= 300 THEN '$$$'
          WHEN COALESCE(g.total_gasto, 0) >= 200 THEN '$$'
          WHEN COALESCE(g.total_gasto, 0) > 100 THEN '$'
          ELSE ''
        END AS spend_level,

        CASE
          WHEN msg.sender = 'cliente' AND COALESCE(msg.lida, false) = false THEN true
          ELSE false
        END AS nao_lido,

        CASE
          WHEN msg.sender = 'cliente' AND COALESCE(msg.lida, false) = true THEN true
          ELSE false
        END AS por_responder,

        CASE
          WHEN msg.sender = 'modelo' AND COALESCE(msg.visto, false) = true THEN true
          ELSE false
        END AS cliente_visualizou

      FROM vip_subscriptions v
      JOIN clientes c
        ON c.id = v.cliente_id

      LEFT JOIN clientes_dados cd
        ON cd.cliente_id = c.id

      LEFT JOIN cliente_notas_modelo cnm
      ON cnm.cliente_id = c.id
      AND cnm.modelo_id = $1

      LEFT JOIN LATERAL (
        SELECT text, created_at, visto, lida, sender
        FROM messages
        WHERE messages.cliente_id = c.id
          AND messages.modelo_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      ) msg ON true

      LEFT JOIN LATERAL (
        SELECT SUM(valor_bruto) AS total_gasto
        FROM transacoes_agency t
        WHERE t.cliente_id = c.id
          AND t.modelo_id = $1
          AND t.status = 'pago'
          AND t.tipo IN ('midia', 'assinatura')
      ) g ON true

      WHERE v.modelo_id = $1
        AND v.ativo = true
        AND v.expiration_at > NOW()

      ORDER BY
        CASE
          WHEN msg.sender = 'cliente' AND COALESCE(msg.lida,  false) = false THEN 1
          WHEN msg.sender = 'cliente' AND COALESCE(msg.lida,  false) = true  THEN 2
          WHEN msg.sender = 'modelo'  AND COALESCE(msg.visto, false) = true  THEN 3
          WHEN msg.sender = 'modelo'  AND COALESCE(msg.visto, false) = false THEN 4
          ELSE 5
        END,
        msg.created_at DESC NULLS LAST,
        c.id DESC

      LIMIT $2 OFFSET $3
      `,
      [modeloId, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar chats da modelo:", err);
    res.status(500).json({ error: "Erro ao buscar chats" });
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
      AND c.ativo = true
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
      // Log de visualização de mídia paga (apenas se era paga e estava liberada)
      if (preco > 0 && mensagemLiberada) {
        registrarLog(db, {
          tipo: 'visualizacao_midia_chat',
          cliente_id: req.cliente_id,
          modelo_id: Number(mensagem.modelo_id) || null,
          descricao: `Mídia paga do chat visualizada — message_id ${message_id}`,
          ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
          user_agent: req.headers['user-agent'] || null
        });
      }
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
        conteudo_id:   conteudoId,
        url:           jaPossuia ? row.url : null,
        tipo_media:    row.tipo_media,
        thumbnail_url: jaPossuia ? row.thumbnail_url : getPreviewUrl(row.url, row.thumbnail_url),
        ja_possuia:    jaPossuia,
        liberado:      jaPossuia,
        bloqueado:     !jaPossuia
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
      WITH vip_ativos AS (
        SELECT
          v.cliente_id,
          v.modelo_id,
          MAX(v.expiration_at) AS expiration_at,
          MAX(v.gateway_subscription_id) AS gateway_subscription_id
        FROM vip_subscriptions v
        WHERE v.modelo_id = $1
          AND v.ativo = true
          AND v.expiration_at > NOW()
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
        va.expiration_at,
        COALESCE(f.total_assinaturas, 0)::numeric(10,2) AS total_assinaturas,
        COALESCE(f.total_midias, 0)::numeric(10,2) AS total_midias,
        CASE
          WHEN ta.id IS NULL THEN NULL
          WHEN ta.disponivel_em IS NULL OR ta.disponivel_em > NOW() THEN 'pendente'
          ELSE 'liberado'
        END AS disponibilidade_ultimo_pagamento

      FROM vip_ativos va
      JOIN clientes c
        ON c.id = va.cliente_id
      LEFT JOIN financeiros f
        ON f.cliente_id = va.cliente_id
       AND f.modelo_id = va.modelo_id
      LEFT JOIN transacoes_agency ta
        ON ta.stripe_payment_intent_id = va.gateway_subscription_id
       AND ta.gateway = 'stripe'

      ORDER BY va.expiration_at ASC, c.nome ASC
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
// STATUS PAGAMENTOS VIP/MIDIAS/PREMIUM
// ============================

app.get("/api/pagamento/status/:paymentRef", auth, async (req, res) => {
  try {
    const { paymentRef } = req.params;

    if (!paymentRef || String(paymentRef).trim() === "") {
      return res.status(400).json({ error: "paymentRef inválido" });
    }

    function normalizarStatusLocal(status) {
      const s = String(status || "").toLowerCase().trim();

      if (s === "pago") return "pago";

      if (
        [
          "falhou",
          "failed",
          "refused",
          "denied",
          "cancelled",
          "canceled",
          "requires_payment_method"
        ].includes(s)
      ) {
        return "falhou";
      }

      if (["expired", "expirado"].includes(s)) {
        return "expirado";
      }

      if (
        [
          "chargedback",
          "chargeback",
          "refunded",
          "estornado"
        ].includes(s)
      ) {
        return "falhou";
      }

      if (
        [
          "requires_action",
          "requires_confirmation",
          "processing",
          "pending",
          "pendente",
          "iniciado"
        ].includes(s)
      ) {
        return "pendente";
      }

      if (s === "succeeded") {
        return "pendente";
      }

      return "pendente";
    }

    /* =========================================
       1) PREMIUM (PIX ou CARTAO)
    ========================================= */
    const premiumRes = await db.query(
      `
      SELECT
        status,
        premium_post_id,
        modelo_id,
        metodo_pagamento AS metodo,
        'premium' AS tipo,
        gateway,
        currency
      FROM premium_unlocks
      WHERE pagarme_order_id = $1
         OR stripe_payment_intent_id = $1
      LIMIT 1
      `,
      [paymentRef]
    );

    if (premiumRes.rowCount > 0) {
      const row = premiumRes.rows[0];

      return res.json({
        status: normalizarStatusLocal(row.status),
        raw_status: row.status,
        tipo: row.tipo,
        metodo: row.metodo || null,
        gateway: row.gateway || null,
        currency: row.currency || null,
        message_id: null,
        premium_post_id: row.premium_post_id || null,
        modelo_id: row.modelo_id || null
      });
    }

    /* =========================================
       2) VIP PIX
    ========================================= */
    const vipPixRes = await db.query(
      `
      SELECT
        status,
        modelo_id,
        'pix' AS metodo,
        'vip' AS tipo,
        gateway,
        currency
      FROM pagamentos_pix
      WHERE pagarme_order_id = $1
        AND message_id IS NULL
      LIMIT 1
      `,
      [paymentRef]
    );

    if (vipPixRes.rowCount > 0) {
      const row = vipPixRes.rows[0];

      return res.json({
        status: normalizarStatusLocal(row.status),
        raw_status: row.status,
        tipo: row.tipo,
        metodo: row.metodo,
        gateway: row.gateway || "pagarme",
        currency: row.currency || null,
        message_id: null,
        premium_post_id: null,
        modelo_id: row.modelo_id || null
      });
    }

    /* =========================================
       3) VIP CARTAO STRIPE
    ========================================= */
    const vipCartaoRes = await db.query(
      `
      SELECT
        status,
        modelo_id,
        'cartao' AS metodo,
        'vip' AS tipo,
        gateway,
        currency
      FROM pagamentos_cartao
      WHERE (
        stripe_payment_intent_id = $1
        OR gateway_payment_id = $1
      )
        AND conteudo_id IS NULL
        AND tipo = 'vip'
      LIMIT 1
      `,
      [paymentRef]
    );

    if (vipCartaoRes.rowCount > 0) {
      const row = vipCartaoRes.rows[0];

      return res.json({
        status: normalizarStatusLocal(row.status),
        raw_status: row.status,
        tipo: row.tipo,
        metodo: row.metodo,
        gateway: row.gateway || "stripe",
        currency: row.currency || null,
        message_id: null,
        premium_post_id: null,
        modelo_id: row.modelo_id || null
      });
    }

    /* =========================================
       4) MIDIA PIX
    ========================================= */
    const pixRes = await db.query(
      `
      SELECT
        status,
        message_id,
        modelo_id,
        'pix' AS metodo,
        'midia' AS tipo,
        gateway,
        currency
      FROM pagamentos_pix
      WHERE pagarme_order_id = $1
        AND message_id IS NOT NULL
      LIMIT 1
      `,
      [paymentRef]
    );

    if (pixRes.rowCount > 0) {
      const row = pixRes.rows[0];

      return res.json({
        status: normalizarStatusLocal(row.status),
        raw_status: row.status,
        tipo: row.tipo,
        metodo: row.metodo,
        gateway: row.gateway || "pagarme",
        currency: row.currency || null,
        message_id: row.message_id || null,
        premium_post_id: null,
        modelo_id: row.modelo_id || null
      });
    }

    /* =========================================
       5) MIDIA CARTAO STRIPE
    ========================================= */
    const cartaoRes = await db.query(
      `
      SELECT
        status,
        conteudo_id AS message_id,
        modelo_id,
        'cartao' AS metodo,
        'midia' AS tipo,
        gateway,
        currency
      FROM pagamentos_cartao
      WHERE (
        stripe_payment_intent_id = $1
        OR gateway_payment_id = $1
      )
        AND conteudo_id IS NOT NULL
      LIMIT 1
      `,
      [paymentRef]
    );

    if (cartaoRes.rowCount > 0) {
      const row = cartaoRes.rows[0];

      return res.json({
        status: normalizarStatusLocal(row.status),
        raw_status: row.status,
        tipo: row.tipo,
        metodo: row.metodo,
        gateway: row.gateway || "stripe",
        currency: row.currency || null,
        message_id: row.message_id || null,
        premium_post_id: null,
        modelo_id: row.modelo_id || null
      });
    }

    /* =========================================
       6) NAO ENCONTRADO
    ========================================= */
    return res.json({
      status: "pendente",
      raw_status: null,
      tipo: null,
      metodo: null,
      gateway: null,
      currency: null,
      message_id: null,
      premium_post_id: null,
      modelo_id: null
    });

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

// ===========================
// FEED PREMIUM
// ===========================

app.get("/api/modelo/publico/:modelo_id/premium", async (req, res) => {
  try {
    const modelo_id = Number(req.params.modelo_id);

    if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    let role = null;
    let userId = 0;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        role = decoded?.role || null;
        userId = Number(decoded?.id || 0);
      } catch (err) {
        role = null;
        userId = 0;
      }
    }

    let ehDona = false;
    let cliente_id = null;

    if (role === "modelo" && userId) {
      const modeloRes = await db.query(
        `
        SELECT id
        FROM modelos
        WHERE user_id = $1
        LIMIT 1
        `,
        [userId]
      );

      const modeloLogado = Number(modeloRes.rows[0]?.id || 0);
      ehDona = modeloLogado === modelo_id;
    }

    if (role === "cliente" && userId) {
      const clienteRes = await db.query(
        `
        SELECT id
        FROM clientes
        WHERE user_id = $1
        LIMIT 1
        `,
        [userId]
      );

      cliente_id = Number(clienteRes.rows[0]?.id || 0) || null;

      if (cliente_id) {
        const restQ = await db.query(
          `SELECT 1 FROM cliente_modelo_restricoes WHERE cliente_id = $1 AND modelo_id = $2`,
          [cliente_id, modelo_id]
        );
        if (restQ.rowCount) {
          return res.status(403).json({ error: "Acesso não permitido" });
        }
      }
    }

    const result = await db.query(
      `
      SELECT
        p.id,
        p.modelo_id,
        p.preco,
        p.descricao,
        p.created_at,
        CASE
          WHEN $2 = true THEN true
          WHEN $3::bigint IS NOT NULL AND EXISTS (
            SELECT 1
            FROM premium_unlocks pu
            WHERE pu.premium_post_id = p.id
              AND pu.cliente_id = $3
              AND pu.status = 'pago'
          ) THEN true
          ELSE false
        END AS liberado,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pm.id,
              'url', CASE
                WHEN $2 = true THEN pm.url
                WHEN $3::bigint IS NOT NULL AND EXISTS (
                  SELECT 1
                  FROM premium_unlocks pu
                  WHERE pu.premium_post_id = p.id
                    AND pu.cliente_id = $3
                    AND pu.status = 'pago'
                ) THEN pm.url
                ELSE NULL
              END,
              'thumb_url', CASE
                WHEN $2 = true THEN pm.thumb_url
                WHEN $3::bigint IS NOT NULL AND EXISTS (
                  SELECT 1
                  FROM premium_unlocks pu
                  WHERE pu.premium_post_id = p.id
                    AND pu.cliente_id = $3
                    AND pu.status = 'pago'
                ) THEN pm.thumb_url
                ELSE NULL
              END,
              'tipo', pm.tipo,
              'ordem', pm.ordem
            )
            ORDER BY pm.ordem ASC, pm.id ASC
          ) FILTER (WHERE pm.id IS NOT NULL),
          '[]'::json
        ) AS midias
      FROM premium_posts p
      LEFT JOIN premium_post_midias pm
        ON pm.premium_post_id = p.id
       AND pm.ativo = true
      WHERE p.modelo_id = $1
        AND p.ativo = true
      GROUP BY p.id
      ORDER BY p.created_at DESC
      `
      ,
      [modelo_id, ehDona, cliente_id]
    );

    const rows = result.rows.map(item => {
      const midias = Array.isArray(item.midias) ? item.midias : [];
      const primeiraMidia = midias[0] || null;

      return {
        id: item.id,
        modelo_id: item.modelo_id,
        preco: item.preco,
        descricao: item.descricao,
        created_at: item.created_at,
        liberado: item.liberado,
        thumb_url: primeiraMidia?.thumb_url || null,
        tipo: primeiraMidia?.tipo || null,
        url: item.liberado ? (primeiraMidia?.url || null) : null,
        midias
      };
    });

    // Log quando cliente visualiza conteúdo premium desbloqueado no feed
    if (cliente_id && rows.some(r => r.liberado)) {
      registrarLog(db, {
        tipo: 'visualizacao_premium',
        cliente_id,
        modelo_id,
        descricao: `Feed premium acessado — ${rows.filter(r => r.liberado).length} post(s) desbloqueado(s) — modelo_id ${modelo_id}`,
        ip:         req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
        user_agent: req.headers["user-agent"] || null
      });
    }

    return res.json(rows);
  } catch (err) {
    console.error("Erro listar premium:", err);
    return res.status(500).json({ error: "Erro ao carregar premium" });
  }
});

// ===========================
// PREMIUM REVALIDAR PGMTOS
// ===========================

app.get("/api/premium/:premium_post_id/status", authCliente, async (req, res) => {
  try {
    const premium_post_id = Number(req.params.premium_post_id);
    const userId = Number(req.user?.id || 0);

    if (!Number.isInteger(premium_post_id) || premium_post_id <= 0) {
      return res.status(400).json({ error: "premium_post_id inválido" });
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Usuário inválido" });
    }

    const clienteRes = await db.query(
      `
      SELECT id
      FROM clientes
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = Number(clienteRes.rows[0].id);

    const result = await db.query(
      `
      SELECT
        status,
        metodo_pagamento,
        gateway,
        pagarme_order_id,
        pagarme_charge_id,
        stripe_payment_intent_id,
        stripe_charge_id,
        stripe_checkout_session_id,
        modelo_id,
        pago_em,
        updated_at
      FROM premium_unlocks
      WHERE premium_post_id = $1
        AND cliente_id = $2
      ORDER BY updated_at DESC NULLS LAST, pago_em DESC NULLS LAST
      LIMIT 1
      `,
      [premium_post_id, cliente_id]
    );

    if (!result.rows.length) {
      return res.json({
        premium_post_id,
        liberado: false,
        status: "nao_encontrado",
        metodo_pagamento: null,
        gateway: null,
        pagarme_order_id: null,
        pagarme_charge_id: null,
        stripe_payment_intent_id: null,
        stripe_charge_id: null,
        stripe_checkout_session_id: null,
        modelo_id: null,
        pago_em: null,
        updated_at: null
      });
    }

    const row = result.rows[0];
    const status = String(row.status || "").toLowerCase().trim();

    return res.json({
      premium_post_id,
      liberado: status === "pago",
      status,
      metodo_pagamento: row.metodo_pagamento || null,
      gateway: row.gateway || null,
      pagarme_order_id: row.pagarme_order_id || null,
      pagarme_charge_id: row.pagarme_charge_id || null,
      stripe_payment_intent_id: row.stripe_payment_intent_id || null,
      stripe_charge_id: row.stripe_charge_id || null,
      stripe_checkout_session_id: row.stripe_checkout_session_id || null,
      modelo_id: row.modelo_id || null,
      pago_em: row.pago_em || null,
      updated_at: row.updated_at || null
    });
  } catch (err) {
    console.error("Erro status premium:", err);
    return res.status(500).json({ error: "Erro ao consultar status" });
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
    // Verifica se os handles mudaram para resetar o sync
    const prevRow = await db.query(
      "SELECT instagram, tiktok FROM modelos_dados WHERE modelo_id = $1 AND ativo = true LIMIT 1",
      [req.modelo_id]
    );
    const prev = prevRow.rows[0] || {};
    const handlesAlterados = prev.instagram !== instaFinal || prev.tiktok !== tiktokFinal;

    await db.query(
      `
      INSERT INTO modelos_dados (modelo_id, instagram, tiktok${handlesAlterados ? ", social_sync_em" : ""})
      VALUES ($1, $2, $3${handlesAlterados ? ", NULL" : ""})
      ON CONFLICT (modelo_id)
      DO UPDATE SET
        instagram = EXCLUDED.instagram,
        tiktok = EXCLUDED.tiktok
        ${handlesAlterados ? ", social_sync_em = NULL, seguidores_instagram = 0, seguidores_tiktok = 0, foto_instagram = NULL, foto_tiktok = NULL" : ""}
      `,
      [req.modelo_id, instaFinal, tiktokFinal]
    );

    // Dispara sync em background se handles mudaram
    if (handlesAlterados && (instaFinal || tiktokFinal)) {
      setImmediate(() => syncSocialData(req.modelo_id));
    }

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
      bio,
      classificacao_conteudo
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
      instagram              = COALESCE($1, instagram),
      tiktok                 = COALESCE($2, tiktok),
      classificacao_conteudo = COALESCE($3, classificacao_conteudo),
      atualizado_em          = NOW()
    WHERE modelo_id = $4
    `,
    [
      instagram ?? null,
      tiktok ?? null,
      classificacao_conteudo ?? null,
      modeloId
    ]
  );

} else {

  await db.query(
    `
    INSERT INTO modelos_dados (modelo_id, instagram, tiktok, classificacao_conteudo)
    VALUES ($1, $2, $3, $4)
    `,
    [
      modeloId,
      instagram ?? null,
      tiktok ?? null,
      classificacao_conteudo ?? null
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
      genero,
      endereco,
      estado,
      cidade,
      pais
    } = req.body;

    const userId = req.user.id;
    const generosValidos = ["mulher", "homem", "nao_binario"];
    const generoNormalizado = generosValidos.includes(genero) ? genero : null;

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
          (modelo_id, nome_completo, data_nascimento, telefone, genero, endereco, estado, cidade, pais, atualizado_em)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (modelo_id)
        DO UPDATE SET
          nome_completo = EXCLUDED.nome_completo,
          data_nascimento = EXCLUDED.data_nascimento,
          telefone = EXCLUDED.telefone,
          genero = EXCLUDED.genero,
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
        generoNormalizado,
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
// SALVAR ENDEREÇO / TELEFONE DO CLIENTE (modal de pagamento)
// ===========================
app.patch("/api/cliente/endereco", authCliente, async (req, res) => {
  try {
    const { pais, estado, cidade, endereco, endereco2, cep, telefone } = req.body;

    await db.query(`
      INSERT INTO clientes_dados (cliente_id, pais, estado, cidade, endereco, endereco2, cep, telefone, criado_em, atualizado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (cliente_id) DO UPDATE SET
        pais       = COALESCE(EXCLUDED.pais,      clientes_dados.pais),
        estado     = COALESCE(EXCLUDED.estado,    clientes_dados.estado),
        cidade     = COALESCE(EXCLUDED.cidade,    clientes_dados.cidade),
        endereco   = COALESCE(EXCLUDED.endereco,  clientes_dados.endereco),
        endereco2  = COALESCE(EXCLUDED.endereco2, clientes_dados.endereco2),
        cep        = COALESCE(EXCLUDED.cep,       clientes_dados.cep),
        telefone   = COALESCE(EXCLUDED.telefone,  clientes_dados.telefone),
        atualizado_em = NOW()
    `, [
      req.cliente_id,
      pais     || null,
      estado   || null,
      cidade   || null,
      endereco || null,
      endereco2 || null,
      cep      || null,
      telefone || null
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao salvar endereço cliente:", err);
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
    if (!clienteRes.rowCount) return res.status(404).json({ error: "Cliente não encontrado." });
    const clienteId = clienteRes.rows[0].id;

    const subRes = await db.query(
      `SELECT id, ativo, modelo_id, expiration_at, cancelado_em
       FROM vip_subscriptions
       WHERE id = $1 AND cliente_id = $2`,
      [subscriptionId, clienteId]
    );
    if (!subRes.rowCount) return res.status(403).json({ error: "Subscrição inválida." });

    const sub = subRes.rows[0];
    if (sub.cancelado_em) return res.status(400).json({ error: "Esta subscrição já foi cancelada." });

    // Mantém ativa até expirar, apenas registra cancelamento
    await db.query(
      `UPDATE vip_subscriptions SET recorrente = false, cancelado_em = NOW() WHERE id = $1`,
      [subscriptionId]
    );

    await db.query(
      `INSERT INTO logs_cancelamentos (cliente_id, modelo_id, subscricao_id, valida_ate)
       VALUES ($1, $2, $3, $4)`,
      [clienteId, sub.modelo_id, subscriptionId, sub.expiration_at]
    ).catch(() => {});

    registrarLog(db, {
      tipo: 'cancelamento_assinatura',
      cliente_id: clienteId,
      modelo_id: sub.modelo_id,
      descricao: `Assinatura #${subscriptionId} cancelada pelo cliente — acesso até ${sub.expiration_at ? new Date(sub.expiration_at).toLocaleDateString('pt-BR') : '—'}`,
      ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
      user_agent: req.headers["user-agent"] || null
    });

    return res.status(200).json({
      success: true,
      message: "Cancelamento registrado.",
      valida_ate: sub.expiration_at
    });
  } catch (err) {
    console.error("Erro ao cancelar:", err);
    return res.status(500).json({ error: "Erro interno ao cancelar subscrição." });
  }
});

// =============================
// ASSINATURAS VIP DO CLIENTE
// =============================
app.get("/api/cliente/subscricoes", auth, async (req, res) => {
  try {
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [req.user.id]
    );
    if (!clienteRes.rowCount) return res.status(404).json({ error: "Cliente não encontrado." });
    const clienteId = clienteRes.rows[0].id;

    const { rows } = await db.query(
      `SELECT v.*,
              m.nome_exibicao AS modelo,
              sl.ip           AS aceite_ip,
              sl.created_at   AS aceite_timestamp
         FROM vip_subscriptions v
         LEFT JOIN modelos m ON m.id = v.modelo_id
         LEFT JOIN LATERAL (
           SELECT ip, created_at
             FROM security_logs
            WHERE tipo = 'aceite_termos'
              AND cliente_id = v.cliente_id
              AND modelo_id  = v.modelo_id
              AND created_at <= v.updated_at
              AND created_at >= v.updated_at - interval '3 hours'
            ORDER BY created_at DESC
            LIMIT 1
         ) sl ON true
        WHERE v.cliente_id = $1
        ORDER BY v.updated_at DESC`,
      [clienteId]
    );
    return res.json(rows);
  } catch (err) {
    console.error("Erro GET /api/cliente/subscricoes:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// =============================
// TRANSAÇÕES DO CLIENTE
// =============================
app.get("/api/cliente/transacoes", auth, async (req, res) => {
  try {
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [req.user.id]
    );
    if (!clienteRes.rowCount) return res.status(404).json({ error: "Cliente não encontrado." });
    const clienteId = clienteRes.rows[0].id;

    // Cartão + PIX (assinaturas e mídias em geral)
    const { rows: cartao } = await db.query(
      `SELECT p.id, p.tipo, p.valor, p.status, p.created_at AS criado_em,
              p.aceitou_termos, p.aceitou_politicas, p.aceite_timestamp, p.aceite_ip,
              m.nome_exibicao AS modelo_nome
         FROM pagamentos_cartao p
         LEFT JOIN modelos m ON m.id = p.modelo_id
        WHERE p.cliente_id = $1
        ORDER BY p.created_at DESC`,
      [clienteId]
    );

    const { rows: pix } = await db.query(
      `SELECT p.id, p.tipo, p.valor, p.status, p.criado_em,
              p.aceitou_termos, NULL AS aceitou_politicas,
              p.aceite_timestamp, p.aceite_ip,
              m.nome_exibicao AS modelo_nome
         FROM pagamentos_pix p
         LEFT JOIN modelos m ON m.id = p.modelo_id
        WHERE p.cliente_id = $1
        ORDER BY p.criado_em DESC`,
      [clienteId]
    );

    // Mídias premium e de chat separadas
    const { rows: premium } = await db.query(
      `SELECT pu.id, 'midia_premium' AS tipo, pu.valor_base AS valor, pu.status,
              pu.created_at AS criado_em,
              pu.aceitou_termos, pu.aceitou_politicas, pu.aceite_timestamp, pu.aceite_ip,
              m.nome_exibicao AS modelo_nome
         FROM premium_unlocks pu
         LEFT JOIN modelos m ON m.id = pu.modelo_id
        WHERE pu.cliente_id = $1
        ORDER BY pu.created_at DESC`,
      [clienteId]
    );

    const { rows: chat } = await db.query(
      `SELECT cp.id, 'midia_chat' AS tipo, cp.preco AS valor, cp.status,
              cp.criado_em,
              NULL AS aceitou_termos, NULL AS aceitou_politicas,
              NULL AS aceite_timestamp, NULL AS aceite_ip,
              m.nome_exibicao AS modelo_nome
         FROM conteudo_pacotes cp
         LEFT JOIN modelos m ON m.id = cp.modelo_id
        WHERE cp.cliente_id = $1
        ORDER BY cp.criado_em DESC`,
      [clienteId]
    );

    const todas = [...cartao, ...pix, ...premium, ...chat]
      .sort((a, b) => new Date(b.criado_em || b.created_at) - new Date(a.criado_em || a.created_at));

    return res.json(todas);
  } catch (err) {
    console.error("Erro GET /api/cliente/transacoes:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// =============================
// OCORRÊNCIA DO CLIENTE (antifraude / suporte avançado)
// =============================
app.post("/api/cliente/ocorrencia", auth, async (req, res) => {
  try {
    const { tipo, subtipo, nome_completo, nascimento, email, data_pagamento,
            modelo_nome, midia_id, descricao, anexo_base64, anexo_filename } = req.body;

    if (!tipo || !nome_completo || !email) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes." });
    }

    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1", [req.user.id]
    );
    const clienteId = clienteRes.rows[0]?.id || null;

    const { rows: ocRows } = await db.query(
      `INSERT INTO logs_ocorrencias
         (cliente_id, tipo, subtipo, nome_completo, nascimento, email,
          data_pagamento, modelo_nome, midia_id, descricao, anexo_base64, anexo_filename)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [clienteId, tipo, subtipo || null, nome_completo,
       nascimento || null, email, data_pagamento || null,
       modelo_nome || null, midia_id || null, descricao || null,
       anexo_base64 || null, anexo_filename || null]
    );

    const tipoLabelNotif = {
      vip_nao_liberou: "VIP não liberou",
      propaganda: "Propaganda enganosa / Golpe",
      arrependimento: "Arrependimento",
      modelo_errada: "Assinei modelo errada",
      midia_nao_desbloqueou: "Mídia não desbloqueou",
      midia_errada: "Desbloqueio de mídia errada",
      cancelamento_vip: "Cancelamento VIP",
    }[tipo] || tipo;

    await criarNotificacaoAdmin(db, req.app.get("io"), {
      tipo: "ocorrencia",
      referencia_id: ocRows[0]?.id || null,
      titulo: "Nova ocorrência aberta",
      mensagem: `${nome_completo} — ${tipoLabelNotif}`
    });

    // Envia email interno para a equipe Velvet
    try {
      const { Resend } = require("resend");
      const r = new Resend(process.env.RESEND_API_KEY);
      const attachments = [];
      if (anexo_base64 && anexo_filename) {
        attachments.push({ filename: anexo_filename, content: anexo_base64 });
      }
      const tipoLabel = {
        vip_nao_liberou: "VIP não liberou",
        propaganda: "Propaganda enganosa / Golpe",
        arrependimento: "Arrependimento",
        modelo_errada: "Assinei modelo errada",
        midia_nao_desbloqueou: "Mídia não desbloqueou",
        midia_errada: "Desbloqueio de mídia errada",
        cancelamento_vip: "Cancelamento VIP",
      }[tipo] || tipo;
      await r.emails.send({
        from: "Velvet Suporte <contato@velvet.lat>",
        to: "contato@velvet.lat",
        subject: `[Ocorrência] ${tipoLabel} — ${nome_completo}`,
        html: `
          <h2 style="color:#7B2CFF;">[${tipoLabel}]</h2>
          <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px;">
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Cliente ID</td><td style="padding:6px 10px;">${clienteId || "—"}</td></tr>
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Nome completo</td><td style="padding:6px 10px;">${nome_completo}</td></tr>
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Nascimento</td><td style="padding:6px 10px;">${nascimento || "—"}</td></tr>
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Email</td><td style="padding:6px 10px;">${email}</td></tr>
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Data do pagamento</td><td style="padding:6px 10px;">${data_pagamento || "—"}</td></tr>
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Modelo/Criadora</td><td style="padding:6px 10px;">${modelo_nome || "—"}</td></tr>
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Tipo de mídia</td><td style="padding:6px 10px;">${subtipo || "—"}</td></tr>
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Mídia ID</td><td style="padding:6px 10px;">${midia_id || "—"}</td></tr>
            <tr><td style="padding:6px 10px;background:#f3eff5;font-weight:bold;">Descrição</td><td style="padding:6px 10px;">${descricao || "—"}</td></tr>
          </table>`,
        attachments
      });
    } catch (emailErr) {
      console.warn("Aviso: email de ocorrência não enviado:", emailErr.message);
    }

    // Confirmação para o cliente
    if (email) {
      try {
        const { Resend } = require("resend");
        const r = new Resend(process.env.RESEND_API_KEY);
        await r.emails.send({
          from: "Velvet Suporte <contato@velvet.lat>",
          to: email,
          subject: "Recebemos o seu report — Velvet",
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
              <img src="https://velvet.lat/assets/logo.png" alt="Velvet" style="height:36px;margin-bottom:24px;" />
              <h2 style="color:#7B2CFF;margin:0 0 16px;">Report recebido com sucesso ✅</h2>
              <p style="color:#1e1b2e;font-size:15px;line-height:1.7;margin:0 0 14px;">
                Olá, <strong>${nome_completo || "cliente"}</strong>!
              </p>
              <p style="color:#1e1b2e;font-size:15px;line-height:1.7;margin:0 0 14px;">
                Recebemos o seu report e nossa equipe já está analisando o seu caso.
                Em breve você receberá nosso retorno — o prazo é de até <strong>24 a 48 horas úteis</strong>.
              </p>
              <p style="color:#1e1b2e;font-size:15px;line-height:1.7;margin:0 0 24px;">
                Se tiver mais alguma dúvida, pode responder este email ou entrar em contato pelo
                <a href="mailto:contato@velvet.lat" style="color:#7B2CFF;font-weight:600;">contato@velvet.lat</a>.
              </p>
              <p style="color:#1e1b2e;font-size:15px;line-height:1.7;margin:0;">
                Obrigada pela confiança! 💜<br/>
                <strong>Equipe Velvet</strong>
              </p>
              <hr style="border:none;border-top:1px solid #e5d9ff;margin:32px 0 16px;" />
              <p style="color:#9b87b8;font-size:12px;margin:0;">
                Este é um email automático de confirmação. Não é necessário respondê-lo.
              </p>
            </div>
          `
        });
      } catch (emailConfirmErr) {
        console.warn("Aviso: email de confirmação ao cliente não enviado:", emailConfirmErr.message);
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ocorrencia:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// =============================
// OCORRÊNCIAS DO CLIENTE (listagem)
// =============================
app.get("/api/cliente/ocorrencias", auth, async (req, res) => {
  try {
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1", [req.user.id]
    );
    if (!clienteRes.rowCount) return res.status(404).json({ error: "Cliente não encontrado." });
    const clienteId = clienteRes.rows[0].id;

    const { rows } = await db.query(
      `SELECT id, tipo, subtipo, modelo_nome, descricao, status,
              resposta, resposta_at, anexo_filename, anexo_resposta_filename, criado_em
         FROM logs_ocorrencias
        WHERE cliente_id = $1
        ORDER BY criado_em DESC`,
      [clienteId]
    );
    return res.json(rows);
  } catch (err) {
    console.error("Erro GET /api/cliente/ocorrencias:", err);
    return res.status(500).json({ error: "Erro interno." });
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

app.post("/api/upload", auth, authModelo, uploadLimiter, uploadB2.array("file", 10), async (req, res) => {

    try {

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "Arquivo não enviado" });
      }

      const modeloRes = await db.query(
        `SELECT id, verificada FROM modelos WHERE user_id = $1`,
        [req.user.id]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }

      if (!modeloRes.rows[0].verificada) {
        return res.status(403).json({ error: "Conta não verificada. Apenas modelos verificadas podem fazer upload de mídia." });
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

          // Upload da imagem original
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
          publicUrl = `https://imagedelivery.net/${process.env.CF_ACCOUNT_HASH}/${imageId}/public`;

          // Gera thumbnail 40x40 com sharp e faz upload separado como preview borrado
          try {
            const sharp = require("sharp");
            const thumbBuffer = await sharp(file.buffer)
              .resize(40, 40, { fit: "cover" })
              .jpeg({ quality: 60 })
              .toBuffer();

            const thumbFilename = `thumb_${Date.now()}.jpg`;
            const formThumb = new FormData();
            formThumb.append("file", thumbBuffer, thumbFilename);

            const thumbResponse = await axios.post(
              `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/images/v1`,
              formThumb,
              {
                headers: {
                  Authorization: `Bearer ${process.env.CF_IMAGES_TOKEN}`,
                  ...formThumb.getHeaders()
                }
              }
            );

            if (thumbResponse.data && thumbResponse.data.success) {
              const thumbId = thumbResponse.data.result.id;
              thumbnailUrl = `https://imagedelivery.net/${process.env.CF_ACCOUNT_HASH}/${thumbId}/public`;
            }
          } catch (thumbErr) {
            console.error("Erro ao gerar thumbnail:", thumbErr.message);
            // fallback: sem thumbnail (conteúdo bloqueado não terá preview)
          }
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
    const VALOR_MINIMO = Math.max(18.00, Number((VALOR_BASE * 0.5).toFixed(2)));

    const { nome, limite, dias, desconto } = req.body;

    const limiteNum = Number(limite);
    const diasNum = Number(dias);
    const descontoNum = Number(desconto);

    if (
      !nome ||
      !Number.isFinite(limiteNum) || limiteNum <= 0 ||
      !Number.isFinite(diasNum) || diasNum <= 0 || diasNum > 30 ||
      !Number.isFinite(descontoNum) || descontoNum < 0 || descontoNum > 99
    ) {
      return res.status(400).json({ erro: "Dados inválidos. Prazo máximo: 30 dias." });
    }

    let valorPromocional = Number(
      (VALOR_BASE * (1 - descontoNum / 100)).toFixed(2)
    );

    if (valorPromocional < VALOR_MINIMO) {
      return res.status(400).json({
        erro: `O valor com desconto não pode ser menor que R$ ${VALOR_MINIMO.toFixed(2).replace(".", ",")}.`
      });
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

    const clienteRes = await db.query(
      `
      SELECT id
      FROM clientes
      WHERE id = $1
        AND ativo = true
      LIMIT 1
      `,
      [req.cliente_id]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado ou desativado" });
    }

    await db.query(
      `
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
        ativo,
        criado_em,
        atualizado_em
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,NOW(),NOW()
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
        ativo = true,
        desativado_em = NULL,
        atualizado_em = NOW()
      `,
      [
        req.cliente_id,
        username || null,
        nome_completo || null,
        data_nascimento || null,
        pais || null,
        nome_exibicao || null,
        instagram || null,
        tiktok || null,
        local || null,
        bio || null,
        avatar || null,
        avatar_thumb || null,
        capa || null
      ]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error("Erro salvar dados cliente:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// ===========================
// CADASTRO
// ===========================

// ── POST /api/pre-registro/enviar-codigo ─────────────────────────────────────
app.post("/api/pre-registro/enviar-codigo", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const emailNormalizado = email?.trim().toLowerCase();

    if (!emailNormalizado || !emailValido(emailNormalizado)) {
      return res.status(400).json({ erro: "Email inválido" });
    }

    // Verificar se email já está registrado e ativo
    const check = await db.query(
      "SELECT id FROM users WHERE email = $1 AND ativo IS DISTINCT FROM false",
      [emailNormalizado]
    );
    if (check.rowCount > 0) {
      return res.status(409).json({ erro: "Este email já tem uma conta registada. Faz login." });
    }

    // Rate-limit: não reenviar se último envio foi há menos de 60 s
    const existing = otpPreRegistro.get(emailNormalizado);
    if (existing && existing.enviadoEm && (Date.now() - existing.enviadoEm) < 60_000) {
      return res.status(429).json({ erro: "Aguarda 1 minuto antes de solicitar um novo código." });
    }

    const codigo = Math.floor(100_000 + Math.random() * 900_000).toString();

    otpPreRegistro.set(emailNormalizado, {
      codigo,
      expiresAt:  Date.now() + 15 * 60 * 1_000,
      enviadoEm:  Date.now(),
      tentativas: 0,
      verificado: false,
      preToken:   null
    });

    await enviarEmailOTP(emailNormalizado, codigo);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao enviar OTP:", err);
    return res.status(500).json({ erro: "Erro ao enviar email de verificação. Tenta novamente." });
  }
});

// ── POST /api/pre-registro/verificar-codigo ──────────────────────────────────
app.post("/api/pre-registro/verificar-codigo", authLimiter, async (req, res) => {
  try {
    const { email, codigo } = req.body;
    const emailNormalizado = email?.trim().toLowerCase();

    if (!emailNormalizado || !codigo) {
      return res.status(400).json({ erro: "Email e código são obrigatórios." });
    }

    const entry = otpPreRegistro.get(emailNormalizado);

    if (!entry) {
      return res.status(400).json({ erro: "Nenhum código foi enviado para este email. Solicita um novo." });
    }

    if (Date.now() > entry.expiresAt) {
      otpPreRegistro.delete(emailNormalizado);
      return res.status(400).json({ erro: "Código expirado. Solicita um novo." });
    }

    if (entry.tentativas >= 5) {
      otpPreRegistro.delete(emailNormalizado);
      return res.status(400).json({ erro: "Muitas tentativas incorretas. Solicita um novo código." });
    }

    if (entry.codigo !== codigo.trim()) {
      entry.tentativas++;
      const restantes = 5 - entry.tentativas;
      return res.status(400).json({
        erro: restantes > 0
          ? `Código incorreto. ${restantes} tentativa${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}.`
          : "Código incorreto."
      });
    }

    // OTP válido — gerar pre-token com validade de 30 min para preenchimento do formulário
    const preToken = crypto.randomBytes(24).toString("hex");
    entry.verificado = true;
    entry.preToken   = preToken;
    entry.expiresAt  = Date.now() + 30 * 60 * 1_000;

    return res.json({ ok: true, preToken });
  } catch (err) {
    console.error("Erro ao verificar OTP:", err);
    return res.status(500).json({ erro: "Erro interno. Tenta novamente." });
  }
});
// ──────────────────────────────────────────────────────────────────────────────

app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const {
      email,
      senha,
      role,
      nome_completo,
      data_nascimento,
      genero,
      ageConfirmed,
      preToken,
      ref,
      src,
      fingerprint
    } = req.body;

    const emailNormalizado = email?.trim().toLowerCase();

    if (!emailNormalizado || !senha || !role || !nome_completo || !data_nascimento) {
      return res.status(400).json({
        erro: "Todos os campos obrigatórios devem ser preenchidos"
      });
    }

    if (!emailValido(emailNormalizado)) {
      return res.status(400).json({ erro: "Email inválido" });
    }

    // ── Verificar pré-token OTP ───────────────────────────────────────────────
    if (!preToken) {
      return res.status(400).json({ erro: "Verificação de email obrigatória. Inicia o processo novamente." });
    }
    const otpEntry = otpPreRegistro.get(emailNormalizado);
    if (
      !otpEntry ||
      !otpEntry.verificado ||
      otpEntry.preToken !== preToken ||
      Date.now() > otpEntry.expiresAt
    ) {
      return res.status(400).json({ erro: "Sessão de verificação expirada ou inválida. Inicia o processo novamente." });
    }
    // ──────────────────────────────────────────────────────────────────────────

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

    // ── Verificação de email existente ──────────────────────────────────────
    const emailCheck = await db.query(
      `SELECT id, ativo, motivo_desativacao, autoexcluida_em
       FROM users
       WHERE email = $1`,
      [emailNormalizado]
    );

    if (emailCheck.rowCount > 0) {
      const existing = emailCheck.rows[0];

      // Conta ativa → bloqueado sempre
      if (existing.ativo !== false) {
        return res.status(409).json({ erro: "Email já registrado" });
      }

      // Desativada por admin / bloqueada → bloqueado sempre
      if (existing.motivo_desativacao !== "autoexclusao" || !existing.autoexcluida_em) {
        return res.status(409).json({ erro: "Email já registrado" });
      }

      // Autoexclusão: verificar carência de 30 dias
      const diasDesdeExclusao = Math.floor(
        (Date.now() - new Date(existing.autoexcluida_em).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diasDesdeExclusao < 30) {
        const diasRestantes = 30 - diasDesdeExclusao;
        return res.status(409).json({
          erro: `Conta excluída recentemente. Você poderá criar uma nova conta em ${diasRestantes} dia${diasRestantes > 1 ? "s" : ""}.`
        });
      }

      // 30+ dias após autoexclusão → anonimiza o email antigo e libera o cadastro
      await db.query(
        `UPDATE users SET email = $1 WHERE id = $2`,
        [`deleted_${existing.id}@velvet.lat`, existing.id]
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Verificação de bloqueio de cadastro ──────────────────────────────────
    const ipReq = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    const fpReq = fingerprint || null;

    const bloqueadoRes = await db.query(
      `SELECT 1 FROM clientes_bloqueados_cadastro
       WHERE bloqueado = true
         AND (
           LOWER(email) = LOWER($1)
           OR (LOWER(nome_completo) = LOWER($2) AND data_nascimento = $3)
           OR (bloqueio_ip = true AND ip = $4 AND $4 IS NOT NULL)
           OR (bloqueio_fingerprint = true AND fingerprint = $5 AND $5 IS NOT NULL)
         )
       LIMIT 1`,
      [emailNormalizado, nome_completo, data_nascimento, ipReq, fpReq]
    );

    if (bloqueadoRes.rowCount === 0 && ipReq) {
      const ipBloq = await db.query(
        `SELECT 1 FROM ips_bloqueados
         WHERE ip = $1 AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [ipReq]
      );
      if (ipBloq.rowCount > 0) bloqueadoRes.rowCount = 1;
    }

    if (bloqueadoRes.rowCount === 0 && fpReq) {
      const fpBloq = await db.query(
        `SELECT 1 FROM fingerprint_bloqueados
         WHERE fingerprint = $1 AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [fpReq]
      );
      if (fpBloq.rowCount > 0) bloqueadoRes.rowCount = 1;
    }

    if (bloqueadoRes.rowCount > 0) {
      return res.status(403).json({
        erro: "Identificamos que não cumpre os requisito necessarios para utilizar a plataforma, qualquer dúvida contacte: contato@velvet.lat e leia nossos Termos e Condições de Uso."
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    const hash = await bcrypt.hash(senha, 10);

    const userResult = await db.query(
      `
      INSERT INTO public.users
        (email, password_hash, role, age_confirmed, age_confirmed_at, email_verificado)
      VALUES
        ($1, $2, $3, true, NOW(), TRUE)
      RETURNING id, token_version
      `,
      [emailNormalizado, hash, role]
    );

    const userId = userResult.rows[0].id;
    const tokenVersion = userResult.rows[0].token_version;

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
          (modelo_id, nome_completo, data_nascimento, genero, criado_em, atualizado_em)
        VALUES
          ($1, $2, $3, $4, NOW(), NOW())
        `,
        [modeloId, nome_completo, data_nascimento, genero || null]
      );

      console.log("📩 Tentando enviar email para:", emailNormalizado);
      await enviarEmailBoasVindasModelo(emailNormalizado, nome_completo);
    }

    // CLIENTE
    if (role === "cliente") {

      const clienteResult = await db.query(
        `
        INSERT INTO public.clientes
          (user_id, nome, origem_trafego, ref_modelo, pais)
        VALUES
          ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [
          userId,
          nomePublico,
          src || 'direto',
          ref ? Number(ref) : null,
          'BR'
        ]
      );

      clienteId = clienteResult.rows[0].id;

      await db.query(
        `
        INSERT INTO public.clientes_dados
          (cliente_id, username, nome_completo, data_nascimento, pais, genero, criado_em, atualizado_em)
        VALUES
          ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        `,
        [
          clienteId,
          nomePublico,
          nome_completo,
          data_nascimento,
          'Brasil',
          genero || null
        ]
      );

      console.log("📩 Tentando enviar email de boas-vindas para:", emailNormalizado);
      await enviarEmailBoasVindasCliente(emailNormalizado, nome_completo);
    }

    // ── Email verificado via OTP pré-registo — limpar entrada do mapa ────
    otpPreRegistro.delete(emailNormalizado);
    // ─────────────────────────────────────────────────────────────────────

    // GERAR TOKEN

    const token = jwt.sign(
      {
        id: userId,
        email: emailNormalizado,
        role,
        tv: tokenVersion
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
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
// LOGOUT
// ===========================
app.post("/api/logout", auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE users SET token_version = token_version + 1 WHERE id = $1`,
      [req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro logout:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// ===========================
// FORMULÁRIO CHAT (público)
// ===========================

// Rodar migração na inicialização
db.query(`
  CREATE TABLE IF NOT EXISTS agency_chat_forms (
    id            SERIAL PRIMARY KEY,
    modelo_id     INTEGER NOT NULL UNIQUE,
    agencia_id    INTEGER,
    respostas     JSONB NOT NULL DEFAULT '{}',
    preenchido_em TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )
`).catch(err => console.error("Migração agency_chat_forms:", err.message));

// Buscar form existente (pré-preenchimento)
app.get("/api/chat-form/:modelo_id", async (req, res) => {
  try {
    const modeloId = Number(req.params.modelo_id);
    if (!modeloId) return res.status(400).json({ erro: "modelo_id inválido" });

    const { rows } = await db.query(
      "SELECT respostas, preenchido_em FROM agency_chat_forms WHERE modelo_id=$1",
      [modeloId]
    );

    const modeloRes = await db.query(
      "SELECT nome FROM modelos WHERE id=$1 AND ativo=true",
      [modeloId]
    );
    if (!modeloRes.rowCount) return res.status(404).json({ erro: "Modelo não encontrado" });

    res.json({
      nome_modelo: modeloRes.rows[0].nome,
      respostas: rows[0]?.respostas || null,
      preenchido_em: rows[0]?.preenchido_em || null
    });
  } catch (err) {
    console.error("Erro GET chat-form:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// Salvar/actualizar formulário (sem auth — modelo preenche via link)
app.post("/api/chat-form/salvar", async (req, res) => {
  try {
    const { modelo_id, respostas } = req.body;
    if (!modelo_id || !respostas) return res.status(400).json({ erro: "Dados incompletos" });

    const modeloId = Number(modelo_id);

    const modeloRes = await db.query(
      "SELECT id, agencia_id FROM modelos WHERE id=$1 AND ativo=true",
      [modeloId]
    );
    if (!modeloRes.rowCount) return res.status(404).json({ erro: "Modelo não encontrado" });

    const agenciaId = modeloRes.rows[0].agencia_id;

    await db.query(`
      INSERT INTO agency_chat_forms (modelo_id, agencia_id, respostas, preenchido_em, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (modelo_id) DO UPDATE
        SET respostas     = EXCLUDED.respostas,
            agencia_id    = EXCLUDED.agencia_id,
            preenchido_em = NOW(),
            updated_at    = NOW()
    `, [modeloId, agenciaId, JSON.stringify(respostas)]);

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro POST chat-form:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ===========================
// LOGIN
// ===========================
app.post("/api/agencia/login", authLimiter, async (req, res) => {
  try {
    let { email, senha } = req.body;
    email = email?.trim().toLowerCase();
    senha = senha?.trim();

    if (!email || !senha) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    // Busca direto na tabela agencias — igual ao fluxo do admin
    const agenciaRes = await db.query(
      `SELECT id, nome, email, senha, ativo FROM agencias WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );

    if (!agenciaRes.rowCount) return res.status(401).json({ error: "Agência não encontrada" });

    const agencia = agenciaRes.rows[0];

    if (agencia.ativo === false) return res.status(403).json({ error: "Agência desativada" });

    const senhaOk = await bcrypt.compare(senha, agencia.senha);
    if (!senhaOk) return res.status(401).json({ error: "Senha incorreta" });

    // JWT com id = agencias.id e role = "agencia" — igual ao padrão do admin
    const token = jwt.sign(
      { id: agencia.id, role: "agencia" },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ token, role: "agencia", agencia_id: agencia.id, nome: agencia.nome });
  } catch (err) {
    console.error("ERRO login agência:", err);
    return res.status(500).json({ error: "Erro interno no login" });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  try {
    let { email, senha } = req.body;

    email = email?.trim().toLowerCase();
    senha = senha?.trim();

    if (!email || !senha) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    const result = await db.query(
      `SELECT id, email, password_hash, role, ativo, token_version
       FROM public.users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const user = result.rows[0];

    if (user.ativo === false) {
      return res.status(403).json({ error: "Conta desativada" });
    }

    const senhaOk = await bcrypt.compare(senha, user.password_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    await db.query(`UPDATE users SET updated_at = NOW() WHERE id = $1`, [user.id]);

    const role = String(user.role || "").toLowerCase();

    if (role === "modelo") {
      const modeloRes = await db.query(
        `SELECT id, ativo
         FROM modelos
         WHERE user_id = $1
         LIMIT 1`,
        [user.id]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(400).json({ error: "Modelo não encontrado" });
      }

      if (modeloRes.rows[0].ativo === false) {
        return res.status(403).json({ error: "Conta desativada" });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role, tv: user.token_version },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        token,
        role,
        modelo_id: modeloRes.rows[0].id
      });
    }

    if (role === "cliente") {
      const clienteRes = await db.query(
        `SELECT id, ativo
         FROM clientes
         WHERE user_id = $1
         LIMIT 1`,
        [user.id]
      );

      if (clienteRes.rowCount === 0) {
        return res.status(400).json({ error: "Cliente não encontrado" });
      }

      if (clienteRes.rows[0].ativo === false) {
        return res.status(403).json({ error: "Conta desativada" });
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role, tv: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ token, role });

  } catch (err) {
    console.error("🔥 ERRO LOGIN:", err);
    return res.status(500).json({ error: "Erro interno no login" });
  }
});

// ===========================
// AVATAR
// ===========================

app.post( "/uploadAvatar", auth, uploadAvatarLimiter, uploadB2.single("avatar"), async (req, res) => {

    try {
      if (!req.file) {
        return res.status(400).json({ error: "Arquivo não enviado" });
      }

      const userId = req.user.id;

      const { mimetype, originalname, buffer } = req.file;

      const caminho = `velvet/avatars/${userId}/${Date.now()}-${originalname}`;

      const uploadResult = await s3.upload({
        Bucket: process.env.R2_BUCKET,
        Key: caminho,
        Body: buffer,
        ContentType: mimetype
      }).promise();

      const avatarUrl = `${process.env.R2_PUBLIC_URL}/${caminho}`;

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

app.post( "/uploadCapa", auth, uploadAvatarLimiter, uploadB2.single("capa"),  async (req, res) => {

    try {
      if (!req.file) {
        return res.status(400).json({ error: "Arquivo não enviado" });
      }

      const userId = req.user.id;
      const { mimetype, originalname, buffer } = req.file;

      // 🔥 caminho único (evita cache)
      const caminho = `velvet/capas/${userId}/${Date.now()}-${originalname}`;

      const uploadResult = await s3.upload({
        Bucket: process.env.R2_BUCKET,
        Key: caminho,
        Body: buffer,
        ContentType: mimetype,
        CacheControl: "no-cache"
      }).promise();

      const url = `${process.env.R2_PUBLIC_URL}/${caminho}`;

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

    const modeloRes = await db.query(
      `
      SELECT id
      FROM modelos
      WHERE user_id = $1
        AND ativo = true
      LIMIT 1
      `,
      [userId]
    );

    if (modeloRes.rowCount === 0) {
      return res.status(404).json({ error: "Modelo não encontrado ou desativado" });
    }

    const modelo_id = modeloRes.rows[0].id;

    await db.query(
      `
      INSERT INTO modelos_dados (
        modelo_id,
        nome_exibicao,
        nome_completo,
        data_nascimento,
        telefone,
        endereco,
        pais,
        instagram,
        tiktok,
        ativo,
        criado_em,
        atualizado_em
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW(),NOW()
      )
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
        ativo = true,
        desativado_em = NULL,
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

    await db.query(
      `
      UPDATE modelos
      SET nome_exibicao = $1
      WHERE id = $2
        AND ativo = true
      `,
      [nome_exibicao, modelo_id]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error("Erro salvar dados modelo:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

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

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;

  const userAgent = req.headers["user-agent"] || null;

  const client = await db.connect();

  try {
    const userRes = await client.query(
      `SELECT id, password_hash, ativo
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const usuario = userRes.rows[0];

    if (usuario.ativo === false) {
      return res.status(400).json({ error: "Conta já desativada" });
    }

    const senhaOk = await bcrypt.compare(
      senhaInformada,
      usuario.password_hash
    );

    if (!senhaOk) {
      return res.status(401).json({ error: "Senha inválida" });
    }

    await client.query("BEGIN");

    let modelo_id = null;
    let cliente_id = null;
    let agencia_id = null;
    let detalhes = {
      desativacao_logica: true,
      users: true,
      modelos: false,
      modelos_dados: false,
      clientes: false,
      clientes_dados: false,
      conteudos: false,
      messages_marcadas_deletadas: false,
      vip_subscriptions_encerradas: false
    };

    // ===========================
    // MODELO
    // ===========================
    if (role === "modelo") {
      const modeloRes = await client.query(
        `SELECT id
         FROM modelos
         WHERE user_id = $1`,
        [userId]
      );

      if (modeloRes.rowCount > 0) {
        modelo_id = modeloRes.rows[0].id;

        await client.query(
          `UPDATE messages
           SET deletada = true
           WHERE modelo_id = $1`,
          [modelo_id]
        );

        await client.query(
          `UPDATE vip_subscriptions
           SET ativo = false,
               updated_at = NOW()
           WHERE modelo_id = $1
             AND ativo = true`,
          [modelo_id]
        );

        await client.query(
          `UPDATE conteudos
           SET ativo = false,
               desativado_em = NOW()
           WHERE modelo_id = $1`,
          [modelo_id]
        );

        await client.query(
          `UPDATE modelos_dados
           SET ativo = false,
               desativado_em = NOW()
           WHERE modelo_id = $1`,
          [modelo_id]
        );

        await client.query(
          `UPDATE modelos
           SET ativo = false,
               desativado_em = NOW()
           WHERE id = $1`,
          [modelo_id]
        );

        detalhes.modelos = true;
        detalhes.modelos_dados = true;
        detalhes.conteudos = true;
        detalhes.messages_marcadas_deletadas = true;
        detalhes.vip_subscriptions_encerradas = true;
      }
    }

    // ===========================
    // CLIENTE
    // ===========================
    if (role === "cliente") {
      const clienteRes = await client.query(
        `SELECT id
         FROM clientes
         WHERE user_id = $1`,
        [userId]
      );

      if (clienteRes.rowCount > 0) {
        cliente_id = clienteRes.rows[0].id;

        await client.query(
          `UPDATE messages
           SET deletada = true
           WHERE cliente_id = $1`,
          [cliente_id]
        );

        await client.query(
          `UPDATE vip_subscriptions
           SET ativo = false,
               updated_at = NOW()
           WHERE cliente_id = $1
             AND ativo = true`,
          [cliente_id]
        );

        await client.query(
          `UPDATE clientes_dados
           SET ativo = false,
               desativado_em = NOW()
           WHERE cliente_id = $1`,
          [cliente_id]
        );

        await client.query(
          `UPDATE clientes
           SET ativo = false,
               desativado_em = NOW()
           WHERE id = $1`,
          [cliente_id]
        );

        detalhes.clientes = true;
        detalhes.clientes_dados = true;
        detalhes.messages_marcadas_deletadas = true;
        detalhes.vip_subscriptions_encerradas = true;
      }
    }

    // ===========================
    // AGÊNCIA
    // ===========================
    if (role === "agencia") {
      const agenciaRes = await client.query(
        `SELECT id
         FROM agencias
         WHERE user_id = $1`,
        [userId]
      );

      if (agenciaRes.rowCount > 0) {
        agencia_id = agenciaRes.rows[0].id;

        await client.query(
          `UPDATE agencias
           SET ativo = false,
               desativado_em = NOW()
           WHERE id = $1`,
          [agencia_id]
        );

        detalhes.agencias = true;
      }
    }

    // ===========================
    // USER
    // ===========================
    await client.query(
      `UPDATE users
       SET ativo = false,
           desativado_em = NOW(),
           autoexcluida_em = NOW(),
           motivo_desativacao = $2,
           desativado_por = $3
       WHERE id = $1`,
      [userId, "autoexclusao", "proprio_usuario"]
    );

    // ===========================
    // LOG - CONTA_EXCLUSOES_LOG
    // ===========================
    await client.query(
      `INSERT INTO conta_exclusoes_log
       (
         user_id,
         role,
         modelo_id,
         cliente_id,
         motivo,
         solicitado_em,
         ip,
         user_agent,
         origem,
         detalhes
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)`,
      [
        userId,
        role,
        modelo_id,
        cliente_id,
        "autoexclusao",
        ip,
        userAgent,
        "/api/conta/excluir",
        JSON.stringify(detalhes)
      ]
    );

    // ===========================
    // LOG - ADMIN_SEGURANCA_HISTORICO
    // ===========================
    const motivo = `Autoexclusão de conta - Role: ${role}${modelo_id ? `, Modelo ID: ${modelo_id}` : ''}${cliente_id ? `, Cliente ID: ${cliente_id}` : ''}${agencia_id ? `, Agência ID: ${agencia_id}` : ''}`;

    await client.query(
      `INSERT INTO admin_seguranca_historico (admin_id, motivo, data, user_id, tipo_user, acao)
       VALUES ($1, $2, NOW(), $3, $4, $5)`,
      [
        userId, 
        motivo,
        userId,
        role,
        "autoexclusao"
      ]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      message: "Conta desativada com sucesso"
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ERRO DESATIVAR CONTA:", err);
    return res.status(500).json({ error: "Erro ao desativar conta" });
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
// DELETAR PREMIUM
// ===========================

app.delete("/api/premium/:id", auth, authModelo, async (req, res) => {
  const client = await db.connect();
  try {
    const premiumId = Number(req.params.id);
    const modelo_id = Number(req.modelo_id);

    if (!Number.isInteger(premiumId) || premiumId <= 0) {
      client.release();
      return res.status(400).json({ error: "ID inválido" });
    }

    const premiumRes = await client.query(
      `
      SELECT id, modelo_id
      FROM premium_posts
      WHERE id = $1
        AND ativo = true
      LIMIT 1
      `,
      [premiumId]
    );

    if (!premiumRes.rowCount) {
      client.release();
      return res.status(404).json({ error: "Postagem premium não encontrada" });
    }

    if (Number(premiumRes.rows[0].modelo_id) !== modelo_id) {
      client.release();
      return res.status(403).json({ error: "Sem permissão para excluir esta postagem" });
    }

    await client.query("BEGIN");

    await client.query(
      `UPDATE premium_posts SET ativo = false WHERE id = $1`,
      [premiumId]
    );

    await client.query(
      `UPDATE premium_post_midias SET ativo = false WHERE premium_post_id = $1`,
      [premiumId]
    );

    await client.query("COMMIT");
    client.release();

    return res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    console.error("Erro ao excluir premium:", err);
    return res.status(500).json({ error: "Erro ao excluir premium" });
  }
});

// ===========================
// VIP PIX
// ===========================

app.post("/api/pagamento/vip/pix", authCliente, async (req, res) => {
  console.log("=================================");
  console.log("🔥 NOVO PIX VIP");
  console.log("BODY:", req.body);

  const client = await db.connect();

  try {
    const { modelo_id, aceitou_termos, aceitou_execucao_imediata, aceite_timestamp, versao_termos, fingerprint, cpf, telefone, endereco } = req.body;
    const userId = Number(req.user?.id || 0);
    const cpfVip = String(cpf || "").replace(/\D/g, "") || null;
    const telefoneVip = String(telefone || "").replace(/\D/g, "") || null;

    if (!endereco || !endereco.cep || !endereco.rua || !endereco.cidade || !endereco.estado) {
      return res.status(400).json({ error: "Endereço completo obrigatório para pagamento PIX." });
    }

    console.log("User:", userId);
    console.log("Modelo:", modelo_id);

    if (!aceitou_termos) {
      return res.status(400).json({ error: "É necessário aceitar os termos." });
    }

    if (!aceitou_execucao_imediata) {
  return res.status(400).json({
    error: "É necessário declarar ciência sobre a execução imediata do serviço digital."
  });
}

if (!aceite_timestamp) {
  return res.status(400).json({
    error: "Data de aceite obrigatória."
  });
}

const dataAceite = new Date(aceite_timestamp);
if (Number.isNaN(dataAceite.getTime())) {
  return res.status(400).json({
    error: "Data de aceite inválida."
  });
}

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Usuário inválido." });
    }

    const modeloIdNum = Number(modelo_id);
    if (!Number.isInteger(modeloIdNum) || modeloIdNum <= 0) {
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    console.log("IP:", ip);

    await client.query("BEGIN");

    /* =========================
       CLIENTE + USER
    ========================= */

    console.log("Buscando cliente...");

    const clienteRes = await client.query(
      `
      SELECT
        c.id,
        c.nome,
        c.bloqueado,
        u.email
      FROM clientes c
      LEFT JOIN users u
        ON u.id = c.user_id
      WHERE c.user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    console.log("Cliente encontrado:", clienteRes.rowCount);

    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const {
      id: cliente_id,
      nome,
      bloqueado,
      email
    } = clienteRes.rows[0];

    console.log("cliente_id:", cliente_id);
    console.log("bloqueado:", bloqueado);

    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const riscoVipPix = await client.query(
      `SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`,
      [cliente_id]
    );
    if (riscoVipPix.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
    }

    const nomeFinal = String(nome || "").trim() || "Cliente Velvet";
    const emailFinal = String(email || "").trim();

    if (!emailFinal) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "E-mail do cliente não encontrado." });
    }

    // Log de aceite de termos antes do pagamento VIP PIX
    registrarLog(db, {
      tipo: 'aceite_termos',
      cliente_id,
      modelo_id: modeloIdNum,
      descricao: `Termos aceitos antes de pagamento VIP PIX — modelo_id ${modeloIdNum} — versão ${versao_termos || ''}`,
      ip,
      user_agent: req.headers['user-agent'] || null
    });

    /* =========================
       IMPEDIR ASSINAR O PRÓPRIO PERFIL
    ========================= */

    const donaRes = await client.query(
      `
      SELECT id
      FROM modelos
      WHERE user_id = $1
        AND id = $2
      LIMIT 1
      `,
      [userId, modeloIdNum]
    );

    if (donaRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Não é possível assinar o próprio perfil." });
    }

    /* =========================
       VALIDAR MODELO
    ========================= */

    const modeloRes = await client.query(
      `
      SELECT id
      FROM modelos
      WHERE id = $1
      LIMIT 1
      `,
      [modeloIdNum]
    );

    if (!modeloRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Modelo não encontrada." });
    }

    /* =========================
       BLOQUEAR PIX SE DESABILITADO PARA ESTA MODELO
    ========================= */

    const pixConfigVipRes = await client.query(
      `SELECT pix_vip, pix_vip_primeira_vez FROM modelos_pix_config WHERE modelo_id = $1 LIMIT 1`,
      [modeloIdNum]
    );

    const pixConfig = pixConfigVipRes.rows[0] || {};

    if (pixConfigVipRes.rowCount > 0 && pixConfig.pix_vip === false) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Pagamento via PIX não disponível. Solicite autorização ao suporte." });
    }

    /* =========================
       BLOQUEAR PRIMEIRA ASSINATURA VIP VIA PIX
       PIX só permitido para renovação (cliente já assinou antes),
       para emails em usuarios_confiaveis, ou se a modelo tem pix_vip_primeira_vez = true
    ========================= */

    const vipAnteriorRes = await client.query(
      `SELECT id FROM vip_subscriptions WHERE cliente_id = $1 AND modelo_id = $2 LIMIT 1`,
      [cliente_id, modeloIdNum]
    );

    if (vipAnteriorRes.rowCount === 0 && !pixConfig.pix_vip_primeira_vez) {
      const confiavelRes = await client.query(
        `SELECT 1 FROM usuarios_confiaveis WHERE email = $1 LIMIT 1`,
        [emailFinal.toLowerCase()]
      );

      if (confiavelRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          error: "PIX disponível apenas para renovação VIP. Para a primeira assinatura, utilize cartão de crédito, ou peça autorização para cobrança via PIX ao suporte.",
          primeiro_vip: true
        });
      }
    }

    /* =========================
       PLANO VIP
    ========================= */

    console.log("Buscando plano VIP...");

    const planoRes = await client.query(
      `
      SELECT valor_mensal
      FROM modelos_planos
      WHERE modelo_id = $1
      LIMIT 1
      `,
      [modeloIdNum]
    );

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

    const ofertaRes = await client.query(
      `
      SELECT valor_promocional
      FROM ofertas
      WHERE modelo_id = $1
        AND ativa = true
        AND (data_inicio IS NULL OR data_inicio <= NOW())
        AND (data_fim IS NULL OR data_fim >= NOW())
      LIMIT 1
      `,
      [modeloIdNum]
    );

    if (ofertaRes.rowCount) {
      valorBase = Number(ofertaRes.rows[0].valor_promocional) || valorBase;
      console.log("Oferta aplicada:", valorBase);
    }

    if (!valorBase || valorBase <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor inválido" });
    }

    /* =========================
       CÁLCULO
    ========================= */

    const valorAssinatura = Number(valorBase.toFixed(2));
    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(valorAssinatura);
    const amount = Math.round(valorTotal * 100);

    console.log("VALORES:");
    console.log("base:", valorAssinatura);
    console.log("centavos:", amount);

    /* =========================
       CRIAR PIX IPAG
    ========================= */

    console.log("Criando pagamento PIX VIP no iPag...");

    const ipagResVip = await criarPixIpag({
      valorTotal: valorTotal,
      nome:       nomeFinal,
      email:      emailFinal,
      cpf:        cpfVip      || "",
      telefone:   telefoneVip || "",
      endereco,
      referencia: `vip_${cliente_id}_${modeloIdNum}_${Date.now()}`
    });

    const ipagId    = String(ipagResVip?.id || "");
    const pixKey    = ipagResVip?.attributes?.pix?.qrcode   || null; // código EMV copia-e-cola
    const brCodeB64 = ipagResVip?.attributes?.pix?.qrcode64 || null;
    const brCode    = ipagResVip?.attributes?.pix?.link     || null; // link da página de pagamento
    const expiresAt = ipagResVip?.attributes?.pix?.expires_at || null;

    if (!ipagId || !pixKey) {
      console.error("PIX iPag não gerado:", ipagResVip);
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "Erro ao gerar QR PIX" });
    }

    await salvarEnderecoClientePix(client, { cliente_id, telefone: telefoneVip, endereco });

    /* =========================
       REGISTRAR PIX
    ========================= */

    console.log("Registrando pagamento no banco...");

    await client.query(
      `
      INSERT INTO pagamentos_pix
      (
        cliente_id,
        modelo_id,
        valor,
        status,
        gateway,
        pagarme_order_id,
        qr_code,
        copia_cola,
        criado_em,
        aceite_ip,
        aceitou_termos,
        aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos,
        fingerprint,
        cpf,
        telefone
      )
      VALUES ($1,$2,$3,'pendente','ipag',$4,$5,$6,NOW(),$7,$8,$9,$10,$11,$12,$13,$14)
      `,
      [
        cliente_id,
        modeloIdNum,
        valorTotal,
        ipagId,
        brCode,
        pixKey,
        ip,
        !!aceitou_termos,
        !!aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos || "2026-06-07",
        fingerprint || "",
        cpfVip || null,
        telefoneVip || null
      ]
    );

    console.log("Pagamento registrado");

    await client.query("COMMIT");

    console.log("COMMIT realizado");
    console.log("PIX criado com sucesso");

    return res.json({
      qr_code_url:    brCode,
      qr_code_base64: brCodeB64 ? (brCodeB64.startsWith("data:") ? brCodeB64 : `data:image/png;base64,${brCodeB64}`) : null,
      copia_cola:     pixKey,
      expires_at:     expiresAt,
      order_id:       ipagId
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

    return res.status(500).json({ error: "Erro ao gerar pagamento PIX" });
  } finally {
    client.release();
    console.log("Conexão DB liberada");
  }
});

// ===========================
// MIDIA PIX
// ===========================

app.post("/api/pagamento/midia/pix", authCliente, async (req, res) => {

  const client = await db.connect();

  try {

   const { conteudo_id, cpf, telefone, endereco, aceitou_termos, aceitou_execucao_imediata, aceite_timestamp, versao_termos, fingerprint } = req.body;
    const userId = req.user.id;

    if (!endereco || !endereco.cep || !endereco.rua || !endereco.cidade || !endereco.estado) {
      return res.status(400).json({ error: "Endereço completo obrigatório para pagamento PIX." });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    if (!conteudo_id) {
      return res.status(400).json({ error: "Conteúdo inválido." });
    }

    if (!aceitou_termos) {
  return res.status(400).json({
    error: "É necessário aceitar os termos."
  });
}

if (!aceitou_execucao_imediata) {
  return res.status(400).json({
    error: "É necessário declarar ciência sobre a execução imediata do conteúdo digital."
  });
}

if (!aceite_timestamp) {
  return res.status(400).json({
    error: "Data de aceite obrigatória."
  });
}

const dataAceite = new Date(aceite_timestamp);
if (Number.isNaN(dataAceite.getTime())) {
  return res.status(400).json({
    error: "Data de aceite inválida."
  });
}

    /* ================================
       CLIENTE
    ================================ */

    const clienteRes = await client.query(
      `SELECT c.id, c.nome, c.bloqueado, u.email
       FROM clientes c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const { id: cliente_id, nome: nomeDB, bloqueado, email: emailDB } = clienteRes.rows[0];

    if (bloqueado) {
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const riscoMidiaPix = await client.query(
      `SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`,
      [cliente_id]
    );
    if (riscoMidiaPix.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
    }

    // Log de aceite de termos antes do pagamento mídia PIX
    registrarLog(db, {
      tipo: 'aceite_termos',
      cliente_id,
      modelo_id: null,
      descricao: `Termos aceitos antes de pagamento Mídia PIX — conteudo_id ${conteudo_id} — versão ${versao_termos || ''}`,
      ip,
      user_agent: req.headers['user-agent'] || null
    });

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

    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(precoNum);
    const valorCentavos = Math.round(valorTotal * 100);

    /* ================================
       BLOQUEAR PIX SE DESABILITADO PARA ESTA MODELO
    ================================ */

    const pixConfigChatRes = await client.query(
      `SELECT pix_chat FROM modelos_pix_config WHERE modelo_id = $1 LIMIT 1`,
      [modelo_id]
    );

    if (pixConfigChatRes.rowCount > 0 && pixConfigChatRes.rows[0].pix_chat === false) {
      return res.status(403).json({ error: "Pagamento via PIX não disponível para esta modelo." });
    }

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
      SELECT pagarme_order_id, qr_code, copia_cola
      FROM pagamentos_pix
      WHERE cliente_id = $1
      AND message_id = $2
      AND gateway = 'ipag'
      AND status = 'pendente'
      AND expires_at > NOW()
      ORDER BY criado_em DESC
      LIMIT 1
      `,
      [cliente_id, conteudo_id]
    );

    if (pixExistente.rowCount > 0 && pixExistente.rows[0].qr_code) {
      await client.query("ROLLBACK");
      return res.json({
        qr_code_url:    pixExistente.rows[0].qr_code,
        qr_code_base64: null,
        copia_cola:     pixExistente.rows[0].copia_cola,
        payment_id:     pixExistente.rows[0].pagarme_order_id,
        reutilizado:    true
      });
    }

    /* ================================
       CRIAR PIX IPAG
    ================================ */

    console.log("Criando pagamento PIX Mídia no iPag...");

    const nomeCliente  = String(nomeDB || "").trim() || "Cliente Velvet";
    const emailCliente = String(emailDB || "").trim();

    if (!emailCliente) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "E-mail do cliente não encontrado." });
    }

    const ipagResMidia = await criarPixIpag({
      valorTotal: valorTotal,
      nome:       nomeCliente,
      email:      emailCliente,
      cpf:        String(cpf || "").replace(/\D/g, ""),
      telefone:   String(telefone || "").replace(/\D/g, ""),
      endereco,
      referencia: `midia_${cliente_id}_${conteudo_id}_${Date.now()}`
    });

    const ipagIdMidia    = String(ipagResMidia?.id || "");
    const pixKeyMidia    = ipagResMidia?.attributes?.pix?.qrcode   || null; // código EMV copia-e-cola
    const brCodeB64Midia = ipagResMidia?.attributes?.pix?.qrcode64 || null;
    const brCodeMidia    = ipagResMidia?.attributes?.pix?.link     || null; // link da página de pagamento

    if (!ipagIdMidia || !pixKeyMidia) {
      throw new Error("Erro ao gerar PIX no iPag");
    }

    await salvarEnderecoClientePix(client, {
      cliente_id,
      telefone: String(telefone || "").replace(/\D/g, ""),
      endereco
    });

    /* ================================
       SALVAR PIX
    ================================ */

await client.query(
  `
  INSERT INTO pagamentos_pix
  (
    cliente_id,
    modelo_id,
    message_id,
    qr_code,
    copia_cola,
    valor,
    status,
    gateway,
    pagarme_order_id,
    criado_em,
    expires_at,
    aceite_ip,
    aceitou_termos,
    aceitou_execucao_imediata,
    aceite_timestamp,
    versao_termos,
    fingerprint,
    cpf,
    telefone
  )
  VALUES (
    $1,$2,$3,$4,$5,$6,'pendente','ipag',$7,NOW(),NOW() + INTERVAL '60 minutes',
    $8,$9,$10,$11,$12,$13,$14,$15
  )
  `,
  [
    cliente_id,
    modelo_id,
    conteudo_id,
    brCodeMidia,
    pixKeyMidia,
    valorTotal,
    ipagIdMidia,
    ip || null,
    !!aceitou_termos,
    !!aceitou_execucao_imediata,
    aceite_timestamp,
    versao_termos || "2026-06-07",
    fingerprint || "",
    String(cpf || "").replace(/\D/g, ""),
    String(telefone || "").replace(/\D/g, "")
  ]
);

    await client.query("COMMIT");

    return res.json({
      qr_code_url:    brCodeMidia,
      qr_code_base64: brCodeB64Midia ? (brCodeB64Midia.startsWith("data:") ? brCodeB64Midia : `data:image/png;base64,${brCodeB64Midia}`) : null,
      copia_cola:     pixKeyMidia,
      payment_id:     ipagIdMidia
    });

  } catch (err) {

    console.error("Erro gerar PIX:", err);

    try { await client.query("ROLLBACK"); } catch {}

    return res.status(500).json({ error: "Erro ao gerar pagamento PIX" });

  } finally {

    client.release();

  }

});

// ===========================
// PREMIUM PIX
// ===========================

app.post("/api/pagamento/premium/pix", authCliente, async (req, res) => {
  console.log("=================================");
  console.log("🔥 NOVO PIX PREMIUM");
  console.log("BODY:", req.body);

  const client = await db.connect();

  try {
const {
  premium_post_id,
  aceitou_termos,
  aceitou_execucao_imediata,
  aceite_timestamp,
  versao_termos,
  fingerprint,
  cpf,
  telefone,
  endereco
} = req.body;

    const userId = Number(req.user?.id || 0);
    const cpfPremium = String(cpf || "").replace(/\D/g, "") || null;
    const telefonePremium = String(telefone || "").replace(/\D/g, "") || null;

    if (!endereco || !endereco.cep || !endereco.rua || !endereco.cidade || !endereco.estado) {
      return res.status(400).json({ error: "Endereço completo obrigatório para pagamento PIX." });
    }

    console.log("User:", userId);
    console.log("Premium post:", premium_post_id);

    if (!aceitou_termos) {
      return res.status(400).json({ error: "É necessário aceitar os termos." });
    }

    if (!aceitou_execucao_imediata) {
  return res.status(400).json({
    error: "É necessário declarar ciência sobre a execução imediata do conteúdo digital."
  });
}

if (!aceite_timestamp) {
  return res.status(400).json({
    error: "Data de aceite obrigatória."
  });
}

const dataAceite = new Date(aceite_timestamp);
if (Number.isNaN(dataAceite.getTime())) {
  return res.status(400).json({
    error: "Data de aceite inválida."
  });
}

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Usuário inválido." });
    }

    const premiumPostIdNum = Number(premium_post_id);
    if (!Number.isInteger(premiumPostIdNum) || premiumPostIdNum <= 0) {
      return res.status(400).json({ error: "premium_post_id inválido." });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    console.log("IP:", ip);

    await client.query("BEGIN");

    /* =========================
       CLIENTE + USER
    ========================= */

    console.log("Buscando cliente...");

    const clienteRes = await client.query(
      `
      SELECT
        c.id,
        c.nome,
        c.bloqueado,
        u.email
      FROM clientes c
      LEFT JOIN users u
        ON u.id = c.user_id
      WHERE c.user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    console.log("Cliente encontrado:", clienteRes.rowCount);

    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const {
      id: cliente_id,
      nome,
      bloqueado,
      email
    } = clienteRes.rows[0];

    console.log("cliente_id:", cliente_id);
    console.log("bloqueado:", bloqueado);

    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const riscoPremiumPix = await client.query(
      `SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`,
      [cliente_id]
    );
    if (riscoPremiumPix.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
    }

    const nomeFinal = String(nome || "").trim() || "Cliente Velvet";
    const emailFinal = String(email || "").trim();

    if (!emailFinal) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "E-mail do cliente não encontrado." });
    }

    // Log de aceite de termos antes do pagamento premium PIX
    registrarLog(db, {
      tipo: 'aceite_termos',
      cliente_id,
      modelo_id: null,
      descricao: `Termos aceitos antes de pagamento Premium PIX — premium_post_id ${premiumPostIdNum} — versão ${versao_termos || ''}`,
      ip,
      user_agent: req.headers['user-agent'] || null
    });

    /* =========================
       BUSCAR PREMIUM
    ========================= */

    console.log("Buscando premium post...");

    const premiumRes = await client.query(
      `
      SELECT
        pp.id,
        pp.modelo_id,
        pp.preco,
        pp.descricao,
        pp.ativo
      FROM premium_posts pp
      WHERE pp.id = $1
      LIMIT 1
      `,
      [premiumPostIdNum]
    );

    console.log("Premium encontrado:", premiumRes.rowCount);

    if (!premiumRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Premium não encontrado." });
    }

    const premium = premiumRes.rows[0];
    const modeloIdNum = Number(premium.modelo_id);
    const precoBase = Number(premium.preco || 0);

    console.log("modelo_id:", modeloIdNum);
    console.log("precoBase:", precoBase);
    console.log("ativo:", premium.ativo);

    if (!premium.ativo) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Premium indisponível." });
    }

    if (!Number.isInteger(modeloIdNum) || modeloIdNum <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Modelo inválida para este premium." });
    }

    if (!precoBase || precoBase <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Premium sem preço válido." });
    }

    /* =========================
       IMPEDIR COMPRAR O PRÓPRIO PREMIUM
    ========================= */

    const donaRes = await client.query(
      `
      SELECT id
      FROM modelos
      WHERE user_id = $1
        AND id = $2
      LIMIT 1
      `,
      [userId, modeloIdNum]
    );

    if (donaRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Não é possível comprar o próprio premium." });
    }

    /* =========================
       VALIDAR MODELO
    ========================= */

    const modeloRes = await client.query(
      `
      SELECT id
      FROM modelos
      WHERE id = $1
      LIMIT 1
      `,
      [modeloIdNum]
    );

    if (!modeloRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Modelo não encontrada." });
    }

    /* =========================
       BLOQUEAR PIX SE DESABILITADO PARA ESTA MODELO
    ========================= */

    const pixConfigPremiumRes = await client.query(
      `SELECT pix_premium FROM modelos_pix_config WHERE modelo_id = $1 LIMIT 1`,
      [modeloIdNum]
    );

    if (pixConfigPremiumRes.rowCount > 0 && pixConfigPremiumRes.rows[0].pix_premium === false) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Pagamento via PIX não disponível para esta modelo." });
    }

    /* =========================
       EXIGIR VIP ATIVO
    ========================= */

    console.log("Validando VIP ativo...");

    const vipRes = await client.query(
      `
      SELECT 1
      FROM vip_subscriptions
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND ativo = true
        AND expiration_at > NOW()
      LIMIT 1
      `,
      [cliente_id, modeloIdNum]
    );

    console.log("VIP ativo:", vipRes.rowCount);

    if (!vipRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "Apenas clientes VIP podem comprar conteúdos premium."
      });
    }

    /* =========================
       IMPEDIR DUPLICIDADE PAGA
    ========================= */

    console.log("Verificando se já foi comprado...");

    const pagoRes = await client.query(
      `
      SELECT 1
      FROM premium_unlocks
      WHERE premium_post_id = $1
        AND cliente_id = $2
        AND status = 'pago'
      LIMIT 1
      `,
      [premiumPostIdNum, cliente_id]
    );

    if (pagoRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Conteúdo premium já adquirido."
      });
    }

    /* =========================
       EXPIRAR PENDENTES ANTIGOS
    ========================= */

    console.log("Expirando pendentes antigos...");

    await client.query(
      `
      UPDATE premium_unlocks
      SET status = 'expirado',
          updated_at = NOW()
      WHERE premium_post_id = $1
        AND cliente_id = $2
        AND status = 'pendente'
        AND metodo_pagamento = 'pix'
        AND created_at < NOW() - INTERVAL '55 minutes'
      `,
      [premiumPostIdNum, cliente_id]
    );

    /* =========================
       REUTILIZAR PIX PENDENTE RECENTE
    ========================= */

    /* =========================
       CÁLCULO
    ========================= */

    const valorBase = Number(precoBase.toFixed(2));
    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(valorBase);
    const amount = Math.round(valorTotal * 100);

    console.log("VALORES:");
    console.log("base:", valorBase);
    console.log("centavos:", amount);

    /* =========================
       CRIAR PIX IPAG
    ========================= */

    console.log("Criando pagamento PIX Premium no iPag...");

    const ipagResPremium = await criarPixIpag({
      valorTotal: valorTotal,
      nome:       nomeFinal,
      email:      emailFinal,
      cpf:        cpfPremium      || "",
      telefone:   telefonePremium || "",
      endereco,
      referencia: `premium_${cliente_id}_${premiumPostIdNum}_${Date.now()}`
    });

    const ipagIdPremium    = String(ipagResPremium?.id || "");
    const pixKeyPremium    = ipagResPremium?.attributes?.pix?.qrcode   || null; // código EMV copia-e-cola
    const brCodeB64Premium = ipagResPremium?.attributes?.pix?.qrcode64 || null;
    const brCodePremium    = ipagResPremium?.attributes?.pix?.link     || null; // link da página de pagamento
    const expiresAtPremium = ipagResPremium?.attributes?.pix?.expires_at || null;

    if (!ipagIdPremium || !pixKeyPremium) {
      console.error("PIX iPag não gerado:", ipagResPremium);
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "Erro ao gerar QR PIX" });
    }

    await salvarEnderecoClientePix(client, {
      cliente_id,
      telefone: telefonePremium,
      endereco
    });

    /* =========================
       REGISTRAR / UPSERT PREMIUM_UNLOCKS
    ========================= */

    console.log("Registrando premium_unlock pendente no banco...");

await client.query(
  `
  INSERT INTO premium_unlocks
  (
    premium_post_id,
    cliente_id,
    modelo_id,
    status,
    metodo_pagamento,
    valor_base,
    taxa_transacao,
    taxa_plataforma,
    valor_total,
    gateway,
    pagarme_order_id,
    qr_code_url,
    copia_cola,
    pacote_ref,
    aceite_ip,
    aceitou_termos,
    aceitou_execucao_imediata,
    aceite_timestamp,
    versao_termos,
    fingerprint,
    cpf,
    telefone,
    created_at,
    updated_at
  )
  VALUES
  (
    $1,$2,$3,
    'pendente','pix',
    $4,$5,$6,$7,
    'ipag',$8,$9,$10,$11,
    $12,$13,$14,$15,$16,$17,$18,$19,
    NOW(),NOW()
  )
  ON CONFLICT (premium_post_id, cliente_id)
  DO UPDATE SET
    modelo_id = EXCLUDED.modelo_id,
    status = 'pendente',
    metodo_pagamento = 'pix',
    valor_base = EXCLUDED.valor_base,
    taxa_transacao = EXCLUDED.taxa_transacao,
    taxa_plataforma = EXCLUDED.taxa_plataforma,
    valor_total = EXCLUDED.valor_total,
    gateway = EXCLUDED.gateway,
    pagarme_order_id = EXCLUDED.pagarme_order_id,
    qr_code_url = EXCLUDED.qr_code_url,
    copia_cola = EXCLUDED.copia_cola,
    pacote_ref = EXCLUDED.pacote_ref,
    aceite_ip = EXCLUDED.aceite_ip,
    aceitou_termos = EXCLUDED.aceitou_termos,
    aceitou_execucao_imediata = EXCLUDED.aceitou_execucao_imediata,
    aceite_timestamp = EXCLUDED.aceite_timestamp,
    versao_termos = EXCLUDED.versao_termos,
    fingerprint = EXCLUDED.fingerprint,
    cpf = EXCLUDED.cpf,
    telefone = EXCLUDED.telefone,
    updated_at = NOW()
  `,
  [
    premiumPostIdNum,
    cliente_id,
    modeloIdNum,
    valorBase,
    taxaTransacao,
    taxaPlataforma,
    valorTotal,
    ipagIdPremium,
    brCodePremium,
    pixKeyPremium,
    `premium_${premiumPostIdNum}_${cliente_id}`,
    ip || null,
    !!aceitou_termos,
    !!aceitou_execucao_imediata,
    aceite_timestamp,
    versao_termos || "2026-06-07",
    fingerprint || "",
    cpfPremium,
    telefonePremium
  ]
);

    console.log("Premium unlock registrado");

    await client.query("COMMIT");

    console.log("COMMIT realizado");
    console.log("PIX premium criado com sucesso");

    return res.json({
      qr_code_url:    brCodePremium,
      qr_code_base64: brCodeB64Premium ? (brCodeB64Premium.startsWith("data:") ? brCodeB64Premium : `data:image/png;base64,${brCodeB64Premium}`) : null,
      copia_cola:     pixKeyPremium,
      expires_at:     expiresAtPremium,
      order_id:       ipagIdPremium,
      reutilizado:    false
    });
  } catch (err) {
    console.log("=================================");
    console.error("🔥 ERRO PIX PREMIUM");
    console.error("message:", err.message);
    console.error("stack:", err.stack);
    console.error("code:", err.code);
    console.error("detail:", err.detail);
    console.error("constraint:", err.constraint);
    console.error("table:", err.table);
    console.error("column:", err.column);

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

    return res.status(500).json({ error: "Erro ao gerar pagamento premium PIX" });
  } finally {
    client.release();
    console.log("Conexão DB liberada");
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
      aceitou_termos,
      aceitou_execucao_imediata,
      aceite_timestamp,
      versao_termos,
      fingerprint,
      paymentMethodId,
      cpf,
      telefone,
      nome_cartao,
      endereco
    } = req.body || {};

    const cpfVip = String(cpf || "").replace(/\D/g, "") || null;
    const telefoneVip = String(telefone || "").replace(/\D/g, "") || null;
    const nomeCartaoVip = String(nome_cartao || "").trim() || null;

    const userId = Number(req.user?.id || 0);

    /* =====================================================
       VALIDAÇÕES INICIAIS
    ===================================================== */
    if (!Number.isInteger(userId) || userId <= 0) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Usuário inválido." });
    }

    const modeloIdNum = Number(modelo_id);
    if (!Number.isInteger(modeloIdNum) || modeloIdNum <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "modelo_id inválido" });
    }

    if (!fingerprint) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Fingerprint obrigatório." });
    }

    if (!aceitou_termos) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Você precisa aceitar os termos." });
    }

    if (!aceitou_execucao_imediata) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Você precisa declarar ciência sobre a execução imediata do serviço digital."
      });
    }

    if (!aceite_timestamp) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Data de aceite obrigatória." });
    }

    const dataAceite = new Date(aceite_timestamp);
    if (Number.isNaN(dataAceite.getTime())) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Data de aceite inválida." });
    }

    if (!paymentMethodId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "paymentMethodId obrigatório." });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    const currency = req.body.currency === "usd" ? "usd" : "brl";

    /* =====================================================
       BLOQUEIOS
    ===================================================== */
    const ipBloqueado = await client.query(
      `SELECT 1 FROM ips_bloqueados WHERE ip = $1 LIMIT 1`,
      [ip]
    );

    if (ipBloqueado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta temporariamente bloqueada para transações." });
    }

    /* =====================================================
       CLIENTE
    ===================================================== */
    const clienteRes = await client.query(
      `
      SELECT
        c.id,
        c.nome,
        c.bloqueado,
        u.email
      FROM clientes c
      JOIN users u
        ON u.id = c.user_id
      WHERE c.user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    cliente_id = Number(clienteRes.rows[0].id);

    const nomeCliente =
      String(clienteRes.rows[0].nome || "").trim() || "Cliente Velvet";
    const emailCliente = String(clienteRes.rows[0].email || "")
      .trim()
      .toLowerCase();

    if (clienteRes.rows[0].bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const riscoVipCartao = await client.query(
      `SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`,
      [cliente_id]
    );
    if (riscoVipCartao.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
    }

    if (!emailCliente || !emailCliente.includes("@")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "E-mail do cliente inválido." });
    }

    // Validação de titularidade: o nome no cartão deve corresponder ao titular cadastrado
    if (nomeCartaoVip) {
      const dadosRes = await client.query(
        `SELECT nome_completo FROM clientes_dados WHERE cliente_id = $1 LIMIT 1`,
        [cliente_id]
      );
      const nomeCompletoCadastro = dadosRes.rows[0]?.nome_completo;

      if (nomeCompletoCadastro && !nomesCorrespondem(nomeCompletoCadastro, nomeCartaoVip)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "O nome informado no cartão não corresponde ao titular cadastrado. Pagamentos só podem ser feitos com cartão em nome do titular da conta."
        });
      }
    }

    if (endereco) {
      await salvarEnderecoClientePix(client, { cliente_id, telefone: telefoneVip, endereco });
    }

    // Log de aceite de termos antes do pagamento VIP cartão
    registrarLog(db, {
      tipo: 'aceite_termos',
      cliente_id,
      modelo_id: modeloIdNum,
      descricao: `Termos aceitos antes de pagamento VIP cartão — versão ${versao_termos || ''}`,
      ip,
      user_agent: req.headers['user-agent'] || null
    });

    /* =====================================================
       IMPEDIR ASSINAR O PRÓPRIO PERFIL
    ===================================================== */
    const donaRes = await client.query(
      `
      SELECT id
      FROM modelos
      WHERE user_id = $1
        AND id = $2
      LIMIT 1
      `,
      [userId, modeloIdNum]
    );

    if (donaRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Não é possível assinar o próprio perfil."
      });
    }

    /* =====================================================
       VALIDAR MODELO
    ===================================================== */
    const modeloRes = await client.query(
      `
      SELECT id
      FROM modelos
      WHERE id = $1
      LIMIT 1
      `,
      [modeloIdNum]
    );

    if (!modeloRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Modelo não encontrada." });
    }

    /* =====================================================
       ATUALIZAR CLIENTE
    ===================================================== */
    await client.query(
      `UPDATE clientes SET ultimo_ip = $1 WHERE id = $2`,
      [ip, cliente_id]
    );

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

    let valorBasePlano = Number(planoRes.rows[0].valor_mensal) || 0;

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

    let valorAssinatura = valorBasePlano;
    let oferta_id = null;

    if (ofertaRes.rowCount) {
      oferta_id = ofertaRes.rows[0].id;

      if (ofertaRes.rows[0].valor_promocional) {
        valorAssinatura = Number(ofertaRes.rows[0].valor_promocional);
      } else if (ofertaRes.rows[0].desconto_percentual) {
        const desconto = Number(ofertaRes.rows[0].desconto_percentual);
        valorAssinatura = valorBasePlano - (valorBasePlano * desconto / 100);
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
    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(valorAssinatura);

    /* =====================================================
       CRIAR PAGAMENTO STRIPE
    ===================================================== */
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(valorTotal * 100),
      currency: "brl",
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: "Assinatura VIP Velvet",
      receipt_email: emailCliente,
      metadata: {
        tipo: "vip",
        cliente_id: String(cliente_id),
        modelo_id: String(modeloIdNum),
        valor_assinatura: String(valorAssinatura),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma),
        oferta_id: oferta_id ? String(oferta_id) : ""
      },
      expand: ["payment_method"]
    });

    const paymentIntentId = paymentIntent.id;
    const statusLocal = paymentIntent.status === "succeeded" ? "pago" : "pendente";

    const cartaoInfo = paymentIntent.payment_method?.card || null;
    const cardBrand = cartaoInfo?.brand || null;
    const cardLast4 = cartaoInfo?.last4 || null;
    const cardExpMonth = cartaoInfo?.exp_month || null;
    const cardExpYear = cartaoInfo?.exp_year || null;

    /* =====================================================
       REGISTRAR PAGAMENTO LOCAL
    ===================================================== */
    await client.query(
      `
      INSERT INTO pagamentos_cartao
      (
        cliente_id,
        modelo_id,
        gateway,
        gateway_payment_id,
        stripe_payment_intent_id,
        valor,
        tipo,
        currency,
        status,
        aceite_ip,
        aceitou_termos,
        aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos,
        fingerprint,
        valor_brl,
        taxa_cambio,
        cpf,
        telefone,
        nome_cartao,
        card_brand,
        card_last4,
        card_exp_month,
        card_exp_year,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, 'stripe', $3, $4, $5, $6, 'brl', $7,
        $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22,
        NOW(), NOW()
      )
      `,
      [
        cliente_id,
        modeloIdNum,
        paymentIntentId,
        paymentIntentId,
        valorTotal,
        "vip",
        statusLocal,
        ip,
        !!aceitou_termos,
        !!aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos || "2026-06-07",
        fingerprint || null,
        valorAssinatura,
        null,
        cpfVip || null,
        telefoneVip || null,
        nomeCartaoVip || null,
        cardBrand,
        cardLast4,
        cardExpMonth,
        cardExpYear
      ]
    );

    if (statusLocal === "pago") {
      const calcularValores =
        req.app.get("calcularValores") ||
        (async ({ valor_bruto }) => ({
          valor_modelo: valor_bruto * 0.7,
          agency_fee: valor_bruto * 0.1,
          velvet_fee: valor_bruto * 0.05
        }));

      const taxaGateway = Number((valorAssinatura * 0.15).toFixed(2));
      const valores = await calcularValores({
        modelo_id: modeloIdNum,
        valor_bruto: valorAssinatura,
        taxa_gateway: taxaGateway
      });

      const vipExistente = await client.query(
        `SELECT id, ativo, expiration_at FROM vip_subscriptions
         WHERE cliente_id = $1 AND modelo_id = $2 LIMIT 1 FOR UPDATE`,
        [cliente_id, modeloIdNum]
      );
      const primeiraAssinatura = vipExistente.rowCount === 0;

      let novaExpiracao;
      if (
        vipExistente.rowCount > 0 &&
        vipExistente.rows[0].expiration_at &&
        new Date(vipExistente.rows[0].expiration_at) > new Date()
      ) {
        novaExpiracao = new Date(vipExistente.rows[0].expiration_at);
        novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
      } else {
        novaExpiracao = new Date();
        novaExpiracao.setMonth(novaExpiracao.getMonth() + 1);
      }

      if (vipExistente.rowCount > 0) {
        await client.query(
          `UPDATE vip_subscriptions
           SET ativo = true, updated_at = NOW(), expiration_at = $3,
               valor_assinatura = $4, taxa_transacao = $5, taxa_plataforma = 0,
               valor_total = $6, recorrente = false, gateway_subscription_id = $7,
               aviso_7_dias_enviado = false, aviso_24h_enviado = false
           WHERE cliente_id = $1 AND modelo_id = $2`,
          [cliente_id, modeloIdNum, novaExpiracao, valorAssinatura, taxaGateway, valorTotal, paymentIntentId]
        );
      } else {
        await client.query(
          `INSERT INTO vip_subscriptions
             (cliente_id, modelo_id, ativo, created_at, updated_at, expiration_at,
              valor_assinatura, taxa_transacao, taxa_plataforma, valor_total,
              recorrente, gateway_subscription_id)
           VALUES ($1,$2,true,NOW(),NOW(),$3,$4,$5,0,$6,false,$7)`,
          [cliente_id, modeloIdNum, novaExpiracao, valorAssinatura, taxaGateway, valorTotal, paymentIntentId]
        );
      }

      await client.query(
        `INSERT INTO transacoes_agency
           (modelo_id, cliente_id, tipo, valor_bruto, valor_modelo, agency_fee,
            velvet_fee, taxa_gateway, status, created_at, gateway, disponivel_em, stripe_payment_intent_id)
         VALUES ($1,$2,'assinatura',$3,$4,$5,$6,$7,'pago',NOW(),'stripe',NULL,$8)`,
        [modeloIdNum, cliente_id, valorAssinatura,
         Number(valores.valor_modelo || 0),
         Number(valores.agency_fee || 0),
         Number(valores.velvet_fee || 0),
         taxaGateway,
         paymentIntentId]
      );

      if (primeiraAssinatura) {
        const _boasVindas12334 = modeloIdNum === 859
          ? "¡Hola!! Bienvenido(a), cuál es tu nombre?🥰"
          : "Oii!! Bem vindo(a), qual seu nome?🥰";
        await client.query(
          `INSERT INTO messages
             (cliente_id, modelo_id, text, sender, tipo, created_at, lida, visto, deletada)
           VALUES ($1,$2,$3,'modelo','texto',NOW(),false,false,false)`,
          [cliente_id, modeloIdNum, _boasVindas12334]
        );
      }
    }

    await client.query("COMMIT");

    if (statusLocal === "pago") {
      registrarLog(db, {
        tipo: 'assinatura_vip',
        cliente_id,
        modelo_id: modeloIdNum,
        descricao: `Assinatura VIP confirmada via cartão (Stripe) — PaymentIntent ${paymentIntentId}`,
        ip,
        user_agent: req.headers['user-agent'] || null
      });

      try {
        const io = req.app.get("io");
        if (io) {
          const sala = `chat_${cliente_id}_${modeloIdNum}`;
          io.to(sala).emit("vipAtivado", {
            cliente_id: Number(cliente_id),
            modelo_id: Number(modeloIdNum)
          });
        }
      } catch (e) { console.error("Erro socket vip cartão:", e); }
    }

    try {
      await client.query(
        `INSERT INTO pagamento_tentativas
         (cliente_id, metodo, fingerprint_pagamento, status, ip)
         VALUES ($1, 'cartao', $2, 'aprovado', $3)`,
        [cliente_id, fingerprint || null, ip]
      );
    } catch (logErr) {
      console.error("Erro ao registrar tentativa aprovada VIP:", logErr);
    }

    const resposta = {
      ok: true,
      payment_id: paymentIntentId,
      status: statusLocal,
      modelo_id: modeloIdNum,
      currency: "brl",
      taxa_cambio: null,
      valor_assinatura: valorAssinatura,
      taxa_transacao: taxaTransacao,
      taxa_plataforma: taxaPlataforma,
      valor_total: valorTotal,
      oferta_id: oferta_id || null
    };

    if (paymentIntent.status === "requires_action") {
      resposta.requires_action = true;
      resposta.client_secret = paymentIntent.client_secret;
    }

    return res.json(resposta);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error("Erro VIP Stripe:", err);

    try {
      if (cliente_id && req.body?.fingerprint) {
        await client.query(
          `
          INSERT INTO pagamento_tentativas
          (cliente_id, metodo, fingerprint_pagamento, status, ip)
          VALUES ($1, 'cartao', $2, 'recusado', $3)
          `,
          [
            cliente_id,
            req.body.fingerprint,
            req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
              req.socket.remoteAddress ||
              null
          ]
        );
      }
    } catch (logErr) {
      console.error("Erro ao registrar tentativa recusada:", logErr);
    }

    return res.status(500).json({
      error: err.message || "Erro ao criar pagamento com cartão",
      stripe_code: err.code || null,
      stripe_type: err.type || null
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
    "stripe_cartao_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

  const startedAt = Date.now();
  let client = null;
  let cliente_id = null;

  try {
    client = await db.connect();

    const {
      conteudo_id,
      fingerprint,
      aceitou_termos,
      aceitou_execucao_imediata,
      aceite_timestamp,
      versao_termos,
      paymentMethodId,
      nome_cartao,
      cpf,
      telefone,
      endereco
    } = req.body || {};

    const nomeCartaoMidia = String(nome_cartao || "").trim() || null;
    const cpfMidia = String(cpf || "").replace(/\D/g, "") || null;
    const telefoneMidia = String(telefone || "").replace(/\D/g, "") || null;

    const userId = Number(req.user?.id || 0);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    if (!conteudo_id || !Number.isInteger(Number(conteudo_id))) {
      return res.status(400).json({ error: "conteudo_id inválido" });
    }

    const conteudoId = Number(conteudo_id);

    if (!fingerprint) {
      return res.status(400).json({ error: "Fingerprint obrigatório." });
    }

    if (!aceitou_termos) {
      return res.status(400).json({ error: "Você precisa aceitar os termos." });
    }

    if (!aceitou_execucao_imediata) {
      return res.status(400).json({
        error: "Você precisa declarar ciência sobre a execução imediata do conteúdo digital."
      });
    }

    if (!aceite_timestamp) {
      return res.status(400).json({ error: "Data de aceite obrigatória." });
    }

    const dataAceite = new Date(aceite_timestamp);
    if (Number.isNaN(dataAceite.getTime())) {
      return res.status(400).json({ error: "Data de aceite inválida." });
    }

    if (!paymentMethodId) {
      return res.status(400).json({ error: "paymentMethodId obrigatório." });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    await client.query("BEGIN");

    /* =====================================================
       CLIENTE
    ===================================================== */
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

    cliente_id = Number(clienteRes.rows[0].id);

    const { bloqueado, email, nome } = clienteRes.rows[0];

    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const riscoMidiaCartao = await client.query(
      `SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`,
      [cliente_id]
    );
    if (riscoMidiaCartao.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
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

    // Validação de titularidade: o nome no cartão deve corresponder ao titular cadastrado
    if (nomeCartaoMidia) {
      const dadosRes = await client.query(
        `SELECT nome_completo FROM clientes_dados WHERE cliente_id = $1 LIMIT 1`,
        [cliente_id]
      );
      const nomeCompletoCadastro = dadosRes.rows[0]?.nome_completo;

      if (nomeCompletoCadastro && !nomesCorrespondem(nomeCompletoCadastro, nomeCartaoMidia)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "O nome informado no cartão não corresponde ao titular cadastrado. Pagamentos só podem ser feitos com cartão em nome do titular da conta."
        });
      }
    }

    if (endereco) {
      await salvarEnderecoClientePix(client, { cliente_id, telefone: telefoneMidia, endereco });
    }

    // Log de aceite de termos antes do pagamento mídia cartão
    registrarLog(db, {
      tipo: 'aceite_termos',
      cliente_id,
      modelo_id: null,
      descricao: `Termos aceitos antes de pagamento Mídia cartão — conteudo_id ${conteudoId} — versão ${versao_termos || ''}`,
      ip,
      user_agent: req.headers['user-agent'] || null
    });

    /* =====================================================
       CONTEÚDO
    ===================================================== */
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

    /* =====================================================
       JÁ COMPRADO
    ===================================================== */
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

    /* =====================================================
       CÁLCULO
    ===================================================== */
    const valorBase = Number(Number(preco).toFixed(2));
    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(valorBase);
    const total = valorTotal;

    if (!total || total <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor do pagamento inválido." });
    }

    /* =====================================================
       CRIAR PAGAMENTO STRIPE (MÍDIA)
    ===================================================== */
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "brl",
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: "Mídia Premium Velvet",
      receipt_email: String(email).trim().toLowerCase(),
      metadata: {
        tipo: "conteudo",
        cliente_id: String(cliente_id),
        modelo_id: String(modelo_id),
        message_id: String(conteudoId),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma)
      },
      expand: ["payment_method"]
    });

    const paymentIntentId = paymentIntent.id;
    const statusLocal = paymentIntent.status === "succeeded" ? "pago" : "pendente";

    const cartaoInfo = paymentIntent.payment_method?.card || null;
    const cardBrand = cartaoInfo?.brand || null;
    const cardLast4 = cartaoInfo?.last4 || null;
    const cardExpMonth = cartaoInfo?.exp_month || null;
    const cardExpYear = cartaoInfo?.exp_year || null;

    /* =====================================================
       REGISTRAR PAGAMENTO LOCAL
    ===================================================== */
    await client.query(
      `
      INSERT INTO pagamentos_cartao
      (
        cliente_id,
        modelo_id,
        conteudo_id,
        gateway,
        gateway_payment_id,
        stripe_payment_intent_id,
        valor,
        tipo,
        currency,
        status,
        aceite_ip,
        aceitou_termos,
        aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos,
        fingerprint,
        valor_brl,
        taxa_cambio,
        nome_cartao,
        card_brand,
        card_last4,
        card_exp_month,
        card_exp_year,
        cpf,
        telefone,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, 'stripe', $4, $5, $6, $7, 'brl', $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23,
        NOW(), NOW()
      )
      `,
      [
        cliente_id,
        modelo_id,
        conteudoId,
        paymentIntentId,
        paymentIntentId,
        total,
        "midia",
        statusLocal,
        ip,
        !!aceitou_termos,
        !!aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos || "2026-06-07",
        fingerprint || null,
        valorBase,
        null,
        nomeCartaoMidia,
        cardBrand,
        cardLast4,
        cardExpMonth,
        cardExpYear,
        cpfMidia,
        telefoneMidia
      ]
    );

    let conteudo_ids_liberados = null;

    if (statusLocal === "pago") {
      const calcularValores =
        req.app.get("calcularValores") ||
        (async ({ valor_bruto }) => ({
          valor_modelo: valor_bruto * 0.7,
          agency_fee: valor_bruto * 0.1,
          velvet_fee: valor_bruto * 0.05
        }));

      const taxaGateway = Number((valorBase * 0.15).toFixed(2));
      const valores = await calcularValores({
        modelo_id,
        valor_bruto: valorBase,
        taxa_gateway: taxaGateway
      });

      await client.query(
        `INSERT INTO conteudo_pacotes
           (message_id, cliente_id, modelo_id, preco, valor_base, valor_total,
            status, metodo_pagamento, pago_em, currency, valor_cobrado, taxa_cambio, payment_id)
         VALUES ($1,$2,$3,$4,$4,$5,'pago','cartao',NOW(),'brl',$5,NULL,$6)
         ON CONFLICT (message_id, cliente_id) DO UPDATE
           SET status='pago', metodo_pagamento='cartao', pago_em=NOW(), valor_total=$5, payment_id=$6`,
        [conteudoId, cliente_id, modelo_id, valorBase, total, paymentIntentId]
      );

      conteudo_ids_liberados = await marcarConteudoComoLiberadoPorPagamento(client, {
        message_id: conteudoId,
        cliente_id,
        modelo_id
      });

      await client.query(
        `INSERT INTO transacoes_agency
           (modelo_id, cliente_id, tipo, valor_bruto, valor_modelo, agency_fee,
            velvet_fee, taxa_gateway, status, created_at, gateway, disponivel_em, stripe_payment_intent_id)
         VALUES ($1,$2,'midia',$3,$4,$5,$6,$7,'pago',NOW(),'stripe',NULL,$8)`,
        [modelo_id, cliente_id, valorBase,
         Number(valores.valor_modelo || 0),
         Number(valores.agency_fee || 0),
         Number(valores.velvet_fee || 0),
         taxaGateway,
         paymentIntentId]
      );
    }

    await client.query("COMMIT");

    if (statusLocal === "pago") {
      registrarLog(db, {
        tipo: 'compra_midia_chat',
        cliente_id,
        modelo_id: modelo_id || null,
        descricao: `Mídia do chat desbloqueada via cartão (Stripe) — message_id ${conteudoId} — PaymentIntent ${paymentIntentId}`,
        ip,
        user_agent: req.headers['user-agent'] || null
      });
    }

    if (statusLocal === "pago" && conteudo_ids_liberados) {
      try {
        const io = req.app.get("io");
        if (io) {
          const sala = `chat_${cliente_id}_${modelo_id}`;
          io.to(sala).emit("conteudoLiberado", {
            message_id: Number(conteudoId),
            conteudo_ids: conteudo_ids_liberados || []
          });
        }
      } catch (e) { console.error("Erro socket midia cartão:", e); }
    }

    try {
      await client.query(
        `INSERT INTO pagamento_tentativas
         (cliente_id, metodo, fingerprint_pagamento, status, conteudo_id, ip,
          aceitou_termos, aceitou_execucao_imediata, aceite_timestamp, versao_termos)
         VALUES ($1, 'cartao', $2, 'aprovado', $3, $4, $5, $6, $7, $8)`,
        [
          cliente_id,
          fingerprint || null,
          conteudoId || null,
          ip,
          !!aceitou_termos,
          !!aceitou_execucao_imediata,
          aceite_timestamp || null,
          versao_termos || "2026-06-07"
        ]
      );
    } catch (logErr) {
      console.error("Erro ao registrar tentativa aprovada mídia:", logErr);
    }

    const resposta = {
      ok: true,
      payment_id: paymentIntentId,
      status: statusLocal,
      currency: "brl",
      taxa_cambio: null,
      total,
      valorBase,
      taxaTransacao,
      taxaPlataforma,
      aceitou_termos: !!aceitou_termos,
      aceitou_execucao_imediata: !!aceitou_execucao_imediata,
      aceite_timestamp,
      versao_termos: versao_termos || "2026-06-07"
    };

    if (paymentIntent.status === "requires_action") {
      resposta.requires_action = true;
      resposta.client_secret = paymentIntent.client_secret;
    }

    return res.json(resposta);

  } catch (err) {
    console.error("💥 ERRO /api/pagamento/midia/cartao [STRIPE]", err.message);

    try {
      if (client) await client.query("ROLLBACK");
    } catch (e) {
      console.error("Erro no rollback:", e.message);
    }

    try {
      if (client && cliente_id && req.body?.fingerprint) {
        await client.query(
          `
          INSERT INTO pagamento_tentativas
          (cliente_id, metodo, fingerprint_pagamento, status, conteudo_id, ip,
           aceitou_termos, aceitou_execucao_imediata, aceite_timestamp, versao_termos)
          VALUES ($1, 'cartao', $2, 'recusado', $3, $4, $5, $6, $7, $8)
          `,
          [
            cliente_id,
            req.body.fingerprint,
            Number(req.body?.conteudo_id || 0) || null,
            req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
              req.socket?.remoteAddress ||
              null,
            !!req.body?.aceitou_termos,
            !!req.body?.aceitou_execucao_imediata,
            req.body?.aceite_timestamp || null,
            req.body?.versao_termos || "2026-06-07"
          ]
        );
      }
    } catch (logErr) {
      console.error("Erro ao registrar tentativa recusada:", logErr.message);
    }

    return res.status(500).json({
      error: "Erro interno ao processar pagamento com cartão",
      detalhe: err.message,
      stripe_code: err.code || null,
      stripe_type: err.type || null,
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
// PREMIUM CARTAO
// ===========================

app.post("/api/pagamento/premium/cartao", authCliente, async (req, res) => {
  const requestId =
    "premium_cartao_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

  let client = null;
  let cliente_id = null;

  try {
    client = await db.connect();

    const {
      premium_post_id,
      fingerprint,
      aceitou_termos,
      aceitou_execucao_imediata,
      aceite_timestamp,
      versao_termos,
      paymentMethodId,
      cpf,
      telefone,
      nome_cartao,
      endereco
    } = req.body || {};

    const cpfPremiumCartao = String(cpf || "").replace(/\D/g, "") || null;
    const telefonePremiumCartao = String(telefone || "").replace(/\D/g, "") || null;
    const nomeCartaoPremium = String(nome_cartao || "").trim() || null;

    const userId = Number(req.user?.id || 0);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    if (!aceitou_termos) {
      return res.status(400).json({ error: "É necessário aceitar os termos." });
    }

    if (!aceitou_execucao_imediata) {
      return res.status(400).json({
        error: "É necessário declarar ciência sobre a execução imediata do conteúdo digital."
      });
    }

    if (!aceite_timestamp) {
      return res.status(400).json({ error: "Data de aceite obrigatória." });
    }

    const dataAceite = new Date(aceite_timestamp);
    if (Number.isNaN(dataAceite.getTime())) {
      return res.status(400).json({ error: "Data de aceite inválida." });
    }

    if (!premium_post_id || !Number.isInteger(Number(premium_post_id))) {
      return res.status(400).json({ error: "premium_post_id inválido" });
    }

    if (!fingerprint) {
      return res.status(400).json({ error: "Fingerprint obrigatório." });
    }

    if (!paymentMethodId) {
      return res.status(400).json({ error: "paymentMethodId obrigatório." });
    }

    const premiumPostId = Number(premium_post_id);

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    await client.query("BEGIN");

    /* =====================================================
       CLIENTE
    ===================================================== */
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

    cliente_id = Number(clienteRes.rows[0].id);

    const { bloqueado, email, nome } = clienteRes.rows[0];

    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const riscoPremiumCartao = await client.query(
      `SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`,
      [cliente_id]
    );
    if (riscoPremiumCartao.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
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

    // Validação de titularidade: o nome no cartão deve corresponder ao titular cadastrado
    if (nomeCartaoPremium) {
      const dadosRes = await client.query(
        `SELECT nome_completo FROM clientes_dados WHERE cliente_id = $1 LIMIT 1`,
        [cliente_id]
      );
      const nomeCompletoCadastro = dadosRes.rows[0]?.nome_completo;

      if (nomeCompletoCadastro && !nomesCorrespondem(nomeCompletoCadastro, nomeCartaoPremium)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "O nome informado no cartão não corresponde ao titular cadastrado. Pagamentos só podem ser feitos com cartão em nome do titular da conta."
        });
      }
    }

    if (endereco) {
      await salvarEnderecoClientePix(client, { cliente_id, telefone: telefonePremiumCartao, endereco });
    }

    // Log de aceite de termos antes do pagamento premium cartão
    registrarLog(db, {
      tipo: 'aceite_termos',
      cliente_id,
      modelo_id: null,
      descricao: `Termos aceitos antes de pagamento Premium cartão — premium_post_id ${premiumPostId} — versão ${versao_termos || ''}`,
      ip,
      user_agent: req.headers['user-agent'] || null
    });

    /* =====================================================
       PREMIUM
    ===================================================== */
    const premiumRes = await client.query(
      `
      SELECT id, preco, modelo_id, descricao, ativo
      FROM premium_posts
      WHERE id = $1
      LIMIT 1
      `,
      [premiumPostId]
    );

    if (!premiumRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Conteúdo premium não encontrado" });
    }

    const { id: premium_id, preco, modelo_id, descricao, ativo } = premiumRes.rows[0];

    const donaRes = await client.query(
      `SELECT id FROM modelos WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [userId, modelo_id]
    );

    if (donaRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Não é possível comprar o próprio conteúdo premium."
      });
    }

    const vipRes = await client.query(
      `
      SELECT 1
      FROM vip_subscriptions
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND ativo = true
        AND expiration_at > NOW()
      LIMIT 1
      `,
      [cliente_id, modelo_id]
    );

    if (!vipRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "Apenas clientes VIP podem comprar conteúdos premium."
      });
    }

    if (!ativo) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Conteúdo premium indisponível." });
    }

    if (!preco || Number(preco) <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Conteúdo premium não está à venda." });
    }

    /* =====================================================
       JÁ COMPRADO
    ===================================================== */
    const jaComprado = await client.query(
      `
      SELECT 1
      FROM premium_unlocks
      WHERE premium_post_id = $1
        AND cliente_id = $2
        AND status = 'pago'
      LIMIT 1
      `,
      [premium_id, cliente_id]
    );

    if (jaComprado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Conteúdo premium já adquirido." });
    }

    /* =====================================================
       CÁLCULO
    ===================================================== */
    const valorBase = Number(Number(preco).toFixed(2));
    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(valorBase);
    const total = valorTotal;

    if (!total || total <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor do pagamento inválido." });
    }

    /* =====================================================
       CRIAR PAGAMENTO STRIPE (PREMIUM)
    ===================================================== */
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "brl",
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: descricao || `Premium Velvet #${premium_id}`,
      receipt_email: String(email).trim().toLowerCase(),
      metadata: {
        tipo: "premium",
        cliente_id: String(cliente_id),
        modelo_id: String(modelo_id),
        premium_post_id: String(premium_id),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma)
      }
    });

    const paymentIntentId = paymentIntent.id;
    const statusLocal = paymentIntent.status === "succeeded" ? "pago" : "pendente";

    /* =====================================================
       REGISTRAR PAGAMENTO LOCAL
    ===================================================== */
    await client.query(
      `
      INSERT INTO premium_unlocks
      (
        premium_post_id,
        cliente_id,
        modelo_id,
        status,
        metodo_pagamento,
        valor_base,
        taxa_transacao,
        taxa_plataforma,
        valor_total,
        gateway,
        stripe_payment_intent_id,
        pagarme_order_id,
        pacote_ref,
        aceite_ip,
        aceitou_termos,
        aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos,
        fingerprint,
        valor_cobrado,
        taxa_cambio,
        created_at,
        updated_at
      )
      VALUES
      (
        $1, $2, $3, $4, 'cartao', $5, $6, $7, $8,
        'stripe', $9, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        NOW(), NOW()
      )
      ON CONFLICT (premium_post_id, cliente_id)
      DO UPDATE SET
        modelo_id = EXCLUDED.modelo_id,
        status = EXCLUDED.status,
        metodo_pagamento = 'cartao',
        valor_base = EXCLUDED.valor_base,
        taxa_transacao = EXCLUDED.taxa_transacao,
        taxa_plataforma = EXCLUDED.taxa_plataforma,
        valor_total = EXCLUDED.valor_total,
        gateway = EXCLUDED.gateway,
        stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
        pagarme_order_id = EXCLUDED.pagarme_order_id,
        pacote_ref = EXCLUDED.pacote_ref,
        aceite_ip = EXCLUDED.aceite_ip,
        aceitou_termos = EXCLUDED.aceitou_termos,
        aceitou_execucao_imediata = EXCLUDED.aceitou_execucao_imediata,
        aceite_timestamp = EXCLUDED.aceite_timestamp,
        versao_termos = EXCLUDED.versao_termos,
        fingerprint = EXCLUDED.fingerprint,
        valor_cobrado = EXCLUDED.valor_cobrado,
        taxa_cambio = EXCLUDED.taxa_cambio,
        updated_at = NOW()
      `,
      [
        premium_id,
        cliente_id,
        modelo_id,
        statusLocal,
        valorBase,
        taxaTransacao,
        taxaPlataforma,
        total,
        paymentIntentId,
        `premium_${premium_id}_${cliente_id}`,
        ip || null,
        !!aceitou_termos,
        !!aceitou_execucao_imediata,
        aceite_timestamp,
        versao_termos || "2026-06-07",
        fingerprint || null,
        total,
        null
      ]
    );

    if (statusLocal === "pago") {
      const calcularValores =
        req.app.get("calcularValores") ||
        (async ({ valor_bruto }) => ({
          valor_modelo: valor_bruto * 0.7,
          agency_fee: valor_bruto * 0.1,
          velvet_fee: valor_bruto * 0.05
        }));

      const taxaGateway = Number((valorBase * 0.15).toFixed(2));
      const valores = await calcularValores({
        modelo_id,
        valor_bruto: valorBase,
        taxa_gateway: taxaGateway
      });

      await client.query(
        `INSERT INTO transacoes_agency
           (modelo_id, cliente_id, tipo, valor_bruto, valor_modelo, agency_fee,
            velvet_fee, taxa_gateway, status, created_at, gateway, disponivel_em, stripe_payment_intent_id)
         VALUES ($1,$2,'midia',$3,$4,$5,$6,$7,'pago',NOW(),'stripe',NULL,$8)`,
        [modelo_id, cliente_id, valorBase,
         Number(valores.valor_modelo || 0),
         Number(valores.agency_fee || 0),
         Number(valores.velvet_fee || 0),
         taxaGateway,
         paymentIntentId]
      );
    }

    await client.query("COMMIT");

    if (statusLocal === "pago") {
      registrarLog(db, {
        tipo: 'compra_premium',
        cliente_id,
        modelo_id: modelo_id || null,
        descricao: `Premium desbloqueado via cartão (Stripe) — premium_post_id ${premium_id} — PaymentIntent ${paymentIntentId}`,
        ip,
        user_agent: req.headers['user-agent'] || null
      });

      try {
        const io = req.app.get("io");
        if (io) {
          io.to(`user_${cliente_id}`).emit("pagamento_confirmado", {
            tipo: "premium",
            premium_post_id: premium_id,
            modelo_id,
            payment_id: paymentIntentId
          });
        }
      } catch (e) { console.error("Erro socket premium cartão:", e); }
    }

    try {
      await client.query(
        `INSERT INTO pagamento_tentativas
         (cliente_id, metodo, fingerprint_pagamento, status, ip, gateway,
          aceitou_termos, aceitou_execucao_imediata, aceite_timestamp, versao_termos)
         VALUES ($1, 'cartao', $2, 'aprovado', $3, 'stripe', $4, $5, $6, $7)`,
        [
          cliente_id,
          fingerprint || null,
          ip,
          !!aceitou_termos,
          !!aceitou_execucao_imediata,
          aceite_timestamp || null,
          versao_termos || "2026-06-07"
        ]
      );
    } catch (logErr) {
      console.error("Erro ao registrar tentativa aprovada premium:", logErr);
    }

    const resposta = {
      ok: true,
      payment_id: paymentIntentId,
      premium_post_id: premium_id,
      modelo_id,
      cliente_id,
      status: statusLocal,
      currency: "brl",
      taxa_cambio: null,
      total,
      valorBase,
      taxaTransacao,
      taxaPlataforma,
      aceitou_termos: !!aceitou_termos,
      aceitou_execucao_imediata: !!aceitou_execucao_imediata,
      aceite_timestamp,
      versao_termos: versao_termos || "2026-06-07"
    };

    if (paymentIntent.status === "requires_action") {
      resposta.requires_action = true;
      resposta.client_secret = paymentIntent.client_secret;
    }

    return res.json(resposta);

  } catch (err) {
    console.error("💥 ERRO /api/pagamento/premium/cartao [STRIPE]", err.message);

    try {
      if (client) await client.query("ROLLBACK");
    } catch (e) {
      console.error("Erro no rollback:", e.message);
    }

    try {
      if (client && cliente_id && req.body?.fingerprint) {
        await client.query(
          `
          INSERT INTO pagamento_tentativas
          (cliente_id, metodo, fingerprint_pagamento, status, ip, gateway,
           aceitou_termos, aceitou_execucao_imediata, aceite_timestamp, versao_termos)
          VALUES ($1, 'cartao', $2, 'recusado', $3, 'stripe', $4, $5, $6, $7)
          `,
          [
            cliente_id,
            req.body.fingerprint,
            req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
              req.socket?.remoteAddress ||
              null,
            !!req.body?.aceitou_termos,
            !!req.body?.aceitou_execucao_imediata,
            req.body?.aceite_timestamp || null,
            req.body?.versao_termos || "2026-06-07"
          ]
        );
      }
    } catch (logErr) {
      console.error("Erro ao registrar tentativa recusada:", logErr.message);
    }

    return res.status(500).json({
      error: "Erro interno ao processar pagamento com cartão do premium",
      detalhe: err.message,
      stripe_code: err.code || null,
      stripe_type: err.type || null,
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

// ============================================================
// PAYMENT ELEMENT — criar PaymentIntent (confirmação no cliente)
// Estes endpoints substituem o confirm server-side.
// O webhook /api/webhook/stripe processa payment_intent.succeeded.
// ============================================================

// ── Taxa de câmbio (proxy Frankfurter p/ evitar CSP no cliente) ──────────────
app.get("/api/cambio", async (req, res) => {
  const para = String(req.query.para || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (para.length !== 3) return res.status(400).json({ error: "Moeda inválida" });
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=BRL&to=${para}`);
    const d = await r.json();
    const taxa = d.rates?.[para];
    if (!taxa) return res.status(404).json({ error: "Taxa não disponível" });
    return res.json({ de: "BRL", para, taxa });
  } catch {
    return res.status(502).json({ error: "Serviço de câmbio indisponível" });
  }
});

// Converte valor para centavos respeitando moedas zero-decimal
function stripeAmountFromValue(valor, currency) {
  const zeroDecimal = ["bif","clp","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","xaf","xof"];
  return zeroDecimal.includes(String(currency).toLowerCase())
    ? Math.round(valor)
    : Math.round(valor * 100);
}

// ── VIP criar-intent ────────────────────────────────────────
app.post("/api/pagamento/vip/criar-intent", authCliente, async (req, res) => {
  const client = await db.connect();
  let cliente_id = null;
  try {
    await client.query("BEGIN");

    const {
      modelo_id, aceitou_termos, aceitou_execucao_imediata,
      aceite_timestamp, versao_termos, fingerprint,
      cpf, telefone, currency: currencyParam, taxa_cambio: taxaCambioParam
    } = req.body || {};

    const currency   = String(currencyParam || "brl").toLowerCase();
    const taxa_cambio = taxaCambioParam ? Number(taxaCambioParam) : null;
    const cpfVip     = String(cpf || "").replace(/\D/g, "") || null;
    const telefoneVip = String(telefone || "").replace(/\D/g, "") || null;
    const userId     = Number(req.user?.id || 0);

    if (!Number.isInteger(userId) || userId <= 0) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Usuário inválido." });
    }
    const modeloIdNum = Number(modelo_id);
    if (!Number.isInteger(modeloIdNum) || modeloIdNum <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "modelo_id inválido" });
    }
    if (!fingerprint) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Fingerprint obrigatório." });
    }
    if (!aceitou_termos) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Você precisa aceitar os termos." });
    }
    if (!aceitou_execucao_imediata) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Aceite de execução imediata obrigatório." });
    }
    if (!aceite_timestamp || Number.isNaN(new Date(aceite_timestamp).getTime())) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Data de aceite inválida." });
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || null;

    const ipBloq = await client.query(`SELECT 1 FROM ips_bloqueados WHERE ip = $1 LIMIT 1`, [ip]);
    if (ipBloq.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta temporariamente bloqueada." });
    }

    const clienteRes = await client.query(
      `SELECT c.id, c.nome, c.bloqueado, u.email
       FROM clientes c JOIN users u ON u.id = c.user_id
       WHERE c.user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }
    cliente_id = Number(clienteRes.rows[0].id);
    const { bloqueado, email } = clienteRes.rows[0];
    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const risco = await client.query(`SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`, [cliente_id]);
    if (risco.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
    }

    const modeloRes = await client.query(
      `SELECT 1 FROM modelos WHERE id = $1 LIMIT 1`,
      [modeloIdNum]
    );
    if (!modeloRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Modelo não encontrado" });
    }

    const planoRes = await client.query(
      `SELECT valor_mensal FROM modelos_planos WHERE modelo_id = $1 LIMIT 1`,
      [modeloIdNum]
    );
    if (!planoRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Plano VIP não definido" });
    }
    const valorBasePlano = Number(planoRes.rows[0].valor_mensal || 0);
    if (!valorBasePlano || valorBasePlano <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Modelo sem plano ativo." });
    }

    const ofertaRes = await client.query(
      `SELECT id, desconto_percentual, valor_promocional
       FROM ofertas WHERE modelo_id = $1 AND ativa = true
       AND (data_inicio IS NULL OR data_inicio <= NOW())
       AND (data_fim IS NULL OR data_fim >= NOW())
       ORDER BY created_at DESC LIMIT 1`,
      [modeloIdNum]
    );
    let valorAssinatura = valorBasePlano;
    let oferta_id = null;
    if (ofertaRes.rowCount) {
      oferta_id = ofertaRes.rows[0].id;
      if (ofertaRes.rows[0].valor_promocional) {
        valorAssinatura = Number(ofertaRes.rows[0].valor_promocional);
      } else if (ofertaRes.rows[0].desconto_percentual) {
        const desc = Number(ofertaRes.rows[0].desconto_percentual);
        valorAssinatura = valorBasePlano - (valorBasePlano * desc / 100);
      }
    }
    valorAssinatura = Number(valorAssinatura.toFixed(2));
    if (!valorAssinatura || valorAssinatura <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor inválido" });
    }

    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(valorAssinatura);

    // Converter para moeda alvo quando taxa_cambio é fornecida
    const valorTotalFinal = (taxa_cambio && currency !== "brl")
      ? Number((valorTotal * taxa_cambio).toFixed(2))
      : valorTotal;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmountFromValue(valorTotalFinal, currency),
      currency,
      automatic_payment_methods: { enabled: true },
      payment_method_options: {
        card: { request_three_d_secure: "any" }
      },
      description: "Assinatura VIP Velvet",
      receipt_email: String(email).trim().toLowerCase(),
      metadata: {
        tipo: "vip",
        cliente_id: String(cliente_id),
        modelo_id: String(modeloIdNum),
        valor_assinatura: String(valorAssinatura),
        valor_base_brl: String(valorTotal),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma),
        oferta_id: oferta_id ? String(oferta_id) : "",
        taxa_cambio: taxa_cambio ? String(taxa_cambio) : ""
      }
    });

    await client.query(
      `INSERT INTO pagamentos_cartao
       (cliente_id, modelo_id, gateway, gateway_payment_id, stripe_payment_intent_id,
        valor, tipo, currency, status, aceite_ip,
        aceitou_termos, aceitou_execucao_imediata, aceite_timestamp, versao_termos,
        fingerprint, valor_brl, taxa_cambio, cpf, telefone, created_at, updated_at)
       VALUES ($1,$2,'stripe',$3,$3,$4,'vip',$5,'pendente',$6,
               $7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())`,
      [
        cliente_id, modeloIdNum, paymentIntent.id,
        valorTotal,
        currency, ip,
        !!aceitou_termos, !!aceitou_execucao_imediata,
        aceite_timestamp, versao_termos || "2026-07-28",
        fingerprint || null,
        valorAssinatura,
        taxa_cambio,
        cpfVip || null, telefoneVip || null
      ]
    );

    await client.query("COMMIT");

    return res.json({
      client_secret: paymentIntent.client_secret,
      payment_id: paymentIntent.id,
      currency,
      valor_brl: valorAssinatura,
      valor_total: valorTotalFinal
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Erro /api/pagamento/vip/criar-intent:", err.message);
    return res.status(500).json({ error: "Erro ao criar pagamento", detalhe: err.message });
  } finally {
    try { client.release(); } catch (_) {}
  }
});

// ── MÍDIA criar-intent ──────────────────────────────────────
app.post("/api/pagamento/midia/criar-intent", auth, async (req, res) => {
  const client = await db.connect();
  let cliente_id = null;
  try {
    await client.query("BEGIN");

    const {
      conteudo_id, fingerprint, aceitou_termos, aceitou_execucao_imediata,
      aceite_timestamp, versao_termos, currency: currencyParam, taxa_cambio: taxaCambioParam
    } = req.body || {};

    const currency    = String(currencyParam || "brl").toLowerCase();
    const taxa_cambio = taxaCambioParam ? Number(taxaCambioParam) : null;
    const userId      = Number(req.user?.id || 0);

    if (!Number.isInteger(userId) || userId <= 0) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    if (!conteudo_id || !Number.isInteger(Number(conteudo_id))) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "conteudo_id inválido" });
    }
    const conteudoId = Number(conteudo_id);

    if (!fingerprint) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Fingerprint obrigatório." });
    }
    if (!aceitou_termos) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Você precisa aceitar os termos." });
    }
    if (!aceitou_execucao_imediata) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Aceite de execução imediata obrigatório." });
    }
    if (!aceite_timestamp || Number.isNaN(new Date(aceite_timestamp).getTime())) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Data de aceite inválida." });
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;

    const clienteRes = await client.query(
      `SELECT c.id, c.bloqueado, u.email
       FROM clientes c JOIN users u ON u.id = c.user_id
       WHERE c.user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }
    cliente_id = Number(clienteRes.rows[0].id);
    const { bloqueado, email } = clienteRes.rows[0];
    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const risco = await client.query(`SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`, [cliente_id]);
    if (risco.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
    }

    const messageRes = await client.query(
      `SELECT preco, modelo_id FROM messages WHERE id = $1 AND cliente_id = $2 LIMIT 1`,
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
      `SELECT 1 FROM conteudo_pacotes WHERE message_id = $1 AND cliente_id = $2 AND status = 'pago' LIMIT 1`,
      [conteudoId, cliente_id]
    );
    if (jaComprado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Conteúdo já adquirido." });
    }

    const valorBase = Number(Number(preco).toFixed(2));
    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(valorBase);

    const valorTotalFinal = (taxa_cambio && currency !== "brl")
      ? Number((valorTotal * taxa_cambio).toFixed(2))
      : valorTotal;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmountFromValue(valorTotalFinal, currency),
      currency,
      automatic_payment_methods: { enabled: true },
      payment_method_options: {
        card: { request_three_d_secure: "any" }
      },
      description: "Mídia Premium Velvet",
      receipt_email: String(email).trim().toLowerCase(),
      metadata: {
        tipo: "conteudo",
        cliente_id: String(cliente_id),
        modelo_id: String(modelo_id),
        message_id: String(conteudoId),
        valor_base_brl: String(valorTotal),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma),
        taxa_cambio: taxa_cambio ? String(taxa_cambio) : ""
      }
    });

    await client.query(
      `INSERT INTO pagamentos_cartao
       (cliente_id, modelo_id, conteudo_id, gateway, gateway_payment_id, stripe_payment_intent_id,
        valor, tipo, currency, status, aceite_ip,
        aceitou_termos, aceitou_execucao_imediata, aceite_timestamp, versao_termos,
        fingerprint, valor_brl, taxa_cambio, created_at, updated_at)
       VALUES ($1,$2,$3,'stripe',$4,$4,$5,'midia',$6,'pendente',$7,
               $8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
      [
        cliente_id, modelo_id, conteudoId, paymentIntent.id,
        valorTotal,
        currency, ip,
        !!aceitou_termos, !!aceitou_execucao_imediata,
        aceite_timestamp, versao_termos || "2026-07-28",
        fingerprint || null,
        valorBase,
        taxa_cambio
      ]
    );

    await client.query("COMMIT");

    return res.json({
      client_secret: paymentIntent.client_secret,
      payment_id: paymentIntent.id,
      currency,
      valor_brl: valorBase,
      valor_total: valorTotalFinal
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Erro /api/pagamento/midia/criar-intent:", err.message);
    return res.status(500).json({ error: "Erro ao criar pagamento", detalhe: err.message });
  } finally {
    try { client.release(); } catch (_) {}
  }
});

// ── PREMIUM criar-intent ─────────────────────────────────────
app.post("/api/pagamento/premium/criar-intent", authCliente, async (req, res) => {
  const client = await db.connect();
  let cliente_id = null;
  try {
    await client.query("BEGIN");

    const {
      premium_post_id, fingerprint, aceitou_termos, aceitou_execucao_imediata,
      aceite_timestamp, versao_termos, currency: currencyParam, taxa_cambio: taxaCambioParam
    } = req.body || {};

    const currency    = String(currencyParam || "brl").toLowerCase();
    const taxa_cambio = taxaCambioParam ? Number(taxaCambioParam) : null;
    const userId      = Number(req.user?.id || 0);

    if (!Number.isInteger(userId) || userId <= 0) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Usuário inválido." });
    }
    if (!premium_post_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "premium_post_id obrigatório." });
    }
    const premium_id = Number(premium_post_id);
    if (!Number.isInteger(premium_id) || premium_id <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "premium_post_id inválido." });
    }
    if (!fingerprint) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Fingerprint obrigatório." });
    }
    if (!aceitou_termos) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Você precisa aceitar os termos." });
    }
    if (!aceitou_execucao_imediata) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Aceite de execução imediata obrigatório." });
    }
    if (!aceite_timestamp || Number.isNaN(new Date(aceite_timestamp).getTime())) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Data de aceite inválida." });
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;

    const clienteRes = await client.query(
      `SELECT c.id, c.bloqueado, u.email
       FROM clientes c JOIN users u ON u.id = c.user_id
       WHERE c.user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!clienteRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }
    cliente_id = Number(clienteRes.rows[0].id);
    const { bloqueado, email } = clienteRes.rows[0];
    if (bloqueado) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Conta bloqueada." });
    }

    const risco = await client.query(`SELECT 1 FROM cliente_risco WHERE cliente_id = $1 AND ativo = true LIMIT 1`, [cliente_id]);
    if (risco.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Compras temporariamente bloqueadas para esta conta." });
    }

    const postRes = await client.query(
      `SELECT pp.id, pp.preco, pp.descricao, pp.modelo_id
       FROM premium_posts pp
       WHERE pp.id = $1 LIMIT 1`,
      [premium_id]
    );
    if (!postRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Conteúdo premium não encontrado." });
    }
    const { preco, descricao, modelo_id } = postRes.rows[0];

    const jaComprado = await client.query(
      `SELECT 1 FROM premium_unlocks WHERE premium_post_id = $1 AND cliente_id = $2 AND status = 'pago' LIMIT 1`,
      [premium_id, cliente_id]
    );
    if (jaComprado.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Conteúdo premium já adquirido." });
    }

    const valorBase = Number(Number(preco).toFixed(2));
    if (!valorBase || valorBase <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valor do pagamento inválido." });
    }
    const { taxaTransacao, taxaPlataforma, valorTotal } = calcTaxaStripe(valorBase);

    const valorTotalFinal = (taxa_cambio && currency !== "brl")
      ? Number((valorTotal * taxa_cambio).toFixed(2))
      : valorTotal;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmountFromValue(valorTotalFinal, currency),
      currency,
      automatic_payment_methods: { enabled: true },
      payment_method_options: {
        card: { request_three_d_secure: "any" }
      },
      description: descricao || `Premium Velvet #${premium_id}`,
      receipt_email: String(email).trim().toLowerCase(),
      metadata: {
        tipo: "premium",
        cliente_id: String(cliente_id),
        modelo_id: String(modelo_id),
        premium_post_id: String(premium_id),
        valor_base_brl: String(valorTotal),
        taxa_transacao: String(taxaTransacao),
        taxa_plataforma: String(taxaPlataforma),
        taxa_cambio: taxa_cambio ? String(taxa_cambio) : ""
      }
    });

    // Insere em premium_unlocks (o webhook busca nesta tabela para tipo=premium)
    await client.query(
      `INSERT INTO premium_unlocks
       (premium_post_id, cliente_id, modelo_id, status, metodo_pagamento,
        valor_base, taxa_transacao, taxa_plataforma, valor_total,
        gateway, stripe_payment_intent_id, pagarme_order_id, pacote_ref,
        aceite_ip, aceitou_termos, aceitou_execucao_imediata,
        aceite_timestamp, versao_termos, fingerprint,
        valor_cobrado, taxa_cambio, created_at, updated_at)
       VALUES ($1,$2,$3,'pendente','cartao',$4,$5,$6,$7,
               'stripe',$8,$8,$9,$10,$11,$12,$13,$14,$15,$7,$16,NOW(),NOW())
       ON CONFLICT (premium_post_id, cliente_id) DO UPDATE SET
         status = 'pendente',
         stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
         pagarme_order_id         = EXCLUDED.pagarme_order_id,
         valor_base               = EXCLUDED.valor_base,
         valor_total              = EXCLUDED.valor_total,
         taxa_cambio              = EXCLUDED.taxa_cambio,
         updated_at               = NOW()`,
      [
        premium_id, cliente_id, modelo_id,
        valorBase, taxaTransacao, taxaPlataforma, valorTotal,
        paymentIntent.id,
        `premium_${premium_id}_${cliente_id}`,
        ip || null,
        !!aceitou_termos, !!aceitou_execucao_imediata,
        aceite_timestamp, versao_termos || "2026-07-28",
        fingerprint || null,
        taxa_cambio
      ]
    );

    await client.query("COMMIT");

    return res.json({
      client_secret: paymentIntent.client_secret,
      payment_id: paymentIntent.id,
      currency,
      valor_brl: valorBase,
      valor_total: valorTotalFinal
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Erro /api/pagamento/premium/criar-intent:", err.message);
    return res.status(500).json({ error: "Erro ao criar pagamento", detalhe: err.message });
  } finally {
    try { client.release(); } catch (_) {}
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

    const cancelIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    registrarLog(db, {
      tipo: 'cancelamento_assinatura',
      cliente_id,
      modelo_id: Number(modelo_id),
      descricao: `Cliente cancelou assinatura VIP — modelo_id ${modelo_id}`,
      ip: cancelIp,
      user_agent: req.headers['user-agent'] || null
    });

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
      `
      SELECT id
      FROM users
      WHERE email = $1
        AND ativo = true
      LIMIT 1
      `,
      [email]
    );

    if (userRes.rowCount === 0) {
      await client.query("COMMIT");
      return res.json({ ok: true });
    }

    const userId = userRes.rows[0].id;

    await client.query(
      `DELETE FROM password_resets WHERE user_id = $1`,
      [userId]
    );

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await client.query(
      `
      INSERT INTO password_resets (
        user_id,
        codigo,
        expires_at,
        criado_em
      )
      VALUES ($1, $2, $3, NOW())
      `,
      [userId, codigo, expires]
    );

    await client.query("COMMIT");

    await resend.emails.send({
      from: "Velvet <contato@velvet.lat>",
      to: [email],
      subject: "Recuperação de senha – Velvet",
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f3fb; padding:24px; color:#2d1f3d;">
          <div style="max-width:600px; margin:0 auto; background:#ffffff; padding:32px; border-radius:12px;">

            <h2 style="margin-top:0; margin-bottom:20px; color:#6f42c1; text-align:center;">
              Recuperação de senha 🔐
            </h2>

            <p style="margin:0 0 16px; line-height:1.6;">
              Olá,
            </p>

            <p style="margin:0 0 20px; line-height:1.6;">
              Recebemos uma solicitação para redefinir a senha da sua conta na Velvet. Use o código abaixo para continuar.
            </p>

            <div style="background:#f8f4ff; padding:24px 16px; border-radius:10px; margin:20px 0; text-align:center;">
              <p style="margin:0 0 8px; font-size:13px; color:#6b5a7d; letter-spacing:0.5px; text-transform:uppercase;">
                Seu código de verificação
              </p>
              <p style="margin:0; font-size:36px; font-weight:bold; color:#6f42c1; letter-spacing:8px;">
                ${codigo}
              </p>
            </div>

            <div style="background:#fff7fb; padding:14px 16px; border-radius:10px; margin:20px 0;">
              <p style="margin:0; line-height:1.6; font-size:13px; color:#7a1f52;">
                ⏳ Este código expira em <strong>15 minutos</strong>. Se você não solicitou a recuperação de senha, ignore este email — sua conta está segura.
              </p>
            </div>

            <p style="margin:24px 0 0; line-height:1.6; text-align:center; color:#6b5a7d;">
              Equipe Velvet 💜
            </p>

          </div>
        </div>
      `
    });

    return res.json({ ok: true });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERRO PASSWORD FORGOT:", error);
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
      `
      SELECT id
      FROM users
      WHERE email = $1
        AND ativo = true
      LIMIT 1
      `,
      [email]
    );

    if (userRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Código inválido" });
    }

    const userId = userRes.rows[0].id;

    const resetRes = await client.query(
      `
      SELECT id
      FROM password_resets
      WHERE user_id = $1
        AND codigo = $2
        AND usado = false
        AND expires_at > NOW()
      ORDER BY criado_em DESC
      LIMIT 1
      `,
      [userId, codigo]
    );

    if (resetRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Código inválido ou expirado" });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await client.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
        AND ativo = true
      `,
      [senhaHash, userId]
    );

    await client.query(
      `
      UPDATE password_resets
      SET usado = true
      WHERE id = $1
      `,
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

const uploadContato = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

app.post("/api/contato", uploadContato.single("documento"), async (req, res) => {
  try {
    let { nome, email, assunto, mensagem, telefone } = req.body;

    if (!nome || !email || !assunto || !mensagem) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    nome = nome.trim().slice(0, 100);
    email = email.trim().toLowerCase().slice(0, 150);
    assunto = assunto.trim().slice(0, 150);
    mensagem = mensagem.trim().slice(0, 2000);
    telefone = (telefone || "").trim().slice(0, 30);

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

    const attachments = [];
    if (req.file) {
      attachments.push({
        filename: req.file.originalname,
        content: req.file.buffer.toString("base64")
      });
    }

    await resend.emails.send({
      from: "Velvet <contato@velvet.lat>",
      to: [process.env.EMAIL_TO],        // email onde recebes os contatos
      replyTo: email,
      subject: `[Contato] ${escape(assunto)}`,
      html: `
        <h3>Novo contato pelo site</h3>
        <p><b>Nome:</b> ${escape(nome)}</p>
        <p><b>Email:</b> ${escape(email)}</p>
        ${telefone ? `<p><b>Telefone:</b> ${escape(telefone)}</p>` : ""}
        <p><b>Assunto:</b> ${escape(assunto)}</p>
        <p><b>Mensagem:</b></p>
        <p>${escape(mensagem).replace(/\n/g, "<br>")}</p>
        ${req.file ? `<p><b>Anexo:</b> ${escape(req.file.originalname)}</p>` : ""}
      `,
      attachments: attachments.length ? attachments : undefined
    });

    return res.json({ success: true });

  } catch (error) {
    console.error("❌ Erro contato:", error);
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
      SET lida = true
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND sender = 'cliente'
        AND COALESCE(lida, false) = false
      `,
      [cliente_id, modelo_id]
    );

    await db.query(
      `
      UPDATE modelos
      SET last_seen = NOW()
      WHERE id = $1
      `,
      [modelo_id]
    );

    return res.json({
      success: true,
      atualizadas: updateRes.rowCount
    });
  } catch (err) {
    console.error("Erro marcar lido:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// ===========================
// MARCAR LIDO CLIENTE
// ===========================

app.post("/api/chat/cliente/marcar-lido/:modelo_id", authCliente, async (req, res) => {
  const userId = req.user.id;
  const modelo_id = Number(req.params.modelo_id);

  if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
    return res.status(400).json({ error: "modelo_id inválido" });
  }

  try {
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [userId]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const cliente_id = clienteRes.rows[0].id;

    const updateRes = await db.query(
      `
      UPDATE messages
      SET lida = true
      WHERE cliente_id = $1
        AND modelo_id = $2
        AND sender = 'modelo'
        AND COALESCE(lida, false) = false
      `,
      [cliente_id, modelo_id]
    );

    await db.query(
      `
      UPDATE clientes
      SET last_seen = NOW()
      WHERE id = $1
      `,
      [cliente_id]
    );

    return res.json({
      success: true,
      atualizadas: updateRes.rowCount
    });
  } catch (err) {
    console.error("Erro marcar lido cliente:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// ===========================
// CONTRATO DIGITAL — ZapSign
// ===========================

// Gera o buffer do PDF do contrato de parceria com o texto completo das 16 cláusulas
function gerarContratoPDFBuffer(dados) {
  // dados: { nome, email, dataHoje }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 60, bufferPages: true });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const L = 60;  // left margin
    const W = doc.page.width - L * 2; // usable width

    // ── Helpers ──────────────────────────────────────────────────────
    function titulo(txt) {
      doc.moveDown(0.6)
         .font("Helvetica-Bold").fontSize(10)
         .text(txt, L, doc.y, { width: W })
         .font("Helvetica").fontSize(9);
    }
    function corpo(txt) {
      doc.font("Helvetica").fontSize(9)
         .text(txt, L, doc.y, { width: W, lineGap: 2 });
    }
    function lista(itens) {
      itens.forEach(it => {
        doc.font("Helvetica").fontSize(9)
           .text(`• ${it}`, L + 12, doc.y, { width: W - 12, lineGap: 1 });
      });
    }

    // ── Cabeçalho ────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(12)
       .text("CONTRATO DE PARCERIA DIGITAL, INTERMEDIAÇÃO TECNOLÓGICA", L, L, { width: W, align: "center" })
       .text("E USO DA PLATAFORMA VELVET", L, doc.y, { width: W, align: "center" });
    doc.moveDown(0.8);

    doc.font("Helvetica").fontSize(9)
       .text("Pelo presente instrumento particular, de um lado:", L, doc.y, { width: W });
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(9)
       .text("VELVET ENTERTAINMENT LTDA", L, doc.y, { width: W, continued: true })
       .font("Helvetica")
       .text(`, pessoa jurídica de direito privado, inscrita no CNPJ sob nº 66.615.892/0001-43, com sede na Rua Cel. José Eusébio, nº 95, Casa 13, Higienópolis, São Paulo/SP, CEP 01.239-030, doravante denominada simplesmente "VELVET";`, { width: W });
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9).text("e, de outro lado,", L, doc.y, { width: W });
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(9)
       .text("CRIADORA DE CONTEÚDO / MODELO / INFLUENCER", L, doc.y, { width: W, continued: true })
       .font("Helvetica")
       .text(`, pessoa física maior de 18 (dezoito) anos, devidamente cadastrada na plataforma digital Velvet, doravante denominada simplesmente "CRIADORA";`, { width: W });
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9)
       .text("resolvem celebrar o presente CONTRATO DE PARCERIA DIGITAL E INTERMEDIAÇÃO TECNOLÓGICA, mediante as cláusulas e condições abaixo:", L, doc.y, { width: W });

    // ── Cláusulas ─────────────────────────────────────────────────────
    titulo("CLÁUSULA 1 – OBJETO");
    corpo("1.1. O presente contrato regula a utilização da plataforma digital Velvet pela CRIADORA para:");
    lista(["publicação;", "hospedagem;", "monetização;", "comercialização;", "distribuição digital;", "disponibilização de conteúdo online."]);
    corpo("1.2. A VELVET atua exclusivamente como:");
    lista(["plataforma tecnológica;", "marketplace digital;", "intermediadora de pagamentos;", "hospedeira de conteúdo;", "facilitadora de monetização digital."]);
    corpo("1.3. A VELVET NÃO:");
    lista(["produz conteúdo;", "dirige atividades da CRIADORA;", "mantém controle artístico;", "impõe metas;", "determina horários;", "realiza contratação empregatícia;", "atua como empresária individual da CRIADORA."]);
    corpo("1.4. A relação entre as partes possui natureza exclusivamente civil, comercial, tecnológica e autônoma.");

    titulo("CLÁUSULA 2 – NATUREZA AUTÔNOMA DA RELAÇÃO");
    corpo("2.1. A CRIADORA reconhece expressamente que exerce atividade autônoma e independente.");
    corpo("2.2. O presente contrato não caracteriza: vínculo empregatício, relação trabalhista, sociedade, representação comercial, associação, franquia, mandato ou relação de emprego de qualquer natureza.");
    corpo("2.3. Não há: subordinação jurídica, pessoalidade obrigatória, controle de jornada, habitualidade dirigida, salário fixo ou exclusividade.");
    corpo("2.4. A CRIADORA possui liberdade integral para definir horários, escolher conteúdos, atuar em outras plataformas, prestar serviços a terceiros, trabalhar com outras agências e interromper atividades quando desejar.");
    corpo("2.5. A utilização da plataforma ocorre por livre iniciativa da própria CRIADORA.");

    titulo("CLÁUSULA 3 – COMISSÃO E REPASSES");
    corpo("3.1. Os valores pagos pelos usuários da plataforma pertencem originariamente à CRIADORA.");
    corpo("3.2. Pela disponibilização da infraestrutura tecnológica e operacional, a VELVET fará jus à comissão de 20% (vinte por cento) sobre os valores líquidos efetivamente recebidos pela plataforma.");
    corpo("3.3. O percentual remanescente pertencerá integralmente à CRIADORA.");
    corpo("3.4. Caso a CRIADORA esteja vinculada a agência parceira, poderá haver retenção adicional de percentual contratualmente ajustado entre a agência e a própria CRIADORA.");
    corpo("3.5. A VELVET não integra eventual relação contratual privada entre agência, empresária, assessoria, intermediadores externos e a CRIADORA.");
    corpo("3.6. Os pagamentos observarão: políticas antifraude, disponibilidade bancária, compliance financeiro, regras operacionais da plataforma e prazos internos de processamento.");

    titulo("CLÁUSULA 4 – CLÁUSULA FISCAL E TRIBUTÁRIA");
    corpo("4.1. A CRIADORA é exclusivamente responsável pelo recolhimento de tributos, obrigações fiscais, declarações tributárias, contribuições previdenciárias e emissão de notas fiscais quando exigidas.");
    corpo("4.2. A VELVET atua exclusivamente como intermediadora tecnológica e financeira.");
    corpo("4.3. Os valores transitados pela plataforma incluem quantias pertencentes às CRIADORAS, sendo receita própria da VELVET exclusivamente a comissão de intermediação tecnológica prevista contratualmente.");
    corpo("4.4. Os valores destinados às CRIADORAS não constituem: salário, folha de pagamento, remuneração trabalhista ou contraprestação empregatícia.");
    corpo("4.5. Cada parte responderá individualmente perante: Receita Federal, órgãos trabalhistas, autoridades previdenciárias e administrativas, pelas próprias obrigações legais.");

    titulo("CLÁUSULA 5 – OBJETO SOCIAL E ATIVIDADE DA VELVET");
    corpo("5.1. A CRIADORA reconhece que a VELVET possui como atividade empresarial: portais e provedores de conteúdo na internet, intermediação de serviços e negócios, publicidade digital, tecnologia e desenvolvimento de software.");
    corpo("5.2. A atuação da VELVET limita-se à disponibilização de: ambiente virtual, infraestrutura tecnológica, sistemas digitais, monetização online e intermediação operacional.");

    titulo("CLÁUSULA 6 – COMPLIANCE DE CONTEÚDO");
    corpo("6.1. É proibida a publicação de: conteúdo envolvendo menores, violência real, exploração sexual ilegal, pornografia não consensual, tráfico humano, conteúdo criminoso, conteúdo obtido sem autorização, material protegido por direitos autorais sem licença, conteúdo discriminatório e vazamentos íntimos.");
    corpo("6.2. A CRIADORA declara: ser maior de 18 anos, possuir plena capacidade civil, deter autorização sobre os conteúdos publicados e possuir consentimento de terceiros eventualmente participantes.");
    corpo("6.3. A CRIADORA responsabiliza-se integralmente pelos conteúdos disponibilizados.");

    titulo("CLÁUSULA 7 – KYC E VERIFICAÇÃO DE IDENTIDADE");
    corpo("7.1. A CRIADORA deverá fornecer: documento oficial com foto, selfie de verificação, prova de maioridade e informações cadastrais verdadeiras.");
    corpo("7.2. A VELVET poderá: solicitar documentação complementar, realizar verificações antifraude, suspender contas irregulares e bloquear acessos suspeitos.");
    corpo("7.3. Os dados serão tratados conforme a Lei Geral de Proteção de Dados e o Marco Civil da Internet.");

    titulo("CLÁUSULA 8 – LICENÇA DE USO DE CONTEÚDO");
    corpo("8.1. A titularidade dos conteúdos permanece pertencendo exclusivamente à CRIADORA.");
    corpo("8.2. A CRIADORA concede à VELVET licença não exclusiva, limitada, revogável e temporária para: hospedagem, distribuição interna, exibição na plataforma, reprodução técnica e divulgação operacional.");
    corpo("8.3. A presente licença não transfere propriedade intelectual à VELVET.");

    titulo("CLÁUSULA 9 – MODERAÇÃO E REMOÇÃO");
    corpo("9.1. A VELVET poderá remover conteúdos ou suspender contas em caso de: violação legal, descumprimento contratual, risco regulatório, fraude, ordem judicial ou violação das políticas internas.");
    corpo("9.2. A moderação realizada pela VELVET não caracteriza: direção da atividade, ingerência artística, vínculo trabalhista ou responsabilidade editorial integral.");

    titulo("CLÁUSULA 10 – RESPONSABILIDADE CIVIL");
    corpo("10.1. A CRIADORA responderá integralmente por: danos a terceiros, violações legais, uso indevido de imagem, infrações autorais e conteúdos ilícitos.");
    corpo("10.2. A CRIADORA obriga-se a indenizar a VELVET por quaisquer prejuízos, condenações, multas, despesas judiciais e danos reputacionais decorrentes dos conteúdos publicados pela própria CRIADORA.");

    titulo("CLÁUSULA 11 – PROPRIEDADE INTELECTUAL");
    corpo("11.1. A VELVET permanece titular da plataforma, do software, da marca, da identidade visual e da infraestrutura tecnológica.");
    corpo("11.2. É vedada qualquer utilização indevida da marca Velvet sem autorização expressa.");

    titulo("CLÁUSULA 12 – PRIVACIDADE E DADOS");
    corpo("12.1. As partes comprometem-se a observar integralmente a LGPD.");
    corpo("12.2. Os dados coletados poderão ser utilizados para: autenticação, prevenção à fraude, processamento de pagamentos, segurança da plataforma, cumprimento regulatório e ordens judiciais.");

    titulo("CLÁUSULA 13 – PROVAS DIGITAIS");
    corpo("13.1. As partes reconhecem validade jurídica de: assinatura eletrônica, aceite digital, logs, registros de IP, geolocalização, autenticação multifator e comprovantes eletrônicos.");
    corpo("13.2. Os registros digitais poderão ser utilizados como prova judicial e extrajudicial.");

    titulo("CLÁUSULA 14 – RESCISÃO");
    corpo("14.1. O contrato vigorará por prazo indeterminado.");
    corpo("14.2. Qualquer das partes poderá rescindir o contrato a qualquer momento.");
    corpo("14.3. A VELVET poderá rescindir imediatamente em caso de: fraude, atividade ilícita, violação contratual, risco regulatório ou determinação judicial.");

    titulo("CLÁUSULA 15 – INEXISTÊNCIA DE EXCLUSIVIDADE");
    corpo("15.1. O presente contrato não estabelece exclusividade entre as partes.");
    corpo("15.2. A CRIADORA poderá utilizar outras plataformas e prestar serviços para terceiros livremente.");

    titulo("CLÁUSULA 16 – FORO");
    corpo("16.1. Fica eleito o foro da Comarca de São Paulo/SP para resolução de quaisquer controvérsias oriundas deste contrato.");

    // ── Declaração Final ─────────────────────────────────────────────
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(10)
       .text("DECLARAÇÃO FINAL DA CRIADORA", L, doc.y, { width: W, align: "center" });
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(9)
       .text("Ao aceitar este contrato, a CRIADORA declara expressamente que:", L, doc.y, { width: W });
    doc.moveDown(0.3);
    lista([
      "I – atua de forma autônoma e independente;",
      "II – compreende que a VELVET é apenas plataforma digital e marketplace tecnológico;",
      "III – reconhece inexistência de vínculo empregatício;",
      "IV – é maior de 18 anos;",
      "V – assume responsabilidade integral pelos conteúdos publicados;",
      "VI – concorda com a comissão de 20% da plataforma;",
      "VII – responsabiliza-se por suas obrigações fiscais e tributárias;",
      "VIII – aceita as políticas internas da plataforma."
    ]);

    // ── Assinaturas ────────────────────────────────────────────────────
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(9)
       .text(`São Paulo/SP, ${dados.dataHoje}.`, L, doc.y, { width: W });
    doc.moveDown(1.2);

    const metade = (W - 40) / 2;
    const col2 = L + metade + 40;

    // Velvet lado esquerdo
    doc.font("Helvetica-Bold").fontSize(9)
       .text("VELVET ENTERTAINMENT LTDA", L, doc.y, { width: metade });
    const yAssin = doc.y;
    doc.font("Helvetica").fontSize(9)
       .text("CNPJ: 66.615.892/0001-43", L, doc.y, { width: metade })
       .text("Representante Legal: _________________________", L, doc.y, { width: metade });

    // Criadora lado direito
    doc.font("Helvetica-Bold").fontSize(9)
       .text("CRIADORA / MODELO / INFLUENCER", col2, yAssin, { width: metade });
    doc.font("Helvetica").fontSize(9)
       .text(`Nome: ${dados.nome || "________________________________"}`, col2, doc.y + 4, { width: metade })
       .text(`E-mail: ${dados.email || "______________________________"}`, col2, doc.y, { width: metade })
       .text("Assinatura Eletrônica: [ZapSign]", col2, doc.y, { width: metade });

    doc.end();
  });
}

// Envia PDF para ZapSign e devolve { token, signerToken, signUrl }
async function enviarContratoZapSign(pdfBuffer, nomeModelo, emailModelo) {
  const base64Pdf = pdfBuffer.toString("base64");
  const resp = await axios.post(
    "https://api.zapsign.com.br/api/v1/docs/",
    {
      name: `Contrato Velvet — ${nomeModelo}`,
      base64_pdf: base64Pdf,
      sandbox: process.env.ZAPSIGN_SANDBOX === "true",
      signers: [
        {
          name: nomeModelo,
          email: emailModelo,
          auth_mode: "assinaturaTela",
          send_automatic_email: false
        }
      ],
      lang: "pt-br",
      disable_signer_emails: true
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.ZAPSIGN_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );
  const doc = resp.data;
  const signer = doc.signers?.[0];
  if (!signer) throw new Error("ZapSign não retornou signatário");
  const signUrl = `https://app.zapsign.com.br/verificar/${signer.token}`;
  return {
    token: doc.token,
    signerToken: signer.token,
    signUrl
  };
}

// Descarrega o PDF assinado do ZapSign e guarda no R2 privado
// Devolve a key do R2 ou null se falhar
async function descarregarPDFAssinadoZapSign(docToken, modeloId) {
  try {
    if (!process.env.ZAPSIGN_API_TOKEN) return null;

    const zapDoc = await axios.get(
      `https://api.zapsign.com.br/api/v1/docs/${docToken}/`,
      {
        headers: { Authorization: `Bearer ${process.env.ZAPSIGN_API_TOKEN}` },
        timeout: 15000
      }
    );

    const signedFileUrl = zapDoc.data?.signed_file || zapDoc.data?.original_file || null;
    if (!signedFileUrl) {
      console.warn(`[ZapSign] Documento ${docToken} não tem signed_file ainda`);
      return null;
    }

    const pdfResp = await axios.get(signedFileUrl, {
      responseType: "arraybuffer",
      timeout: 30000
    });
    const pdfBuffer = Buffer.from(pdfResp.data);

    const r2Key = `contratos/${modeloId}/contrato-assinado-${Date.now()}.pdf`;
    await s3Privado.putObject({
      Bucket: process.env.R2_BUCKET_PRIVATE,
      Key: r2Key,
      Body: pdfBuffer,
      ContentType: "application/pdf"
    }).promise();

    await db.query(
      "UPDATE modelos SET contrato_pdf_url = $1 WHERE id = $2",
      [r2Key, modeloId]
    );

    // Se a modelo já submeteu a verificação, actualizar também esse registo
    await db.query(
      `UPDATE modelos_verificacao
          SET contrato_pdf_url = $1
        WHERE modelo_id = $2
          AND (contrato_pdf_url IS NULL OR contrato_pdf_url = '')`,
      [r2Key, modeloId]
    );

    console.log(`[ZapSign] PDF assinado guardado em R2: ${r2Key}`);
    return r2Key;
  } catch (err) {
    console.warn(`[ZapSign] Erro ao descarregar PDF assinado: ${err.message}`);
    return null;
  }
}

// GET /api/verificacao/contrato/status
// Devolve se o contrato já foi assinado e a URL de assinatura actual
app.get("/api/verificacao/contrato/status", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const modeloRes = await db.query(
      `SELECT id, contrato_assinado, contrato_sign_url, contrato_assinado_em, contrato_token, contrato_signer_token
         FROM modelos WHERE user_id = $1`,
      [userId]
    );
    if (modeloRes.rowCount === 0) return res.status(404).json({ erro: "Modelo não encontrado" });
    const m = modeloRes.rows[0];

    // Buscar contrato_pdf_url também para sabermos se precisamos baixar
    const pdfRes = await db.query(
      "SELECT contrato_pdf_url FROM modelos WHERE id = $1",
      [m.id]
    );
    const jaTemPdf = !!pdfRes.rows[0]?.contrato_pdf_url;

    // Se já marcado como assinado — devolve direto (mas se não temos PDF, tentar baixar)
    if (m.contrato_assinado) {
      if (!jaTemPdf && m.contrato_token) {
        // PDF ainda não foi descarregado — tentar agora
        descarregarPDFAssinadoZapSign(m.contrato_token, m.id).catch(() => {});
      }
      return res.json({ assinado: true, assinado_em: m.contrato_assinado_em });
    }

    // Se tem signer_token, pollar ZapSign para ver se já assinou
    if (m.contrato_signer_token && process.env.ZAPSIGN_API_TOKEN) {
      try {
        const zapResp = await axios.get(
          `https://api.zapsign.com.br/api/v1/signers/${m.contrato_signer_token}/`,
          {
            headers: { Authorization: `Bearer ${process.env.ZAPSIGN_API_TOKEN}` },
            timeout: 10000
          }
        );
        const status = zapResp.data?.status;
        if (status === "signed") {
          // Actualiza BD
          await db.query(
            "UPDATE modelos SET contrato_assinado = true, contrato_assinado_em = NOW() WHERE id = $1",
            [m.id]
          );
          // Baixar o PDF assinado e guardar no R2
          if (m.contrato_token) {
            await descarregarPDFAssinadoZapSign(m.contrato_token, m.id);
          }
          return res.json({ assinado: true, assinado_em: new Date().toISOString() });
        }
      } catch (pollErr) {
        console.warn("[ZapSign] Erro ao pollar status:", pollErr.message);
      }
    }

    return res.json({
      assinado: false,
      sign_url: m.contrato_sign_url || null,
      tem_contrato: !!m.contrato_token
    });
  } catch (err) {
    console.error("Erro ao verificar status contrato:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// POST /api/verificacao/contrato
// Gera o contrato PDF, envia ao ZapSign, guarda tokens, devolve URL de assinatura
const contratoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { erro: "Muitas tentativas. Tente novamente em 1 hora." }
});

app.post("/api/verificacao/contrato", auth, contratoLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    if (req.user.role !== "modelo") {
      return res.status(403).json({ erro: "Apenas modelos podem assinar o contrato" });
    }

    // Buscar dados da modelo
    const modeloRes = await db.query(
      `SELECT m.id, m.contrato_assinado, m.contrato_sign_url, m.contrato_token,
              md.nome_completo,
              u.email
         FROM modelos m
         LEFT JOIN modelos_dados md ON md.modelo_id = m.id AND md.ativo = true
         JOIN users u ON u.id = m.user_id
        WHERE m.user_id = $1`,
      [userId]
    );
    if (modeloRes.rowCount === 0) return res.status(404).json({ erro: "Modelo não encontrada" });
    const m = modeloRes.rows[0];

    // Se já assinou — devolve URL existente
    if (m.contrato_assinado) {
      return res.json({ ok: true, ja_assinado: true });
    }

    // Se já tem documento criado no ZapSign — devolve URL existente
    if (m.contrato_token && m.contrato_sign_url) {
      return res.json({ ok: true, sign_url: m.contrato_sign_url });
    }

    if (!m.nome_completo) {
      return res.status(400).json({ erro: "Preencha primeiro os dados pessoais (Passo 2) antes de assinar o contrato." });
    }

    // Data formatada em português
    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

    // Gerar PDF
    const pdfBuffer = await gerarContratoPDFBuffer({
      nome: m.nome_completo,
      email: m.email,
      dataHoje
    });

    // Enviar ao ZapSign
    if (!process.env.ZAPSIGN_API_TOKEN) {
      return res.status(500).json({ erro: "ZapSign não configurado. Contacte o suporte." });
    }

    const { token, signerToken, signUrl } = await enviarContratoZapSign(
      pdfBuffer,
      m.nome_completo,
      m.email
    );

    // Guardar tokens no BD
    await db.query(
      `UPDATE modelos
          SET contrato_token = $1,
              contrato_signer_token = $2,
              contrato_sign_url = $3
        WHERE id = $4`,
      [token, signerToken, signUrl, m.id]
    );

    console.log(`[CONTRATO] Modelo ${m.id} — ZapSign doc ${token}`);
    res.json({ ok: true, sign_url: signUrl });
  } catch (err) {
    console.error("Erro ao criar contrato ZapSign:", err.response?.data || err.message);
    res.status(500).json({ erro: "Erro ao gerar contrato. Tente novamente." });
  }
});

// ===========================
// VERIFICACAO PERFIL
// ===========================

app.post("/api/verificacao", auth, uploadVerificacaoLimiter, uploadVerificacao.fields([{ name: "doc_frente", maxCount: 1 },{ name: "doc_verso", maxCount: 1 },{ name: "selfie", maxCount: 1 }]),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const role = req.user.role;

      const {
        documento_tipo,
        confirmacao_identidade,
        aceite_privacidade,
        aceite_termos_criador,
        versao_privacidade,
        versao_termos_criador
      } = req.body;

      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        null;

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

      if (
        confirmacao_identidade !== true &&
        confirmacao_identidade !== "true"
      ) {
        return res.status(400).json({
          erro: "É obrigatório confirmar identidade, maioridade e autorização de verificação"
        });
      }

      if (
        aceite_privacidade !== true &&
        aceite_privacidade !== "true"
      ) {
        return res.status(400).json({
          erro: "É obrigatório aceitar a Política de Privacidade"
        });
      }

      if (
        aceite_termos_criador !== true &&
        aceite_termos_criador !== "true"
      ) {
        return res.status(400).json({
          erro: "É obrigatório aceitar os Termos e Condições para Criadores"
        });
      }

      const docFrenteUrl = req.files.doc_frente[0].key;
      const docVersoUrl = req.files.doc_verso?.[0]?.key || null;
      const selfieUrl = req.files.selfie[0].key;

      // MODELO
      if (role === "modelo") {
        const modeloRes = await db.query(
          "SELECT id, contrato_assinado, contrato_pdf_url FROM modelos WHERE user_id = $1",
          [userId]
        );

        if (modeloRes.rowCount === 0) {
          return res.status(400).json({ erro: "Modelo não encontrado" });
        }

        const { id: modeloId, contrato_assinado, contrato_pdf_url } = modeloRes.rows[0];

        // Verificar se o contrato foi assinado antes de aceitar documentos
        if (!contrato_assinado) {
          return res.status(403).json({
            erro: "CONTRACT_NOT_SIGNED",
            message: "O contrato de parceria ainda não foi assinado. Conclua o Passo 3 antes de enviar os documentos."
          });
        }

        await db.query(
          `
          INSERT INTO modelos_verificacao (
            modelo_id,
            documento_tipo,
            doc_frente_url,
            doc_verso_url,
            selfie_url,
            confirmacao_identidade,
            aceite_privacidade,
            aceite_termos_criador,
            versao_privacidade,
            versao_termos_criador,
            aceite_em,
            aceite_ip,
            status,
            contrato_pdf_url,
            criado_em,
            atualizado_em
          )
          VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10,
            NOW(),$11,'em_analise',$12, NOW(), NOW()
          )
          ON CONFLICT (modelo_id)
          DO UPDATE SET
            documento_tipo = EXCLUDED.documento_tipo,
            doc_frente_url = EXCLUDED.doc_frente_url,
            doc_verso_url = EXCLUDED.doc_verso_url,
            selfie_url = EXCLUDED.selfie_url,
            confirmacao_identidade = EXCLUDED.confirmacao_identidade,
            aceite_privacidade = EXCLUDED.aceite_privacidade,
            aceite_termos_criador = EXCLUDED.aceite_termos_criador,
            versao_privacidade = EXCLUDED.versao_privacidade,
            versao_termos_criador = EXCLUDED.versao_termos_criador,
            aceite_em = NOW(),
            aceite_ip = EXCLUDED.aceite_ip,
            status = 'em_analise',
            contrato_pdf_url = EXCLUDED.contrato_pdf_url,
            atualizado_em = NOW()
          `,
          [
            modeloId,
            documento_tipo,
            docFrenteUrl,
            docVersoUrl,
            selfieUrl,
            true,
            true,
            true,
            versao_privacidade || "2026-04-06",
            versao_termos_criador || "2026-07-13",
            ip,
            contrato_pdf_url || null
          ]
        );

        const { rows: modeloNomeRows } = await db.query(
          "SELECT nome_exibicao, nome FROM modelos WHERE id = $1",
          [modeloId]
        );
        const nomeModelo = modeloNomeRows[0]?.nome_exibicao || modeloNomeRows[0]?.nome || `Modelo #${modeloId}`;

        await criarNotificacaoAdmin(db, req.app.get("io"), {
          tipo: "verificacao_modelo",
          referencia_id: modeloId,
          titulo: "Nova verificação em análise",
          mensagem: `Modelo ${nomeModelo} enviou documentos para verificação.`
        });

        return res.json({ ok: true });
      }

      // CLIENTE
      if (role === "cliente") {
        const clienteRes = await db.query(
          "SELECT id FROM clientes WHERE user_id = $1",
          [userId]
        );

        if (clienteRes.rowCount === 0) {
          return res.status(400).json({ erro: "Cliente não encontrado" });
        }

        const clienteId = clienteRes.rows[0].id;

        await db.query(
          `
          INSERT INTO clientes_verificacao (
            cliente_id,
            documento_tipo,
            doc_frente_url,
            doc_verso_url,
            selfie_url,
            confirmacao_identidade,
            aceite_privacidade,
            aceite_termos_criador,
            versao_privacidade,
            versao_termos_criador,
            aceite_em,
            aceite_ip,
            status,
            criado_em,
            atualizado_em
          )
          VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10,
            NOW(),$11,'em_analise', NOW(), NOW()
          )
          ON CONFLICT (cliente_id)
          DO UPDATE SET
            documento_tipo = EXCLUDED.documento_tipo,
            doc_frente_url = EXCLUDED.doc_frente_url,
            doc_verso_url = EXCLUDED.doc_verso_url,
            selfie_url = EXCLUDED.selfie_url,
            confirmacao_identidade = EXCLUDED.confirmacao_identidade,
            aceite_privacidade = EXCLUDED.aceite_privacidade,
            aceite_termos_criador = EXCLUDED.aceite_termos_criador,
            versao_privacidade = EXCLUDED.versao_privacidade,
            versao_termos_criador = EXCLUDED.versao_termos_criador,
            aceite_em = NOW(),
            aceite_ip = EXCLUDED.aceite_ip,
            status = 'em_analise',
            atualizado_em = NOW()
          `,
          [
            clienteId,
            documento_tipo,
            docFrenteUrl,
            docVersoUrl,
            selfieUrl,
            true,
            true,
            true,
            versao_privacidade || "2026-04-06",
            versao_termos_criador || "2026-07-13",
            ip
          ]
        );

        await criarNotificacaoAdmin(db, req.app.get("io"), {
          tipo: "verificacao_cliente",
          referencia_id: clienteId,
          titulo: "Nova verificação em análise",
          mensagem: `Cliente #${clienteId} enviou documentos para verificação.`
        });

        return res.json({ ok: true });
      }

      return res.status(403).json({ erro: "Role inválida" });
    } catch (err) {
      console.error("❌ Erro upload verificação:", err);
      return res.status(500).json({ erro: "Erro ao enviar documentos" });
    }
  }
);

// ===========================
// ACEITE DE TERMOS (MODELO)
// ===========================

const VERSAO_TERMOS_ATUAL = "2026-07-13";

// GET /api/modelo/aceite-termos/status
// Verifica se a modelo já aceitou a versão atual dos termos
app.get("/api/modelo/aceite-termos/status", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const modeloRes = await db.query(
      "SELECT id, termos_aceites, termos_versao FROM modelos WHERE user_id = $1",
      [userId]
    );

    if (!modeloRes.rowCount) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    const { id: modeloId, termos_aceites, termos_versao } = modeloRes.rows[0];
    const precisaAceitar = !termos_aceites || termos_versao !== VERSAO_TERMOS_ATUAL;

    let aceite = null;
    if (!precisaAceitar) {
      const aceiteRes = await db.query(
        "SELECT aceite_em, versao FROM modelo_aceite_termos WHERE modelo_id = $1 AND versao = $2",
        [modeloId, VERSAO_TERMOS_ATUAL]
      );
      aceite = aceiteRes.rows[0] || null;
    }

    res.json({
      aceito: !precisaAceitar,
      versao_atual: VERSAO_TERMOS_ATUAL,
      versao_aceite: termos_versao || null,
      aceite_em: aceite?.aceite_em || null
    });
  } catch (err) {
    console.error("Erro ao verificar aceite de termos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// POST /api/modelo/aceite-termos
// Regista o aceite das 5 declarações com evidência forense (IP, UA, versão, timestamp)
app.post("/api/modelo/aceite-termos", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      aceite_maioridade,
      aceite_conteudo,
      aceite_tributario,
      aceite_independente,
      aceite_financeiro,
      user_agent: uaFromBody
    } = req.body;

    // Todos os 5 aceites são obrigatórios
    const todos = [aceite_maioridade, aceite_conteudo, aceite_tributario, aceite_independente, aceite_financeiro];
    if (todos.some(v => v !== true && v !== "true")) {
      return res.status(400).json({ erro: "Todas as declarações são obrigatórias" });
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || null;

    const ua = uaFromBody || req.headers["user-agent"] || null;

    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [userId]
    );

    if (!modeloRes.rowCount) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    const modeloId = modeloRes.rows[0].id;

    // Registo auditável com UPSERT (garante que re-aceite actualiza o registo)
    await db.query(`
      INSERT INTO modelo_aceite_termos (
        modelo_id, versao,
        aceite_maioridade, aceite_conteudo, aceite_tributario,
        aceite_independente, aceite_financeiro,
        aceite_ip, aceite_user_agent, aceite_em
      )
      VALUES ($1, $2, true, true, true, true, true, $3, $4, NOW())
      ON CONFLICT (modelo_id, versao) DO UPDATE SET
        aceite_maioridade   = true,
        aceite_conteudo     = true,
        aceite_tributario   = true,
        aceite_independente = true,
        aceite_financeiro   = true,
        aceite_ip           = EXCLUDED.aceite_ip,
        aceite_user_agent   = EXCLUDED.aceite_user_agent,
        aceite_em           = NOW()
    `, [modeloId, VERSAO_TERMOS_ATUAL, ip, ua]);

    // Actualizar atalho na tabela modelos
    await db.query(
      "UPDATE modelos SET termos_aceites = true, termos_versao = $1 WHERE id = $2",
      [VERSAO_TERMOS_ATUAL, modeloId]
    );

    console.log(`[TERMOS] Modelo ${modeloId} aceitou termos v${VERSAO_TERMOS_ATUAL} | IP: ${ip}`);

    res.json({ ok: true, versao: VERSAO_TERMOS_ATUAL, aceite_em: new Date().toISOString() });
  } catch (err) {
    console.error("Erro ao registar aceite de termos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ===========================
// CARREGAR MIDIAS CONTEUDOS
// ===========================

app.post("/api/conteudos", authModelo, uploadLimiter, uploadB2.array("file", 10), async (req, res) => {

    const userId = req.user.id;
    const { preco, descricao } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: "Arquivo obrigatório"
      });
    }

    try {

      const modeloRes = await db.query(
        "SELECT id, verificada FROM modelos WHERE user_id = $1",
        [userId]
      );

      if (modeloRes.rowCount === 0) {
        return res.status(404).json({
          error: "Modelo não encontrado"
        });
      }

      if (!modeloRes.rows[0].verificada) {
        return res.status(403).json({ error: "Conta não verificada. Apenas modelos verificadas podem fazer upload de conteúdos." });
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

  try {
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
    `, [message_id, cliente_id]);

    res.json({ ok: true });

  } catch (err) {
    console.error("Erro ao marcar conteúdo como visto:", err);
    res.status(500).json({ error: "Erro interno" });
  }

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
// ATIVAR PUSH NATIVO (CAPACITOR - FCM/APNs)
// ===========================

app.post("/api/notificacoes/inscrever-dispositivo", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, platform } = req.body;

    if (!token || !platform) {
      return res.status(400).json({ error: "Token ou plataforma inválidos" });
    }

    await db.query(
      `
      INSERT INTO device_push_tokens (user_id, token, platform, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (user_id, platform)
      DO UPDATE SET
        token = EXCLUDED.token,
        updated_at = NOW()
      `,
      [userId, token, platform]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao salvar device token:", err);
    return res.status(500).json({ error: "Erro ao salvar token do dispositivo" });
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
          data_fim = NOW(),
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

// ===========================
// PUBLI PREMIUM
// ===========================

app.post("/api/premium", auth, authModelo, uploadLimiter, uploadB2.array("files", 10), async (req, res) => {
  const client = await db.connect();

  try {
    const userId = Number(req.user?.id || 0);
    const { descricao, preco } = req.body;
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ error: "Envie ao menos uma mídia" });
    }

    const precoNum = Number(preco);
    if (!precoNum || precoNum <= 0) {
      return res.status(400).json({ error: "Preço inválido" });
    }

    const modeloRes = await client.query(
      `
      SELECT id, verificada
      FROM modelos
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (!modeloRes.rowCount) {
      return res.status(404).json({ error: "Modelo não encontrado" });
    }

    if (!modeloRes.rows[0].verificada) {
      return res.status(403).json({ error: "Conta não verificada. Apenas modelos verificadas podem publicar conteúdo premium." });
    }

    const modelo_id = Number(modeloRes.rows[0].id);

    await client.query("BEGIN");

    const postRes = await client.query(
      `
      INSERT INTO premium_posts (
        modelo_id,
        url,
        thumb_url,
        tipo,
        tipo_conteudo,
        preco,
        descricao,
        ativo,
        created_at,
        updated_at
      )
      VALUES ($1, NULL, NULL, NULL, $2, $3, $4, true, NOW(), NOW())
      RETURNING id, modelo_id, url, thumb_url, tipo, tipo_conteudo, preco, descricao, ativo, created_at, updated_at
      `,
      [modelo_id, "premium", precoNum, descricao || null]
    );

    const premium_post_id = Number(postRes.rows[0].id);
    const midiasCriadas = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mimetype = file.mimetype || "";
      const tipo = mimetype.startsWith("video") ? "video" : "foto";

      let url = null;
      let thumb_url = null;

      if (tipo === "foto") {
        const imageResult = await uploadCloudflareImage(
          file.buffer,
          file.originalname || `premium-${Date.now()}-${i}.jpg`
        );

        url = imageResult?.variants?.[0] || null;
        thumb_url = url;
      } else {
        const videoResult = await uploadVideoCloudflare(
          file.buffer,
          file.originalname || `premium-${Date.now()}-${i}.mp4`
        );

        const uid = videoResult?.uid || null;

        url = uid
          ? `https://videodelivery.net/${uid}/manifest/video.m3u8`
          : null;

        thumb_url = videoResult?.thumbnail || (
          uid
            ? `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg`
            : null
        );
      }

      if (!url) {
        throw new Error(`Falha ao enviar arquivo ${i + 1} para Cloudflare`);
      }

      const midiaRes = await client.query(
        `
        INSERT INTO premium_post_midias (
          premium_post_id,
          url,
          thumb_url,
          tipo,
          ordem,
          ativo,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        RETURNING id, premium_post_id, url, thumb_url, tipo, ordem
        `,
        [premium_post_id, url, thumb_url, tipo, i]
      );

      midiasCriadas.push(midiaRes.rows[0]);
    }

    const primeiraMidia = midiasCriadas[0] || null;

    await client.query(
      `
      UPDATE premium_posts
      SET
        url = $1,
        thumb_url = $2,
        tipo = $3,
        updated_at = NOW()
      WHERE id = $4
      `,
      [
        primeiraMidia?.url || null,
        primeiraMidia?.thumb_url || null,
        primeiraMidia?.tipo || null,
        premium_post_id
      ]
    );

    await client.query("COMMIT");

    return res.json({
      ...postRes.rows[0],
      url: primeiraMidia?.url || null,
      thumb_url: primeiraMidia?.thumb_url || null,
      tipo: primeiraMidia?.tipo || null,
      tipo_conteudo: "premium",
      midias: midiasCriadas
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("=================================");
    console.error("Erro criar premium:");
    console.error("message:", err.message);
    console.error("code:", err.code);
    console.error("detail:", err.detail);
    console.error("table:", err.table);
    console.error("constraint:", err.constraint);
    console.error("stack:", err.stack);

    return res.status(500).json({
      error: "Erro ao criar premium",
      debug: err.message
    });
  } finally {
    client.release();
  }
});

// ===============================
// CANCELAMENTO DE EMAIL (1 clique, via link assinado no Brevo)
// ===============================

app.get("/api/email/desinscrever", async (req, res) => {
  const paginaResultado = (titulo, mensagem) => `<!DOCTYPE html>
    <html lang="pt"><head><meta charset="utf-8"><title>${titulo}</title></head>
    <body style="font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0ebfa;">
      <div style="text-align:center;background:#fff;padding:40px;border-radius:14px;max-width:420px;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
        <h2 style="color:#6f42c1;margin:0 0 12px;">${titulo}</h2>
        <p style="color:#7a6a9a;margin:0;">${mensagem}</p>
      </div>
    </body></html>`;

  try {
    const { token } = req.query;
    if (!token) throw new Error("token ausente");

    const { email, tipo } = jwt.verify(token, process.env.JWT_SECRET);

    const colunasValidas = {
      novidades_plataforma: "pref_novidades_plataforma",
      novidades_criadoras: "pref_novidades_criadoras",
      ofertas: "pref_ofertas"
    };
    const coluna = colunasValidas[tipo] || "pref_novidades_criadoras";

    const clienteRes = await db.query(
      `UPDATE clientes c SET ${coluna} = false
       FROM users u
       WHERE u.id = c.user_id AND u.email = $1
       RETURNING c.id`,
      [email]
    );

    if (clienteRes.rowCount) {
      const cliente_id = clienteRes.rows[0].id;

      if (coluna === "pref_novidades_criadoras") {
        const vips = await db.query(`
          SELECT m.brevo_list_id
          FROM vip_subscriptions v
          JOIN modelos m ON m.id = v.modelo_id
          WHERE v.cliente_id = $1 AND v.ativo = true AND m.brevo_list_id IS NOT NULL
        `, [cliente_id]);
        for (const row of vips.rows) {
          try { await removerContatoAudienceVIP(row.brevo_list_id, email); } catch (e) { console.error("Erro ao remover de lista VIP:", e.message); }
        }
      } else if (coluna === "pref_novidades_plataforma") {
        try { await removerContatoAudienceVIP(4, email); } catch (e) { console.error("Erro ao remover da lista geral:", e.message); }
      }
    }

    res.send(paginaResultado("✅ Sua preferência foi salva com sucesso", "Você não vai mais receber esse tipo de email."));
  } catch (err) {
    console.error("Erro /api/email/desinscrever:", err.message);
    res.status(400).send(paginaResultado("Link inválido", "Esse link de cancelamento não é válido ou já expirou."));
  }
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor rodando na porta", PORT);

  // Job automático: sync social a cada 6h
  // Processa até 5 modelos por rodada (novos ou com >30 dias sem sync)
  // Espera 2 min após startup para não atrasar o boot
  setTimeout(function runSocialSyncJob() {
    db.query(
      `SELECT modelo_id FROM modelos_dados
       WHERE ativo = true
         AND (instagram IS NOT NULL AND instagram <> '' OR tiktok IS NOT NULL AND tiktok <> '')
         AND (social_sync_em IS NULL OR social_sync_em < NOW() - INTERVAL '30 days')
       ORDER BY social_sync_em ASC NULLS FIRST
       LIMIT 5`
    ).then(async (r) => {
      if (r.rows.length) {
        console.log(`[SyncSocial Auto] ${r.rows.length} modelo(s) para sincronizar`);
        for (const row of r.rows) {
          await syncSocialData(row.modelo_id);
          await new Promise(res => setTimeout(res, 3000));
        }
      }
    }).catch(e => console.error("[SyncSocial Auto] erro:", e.message))
      .finally(() => setTimeout(runSocialSyncJob, 6 * 60 * 60 * 1000)); // próxima rodada em 6h
  }, 10 * 60 * 1000); // aguarda 10 min após boot
});

// Garante coluna para Resend Audience (idempotente)
db.query("ALTER TABLE modelos ADD COLUMN IF NOT EXISTS resend_audience_id TEXT")
  .catch(err => console.error("Migração resend_audience_id:", err.message));


// Chargebacks: campos de vínculo com cliente/modelo
db.query(`
  ALTER TABLE chargebacks
    ADD COLUMN IF NOT EXISTS cliente_id BIGINT,
    ADD COLUMN IF NOT EXISTS modelo_id BIGINT,
    ADD COLUMN IF NOT EXISTS tipo VARCHAR(50),
    ADD COLUMN IF NOT EXISTS gateway VARCHAR(20)
`).catch(err => console.error("Migração chargebacks cols:", err.message));

// transacoes_agency: campos de chargeback
db.query(`
  ALTER TABLE transacoes_agency
    ADD COLUMN IF NOT EXISTS gateway VARCHAR(20),
    ADD COLUMN IF NOT EXISTS chargeback_motivo TEXT
`).catch(err => console.error("Migração transacoes_agency cols:", err.message));

// transacoes_agency: disponibilidade de saque (Stripe balance/reserve)
db.query(`
  ALTER TABLE transacoes_agency
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
    ADD COLUMN IF NOT EXISTS disponivel_em TIMESTAMPTZ
`).catch(err => console.error("Migração transacoes_agency disponivel_em:", err.message));

// ── CRON: avisos VIP (a cada hora, substitui o cron do Render) ──
const cron = require("node-cron");
const {
  enviarEmailAviso7Dias,
  enviarEmailAviso24h,
  enviarEmailOfertaExpirando,
  enviarCampanhaNovidadeFeed,
  enviarCampanhaNovidadePremium,
  enviarCampanhaNovidadeChat,
  enviarCampanhaNovidadeOferta,
  enviarCampanhaDigestDiario,
  removerContatoAudienceVIP
} = require("./email");

async function processarAvisosVip() {
  console.log("🔔 [VIP Cron] Verificando assinaturas próximas do vencimento...");

  try {
    // 7 dias
    const seteDias = await db.query(`
      SELECT v.id, v.modelo_id, u.email
      FROM vip_subscriptions v
      JOIN clientes c ON c.id = v.cliente_id
      JOIN users u ON u.id = c.user_id
      WHERE v.ativo = true
        AND v.aviso_7_dias_enviado = false
        AND v.expiration_at BETWEEN NOW() + INTERVAL '6 days' AND NOW() + INTERVAL '7 days'
    `);

    for (const row of seteDias.rows) {
      try {
        await enviarEmailAviso7Dias(row.email, row.modelo_id);
        await db.query(
          "UPDATE vip_subscriptions SET aviso_7_dias_enviado = true WHERE id = $1",
          [row.id]
        );
        console.log(`[VIP Cron] Aviso 7d enviado → ${row.email}`);
      } catch (err) {
        console.error("[VIP Cron] Erro aviso 7d:", err.message);
      }
    }

    // 24 horas
    const vinte4h = await db.query(`
      SELECT v.id, v.modelo_id, u.email
      FROM vip_subscriptions v
      JOIN clientes c ON c.id = v.cliente_id
      JOIN users u ON u.id = c.user_id
      WHERE v.ativo = true
        AND v.aviso_24h_enviado = false
        AND v.expiration_at BETWEEN NOW() AND NOW() + INTERVAL '1 day'
    `);

    for (const row of vinte4h.rows) {
      try {
        await enviarEmailAviso24h(row.email, row.modelo_id);
        await db.query(
          "UPDATE vip_subscriptions SET aviso_24h_enviado = true WHERE id = $1",
          [row.id]
        );
        console.log(`[VIP Cron] Aviso 24h enviado → ${row.email}`);
      } catch (err) {
        console.error("[VIP Cron] Erro aviso 24h:", err.message);
      }
    }

    console.log("✅ [VIP Cron] Avisos processados.");
  } catch (err) {
    console.error("🔥 [VIP Cron] Erro geral:", err.message);
  }
}

async function processarOfertasExpirando() {
  try {
    // Desativa ofertas vencidas
    await db.query(`
      UPDATE ofertas SET ativa = false
      WHERE ativa = true AND data_fim < NOW()
    `);

    // Envia aviso para modelos com oferta expirando em até 24h
    const expirando = await db.query(`
      SELECT o.id, o.nome, o.data_fim, o.assinaturas_usadas, o.limite_assinaturas,
             m.nome_exibicao, u.email
      FROM ofertas o
      JOIN modelos m ON m.id = o.modelo_id
      JOIN users u ON u.id = m.user_id
      WHERE o.ativa = true
        AND o.data_fim BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
        AND (o.aviso_expiracao_enviado IS NULL OR o.aviso_expiracao_enviado = false)
    `);

    for (const row of expirando.rows) {
      try {
        await enviarEmailOfertaExpirando({
          email: row.email,
          nome_modelo: row.nome_exibicao,
          nome_oferta: row.nome,
          data_fim: row.data_fim,
          assinaturas_usadas: row.assinaturas_usadas,
          limite_assinaturas: row.limite_assinaturas
        });
        await db.query(
          "UPDATE ofertas SET aviso_expiracao_enviado = true WHERE id = $1",
          [row.id]
        );
        console.log(`[Ofertas Cron] Aviso expiração enviado → ${row.email} (oferta #${row.id})`);
      } catch (err) {
        console.error("[Ofertas Cron] Erro aviso expiração:", err.message);
      }
    }
  } catch (err) {
    console.error("[Ofertas Cron] Erro geral:", err.message);
  }
}

// Executa a cada hora (minuto 0 de cada hora)
cron.schedule("0 * * * *", processarAvisosVip);
cron.schedule("0 * * * *", processarOfertasExpirando);

// ===========================
// NOVIDADES → EMAIL PARA VIPS
// ===========================

async function notificarModeloPorEmail(modelo_id, enviarFn) {
  const modeloRes = await db.query("SELECT nome_exibicao FROM modelos WHERE id = $1", [modelo_id]);
  if (!modeloRes.rowCount) return;

  const nome_modelo = modeloRes.rows[0].nome_exibicao;
  const audience_id = await obterOuCriarAudienceVIP(db, modelo_id, nome_modelo);
  await enviarFn(audience_id, nome_modelo);
}

async function processarNovidadesParaEmail() {
  console.log("📣 [Digest Diário] Agregando novidades do dia para envio às VIPs...");

  try {
    // Coleta todos os modelos com qualquer tipo de conteúdo pendente
    const [feedRes, chatRes, premiumRes, ofertaRes] = await Promise.all([
      db.query(`
        SELECT modelo_id, COUNT(*) AS qtd, array_agg(id) AS ids
        FROM conteudos
        WHERE tipo_conteudo = 'feed' AND ativo = true AND email_novidade_enviado = false
        GROUP BY modelo_id
      `),
      db.query(`
        SELECT modelo_id, COUNT(*) AS qtd, array_agg(id) AS ids
        FROM conteudos
        WHERE tipo_conteudo = 'venda' AND ativo = true AND email_novidade_enviado = false
        GROUP BY modelo_id
      `),
      db.query(`
        SELECT id, modelo_id, descricao, preco
        FROM premium_posts
        WHERE ativo = true AND email_novidade_enviado = false
      `),
      db.query(`
        SELECT id, modelo_id, desconto_percentual, mensagem, data_fim
        FROM ofertas
        WHERE ativa = true AND data_fim > NOW() AND email_novidade_enviado = false
      `)
    ]);

    // Agrupa tudo por modelo_id
    const porModelo = {};

    for (const row of feedRes.rows) {
      const m = porModelo[row.modelo_id] ||= { feed_qtd: 0, feed_ids: [], chat_qtd: 0, chat_ids: [], premiums: [], premium_ids: [], oferta: null, oferta_id: null };
      m.feed_qtd = Number(row.qtd);
      m.feed_ids = row.ids;
    }

    for (const row of chatRes.rows) {
      const m = porModelo[row.modelo_id] ||= { feed_qtd: 0, feed_ids: [], chat_qtd: 0, chat_ids: [], premiums: [], premium_ids: [], oferta: null, oferta_id: null };
      m.chat_qtd = Number(row.qtd);
      m.chat_ids = row.ids;
    }

    for (const row of premiumRes.rows) {
      const m = porModelo[row.modelo_id] ||= { feed_qtd: 0, feed_ids: [], chat_qtd: 0, chat_ids: [], premiums: [], premium_ids: [], oferta: null, oferta_id: null };
      m.premiums.push({ preco: row.preco, descricao: row.descricao });
      m.premium_ids.push(row.id);
    }

    for (const row of ofertaRes.rows) {
      const m = porModelo[row.modelo_id] ||= { feed_qtd: 0, feed_ids: [], chat_qtd: 0, chat_ids: [], premiums: [], premium_ids: [], oferta: null, oferta_id: null };
      // Fica com a oferta de maior desconto caso haja mais de uma
      if (!m.oferta || row.desconto_percentual > m.oferta.desconto_percentual) {
        m.oferta = { desconto_percentual: row.desconto_percentual, mensagem: row.mensagem, data_fim: row.data_fim };
        m.oferta_id = row.id;
      }
    }

    const modeloIds = Object.keys(porModelo);
    if (!modeloIds.length) {
      console.log("✅ [Digest Diário] Nenhuma novidade pendente.");
      return;
    }

    // Envia UM digest por modelo e marca tudo como enviado
    for (const modelo_id of modeloIds) {
      const dados = porModelo[modelo_id];
      try {
        const modeloRes = await db.query("SELECT nome_exibicao FROM modelos WHERE id = $1", [modelo_id]);
        if (!modeloRes.rowCount) continue;
        const nome_modelo = modeloRes.rows[0].nome_exibicao;
        const audience_id = await obterOuCriarAudienceVIP(db, Number(modelo_id), nome_modelo);

        await enviarCampanhaDigestDiario({
          audience_id,
          nome_modelo,
          modelo_id: Number(modelo_id),
          feed_qtd: dados.feed_qtd,
          chat_qtd: dados.chat_qtd,
          premiums: dados.premiums,
          oferta: dados.oferta
        });

        // Marca como enviado
        if (dados.feed_ids.length)    await db.query(`UPDATE conteudos SET email_novidade_enviado = true WHERE id = ANY($1)`, [dados.feed_ids]);
        if (dados.chat_ids.length)    await db.query(`UPDATE conteudos SET email_novidade_enviado = true WHERE id = ANY($1)`, [dados.chat_ids]);
        if (dados.premium_ids.length) await db.query(`UPDATE premium_posts SET email_novidade_enviado = true WHERE id = ANY($1)`, [dados.premium_ids]);
        if (dados.oferta_id)          await db.query(`UPDATE ofertas SET email_novidade_enviado = true WHERE id = $1`, [dados.oferta_id]);

        console.log(`[Digest Diário] Enviado → modelo ${modelo_id} (feed:${dados.feed_qtd} chat:${dados.chat_qtd} premium:${dados.premium_ids.length} oferta:${dados.oferta_id ? 1 : 0})`);
      } catch (err) {
        console.error(`[Digest Diário] Erro modelo ${modelo_id}:`, err.message);
      }
    }

    console.log("✅ [Digest Diário] Processamento concluído.");
  } catch (err) {
    console.error("🔥 [Digest Diário] Erro geral:", err.message);
  }
}

// Executa uma vez por dia às 21h (horário do servidor)
cron.schedule("0 21 * * *", processarNovidadesParaEmail);

// Gera automaticamente o fechamento do mês anterior para todas as agências, todo dia 1º às 03h
// (fallback: o fechamento das agências também é disparado quando o admin gera o fechamento geral)
async function gerarFechamentosAutomaticosAgencias() {
  try {
    const hoje = new Date();
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ano = mesAnterior.getFullYear();
    const mes = mesAnterior.getMonth() + 1;

    const resultado = await agencyDashboardRouter.gerarFechamentosTodasAgencias(ano, mes);
    console.log(`[Fechamento Agência Cron] ${mes}/${ano}: ${resultado.geradas} geradas, ${resultado.ignoradas} ignoradas`);
  } catch (err) {
    console.error("[Fechamento Agência Cron] Erro geral:", err.message);
  }
}

cron.schedule("0 3 1 * *", gerarFechamentosAutomaticosAgencias);

// ── CRON: sincroniza disponibilidade de saque das transações de cartão (Stripe) ──
// Roda 1x ao dia: busca o `available_on` real (Balance Transaction) de cada
// transacoes_agency com gateway='stripe' ainda sem disponivel_em definido.
async function sincronizarDisponibilidadeStripe() {
  console.log("💳 [Sync Stripe] Verificando disponibilidade de saque das transações de cartão...");

  try {
    const pendentes = await db.query(`
      SELECT id, stripe_payment_intent_id
      FROM transacoes_agency
      WHERE gateway = 'stripe'
        AND disponivel_em IS NULL
        AND stripe_payment_intent_id IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 200
    `);

    let atualizadas = 0;
    let semSaldoAinda = 0;

    for (const row of pendentes.rows) {
      try {
        const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id, {
          expand: ["latest_charge.balance_transaction"]
        });

        const bt = pi?.latest_charge?.balance_transaction;

        if (!bt || !bt.available_on) {
          semSaldoAinda++;
          continue;
        }

        const disponivelEm = new Date(bt.available_on * 1000);

        await db.query(
          `UPDATE transacoes_agency SET disponivel_em = $1 WHERE id = $2`,
          [disponivelEm, row.id]
        );
        atualizadas++;
      } catch (err) {
        console.error(`[Sync Stripe] Erro na transacao_agency id=${row.id}:`, err.message);
      }
    }

    console.log(`✅ [Sync Stripe] ${atualizadas} atualizadas, ${semSaldoAinda} ainda sem balance_transaction, ${pendentes.rowCount} verificadas.`);
  } catch (err) {
    console.error("🔥 [Sync Stripe] Erro geral:", err.message);
  }
}

cron.schedule("0 4 * * *", sincronizarDisponibilidadeStripe);

// Backup diário Cloudflare R2 → Backblaze B2
require("./scripts/cron-backup");

// Migração: coluna de controle do aviso de expiração
db.query("ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS aviso_expiracao_enviado BOOLEAN DEFAULT false")
  .catch(err => console.error("Migração aviso_expiracao_enviado:", err.message));
