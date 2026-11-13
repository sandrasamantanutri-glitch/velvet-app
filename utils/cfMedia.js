/**
 * Assinatura de URLs do Cloudflare (Stream + Images).
 *
 * Ideia: o banco continua guardando a URL "canônica" (sem token). Quem decide
 * se o usuário pode ver a mídia continua sendo cada rota (liberado, VIP,
 * premium pago, jaPossuia...). Tudo o que a rota decide enviar passa por
 * signDeep() na saída (res.json / socket) e ganha um token com validade.
 * Depois que os arquivos forem marcados com requireSignedURLs no Cloudflare,
 * a URL sem token deixa de abrir — só a assinada funciona.
 *
 * Variáveis de ambiente:
 *   CF_STREAM_SIGNING_KEY_ID   id da signing key do Stream
 *   CF_STREAM_SIGNING_PEM      chave privada (PEM puro ou em base64, como a API devolve)
 *   CF_IMAGES_SIGNING_KEY      chave de assinatura do Cloudflare Images
 *   CF_SIGN_TTL_HOURS          validade mínima do token em horas (padrão 12)
 *   CF_REQUIRE_SIGNED_UPLOADS  "true" → novos uploads já nascem protegidos
 *
 * Sem as chaves configuradas, tudo aqui vira passthrough (URL sai como está),
 * então o deploy deste código não muda nada até as chaves existirem.
 */

const crypto = require("crypto");

const HORA = 3600;
const BUCKET_SEGUNDOS = HORA; // URLs ficam estáveis por 1h (cache do navegador)

const STREAM_UID_RE = /^[a-f0-9]{32}$/i;
const JWT_RE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

// ─────────────────────────────────────────────────────────────────────────────
// Configuração (lida sob demanda para respeitar dotenv e facilitar testes)
// ─────────────────────────────────────────────────────────────────────────────

let _pemCache = { raw: null, key: null };

function getStreamKey() {
  const kid = process.env.CF_STREAM_SIGNING_KEY_ID;
  const raw = process.env.CF_STREAM_SIGNING_PEM;
  if (!kid || !raw) return null;

  if (_pemCache.raw !== raw) {
    let pem = raw.trim().replace(/\\n/g, "\n");
    if (!pem.includes("BEGIN")) {
      pem = Buffer.from(pem, "base64").toString("utf8");
    }
    try {
      _pemCache = { raw, key: crypto.createPrivateKey(pem) };
    } catch (err) {
      console.error("[cfMedia] CF_STREAM_SIGNING_PEM inválida:", err.message);
      _pemCache = { raw, key: null };
    }
  }

  return _pemCache.key ? { kid, key: _pemCache.key } : null;
}

function getImagesKey() {
  return process.env.CF_IMAGES_SIGNING_KEY || null;
}

function getTtlSegundos() {
  const h = Number(process.env.CF_SIGN_TTL_HOURS);
  return (Number.isFinite(h) && h > 0 ? h : 12) * HORA;
}

function status() {
  return {
    stream: !!getStreamKey(),
    images: !!getImagesKey(),
    ttlHoras: getTtlSegundos() / HORA,
    uploadsProtegidos: process.env.CF_REQUIRE_SIGNED_UPLOADS === "true"
  };
}

