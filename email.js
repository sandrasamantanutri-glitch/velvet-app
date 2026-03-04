const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const fs = require("fs");
const path = require("path");


async function enviarEmailValidacao(email) {
  await resend.emails.send({
    from: "Velvet <no-reply@velvet.lat>",
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

async function enviarEmailAprovacao(email) {
const pdfPath = path.join(process.cwd(), "docs", "manual-velvet.pdf");
  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(pdfPath);

  await resend.emails.send({
    from: "Velvet <noreply@velvet.lat>",
    to: email,
    subject: "Sua conta foi aprovada 🎉",
    html: `
      <h2>Conta aprovada!</h2>

      <p>Olá,</p>

      <p>
      Sua verificação foi aprovada e seu perfil já pode ser utilizado na Velvet.
      </p>

      <p>
      No PDF anexado você encontra um guia rápido para começar.
      </p>

      <p>
      Acesse sua conta:
      <br>
      https://velvet.lat
      </p>

      <p>Bem-vindo(a) 💜</p>
    `,
    attachments: [
      {
        filename: "Guia-Velvet.pdf",
        content: pdfBuffer
      }
    ]
  });
}

module.exports = { 
  enviarEmailValidacao,
  enviarEmailAprovacao };