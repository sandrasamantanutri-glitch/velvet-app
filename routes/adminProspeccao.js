const express = require("express");
const router = express.Router();
const db = require("../db");

const STATUS = ["novo", "qualificada", "contactada", "em_conversa", "fechada", "rejeitada"];

function pontuacao(p) {
  let s = 0;
  const f = p.seguidores || 0;
  if (f >= 20000) { s += 30; if (f >= 50000) s += 5; if (f >= 100000) s += 5; }
  const er = Number(p.engajamento) || 0;
  s += er >= 3 ? 20 : er >= 1.5 ? 12 : er > 0 ? 5 : 0;
  const pw = Number(p.posts_semana) || 0;
  s += pw >= 3 ? 20 : pw >= 1.5 ? 12 : pw > 0 ? 5 : 0;
  s += Math.min((p.categorias || []).length, 3) * 5;
  if (p.maior_18) s += 10;
  if (p.email || p.telefone) s += 5;
  return Math.min(s, 100);
}

const comScore = (p) => ({ ...p, score: pontuacao(p) });
const limparUser = (u) => String(u || "").trim().replace(/^@+/, "").toLowerCase();
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

router.get("/stats", async (req, res) => {
  try {
    const r = await db.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE criado_em >= date_trunc('month', NOW()))::int AS este_mes,
             COUNT(*) FILTER (WHERE status IN ('contactada','em_conversa','fechada'))::int AS contactadas,
             COUNT(*) FILTER (WHERE prioridade >= 4)::int AS alta_prioridade,
             COUNT(*) FILTER (WHERE proximo_contato IS NOT NULL AND proximo_contato <= CURRENT_DATE
                              AND status NOT IN ('fechada','rejeitada'))::int AS followups
      FROM prospeccao_perfis`);
    res.json(r.rows[0]);
  } catch (err) {
    console.error("Erro prospeccao stats:", err);
    res.status(500).json({ error: "Erro ao carregar estatísticas" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, categoria, busca, ordem } = req.query;
    const where = [], params = [];
    if (status && STATUS.includes(status)) { params.push(status); where.push(`status = $${params.length}`); }
    if (categoria) { params.push(categoria); where.push(`$${params.length} = ANY(categorias)`); }
    if (busca) { params.push(`%${busca}%`); where.push(`(username ILIKE $${params.length} OR nome ILIKE $${params.length} OR notas ILIKE $${params.length})`); }
    const r = await db.query(
      `SELECT * FROM prospeccao_perfis ${where.length ? "WHERE " + where.join(" AND ") : ""} LIMIT 2000`, params);
    const rows = r.rows.map(comScore);
    if (ordem === "recentes") rows.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    else if (ordem === "seguidores") rows.sort((a, b) => b.seguidores - a.seguidores);
    else rows.sort((a, b) => b.prioridade - a.prioridade || b.score - a.score);
    res.json(rows);
  } catch (err) {
    console.error("Erro prospeccao listar:", err);
    res.status(500).json({ error: "Erro ao listar perfis" });
  }
});

router.get("/export.csv", async (req, res) => {
  try {
    const r = await db.query("SELECT * FROM prospeccao_perfis ORDER BY criado_em DESC");
    const cols = ["username", "nome", "seguidores", "engajamento", "posts_semana", "categorias", "status",
      "prioridade", "score", "maior_18", "email", "telefone", "proximo_contato", "notas", "origem", "criado_em"];
    const esc = (v) => {
      let s = Array.isArray(v) ? v.join(", ") : v instanceof Date ? v.toISOString() : String(v ?? "");
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const linhas = [cols.join(",")].concat(
      r.rows.map(comScore).map((p) => cols.map((c) => esc(p[c])).join(",")));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=prospeccao.csv");
    res.send("﻿" + linhas.join("\r\n"));
  } catch (err) {
    console.error("Erro prospeccao export:", err);
    res.status(500).json({ error: "Erro ao exportar" });
  }
});

router.get("/:id(\\d+)", async (req, res) => {
  try {
    const p = await db.query("SELECT * FROM prospeccao_perfis WHERE id = $1", [req.params.id]);
    if (!p.rowCount) return res.status(404).json({ error: "Perfil não encontrado" });
    const c = await db.query(
      "SELECT id, tipo, notas, criado_em FROM prospeccao_contatos WHERE perfil_id = $1 ORDER BY criado_em DESC", [req.params.id]);
    res.json({ ...comScore(p.rows[0]), contatos: c.rows });
  } catch (err) {
    console.error("Erro prospeccao detalhe:", err);
    res.status(500).json({ error: "Erro ao carregar perfil" });
  }
});

router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const username = limparUser(b.username);
    if (!/^[a-z0-9._]{1,30}$/.test(username)) return res.status(400).json({ error: "Username inválido" });
    const cats = Array.isArray(b.categorias) ? b.categorias.map(String).slice(0, 10) : [];
    const r = await db.query(
      `INSERT INTO prospeccao_perfis (username, nome, bio, seguidores, engajamento, posts_semana, categorias, origem, email, telefone, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (username) DO NOTHING RETURNING id`,
      [username, String(b.nome || ""), String(b.bio || ""), Math.max(0, Math.trunc(num(b.seguidores))),
        num(b.engajamento), num(b.posts_semana), cats, String(b.origem || "manual"),
        String(b.email || ""), String(b.telefone || ""), String(b.notas || "")]);
    if (!r.rowCount) return res.status(409).json({ error: "Este perfil já está na lista" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) {
    console.error("Erro prospeccao criar:", err);
    res.status(500).json({ error: "Erro ao guardar perfil" });
  }
});

router.patch("/:id(\\d+)", async (req, res) => {
  try {
    const b = req.body || {};
    const sets = [], params = [];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if ("status" in b) {
      if (!STATUS.includes(b.status)) return res.status(400).json({ error: "Estado inválido" });
      add("status", b.status);
    }
    if ("prioridade" in b) add("prioridade", Math.min(5, Math.max(0, Math.trunc(num(b.prioridade)))));
    if ("maior_18" in b) add("maior_18", !!b.maior_18);
    for (const k of ["nome", "bio", "email", "telefone", "notas"]) if (k in b) add(k, String(b[k] ?? ""));
    if ("seguidores" in b) add("seguidores", Math.max(0, Math.trunc(num(b.seguidores))));
    if ("engajamento" in b) add("engajamento", num(b.engajamento));
    if ("posts_semana" in b) add("posts_semana", num(b.posts_semana));
    if ("categorias" in b && Array.isArray(b.categorias)) add("categorias", b.categorias.map(String).slice(0, 10));
    if ("proximo_contato" in b) add("proximo_contato", b.proximo_contato || null);
    if (!sets.length) return res.status(400).json({ error: "Nada para atualizar" });
    sets.push("atualizado_em = NOW()");
    params.push(req.params.id);
    const r = await db.query(`UPDATE prospeccao_perfis SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    if (!r.rowCount) return res.status(404).json({ error: "Perfil não encontrado" });
    res.json({ success: true });
  } catch (err) {
    console.error("Erro prospeccao atualizar:", err);
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
});

router.delete("/:id(\\d+)", async (req, res) => {
  try {
    await db.query("DELETE FROM prospeccao_perfis WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro prospeccao apagar:", err);
    res.status(500).json({ error: "Erro ao apagar perfil" });
  }
});

router.post("/:id(\\d+)/contatos", async (req, res) => {
  try {
    const tipo = ["dm", "email", "whatsapp", "ligacao"].includes(req.body?.tipo) ? req.body.tipo : "dm";
    const ex = await db.query("SELECT 1 FROM prospeccao_perfis WHERE id = $1", [req.params.id]);
    if (!ex.rowCount) return res.status(404).json({ error: "Perfil não encontrado" });
    await db.query("INSERT INTO prospeccao_contatos (perfil_id, tipo, notas) VALUES ($1,$2,$3)",
      [req.params.id, tipo, String(req.body?.notas || "")]);
    await db.query(
      `UPDATE prospeccao_perfis SET ultimo_contato = NOW(), atualizado_em = NOW(),
         status = CASE WHEN status IN ('novo','qualificada') THEN 'contactada' ELSE status END
       WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro prospeccao contato:", err);
    res.status(500).json({ error: "Erro ao registar contacto" });
  }
});

module.exports = router;
