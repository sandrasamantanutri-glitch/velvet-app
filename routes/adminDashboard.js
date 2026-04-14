// ========================================
// ADMIN DASHBOARD — API ROUTES
// ========================================

const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middleware/auth");
const authAdmin = require("../middleware/authAdmin");
const bcrypt = require("bcrypt");

// All routes require admin auth
router.use(auth, authAdmin);

// ========== HELPERS ==========

function parseMes(mesStr) {
  if (!mesStr) return null;
  const [ano, mes] = mesStr.split("-");
  if (!ano || !mes) return null;
  return { ano: Number(ano), mes: Number(mes) };
}

function paginate(query, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  return { limit, offset, page };
}

// ========== 1. OVERVIEW ==========

router.get("/overview", async (req, res) => {
  try {
    const [modelos, clientes, vips, fat, fat12m, acessos, top] = await Promise.all([
      db.query("SELECT COUNT(*) FROM modelos WHERE ativo = true"),
      db.query("SELECT COUNT(*) FROM clientes WHERE ativo = true"),
      db.query("SELECT COUNT(*) FROM vip_subscriptions WHERE ativo = true"),
      db.query(`
        SELECT COALESCE(SUM(valor_bruto), 0) AS total
        FROM transacoes_agency
        WHERE status = 'normal'
        AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
      `),
      db.query(`
        SELECT TO_CHAR(created_at, 'YYYY-MM') AS mes, COALESCE(SUM(valor_bruto), 0) AS total
        FROM transacoes_agency
        WHERE status = 'normal' AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY mes ORDER BY mes
      `),
      db.query(`
        SELECT origem, COUNT(*) AS total
        FROM acessos_origem
        WHERE criado_em >= NOW() - INTERVAL '30 days'
        GROUP BY origem ORDER BY total DESC LIMIT 5
      `),
      db.query(`
        SELECT t.modelo_id, m.nome,
          SUM(t.valor_bruto) AS ganhos,
          (SELECT COUNT(*) FROM vip_subscriptions v WHERE v.modelo_id = t.modelo_id AND v.ativo = true) AS assinantes
        FROM transacoes_agency t
        JOIN modelos m ON m.id = t.modelo_id
        WHERE t.status = 'normal'
        AND EXTRACT(MONTH FROM t.created_at) = EXTRACT(MONTH FROM NOW())
        AND EXTRACT(YEAR FROM t.created_at) = EXTRACT(YEAR FROM NOW())
        GROUP BY t.modelo_id, m.nome
        ORDER BY ganhos DESC LIMIT 5
      `)
    ]);

    res.json({
      total_modelos: modelos.rows[0].count,
      total_clientes: clientes.rows[0].count,
      vips_ativos: vips.rows[0].count,
      faturamento_mes: fat.rows[0].total,
      faturamento_12m: fat12m.rows,
      acessos_origem: acessos.rows,
      top_modelos: top.rows
    });
  } catch (err) {
    console.error("Erro overview:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 2. ACESSOS ==========

router.get("/acessos", async (req, res) => {
  try {
    const m = parseMes(req.query.mes);
    const where = m
      ? `AND EXTRACT(MONTH FROM criado_em) = ${m.mes} AND EXTRACT(YEAR FROM criado_em) = ${m.ano}`
      : `AND criado_em >= NOW() - INTERVAL '30 days'`;

    const [totais, diario, topModelos] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE LOWER(origem) LIKE '%instagram%') AS instagram,
          COUNT(*) FILTER (WHERE LOWER(origem) LIKE '%tiktok%') AS tiktok,
          COUNT(*) FILTER (WHERE LOWER(origem) = 'direto' OR origem IS NULL) AS direto,
          COUNT(*) AS total
        FROM acessos_origem WHERE 1=1 ${where}
      `),
      db.query(`
        SELECT criado_em::date AS dia,
          COUNT(*) FILTER (WHERE LOWER(origem) LIKE '%instagram%') AS instagram,
          COUNT(*) FILTER (WHERE LOWER(origem) LIKE '%tiktok%') AS tiktok,
          COUNT(*) FILTER (WHERE LOWER(origem) = 'direto' OR origem IS NULL) AS direto
        FROM acessos_origem WHERE 1=1 ${where}
        GROUP BY dia ORDER BY dia
      `),
      db.query(`
        SELECT a.modelo_id, m.nome,
          COUNT(*) FILTER (WHERE LOWER(a.origem) LIKE '%instagram%') AS instagram,
          COUNT(*) FILTER (WHERE LOWER(a.origem) LIKE '%tiktok%') AS tiktok,
          COUNT(*) FILTER (WHERE LOWER(a.origem) = 'direto' OR a.origem IS NULL) AS direto,
          COUNT(*) AS total
        FROM acessos_origem a
        JOIN modelos m ON m.id = a.modelo_id
        WHERE 1=1 ${where}
        GROUP BY a.modelo_id, m.nome
        ORDER BY total DESC LIMIT 5
      `)
    ]);

    const t = totais.rows[0];
    res.json({
      instagram: Number(t.instagram),
      tiktok: Number(t.tiktok),
      direto: Number(t.direto),
      total: Number(t.total),
      distribuicao: true,
      diario: diario.rows,
      top_modelos: topModelos.rows
    });
  } catch (err) {
    console.error("Erro acessos:", err);
    res.status(500).json({ erro: "Erro interno" });
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

router.post("/admins", async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: "Email e senha obrigatórios" });
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await db.query(
      "INSERT INTO admin (email, senha) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hash]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Erro criar admin:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.delete("/admins/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM admin WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Erro excluir admin:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 4. SEGURANÇA ==========

router.get("/seguranca", async (req, res) => {
  try {
    const m = parseMes(req.query.mes);
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);

    let where = "1=1";
    if (m) where = `EXTRACT(MONTH FROM h.data) = ${m.mes} AND EXTRACT(YEAR FROM h.data) = ${m.ano}`;

    const countQ = await db.query(`SELECT COUNT(*) FROM admin_seguranca_historico h WHERE ${where}`);
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT h.*, m.nome AS modelo_nome, a.email AS admin_email
      FROM admin_seguranca_historico h
      LEFT JOIN modelos m ON m.id = h.modelo_id
      LEFT JOIN admin a ON a.id = h.admin_id
      WHERE ${where}
      ORDER BY h.data DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) {
    console.error("Erro segurança:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.get("/exclusoes", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const countQ = await db.query("SELECT COUNT(*) FROM clientes_bloqueados_cadastro");
    const total = Number(countQ.rows[0].count);
    const { rows } = await db.query(
      "SELECT * FROM clientes_bloqueados_cadastro ORDER BY criado_em DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) {
    console.error("Erro exclusões:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 5. BLOQUEIOS ==========

// Cliente Risco
router.get("/cliente-risco", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const countQ = await db.query("SELECT COUNT(*) FROM cliente_risco");
    const total = Number(countQ.rows[0].count);
    const { rows } = await db.query("SELECT * FROM cliente_risco ORDER BY criado_em DESC LIMIT $1 OFFSET $2", [limit, offset]);
    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/cliente-risco/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM cliente_risco WHERE cliente_id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.post("/cliente-risco", async (req, res) => {
  try {
    const { cliente_id, bloqueio_ip, bloqueio_cpf, bloqueado_ate } = req.body;
    const { rows } = await db.query(
      `INSERT INTO cliente_risco (cliente_id, bloqueio_ip, bloqueio_cpf, bloqueado_ate)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [cliente_id, bloqueio_ip || false, bloqueio_cpf || false, bloqueado_ate]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Erro criar risco:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/cliente-risco/:id", async (req, res) => {
  try {
    const { bloqueio_ip, bloqueio_cpf, bloqueado_ate } = req.body;
    const { rows } = await db.query(
      `UPDATE cliente_risco SET bloqueio_ip = $1, bloqueio_cpf = $2, bloqueado_ate = $3
       WHERE cliente_id = $4 RETURNING *`,
      [bloqueio_ip, bloqueio_cpf, bloqueado_ate, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.delete("/cliente-risco/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM cliente_risco WHERE cliente_id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// Clientes Bloqueados
router.get("/clientes-bloqueados", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const countQ = await db.query("SELECT COUNT(*) FROM clientes_bloqueados_cadastro");
    const total = Number(countQ.rows[0].count);
    const { rows } = await db.query("SELECT * FROM clientes_bloqueados_cadastro ORDER BY criado_em DESC LIMIT $1 OFFSET $2", [limit, offset]);
    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/clientes-bloqueados/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM clientes_bloqueados_cadastro WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.post("/clientes-bloqueados", async (req, res) => {
  try {
    const { email, nome_completo, data_nascimento, cliente_id_original, motivo } = req.body;
    const { rows } = await db.query(
      `INSERT INTO clientes_bloqueados_cadastro (email, nome_completo, data_nascimento, cliente_id_original, motivo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [email, nome_completo, data_nascimento, cliente_id_original, motivo]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.put("/clientes-bloqueados/:id", async (req, res) => {
  try {
    const { email, nome_completo, motivo } = req.body;
    const { rows } = await db.query(
      `UPDATE clientes_bloqueados_cadastro SET email = $1, nome_completo = $2, motivo = $3 WHERE id = $4 RETURNING *`,
      [email, nome_completo, motivo, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.delete("/clientes-bloqueados/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM clientes_bloqueados_cadastro WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// CPFs Bloqueados
router.get("/cpfs-bloqueados", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const countQ = await db.query("SELECT COUNT(*) FROM cpfs_bloqueados");
    const total = Number(countQ.rows[0].count);
    const { rows } = await db.query("SELECT * FROM cpfs_bloqueados ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.post("/cpfs-bloqueados", async (req, res) => {
  try {
    const { cpf, motivo } = req.body;
    if (!cpf) return res.status(400).json({ erro: "CPF obrigatório" });
    const { rows } = await db.query(
      "INSERT INTO cpfs_bloqueados (cpf, motivo) VALUES ($1, $2) RETURNING *",
      [cpf, motivo]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.delete("/cpfs-bloqueados/:cpf", async (req, res) => {
  try {
    await db.query("DELETE FROM cpfs_bloqueados WHERE cpf = $1", [req.params.cpf]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// IPs Bloqueados
router.get("/ips-bloqueados", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const countQ = await db.query("SELECT COUNT(*) FROM ips_bloqueados");
    const total = Number(countQ.rows[0].count);
    const { rows } = await db.query("SELECT * FROM ips_bloqueados ORDER BY criado_em DESC LIMIT $1 OFFSET $2", [limit, offset]);
    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.post("/ips-bloqueados", async (req, res) => {
  try {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ erro: "IP obrigatório" });
    const { rows } = await db.query("INSERT INTO ips_bloqueados (ip) VALUES ($1) RETURNING *", [ip]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.delete("/ips-bloqueados/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM ips_bloqueados WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// ========== 6. VERIFICAÇÕES ==========

// Modelos
router.get("/verificacoes/modelos", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const countQ = await db.query("SELECT COUNT(*) FROM modelos_verificacao");
    const total = Number(countQ.rows[0].count);
    const { rows } = await db.query(`
      SELECT v.*, m.nome AS modelo_nome
      FROM modelos_verificacao v
      LEFT JOIN modelos m ON m.id = v.modelo_id
      ORDER BY CASE WHEN v.status = 'pendente' THEN 0 ELSE 1 END, v.criado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/verificacoes/modelo/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM modelos_verificacao WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.put("/verificacoes/modelo/:id", async (req, res) => {
  try {
    const { status, motivo_rejeicao } = req.body;
    const { rows } = await db.query(`
      UPDATE modelos_verificacao
      SET status = $1, motivo_rejeicao = $2, verificado_em = NOW(), atualizado_em = NOW()
      WHERE id = $3 RETURNING *
    `, [status, motivo_rejeicao || null, req.params.id]);

    // If approved, also mark modelo as verified
    if (status === "aprovado" && rows[0]) {
      await db.query("UPDATE modelos SET verificada = true WHERE id = $1", [rows[0].modelo_id]);
    }

    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// Clientes
router.get("/verificacoes/clientes", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const countQ = await db.query("SELECT COUNT(*) FROM clientes_verificacao");
    const total = Number(countQ.rows[0].count);
    const { rows } = await db.query(`
      SELECT v.*, c.nome AS cliente_nome
      FROM clientes_verificacao v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      ORDER BY CASE WHEN v.status = 'em_analise' THEN 0 WHEN v.status = 'pendente' THEN 0 ELSE 1 END, v.criado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/verificacoes/cliente/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM clientes_verificacao WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.put("/verificacoes/cliente/:id", async (req, res) => {
  try {
    const { status, motivo_rejeicao } = req.body;
    const { rows } = await db.query(`
      UPDATE clientes_verificacao
      SET status = $1, motivo_rejeicao = $2, verificado_em = NOW(), atualizado_em = NOW()
      WHERE id = $3 RETURNING *
    `, [status, motivo_rejeicao || null, req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// ========== 7. FECHAMENTO ==========

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

// ========== 8. DADOS BANCÁRIOS ==========

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

router.put("/dados-bancarios/:id", async (req, res) => {
  try {
    const fields = req.body;
    const sets = [];
    const vals = [];
    let i = 1;

    for (const [key, val] of Object.entries(fields)) {
      if (["id", "modelo_id", "criado_em"].includes(key)) continue;
      sets.push(`${key} = $${i}`);
      vals.push(val);
      i++;
    }

    if (fields.status === "aprovado") {
      sets.push(`aprovado_em = NOW()`);
    }
    sets.push(`atualizado_em = NOW()`);

    vals.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE modelo_dados_bancarios SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      vals
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Erro atualizar bancário:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 9. MODELOS ==========

router.get("/modelos-lista", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT id, nome FROM modelos WHERE ativo = true ORDER BY nome");
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/modelos", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const busca = req.query.busca || "";

    let where = "1=1";
    const params = [limit, offset];

    if (busca) {
      where = "(m.nome ILIKE $3 OR m.id::text = $4 OR u.email ILIKE $3)";
      params.push(`%${busca}%`, busca);
    }

    const countParams = busca ? [`%${busca}%`, busca] : [];
    const countWhere = busca ? "(m.nome ILIKE $1 OR m.id::text = $2 OR u.email ILIKE $1)" : "1=1";
    const countQ = await db.query(`
      SELECT COUNT(*) FROM modelos m LEFT JOIN users u ON u.id = m.user_id WHERE ${countWhere}
    `, countParams);
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT m.*, u.email, ag.nome AS agencia_nome
      FROM modelos m
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN agencias ag ON ag.id = m.agencia_id
      WHERE ${where}
      ORDER BY m.id DESC
      LIMIT $1 OFFSET $2
    `, params);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) {
    console.error("Erro modelos:", err);
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

router.put("/modelos/:id", async (req, res) => {
  try {
    const fields = req.body;
    const sets = [];
    const vals = [];
    let i = 1;
    const allowed = ["nome", "nome_exibicao", "verificada", "feed", "bio", "local", "agencia_id", "ativo"];

    for (const [key, val] of Object.entries(fields)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = $${i}`);
      vals.push(val);
      i++;
    }

    if (!sets.length) return res.status(400).json({ erro: "Nenhum campo para atualizar" });

    sets.push(`atualizado_em = NOW()`);
    vals.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE modelos SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      vals
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Erro atualizar modelo:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// Modelos Dados
router.get("/modelos-dados/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM modelos_dados WHERE modelo_id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.put("/modelos-dados/:id", async (req, res) => {
  try {
    const fields = req.body;
    const sets = [];
    const vals = [];
    let i = 1;
    const allowed = ["nome_completo", "data_nascimento", "telefone", "endereco", "pais", "estado", "cidade", "instagram", "tiktok", "vip_preco"];

    for (const [key, val] of Object.entries(fields)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = $${i}`);
      vals.push(val);
      i++;
    }

    if (!sets.length) return res.status(400).json({ erro: "Nenhum campo para atualizar" });

    sets.push(`atualizado_em = NOW()`);
    vals.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE modelos_dados SET ${sets.join(", ")} WHERE modelo_id = $${i} RETURNING *`,
      vals
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// ========== 10. RANKING ==========

router.get("/ranking", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, m.nome
      FROM modelos_ranking r
      LEFT JOIN modelos m ON m.id = r.modelo_id
      ORDER BY r.ganhos_total DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// ========== 11. FINANCEIRO (RASTREIO) ==========

function makeGenericList(table, orderBy = "id DESC") {
  return async (req, res) => {
    try {
      const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
      const countQ = await db.query(`SELECT COUNT(*) FROM ${table}`);
      const total = Number(countQ.rows[0].count);
      const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`, [limit, offset]);
      res.json({ rows, totalPages: Math.ceil(total / limit), page });
    } catch (err) {
      console.error(`Erro ${table}:`, err);
      res.status(500).json({ erro: "Erro interno" });
    }
  };
}

router.get("/pagamentos-cartao", makeGenericList("pagamentos_cartao", "created_at DESC"));
router.get("/pagamentos-pix", makeGenericList("pagamentos_pix", "criado_em DESC"));
router.get("/pagamento-tentativas", makeGenericList("pagamento_tentativas", "criado_em DESC"));
router.get("/pagarme-events", makeGenericList("pagarme_events", "created_at DESC"));
router.get("/stripe-events", makeGenericList("stripe_events", "created_at DESC"));
router.get("/conteudo-pacotes", makeGenericList("conteudo_pacotes", "criado_em DESC"));
router.get("/premium-unlocks", makeGenericList("premium_unlocks", "created_at DESC"));

// ========== 12. TRANSAÇÕES AGENCY ==========

router.get("/transacoes-agency", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const modelo_id = req.query.modelo_id;
    const m = parseMes(req.query.mes);

    let where = "1=1";
    const params = [limit, offset];
    let paramIdx = 3;

    if (modelo_id) {
      where += ` AND t.modelo_id = $${paramIdx}`;
      params.push(modelo_id);
      paramIdx++;
    }
    if (m) {
      where += ` AND EXTRACT(MONTH FROM t.created_at) = $${paramIdx} AND EXTRACT(YEAR FROM t.created_at) = $${paramIdx + 1}`;
      params.push(m.mes, m.ano);
      paramIdx += 2;
    }

    // Build count params (same conditions but different param indices)
    let countWhere = "1=1";
    const countParams = [];
    let ci = 1;
    if (modelo_id) { countWhere += ` AND t.modelo_id = $${ci}`; countParams.push(modelo_id); ci++; }
    if (m) { countWhere += ` AND EXTRACT(MONTH FROM t.created_at) = $${ci} AND EXTRACT(YEAR FROM t.created_at) = $${ci + 1}`; countParams.push(m.mes, m.ano); ci += 2; }

    const countQ = await db.query(`SELECT COUNT(*) FROM transacoes_agency t WHERE ${countWhere}`, countParams);
    const total = Number(countQ.rows[0].count);

    const totaisQ = await db.query(`
      SELECT
        COALESCE(SUM(t.valor_bruto), 0) AS bruto,
        COALESCE(SUM(t.valor_modelo), 0) AS modelo,
        COALESCE(SUM(t.velvet_fee), 0) AS velvet,
        COALESCE(SUM(t.agency_fee), 0) AS agency
      FROM transacoes_agency t WHERE ${countWhere}
    `, countParams);

    const { rows } = await db.query(`
      SELECT t.*, m.nome AS modelo_nome
      FROM transacoes_agency t
      LEFT JOIN modelos m ON m.id = t.modelo_id
      WHERE ${where}
      ORDER BY t.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

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

// ========== 13. PASSWORD RESETS ==========

router.get("/password-resets", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const countQ = await db.query("SELECT COUNT(*) FROM password_resets");
    const total = Number(countQ.rows[0].count);
    const { rows } = await db.query("SELECT * FROM password_resets ORDER BY criado_em DESC LIMIT $1 OFFSET $2", [limit, offset]);
    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.post("/password-reset", async (req, res) => {
  try {
    const { user_id, nova_senha } = req.body;
    if (!user_id || !nova_senha) return res.status(400).json({ erro: "user_id e nova_senha obrigatórios" });
    if (nova_senha.length < 6) return res.status(400).json({ erro: "Senha deve ter no mínimo 6 caracteres" });

    const hash = await bcrypt.hash(nova_senha, 10);
    await db.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, user_id]);

    // Log in security history
    await db.query(
      "INSERT INTO admin_seguranca_historico (admin_id, motivo) VALUES ($1, $2)",
      [req.user.id, `Reset de senha do user #${user_id}`]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro reset senha:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ========== 14. VIP SUBSCRIPTIONS ==========

router.get("/vip-subscriptions", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const busca = req.query.busca || "";

    let where = "1=1";
    const params = [limit, offset];

    if (busca) {
      where = "(v.cliente_id::text = $3 OR v.modelo_id::text = $3 OR m.nome ILIKE $4)";
      params.push(busca, `%${busca}%`);
    }

    const countParams = busca ? [busca, `%${busca}%`] : [];
    const countWhere = busca ? "(v.cliente_id::text = $1 OR v.modelo_id::text = $1 OR m.nome ILIKE $2)" : "1=1";
    const countQ = await db.query(`
      SELECT COUNT(*) FROM vip_subscriptions v LEFT JOIN modelos m ON m.id = v.modelo_id WHERE ${countWhere}
    `, countParams);
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT v.*, m.nome AS modelo_nome
      FROM vip_subscriptions v
      LEFT JOIN modelos m ON m.id = v.modelo_id
      WHERE ${where}
      ORDER BY v.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/vip-subscriptions/:id", async (req, res) => {
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

// ========== 15. MODELO PAGAMENTOS ==========

router.get("/modelo-pagamentos", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const modelo_id = req.query.modelo_id;

    let where = "1=1";
    const params = [limit, offset];
    if (modelo_id) { where = "p.modelo_id = $3"; params.push(modelo_id); }

    const countParams = modelo_id ? [modelo_id] : [];
    const countWhere = modelo_id ? "p.modelo_id = $1" : "1=1";
    const countQ = await db.query(`SELECT COUNT(*) FROM modelo_pagamentos p WHERE ${countWhere}`, countParams);
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT p.*, m.nome AS modelo_nome
      FROM modelo_pagamentos p
      LEFT JOIN modelos m ON m.id = p.modelo_id
      WHERE ${where}
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/modelo-pagamentos/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM modelo_pagamentos WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: "Não encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.post("/modelo-pagamentos", async (req, res) => {
  try {
    const { modelo_id, mes, total_midias, total_assinaturas, total_geral, recibo_url } = req.body;
    if (!modelo_id || !mes) return res.status(400).json({ erro: "modelo_id e mês obrigatórios" });

    const mesDate = mes + "-01";
    const { rows } = await db.query(`
      INSERT INTO modelo_pagamentos (modelo_id, mes, total_midias, total_assinaturas, total_geral, status, recibo_url)
      VALUES ($1, $2, $3, $4, $5, 'pendente', $6) RETURNING *
    `, [modelo_id, mesDate, total_midias || 0, total_assinaturas || 0, total_geral || 0, recibo_url]);

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro criar pgto modelo:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.put("/modelo-pagamentos/:id", async (req, res) => {
  try {
    const { total_midias, total_assinaturas, total_geral, status, recibo_url } = req.body;
    const pagoEm = status === "pago" ? "NOW()" : "pago_em";
    const { rows } = await db.query(`
      UPDATE modelo_pagamentos
      SET total_midias = $1, total_assinaturas = $2, total_geral = $3, status = $4, recibo_url = $5,
          pago_em = ${status === "pago" ? "NOW()" : "pago_em"}
      WHERE id = $6 RETURNING *
    `, [total_midias, total_assinaturas, total_geral, status, recibo_url, req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// ========== 16. AGÊNCIAS ==========

router.get("/agencias", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM agencias ORDER BY id");
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

router.get("/modelos-agencia/:agenciaId", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, nome, agencia_desde FROM modelos WHERE agencia_id = $1 ORDER BY nome",
      [req.params.agenciaId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

// ========== 17. FEED ==========

router.get("/feed", async (req, res) => {
  try {
    const { limit, offset, page } = paginate(req.query, Number(req.query.page) || 1, Number(req.query.limit) || 20);
    const busca = req.query.busca || "";

    let where = "1=1";
    const params = [limit, offset];
    if (busca) {
      where = "(m.nome ILIKE $3 OR m.id::text = $4)";
      params.push(`%${busca}%`, busca);
    }

    const countParams = busca ? [`%${busca}%`, busca] : [];
    const countWhere = busca ? "(m.nome ILIKE $1 OR m.id::text = $2)" : "1=1";
    const countQ = await db.query(`SELECT COUNT(*) FROM modelos m WHERE ${countWhere}`, countParams);
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT m.id, m.nome, m.feed, m.verificada
      FROM modelos m
      WHERE ${where}
      ORDER BY m.feed DESC, m.nome
      LIMIT $1 OFFSET $2
    `, params);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ erro: "Erro interno" }); }
});

module.exports = router;
