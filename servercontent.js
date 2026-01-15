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
router.use(
  "/assets",
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

function calcularScoreRisco({
  totalLost,
  totalWon,
  valorTotal,
  recentes30d,
  reincidente
}) {
  let score = 0;

  score += totalLost * 30;
  score += totalWon * 10;
  score += Math.floor(valorTotal / 5);

  if (recentes30d) score += 15;
  if (reincidente) score += 20;

  return Math.min(score, 100);
}


//ROTASSSS POST ///////////////////
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

router.post(
  "/api/transacoes/:id/chargeback",
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



//ROTAS GETSSSS/////////////////////
router.get(
  "/relatorios",
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

      const sql = `
        SELECT
          cp.id                    AS codigo,
          'conteudo'               AS tipo,
          cp.cliente_id,
          cp.pago_em               AS created_at,

          cp.valor_base            AS valor_bruto,
          ROUND(cp.valor_base * 0.30, 2) AS velvet_fee,
          ROUND(cp.valor_base * 0.70, 2) AS valor_modelo,

          cp.status,
          cp.message_id
        FROM conteudo_pacotes cp
        WHERE cp.modelo_id = $1
          AND cp.status = 'pago'

        UNION ALL

        SELECT
          vs.id                    AS codigo,
          'assinatura'             AS tipo,
          vs.cliente_id,
          vs.created_at,

          vs.valor_assinatura      AS valor_bruto,
          ROUND(vs.valor_assinatura * 0.30, 2) AS velvet_fee,
          ROUND(vs.valor_assinatura * 0.70, 2) AS valor_modelo,

          CASE
            WHEN vs.ativo THEN 'ativa'
            ELSE 'cancelada'
          END AS status,
          NULL AS message_id
        FROM vip_subscriptions vs
        WHERE vs.modelo_id = $1

        ORDER BY created_at DESC
      `;

      const result = await db.query(sql, [modelo_id]);
      res.json(result.rows);

    } catch (err) {
      console.error("❌ Erro /api/transacoes (modelo):", err);
      res.status(500).json([]);
    }
  }
);




