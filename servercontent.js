// servercontent.js
const authModelo = require("./middleware/authModelo");
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const authMiddleware = require("./middleware/auth");
const db = require("./db");
const cloudinary = require("cloudinary").v2;

const router = express.Router();   // ⬅️ PRIMEIRO SEMPRE

// 🔓 assets do admin (HTML/CSS/JS)
router.use("/assets",
  express.static(path.join(__dirname, "admin-pages"))
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const cron = require("node-cron");

const requireRole = require("./middleware/requireRole");

cron.schedule("0 3 * * *", async () => {
  console.log("🔍 Verificando clientes com chargeback...");

  const { rows } = await db.query(`
    SELECT
      cliente_id,
      COUNT(*) AS total,
      SUM(valor_bruto) AS valor,
      MAX(created_at) AS ultimo
    FROM transacoes
    WHERE status = 'chargeback'
      AND created_at >= NOW() - INTERVAL '60 days'
    GROUP BY cliente_id
    HAVING COUNT(*) >= 2
  `);

  for (const c of rows) {
    let nivel = "atencao";

    if (c.total >= 5 || Number(c.valor) >= 50) {
      nivel = "critico";
    } else if (c.total >= 3) {
      nivel = "alto";
    }

    await db.query(
      `
      INSERT INTO chargeback_alertas
        (cliente_id, nivel, total_chargebacks, valor_total, ultimo_chargeback)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (cliente_id)
      DO UPDATE SET
        nivel = EXCLUDED.nivel,
        total_chargebacks = EXCLUDED.total_chargebacks,
        valor_total = EXCLUDED.valor_total,
        ultimo_chargeback = EXCLUDED.ultimo_chargeback,
        ativo = true
      `,
      [
        c.cliente_id,
        nivel,
        c.total,
        c.valor,
        c.ultimo
      ]
    );
  }
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

//RELATORIO FINANCEIROS

function calcularValores({ valor_bruto, taxa_gateway, agency_fee, velvet_fee, status }) {
  if (status === "chargeback") {
    return {
      valor_modelo: 0
    };
  }

  return {
    valor_modelo:
      Number(valor_bruto) -
      Number(taxa_gateway) -
      Number(agency_fee) -
      Number(velvet_fee)
  };
}

function podeAlterarDadosBancarios() {
  const hoje = new Date();
  const dia = hoje.getDate();

  // bloqueia de 25 até 5
  if (dia >= 25 || dia <= 5) {
    return false;
  }

  return true;
}

//ROTASSSS POST ///////////////////
router.post("/api/modelo/dados-bancarios", authModelo, async (req, res) => {
 if (!(await podeAlterarDadosBancarios(req.user.id))) {
  return res.status(403).json({
    error: "Alterações bloqueadas no período de pagamento"
  });
}

  const {
    tipo,
    pix_tipo,
    pix_chave,
    banco,
    agencia,
    conta,
    conta_tipo,
    titular_nome,
    titular_documento,
    confirmado_titular
  } = req.body;

  if (!confirmado_titular) {
    return res.status(400).json({
      error: "Confirmação de titularidade obrigatória"
    });
  }

  await db.query(`
    INSERT INTO modelo_dados_bancarios (
      modelo_id, tipo,
      pix_tipo, pix_chave,
      banco, agencia, conta, conta_tipo,
      titular_nome, titular_documento,
      confirmado_titular, status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'pendente')

    ON CONFLICT (modelo_id)
    DO UPDATE SET
      tipo = EXCLUDED.tipo,
      pix_tipo = EXCLUDED.pix_tipo,
      pix_chave = EXCLUDED.pix_chave,
      banco = EXCLUDED.banco,
      agencia = EXCLUDED.agencia,
      conta = EXCLUDED.conta,
      conta_tipo = EXCLUDED.conta_tipo,
      titular_nome = EXCLUDED.titular_nome,
      titular_documento = EXCLUDED.titular_documento,
      status = 'alteracao_pendente',
      atualizado_em = NOW()
  `, [
    req.user.id,
    tipo,
    pix_tipo,
    pix_chave,
    banco,
    agencia,
    conta,
    conta_tipo,
    titular_nome,
    titular_documento
  ]);

  res.json({ ok: true });
});

router.post("/api/modelo/dados-bancarios/alterar", authModelo, async (req, res) => {
  if (!(await podeAlterarDadosBancarios(req.user.id))) {
  return res.status(403).json({
    error: "Alterações bloqueadas no período de pagamento"
  });
}

  const {
    justificativa,
    tipo,
    pix_tipo,
    pix_chave,
    banco,
    agencia,
    conta,
    conta_tipo,
    titular_nome,
    titular_documento
  } = req.body;

  if (!justificativa) {
    return res.status(400).json({
      error: "Justificativa obrigatória"
    });
  }
  await db.query(`
    UPDATE modelo_dados_bancarios
    SET
      tipo = $1,
      pix_tipo = $2,
      pix_chave = $3,
      banco = $4,
      agencia = $5,
      conta = $6,
      conta_tipo = $7,
      titular_nome = $8,
      titular_documento = $9,
      justificativa = $10,
      status = 'alteracao_pendente',
      atualizado_em = NOW()
    WHERE modelo_id = $11
  `, [
    tipo,
    pix_tipo,
    pix_chave,
    banco,
    agencia,
    conta,
    conta_tipo,
    titular_nome,
    titular_documento,
    justificativa,
    req.user.id
  ]);

  res.json({ ok: true });
});

router.post(
  "/api/admin/pagamentos/:id/pagar",
  authMiddleware,
  async (req, res) => {
    const { id } = req.params;

    await db.query(
      `
      UPDATE modelo_pagamentos
      SET
        status = 'pago',
        pago_em = NOW()
      WHERE id = $1
      `,
      [id]
    );

    res.json({ ok: true });
  }
);

router.post(
  "/api/admin/fechar-pagamentos-modelo/:modeloId",
  authMiddleware,
  async (req, res) => {
    const { modeloId } = req.params;

    await db.query(`/* SQL acima */`, [modeloId]);

    res.json({ ok: true });
  }
);

router.post("/api/transacoes", authMiddleware, async (req, res) => {
  try {
    const {
      codigo,
      modelo_id,
      cliente_id,
      tipo,
      valor_bruto,
      taxa_gateway,
      agency_fee,
      velvet_fee,
      origem_cliente
    } = req.body;

    const { valor_modelo } = calcularValores({
      valor_bruto,
      taxa_gateway,
      agency_fee,
      velvet_fee,
      status: "normal"
    });

    const result = await db.query(
      `
      INSERT INTO transacoes (
        codigo, modelo_id, cliente_id, tipo,
        valor_bruto, taxa_gateway, agency_fee, velvet_fee,
        valor_modelo, origem_cliente
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        codigo,
        modelo_id,
        cliente_id,
        tipo,
        valor_bruto,
        taxa_gateway,
        agency_fee,
        velvet_fee,
        valor_modelo,
        origem_cliente
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao criar transação" });
  }
});

router.post("/api/transacoes/:id/chargeback",
  authMiddleware,
  requireRole("admin", "modelo"),
  async (req, res) => {

    const { result } = req.body; // won | lost

    await db.query(
      `
      UPDATE transacoes
      SET status = 'chargeback',
          chargeback_result = $1,
          valor_modelo = 0
      WHERE id = $2
      `,
      [result, req.params.id]
    );

    res.json({ ok: true });
  }
);

// ===============================
// 📣 ALLMESSAGE - ENVIO EM MASSA
// ===============================
router.post("/api/allmessage",
  authMiddleware, // use o MESMO middleware que funcionou antes
  requireRole("admin", "modelo"),
  async (req, res) => {
    try {
      const {
        modelo_id,
        texto,
        preco,
        conteudos,
        modo_teste
      } = req.body;

      const { role, id: user_id } = req.user;

      // 🔒 validações
      if (!modelo_id || !texto || !preco || !Array.isArray(conteudos)) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      if (conteudos.length === 0) {
        return res.status(400).json({ error: "Nenhum conteúdo selecionado" });
      }

      // 🔒 modelo só pode enviar da própria conta
      if (role === "modelo" && Number(modelo_id) !== user_id) {
  return res.status(403).json({ error: "Modelo inválida" });
}

      // 🔍 buscar assinantes ativos
      let vipQuery = `
        SELECT cliente_id
        FROM vip_subscriptions
        WHERE modelo_id = $1
        AND ativo = true
      `;
      const vipParams = [modelo_id];

      if (modo_teste === true) {
        vipQuery += " LIMIT 1";
      }

      const clientesRes = await db.query(vipQuery, vipParams);

      if (clientesRes.rowCount === 0) {
        return res.status(400).json({
          error: "Nenhum assinante ativo encontrado"
        });
      }

// 🔁 envio individual
for (const row of clientesRes.rows) {
  const cliente_id = row.cliente_id;

  // ===============================
  // 1️⃣ MENSAGEM DE TEXTO (NORMAL)
  // ===============================
  await db.query(
    `
    INSERT INTO messages
      (modelo_id, cliente_id, text, sender, visto, tipo)
    VALUES
      ($1,$2,$3,'modelo',false,'texto')
    `,
    [modelo_id, cliente_id, texto]
  );

  // ===============================
  // 2️⃣ MENSAGEM DE CONTEÚDO (PPV)
  // ===============================
  const msgRes = await db.query(
    `
    INSERT INTO messages
      (modelo_id, cliente_id, text, sender, preco, visto, tipo)
    VALUES
      ($1,$2,'','modelo',$3,false,'conteudo')
    RETURNING id
    `,
    [modelo_id, cliente_id, preco]
  );

  const message_id = msgRes.rows[0].id;

  // ===============================
  // 3️⃣ CRIAR PACOTE PPV
  // ===============================
  await db.query(
    `
    INSERT INTO conteudo_pacotes
      (cliente_id, modelo_id, preco, valor_total, status, message_id)
    VALUES
      ($1,$2,$3,$4,'pendente',$5)
    `,
    [
      cliente_id,
      modelo_id,
      preco,
      preco,
      message_id
    ]
  );

  // ===============================
  // 4️⃣ VINCULAR CONTEÚDOS
  // ===============================
  for (const conteudo_id of conteudos) {
    await db.query(
      `
      INSERT INTO messages_conteudos
        (message_id, conteudo_id)
      VALUES
        ($1,$2)
      `,
      [message_id, conteudo_id]
    );
  }
}

      res.json({
        ok: true,
        enviados: clientesRes.rowCount,
        modo_teste: !!modo_teste
      });

    } catch (err) {
      console.error("❌ ERRO ALLMESSAGE ENVIO:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// PÁGINA DE RELATÓRIOS

router.get("/relatorios",
  authMiddleware,
  requireRole("admin"),
  (req, res) => {
    res.sendFile(
      path.join(__dirname, "admin-pages", "chart.html")
    );
  }
);
// 🔐 ENDPOINT DE ACESSO AO CONTEÚDO
router.get("/access", authCliente, async (req, res) => {
  const message_id = Number(req.query.message_id);

  // 🔒 validação query/param
  if (!Number.isInteger(message_id) || message_id <= 0) {
    return res.status(400).json({ error: "message_id inválido" });
  }

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

  const midiasRes = await db.query(
    `
    SELECT c.url, c.tipo
    FROM messages_conteudos mc
    JOIN conteudos c ON c.id = mc.conteudo_id
    WHERE mc.message_id = $1
    `,
    [message_id]
  );

  res.json({
    midias: midiasRes.rows.map(m => ({
      tipo: m.tipo,
      url: m.url
    }))
  });
});


router.get(
  "/api/transacoes",
  authMiddleware,
  requireRole("modelo"),
  async (req, res) => {
    try {
      const modelo_id = req.user.id;

      const page = parseInt(req.query.page) || 1;
      const limit = 10;
      const offset = (page - 1) * limit;

      // ===============================
      // QUERY PRINCIPAL (PAGINADA)
      // ===============================
      const sql = `
        SELECT *
        FROM (
          -- 📦 CONTEÚDOS
          SELECT
            cp.id              AS codigo,
            'conteudo'         AS tipo,
            cp.criado_em       AS created_at,
            ROUND(cp.preco * 0.70, 2) AS valor,
            cp.status          AS status,
            cp.message_id      AS message_id
          FROM conteudo_pacotes cp
          WHERE cp.modelo_id = $1
            AND cp.status = 'pago'

          UNION ALL

          -- ⭐ ASSINATURAS VIP
          SELECT
            vs.id              AS codigo,
            'assinatura'       AS tipo,
            vs.created_at      AS created_at,
            ROUND(vs.valor_assinatura * 0.70, 2) AS valor,
            'ativo'            AS status,
            NULL               AS message_id
          FROM vip_subscriptions vs
          WHERE vs.modelo_id = $1
            AND vs.ativo = true
        ) transacoes
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      // ===============================
      // TOTAL DE REGISTROS
      // ===============================
      const countSql = `
        SELECT COUNT(*) FROM (
          SELECT 1
          FROM conteudo_pacotes
          WHERE modelo_id = $1 AND status = 'pago'

          UNION ALL

          SELECT 1
          FROM vip_subscriptions
          WHERE modelo_id = $1 AND ativo = true
        ) total
      `;

      const [dados, total] = await Promise.all([
        db.query(sql, [modelo_id, limit, offset]),
        db.query(countSql, [modelo_id])
      ]);

      const totalRegistros = parseInt(total.rows[0].count);
      const totalPaginas = Math.ceil(totalRegistros / limit);

      res.json({
        registros: dados.rows,
        paginaAtual: page,
        totalPaginas,
        totalRegistros
      });

    } catch (err) {
      console.error("❌ Erro /api/transacoes:", err);
      res.status(500).json({
        registros: [],
        paginaAtual: 1,
        totalPaginas: 1,
        totalRegistros: 0
      });
    }
  }
);

router.get("/api/modelo/pagamentos", authModelo, async (req, res) => {
  const result = await db.query(
    `
    SELECT
      mes,
      total_midias,
      total_assinaturas,
      total_geral,
      status,
      pago_em
    FROM modelo_pagamentos
    WHERE modelo_id = $1
    ORDER BY mes DESC
    `,
    [req.user.id]
  );

  res.json(result.rows);
});


//ROTA DO LINK DE ACESSO A PLATAFORMA(CLIENTES INSTA TIKTOK)
router.get("/api/transacoes/origem",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    const result = await db.query(`
      SELECT origem_cliente,
             COUNT(*) AS clientes,
             SUM(valor_bruto) AS total
      FROM transacoes
      WHERE status = 'normal'
      GROUP BY origem_cliente
    `);

    res.json(result.rows);
  }
);


router.get("/api/transacoes/diario",
  authMiddleware,
  requireRole("admin", "modelo", "agente"),
  async (req, res) => {
    const { mes } = req.query;

    // 🔒 validação do mês
    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return res.status(400).json({
        error: "Formato de mês inválido (YYYY-MM)"
      });
    }

    const { role, id: modelo_id } = req.user;

    const inicio = `${mes}-01`;
    const fim = `${mes}-31`;

    let where = `
      status = 'normal'
      AND created_at BETWEEN $1 AND $2
    `;

    let values = [inicio, fim];

    // MODELO → só vê suas próprias transações
    if (role === "modelo") {
      values.push(modelo_id);
      where += ` AND modelo_id = $${values.length}`;
    }

    const result = await db.query(
      `
      SELECT
        DATE(created_at) AS dia,

        COALESCE(SUM(CASE WHEN tipo = 'midia' THEN valor_modelo END),0)
          AS ganhos_midias,

        COALESCE(SUM(CASE WHEN tipo = 'assinatura' THEN valor_modelo END),0)
          AS ganhos_assinaturas

      FROM transacoes
      WHERE ${where}
      GROUP BY dia
      ORDER BY dia
      `,
      values
    );

    res.json(result.rows);
  }
);


router.get("/api/relatorios/chargebacks",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {

    const { inicio, fim } = req.query;

    let where = `status = 'chargeback'`;
    let values = [];

    if (inicio && fim) {
      values.push(inicio, fim);
      where += ` AND created_at BETWEEN $1 AND $2`;
    }

    const result = await db.query(
      `
      SELECT
        codigo,
        tipo,
        cliente_id,
        modelo_id,
        valor_bruto,
        taxa_gateway,
        velvet_fee,
        chargeback_result,
        origem_cliente,
        created_at
      FROM transacoes
      WHERE ${where}
      ORDER BY created_at DESC
      `,
      values
    );

    res.json(result.rows);
  }
);


router.get("/api/transacoes/resumo-mensal",
  authMiddleware,
  requireRole("admin", "modelo", "agente"),
  async (req, res) => {
    const { mes } = req.query;
    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
  return res.status(400).json({ error: "Formato de mês inválido (YYYY-MM)" });
} // ex: 2025-12
    const { role, id: modelo_id } = req.user;

    const dataBase = `${mes}-01`;

    let values = [];
    let where = `
      status = 'normal'
      AND created_at >= date_trunc('month', $1::date)
      AND created_at <  date_trunc('month', $1::date) + interval '1 month'
    `;

    values.push(dataBase);

    if (role === "modelo") {
      values.push(modelo_id);
      where += ` AND modelo_id = $${values.length}`;
    }

    const result = await db.query(
      `
      SELECT
        COALESCE(SUM(valor_bruto),0) AS total_bruto,
        COALESCE(SUM(taxa_gateway),0) AS total_taxas,
        COALESCE(SUM(agency_fee),0) AS total_agency,
        COALESCE(SUM(velvet_fee),0) AS total_velvet,
        COALESCE(SUM(valor_modelo),0) AS total_modelo,

        COALESCE(SUM(CASE WHEN tipo = 'assinatura' THEN valor_bruto END),0) AS total_assinaturas,
        COALESCE(SUM(CASE WHEN tipo = 'midia' THEN valor_bruto END),0) AS total_midias
      FROM transacoes
      WHERE ${where}
      `,
      values
    );

    res.json(result.rows[0]);
  }
);

router.get("/api/relatorios/alertas-chargeback",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {

    const { rows } = await db.query(
      `
      SELECT *
      FROM chargeback_alertas
      WHERE ativo = true
      ORDER BY
        CASE nivel
          WHEN 'critico' THEN 1
          WHEN 'alto' THEN 2
          ELSE 3
        END,
        ultimo_chargeback DESC
      `
    );

    res.json(rows);
  }
);

router.get("/api/transacoes/resumo-anual",
  authMiddleware,
  requireRole("admin", "modelo"),
  async (req, res) => {
    const { ano } = req.query; // ex: 2025
    const { role, id: modelo_id } = req.user;

    const inicio = `${ano}-01-01`;
    const fim = `${Number(ano) + 1}-01-01`;

    let values = [inicio, fim];
    let where = `
      status = 'normal'
      AND created_at >= $1
      AND created_at < $2
    `;

    if (role === "modelo") {
      values.push(modelo_id);
      where += ` AND modelo_id = $${values.length}`;
    }

    const result = await db.query(
      `
      SELECT
        DATE_TRUNC('month', created_at) AS mes,

        COALESCE(SUM(valor_bruto),0) AS total_bruto,
        COALESCE(SUM(taxa_gateway),0) AS total_taxas,
        COALESCE(SUM(agency_fee),0) AS total_agency,
        COALESCE(SUM(velvet_fee),0) AS total_velvet,
        COALESCE(SUM(valor_modelo),0) AS total_modelo,

        COALESCE(SUM(CASE WHEN tipo='assinatura' THEN valor_bruto END),0) AS total_assinaturas,
        COALESCE(SUM(CASE WHEN tipo='midia' THEN valor_bruto END),0) AS total_midias

      FROM transacoes
      WHERE ${where}
      GROUP BY mes
      ORDER BY mes
      `,
      values
    );

    res.json(result.rows);
  }
);

router.get("/api/alertas/risco",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {

    const { rows } = await db.query(`
      SELECT
        cliente_id,
        score,
        nivel,
        atualizado_em
      FROM cliente_risco
      WHERE nivel IN ('alto','critico')
      ORDER BY score DESC
    `);

    res.json(rows);
  }
);

router.get("/modelo/relatorio", (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "admin-pages", "relatorio.html")
  );
});