// Expiração arredondada: mesma URL durante 1h, válida por no mínimo TTL.
function calcularExp(agoraSeg = Math.floor(Date.now() / 1000)) {
  return (Math.floor(agoraSeg / BUCKET_SEGUNDOS) + 1) * BUCKET_SEGUNDOS + getTtlSegundos();
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

function isStreamHost(host) {
  return (
    host === "videodelivery.net" ||
    host === "iframe.videodelivery.net" ||
    host === "cloudflarestream.com" ||
    host.endsWith(".cloudflarestream.com")
  );
}

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * Retorna:
 *   { kind: "stream", uid, signed, u, seg }   vídeo do Cloudflare Stream
 *   { kind: "image", id, hash, variant, signed, u }   imagem do Cloudflare Images
 *   null   qualquer outra coisa (R2, Backblaze, assets locais, texto...)
 */
function parse(url) {
  if (typeof url !== "string" || url.length > 4000 || !url.startsWith("https://")) return null;
  if (!url.includes("delivery.net/") && !url.includes("cloudflarestream.com/")) return null;

  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return null;
  }

  const partes = u.pathname.split("/").filter(Boolean);

  if (isStreamHost(u.hostname)) {
    const seg = partes[0];
    if (!seg) return null;
    if (STREAM_UID_RE.test(seg)) {
      return { kind: "stream", uid: seg.toLowerCase(), signed: false, u, seg };
    }
    if (JWT_RE.test(seg)) {
      const payload = decodeJwtPayload(seg);
      const uid = payload && typeof payload.sub === "string" ? payload.sub : null;
      if (uid && STREAM_UID_RE.test(uid)) {
        return { kind: "stream", uid: uid.toLowerCase(), signed: true, u, seg };
      }
    }
    return null;
  }

  if (u.hostname === "imagedelivery.net") {
    if (partes.length < 3) return null;
    return {
      kind: "image",
      hash: partes[0],
      id: partes.slice(1, -1).join("/"),
      variant: partes[partes.length - 1],
      signed: u.searchParams.has("sig"),
      u
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assinatura
// ─────────────────────────────────────────────────────────────────────────────

const _tokenCache = new Map(); // `${uid}:${exp}` → token
const TOKEN_CACHE_MAX = 5000;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function streamToken(uid, exp = calcularExp()) {
  const cfg = getStreamKey();
  if (!cfg) return null;

  const cacheKey = `${cfg.kid}:${uid}:${exp}`;
  const emCache = _tokenCache.get(cacheKey);
  if (emCache) return emCache;

  const cabecalho = b64url({ alg: "RS256", kid: cfg.kid, typ: "JWT" });
  const corpo = b64url({ sub: uid, kid: cfg.kid, exp });
  const assinatura = crypto
    .sign("RSA-SHA256", Buffer.from(`${cabecalho}.${corpo}`), cfg.key)
    .toString("base64url");
  const token = `${cabecalho}.${corpo}.${assinatura}`;

  if (_tokenCache.size >= TOKEN_CACHE_MAX) _tokenCache.clear();
  _tokenCache.set(cacheKey, token);
  return token;
}

function assinarImagem(u, exp = calcularExp()) {
  const chave = getImagesKey();
  if (!chave) return null;

  const copia = new URL(u.toString());
  copia.searchParams.delete("sig");
  copia.searchParams.set("exp", String(exp));

  const paraAssinar = copia.pathname + "?" + copia.searchParams.toString();
  const sig = crypto.createHmac("sha256", chave).update(paraAssinar).digest("hex");
  copia.searchParams.set("sig", sig);
  return copia.toString();
}

/**
 * Assina uma URL do Cloudflare. Qualquer outra string volta intacta.
 * Já assinada → volta intacta. Sem chave configurada → volta intacta.
 */
function signUrl(url) {
  const p = parse(url);
  if (!p || p.signed) return url;

  if (p.kind === "stream") {
    const token = streamToken(p.uid);
    if (!token) return url;
    // troca só o primeiro segmento do path (o uid) pelo token
    return url.replace(`/${p.seg}`, `/${token}`);
  }

  return assinarImagem(p.u) || url;
}

/**
 * Desfaz a assinatura — devolve a URL canônica que vai para o banco.
 * Usado na ENTRADA (req.body / socket) para nunca gravar URL com token.
 */
function unsignUrl(url) {
  const p = parse(url);
  if (!p || !p.signed) return url;

  if (p.kind === "stream") {
    return url.replace(`/${p.seg}`, `/${p.uid}`);
  }

  const copia = new URL(p.u.toString());
  copia.searchParams.delete("sig");
  copia.searchParams.delete("exp");
  return copia.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep walk (payloads JSON)
// ─────────────────────────────────────────────────────────────────────────────

function ehObjetoSimples(v) {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function mapDeep(valor, fn, profundidade = 0) {
  if (typeof valor === "string") return fn(valor);
  if (valor === null || typeof valor !== "object" || profundidade > 20) return valor;

  if (Array.isArray(valor)) {
    let saida = null;
    for (let i = 0; i < valor.length; i++) {
      const novo = mapDeep(valor[i], fn, profundidade + 1);
      if (novo !== valor[i]) {
        if (!saida) saida = valor.slice();
        saida[i] = novo;
      }
    }
    return saida || valor;
  }

  // Date, Buffer, Map, instâncias de classe etc. passam intactos
  if (!ehObjetoSimples(valor)) return valor;

  let saida = null;
  for (const chave of Object.keys(valor)) {
    const novo = mapDeep(valor[chave], fn, profundidade + 1);
    if (novo !== valor[chave]) {
      if (!saida) saida = { ...valor };
      saida[chave] = novo;
    }
  }
  return saida || valor;
}

/** Assina toda URL do Cloudflare dentro de um payload. Não muta o original. */
function signDeep(payload) {
  if (!getStreamKey() && !getImagesKey()) return payload;
  try {
    return mapDeep(payload, signUrl);
  } catch (err) {
    console.error("[cfMedia] signDeep falhou:", err.message);
    return payload;
  }
}

/** Remove assinatura de toda URL do Cloudflare dentro de um payload. */
function unsignDeep(payload) {
  try {
    return mapDeep(payload, unsignUrl);
  } catch (err) {
    console.error("[cfMedia] unsignDeep falhou:", err.message);
    return payload;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview de conteúdo bloqueado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De onde o SERVIDOR busca a imagem para gerar o preview borrado de uma mídia.
 * Esta URL nunca vai para o cliente bloqueado — só o resultado borrado vai.
 * Devolve null quando não há de onde tirar uma imagem.
 */
function fontePreview(fullUrl, thumbUrl) {
  const ehHttp = (u) => typeof u === "string" && /^https:\/\//.test(u);
  const pareceImagem = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u);

  // 1) miniatura gravada no banco (exceto variante CF "/thumbnail", que pode não existir)
  if (ehHttp(thumbUrl)) {
    const t = parse(thumbUrl);
    if (!(t && t.kind === "image" && t.variant === "thumbnail")) return thumbUrl;
  }

  // 2) derivada da mídia original
  if (!ehHttp(fullUrl)) return null;
  const f = parse(fullUrl);
  if (f && f.kind === "stream") {
    return `https://videodelivery.net/${f.uid}/thumbnails/thumbnail.jpg?height=120`;
  }
  if (f && f.kind === "image") return fullUrl;
  return pareceImagem(fullUrl) ? fullUrl : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// API do Cloudflare: ligar/desligar requireSignedURLs em um arquivo
// ─────────────────────────────────────────────────────────────────────────────

async function definirProtecao(url, exigirAssinatura) {
  const p = parse(url);
  if (!p) return { ok: false, motivo: "nao_cloudflare" };

  const conta = process.env.CF_ACCOUNT_ID;
  const base = `https://api.cloudflare.com/client/v4/accounts/${conta}`;

  const endpoint =
    p.kind === "stream"
      ? { url: `${base}/stream/${p.uid}`, method: "POST", token: process.env.CF_STREAM_TOKEN }
      : { url: `${base}/images/v1/${encodeURIComponent(p.id)}`, method: "PATCH", token: process.env.CF_IMAGES_TOKEN };

  const resp = await fetch(endpoint.url, {
    method: endpoint.method,
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requireSignedURLs: !!exigirAssinatura })
  });

  let corpo = null;
  try {
    corpo = await resp.json();
  } catch (_) {}

  if (!resp.ok || !corpo?.success) {
    return {
      ok: false,
      status: resp.status,
      motivo: JSON.stringify(corpo?.errors || corpo || resp.statusText)
    };
  }
  return { ok: true, kind: p.kind, id: p.kind === "stream" ? p.uid : p.id };
}

/**
 * Chamar logo após um upload de conteúdo. Só age se CF_REQUIRE_SIGNED_UPLOADS=true
 * E a chave do tipo correspondente existir (senão o arquivo ficaria inacessível).
 * Nunca lança erro — falha aqui não pode derrubar o upload.
 */
async function protegerUpload(url) {
  try {
    if (process.env.CF_REQUIRE_SIGNED_UPLOADS !== "true") return false;
    const p = parse(url);
    if (!p) return false;
    if (p.kind === "stream" && !getStreamKey()) return false;
    if (p.kind === "image" && !getImagesKey()) return false;

    const r = await definirProtecao(url, true);
    if (!r.ok) console.error("[cfMedia] não foi possível proteger upload:", r.motivo);
    return r.ok;
  } catch (err) {
    console.error("[cfMedia] erro ao proteger upload:", err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrações (Express + Socket.IO)
// ─────────────────────────────────────────────────────────────────────────────

/** Express: assina tudo o que sai por res.json e limpa tokens que entram no body. */
function expressMiddleware() {
  return function cfMediaMiddleware(req, res, next) {
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      req.body = unsignDeep(req.body);
    }

    const jsonOriginal = res.json;
    res.json = function (corpo) {
      return jsonOriginal.call(this, signDeep(corpo));
    };

    next();
  };
}

/** Socket.IO: cobre socket.emit, emits para salas (io.to / socket.to) e callbacks de ack. */
function attachSocketIO(io) {
  const mapArgs = (args) =>
    args.map((a) => (typeof a === "function" ? a : signDeep(a)));

  // 1) emits para salas / broadcast passam pelo adapter
  const adapter = io.of("/").adapter;
  if (adapter && typeof adapter.broadcast === "function") {
    const broadcastOriginal = adapter.broadcast.bind(adapter);
    adapter.broadcast = (packet, opts) => {
      if (packet && Array.isArray(packet.data)) {
        packet = { ...packet, data: mapArgs(packet.data) };
      }
      return broadcastOriginal(packet, opts);
    };
  }
  if (adapter && typeof adapter.broadcastWithAck === "function") {
    const comAckOriginal = adapter.broadcastWithAck.bind(adapter);
    adapter.broadcastWithAck = (packet, ...resto) => {
      if (packet && Array.isArray(packet.data)) {
        packet = { ...packet, data: mapArgs(packet.data) };
      }
      return comAckOriginal(packet, ...resto);
    };
  }

  // 2) emit direto para o próprio socket + entrada + callbacks de ack
  io.use((socket, next) => {
    const emitOriginal = socket.emit;
    socket.emit = function (evento, ...args) {
      return emitOriginal.call(this, evento, ...mapArgs(args));
    };

    socket.use((pacote, proximo) => {
      for (let i = 1; i < pacote.length; i++) {
        if (typeof pacote[i] === "function") {
          const ack = pacote[i];
          pacote[i] = (...resposta) => ack(...mapArgs(resposta));
        } else {
          pacote[i] = unsignDeep(pacote[i]);
        }
      }
      proximo();
    });

    next();
  });
}

module.exports = {
  parse,
  signUrl,
  unsignUrl,
  signDeep,
  unsignDeep,
  fontePreview,
  definirProtecao,
  protegerUpload,
  expressMiddleware,
  attachSocketIO,
  streamToken,
  calcularExp,
  status
};
