// servercontent.js
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

const router = express.Router();   // ⬅️ PRIMEIRO SEMPRE

const s3Privado = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.B2_ENDPOINT),
  accessKeyId: process.env.B2_KEY_ID_PRIVATE,
  secretAccessKey: process.env.B2_APP_KEY_PRIVATE,
  region: process.env.B2_REGION,
  signatureVersion: "v4",
  s3ForcePathStyle: true
});


// 🔓 assets do admin (HTML/CSS/JS)
router.use("/assets",
  express.static(path.join(__dirname, "admin-pages"))
);
const cron = require("node-cron");

const requireRole = require("./middleware/requireRole");

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


//RELATORIO FINANCEIROS

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

  // 🔥 CALCULAR PRIMEIRO O LÍQUIDO
  const liquido = bruto - gateway;

  const valorModelo = liquido * Number(regra.percentual_modelo);
  const valorAgencia = liquido * Number(regra.percentual_agencia);
  const valorVelvet = liquido * Number(regra.percentual_plataforma);

  return {
    valor_modelo: Number(valorModelo.toFixed(2)),
    agency_fee: Number(valorAgencia.toFixed(2)),
    velvet_fee: Number(valorVelvet.toFixed(2)),
    taxa_gateway: gateway
  };
}



function podeAlterarDadosBancarios() {
  const hoje = new Date();
  const dia = hoje.getDate();

  // bloqueia de 25 até 5
  if (dia >= 25 || dia <= 5) {
    return false;
  }

  return true;
}

//% MODELOS
async function getPercentualModelo(modelo_id) {
  const result = await db.query(`
    SELECT
      COALESCE(a.percentual_modelo, 0.70) AS percentual
    FROM modelos m
    LEFT JOIN agencias a ON a.id = m.agencia_id
    WHERE m.id = $1
  `, [modelo_id]);

  return Number(result.rows[0]?.percentual || 0.70);
}

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