router.get("/modelo/transacoes",
  requireRole("modelo", "admin", "agente"),
  (req, res) => {
    res.sendFile(
      path.join(process.cwd(), "transacoes", "transacoes.html")
    );
  }
);

router.get("/content/transacoes", (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "content", "transacoes.html")
  );
});

router.get("/api/cliente/transacoes", authCliente, async (req, res) => {
  try {
    const clienteId = req.user.id;

    // 📦 Conteúdos comprados
    const conteudos = await db.query(`
      SELECT
        'conteudo' AS tipo,
        cp.id,
        cp.modelo_id,
        cp.valor_total AS valor,
        cp.status,
        cp.criado_em AS created_at,
        cp.message_id
      FROM conteudo_pacotes cp
      WHERE cp.cliente_id = $1
        AND cp.status = 'pago'
    `, [clienteId]);

    // ⭐ Assinaturas VIP
    const assinaturas = await db.query(`
      SELECT
        'assinatura' AS tipo,
        v.id,
        v.modelo_id,
        (
          v.valor_assinatura +
          v.taxa_transacao +
          v.taxa_plataforma
        ) AS valor,
        CASE
          WHEN v.ativo THEN 'ativa'
          ELSE 'inativa'
        END AS status,
        v.created_at,
        NULL AS message_id
      FROM vip_subscriptions v
      WHERE v.cliente_id = $1
    `, [clienteId]);

    // 🔀 Unifica e ordena
    const historico = [
      ...conteudos.rows,
      ...assinaturas.rows
    ].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    res.json(historico);

  } catch (err) {
    console.error("Erro histórico cliente:", err);
    res.status(500).json({ error: "Erro ao buscar histórico do cliente" });
  }
});


