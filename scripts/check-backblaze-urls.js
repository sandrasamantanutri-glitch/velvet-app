require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function main() {
  const { rows } = await db.query(`
    SELECT id, url, thumbnail_url
    FROM conteudos
    WHERE tipo = 'imagem'
      AND url IS NOT NULL
      AND (thumbnail_url IS NULL OR thumbnail_url = url)
    ORDER BY id ASC
    LIMIT 5
  `);

  for (const r of rows) {
    console.log(`ID ${r.id}: ${r.url}`);
  }
  await db.end();
}

main().catch(console.error);
