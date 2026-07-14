const cron = require("node-cron");
const { backupR2 } = require("./backup-r2");
const { log } = require("./utils/logger");

// Todos os dias às 03:00 horário de Brasília
cron.schedule("0 3 * * *", async () => {
    log("[cron-backup] iniciando backup diário R2 → B2");
    try {
        const result = await backupR2();
        log(`[cron-backup] concluído — copiados: ${result.copied}, já existiam: ${result.skipped}, erros: ${result.errors}`);
    } catch (err) {
        log("[cron-backup] erro fatal:", err.message);
    }
}, { timezone: "America/Sao_Paulo" });

log("[cron-backup] agendado — backup diário às 03:00 (Brasília)");