router.get("/api/modelo/financeiro", authModelo, async (req, res) => {
  const modelo_id = req.user.id;

  const result = await db.query(`
    SELECT
  -- 🔹 HOJE
  COALESCE(SUM(CASE
    WHEN tipo = 'conteudo'
     AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')::date
         = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')::date
    THEN valor_modelo
  END), 0) AS hoje_midias,

  COALESCE(SUM(CASE
    WHEN tipo = 'assinatura'
     AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')::date
         = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')::date
    THEN valor_modelo
  END), 0) AS hoje_assinaturas,
  
  -- 🔹 MÊS ATUAL
  COALESCE(SUM(CASE
    WHEN tipo = 'conteudo'
     AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo')
         = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
    THEN valor_modelo
  END), 0) AS mes_midias,

  COALESCE(SUM(CASE
    WHEN tipo = 'assinatura'
     AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo')
         = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
    THEN valor_modelo
  END), 0) AS mes_assinaturas,

  -- 🔹 ACUMULADO 2026
  COALESCE(SUM(CASE
    WHEN EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Sao_Paulo') = 2026
    THEN valor_modelo
  END), 0) AS acumulado_2026

FROM (
  -- 📦 CONTEÚDOS
  SELECT
    cp.modelo_id,
    cp.criado_em AS created_at,
    'conteudo' AS tipo,
    ROUND(cp.preco * 0.70, 2) AS valor_modelo
  FROM conteudo_pacotes cp
  WHERE cp.status = 'pago'
    AND cp.modelo_id = $1

  UNION ALL

  -- ⭐ ASSINATURAS
  SELECT
    vs.modelo_id,
    vs.created_at,
    'assinatura' AS tipo,
    ROUND(vs.valor_assinatura * 0.70, 2) AS valor_modelo
  FROM vip_subscriptions vs
  WHERE vs.modelo_id = $1
) t;
  `, [modelo_id]);

const assinantes = await db.query(
  `
SELECT
  COUNT(*) FILTER (WHERE ativo = true) AS total,
  COUNT(*) FILTER (
    WHERE ativo = true
    AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
        = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
  ) AS hoje
FROM vip_subscriptions
WHERE modelo_id = $1;
  `,
  [req.user.id]
);

  const r = result.rows[0];
  const a = assinantes.rows[0];

  res.json({
  hoje: {
    midias: r.hoje_midias,
    assinaturas: r.hoje_assinaturas
  },
  mes: {
    midias: r.mes_midias,
    assinaturas: r.mes_assinaturas
  },
  total: {
    acumulado_2026: r.acumulado_2026
  },
  assinantes: {
    total: Number(a.total || 0),
    hoje: Number(a.hoje || 0)
  }
});
});

