const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const db = require('../db');

const ADMIN_EMAIL_CONFIG = {};

async function getEmailConfig(adminId) {
  try {
    const res = await db.query(
      'SELECT email_config FROM admin WHERE id = $1',
      [adminId]
    );
    if (res.rows.length && res.rows[0].email_config) {
      const config = res.rows[0].email_config;
      // JSONB retorna como objeto, não como string
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

router.post('/config', async (req, res) => {
  try {
    const adminId = req.user?.id;
    console.log('[EMAIL] Config request - adminId:', adminId, 'body:', req.body);

    if (!adminId) return res.status(401).json({ erro: 'Não autenticado' });

    const { email, senha, imap_host, imap_port, smtp_host, smtp_port, use_tls } = req.body;

    console.log('[EMAIL] Dados recebidos:', { email, senha: '***', imap_host, imap_port, smtp_host, smtp_port, use_tls });

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

    console.log('[EMAIL] Testando config:', {
      email: testConfig.email,
      host: testConfig.imap_host,
      port: testConfig.imap_port,
      tls: testConfig.use_tls
    });

    const imap = new Imap({
      user: testConfig.email,
      password: testConfig.senha,
      host: testConfig.imap_host,
      port: testConfig.imap_port,
      tls: testConfig.use_tls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000
    });

    await new Promise((resolve, reject) => {
      imap.on('error', (err) => {
        console.error('[EMAIL CONFIG] Erro IMAP:', err.message);
        reject(err);
      });

      imap.on('ready', () => {
        console.log('[EMAIL CONFIG] Conectado com sucesso, testando acesso...');
        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            imap.end();
            reject(err);
          } else {
            console.log('[EMAIL CONFIG] INBOX acessível');
            imap.end();
            resolve();
          }
        });
      });

      console.log('[EMAIL CONFIG] Conectando ao IMAP...');
      imap.connect();
    });

    await saveEmailConfig(adminId, testConfig);
    ADMIN_EMAIL_CONFIG[adminId] = testConfig;

    res.json({
      sucesso: true,
      mensagem: 'Email configurado com sucesso',
      email: testConfig.email
    });
  } catch (err) {
    console.error('[EMAIL] Erro ao configurar email:', err.message, err.stack);
    res.status(400).json({
      erro: err.message || 'Erro ao conectar ao email. Verifique suas credenciais.',
      debug: err.message
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

router.post('/sync', async (req, res) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ erro: 'Não autenticado' });

  let config = ADMIN_EMAIL_CONFIG[adminId];
  if (!config) {
    config = await getEmailConfig(adminId);
    if (!config) {
      return res.status(400).json({ erro: 'Email não configurado' });
    }
  }

  const emails = [];
  let imap;

  try {
    // Timeout total de 25 segundos
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Sincronização excedeu tempo limite')), 25000)
    );

    const syncPromise = new Promise((resolve, reject) => {
      imap = new Imap({
        user: config.email,
        password: config.senha,
        host: config.imap_host,
        port: config.imap_port,
        tls: config.use_tls,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 8000,
        authTimeout: 8000
      });

      imap.on('error', reject);

      imap.on('ready', () => {
        console.log('[EMAIL SYNC] Conectado, abrindo INBOX...');

        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          console.log('[EMAIL SYNC] INBOX aberta, mensagens:', box.messages.total);

          if (box.messages.total === 0) {
            imap.end();
            return resolve();
          }

          const range = box.messages.total > 20
            ? box.messages.total - 19 + ':' + box.messages.total
            : '1:*';

          const f = imap.seq.fetch(range, { bodies: '' });
          let parseCount = 0;
          let parseFinished = 0;

          f.on('message', (msg, seqno) => {
            parseCount++;
            simpleParser(msg, (err, parsed) => {
              parseFinished++;
              if (err) {
                console.error('[EMAIL SYNC] Parse error:', err.message);
                return;
              }

              emails.push({
                id: seqno,
                from: parsed.from?.text || 'Desconhecido',
                to: parsed.to?.text || '',
                subject: parsed.subject || '(sem assunto)',
                text: parsed.text?.substring(0, 200) || '',
                html: parsed.html?.substring(0, 500) || '',
                date: parsed.date,
                full_text: parsed.text || '',
                full_html: parsed.html || ''
              });

              if (parseFinished === parseCount) {
                console.log('[EMAIL SYNC] Parse completo, encerrando...');
                imap.end();
                resolve();
              }
            });
          });

          f.on('error', reject);
          f.on('end', () => {
            if (parseCount === 0) {
              imap.end();
              resolve();
            }
          });
        });
      });

      imap.connect();
    });

    // Race condition: executa o que terminar primeiro (sucesso ou timeout)
    await Promise.race([syncPromise, timeoutPromise]);

    console.log('[EMAIL SYNC] ✓ Sincronizado:', emails.length, 'emails');
    res.json({ sucesso: true, emails });

  } catch (err) {
    console.error('[EMAIL SYNC] ✗ Erro:', err.message);
    if (imap) imap.end();

    res.status(400).json({
      erro: err.message || 'Erro ao sincronizar emails'
    });
  }
});

router.post('/send', async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ erro: 'Não autenticado' });

    const { para, assunto, corpo } = req.body;

    if (!para || !assunto || !corpo) {
      return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
    }

    let config = ADMIN_EMAIL_CONFIG[adminId];
    if (!config) {
      config = await getEmailConfig(adminId);
      if (!config) {
        return res.status(400).json({ erro: 'Email não configurado' });
      }
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.use_tls && config.smtp_port === 465,
      auth: {
        user: config.email,
        pass: config.senha
      },
      tls: config.use_tls ? { rejectUnauthorized: false } : false
    });

    await transporter.sendMail({
      from: config.email,
      to: para,
      subject: assunto,
      html: corpo.replace(/\n/g, '<br>')
    });

    res.json({ sucesso: true, mensagem: 'Email enviado com sucesso' });
  } catch (err) {
    console.error('Erro ao enviar email:', err);
    res.status(400).json({
      erro: err.message || 'Erro ao enviar email'
    });
  }
});

module.exports = router;
