const express = require('express');
const router = express.Router();
const db = require('../db');

// Lista usuários confiáveis (autorizados a pagar a primeira assinatura VIP via PIX)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, motivo, criado_por, criado_em
       FROM usuarios_confiaveis
       ORDER BY criado_em DESC`
    );
    res.json({ usuarios: result.rows });
  } catch (err) {
    console.error('Erro ao listar usuários confiáveis:', err);
    res.status(500).json({ erro: 'Erro ao listar usuários confiáveis' });
  }
});

// Adiciona um usuário confiável pelo email
router.post('/', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const motivo = req.body?.motivo ? String(req.body.motivo).trim() : null;

    if (!email) {
      return res.status(400).json({ erro: 'Email é obrigatório' });
    }

    const result = await db.query(
      `INSERT INTO usuarios_confiaveis (email, motivo, criado_por)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET motivo = EXCLUDED.motivo
       RETURNING id, email, motivo, criado_por, criado_em`,
      [email, motivo, req.user.id]
    );

    res.json({ sucesso: true, usuario: result.rows[0] });
  } catch (err) {
    console.error('Erro ao adicionar usuário confiável:', err);
    res.status(500).json({ erro: 'Erro ao adicionar usuário confiável' });
  }
});

// Remove um usuário confiável
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'ID inválido' });
    }

    await db.query(`DELETE FROM usuarios_confiaveis WHERE id = $1`, [id]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao remover usuário confiável:', err);
    res.status(500).json({ erro: 'Erro ao remover usuário confiável' });
  }
});

module.exports = router;
