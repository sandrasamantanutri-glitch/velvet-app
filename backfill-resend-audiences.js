require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { obterOuCriarAudienceVIP, adicionarContatoAudienceVIP } = require("./email");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT v.modelo_id, m.nome_exibicao AS modelo_nome,
             u.email, COALESCE(cd.nome_completo, c.nome, '') AS nome
      FROM vip_subscriptions v
      JOIN clientes c ON c.id = v.cliente_id
      JOIN users u ON u.id = c.user_id
      JOIN modelos m ON m.id = v.modelo_id
      LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
      WHERE v.ativo = true
        AND v.expiration_at > NOW()
        AND u.email IS NOT NULL
      ORDER BY v.modelo_id
    `);

    if (rows.length === 0) {
      console.log("[backfill-resend-audiences] Nenhuma assinatura VIP ativa encontrada.");
      process.exit(0);
    }

    console.log(`[backfill-resend-audiences] ${rows.length} contato(s) VIP ativo(s) a sincronizar.`);

    const audienceCache = new Map();
    let ok = 0, falhas = 0;

    for (const r of rows) {
      try {
        let audId = audienceCache.get(r.modelo_id);
        if (!audId) {
          audId = await obterOuCriarAudienceVIP(pool, r.modelo_id, r.modelo_nome);
          audienceCache.set(r.modelo_id, audId);
        }
        await adicionarContatoAudienceVIP(audId, r.email, r.nome);
        ok++;
        console.log(`  ✓ ${r.email} → ${r.modelo_nome} (${audId})`);
      } catch (e) {
        falhas++;
        console.warn(`  ✗ ${r.email} → modelo ${r.modelo_id}: ${e.message}`);
      }
    }

    console.log(`[backfill-resend-audiences] Concluído. OK=${ok} Falhas=${falhas}`);
    process.exit(0);
  } catch (err) {
    console.error("[backfill-resend-audiences] Erro fatal:", err);
    process.exit(1);
  }
})();
