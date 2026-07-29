// ===========================
// VARIAVEIS
// ===========================
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const auth = require("./middleware/auth");
const authCliente = require("./middleware/authCliente");
const authModelo = require("./middleware/authModelo");
const authAdmin = require("./middleware/authAdmin");
const db = require("./db");
const AWS = require("aws-sdk");
const fs = require("fs");
const { enviarEmailAprovacao } = require("./email");
const { enviarEmailRejeicao } = require("./email");
const { criarNotificacaoAdmin } = require("./utils/notificacoesAdmin");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const rateLimit = require("express-rate-limit");

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos." }
});

const router = express.Router();   //PRIMEIRO SEMPRE

const crypto = require("crypto");
const bcrypt = require("bcrypt");

const allmessageJobs = new Map();

const cron = require("node-cron");
const requireRole = require("./middleware/requireRole");

// ===========================
// CLOUDFLARE R2
// ===========================

const s3Privado = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
  signatureVersion: "v4",
  s3ForcePathStyle: true
});

// ===========================
// GLOBAIS
// ===========================

router.use("/assets",
  express.static(path.join(__dirname, "admin-pages"))
);

// ===========================
// CHARGE BACK
// ===========================

cron.schedule("0 3 * * *", async () => {
  console.log("🔍 Verificando clientes com chargeback...");

  const { rows } = await db.query(`
    SELECT
      cliente_id,
      COUNT(*) AS total,
      SUM(valor_bruto) AS valor,
      MAX(created_at) AS ultimo
    FROM transacoes_agency
    WHERE status = 'chargeback'
      AND created_at >= NOW() - INTERVAL '60 days'
    GROUP BY cliente_id
    HAVING COUNT(*) >= 2
  `);

  for (const c of rows) {
    let nivel = "atencao";

    if (c.total >= 5 || Number(c.valor) >= 50) {
      nivel = "critico";
    } else if (c.total >= 3) {
      nivel = "alto";
    }

    await db.query(
      `
      INSERT INTO chargeback_alertas
        (cliente_id, nivel, total_chargebacks, valor_total, ultimo_chargeback)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (cliente_id)
      DO UPDATE SET
        nivel = EXCLUDED.nivel,
        total_chargebacks = EXCLUDED.total_chargebacks,
        valor_total = EXCLUDED.valor_total,
        ultimo_chargeback = EXCLUDED.ultimo_chargeback,
        ativo = true
      `,
      [
        c.cliente_id,
        nivel,
        c.total,
        c.valor,
        c.ultimo
      ]
    );
  }
});

// ===========================
// FUNCOES
// ===========================

// =========================
// CALCULAR VALORES PARA BD
// =========================

async function calcularValores({ modelo_id, valor_bruto, taxa_gateway }) {

  const regraRes = await db.query(`
    SELECT
      COALESCE(a.percentual_modelo, 0.70) AS percentual_modelo,
      COALESCE(a.percentual_agencia, 0) AS percentual_agencia,
      COALESCE(a.percentual_plataforma, 0.30) AS percentual_plataforma
    FROM modelos m
    LEFT JOIN agencias a ON a.id = m.agencia_id
    WHERE m.id = $1
  `, [modelo_id]);

  const regra = regraRes.rows[0];

  const bruto = Number(valor_bruto);
  const gateway = Number(taxa_gateway || 0);

  const percentualModelo = Number(regra.percentual_modelo);
  const percentualAgencia = Number(regra.percentual_agencia);
  const percentualPlataforma = Number(regra.percentual_plataforma);

  const valorModelo = bruto * percentualModelo;
  const valorAgencia = bruto * percentualAgencia;
  const valorVelvet = bruto * percentualPlataforma;

  return {
    valor_modelo: Number(valorModelo.toFixed(2)),
    agency_fee: Number(valorAgencia.toFixed(2)),
    velvet_fee: Number(valorVelvet.toFixed(2)),
    taxa_gateway: gateway
  };
}

// ===========================
// AUTH AGENCIAS
// ===========================

function authAgencia(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.sendStatus(401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "agencia") {
      return res.sendStatus(403);
    }

    req.agencia = decoded;
    next();

  } catch (err) {
    return res.sendStatus(401);
  }
}

// ===========================
// PPV
// ===========================

async function processarAllmessageJob(jobId, {
  modelo_id,
  texto,
  preco,
  conteudos,
  modo_teste
}) {
  const job = allmessageJobs.get(jobId);
  if (!job) return;

  try {
    const temConteudo = Array.isArray(conteudos) && conteudos.length > 0;
    const precoFinal = Number(preco) || 0;

    const clientesRes = await db.query(
      `
      SELECT cliente_id
      FROM vip_subscriptions
      WHERE modelo_id = $1
        AND ativo = true
      `,
      [modelo_id]
    );

    if (clientesRes.rowCount === 0) {
      job.status = "erro";
      job.error = "Nenhum assinante ativo encontrado";
      job.percentual = 0;
      job.finalizado_em = new Date().toISOString();
      return;
    }

    let clientes = clientesRes.rows;

    if (modo_teste) {
      clientes = clientes.slice(0, 1);
    }

    job.total = clientes.length;
    job.processados = 0;
    job.enviados = 0;
    job.falhas = 0;
    job.percentual = 0;
    job.status = "processando";
    job.error = null;

    for (const row of clientes) {
      const cliente_id = row.cliente_id;

      try {

        // 1) MENSAGEM DE TEXTO
        await db.query(
          `
          INSERT INTO messages
            (modelo_id, cliente_id, text, sender, visto, tipo)
          VALUES
            ($1, $2, $3, 'modelo', false, 'texto')
          `,
          [modelo_id, cliente_id, texto]
        );


        // 2) MENSAGEM DE CONTEÚDO + PACOTE
        if (temConteudo) {
       const msgRes = await db.query(
    `
    INSERT INTO messages
      (modelo_id, cliente_id, text, sender, preco, visto, tipo)
    VALUES
      ($1, $2, '', 'modelo', $3, false, 'conteudo_ppv_mass')
    RETURNING id
    `,
    [modelo_id, cliente_id, precoFinal]
  );

  const message_id = msgRes.rows[0].id;

  await db.query(
    `
    INSERT INTO conteudo_pacotes
      (cliente_id, modelo_id, preco, valor_total, status, message_id)
    VALUES
      ($1, $2, $3, $4, 'pendente', $5)
    `,
    [
      cliente_id,
      modelo_id,
      precoFinal,
      precoFinal,
      message_id
    ]
  );

  for (const conteudo_id of conteudos) {
    await db.query(
      `
      INSERT INTO messages_conteudos
        (message_id, conteudo_id)
      VALUES
        ($1, $2)
      `,
      [message_id, conteudo_id]
    );
  }
}

job.enviados++;

} catch (err) {
console.error(`❌ Falha ao enviar para cliente ${cliente_id}:`, err);
job.falhas++;
}

job.processados++;
job.percentual = job.total > 0
? Math.round((job.processados / job.total) * 100)
: 0;
}

job.status = "concluido";
job.percentual = 100;
job.finalizado_em = new Date().toISOString();

} catch (err) {

    console.error("❌ Erro geral no processarAllmessageJob:", err);

    job.status = "erro";

    job.error = err.message || "Erro interno no envio em massa";

    job.finalizado_em = new Date().toISOString();
  }
}

const { podeAlterarDadosBancarios } = require("./utils/dadosBancarios");

// ======================================
// ROTAS POST
// ======================================

// ===============================
// DADOS BANCARIOS INCLUIR ALTERAR
// ===============================

