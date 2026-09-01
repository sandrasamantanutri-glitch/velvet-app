// ========================================
// AGENCY DASHBOARD — API ROUTES
// ========================================

const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middleware/auth");
const authAgencia = require("../middleware/authAgencia");
const bcrypt = require("bcrypt");
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const upload = multer({ storage: multer.memoryStorage() });
const jwt = require("jsonwebtoken");
const { podeAlterarDadosBancarios } = require("../utils/dadosBancarios");

const s3Privado = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
  signatureVersion: "v4",
  s3ForcePathStyle: true
});

const s3Publico = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
  signatureVersion: "v4",
  s3ForcePathStyle: true
});

const uploadPublico = multer({
  storage: multerS3({
    s3: s3Publico,
    bucket: process.env.R2_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = file.originalname.split(".").pop();
      const nome = `uploads/${req.user.id}/${Date.now()}-${file.fieldname}.${ext}`;
      cb(null, nome);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

const uploadPrivado = multer({
  storage: multerS3({
    s3: s3Privado,
    bucket: process.env.R2_BUCKET_PRIVATE,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = file.originalname.split(".").pop();
      const nome = `privado/${req.user.id}/${Date.now()}-${file.fieldname}.${ext}`;
      cb(null, nome);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// All routes require agency auth
router.use(auth, authAgencia);

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
    Bucket: process.env.R2_BUCKET_PRIVATE,
    Key: key,
    Expires: 60 * 10
  });
}

// ========== 1. OVERVIEW ==========

router.get("/name-agency", authAgencia, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, nome FROM agencias WHERE id = $1",
      [req.agencia.id]
    );

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/overview", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;

    const [modelos, vips, fatd, fatm, fat12m, acessos, top] = await Promise.all([

      // MODELOS (pode manter direto)
      db.query(`
        SELECT COUNT(*) AS total
        FROM modelos
        WHERE ativo = true
          AND verificada = true
          AND agencia_id = $1
      `, [agenciaId]),

      // VIPS (via view)
      db.query(`
        SELECT COUNT(*) AS total
        FROM vw_vips_agencia
        WHERE ativo = true
          AND agencia_id = $1
      `, [agenciaId]),

      // FATURAMENTO DIA — PIX comprados hoje + Stripe com disponivel_em hoje (UTC date) já liberado
      // disponivel_em é UTC midnight — NÃO aplicar AT TIME ZONE, comparar como date UTC
      db.query(`
        SELECT
          COALESCE(SUM(agency_fee) FILTER (WHERE
            (gateway IS DISTINCT FROM 'stripe'
              AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo'))
            OR
            (gateway = 'stripe'
              AND disponivel_em IS NOT NULL
              AND disponivel_em <= NOW()
              AND disponivel_em::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          ), 0) AS total
        FROM vw_transacoes_agencia
        WHERE agencia_id = $1
          AND status = 'pago'
      `, [agenciaId]),

      // FATURAMENTO MÊS — PIX do mês + Stripe disponivel_em no mês (UTC) já liberado (qualquer mês de compra)
      db.query(`
        SELECT
          COALESCE(SUM(agency_fee) FILTER (WHERE
            (gateway IS DISTINCT FROM 'stripe'
              AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo') = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo'))
            OR
            (gateway = 'stripe'
              AND disponivel_em IS NOT NULL
              AND disponivel_em <= NOW()
              AND EXTRACT(YEAR  FROM disponivel_em) = EXTRACT(YEAR  FROM NOW() AT TIME ZONE 'America/Sao_Paulo')
              AND EXTRACT(MONTH FROM disponivel_em) = EXTRACT(MONTH FROM NOW() AT TIME ZONE 'America/Sao_Paulo'))
          ), 0) AS total
        FROM vw_transacoes_agencia
        WHERE agencia_id = $1
          AND status = 'pago'
      `, [agenciaId]),

      // FATURAMENTO 12 MESES — PIX por mês de compra, Stripe por mês UTC do disponivel_em
      db.query(`
        SELECT
          TO_CHAR(meses.mes, 'YYYY-MM') AS mes,
          COALESCE(SUM(t.agency_fee), 0) AS total
        FROM generate_series(
          DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '11 months',
          DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo'),
          INTERVAL '1 month'
        ) AS meses(mes)
        LEFT JOIN (
          SELECT agency_fee,
            DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo') AS mes_ref
          FROM vw_transacoes_agencia
          WHERE agencia_id = $1 AND status = 'pago' AND gateway IS DISTINCT FROM 'stripe'
          UNION ALL
          SELECT agency_fee,
            DATE_TRUNC('month', disponivel_em AT TIME ZONE 'America/Sao_Paulo') AS mes_ref
          FROM vw_transacoes_agencia
          WHERE agencia_id = $1 AND status = 'pago' AND gateway = 'stripe'
            AND disponivel_em IS NOT NULL AND disponivel_em <= NOW()
        ) t ON t.mes_ref = meses.mes
        GROUP BY meses.mes
        ORDER BY meses.mes ASC
      `, [agenciaId]),

      // ACESSOS (via view)
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
        FROM vw_acessos_agencia
        WHERE agencia_id = $1
          AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo') = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          AND origem_trafego IS NOT NULL
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
        ORDER BY total DESC
      `, [agenciaId]),

      // TOP 5 — mesma lógica de "Total Modelo Liberado": PIX do mês + Stripe disponivel_em no mês já liberado
      db.query(`
        SELECT
          u.modelo_id,
          COALESCE(m.nome_exibicao, m.nome) AS nome,
          ROUND(COALESCE(SUM(u.valor_modelo), 0)::numeric, 2) AS ganhos_modelo,
          ROUND(COALESCE(SUM(u.agency_fee), 0)::numeric, 2) AS ganhos_agencia,
          (SELECT COUNT(*) FROM vw_vips_agencia v WHERE v.modelo_id = u.modelo_id AND v.ativo = true AND v.agencia_id = $1) AS assinantes
        FROM (
          SELECT modelo_id, valor_modelo, agency_fee
          FROM vw_transacoes_agencia
          WHERE agencia_id = $1 AND status = 'pago' AND gateway IS DISTINCT FROM 'stripe'
            AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo') = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          UNION ALL
          SELECT modelo_id, valor_modelo, agency_fee
          FROM vw_transacoes_agencia
          WHERE agencia_id = $1 AND status = 'pago' AND gateway = 'stripe'
            AND disponivel_em IS NOT NULL AND disponivel_em <= NOW()
            AND EXTRACT(YEAR  FROM disponivel_em) = EXTRACT(YEAR  FROM NOW() AT TIME ZONE 'America/Sao_Paulo')
            AND EXTRACT(MONTH FROM disponivel_em) = EXTRACT(MONTH FROM NOW() AT TIME ZONE 'America/Sao_Paulo')
        ) u
        JOIN modelos m ON m.id = u.modelo_id
        GROUP BY u.modelo_id, m.nome_exibicao, m.nome
        ORDER BY ganhos_modelo DESC
        LIMIT 5
      `, [agenciaId])

    ]);

    res.json({
      total_modelos: Number(modelos.rows[0]?.total || 0),
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
        ganhos_modelo: Number(r.ganhos_modelo || 0),
        ganhos_agencia: Number(r.ganhos_agencia || 0),
        assinantes: Number(r.assinantes || 0)
      }))
    });

  } catch (err) {
    console.error("Erro overview:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 2. TRAFEGO ==========

router.get("/acessos-origem", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const mes = req.query.mes;

    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: "Parâmetro 'mes' inválido. Use YYYY-MM" });
    }

    const inicio = `${mes}-01`;
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + 1);

    const params = [inicio, fim, agenciaId];

    // 🔹 TOTAL
    const totalRes = await db.query(`
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

      FROM vw_acessos_agencia
      WHERE agencia_id = $3
        AND created_at >= $1
        AND created_at < $2
        AND origem_trafego IS NOT NULL
        AND origem_trafego != ''
    `, params);

    // 🔹 DIÁRIO
    const diarioRes = await db.query(`
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

      FROM vw_acessos_agencia
      WHERE agencia_id = $3
        AND created_at >= $1
        AND created_at < $2
        AND origem_trafego IS NOT NULL
        AND origem_trafego != ''
      GROUP BY created_at::date
      ORDER BY created_at::date ASC
    `, params);

    // 🔹 TOP MODELOS
    const topModelosRes = await db.query(`
      SELECT
        ref_modelo AS modelo_id,
        COALESCE(nome_exibicao, nome, 'Modelo #' || ref_modelo) AS nome,

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
        )::int AS direto,

        COUNT(*)::int AS total

      FROM vw_acessos_agencia
      WHERE agencia_id = $3
        AND created_at >= $1
        AND created_at < $2
        AND ref_modelo IS NOT NULL
        AND origem_trafego IS NOT NULL
        AND origem_trafego != ''
      GROUP BY ref_modelo, nome_exibicao, nome
      ORDER BY total DESC
      LIMIT 20
    `, params);

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
    console.error("Erro /agency/dashboard/acessos:", err);
    res.status(500).json({ error: "Erro ao carregar acessos" });
  }
});

// ========== 3. agency ==========

router.get("/agency", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia?.id;
    if (!agenciaId) return res.status(400).json({ erro: "Agência ID não fornecido" });

    const { rows } = await db.query(`
      SELECT id, email, nome, percentual_agencia, percentual_modelo, percentual_plataforma, created_at
      FROM agencias
      WHERE id = $1
      LIMIT 1
    `, [agenciaId]);

    if (!rows.length) return res.status(404).json({ erro: "Agência não encontrada" });

    res.json([rows[0]]);
  } catch (err) {
    console.error("Erro GET agency:", err);
    res.status(500).json({ erro: "Erro interno", message: err.message });
  }
});

router.put("/agency/reset-password", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { senha } = req.body;

    if (!senha || senha.length < 6) {
      return res.status(400).json({ erro: "Senha inválida (mínimo 6 caracteres)" });
    }

    const hash = await bcrypt.hash(senha, 10);

    await db.query(`
      UPDATE agencias SET senha = $1 WHERE id = $2
    `, [hash, agenciaId]);

    await db.query(`
      INSERT INTO admin_seguranca_historico (user_id, tipo_user, acao, motivo, data)
      VALUES ($1, 'agencia', 'reset_senha_agencia', $2, NOW())
    `, [agenciaId, `Agência #${agenciaId} redefiniu a própria senha`]);

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro reset senha:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/agency/percentuais", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { percentual_agencia, percentual_modelo } = req.body;

    // valores vindos do frontend (em %)
    const ag = Number(percentual_agencia);
    const mod = Number(percentual_modelo);

    // busca o percentual da plataforma definido para esta agência
    const { rows: agRows } = await db.query(
      `SELECT COALESCE(percentual_plataforma, 0.30) AS percentual_plataforma FROM agencias WHERE id = $1`,
      [agenciaId]
    );
    const pPlat = Number(agRows[0]?.percentual_plataforma || 0.30);
    const pPlatPct = +(pPlat * 100).toFixed(2);
    const maxDisponivel = +(100 - pPlatPct).toFixed(2);

    // validação básica
    if (isNaN(ag) || ag < 0 || ag > maxDisponivel) {
      return res.status(400).json({ erro: `Percentual da agência inválido (0–${maxDisponivel}%)` });
    }

    if (isNaN(mod) || mod < 0 || mod > maxDisponivel) {
      return res.status(400).json({ erro: `Percentual do modelo inválido (0–${maxDisponivel}%)` });
    }

    // validação em %
    if (+(ag + mod).toFixed(2) > maxDisponivel) {
      return res.status(400).json({
        erro: `A soma não pode ultrapassar 100%. Velvet: ${pPlatPct}% + Agência: ${ag}% + Modelo: ${mod}% = ${+(pPlatPct + ag + mod).toFixed(2)}%`
      });
    }

    // conversão para decimal (para salvar no banco)
    const pAg = ag / 100;
    const pMod = mod / 100;

    const antes = await db.query(
      `SELECT percentual_agencia, percentual_modelo FROM agencias WHERE id = $1`,
      [agenciaId]
    );

    await db.query(`
      UPDATE agencias
      SET percentual_agencia = $1, percentual_modelo = $2
      WHERE id = $3
    `, [pAg, pMod, agenciaId]);

    const ant = antes.rows[0];

    await db.query(`
      INSERT INTO admin_seguranca_historico (user_id, tipo_user, acao, motivo, data)
      VALUES ($1, 'agencia', 'alteracao_percentual', $2, NOW())
    `, [
      agenciaId,
      `Agência #${agenciaId} alterou percentuais. Antes: agência=${(ant.percentual_agencia * 100).toFixed(2)}% modelo=${(ant.percentual_modelo * 100).toFixed(2)}%. Depois: agência=${ag}% modelo=${mod}%`
    ]);

    res.json({
      ok: true,
      percentual_agencia: pAg,
      percentual_modelo: pMod
    });

  } catch (err) {
    console.error("Erro percentuais:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 8. FECHAMENTO ==========

const DESPESA_CHATTER_PADRAO = 1400;

// Hoje só a Silva Talents tem custo de chatter; as demais agências não têm essa despesa por padrão.
async function obterDespesaChatterPadrao(agenciaId) {
  const { rows } = await db.query("SELECT nome FROM agencias WHERE id = $1", [agenciaId]);
  const nome = (rows[0]?.nome || "").toLowerCase();
  return nome.includes("silva talents") ? DESPESA_CHATTER_PADRAO : 0;
}

// Calcula os totais (agência + por modelo) de um ano/mês para uma agência, sem gravar nada.
// Mês/ano sempre determinado por created_at (quando a transação ocorreu).
// Stripe só conta se disponivel_em <= NOW() (dinheiro liberado).
async function calcularFechamentoAgencia(agenciaId, ano, mes) {
  const firstDay = `${ano}-${String(mes).padStart(2,'0')}-01`;
  const lastDay  = `${ano}-${String(mes).padStart(2,'0')}-${new Date(ano, mes, 0).getDate()}`;

  // Lógica caixa: PIX por created_at SP + Stripe por disponivel_em SP no mês
  const totaisQ = await db.query(`
    SELECT
      COALESCE(SUM(t.valor_bruto), 0) AS total_bruto,
      COALESCE(SUM(t.agency_fee), 0) AS total_agencia,
      COALESCE(SUM(t.valor_modelo), 0) AS total_modelo,
      COALESCE(SUM(CASE WHEN t.tipo != 'assinatura' THEN t.valor_bruto ELSE 0 END), 0) AS total_bruto_midia,
      COALESCE(SUM(CASE WHEN t.tipo = 'assinatura' THEN t.valor_bruto ELSE 0 END), 0) AS total_bruto_assinatura
    FROM (
      SELECT valor_bruto, agency_fee, valor_modelo, tipo
      FROM vw_transacoes_agencia
      WHERE agencia_id = $1 AND status = 'pago'
        AND gateway IS DISTINCT FROM 'stripe'
        AND EXTRACT(YEAR  FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $2
        AND EXTRACT(MONTH FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $3
      UNION ALL
      SELECT valor_bruto, agency_fee, valor_modelo, tipo
      FROM vw_transacoes_agencia
      WHERE agencia_id = $1 AND status = 'pago'
        AND gateway = 'stripe'
        AND disponivel_em IS NOT NULL AND disponivel_em <= NOW()
        AND DATE(disponivel_em AT TIME ZONE 'America/Sao_Paulo') >= $4::date
        AND DATE(disponivel_em AT TIME ZONE 'America/Sao_Paulo') <= $5::date
    ) t
  `, [agenciaId, ano, mes, firstDay, lastDay]);

  const porModeloQ = await db.query(`
    SELECT
      t.modelo_id,
      COALESCE(SUM(CASE WHEN t.tipo != 'assinatura' THEN t.valor_modelo ELSE 0 END), 0) AS total_midias,
      COALESCE(SUM(CASE WHEN t.tipo = 'assinatura' THEN t.valor_modelo ELSE 0 END), 0) AS total_assinaturas,
      COALESCE(SUM(t.valor_modelo), 0) AS total_geral
    FROM (
      SELECT modelo_id, valor_modelo, tipo
      FROM vw_transacoes_agencia
      WHERE agencia_id = $1 AND status = 'pago'
        AND gateway IS DISTINCT FROM 'stripe'
        AND EXTRACT(YEAR  FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $2
        AND EXTRACT(MONTH FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $3
      UNION ALL
      SELECT modelo_id, valor_modelo, tipo
      FROM vw_transacoes_agencia
      WHERE agencia_id = $1 AND status = 'pago'
        AND gateway = 'stripe'
        AND disponivel_em IS NOT NULL AND disponivel_em <= NOW()
        AND DATE(disponivel_em AT TIME ZONE 'America/Sao_Paulo') >= $4::date
        AND DATE(disponivel_em AT TIME ZONE 'America/Sao_Paulo') <= $5::date
    ) t
    GROUP BY t.modelo_id
  `, [agenciaId, ano, mes, firstDay, lastDay]);

  return { totais: totaisQ.rows[0], porModelo: porModeloQ.rows };
}

// Gera (grava) o fechamento de um ano/mês para uma agência. Não duplica se já existir.
async function gerarFechamentoAgencia(agenciaId, ano, mes, despesaChatter = null) {
  if (despesaChatter == null) {
    despesaChatter = await obterDespesaChatterPadrao(agenciaId);
  }

  const existente = await db.query(
    "SELECT id FROM fechamento_mensal_agency WHERE agencia_id = $1 AND ano = $2 AND mes = $3",
    [agenciaId, ano, mes]
  );
  if (existente.rows.length) {
    throw Object.assign(new Error("Fechamento já existe para este mês"), { status: 400 });
  }

  const { totais, porModelo } = await calcularFechamentoAgencia(agenciaId, ano, mes);

  const { rows } = await db.query(`
    INSERT INTO fechamento_mensal_agency
      (agencia_id, ano, mes, total_bruto, total_agencia, total_modelo, total_bruto_midia, total_bruto_assinatura, despesa_chatter)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `, [
    agenciaId, ano, mes,
    totais.total_bruto, totais.total_agencia, totais.total_modelo,
    totais.total_bruto_midia, totais.total_bruto_assinatura,
    despesaChatter
  ]);

  const fechamento = rows[0];

  for (const m of porModelo) {
    await db.query(`
      INSERT INTO fechamento_mensal_agency_modelos (fechamento_id, modelo_id, total_midias, total_assinaturas, total_geral)
      VALUES ($1, $2, $3, $4, $5)
    `, [fechamento.id, m.modelo_id, m.total_midias, m.total_assinaturas, m.total_geral]);
  }

  return fechamento;
}

router.get("/fechamentos-agency", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;

    const [listaQ, totaisGeraisQ] = await Promise.all([
      db.query(
        `SELECT * FROM fechamento_mensal_agency
         WHERE agencia_id = $1
         ORDER BY ano DESC, mes DESC`,
        [agenciaId]
      ),
      db.query(
        `SELECT
           COALESCE(SUM(total_agencia), 0) AS faturamento_agencia,
           COALESCE(SUM(total_modelo), 0) AS faturamento_modelo
         FROM fechamento_mensal_agency
         WHERE agencia_id = $1`,
        [agenciaId]
      )
    ]);

    res.json({
      rows: listaQ.rows,
      totais_gerais: totaisGeraisQ.rows[0]
    });
  } catch (err) {
    console.error("Erro ao buscar fechamentos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/fechamentos-agency", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const now = new Date();
    const ano = Number(req.body.ano) || now.getFullYear();
    const mes = Number(req.body.mes) || (now.getMonth() + 1);
    const despesaChatter = req.body.despesa_chatter != null && req.body.despesa_chatter !== ''
      ? Number(req.body.despesa_chatter)
      : null;

    if (mes < 1 || mes > 12 || ano < 2020) {
      return res.status(400).json({ erro: "Mês ou ano inválido" });
    }

    const fechamento = await gerarFechamentoAgencia(agenciaId, ano, mes, despesaChatter);
    res.json(fechamento);
  } catch (err) {
    console.error("Erro ao gerar fechamento:", err);
    res.status(err.status || 500).json({ erro: err.message || "Erro interno" });
  }
});

router.post("/fechamentos-agency/:id/recalcular", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;

    const fechQ = await db.query(
      "SELECT * FROM fechamento_mensal_agency WHERE id = $1 AND agencia_id = $2",
      [req.params.id, agenciaId]
    );
    if (!fechQ.rows.length) return res.status(404).json({ erro: "Fechamento não encontrado" });

    const { ano, mes } = fechQ.rows[0];
    const { totais, porModelo } = await calcularFechamentoAgencia(agenciaId, ano, mes);

    await db.query(`
      UPDATE fechamento_mensal_agency SET
        total_bruto             = $1,
        total_agencia           = $2,
        total_modelo            = $3,
        total_bruto_midia       = $4,
        total_bruto_assinatura  = $5
      WHERE id = $6
    `, [totais.total_bruto, totais.total_agencia, totais.total_modelo,
        totais.total_bruto_midia, totais.total_bruto_assinatura, req.params.id]);

    await db.query("DELETE FROM fechamento_mensal_agency_modelos WHERE fechamento_id = $1", [req.params.id]);
    for (const m of porModelo) {
      await db.query(`
        INSERT INTO fechamento_mensal_agency_modelos (fechamento_id, modelo_id, total_midias, total_assinaturas, total_geral)
        VALUES ($1, $2, $3, $4, $5)
      `, [req.params.id, m.modelo_id, m.total_midias, m.total_assinaturas, m.total_geral]);
    }

    const updated = await db.query(
      "SELECT * FROM fechamento_mensal_agency WHERE id = $1", [req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error("Erro ao recalcular fechamento de agência:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/fechamentos-agency/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;

    const fechQ = await db.query(
      "SELECT * FROM fechamento_mensal_agency WHERE id = $1 AND agencia_id = $2",
      [req.params.id, agenciaId]
    );
    if (!fechQ.rows.length) return res.status(404).json({ erro: "Fechamento não encontrado" });

    const modelosQ = await db.query(`
      SELECT fm.modelo_id, m.nome_exibicao, m.nome, fm.total_midias, fm.total_assinaturas, fm.total_geral
      FROM fechamento_mensal_agency_modelos fm
      JOIN modelos m ON m.id = fm.modelo_id
      WHERE fm.fechamento_id = $1
      ORDER BY fm.total_geral DESC
    `, [req.params.id]);

    res.json({ ...fechQ.rows[0], modelos: modelosQ.rows });
  } catch (err) {
    console.error("Erro ao buscar detalhe do fechamento:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 9. DADOS BANCÁRIOS ==========

router.get("/dados-bancarios", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { limit, offset, page } = paginate(req.query);

    const status = req.query.status;

    let where = "m.agencia_id = $1";
    const params = [agenciaId];

    if (status) {
      where += " AND b.status = $2";
      params.push(status);
    }

    // COUNT
    const countQ = await db.query(`
      SELECT COUNT(*) 
      FROM modelo_dados_bancarios b
      JOIN modelos m ON m.id = b.modelo_id
      WHERE ${where}
    `, params);

    const total = Number(countQ.rows[0].count);

    // DATA
    const dataParams = [...params, limit, offset];

    const { rows } = await db.query(`
      SELECT b.*, m.nome AS modelo_nome
      FROM modelo_dados_bancarios b
      JOIN modelos m ON m.id = b.modelo_id
      WHERE ${where}
      ORDER BY 
        CASE WHEN b.status = 'pendente' THEN 0 ELSE 1 END,
        b.criado_em DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `, dataParams);

    res.json({
      rows,
      totalPages: Math.ceil(total / limit),
      page
    });

  } catch (err) {
    console.error("Erro ao buscar dados bancários:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/dados-bancarios/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    
    const { rows } = await db.query(`
      SELECT b.*, m.nome AS modelo_nome
      FROM modelo_dados_bancarios b
      JOIN modelos m ON m.id = b.modelo_id
      WHERE b.id = $1 AND m.agencia_id = $2
    `, [req.params.id, agenciaId]);
    
    if (!rows.length) {
      return res.status(404).json({ erro: "Não encontrado" });
    }
    
    res.json(rows[0]);
  } catch (err) { 
    console.error("Erro ao buscar dado bancário:", err);
    res.status(500).json({ erro: "Erro interno" }); 
  }
});

router.post("/dados-bancarios", authAgencia, async (req, res) => {
  if (!podeAlterarDadosBancarios()) {
    return res.status(403).json({ erro: "Alterações bloqueadas no período de pagamento (dias 1 a 5)" });
  }

  try {
    const agenciaId = req.agencia.id;
    const {
      modelo_id, tipo, pix_tipo, pix_chave,
      banco, agencia, conta, conta_tipo,
      titular_nome, titular_documento, confirmado_titular
    } = req.body;

    if (!modelo_id || !confirmado_titular) {
      return res.status(400).json({ erro: "modelo_id e confirmação de titularidade são obrigatórios" });
    }

    const modeloQ = await db.query(
      "SELECT id FROM modelos WHERE id = $1 AND agencia_id = $2",
      [modelo_id, agenciaId]
    );
    if (!modeloQ.rows.length) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const { rows } = await db.query(`
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
        confirmado_titular = true,
        status = 'alteracao_pendente',
        atualizado_em = NOW()
      RETURNING *
    `, [
      modelo_id, tipo, pix_tipo, pix_chave,
      banco, agencia, conta, conta_tipo,
      titular_nome, titular_documento
    ]);

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro ao criar dados bancários (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/dados-bancarios/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    
    // Verifica se o registro pertence à agência logada
    const beforeQ = await db.query(`
      SELECT b.* 
      FROM modelo_dados_bancarios b
      JOIN modelos m ON m.id = b.modelo_id
      WHERE b.id = $1 AND m.agencia_id = $2
      LIMIT 1
    `, [req.params.id, agenciaId]);

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

    const { rows } = await db.query(`
      UPDATE modelo_dados_bancarios
      SET ${sets.join(", ")}
      WHERE id = $${i}
      RETURNING *
    `, vals);

    const atualizado = rows[0];

    let acao = "atualizacao_dados_bancarios";
    let motivo = `Dados bancários atualizados pelo agency. Status anterior: ${anterior.status || "null"}; novo status: ${atualizado.status || "null"}.`;

    if (anterior.status !== atualizado.status && atualizado.status === "aprovado") {
      acao = "aprovacao_dados_bancarios";
      motivo = `Dados bancários aprovados pelo agency. Status anterior: ${anterior.status || "null"}; novo status: aprovado.`;
    } else if (anterior.status !== atualizado.status && atualizado.status === "rejeitado") {
      acao = "rejeicao_dados_bancarios";
      motivo = `Dados bancários rejeitados pelo agency. Status anterior: ${anterior.status || "null"}; novo status: rejeitado.`;
    }

    await db.query(`
      INSERT INTO agency_seguranca_historico
        (user_id, tipo_user, acao, motivo, data, agency_id)
      VALUES
        ($1, $2, $3, $4, NOW(), $5)
    `, [
      atualizado.modelo_id,
      "modelo",
      acao,
      motivo,
      agenciaId
    ]);

    res.json(atualizado);
  } catch (err) {
    console.error("Erro atualizar bancário:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 10. MODELOS ==========

router.get("/modelos-lista", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    
    const { rows } = await db.query(`
      SELECT id, nome 
      FROM modelos 
      WHERE ativo = true 
        AND verificada = true 
        AND agencia_id = $1
      ORDER BY nome
    `, [agenciaId]);
    
    res.json(rows);
  } catch (err) { 
    console.error("Erro ao listar modelos:", err);
    res.status(500).json({ erro: "Erro interno" }); 
  }
});

router.get("/modelos", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { limit, offset, page } = paginate(
      req.query,
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );

    const busca = req.query.busca || "";
    const params = [agenciaId];
    let where = "m.ativo = true AND m.verificada = true AND m.agencia_id = $1";

    if (busca) {
      params.push(`%${busca}%`);
      params.push(`%${busca}%`);
      params.push(busca);
      where += ` AND (m.nome ILIKE $2 OR u.email ILIKE $3 OR m.id::text = $4)`;
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

router.get("/agencias", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    
    // Retorna apenas a própria agência
    const { rows } = await db.query(`
      SELECT id, nome
      FROM agencias
      WHERE id = $1
    `, [agenciaId]);

    res.json(rows);
  } catch (err) {
    console.error("Erro listar agências:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/modelos/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    
    const { rows } = await db.query(`
      SELECT m.*, md.genero
      FROM modelos m
      LEFT JOIN modelos_dados md ON md.modelo_id = m.id AND md.ativo = true
      WHERE m.id = $1 AND m.agencia_id = $2
    `, [req.params.id, agenciaId]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Não encontrado" });
    }

    res.json(rows[0]);
  } catch (err) { 
    console.error("Erro ao buscar modelo:", err);
    res.status(500).json({ erro: "Erro interno" }); 
  }
});

router.put("/modelos/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = req.params.id;
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
      "ativo"
    ];

    const genero = fields.genero !== undefined ? (fields.genero || null) : undefined;

    // Verifica se o modelo pertence à agência logada
    const antesQ = await db.query(`
      SELECT id, nome, ativo, feed, bio, verificada, agencia_id
      FROM modelos
      WHERE id = $1 AND agencia_id = $2
    `, [modeloId, agenciaId]);

    if (!antesQ.rows.length) {
      return res.status(404).json({ erro: "Modelo não encontrado" });
    }

    const antes = antesQ.rows[0];

    // Não permite alterar agencia_id
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

    // Atualiza genero em modelos_dados se enviado
    if (genero !== undefined) {
      await db.query(`
        UPDATE modelos_dados SET genero = $1, atualizado_em = NOW()
        WHERE modelo_id = $2 AND ativo = true
      `, [genero, modeloId]);
    }

    // log de desativação / reativação
    if (String(antes.ativo) !== String(depois.ativo)) {
      await db.query(`
        INSERT INTO agency_seguranca_historico
          (user_id, tipo_user, acao, motivo, data, agency_id)
        VALUES
          ($1, 'modelo', $2, $3, NOW(), $4)
      `, [
        modeloId,
        (depois.ativo === false ? "desativacao_modelo" : "reativacao_modelo"),
        `Modelo ${depois.nome || "#" + modeloId} teve status alterado para ativo=${depois.ativo}`,
        agenciaId
      ]);
    }

    res.json(depois);
  } catch (err) {
    console.error("Erro atualizar modelo:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/modelos-dados/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    
    // Verifica se o modelo pertence à agência
    const { rows } = await db.query(`
      SELECT md.* 
      FROM modelos_dados md
      JOIN modelos m ON m.id = md.modelo_id
      WHERE md.modelo_id = $1 AND m.agencia_id = $2
    `, [req.params.id, agenciaId]);
    
    if (!rows.length) {
      return res.status(404).json({ erro: "Não encontrado" });
    }
    
    res.json(rows[0]);
  } catch (err) { 
    console.error("Erro ao buscar dados do modelo:", err);
    res.status(500).json({ erro: "Erro interno" }); 
  }
});

router.put("/modelos-dados/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = req.params.id;
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

    // Verifica se o modelo pertence à agência logada
    const antesQ = await db.query(`
      SELECT md.modelo_id, md.vip_preco
      FROM modelos_dados md
      JOIN modelos m ON m.id = md.modelo_id
      WHERE md.modelo_id = $1 AND m.agencia_id = $2
    `, [modeloId, agenciaId]);

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
        INSERT INTO agency_seguranca_historico
          (user_id, tipo_user, acao, motivo, data, agency_id)
        VALUES
          ($1, 'modelo', 'alteracao_vip_preco', $2, NOW(), $3)
      `, [
        modeloId,
        `VIP alterado de ${antes.vip_preco ?? "null"} para ${depois.vip_preco ?? "null"}`,
        agenciaId
      ]);
    }

    res.json(depois);
  } catch (err) {
    console.error("Erro atualizar modelos_dados:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 11. RANKING ==========

router.get("/ranking", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const mes = String(req.query.mes || '').trim(); // YYYY-MM
    const params = [agenciaId];
    let pixMesFilter, stripeMesFilter;

    if (mes) {
      const match = mes.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        return res.status(400).json({ erro: "Parâmetro mes inválido. Use YYYY-MM" });
      }
      params.push(Number(match[1]), Number(match[2]));
      pixMesFilter = `EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $2 AND EXTRACT(MONTH FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $3`;
      stripeMesFilter = `EXTRACT(YEAR FROM disponivel_em) = $2 AND EXTRACT(MONTH FROM disponivel_em) = $3`;
    } else {
      pixMesFilter = `DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo') = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')`;
      stripeMesFilter = `EXTRACT(YEAR FROM disponivel_em) = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') AND EXTRACT(MONTH FROM disponivel_em) = EXTRACT(MONTH FROM NOW() AT TIME ZONE 'America/Sao_Paulo')`;
    }

    // Mesma lógica de "Total Modelo Liberado": PIX do mês + Stripe disponivel_em no mês já liberado (qualquer mês de compra)
    // LEFT JOIN da tabela modelos para incluir todas as modelos da agência, mesmo com ganhos 0
    const { rows } = await db.query(`
      SELECT
        m.id AS modelo_id,
        COALESCE(m.nome_exibicao, m.nome) AS nome,
        ROUND(COALESCE(SUM(u.valor_modelo), 0)::numeric, 2) AS ganhos_total,
        ROUND(COALESCE(SUM(u.agency_fee), 0)::numeric, 2) AS ganhos_agencia,
        MAX(u.created_at) AS atualizado_em
      FROM modelos m
      LEFT JOIN (
        SELECT modelo_id, valor_modelo, agency_fee, created_at
        FROM vw_transacoes_agencia
        WHERE agencia_id = $1 AND status = 'pago' AND gateway IS DISTINCT FROM 'stripe'
          AND ${pixMesFilter}
        UNION ALL
        SELECT modelo_id, valor_modelo, agency_fee, created_at
        FROM vw_transacoes_agencia
        WHERE agencia_id = $1 AND status = 'pago' AND gateway = 'stripe'
          AND disponivel_em IS NOT NULL AND disponivel_em <= NOW()
          AND ${stripeMesFilter}
      ) u ON u.modelo_id = m.id
      WHERE m.agencia_id = $1
        AND m.ativo = true
        AND m.verificada = true
      GROUP BY m.id, m.nome_exibicao, m.nome
      ORDER BY ganhos_total DESC, m.nome ASC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error("Erro ranking:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 16. agencias PAGAMENTOS ==========

// SALDO
router.get("/agencia-pagamentos/saldo", authAgencia, async (req, res) => {
  try {
    const agenciaId = Number(req.agencia?.id);
    if (!agenciaId) {
      return res.status(400).json({ erro: "Agência inválida" });
    }

    const ganhosRes = await db.query(`
      SELECT COALESCE(SUM(agency_fee), 0) AS ganhos
      FROM vw_transacoes_agencia t
      JOIN modelos m ON m.id = t.modelo_id
      WHERE m.agencia_id = $1::int
        AND t.status = 'pago'
        AND (t.gateway IS DISTINCT FROM 'stripe' OR (t.disponivel_em IS NOT NULL AND t.disponivel_em <= NOW()))
    `, [agenciaId]);

    const pagosRes = await db.query(`
      SELECT COALESCE(SUM(total_agencia), 0) AS pagos
      FROM agencia_pagamentos
      WHERE agencia_id = $1::int
        AND status = 'pago'
    `, [agenciaId]);

    const ganhos = Number(ganhosRes.rows[0].ganhos || 0);
    const pagos = Number(pagosRes.rows[0].pagos || 0);

    res.json({
      ganhos,
      pagos,
      saldo: ganhos - pagos
    });

  } catch (err) {
    console.error("Erro saldo agencia-pagamentos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});


// LISTAGEM
router.get("/agencia-pagamentos", authAgencia, async (req, res) => {
  try {
    const agenciaId = Number(req.agencia?.id);
    if (!agenciaId) {
      return res.status(400).json({ erro: "Agência inválida" });
    }

    const { limit, offset, page } = paginate(req.query);

    const countQ = await db.query(`
      SELECT COUNT(*) 
      FROM agencia_pagamentos
      WHERE agencia_id = $1::int
    `, [agenciaId]);

    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT 
        p.*,
        a.nome AS agencia_nome
      FROM agencia_pagamentos p
      JOIN agencias a ON a.id = p.agencia_id
      WHERE p.agencia_id = $1::int
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [agenciaId, limit, offset]);

    for (const row of rows) {
      row.recibo_signed_url = row.recibo_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.R2_BUCKET_PRIVATE,
            Key: row.recibo_url,
            Expires: 300
          })
        : null;
    }

    res.json({
      rows,
      totalPages: Math.ceil(total / limit),
      page
    });

  } catch (err) {
    console.error("Erro agencia-pagamentos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});


// DETALHE
router.get("/agencia-pagamentos/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = Number(req.agencia?.id);
    const id = Number(req.params.id);

    const { rows } = await db.query(`
      SELECT p.*, a.nome AS agencia_nome
      FROM agencia_pagamentos p
      JOIN agencias a ON a.id = p.agencia_id
      WHERE p.id = $1::int AND p.agencia_id = $2::int
    `, [id, agenciaId]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Não encontrado" });
    }

    const row = rows[0];

    row.recibo_signed_url = row.recibo_url
      ? s3Privado.getSignedUrl("getObject", {
          Bucket: process.env.R2_BUCKET_PRIVATE,
          Key: row.recibo_url,
          Expires: 300
        })
      : null;

    res.json(row);

  } catch (err) {
    console.error("Erro detalhe agencia-pagamentos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 11. PAGAMENTOS RECEBIDOS (somente leitura, espelha o admin) ==========

router.get("/pagamentos-recebidos", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { rows } = await db.query(`
      SELECT id, valor, mes, ano, data, descricao, comprovante, created_at
      FROM pagamentos_agencias
      WHERE agencia_id = $1
      ORDER BY ano DESC, mes DESC, data DESC
    `, [agenciaId]);
    res.json(rows);
  } catch (err) {
    console.error("Erro pagamentos-recebidos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/pagamentos-modelos-recebidos", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { rows } = await db.query(`
      SELECT mp.id, mp.modelo_id, m.nome_exibicao, m.nome, mp.mes, mp.total_midias, mp.total_assinaturas,
             mp.total_geral, mp.status, mp.pago_em, mp.recibo_pdf_url
      FROM modelo_pagamentos mp
      JOIN modelos m ON m.id = mp.modelo_id
      WHERE m.agencia_id = $1
      ORDER BY mp.mes DESC, m.nome ASC
    `, [agenciaId]);

    const comSignedUrl = rows.map(r => ({
      ...r,
      recibo_pdf_signed_url: r.recibo_pdf_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.R2_BUCKET_PRIVATE,
            Key: r.recibo_pdf_url,
            Expires: 300
          })
        : null
    }));

    res.json(comSignedUrl);
  } catch (err) {
    console.error("Erro pagamentos-modelos-recebidos:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========================================
// GESTÃO DE MODELOS PELA AGÊNCIA
// (espelha as rotas de modelo em server.js, com validação de agencia_id)
// ========================================

const axios = require("axios");
const FormData = require("form-data");

async function modeloPertenceAgencia(agenciaId, modeloId) {
  const { rows } = await db.query(
    "SELECT id FROM modelos WHERE id = $1 AND agencia_id = $2",
    [modeloId, agenciaId]
  );
  return rows.length > 0;
}

// Upload de imagem/vídeo para Cloudflare Images/Stream (mesmo pipeline de /api/conteudos)
async function uploadMidiaCloudflare(buffer, originalname, mimetype) {
  let tipo;
  if (mimetype.startsWith("image/")) tipo = "imagem";
  else if (mimetype.startsWith("video/")) tipo = "video";
  else throw new Error("Tipo de arquivo não suportado");

  let url = null;
  let thumbnailUrl = null;

  if (tipo === "imagem") {
    const form = new FormData();
    form.append("file", buffer, originalname);
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/images/v1`,
      form,
      { headers: { Authorization: `Bearer ${process.env.CF_IMAGES_TOKEN}`, ...form.getHeaders() } }
    );
    const imageId = response.data.result.id;
    url = `https://imagedelivery.net/${process.env.CF_ACCOUNT_HASH}/${imageId}/public`;
    thumbnailUrl = url;
  } else {
    const form = new FormData();
    form.append("file", buffer, originalname);
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/stream`,
      form,
      {
        headers: { Authorization: `Bearer ${process.env.CF_STREAM_TOKEN}`, ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
    const videoId = response.data.result.uid;
    url = `https://iframe.videodelivery.net/${videoId}`;
    thumbnailUrl = `https://videodelivery.net/${videoId}/thumbnails/thumbnail.jpg`;
  }

  return { tipo, url, thumbnailUrl };
}

// ========== 12. OFERTAS ==========

router.get("/ofertas", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.query.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    await db.query("SELECT encerrar_ofertas_expiradas()").catch(() => {});

    const { rows } = await db.query(
      "SELECT * FROM ofertas WHERE modelo_id = $1 ORDER BY created_at DESC LIMIT 20",
      [modeloId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro listar ofertas (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/ofertas", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.body.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const planoRes = await db.query("SELECT valor_mensal FROM modelos_planos WHERE modelo_id = $1", [modeloId]);
    if (!planoRes.rows.length) {
      return res.status(400).json({ erro: "Defina primeiro o plano de assinatura desta modelo." });
    }

    const VALOR_BASE = Number(planoRes.rows[0].valor_mensal);
    const VALOR_MINIMO = Math.max(18.00, Number((VALOR_BASE * 0.5).toFixed(2)));

    const { nome, limite, dias, desconto } = req.body;
    const limiteNum = Number(limite);
    const diasNum = Number(dias);
    const descontoNum = Number(desconto);

    if (
      !nome ||
      !Number.isFinite(limiteNum) || limiteNum <= 0 ||
      !Number.isFinite(diasNum) || diasNum <= 0 || diasNum > 30 ||
      !Number.isFinite(descontoNum) || descontoNum < 0 || descontoNum > 99
    ) {
      return res.status(400).json({ erro: "Dados inválidos. Prazo máximo: 30 dias." });
    }

    const valorPromocional = Number((VALOR_BASE * (1 - descontoNum / 100)).toFixed(2));
    if (valorPromocional < VALOR_MINIMO) {
      return res.status(400).json({ erro: `O valor com desconto não pode ser menor que R$ ${VALOR_MINIMO.toFixed(2).replace(".", ",")}.` });
    }

    const dataFim = new Date();
    dataFim.setDate(dataFim.getDate() + diasNum);

    await db.query("UPDATE ofertas SET ativa = false WHERE modelo_id = $1", [modeloId]);

    const { rows } = await db.query(`
      INSERT INTO ofertas (modelo_id, nome, limite_assinaturas, assinaturas_usadas, desconto_percentual, valor_base, valor_promocional, data_inicio, data_fim, ativa)
      VALUES ($1,$2,$3,0,$4,$5,$6,NOW(),$7,true)
      RETURNING *
    `, [modeloId, nome, limiteNum, descontoNum, VALOR_BASE, valorPromocional, dataFim]);

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro criar oferta (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/ofertas/:id/encerrar", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { rows } = await db.query(`
      UPDATE ofertas SET ativa = false, data_fim = NOW()
      WHERE id = $1 AND ativa = true
        AND modelo_id IN (SELECT id FROM modelos WHERE agencia_id = $2)
      RETURNING *
    `, [req.params.id, agenciaId]);

    if (!rows.length) return res.status(404).json({ erro: "Oferta não encontrada ou já encerrada" });
    res.json({ success: true });
  } catch (err) {
    console.error("Erro encerrar oferta (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.delete("/ofertas/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { rows } = await db.query(`
      DELETE FROM ofertas
      WHERE id = $1 AND modelo_id IN (SELECT id FROM modelos WHERE agencia_id = $2)
      RETURNING id
    `, [req.params.id, agenciaId]);

    if (!rows.length) return res.status(404).json({ erro: "Oferta não encontrada" });
    res.json({ success: true });
  } catch (err) {
    console.error("Erro excluir oferta (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 13. ASSINATURAS (valor do plano VIP) ==========

router.get("/assinaturas", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.query.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const { rows } = await db.query(
      "SELECT COALESCE(valor_mensal, 20.00) AS valor_mensal, desconto_trimestral, valor_trimestral FROM modelos_planos WHERE modelo_id = $1",
      [modeloId]
    );
    res.json(rows[0] || { valor_mensal: 20, desconto_trimestral: 0, valor_trimestral: null });
  } catch (err) {
    console.error("Erro buscar assinatura (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/assinaturas", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.body.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const mensal = Number(req.body.valor_mensal);
    const desconto = Number(req.body.desconto_trimestral) || 0;

    if (!mensal || mensal < 20) return res.status(400).json({ erro: "Valor mínimo R$ 20" });
    if (desconto < 0 || desconto > 30) return res.status(400).json({ erro: "Desconto inválido" });

    const valorTrimestral = (mensal * 3) * (1 - desconto / 100);

    const existe = await db.query("SELECT modelo_id FROM modelos_planos WHERE modelo_id = $1", [modeloId]);
    if (existe.rows.length) {
      await db.query(`
        UPDATE modelos_planos SET valor_mensal = $1, desconto_trimestral = $2, valor_trimestral = $3, updated_at = NOW()
        WHERE modelo_id = $4
      `, [mensal, desconto, valorTrimestral, modeloId]);
    } else {
      await db.query(`
        INSERT INTO modelos_planos (modelo_id, valor_mensal, desconto_trimestral, valor_trimestral)
        VALUES ($1, $2, $3, $4)
      `, [modeloId, mensal, desconto, valorTrimestral]);
    }

    res.json({ sucesso: true });
  } catch (err) {
    console.error("Erro salvar assinatura (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 14. FEED ==========

router.get("/feed", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.query.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const { rows } = await db.query(`
      SELECT * FROM conteudos
      WHERE modelo_id = $1 AND tipo_conteudo = 'feed' AND ativo = true
      ORDER BY criado_em DESC
    `, [modeloId]);
    res.json(rows);
  } catch (err) {
    console.error("Erro listar feed (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/feed", authAgencia, upload.array("file", 10), async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.body.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }
    if (!req.files || !req.files.length) return res.status(400).json({ erro: "Arquivo obrigatório" });

    const resultados = [];
    for (const file of req.files) {
      const { tipo, url, thumbnailUrl } = await uploadMidiaCloudflare(file.buffer, file.originalname, file.mimetype);
      const { rows } = await db.query(`
        INSERT INTO conteudos (modelo_id, url, thumbnail_url, tipo, tipo_conteudo, preco, descricao, criado_em)
        VALUES ($1,$2,$3,$4,'feed',0,$5,NOW())
        RETURNING *
      `, [modeloId, url, thumbnailUrl, tipo, req.body.descricao || null]);
      resultados.push(rows[0]);
    }

    res.json(resultados);
  } catch (err) {
    console.error("Erro criar post de feed (agência):", err);
    res.status(500).json({ erro: "Erro ao carregar conteúdo" });
  }
});

router.delete("/feed/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { rows } = await db.query(`
      UPDATE conteudos SET ativo = false, deletado_em = NOW()
      WHERE id = $1 AND tipo_conteudo = 'feed'
        AND modelo_id IN (SELECT id FROM modelos WHERE agencia_id = $2)
      RETURNING id
    `, [req.params.id, agenciaId]);

    if (!rows.length) return res.status(404).json({ erro: "Post de feed não encontrado" });
    res.json({ success: true });
  } catch (err) {
    console.error("Erro excluir post de feed (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 15. PREMIUM ==========

router.get("/premium", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.query.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const { rows } = await db.query(`
      SELECT * FROM premium_posts
      WHERE modelo_id = $1 AND ativo = true
      ORDER BY created_at DESC
    `, [modeloId]);
    res.json(rows);
  } catch (err) {
    console.error("Erro listar premium (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/premium", authAgencia, upload.array("files", 10), async (req, res) => {
  const client = await db.connect();
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.body.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      client.release();
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const files = req.files || [];
    if (!files.length) { client.release(); return res.status(400).json({ erro: "Envie ao menos uma mídia" }); }

    const precoNum = Number(req.body.preco);
    if (!precoNum || precoNum <= 0) { client.release(); return res.status(400).json({ erro: "Preço inválido" }); }

    await client.query("BEGIN");

    const postRes = await client.query(`
      INSERT INTO premium_posts (modelo_id, url, thumb_url, tipo, tipo_conteudo, preco, descricao, ativo, created_at, updated_at)
      VALUES ($1, NULL, NULL, NULL, 'premium', $2, $3, true, NOW(), NOW())
      RETURNING id
    `, [modeloId, precoNum, req.body.descricao || null]);

    const premiumPostId = postRes.rows[0].id;
    const midiasCriadas = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { tipo, url, thumbnailUrl } = await uploadMidiaCloudflare(file.buffer, file.originalname, file.mimetype);
      const tipoMidia = tipo === "imagem" ? "foto" : "video";

      const midiaRes = await client.query(`
        INSERT INTO premium_post_midias (premium_post_id, url, thumb_url, tipo, ordem, ativo, created_at)
        VALUES ($1,$2,$3,$4,$5,true,NOW())
        RETURNING *
      `, [premiumPostId, url, thumbnailUrl, tipoMidia, i]);

      midiasCriadas.push(midiaRes.rows[0]);
    }

    const primeira = midiasCriadas[0];
    await client.query(
      "UPDATE premium_posts SET url=$1, thumb_url=$2, tipo=$3, updated_at=NOW() WHERE id=$4",
      [primeira.url, primeira.thumb_url, primeira.tipo, premiumPostId]
    );

    await client.query("COMMIT");
    res.json({ id: premiumPostId, midias: midiasCriadas });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Erro criar premium (agência):", err);
    res.status(500).json({ erro: "Erro ao carregar conteúdo" });
  } finally {
    client.release();
  }
});

router.delete("/premium/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { rows } = await db.query(`
      UPDATE premium_posts SET ativo = false, updated_at = NOW()
      WHERE id = $1 AND modelo_id IN (SELECT id FROM modelos WHERE agencia_id = $2)
      RETURNING id
    `, [req.params.id, agenciaId]);

    if (!rows.length) return res.status(404).json({ erro: "Post premium não encontrado" });

    await db.query("UPDATE premium_post_midias SET ativo = false WHERE premium_post_id = $1", [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error("Erro excluir premium (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 16. CONTEÚDOS (DE VENDA) ==========

router.get("/conteudos", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.query.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const { rows } = await db.query(`
      SELECT * FROM conteudos
      WHERE modelo_id = $1 AND tipo_conteudo = 'venda' AND ativo = true
      ORDER BY criado_em DESC
    `, [modeloId]);
    res.json(rows);
  } catch (err) {
    console.error("Erro listar conteúdos (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/conteudos", authAgencia, upload.array("file", 10), async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.body.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }
    if (!req.files || !req.files.length) return res.status(400).json({ erro: "Arquivo obrigatório" });

    const resultados = [];
    for (const file of req.files) {
      const { tipo, url, thumbnailUrl } = await uploadMidiaCloudflare(file.buffer, file.originalname, file.mimetype);
      const { rows } = await db.query(`
        INSERT INTO conteudos (modelo_id, url, thumbnail_url, tipo, tipo_conteudo, preco, descricao, criado_em)
        VALUES ($1,$2,$3,$4,'venda',$5,$6,NOW())
        RETURNING *
      `, [modeloId, url, thumbnailUrl, tipo, req.body.preco || 0, req.body.descricao || null]);
      resultados.push(rows[0]);
    }

    res.json(resultados);
  } catch (err) {
    console.error("Erro criar conteúdo de venda (agência):", err);
    res.status(500).json({ erro: "Erro ao carregar conteúdo" });
  }
});

router.delete("/conteudos/:id", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { rows } = await db.query(`
      UPDATE conteudos SET ativo = false, deletado_em = NOW()
      WHERE id = $1 AND tipo_conteudo = 'venda'
        AND modelo_id IN (SELECT id FROM modelos WHERE agencia_id = $2)
      RETURNING id
    `, [req.params.id, agenciaId]);

    if (!rows.length) return res.status(404).json({ erro: "Conteúdo não encontrado" });
    res.json({ success: true });
  } catch (err) {
    console.error("Erro excluir conteúdo (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 18. AVATAR E CAPA ==========

router.post("/avatar", authAgencia, upload.single("avatar"), async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.body.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }
    if (!req.file) return res.status(400).json({ erro: "Arquivo não enviado" });

    const { mimetype, originalname, buffer } = req.file;
    const caminho = `velvet/avatars/${modeloId}/${Date.now()}-${originalname}`;

    await s3Publico.upload({ Bucket: process.env.R2_BUCKET, Key: caminho, Body: buffer, ContentType: mimetype }).promise();
    const avatarUrl = `${process.env.R2_PUBLIC_URL}/${caminho}`;

    await db.query("UPDATE modelos SET avatar = $1 WHERE id = $2", [avatarUrl, modeloId]);
    res.json({ avatar: avatarUrl });
  } catch (err) {
    console.error("Erro upload avatar (agência):", err);
    res.status(500).json({ erro: "Erro ao atualizar avatar" });
  }
});

router.post("/capa", authAgencia, upload.single("capa"), async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.body.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }
    if (!req.file) return res.status(400).json({ erro: "Arquivo não enviado" });

    const { mimetype, originalname, buffer } = req.file;
    const caminho = `velvet/capas/${modeloId}/${Date.now()}-${originalname}`;

    await s3Publico.upload({ Bucket: process.env.R2_BUCKET, Key: caminho, Body: buffer, ContentType: mimetype, CacheControl: "no-cache" }).promise();
    const capaUrl = `${process.env.R2_PUBLIC_URL}/${caminho}`;

    await db.query("UPDATE modelos SET capa = $1 WHERE id = $2", [capaUrl, modeloId]);
    res.json({ capa: capaUrl });
  } catch (err) {
    console.error("Erro upload capa (agência):", err);
    res.status(500).json({ erro: "Erro ao atualizar capa" });
  }
});

// ========== 19. BIO E PERFIL ==========

router.get("/perfil", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.query.modelo_id);
    if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
      return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
    }

    const { rows } = await db.query(`
      SELECT m.id AS modelo_id, m.nome_exibicao, m.bio, m.avatar, m.capa, m.local,
             md.instagram, md.tiktok, md.classificacao_conteudo
      FROM modelos m
      LEFT JOIN modelos_dados md ON md.modelo_id = m.id AND md.ativo = true
      WHERE m.id = $1
    `, [modeloId]);

    if (!rows.length) return res.status(404).json({ erro: "Perfil não encontrado" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Erro buscar perfil (agência):", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/perfil", authAgencia, async (req, res) => {
try {
const agenciaId = req.agencia.id;
const modeloId = Number(req.body.modelo_id);

if (!modeloId || !(await modeloPertenceAgencia(agenciaId, modeloId))) {
  return res.status(404).json({ erro: "Modelo não encontrada nesta agência" });
}

const {
  nome_exibicao,
  instagram,
  tiktok,
  local,
  bio,
  classificacao_conteudo
} = req.body;

if (!nome_exibicao || !nome_exibicao.trim()) {
  return res.status(400).json({ erro: "nome_exibicao é obrigatório" });
}


await db.query(
  `UPDATE modelos
   SET nome_exibicao = $1,
       local = $2,
       bio = $3
   WHERE id = $4`,
  [
    nome_exibicao.trim(),
    local?.trim() || null,
    bio?.trim() || null,
    modeloId
  ]
);

const result = await db.query(
  `UPDATE modelos_dados
   SET instagram = $1,
       tiktok = $2,
       classificacao_conteudo = $3,
       atualizado_em = NOW()
   WHERE modelo_id = $4`,
  [
    instagram?.trim() || null,
    tiktok?.trim() || null,
    classificacao_conteudo || null,
    modeloId
  ]
);

if (result.rowCount === 0) {
  return res.status(404).json({
    erro: "Registro não encontrado em modelos_dados"
  });
}

res.json({ sucesso: true });

} catch (err) {
console.error("Erro salvar perfil (agência):", err);
res.status(500).json({ erro: "Erro interno" });
}
});

// Gera o fechamento de ano/mês para todas as agências (usado pelo cron do dia 1 e
// pelo gatilho automático quando o admin gera o fechamento geral). Ignora agências
// que já possuem fechamento para o período.
async function gerarFechamentosTodasAgencias(ano, mes) {
  const { rows: agencias } = await db.query("SELECT id FROM agencias");
  const resultado = { geradas: 0, ignoradas: 0 };

  for (const ag of agencias) {
    try {
      await gerarFechamentoAgencia(ag.id, ano, mes);
      resultado.geradas++;
    } catch (err) {
      resultado.ignoradas++;
      if (!/já existe/i.test(err.message)) {
        console.error(`[Fechamento Agência] Erro agência #${ag.id}:`, err.message);
      }
    }
  }

  return resultado;
}

// ========== FORMULÁRIO CHAT ==========

router.get("/chat-forms", async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { rows } = await db.query(`
      SELECT
        m.id,
        m.nome,
        f.preenchido_em,
        f.updated_at AS atualizado_em,
        CASE WHEN f.id IS NOT NULL THEN true ELSE false END AS preenchido
      FROM modelos m
      LEFT JOIN agency_chat_forms f ON f.modelo_id = m.id
      WHERE m.agencia_id = $1 AND m.ativo = true
      ORDER BY m.nome
    `, [agenciaId]);
    res.json(rows);
  } catch (err) {
    console.error("Erro chat-forms lista:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/chat-form/:modelo_id", async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const modeloId = Number(req.params.modelo_id);

    const m = await db.query(
      "SELECT id, nome FROM modelos WHERE id=$1 AND agencia_id=$2",
      [modeloId, agenciaId]
    );
    if (!m.rowCount) return res.status(404).json({ erro: "Modelo não encontrado nesta agência" });

    const { rows } = await db.query(
      "SELECT * FROM agency_chat_forms WHERE modelo_id=$1",
      [modeloId]
    );
    res.json({ modelo: m.rows[0], form: rows[0] || null });
  } catch (err) {
    console.error("Erro chat-form get:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== TRANSAÇÕES ==========
router.get("/transacoes", authAgencia, async (req, res) => {
  try {
    const agenciaId = req.agencia.id;
    const { mes, modelo_id } = req.query;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    let m = null;
    const hasModelo = modelo_id && Number(modelo_id) > 0;

    const baseFilter = ["m.agencia_id = $1", "t.status IN ('pago','chargeback')"];
    const baseParams = [agenciaId];
    if (hasModelo) { baseFilter.push(`t.modelo_id = $2`); baseParams.push(Number(modelo_id)); }

    const filterArr  = [...baseFilter];
    const rowsParams = [...baseParams];

    let firstDayStr = null, lastDayStr = null;

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [ano, mesNum] = mes.split('-').map(Number);
      m = { ano, mes: mesNum };
      firstDayStr = `${ano}-${String(mesNum).padStart(2,'0')}-01`;
      lastDayStr  = `${ano}-${String(mesNum).padStart(2,'0')}-${new Date(ano, mesNum, 0).getDate()}`;
      const pi = rowsParams.length + 1;
      filterArr.push(`EXTRACT(YEAR  FROM t.created_at AT TIME ZONE 'America/Sao_Paulo') = $${pi}
                  AND EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'America/Sao_Paulo') = $${pi + 1}`);
      rowsParams.push(ano, mesNum);
    }

    const whereRows   = filterArr.join(' AND ');
    const totaisParams = rowsParams;

    // Liberado = não-Stripe OU Stripe com disponivel_em já passado
    const DISP = "(t.gateway IS DISTINCT FROM 'stripe' OR (t.disponivel_em IS NOT NULL AND t.disponivel_em <= NOW()))";

    // Dia de compra
    const DIA = `DATE(t.created_at AT TIME ZONE 'America/Sao_Paulo')`;

    const limitIdx  = rowsParams.length + 1;
    const offsetIdx = rowsParams.length + 2;

    const [totaisQ, countQ, rowsQ, libRowsQ, extraLibRowsQ] = await Promise.all([

      // Totais por mês de compra (para PIX e Stripe do próprio mês — usado como base do liberado)
      db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN t.status='pago' AND t.gateway != 'stripe' THEN t.valor_modelo ELSE 0 END), 0) AS pix_modelo,
          COALESCE(SUM(CASE WHEN t.status='pago' AND t.gateway != 'stripe' THEN t.agency_fee   ELSE 0 END), 0) AS pix_agencia,
          COALESCE(SUM(CASE WHEN t.status='pago' AND ${DISP}     THEN t.valor_modelo ELSE 0 END), 0) AS liberado_modelo_base,
          COALESCE(SUM(CASE WHEN t.status='pago' AND ${DISP}     THEN t.agency_fee   ELSE 0 END), 0) AS liberado_agencia_base,
          COALESCE(SUM(CASE WHEN t.status='pago' AND NOT ${DISP} THEN t.valor_modelo ELSE 0 END), 0) AS pendente_modelo_all,
          COALESCE(SUM(CASE WHEN t.status='pago' AND NOT ${DISP} THEN t.agency_fee   ELSE 0 END), 0) AS pendente_agencia_all
        FROM transacoes_agency t
        JOIN modelos m ON m.id = t.modelo_id
        WHERE ${whereRows}
      `, totaisParams),

      db.query(`
        SELECT COUNT(DISTINCT (${DIA})) AS count
        FROM transacoes_agency t
        JOIN modelos m ON m.id = t.modelo_id
        WHERE ${whereRows}
      `, rowsParams),

      db.query(`
        SELECT
          TO_CHAR((${DIA}), 'YYYY-MM-DD') AS dia,
          COALESCE(SUM(CASE WHEN t.status='pago' AND ${DISP}     THEN t.valor_modelo ELSE 0 END), 0) AS ganhos_modelo,
          COALESCE(SUM(CASE WHEN t.status='pago' AND ${DISP}     THEN t.agency_fee   ELSE 0 END), 0) AS ganhos_agencia,
          COALESCE(SUM(CASE WHEN t.status='pago' AND NOT ${DISP} THEN t.valor_modelo ELSE 0 END), 0) AS pendente_modelo,
          COALESCE(SUM(CASE WHEN t.status='pago' AND NOT ${DISP} THEN t.agency_fee   ELSE 0 END), 0) AS pendente_agencia,
          TO_CHAR(MIN(CASE WHEN t.status='pago' AND NOT ${DISP} AND t.disponivel_em IS NOT NULL
            THEN DATE(t.disponivel_em AT TIME ZONE 'UTC') END), 'YYYY-MM-DD') AS proxima_liberacao
        FROM transacoes_agency t
        JOIN modelos m ON m.id = t.modelo_id
        WHERE ${whereRows}
        GROUP BY (${DIA})
        ORDER BY dia DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `, [...rowsParams, limit, offset]),

      // libRowsQ: filtra por mês de COMPRA → mostra todas as liberações das compras do mês selecionado
      db.query(`
        SELECT
          TO_CHAR(DATE(t.created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS dia,
          TO_CHAR(DATE(t.disponivel_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS dia_lib,
          COALESCE(SUM(t.valor_modelo), 0) AS lib_modelo,
          COALESCE(SUM(t.agency_fee),   0) AS lib_agencia
        FROM transacoes_agency t
        JOIN modelos m ON m.id = t.modelo_id
        WHERE m.agencia_id = $1
          ${hasModelo ? `AND t.modelo_id = $2` : ''}
          AND t.gateway = 'stripe' AND t.status = 'pago'
          AND t.disponivel_em IS NOT NULL AND t.disponivel_em <= NOW()
          ${m ? `AND EXTRACT(YEAR  FROM t.created_at AT TIME ZONE 'America/Sao_Paulo') = $${hasModelo ? 3 : 2}
                 AND EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'America/Sao_Paulo') = $${hasModelo ? 4 : 3}` : ''}
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2
      `, [agenciaId, ...(hasModelo ? [Number(modelo_id)] : []), ...(m ? [m.ano, m.mes] : [])]),

      // extraLibRowsQ: Stripe com disponivel_em neste mês (UTC), de compras de MESES ANTERIORES
      m ? db.query(`
        SELECT
          TO_CHAR(DATE(t.created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS dia,
          TO_CHAR(DATE(t.disponivel_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS dia_lib,
          COALESCE(SUM(t.valor_modelo), 0) AS lib_modelo,
          COALESCE(SUM(t.agency_fee),   0) AS lib_agencia
        FROM transacoes_agency t
        JOIN modelos m ON m.id = t.modelo_id
        WHERE m.agencia_id = $1
          ${hasModelo ? `AND t.modelo_id = $2` : ''}
          AND t.gateway = 'stripe' AND t.status = 'pago'
          AND t.disponivel_em IS NOT NULL AND t.disponivel_em <= NOW()
          AND DATE(t.disponivel_em AT TIME ZONE 'UTC') >= $${hasModelo ? 3 : 2}::date
          AND DATE(t.disponivel_em AT TIME ZONE 'UTC') <= $${hasModelo ? 4 : 3}::date
          AND NOT (
            EXTRACT(YEAR  FROM t.created_at AT TIME ZONE 'America/Sao_Paulo') = $${hasModelo ? 5 : 4}
            AND EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'America/Sao_Paulo') = $${hasModelo ? 6 : 5}
          )
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2
      `, [agenciaId, ...(hasModelo ? [Number(modelo_id)] : []), firstDayStr, lastDayStr, m.ano, m.mes])
      : Promise.resolve({ rows: [] }),

    ]);

    // libMap: liberações das compras do mês atual, keyed por dia_compra
    const libMap = {};
    for (const r of libRowsQ.rows) {
      if (!libMap[r.dia]) libMap[r.dia] = [];
      libMap[r.dia].push({ data: r.dia_lib, modelo: Number(r.lib_modelo), agencia: Number(r.lib_agencia) });
    }

    // extraLibMap: liberações de compras de meses anteriores que caíram neste mês (exibição apenas)
    const extraLibMap = {};
    for (const r of extraLibRowsQ.rows) {
      if (!extraLibMap[r.dia]) extraLibMap[r.dia] = [];
      extraLibMap[r.dia].push({ data: r.dia_lib, modelo: Number(r.lib_modelo), agencia: Number(r.lib_agencia) });
    }

    // Linhas extras: uma por dia de compra anterior que teve liberação neste mês (informativo)
    const extraRows = Object.entries(extraLibMap).map(([diaCompra, libs]) => ({
      dia: diaCompra,
      ganhos_modelo:  libs.reduce((s, l) => s + l.modelo, 0),
      ganhos_agencia: libs.reduce((s, l) => s + l.agencia, 0),
      pendente_modelo: 0,
      pendente_agencia: 0,
      proxima_liberacao: null,
      liberacoes: libs,
      is_prev_month: true,
    }));

    const rows = [
      ...rowsQ.rows.map(r => ({ ...r, liberacoes: libMap[r.dia] || [] })),
      ...extraRows,
    ].sort((a, b) => String(b.dia).localeCompare(String(a.dia)));

    const t0 = totaisQ.rows[0];

    // Cards: mesma lógica do admin — PIX + Stripe filtrados por created_at SP do mês
    // liberado = disponivel_em <= NOW(), pendente = disponivel_em > NOW()
    const liberado_modelo  = Number(t0.liberado_modelo_base);
    const liberado_agencia = Number(t0.liberado_agencia_base);
    const pendente_modelo  = Number(t0.pendente_modelo_all);
    const pendente_agencia = Number(t0.pendente_agencia_all);

    res.json({
      totais: { liberado_modelo, liberado_agencia, pendente_modelo, pendente_agencia },
      rows,
      totalPages: Math.ceil(Number(countQ.rows[0].count || 0) / limit),
      page,
    });
  } catch (err) {
    console.error("Erro transacoes agencia:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

module.exports = router;
module.exports.gerarFechamentoAgencia = gerarFechamentoAgencia;
module.exports.gerarFechamentosTodasAgencias = gerarFechamentosTodasAgencias;
module.exports.DESPESA_CHATTER_PADRAO = DESPESA_CHATTER_PADRAO;