// ===============================
// 📣 ALLMESSAGE - LISTAR MODELOS
// ===============================
router.get(
  "/api/allmessage/modelos",
  authMiddleware,
  requireRole("admin", "modelo"),
  async (req, res) => {
    try {
      const { role, id: user_id } = req.user;

       let sql = `
        SELECT
          m.id        AS modelo_id,
          m.nome      AS nome
        FROM modelos m
      `;
      let params = [];

      // 🔒 modelo só vê a própria
      if (role === "modelo") {
        sql += ` WHERE m.user_id = $1 `;
        params.push(user_id);
      }

      sql += ` ORDER BY m.nome `;

      const result = await db.query(sql, params);
      res.json(result.rows);

    } catch (err) {
      console.error("❌ Erro ALLMESSAGE modelos:", err);
      res.status(500).json({ error: "Erro ao listar modelos" });
    }
  }
);


// ===============================
// 📣 ALLMESSAGE - CONTEÚDOS DA MODELO
// ===============================
router.get("/api/allmessage/conteudos/:modelo_id",
  authMiddleware,
  requireRole("admin", "modelo"),
  async (req, res) => {
    try {
      const { modelo_id } = req.params;
      const { role, id: user_id } = req.user;

      if (role === "modelo") {
        const check = await db.query(
          `SELECT 1 FROM modelos WHERE id = $1 AND user_id = $2`,
          [modelo_id, user_id]
        );
        if (check.rowCount === 0) {
          return res.json([]); // ⚠️ sempre array
        }
      }

      const result = await db.query(
        `
        SELECT
          id,
          url,
          thumbnail_url AS thumbnail
        FROM conteudos
        WHERE user_id = $1
          AND tipo_conteudo = 'venda'
        ORDER BY id DESC
        `,
        [modelo_id]
      );

      res.json(result.rows); // ✅ SEMPRE array

    } catch (err) {
      console.error("❌ Erro ALLMESSAGE conteudos:", err);
      res.json([]); // ⚠️ NUNCA retornar objeto
    }
  }
);

