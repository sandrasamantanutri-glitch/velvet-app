const { backupR2 } = require("./backup-r2");
const { log } = require("./utils/logger");

async function backupMedia() {
    const prefix = process.env.R2_PREFIX_MEDIA ?? "videos/";
    log(`[backup-media] prefix="${prefix}"`);
    return backupR2(prefix);
}

module.exports = { backupMedia };

if (require.main === module) {
    backupMedia().catch(err => { log("FATAL:", err.message); process.exit(1); });
}
