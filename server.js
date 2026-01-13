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
const { MercadoPagoConfig, Payment } = require("mercadopago");
const CONTEUDOS_FILE = "conteudos.json";
const MODELOS_FILE = "modelos.json";
const COMPRAS_FILE = "compras.json";
const bodyParser = require("body-parser");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const contentRouter = require("./servercontent");
const nodemailer = require("nodemailer");
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", contentRouter);
app.use("/content", contentRouter);
app.use(cors({
  origin: ["https://velvet-app-production.up.railway.app"],
  credentials: true
}));

app.use(express.static(path.join(__dirname, "public")));

app.post("/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
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
    return res.status(400).send(`Webhook Error`);
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;

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

  console.log("✅ CONTEÚDO PAGO (CARTÃO) REGISTRADO:", message_id);

  const sala = `chat_${cliente_id}_${modelo_id}`;
  io.to(sala).emit("conteudoVisto", {
    message_id: Number(message_id)
  });
}



    if (pi.metadata?.tipo === "vip") {
      await ativarVipAssinatura({
        cliente_id: pi.metadata.cliente_id,
        modelo_id: pi.metadata.modelo_id,
        valor_assinatura: pi.metadata.valor_assinatura,
        taxa_transacao: pi.metadata.taxa_transacao,
        taxa_plataforma: pi.metadata.taxa_plataforma
      });

      // 🔔 socket realtime
      const sid = onlineClientes[pi.metadata.cliente_id];
      if (sid) {
        io.to(sid).emit("vipAtivado", {
          modelo_id: pi.metadata.modelo_id
        });
      }
    }
  }

  res.json({ received: true });
});

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
app.use("/", servercontent);

const requireRole = require("./middleware/requireRole");

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
    origin: "https://velvet-app-production.up.railway.app",
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
      expiration_at    = EXCLUDED.expiration_at
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
    SELECT 1 FROM vip_subscriptions
    WHERE cliente_id = $1
      AND modelo_id = $2
      AND ativo = true
    `,
    [cliente_id, modelo_id]
  );

  res.json({ vip: result.rowCount > 0 });
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
      SELECT id, url, tipo
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

app.get("/api/modelo/publico/:id", auth, async (req, res) => {
  const modelo_id = Number(req.params.id);

  if (!Number.isInteger(modelo_id)) {
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
    AS ultima_msg_modelo_ts

FROM vip_subscriptions v

JOIN clientes c 
  ON c.user_id = v.cliente_id

LEFT JOIN clientes_dados cd
  ON cd.user_id = c.user_id

LEFT JOIN messages m 
  ON m.cliente_id = c.user_id
 AND m.modelo_id = $1

WHERE v.modelo_id = $1
  AND v.ativo = true

GROUP BY c.user_id, cd.username, c.nome, cd.avatar
ORDER BY ultima_msg_modelo_ts DESC NULLS LAST;


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
      SELECT id, url, tipo
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

      const url = result.rows[0].url;

      // 🔥 tenta apagar no Cloudinary (não pode quebrar)
      try {
        const publicId = url
          .split("/")
          .slice(-2)
          .join("/")
          .replace(/\.[^/.]+$/, "");

        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.warn("⚠️ Falha ao apagar no Cloudinary, seguindo:", e.message);
      }

      // 🗑 apaga do banco (FONTE DA VERDADE)
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
        "INSERT INTO conteudos (user_id, url, tipo) VALUES ($1, $2, $3)",
        [req.user.id, result.secure_url, result.resource_type]
      );

      res.json({ url: result.secure_url });

    } catch (err) {
      console.error("Erro upload midia:", err);
      res.status(500).json({ error: "Erro ao enviar mídia" });
    }
  }
);

app.post("/api/contato", async (req, res) => {
  try {
    const { nome, email, assunto, mensagem } = req.body;

    // 🔒 validação básica
    if (!nome || !email || !assunto || !mensagem) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    // 📧 SMTP HOSTINGER (CORRETO)
const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 587,
  secure: false, // SSL
  auth: {
    user: process.env.CONTACT_EMAIL,
    pass: process.env.CONTACT_EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

    // ✉️ envio do email
    await transporter.sendMail({
      from: `"Contato Velvet" <${process.env.CONTACT_EMAIL}>`,
      to: "contato@velvet.lat",
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

    // ✅ resposta para o frontend
    return res.json({ success: true });

  } catch (err) {
    console.error("Erro envio contato:", err);
    return res.status(500).json({ error: "Erro ao enviar email" });
  }
});


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
      automatic_payment_methods: { enabled: true },
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

app.post("/api/track-acesso", async (req, res) => {
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
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});