router.get("/api/relatorios/kpis-mensais",
  authMiddleware, // ⬅️ SEM requireRole restritivo
  async (req, res) => {
    try {
      const { mes, modelo_id } = req.query;

      if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return res.status(400).json({ error: "Mês inválido" });
      }

      const inicio = `${mes}-01`;

      let values = [inicio];
      let whereModelo = "";

      if (modelo_id) {
        values.push(modelo_id);
        whereModelo = `AND modelo_id = $${values.length}`;
      }

      const { rows } = await db.query(
        `
        SELECT
          COALESCE(SUM(valor_modelo),0)                        AS ganhos_totais,
          COALESCE(SUM(CASE WHEN tipo='assinatura'
            THEN valor_modelo END),0)                          AS ganhos_assinaturas,
          COUNT(DISTINCT DATE(created_at))                     AS dias_com_venda,
          COUNT(DISTINCT cliente_id)
            FILTER (WHERE tipo='assinatura')                   AS assinantes_mes,
          COUNT(*) FILTER (WHERE status='chargeback')          AS chargebacks
        FROM transacoes
        WHERE created_at >= date_trunc('month', $1::date)
          AND created_at <  date_trunc('month', $1::date) + interval '1 month'
          ${whereModelo}
        `,
        values
      );

      res.json(rows[0]);
    } catch (err) {
      console.error("Erro KPIs mensais:", err);
      res.status(500).json({});
    }
  }
);