router.post("/modelo/dados-bancarios", authModelo, async (req, res) => {
  if (!podeAlterarDadosBancarios()) {
    return res.status(403).json({
      error: "Alterações bloqueadas no período de pagamento"
    });
  }

  const {
    pix_tipo,
    pix_chave,
    banco,
    agencia,
    conta,
    conta_tipo,
    titular_nome,
    titular_documento,
    confirmado_titular
  } = req.body;
  const tipo = (req.body.tipo || '').toLowerCase() || null;

  if (!confirmado_titular) {
    return res.status(400).json({
      error: "Confirmação de titularidade obrigatória"
    });
  }

  try {
    await db.query(`
      INSERT INTO modelo_dados_bancarios (
        modelo_id, tipo,
        pix_tipo, pix_chave,
        banco, agencia, conta, conta_tipo,
        titular_nome, titular_documento,
        confirmado_titular, status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'pendente')
      ON CONFLICT (modelo_id)
      DO UPDATE SET
        tipo = EXCLUDED.tipo,
        pix_tipo = EXCLUDED.pix_tipo,
        pix_chave = EXCLUDED.pix_chave,
        banco = EXCLUDED.banco,
        agencia = EXCLUDED.agencia,
        conta = EXCLUDED.conta,
        conta_tipo = EXCLUDED.conta_tipo,
        titular_nome = EXCLUDED.titular_nome,
        titular_documento = EXCLUDED.titular_documento,
        confirmado_titular = true,
        status = 'alteracao_pendente',
        atualizado_em = NOW()
    `, [
      req.modelo_id,
      tipo,
      pix_tipo,
      pix_chave,
      banco,
      agencia,
      conta,
      conta_tipo,
      titular_nome,
      titular_documento
    ]);

    const { rows: modeloNomeRows } = await db.query(
      "SELECT nome_exibicao, nome FROM modelos WHERE id = $1",
      [req.modelo_id]
    );
    const nomeModelo = modeloNomeRows[0]?.nome_exibicao || modeloNomeRows[0]?.nome || `Modelo #${req.modelo_id}`;

    await criarNotificacaoAdmin(db, req.app.get("io"), {
      tipo: "dados_bancarios",
      referencia_id: req.modelo_id,
      titulo: "Novos dados bancários pendentes",
      mensagem: `Modelo ${nomeModelo} enviou dados bancários para análise.`
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("ERRO DADOS BANCÁRIOS:", err);
    res.status(500).json({ error: "Erro interno ao salvar dados bancários" });
  }
});

router.post("/modelo/dados-bancarios/alterar", authModelo, async (req, res) => {
  if (!podeAlterarDadosBancarios()) {
    return res.status(403).json({
      error: "Alterações bloqueadas no período de pagamento"
    });
  }

  const {
    justificativa,
    pix_tipo,
    pix_chave,
    banco,
    agencia,
    conta,
    conta_tipo,
    titular_nome,
    titular_documento
  } = req.body;
  const tipo = (req.body.tipo || '').toLowerCase() || null;

  if (!justificativa) {
    return res.status(400).json({
      error: "Justificativa obrigatória"
    });
  }

  try {
    await db.query(`
      UPDATE modelo_dados_bancarios
      SET
        tipo = $1,
        pix_tipo = $2,
        pix_chave = $3,
        banco = $4,
        agencia = $5,
        conta = $6,
        conta_tipo = $7,
        titular_nome = $8,
        titular_documento = $9,
        justificativa = $10,
        status = 'alteracao_pendente',
        atualizado_em = NOW()
      WHERE modelo_id = $11
    `, [
      tipo,
      pix_tipo,
      pix_chave,
      banco,
      agencia,
      conta,
      conta_tipo,
      titular_nome,
      titular_documento,
      justificativa,
      req.modelo_id
    ]);

    const { rows: modeloNomeRows } = await db.query(
      "SELECT nome_exibicao, nome FROM modelos WHERE id = $1",
      [req.modelo_id]
    );
    const nomeModelo = modeloNomeRows[0]?.nome_exibicao || modeloNomeRows[0]?.nome || `Modelo #${req.modelo_id}`;

    await criarNotificacaoAdmin(db, req.app.get("io"), {
      tipo: "dados_bancarios",
      referencia_id: req.modelo_id,
      titulo: "Alteração de dados bancários pendente",
      mensagem: `Modelo ${nomeModelo} solicitou alteração de dados bancários.`
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("ERRO DADOS BANCÁRIOS:", err);
    res.status(500).json({ error: "Erro interno ao salvar dados bancários" });
  }
});

// ===========================
// PAGAMENTOS
// ===========================

// router.post("/admin/pagamentos/:id/pagar", auth, async (req, res) => { 
  
//   const { id } = req.params;
//     await db.query(
//       `
//       UPDATE modelo_pagamentos
//       SET
//         status = 'pago',
//         pago_em = NOW()
//       WHERE id = $1
//       `,
//       [id]
//     );

//     res.json({ ok: true });
//   }
// );

// router.post("/admin/fechar-pagamentos-modelo/:modeloId", auth, async (req, res) => {
//   const { modeloId } = req.params;

//   await db.query(`/* SQL acima */`, [modeloId]);

//     res.json({ ok: true });
//   }
// );

// ===========================
// PPV
// ===========================

router.post("/allmessage", auth, requireRole("admin", "modelo"),

  async (req, res) => {
    try {
      const { texto, preco, conteudos, modo_teste } = req.body;

      let modelo_id;

      if (req.user.role === "modelo") {
        const modeloRes = await db.query(
          "SELECT id FROM modelos WHERE user_id = $1",
          [req.user.id]
        );

        if (modeloRes.rowCount === 0) {
          return res.status(403).json({ error: "Modelo não encontrada" });
        }

        modelo_id = modeloRes.rows[0].id;
      } else {
        modelo_id = req.body.modelo_id;
      }

      if (!modelo_id || !texto) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const jobId = crypto.randomUUID();

      allmessageJobs.set(jobId, {
        jobId,
        status: "processando",
        modelo_id,
        total: 0,
        processados: 0,
        enviados: 0,
        falhas: 0,
        percentual: 0,
        modo_teste: !!modo_teste,
        criado_em: new Date().toISOString(),
        error: null
      });

      res.json({
        ok: true,
        jobId
      });

      processarAllmessageJob(jobId, {
        modelo_id,
        texto,
        preco,
        conteudos,
        modo_teste

      }).catch((err) => {
        console.error("❌ ERRO JOB ALLMESSAGE:", err);

        const job = allmessageJobs.get(jobId);
        if (job) {
          job.status = "erro";
          job.error = err.message;
        }
      });

    } catch (err) {
      console.error("❌ ERRO ALLMESSAGE ENVIO:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ===========================
// LOGINS
// ===========================

router.post("/agencia/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(401).json({ erro: "Credenciais inválidas" });
  }

  try {
    const result = await db.query(
      "SELECT id, email, nome, senha FROM agencias WHERE email = $1 LIMIT 1",
      [email.trim().toLowerCase()]
    );

    const agencia = result.rows[0];
    const senhaValida = agencia
      ? await bcrypt.compare(senha, agencia.senha)
      : false;

    if (!agencia || !senhaValida) {
      return res.status(401).json({ erro: "Credenciais inválidas" });
    }

    // token_version existe após a migration add_token_version_to_agencias.sql
    let tv = 0;
    try {
      const tvRes = await db.query(
        "SELECT token_version FROM agencias WHERE id = $1 LIMIT 1",
        [agencia.id]
      );
      tv = tvRes.rows[0]?.token_version ?? 0;
    } catch (_) { /* coluna ainda não existe — aguardando migration */ }

    const token = jwt.sign(
      { id: agencia.id, email: agencia.email, role: "agencia", tv },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      agencia: {
        id: agencia.id,
        nome: agencia.nome,
        email: agencia.email
      }
    });

  } catch (err) {
    console.error("Erro login agência:", err);
    res.status(500).json({ erro: "Erro interno" });
  }
});


router.post("/admin/login", adminLoginLimiter, async (req, res) => {

  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const ip = req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip;

  try {
    const adminRes = await db.query(
      "SELECT id, email, senha, token_version FROM admin WHERE email = $1 LIMIT 1",
      [email.trim().toLowerCase()]
    );

    const adminData = adminRes.rows[0];

    const senhaValida = adminData
      ? await bcrypt.compare(senha, adminData.senha)
      : false;

    if (!adminData || !senhaValida) {
      await db.query(
        `INSERT INTO admin_seguranca_historico (admin_id, acao, motivo, data)
         VALUES (NULL, 'login_falhou', $1, NOW())`,
        [`Tentativa de login falhou. Email: ${email.trim().toLowerCase()} | IP: ${ip}`]
      ).catch(() => {});
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const tv = adminData.token_version ?? 0;

    const token = jwt.sign(
      { id: adminData.id, role: "admin", tv },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    await db.query(
      `INSERT INTO admin_seguranca_historico (admin_id, acao, motivo, data)
       VALUES ($1, 'login_sucesso', $2, NOW())`,
      [adminData.id, `Login bem-sucedido | IP: ${ip}`]
    ).catch(() => {});

    const isProd = process.env.NODE_ENV === "production";
    const cookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      path: "/",
      maxAge: 12 * 60 * 60 * 1000
    };

    res.cookie("admin_session", token, cookieOpts);
    // Indicador não-httpOnly para que o JS saiba que existe uma sessão ativa
    res.cookie("admin_li", "1", { ...cookieOpts, httpOnly: false });

    res.json({ ok: true });

  } catch (err) {
    console.error("Erro login admin:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/admin/logout", auth, authAdmin, async (req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie("admin_session", { path: "/", secure: isProd, sameSite: "strict" });
  res.clearCookie("admin_li",      { path: "/", secure: isProd, sameSite: "strict" });
  res.json({ ok: true });
});

router.get("/admin/modelo/:id/historico-bancario", auth, authAdmin, async (req,res)=>{

const { id } = req.params;

const page = Number(req.query.page) || 1;
const limit = 10;
const offset = (page - 1) * limit;

try{

const totalRes = await db.query(`
SELECT COUNT(*)
FROM modelo_dados_bancarios
WHERE modelo_id = $1
`,[id]);

const total = Number(totalRes.rows[0].count);
const totalPages = Math.ceil(total / limit);

const result = await db.query(`
SELECT
titular_nome,
banco,
agencia,
conta,
pix_chave,
status,
criado_em
FROM modelo_dados_bancarios
WHERE modelo_id = $1
ORDER BY criado_em DESC
LIMIT $2 OFFSET $3
`,[id,limit,offset]);

res.json({
dados: result.rows,
page,
totalPages
});

}catch(err){
console.error("Erro histórico bancário:", err);
res.status(500).json({error:"Erro ao buscar histórico"});
}

});

// ===========================
// CLIENTES
// ===========================

router.get("/transacoes_cliente", authCliente, async (req, res) => {
  try {
    const role = req.user.role;

    if (role !== "cliente") {
      return res.status(403).json({ error: "Apenas cliente pode acessar" });
    }

    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [req.user.id]
    );

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const clienteId = clienteRes.rows[0].id;

    const vipQuery = await db.query(`
      SELECT
        id,
        'assinatura' AS tipo,
        valor_total AS valor,
        CASE 
          WHEN ativo = true THEN 'pago'
          ELSE 'inativo'
        END AS status,
        created_at
      FROM vip_subscriptions
      WHERE cliente_id = $1
    `, [clienteId]);

    const conteudoQuery = await db.query(`
      SELECT
        id,
        'midia' AS tipo,
        valor_total AS valor,
        status,
        criado_em AS created_at
      FROM conteudo_pacotes
      WHERE cliente_id = $1
    `, [clienteId]);

    const transacoes = [
      ...vipQuery.rows,
      ...conteudoQuery.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(transacoes);

  } catch (err) {
    console.error("Erro buscar transações cliente:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/cliente/transacoes", authCliente, async (req, res) => {
  try {
    const clienteRes = await db.query(
  "SELECT id FROM clientes WHERE user_id = $1",
  [req.user.id]
);

if (clienteRes.rowCount === 0) {
  return res.status(404).json({ error: "Cliente não encontrado" });
}

const clienteId = clienteRes.rows[0].id;

    const conteudos = await db.query(`
      SELECT
        'conteudo' AS tipo,
        cp.id,
        cp.modelo_id,
        cp.valor_total AS valor,
        cp.status,
        cp.criado_em AS created_at,
        cp.message_id
      FROM conteudo_pacotes cp
      WHERE cp.cliente_id = $1
        AND cp.status = 'pago'
    `, [clienteId]);

    const assinaturas = await db.query(`
      SELECT
        'assinatura' AS tipo,
        v.id,
        v.modelo_id,
        (
          v.valor_assinatura +
          v.taxa_transacao +
          v.taxa_plataforma
        ) AS valor,
        CASE
          WHEN v.ativo THEN 'ativa'
          ELSE 'inativa'
        END AS status,
        v.created_at,
        NULL AS message_id
      FROM vip_subscriptions v
      WHERE v.cliente_id = $1
    `, [clienteId]);

    // 🔀 Unifica e ordena
    const historico = [
      ...conteudos.rows,
      ...assinaturas.rows
    ].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    res.json(historico);

  } catch (err) {
    console.error("Erro histórico cliente:", err);
    res.status(500).json({ error: "Erro ao buscar histórico do cliente" });
  }
});

router.get("/cliente/subscricoes", auth, async (req, res) => {
  try {
    const clienteRes = await db.query(
      "SELECT id FROM clientes WHERE user_id = $1",
      [req.user.id]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const clienteId = clienteRes.rows[0].id;

    const result = await db.query(`
      SELECT 
        v.id,
        v.modelo_id,
        m.nome_exibicao AS modelo,
        v.created_at,
        v.expiration_at,
        v.ativo,
        v.recorrente
      FROM vip_subscriptions v
      JOIN modelos m ON m.id = v.modelo_id
      WHERE v.cliente_id = $1
      ORDER BY v.created_at DESC
    `, [clienteId]);

    res.json(result.rows);

  } catch (err) {
    console.error("Erro subscrições:", err);
    res.status(500).json({ error: "Erro ao buscar subscrições" });
  }
});

router.get("/access", authCliente, async (req, res) => {
  const message_id = Number(req.query.message_id);

  if (!Number.isInteger(message_id) || message_id <= 0) {

    return res.status(400).json({ error: "message_id inválido" });
  }

  const msgRes = await db.query(
    `
    SELECT id
    FROM messages
    WHERE id = $1
      AND cliente_id = $2
      AND visto = true
    `,
    [message_id, req.user.id]
  );

  if (msgRes.rowCount === 0) {
    return res.status(403).json({ error: "Conteúdo não liberado" });
  }

  const midiasRes = await db.query(
    `
    SELECT c.url, c.tipo
    FROM messages_conteudos mc
    JOIN conteudos c ON c.id = mc.conteudo_id
    WHERE mc.message_id = $1
    `,
    [message_id]
  );

  res.json({
    midias: midiasRes.rows.map(m => ({
      tipo: m.tipo,
      url: m.url
    }))
  });
});

// ===========================
// MODELOS
// ===========================

router.get("/modelo/transacoes",
  requireRole("modelo", "admin", "agente"),
  (req, res) => {
    res.sendFile(
      path.join(process.cwd(), "transacoes", "transacoes.html")
    );
  }
);

router.get("/transacoes", authModelo, async (req, res) => {
  try {
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [req.user.id]
    );

    if (!modeloRes.rows.length) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    const modelo_id = modeloRes.rows[0].id;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const { mes, desde } = req.query;

    let values = [modelo_id];
    let monthFilter = "";

    // dataInicio: início do período exibido — usado para filtrar pendentes no resumo
    const nowSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    let dataInicio = new Date(nowSP.getFullYear(), nowSP.getMonth(), 1).toISOString().split("T")[0];

    if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      const [ano, mesNum] = mes.split("-").map(Number);
      dataInicio = new Date(ano, mesNum - 1, 1).toISOString().split("T")[0];

      values.push(ano, mesNum);

      monthFilter = `
        AND EXTRACT(YEAR  FROM CASE WHEN disponivel_em IS NOT NULL THEN disponivel_em ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) = $2
        AND EXTRACT(MONTH FROM CASE WHEN disponivel_em IS NOT NULL THEN disponivel_em ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) = $3
      `;
    } else if (desde && /^\d{4}-(0[1-9]|1[0-2])$/.test(desde)) {
      const [ano, mesNum] = desde.split("-").map(Number);
      dataInicio = new Date(ano, mesNum - 1, 1).toISOString().split("T")[0];
      values.push(dataInicio);
      monthFilter = `
        AND COALESCE(disponivel_em, created_at AT TIME ZONE 'America/Sao_Paulo') >= $2::date
      `;
    }

    const dataValues = [...values, limit, offset];

    const sql = `
      SELECT
        id AS codigo,
        tipo,
        created_at,
        created_at AT TIME ZONE 'America/Sao_Paulo' AS created_at_sp,
        TO_CHAR(
          created_at AT TIME ZONE 'America/Sao_Paulo',
          'DD/MM/YYYY HH24:MI'
        ) AS created_at_sp_formatado,
        TO_CHAR(
          created_at AT TIME ZONE 'America/Sao_Paulo',
          'DD/MM/YYYY'
        ) AS data_sp,
        valor_modelo AS valor,
        status,
        gateway,
        disponivel_em,
        CASE
          WHEN gateway = 'stripe' AND (disponivel_em IS NULL OR disponivel_em > NOW()) THEN 'pendente'
          ELSE 'liberado'
        END AS disponibilidade,
        NULL AS message_id
      FROM transacoes_agency
      WHERE modelo_id = $1
        AND status = 'pago'
        ${monthFilter}
      ORDER BY created_at DESC
      LIMIT $${dataValues.length - 1}
      OFFSET $${dataValues.length}
    `;

    const countSql = `
      SELECT COUNT(*) AS count
      FROM transacoes_agency
      WHERE modelo_id = $1
        AND status = 'pago'
        ${monthFilter}
    `;

    // Totais liberado/pendente do recorte filtrado (mês selecionado, ou tudo se sem filtro)
    const resumoSql = `
      SELECT
        COALESCE(SUM(CASE WHEN gateway = 'stripe' AND (disponivel_em IS NULL OR disponivel_em > NOW())
                          THEN valor_modelo ELSE 0 END), 0) AS total_pendente,
        COALESCE(SUM(CASE WHEN NOT (gateway = 'stripe' AND (disponivel_em IS NULL OR disponivel_em > NOW()))
                          THEN valor_modelo ELSE 0 END), 0) AS total_liberado
      FROM transacoes_agency
      WHERE modelo_id = $1
        AND status = 'pago'
        ${monthFilter}
    `;

    // Totais do mês atual: liberado por disponivel_em (Stripe, apenas >= 2026-06-24) ou created_at; pendente por created_at >= dataInicio
    const resumoMesAtualSql = `
      SELECT
        COALESCE(SUM(CASE
          WHEN gateway = 'stripe' AND (disponivel_em IS NULL OR disponivel_em > NOW())
           AND created_at AT TIME ZONE 'America/Sao_Paulo' >= $2::date
          THEN valor_modelo ELSE 0 END), 0) AS total_pendente,
        COALESCE(SUM(CASE
          WHEN (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
           AND DATE_TRUNC('month', COALESCE(
                 CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                 created_at
               ) AT TIME ZONE 'America/Sao_Paulo')
               = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          THEN valor_modelo ELSE 0 END), 0) AS total_liberado
      FROM transacoes_agency
      WHERE modelo_id = $1
        AND status = 'pago'
    `;

    const [dados, total, resumo, resumoMesAtual] = await Promise.all([
      db.query(sql, dataValues),
      db.query(countSql, values),
      db.query(resumoSql, values),
      db.query(resumoMesAtualSql, [modelo_id, dataInicio])
    ]);

    const totalRegistros = parseInt(total.rows[0].count, 10);
    const totalPaginas = Math.ceil(totalRegistros / limit);

    res.json({
      registros: dados.rows,
      paginaAtual: page,
      totalPaginas,
      totalRegistros,
      totalLiberado: Number(resumo.rows[0]?.total_liberado || 0),
      totalPendente: Number(resumo.rows[0]?.total_pendente || 0),
      totalLiberadoMesAtual: Number(resumoMesAtual.rows[0]?.total_liberado || 0),
      totalPendenteMesAtual: Number(resumoMesAtual.rows[0]?.total_pendente || 0)
    });

  } catch (err) {
    console.error("Erro /transacoes:", err);
    res.status(500).json({
      registros: [],
      paginaAtual: 1,
      totalPaginas: 1,
      totalRegistros: 0
    });
  }
});

router.get("/transacoes/diario", auth, requireRole("admin", "modelo", "agente"),

  async (req, res) => {
    try {
      const { mes } = req.query;

      if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return res.status(400).json({
          error: "Formato de mês inválido (YYYY-MM)"
        });
      }

      const [ano, mesNum] = mes.split("-").map(Number);
      const { role } = req.user;

      let values = [ano, mesNum];
      let where = `
        status = 'pago'
        AND EXTRACT(YEAR  FROM CASE WHEN disponivel_em IS NOT NULL THEN disponivel_em ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) = $1
        AND EXTRACT(MONTH FROM CASE WHEN disponivel_em IS NOT NULL THEN disponivel_em ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) = $2
      `;

      if (role === "modelo") {
        const modeloRes = await db.query(
          "SELECT id FROM modelos WHERE user_id = $1",
          [req.user.id]
        );

        if (!modeloRes.rows.length) {
          return res.status(404).json({ error: "Modelo não encontrada" });
        }

        const modelo_id = modeloRes.rows[0].id;
        values.push(modelo_id);
        where += ` AND modelo_id = $${values.length}`;
      }

      const result = await db.query(
        `
        SELECT
          DATE(CASE WHEN disponivel_em IS NOT NULL THEN disponivel_em ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) AS dia,

          COALESCE(SUM(
            CASE WHEN tipo = 'midia' THEN valor_modelo END
          ), 0) AS ganhos_midias,

          COALESCE(SUM(
            CASE WHEN tipo = 'assinatura' THEN valor_modelo END
          ), 0) AS ganhos_assinaturas

        FROM transacoes_agency
        WHERE ${where}
        GROUP BY dia
        ORDER BY dia
        `,
        values
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Erro /transacoes/diario:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);

router.get("/transacoes/resumo-mensal", auth, requireRole("admin", "modelo", "agente"), async (req, res) => {
    try {
      const { mes } = req.query;

      if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return res.status(400).json({
          error: "Formato de mês inválido (YYYY-MM)"
        });
      }

      const [ano, mesNum] = mes.split("-").map(Number);
      const { role } = req.user;

      let values = [ano, mesNum];
      let where = `
        status = 'pago'
        AND EXTRACT(YEAR  FROM CASE WHEN disponivel_em IS NOT NULL THEN disponivel_em ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) = $1
        AND EXTRACT(MONTH FROM CASE WHEN disponivel_em IS NOT NULL THEN disponivel_em ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) = $2
      `;

      if (role === "modelo") {
        const modeloRes = await db.query(
          "SELECT id FROM modelos WHERE user_id = $1",
          [req.user.id]
        );

        if (!modeloRes.rows.length) {
          return res.status(404).json({ error: "Modelo não encontrada" });
        }

        const modelo_id = modeloRes.rows[0].id;
        values.push(modelo_id);
        where += ` AND modelo_id = $${values.length}`;
      }

      const result = await db.query(
        `
        SELECT
          COALESCE(SUM(valor_bruto), 0) AS total_bruto,
          COALESCE(SUM(taxa_gateway), 0) AS total_taxas,
          COALESCE(SUM(agency_fee), 0) AS total_agency,
          COALESCE(SUM(velvet_fee), 0) AS total_velvet,
          COALESCE(SUM(valor_modelo), 0) AS total_modelo,

          COALESCE(SUM(CASE WHEN tipo = 'assinatura' THEN valor_bruto END), 0) AS total_assinaturas,
          COALESCE(SUM(CASE WHEN tipo = 'midia' THEN valor_bruto END), 0) AS total_midias

        FROM transacoes_agency
        WHERE ${where}
        `,
        values
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Erro /transacoes/resumo-mensal:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);

router.get("/transacoes/resumo-anual", auth, requireRole("admin", "modelo"), async (req, res) => {

    try {
      const { ano } = req.query;

      if (!ano || !/^\d{4}$/.test(ano)) {
        return res.status(400).json({ error: "Formato de ano inválido (YYYY)" });
      }

      const anoNum = Number(ano);
      const { role } = req.user;

      let values = [anoNum];
      let where = `
        status = 'pago'
        AND EXTRACT(YEAR FROM CASE WHEN disponivel_em IS NOT NULL THEN disponivel_em ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) = $1
      `;

      if (role === "modelo") {
        const modeloRes = await db.query(
          "SELECT id FROM modelos WHERE user_id = $1",
          [req.user.id]
        );

        if (!modeloRes.rows.length) {
          return res.status(404).json({ error: "Modelo não encontrada" });
        }

        const modelo_id = modeloRes.rows[0].id;
        values.push(modelo_id);
        where += ` AND modelo_id = $${values.length}`;
      }

      const result = await db.query(
        `
        SELECT
          DATE_TRUNC('month', CASE WHEN disponivel_em IS NOT NULL THEN DATE(disponivel_em)::timestamp ELSE created_at AT TIME ZONE 'America/Sao_Paulo' END) AS mes,

          COALESCE(SUM(valor_bruto), 0) AS total_bruto,
          COALESCE(SUM(taxa_gateway), 0) AS total_taxas,
          COALESCE(SUM(agency_fee), 0) AS total_agency,
          COALESCE(SUM(velvet_fee), 0) AS total_velvet,
          COALESCE(SUM(valor_modelo), 0) AS total_modelo,

          COALESCE(SUM(CASE WHEN tipo = 'assinatura' THEN valor_bruto END), 0) AS total_assinaturas,
          COALESCE(SUM(CASE WHEN tipo = 'midia' THEN valor_bruto END), 0) AS total_midias

        FROM transacoes_agency
        WHERE ${where}
        GROUP BY mes
        ORDER BY mes
        `,
        values
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Erro /transacoes/resumo-anual:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);

router.get("/modelo/relatorio", (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "admin-pages", "relatorio.html")
  );
});

router.get("/content/transacoes", (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "content", "transacoes.html")
  );
});

router.get("/modelo/financeiro", authModelo, async (req, res) => {
  try {
    const modeloRes = await db.query(
      "SELECT id, nome_exibicao, nome FROM modelos WHERE user_id = $1",
      [req.user.id]
    );

    if (!modeloRes.rows.length) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    const modelo_id  = modeloRes.rows[0].id;
    const modeloNome = modeloRes.rows[0].nome_exibicao || modeloRes.rows[0].nome || `Modelo #${modelo_id}`;

    const mesFiltroParam = req.query.mes;
    if (mesFiltroParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesFiltroParam)) {
      const [ano, mesNum] = mesFiltroParam.split('-').map(Number);
      const fr = await db.query(`
        SELECT
          COALESCE(SUM(CASE
            WHEN tipo IN ('midia','conteudo')
             AND (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
             AND EXTRACT(YEAR  FROM COALESCE(
                   CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                   created_at
                 ) AT TIME ZONE 'America/Sao_Paulo') = $2
             AND EXTRACT(MONTH FROM COALESCE(
                   CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                   created_at
                 ) AT TIME ZONE 'America/Sao_Paulo') = $3
            THEN valor_modelo END), 0) AS mes_midias,
          COALESCE(SUM(CASE
            WHEN tipo = 'assinatura'
             AND (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
             AND EXTRACT(YEAR  FROM COALESCE(
                   CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                   created_at
                 ) AT TIME ZONE 'America/Sao_Paulo') = $2
             AND EXTRACT(MONTH FROM COALESCE(
                   CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                   created_at
                 ) AT TIME ZONE 'America/Sao_Paulo') = $3
            THEN valor_modelo END), 0) AS mes_assinaturas,
          COALESCE(SUM(CASE
            WHEN gateway = 'stripe' AND (disponivel_em IS NULL OR disponivel_em > NOW())
             AND EXTRACT(YEAR  FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $2
             AND EXTRACT(MONTH FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $3
            THEN valor_modelo END), 0) AS bloqueado_mes
        FROM transacoes_agency
        WHERE modelo_id = $1
          AND status = 'pago'
      `, [modelo_id, ano, mesNum]);

      const row = fr.rows[0];
      const mesMidias     = Number(row.mes_midias     || 0);
      const mesAssinaturas = Number(row.mes_assinaturas || 0);
      return res.json({
        filtroMes: mesFiltroParam,
        mes: { midias: mesMidias, assinaturas: mesAssinaturas },
        bloqueado: { mes: Number(row.bloqueado_mes || 0) },
        modelo: { id: modelo_id, nome: modeloNome }
      });
    }

    // Competência: Stripe conta no mês da liberação (disponivel_em), mas apenas para
    // transações criadas a partir de 2026-06-24 — antes disso o pagamento já foi feito
    // pelo created_at e não pode ser recontado. PIX/ipag usam sempre created_at.
    const result = await db.query(
      `
      SELECT
        COALESCE(SUM(CASE
          WHEN tipo IN ('midia', 'conteudo')
           AND (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
           AND DATE(COALESCE(
                 CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                 created_at
               ) AT TIME ZONE 'America/Sao_Paulo')
               = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
          THEN valor_modelo
        END), 0) AS hoje_midias,

        COALESCE(SUM(CASE
          WHEN tipo = 'assinatura'
           AND (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
           AND DATE(COALESCE(
                 CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                 created_at
               ) AT TIME ZONE 'America/Sao_Paulo')
               = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
          THEN valor_modelo
        END), 0) AS hoje_assinaturas,

        COALESCE(SUM(CASE
          WHEN tipo IN ('midia', 'conteudo')
           AND (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
           AND DATE_TRUNC('month', COALESCE(
                 CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                 created_at
               ) AT TIME ZONE 'America/Sao_Paulo')
               = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          THEN valor_modelo
        END), 0) AS mes_midias,

        COALESCE(SUM(CASE
          WHEN tipo = 'assinatura'
           AND (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
           AND DATE_TRUNC('month', COALESCE(
                 CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                 created_at
               ) AT TIME ZONE 'America/Sao_Paulo')
               = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          THEN valor_modelo
        END), 0) AS mes_assinaturas,

        COALESCE(SUM(CASE
          WHEN tipo IN ('midia', 'conteudo')
           AND (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
           AND DATE_TRUNC('month', COALESCE(
                 CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                 created_at
               ) AT TIME ZONE 'America/Sao_Paulo')
               = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '1 month'
          THEN valor_modelo
        END), 0) AS mes_anterior_midias,

        COALESCE(SUM(CASE
          WHEN tipo = 'assinatura'
           AND (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
           AND DATE_TRUNC('month', COALESCE(
                 CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                 created_at
               ) AT TIME ZONE 'America/Sao_Paulo')
               = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '1 month'
          THEN valor_modelo
        END), 0) AS mes_anterior_assinaturas,

        COALESCE(SUM(CASE
          WHEN (gateway IS DISTINCT FROM 'stripe' OR (disponivel_em IS NOT NULL AND disponivel_em <= NOW()))
           AND EXTRACT(YEAR FROM COALESCE(
                 CASE WHEN created_at AT TIME ZONE 'America/Sao_Paulo' >= '2026-06-24' THEN disponivel_em END,
                 created_at
               ) AT TIME ZONE 'America/Sao_Paulo')
               = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')
          THEN valor_modelo
        END), 0) AS acumulado_ano_atual,


        COALESCE(SUM(CASE
          WHEN gateway = 'stripe' AND (disponivel_em IS NULL OR disponivel_em > NOW())
           AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
               = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
          THEN valor_modelo
        END), 0) AS bloqueado_hoje,

        COALESCE(SUM(CASE
          WHEN gateway = 'stripe' AND (disponivel_em IS NULL OR disponivel_em > NOW())
           AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo')
               = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
          THEN valor_modelo
        END), 0) AS bloqueado_mes,

        COALESCE(SUM(CASE
          WHEN gateway = 'stripe' AND (disponivel_em IS NULL OR disponivel_em > NOW())
           AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo')
               = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '1 month'
          THEN valor_modelo
        END), 0) AS bloqueado_mes_anterior

      FROM transacoes_agency
      WHERE modelo_id = $1
        AND status = 'pago'
      `,
      [modelo_id]
    );

    const r = result.rows[0];

    const vipRes = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE ativo = true AND expiration_at > NOW()) AS total,
        COUNT(*) FILTER (
          WHERE ativo = true
            AND expiration_at > NOW()
            AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
                = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
        ) AS hoje
      FROM vip_subscriptions
      WHERE modelo_id = $1`,
      [modelo_id]
    );
    const vr = vipRes.rows[0];

    res.json({
      hoje: {
        midias: Number(r.hoje_midias || 0),
        assinaturas: Number(r.hoje_assinaturas || 0)
      },
      mes: {
        midias: Number(r.mes_midias || 0),
        assinaturas: Number(r.mes_assinaturas || 0)
      },
      mesAnterior: {
        midias: Number(r.mes_anterior_midias || 0),
        assinaturas: Number(r.mes_anterior_assinaturas || 0)
      },
      total: {
        acumulado_ano_atual: Number(r.acumulado_ano_atual || 0)
      },
      assinantes: {
        total: Number(vr.total || 0),
        hoje: Number(vr.hoje || 0)
      },
      bloqueado: {
        hoje: Number(r.bloqueado_hoje || 0),
        mes: Number(r.bloqueado_mes || 0),
        mesAnterior: Number(r.bloqueado_mes_anterior || 0)
      },
      modelo: { id: modelo_id, nome: modeloNome }
    });
  } catch (err) {
    console.error("Erro /modelo/financeiro:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/modelo/chargebacks", authModelo, async (req, res) => {
  try {
    const modeloRes = await db.query(
      "SELECT id FROM modelos WHERE user_id = $1",
      [req.user.id]
    );
    if (!modeloRes.rows.length) return res.status(404).json({ error: "Modelo não encontrada" });
    const modelo_id = modeloRes.rows[0].id;

    const mesFiltro = req.query.mes;
    let anoFiltro, mesFiltroNum, filtroMesClause;
    if (mesFiltro && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesFiltro)) {
      [anoFiltro, mesFiltroNum] = mesFiltro.split('-').map(Number);
      filtroMesClause = `
        AND EXTRACT(YEAR  FROM cb.criado_em AT TIME ZONE 'America/Sao_Paulo') = ${anoFiltro}
        AND EXTRACT(MONTH FROM cb.criado_em AT TIME ZONE 'America/Sao_Paulo') = ${mesFiltroNum}
      `;
    } else {
      filtroMesClause = `
        AND EXTRACT(YEAR  FROM cb.criado_em AT TIME ZONE 'America/Sao_Paulo') = EXTRACT(YEAR  FROM NOW() AT TIME ZONE 'America/Sao_Paulo')
        AND EXTRACT(MONTH FROM cb.criado_em AT TIME ZONE 'America/Sao_Paulo') = EXTRACT(MONTH FROM NOW() AT TIME ZONE 'America/Sao_Paulo')
      `;
    }

    const { rows } = await db.query(`
      SELECT
        cb.id,
        cb.tipo,
        cb.data                                                                      AS data_compra,
        TO_CHAR(cb.data, 'DD/MM/YYYY')                                               AS data_compra_fmt,
        cb.criado_em                                                                 AS data_registro,
        TO_CHAR(cb.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')        AS data_fmt,
        cb.valor,
        cb.motivo,
        cb.gateway,
        cb.cliente_id,
        u.email                                                                      AS cliente_email,
        COALESCE(cd.nome_completo, u.email)                                         AS cliente_nome,
        cb.valor_modelo
      FROM chargebacks cb
      LEFT JOIN clientes c         ON c.id  = cb.cliente_id
      LEFT JOIN users u            ON u.id  = c.user_id
      LEFT JOIN clientes_dados cd  ON cd.cliente_id = cb.cliente_id
      WHERE cb.modelo_id = $1
        ${filtroMesClause}
      ORDER BY cb.criado_em DESC
    `, [modelo_id]);

    res.json(rows);
  } catch (err) {
    console.error("Erro /modelo/chargebacks:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/modelo/pagamentos", authModelo, async (req, res) => {
  try {
const modeloRes = await db.query(
  "SELECT id FROM modelos WHERE user_id = $1",
  [req.user.id]
);

const modelo_id = modeloRes.rows[0].id;

    const result = await db.query(
      `
      SELECT
        id,
        mes,
        total_midias,
        total_assinaturas,
        total_geral,
        chargebacks,
        bonus,
        bonus_tipo,
        status,
        pago_em,
        recibo_pdf_url
      FROM modelo_pagamentos
      WHERE modelo_id = $1
      ORDER BY mes DESC
      `,
      [modelo_id]
    );

    const rows = result.rows.map(p => {
      const pdf_url = p.recibo_pdf_url
        ? s3Privado.getSignedUrl('getObject', {
            Bucket: process.env.R2_BUCKET_PRIVATE,
            Key: p.recibo_pdf_url,
            Expires: 3600
          })
        : null;
      return { ...p, recibo_pdf_signed_url: pdf_url };
    });

    res.json(rows);

  } catch (err) {
    console.error("ERRO PAGAMENTOS:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/modelo/pagamentos/:id/recibo", authModelo, async (req, res) => {
  try {
    const modeloRes = await db.query("SELECT id FROM modelos WHERE user_id = $1", [req.user.id]);
    const modelo_id = modeloRes.rows[0]?.id;
    if (!modelo_id) return res.status(403).send('<h3>Acesso negado</h3>');

    const { rows } = await db.query(`
      SELECT mp.id, mp.modelo_id, mp.mes, mp.total_midias, mp.total_assinaturas,
             mp.total_geral, mp.status, mp.pago_em,
             mp.chargebacks, mp.valor_liquido, mp.bonus, mp.bonus_tipo,
             m.nome AS modelo_nome, m.nome_exibicao,
             md.nome_completo, md.endereco, md.cidade, md.estado,
             mdb.tipo AS pgto_tipo, mdb.pix_tipo, mdb.pix_chave,
             mdb.banco, mdb.agencia, mdb.conta, mdb.conta_tipo, mdb.titular_documento
      FROM modelo_pagamentos mp
      LEFT JOIN modelos m ON m.id = mp.modelo_id
      LEFT JOIN modelos_dados md ON md.modelo_id = mp.modelo_id
      LEFT JOIN modelo_dados_bancarios mdb ON mdb.modelo_id = mp.modelo_id
      WHERE mp.id = $1 AND mp.modelo_id = $2
    `, [req.params.id, modelo_id]);

    if (!rows.length) return res.status(404).send('<h3>Recibo não encontrado</h3>');

    const p = rows[0];
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const mesDate = new Date(p.mes);
    const anoMes  = mesDate.getUTCFullYear();
    const mesMes  = mesDate.getUTCMonth() + 1;

    const nomeCompleto  = p.nome_completo || p.nome_exibicao || p.modelo_nome || `Modelo #${p.modelo_id}`;
    const cpf           = p.titular_documento || '—';
    const endereco      = p.endereco || '—';
    const local         = [p.cidade, p.estado].filter(Boolean).join(' - ') || '—';
    const dataEmissao   = new Date().toLocaleDateString('pt-BR');
    const mesRefRaw     = mesDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const mesRefLabel   = mesRefRaw.charAt(0).toUpperCase() + mesRefRaw.slice(1);
    const reciboNum     = String(p.id).padStart(6, '0');
    const dataPagamento = p.pago_em ? new Date(p.pago_em).toLocaleDateString('pt-BR') : '—';
    const fmtBRL = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const pgtoTipo = (p.pgto_tipo || '').toLowerCase() || (p.pix_chave ? 'pix' : p.banco ? 'transferencia' : null);
    let tipoPagamento = '—';
    if (pgtoTipo === 'pix') tipoPagamento = `PIX — ${(p.pix_tipo || '').toUpperCase()}: ${p.pix_chave || '—'}`;
    else if (pgtoTipo === 'transferencia') tipoPagamento = `TED — Banco: ${p.banco || '—'} | Ag: ${p.agencia || '—'} | Conta: ${p.conta || '—'}${p.conta_tipo ? ' (' + p.conta_tipo + ')' : ''}`;

    const midias_liq      = Number(p.total_midias      || 0);
    const assinaturas_liq = Number(p.total_assinaturas || 0);
    const chargebacksVal  = Number(p.chargebacks        || 0);
    const bonusVal        = Number(p.bonus              || 0);
    const saldoLiquido    = midias_liq + assinaturas_liq;
    const totalPagar      = Number(p.valor_liquido || 0) || Number(p.total_geral || 0);

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<base href="${baseUrl}/">
<title>Recibo #${reciboNum} — Velvet</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f0f0;padding:20px;color:#222;font-size:13px}
.page{background:#fff;max-width:760px;margin:0 auto;padding:40px 50px;box-shadow:0 4px 20px rgba(0,0,0,.15)}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #7B2CFF;padding-bottom:20px;margin-bottom:24px}
.logo img{width:130px}
.ei{text-align:right}.ei h2{color:#7B2CFF;font-size:16px;font-weight:700}.ei p{color:#555;font-size:11px;line-height:1.7;margin-top:4px}
.ts{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
.ts h1{font-size:22px;font-weight:700;letter-spacing:1px}
.rm table{border-collapse:collapse}.rm td{padding:3px 8px;font-size:12px}.rm td:first-child{color:#888;font-weight:600}.rm td:last-child{font-weight:700;text-align:right}
.stamp{display:inline-block;border:2px solid #7B2CFF;color:#7B2CFF;padding:2px 12px;font-size:10px;font-weight:700;letter-spacing:2px;border-radius:3px;margin-top:6px}
.cs{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;background:#f9f5ff;padding:14px 18px;border-radius:8px;border-left:4px solid #7B2CFF}
.cs h4{color:#7B2CFF;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
.cs p{font-size:12px;color:#333;line-height:1.8}.cs p strong{color:#111}
.sec{margin-bottom:20px}
.sec-title{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7B2CFF;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e0d4ff}
.row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;border-bottom:1px solid #f0ebff}
.row:last-child{border-bottom:none}
.row .lbl{color:#444}.row .val{font-weight:600;text-align:right}
.row.sub .lbl{padding-left:16px;color:#666;font-size:12px}.row.sub .val{font-size:12px;font-weight:400}
.row.cb .val{color:#c0392b}.row.bon .val{color:#1a7f37}
.divider{border:none;border-top:2px solid #7B2CFF;margin:12px 0}
.row.total .lbl{font-size:15px;font-weight:700;color:#111}.row.total .val{font-size:16px;font-weight:700;color:#7B2CFF}
.pi{background:#f0f9f0;border:1px solid #c3e6cb;border-radius:6px;padding:12px 16px;margin-bottom:20px}
.pi h4{color:#27a745;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
.pi p{font-size:12px;color:#333;line-height:1.8}
.ft{border-top:1px solid #ddd;padding-top:12px;text-align:center;color:#888;font-size:10px;line-height:1.7}
.pbtn{display:block;margin:20px auto 0;padding:10px 32px;background:#7B2CFF;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600}
@media print{body{background:#fff;padding:0}.page{box-shadow:none;padding:20px}.pbtn{display:none}}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div class="logo"><img src="assets/velvet.png" alt="Velvet"></div>
    <div class="ei"><h2>Velvet Entertainment Ltda</h2><p>CNPJ: 66.615.892/0001-43<br>R Cel José Eusébio, 95 casa 13 — Higienópolis<br>São Paulo — SP — CEP 01.239-030<br>Tel: (11) 97752-7031</p></div>
  </div>
  <div class="ts">
    <h1>RECIBO DE PAGAMENTO</h1>
    <div class="rm">
      <table><tr><td>RECIBO Nº</td><td>#${reciboNum}</td></tr><tr><td>DATA EMISSÃO</td><td>${dataEmissao}</td></tr><tr><td>REFERÊNCIA</td><td>${mesRefLabel}</td></tr></table>
      <div class="stamp">ORIGINAL</div>
    </div>
  </div>
  <div class="cs">
    <div><h4>Beneficiário</h4><p><strong>Nome:</strong> ${nomeCompleto}<br><strong>CPF/Doc:</strong> ${cpf}<br><strong>Endereço:</strong> ${endereco}<br><strong>Cidade/UF:</strong> ${local}</p></div>
    <div><h4>Emissor</h4><p><strong>Empresa:</strong> Velvet Entertainment Ltda<br><strong>CNPJ:</strong> 66.615.892/0001-43<br><strong>Endereço:</strong> R Cel José Eusébio, 95 casa 13<br><strong>Cidade/UF:</strong> São Paulo/SP</p></div>
  </div>
  <div class="sec">
    <div class="sec-title">Composição do pagamento — ${mesRefLabel}</div>
    <div class="row"><span class="lbl" style="font-weight:600;">Saldo Bruto</span><span class="val" style="font-weight:600;">${fmtBRL(saldoLiquido + chargebacksVal)}</span></div>
    <div class="row sub"><span class="lbl">Mídias</span><span class="val">${fmtBRL(midias_liq)}</span></div>
    <div class="row sub"><span class="lbl">Assinaturas</span><span class="val">${fmtBRL(assinaturas_liq)}</span></div>
    ${chargebacksVal > 0 ? `<div class="row sub cb"><span class="lbl">Chargebacks / estornos</span><span class="val">− ${fmtBRL(chargebacksVal)}</span></div>` : ''}
    <hr class="divider">
    <div class="row"><span class="lbl">Saldo líquido</span><span class="val">${fmtBRL(saldoLiquido)}</span></div>
    ${bonusVal > 0 ? `<div class="row bon"><span class="lbl">Bônus</span><span class="val">+ ${fmtBRL(bonusVal)}</span></div>` : ''}
    <hr class="divider">
    <div class="row total"><span class="lbl">VALOR LÍQUIDO A RECEBER</span><span class="val">${fmtBRL(totalPagar)}</span></div>
  </div>
  <div class="pi">
    <h4>Dados do Pagamento</h4>
    <p><strong>Data do pagamento:</strong> ${dataPagamento} &nbsp;|&nbsp; <strong>Forma:</strong> ${tipoPagamento}</p>
  </div>
  <div class="ft">
    <p>Este documento comprova o repasse de receitas geradas na plataforma Velvet.</p>
    <p>Velvet Entertainment Ltda — CNPJ: 66.615.892/0001-43 — R Cel José Eusébio, 95 casa 13, Higienópolis, São Paulo/SP — CEP 01.239-030</p>
  </div>
</div>
<button class="pbtn" onclick="window.print()">🖨️ Salvar / Imprimir PDF</button>
</body></html>`);
  } catch (err) {
    console.error("Erro recibo modelo:", err);
    res.status(500).send('<h3>Erro ao gerar recibo</h3>');
  }
});

router.get("/modelo/dados-bancarios", authModelo, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT *
      FROM modelo_dados_bancarios
      WHERE modelo_id = $1
    `, [req.modelo_id]);

    if (!rows.length) {
      return res.json(null);
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro buscar dados bancários:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/modelo/clientes/:cliente_id/transacoes", authModelo, async (req, res) => {
  try {
    const cliente_id = Number(req.params.cliente_id);

    if (!Number.isInteger(cliente_id) || cliente_id <= 0) {
      return res.status(400).json({ error: "cliente_id inválido" });
    }

    const modeloRes = await db.query(
      `SELECT id FROM modelos WHERE user_id = $1 LIMIT 1`,
      [req.user.id]
    );

    if (!modeloRes.rowCount) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    const modelo_id = Number(modeloRes.rows[0].id);

    const clienteRes = await db.query(
      `
      SELECT
        c.id,
        c.nome,
        cd.avatar AS avatar_url
      FROM clientes c
      LEFT JOIN clientes_dados cd
        ON cd.cliente_id = c.id
      WHERE c.id = $1
      LIMIT 1
      `,
      [cliente_id]
    );

    if (!clienteRes.rowCount) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const resumoRes = await db.query(
      `
      SELECT
  COUNT(*) FILTER (WHERE t.status = 'pago')::int AS total_compras,
  COALESCE(SUM(CASE WHEN t.status = 'pago' THEN t.valor_bruto END), 0)::numeric(10,2) AS total_pago,
  COUNT(*) FILTER (
    WHERE t.status = 'pago'
      AND LOWER(COALESCE(t.tipo, '')) IN ('conteudo', 'midia')
  )::int AS conteudos_pagos,
  COUNT(*) FILTER (
    WHERE t.status = 'pago'
      AND LOWER(COALESCE(t.tipo, '')) = 'assinatura'
  )::int AS assinaturas
FROM transacoes_agency t
WHERE t.modelo_id = $1
  AND t.cliente_id = $2

      `,
      [modelo_id, cliente_id]
    );

    const transRes = await db.query(
      `
      SELECT
        t.id,
        CASE
          WHEN LOWER(COALESCE(t.tipo, '')) = 'conteudo' THEN 'midia'
          ELSE LOWER(COALESCE(t.tipo, ''))
        END AS tipo,
        t.created_at,
        t.valor_bruto,
        t.valor_modelo,
        t.status,
        t.aceitou_termos
      FROM transacoes_agency t
      WHERE t.modelo_id = $1
  AND t.cliente_id = $2
  AND t.status = 'pago'
      ORDER BY t.created_at DESC, t.id DESC
      `,
      [modelo_id, cliente_id]
    );

    return res.json({
      cliente: clienteRes.rows[0],
      resumo: {
        total_compras: Number(resumoRes.rows[0]?.total_compras || 0),
        total_pago: Number(resumoRes.rows[0]?.total_pago || 0),
        conteudos_pagos: Number(resumoRes.rows[0]?.conteudos_pagos || 0),
        assinaturas: Number(resumoRes.rows[0]?.assinaturas || 0)
      },
      totalRegistros: transRes.rowCount,
      registros: transRes.rows
    });

  } catch (err) {
    console.error("Erro ao buscar transações do cliente para a modelo:", err);
    return res.status(500).json({
      error: "Erro ao buscar transações",
      detalhe: err.message
    });
  }
});

// ===========================
// PPV
// ===========================

router.get("/allmessage/modelos", auth, requireRole("admin", "modelo"), async (req, res) => {
    try {
      const { role, id: user_id } = req.user;

       let sql = `
        SELECT
          m.id        AS modelo_id,
          m.nome      AS nome
        FROM modelos m
      `;
      let params = [];

      // modelo só vê a própria
      if (role === "modelo") {
        sql += ` WHERE m.user_id = $1 `;
        params.push(user_id);
      }

      sql += ` ORDER BY m.nome `;

      const result = await db.query(sql, params);
      res.json(result.rows);

    } catch (err) {
      console.error("❌ Erro ALLMESSAGE modelos:", err);
      res.status(500).json({ error: "Erro ao listar modelos" });
    }
  }
);

router.get("/allmessage/status/:jobId", auth, requireRole("admin", "modelo"), async (req, res) => {
    try {
      const { jobId } = req.params;

      const job = allmessageJobs.get(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job não encontrado ou expirado" });
      }

      res.json(job);
    } catch (err) {
      console.error("❌ ERRO STATUS ALLMESSAGE:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/allmessage/conteudos/:modelo_id", auth, requireRole("admin", "modelo"), async (req, res) => {
    try {
      const { modelo_id } = req.params;
      const { role, id: user_id } = req.user;

      if (role === "modelo") {
        const check = await db.query(
  `SELECT 1 FROM modelos WHERE id = $1 AND user_id = $2`,
  [modelo_id, user_id]
        );
        if (check.rowCount === 0) {
          return res.json([]);
        }
      }

      const result = await db.query(
        `
        SELECT
          id,
          url,
          thumbnail_url AS thumbnail
        FROM conteudos
        WHERE modelo_id = $1
          AND tipo_conteudo = 'venda'
        ORDER BY id DESC
        `,
        [modelo_id]
      );

      res.json(result.rows); // ✅ SEMPRE array

    } catch (err) {
      console.error("❌ Erro ALLMESSAGE conteudos:", err);
      res.json([]); // ⚠️ NUNCA retornar objeto
    }
  }
);

router.get("/modelo/conteudos", auth, authModelo, async (req, res) => {
  const modelo_id = req.user.id;

  const result = await db.query(
    `
    SELECT id, url, thumbnail
    FROM conteudos
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [modelo_id]
  );

  res.json(result.rows);
});

// ===========================
// AGENCIAS
// ===========================

router.get("/agencia/modelos", authAgencia, async (req, res) => {
  try {
    const agencia_id = req.agencia.id;

    const result = await db.query(
      "SELECT id, nome FROM modelos WHERE agencia_id = $1 ORDER BY nome",
      [agencia_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar modelos" });
  }
});

router.get("/agencia/modelo/:id", authAgencia, async (req, res) => {
  try {
    const agencia_id = req.agencia.id;
    const modelo_id = Number(req.params.id);

    if (!Number.isInteger(modelo_id) || modelo_id <= 0) {
      return res.status(400).json({ error: "Modelo inválida" });
    }

    const result = await db.query(
      `
      SELECT
        m.id,
        m.nome,

        /* ================= DIA ================= */

        COALESCE(SUM(CASE
          WHEN ta.data_sp = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
          THEN ta.valor_modelo
        END), 0) AS modelo_dia,

        COALESCE(SUM(CASE
          WHEN ta.data_sp = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
          THEN ta.agency_fee
        END), 0) AS agencia_dia,

        COALESCE(SUM(CASE
          WHEN ta.data_sp = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
          THEN ta.velvet_fee
        END), 0) AS velvet_dia,

        /* ================= MÊS ================= */

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('month', ta.data_sp) =
               DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          THEN ta.valor_modelo
        END), 0) AS modelo_mes,

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('month', ta.data_sp) =
               DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          THEN ta.agency_fee
        END), 0) AS agencia_mes,

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('month', ta.data_sp) =
               DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          THEN ta.velvet_fee
        END), 0) AS velvet_mes,

        /* ================= ANO ================= */

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('year', ta.data_sp) =
               DATE_TRUNC('year', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          THEN ta.valor_modelo
        END), 0) AS modelo_ano,

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('year', ta.data_sp) =
               DATE_TRUNC('year', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          THEN ta.agency_fee
        END), 0) AS agencia_ano,

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('year', ta.data_sp) =
               DATE_TRUNC('year', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          THEN ta.velvet_fee
        END), 0) AS velvet_ano

      FROM modelos m

      LEFT JOIN (
        SELECT
          modelo_id,
          valor_modelo,
          velvet_fee,
          agency_fee,
          (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
        FROM transacoes_agency
        WHERE status = 'pago'
      ) ta ON ta.modelo_id = m.id

      WHERE m.agencia_id = $1
        AND m.id = $2

      GROUP BY m.id, m.nome
      `,
      [agencia_id, modelo_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Modelo não encontrada" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ ERRO /agencia/modelo/:id:", err);
    res.status(500).json({ error: "Erro ao buscar dados da modelo" });
  }
});

router.get("/agencia/pagamentos", authAgencia, async (req, res) => {
  try {
    const agencia_id = req.agencia.id;

    const result = await db.query(`
      SELECT
        p.id,
        p.referencia_mes,
        p.valor_midias,
        p.valor_assinaturas,
        p.valor_total,
        p.data_pagamento,
        m.nome AS modelo_nome
      FROM pagamentos_agencia p
      JOIN modelos m ON m.id = p.modelo_id
      WHERE p.agencia_id = $1
      ORDER BY p.data_pagamento DESC
    `, [agencia_id]);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar pagamentos" });
  }
});

router.get("/agencia/me", authAgencia, async (req,res)=>{

  const agencia_id = req.agencia.id;

  const result = await db.query(
    "SELECT id, nome FROM agencias WHERE id = $1",
    [agencia_id]
  );

  if(!result.rowCount){
    return res.sendStatus(404);
  }

  res.json(result.rows[0]);
});

router.get("/agencia/dashboard", authAgencia, async (req, res) => {
  try {
    const agencia_id = req.agencia.id;

    const result = await db.query(
      `
      SELECT
        /* ================= HOJE ================= */

        COALESCE(SUM(CASE
          WHEN data_sp = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
           AND tipo = 'midia'
          THEN agency_fee
        END), 0) AS midias_hoje,

        COALESCE(SUM(CASE
          WHEN data_sp = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
           AND tipo = 'assinatura'
          THEN agency_fee
        END), 0) AS assinaturas_hoje,

        /* ================= MÊS ================= */

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('month', data_sp) =
               DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
           AND tipo = 'midia'
          THEN agency_fee
        END), 0) AS midias_mes,

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('month', data_sp) =
               DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
           AND tipo = 'assinatura'
          THEN agency_fee
        END), 0) AS assinaturas_mes,

        /* ================= TOTAIS ================= */

        COALESCE(SUM(CASE
          WHEN data_sp = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
          THEN agency_fee
        END), 0) AS total_hoje,

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('month', data_sp) =
               DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          THEN agency_fee
        END), 0) AS total_mes,

        COALESCE(SUM(CASE
          WHEN DATE_TRUNC('year', data_sp) =
               DATE_TRUNC('year', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
          THEN agency_fee
        END), 0) AS total_ano

      FROM (
        SELECT
          ta.tipo,
          ta.agency_fee,
          (ta.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
        FROM transacoes_agency ta
        INNER JOIN modelos m ON m.id = ta.modelo_id
        WHERE ta.status = 'pago'
          AND m.agencia_id = $1
      ) dados
      `,
      [agencia_id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro dashboard agência:", err);
    res.status(500).json({ error: "Erro ao carregar dashboard" });
  }
});

router.get("/admin/agencias", auth, authAdmin, async (req,res)=>{
  try{

    const result = await db.query(`
      SELECT id, nome
      FROM agencias
      ORDER BY nome ASC
    `);

    res.json(result.rows);

  } catch(err){
    console.error("Erro buscar agências:", err);
    res.status(500).json({ error:"Erro ao buscar agências" });
  }
});

// ===========================
// transacoes origem
// ===========================

router.get("/transacoes/origem",
  auth,
  requireRole("admin"),
  async (req, res) => {
    const result = await db.query(`
      SELECT origem_cliente,
             COUNT(*) AS clientes,
             SUM(valor_bruto) AS total
      FROM transacoes_agency
      WHERE status = 'pago'
      GROUP BY origem_cliente
    `);

    res.json(result.rows);
  }
);

// ===========================
// PUTS - ALTERACOES
// ===========================

// router.put("/admin/modelo/:id/feed", auth, authAdmin, async (req,res)=>{

// const modelo_id = Number(req.params.id);
// const { feed } = req.body;

// try{

// await db.query(`
// UPDATE modelos
// SET feed = $1
// WHERE id = $2
// `,[feed, modelo_id]);

// res.json({ feed });

// }catch(err){
// console.error("Erro alterar feed:",err);
// res.status(500).json({ error:"Erro alterar feed" });
// }

// });

// router.put("/admin/validar-modelo/:id", auth, authAdmin, async (req,res)=>{
//   const client = await db.connect();

//   try {
//     await client.query("BEGIN");

//     const modelo_id = Number(req.params.id);
//     const { status, motivo_rejeicao } = req.body;

// const modeloRes = await client.query(
//   "SELECT user_id, nome_exibicao FROM modelos WHERE id=$1",
//   [modelo_id]
// );

//     if(!modeloRes.rowCount){
//       throw new Error("Modelo não encontrada");
//     }

// const user_id = modeloRes.rows[0].user_id;
// const nome_modelo = modeloRes.rows[0].nome_exibicao;

//     const userRes = await client.query(
//       "SELECT role FROM users WHERE id=$1",
//       [user_id]
//     );

//     const roleAtual = userRes.rows[0].role;

//     const emailRes = await client.query(
//   "SELECT email FROM users WHERE id=$1",
//   [user_id]
// );

// const email = emailRes.rows[0]?.email;

//     if(status === "aprovado"){

//       // 🟣 Se for cliente → migrar
//       if(roleAtual === "cliente"){

//         // 1️⃣ Atualizar role
//         await client.query(
//           "UPDATE users SET role='modelo' WHERE id=$1",
//           [user_id]
//         );

//         // 2️⃣ Criar registro em modelos
//         await client.query(`
//           INSERT INTO modelos (user_id, nome_exibicao, created_at)
//           SELECT user_id, nome, NOW()
//           FROM clientes
//           WHERE user_id=$1
//           ON CONFLICT (user_id) DO NOTHING
//         `,[user_id]);

//         // 3️⃣ Copiar clientes_dados → modelos_dados
//         await client.query(`
//           INSERT INTO modelos_dados (
//             modelo_id,
//             nome_completo,
//             data_nascimento,
//             telefone,
//             endereco,
//             pais,
//             cidade,
//             estado,
//             instagram,
//             tiktok
//           )
//           SELECT
//             m.id,
//             cd.nome_completo,
//             cd.data_nascimento,
//             cd.telefone,
//             cd.endereco,
//             cd.pais,
//             cd.cidade,
//             cd.estado,
//             cd.instagram,
//             cd.tiktok
//           FROM clientes_dados cd
//           JOIN modelos m ON m.user_id = cd.cliente_id
//           WHERE cd.cliente_id=$1
//           ON CONFLICT (modelo_id) DO NOTHING
//         `,[user_id]);
//       }

//       // 🔹 Marcar como verificada
//       await client.query(
//         "UPDATE modelos SET verificada=true WHERE id=$1",
//         [modelo_id]
//       );
//     }

//     // 🔹 Atualizar status da verificação
// await client.query(`
//   UPDATE modelos_verificacao
//   SET
//     status = $1,
//     motivo_rejeicao = $2,
//     verificado_em = NOW()
//   WHERE modelo_id = $3
// `,[
//   status,
//   motivo_rejeicao || null,
//   modelo_id
// ]);

//     await client.query("COMMIT");
  

// if(status === "aprovado" && email){
//   try{
//     await enviarEmailAprovacao(email);
//   }catch(e){
//     console.error("Erro enviar email aprovação:", e);
//   }
// }

// if(status === "rejeitado" && email){
//   try{
//     await enviarEmailRejeicao(email, motivo_rejeicao);
//   }catch(e){
//     console.error("Erro enviar email rejeição:", e);
//   }
// }
//     res.json({ message:"Processo concluído" });

//   } catch(err){
//     await client.query("ROLLBACK");
//     console.error(err);
//     res.status(500).json({ error:"Erro ao validar modelo" });
//   } finally {
//     client.release();
//   }
// });

// router.put("/admin/validar-cliente/:id", auth, authAdmin, async (req,res)=>{

//   const cliente_id = Number(req.params.id);
//   const { status, motivo_rejeicao } = req.body;

//   const client = await db.connect();
//    let email = null;
//   let nome_cliente = null;

//   try {
//     await client.query("BEGIN");

//     // 🔹 Atualiza status da verificação
//     await client.query(`
//       UPDATE clientes_verificacao
//       SET
//         status = $2,

//         motivo_rejeicao = $3,
//         verificado_em = NOW(),
//         atualizado_em = NOW()
//       WHERE cliente_id = $1
//     `,[cliente_id, status, motivo_rejeicao || "Não informado"]);

//     if (status === "aprovado") {

//   // 🔹 1️⃣ Buscar user_id do cliente
//   const userRes = await client.query(
//     "SELECT user_id, nome FROM clientes WHERE id = $1",
//     [cliente_id]
//   );

//   if (!userRes.rowCount) {
//     throw new Error("Cliente não encontrado");
//   }

//   const user_id = userRes.rows[0].user_id;
//   nome_cliente = userRes.rows[0].nome;

//   const emailRes = await client.query(
//   "SELECT email FROM users WHERE id=$1",
//   [user_id]
// );

// email = emailRes.rows[0]?.email;

//   // 🔹 2️⃣ Atualizar role no users
//   await client.query(
//     "UPDATE users SET role = 'modelo' WHERE id = $1",
//     [user_id]
//   );

//   // 🔹 3️⃣ Criar registro em modelos (copiando clientes → modelos)
//   await client.query(`
//     INSERT INTO modelos (
//       user_id,
//       nome,
//       nome_exibicao,
//       local,
//       bio,
//       avatar,
//       capa,
//       created_at,
//       verificada
//     )
//     SELECT
//       c.user_id,
//       c.nome,
//       cd.nome_exibicao,
//       cd.local,
//       cd.bio,
//       cd.avatar,
//       cd.capa,
//       NOW(),
//       true
//     FROM clientes c
//     LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
//     WHERE c.id = $1
//     ON CONFLICT (user_id) DO NOTHING
//   `, [cliente_id]);

//   // 🔹 4️⃣ Buscar modelo_id recém criado
//   const modeloRes = await client.query(
//     "SELECT id FROM modelos WHERE user_id = $1",
//     [user_id]
//   );

//   const modelo_id = modeloRes.rows[0].id;

//   // 🔹 5️⃣ Copiar clientes_dados → modelos_dados
//   await client.query(`
//     INSERT INTO modelos_dados (
//       modelo_id,
//       nome_completo,
//       data_nascimento,
//       telefone,
//       endereco,
//       pais,
//       cidade,
//       estado,
//       instagram,
//       tiktok,
//       vip_preco
//     )
//     SELECT
//       $1,
//       cd.nome_completo,
//       cd.data_nascimento,
//       cd.telefone,
//       cd.endereco,
//       cd.pais,
//       cd.cidade,
//       cd.estado,
//       cd.instagram,
//       cd.tiktok,
//       cd.vip_preco
//     FROM clientes_dados cd
//     WHERE cd.cliente_id = $2
//     ON CONFLICT (modelo_id) DO NOTHING
//   `, [modelo_id, cliente_id]);

//    await client.query(
//     "UPDATE clientes SET convertido_para_modelo = true WHERE id = $1",
//     [cliente_id]
//   );
// } 
//     await client.query("COMMIT");

//     if(status === "aprovado" && email){
//   try{
//     await enviarEmailAprovacao(email);
//   }catch(e){
//     console.error("Erro enviar email aprovação:", e);
//   }
// }

//     res.json({ success:true });

//   } catch (err) {

//     await client.query("ROLLBACK");
//     console.error("Erro validar cliente:", err);
//     res.status(500).json({ error:"Erro ao validar cliente" });

//   } finally {
//     client.release();
//   }
// });

// router.put("/admin/perfis/:id/editar", auth, authAdmin, async (req,res)=>{

//   const { id } = req.params;
//   const { tipo, dados } = req.body;

//   try{

//     if(tipo === "modelo"){

//       // Atualiza tabela modelos
//       await db.query(`
//         UPDATE modelos
//         SET nome_exibicao=$1,
//             local=$2,
//             bio=$3
//         WHERE id=$4
//       `,[
//         dados.nome_exibicao,
//         dados.local,
//         dados.bio,
//         id
//       ]);

//       // Atualiza modelos_dados
//       await db.query(`
//         UPDATE modelos_dados
//         SET nome_completo=$1,
//             data_nascimento=$2,
//             telefone=$3,
//             endereco=$4,
//             pais=$5,
//             estado=$6,
//             cidade=$7,
//             instagram=$8,
//             tiktok=$9,
//             vip_preco=$10
//         WHERE modelo_id=$11
//       `,[
//         dados.nome_completo,
//         dados.data_nascimento,
//         dados.telefone,
//         dados.endereco,
//         dados.pais,
//         dados.estado,
//         dados.cidade,
//         dados.instagram,
//         dados.tiktok,
//         dados.vip_preco,
//         id
//       ]);

//     } else {
//       await db.query(`
//          UPDATE clientes_dados
//         SET nome_completo=$1,
//             data_nascimento=$2,
//             telefone=$3,
//             endereco=$4,
//             pais=$5,
//             estado=$6,
//             cidade=$7,
//             instagram=$8,
//             tiktok=$9,
//             vip_preco=$10,
//             nome_exibicao=$11,
//             local=$12,
//             bio=$13
//         WHERE cliente_id=$14
//       `,[
//         dados.nome_completo,
//         dados.data_nascimento,
//         dados.telefone,
//         dados.endereco,
//         dados.pais,
//         dados.estado,
//         dados.cidade,
//         dados.instagram,
//         dados.tiktok,
//         dados.vip_preco,
//         dados.nome_exibicao,
//         dados.local,
//         dados.bio,
//         id
//       ]);
//     }

//     res.json({ message:"Atualizado com sucesso" });

//   }catch(err){
//     console.error(err);
//     res.status(500).json({ error:"Erro ao atualizar dados" });
//   }
// });

// router.put("/admin/modelo/:id/agencia", auth, authAdmin, async (req,res)=>{

// const modelo_id = Number(req.params.id);
// const { agencia_id } = req.body;

// try{

// await db.query(`
// UPDATE modelos
// SET agencia_id = $1
// WHERE id = $2
// `,[
// agencia_id || null,
// modelo_id
// ]);

// let nome_agencia = "Sem agência";

// if(agencia_id){

// const ag = await db.query(`
// SELECT nome
// FROM agencias
// WHERE id=$1
// `,[agencia_id]);

// nome_agencia = ag.rows[0]?.nome || "Agência";

// }

// res.json({
// ok:true,
// nome_agencia,
// data:new Date()
// });

// }catch(err){
// console.error("Erro alterar agência:",err);
// res.status(500).json({error:"Erro alterar agência"});
// }

// });

// ===========================
// EXPORT PARA SERVER
// ===========================

module.exports = {
  router,
  calcularValores
};
