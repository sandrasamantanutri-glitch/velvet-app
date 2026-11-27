// Chargeback de PIX avisado pelo iPag: marca o pagamento já pago como
// "chargeback". Não mexe em transacoes_agency: o desconto é lançado pelo admin.
//
// Devolve null se não há pagamento pago nem contestado com esse id; senão
// { novo, tabela, id, cliente_id, valor }. "novo" é false em aviso repetido.
async function registrarChargebackIpag(db, orderId) {
  const premium = await db.query(
    `UPDATE premium_unlocks
        SET status = 'chargeback', updated_at = NOW()
      WHERE pagarme_order_id = $1 AND gateway = 'ipag' AND status = 'pago'
    RETURNING id, cliente_id, valor_total AS valor`,
    [orderId]
  );
  if (premium.rows.length) {
    return { novo: true, tabela: "premium_unlocks", ...premium.rows[0] };
  }

  const pix = await db.query(
    `UPDATE pagamentos_pix
        SET status = 'chargeback'
      WHERE pagarme_order_id = $1 AND gateway = 'ipag' AND status = 'pago'
    RETURNING id, cliente_id, valor`,
    [orderId]
  );
  if (pix.rows.length) {
    return { novo: true, tabela: "pagamentos_pix", ...pix.rows[0] };
  }

  const repetido = await db.query(
    `SELECT 1 FROM premium_unlocks
      WHERE pagarme_order_id = $1 AND gateway = 'ipag' AND status IN ('chargeback', 'estornado')
     UNION ALL
     SELECT 1 FROM pagamentos_pix
      WHERE pagarme_order_id = $1 AND gateway = 'ipag' AND status IN ('chargeback', 'estornado')`,
    [orderId]
  );
  return repetido.rows.length ? { novo: false } : null;
}

module.exports = { registrarChargebackIpag };
