require("dotenv").config();
const { ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const r2 = require("./utils/cloudflare");
const b2 = require("./utils/backblaze");
const { log } = require("./utils/logger");

const R2_BUCKET = process.env.R2_BUCKET;
const B2_BUCKET = process.env.B2_BUCKET;
const PREFIX = process.env.R2_PREFIX_STREAM ?? "stream/";

async function restoreStream() {
    log(`[restore-stream] restaurando B2 → R2, prefix="${PREFIX}"`);
    let restored = 0, errors = 0;
    let token;

    do {
        const list = await b2.send(new ListObjectsV2Command({
            Bucket: B2_BUCKET,
            Prefix: PREFIX,
            ContinuationToken: token
        }));

        for (const obj of list.Contents ?? []) {
            try {
                const { Body, ContentType } = await b2.send(
                    new GetObjectCommand({ Bucket: B2_BUCKET, Key: obj.Key })
                );
                await new Upload({
                    client: r2,
                    params: { Bucket: R2_BUCKET, Key: obj.Key, Body, ContentType }
                }).done();
                log(`✓ restaurado: ${obj.Key}`);
                restored++;
            } catch (err) {
                log(`✗ ${obj.Key}: ${err.message}`);
                errors++;
            }
        }

        token = list.NextContinuationToken;
    } while (token);

    log(`[restore-stream] fim — restaurados: ${restored}, erros: ${errors}`);
    return { restored, errors };
}

module.exports = { restoreStream };

if (require.main === module) {
    restoreStream().catch(err => { log("FATAL:", err.message); process.exit(1); });
}
