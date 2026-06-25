const https = require("https");
const jwt = require("jsonwebtoken");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requestOnce(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.brevo.com",
      path,
      method,
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "accept": "application/json",
        "content-type": "application/json",
        ...(payload ? { "content-length": Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (_) {}
        resolve({ status: res.statusCode, body: data, parsed, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function request(method, path, body, tentativa = 1) {
  const res = await requestOnce(method, path, body);

  if (res.status >= 200 && res.status < 300) return res.parsed;

  if (res.status === 429 && tentativa <= 6) {
    const retryAfter = Number(res.headers["retry-after"]) || tentativa * 1.5;
    await sleep(retryAfter * 1000);
    return request(method, path, body, tentativa + 1);
  }

  throw new Error(`Brevo ${method} ${path} -> ${res.status}: ${res.body}`);
}

async function obterOuCriarListaVIP(db, folderId, modelo_id, nome_modelo) {
  const dbRes = await db.query("SELECT brevo_list_id FROM modelos WHERE id = $1", [modelo_id]);
  const existingId = dbRes.rows[0]?.brevo_list_id;
  if (existingId) return existingId;

  const lista = await request("POST", "/v3/contacts/lists", {
    name: `VIP — ${nome_modelo || "Modelo " + modelo_id}`,
    folderId
  });

  await db.query("UPDATE modelos SET brevo_list_id = $1 WHERE id = $2", [lista.id, modelo_id]);
  return lista.id;
}

function gerarTokenDesinscricao(email, tipo) {
  return jwt.sign({ email, tipo, action: "unsub_email" }, process.env.JWT_SECRET);
}

async function adicionarContatoLista(listId, email, nome, tipoPref) {
  const partes = (nome || "").trim().split(/\s+/);
  const attributes = {
    FIRSTNAME: partes[0] || "",
    LASTNAME: partes.slice(1).join(" ") || ""
  };
  if (tipoPref) {
    attributes.UNSUB_TOKEN = gerarTokenDesinscricao(email.trim(), tipoPref);
  }
  await request("POST", "/v3/contacts", {
    email: email.trim(),
    attributes,
    listIds: [listId],
    updateEnabled: true
  });
}

async function removerContatoLista(listId, email) {
  await request("POST", `/v3/contacts/lists/${listId}/contacts/remove`, {
    emails: [email.trim()]
  });
}

const REMETENTE = { name: "Velvet", email: "contato@velvet.lat" };

async function contagemLista(listId) {
  const lista = await request("GET", `/v3/contacts/lists/${listId}`);
  return lista.totalSubscribers || 0;
}

async function enviarCampanha({ listId, subject, html, nomeCampanha }) {
  const total = await contagemLista(listId);
  if (!total) {
    console.log(`[Campanha Brevo] Lista ${listId} sem contatos — campanha ignorada.`);
    return null;
  }

  const campanha = await request("POST", "/v3/emailCampaigns", {
    name: nomeCampanha || subject,
    subject,
    sender: REMETENTE,
    type: "classic",
    htmlContent: html,
    recipients: { listIds: [listId] }
  });

  await request("POST", `/v3/emailCampaigns/${campanha.id}/sendNow`);
  console.log(`[Campanha Brevo] Campanha enviada: ${campanha.id} → lista ${listId}`);
  return campanha.id;
}

module.exports = {
  request,
  obterOuCriarListaVIP,
  adicionarContatoLista,
  removerContatoLista,
  enviarCampanha,
  gerarTokenDesinscricao,
  FOLDER_ID_VELVET: 3,
  GENERAL_LIST_ID: 4
};
