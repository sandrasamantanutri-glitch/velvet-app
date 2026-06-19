async function criarNotificacaoAdmin(db, io, { tipo, referencia_id = null, titulo, mensagem = null }) {
  try {
    const { rows } = await db.query(
      `INSERT INTO admin_notificacoes (tipo, referencia_id, titulo, mensagem)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tipo, referencia_id, titulo, mensagem]
    );

    const notif = rows[0];

    if (io) {
      io.to("admin_notificacoes").emit("admin:notificacao", notif);
    }

    return notif;
  } catch (err) {
    console.error("❌ Erro ao criar notificação admin:", err.message);
    return null;
  }
}

module.exports = { criarNotificacaoAdmin };
