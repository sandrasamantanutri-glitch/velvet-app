const { backupR2 } = require("./backup-r2");
const { log } = require("./utils/logger");

async function backupStream() {
    const prefix = process.env.R2_PREFIX_STREAM ?? "stream/";
    log(`[backup-stream] prefix="${prefix}"`);
    return backupR2(prefix);
}

module.exports = { backupStream };

if (require.main === module) {
    backupStream().catch(err => { log("FATAL:", err.message); process.exit(1); });
}
