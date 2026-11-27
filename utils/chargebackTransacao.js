// Marca como chargeback a transação da venda contestada em transacoes_agency.
// Nunca chuta "a última compra do cliente": se não achar a venda certa, não
// altera nada e devolve null para o admin conferir.

// Tipo usado em transacoes_agency para cada origem de pagamento
function tipoDaTransacao(tabela, pagamento) {
  if (tabela === "premium_unlocks") return "midia";
  if (tabela === "pagamentos_pix") return pagamento.message_id ? "midia" : "assinatura";
  return ["vip", "assinatura"].includes(String(pagamento.tipo || "").toLowerCase())
    ? "assinatura"
    : "midia";
}

async function marcarChargebackNaTransacao(db, { tabela, pagamento, paymentIntentId }) {
  const { cliente_id, modelo_id } = pagamento;

  // 1) pelo identificador do pagamento na Stripe
  if (paymentIntentId) {
    const { rows } = await db.query(
      `SELECT id, status FROM transacoes_agency
        WHERE stripe_payment_intent_id = $1 AND cliente_id = $2 AND modelo_id = $3
        ORDER BY (status = 'pago') DESC, created_at DESC
        LIMIT 1`,
      [paymentIntentId, cliente_id, modelo_id]
    );
    if (rows.length) {
      if (rows[0].status !== "pago") return rows[0].id; // já tratada
      return marcar(db, rows[0].id);
    }
  }

  // 2) registros sem o identificador: mesma venda pelo tipo e hora do pagamento
  if (!pagamento.pago_em) return null;
  const { rows } = await db.query(
    `SELECT id FROM transacoes_agency
      WHERE cliente_id = $1 AND modelo_id = $2 AND tipo = $3 AND status = 'pago'
        AND stripe_payment_intent_id IS NULL
        AND created_at BETWEEN $4::timestamptz - INTERVAL '5 minutes'
                           AND $4::timestamptz + INTERVAL '5 minutes'
      ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $4::timestamptz)))
      LIMIT 1`,
    [cliente_id, modelo_id, tipoDaTransacao(tabela, pagamento), pagamento.pago_em]
  );
  return rows.length ? marcar(db, rows[0].id) : null;
}

async function marcar(db, id) {
  await db.query("UPDATE transacoes_agency SET status = 'chargeback' WHERE id = $1", [id]);
  return id;
}

module.exports = { marcarChargebackNaTransacao, tipoDaTransacao };
