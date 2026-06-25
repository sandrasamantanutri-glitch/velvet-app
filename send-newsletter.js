/**
 * Envia a newsletter de novidades da plataforma via Brevo, para a lista
 * "Novidades Plataforma" (id 4, pasta "Velvet").
 *
 * Uso:
 *   node send-newsletter.js "Assunto do email" caminho/para/conteudo.html
 *   node send-newsletter.js "Assunto do email" caminho/para/conteudo.html --dry-run
 *
 * --dry-run apenas mostra quantos destinatários a lista tem, sem enviar nada.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const { request, enviarCampanha } = require("./brevo");

const GENERAL_LIST_ID = 4; // "Novidades Plataforma" na pasta "Velvet"

(async () => {
  try {
    const subject = process.argv[2];
    const htmlPath = process.argv[3];
    const dryRun = process.argv.includes("--dry-run");

    if (!subject || !htmlPath) {
      console.error("Uso: node send-newsletter.js \"Assunto\" caminho/para/conteudo.html [--dry-run]");
      process.exit(1);
    }

    const html = fs.readFileSync(htmlPath, "utf8");
    const lista = await request("GET", `/v3/contacts/lists/${GENERAL_LIST_ID}`);

    console.log(`[send-newsletter] Lista "${lista.name}": ${lista.totalSubscribers} destinatário(s).`);

    if (dryRun) {
      console.log("[send-newsletter] --dry-run: nenhum email enviado.");
      process.exit(0);
    }

    const campanhaId = await enviarCampanha({
      listId: GENERAL_LIST_ID,
      subject,
      html,
      nomeCampanha: subject
    });

    if (!campanhaId) {
      console.log("[send-newsletter] Lista sem contatos — nada foi enviado.");
    } else {
      console.log(`[send-newsletter] Campanha enviada com sucesso. ID: ${campanhaId}`);
    }
    process.exit(0);
  } catch (err) {
    console.error("[send-newsletter] Erro fatal:", err);
    process.exit(1);
  }
})();