////////////////////////////////////////// ADM ////////////////////////////////////////////////////
router.get(
  '/admin/relatorios/geral',
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const [
        midiasDia,
        assinaturasDia,
        midiasMes,
        assinaturasMes,
        midiasAno,
        assinaturasAno
      ] = await Promise.all([

        // 📦 MÍDIAS — HOJE
        db.query(`
          SELECT COALESCE(SUM(valor_total), 0) AS total
          FROM conteudo_pacotes
          WHERE DATE(criado_em) = CURRENT_DATE
        `),

        // ⭐ ASSINATURAS — HOJE
        db.query(`
          SELECT COALESCE(SUM(valor_total), 0) AS total
          FROM vip_subscriptions
          WHERE DATE(created_at) = CURRENT_DATE
        `),

        // 📦 MÍDIAS — MÊS ATUAL
        db.query(`
          SELECT COALESCE(SUM(valor_total), 0) AS total
          FROM conteudo_pacotes
          WHERE DATE_TRUNC('month', criado_em)
                = DATE_TRUNC('month', NOW())
        `),

        // ⭐ ASSINATURAS — MÊS ATUAL
        db.query(`
          SELECT COALESCE(SUM(valor_total), 0) AS total
          FROM vip_subscriptions
          WHERE DATE_TRUNC('month', created_at)
                = DATE_TRUNC('month', NOW())
        `),

        // 📦 MÍDIAS — ANO ATUAL
        db.query(`
          SELECT COALESCE(SUM(valor_total), 0) AS total
          FROM conteudo_pacotes
          WHERE EXTRACT(YEAR FROM criado_em)
                = EXTRACT(YEAR FROM NOW())
        `),

        // ⭐ ASSINATURAS — ANO ATUAL
        db.query(`
          SELECT COALESCE(SUM(valor_total), 0) AS total
          FROM vip_subscriptions
          WHERE EXTRACT(YEAR FROM created_at)
                = EXTRACT(YEAR FROM NOW())
        `)
      ]);

      res.json({
        dia: {
          midias: Number(midiasDia.rows[0].total),
          assinaturas: Number(assinaturasDia.rows[0].total)
        },
        mes: {
          midias: Number(midiasMes.rows[0].total),
          assinaturas: Number(assinaturasMes.rows[0].total)
        },
        ano: {
          midias: Number(midiasAno.rows[0].total),
          assinaturas: Number(assinaturasAno.rows[0].total)
        }
      });

    } catch (err) {
      console.error("❌ Erro relatório geral:", err);
      res.status(500).json({ error: "Erro ao gerar relatório" });
    }
  }
);


