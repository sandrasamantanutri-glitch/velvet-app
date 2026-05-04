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
      return JSON.parse(res.rows[0].email_config);
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

    const imap = new Imap({
      user: testConfig.email,
      password: testConfig.senha,
      host: testConfig.imap_host,
      port: testConfig.imap_port,
      tls: testConfig.use_tls,
      tlsOptions: { rejectUnauthorized: false }
    });

    await new Promise((resolve, reject) => {
      imap.openBox('INBOX', false, (err, box) => {
        imap.end();
        if (err) reject(err);
        else resolve();
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
    console.error('Erro ao configurar email:', err);
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

router.post('/sync', async (req, res) => {
  try {
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

    await new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.email,
        password: config.senha,
        host: config.imap_host,
        port: config.imap_port,
        tls: config.use_tls,
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.openBox('INBOX', false, async (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const range = box.messages.total > 20
          ? box.messages.total - 19 + ':' + box.messages.total
          : '1:*';

        const f = imap.seq.fetch(range, { bodies: '' });

        f.on('message', (msg, seqno) => {
          simpleParser(msg, async (err, parsed) => {
            if (err) {
              console.error('Erro ao fazer parse de email:', err);
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
          });
        });

        f.on('error', reject);
        f.on('end', () => {
          imap.end();
          setTimeout(resolve, 500);
        });
      });

      imap.openBox('INBOX', false, (err) => {
        if (err) reject(err);
      });
    });

    res.json({ sucesso: true, emails });
  } catch (err) {
    console.error('Erro ao sincronizar emails:', err);
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
