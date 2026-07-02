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
const AWS = require("aws-sdk");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_IMAGES_TOKEN = process.env.CF_IMAGES_TOKEN;
const CF_ACCOUNT_HASH = process.env.CF_ACCOUNT_HASH;

// R2 client (mesmo do servidor — bucket velvet-media migrou do Backblaze para cá)
const r2 = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
  signatureVersion: "v4",
  s3ForcePathStyle: true,
});

async function downloadImage(url) {
  // URLs do Backblaze antigo: baixa via R2 pelo mesmo key
  if (url.includes("backblazeb2.com")) {
    // ex: https://s3.us-east-005.backblazeb2.com/velvet-media/velvet/modelos/42/file.png
    const parts = url.split("backblazeb2.com/");
    const rest = parts[1]; // "velvet-media/velvet/modelos/42/file.png"
    const slashIdx = rest.indexOf("/");
    const bucket = rest.substring(0, slashIdx);   // "velvet-media"
    const key = rest.substring(slashIdx + 1);     // "velvet/modelos/42/file.png"

    const obj = await r2.getObject({ Bucket: bucket, Key: key }).promise();
    return obj.Body;
  }

  // URLs do CF Images: baixa diretamente
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  return Buffer.from(res.data);
}

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

      const originalBuffer = Buffer.from(await downloadImage(row.url));

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
