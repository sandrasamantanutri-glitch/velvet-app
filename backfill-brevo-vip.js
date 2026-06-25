require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { obterOuCriarListaVIP, adicionarContatoLista } = require("./brevo");

const FOLDER_ID = 3; // pasta "Velvet"
const CONCURRENCIA = 8;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        AND c.ativo = true
        AND c.pref_novidades_criadoras = true
        AND u.email IS NOT NULL
      ORDER BY v.modelo_id
    `);

    const validos = rows.filter(r => EMAIL_REGEX.test(r.email.trim()));
    console.log(`[backfill-brevo-vip] ${rows.length} vínculo(s) VIP encontrados, ${validos.length} com email válido.`);

    const listaCache = new Map();
    let ok = 0, falhas = 0;

    for (let i = 0; i < validos.length; i += CONCURRENCIA) {
      const lote = validos.slice(i, i + CONCURRENCIA);
      const resultados = await Promise.allSettled(
        lote.map(async r => {
          let listPromise = listaCache.get(r.modelo_id);
          if (!listPromise) {
            listPromise = obterOuCriarListaVIP(pool, FOLDER_ID, r.modelo_id, r.modelo_nome);
            listaCache.set(r.modelo_id, listPromise);
          }
          const listId = await listPromise;
          await adicionarContatoLista(listId, r.email, r.nome);
          return { email: r.email, modelo: r.modelo_nome };
        })
      );
      resultados.forEach((r, idx) => {
        const email = lote[idx].email;
        const modelo = lote[idx].modelo_nome;
        if (r.status === "fulfilled") {
          ok++;
          console.log(`  ✓ ${email} → ${modelo}`);
        } else {
          falhas++;
          console.warn(`  ✗ ${email} → ${modelo}: ${r.reason?.message}`);
        }
      });
    }

    console.log(`[backfill-brevo-vip] Concluído. OK=${ok} Falhas=${falhas}`);
    process.exit(0);
  } catch (err) {
    console.error("[backfill-brevo-vip] Erro fatal:", err);
    process.exit(1);
  } finally {
    pool.end();
  }
})();
