// middleware/authModelo.js
const jwt = require("jsonwebtoken");
const db = require("../db");

module.exports = async function authModelo(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "modelo") {
      return res.status(403).json({ error: "Apenas modelo" });
    }

    // 🔥 Converter users.id → modelos.id
    const result = await db.query(
      `SELECT id FROM modelos WHERE user_id = $1`,
      [decoded.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Modelo não encontrado" });
    }

    // salva tudo já pronto
    req.user = decoded;
    req.modelo_id = result.rows[0].id;

    next();

  } catch (err) {
    console.error("Erro authModelo:", err);
    return res.status(401).json({ error: "Token inválido" });
  }
};
