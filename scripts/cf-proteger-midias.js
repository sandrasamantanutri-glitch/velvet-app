/**
 * Passo 3 — marca as mídias já existentes no Cloudflare como "só com URL assinada".
 *
 *   node scripts/cf-proteger-midias.js              simulação: só lista e testa a assinatura
 *   node scripts/cf-proteger-midias.js --aplicar    liga requireSignedURLs em tudo
 *   node scripts/cf-proteger-midias.js --reverter   desliga (volta ao estado atual)
 *   ... --limite 20                                 processa só os 20 primeiros (teste)
 *
 * Só rode --aplicar DEPOIS de:
 *   1. as chaves CF_STREAM_SIGNING_* / CF_IMAGES_SIGNING_KEY estarem no servidor;
 *   2. o servidor em produção já estar entregando URLs assinadas.
 * Senão as mídias param de abrir para todo mundo. (--reverter desfaz.)
 *
 * O que é protegido: conteudos.url e premium_post_midias.url.
 * O que NÃO é tocado: previews borrados (thumbnail_url que é um arquivo à parte),
 * avatares, capas e qualquer arquivo fora do Cloudflare Stream/Images.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();

const db = require("../db");
const cfMedia = require("../utils/cfMedia");

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const REVERTER = args.includes("--reverter");
const idxLimite = args.indexOf("--limite");
const LIMITE = idxLimite >= 0 ? Number(args[idxLimite + 1]) : 0;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// URL que dá para testar com um GET simples (imagem, ou thumbnail do vídeo)
function urlTestavel(url) {
  const p = cfMedia.parse(url);
  if (!p) return null;
  if (p.kind === "image") return url;
  return `https://videodelivery.net/${p.uid}/thumbnails/thumbnail.jpg`;
}

async function statusHttp(url) {
  try {
    const resp = await fetch(url, { method: "GET", redirect: "follow" });
    return resp.status;
  } catch (err) {
    return `erro: ${err.message}`;
  }
}

async function coletar() {
  const mapa = new Map(); // "kind:id" → url canônica

  const fontes = [
    { nome: "conteudos", sql: "SELECT url FROM conteudos WHERE url IS NOT NULL" },
    { nome: "premium_post_midias", sql: "SELECT url FROM premium_post_midias WHERE url IS NOT NULL" }
  ];

  let foraDoCloudflare = 0;

  for (const fonte of fontes) {
    const { rows } = await db.query(fonte.sql);
    let cf = 0;
    for (const { url } of rows) {
      const p = cfMedia.parse(cfMedia.unsignUrl(url));
      if (!p) {
        foraDoCloudflare++;
        continue;
      }
      cf++;
      const chave = `${p.kind}:${p.kind === "stream" ? p.uid : p.id}`;
      if (!mapa.has(chave)) mapa.set(chave, cfMedia.unsignUrl(url));
    }
    console.log(`  ${fonte.nome}: ${rows.length} linhas, ${cf} no Cloudflare`);
  }

  if (foraDoCloudflare) {
    console.log(`  (${foraDoCloudflare} URLs fora do Cloudflare Stream/Images — não são alteradas)`);
  }

  return [...mapa.entries()].map(([chave, url]) => ({ chave, url, kind: chave.split(":")[0] }));
}

// Confere que a assinatura gerada por este ambiente é aceita pelo Cloudflare.
async function testarAssinatura(itens) {
  const st = cfMedia.status();
  let ok = true;

  for (const kind of ["stream", "image"]) {
    const amostra = itens.find((i) => i.kind === kind);
    if (!amostra) continue;

    const nome = kind === "stream" ? "Stream (vídeos)" : "Images (fotos)";
    const temChave = kind === "stream" ? st.stream : st.images;

    if (!temChave) {
      console.log(`  ❌ ${nome}: chave de assinatura NÃO configurada neste ambiente`);
      ok = false;
      continue;
    }

    const alvo = urlTestavel(amostra.url);
    const assinada = cfMedia.signUrl(alvo);
    const [semToken, comToken] = [await statusHttp(alvo), await statusHttp(assinada)];

    console.log(`  ${comToken === 200 ? "✅" : "❌"} ${nome}: com token → ${comToken} | sem token → ${semToken}`);
    if (comToken !== 200) ok = false;
  }

  return ok;
}

async function alterarComRetry(url, ligar) {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const r = await cfMedia.definirProtecao(url, ligar);
    if (r.ok) return r;
    if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
      await dormir(2000 * tentativa);
      continue;
    }
    return r;
  }
  return { ok: false, motivo: "muitas tentativas (429/5xx)" };
}

async function main() {
  if (APLICAR && REVERTER) {
    console.error("Use --aplicar OU --reverter, não os dois.");
    process.exit(1);
  }

  const modo = APLICAR ? "APLICAR (ligar proteção)" : REVERTER ? "REVERTER (desligar proteção)" : "SIMULAÇÃO (nada é alterado)";
  console.log(`\nModo: ${modo}\n`);

  console.log("Coletando mídias do banco...");
  let itens = await coletar();
  const videos = itens.filter((i) => i.kind === "stream").length;
  console.log(`\nTotal único: ${itens.length} (${videos} vídeos, ${itens.length - videos} imagens)`);

  if (LIMITE > 0) {
    itens = itens.slice(0, LIMITE);
    console.log(`--limite: processando só ${itens.length}`);
  }

  console.log("\nTestando a assinatura contra o Cloudflare...");
  const assinaturaOk = await testarAssinatura(itens);

  if (!APLICAR && !REVERTER) {
    console.log(
      assinaturaOk
        ? "\n✅ Assinatura funcionando. Quando o servidor em produção estiver com as mesmas chaves, rode com --aplicar."
        : "\n❌ Assinatura NÃO está funcionando — não rode --aplicar ainda."
    );
    return;
  }

  if (APLICAR && !assinaturaOk) {
    console.error("\n❌ Abortado: a assinatura não foi aceita pelo Cloudflare. Nada foi alterado.");
    process.exitCode = 1;
    return;
  }

  const ligar = APLICAR;
  let feitos = 0;
  const falhas = [];
  const verificados = new Set();

  for (const item of itens) {
    const r = await alterarComRetry(item.url, ligar);

    if (!r.ok) {
      falhas.push({ chave: item.chave, motivo: r.motivo });
    } else {
      feitos++;

      // No primeiro item de cada tipo, confirma na prática antes de seguir.
      if (ligar && !verificados.has(item.kind)) {
        verificados.add(item.kind);
        await dormir(3000);
        const alvo = urlTestavel(item.url);
        const comToken = await statusHttp(cfMedia.signUrl(alvo));
        const semToken = await statusHttp(alvo);
        console.log(`  verificação ${item.kind}: com token → ${comToken} | sem token → ${semToken}`);

        if (comToken !== 200) {
          console.error("  ❌ A URL assinada parou de abrir. Revertendo este item e abortando.");
          await alterarComRetry(item.url, false);
          process.exitCode = 1;
          break;
        }
        if (semToken === 200) {
          console.warn(
            "  ⚠️  A URL sem token ainda abre (pode ser cache do Cloudflare por alguns minutos;" +
              " em imagens, confira se a variante 'public' não está marcada como 'Always allow public access')."
          );
        }
      }
    }

    if ((feitos + falhas.length) % 50 === 0) {
      console.log(`  ${feitos + falhas.length}/${itens.length}...`);
    }
    await dormir(300); // respeita o limite da API do Cloudflare
  }

  console.log(`\nConcluído: ${feitos} ${ligar ? "protegidos" : "revertidos"}, ${falhas.length} falhas.`);
  if (falhas.length) {
    console.log("Falhas (as 20 primeiras):");
    for (const f of falhas.slice(0, 20)) console.log(`  ${f.chave} → ${f.motivo}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.end().catch(() => {}));
