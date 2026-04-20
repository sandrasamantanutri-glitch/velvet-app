// ========================================
// ADMIN DASHBOARD — API ROUTES
// ========================================

const express = require("express");
const router = express.Router();
const AWS = require("aws-sdk");
const db = require("../db");
const auth = require("../middleware/auth");
const authAdmin = require("../middleware/authAdmin");
const bcrypt = require("bcrypt");
const { enviarEmailAprovacao } = require("../email");
const { enviarEmailRejeicao } = require("../email");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const s3Privado = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.B2_ENDPOINT),
  accessKeyId: process.env.B2_KEY_ID_PRIVATE,
  secretAccessKey: process.env.B2_APP_KEY_PRIVATE,
  region: process.env.B2_REGION,

  signatureVersion: "v4",
  s3ForcePathStyle: true
});

// All routes require admin auth
router.use(auth, authAdmin);

// ========== HELPERS ==========

function parseMes(mesStr) {
  if (!mesStr) return null;
  const [ano, mes] = mesStr.split("-");
  if (!ano || !mes) return null;
  return { ano: Number(ano), mes: Number(mes) };
}

function paginate(query, defaultPage = 1, defaultLimit = 20) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isFinite(page) || page < 1) page = defaultPage;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;

  limit = Math.min(limit, 100);

  const offset = (page - 1) * limit;

  return { limit, offset, page };
}

function assinarArquivoPrivado(key) {
  if (!key) return null;

  return s3Privado.getSignedUrl("getObject", {
    Bucket: process.env.B2_BUCKET_PRIVATE,
    Key: key,
    Expires: 60 * 10
  });
}

// ========== 1. OVERVIEW ==========

router.get("/overview", authAdmin, async (req, res) => {
  try {
    const [modelos, clientes, vips, fatd, fatm, fat12m, acessos, top] = await Promise.all([
      db.query(`
        SELECT COUNT(*) AS total
        FROM modelos
        WHERE ativo = true
          AND verificada = true
      `),

      db.query(`
        SELECT COUNT(*) AS total
        FROM clientes
        WHERE ativo = true
      `),

      db.query(`
        SELECT COUNT(*) AS total
        FROM vip_subscriptions
        WHERE ativo = true
      `),

      db.query(`
        SELECT COALESCE(SUM(t.valor_bruto), 0) AS total
        FROM transacoes_agency t
        WHERE t.created_at >= date_trunc('day', NOW())
          AND t.created_at < (date_trunc('day', NOW()) + INTERVAL '1 day')
          AND COALESCE(t.status, 'pago') NOT IN ('falhou', 'cancelado', 'estornado', 'chargeback')
      `),

      db.query(`
        SELECT COALESCE(SUM(t.valor_bruto), 0) AS total
        FROM transacoes_agency t
        WHERE t.created_at >= date_trunc('month', NOW())
          AND t.created_at < (date_trunc('month', NOW()) + INTERVAL '1 month')
          AND COALESCE(t.status, 'pago') NOT IN ('falhou', 'cancelado', 'estornado', 'chargeback')
      `),

      db.query(`
        SELECT
          TO_CHAR(meses.mes, 'YYYY-MM') AS mes,
          COALESCE(SUM(t.valor_bruto), 0) AS total
        FROM generate_series(
          date_trunc('month', NOW()) - INTERVAL '11 months',
          date_trunc('month', NOW()),
          INTERVAL '1 month'
        ) AS meses(mes)
        LEFT JOIN transacoes_agency t
          ON date_trunc('month', t.created_at) = meses.mes
          AND COALESCE(t.status, 'pago') NOT IN ('falhou', 'cancelado', 'estornado', 'chargeback')
        GROUP BY meses.mes
        ORDER BY meses.mes ASC
      `),

      db.query(`
SELECT
  CASE
    WHEN LOWER(origem_trafego) LIKE '%instagram%' 
      OR LOWER(origem_trafego) LIKE '%insta%'
      OR LOWER(origem_trafego) LIKE '%src=instagram%' THEN 'Instagram'
    WHEN LOWER(origem_trafego) LIKE '%tiktok%'
      OR LOWER(origem_trafego) LIKE '%src=tiktok%' THEN 'TikTok'
    WHEN LOWER(origem_trafego) IN ('direto','direct','none','unknown','(direct)','(none)') THEN 'Direto'
    ELSE 'Outros'
  END AS origem,
  COUNT(*) AS total
FROM clientes
WHERE created_at >= date_trunc('month', NOW())
  AND created_at < (date_trunc('month', NOW()) + INTERVAL '1 month')
  AND origem_trafego IS NOT NULL
  AND origem_trafego != ''
GROUP BY 
  CASE
    WHEN LOWER(origem_trafego) LIKE '%instagram%' 
      OR LOWER(origem_trafego) LIKE '%insta%'
      OR LOWER(origem_trafego) LIKE '%src=instagram%' THEN 'Instagram'
    WHEN LOWER(origem_trafego) LIKE '%tiktok%'
      OR LOWER(origem_trafego) LIKE '%src=tiktok%' THEN 'TikTok'
    WHEN LOWER(origem_trafego) IN ('direto','direct','none','unknown','(direct)','(none)') THEN 'Direto'
    ELSE 'Outros'
  END
ORDER BY total DESC;
      `),

      db.query(`
        SELECT
          t.modelo_id,
          m.nome,
          ROUND(COALESCE(SUM(t.valor_modelo), 0)::numeric, 2) AS ganhos,
          MAX(t.created_at) AS atualizado_em,
          (
            SELECT COUNT(*)
            FROM vip_subscriptions v
            WHERE v.modelo_id = t.modelo_id
              AND v.ativo = true
          ) AS assinantes
        FROM transacoes_agency t
        LEFT JOIN modelos m ON m.id = t.modelo_id
        WHERE t.modelo_id IS NOT NULL
          AND t.created_at >= date_trunc('month', NOW())
          AND t.created_at < (date_trunc('month', NOW()) + INTERVAL '1 month')
          AND COALESCE(t.status, 'pago') NOT IN ('falhou', 'cancelado', 'estornado', 'chargeback')
        GROUP BY t.modelo_id, m.nome
        ORDER BY ganhos DESC, atualizado_em DESC
        LIMIT 5
      `)
    ]);

    res.json({
      total_modelos: Number(modelos.rows[0]?.total || 0),
      total_clientes: Number(clientes.rows[0]?.total || 0),
      vips_ativos: Number(vips.rows[0]?.total || 0),
      faturamento_dia: Number(fatd.rows[0]?.total || 0),
      faturamento_mes: Number(fatm.rows[0]?.total || 0),
      faturamento_12m: (fat12m.rows || []).map(r => ({
        mes: r.mes,
        total: Number(r.total || 0)
      })),
      acessos_origem: (acessos.rows || []).map(r => ({
        origem: r.origem,
        total: Number(r.total || 0)
      })),
      top_modelos: (top.rows || []).map(r => ({
        modelo_id: r.modelo_id,
        nome: r.nome,
        ganhos: Number(r.ganhos || 0),
        assinantes: Number(r.assinantes || 0)
      }))
    });
  } catch (err) {
    console.error("Erro overview:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 2. TRAFEGO ==========

// router.post("/acessos-origem", async (req, res) => {
//   try {
//     const {
//       modelo_id,
//       ref_modelo,
//       origem_trafego,
//       utm_source,
//       utm_medium,
//       utm_campaign,
//       utm_content,
//       utm_term,
//       referer,
//       landing_page,
//       current_url,
//       pagina
//     } = req.body;

//     const ip =
//       req.headers["cf-connecting-ip"] ||
//       req.headers["x-forwarded-for"]?.split(",")[0] ||
//       req.ip;

//     const userAgent = req.headers["user-agent"];

//     await db.query(
//       `
//       INSERT INTO acessos_origem (
//         user_id,
//         cliente_id,
//         modelo_id,
//         ref_modelo,
//         origem,
//         utm_source,
//         utm_medium,
//         utm_campaign,
//         utm_content,
//         utm_term,
//         referer,
//         landing_page,
//         current_url,
//         pagina,
//         ip,
//         user_agent,
//         created_at
//       )
//       VALUES (
//         $1,$2,$3,$4,$5,
//         $6,$7,$8,$9,$10,
//         $11,$12,$13,$14,$15,$16,NOW()
//       )
//       `,
//       [
//         req.user?.id || null,
//         req.user?.cliente_id || null,
//         modelo_id || ref_modelo || null,
//         ref_modelo || null,
//         origem_trafego || null,
//         utm_source || null,
//         utm_medium || null,
//         utm_campaign || null,
//         utm_content || null,
//         utm_term || null,
//         referer || null,
//         landing_page || null,
//         current_url || null,
//         pagina || null,
//         ip || null,
//         userAgent || null
//       ]
//     );

//     res.json({ ok: true });
//   } catch (err) {
//     console.error("Erro ao registrar origem:", err);
//     res.status(500).json({ error: "Erro ao registrar origem" });
//   }
// });

router.get("/acessos-origem", authAdmin, async (req, res) => {
  try {
    const mes = req.query.mes; // formato: YYYY-MM

    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: "Parâmetro 'mes' inválido. Use YYYY-MM" });
    }

    const inicio = `${mes}-01`;
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + 1);

    const params = [inicio, fim];

    // 🔹 TOTAL
    const totalRes = await db.query(
      `
      SELECT
        COUNT(*)::int AS total,

        COUNT(*) FILTER (
          WHERE LOWER(origem_trafego) LIKE '%instagram%'
             OR LOWER(origem_trafego) LIKE '%insta%'
             OR LOWER(origem_trafego) LIKE '%src=instagram%'
        )::int AS instagram,

        COUNT(*) FILTER (
          WHERE LOWER(origem_trafego) LIKE '%tiktok%'
             OR LOWER(origem_trafego) LIKE '%src=tiktok%'
        )::int AS tiktok,

        COUNT(*) FILTER (
          WHERE LOWER(origem_trafego) IN ('direto','direct','none','unknown')
        )::int AS direto

      FROM clientes
      WHERE created_at >= $1
        AND created_at < $2
        AND origem_trafego IS NOT NULL
        AND origem_trafego != ''
      `,
      params
    );

    // 🔹 DIÁRIO
    const diarioRes = await db.query(
      `
      SELECT
        TO_CHAR(created_at::date, 'DD/MM') AS dia,

        COUNT(*) FILTER (
          WHERE LOWER(origem_trafego) LIKE '%instagram%'
             OR LOWER(origem_trafego) LIKE '%insta%'
             OR LOWER(origem_trafego) LIKE '%src=instagram%'
        )::int AS instagram,

        COUNT(*) FILTER (
          WHERE LOWER(origem_trafego) LIKE '%tiktok%'
             OR LOWER(origem_trafego) LIKE '%src=tiktok%'
        )::int AS tiktok,

        COUNT(*) FILTER (
          WHERE LOWER(origem_trafego) IN ('direto','direct','none','unknown')
        )::int AS direto

      FROM clientes
      WHERE created_at >= $1
        AND created_at < $2
        AND origem_trafego IS NOT NULL
        AND origem_trafego != ''
      GROUP BY created_at::date
      ORDER BY created_at::date ASC
      `,
      params
    );

    // 🔹 TOP MODELOS
    const topModelosRes = await db.query(
      `
      SELECT
        c.ref_modelo AS modelo_id,
        COALESCE(m.nome_exibicao, m.nome, 'Modelo #' || c.ref_modelo) AS nome,

        COUNT(*) FILTER (
          WHERE LOWER(c.origem_trafego) LIKE '%instagram%'
             OR LOWER(c.origem_trafego) LIKE '%insta%'
             OR LOWER(c.origem_trafego) LIKE '%src=instagram%'
        )::int AS instagram,

        COUNT(*) FILTER (
          WHERE LOWER(c.origem_trafego) LIKE '%tiktok%'
             OR LOWER(c.origem_trafego) LIKE '%src=tiktok%'
        )::int AS tiktok,

        COUNT(*) FILTER (
          WHERE LOWER(c.origem_trafego) IN ('direto','direct','none','unknown')
        )::int AS direto,

        COUNT(*)::int AS total

      FROM clientes c
      LEFT JOIN modelos m ON m.id = c.ref_modelo
      WHERE c.created_at >= $1
        AND c.created_at < $2
        AND c.ref_modelo IS NOT NULL
        AND c.origem_trafego IS NOT NULL
        AND c.origem_trafego != ''
      GROUP BY c.ref_modelo, m.nome_exibicao, m.nome
      ORDER BY total DESC
      LIMIT 20
      `,
      params
    );

    const totais = totalRes.rows[0] || {};

    res.json({
      total: Number(totais.total || 0),
      instagram: Number(totais.instagram || 0),
      tiktok: Number(totais.tiktok || 0),
      direto: Number(totais.direto || 0),
      distribuicao: true,

      diario: (diarioRes.rows || []).map(r => ({
        dia: r.dia,
        instagram: Number(r.instagram || 0),
        tiktok: Number(r.tiktok || 0),
        direto: Number(r.direto || 0)
      })),

      top_modelos: (topModelosRes.rows || []).map(r => ({
        modelo_id: r.modelo_id,
        nome: r.nome,
        instagram: Number(r.instagram || 0),
        tiktok: Number(r.tiktok || 0),
        direto: Number(r.direto || 0),
        total: Number(r.total || 0)
      }))
    });

  } catch (err) {
    console.error("Erro /admin/dashboard/acessos:", err);
    res.status(500).json({ error: "Erro ao carregar acessos" });
  }
});

