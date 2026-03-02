const db = require("./db");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function enviarEmail(to, assunto, html) {
  await resend.emails.send({
    from: "Velvet <no-reply@velvet.lat>",
    to,
    subject: assunto,
    html
  });
}

async function processarAvisos() {

  console.log("🔔 Verificando assinaturas próximas do vencimento...");

  // ==============================
  // 📅 AVISO 7 DIAS
  // ==============================
  const seteDias = await db.query(`
    SELECT v.id, v.modelo_id, u.email
    FROM vip_subscriptions v
    JOIN clientes c ON c.id = v.cliente_id
    JOIN users u ON u.id = c.user_id
    WHERE v.ativo = 'true'
      AND v.aviso_7_dias_enviado = false
      AND v.current_period_end BETWEEN
          NOW() + INTERVAL '6 days'
          AND NOW() + INTERVAL '7 days'
  `);

  for (const row of seteDias.rows) {

    const linkPerfil = `https://velvet.lat/perfil.html?modelo_id=${row.modelo_id}`;

    try {

      await enviarEmail(
        row.email,
        "Seu VIP expira em 7 dias",
        `
          <h2>Sua assinatura VIP está perto do vencimento</h2>
          <p>Faltam 7 dias para o término da sua assinatura.</p>

          <div style="margin:20px 0;">
            <a href="${linkPerfil}"
               style="
                 background-color:#7B2CFF;
                 color:#ffffff;
                 padding:12px 20px;
                 text-decoration:none;
                 border-radius:6px;
                 display:inline-block;
                 font-weight:bold;
               ">
               Renovar VIP agora
            </a>
          </div>
        `
      );

      await db.query(
        "UPDATE vip_subscriptions SET aviso_7_dias_enviado = true WHERE id = $1",
        [row.id]
      );

    } catch (err) {
      console.error("Erro ao enviar aviso 7 dias:", err);
    }
  }

  // ==============================
  // ⏰ AVISO 24 HORAS
  // ==============================
  const vinte4h = await db.query(`
    SELECT v.id, v.modelo_id, u.email
    FROM vip_subscriptions v
    JOIN clientes c ON c.id = v.cliente_id
    JOIN users u ON u.id = c.user_id
    WHERE v.ativo = 'true'
      AND v.aviso_24h_enviado = false
      AND v.current_period_end BETWEEN
          NOW()
          AND NOW() + INTERVAL '1 day'
  `);

  for (const row of vinte4h.rows) {

    const linkPerfil = `https://velvet.lat/perfil.html?modelo_id=${row.modelo_id}`;

    try {

      await enviarEmail(
        row.email,
        "Sua VIP expira em 24 horas",
        `
          <h2>Sua VIP termina amanhã</h2>
          <p>Renove agora para não perder acesso exclusivo.</p>

          <div style="margin:20px 0;">
            <a href="${linkPerfil}"
               style="
                 background-color:#7B2CFF;
                 color:#ffffff;
                 padding:12px 20px;
                 text-decoration:none;
                 border-radius:6px;
                 display:inline-block;
                 font-weight:bold;
               ">
               Renovar VIP agora
            </a>
          </div>
        `
      );

      await db.query(
        "UPDATE vip_subscriptions SET aviso_24h_enviado = true WHERE id = $1",
        [row.id]
      );

    } catch (err) {
      console.error("Erro ao enviar aviso 24h:", err);
    }
  }

  console.log("✅ Avisos processados");
  process.exit();
}

processarAvisos();