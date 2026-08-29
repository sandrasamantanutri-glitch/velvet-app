const express = require("express");
const router = express.Router();
const db = require("../db");
const authCliente = require("../middleware/authCliente");
const auth = require("../middleware/auth");
const authAdmin = require("../middleware/authAdmin");

// ─── AUTO-RESPOSTA (lógica server-side) ─────────────────────────────────────
const RESPOSTAS_AUTO = [
  {
    palavras: ["reembolso", "dinheiro de volta", "estorno", "não devolveu", "reembolsar"],
    texto: "Olá! As solicitações de reembolso, são avaliadas individualmente e conforme nossos Termos de Uso. Indicamos que leia novamente os termos: <a href=\"/terms.html\" target=\"_blank\">Termos de Uso</a>, e verifique se seu pedido se enquadra nas situações elegiveis. Caso acredite que sim, pode dar andamento a seu pedido.\n\nPara isso, envie um e-mail para contato@velvet.lat com:\n• E-mail utilizado na compra(login)\n• Data da cobrança\n• Motivo do pedido\n• Prints que comprovam sua elegibilidade ao reembolso e/ou comprovantes de pagamento.\n\nO prazo de resposta é de 24 a 48 horas úteis!💜"
  },
  {
    palavras: ["golpe", "engano", "não condiz", "nao condiz", "comprei por engano", "propaganda enganosa", "fui enganado", "fui enganada"],
    texto: "Olá! A Velvet é uma plataforma que permite a conexão entre criadores e seus fãs, e não somos responsáveis pelas ações de usuários, mas para manter a integridade do nosso circulo social, sua reclamação é considerada e avaliada individualmente.\n\nCaso acredite que a situação deve ser reportada: \n\nEnvie um e-mail para contato@velvet.lat com:\n• E-mail utilizado(login)\n• Motivo do pedido\n• Prints que comprovam seu relato.\n\nO prazo de resposta é de 24 a 48 horas úteis!💜"
  },
  {
    palavras: ["desejo excluir permanente", "excluir conta", "apagar conta", "deletar conta", "exclusão de conta", "exclusao de conta", "excluir minha conta", "cancelar conta", "eliminar conta"],
    texto: "Para excluir sua conta, siga os passos:\n1. Acesse a área do usuário\n2. Vá em Configurações da conta\n3. Role até o final da página\n4. Clique em \"Excluir conta permanentemente\"\n\nSe tiver dificuldades, envie um e-mail para contato@velvet.lat."
  },
  {
    palavras: ["não liberou", "nao liberou", "não ativou", "nao ativou", "paguei e não", "paguei e nao", "vip não ativou", "vip nao ativou", "pagamento não liberou", "pagamento nao liberou", "liberação", "liberacao"],
    texto: "Lamentamos o transtorno! Para resolver, envie um e-mail para contato@velvet.lat com:\n• Comprovante do pagamento\n• Nome da modelo\n• E-mail da sua conta\n\nNossa equipe verificará e ativará o acesso o mais rápido possível."
  },
  {
    palavras: ["esqueci senha", "esqueci a senha", "recuperar senha", "não consigo entrar", "nao consigo entrar", "esqueci minha senha", "resetar senha"],
    texto: "Para recuperar sua senha:\n1. Acesse velvet.lat\n2. Clique em \"Esqueci minha senha\"\n3. Digite o e-mail cadastrado\n4. Verifique também a pasta de spam\n\nSe não receber o e-mail, entre em contato pelo contato@velvet.lat."
  },
  {
    palavras: ["minha assinatura", "assinei e não liberou", "assinatura desativada", "meu VIP", "meu vip", "minha assinatura expirou antes"],
    texto: "Lamentamos o transtorno! Para resolver, envie um e-mail para contato@velvet.lat com:\n• Comprovante do pagamento\n• Nome da modelo\n• E-mail da sua conta\n\nNossa equipe irá solucionar o mais rápido possível."
  },
  {
    palavras: ["tipo de conteudo", "tem previas"],
    texto: "Olá! Aqui é o suporte da plataforma, para ter acesso ao chat da modelo deve assinar o VIP!💜"
  },
  {
    palavras: ["nao consigo pagar", "não consigo pagar", "problema no pagamento", "problema para pagar", "erro no pagamento"],
    texto: "Lamentamos o ocorrido. Para analisarmos o problema, envie um e-mail para contato@velvet.lat com:\n• Print do erro\n• Nome da modelo\n• E-mail da sua conta\n\nNossa equipe verificará e resolverá o issue o mais rápido possível."
  },
  {
    palavras: ["cancelar assinatura", "cancelar minha assinatura", "como cancelo", "quero cancelar", "cancelamento de assinatura", "desativar assinatura"],
    texto: "Olá! Para cancelar sua assinatura basta ir em Assinaturas e Pagamentos e clicar em cancelar na assinatura que deseja."
  },
  {
    palavras: ["pagamento via pix", "pagar com pix", "não tenho cartão", "poder pagar com pix", "liberar pix", "pix"],
    texto: "Olá! Devido ao elevado número de contestações e fraudes em pagamentos via Pix, a primeira assinatura é realizada apenas por cartão de crédito. No entanto, dependendo da situação, poderemos analisar uma exceção para pagamento via Pix. Para isso, poderia explicar melhor o que procura na plataforma e informar qual o nome da modelo que deseja assinar? Envie seu email de cadastro também, a liberação ocorre em até 24 horas, e você será avisado por aqui!"
  }
];

