require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { request } = require("./brevo");

(async () => {
  const data = await request("GET", "/v3/emailCampaigns?limit=20&sort=desc");
  for (const c of data.campaigns) {
    console.log(c.id, c.name, c.status, c.sentDate, JSON.stringify(c.statistics?.globalStats || {}));
  }
})().catch(e => console.error("ERRO:", e.message));
