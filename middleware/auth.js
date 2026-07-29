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

    // Agência: sem token_version, passa direto
    if (decoded.role === "agencia") {
      req.user = decoded;
      return next();
    }

    // Admin: verifica token_version para permitir revogação imediata
    if (decoded.role === "admin") {
      const adminRes = await db.query(
        "SELECT token_version FROM admin WHERE id = $1 LIMIT 1",
        [decoded.id]
      );
      if (!adminRes.rows.length) {
        return res.status(401).json({ error: "Token inválido" });
      }
      const tv = decoded.tv ?? 0;
      if (tv !== (adminRes.rows[0].token_version ?? 0)) {
        return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
      }
      req.user = decoded;
      return next();
    }

    const result = await db.query(
      "SELECT token_version FROM users WHERE id = $1",
      [decoded.id]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Token inválido" });
    }

    const tv = decoded.tv ?? 0;
    if (tv !== result.rows[0].token_version) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    req.user = decoded;
    next();

  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}