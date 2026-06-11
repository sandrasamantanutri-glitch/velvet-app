const jwt = require("jsonwebtoken");
const db = require("../db");
module.exports = async function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: "Token inválido" });
    }

    const result = await db.query(
      "SELECT token_version FROM users WHERE id = $1",
      [decoded.id]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Token inválido" });
    }

    if (decoded.tv !== result.rows[0].token_version) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    req.user = decoded;
    next();

  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}