// ========== 3. ADMINS ==========

router.get("/admins", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT id, email, created_at FROM admin ORDER BY id");
    res.json(rows);
  } catch (err) {
    console.error("Erro admins:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/admins", authAdmin, async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: "Email e senha obrigatórios" });
    }

    const adminLogadoId = req.admin.id;

    const emailNormalizado = email.trim().toLowerCase();
    const hash = await bcrypt.hash(senha, 10);

    const { rows } = await db.query(
      `
      INSERT INTO admin (email, senha)
      VALUES ($1, $2)
      RETURNING id, email, created_at
      `,
      [emailNormalizado, hash]
    );

    const novoAdmin = rows[0];

    await db.query(
  `
  INSERT INTO admin_seguranca_historico (
    user_id,
    tipo_user,
    admin_id,
    acao,
    motivo,
    data
  )
  VALUES ($1, $2, $3, $4, $5, NOW())
  `,
  [
    novoAdmin.id,
    "admin",
    adminLogadoId,
    "criacao",
    `Criou novo administrador: ${novoAdmin.email} (#${novoAdmin.id})`
  ]
);

    res.json(novoAdmin);
  } catch (err) {
    console.error("Erro criar admin:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.delete("/admins/:id", authAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminLogadoId = req.admin.id;

    if (Number(id) === Number(adminLogadoId)) {
      return res.status(400).json({ erro: "Você não pode excluir seu próprio admin logado" });
    }

    const adminExistente = await db.query(
      "SELECT id, email FROM admin WHERE id = $1",
      [id]
    );

    if (!adminExistente.rows.length) {
      return res.status(404).json({ erro: "Admin não encontrado" });
    }

    const adminRemovido = adminExistente.rows[0];

    await db.query(
      "DELETE FROM admin WHERE id = $1",
      [id]
    );

    await db.query(
  `
  INSERT INTO admin_seguranca_historico (
    user_id,
    tipo_user,
    admin_id,
    acao,
    motivo,
    data
  )
  VALUES ($1, $2, $3, $4, $5, NOW())
  `,
  [
    adminRemovido.id,
    "admin",
    adminLogadoId,
    "exclusao",
    `Excluiu administrador: ${adminRemovido.email} (#${adminRemovido.id})`
  ]
);

await db.query(
  "DELETE FROM admin WHERE id = $1",
  [id]
);
    res.json({ ok: true });
  } catch (err) {
    console.error("Erro excluir admin:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 4. SEGURANÇA ==========

router.get("/seguranca", authAdmin, async (req, res) => {
  try {
    const m = parseMes(req.query.mes);
    const { limit, offset, page } = paginate(
      req.query,
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );

    const params = [];
    let where = "1=1";

    if (m) {
      params.push(m.mes, m.ano);
      where += ` AND EXTRACT(MONTH FROM h.data) = $${params.length - 1}
                 AND EXTRACT(YEAR FROM h.data) = $${params.length}`;
    }

    const countQ = await db.query(
      `SELECT COUNT(*) FROM admin_seguranca_historico h WHERE ${where}`,
      params
    );

    const total = Number(countQ.rows[0].count);

    params.push(limit, offset);

    const { rows } = await db.query(`
      SELECT 
        h.id,
        h.user_id,
        h.tipo_user,
        h.acao,
        h.motivo,
        h.data,
        h.admin_id,
        a.email AS admin_email
      FROM admin_seguranca_historico h
      LEFT JOIN admin a ON a.id = h.admin_id
      WHERE ${where}
      ORDER BY h.data DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      rows,
      totalPages: Math.ceil(total / limit),
      page
    });

  } catch (err) {
    console.error("Erro segurança:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 5. CLIENTE RISCO ==========

router.get("/cliente-risco", authAdmin, async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);

  const countQ = await db.query(`
  SELECT COUNT(*) 
  FROM cliente_risco
  WHERE ativo = true
`);
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT *
      FROM cliente_risco
      WHERE ativo = true
      ORDER BY criado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) {
    console.error("Erro cliente-risco:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.get("/cliente-risco/lookup/:id", authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        cliente_id,
        cpf,
        aceite_ip AS ip,
        fingerprint
      FROM pagamentos_pix
      WHERE cliente_id = $1
      ORDER BY criado_em DESC
      LIMIT 1
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Nenhum pagamento encontrado para este cliente" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("Erro lookup cliente risco:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.get("/cliente-risco/:id", authAdmin, async (req, res) => {
  try {
    const clienteId = Number(req.params.id);

    const { rows } = await db.query(`
      SELECT
        cliente_id,
        bloqueio_ip,
        bloqueio_cpf,
        bloqueio_fingerprint,
        criado_em,
        cpf,
        ip,
        fingerprint,
        nivel,
        motivo,
        ativo,
        expira_em,
        admin
      FROM cliente_risco
      WHERE cliente_id = $1
      LIMIT 1
    `, [clienteId]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Cliente de risco não encontrado" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("Erro buscar cliente-risco:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.post("/cliente-risco", authAdmin, async (req, res) => {
  try {
    const {
      cliente_id,
      cpf,
      ip,
      fingerprint,
      nivel,
      motivo,
      expira_em,
      bloqueio_ip,
      bloqueio_cpf,
      bloqueio_fingerprint
    } = req.body;

    const admin = req.session?.user?.email || req.admin?.email || "Admin";
    const admin_id = req.session?.user?.id || req.admin?.id;

    // 🔹 INSERIR CLIENTE RISCO
    const { rows } = await db.query(`
      INSERT INTO cliente_risco (
        cliente_id,
        cpf,
        ip,
        fingerprint,
        nivel,
        motivo,
        expira_em,
        bloqueio_ip,
        bloqueio_cpf,
        bloqueio_fingerprint,
        admin,
        criado_em
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      RETURNING *
    `, [
      cliente_id,
      cpf || null,
      ip || null,
      fingerprint || null,
      nivel || null,
      motivo || null,
      expira_em || null,
      !!bloqueio_ip,
      !!bloqueio_cpf,
      !!bloqueio_fingerprint,
      admin
    ]);

    const clienteRisco = rows[0];

    // 🔹 REGISTRAR NO HISTÓRICO DE SEGURANÇA
    const descricaoAcao = `Cliente #${cliente_id} marcado como RISCO (${nivel || 'sem nível'}). ${motivo ? `Motivo: ${motivo}` : ''} Bloqueios: ${[
      bloqueio_ip && 'IP',
      bloqueio_cpf && 'CPF',
      bloqueio_fingerprint && 'Fingerprint'
    ].filter(Boolean).join(', ') || 'Nenhum'}`;

    await db.query(`
      INSERT INTO admin_seguranca_historico (
        admin_id,
        motivo,
        data,
        user_id,
        tipo_user,
        acao
      )
      VALUES ($1, $2, NOW(), $3, $4, $5)
    `, [
      admin_id,
      descricaoAcao,
      cliente_id,
      'cliente',
      'criar_cliente_risco'
    ]);

    res.json(clienteRisco);

  } catch (err) {
    console.error("Erro criar cliente risco:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.get("/dados-clientes-bloqueados", authAdmin, async (req, res) => {
  try {
    const { limit, offset, page } = paginate(
      req.query,
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );

    const countQ = await db.query(`
      SELECT COUNT(*)
      FROM cliente_risco
    `);

    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT
        cr.cliente_id,
        cr.cpf,
        cr.ip,
        cr.fingerprint,
        cr.motivo,
        cr.criado_em,
        cr.admin_id,
        cr.admin,
        a.email AS admin_email
      FROM cliente_risco cr
      LEFT JOIN admin a ON a.id = cr.admin_id
      ORDER BY cr.criado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      rows,
      totalPages: Math.ceil(total / limit),
      page
    });

  } catch (err) {
    console.error("Erro dados-clientes-bloqueados:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.put("/cliente-risco/:id", authAdmin, async (req, res) => {
  try {
    const clienteId = req.params.id;

    const atualQ = await db.query(
      `SELECT * FROM cliente_risco WHERE cliente_id = $1 LIMIT 1`,
      [clienteId]
    );

    if (!atualQ.rows.length) {
      return res.status(404).json({ erro: "Não encontrado" });
    }

    const atual = atualQ.rows[0];

    const nivel = req.body.nivel ?? atual.nivel;
    const motivo = req.body.motivo ?? atual.motivo;

    const bloqueio_ip =
      Object.prototype.hasOwnProperty.call(req.body, "bloqueio_ip")
        ? req.body.bloqueio_ip === true || req.body.bloqueio_ip === "on" || req.body.bloqueio_ip === "true"
        : atual.bloqueio_ip;

    const bloqueio_cpf =
      Object.prototype.hasOwnProperty.call(req.body, "bloqueio_cpf")
        ? req.body.bloqueio_cpf === true || req.body.bloqueio_cpf === "on" || req.body.bloqueio_cpf === "true"
        : atual.bloqueio_cpf;

    const bloqueio_fingerprint =
      Object.prototype.hasOwnProperty.call(req.body, "bloqueio_fingerprint")
        ? req.body.bloqueio_fingerprint === true || req.body.bloqueio_fingerprint === "on" || req.body.bloqueio_fingerprint === "true"
        : atual.bloqueio_fingerprint;

    const expira_em =
      Object.prototype.hasOwnProperty.call(req.body, "expira_em")
        ? req.body.expira_em || null
        : atual.expira_em;

    const admin =
      req.admin?.email ||
      req.session?.user?.email ||
      req.session?.user?.name ||
      atual.admin ||
      "Admin";

    const { rows } = await db.query(`
      UPDATE cliente_risco SET
        nivel = $1,
        bloqueio_ip = $2,
        bloqueio_cpf = $3,
        bloqueio_fingerprint = $4,
        motivo = $5,
        expira_em = $6,
        admin = $7
      WHERE cliente_id = $8
      RETURNING *
    `, [
      nivel,
      bloqueio_ip,
      bloqueio_cpf,
      bloqueio_fingerprint,
      motivo,
      expira_em,
      admin,
      clienteId
    ]);

    res.json(rows[0]);

  } catch (err) {
    console.error("Erro atualizar cliente-risco:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.delete("/cliente-risco/:id", authAdmin, async (req, res) => {
  try {
    const clienteId = req.params.id;

    const admin =
      req.admin?.email ||
      req.session?.user?.email ||
      req.session?.user?.name ||
      "Admin";

    const { rows } = await db.query(`
      UPDATE cliente_risco
      SET
        ativo = false,
        admin = $1
      WHERE cliente_id = $2
      RETURNING *
    `, [admin, clienteId]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Não encontrado" });
    }

    res.json({ ok: true, row: rows[0] });

  } catch (err) {
    console.error("Erro desativar cliente-risco:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.get("/logs-clientes-risco", authAdmin, async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, 1, 20);

    const countQ = await db.query(`
      SELECT COUNT(*)
      FROM cliente_risco
    `);

    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT
        cliente_id,
        cpf,
        ip,
        fingerprint,
        motivo,
        ativo,
        criado_em,
        admin
      FROM cliente_risco
      ORDER BY criado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      rows,
      page,
      total,
      totalPages: Math.ceil(total / limit)
    });

  } catch (err) {
    console.error("Erro logs-clientes-risco:", err);
    res.status(500).json({ error: "Erro ao buscar logs de clientes risco" });
  }
});

// ========== 6. CLIENTE BLOQUEADO ==========

router.get("/clientes-bloqueados/lookup/:id", authAdmin, async (req, res) => {
  try {
    const clienteId = req.params.id;

    const { rows } = await db.query(`
      SELECT
        c.id AS cliente_id,
        u.id AS user_id,
        u.email,
        u.ativo,
        u.desativado_em,
        u.bloqueado,

        cd.nome_completo,
        cd.data_nascimento,

        pp.aceite_ip AS ip,
        pp.fingerprint,
        pp.cpf
      FROM clientes c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
      LEFT JOIN LATERAL (
        SELECT aceite_ip, fingerprint, cpf
        FROM pagamentos_pix
        WHERE cliente_id = c.id
        ORDER BY criado_em DESC
        LIMIT 1
      ) pp ON true
      WHERE c.id = $1
      LIMIT 1
    `, [clienteId]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Cliente não encontrado" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro lookup cliente bloqueado:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.get("/clientes-bloqueados", authAdmin, async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, 1, 20);

    const countQ = await db.query(`
      SELECT COUNT(*)
      FROM clientes_bloqueados_cadastro
      WHERE COALESCE(bloqueado, true) = true
    `);

    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT
        id,
        cliente_id,
        user_id,
        email,
        nome_completo,
        data_nascimento,
        ativo,
        desativado_em,
        bloqueado,
        ip,
        fingerprint,
        cpf,
        nivel,
        motivo,
        bloqueio_ip,
        bloqueio_cpf,
        bloqueio_fingerprint,
        admin,
        criado_em
      FROM clientes_bloqueados_cadastro
      WHERE COALESCE(bloqueado, true) = true
      ORDER BY criado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      rows,
      totalPages: Math.ceil(total / limit),
      page
    });
  } catch (err) {
    console.error("Erro clientes-bloqueados:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.get("/clientes-bloqueados/:id", authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT *
      FROM clientes_bloqueados_cadastro
      WHERE cliente_id = $1
        AND COALESCE(bloqueado, true) = true
      LIMIT 1
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Não encontrado" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro buscar cliente bloqueado:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  }
});

router.get("/logs-clientes-bloqueados", authAdmin, async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, 1, 20);

    const countQ = await db.query(`
      SELECT COUNT(*)
      FROM clientes_bloqueados_cadastro
    `);

    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT
        user_id,
        cpf,
        ip,
        fingerprint,
        email,
        motivo,
        bloqueado,
        criado_em,
        admin AS admin_email
      FROM clientes_bloqueados_cadastro
      ORDER BY criado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      rows,
      page,
      total,
      totalPages: Math.ceil(total / limit)
    });

  } catch (err) {
    console.error("Erro logs-clientes-bloqueados:", err);
    res.status(500).json({ error: "Erro ao buscar logs de clientes bloqueados" });
  }
});

router.post("/clientes-bloqueados", authAdmin, async (req, res) => {
  const client = await db.connect();

  try {
    const {
      cliente_id,
      user_id,
      email,
      nome_completo,
      data_nascimento,
      ativo,
      bloqueado,
      ip,
      fingerprint,
      cpf,
      nivel,
      motivo,
      bloqueio_ip,
      bloqueio_cpf,
      bloqueio_fingerprint
    } = req.body;

    const admin =
      req.admin?.email ||
      req.session?.user?.email ||
      req.session?.user?.name ||
      "Admin";

    const admin_id = req.session?.user?.id || req.admin?.id;

    await client.query("BEGIN");

    const ativoFinal = ativo === true || ativo === "true";
    const bloqueadoFinal = bloqueado === true || bloqueado === "true";

    // 1️⃣ Inserir em clientes_bloqueados_cadastro
    const { rows } = await client.query(`
      INSERT INTO clientes_bloqueados_cadastro (
        cliente_id,
        cliente_id_original,
        user_id,
        email,
        nome_completo,
        data_nascimento,
        ativo,
        desativado_em,
        bloqueado,
        ip,
        fingerprint,
        cpf,
        nivel,
        motivo,
        bloqueio_ip,
        bloqueio_cpf,
        bloqueio_fingerprint,
        admin,
        criado_em
      )
      VALUES (
        $1,$1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW()
      )
      RETURNING *
    `, [
      cliente_id,
      user_id || null,
      email || null,
      nome_completo || null,
      data_nascimento || null,
      ativoFinal,
      bloqueadoFinal,
      ip || null,
      fingerprint || null,
      cpf || null,
      nivel || null,
      motivo || null,
      !!bloqueio_ip,
      !!bloqueio_cpf,
      !!bloqueio_fingerprint,
      admin
    ]);

    // 2️⃣ Atualizar users (dispara o trigger automaticamente)
    if (user_id) {
      await client.query(`
        UPDATE users
        SET
          ativo = $1,
          bloqueado = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [
        ativoFinal,
        bloqueadoFinal,
        user_id
      ]);
    }

    // 3️⃣ Atualizar clientes (caso o trigger não execute)
    await client.query(`
      UPDATE clientes
      SET
        bloqueado = $1,
        ativo = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [bloqueadoFinal, ativoFinal, cliente_id]);

    // 4️⃣ Atualizar clientes_dados
    await client.query(`
      UPDATE clientes_dados
      SET
        ativo = $1,
        atualizado_em = NOW()
      WHERE cliente_id = $2
    `, [ativoFinal, cliente_id]);

    // 5️⃣ Atualizar vip_subscriptions
    await client.query(`
      UPDATE vip_subscriptions
      SET
        ativo = $1,
        updated_at = NOW()
      WHERE cliente_id = $2
    `, [ativoFinal, cliente_id]);

    // 6️⃣ Registrar no histórico de segurança
    const descricaoAcao = `Cliente #${cliente_id} adicionado à lista de bloqueados. Nível: ${nivel || 'sem nível'}. ${motivo ? `Motivo: ${motivo}` : ''} Bloqueios: ${[
      bloqueio_ip && 'IP',
      bloqueio_cpf && 'CPF',
      bloqueio_fingerprint && 'Fingerprint'
    ].filter(Boolean).join(', ') || 'Nenhum'}`;

    await client.query(`
      INSERT INTO admin_seguranca_historico (
        admin_id,
        motivo,
        data,
        user_id,
        tipo_user,
        acao
      )
      VALUES ($1, $2, NOW(), $3, $4, $5)
    `, [
      admin_id,
      descricaoAcao,
      cliente_id,
      'cliente',
      'bloqueio_cadastro'
    ]);

    await client.query("COMMIT");

    res.json(rows[0]);

  } catch (err) {
    await client.query("ROLLBACK");

    if (err.code === "23505") {
      return res.status(409).json({
        erro: "Cliente já está cadastrado na lista de bloqueados"
      });
    }

    console.error("Erro salvar cliente bloqueado:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  } finally {
    client.release();
  }
});

router.put("/clientes-bloqueados/:id", authAdmin, async (req, res) => {
  const client = await db.connect();

  try {
    const {
      nivel,
      motivo,
      bloqueio_ip,
      bloqueio_cpf,
      bloqueio_fingerprint
    } = req.body;

    const admin =
      req.admin?.email ||
      req.session?.user?.email ||
      req.session?.user?.name ||
      "Admin";

    const admin_id = req.session?.user?.id || req.admin?.id;

    await client.query("BEGIN");

    // 1️⃣ Atualizar clientes_bloqueados_cadastro
    const { rows } = await client.query(`
      UPDATE clientes_bloqueados_cadastro
      SET
        nivel = $1,
        motivo = $2,
        bloqueio_ip = $3,
        bloqueio_cpf = $4,
        bloqueio_fingerprint = $5,
        admin = $6,
        ativo = false,
        bloqueado = true,
        desativado_em = COALESCE(desativado_em, NOW())
      WHERE cliente_id = $7
      RETURNING *
    `, [
      nivel || null,
      motivo || null,
      !!bloqueio_ip,
      !!bloqueio_cpf,
      !!bloqueio_fingerprint,
      admin,
      req.params.id
    ]);

    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ erro: "Não encontrado" });
    }

    const bloqueado = rows[0];

    // 2️⃣ Atualizar users (dispara o trigger automaticamente)
    if (bloqueado.user_id) {
      await client.query(`
        UPDATE users
        SET
          ativo = false,
          bloqueado = true,
          updated_at = NOW()
        WHERE id = $1
      `, [bloqueado.user_id]);
    }

    // 3️⃣ Atualizar clientes (caso o trigger não execute)
    await client.query(`
      UPDATE clientes
      SET
        bloqueado = true,
        ativo = false,
        updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    // 4️⃣ Atualizar clientes_dados
    await client.query(`
      UPDATE clientes_dados
      SET
        ativo = false,
        atualizado_em = NOW()
      WHERE cliente_id = $1
    `, [req.params.id]);

    // 5️⃣ Atualizar vip_subscriptions
    await client.query(`
      UPDATE vip_subscriptions
      SET
        ativo = false,
        updated_at = NOW()
      WHERE cliente_id = $1
    `, [req.params.id]);

    // 6️⃣ Registrar no histórico de segurança
    const descricaoAcao = `Cliente #${req.params.id} atualizado na lista de bloqueados. Nível: ${nivel || 'sem nível'}. ${motivo ? `Motivo: ${motivo}` : ''} Bloqueios: ${[
      bloqueio_ip && 'IP',
      bloqueio_cpf && 'CPF',
      bloqueio_fingerprint && 'Fingerprint'
    ].filter(Boolean).join(', ') || 'Nenhum'}`;

    await client.query(`
      INSERT INTO admin_seguranca_historico (
        admin_id,
        motivo,
        data,
        user_id,
        tipo_user,
        acao
      )
      VALUES ($1, $2, NOW(), $3, $4, $5)
    `, [
      admin_id,
      descricaoAcao,
      req.params.id,
      'cliente',
      'atualizar_bloqueio'
    ]);

    await client.query("COMMIT");

    res.json(bloqueado);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro atualizar cliente bloqueado:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  } finally {
    client.release();
  }
});

