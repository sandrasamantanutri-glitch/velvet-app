require("dotenv").config();
const { ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const r2 = require("./utils/cloudflare");
const b2 = require("./utils/backblaze");
const { log } = require("./utils/logger");

const R2_BUCKET = process.env.R2_BUCKET;
const B2_BUCKET = process.env.B2_BUCKET;

async function alreadyInB2(key, etag) {
    try {
        const head = await b2.send(new HeadObjectCommand({ Bucket: B2_BUCKET, Key: key }));
        return head.ETag === etag;
    } catch {
        return false;
    }
}

async function copyToB2(key, contentType) {
    const { Body } = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    await new Upload({
        client: b2,
        params: { Bucket: B2_BUCKET, Key: key, Body, ContentType: contentType }
    }).done();
}

async function backupR2(prefix = "") {
    log(`[backup-r2] início${prefix ? ` prefix="${prefix}"` : " (bucket inteiro)"}`);
    let copied = 0, skipped = 0, errors = 0;
    let token;

    do {
        const list = await r2.send(new ListObjectsV2Command({
            Bucket: R2_BUCKET,
            Prefix: prefix || undefined,
            ContinuationToken: token
        }));

        for (const obj of list.Contents ?? []) {
            try {
                if (await alreadyInB2(obj.Key, obj.ETag)) {
                    skipped++;
                } else {
                    const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key }));
                    await copyToB2(obj.Key, head.ContentType);
                    log(`✓ ${obj.Key} (${(obj.Size / 1024).toFixed(1)} KB)`);
                    copied++;
                }
            } catch (err) {
                log(`✗ ${obj.Key}: ${err.message}`);
                errors++;
            }
        }

        token = list.NextContinuationToken;
    } while (token);

    log(`[backup-r2] fim — copiados: ${copied}, já existiam: ${skipped}, erros: ${errors}`);
    return { copied, skipped, errors };
}

module.exports = { backupR2 };

if (require.main === module) {
    backupR2().catch(err => { log("FATAL:", err.message); process.exit(1); });
}
