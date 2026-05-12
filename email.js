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
      <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f3fb; padding:24px; color:#2d1f3d;">
        <div style="max-width:600px; margin:0 auto; background:#ffffff; padding:32px; border-radius:12px;">

          <h2 style="margin-top:0; margin-bottom:20px; color:#6f42c1; text-align:center;">
            Conta aprovada! 🎉
          </h2>

          <p style="margin:0 0 16px; line-height:1.6;">
            Olá,
          </p>

          <p style="margin:0 0 20px; line-height:1.6;">
            Sua verificação foi aprovada e seu perfil já pode ser utilizado na Velvet. Estamos felizes em ter você aqui!
          </p>

          <div style="background:#f8f4ff; padding:16px 20px; border-radius:10px; margin:0 0 12px;">
            <p style="margin:0 0 6px; font-weight:bold; color:#4b2a7b;">
              📄 Manual do Utilizador
            </p>
            <p style="margin:0 0 8px; line-height:1.6;">
              Consulte o guia rápido para começar a usar a plataforma.
            </p>
            <a href="https://www.velvet.lat/docs/manual.pdf" style="color:#6f42c1; font-weight:bold;">
              Ver Manual do Utilizador
            </a>
          </div>

          <div style="background:#fff7fb; padding:16px 20px; border-radius:10px; margin:0 0 24px;">
            <p style="margin:0 0 6px; font-weight:bold; color:#7a1f52;">
              📋 Termos de Uso do Criador
            </p>
            <p style="margin:0 0 8px; line-height:1.6;">
              Antes de começar a faturar, relembre os termos aceitos no seu registo.
            </p>
            <a href="https://www.velvet.lat/docs/creators_terms.pdf" style="color:#b0307d; font-weight:bold;">
              Ver Termos de Uso do Criador
            </a>
          </div>

          <p style="margin:0 0 24px; line-height:1.6;">
            Se tiver qualquer dúvida, entre em contato em <a href="mailto:contato@velvet.lat" style="color:#6f42c1;">contato@velvet.lat</a>.
          </p>

          <div style="text-align:center; margin:24px 0 8px;">
            <a href="https://www.velvet.lat"
               style="display:inline-block; background:#6f42c1; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:bold; font-size:15px;">
              Acessar minha conta
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

          <div style="background:#fff7fb; padding:16px 20px; border-radius:10px; margin:0 0 20px;">
            <p style="margin:0 0 8px; font-weight:bold; color:#7a1f52;">
              ❌ Motivo da reprovação
            </p>
            <p style="margin:0; line-height:1.6;">
              ${motivo}
            </p>
          </div>

          <div style="background:#f8f4ff; padding:16px 20px; border-radius:10px; margin:0 0 24px;">
            <p style="margin:0; line-height:1.6; color:#4b2a7b;">
              📤 Você pode acessar sua conta, preencher todos os dados necessários, anexar os documentos e <strong>reenviar para nova análise</strong>.
            </p>
          </div>

          <p style="margin:0 0 24px; line-height:1.6;">
            Caso tenha dúvidas, entre em contato em <a href="mailto:contato@velvet.lat" style="color:#6f42c1;">contato@velvet.lat</a>.
          </p>

          <div style="text-align:center; margin:24px 0 8px;">
            <a href="https://www.velvet.lat"
               style="display:inline-block; background:#6f42c1; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:bold; font-size:15px;">
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

