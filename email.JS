const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function enviarEmailValidacao(email) {

  await resend.emails.send({
    from: "Velvet <no-reply@send.velvet.lat>",
    to: email,
    subject: "Envio de documentos para aprovação",
    html: `
      <h2>Seu perfil de criador foi criado!</h2>

      <p>Para ativar seu perfil e começar a ganhar, envie sua documentação através da página <strong>Conta</strong> na plataforma.</p>

      <p>Você tem 14 dias para concluir a validação.</p>

      <p>Caso tenha se registrado por engano como criador(a), envie um email para contato@velvet.lat e solicite a alteração de influencer para usuario, assim poderá ser utilizador da plataforma e conversar com os criadores de conteúdo.</p>

      <p>Após 14 dias sem validação, sua conta será removida automaticamente.</p>
    `
  });

}

module.exports = { enviarEmailValidacao };