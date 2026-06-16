const db = require("../db");

async function authAgencia(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ erro: "Não autenticado" });
  }

  try {
    // req.user.id = agencias.id (JWT gerado pelo /api/agencia/login)
    const { rows } = await db.query(
      "SELECT id, email, nome FROM agencias WHERE id = $1 LIMIT 1",
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(403).json({ erro: "Acesso negado. Agência não encontrada." });
    }

    req.agencia = rows[0];
    next();

  } catch (err) {
    console.error("Erro authAgencia:", err.message);
    return res.status(500).json({ erro: "Erro interno de autenticação" });
  }
}

module.exports = authAgencia;
