const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const result = await pool.query(`
      UPDATE vip_subscriptions
      SET ativo = false
      WHERE ativo = true
        AND created_at + INTERVAL '30 days' < NOW()
    `);

    console.log("VIPs expirados:", result.rowCount);
    process.exit(0);
  } catch (err) {
    console.error("Erro:", err);
    process.exit(1);
  }
})();