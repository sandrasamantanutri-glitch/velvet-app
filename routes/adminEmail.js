const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const db = require('../db');
const { criarNotificacaoAdmin } = require('../utils/notificacoesAdmin');

const ADMIN_EMAIL_CONFIG = {}; // cache em memória por adminId

async function getEmailConfig(adminId) {
  try {
    const res = await db.query(
      'SELECT email_config FROM admin WHERE id = $1',
      [adminId]
    );
    if (res.rows.length && res.rows[0].email_config) {
      const config = res.rows[0].email_config;
      if (typeof config === 'string') {
        return JSON.parse(config);
      }
      return config;
    }
  } catch (err) {
    console.error('Erro ao recuperar config de email:', err);
  }
  return null;
}

async function saveEmailConfig(adminId, config) {
  try {
    await db.query(
      `UPDATE admin
       SET email_config = $1
       WHERE id = $2`,
      [config ? JSON.stringify(config) : null, adminId]
    );
  } catch (err) {
    console.error('Erro ao salvar config de email:', err);
  }
}

async function resolverConfig(adminId) {
  if (ADMIN_EMAIL_CONFIG[adminId]) return ADMIN_EMAIL_CONFIG[adminId];
  const config = await getEmailConfig(adminId);
  if (config) ADMIN_EMAIL_CONFIG[adminId] = config;
  return config;
}

// ===========================
// CONFIGURAÇÃO DA CONTA
// ===========================

router.post('/config', async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ erro: 'Não autenticado' });

    const { email, senha, imap_host, imap_port, smtp_host, smtp_port, use_tls } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    const testConfig = {
      email,
      senha,
      imap_host: imap_host || 'mail.seudominio.com',
      imap_port: imap_port || 993,
      smtp_host: smtp_host || 'mail.seudominio.com',
      smtp_port: smtp_port || 587,
      use_tls: use_tls !== false
    };

    const imap = await conectarImap(testConfig);
    await new Promise((resolve, reject) => {
      imap.openBox('INBOX', false, (err) => {
        imap.end();
        err ? reject(err) : resolve();
      });
    });

    await saveEmailConfig(adminId, testConfig);
    ADMIN_EMAIL_CONFIG[adminId] = testConfig;

    res.json({
      sucesso: true,
      mensagem: 'Email configurado com sucesso',
      email: testConfig.email
    });
  } catch (err) {
    console.error('[EMAIL] Erro ao configurar email:', err.message);
    res.status(400).json({
      erro: err.message || 'Erro ao conectar ao email. Verifique suas credenciais.'
    });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ erro: 'Não autenticado' });

    await saveEmailConfig(adminId, null);
    delete ADMIN_EMAIL_CONFIG[adminId];

    res.json({ sucesso: true, mensagem: 'Email desconectado' });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

// ===========================
// ASSINATURA
// ===========================

