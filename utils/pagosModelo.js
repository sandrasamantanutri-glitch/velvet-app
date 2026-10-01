// Subconsulta escalar: total já pago à modelo via fechamento de mês (modelo_pagamentos).
// A partir de set/2026 o fechamento registra o ganho cheio do mês; se a modelo já recebeu parte/tudo
// por saque (modelo ou contabilidade) naquele mês, esse valor é abatido aqui para não descontar duas vezes
// do saldo (saldo = ganhos liberados − pagos − saques).
function pagosEfetivosSql(param) {
  return `(
    SELECT COALESCE(SUM(
      p.total_geral - CASE WHEN p.mes >= DATE '2026-09-01' THEN LEAST(p.total_geral, COALESCE((
        SELECT SUM(sa.valor + COALESCE(sa.taxa_saque, 0)) FROM saques sa
        WHERE sa.modelo_id = p.modelo_id AND sa.status = 'pago'
          AND COALESCE(TO_CHAR(sa.mes_referencia, 'YYYY-MM'), TO_CHAR(sa.processado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')) = TO_CHAR(p.mes, 'YYYY-MM')
      ), 0)) ELSE 0 END
    ), 0)
    FROM modelo_pagamentos p WHERE p.modelo_id = ${param} AND p.status = 'pago'
  )`;
}
module.exports = { pagosEfetivosSql };
