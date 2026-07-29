const jwt = require("jsonwebtoken");
const db = require("../db");
module.exports = async function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  // Aceita Bearer header (API clients) ou cookie httpOnly (admin web)
  let token = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies?.admin_session) {
    token = req.cookies.admin_session;
  }

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: "Token inválido" });
    }

    // Agência: verifica token_version para permitir revogação
    if (decoded.role === "agencia") {
      try {
        const agRes = await db.query(
          "SELECT token_version FROM agencias WHERE id = $1 LIMIT 1",
          [decoded.id]
        );
        if (!agRes.rows.length) {
          return res.status(401).json({ error: "Token inválido" });
        }
        const tv = decoded.tv ?? 0;
        if (tv !== (agRes.rows[0].token_version ?? 0)) {
          return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
        }
      } catch (colErr) {
        // Coluna token_version ainda não existe — migration pendente, permite passar
        if (colErr.code !== "42703") throw colErr;
      }
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