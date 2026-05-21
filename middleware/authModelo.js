// middleware/authModelo.js
const jwt = require("jsonwebtoken");
const db = require("../db");

// Versão atual dos termos — deve coincidir com VERSAO_TERMOS_ATUAL em server.js
const VERSAO_TERMOS_ATUAL = "2026-05";

// Rotas que NÃO exigem aceite de termos (necessárias para o próprio fluxo de aceite)
const ROTAS_ISENTAS_TERMOS = [
  "/api/modelo/me",            // carregar perfil na conta.html
  "/api/modelo/dados",         // submeter dados pessoais (POST)
  "/api/verificacao",          // enviar documentos (usa auth, não authModelo — aqui por segurança)
  "/api/verificacao/status",   // ver estado de verificação
  "/api/conta/excluir",        // excluir conta
];

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

    const result = await db.query(
      `SELECT m.id, m.termos_aceites, m.termos_versao,
              u.ativo, u.bloqueado, u.token_version
       FROM modelos m
       JOIN users u ON u.id = m.user_id
       WHERE m.user_id = $1`,
      [decoded.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Modelo não encontrado" });
    }

    const { id, ativo, bloqueado, token_version, termos_aceites, termos_versao } = result.rows[0];

    if (!ativo) {
      return res.status(403).json({ error: "Conta desativada" });
    }

    if (bloqueado) {
      return res.status(403).json({ error: "Conta bloqueada" });
    }

    if (decoded.tv !== token_version) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    // Verificar aceite dos termos (exceto em rotas isentas)
    const rotaAtual = req.path || req.originalUrl?.split("?")[0] || "";
    const isIsenta = ROTAS_ISENTAS_TERMOS.some(r => rotaAtual.startsWith(r));

    if (!isIsenta && (!termos_aceites || termos_versao !== VERSAO_TERMOS_ATUAL)) {
      return res.status(403).json({
        error: "TERMS_NOT_ACCEPTED",
        message: "É necessário aceitar os termos antes de continuar.",
        redirect: "/conta.html#termos"
      });
    }

    req.user = decoded;
    req.modelo_id = id;
    req.termos_aceites = termos_aceites;

    next();

  } catch (err) {
    console.error("Erro authModelo:", err);
    return res.status(401).json({ error: "Token inválido" });
  }
};