async function enviarEmailBoasVindasCliente(email, nomeCompleto) {
  const nome = (nomeCompleto || "").split(" ")[0] || "Olá";
  await resend.emails.send({
    from: "Velvet <no-reply@velvet.lat>",
    to: email,
    subject: "Bem-vindo(a) à Velvet! 💜",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f3fb; padding:24px; color:#2d1f3d;">
        <div style="max-width:600px; margin:0 auto; background:#ffffff; padding:32px; border-radius:12px;">

          <h2 style="margin-top:0; margin-bottom:8px; color:#6f42c1; text-align:center;">
            Bem-vindo(a) à Velvet! 💜
          </h2>
          <p style="text-align:center; margin:0 0 28px; color:#6b5a7d; font-size:15px;">
            Conectando fãs e criadores de forma autêntica e segura.
          </p>

          <p style="margin:0 0 16px; line-height:1.6;">
            Olá, <strong>${nome}</strong>!
          </p>

          <p style="margin:0 0 24px; line-height:1.6;">
            Sua conta foi criada com sucesso. Agora você tem acesso a um espaço pensado para quem quer se conectar de verdade com os criadores que admira.
          </p>

          <p style="margin:0 0 12px; font-weight:bold; color:#4b2a7b;">Como funciona:</p>

          <div style="background:#f8f4ff; padding:16px 20px; border-radius:10px; margin:0 0 12px;">
            <p style="margin:0; line-height:1.6;">
              🔍 <strong>Descubra criadores</strong> — explore perfis de artistas, influenciadores e produtores de conteúdo das mais diversas áreas.
            </p>
          </div>

          <div style="background:#f8f4ff; padding:16px 20px; border-radius:10px; margin:0 0 12px;">
            <p style="margin:0; line-height:1.6;">
              💬 <strong>Assine e converse</strong> — ao assinar um perfil, você tem acesso ao chat direto e ao conteúdo do criador.
            </p>
          </div>

          <div style="background:#f8f4ff; padding:16px 20px; border-radius:10px; margin:0 0 12px;">
            <p style="margin:0; line-height:1.6;">
              🎁 <strong>Conteúdo premium</strong> — adquira fotos e vídeos avulsos diretamente no perfil de cada criador.
            </p>
          </div>

          <div style="background:#f8f4ff; padding:16px 20px; border-radius:10px; margin:0 0 24px;">
            <p style="margin:0; line-height:1.6;">
              🤝 <strong>Interação direta</strong> — aqui você não é só mais um seguidor. A Velvet existe para criar conexões reais entre criadores e fãs.
            </p>
          </div>

          <div style="text-align:center; margin:24px 0 8px;">
            <a href="https://www.velvet.lat"
               style="display:inline-block; background:#6f42c1; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:bold; font-size:15px;">
              Explorar a plataforma
            </a>
          </div>

          <p style="margin:28px 0 0; line-height:1.6; text-align:center; color:#6b5a7d; font-size:13px;">
            Dúvidas? Fale com a gente em <a href="mailto:contato@velvet.lat" style="color:#6f42c1;">contato@velvet.lat</a>
          </p>
          <p style="margin:8px 0 0; line-height:1.6; text-align:center; color:#6b5a7d;">
            Equipe Velvet 💜
          </p>

        </div>
      </div>
    `
  });
}

async function enviarEmailBoasVindasModelo(email, nomeCompleto) {
  const nome = (nomeCompleto || "").split(" ")[0] || "Olá";
  await resend.emails.send({
    from: "Velvet <no-reply@velvet.lat>",
    to: email,
    subject: "Bem vindo(a) à Velvet!!💜",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f3fb; padding:24px; color:#2d1f3d;">
        <div style="max-width:600px; margin:0 auto; background:#ffffff; padding:32px; border-radius:12px;">

          <h2 style="margin-top:0; margin-bottom:8px; color:#6f42c1; text-align:center;">
            Bem-vindo(a) à Velvet! ✨
          </h2>
          <p style="text-align:center; margin:0 0 28px; color:#6b5a7d; font-size:15px;">
            Um espaço criado para quem leva o próprio conteúdo a sério.
          </p>

          <p style="margin:0 0 16px; line-height:1.6;">
            Olá, <strong>${nome}</strong>!
          </p>

          <p style="margin:0 0 20px; line-height:1.6;">
            Sua conta foi criada com sucesso. A Velvet existe para conectar criadores com os seus fãs de forma autêntica, segura e sustentável — e estamos felizes em ter você aqui.
          </p>

          <div style="background:#f8f4ff; padding:16px 20px; border-radius:10px; margin:0 0 16px;">
            <p style="margin:0 0 8px; font-weight:bold; color:#4b2a7b;">
              📋 Próximo passo: validação da conta
            </p>
            <p style="margin:0; line-height:1.6;">
              Para ativar seu perfil e começar a receber assinantes, envie sua documentação pela página <strong>Conta</strong> na plataforma.
            </p>
          </div>

          <div style="background:#fff7fb; padding:16px 20px; border-radius:10px; margin:0 0 20px;">
            <p style="margin:0 0 8px; font-weight:bold; color:#7a1f52;">
              ⏳ Prazo de 14 dias
            </p>
            <p style="margin:0; line-height:1.6;">
              Você tem <strong>14 dias</strong> para concluir a validação. Após esse período, contas não validadas são removidas automaticamente.
            </p>
          </div>

          <p style="margin:0 0 8px; font-weight:bold; color:#4b2a7b;">O que você pode fazer na Velvet:</p>
          <ul style="margin:0 0 20px; padding-left:20px; line-height:1.9; color:#2d1f3d;">
            <li>Criar um perfil personalizado com bio, capa e avatar</li>
            <li>Receber assinaturas mensais dos seus fãs</li>
            <li>Publicar mídias</li>
            <li>Conversar diretamente com quem assina o seu perfil</li>
            <li>Acompanhar seus ganhos de forma transparente</li>
          </ul>

          <div style="background:#f8f4ff; padding:14px 20px; border-radius:10px; margin:0 0 24px;">
            <p style="margin:0; line-height:1.6; font-size:13px; color:#4b2a7b;">
              Registrou-se por engano como criador(a)? Envie um email para
              <a href="mailto:contato@velvet.lat" style="color:#6f42c1; font-weight:bold;">contato@velvet.lat</a>
              e solicite a alteração para conta de fã.
            </p>
          </div>

          <div style="text-align:center; margin:24px 0 8px;">
            <a href="https://www.velvet.lat"
               style="display:inline-block; background:#6f42c1; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:bold; font-size:15px;">
              Acessar a plataforma
            </a>
          </div>

          <p style="margin:28px 0 0; line-height:1.6; text-align:center; color:#6b5a7d; font-size:13px;">
            Dúvidas? Fale com a gente em <a href="mailto:contato@velvet.lat" style="color:#6f42c1;">contato@velvet.lat</a>
          </p>
          <p style="margin:8px 0 0; line-height:1.6; text-align:center; color:#6b5a7d;">
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
  enviarEmailRejeicao,
  enviarEmailBoasVindasCliente,
  enviarEmailBoasVindasModelo
};