const RESPOSTA_FALLBACK = "Recebemos seu pedido de suporte, e vamos responder entre 24 a 48 horas.";

function detectarAutoResposta(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const r of RESPOSTAS_AUTO) {
    const match = r.palavras.some(p => {
      const pn = p.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return t.includes(pn);
    });
    if (match) return r.texto;
  }
  return null;
}

// ─── CLIENTE: abre ou retoma conversa ───────────────────────────────────────
router.post("/conversa", async (req, res) => {
  try {
    const { nome, email, conversa_id } = req.body;

    // Retoma conversa existente
    if (conversa_id) {
      const { rows } = await db.query(
        "SELECT id, status FROM suporte_conversas WHERE id = $1",
        [conversa_id]
      );
      if (rows.length) return res.json({ conversa_id: rows[0].id, status: rows[0].status });
    }

    // Tenta identificar cliente logado via token opcional
    let cliente_id = null;
    try {
      const jwt = require("jsonwebtoken");
      const token = req.headers.authorization?.split(" ")[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.id) {
          const { rows } = await db.query(
            "SELECT id FROM clientes WHERE user_id = $1",
            [decoded.id]
          );
          if (rows.length) cliente_id = rows[0].id;
        }
      }
    } catch (_) {}

    const { rows } = await db.query(
      `INSERT INTO suporte_conversas (cliente_id, nome_visitante, email_visitante)
       VALUES ($1, $2, $3) RETURNING id`,
      [cliente_id, nome || null, email || null]
    );

    const io = req.app.get("io");
    if (io) {
      io.to("suporte_admin").emit("suporte:nova_conversa", { conversa_id: rows[0].id });
    }

    res.json({ conversa_id: rows[0].id, status: "aberta" });
  } catch (err) {
    console.error("Erro ao criar conversa de suporte:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── CLIENTE: envia mensagem ─────────────────────────────────────────────────
router.post("/conversa/:id/mensagem", async (req, res) => {
  try {
    const conversa_id = parseInt(req.params.id);
    const { texto } = req.body;

    if (!texto?.trim()) return res.status(400).json({ error: "Mensagem vazia" });

    const { rows: conv } = await db.query(
      "SELECT id, cliente_id FROM suporte_conversas WHERE id = $1 AND status != 'fechada'",
      [conversa_id]
    );
    if (!conv.length) return res.status(404).json({ error: "Conversa não encontrada" });

    // Se a conversa ainda não tem cliente_id, tenta vincular pelo token
    if (!conv[0].cliente_id) {
      try {
        const jwt = require("jsonwebtoken");
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded?.id) {
            const { rows: cRows } = await db.query(
              "SELECT id FROM clientes WHERE user_id = $1",
              [decoded.id]
            );
            if (cRows.length) {
              await db.query(
                "UPDATE suporte_conversas SET cliente_id = $1 WHERE id = $2",
                [cRows[0].id, conversa_id]
              );
            }
          }
        }
      } catch (_) {}
    }

    const { rows } = await db.query(
      `INSERT INTO suporte_mensagens (conversa_id, remetente, texto)
       VALUES ($1, 'cliente', $2) RETURNING *`,
      [conversa_id, texto.trim()]
    );

    await db.query(
      "UPDATE suporte_conversas SET updated_at = NOW(), status = 'aberta' WHERE id = $1",
      [conversa_id]
    );

    const io = req.app.get("io");
    if (io) {
      io.to("suporte_admin").emit("suporte:nova_mensagem", {
        conversa_id,
        mensagem: rows[0]
      });
      // Sinaliza "digitando" para o cliente antes da auto-resposta
      io.to(`suporte_${conversa_id}`).emit("suporte:typing");
    }

    // Salva e emite auto-resposta server-side (nunca via endpoint público)
    const autoTexto = detectarAutoResposta(texto.trim()) || RESPOSTA_FALLBACK;
    setTimeout(async () => {
      try {
        const { rows: autoRows } = await db.query(
          `INSERT INTO suporte_mensagens (conversa_id, remetente, texto) VALUES ($1, 'admin', $2) RETURNING *`,
          [conversa_id, autoTexto]
        );
        await db.query(
          "UPDATE suporte_conversas SET updated_at = NOW(), status = 'fechada' WHERE id = $1",
          [conversa_id]
        );
        // Marca mensagens do cliente como lidas ao fechar com auto-resposta
        await db.query(
          "UPDATE suporte_mensagens SET lida = true WHERE conversa_id = $1 AND remetente = 'cliente'",
          [conversa_id]
        );
        if (io) {
          io.to(`suporte_${conversa_id}`).emit("suporte:resposta", autoRows[0]);
        }
      } catch (e) {
        console.error("Erro ao salvar auto-resposta:", e);
      }
    }, 1200);

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro ao enviar mensagem suporte:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── CLIENTE: registra interações do bot-tree (sem auto-resposta) ────────────
router.post("/conversa/:id/log", async (req, res) => {
  try {
    const conversa_id = parseInt(req.params.id);
    if (!conversa_id || isNaN(conversa_id)) return res.status(400).json({ error: "ID inválido" });
    const { texto, remetente } = req.body;
    if (!texto?.trim() || !["cliente", "admin"].includes(remetente)) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    const { rows: conv } = await db.query(
      "SELECT id FROM suporte_conversas WHERE id = $1",
      [conversa_id]
    );
    if (!conv.length) return res.status(404).json({ error: "Não encontrada" });

    await db.query(
      `INSERT INTO suporte_mensagens (conversa_id, remetente, texto) VALUES ($1, $2, $3)`,
      [conversa_id, remetente, texto.trim()]
    );
    await db.query(
      "UPDATE suporte_conversas SET updated_at = NOW() WHERE id = $1",
      [conversa_id]
    );

    const io = req.app.get("io");
    if (io) {
      io.to("suporte_admin").emit("suporte:nova_mensagem", {
        conversa_id,
        mensagem: { conversa_id, remetente, texto: texto.trim(), criado_em: new Date() }
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao logar interação suporte:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── CLIENTE: lista mensagens da conversa ────────────────────────────────────
// Requer o token da conversa (conversa_id gerado no POST /conversa) — sem ele não retorna nada
router.get("/conversa/:id/mensagens", async (req, res) => {
  try {
    const conversa_id = parseInt(req.params.id);
    if (!conversa_id || isNaN(conversa_id)) return res.status(400).json({ error: "ID inválido" });

    // Verifica se a conversa existe antes de retornar mensagens
    const { rows: conv } = await db.query(
      "SELECT id FROM suporte_conversas WHERE id = $1",
      [conversa_id]
    );
    if (!conv.length) return res.status(404).json({ error: "Não encontrada" });

    const { rows } = await db.query(
      "SELECT * FROM suporte_mensagens WHERE conversa_id = $1 ORDER BY criado_em ASC",
      [conversa_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── ADMIN: lista todas as conversas ─────────────────────────────────────────
router.get("/admin/conversas", auth, authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        sc.id, sc.status, sc.created_at, sc.updated_at,
        sc.nome_visitante, sc.email_visitante, sc.cliente_id,
        CASE WHEN sc.status = 'fechada' THEN 0
             ELSE (SELECT COUNT(*) FROM suporte_mensagens sm WHERE sm.conversa_id = sc.id AND sm.lida = false AND sm.remetente = 'cliente')
        END AS nao_lidas,
        (SELECT texto FROM suporte_mensagens sm WHERE sm.conversa_id = sc.id ORDER BY sm.criado_em DESC LIMIT 1) AS ultima_mensagem,
        EXISTS (
          SELECT 1 FROM suporte_mensagens sm
          WHERE sm.conversa_id = sc.id
          AND (LOWER(sm.texto) LIKE '%encontrei minha duvida%' OR LOWER(sm.texto) LIKE '%encontrei minha dúvida%'
            OR LOWER(sm.texto) LIKE '%nao encontrei%' OR LOWER(sm.texto) LIKE '%não encontrei%')
        ) AS tem_nao_encontrou
      FROM suporte_conversas sc
      WHERE sc.created_at >= NOW() - INTERVAL '15 days'
      ORDER BY sc.updated_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Erro ao listar conversas suporte:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── ADMIN: mensagens de uma conversa ────────────────────────────────────────
router.get("/admin/conversa/:id/mensagens", auth, authAdmin, async (req, res) => {
  try {
    const conversa_id = parseInt(req.params.id);
    const { rows } = await db.query(
      "SELECT * FROM suporte_mensagens WHERE conversa_id = $1 ORDER BY criado_em ASC",
      [conversa_id]
    );

    // Marca como lidas
    await db.query(
      "UPDATE suporte_mensagens SET lida = true WHERE conversa_id = $1 AND remetente = 'cliente'",
      [conversa_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── ADMIN: responde ─────────────────────────────────────────────────────────
router.post("/admin/conversa/:id/responder", auth, authAdmin, async (req, res) => {
  try {
    const conversa_id = parseInt(req.params.id);
    const { texto } = req.body;

    if (!texto?.trim()) return res.status(400).json({ error: "Mensagem vazia" });

    const { rows } = await db.query(
      `INSERT INTO suporte_mensagens (conversa_id, remetente, texto)
       VALUES ($1, 'admin', $2) RETURNING *`,
      [conversa_id, texto.trim()]
    );

    await db.query(
      "UPDATE suporte_conversas SET updated_at = NOW(), status = 'respondida' WHERE id = $1",
      [conversa_id]
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`suporte_${conversa_id}`).emit("suporte:resposta", rows[0]);
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro ao responder suporte:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── ADMIN: registra atendimento recebido por email ──────────────────────────
router.post("/admin/registro-manual", auth, authAdmin, async (req, res) => {
  try {
    const { email, cliente_id, tipo_pedido, descricao, data_hora } = req.body;

    if (!tipo_pedido?.trim() || !descricao?.trim()) {
      return res.status(400).json({ error: "tipo_pedido e descricao são obrigatórios" });
    }

    let clienteIdResolvido = cliente_id ? Number(cliente_id) : null;
    const emailFinal = email ? String(email).trim().toLowerCase() : null;

    if (!clienteIdResolvido && emailFinal) {
      const { rows } = await db.query(
        `SELECT c.id FROM clientes c JOIN users u ON u.id = c.user_id WHERE LOWER(u.email) = LOWER($1)`,
        [emailFinal]
      );
      if (rows.length) clienteIdResolvido = rows[0].id;
    }

    if (!clienteIdResolvido) {
      return res.status(404).json({ error: "Cliente não encontrado para o email/ID informado" });
    }

    const criadoEm = data_hora ? new Date(data_hora) : new Date();

    const { rows: conv } = await db.query(
      `INSERT INTO suporte_conversas (cliente_id, nome_visitante, email_visitante, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'fechada', $4, $4) RETURNING id`,
      [clienteIdResolvido, 'Registro manual (email)', emailFinal, criadoEm]
    );

    await db.query(
      `INSERT INTO suporte_mensagens (conversa_id, remetente, texto, criado_em)
       VALUES ($1, 'admin', $2, $3)`,
      [conv[0].id, `[${tipo_pedido.trim()}] ${descricao.trim()}`, criadoEm]
    );

    res.json({ ok: true, conversa_id: conv[0].id });
  } catch (err) {
    console.error("Erro ao registrar atendimento manual:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── ADMIN: fecha conversa ───────────────────────────────────────────────────
router.patch("/admin/conversa/:id/fechar", auth, authAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.query(
      "UPDATE suporte_conversas SET status = 'fechada', updated_at = NOW() WHERE id = $1",
      [id]
    );
    // Marca todas as mensagens do cliente como lidas ao fechar
    await db.query(
      "UPDATE suporte_mensagens SET lida = true WHERE conversa_id = $1 AND remetente = 'cliente'",
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── ADMIN: apaga todas as conversas fechadas ───────────────────────────────
router.delete("/admin/conversas/fechadas", auth, authAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query(`
      DELETE FROM suporte_conversas WHERE status = 'fechada'
    `);
    res.json({ ok: true, removidas: rowCount });
  } catch (err) {
    console.error("Erro ao limpar conversas fechadas:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// Auto-fecha conversas do bot-tree que ficaram abertas sem clicar "Não encontrei minha dúvida"
setInterval(async () => {
  try {
    await db.query(`
      UPDATE suporte_conversas
      SET status = 'fechada', updated_at = NOW()
      WHERE status = 'aberta'
      AND updated_at < NOW() - INTERVAL '30 minutes'
      AND id NOT IN (
        SELECT DISTINCT conversa_id FROM suporte_mensagens
        WHERE LOWER(texto) LIKE '%encontrei minha duvida%'
           OR LOWER(texto) LIKE '%encontrei minha dúvida%'
      )
    `);
  } catch (e) {
    console.error("Auto-close suporte erro:", e);
  }
}, 10 * 60 * 1000);

module.exports = router;