//ROTASSSS POST ///////////////////
router.post("/modelo/dados-bancarios", authModelo, async (req, res) => {
//  if (!(await podeAlterarDadosBancarios(req.modelo_id))) {
//   return res.status(403).json({
//     error: "Alterações bloqueadas no período de pagamento"
//   });
// }

  const {
    tipo,
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

  if (!confirmado_titular) {
    return res.status(400).json({
      error: "Confirmação de titularidade obrigatória"
    });
  }
try{
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

  res.json({ ok: true });
   } catch (err) {
    console.error("ERRO DADOS BANCÁRIOS:", err);
    res.status(500).json({ error: "Erro interno ao salvar dados bancários" });
  }
});

router.post("/modelo/dados-bancarios/alterar", authModelo, async (req, res) => {
//   if (!(await podeAlterarDadosBancarios(req.modelo_id))) {
//   return res.status(403).json({
//     error: "Alterações bloqueadas no período de pagamento"
//   });
// }

  const {
    justificativa,
    tipo,
    pix_tipo,
    pix_chave,
    banco,
    agencia,
    conta,
    conta_tipo,
    titular_nome,
    titular_documento
  } = req.body;

  if (!justificativa) {
    return res.status(400).json({
      error: "Justificativa obrigatória"
    });
  }
  try{
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

  res.json({ ok: true });
   } catch (err) {
    console.error("ERRO DADOS BANCÁRIOS:", err);
    res.status(500).json({ error: "Erro interno ao salvar dados bancários" });
  }
});

router.post(
  "/admin/pagamentos/:id/pagar",
  auth,
  async (req, res) => {
    const { id } = req.params;

    await db.query(
      `
      UPDATE modelo_pagamentos
      SET
        status = 'pago',
        pago_em = NOW()
      WHERE id = $1
      `,
      [id]
    );

    res.json({ ok: true });
  }
);

router.post(
  "/admin/fechar-pagamentos-modelo/:modeloId",
  auth,
  async (req, res) => {
    const { modeloId } = req.params;

    await db.query(`/* SQL acima */`, [modeloId]);

    res.json({ ok: true });
  }
);

router.post("/transacoes", auth, async (req, res) => {
  try {
    const {
      modelo_id,
      cliente_id,
      tipo,
      valor_bruto,
      taxa_gateway,
    } = req.body;

    const valores = await calcularValores({
      modelo_id,
      valor_bruto,
      taxa_gateway
    });

    const result = await db.query(`
INSERT INTO transacoes_agency (
  modelo_id,
  cliente_id,
  tipo,
  valor_bruto,
  taxa_gateway,
  agency_fee,
  velvet_fee,
  valor_modelo,
  status
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pago')
      RETURNING *
    `, [
      modelo_id,
      cliente_id,
      tipo,
      valor_bruto,
      valores.taxa_gateway,
      valores.agency_fee,
      valores.velvet_fee,
      valores.valor_modelo,
    ]);

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao criar transação" });
  }
});


// router.post("/transacoes/:id/chargeback",
//   auth,
//   requireRole("admin", "modelo"),
//   async (req, res) => {

//     const { result } = req.body; // won | lost

//     await db.query(
//       `
//       UPDATE transacoes
//       SET status = 'chargeback',
//           chargeback_result = $1,
//           valor_modelo = 0
//       WHERE id = $2
//       `,
//       [result, req.params.id]
//     );

//     res.json({ ok: true });
//   }
// );

// ===============================
// 📣 ALLMESSAGE - ENVIO EM MASSA
// ===============================
router.post(
  "/allmessage",
  auth,
  requireRole("admin", "modelo"),
  async (req, res) => {
    try {
      const {
  texto,
  preco,
  conteudos,
  modo_teste
} = req.body;

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
  // admin pode enviar manualmente
  modelo_id = req.body.modelo_id;
}


      // ===============================
      // 🔒 VALIDAÇÕES BÁSICAS
      // ===============================
      if (!modelo_id || !texto) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const temConteudo =
        Array.isArray(conteudos) && conteudos.length > 0;

      const precoFinal = Number(preco) || 0;

      // ===============================
      // 🔍 BUSCAR ASSINANTES ATIVOS
      // ===============================
      let vipQuery = `
        SELECT cliente_id
        FROM vip_subscriptions
        WHERE modelo_id = $1
          AND ativo = true
      `;
      const vipParams = [modelo_id];

      const clientesRes = await db.query(vipQuery, vipParams);

      if (clientesRes.rowCount === 0) {
        return res.status(400).json({
          error: "Nenhum assinante ativo encontrado"
        });
      }

      // ===============================
      // 🔁 ENVIO INDIVIDUAL
      // ===============================
      for (const row of clientesRes.rows) {
        const cliente_id = row.cliente_id;

        // 1️⃣ MENSAGEM DE TEXTO (SEMPRE)
        await db.query(
          `
          INSERT INTO messages
            (modelo_id, cliente_id, text, sender, visto, tipo)
          VALUES
            ($1, $2, $3, 'modelo', false, 'texto')
          `,
          [modelo_id, cliente_id, texto]
        );

        // 2️⃣ CONTEÚDO (GRÁTIS OU PAGO)
        if (temConteudo) {
          const msgRes = await db.query(
            `
            INSERT INTO messages
              (modelo_id, cliente_id, text, sender, preco, visto, tipo)
            VALUES
              ($1, $2, '', 'modelo', $3, false, 'conteudo')
            RETURNING id
            `,
            [modelo_id, cliente_id, precoFinal]
          );

          const message_id = msgRes.rows[0].id;

          // 3️⃣ PACOTE DE CONTEÚDO (preço pode ser 0)
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

          // 4️⃣ VINCULAR CONTEÚDOS
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
      }

      // ===============================
      // ✅ RESPOSTA FINAL
      // ===============================
      res.json({
        ok: true,
        enviados: clientesRes.rowCount,
        modo_teste: !!modo_teste
      });

    } catch (err) {
      console.error("❌ ERRO ALLMESSAGE ENVIO:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

const bcrypt = require("bcrypt");

router.post("/agencia/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    const result = await db.query(
      "SELECT * FROM agencias WHERE email = $1",
      [email]
    );

    if (!result.rowCount) {
      return res.status(401).json({ error: "Agência não encontrada" });
    }

    const agencia = result.rows[0];

    const senhaValida = await bcrypt.compare(senha, agencia.senha);

    if (!senhaValida) {
      return res.status(401).json({ error: "Senha inválida" });
    }

    const token = jwt.sign(
      { id: agencia.id, role: "agencia" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/agencia/modelo/:id/solicitar-percentual", authAgencia, async (req,res)=>{
  try{

    const agencia_id = req.agencia.id;
    const modelo_id = Number(req.params.id);
    const { percentual_modelo } = req.body;

    const modeloPercent = Number(percentual_modelo);

    /* =========================================
       🔒 VALIDAR MODELO PERTENCE À AGÊNCIA
    ========================================= */

    const modeloAtual = await db.query(`
      SELECT percentual_modelo, percentual_agencia
      FROM modelos
      WHERE id = $1
      AND agencia_id = $2
    `,[modelo_id, agencia_id]);

    if(!modeloAtual.rowCount){
      return res.status(403).json({error:"Modelo inválida"});
    }

    /* =========================================
       🔒 VALIDAR LIMITES
    ========================================= */

    if(isNaN(modeloPercent)){
      return res.status(400).json({error:"Percentual inválido"});
    }

    if(modeloPercent < 50 || modeloPercent > 80){
      return res.status(400).json({
        error:"Modelo deve ficar entre 50% e 80%."
      });
    }

    /* =========================================
       🔒 CALCULAR AUTOMÁTICO AGÊNCIA
    ========================================= */

    const percentual_agencia_novo = 80 - modeloPercent;

    /* =========================================
       🔒 IMPEDIR SOLICITAÇÃO DUPLICADA PENDENTE
    ========================================= */

    const solicitacaoPendente = await db.query(`
      SELECT 1
      FROM solicitacoes_percentual
      WHERE modelo_id = $1
      AND agencia_id = $2
      AND status = 'pendente'
      LIMIT 1
    `,[modelo_id, agencia_id]);

    if(solicitacaoPendente.rowCount){
      return res.status(400).json({
        error:"Já existe uma solicitação pendente."
      });
    }

    /* =========================================
       🔒 SALVAR SOLICITAÇÃO
    ========================================= */

    await db.query(`
      INSERT INTO solicitacoes_percentual
      (
        modelo_id,
        agencia_id,
        percentual_modelo_novo,
        percentual_agencia_novo,
        percentual_modelo_antigo,
        percentual_agencia_antigo,
        status,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,'pendente',NOW())
    `,[
      modelo_id,
      agencia_id,
      modeloPercent,
      percentual_agencia_novo,
      modeloAtual.rows[0].percentual_modelo,
      modeloAtual.rows[0].percentual_agencia
    ]);

    res.json({
      success:true,
      percentual_modelo_novo:modeloPercent,
      percentual_agencia_novo:percentual_agencia_novo,
      percentual_velvet:20
    });

  }catch(err){
    console.error(err);
    res.status(500).json({error:"Erro interno"});
  }
});

router.post("/admin/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    const admin = await db.query(
      "SELECT * FROM admin WHERE email = $1",
      [email]
    );

    if (!admin.rowCount) {
      return res.status(400).json({ error: "Admin não encontrado" });
    }

    const adminData = admin.rows[0];

    const senhaValida = await bcrypt.compare(senha, adminData.senha);

    if (!senhaValida) {
      return res.status(400).json({ error: "Senha inválida" });
    }

    const token = jwt.sign(
      { id: adminData.id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ token });

  } catch (err) {
    console.error("Erro login admin:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/admin/modelo/:id/validar-banco", auth, authAdmin, async (req,res)=>{

const modelo_id = Number(req.params.id);
const { status, motivo } = req.body;

await db.query(`
UPDATE modelo_dados_bancarios
SET
status = $1,
motivo_rejeicao = $2,
aprovado_em = CASE WHEN $4::text = 'aprovado' THEN NOW() ELSE NULL END
WHERE modelo_id = $3
`,[
status,
motivo || null,
modelo_id,
status === "aprovado"
]);

res.json({ ok:true });

});

router.post("/admin/modelo/:id/registrar-pagamento", auth, authAdmin, async (req,res)=>{

const modelo_id = Number(req.params.id);

const { mes, midias, assinaturas } = req.body;

const total_geral =
Number(midias || 0) + Number(assinaturas || 0);

try{

await db.query(`
INSERT INTO modelo_pagamentos
(modelo_id, mes, total_midias, total_assinaturas, total_geral, status)
VALUES ($1,$2,$3,$4,$5,'pendente')
`,[
modelo_id,
mes,
midias,
assinaturas,
total_geral
]);

res.json({ok:true});

}catch(err){
console.error("Erro registrar pagamento:",err);
res.status(500).json({error:"Erro registrar pagamento"});
}

});

// PÁGINA DE RELATÓRIOS

router.get("/relatorios",
  auth,
  requireRole("admin"),
  (req, res) => {
    res.sendFile(
      path.join(__dirname, "admin-pages", "chart.html")
    );
  }
);

router.get("/transacoes_cliente", authCliente, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let vipQuery;
    let conteudoQuery;

    if (role === "cliente") {

      vipQuery = await db.query(`
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
      `, [userId]);

      conteudoQuery = await db.query(`
        SELECT
          id,
          'midia' AS tipo,
          valor_total AS valor,
          status,
          criado_em AS created_at
        FROM conteudo_pacotes
        WHERE cliente_id = $1
      `, [userId]);

    } else {
      return res.status(403).json({ error: "Apenas cliente pode acessar" });
    }

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

// 🔐 ENDPOINT DE ACESSO AO CONTEÚDO
router.get("/access", authCliente, async (req, res) => {
  const message_id = Number(req.query.message_id);

  // 🔒 validação query/param
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

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const { mes } = req.query; // 👈 NOVO

    let values = [modelo_id];
    let monthFilter = "";

    if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      values.push(`${mes}-01`);
      monthFilter = `
        AND created_at >= date_trunc('month', $${values.length}::date)
        AND created_at <  date_trunc('month', $${values.length}::date) + interval '1 month'
      `;
    }

    values.push(limit, offset);

    const sql = `
      SELECT *
      FROM (
        -- 🔵 SISTEMA NOVO
        SELECT
          id AS codigo,
          tipo,
          created_at,
          valor_modelo AS valor,
          status,
          NULL AS message_id
        FROM transacoes_agency
        WHERE modelo_id = $1
          AND status = 'pago'
          ${monthFilter}

        UNION ALL

        -- 🟡 SISTEMA ANTIGO
SELECT
  id AS codigo,
  tipo,
  created_at,

  CASE
    WHEN tipo IN ('assinatura','midia','conteudo')
    THEN ROUND(valor_modelo * 0.70, 2)
    ELSE valor_modelo
  END AS valor,

  status,
  NULL AS message_id
FROM transacoes
WHERE modelo_id = $1
  AND status = 'pago'
  ${monthFilter}
      ) t
      ORDER BY created_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `;

    const countSql = `
      SELECT COUNT(*)
      FROM (
        SELECT id
        FROM transacoes_agency
        WHERE modelo_id = $1
          AND status = 'pago'
          ${monthFilter}

        UNION ALL

        SELECT id
        FROM transacoes
        WHERE modelo_id = $1
          AND status = 'pago'
          ${monthFilter}
      ) t
    `;

    const [dados, total] = await Promise.all([
      db.query(sql, values),
      db.query(countSql, values.slice(0, values.length - 2))
    ]);

    const totalRegistros = parseInt(total.rows[0].count);
    const totalPaginas = Math.ceil(totalRegistros / limit);

    res.json({
      registros: dados.rows,
      paginaAtual: page,
      totalPaginas,
      totalRegistros
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
        mes,
        total_midias,
        total_assinaturas,
        total_geral,
        status,
        pago_em
      FROM modelo_pagamentos
      WHERE modelo_id = $1
      ORDER BY mes DESC
      `,
      [modelo_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("ERRO PAGAMENTOS:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});



//ROTA DO LINK DE ACESSO A PLATAFORMA(CLIENTES INSTA TIKTOK)
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


router.get("/transacoes/diario",
  auth,
  requireRole("admin", "modelo", "agente"),
  async (req, res) => {

    const { mes } = req.query;

    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return res.status(400).json({
        error: "Formato de mês inválido (YYYY-MM)"
      });
    }

    const { role, id: modelo_id } = req.user;

    const dataBase = `${mes}-01`;

    let values = [dataBase];

    let where = `
      status = 'pago'
      AND created_at >= date_trunc('month', $1::date)
      AND created_at <  date_trunc('month', $1::date) + interval '1 month'
    `;

    if (role === "modelo") {
      values.push(modelo_id);
      where += ` AND modelo_id = $${values.length}`;
    }

    const result = await db.query(
`
SELECT
  DATE(created_at) AS dia,

  COALESCE(SUM(
    CASE WHEN tipo = 'midia' THEN valor_modelo END
  ),0) AS ganhos_midias,

  COALESCE(SUM(
    CASE WHEN tipo = 'assinatura' THEN valor_modelo END
  ),0) AS ganhos_assinaturas

FROM (

  -- 🔵 SISTEMA NOVO (já correto)
  SELECT
    tipo,
    created_at,
    valor_modelo,
    modelo_id,
    status
  FROM transacoes_agency

  UNION ALL

  -- 🟡 SISTEMA ANTIGO (normalizando bruto → líquido)
  SELECT
    tipo,
    created_at,

    CASE
      WHEN tipo IN ('assinatura','midia')
      THEN ROUND(valor_modelo * 0.70, 2)
      ELSE valor_modelo
    END AS valor_modelo,

    modelo_id,
    status
  FROM transacoes

) t

WHERE ${where}
GROUP BY dia
ORDER BY dia
`,
values
);

    res.json(result.rows);
  }
);


// router.get("/relatorios/chargebacks",
//   auth,
//   requireRole("admin"),
//   async (req, res) => {

//     const { inicio, fim } = req.query;

//     let where = `status = 'chargeback'`;
//     let values = [];

//     if (inicio && fim) {
//       values.push(inicio, fim);
//       where += ` AND created_at BETWEEN $1 AND $2`;
//     }

//     const result = await db.query(
//       `
//       SELECT
//         codigo,
//         tipo,
//         cliente_id,
//         modelo_id,
//         valor_bruto,
//         taxa_gateway,
//         velvet_fee,
//         chargeback_result,
//         origem_cliente,
//         created_at
//       FROM transacoes_agency
//       WHERE ${where}
//       ORDER BY created_at DESC
//       `,
//       values
//     );

//     res.json(result.rows);
//   }
// );


router.get("/transacoes/resumo-mensal",
  auth,
  requireRole("admin", "modelo", "agente"),
  async (req, res) => {
    const { mes } = req.query;

    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return res.status(400).json({ error: "Formato de mês inválido (YYYY-MM)" });
    }

    const { role, id: modelo_id } = req.user;

    const dataBase = `${mes}-01`;

    let values = [dataBase];

    let where = `
      status = 'pago'
      AND created_at >= date_trunc('month', $1::date)
      AND created_at <  date_trunc('month', $1::date) + interval '1 month'
    `;

    if (role === "modelo") {
      values.push(modelo_id);
      where += ` AND modelo_id = $${values.length}`;
    }

    const result = await db.query(
      `
      SELECT
        COALESCE(SUM(valor_bruto),0) AS total_bruto,
        COALESCE(SUM(taxa_gateway),0) AS total_taxas,
        COALESCE(SUM(agency_fee),0) AS total_agency,
        COALESCE(SUM(velvet_fee),0) AS total_velvet,
        COALESCE(SUM(valor_modelo),0) AS total_modelo,

        COALESCE(SUM(CASE WHEN tipo = 'assinatura' THEN valor_bruto END),0) AS total_assinaturas,
        COALESCE(SUM(CASE WHEN tipo = 'midia' THEN valor_bruto END),0) AS total_midias

      FROM (

        -- 🔵 SISTEMA NOVO
        SELECT
          tipo,
          created_at,
          valor_bruto,
          taxa_gateway,
          agency_fee,
          velvet_fee,
          valor_modelo,
          modelo_id,
          status
        FROM transacoes_agency

        UNION ALL

        -- 🟡 SISTEMA ANTIGO (VIEW congelada)
        SELECT
          tipo,
          created_at,
          valor_bruto,
          0 AS taxa_gateway,
          0 AS agency_fee,
          velvet_fee,
          valor_modelo,
          modelo_id,
          status
        FROM transacoes

      ) t

      WHERE ${where}
      `,
      values
    );

    res.json(result.rows[0]);
  }
);

// router.get("/relatorios/alertas-chargeback",
//   auth,
//   requireRole("admin"),
//   async (req, res) => {

//     const { rows } = await db.query(
//       `
//       SELECT *
//       FROM chargeback_alertas
//       WHERE ativo = true
//       ORDER BY
//         CASE nivel
//           WHEN 'critico' THEN 1
//           WHEN 'alto' THEN 2
//           ELSE 3
//         END,
//         ultimo_chargeback DESC
//       `
//     );

//     res.json(rows);
//   }
// );

router.get("/transacoes/resumo-anual",
  auth,
  requireRole("admin", "modelo"),
  async (req, res) => {
    const { ano } = req.query;
    const { role, id: modelo_id } = req.user;

    const inicio = `${ano}-01-01`;
    const fim = `${Number(ano) + 1}-01-01`;

    let values = [inicio, fim];

    let where = `
      status = 'pago'
      AND created_at >= $1
      AND created_at < $2
    `;

    if (role === "modelo") {
      values.push(modelo_id);
      where += ` AND modelo_id = $${values.length}`;
    }

    const result = await db.query(
      `
SELECT
  DATE_TRUNC('month', created_at) AS mes,

  COALESCE(SUM(valor_bruto),0) AS total_bruto,
  COALESCE(SUM(taxa_gateway),0) AS total_taxas,
  COALESCE(SUM(agency_fee),0) AS total_agency,
  COALESCE(SUM(velvet_fee),0) AS total_velvet,
  COALESCE(SUM(valor_modelo),0) AS total_modelo,

  COALESCE(SUM(CASE WHEN tipo='assinatura' THEN valor_bruto END),0) AS total_assinaturas,
  COALESCE(SUM(CASE WHEN tipo='midia' THEN valor_bruto END),0) AS total_midias

FROM (

  -- 🔵 SISTEMA NOVO
  SELECT
    tipo,
    created_at,
    valor_bruto,
    taxa_gateway,
    agency_fee,
    velvet_fee,
    valor_modelo,
    modelo_id,
    status
  FROM transacoes_agency

  UNION ALL

  -- 🟡 SISTEMA ANTIGO (VIEW congelada)
  SELECT
    tipo,
    created_at,
    valor_bruto,
    0 AS taxa_gateway,
    0 AS agency_fee,
    velvet_fee,
    valor_modelo,
    modelo_id,
    status
  FROM transacoes

) t

WHERE ${where}
GROUP BY mes
ORDER BY mes;
      `,
      values
    );

    res.json(result.rows);
  }
);
// router.get("/alertas/risco",
//   auth,
//   requireRole("admin"),
//   async (req, res) => {

//     const { rows } = await db.query(`
//       SELECT
//         cliente_id,
//         score,
//         nivel,
//         atualizado_em
//       FROM cliente_risco
//       WHERE nivel IN ('alto','critico')
//       ORDER BY score DESC
//     `);

//     res.json(rows);
//   }
// );

router.get("/modelo/relatorio", (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "admin-pages", "relatorio.html")
  );
});


router.get("/modelo/transacoes",
  requireRole("modelo", "admin", "agente"),
  (req, res) => {
    res.sendFile(
      path.join(process.cwd(), "transacoes", "transacoes.html")
    );
  }
);

router.get("/content/transacoes", (req, res) => {
  res.sendFile(
    path.join(process.cwd(), "content", "transacoes.html")
  );
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



router.get("/modelo/financeiro", authModelo, async (req, res) => {

  // 🔎 Buscar modelo_id real
  const modeloRes = await db.query(
    "SELECT id FROM modelos WHERE user_id = $1",
    [req.user.id]
  );

  if (!modeloRes.rows.length) {
    return res.status(404).json({ error: "Modelo não encontrada" });
  }

  const modelo_id = modeloRes.rows[0].id;

  // ===============================
  // 📊 QUERY FINANCEIRA (NOVO + ANTIGO)
  // ===============================
  const result = await db.query(`
    SELECT
      -- 🔹 HOJE
      COALESCE(SUM(CASE
        WHEN tipo IN ('midia','conteudo')
         AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')::date
             = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')::date
        THEN valor_modelo
      END), 0) AS hoje_midias,

      COALESCE(SUM(CASE
        WHEN tipo = 'assinatura'
         AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')::date
             = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')::date
        THEN valor_modelo
      END), 0) AS hoje_assinaturas,
      
      -- 🔹 MÊS ATUAL
      COALESCE(SUM(CASE
        WHEN tipo IN ('midia','conteudo')
         AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo')
             = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
        THEN valor_modelo
      END), 0) AS mes_midias,

      COALESCE(SUM(CASE
        WHEN tipo = 'assinatura'
         AND DATE_TRUNC('month', created_at AT TIME ZONE 'America/Sao_Paulo')
             = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
        THEN valor_modelo
      END), 0) AS mes_assinaturas,

      -- 🔹 ACUMULADO 2026
      COALESCE(SUM(CASE
        WHEN EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Sao_Paulo') = 2026
        THEN valor_modelo
      END), 0) AS acumulado_2026

    FROM (

      -- 🔵 SISTEMA NOVO
      SELECT
        tipo,
        created_at,
        valor_modelo
      FROM transacoes_agency
      WHERE modelo_id = $1
        AND status = 'pago'

      UNION ALL

-- 🟡 SISTEMA ANTIGO (normalizando bruto → líquido)
SELECT
  tipo,
  created_at,

  CASE
    WHEN tipo IN ('assinatura','midia','conteudo')
    THEN ROUND(valor_modelo * 0.70, 2)
    ELSE valor_modelo
  END AS valor_modelo

FROM transacoes
WHERE modelo_id = $1
  AND status = 'pago'
    ) t
  `, [modelo_id]);

  // ===============================
  // 👥 ASSINANTES (continua igual)
  // ===============================
  const assinantes = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE ativo = true) AS total,
      COUNT(*) FILTER (
        WHERE ativo = true
        AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
            = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
      ) AS hoje
    FROM vip_subscriptions
    WHERE modelo_id = $1;
  `, [modelo_id]);

  const r = result.rows[0];
  const a = assinantes.rows[0];

  res.json({
    hoje: {
      midias: Number(r.hoje_midias || 0),
      assinaturas: Number(r.hoje_assinaturas || 0)
    },
    mes: {
      midias: Number(r.mes_midias || 0),
      assinaturas: Number(r.mes_assinaturas || 0)
    },
    total: {
      acumulado_2026: Number(r.acumulado_2026 || 0)
    },
    assinantes: {
      total: Number(a.total || 0),
      hoje: Number(a.hoje || 0)
    }
  });
});


// ===============================
// 📣 ALLMESSAGE - LISTAR MODELOS
// ===============================
router.get(
  "/allmessage/modelos",
  auth,
  requireRole("admin", "modelo"),
  async (req, res) => {
    try {
      const { role, id: user_id } = req.user;

       let sql = `
        SELECT
          m.id        AS modelo_id,
          m.nome      AS nome
        FROM modelos m
      `;
      let params = [];

      // 🔒 modelo só vê a própria
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


// ===============================
// 📣 ALLMESSAGE - CONTEÚDOS DA MODELO
// ===============================
router.get("/allmessage/conteudos/:modelo_id",
  auth,
  requireRole("admin", "modelo"),
  async (req, res) => {
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

router.get("/modelo/dados-bancarios", authModelo, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * 
       FROM modelo_dados_bancarios 
       WHERE modelo_id = $1`,
      [req.modelo_id]
    );

    if (!rows.length) {
      return res.json(null);
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("Erro buscar dados bancários:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});


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

router.get("/admin/dashboard", auth, authAdmin, async (req, res) => {
  try {

    const mesParam = req.query.mes;
    let ano = null;
    let mes = null;

    if (mesParam) {
      const partes = mesParam.split("-");
      ano = Number(partes[0]);
      mes = Number(partes[1]);
    }

    const result = await db.query(`
      WITH base AS (
        SELECT
          valor_modelo,
          velvet_fee,
          agency_fee,
          taxa_gateway,
          (created_at AT TIME ZONE 'UTC'
           AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
        FROM transacoes_agency
        WHERE status = 'pago'

        UNION ALL

        SELECT
          ROUND(valor_bruto * 0.70,2) AS valor_modelo,
          ROUND(valor_bruto * 0.20,2) AS velvet_fee,
          ROUND(valor_bruto * 0.10,2) AS agency_fee,
          ROUND(valor_bruto * 0.15,2) AS taxa_gateway,
          (created_at AT TIME ZONE 'UTC'
           AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
        FROM transacoes
        WHERE status = 'pago'
      )

      SELECT

        /* ================= HOJE (sempre real) ================= */

        COALESCE(SUM(CASE WHEN data_sp = CURRENT_DATE THEN velvet_fee END),0) AS velvet_hoje,
        COALESCE(SUM(CASE WHEN data_sp = CURRENT_DATE THEN agency_fee END),0) AS agencia_hoje,
        COALESCE(SUM(CASE WHEN data_sp = CURRENT_DATE THEN taxa_gateway END),0) AS gateway_hoje,
        COALESCE(SUM(CASE WHEN data_sp = CURRENT_DATE THEN valor_modelo END),0) AS modelo_hoje,

        /* ================= MÊS SELECIONADO ================= */

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
           AND EXTRACT(MONTH FROM data_sp) = COALESCE($2, EXTRACT(MONTH FROM CURRENT_DATE))
          THEN velvet_fee END),0) AS velvet_mes,

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
           AND EXTRACT(MONTH FROM data_sp) = COALESCE($2, EXTRACT(MONTH FROM CURRENT_DATE))
          THEN agency_fee END),0) AS agencia_mes,

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
           AND EXTRACT(MONTH FROM data_sp) = COALESCE($2, EXTRACT(MONTH FROM CURRENT_DATE))
          THEN taxa_gateway END),0) AS gateway_mes,

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
           AND EXTRACT(MONTH FROM data_sp) = COALESCE($2, EXTRACT(MONTH FROM CURRENT_DATE))
          THEN valor_modelo END),0) AS totalm_mes,

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
           AND EXTRACT(MONTH FROM data_sp) = COALESCE($2, EXTRACT(MONTH FROM CURRENT_DATE))
          THEN (velvet_fee + agency_fee + taxa_gateway)
        END),0) AS total_mes,

        /* ================= ANO DO MÊS SELECIONADO ================= */

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
          THEN velvet_fee END),0) AS velvet_ano,

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
          THEN agency_fee END),0) AS agencia_ano,

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
          THEN taxa_gateway END),0) AS gateway_ano,

        COALESCE(SUM(CASE 
          WHEN EXTRACT(YEAR FROM data_sp) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
          THEN valor_modelo END),0) AS modelo_ano

      FROM base
    `, [ano, mes]);

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro dashboard admin:", err);
    res.status(500).json({ error: "Erro ao carregar dashboard" });
  }
});


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

    const result = await db.query(`
      SELECT
        m.id,
        m.nome,

        /* ================= DIA ================= */

        COALESCE(SUM(CASE WHEN data_sp = CURRENT_DATE THEN valor_modelo END),0) AS modelo_dia,
        COALESCE(SUM(CASE WHEN data_sp = CURRENT_DATE THEN agency_fee END),0) AS agencia_dia,
        COALESCE(SUM(CASE WHEN data_sp = CURRENT_DATE THEN velvet_fee END),0) AS velvet_dia,

        /* ================= MÊS ================= */

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month',data_sp)=DATE_TRUNC('month',CURRENT_DATE)
          THEN valor_modelo END),0) AS modelo_mes,

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month',data_sp)=DATE_TRUNC('month',CURRENT_DATE)
          THEN agency_fee END),0) AS agencia_mes,

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month',data_sp)=DATE_TRUNC('month',CURRENT_DATE)
          THEN velvet_fee END),0) AS velvet_mes,

        /* ================= ANO ================= */

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('year',data_sp)=DATE_TRUNC('year',CURRENT_DATE)
          THEN valor_modelo END),0) AS modelo_ano,

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('year',data_sp)=DATE_TRUNC('year',CURRENT_DATE)
          THEN agency_fee END),0) AS agencia_ano,

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('year',data_sp)=DATE_TRUNC('year',CURRENT_DATE)
          THEN velvet_fee END),0) AS velvet_ano

      FROM modelos m

      LEFT JOIN (

        /* ====== NOVO PADRÃO ====== */
        SELECT
          modelo_id,
          valor_modelo,
          velvet_fee,
          agency_fee,
          (created_at AT TIME ZONE 'UTC'
           AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
        FROM transacoes_agency
        WHERE status='pago'

        UNION ALL

        /* ====== DADOS ANTIGOS ====== */
        SELECT
          modelo_id,
          ROUND(valor_bruto * 0.70,2) AS valor_modelo,
          ROUND(valor_bruto * 0.20,2) AS velvet_fee,
          ROUND(valor_bruto * 0.10,2) AS agency_fee,
          (created_at AT TIME ZONE 'UTC'
           AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
        FROM transacoes
        WHERE status='pago'

      ) ta ON ta.modelo_id = m.id

      WHERE m.agencia_id = $1
        AND m.id = $2

      GROUP BY m.id, m.nome
    `, [agencia_id, modelo_id]);

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

//AGENCIAS
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

    const result = await db.query(`
      SELECT

        /* ================= HOJE ================= */

        COALESCE(SUM(CASE 
          WHEN data_sp = CURRENT_DATE AND tipo = 'midia'
          THEN agency_fee END),0) AS midias_hoje,

        COALESCE(SUM(CASE 
          WHEN data_sp = CURRENT_DATE AND tipo = 'assinatura'
          THEN agency_fee END),0) AS assinaturas_hoje,

        /* ================= MÊS ================= */

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month', data_sp) = DATE_TRUNC('month', CURRENT_DATE)
          AND tipo = 'midia'
          THEN agency_fee END),0) AS midias_mes,

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month', data_sp) = DATE_TRUNC('month', CURRENT_DATE)
          AND tipo = 'assinatura'
          THEN agency_fee END),0) AS assinaturas_mes,

        /* ================= TOTAIS ================= */

        COALESCE(SUM(CASE 
          WHEN data_sp = CURRENT_DATE
          THEN agency_fee END),0) AS total_hoje,

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month', data_sp) = DATE_TRUNC('month', CURRENT_DATE)
          THEN agency_fee END),0) AS total_mes,

        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('year', data_sp) = DATE_TRUNC('year', CURRENT_DATE)
          THEN agency_fee END),0) AS total_ano

      FROM (

        /* ================= NOVO PADRÃO ================= */
        SELECT
          ta.tipo,
          ta.agency_fee,
          (ta.created_at AT TIME ZONE 'UTC'
           AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
        FROM transacoes_agency ta
        INNER JOIN modelos m ON m.id = ta.modelo_id
        WHERE ta.status = 'pago'
          AND m.agencia_id = $1

        UNION ALL

        /* ================= DADOS ANTIGOS ================= */
        SELECT
          t.tipo,
          ROUND(t.valor_bruto * 0.85 * 0.10,2) AS agency_fee,
          (t.created_at AT TIME ZONE 'UTC'
           AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
        FROM transacoes t
        INNER JOIN modelos m ON m.id = t.modelo_id
        WHERE t.status = 'pago'
          AND m.agencia_id = $1

      ) dados
    `, [agencia_id]);

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro dashboard agência:", err);
    res.status(500).json({ error: "Erro ao carregar dashboard" });
  }
});

router.get("/admin/modelos", auth, authAdmin, async (req,res)=>{

  const result = await db.query(`
    SELECT m.id, m.nome
    FROM modelos m
    JOIN modelos_verificacao mv
      ON mv.modelo_id = m.id
    WHERE mv.status = 'aprovado'
    ORDER BY m.nome ASC
  `);

  res.json(result.rows);
});

router.get("/admin/modelo/:id", auth, authAdmin, async (req,res)=>{

  const modelo_id = Number(req.params.id);

  const mesParam = req.query.mes; // ex: 2026-03
  let ano = null;
  let mes = null;

  if (mesParam) {
    const partes = mesParam.split("-");
    ano = Number(partes[0]);
    mes = Number(partes[1]);
  }

  const result = await db.query(`
    WITH base AS (

      /* ================= NOVO PADRÃO ================= */
      SELECT
        valor_modelo,
        velvet_fee,
        agency_fee,
        taxa_gateway,
        (created_at AT TIME ZONE 'UTC'
         AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
      FROM transacoes_agency
      WHERE status='pago'
        AND modelo_id=$1

      UNION ALL

      /* ================= DADOS ANTIGOS ================= */
      SELECT
        ROUND(valor_bruto * 0.70,2) AS valor_modelo,
        ROUND(valor_bruto * 0.20,2) AS velvet_fee,
        ROUND(valor_bruto * 0.10,2) AS agency_fee,
        ROUND(valor_bruto * 0.15,2) AS taxa_gateway,
        (created_at AT TIME ZONE 'UTC'
         AT TIME ZONE 'America/Sao_Paulo')::date AS data_sp
      FROM transacoes
      WHERE status='pago'
        AND modelo_id=$1
    )

    SELECT
      m.nome,

      /* ================= DIA (sempre real) ================= */

      COALESCE(SUM(CASE WHEN data_sp=CURRENT_DATE THEN valor_modelo END),0) modelo_dia,
      COALESCE(SUM(CASE WHEN data_sp=CURRENT_DATE THEN agency_fee END),0) agencia_dia,
      COALESCE(SUM(CASE WHEN data_sp=CURRENT_DATE THEN velvet_fee END),0) velvet_dia,
      COALESCE(SUM(CASE WHEN data_sp=CURRENT_DATE THEN taxa_gateway END),0) gateway_dia,

      /* ================= MÊS SELECIONADO ================= */

      COALESCE(SUM(CASE 
        WHEN EXTRACT(YEAR FROM data_sp)=COALESCE($2, EXTRACT(YEAR FROM CURRENT_DATE))
         AND EXTRACT(MONTH FROM data_sp)=COALESCE($3, EXTRACT(MONTH FROM CURRENT_DATE))
        THEN valor_modelo END),0) modelo_mes,

      COALESCE(SUM(CASE 
        WHEN EXTRACT(YEAR FROM data_sp)=COALESCE($2, EXTRACT(YEAR FROM CURRENT_DATE))
         AND EXTRACT(MONTH FROM data_sp)=COALESCE($3, EXTRACT(MONTH FROM CURRENT_DATE))
        THEN agency_fee END),0) agencia_mes,

      COALESCE(SUM(CASE 
        WHEN EXTRACT(YEAR FROM data_sp)=COALESCE($2, EXTRACT(YEAR FROM CURRENT_DATE))
         AND EXTRACT(MONTH FROM data_sp)=COALESCE($3, EXTRACT(MONTH FROM CURRENT_DATE))
        THEN velvet_fee END),0) velvet_mes,

      COALESCE(SUM(CASE 
        WHEN EXTRACT(YEAR FROM data_sp)=COALESCE($2, EXTRACT(YEAR FROM CURRENT_DATE))
         AND EXTRACT(MONTH FROM data_sp)=COALESCE($3, EXTRACT(MONTH FROM CURRENT_DATE))
        THEN taxa_gateway END),0) gateway_mes,

      /* ================= ANO DO MÊS SELECIONADO ================= */

      COALESCE(SUM(CASE 
        WHEN EXTRACT(YEAR FROM data_sp)=COALESCE($2, EXTRACT(YEAR FROM CURRENT_DATE))
        THEN valor_modelo END),0) modelo_ano,

      COALESCE(SUM(CASE 
        WHEN EXTRACT(YEAR FROM data_sp)=COALESCE($2, EXTRACT(YEAR FROM CURRENT_DATE))
        THEN agency_fee END),0) agencia_ano,

      COALESCE(SUM(CASE 
        WHEN EXTRACT(YEAR FROM data_sp)=COALESCE($2, EXTRACT(YEAR FROM CURRENT_DATE))
        THEN velvet_fee END),0) velvet_ano,

      COALESCE(SUM(CASE 
        WHEN EXTRACT(YEAR FROM data_sp)=COALESCE($2, EXTRACT(YEAR FROM CURRENT_DATE))
        THEN taxa_gateway END),0) gateway_ano

    FROM base
    JOIN modelos m ON m.id=$1
    GROUP BY m.nome

  `,[modelo_id, ano, mes]);

  res.json(result.rows[0]);
});

router.get("/admin/perfis", auth, authAdmin, async (req,res)=>{

  const status = req.query.status || "em_analise";

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = 10;
  const offset = (page - 1) * limit;

  try{

    // ================================
    // TOTAL (CLIENTES + MODELOS)
    // ================================

    const totalRes = await db.query(`
      SELECT COUNT(*) FROM (
        SELECT id FROM modelos_verificacao WHERE status = $1
        UNION ALL
        SELECT id FROM clientes_verificacao WHERE status = $1
      ) t
    `,[status]);

    const total = Number(totalRes.rows[0].count);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    // ================================
    // BUSCA UNIFICADA (AGORA COMPLETA)
    // ================================

    const result = await db.query(`
      (
        -- ================= MODELOS =================
        SELECT
          mv.modelo_id AS id,
          'modelo' AS tipo,
          m.nome_exibicao,
          mv.status,
          mv.doc_frente_url,
          mv.doc_verso_url,
          mv.selfie_url,
          mv.motivo_rejeicao,
          mv.criado_em,

          -- MODELO
          m.avatar,
          m.capa,
          m.bio,
          m.local,
          m.verificada,
          m.agencia_id,

          -- MODELOS_DADOS
          md.nome_completo,
          md.data_nascimento,
          md.telefone,
          md.endereco,
          md.pais,
          md.estado,
          md.cidade,
          md.instagram,
          md.tiktok,
          md.vip_preco,

          -- CLIENTE DONO
          u.email,

          -- CLIENTES_DADOS
          cd.telefone AS cliente_telefone,
          cd.endereco AS cliente_endereco,
          cd.pais AS cliente_pais,
          cd.estado AS cliente_estado,
          cd.cidade AS cliente_cidade,
          cd.nome_exibicao AS cliente_nome_exibicao,
          cd.instagram AS cliente_instagram,
          cd.tiktok AS cliente_tiktok,
          cd.local AS cliente_local,
          cd.bio AS cliente_bio

        FROM modelos_verificacao mv
        JOIN modelos m ON m.id = mv.modelo_id
        LEFT JOIN modelos_dados md ON md.modelo_id = m.id
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN clientes c ON c.user_id = u.id
        LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id

        WHERE mv.status = $1
      )

      UNION ALL

      (
        -- ================= CLIENTES =================

  SELECT
    cv.cliente_id AS id,
    'cliente' AS tipo,
    cd.nome_exibicao,
    cv.status,
    cv.doc_frente_url,
    cv.doc_verso_url,
    cv.selfie_url,
    cv.motivo_rejeicao,
    cv.criado_em,

    -- CAMPOS PADRÃO (MODELO → NULL PARA CLIENTE)
    cd.avatar,
    cd.capa,
    cd.bio,
    cd.local,
    NULL AS verificada,
    NULL AS agencia_id,

    -- DADOS PRINCIPAIS
    cd.nome_completo,
    cd.data_nascimento,
    cd.telefone,
    cd.endereco,
    cd.pais,
    cd.estado,
    cd.cidade,
    cd.instagram,
    cd.tiktok,
    cd.vip_preco,

    -- EMAIL
    u.email,

    -- CAMPOS ESPECÍFICOS CLIENTE
    cd.telefone AS cliente_telefone,
    cd.endereco AS cliente_endereco,
    cd.pais AS cliente_pais,
    cd.estado AS cliente_estado,
    cd.cidade AS cliente_cidade,
    cd.nome_exibicao AS cliente_nome_exibicao,
    cd.instagram AS cliente_instagram,
    cd.tiktok AS cliente_tiktok,
    cd.local AS cliente_local,
    cd.bio AS cliente_bio

  FROM clientes_verificacao cv
  JOIN clientes c ON c.id = cv.cliente_id
  JOIN users u ON u.id = c.user_id
  LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id

  WHERE cv.status = $1
)
      ORDER BY criado_em DESC NULLS LAST
      LIMIT $2 OFFSET $3
    `,[status, limit, offset]);

    // ================================
    // ASSINAR URLS PRIVADAS
    // ================================

    const perfisFormatados = result.rows.map(p => ({
      ...p,

      doc_frente_url: p.doc_frente_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.doc_frente_url,
            Expires: 60 * 10
          })
        : null,

      doc_verso_url: p.doc_verso_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.doc_verso_url,
            Expires: 60 * 10
          })
        : null,

      selfie_url: p.selfie_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.selfie_url,
            Expires: 60 * 10
          })
        : null
    }));

    res.json({
      dados: perfisFormatados,
      totalPages,
      page
    });

  } catch(err){
    console.error("Erro buscar perfis:", err);
    res.status(500).json({ error:"Erro ao buscar perfis" });
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

router.get("/admin/verificacoes-aprovadas", auth, authAdmin, async (req, res) => {
  try {

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = 10;
    const offset = (page - 1) * limit;

    const totalRes = await db.query(`
      SELECT COUNT(*) FROM (
        SELECT id FROM modelos_verificacao WHERE status='aprovado'
        UNION ALL
        SELECT id FROM clientes_verificacao WHERE status='aprovado'
      ) t
    `);

    const total = Number(totalRes.rows[0].count);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const result = await db.query(`
      (
        SELECT 
          mv.modelo_id AS id,
          'modelo' AS tipo,
          m.nome_exibicao,
          mv.doc_frente_url,
          mv.doc_verso_url,
          mv.selfie_url,
          mv.verificado_em
        FROM modelos_verificacao mv
        JOIN modelos m ON m.id = mv.modelo_id
        WHERE mv.status='aprovado'
      )

      UNION ALL

      (
        SELECT
          cv.cliente_id AS id,
          'cliente' AS tipo,
          cd.nome_exibicao,
          cv.doc_frente_url,
          cv.doc_verso_url,
          cv.selfie_url,
          cv.verificado_em
        FROM clientes_verificacao cv
        JOIN clientes c ON c.id = cv.cliente_id
        LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
        WHERE cv.status='aprovado'
      )

      ORDER BY verificado_em DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const perfisAssinados = result.rows.map(p => ({
      ...p,

      doc_frente_url: p.doc_frente_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.doc_frente_url,
            Expires: 60 * 10
          })
        : null,

      doc_verso_url: p.doc_verso_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.doc_verso_url,
            Expires: 60 * 10
          })
        : null,

      selfie_url: p.selfie_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.selfie_url,
            Expires: 60 * 10
          })
        : null
    }));

    res.json({
      dados: perfisAssinados,
      totalPages,
      page
    });

  } catch (err) {
    console.error("Erro buscar aprovados:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/admin/verificacoes-rejeitadas", auth, authAdmin, async (req,res)=>{

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = 10;
  const offset = (page - 1) * limit;

  try{

    // TOTAL (modelos + clientes)
    const totalRes = await db.query(`
      SELECT COUNT(*) FROM (
        SELECT id FROM modelos_verificacao WHERE status = 'rejeitado'
        UNION ALL
        SELECT id FROM clientes_verificacao WHERE status = 'rejeitado'
      ) AS total
    `);

    const total = Number(totalRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    // DADOS PAGINADOS
    const result = await db.query(`
      SELECT * FROM (

        -- 🔹 MODELOS
        SELECT
          m.id,
          m.nome_exibicao,
          mv.documento_tipo,
          mv.doc_frente_url,
          mv.doc_verso_url,
          mv.selfie_url,
          mv.motivo_rejeicao,
          mv.verificado_em AS rejeitado_em,
          'modelo' AS tipo
        FROM modelos_verificacao mv
        JOIN modelos m ON m.id = mv.modelo_id
        WHERE mv.status = 'rejeitado'

        UNION ALL

        -- 🔹 CLIENTES
        SELECT
          c.id,
          c.nome AS nome_exibicao,
          cv.documento_tipo,
          cv.doc_frente_url,
          cv.doc_verso_url,
          cv.selfie_url,
          cv.motivo_rejeicao,
          cv.verificado_em AS rejeitado_em,
          'cliente' AS tipo
        FROM clientes_verificacao cv
        JOIN clientes c ON c.id = cv.cliente_id
        JOIN users u ON u.id = c.user_id
        WHERE cv.status = 'rejeitado'

      ) AS rejeitados
      ORDER BY rejeitado_em DESC
      LIMIT $1 OFFSET $2
    `,[limit, offset]);

     const perfisAssinados = result.rows.map(p => ({
      ...p,

      doc_frente_url: p.doc_frente_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.doc_frente_url,
            Expires: 60 * 10
          })
        : null,

      doc_verso_url: p.doc_verso_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.doc_verso_url,
            Expires: 60 * 10
          })
        : null,

      selfie_url: p.selfie_url
        ? s3Privado.getSignedUrl("getObject", {
            Bucket: process.env.B2_BUCKET_PRIVATE,
            Key: p.selfie_url,
            Expires: 60 * 10
          })
        : null
    }));

    res.json({
      dados: perfisAssinados,
     totalPages,
      page
    });

  }catch(err){
    console.error("Erro rejeitados:", err);
    res.status(500).json({error:"Erro interno"});
  }

});

router.get("/admin/modelo/:id/gestao", auth, authAdmin, async (req,res)=>{

const modelo_id = Number(req.params.id);

if(!modelo_id){
return res.status(400).json({error:"Modelo inválida"});
}

try{

const bancoRes = await db.query(`
SELECT
titular_nome,
titular_documento,
banco,
agencia,
conta,
conta_tipo,
pix_tipo,
pix_chave,
status,
aprovado_em
FROM modelo_dados_bancarios
WHERE modelo_id = $1
ORDER BY criado_em DESC
LIMIT 1
`,[modelo_id]);

const agenciaRes = await db.query(`
SELECT
a.id,
a.nome,
m.agencia_desde AS desde
FROM modelos m
LEFT JOIN agencias a
ON a.id = m.agencia_id
WHERE m.id = $1
`,[modelo_id]);

const feedRes = await db.query(`
SELECT feed
FROM modelos
WHERE id = $1
`,[modelo_id]);

const feed = feedRes.rows.length ? feedRes.rows[0].feed : false;

res.json({
banco: bancoRes.rows[0] || null,
agencia: agenciaRes.rows[0] || null,
feed,
pagamentos: []
});

}catch(err){
console.error("Erro carregar gestão:", err);
res.status(500).json({error:"Erro ao carregar dados bancários"});
}

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

router.get("/admin/modelo/:id/pagamentos", auth, authAdmin, async (req,res)=>{

const modelo_id = Number(req.params.id);

const page = Number(req.query.page) || 1;
const limit = 10;
const offset = (page - 1) * limit;

try{

const totalRes = await db.query(`
SELECT COUNT(*)
FROM modelo_pagamentos
WHERE modelo_id=$1
`,[modelo_id]);

const total = Number(totalRes.rows[0].count);
const totalPages = Math.ceil(total / limit);

const result = await db.query(`
SELECT
id,
mes,
total_midias,
total_assinaturas,
total_geral,
status,
pago_em,
recibo_url
FROM modelo_pagamentos
WHERE modelo_id=$1
ORDER BY mes DESC
LIMIT $2 OFFSET $3
`,[modelo_id,limit,offset]);

res.json({
dados: result.rows,
page,
totalPages
});

}catch(err){
console.error("Erro listar pagamentos:",err);
res.status(500).json({error:"Erro listar pagamentos"});
}

});

router.get("/admin/modelo/:id/saldo", auth, authAdmin, async (req,res)=>{

const modelo_id = Number(req.params.id);

try{

const ganhosRes = await db.query(`
SELECT
COALESCE(SUM(valor_modelo),0) AS ganhos
FROM transacoes_agency
WHERE modelo_id = $1
AND status = 'pago'
`,[modelo_id]);

const pagosRes = await db.query(`
SELECT
COALESCE(SUM(total_geral),0) AS pagos
FROM modelo_pagamentos
WHERE modelo_id = $1
AND status = 'pago'
`,[modelo_id]);

const ganhos = Number(ganhosRes.rows[0].ganhos);
const pagos = Number(pagosRes.rows[0].pagos);

const saldo = ganhos - pagos;

res.json({
ganhos,
pagos,
saldo
});

}catch(err){
console.error("Erro calcular saldo:", err);
res.status(500).json({error:"Erro calcular saldo"});
}

});


//HISTORICO RESET SENHA
router.get("/admin/modelo/:id/historico-seguranca", auth, authAdmin, async (req,res)=>{

const modelo_id = Number(req.params.id);

const page = Number(req.query.page) || 1;
const limit = 10;
const offset = (page - 1) * limit;

try{

const totalRes = await db.query(`
SELECT COUNT(*)
FROM admin_seguranca_historico
WHERE modelo_id=$1
`,[modelo_id]);

const total = Number(totalRes.rows[0].count);
const totalPages = Math.ceil(total / limit);

const result = await db.query(`
SELECT
h.data,
a.email AS admin,
h.motivo
FROM admin_seguranca_historico h
LEFT JOIN admin a
ON a.id = h.admin_id
WHERE h.modelo_id=$1
ORDER BY h.data DESC
LIMIT $2 OFFSET $3
`,[modelo_id,limit,offset]);

res.json({
dados: result.rows,
page,
totalPages
});

}catch(err){
console.error("Erro histórico segurança:",err);
res.status(500).json({error:"Erro histórico segurança"});
}

});

//PUT ///
// router.put("/agencia/modelo/:id/percentual", authAgencia, async (req,res)=>{
//   try{

//     const agencia_id = req.agencia.id;
//     const modelo_id = Number(req.params.id);
//     const { percentual_modelo } = req.body;

//     const modeloPercent = Number(percentual_modelo);

//     /* =========================================
//        🔒 VALIDAÇÃO LIMITES MODELO
//     ========================================= */

//     if(modeloPercent < 50 || modeloPercent > 80){
//       return res.status(400).json({
//         error:"Modelo deve ficar entre 50% e 80%."
//       });
//     }

//     /* =========================================
//        🔒 CÁLCULO AUTOMÁTICO AGÊNCIA
//        Velvet é FIXO 20%
//     ========================================= */

//     const percentual_agencia = 80 - modeloPercent;

//     /* =========================================
//        🔒 ATUALIZAR SOMENTE MODELO + AGÊNCIA
//        Velvet não é alterado
//     ========================================= */

//     const result = await db.query(`
//       UPDATE modelos
//       SET percentual_modelo = $1,
//           percentual_agencia = $2
//       WHERE id = $3
//       AND agencia_id = $4
//       RETURNING *
//     `,[modeloPercent, percentual_agencia, modelo_id, agencia_id]);

//     if(!result.rowCount){
//       return res.status(403).json({
//         error:"Modelo não pertence à agência"
//       });
//     }

//     res.json({
//       success:true,
//       percentual_modelo:modeloPercent,
//       percentual_agencia:percentual_agencia,
//       percentual_velvet:20
//     });

//   }catch(err){
//     console.error(err);
//     res.status(500).json({error:"Erro interno"});
//   }
// });

router.put("/admin/validar-modelo/:id", auth, authAdmin, async (req,res)=>{
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const modelo_id = Number(req.params.id);
    const { status, motivo_rejeicao } = req.body;

const modeloRes = await client.query(
  "SELECT user_id, nome_exibicao FROM modelos WHERE id=$1",
  [modelo_id]
);

    if(!modeloRes.rowCount){
      throw new Error("Modelo não encontrada");
    }

const user_id = modeloRes.rows[0].user_id;
const nome_modelo = modeloRes.rows[0].nome_exibicao;

    const userRes = await client.query(
      "SELECT role FROM users WHERE id=$1",
      [user_id]
    );

    const roleAtual = userRes.rows[0].role;

    const emailRes = await client.query(
  "SELECT email FROM users WHERE id=$1",
  [user_id]
);

const email = emailRes.rows[0]?.email;

    if(status === "aprovado"){

      // 🟣 Se for cliente → migrar
      if(roleAtual === "cliente"){

        // 1️⃣ Atualizar role
        await client.query(
          "UPDATE users SET role='modelo' WHERE id=$1",
          [user_id]
        );

        // 2️⃣ Criar registro em modelos
        await client.query(`
          INSERT INTO modelos (user_id, nome_exibicao, created_at)
          SELECT user_id, nome, NOW()
          FROM clientes
          WHERE user_id=$1
          ON CONFLICT (user_id) DO NOTHING
        `,[user_id]);

        // 3️⃣ Copiar clientes_dados → modelos_dados
        await client.query(`
          INSERT INTO modelos_dados (
            modelo_id,
            nome_completo,
            data_nascimento,
            telefone,
            endereco,
            pais,
            cidade,
            estado,
            instagram,
            tiktok
          )
          SELECT
            m.id,
            cd.nome_completo,
            cd.data_nascimento,
            cd.telefone,
            cd.endereco,
            cd.pais,
            cd.cidade,
            cd.estado,
            cd.instagram,
            cd.tiktok
          FROM clientes_dados cd
          JOIN modelos m ON m.user_id = cd.cliente_id
          WHERE cd.cliente_id=$1
          ON CONFLICT (modelo_id) DO NOTHING
        `,[user_id]);
      }

      // 🔹 Marcar como verificada
      await client.query(
        "UPDATE modelos SET verificada=true WHERE id=$1",
        [modelo_id]
      );
    }

    // 🔹 Atualizar status da verificação
await client.query(`
  UPDATE modelos_verificacao
  SET
    status = $1,
    motivo_rejeicao = $2,
    verificado_em = NOW()
  WHERE modelo_id = $3
`,[
  status,
  motivo_rejeicao || null,
  modelo_id
]);

    await client.query("COMMIT");
  

if(status === "aprovado" && email){
  try{
    await enviarEmailAprovacao(email);
  }catch(e){
    console.error("Erro enviar email aprovação:", e);
  }
}

if(status === "rejeitado" && email){
  try{
    await enviarEmailRejeicao(email, motivo_rejeicao);
  }catch(e){
    console.error("Erro enviar email rejeição:", e);
  }
}
    res.json({ message:"Processo concluído" });

  } catch(err){
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error:"Erro ao validar modelo" });
  } finally {
    client.release();
  }
});

router.put("/admin/validar-cliente/:id", auth, authAdmin, async (req,res)=>{

  const cliente_id = Number(req.params.id);
  const { status, motivo_rejeicao } = req.body;

  const client = await db.connect();
   let email = null;
  let nome_cliente = null;

  try {
    await client.query("BEGIN");

    // 🔹 Atualiza status da verificação
    await client.query(`
      UPDATE clientes_verificacao
      SET
        status = $2,

        motivo_rejeicao = $3,
        verificado_em = NOW(),
        atualizado_em = NOW()
      WHERE cliente_id = $1
    `,[cliente_id, status, motivo_rejeicao || "Não informado"]);

    if (status === "aprovado") {

  // 🔹 1️⃣ Buscar user_id do cliente
  const userRes = await client.query(
    "SELECT user_id, nome FROM clientes WHERE id = $1",
    [cliente_id]
  );

  if (!userRes.rowCount) {
    throw new Error("Cliente não encontrado");
  }

  const user_id = userRes.rows[0].user_id;
  nome_cliente = userRes.rows[0].nome;

  const emailRes = await client.query(
  "SELECT email FROM users WHERE id=$1",
  [user_id]
);

email = emailRes.rows[0]?.email;

  // 🔹 2️⃣ Atualizar role no users
  await client.query(
    "UPDATE users SET role = 'modelo' WHERE id = $1",
    [user_id]
  );

  // 🔹 3️⃣ Criar registro em modelos (copiando clientes → modelos)
  await client.query(`
    INSERT INTO modelos (
      user_id,
      nome,
      nome_exibicao,
      local,
      bio,
      avatar,
      capa,
      created_at,
      verificada
    )
    SELECT
      c.user_id,
      c.nome,
      cd.nome_exibicao,
      cd.local,
      cd.bio,
      cd.avatar,
      cd.capa,
      NOW(),
      true
    FROM clientes c
    LEFT JOIN clientes_dados cd ON cd.cliente_id = c.id
    WHERE c.id = $1
    ON CONFLICT (user_id) DO NOTHING
  `, [cliente_id]);

  // 🔹 4️⃣ Buscar modelo_id recém criado
  const modeloRes = await client.query(
    "SELECT id FROM modelos WHERE user_id = $1",
    [user_id]
  );

  const modelo_id = modeloRes.rows[0].id;

  // 🔹 5️⃣ Copiar clientes_dados → modelos_dados
  await client.query(`
    INSERT INTO modelos_dados (
      modelo_id,
      nome_completo,
      data_nascimento,
      telefone,
      endereco,
      pais,
      cidade,
      estado,
      instagram,
      tiktok,
      vip_preco
    )
    SELECT
      $1,
      cd.nome_completo,
      cd.data_nascimento,
      cd.telefone,
      cd.endereco,
      cd.pais,
      cd.cidade,
      cd.estado,
      cd.instagram,
      cd.tiktok,
      cd.vip_preco
    FROM clientes_dados cd
    WHERE cd.cliente_id = $2
    ON CONFLICT (modelo_id) DO NOTHING
  `, [modelo_id, cliente_id]);

   await client.query(
    "UPDATE clientes SET convertido_para_modelo = true WHERE id = $1",
    [cliente_id]
  );
} 
    await client.query("COMMIT");

    if(status === "aprovado" && email){
  try{
    await enviarEmailAprovacao(email);
  }catch(e){
    console.error("Erro enviar email aprovação:", e);
  }
}

    res.json({ success:true });

  } catch (err) {

    await client.query("ROLLBACK");
    console.error("Erro validar cliente:", err);
    res.status(500).json({ error:"Erro ao validar cliente" });

  } finally {
    client.release();
  }
});

router.put("/admin/perfis/:id/editar", auth, authAdmin, async (req,res)=>{

  const { id } = req.params;
  const { tipo, dados } = req.body;

  try{

    if(tipo === "modelo"){

      // Atualiza tabela modelos
      await db.query(`
        UPDATE modelos
        SET nome_exibicao=$1,
            local=$2,
            bio=$3
        WHERE id=$4
      `,[
        dados.nome_exibicao,
        dados.local,
        dados.bio,
        id
      ]);

      // Atualiza modelos_dados
      await db.query(`
        UPDATE modelos_dados
        SET nome_completo=$1,
            data_nascimento=$2,
            telefone=$3,
            endereco=$4,
            pais=$5,
            estado=$6,
            cidade=$7,
            instagram=$8,
            tiktok=$9,
            vip_preco=$10
        WHERE modelo_id=$11
      `,[
        dados.nome_completo,
        dados.data_nascimento,
        dados.telefone,
        dados.endereco,
        dados.pais,
        dados.estado,
        dados.cidade,
        dados.instagram,
        dados.tiktok,
        dados.vip_preco,
        id
      ]);

    } else {
      await db.query(`
         UPDATE clientes_dados
        SET nome_completo=$1,
            data_nascimento=$2,
            telefone=$3,
            endereco=$4,
            pais=$5,
            estado=$6,
            cidade=$7,
            instagram=$8,
            tiktok=$9,
            vip_preco=$10,
            nome_exibicao=$11,
            local=$12,
            bio=$13
        WHERE cliente_id=$14
      `,[
        dados.nome_completo,
        dados.data_nascimento,
        dados.telefone,
        dados.endereco,
        dados.pais,
        dados.estado,
        dados.cidade,
        dados.instagram,
        dados.tiktok,
        dados.vip_preco,
        dados.nome_exibicao,
        dados.local,
        dados.bio,
        id
      ]);
    }

    res.json({ message:"Atualizado com sucesso" });

  }catch(err){
    console.error(err);
    res.status(500).json({ error:"Erro ao atualizar dados" });
  }
});

router.put("/admin/modelo/:id/agencia", auth, authAdmin, async (req,res)=>{

const modelo_id = Number(req.params.id);
const { agencia_id } = req.body;

try{

await db.query(`
UPDATE modelos
SET agencia_id = $1
WHERE id = $2
`,[
agencia_id || null,
modelo_id
]);

let nome_agencia = "Sem agência";

if(agencia_id){

const ag = await db.query(`
SELECT nome
FROM agencias
WHERE id=$1
`,[agencia_id]);

nome_agencia = ag.rows[0]?.nome || "Agência";

}

res.json({
ok:true,
nome_agencia,
data:new Date()
});

}catch(err){
console.error("Erro alterar agência:",err);
res.status(500).json({error:"Erro alterar agência"});
}

});


module.exports = {
  router,
  calcularValores
};