// 📊 RELATÓRIO DIÁRIO (GRÁFICO 30 DIAS) - ADMIN ONLY
router.get(
  '/admin/relatorios/diario',
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { mes } = req.query;

      // 🔒 valida mês (opcional)
      if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return res.status(400).json({
          error: "Formato de mês inválido (YYYY-MM)"
        });
      }

      // 📅 intervalo correto do mês (Postgres)
      const inicio = mes ? `${mes}-01` : null;
      const fim = mes
        ? `(${mes}-01)::date + INTERVAL '1 month'`
        : null;

      const query = `
        SELECT
          dia,
          SUM(total) AS total
        FROM (
          -- 📦 MÍDIAS
          SELECT
            DATE(criado_em) AS dia,
            valor_total AS total
          FROM conteudo_pacotes
          WHERE status = 'pago'
            ${mes ? 'AND criado_em >= $1 AND criado_em < ($1::date + INTERVAL \'1 month\')' : ''}

          UNION ALL

          -- ⭐ ASSINATURAS
          SELECT
            DATE(created_at) AS dia,
            valor_total AS total
          FROM vip_subscriptions
          WHERE ativo = true
            ${mes ? 'AND created_at >= $1 AND created_at < ($1::date + INTERVAL \'1 month\')' : ''}
        ) t
        GROUP BY dia
        ORDER BY dia ASC
        LIMIT 31
      `;

      const params = mes ? [inicio] : [];

      const result = await db.query(query, params);

      // 🔁 formato exato que o JS espera
      const resposta = result.rows.map(r => ({
        dia: String(r.dia.getDate()).padStart(2, '0'),
        total: Number(r.total)
      }));

      res.json(resposta);

    } catch (err) {
      console.error("❌ Erro relatório diário:", err);
      res.status(500).json([]);
    }
  }
);

