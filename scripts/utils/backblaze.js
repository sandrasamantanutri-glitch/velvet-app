require("dotenv").config();

const { S3Client } = require("@aws-sdk/client-s3");

const endpoint = process.env.B2_ENDPOINT;
if (!endpoint) throw new Error("B2_ENDPOINT não está definido no .env");

const normalizedEndpoint = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;

module.exports = new S3Client({
    endpoint: normalizedEndpoint,
    region: process.env.B2_REGION || "us-west-004",
    credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY
    }
});