router.delete("/clientes-bloqueados/:id", authAdmin, async (req, res) => {
  const client = await db.connect();

  try {
    const admin =
      req.admin?.email ||
      req.session?.user?.email ||
      req.session?.user?.name ||
      "Admin";

    const admin_id = req.session?.user?.id || req.admin?.id;

    await client.query("BEGIN");

    // 1️⃣ Atualizar clientes_bloqueados_cadastro
    const { rows } = await client.query(`
      UPDATE clientes_bloqueados_cadastro
      SET
        ativo = true,
        bloqueado = false,
        admin = $1
      WHERE cliente_id = $2
      RETURNING *
    `, [admin, req.params.id]);

    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ erro: "Não encontrado" });
    }

    const bloqueado = rows[0];

    // 2️⃣ Atualizar users (dispara o trigger automaticamente)
    if (bloqueado.user_id) {
      await client.query(`
        UPDATE users
        SET
          ativo = true,
          bloqueado = false,
          updated_at = NOW()
        WHERE id = $1
      `, [bloqueado.user_id]);
    }

    // 3️⃣ Atualizar clientes (caso o trigger não execute)
    await client.query(`
      UPDATE clientes
      SET
        bloqueado = false,
        ativo = true,
        updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    // 4️⃣ Atualizar clientes_dados
    await client.query(`
      UPDATE clientes_dados
      SET
        ativo = true,
        atualizado_em = NOW()
      WHERE cliente_id = $1
    `, [req.params.id]);

    // 5️⃣ Atualizar vip_subscriptions
    await client.query(`
      UPDATE vip_subscriptions
      SET
        ativo = true,
        updated_at = NOW()
      WHERE cliente_id = $1
    `, [req.params.id]);

    // 6️⃣ Registrar no histórico de segurança
    const descricaoAcao = `Cliente #${req.params.id} removido da lista de bloqueados. Nível anterior: ${bloqueado.nivel || 'sem nível'}. Motivo anterior: ${bloqueado.motivo || 'sem motivo'}`;

    await client.query(`
      INSERT INTO admin_seguranca_historico (
        admin_id,
        motivo,
        data,
        user_id,
        tipo_user,
        acao
      )
      VALUES ($1, $2, NOW(), $3, $4, $5)
    `, [
      admin_id,
      descricaoAcao,
      req.params.id,
      'cliente',
      'remover_bloqueio'
    ]);

    await client.query("COMMIT");

    res.json({ ok: true, row: bloqueado });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro remover cliente bloqueado:", err);
    res.status(500).json({ erro: "Erro interno", details: err.message });
  } finally {
    client.release();
  }
});