router.get('/assinatura', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const { rows } = await db.query('SELECT email_assinatura FROM admin WHERE id = $1', [adminId]);
    res.json({ assinatura: rows[0]?.email_assinatura || '' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.put('/assinatura', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const { assinatura } = req.body;
    await db.query('UPDATE admin SET email_assinatura = $1 WHERE id = $2', [assinatura || null, adminId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ===========================
// CONEXÃO IMAP (helpers)
// ===========================

function conectarImap(config) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.senha,
      host: config.imap_host,
      port: config.imap_port,
      tls: config.use_tls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000
    });

    imap.once('error', reject);
    imap.once('ready', () => resolve(imap));
    imap.connect();
  });
}

function abrirCaixa(imap, nomeImap, readOnly) {
  return new Promise((resolve, reject) => {
    imap.openBox(nomeImap, !!readOnly, (err, box) => {
      err ? reject(err) : resolve(box);
    });
  });
}

// Descobre as pastas reais via IMAP e mapeia por papel semântico (inbox/enviados/spam/lixeira)
async function mapearPastas(adminId, imap) {
  const boxes = await new Promise((resolve, reject) => {
    imap.getBoxes((err, boxes) => err ? reject(err) : resolve(boxes));
  });

  const nomes = [];
  const coletar = (box, path) => {
    Object.keys(box).forEach((key) => {
      const fullPath = path ? path + box[key].delimiter + key : key;
      nomes.push(fullPath);
      if (box[key].children) coletar(box[key].children, fullPath);
    });
  };
  coletar(boxes, '');

  const achar = (padroes) => nomes.find((n) => padroes.some((p) => n.toUpperCase().includes(p)));

  const inboxNome = nomes.find((n) => n.toUpperCase() === 'INBOX') || 'INBOX';
  const enviadosNome = achar(['SENT', 'ENVIADO']);
  const spamNome = achar(['SPAM', 'JUNK']);
  const lixeiraNome = achar(['TRASH', 'DELETED', 'LIXEIRA']);

  const papelPorNome = { [inboxNome]: 'inbox' };
  if (enviadosNome) papelPorNome[enviadosNome] = 'enviados';
  if (spamNome) papelPorNome[spamNome] = 'spam';
  if (lixeiraNome) papelPorNome[lixeiraNome] = 'lixeira';

  for (const nome of nomes) {
    await db.query(
      `INSERT INTO email_pastas (admin_id, nome_imap, papel)
       VALUES ($1, $2, $3)
       ON CONFLICT (admin_id, nome_imap) DO UPDATE SET papel = EXCLUDED.papel`,
      [adminId, nome, papelPorNome[nome] || null]
    );
  }

  const { rows } = await db.query('SELECT * FROM email_pastas WHERE admin_id = $1', [adminId]);
  return rows;
}

async function obterPastaPorPapel(adminId, papel) {
  const { rows } = await db.query(
    'SELECT * FROM email_pastas WHERE admin_id = $1 AND papel = $2 LIMIT 1',
    [adminId, papel]
  );
  return rows[0] || null;
}

async function salvarMensagemCache(adminId, pastaId, uid, lida, parsed) {
  const anexos = (parsed.attachments || []).map((a, idx) => ({
    filename: a.filename || `anexo-${idx + 1}`,
    size: a.size || (a.content ? a.content.length : 0),
    content_type: a.contentType || 'application/octet-stream'
  }));

  const remetente = parsed.from?.value?.[0] || {};

  const { rows } = await db.query(
    `INSERT INTO email_mensagens (
      admin_id, pasta_id, uid, message_id, in_reply_to,
      remetente_nome, remetente_email, destinatario, assunto,
      corpo_texto, corpo_html, anexos, data_email, lida
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (pasta_id, uid) DO NOTHING
    RETURNING id, remetente_nome, remetente_email, assunto, data_email`,
    [
      adminId, pastaId, uid,
      parsed.messageId || null,
      parsed.inReplyTo || null,
      remetente.name || null,
      remetente.address || (parsed.from?.text || null),
      parsed.to?.text || null,
      parsed.subject || '(sem assunto)',
      parsed.text || null,
      parsed.html || parsed.textAsHtml || null,
      JSON.stringify(anexos),
      parsed.date || new Date(),
      lida
    ]
  );

  return rows[0] || null;
}

// Busca apenas os UIDs+flags de um conjunto de mensagens (sem corpo) — usado para reconciliar lida/não lida
function buscarFlags(imap, uids) {
  return new Promise((resolve, reject) => {
    if (!uids.length) return resolve([]);
    const resultados = [];
    const f = imap.fetch(uids, {});

    f.on('message', (msg) => {
      msg.on('attributes', (attrs) => {
        resultados.push({ uid: attrs.uid, lida: (attrs.flags || []).includes('\\Seen') });
      });
    });

    f.once('error', reject);
    f.once('end', () => resolve(resultados));
  });
}

// Sincronização completa de uma pasta: insere mensagens novas, reconcilia lida/não lida
// e remove do cache local mensagens que não existem mais na pasta no servidor
// (ex.: movidas/excluídas/respondidas por outro cliente de email, como o Resend).
function sincronizarPasta(adminId, pastaRow, imap) {
  return new Promise((resolve, reject) => {
    imap.openBox(pastaRow.nome_imap, false, async (err) => {
      if (err) return reject(err);

      try {
        const uidsServidor = await new Promise((res, rej) => {
          imap.search([['UID', '1:*']], (err, uids) => (err ? rej(err) : res(uids || [])));
        });

        const { rows: cacheRows } = await db.query(
          'SELECT uid, lida FROM email_mensagens WHERE pasta_id = $1',
          [pastaRow.id]
        );
        const cacheMap = new Map(cacheRows.map((r) => [Number(r.uid), r.lida]));
        const uidsServidorSet = new Set(uidsServidor);

        const uidsRemovidos = cacheRows
          .map((r) => Number(r.uid))
          .filter((uid) => !uidsServidorSet.has(uid));
        if (uidsRemovidos.length) {
          await db.query(
            'DELETE FROM email_mensagens WHERE pasta_id = $1 AND uid = ANY($2::bigint[])',
            [pastaRow.id, uidsRemovidos]
          );
        }

        const uidsNovos = uidsServidor.filter((uid) => !cacheMap.has(uid));
        const uidsExistentes = uidsServidor.filter((uid) => cacheMap.has(uid));

        const flagsExistentes = await buscarFlags(imap, uidsExistentes);
        for (const { uid, lida } of flagsExistentes) {
          if (cacheMap.get(uid) !== lida) {
            await db.query('UPDATE email_mensagens SET lida = $1 WHERE pasta_id = $2 AND uid = $3', [lida, pastaRow.id, uid]);
          }
        }

        let maiorUid = pastaRow.ultimo_uid;
        const inseridas = [];

        if (uidsNovos.length) {
          const pendentes = [];
          const f = imap.fetch(uidsNovos, { bodies: '', struct: true });

          f.on('message', (msg) => {
            let uidAtual = null;
            let lidaAtual = false;
            const chunks = [];

            msg.on('attributes', (attrs) => {
              uidAtual = attrs.uid;
              lidaAtual = (attrs.flags || []).includes('\\Seen');
            });
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => chunks.push(chunk));
            });

            msg.once('end', () => {
              const p = (async () => {
                try {
                  const buffer = Buffer.concat(chunks);
                  const parsed = await simpleParser(buffer);
                  const inserida = await salvarMensagemCache(adminId, pastaRow.id, uidAtual, lidaAtual, parsed);
                  if (uidAtual > maiorUid) maiorUid = uidAtual;
                  if (inserida) inseridas.push(inserida);
                } catch (err) {
                  console.error('[EMAIL SYNC] erro ao processar mensagem:', err.message);
                }
              })();
              pendentes.push(p);
            });
          });

          await new Promise((res, rej) => {
            f.once('error', rej);
            f.once('end', async () => {
              await Promise.all(pendentes);
              res();
            });
          });
        }

        await db.query('UPDATE email_pastas SET ultimo_uid = $1 WHERE id = $2', [maiorUid, pastaRow.id]);
        resolve({ novas: inseridas.length, inseridas, removidas: uidsRemovidos.length });
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ===========================
// PASTAS E MENSAGENS (cache)
// ===========================

router.get('/pastas', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const { rows } = await db.query(`
      SELECT p.id, p.nome_imap, p.papel,
        COUNT(m.id) FILTER (WHERE m.lida = false)::int AS nao_lidas
      FROM email_pastas p
      LEFT JOIN email_mensagens m ON m.pasta_id = p.id
      WHERE p.admin_id = $1
      GROUP BY p.id, p.nome_imap, p.papel
      ORDER BY CASE p.papel
        WHEN 'inbox' THEN 0
        WHEN 'enviados' THEN 1
        WHEN 'spam' THEN 2
        WHEN 'lixeira' THEN 3
        ELSE 4
      END, p.nome_imap
    `, [adminId]);
    res.json(rows);
  } catch (err) {
    console.error('Erro /pastas:', err.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/sincronizar', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const config = await resolverConfig(adminId);
    if (!config) return res.status(400).json({ erro: 'Email não configurado' });

    const imap = await conectarImap(config);
    const pastas = await mapearPastas(adminId, imap);

    const alvo = pastas.filter((p) => ['inbox', 'enviados', 'spam', 'lixeira'].includes(p.papel));

    let totalNovas = 0;
    for (const pasta of alvo) {
      const r = await sincronizarPasta(adminId, pasta, imap);
      totalNovas += r.novas;
    }

    imap.end();
    res.json({ ok: true, novas: totalNovas });
  } catch (err) {
    console.error('[EMAIL SINCRONIZAR]', err.message);
    res.status(400).json({ erro: err.message || 'Erro ao sincronizar' });
  }
});

router.get('/mensagens', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const pastaId = Number(req.query.pasta_id);
    const busca = (req.query.busca || '').trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = 30;
    const offset = (page - 1) * limit;

    if (!pastaId) return res.status(400).json({ erro: 'pasta_id obrigatório' });

    const params = [adminId, pastaId];
    let where = 'admin_id = $1 AND pasta_id = $2';

    if (busca) {
      params.push(`%${busca}%`);
      where += ` AND (assunto ILIKE $${params.length} OR remetente_email ILIKE $${params.length} OR remetente_nome ILIKE $${params.length} OR corpo_texto ILIKE $${params.length})`;
    }

    const countQ = await db.query(`SELECT COUNT(*) FROM email_mensagens WHERE ${where}`, params);
    const total = Number(countQ.rows[0].count);

    const { rows } = await db.query(`
      SELECT id, remetente_nome, remetente_email, destinatario, assunto, data_email, lida,
             (anexos <> '[]'::jsonb) AS tem_anexos
      FROM email_mensagens
      WHERE ${where}
      ORDER BY data_email DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    res.json({ rows, totalPages: Math.ceil(total / limit), page });
  } catch (err) {
    console.error('Erro listar mensagens:', err.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/mensagens/:id', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const id = Number(req.params.id);

    const { rows } = await db.query('SELECT * FROM email_mensagens WHERE id = $1 AND admin_id = $2', [id, adminId]);
    if (!rows.length) return res.status(404).json({ erro: 'Mensagem não encontrada' });

    const msg = rows[0];

    if (!msg.lida) {
      await db.query('UPDATE email_mensagens SET lida = true WHERE id = $1', [id]);
      msg.lida = true;
      marcarLidoImap(adminId, msg).catch((err) => console.error('Erro marcar \\Seen no IMAP:', err.message));
    }

    res.json(msg);
  } catch (err) {
    console.error('Erro buscar mensagem:', err.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

async function marcarLidoImap(adminId, msg) {
  const config = await resolverConfig(adminId);
  if (!config) return;

  const { rows } = await db.query('SELECT nome_imap FROM email_pastas WHERE id = $1', [msg.pasta_id]);
  if (!rows.length) return;

  const imap = await conectarImap(config);
  await new Promise((resolve, reject) => {
    imap.openBox(rows[0].nome_imap, false, (err) => {
      if (err) return reject(err);
      imap.addFlags(msg.uid, ['\\Seen'], (err) => {
        imap.end();
        err ? reject(err) : resolve();
      });
    });
  });
}

async function moverMensagem(adminId, msgId, pastaDestinoId) {
  const { rows } = await db.query(
    `SELECT m.*, p.nome_imap AS pasta_atual_nome
     FROM email_mensagens m JOIN email_pastas p ON p.id = m.pasta_id
     WHERE m.id = $1 AND m.admin_id = $2`,
    [msgId, adminId]
  );
  if (!rows.length) throw new Error('Mensagem não encontrada');
  const msg = rows[0];

  const { rows: destRows } = await db.query(
    'SELECT * FROM email_pastas WHERE id = $1 AND admin_id = $2',
    [pastaDestinoId, adminId]
  );
  if (!destRows.length) throw new Error('Pasta destino não encontrada');
  const destino = destRows[0];

  const config = await resolverConfig(adminId);
  const imap = await conectarImap(config);

  await abrirCaixa(imap, msg.pasta_atual_nome, false);
  await new Promise((resolve, reject) => {
    imap.move(String(msg.uid), destino.nome_imap, (err) => err ? reject(err) : resolve());
  });

  await sincronizarPasta(adminId, destino, imap);
  imap.end();

  await db.query('DELETE FROM email_mensagens WHERE id = $1', [msgId]);
}

router.post('/mensagens/:id/mover', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const id = Number(req.params.id);
    const { pasta_destino_id } = req.body;
    if (!pasta_destino_id) return res.status(400).json({ erro: 'pasta_destino_id obrigatório' });

    await moverMensagem(adminId, id, pasta_destino_id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro mover email:', err.message);
    res.status(400).json({ erro: err.message || 'Erro ao mover email' });
  }
});

router.post('/mensagens/:id/excluir', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const id = Number(req.params.id);

    const lixeira = await obterPastaPorPapel(adminId, 'lixeira');
    if (!lixeira) return res.status(400).json({ erro: 'Pasta de lixeira não encontrada nessa conta' });

    await moverMensagem(adminId, id, lixeira.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro excluir email:', err.message);
    res.status(400).json({ erro: err.message || 'Erro ao excluir email' });
  }
});

router.delete('/mensagens/:id', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const id = Number(req.params.id);

    const { rows } = await db.query(
      `SELECT m.*, p.nome_imap, p.papel
       FROM email_mensagens m JOIN email_pastas p ON p.id = m.pasta_id
       WHERE m.id = $1 AND m.admin_id = $2`,
      [id, adminId]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Mensagem não encontrada' });
    const msg = rows[0];

    if (msg.papel !== 'lixeira') {
      return res.status(400).json({ erro: 'Só é possível excluir definitivamente a partir da Lixeira' });
    }

    const config = await resolverConfig(adminId);
    const imap = await conectarImap(config);

    await abrirCaixa(imap, msg.nome_imap, false);
    await new Promise((resolve, reject) => {
      imap.addFlags(msg.uid, ['\\Deleted'], (err) => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      imap.expunge((err) => err ? reject(err) : resolve());
    });
    imap.end();

    await db.query('DELETE FROM email_mensagens WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro excluir definitivamente:', err.message);
    res.status(400).json({ erro: err.message || 'Erro ao excluir definitivamente' });
  }
});

router.get('/mensagens/:id/anexos/:idx', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const id = Number(req.params.id);
    const idx = Number(req.params.idx);

    const { rows } = await db.query(
      `SELECT m.uid, m.anexos, p.nome_imap
       FROM email_mensagens m JOIN email_pastas p ON p.id = m.pasta_id
       WHERE m.id = $1 AND m.admin_id = $2`,
      [id, adminId]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Mensagem não encontrada' });
    const msg = rows[0];
    const anexoMeta = (msg.anexos || [])[idx];
    if (!anexoMeta) return res.status(404).json({ erro: 'Anexo não encontrado' });

    const config = await resolverConfig(adminId);
    const imap = await conectarImap(config);

    await abrirCaixa(imap, msg.nome_imap, true);
    const buffer = await new Promise((resolve, reject) => {
      const chunks = [];
      const f = imap.fetch(msg.uid, { bodies: '' });
      f.on('message', (m) => {
        m.on('body', (stream) => stream.on('data', (chunk) => chunks.push(chunk)));
      });
      f.once('error', reject);
      f.once('end', () => resolve(Buffer.concat(chunks)));
    });
    imap.end();

    const parsed = await simpleParser(buffer);
    const anexo = (parsed.attachments || [])[idx];
    if (!anexo) return res.status(404).json({ erro: 'Anexo não encontrado no conteúdo' });

    res.set('Content-Type', anexo.contentType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(anexo.filename || 'anexo')}"`);
    res.send(anexo.content);
  } catch (err) {
    console.error('Erro download anexo:', err.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ===========================
// ENVIO (sempre como a conta configurada)
// ===========================

function construirEmlSimples({ from, to, subject, html, messageId, inReplyTo, references, date }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${(date || new Date()).toUTCString()}`,
    `Message-ID: ${messageId}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit'
  ].filter(Boolean).join('\r\n');

  return Buffer.from(`${headers}\r\n\r\n${html}`, 'utf-8');
}

router.post('/enviar', async (req, res) => {
  try {
    const adminId = req.user?.id;
    const { para, assunto, corpo, em_resposta_a } = req.body;

    if (!para || !assunto || !corpo) {
      return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
    }

    const config = await resolverConfig(adminId);
    if (!config) return res.status(400).json({ erro: 'Email não configurado' });

    let inReplyTo = null;
    let references = null;

    if (em_resposta_a) {
      const { rows } = await db.query(
        'SELECT message_id, in_reply_to FROM email_mensagens WHERE id = $1 AND admin_id = $2',
        [em_resposta_a, adminId]
      );
      if (rows.length && rows[0].message_id) {
        inReplyTo = rows[0].message_id;
        references = rows[0].in_reply_to ? `${rows[0].in_reply_to} ${rows[0].message_id}` : rows[0].message_id;
      }
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.use_tls && config.smtp_port === 465,
      auth: { user: config.email, pass: config.senha },
      tls: config.use_tls ? { rejectUnauthorized: false } : false
    });

    const info = await transporter.sendMail({
      from: config.email,
      to: para,
      subject: assunto,
      html: corpo,
      inReplyTo: inReplyTo || undefined,
      references: references || undefined
    });

    try {
      const pastaEnviados = await obterPastaPorPapel(adminId, 'enviados');
      if (pastaEnviados) {
        const raw = construirEmlSimples({
          from: config.email,
          to: para,
          subject: assunto,
          html: corpo,
          messageId: info.messageId || `<${Date.now()}@velvet.lat>`,
          inReplyTo,
          references
        });

        const imap = await conectarImap(config);
        await new Promise((resolve, reject) => {
          imap.append(raw, { mailbox: pastaEnviados.nome_imap, flags: ['\\Seen'] }, (err) => err ? reject(err) : resolve());
        });
        await sincronizarPasta(adminId, pastaEnviados, imap);
        imap.end();
      }
    } catch (appendErr) {
      console.error('[EMAIL ENVIAR] erro ao salvar cópia em Enviados:', appendErr.message);
    }

    res.json({ sucesso: true, mensagem: 'Email enviado com sucesso' });
  } catch (err) {
    console.error('Erro ao enviar email:', err);
    res.status(400).json({ erro: err.message || 'Erro ao enviar email' });
  }
});

// ===========================
// MONITORAMENTO DE NOVOS EMAILS (notificação admin / sync de fundo)
// ===========================

async function monitorarNovosEmails(io) {
  try {
    const { rows: admins } = await db.query('SELECT id, email_config FROM admin WHERE email_config IS NOT NULL');

    for (const admRow of admins) {
      const adminId = admRow.id;
      let config = admRow.email_config;
      if (typeof config === 'string') {
        try { config = JSON.parse(config); } catch { continue; }
      }
      if (!config?.email || !config?.senha) continue;

      try {
        const imap = await conectarImap(config);
        const pastas = await mapearPastas(adminId, imap);
        const inbox = pastas.find((p) => p.papel === 'inbox');

        if (inbox) {
          const eraPrimeiraSync = inbox.ultimo_uid === 0;
          const { inseridas } = await sincronizarPasta(adminId, inbox, imap);

          if (!eraPrimeiraSync) {
            for (const nova of inseridas) {
              io.to(`email_${adminId}`).emit('email:novo', nova);
              await criarNotificacaoAdmin(db, io, {
                tipo: 'email',
                referencia_id: nova.id,
                titulo: 'Novo email recebido',
                mensagem: `${nova.remetente_nome || nova.remetente_email || 'Desconhecido'}: ${nova.assunto}`
              });
            }
          }
        }

        imap.end();
      } catch (err) {
        console.error('[EMAIL MONITOR] erro ao verificar admin', adminId, '-', err.message);
      }
    }
  } catch (err) {
    console.error('[EMAIL MONITOR] erro geral:', err.message);
  }
}

function iniciarMonitoramentoEmails(io) {
  setInterval(() => monitorarNovosEmails(io), 30 * 1000);
}

module.exports = router;
module.exports.iniciarMonitoramentoEmails = iniciarMonitoramentoEmails;
