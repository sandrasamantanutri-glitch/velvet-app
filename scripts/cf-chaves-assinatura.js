/**
 * Passo 1 — obtém as chaves de assinatura do Cloudflare e imprime as variáveis
 * de ambiente que o servidor precisa.
 *
 *   node scripts/cf-chaves-assinatura.js
 *
 * - Stream: CRIA uma signing key nova (POST /stream/keys). A chave privada só
 *   é devolvida nesta chamada — guarde a saída. Rodar de novo cria outra chave.
 * - Images: LÊ a chave de assinatura já existente da conta (GET /images/v1/keys).
 *
 * Não altera nenhuma mídia. Requer no .env: CF_ACCOUNT_ID, CF_STREAM_TOKEN,
 * CF_IMAGES_TOKEN.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
require("dotenv").config();

const CONTA = process.env.CF_ACCOUNT_ID;
const BASE = `https://api.cloudflare.com/client/v4/accounts/${CONTA}`;

async function chamar(url, method, token) {
  const resp = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok || !corpo?.success) {
    throw new Error(`${method} ${url} → ${resp.status} ${JSON.stringify(corpo?.errors || corpo)}`);
  }
  return corpo.result;
}

async function main() {
  if (!CONTA || !process.env.CF_STREAM_TOKEN || !process.env.CF_IMAGES_TOKEN) {
    console.error("Faltam CF_ACCOUNT_ID, CF_STREAM_TOKEN ou CF_IMAGES_TOKEN no ambiente.");
    process.exit(1);
  }

  const linhas = [];

  try {
    const chave = await chamar(`${BASE}/stream/keys`, "POST", process.env.CF_STREAM_TOKEN);
    linhas.push(`CF_STREAM_SIGNING_KEY_ID=${chave.id}`);
    linhas.push(`CF_STREAM_SIGNING_PEM=${chave.pem}`);
  } catch (err) {
    console.error("❌ Stream: não consegui criar a signing key.\n  ", err.message);
    console.error("   O token CF_STREAM_TOKEN precisa da permissão Stream:Edit.");
  }

  try {
    const r = await chamar(`${BASE}/images/v1/keys`, "GET", process.env.CF_IMAGES_TOKEN);
    const chave = (r.keys || [])[0];
    if (!chave?.value) throw new Error("nenhuma chave devolvida pela API");
    linhas.push(`CF_IMAGES_SIGNING_KEY=${chave.value}`);
  } catch (err) {
    console.error("❌ Images: não consegui ler a chave de assinatura.\n  ", err.message);
    console.error("   Alternativa: painel Cloudflare → Images → Keys → copie a chave.");
  }

  if (!linhas.length) process.exit(1);

  console.log("\nAdicione ao .env local e às variáveis do servidor (Railway/Render):\n");
  console.log(linhas.join("\n"));
  console.log("\n# opcional");
  console.log("CF_SIGN_TTL_HOURS=12");
  console.log("\n⚠️  São segredos: não commite nem compartilhe esta saída.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
