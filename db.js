const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true
});

// Garante que todas as conexões usam o schema public (necessário com o pooler do Supabase)
pool.on("connect", (client) => {
  client.query("SET search_path = public").catch((err) => {
    console.error("❌ Erro ao definir search_path:", err.message);
  });
});

pool.on("error", (err) => {
  console.error("❌ Erro inesperado no pool PostgreSQL:", err);
});

module.exports = pool;