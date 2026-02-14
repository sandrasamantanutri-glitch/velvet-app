// middleware/authCliente.js
const jwt = require("jsonwebtoken");
const db = require("../db");

module.exports = async function authCliente(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "cliente") {
      return res.status(403).json({ error: "Apenas cliente" });
    }

    // 🔥 Converter users.id → clientes.id
    const result = await db.query(
      `SELECT id FROM clientes WHERE user_id = $1`,
      [decoded.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    // salvar identidade real
    req.user = decoded;
    req.cliente_id = result.rows[0].id;

    next();

  } catch (err) {
    console.error("Erro authCliente:", err);
    return res.status(401).json({ error: "Token inválido" });
  }
};
