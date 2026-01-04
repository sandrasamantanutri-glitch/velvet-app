// servercontent.js
const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("./db");
const cloudinary = require("cloudinary").v2;

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 🔐 auth cliente (igual ao server principal)
function authCliente(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Sem token" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "cliente") {
      return res.status(403).json({ error: "Apenas cliente" });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

// 🔐 ENDPOINT DE ACESSO AO CONTEÚDO
router.get("/access", authCliente, async (req, res) => {
  const { message_id } = req.query;

  if (!message_id) {
    return res.status(400).json({ error: "message_id obrigatório" });
  }

  // 1️⃣ verifica se foi desbloqueado
  const msgRes = await db.query(
    `
    SELECT id
    FROM messages
    WHERE id = $1
      AND cliente_id = $2
      AND visto = true
    `,
    [message_id, req.user.id]
  );

  if (msgRes.rowCount === 0) {
    return res.status(403).json({ error: "Conteúdo não liberado" });
  }

  // 2️⃣ busca mídias
  const midiasRes = await db.query(
    `
    SELECT c.url, c.tipo
    FROM messages_conteudos mc
    JOIN conteudos c ON c.id = mc.conteudo_id
    WHERE mc.message_id = $1
    `,
    [message_id]
  );

  // 3️⃣ gera URLs temporárias
const midias = midiasRes.rows.map(m => ({
  tipo: m.tipo,
  url: m.url  
}));


  res.json({ midias });
});

module.exports = router;
