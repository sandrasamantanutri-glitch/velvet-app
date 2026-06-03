async function registrarLog(db, { tipo, cliente_id, modelo_id = null, descricao = '', ip = null, user_agent = null }) {
  try {
    await db.query(
      `INSERT INTO security_logs (tipo, cliente_id, modelo_id, descricao, ip, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        tipo,
        cliente_id  || null,
        modelo_id   || null,
        descricao   || '',
        ip          || null,
        user_agent  || null
      ]
    );
  } catch (err) {
    console.error('❌ Erro ao registrar security_log:', err.message);
  }
}

module.exports = { registrarLog };