// ========== 7. VERIFICAÇÕES ==========

router.get("/verificacoes/modelos", auth, authAdmin, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 20, 1);
    const offset = (page - 1) * limit;

    const countQ = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM modelos_verificacao mv
      JOIN modelos m ON m.id = mv.modelo_id
    `);

    const total = countQ.rows[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const { rows } = await db.query(`
      SELECT
        mv.modelo_id,
        mv.modelo_id AS id,
        m.nome_exibicao AS modelo_nome,
        mv.documento_tipo,
        mv.status,
        mv.criado_em,
        mv.verificado_em
      FROM modelos_verificacao mv
      JOIN modelos m ON m.id = mv.modelo_id
      ORDER BY
        CASE
          WHEN mv.status = 'pendente' THEN 0
          WHEN mv.status = 'em_analise' THEN 1
          WHEN mv.status = 'rejeitado' THEN 2
          WHEN mv.status = 'aprovado' THEN 3
          ELSE 4
        END,
        mv.criado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      rows,
      total,
      totalPages,
      page
    });

  } catch (err) {
    console.error("Erro listar verificações de modelos:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/verificacoes/modelo/:id", auth, authAdmin, async (req, res) => {
  try {
    const modelo_id = Number(req.params.id);

    const { rows } = await db.query(`
      SELECT
        mv.modelo_id,
        mv.documento_tipo,
        mv.doc_frente_url,
        mv.doc_verso_url,
        mv.selfie_url,
        mv.status,
        mv.motivo_rejeicao,
        mv.declaracao,
        mv.criado_em,
        mv.verificado_em,

        m.nome_exibicao,
        m.bio,
        m.local,
        m.avatar,
        m.capa,
        m.agencia_id,
        m.verificada,
        m.feed,
        m.agencia_desde,
        m.atualizado_em,

        md.nome_completo,
        md.data_nascimento,
        md.telefone,
        md.endereco,
        md.pais,
        md.estado,
        md.cidade,
        md.instagram,
        md.tiktok,
        md.vip_preco,

        a.nome AS agencia_nome

      FROM modelos_verificacao mv
      JOIN modelos m ON m.id = mv.modelo_id
      LEFT JOIN modelos_dados md ON md.modelo_id = m.id
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN agencias a ON a.id = m.agencia_id
      WHERE mv.modelo_id = $1
      LIMIT 1
    `, [modelo_id]);

    if (!rows.length) {
      return res.status(404).json({ error: "Verificação não encontrada" });
    }

    const v = rows[0];

    res.json({
      ...v,
      avatar_url: assinarArquivoPrivado(v.avatar),
      capa_url: assinarArquivoPrivado(v.capa),
      doc_frente_url: assinarArquivoPrivado(v.doc_frente_url),
      doc_verso_url: assinarArquivoPrivado(v.doc_verso_url),
      selfie_url: assinarArquivoPrivado(v.selfie_url)
    });

  } catch (err) {
    console.error("Erro detalhe verificação modelo:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.put("/verificacoes/modelo/:id", auth, authAdmin, async (req, res) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const modelo_id = Number(req.params.id);
    const { status, motivo_rejeicao, dados = {} } = req.body;

    if (!["aprovado", "rejeitado"].includes(status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Status inválido" });
    }

    if (status === "rejeitado" && (!motivo_rejeicao || !motivo_rejeicao.trim())) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Motivo da rejeição é obrigatório" });
    }

    const modeloRes = await client.query(`
      SELECT
        m.id,
        m.user_id,
        m.agencia_id AS agencia_id_atual,
        u.email
      FROM modelos m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = $1
      LIMIT 1
    `, [modelo_id]);

    if (!modeloRes.rowCount) {
      throw new Error("Modelo não encontrado");
    }

    const user_id = modeloRes.rows[0].user_id;
    const email = modeloRes.rows[0].email;
    const agencia_id_atual = modeloRes.rows[0].agencia_id_atual;

    const novaAgenciaId =
      dados.agencia_id !== undefined &&
      dados.agencia_id !== null &&
      String(dados.agencia_id).trim() !== ''
        ? Number(dados.agencia_id)
        : null;

    const agenciaMudou = String(agencia_id_atual || '') !== String(novaAgenciaId || '');
    const atualizarAgenciaDesde = agenciaMudou && novaAgenciaId !== null;

    await client.query(`
      UPDATE modelos
      SET
        nome_exibicao = $1,
        local = $2,
        bio = $3,
        agencia_id = $4,
        atualizado_em = NOW(),
        verificada = $5,
        feed = CASE WHEN $5 = true THEN true ELSE feed END,
        agencia_desde = CASE
          WHEN $6 = true THEN NOW()
          ELSE agencia_desde
        END
      WHERE id = $7
    `, [
      dados.nome_exibicao || null,
      dados.local || null,
      dados.bio || null,
      novaAgenciaId,
      status === "aprovado",
      atualizarAgenciaDesde,
      modelo_id
    ]);

    await client.query(`
      INSERT INTO modelos_dados (
        modelo_id,
        nome_completo,
        data_nascimento,
        telefone,
        endereco,
        pais,
        estado,
        cidade,
        instagram,
        tiktok,
        vip_preco
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (modelo_id)
      DO UPDATE SET
        nome_completo = EXCLUDED.nome_completo,
        data_nascimento = EXCLUDED.data_nascimento,
        telefone = EXCLUDED.telefone,
        endereco = EXCLUDED.endereco,
        pais = EXCLUDED.pais,
        estado = EXCLUDED.estado,
        cidade = EXCLUDED.cidade,
        instagram = EXCLUDED.instagram,
        tiktok = EXCLUDED.tiktok,
        vip_preco = EXCLUDED.vip_preco
    `, [
      modelo_id,
      dados.nome_completo || null,
      dados.data_nascimento || null,
      dados.telefone || null,
      dados.endereco || null,
      dados.pais || null,
      dados.estado || null,
      dados.cidade || null,
      dados.instagram || null,
      dados.tiktok || null,
      dados.vip_preco || null
    ]);

    await client.query(`
      UPDATE modelos_verificacao
      SET
        status = $1,
        motivo_rejeicao = $2,
        verificado_em = NOW()
      WHERE modelo_id = $3
    `, [
      status,
      status === "rejeitado" ? motivo_rejeicao.trim() : null,
      modelo_id
    ]);

    await client.query("COMMIT");

    if (status === "aprovado" && email) {
      try {
        await enviarEmailAprovacao(email);
      } catch (e) {
        console.error("Erro enviar email aprovação:", e);
      }
    }

    if (status === "rejeitado" && email) {
      try {
        await enviarEmailRejeicao(email, motivo_rejeicao.trim());
      } catch (e) {
        console.error("Erro enviar email rejeição:", e);
      }
    }

    res.json({ message: "Processo concluído" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro atualizar verificação modelo:", err);
    res.status(500).json({ error: "Erro ao validar modelo", detail: err.message });
  } finally {
    client.release();
  }
});

router.get("/verificacoes-aprovadas", auth, authAdmin, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = 10;
    const offset = (page - 1) * limit;

    const totalRes = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM modelos_verificacao
      WHERE status = 'aprovado'
    `);

    const total = totalRes.rows[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const result = await db.query(`
      SELECT
        mv.modelo_id AS id,
        'modelo' AS tipo,
        m.nome_exibicao,
        mv.documento_tipo,
        mv.doc_frente_url,
        mv.doc_verso_url,
        mv.selfie_url,
        mv.verificado_em
      FROM modelos_verificacao mv
      JOIN modelos m ON m.id = mv.modelo_id
      WHERE mv.status = 'aprovado'
      ORDER BY mv.verificado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const dados = result.rows.map(p => ({
      ...p,
      doc_frente_url: assinarArquivoPrivado(p.doc_frente_url),
      doc_verso_url: assinarArquivoPrivado(p.doc_verso_url),
      selfie_url: assinarArquivoPrivado(p.selfie_url)
    }));

    res.json({
      dados,
      totalPages,
      page
    });

  } catch (err) {
    console.error("Erro buscar aprovados:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/verificacoes-rejeitadas", auth, authAdmin, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = 10;
    const offset = (page - 1) * limit;

    const totalRes = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM modelos_verificacao
      WHERE status = 'rejeitado'
    `);

    const total = totalRes.rows[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const result = await db.query(`
      SELECT
        mv.modelo_id AS id,
        'modelo' AS tipo,
        m.nome_exibicao,
        mv.documento_tipo,
        mv.doc_frente_url,
        mv.doc_verso_url,
        mv.selfie_url,
        mv.motivo_rejeicao,
        mv.verificado_em AS rejeitado_em
      FROM modelos_verificacao mv
      JOIN modelos m ON m.id = mv.modelo_id
      WHERE mv.status = 'rejeitado'
      ORDER BY mv.verificado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const dados = result.rows.map(p => ({
      ...p,
      doc_frente_url: assinarArquivoPrivado(p.doc_frente_url),
      doc_verso_url: assinarArquivoPrivado(p.doc_verso_url),
      selfie_url: assinarArquivoPrivado(p.selfie_url)
    }));

    res.json({
      dados,
      totalPages,
      page
    });

  } catch (err) {
    console.error("Erro rejeitados:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.put("/perfis/:id/editar", auth, authAdmin, async (req, res) => {
  const { id } = req.params;
  const { dados } = req.body;

  try {
    await db.query(`
      UPDATE modelos
      SET nome_exibicao = $1,
          local = $2,
          bio = $3,
          agencia_id = $4
      WHERE id = $5
    `, [
      dados.nome_exibicao || null,
      dados.local || null,
      dados.bio || null,
      dados.agencia_id || null,
      id
    ]);

    await db.query(`
      INSERT INTO modelos_dados (
        modelo_id,
        nome_completo,
        data_nascimento,
        telefone,
        endereco,
        pais,
        estado,
        cidade,
        instagram,
        tiktok,
        vip_preco
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (modelo_id)
      DO UPDATE SET
        nome_completo = EXCLUDED.nome_completo,
        data_nascimento = EXCLUDED.data_nascimento,
        telefone = EXCLUDED.telefone,
        endereco = EXCLUDED.endereco,
        pais = EXCLUDED.pais,
        estado = EXCLUDED.estado,
        cidade = EXCLUDED.cidade,
        instagram = EXCLUDED.instagram,
        tiktok = EXCLUDED.tiktok,
        vip_preco = EXCLUDED.vip_preco
    `, [
      id,
      dados.nome_completo || null,
      dados.data_nascimento || null,
      dados.telefone || null,
      dados.endereco || null,
      dados.pais || null,
      dados.estado || null,
      dados.cidade || null,
      dados.instagram || null,
      dados.tiktok || null,
      dados.vip_preco || null
    ]);

    res.json({ message: "Atualizado com sucesso" });

  } catch (err) {
    console.error("Erro ao atualizar perfil modelo:", err);
    res.status(500).json({ error: "Erro ao atualizar dados" });
  }
});

router.get("/agencias-lista", auth, authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, nome
      FROM agencias
      ORDER BY nome ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro listar agências:", err);
    res.status(500).json({ error: "Erro ao buscar agências" });
  }
});

// ========== 8. FECHAMENTO ==========FALTA

router.get("/fechamento", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM fechamento_mensal ORDER BY ano DESC, mes DESC");
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.post("/fechamento", async (req, res) => {
  try {
    const now = new Date();
    const ano = now.getFullYear();
    const mes = now.getMonth() + 1;

    // Check if already exists
    const existing = await db.query(
      "SELECT id FROM fechamento_mensal WHERE ano = $1 AND mes = $2", [ano, mes]
    );
    if (existing.rows.length) return res.status(400).json({ erro: "Fechamento já existe para este mês" });

    const result = await db.query(`
      SELECT
        COALESCE(SUM(valor_bruto), 0) AS total_bruto,
        COALESCE(SUM(taxa_gateway), 0) AS total_taxas,
        COALESCE(SUM(agency_fee), 0) AS total_agency,
        COALESCE(SUM(velvet_fee), 0) AS total_velvet,
        COALESCE(SUM(valor_modelo), 0) AS total_modelos,
        COALESCE(SUM(CASE WHEN tipo = 'assinatura' THEN valor_bruto ELSE 0 END), 0) AS total_assinaturas,
        COALESCE(SUM(CASE WHEN tipo != 'assinatura' THEN valor_bruto ELSE 0 END), 0) AS total_midias
      FROM transacoes_agency
      WHERE status = 'normal'
      AND EXTRACT(MONTH FROM created_at) = $1
      AND EXTRACT(YEAR FROM created_at) = $2
    `, [mes, ano]);

    const r = result.rows[0];
    const { rows } = await db.query(`
      INSERT INTO fechamento_mensal (ano, mes, total_bruto, total_taxas, total_agency, total_velvet, total_modelos, total_assinaturas, total_midias)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [ano, mes, r.total_bruto, r.total_taxas, r.total_agency, r.total_velvet, r.total_modelos, r.total_assinaturas, r.total_midias]);

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro fechamento:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 9. DADOS BANCÁRIOS ==========

router.get("/dados-bancarios", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const status = req.query.status;

    let where = "1=1";
    const params = [limit, offset];
    if (status) {
      where = "b.status = $3";
      params.push(status);
    }

    const countQ = await db.query(`SELECT COUNT(*) FROM modelo_dados_bancarios b WHERE ${where}`, status ? [status] : []);
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT b.*, m.nome AS modelo_nome
      FROM modelo_dados_bancarios b
      LEFT JOIN modelos m ON m.id = b.modelo_id
      WHERE ${where}
      ORDER BY CASE WHEN b.status = 'pendente' THEN 0 ELSE 1 END, b.criado_em DESC
      LIMIT $1 OFFSET $2
    `, params);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/dados-bancarios/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM modelo_dados_bancarios WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.put("/dados-bancarios/:id", authAdmin, async (req, res) => {
  try {
    const beforeQ = await db.query(
      `SELECT * 
         FROM modelo_dados_bancarios 
        WHERE id = $1 
        LIMIT 1`,
      [req.params.id]
    );

    if (!beforeQ.rows.length) {
      return res.status(404).json({ erro: "Registro bancário não encontrado" });
    }

    const anterior = beforeQ.rows[0];
    const fields = req.body;
    const sets = [];
    const vals = [];
    let i = 1;

    for (const [key, val] of Object.entries(fields)) {
      if (["id", "modelo_id", "criado_em", "aprovado_em", "atualizado_em"].includes(key)) continue;
      sets.push(`${key} = $${i}`);
      vals.push(val);
      i++;
    }

    if (!sets.length) {
      return res.status(400).json({ erro: "Nenhum campo válido para atualizar" });
    }

    if (fields.status === "aprovado" && anterior.status !== "aprovado") {
      sets.push(`aprovado_em = NOW()`);
    }

    sets.push(`atualizado_em = NOW()`);
    vals.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE modelo_dados_bancarios
          SET ${sets.join(", ")}
        WHERE id = $${i}
      RETURNING *`,
      vals
    );

    const atualizado = rows[0];

    let acao = "atualizacao_dados_bancarios";
    let motivo = `Dados bancários atualizados pelo admin. Status anterior: ${anterior.status || "null"}; novo status: ${atualizado.status || "null"}.`;

    if (anterior.status !== atualizado.status && atualizado.status === "aprovado") {
      acao = "aprovacao_dados_bancarios";
      motivo = `Dados bancários aprovados pelo admin. Status anterior: ${anterior.status || "null"}; novo status: aprovado.`;
    } else if (anterior.status !== atualizado.status && atualizado.status === "rejeitado") {
      acao = "rejeicao_dados_bancarios";
      motivo = `Dados bancários rejeitados pelo admin. Status anterior: ${anterior.status || "null"}; novo status: rejeitado.`;
    }

    await db.query(
      `INSERT INTO admin_seguranca_historico
        (user_id, tipo_user, acao, motivo, data, admin_id)
       VALUES
        ($1, $2, $3, $4, NOW(), $5)`,
      [
        atualizado.modelo_id,
        "modelo",
        acao,
        motivo,
        req.admin?.id || req.user?.id || null
      ]
    );

    res.json(atualizado);
  } catch (err) {
    console.error("Erro atualizar bancário:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 10. MODELOS ==========

router.get("/modelos-lista", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, nome FROM modelos WHERE ativo = true AND verificada = true ORDER BY nome"
    );
    res.json(rows);
  } catch (err) { 
    res.status(500).json({ erro: "Erro interno" }); 
  }
});

router.get("/modelos", authAdmin, async (req, res) => {
  try {
    const { limit, offset, page } = paginate(
      req.query,
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );

    const busca = req.query.busca || "";
    const params = [];
    let where = "m.ativo = true AND m.verificada = true";

    if (busca) {
      params.push(`%${busca}%`);
      params.push(`%${busca}%`);
      params.push(busca);
      where += ` AND (m.nome ILIKE $1 OR u.email ILIKE $2 OR m.id::text = $3)`;
    }

    const countQ = await db.query(`
      SELECT COUNT(*) AS count
      FROM modelos m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE ${where}
    `, params);

    const total = Number(countQ.rows[0]?.count || 0);

    params.push(limit, offset);

    const { rows } = await db.query(`
      SELECT
        m.id,
        m.user_id,
        m.nome,
        m.nome_exibicao,
        m.verificada,
        m.local,
        m.bio,
        m.feed,
        m.agencia_id,
        m.ativo,
        m.created_at,
        m.atualizado_em,
        m.desativado_em,
        u.email,
        ag.nome AS agencia_nome
      FROM modelos m
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN agencias ag ON ag.id = m.agencia_id
      WHERE ${where}
      ORDER BY m.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      rows,
      totalPages: Math.ceil(total / limit),
      page
    });
  } catch (err) {
    console.error("Erro modelos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/agencias", authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, nome
      FROM agencias
      ORDER BY nome ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro listar agências:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/modelos/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM modelos WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.put("/modelos/:id", authAdmin, async (req, res) => {
  try {
    const modeloId = req.params.id;
    const adminId = req.admin?.id || req.user?.id || null;
    const fields = req.body;
    const sets = [];
    const vals = [];
    let i = 1;

    const allowed = [
      "nome",
      "nome_exibicao",
      "verificada",
      "feed",
      "bio",
      "local",
      "agencia_id",
      "ativo"
    ];

    const antesQ = await db.query(`
      SELECT id, nome, ativo, feed, bio, verificada, agencia_id
      FROM modelos
      WHERE id = $1
    `, [modeloId]);

    if (!antesQ.rows.length) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    const antes = antesQ.rows[0];

    for (const [key, val] of Object.entries(fields)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = $${i}`);
      vals.push(val === "" ? null : val);
      i++;
    }

    if (!sets.length) {
      return res.status(400).json({ erro: "Nenhum campo para atualizar" });
    }

    if (Object.prototype.hasOwnProperty.call(fields, "ativo")) {
      if (fields.ativo === false || fields.ativo === "false") {
        sets.push(`desativado_em = NOW()`);
      } else if (fields.ativo === true || fields.ativo === "true") {
        sets.push(`desativado_em = NULL`);
      }
    }

    sets.push(`atualizado_em = NOW()`);
    vals.push(modeloId);

    const { rows } = await db.query(`
      UPDATE modelos
      SET ${sets.join(", ")}
      WHERE id = $${i}
      RETURNING *
    `, vals);

    const depois = rows[0];

    // log de desativação / reativação
    if (String(antes.ativo) !== String(depois.ativo)) {
      await db.query(`
        INSERT INTO admin_seguranca_historico
          (user_id, tipo_user, acao, motivo, data, admin_id)
        VALUES
          ($1, 'modelo', $2, $3, NOW(), $4)
      `, [
        modeloId,
        (depois.ativo === false ? "desativacao_modelo" : "reativacao_modelo"),
        `Modelo ${depois.nome || "#" + modeloId} teve status alterado para ativo=${depois.ativo}`,
        adminId
      ]);
    }

    res.json(depois);
  } catch (err) {
    console.error("Erro atualizar modelo:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/modelos-dados/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM modelos_dados WHERE modelo_id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.put("/modelos-dados/:id", authAdmin, async (req, res) => {
  try {
    const modeloId = req.params.id;
    const adminId = req.admin?.id || req.user?.id || null;
    const fields = req.body;
    const sets = [];
    const vals = [];
    let i = 1;

    const allowed = [
      "nome_completo",
      "data_nascimento",
      "telefone",
      "endereco",
      "pais",
      "estado",
      "cidade",
      "instagram",
      "tiktok",
      "vip_preco"
    ];

    const antesQ = await db.query(`
      SELECT modelo_id, vip_preco
      FROM modelos_dados
      WHERE modelo_id = $1
    `, [modeloId]);

    if (!antesQ.rows.length) {
      return res.status(404).json({ erro: "Dados do modelo não encontrados" });
    }

    const antes = antesQ.rows[0];

    for (const [key, val] of Object.entries(fields)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = $${i}`);
      vals.push(val === "" ? null : val);
      i++;
    }

    if (!sets.length) {
      return res.status(400).json({ erro: "Nenhum campo para atualizar" });
    }

    sets.push(`atualizado_em = NOW()`);
    vals.push(modeloId);

    const { rows } = await db.query(`
      UPDATE modelos_dados
      SET ${sets.join(", ")}
      WHERE modelo_id = $${i}
      RETURNING *
    `, vals);

    const depois = rows[0];

    if (
      Object.prototype.hasOwnProperty.call(fields, "vip_preco") &&
      String(antes.vip_preco) !== String(depois.vip_preco)
    ) {
      await db.query(`
        INSERT INTO admin_seguranca_historico
          (user_id, tipo_user, acao, motivo, data, admin_id)
        VALUES
          ($1, 'modelo', 'alteracao_vip_preco', $2, NOW(), $3)
      `, [
        modeloId,
        `VIP alterado de ${antes.vip_preco ?? "null"} para ${depois.vip_preco ?? "null"}`,
        adminId
      ]);
    }

    res.json(depois);
  } catch (err) {
    console.error("Erro atualizar modelos_dados:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 11. RANKING ==========

router.get("/ranking", authAdmin, async (req, res) => {
  try {
    const mes = String(req.query.mes || '').trim(); // YYYY-MM
    const params = [];
    let whereMes = `
      t.created_at >= date_trunc('month', NOW())
      AND t.created_at < (date_trunc('month', NOW()) + INTERVAL '1 month')
    `;

    if (mes) {
      const match = mes.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        return res.status(400).json({ erro: "Parâmetro mes inválido. Use YYYY-MM" });
      }

      params.push(`${mes}-01`);
      whereMes = `
        t.created_at >= $1::date
        AND t.created_at < ($1::date + INTERVAL '1 month')
      `;
    }

    const { rows } = await db.query(`
      SELECT
        t.modelo_id,
        m.nome,
        ROUND(COALESCE(SUM(t.valor_modelo), 0)::numeric, 2) AS ganhos_total,
        MAX(t.created_at) AS atualizado_em
      FROM transacoes_agency t
      LEFT JOIN modelos m ON m.id = t.modelo_id
      WHERE t.modelo_id IS NOT NULL
        AND ${whereMes}
        AND COALESCE(t.status, 'pago') NOT IN ('falhou', 'cancelado', 'estornado', 'chargeback')
      GROUP BY t.modelo_id, m.nome
      ORDER BY ganhos_total DESC, atualizado_em DESC
      LIMIT 50
    `, params);

    res.json(rows);
  } catch (err) {
    console.error("Erro ranking:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 12. FINANCEIRO (RASTREIO) ==========

function makeGenericList(table, orderBy = "id DESC", dateColumn = null) {
  return async (req, res) => {
    try {
      const { limit, offset, page } = paginate(
        req.query,
        Number(req.query.page) || 1,
        Number(req.query.limit) || 20
      );

      const m = parseMes(req.query.mes);

      let where = "1=1";
      if (dateColumn && m && Number.isInteger(m.mes) && Number.isInteger(m.ano)) {
        where = `EXTRACT(MONTH FROM ${dateColumn}) = ${m.mes} AND EXTRACT(YEAR FROM ${dateColumn}) = ${m.ano}`;
      }

      const countQ = await db.query(`SELECT COUNT(*) FROM ${table} WHERE ${where}`);
      const total = Number(countQ.rows[0].count);

      const { rows } = await db.query(
        `SELECT * FROM ${table} WHERE ${where} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.json({
        rows,
        totalPages: Math.ceil(total / limit),
        page
      });
    } catch (err) {
      console.error(`Erro ${table}:`, err);
      res.status(500).json({ erro: "Erro interno" });
    }
  };
}

router.get("/pagamentos-cartao", makeGenericList("pagamentos_cartao", "created_at DESC", "created_at"));
router.get("/pagamentos-pix", makeGenericList("pagamentos_pix", "criado_em DESC", "criado_em"));
router.get("/pagamento-tentativas", makeGenericList("pagamento_tentativas", "criado_em DESC", "criado_em"));
router.get("/pagarme-events", makeGenericList("pagarme_events", "created_at DESC", "created_at"));
router.get("/stripe-events", makeGenericList("stripe_events", "created_at DESC", "created_at"));
router.get("/conteudo-pacotes", makeGenericList("conteudo_pacotes", "criado_em DESC", "criado_em"));
router.get("/premium-unlocks", makeGenericList("premium_unlocks", "created_at DESC", "created_at"));
router.get("/vip-subscriptions", makeGenericList("vip_subscriptions", "updated_at DESC", "updated_at"));

// ========== 13. TRANSAÇÕES AGENCY ==========

router.get("/transacoes-agency", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(
      req.query,
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );

    const modelo_id = req.query.modelo_id;
    const m = parseMes(req.query.mes);

    let where = "m.verificada = true AND m.ativo = true";
    const params = [];
    let paramIdx = 1;

    if (modelo_id) {
      where += ` AND t.modelo_id = $${paramIdx}`;
      params.push(modelo_id);
      paramIdx++;
    }

    if (m) {
      where += ` AND EXTRACT(MONTH FROM t.created_at) = $${paramIdx}
                 AND EXTRACT(YEAR FROM t.created_at) = $${paramIdx + 1}`;
      params.push(m.mes, m.ano);
      paramIdx += 2;
    }

    // Copiar params para countParams
    const countParams = [...params];

    const countQ = await db.query(`
      SELECT COUNT(*) AS count
      FROM transacoes_agency t
      INNER JOIN modelos m ON m.id = t.modelo_id
      WHERE ${where}
    `, countParams);

    const total = Number(countQ.rows[0]?.count || 0);

    const totaisQ = await db.query(`
      SELECT
        COALESCE(SUM(t.valor_bruto), 0) AS bruto,
        COALESCE(SUM(t.valor_modelo), 0) AS modelo,
        COALESCE(SUM(t.velvet_fee), 0) AS velvet,
        COALESCE(SUM(t.agency_fee), 0) AS agency,
        COALESCE(SUM(t.taxa_gateway), 0) AS gateway
      FROM transacoes_agency t
      INNER JOIN modelos m ON m.id = t.modelo_id
      WHERE ${where}
    `, countParams);

    // Adicionar limit e offset para a query de rows
    const rowsParams = [...params, limit, offset];

    const { rows } = await db.query(`
      SELECT
        t.*,
        m.nome AS modelo_nome
      FROM transacoes_agency t
      INNER JOIN modelos m ON m.id = t.modelo_id
      WHERE ${where}
      ORDER BY t.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, rowsParams);

    res.json({
      rows,
      totalPages: Math.ceil(total / limit),
      page,
      totais: totaisQ.rows[0]
    });
  } catch (err) {
    console.error("Erro transações:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 14. PASSWORD RESETS ==========

router.post("/password-reset", authAdmin, async (req, res) => {
  try {
    const { user_id, email, nova_senha } = req.body;

    if ((!user_id && !email) || !nova_senha) {
      return res.status(400).json({ erro: "Informe user_id ou email, e nova_senha" });
    }

    if (nova_senha.length < 6) {
      return res.status(400).json({ erro: "Senha deve ter no mínimo 6 caracteres" });
    }

    let uid = user_id;

    if (!uid && email) {
      const found = await db.query(
        "SELECT id FROM users WHERE LOWER(email) = $1",
        [email.trim().toLowerCase()]
      );

      if (!found.rows.length) {
        return res.status(404).json({ erro: "Nenhum usuário encontrado com esse e-mail" });
      }

      uid = found.rows[0].id;
    }

    const hash = await bcrypt.hash(nova_senha, 10);

    const upd = await db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [hash, uid]
    );

    if (!upd.rows.length) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    await db.query(
      "INSERT INTO admin_seguranca_historico (admin_id, motivo) VALUES ($1, $2)",
      [req.user.id, `Reset de senha do user #${uid}${email ? ` (${email})` : ''}`]
    );

    res.json({ ok: true, mensagem: "Senha resetada com sucesso" });
  } catch (err) {
    console.error("Erro reset senha:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/password-resets", authAdmin, async (req, res) => {
  try {
    const { limit, offset, page } = paginate(
      req.query,
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );

    const countQ = await db.query("SELECT COUNT(*) FROM password_resets");
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(
      "SELECT * FROM password_resets ORDER BY criado_em DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) {
    console.error("Erro password-resets:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});
// ========== 15. VIP SUBSCRIPTIONS ==========

router.get("/vips", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const busca = req.query.busca || "";

    let where = "1=1";
    const params = [];

    if (busca) {
      where = "v.cliente_id::text = $1";
      params.push(busca);
    }

    // COUNT
    const countParams = busca ? [busca] : [];
    const countWhere = busca ? "v.cliente_id::text = $1" : "1=1";
    const countQ = await db.query(`
      SELECT COUNT(*) FROM vip_subscriptions v WHERE ${countWhere}
    `, countParams);
    const total = Number(countQ.rows[0].count);

    // DATA
    params.push(limit, offset);
    const paramIndex = busca ? 2 : 1;
    const { rows } = await db.query(`
      SELECT v.*, m.nome AS modelo_nome
      FROM vip_subscriptions v
      LEFT JOIN modelos m ON m.id = v.modelo_id
      WHERE ${where}
      ORDER BY v.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, params);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/vips/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM vip_subscriptions WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.put("/vip-subscriptions/:id", async (req, res) => {
  try {
    const { ativo, recorrente, valor_assinatura, valor_total, expiration_at } = req.body;
    const { rows } = await db.query(`
      UPDATE vip_subscriptions
      SET ativo = $1, recorrente = $2, valor_assinatura = $3, valor_total = $4, expiration_at = $5, updated_at = NOW()
      WHERE id = $6 RETURNING *
    `, [ativo, recorrente, valor_assinatura, valor_total, expiration_at, req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// ========== 16. MODELO PAGAMENTOS ==========

router.get("/modelo-pagamentos", authAdmin, async (req, res) => {
  try {
    const { limit, offset, page } = paginate(
      req.query,
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );

    const modelo_id = req.query.modelo_id;

    let where = "1=1";
    const params = [limit, offset];
    let idx = 3;

    if (modelo_id) {
      where += ` AND p.modelo_id = $${idx}`;
      params.push(modelo_id);
      idx++;
    }

    let countWhere = "1=1";
    const countParams = [];
    let cidx = 1;

    if (modelo_id) {
      countWhere += ` AND p.modelo_id = $${cidx}`;
      countParams.push(modelo_id);
      cidx++;
    }

    const countQ = await db.query(
      `SELECT COUNT(*) FROM modelo_pagamentos p WHERE ${countWhere}`,
      countParams
    );

    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT p.*, m.nome AS modelo_nome, m.nome_exibicao
      FROM modelo_pagamentos p
      LEFT JOIN modelos m ON m.id = p.modelo_id
      WHERE ${where}
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    for (const row of rows) {
      if (row.recibo_url) {
        row.recibo_signed_url = s3Privado.getSignedUrl("getObject", {
          Bucket: process.env.B2_BUCKET_PRIVATE,
          Key: row.recibo_url,
          Expires: 300
        });
      } else {
        row.recibo_signed_url = null;
      }
    }

    res.json({
      rows,
      totalPages: Math.ceil(total / limit),
      page
    });
  } catch (err) {
    console.error("Erro modelo-pagamentos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/modelo-pagamentos/:id", authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM modelo_pagamentos WHERE id = $1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ erro: "Não encontrado" });
    }

    const row = rows[0];

    if (row.recibo_url) {
      row.recibo_signed_url = s3Privado.getSignedUrl("getObject", {
        Bucket: process.env.B2_BUCKET_PRIVATE,
        Key: row.recibo_url,
        Expires: 300
      });
    } else {
      row.recibo_signed_url = null;
    }

    res.json(row);
  } catch (err) {
    console.error("Erro detalhe modelo-pagamentos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/modelos-select", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, nome, nome_exibicao
      FROM modelos
      WHERE verificada = true
        AND ativo = true
      ORDER BY COALESCE(nome_exibicao, nome) ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar modelos do select:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/modelo-pagamentos", authAdmin, upload.single("recibo"), async (req, res) => {
  try {
    const {
      modelo_id,
      mes,
      total_midias,
      total_assinaturas,
      total_geral
    } = req.body;

    if (!modelo_id || !mes) {
      return res.status(400).json({ erro: "modelo_id e mês obrigatórios" });
    }

    const modeloIdNum = Number(modelo_id);
    const midias = Number(total_midias || 0);
    const assinaturas = Number(total_assinaturas || 0);
    let total = Number(total_geral || 0);

    if (!total) {
      total = midias + assinaturas;
    }

    const mesDate = `${mes}-01`;

    const ganhosRes = await db.query(`
      SELECT COALESCE(SUM(valor_modelo), 0) AS ganhos
      FROM transacoes_agency
      WHERE modelo_id = $1
        AND status = 'pago'
    `, [modeloIdNum]);

    const pagosRes = await db.query(`
      SELECT COALESCE(SUM(total_geral), 0) AS pagos
      FROM modelo_pagamentos
      WHERE modelo_id = $1
        AND status = 'pago'
    `, [modeloIdNum]);

    const ganhos = Number(ganhosRes.rows[0].ganhos || 0);
    const pagos = Number(pagosRes.rows[0].pagos || 0);
    const saldo = ganhos - pagos;

    if (total > saldo) {
      return res.status(400).json({
        erro: `Saldo insuficiente para este pagamento. Saldo disponível: ${saldo.toFixed(2)}`
      });
    }

    let recibo_url = null;

    if (req.file) {
      const key = `recibos/${modeloIdNum}/${Date.now()}-${req.file.originalname}`;

      await s3Privado.putObject({
        Bucket: process.env.B2_BUCKET_PRIVATE,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      }).promise();

      recibo_url = key;
    }

    const { rows } = await db.query(`
      INSERT INTO modelo_pagamentos
      (
        modelo_id,
        mes,
        total_midias,
        total_assinaturas,
        total_geral,
        status,
        recibo_url
      )
      VALUES ($1, $2, $3, $4, $5, 'pendente', $6)
      RETURNING *
    `, [
      modeloIdNum,
      mesDate,
      midias,
      assinaturas,
      total,
      recibo_url
    ]);

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro criar pgto modelo:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/modelo-pagamentos/saldo/:modelo_id", authAdmin, async (req, res) => {
  try {
    const modelo_id = Number(req.params.modelo_id);

    if (!modelo_id) {
      return res.status(400).json({ erro: "modelo_id inválido" });
    }

    const ganhosRes = await db.query(`
      SELECT COALESCE(SUM(valor_modelo), 0) AS ganhos
      FROM transacoes_agency
      WHERE modelo_id = $1
        AND status = 'pago'
    `, [modelo_id]);

    const pagosRes = await db.query(`
      SELECT COALESCE(SUM(total_geral), 0) AS pagos
      FROM modelo_pagamentos
      WHERE modelo_id = $1
        AND status = 'pago'
    `, [modelo_id]);

    const ganhos = Number(ganhosRes.rows[0].ganhos || 0);
    const pagos = Number(pagosRes.rows[0].pagos || 0);
    const saldo = ganhos - pagos;

    res.json({
      ganhos,
      pagos,
      saldo
    });
  } catch (err) {
    console.error("Erro saldo modelo-pagamentos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/modelo-pagamentos/:id/pagar", authAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(`
      UPDATE modelo_pagamentos
      SET
        status = 'pago',
        pago_em = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro pagar modelo-pagamento:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/modelo-pagamentos/:id", authAdmin, async (req, res) => {
  try {
    const { total_midias, total_assinaturas, total_geral, status, recibo_url } = req.body;

    const { rows } = await db.query(`
      UPDATE modelo_pagamentos
      SET
        total_midias = $1,
        total_assinaturas = $2,
        total_geral = $3,
        status = $4,
        recibo_url = $5,
        pago_em = CASE
          WHEN $4 = 'pago' AND pago_em IS NULL THEN NOW()
          WHEN $4 <> 'pago' THEN NULL
          ELSE pago_em
        END
      WHERE id = $6
      RETURNING *
    `, [
      Number(total_midias || 0),
      Number(total_assinaturas || 0),
      Number(total_geral || 0),
      status,
      recibo_url || null,
      req.params.id
    ]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Pagamento não encontrado" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro atualizar modelo-pagamento:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 16. AGÊNCIAS ==========

router.get("/agencias-list", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        id,
        nome,
        COALESCE(email, '') AS email,
        COALESCE(percentual_agencia, 0) * 100 AS percentual_agencia,
        COALESCE(percentual_modelo, 0) * 100 AS percentual_modelo,
        COALESCE(percentual_plataforma, 0) * 100 AS percentual_plataforma,
        created_at
      FROM agencias
      ORDER BY id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro /agencias-list:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/agencias/:agenciaId/modelos", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        id,
        nome,
        agencia_id,
        agencia_desde
      FROM modelos
      WHERE agencia_id = $1
      ORDER BY nome
    `, [req.params.agenciaId]);

    res.json(rows);
  } catch (err) {
    console.error("Erro /agencias/:agenciaId/modelos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/agencias/:id", authAdmin, async (req, res) => {
  try {
    const agenciaId = Number(req.params.id);
    const { percentual_agencia, percentual_modelo, percentual_plataforma } = req.body;

    const admin_id = req.user?.id;
    const user_id = req.user?.id;

    if (!agenciaId) {
      return res.status(400).json({ erro: "Agência inválida" });
    }

    const agenciaAtual = await db.query(
      `SELECT nome, percentual_agencia, percentual_modelo, percentual_plataforma FROM agencias WHERE id = $1`,
      [agenciaId]
    );

    if (!agenciaAtual.rows.length) {
      return res.status(404).json({ erro: "Agência não encontrada" });
    }

    const { nome, percentual_agencia: percAntigo, percentual_modelo: percModeloAntigo, percentual_plataforma: percPlatAntigo } = agenciaAtual.rows[0];

    const { rows } = await db.query(`
      UPDATE agencias
      SET
        percentual_agencia = $1,
        percentual_modelo = $2,
        percentual_plataforma = $3
      WHERE id = $4
      RETURNING id, nome, percentual_agencia, percentual_modelo, percentual_plataforma
    `, [
      percentual_agencia ? Number(percentual_agencia) / 100 : 0,
      percentual_modelo ? Number(percentual_modelo) / 100 : 0,
      percentual_plataforma ? Number(percentual_plataforma) / 100 : 0,
      agenciaId
    ]);

    const motivo = `Alteração de percentuais da agência ${nome}: Agência ${(percAntigo * 100).toFixed(0)}% → ${percentual_agencia}%, Modelo ${(percModeloAntigo * 100).toFixed(0)}% → ${percentual_modelo}%, Plataforma ${(percPlatAntigo * 100).toFixed(0)}% → ${percentual_plataforma}%`;

    await db.query(`
      INSERT INTO admin_seguranca_historico (admin_id, motivo, data, user_id, tipo_user, acao)
      VALUES ($1, $2, NOW(), $3, $4, $5)
    `, [admin_id, motivo, user_id, 'admin', 'alteracao_percentuais_agencia']);

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro ao alterar agência:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/modelos/:id/agencia", authAdmin, async (req, res) => {
  try {
    const modeloId = Number(req.params.id);
    const agencia_id = req.body.agencia_id ? Number(req.body.agencia_id) : null;

    const admin_id = req.user?.id;
    const user_id = req.user?.id;

    console.log("DEBUG - modeloId:", modeloId, "agencia_id:", agencia_id, "admin_id:", admin_id);

    if (!modeloId) {
      return res.status(400).json({ erro: "Modelo inválido" });
    }

    if (!admin_id || !user_id) {
      return res.status(401).json({ erro: "Usuário não autenticado" });
    }

    if (agencia_id !== null) {
      const agenciaExiste = await db.query(
        `SELECT id FROM agencias WHERE id = $1 LIMIT 1`,
        [agencia_id]
      );

      if (!agenciaExiste.rows.length) {
        return res.status(404).json({ erro: "Agência não encontrada" });
      }
    }

    const modeloAtual = await db.query(
      `SELECT agencia_id, nome FROM modelos WHERE id = $1`,
      [modeloId]
    );

    if (!modeloAtual.rows.length) {
      return res.status(404).json({ erro: "Modelo não encontrada" });
    }

    const agenciaAnterior = modeloAtual.rows[0]?.agencia_id;
    const nomeModelo = modeloAtual.rows[0]?.nome;

    const { rows } = await db.query(`
      UPDATE modelos
      SET
        agencia_id = $1::integer,
        agencia_desde = CASE
          WHEN $1::integer IS NULL THEN NULL
          WHEN agencia_id IS DISTINCT FROM $1::integer THEN NOW()
          ELSE agencia_desde
        END,
        atualizado_em = NOW()
      WHERE id = $2
      RETURNING id, nome, agencia_id, agencia_desde
    `, [agencia_id, modeloId]);

    if (!rows.length) {
      return res.status(500).json({ erro: "Falha ao atualizar modelo" });
    }

    const motivo = `Alteração de agência da modelo ${nomeModelo}: ${agenciaAnterior || 'Sem agência'} → ${agencia_id || 'Sem agência'}`;

    try {
      await db.query(`
        INSERT INTO admin_seguranca_historico (admin_id, motivo, data, user_id, tipo_user, acao)
        VALUES ($1, $2, NOW(), $3, $4, $5)
      `, [admin_id, motivo, user_id, 'admin', 'alteracao_agencia_modelo']);
    } catch (logErr) {
      console.error("Erro ao registrar no log:", logErr);
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro ao alterar agência da modelo:", err.message);
    res.status(500).json({ erro: "Erro interno: " + err.message });
  }
});

router.post("/agencias", authAdmin, async (req, res) => {
  try {
    let { nome, email, senha, percentual_agencia, percentual_modelo, percentual_plataforma } = req.body;

    const admin_id = req.user?.id;
    const user_id = req.user?.id;

    // Validações
    if (!nome || nome.trim() === '') {
      return res.status(400).json({ erro: "Nome da agência é obrigatório" });
    }

    if (!senha || senha.trim() === '') {
      return res.status(400).json({ erro: "Senha é obrigatória" });
    }

    if (!admin_id || !user_id) {
      return res.status(401).json({ erro: "Usuário não autenticado" });
    }

    // Converter percentuais para números
    percentual_agencia = percentual_agencia !== undefined && percentual_agencia !== null && percentual_agencia !== '' 
      ? Number(percentual_agencia) 
      : 0;
    percentual_modelo = percentual_modelo !== undefined && percentual_modelo !== null && percentual_modelo !== '' 
      ? Number(percentual_modelo) 
      : 0;
    percentual_plataforma = percentual_plataforma !== undefined && percentual_plataforma !== null && percentual_plataforma !== '' 
      ? Number(percentual_plataforma) 
      : 0;

    if (isNaN(percentual_agencia) || isNaN(percentual_modelo) || isNaN(percentual_plataforma)) {
      return res.status(400).json({ erro: "Percentuais devem ser números válidos" });
    }

    // Hash da senha com bcrypt
    const senhaHash = await bcrypt.hash(senha, 10);

    // Inserir nova agência
    const { rows } = await db.query(`
      INSERT INTO agencias (nome, email, senha, percentual_agencia, percentual_modelo, percentual_plataforma)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, nome, email, percentual_agencia, percentual_modelo, percentual_plataforma, created_at
    `, [
      nome.trim(),
      email && email.trim() ? email.trim() : null,
      senhaHash,
      percentual_agencia / 100,
      percentual_modelo / 100,
      percentual_plataforma / 100
    ]);

    if (!rows.length) {
      return res.status(500).json({ erro: "Falha ao criar agência" });
    }

    // Registrar no log
    const motivo = `Nova agência criada: ${nome}. Percentuais - Agência: ${percentual_agencia}%, Modelo: ${percentual_modelo}%, Plataforma: ${percentual_plataforma}%`;

    try {
      await db.query(`
        INSERT INTO admin_seguranca_historico (admin_id, motivo, data, user_id, tipo_user, acao)
        VALUES ($1, $2, NOW(), $3, $4, $5)
      `, [admin_id, motivo, user_id, 'admin', 'criacao_agencia']);
    } catch (logErr) {
      console.error("Erro ao registrar no log:", logErr);
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro ao criar agência:", err.message);
    res.status(500).json({ erro: "Erro interno: " + err.message });
  }
});

module.exports = router;
