const express = require('express');
const router = express.Router();
const db = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Busca dados de cartão (bandeira/final/validade) na Stripe a partir do charge id
async function buscarDadosCartaoStripe(stripeChargeId) {
  if (!stripeChargeId) return null;
  try {
    const charge = await stripe.charges.retrieve(stripeChargeId);
    const card = charge?.payment_method_details?.card;
    if (!card) return null;
    return {
      card_brand: card.brand || null,
      card_last4: card.last4 || null,
      card_exp_month: card.exp_month || null,
      card_exp_year: card.exp_year || null
    };
  } catch (err) {
    console.error('Erro ao buscar dados do cartão na Stripe:', err.message);
    return null;
  }
}

router.get('/:identificador', async (req, res) => {
  try {
    const identificador = String(req.params.identificador || '').trim();
    if (!identificador) {
      return res.status(400).json({ erro: 'Informe um email ou cliente_id' });
    }

    const ehNumero = /^\d+$/.test(identificador);

    const clienteRes = await db.query(
      `
      SELECT
        c.id AS cliente_id,
        c.nome,
        c.cpf,
        c.documento,
        c.tipo_documento,
        c.pais AS pais_cliente,
        c.ultimo_ip,
        c.risk_score,
        c.bloqueado,
        c.created_at AS cliente_criado_em,
        c.last_seen,
        c.origem_trafego,
        u.id AS user_id,
        u.email,
        u.created_at AS user_criado_em,
        u.updated_at AS ultimo_acesso,
        u.age_confirmed,
        u.age_confirmed_at,
        u.email_verificado,
        cd.nome_completo,
        cd.telefone,
        cd.data_nascimento,
        cd.endereco,
        cd.cidade,
        cd.estado,
        cd.pais AS pais_endereco
      FROM clientes c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
      WHERE ${ehNumero ? 'c.id = $1::int' : 'LOWER(u.email) = LOWER($1)'}
      LIMIT 1
      `,
      [identificador]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    const cliente = clienteRes.rows[0];
    const clienteId = cliente.cliente_id;

    const [
      aceiteTermosRes,
      pagamentosCartaoRes,
      pagamentosPixRes,
      vipRes,
      premiumRes,
      midiasChatRes,
      visitasRes,
      suporteRes,
      riscoRes,
      autoexclusaoRes
    ] = await Promise.all([
      db.query(
        `SELECT tipo, descricao, ip, user_agent, created_at
         FROM security_logs
         WHERE cliente_id = $1 AND tipo = 'aceite_termos'
         ORDER BY created_at DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT id, tipo, status, valor, currency, valor_brl, gateway, created_at, pago_em,
                stripe_payment_intent_id, stripe_charge_id, stripe_checkout_session_id,
                cpf, telefone, aceite_ip, aceitou_termos, aceitou_execucao_imediata,
                aceite_timestamp, versao_termos, fingerprint, nome_cartao, modelo_id,
                card_brand, card_last4, card_exp_month, card_exp_year
         FROM pagamentos_cartao
         WHERE cliente_id = $1
           AND status IN ('pago', 'chargeback')
         ORDER BY created_at DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT id, modelo_id, valor, currency, status, criado_em, pago_em, gateway,
                aceite_ip, aceitou_termos, aceitou_execucao_imediata, aceite_timestamp,
                versao_termos, fingerprint, cpf, telefone, user_agent,
                pagarme_order_id, gateway_order_id,
                CASE WHEN message_id IS NOT NULL THEN 'midia' ELSE 'assinatura' END AS tipo
         FROM pagamentos_pix
         WHERE cliente_id = $1
           AND status IN ('pago', 'chargeback')
         ORDER BY criado_em DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT vs.id, vs.modelo_id, m.nome AS modelo_nome, vs.ativo, vs.created_at,
                vs.expiration_at, vs.recorrente, vs.valor_assinatura, vs.valor_total,
                vs.gateway_subscription_id, vs.stripe_subscription_id,
                pgto.aceite_ip AS visualizacao_ip,
                pgto.pago_em AS visualizacao_em
         FROM vip_subscriptions vs
         JOIN modelos m ON m.id = vs.modelo_id
         LEFT JOIN LATERAL (
           SELECT aceite_ip, pago_em FROM (
             SELECT aceite_ip, pago_em FROM pagamentos_pix pp
             WHERE pp.cliente_id = vs.cliente_id AND pp.modelo_id = vs.modelo_id AND pp.status = 'pago'
             UNION ALL
             SELECT aceite_ip, pago_em FROM pagamentos_cartao pc
             WHERE pc.cliente_id = vs.cliente_id AND pc.modelo_id = vs.modelo_id AND pc.status = 'pago' AND pc.tipo = 'vip'
           ) uniao
           ORDER BY ABS(EXTRACT(EPOCH FROM (pago_em - vs.created_at)))
           LIMIT 1
         ) pgto ON true
         WHERE vs.cliente_id = $1
         ORDER BY vs.created_at DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT pu.id, pu.modelo_id, m.nome AS modelo_nome, pu.premium_post_id,
                pp.descricao AS post_descricao, pp.tipo_conteudo,
                pu.status, pu.valor_total, pu.currency, pu.gateway,
                pu.created_at, pu.pago_em,
                pu.stripe_charge_id, pu.card_brand, pu.card_last4, pu.card_exp_month, pu.card_exp_year,
                pu.pagarme_order_id, pu.cpf, pu.telefone,
                pu.aceite_ip, pu.aceitou_termos, pu.aceite_timestamp, pu.versao_termos,
                pu.aceite_ip AS visualizacao_ip,
                COALESCE(pu.pago_em, pu.aceite_timestamp) AS visualizacao_em
         FROM premium_unlocks pu
         JOIN modelos m ON m.id = pu.modelo_id
         LEFT JOIN premium_posts pp ON pp.id = pu.premium_post_id
         WHERE pu.cliente_id = $1
           AND pu.status IN ('pago', 'chargeback')
         ORDER BY pu.created_at DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT cp.id, cp.modelo_id, m.nome AS modelo_nome, cp.message_id, cp.status,
                cp.valor_total, cp.currency, cp.metodo_pagamento, cp.criado_em, cp.pago_em,
                (
                  SELECT json_agg(json_build_object('tipo_conteudo', co.tipo_conteudo, 'descricao', co.descricao))
                  FROM messages_conteudos mc
                  JOIN conteudos co ON co.id = mc.conteudo_id
                  WHERE mc.message_id = cp.message_id
                ) AS conteudos,
                COALESCE(ppx.aceite_ip, pcx.aceite_ip) AS visualizacao_ip,
                COALESCE(cp.pago_em, ppx.pago_em, pcx.pago_em) AS visualizacao_em
         FROM conteudo_pacotes cp
         JOIN modelos m ON m.id = cp.modelo_id
         LEFT JOIN LATERAL (
           SELECT aceite_ip, pago_em FROM pagamentos_pix pp
           WHERE pp.cliente_id = cp.cliente_id AND pp.message_id = cp.message_id AND pp.status = 'pago'
           ORDER BY pp.pago_em DESC LIMIT 1
         ) ppx ON true
         LEFT JOIN LATERAL (
           SELECT aceite_ip, pago_em FROM pagamentos_cartao pc
           WHERE pc.cliente_id = cp.cliente_id AND pc.status = 'pago'
             AND pc.conteudo_id IN (SELECT mc.conteudo_id FROM messages_conteudos mc WHERE mc.message_id = cp.message_id)
           ORDER BY pc.pago_em DESC LIMIT 1
         ) pcx ON true
         WHERE cp.cliente_id = $1
           AND cp.status IN ('pago', 'chargeback')
         ORDER BY cp.criado_em DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT mv.modelo_id, m.nome AS modelo_nome, COUNT(*) AS total_visitas,
                MIN(mv.criado_em) AS primeira_visita, MAX(mv.criado_em) AS ultima_visita
         FROM modelo_visitas mv
         JOIN modelos m ON m.id = mv.modelo_id
         WHERE mv.cliente_id = $1
         GROUP BY mv.modelo_id, m.nome
         ORDER BY ultima_visita DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT sc.id AS conversa_id, sc.status, sc.created_at AS conversa_criada_em,
                COALESCE(
                  (
                    SELECT json_agg(json_build_object('remetente', sm.remetente, 'texto', sm.texto, 'criado_em', sm.criado_em) ORDER BY sm.criado_em)
                    FROM suporte_mensagens sm
                    WHERE sm.conversa_id = sc.id
                  ), '[]'
                ) AS mensagens
         FROM suporte_conversas sc
         WHERE sc.cliente_id = $1
         ORDER BY sc.created_at DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT cpf, ip, fingerprint, nivel, motivo, ativo, bloqueio_ip, bloqueio_cpf,
                bloqueio_fingerprint, criado_em, expira_em
         FROM cliente_risco
         WHERE cliente_id = $1
         ORDER BY criado_em DESC`,
        [clienteId]
      ),
      db.query(
        `SELECT motivo, solicitado_em, ip, user_agent, origem, detalhes
         FROM conta_exclusoes_log
         WHERE cliente_id = $1
         ORDER BY solicitado_em DESC`,
        [clienteId]
      )
    ]);

    // Completa dados de cartão via Stripe quando ainda não cacheados localmente
    const pagamentosCartao = pagamentosCartaoRes.rows;
    await Promise.all(
      pagamentosCartao.map(async (p) => {
        if (!p.card_last4 && p.stripe_charge_id) {
          const dados = await buscarDadosCartaoStripe(p.stripe_charge_id);
          if (dados) Object.assign(p, dados);
        }
      })
    );

    const premiumUnlocks = premiumRes.rows;
    await Promise.all(
      premiumUnlocks.map(async (p) => {
        if (!p.card_last4 && p.stripe_charge_id) {
          const dados = await buscarDadosCartaoStripe(p.stripe_charge_id);
          if (dados) Object.assign(p, dados);
        }
      })
    );

    // Fallback: se CPF/telefone não estiverem em clientes/clientes_dados, buscar nos pagamentos
    if (!cliente.cpf && !cliente.documento) {
      const cpfPagto =
        pagamentosCartao.find(p => p.cpf)?.cpf ||
        pagamentosPixRes.rows.find(p => p.cpf)?.cpf ||
        premiumUnlocks.find(p => p.cpf)?.cpf ||
        null;
      if (cpfPagto) cliente.cpf = cpfPagto;
    }

    if (!cliente.telefone) {
      const telefonePagto =
        pagamentosCartao.find(p => p.telefone)?.telefone ||
        pagamentosPixRes.rows.find(p => p.telefone)?.telefone ||
        premiumUnlocks.find(p => p.telefone)?.telefone ||
        null;
      if (telefonePagto) cliente.telefone = telefonePagto;
    }

    // Fallback: se IP não estiver em clientes, buscar o IP de aceite mais recente nos pagamentos
    if (!cliente.ultimo_ip) {
      const ipPagto =
        pagamentosCartao.find(p => p.aceite_ip)?.aceite_ip ||
        pagamentosPixRes.rows.find(p => p.aceite_ip)?.aceite_ip ||
        premiumUnlocks.find(p => p.aceite_ip)?.aceite_ip ||
        null;
      if (ipPagto) cliente.ultimo_ip = ipPagto;
    }

    res.json({
      cliente,
      aceite_termos: aceiteTermosRes.rows,
      pagamentos_cartao: pagamentosCartao,
      pagamentos_pix: pagamentosPixRes.rows,
      vip_subscriptions: vipRes.rows,
      premium_unlocks: premiumUnlocks,
      midias_chat: midiasChatRes.rows,
      visitas_perfil: visitasRes.rows,
      suporte: suporteRes.rows,
      risco: riscoRes.rows,
      autoexclusao: autoexclusaoRes.rows
    });
  } catch (err) {
    console.error('Erro ao gerar relatório de contestação:', err);
    res.status(500).json({ erro: 'Erro ao gerar relatório' });
  }
});

module.exports = router;