router.get(
  '/admin/relatorios/modelo',
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { modelo_id } = req.query;

      if (!modelo_id) {
        return res.status(400).json({ error: "modelo_id obrigatório" });
      }

      const resultados = await Promise.all([
        // 💰 GANHOS — REGRA FINAL (55% MODELO / 45% VELVET)
        db.query(`
  SELECT
    COALESCE(SUM(valor_total * 0.55), 0) AS ganhos_modelo,
    COALESCE(SUM(valor_total * 0.45), 0) AS ganhos_velvet
  FROM (
    -- 📦 MÍDIAS
    SELECT cp.valor_total
    FROM conteudo_pacotes cp
    WHERE cp.modelo_id = $1
      AND cp.status = 'pago'

    UNION ALL

    -- ⭐ ASSINATURAS
    SELECT vs.valor_total
    FROM vip_subscriptions vs
    WHERE vs.modelo_id = $1
      AND vs.ativo = true
  ) t
`, [modelo_id]),
      ]);

      const ganhos = resultados[0];
      const assinantes = resultados[1];

      res.json({
        ganhos: ganhos.rows[0],
        assinantes: assinantes.rows[0]
      });

    } catch (err) {
      console.error("❌ Erro relatório por modelo:", err);
      res.status(500).json({ error: "Erro relatório modelo" });
    }
  }
);

router.get("/api/modelo/dados-bancarios", authModelo, async (req, res) => {
  const result = await db.query(
    `SELECT * FROM modelo_dados_bancarios WHERE modelo_id = $1`,
    [req.user.id]
  );

  res.json(result.rows[0] || null);
});

router.get("/api/modelo/dados-bancarios", authModelo, async (req, res) => {
  const result = await db.query(
    `SELECT * FROM modelo_dados_bancarios WHERE modelo_id = $1`,
    [req.user.id]
  );

  res.json(result.rows[0] || null);
});

router.get("/modelo/conteudos", authMiddleware, authModelo, async (req, res) => {
  const modelo_id = req.user.id;

  const result = await db.query(
    `
    SELECT id, url, thumbnail
    FROM conteudos
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [modelo_id]
  );

  res.json(result.rows);
});





module.exports = router;