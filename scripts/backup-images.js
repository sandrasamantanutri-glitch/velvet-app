const { backupR2 } = require("./backup-r2");
const { log } = require("./utils/logger");

async function backupImages() {
    const prefix = process.env.R2_PREFIX_IMAGES ?? "imagens/";
    log(`[backup-images] prefix="${prefix}"`);
    return backupR2(prefix);
}

module.exports = { backupImages };

if (require.main === module) {
    backupImages().catch(err => { log("FATAL:", err.message); process.exit(1); });
}
