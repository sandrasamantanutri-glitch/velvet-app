/**
 * Backfill thumbnails para conteúdos existentes.
 *
 * Para cada imagem onde thumbnail_url = url (ou é null),
 * baixa a imagem original, redimensiona para 40x40 com sharp,
 * faz upload para Cloudflare Images e atualiza o banco.
 *
 * Uso: node scripts/backfill-thumbnails.js
 *
 * Variáveis de ambiente necessárias (mesmo .env do servidor):
 *   DATABASE_URL, CF_ACCOUNT_ID, CF_IMAGES_TOKEN, CF_ACCOUNT_HASH
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const { Pool } = require("pg");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_IMAGES_TOKEN = process.env.CF_IMAGES_TOKEN;
const CF_ACCOUNT_HASH = process.env.CF_ACCOUNT_HASH;

async function uploadThumbToCF(buffer, filename) {
  const form = new FormData();
  form.append("file", buffer, filename);

  const res = await axios.post(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
    form,
    {
      headers: {
        Authorization: `Bearer ${CF_IMAGES_TOKEN}`,
        ...form.getHeaders(),
      },
    }
  );

  if (!res.data || !res.data.success) {
    throw new Error("Upload CF Images falhou: " + JSON.stringify(res.data));
  }

  const id = res.data.result.id;
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/public`;
}

async function main() {
  // Busca imagens onde thumbnail_url é igual à url (sem thumbnail real) ou null
  const { rows } = await db.query(`
    SELECT id, url, thumbnail_url
    FROM conteudos
    WHERE tipo = 'imagem'
      AND url IS NOT NULL
      AND (thumbnail_url IS NULL OR thumbnail_url = url)
    ORDER BY id ASC
  `);

  console.log(`Total de imagens para processar: ${rows.length}`);

  let ok = 0;
  let erros = 0;

  for (const row of rows) {
    try {
      process.stdout.write(`[${row.id}] Baixando imagem... `);

      // Baixa imagem original do CF Images
      const imgRes = await axios.get(row.url, { responseType: "arraybuffer", timeout: 20000 });
      const originalBuffer = Buffer.from(imgRes.data);

      // Redimensiona para 40x40
      const thumbBuffer = await sharp(originalBuffer)
        .resize(40, 40, { fit: "cover" })
        .jpeg({ quality: 60 })
        .toBuffer();

      // Upload thumbnail para CF Images
      const thumbUrl = await uploadThumbToCF(thumbBuffer, `thumb_${row.id}.jpg`);

      // Atualiza banco
      await db.query(
        `UPDATE conteudos SET thumbnail_url = $1 WHERE id = $2`,
        [thumbUrl, row.id]
      );

      console.log(`OK -> ${thumbUrl}`);
      ok++;

      // Pausa leve para não sobrecarregar a API
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`ERRO: ${err.message}`);
      erros++;
    }
  }

  console.log(`\nConcluído: ${ok} atualizados, ${erros} com erro.`);
  await db.end();
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
