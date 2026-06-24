const express = require('express');
const router = express.Router();
const db = require('../db');

// Lista modelos com restrição de PIX configurada (sem registro = PIX liberado por padrão)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.modelo_id, m.nome, m.nome_exibicao,
              c.pix_vip, c.pix_chat, c.pix_premium, c.atualizado_em
       FROM modelos_pix_config c
       JOIN modelos m ON m.id = c.modelo_id
       ORDER BY c.atualizado_em DESC`
    );
    res.json({ configs: result.rows });
  } catch (err) {
    console.error('Erro ao listar configs de PIX por modelo:', err);
    res.status(500).json({ erro: 'Erro ao listar configurações de PIX' });
  }
});

// Busca uma modelo pelo ID (para exibir nome antes de salvar a restrição)
router.get('/buscar-modelo/:modelo_id', async (req, res) => {
  try {
    const modelo_id = Number(req.params.modelo_id);
    if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
      return res.status(400).json({ erro: 'modelo_id inválido' });
    }

    const modeloRes = await db.query(
      `SELECT id, nome, nome_exibicao FROM modelos WHERE id = $1 LIMIT 1`,
      [modelo_id]
    );
    if (!modeloRes.rowCount) {
      return res.status(404).json({ erro: 'Modelo não encontrada' });
    }

    const configRes = await db.query(
      `SELECT pix_vip, pix_chat, pix_premium FROM modelos_pix_config WHERE modelo_id = $1 LIMIT 1`,
      [modelo_id]
    );

    res.json({
      modelo: modeloRes.rows[0],
      config: configRes.rows[0] || { pix_vip: true, pix_chat: true, pix_premium: true }
    });
  } catch (err) {
    console.error('Erro ao buscar modelo para config de PIX:', err);
    res.status(500).json({ erro: 'Erro ao buscar modelo' });
  }
});

// Cria/atualiza a restrição de PIX de uma modelo
router.put('/:modelo_id', async (req, res) => {
  try {
    const modelo_id = Number(req.params.modelo_id);
    if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
      return res.status(400).json({ erro: 'modelo_id inválido' });
    }

    const pix_vip = req.body?.pix_vip !== false;
    const pix_chat = req.body?.pix_chat !== false;
    const pix_premium = req.body?.pix_premium !== false;

    const modeloRes = await db.query(`SELECT id FROM modelos WHERE id = $1 LIMIT 1`, [modelo_id]);
    if (!modeloRes.rowCount) {
      return res.status(404).json({ erro: 'Modelo não encontrada' });
    }

    const result = await db.query(
      `INSERT INTO modelos_pix_config (modelo_id, pix_vip, pix_chat, pix_premium, atualizado_por, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (modelo_id) DO UPDATE SET
         pix_vip = EXCLUDED.pix_vip,
         pix_chat = EXCLUDED.pix_chat,
         pix_premium = EXCLUDED.pix_premium,
         atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em = NOW()
       RETURNING modelo_id, pix_vip, pix_chat, pix_premium, atualizado_em`,
      [modelo_id, pix_vip, pix_chat, pix_premium, req.user.id]
    );

    res.json({ sucesso: true, config: result.rows[0] });
  } catch (err) {
    console.error('Erro ao salvar config de PIX por modelo:', err);
    res.status(500).json({ erro: 'Erro ao salvar configuração de PIX' });
  }
});

// Remove a restrição (volta ao padrão: PIX liberado nos 3 tipos)
router.delete('/:modelo_id', async (req, res) => {
  try {
    const modelo_id = Number(req.params.modelo_id);
    if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
      return res.status(400).json({ erro: 'modelo_id inválido' });
    }

    await db.query(`DELETE FROM modelos_pix_config WHERE modelo_id = $1`, [modelo_id]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao remover config de PIX por modelo:', err);
    res.status(500).json({ erro: 'Erro ao remover configuração de PIX' });
  }
});

module.exports = router;