//ROTA DO LINK DE ACESSO A PLATAFORMA(CLIENTES INSTA TIKTOK)
router.get(
  "/api/transacoes/origem",
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


router.get(
  "/api/transacoes/diario",
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



router.get(
  "/api/relatorios/chargebacks",
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


router.get(
  "/api/transacoes/resumo-mensal",
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


const ExcelJS = require("exceljs");

router.get(
  "/api/export/resumo-mensal/excel",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    const { mes } = req.query;
    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
  return res.status(400).json({ error: "Formato de mês inválido (YYYY-MM)" });
}

    const dataBase = `${mes}-01`;

    const values = [dataBase];

    const where = `
      status = 'normal'
      AND created_at >= date_trunc('month', $1::date)
      AND created_at < date_trunc('month', $1::date) + interval '1 month'
    `;

    const { rows } = await db.query(
      `
      SELECT
        DATE(created_at) AS dia,
        tipo,
        valor_bruto,
        valor_modelo,
        velvet_fee
      FROM transacoes
      WHERE ${where}
      ORDER BY created_at
      `,
      values
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Resumo Mensal");

    sheet.columns = [
      { header: "Dia", key: "dia" },
      { header: "Tipo", key: "tipo" },
      { header: "Valor Bruto", key: "valor_bruto" },
      { header: "Ganhos Modelo", key: "valor_modelo" },
      { header: "Ganhos Velvet", key: "velvet_fee" }
    ];

    rows.forEach(r => sheet.addRow(r));

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=resumo-${mes}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    res.end();
  }
);

const PDFDocument = require("pdfkit");

router.get(
  "/api/export/resumo-mensal/pdf",
  authMiddleware,
  requireRole("agente"),
  async (req, res) => {
    const { mes } = req.query;
    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
  return res.status(400).json({ error: "Formato de mês inválido (YYYY-MM)" });
}
    const { id: agente_id } = req.user;

    let values = [`${mes}-01`, agente_id];

    const where = `
      status = 'normal'
      AND created_at >= date_trunc('month', $1::date)
      AND created_at < date_trunc('month', $1::date) + interval '1 month'
      AND agente_id = $2
    `;

    const { rows } = await db.query(
      `
      SELECT
        codigo,
        tipo,
        valor_bruto,
        valor_modelo,
        created_at
      FROM transacoes
      WHERE ${where}
      ORDER BY created_at
      `,
      values
    );

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=resumo-${mes}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(18).text(`Resumo Mensal - ${mes}`, { align: "center" });
    doc.moveDown();

    rows.forEach(t => {
      doc
        .fontSize(10)
        .text(
          `#${t.codigo} | ${t.tipo.toUpperCase()} | ${t.created_at
            .toISOString()
            .slice(0, 10)}`
        )
        .text(`Bruto: $${t.valor_bruto} | Modelo: $${t.valor_modelo}`)
        .moveDown(0.5);
    });

    doc.end();
  }
);


router.get(
  "/api/export/chargebacks/excel",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {

    const { mes } = req.query;
    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
  return res.status(400).json({ error: "Formato de mês inválido (YYYY-MM)" });
}

    const { rows } = await db.query(
      `
      SELECT
        codigo,
        tipo,
        cliente_id,
        modelo_id,
        valor_bruto,
        chargeback_result,
        origem_cliente,
        created_at
      FROM transacoes
      WHERE status = 'chargeback'
        AND created_at >= date_trunc('month', $1::date)
        AND created_at < date_trunc('month', $1::date) + interval '1 month'
      ORDER BY created_at DESC
      `,
      [`${mes}-01`]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Chargebacks");

    sheet.columns = [
      { header: "Código", key: "codigo" },
      { header: "Tipo", key: "tipo" },
      { header: "Cliente ID", key: "cliente_id" },
      { header: "Modelo ID", key: "modelo_id" },
      { header: "Valor", key: "valor_bruto" },
      { header: "Resultado", key: "chargeback_result" },
      { header: "Origem", key: "origem_cliente" },
      { header: "Data", key: "created_at" }
    ];

    rows.forEach(r => sheet.addRow(r));

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=chargebacks-${mes}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    res.end();
  }
);


router.get(
  "/api/export/chargebacks/pdf",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {

    const { mes } = req.query;
    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
  return res.status(400).json({ error: "Formato de mês inválido (YYYY-MM)" });
}

    const { rows } = await db.query(
      `
      SELECT
        codigo,
        tipo,
        valor_bruto,
        chargeback_result,
        origem_cliente,
        created_at
      FROM transacoes
      WHERE status = 'chargeback'
        AND created_at >= date_trunc('month', $1::date)
        AND created_at < date_trunc('month', $1::date) + interval '1 month'
      ORDER BY created_at DESC
      `,
      [`${mes}-01`]
    );

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=chargebacks-${mes}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(18).text(`Chargebacks - ${mes}`, { align: "center" });
    doc.moveDown();

    rows.forEach(cb => {
      doc
        .fontSize(10)
        .text(
          `#${cb.codigo} | ${cb.tipo.toUpperCase()} | ${cb.chargeback_result.toUpperCase()}`
        )
        .text(`Valor: $${cb.valor_bruto} | Origem: ${cb.origem_cliente}`)
        .moveDown(0.5);
    });

    doc.end();
  }
);

router.get(
  "/api/relatorios/alertas-chargeback",
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

router.get(
  "/api/transacoes/resumo-anual",
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


router.get(
  "/api/export/resumo-anual/excel",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    const { ano } = req.query;

    const inicio = `${ano}-01-01`;
    const fim = `${Number(ano) + 1}-01-01`;

    const values = [inicio, fim];

    const where = `
      status = 'normal'
      AND created_at >= $1
      AND created_at < $2
    `;

    const { rows } = await db.query(
      `
      SELECT
        TO_CHAR(created_at,'YYYY-MM') AS mes,
        tipo,
        valor_bruto,
        valor_modelo,
        velvet_fee
      FROM transacoes
      WHERE ${where}
      ORDER BY created_at
      `,
      values
    );

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Resumo ${ano}`);

    sheet.columns = [
      { header: "Mês", key: "mes" },
      { header: "Tipo", key: "tipo" },
      { header: "Valor Bruto", key: "valor_bruto" },
      { header: "Ganhos Modelo", key: "valor_modelo" },
      { header: "Ganhos Velvet", key: "velvet_fee" }
    ];

    rows.forEach(r => sheet.addRow(r));

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=resumo-anual-${ano}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    res.end();
  }
);


router.get(
  "/api/export/resumo-anual/pdf",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    const { ano } = req.query;

    const inicio = `${ano}-01-01`;
    const fim = `${Number(ano) + 1}-01-01`;

    const values = [inicio, fim];

    const where = `
      status = 'normal'
      AND created_at >= $1
      AND created_at < $2
    `;

    const { rows } = await db.query(
      `
      SELECT
        TO_CHAR(created_at,'YYYY-MM') AS mes,
        SUM(valor_bruto) AS bruto,
        SUM(valor_modelo) AS modelo,
        SUM(velvet_fee) AS velvet
      FROM transacoes
      WHERE ${where}
      GROUP BY mes
      ORDER BY mes
      `,
      values
    );

    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=resumo-anual-${ano}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(18).text(`Resumo Anual - ${ano}`, { align: "center" });
    doc.moveDown();

    rows.forEach(m => {
      doc
        .fontSize(11)
        .text(
          `${m.mes} | Bruto: $${m.bruto} | Modelo: $${m.modelo} | Velvet: $${m.velvet}`
        )
        .moveDown(0.5);
    });

    doc.end();
  }
);


router.get(
  "/api/alertas/risco",
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


router.get(
  "/modelo/transacoes",
  requireRole("modelo", "admin", "agente"),
  (req, res) => {
    res.sendFile(
      path.join(process.cwd(), "transacoes", "transacoes.html")
    );
  }
);

// router.get(
//   "/api/transacoes/resumo-geral",
//   authMiddleware,
//   requireRole("modelo"),
//   async (req, res) => {

//     const modelo_id = req.user.id;

//     const result = await db.query(
//       `
//       SELECT
//         COALESCE(SUM(valor_modelo),0) AS total_geral,
//         COALESCE(SUM(CASE WHEN tipo = 'midia' THEN valor_modelo END),0)
//           AS total_midias,
//         COALESCE(SUM(CASE WHEN tipo = 'assinatura' THEN valor_modelo END),0)
//           AS total_assinaturas
//       FROM transacoes
//       WHERE status = 'normal'
//         AND modelo_id = $1
//       `,
//       [modelo_id]
//     );

//     res.json(result.rows[0]);
//   }
// );

router.get(
  "/api/modelos",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    const result = await db.query(`
      SELECT id, nome
      FROM modelos
      WHERE ativo = true
      ORDER BY nome
    `);

    res.json(result.rows);
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


// router.get("/api/modelo/ganhos-resumo", authModelo, async (req, res) => {
//   const modelo_id = req.user.id;

//   try {
//     // 🔹 MIDIAS
//     const midias = await db.query(`
//       SELECT
//         COALESCE(SUM(CASE WHEN DATE(pago_em) = CURRENT_DATE THEN valor_base END),0) AS hoje,
//         COALESCE(SUM(CASE WHEN DATE_TRUNC('month', pago_em) = DATE_TRUNC('month', CURRENT_DATE) THEN valor_base END),0) AS mes,
//         COALESCE(SUM(valor_base),0) AS total
//       FROM conteudo_pacotes
//       WHERE modelo_id = $1
//         AND status = 'pago'
//     `, [modelo_id]);

//     // 🔹 ASSINATURAS
//     const assinaturas = await db.query(`
//       SELECT
//         COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN valor_assinatura END),0) AS hoje,
//         COALESCE(SUM(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) THEN valor_assinatura END),0) AS mes,
//         COALESCE(SUM(valor_assinatura),0) AS total
//       FROM vip_subscriptions
//       WHERE modelo_id = $1
//         AND ativo = true
//     `, [modelo_id]);

//     res.json({
//       midias: midias.rows[0],
//       assinaturas: assinaturas.rows[0]
//     });

//   } catch (err) {
//     console.error("Erro ganhos-resumo:", err);
//     res.status(500).json({ error: "Erro ao carregar ganhos" });
//   }
// });

router.get("/api/modelo/financeiro", authModelo, async (req, res) => {
  const modelo_id = req.user.id;

  const result = await db.query(`
    SELECT
  -- 🔹 HOJE
  COALESCE(SUM(CASE
    WHEN tipo = 'conteudo'
     AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
         = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
    THEN valor_modelo
  END), 0) AS hoje_midias,

  COALESCE(SUM(CASE
    WHEN tipo = 'assinatura'
     AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
         = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
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

  const r = result.rows[0];

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
  }
});
});








module.exports = router;