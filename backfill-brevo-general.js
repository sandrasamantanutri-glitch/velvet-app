require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { adicionarContatoLista } = require("./brevo");

const GENERAL_LIST_ID = 4; // "Novidades Plataforma" na pasta "Velvet"
const CONCURRENCIA = 8;

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
      WHERE c.ativo = true
        AND c.pref_novidades_plataforma = true
        AND u.email IS NOT NULL
    `);

    const validos = rows.filter(r => EMAIL_REGEX.test(r.email.trim()));
    console.log(`[backfill-brevo-general] ${rows.length} cliente(s) encontrados, ${validos.length} com email válido.`);

    let ok = 0, falhas = 0;

    for (let i = 0; i < validos.length; i += CONCURRENCIA) {
      const lote = validos.slice(i, i + CONCURRENCIA);
      const resultados = await Promise.allSettled(
        lote.map(r => adicionarContatoLista(GENERAL_LIST_ID, r.email, r.nome, "novidades_plataforma"))
      );
      resultados.forEach((r, idx) => {
        const email = lote[idx].email;
        if (r.status === "fulfilled") {
          ok++;
          console.log(`  ✓ ${email}`);
        } else {
          falhas++;
          console.warn(`  ✗ ${email}: ${r.reason?.message}`);
        }
      });
    }

    console.log(`[backfill-brevo-general] Concluído. OK=${ok} Falhas=${falhas}`);
    process.exit(0);
  } catch (err) {
    console.error("[backfill-brevo-general] Erro fatal:", err);
    process.exit(1);
  } finally {
    pool.end();
  }
})();
