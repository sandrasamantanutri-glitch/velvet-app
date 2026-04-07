const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);


async function enviarEmailValidacao(email) {
  await resend.emails.send({
    from: "Velvet <no-reply@velvet.lat>",
    to: email,
    subject: "Envio de documentos para aprovação",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f3fb; padding:24px; color:#2d1f3d;">
        <div style="max-width:600px; margin:0 auto; background:#ffffff; padding:32px; border-radius:12px;">

          <h2 style="margin-top:0; margin-bottom:20px; color:#6f42c1; text-align:center;">
            Seu perfil de criador foi criado! ✨
          </h2>

          <p style="margin:0 0 16px; line-height:1.6;">
            Olá,
          </p>

          <p style="margin:0 0 20px; line-height:1.6;">
            Para ativar seu perfil e começar a ganhar, envie sua documentação através da página <strong>Conta</strong> na plataforma.
          </p>

          <div style="background:#f8f4ff; padding:16px; border-radius:10px; margin:20px 0;">
            <p style="margin:0 0 8px; font-weight:bold; color:#4b2a7b;">
              Prazo para validação
            </p>
            <p style="margin:0; line-height:1.6;">
              Você tem <strong>14 dias</strong> para concluir a validação da sua conta.
            </p>
          </div>

          <div style="background:#fff7fb; padding:16px; border-radius:10px; margin:20px 0;">
            <p style="margin:0 0 8px; font-weight:bold; color:#7a1f52;">
              Registrou-se por engano como criador(a)?
            </p>
            <p style="margin:0; line-height:1.6;">
              Envie um email para <strong>contato@velvet.lat</strong> e solicite a alteração de influencer para usuário. Assim, poderá utilizar a plataforma para conversar com os criadores de conteúdo.
            </p>
          </div>

          <p style="margin:20px 0; line-height:1.6;">
            Após 14 dias sem validação, sua conta será removida automaticamente.
          </p>

          <div style="text-align:center; margin:24px 0 8px;">
            <a href="https://www.velvet.lat"
               style="display:inline-block; background:#6f42c1; color:#ffffff; text-decoration:none; padding:14px 22px; border-radius:10px; font-weight:bold;">
              Acessar a plataforma
            </a>
          </div>

          <p style="margin:24px 0 0; line-height:1.6; text-align:center; color:#6b5a7d;">
            Equipe Velvet 💜
          </p>

        </div>
      </div>
    `
  });
}

async function enviarEmailAprovacao(email) {
  await resend.emails.send({
    from: "Velvet <no-reply@velvet.lat>",
    to: email,
    subject: "Sua conta foi aprovada 🎉",
   html: `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f3fb; padding:24px;">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; padding:32px; border-radius:12px;">
      <h2 style="margin-top:0; color:#6f42c1; text-align:center;">
        Conta aprovada! 🎉
      </h2>

      <p>Olá,</p>

      <p>Sua verificação foi aprovada e seu perfil já pode ser utilizado na Velvet.</p>

      <div style="background:#f8f4ff; padding:16px; border-radius:10px; margin:20px 0;">
        <p style="margin-top:0;"><strong>Manual do Utilizador</strong></p>
        <p>Consulte o guia rápido para começar a usar a plataforma.</p>
        <p style="margin-bottom:0;">
          <a href="https://www.velvet.lat/docs/manual.pdf" style="color:#6f42c1; font-weight:bold;">
            Ver Manual do Utilizador
          </a>
        </p>
      </div>

      <div style="background:#fff7fb; padding:16px; border-radius:10px; margin:20px 0;">
        <p style="margin-top:0;"><strong>Termos de Uso do Criador</strong></p>
        <p>Antes de começar a faturar, relembre os termos aceitos no seu registo.</p>
        <p style="margin-bottom:0;">
          <a href="https://www.velvet.lat/docs/creators_terms.pdf" style="color:#b0307d; font-weight:bold;">
            Ver Termos de Uso do Criador
          </a>
        </p>
      </div>

      <p>Se tiver qualquer dúvida, não hesite em nos contactar.</p>

      <p>
        <a href="https://www.velvet.lat" style="color:#6f42c1; font-weight:bold;">
          Acessar minha conta
        </a>
      </p>

      <p>Bem-vindo(a) 💜</p>
    </div>
  </div>
`
  });
}

async function enviarEmailRejeicao(email, motivo) {
  await resend.emails.send({
    from: "Velvet <no-reply@velvet.lat>",
    to: email,
    subject: "Verificação de conta não aprovada",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f3fb; padding:24px; color:#2d1f3d;">
        <div style="max-width:600px; margin:0 auto; background:#ffffff; padding:32px; border-radius:12px;">

          <h2 style="margin-top:0; margin-bottom:20px; color:#b0307d; text-align:center;">
            Verificação não aprovada
          </h2>

          <p style="margin:0 0 16px; line-height:1.6;">
            Olá,
          </p>

          <p style="margin:0 0 20px; line-height:1.6;">
            Infelizmente não foi possível aprovar sua verificação nesta análise.
          </p>

          <div style="background:#fff7fb; padding:16px; border-radius:10px; margin:20px 0;">
            <p style="margin:0 0 8px; font-weight:bold; color:#7a1f52;">
              Motivo da reprovação
            </p>
            <p style="margin:0; line-height:1.6;">
              ${motivo}
            </p>
          </div>

          <p style="margin:20px 0; line-height:1.6;">
            Você pode acessar sua conta, preencher todos os dados necessários, anexar os documentos e reenviar para nova análise.
          </p>

          <div style="text-align:center; margin:24px 0;">
            <a href="https://www.velvet.lat"
               style="display:inline-block; background:#6f42c1; color:#ffffff; text-decoration:none; padding:14px 22px; border-radius:10px; font-weight:bold;">
              Acessar a plataforma
            </a>
          </div>

          <p style="margin:20px 0; line-height:1.6;">
            Caso tenha dúvidas, entre em contato com nosso suporte.
          </p>

          <p style="margin:24px 0 0; line-height:1.6; text-align:center; color:#6b5a7d;">
            Equipe Velvet 💜
          </p>

        </div>
      </div>
    `
  });
}

module.exports = { 
  enviarEmailValidacao,
  enviarEmailAprovacao,
  enviarEmailRejeicao };