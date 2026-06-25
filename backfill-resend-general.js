require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
const GENERAL_AUDIENCE_ID = "f8074389-90f3-4f97-84a0-a7c0a491b2e3";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

(async () => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT u.email, COALESCE(cd.nome_completo, c.nome, '') AS nome
      FROM clientes c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
      WHERE u.email IS NOT NULL
      ORDER BY u.email
    `);

    const validos = rows.filter(r => EMAIL_REGEX.test(r.email.trim()));
    const invalidos = rows.length - validos.length;

    console.log(`[backfill-resend-general] ${rows.length} cliente(s) encontrados, ${validos.length} com email válido (${invalidos} ignorado(s) por email inválido).`);

    let ok = 0, falhas = 0;

    for (const r of validos) {
      try {
        const partes = (r.nome || "").trim().split(/\s+/);
        const { error } = await resend.contacts.create({
          audienceId: GENERAL_AUDIENCE_ID,
          email: r.email.trim(),
          firstName: partes[0] || "",
          lastName: partes.slice(1).join(" ") || undefined,
          unsubscribed: false
        });
        if (error) throw new Error(JSON.stringify(error));
        ok++;
        console.log(`  ✓ ${r.email}`);
      } catch (e) {
        falhas++;
        console.warn(`  ✗ ${r.email}: ${e.message}`);
      }
    }

    console.log(`[backfill-resend-general] Concluído. OK=${ok} Falhas=${falhas}`);
    process.exit(0);
  } catch (err) {
    console.error("[backfill-resend-general] Erro fatal:", err);
    process.exit(1);
  }
})();
