// Identificação de quem atende no chat-agency.html.
// Montado em /api/chatter, sempre atrás de auth + role "modelo".
const express = require("express");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { criarToken, lerToken } = require("../utils/chatterSessoes");

module.exports = function chatterSessaoRouter(db, sessoes) {
  const router = express.Router();

  // Só conta tentativas erradas: várias pessoas podem dividir o mesmo IP
  const limitePin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas. Tente novamente em alguns minutos." }
  });

  const sessaoDoPedido = req => lerToken(req.get("x-chatter-sessao"), req.user.id);

  router.get("/status", async (req, res) => {
    try {
      const obrigatorio = await sessoes.obrigatorio();
      const id = sessaoDoPedido(req);
      const sessao = obrigatorio && id ? await sessoes.renovar(id) : null;
      res.json({
        obrigatorio,
        sessao: sessao && { nome: sessao.nome, entrou_em: sessao.entrou_em }
      });
    } catch (err) {
      console.error("Erro GET /api/chatter/status:", err);
      res.status(500).json({ erro: "Erro interno" });
    }
  });

  router.post("/entrar", limitePin, async (req, res) => {
    try {
      const codigo = String(req.body?.codigo || "").trim().toUpperCase();
      const pin = String(req.body?.pin || "").trim();
      if (!codigo || !pin) {
        return res.status(400).json({ erro: "Informe o código e o PIN." });
      }

      await sessoes.migrar();

      const modelo = await db.query(
        "SELECT id FROM modelos WHERE user_id = $1",
        [req.user.id]
      );
      if (!modelo.rows.length) {
        return res.status(404).json({ erro: "Modelo não encontrada." });
      }

      const chatter = await db.query(
        "SELECT id, nome, pin_hash FROM chatters WHERE codigo = $1 AND ativo",
        [codigo]
      );
      const pessoa = chatter.rows[0];
      if (!pessoa || !(await bcrypt.compare(pin, pessoa.pin_hash))) {
        // 403 e não 401: 401 faria a página encerrar o login da modelo
        return res.status(403).json({ erro: "Código ou PIN incorreto." });
      }

      const sessaoId = await sessoes.abrir({
        chatterId: pessoa.id,
        modeloId: modelo.rows[0].id,
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.json({ token: criarToken(sessaoId, req.user.id), nome: pessoa.nome });
    } catch (err) {
      console.error("Erro POST /api/chatter/entrar:", err);
      res.status(500).json({ erro: "Erro interno" });
    }
  });

  router.post("/sair", async (req, res) => {
    try {
      const id = sessaoDoPedido(req);
      if (id) await sessoes.sair(id);
      res.json({ ok: true });
    } catch (err) {
      console.error("Erro POST /api/chatter/sair:", err);
      res.status(500).json({ erro: "Erro interno" });
    }
  });

  // Mantém a sessão viva em páginas abertas a partir do chat (sem socket do chat)
  router.post("/sinal", async (req, res) => {
    try {
      const id = sessaoDoPedido(req);
      const ativa = id ? Boolean(await sessoes.renovar(id)) : false;
      res.json({ ativa });
    } catch (err) {
      console.error("Erro POST /api/chatter/sinal:", err);
      res.status(500).json({ erro: "Erro interno" });
    }
  });

  return router;
};
