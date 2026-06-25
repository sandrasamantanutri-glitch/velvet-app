const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const HEADER = `
  <div style="background:linear-gradient(135deg,#7B2CFF 0%,#a94cff 100%);border-radius:14px 14px 0 0;padding:20px 32px;text-align:center;">
    <span style="color:#7B2CFF;font-size:20px;font-weight:800;letter-spacing:1px;">Velvet</span>
  </div>
`;

const FOOTER = `
  <div style="margin-top:28px;padding-top:18px;border-top:1px solid #f0ebfa;text-align:center;">
    <p style="margin:0 0 4px;color:#6b5a7d;">Equipe Velvet</p>
    <p style="margin:0;font-size:13px;color:#9b87b8;">
      Dúvidas? <a href="mailto:contato@velvet.lat" style="color:#7B2CFF;">contato@velvet.lat</a>
    </p>
  </div>
`;

function wrapEmail(content) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f0ebfa;padding:32px 16px;color:#2d1f3d;">
      <div style="max-width:600px;margin:0 auto;">
        ${HEADER}
        <div style="background:#fff;padding:32px;border-radius:0 0 14px 14px;border:1px solid #e5d9ff;border-top:none;">
          ${content}
          ${FOOTER}
        </div>
      </div>
    </div>
  `;
}

function btnPrimary(href, texto) {
  return `
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#7B2CFF,#a94cff);color:#fff;text-decoration:none;padding:15px 32px;border-radius:10px;font-weight:bold;font-size:15px;">
        ${texto}
      </a>
    </div>
  `;
}

function infoBox(cor, content) {
  const cores = {
    purple: { bg: "#f8f4ff", text: "#4b2a7b" },
    pink:   { bg: "#fff7fb", text: "#7a1f52" },
  };
  const c = cores[cor] || cores.purple;
  return `
    <div style="background:${c.bg};padding:16px 20px;border-radius:10px;margin:0 0 14px;">
      ${content}
    </div>
  `;
}


async function enviarEmailValidacao(email) {
  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: "Envio de documentos para aprovação",
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#6f42c1;text-align:center;font-size:21px;">
        Seu perfil foi criado! ✨
      </h2>
      <p style="text-align:center;margin:0 0 24px;color:#7a6a9a;font-size:14px;">
        Falta pouco para começar a ganhar
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">Olá,</p>

      <p style="margin:0 0 20px;line-height:1.7;">
        Para ativar seu perfil e começar a ganhar, envie sua documentação através da página <strong>Conta</strong> na plataforma.
      </p>

      ${infoBox("purple", `
        <p style="margin:0 0 6px;font-weight:bold;color:#4b2a7b;">⏳ Prazo para validação</p>
        <p style="margin:0;line-height:1.6;">
          Você tem <strong>14 dias</strong> para concluir a validação da sua conta.
          Após esse período, contas não validadas são removidas automaticamente.
        </p>
      `)}

      ${infoBox("pink", `
        <p style="margin:0 0 6px;font-weight:bold;color:#7a1f52;">Registrou-se por engano como criador(a)?</p>
        <p style="margin:0;line-height:1.6;">
          Envie um email para <a href="mailto:contato@velvet.lat" style="color:#6f42c1;font-weight:bold;">contato@velvet.lat</a>
          e solicite a alteração de influencer para usuário.
        </p>
      `)}

      ${btnPrimary("https://www.velvet.lat", "Acessar a plataforma")}
    `)
  });
}

async function enviarEmailAprovacao(email) {
  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: "Sua conta foi aprovada 🎉",
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#6f42c1;text-align:center;font-size:21px;">
        Conta aprovada! 🎉
      </h2>
      <p style="text-align:center;margin:0 0 24px;color:#7a6a9a;font-size:14px;">
        Estamos felizes em ter você na Velvet
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">Olá,</p>

      <p style="margin:0 0 20px;line-height:1.7;">
        Sua verificação foi aprovada e seu perfil já pode ser utilizado na Velvet!
      </p>

      ${infoBox("purple", `
        <p style="margin:0 0 6px;font-weight:bold;color:#4b2a7b;">📄 Manual do Utilizador</p>
        <p style="margin:0 0 8px;line-height:1.6;">Consulte o guia rápido para começar a usar a plataforma.</p>
        <a href="https://www.velvet.lat/docs/manual.pdf" style="color:#6f42c1;font-weight:bold;">Ver Manual do Utilizador</a>
      `)}

      ${infoBox("pink", `
        <p style="margin:0 0 6px;font-weight:bold;color:#7a1f52;">📋 Termos de Uso do Criador</p>
        <p style="margin:0 0 8px;line-height:1.6;">Antes de começar a faturar, relembre os termos aceitos no seu cadastro.</p>
        <a href="https://www.velvet.lat/docs/creators_terms.pdf" style="color:#b0307d;font-weight:bold;">Ver Termos de Uso do Criador</a>
      `)}

      ${btnPrimary("https://www.velvet.lat", "Acessar minha conta")}
    `)
  });
}

async function enviarEmailRejeicao(email, motivo) {
  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: "Verificação de conta não aprovada",
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#b0307d;text-align:center;font-size:21px;">
        Verificação não aprovada
      </h2>
      <p style="text-align:center;margin:0 0 24px;color:#7a6a9a;font-size:14px;">
        Você pode corrigir e reenviar sua documentação
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">Olá,</p>

      <p style="margin:0 0 20px;line-height:1.7;">
        Infelizmente não foi possível aprovar sua verificação nesta análise.
      </p>

      ${infoBox("pink", `
        <p style="margin:0 0 8px;font-weight:bold;color:#7a1f52;">❌ Motivo da reprovação</p>
        <p style="margin:0;line-height:1.6;">${motivo}</p>
      `)}

      ${infoBox("purple", `
        <p style="margin:0;line-height:1.6;color:#4b2a7b;">
          📤 Você pode acessar sua conta, preencher todos os dados necessários, anexar os documentos e <strong>reenviar para nova análise</strong>.
        </p>
      `)}

      ${btnPrimary("https://www.velvet.lat", "Acessar a plataforma")}
    `)
  });
}

async function enviarEmailBoasVindasCliente(email, nomeCompleto) {
  const nome = (nomeCompleto || "").split(" ")[0] || "você";
  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: "Bem-vindo(a) à Velvet! 💜",
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#6f42c1;text-align:center;font-size:21px;">
        Bem-vindo(a) à Velvet! 💜
      </h2>
      <p style="text-align:center;margin:0 0 24px;color:#7a6a9a;font-size:14px;">
        Conectando fãs e criadores de forma autêntica e segura
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">Olá, <strong>${nome}</strong>!</p>

      <p style="margin:0 0 20px;line-height:1.7;">
        Sua conta foi criada com sucesso. Agora você tem acesso a um espaço pensado para quem quer se conectar de verdade com os criadores que admira.
      </p>

      <p style="margin:0 0 12px;font-weight:bold;color:#4b2a7b;">Como funciona:</p>

      ${infoBox("purple", `<p style="margin:0;line-height:1.6;">🔍 <strong>Descubra criadores</strong> — explore perfis de artistas, influenciadores e produtores de conteúdo das mais diversas áreas.</p>`)}
      ${infoBox("purple", `<p style="margin:0;line-height:1.6;">💬 <strong>Assine e converse</strong> — ao assinar um perfil, você tem acesso ao chat direto e ao conteúdo do criador.</p>`)}
      ${infoBox("purple", `<p style="margin:0;line-height:1.6;">🎁 <strong>Conteúdo premium</strong> — adquira fotos e vídeos avulsos diretamente no perfil de cada criador.</p>`)}
      ${infoBox("purple", `<p style="margin:0;line-height:1.6;">🤝 <strong>Interação direta</strong> — aqui você não é só mais um seguidor. A Velvet existe para criar conexões reais entre criadores e fãs.</p>`)}

      ${btnPrimary("https://www.velvet.lat", "Explorar a plataforma")}
    `)
  });
}

async function enviarEmailBoasVindasModelo(email, nomeCompleto) {
  const nome = (nomeCompleto || "").split(" ")[0] || "você";
  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: "Bem-vindo(a) à Velvet! 💜",
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#6f42c1;text-align:center;font-size:21px;">
        Bem-vindo(a) à Velvet! ✨
      </h2>
      <p style="text-align:center;margin:0 0 24px;color:#7a6a9a;font-size:14px;">
        Um espaço criado para quem leva o próprio conteúdo a sério
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">Olá, <strong>${nome}</strong>!</p>

      <p style="margin:0 0 20px;line-height:1.7;">
        Sua conta foi criada com sucesso. A Velvet existe para conectar criadores com os seus fãs de forma autêntica, segura e sustentável — e estamos felizes em ter você aqui.
      </p>

      ${infoBox("purple", `
        <p style="margin:0 0 8px;font-weight:bold;color:#4b2a7b;">📋 Próximo passo: validação da conta</p>
        <p style="margin:0;line-height:1.6;">
          Para ativar seu perfil e começar a receber assinantes, envie sua documentação pela página <strong>Conta</strong> na plataforma.
        </p>
      `)}

      ${infoBox("pink", `
        <p style="margin:0 0 8px;font-weight:bold;color:#7a1f52;">⏳ Prazo de 14 dias</p>
        <p style="margin:0;line-height:1.6;">
          Você tem <strong>14 dias</strong> para concluir a validação. Após esse período, contas não validadas são removidas automaticamente.
        </p>
      `)}

      <p style="margin:0 0 8px;font-weight:bold;color:#4b2a7b;">O que você pode fazer na Velvet:</p>
      <ul style="margin:0 0 20px;padding-left:20px;line-height:2;color:#2d1f3d;">
        <li>Criar um perfil personalizado com bio, capa e avatar</li>
        <li>Receber assinaturas mensais dos seus fãs</li>
        <li>Publicar mídias exclusivas</li>
        <li>Conversar diretamente com quem assina o seu perfil</li>
        <li>Acompanhar seus ganhos de forma transparente</li>
      </ul>

      ${infoBox("purple", `
        <p style="margin:0;line-height:1.6;font-size:13px;color:#4b2a7b;">
          Registrou-se por engano como criador(a)? Envie um email para
          <a href="mailto:contato@velvet.lat" style="color:#6f42c1;font-weight:bold;">contato@velvet.lat</a>
          e solicite a alteração para conta de fã.
        </p>
      `)}

      ${btnPrimary("https://www.velvet.lat", "Acessar a plataforma")}
    `)
  });
}

// ─────────────────────────────────────────────────────────────
// EMAIL PARA MODELOS ANTIGAS: assinar contrato
// ─────────────────────────────────────────────────────────────
async function enviarEmailContratoModelos(email, nomeCompleto) {
  const nome = (nomeCompleto || "").split(" ")[0] || "você";
  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: "📄 Assine seu contrato — pagamentos a partir de 1º do mês",
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#6f42c1;text-align:center;font-size:22px;">
        Contrato de Parceria Velvet 📄
      </h2>
      <p style="text-align:center;margin:0 0 28px;color:#7a6a9a;font-size:14px;">
        Uma atualização importante sobre seus pagamentos
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">Olá, <strong>${nome}</strong>!</p>

      <p style="margin:0 0 20px;line-height:1.7;">
        Para continuar recebendo seus pagamentos pela Velvet, precisamos que você assine o <strong>Contrato de Parceria</strong> digital.
        O processo é rápido, seguro e feito pela própria plataforma — leva menos de 2 minutos.
      </p>

      ${infoBox("purple", `
        <p style="margin:0 0 8px;font-weight:bold;color:#4b2a7b;">📅 Data de pagamento</p>
        <p style="margin:0;line-height:1.7;">
          Os pagamentos são processados sempre no <strong>1º dia de cada mês</strong>,
          exclusivamente para modelos que tenham:
        </p>
        <ul style="margin:10px 0 0;padding-left:18px;line-height:2;color:#4b2a7b;">
          <li>✅ Conta bancária / Pix <strong>validado</strong></li>
          <li>✅ Contrato de parceria <strong>assinado</strong></li>
        </ul>
      `)}

      ${infoBox("pink", `
        <p style="margin:0 0 6px;font-weight:bold;color:#7a1f52;">⚠️ Atenção</p>
        <p style="margin:0;line-height:1.7;">
          Modelos <strong>sem contrato assinado</strong> ou <strong>sem dados bancários validados</strong>
          não receberão pagamentos até que as pendências sejam resolvidas.
        </p>
      `)}

      <p style="margin:0 0 8px;line-height:1.7;color:#2d1f3d;">
        Para assinar, acesse sua conta na Velvet e vá até a seção <strong>Conta → Contrato</strong>:
      </p>

      ${btnPrimary("https://velvet.lat/conta.html", "✍️ Assinar Contrato Agora")}

      <p style="margin:20px 0 0;font-size:13px;color:#9b87b8;text-align:center;line-height:1.6;">
        O contrato é gerado com os seus dados cadastrais e assinado digitalmente com validade jurídica.<br>
        Dúvidas? Responda este email ou fale com a gente em
        <a href="mailto:contato@velvet.lat" style="color:#7B2CFF;">contato@velvet.lat</a>
      </p>
    `)
  });
}

// ─────────────────────────────────────────────────────────────
// NOTIFICAÇÃO INTERNA: contrato assinado → contato@velvet.lat
// ─────────────────────────────────────────────────────────────
async function enviarEmailNotificacaoContratoAssinado({ nomeCompleto, nomeExibicao, emailModelo, modeloId, assinadoEm, pdfR2Key }) {
  const data = assinadoEm
    ? new Date(assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: "contato@velvet.lat",
    subject: `✅ Contrato assinado — ${nomeCompleto || nomeExibicao || emailModelo}`,
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#6f42c1;text-align:center;font-size:21px;">
        ✅ Contrato Assinado
      </h2>
      <p style="text-align:center;margin:0 0 24px;color:#7a6a9a;font-size:14px;">
        Uma modelo acabou de assinar o contrato de parceria
      </p>

      ${infoBox("purple", `
        <p style="margin:0 0 4px;font-weight:bold;color:#4b2a7b;">👤 Dados da modelo</p>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:14px;color:#2d1f3d;">
          <tr><td style="padding:4px 0;width:140px;color:#7a6a9a;">Nome completo</td><td><strong>${nomeCompleto || "—"}</strong></td></tr>
          <tr><td style="padding:4px 0;color:#7a6a9a;">Nome de exibição</td><td>${nomeExibicao || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#7a6a9a;">E-mail</td><td>${emailModelo || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#7a6a9a;">ID na plataforma</td><td>${modeloId || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#7a6a9a;">Assinado em</td><td>${data}</td></tr>
        </table>
      `)}

      ${pdfR2Key ? infoBox("pink", `
        <p style="margin:0 0 4px;font-weight:bold;color:#7a1f52;">📎 PDF salvo no Cloudflare R2</p>
        <p style="margin:0;font-size:13px;color:#7a1f52;word-break:break-all;">${pdfR2Key}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#9b87b8;">Acesse o painel R2 para fazer o download.</p>
      `) : infoBox("pink", `
        <p style="margin:0;color:#7a1f52;">⏳ O PDF será salvo no R2 em breve (processamento assíncrono do ZapSign).</p>
      `)}

      ${btnPrimary("https://velvet.lat/admin", "Ver Painel Admin")}
    `)
  });
}

// ─────────────────────────────────────────────────────────────
// EMAIL DE VERIFICAÇÃO DE ENDEREÇO DE EMAIL
// ─────────────────────────────────────────────────────────────
async function enviarEmailVerificacao(email, nomeCompleto, token) {
  const nome = (nomeCompleto || "").split(" ")[0] || "você";
  const link = `https://velvet.lat/verificar-email.html?token=${token}`;

  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: "✉️ Confirme o seu endereço de email — Velvet",
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#6f42c1;text-align:center;font-size:22px;font-weight:700;">
        Confirme o seu email ✉️
      </h2>
      <p style="text-align:center;margin:0 0 28px;color:#7a6a9a;font-size:14px;">
        Um passo rápido para ativar a sua conta
      </p>

      <p style="margin:0 0 16px;line-height:1.7;font-size:15px;">Olá, <strong>${nome}</strong>! 👋</p>

      <p style="margin:0 0 20px;line-height:1.7;font-size:15px;">
        Obrigado por se registar na Velvet! Para confirmar que este email é válido
        e garantir que recebes todas as notificações importantes, clica no botão abaixo:
      </p>

      ${btnPrimary(link, "✅ Confirmar meu email")}

      ${infoBox("purple", `
        <p style="margin:0;font-size:13px;color:#4b2a7b;line-height:1.6;">
          ⏳ Este link é válido por <strong>48 horas</strong>.<br>
          Se não solicitaste este registo, podes ignorar este email.
        </p>
      `)}

      <p style="margin:20px 0 0;font-size:12px;color:#b0a0c8;text-align:center;word-break:break-all;">
        Link: ${link}
      </p>
    `)
  });
}

async function enviarEmailOTP(email, codigo) {
  const html = wrapEmail(`
    <h2 style="font-size:22px;font-weight:700;color:#2d1f3d;margin:0 0 8px;">Verificação de Email</h2>
    <p style="color:#4b2a7b;font-size:15px;line-height:1.7;margin:0 0 28px;">
      Usa o código abaixo para confirmar o teu email e concluir o cadastro na <strong>Velvet</strong>.
    </p>

    <div style="text-align:center;margin:32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td bgcolor="#7B2CFF" style="background-color:#7B2CFF;border-radius:16px;padding:20px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:40px;font-weight:800;letter-spacing:14px;font-family:'Courier New',Courier,monospace;">${codigo}</span>
          </td>
        </tr>
      </table>
    </div>

    ${infoBox("purple", `
      <p style="margin:0;font-size:13px;color:#4b2a7b;">
        ⏱️ <strong>Este código expira em 15 minutos.</strong><br>
        Se não solicitaste este registo, podes ignorar este email com segurança.
      </p>
    `)}
  `);

  await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: `${codigo} — Código de verificação Velvet`,
    html
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS INTERNOS DE FATURA
// ─────────────────────────────────────────────────────────────
function _fmtData(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) + ' (BRT)';
  } catch { return String(d); }
}

function _fmtBRL(v) {
  if (v === null || v === undefined || v === '') return '—';
  try {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch { return String(v); }
}

function _row(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<tr>
    <td style="padding:5px 14px 5px 0;color:#6b5a7d;font-size:13px;white-space:nowrap;vertical-align:top;width:42%;">${label}</td>
    <td style="padding:5px 0;color:#2d1f3d;font-size:13px;font-weight:600;word-break:break-all;">${value}</td>
  </tr>`;
}

function _tabela(linhas) {
  return `<table style="width:100%;border-collapse:collapse;"><tbody>${linhas.filter(Boolean).join('')}</tbody></table>`;
}

function _secao(titulo, icone, linhas, opts) {
  const bg          = (opts && opts.bg)          || '#f8f4ff';
  const border      = (opts && opts.border)      || '#e5d9ff';
  const titleColor  = (opts && opts.titleColor)  || '#4b2a7b';
  return `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:14px 18px;margin-bottom:14px;">
    <p style="margin:0 0 10px;font-weight:700;color:${titleColor};font-size:14px;">${icone} ${titulo}</p>
    ${_tabela(linhas)}
  </div>`;
}

function _cabecalhoFatura(tipo, ref) {
  const label = ref ? ` #${String(ref).slice(-12).toUpperCase()}` : '';
  return `<div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;background:linear-gradient(135deg,#7B2CFF,#a94cff);color:#fff;border-radius:8px;padding:4px 16px;font-size:11px;font-weight:800;letter-spacing:1.5px;margin-bottom:12px;">
      COMPROVANTE DE PAGAMENTO${label}
    </div>
    <h2 style="margin:8px 0 4px;font-size:20px;color:#2d1f3d;">${tipo}</h2>
    <p style="margin:0;color:#9b87b8;font-size:12px;">Emitido automaticamente em ${_fmtData(new Date())}</p>
  </div>`;
}

function _avisoNaoReembolso(versao_termos) {
  const v = versao_termos || 'vigente';
  return `<div style="background:#fff5f5;border:1px solid #ffc0c0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">
    <p style="margin:0 0 6px;font-weight:700;color:#8b1a1a;font-size:13px;">⚠️ Política de Não Reembolso</p>
    <p style="margin:0;font-size:12px;color:#7a1a1a;line-height:1.7;">
      Ao confirmar este pagamento, você concordou expressamente com os
      <strong>Termos de Uso da Velvet (versão ${v})</strong>,
      incluindo a cláusula de <strong>não reembolso</strong> de assinaturas e conteúdos digitais.
      O acesso ao conteúdo foi imediatamente disponibilizado mediante solicitação,
      conforme <strong>Art. 49, parágrafo único, do CDC</strong>.
      Tentativas de chargeback indevido serão contestadas com as evidências registradas neste comprovante.
    </p>
  </div>`;
}

function _rodapeVelvet() {
  return `<div style="background:#f0ebfa;border-radius:10px;padding:12px 16px;font-size:12px;color:#6b5a7d;line-height:1.8;">
    <strong style="color:#4b2a7b;display:block;margin-bottom:2px;">Velvet Plataforma Digital</strong>
    <a href="mailto:contato@velvet.lat" style="color:#7B2CFF;">contato@velvet.lat</a> &nbsp;·&nbsp;
    <a href="https://www.velvet.lat" style="color:#7B2CFF;">www.velvet.lat</a><br>
    Dúvidas? Responda este e-mail ou acesse o suporte na plataforma.
  </div>`;
}

function _metodoTexto(metodo, card_info) {
  if (metodo === 'pix') return 'PIX';
  if (card_info) {
    const brand = (card_info.brand || '').toUpperCase();
    return `Cartão ${brand} ••••${card_info.last4} (${card_info.exp_month}/${card_info.exp_year})`;
  }
  return 'Cartão de Crédito';
}

function _cpfFmt(cpf) {
  if (!cpf) return null;
  const s = String(cpf).replace(/\D/g, '');
  return s.length === 11 ? s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : cpf;
}

// ─────────────────────────────────────────────────────────────
// FATURA VIP — nova assinatura ou renovação
// ─────────────────────────────────────────────────────────────
async function enviarFaturaVIP({
  nome, email, modelo_nome, valor,
  metodo, card_info, cpf, telefone, ip,
  endereco, novaExpiracao, primeiraAssinatura,
  aceite_timestamp, versao_termos, payment_ref
}) {
  if (!email) return;

  const isNova     = primeiraAssinatura !== false;
  const tipoLabel  = isNova ? '✨ Nova Assinatura VIP' : '🔄 Renovação VIP';
  const subject    = isNova
    ? '✨ Assinatura VIP confirmada — Velvet'
    : '🔄 Renovação VIP confirmada — Velvet';

  const html = wrapEmail(`
    ${_cabecalhoFatura(tipoLabel, payment_ref)}

    ${_secao('Dados do Cliente', '👤', [
      _row('Nome',      nome),
      _row('E-mail',    email),
      _row('CPF',       _cpfFmt(cpf)),
      _row('Telefone',  telefone),
      _row('Endereço',  endereco),
    ])}

    ${_secao('Detalhes do Pagamento', '💳', [
      _row('Valor pago',            _fmtBRL(valor)),
      _row('Método de pagamento',   _metodoTexto(metodo, card_info)),
      _row('Data do pagamento',     _fmtData(aceite_timestamp)),
      _row('Referência',            payment_ref),
    ])}

    ${_secao('Produto Adquirido', '✨', [
      _row('Produto',              isNova ? 'Assinatura VIP — 1ª ativação' : 'Renovação VIP'),
      _row('Criadora',             modelo_nome),
      _row('Duração',              '30 dias'),
      _row('Acesso válido até',    _fmtData(novaExpiracao)),
    ])}

    ${_secao('Registro de Aceite dos Termos', '🔒', [
      _row('IP de acesso',              ip),
      _row('Data/hora do aceite',       _fmtData(aceite_timestamp)),
      _row('Versão dos termos',         versao_termos),
      _row('Termos aceitos',            'Sim'),
      _row('Confirmação de maioridade', 'Sim (+18)'),
    ], { bg: '#fffbf0', border: '#ffe0a0', titleColor: '#7a4a00' })}

    ${_avisoNaoReembolso(versao_termos)}
    ${_rodapeVelvet()}
  `);

  await resend.emails.send({
    from: 'Velvet <contato@velvet.lat>',
    to: email,
    subject,
    html
  });
}

// ─────────────────────────────────────────────────────────────
// FATURA CONTEÚDO — mídia no chat
// ─────────────────────────────────────────────────────────────
async function enviarFaturaConteudo({
  nome, email, modelo_nome, valor,
  metodo, card_info, cpf, telefone, ip,
  aceite_timestamp, versao_termos, payment_ref
}) {
  if (!email) return;

  const html = wrapEmail(`
    ${_cabecalhoFatura('💬 Conteúdo no Chat Desbloqueado', payment_ref)}

    ${_secao('Dados do Cliente', '👤', [
      _row('Nome',      nome),
      _row('E-mail',    email),
      _row('CPF',       _cpfFmt(cpf)),
      _row('Telefone',  telefone),
    ])}

    ${_secao('Detalhes do Pagamento', '💳', [
      _row('Valor pago',           _fmtBRL(valor)),
      _row('Método de pagamento',  _metodoTexto(metodo, card_info)),
      _row('Data do pagamento',    _fmtData(aceite_timestamp)),
      _row('Referência',           payment_ref),
    ])}

    ${_secao('Produto Adquirido', '💬', [
      _row('Produto',  'Conteúdo no chat'),
      _row('Criadora', modelo_nome),
      _row('Acesso',   'Imediato — disponível no chat'),
    ])}

    ${_secao('Registro de Aceite dos Termos', '🔒', [
      _row('IP de acesso',        ip),
      _row('Data/hora do aceite', _fmtData(aceite_timestamp)),
      _row('Versão dos termos',   versao_termos),
      _row('Termos aceitos',      'Sim'),
    ], { bg: '#fffbf0', border: '#ffe0a0', titleColor: '#7a4a00' })}

    ${_avisoNaoReembolso(versao_termos)}
    ${_rodapeVelvet()}
  `);

  await resend.emails.send({
    from: 'Velvet <contato@velvet.lat>',
    to: email,
    subject: '💬 Conteúdo desbloqueado — Velvet',
    html
  });
}

// ─────────────────────────────────────────────────────────────
// FATURA PREMIUM — conteúdo premium do feed
// ─────────────────────────────────────────────────────────────
async function enviarFaturaPremium({
  nome, email, modelo_nome, valor,
  metodo, card_info, cpf, telefone, ip,
  aceite_timestamp, versao_termos, payment_ref
}) {
  if (!email) return;

  const html = wrapEmail(`
    ${_cabecalhoFatura('💎 Conteúdo Premium Desbloqueado', payment_ref)}

    ${_secao('Dados do Cliente', '👤', [
      _row('Nome',      nome),
      _row('E-mail',    email),
      _row('CPF',       _cpfFmt(cpf)),
      _row('Telefone',  telefone),
    ])}

    ${_secao('Detalhes do Pagamento', '💳', [
      _row('Valor pago',           _fmtBRL(valor)),
      _row('Método de pagamento',  _metodoTexto(metodo, card_info)),
      _row('Data do pagamento',    _fmtData(aceite_timestamp)),
      _row('Referência',           payment_ref),
    ])}

    ${_secao('Produto Adquirido', '💎', [
      _row('Produto',  'Conteúdo premium'),
      _row('Criadora', modelo_nome),
      _row('Acesso',   'Imediato — disponível no feed'),
    ])}

    ${_secao('Registro de Aceite dos Termos', '🔒', [
      _row('IP de acesso',        ip),
      _row('Data/hora do aceite', _fmtData(aceite_timestamp)),
      _row('Versão dos termos',   versao_termos),
      _row('Termos aceitos',      'Sim'),
    ], { bg: '#fffbf0', border: '#ffe0a0', titleColor: '#7a4a00' })}

    ${_avisoNaoReembolso(versao_termos)}
    ${_rodapeVelvet()}
  `);

  await resend.emails.send({
    from: 'Velvet <contato@velvet.lat>',
    to: email,
    subject: '💎 Conteúdo premium desbloqueado — Velvet',
    html
  });
}

// ─────────────────────────────────────────────────────────────
// AVISO VIP — 7 dias antes do vencimento
// ─────────────────────────────────────────────────────────────
async function enviarEmailAviso7Dias(email, modelo_id) {
  const linkPerfil = `https://velvet.lat/perfil.html?modelo_id=${modelo_id}`;
  await resend.emails.send({
    from: 'Velvet <contato@velvet.lat>',
    to: email,
    subject: 'Seu VIP expira em 7 dias 💜',
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#6f42c1;text-align:center;font-size:20px;">
        Sua assinatura VIP está chegando ao fim
      </h2>
      <p style="text-align:center;margin:0 0 24px;color:#7a6a9a;font-size:14px;">
        Renove para manter seu acesso exclusivo
      </p>

      <div style="background:#f8f4ff;border-left:4px solid #7B2CFF;border-radius:0 10px 10px 0;padding:14px 18px;margin:0 0 20px;">
        <p style="margin:0;font-weight:bold;color:#6f42c1;font-size:15px;">
          ⏳ Faltam 7 dias para o vencimento
        </p>
      </div>

      <p style="margin:0 0 20px;line-height:1.7;">
        Olá! A sua assinatura VIP está próxima do vencimento. Renove agora para continuar com acesso ao conteúdo exclusivo e ao chat direto com a criadora.
      </p>

      ${infoBox('purple', `
        <p style="margin:0 0 10px;font-weight:bold;color:#4b2a7b;font-size:14px;">Com o VIP ativo você tem acesso a:</p>
        <p style="margin:0;line-height:2;font-size:14px;">
          💬 Chat direto com a criadora<br>
          🎁 Mídias do perfil<br>
          ✨ Benefícios especiais para assinantes
        </p>
      `)}

      ${btnPrimary(linkPerfil, 'Renovar VIP agora')}
    `)
  });
}

// ─────────────────────────────────────────────────────────────
// AVISO VIP — 24 horas antes do vencimento
// ─────────────────────────────────────────────────────────────
async function enviarEmailAviso24h(email, modelo_id) {
  const linkPerfil = `https://velvet.lat/perfil.html?modelo_id=${modelo_id}`;
  await resend.emails.send({
    from: 'Velvet <contato@velvet.lat>',
    to: email,
    subject: '⏰ Seu VIP expira amanhã — renove agora!',
    html: wrapEmail(`
      <h2 style="margin:0 0 6px;color:#b0307d;text-align:center;font-size:20px;">
        Última chance de renovar seu VIP
      </h2>
      <p style="text-align:center;margin:0 0 24px;color:#7a6a9a;font-size:14px;">
        Seu acesso expira em menos de 24 horas
      </p>

      <div style="background:#fff2f8;border-left:4px solid #b0307d;border-radius:0 10px 10px 0;padding:14px 18px;margin:0 0 20px;">
        <p style="margin:0;font-weight:bold;color:#b0307d;font-size:15px;">
          🚨 Expira amanhã — não perca seu acesso!
        </p>
      </div>

      <p style="margin:0 0 20px;line-height:1.7;">
        Olá! A sua assinatura VIP termina amanhã. Renove agora para não perder o acesso às mídias do perfil e ao chat direto com a criadora.
      </p>

      ${infoBox('pink', `
        <p style="margin:0 0 10px;font-weight:bold;color:#7a1f52;font-size:14px;">O que você perde ao não renovar:</p>
        <p style="margin:0;line-height:2;font-size:14px;">
          💬 Acesso ao chat exclusivo<br>
          🎁 Mídias do perfil<br>
          ✨ Seus benefícios de assinante
        </p>
      `)}

      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${linkPerfil}" style="display:inline-block;background:linear-gradient(135deg,#b0307d,#d45fa0);color:#fff;text-decoration:none;padding:15px 32px;border-radius:10px;font-weight:bold;font-size:15px;">
          Renovar VIP agora
        </a>
      </div>
    `)
  });
}

// ─────────────────────────────────────────────────────────────
// BREVO LISTS — sincronização de VIPs por modelo
// (mantém os nomes antigos de função para não exigir mudanças
// nos pontos de chamada em server.js; "audience_id" agora é
// um list id do Brevo, não mais um audience id do Resend)
// ─────────────────────────────────────────────────────────────
const brevo = require('./brevo');

async function obterOuCriarAudienceVIP(db, modelo_id, nome_modelo) {
  return brevo.obterOuCriarListaVIP(db, brevo.FOLDER_ID_VELVET, modelo_id, nome_modelo);
}

async function adicionarContatoAudienceVIP(audience_id, email, nome) {
  try {
    await brevo.adicionarContatoLista(audience_id, email, nome);
  } catch (e) {
    console.warn(`[Lista Brevo] Aviso ao adicionar contato ${email}:`, e.message);
  }
}

async function removerContatoAudienceVIP(audience_id, email) {
  try {
    await brevo.removerContatoLista(audience_id, email);
  } catch (e) {
    console.warn(`[Lista Brevo] Aviso ao remover contato ${email}:`, e.message);
  }
}

async function enviarCampanhaVIP({ audience_id, subject, html, nome_campanha }) {
  return brevo.enviarCampanha({ listId: audience_id, subject, html, nomeCampanha: nome_campanha });
}

async function enviarEmailOfertaExpirando({ email, nome_modelo, nome_oferta, data_fim, assinaturas_usadas, limite_assinaturas }) {
  const dataFmt = new Date(data_fim).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const aproveitaram = Number(assinaturas_usadas) || 0;
  const limite = Number(limite_assinaturas) || 0;
  const restantes = Math.max(0, limite - aproveitaram);

  const html = wrapEmail(`
    <h2 style="color:#b0307d;text-align:center;margin:0 0 6px;">⏳ Sua oferta expira em breve</h2>
    <p style="text-align:center;color:#7a6a9a;margin:0 0 24px;">A oferta <strong>${nome_oferta}</strong> termina em <strong>${dataFmt}</strong>.</p>

    ${infoBox(`
      <p style="margin:0 0 8px;font-weight:bold;color:#6f42c1;">📊 Resumo da oferta:</p>
      <p style="margin:0;line-height:2;">
        👥 Clientes que aproveitaram: <strong>${aproveitaram}</strong><br>
        🎯 Limite total: <strong>${limite}</strong><br>
        🔓 Vagas restantes: <strong>${restantes}</strong>
      </p>
    `)}

    <p style="margin:16px 0;line-height:1.7;">
      Após a expiração, os clientes voltarão a ver o valor original da assinatura.
      Que tal criar uma nova oferta para continuar atraindo novos assinantes?
    </p>

    ${btnPrimary("https://velvet.lat/ofertas.html", "Criar nova oferta")}
  `);

  const { error } = await resend.emails.send({
    from: "Velvet <contato@velvet.lat>",
    to: email,
    subject: `⏳ Sua oferta "${nome_oferta}" expira hoje — ${aproveitaram} cliente(s) aproveitaram`,
    html
  });

  if (error) throw new Error(JSON.stringify(error));
}

async function enviarCampanhaNovidadeFeed({ audience_id, nome_modelo, modelo_id, qtd }) {
  const plural = Number(qtd) === 1 ? "foto nova" : "fotos novas";

  const html = wrapEmail(`
    <h2 style="color:#7B2CFF;text-align:center;margin:0 0 6px;">📸 ${nome_modelo} postou novidades!</h2>
    <p style="text-align:center;color:#6b5a7d;margin:0 0 24px;">
      ${qtd} ${plural} exclusivas no feed VIP, só pra quem já é assinante.
    </p>
    ${btnPrimary(`https://velvet.lat/perfil.html?modelo_id=${modelo_id}`, "Ver no perfil")}
  `);

  return enviarCampanhaVIP({
    audience_id,
    subject: `📸 ${nome_modelo} postou ${qtd} ${plural}!`,
    html,
    nome_campanha: `Novidade feed — ${nome_modelo}`
  });
}

async function enviarCampanhaNovidadePremium({ audience_id, nome_modelo, modelo_id, qtd, preco, descricao }) {
  const precoFmt = Number(preco || 0).toFixed(2).replace(".", ",");
  const plural = Number(qtd) === 1 ? "mídia exclusiva" : `${qtd} mídias exclusivas`;

  const html = wrapEmail(`
    <h2 style="color:#7B2CFF;text-align:center;margin:0 0 6px;">💎 ${nome_modelo} lançou um conteúdo Premium</h2>
    ${infoBox("purple", `
      <p style="margin:0 0 8px;">${descricao || plural}</p>
      <p style="margin:0;font-weight:bold;">Preço: R$ ${precoFmt}</p>
    `)}
    ${btnPrimary(`https://velvet.lat/perfil.html?modelo_id=${modelo_id}&tab=paid`, "Desbloquear agora")}
  `);

  return enviarCampanhaVIP({
    audience_id,
    subject: `💎 ${nome_modelo} lançou um conteúdo Premium novo!`,
    html,
    nome_campanha: `Novidade premium — ${nome_modelo}`
  });
}

async function enviarCampanhaNovidadeChat({ audience_id, nome_modelo, modelo_id, qtd }) {
  const plural = Number(qtd) === 1 ? "mídia nova" : "mídias novas";

  const html = wrapEmail(`
    <h2 style="color:#7B2CFF;text-align:center;margin:0 0 6px;">🔥 ${nome_modelo} tem fotos novas no chat</h2>
    <p style="text-align:center;color:#6b5a7d;margin:0 0 24px;">
      ${qtd} ${plural} disponíveis para desbloqueio direto na sua conversa.
    </p>
    ${btnPrimary(`https://velvet.lat/chatc.html?modelo_id=${modelo_id}`, "Ver no chat")}
  `);

  return enviarCampanhaVIP({
    audience_id,
    subject: `🔥 ${nome_modelo} tem novidades esperando no seu chat`,
    html,
    nome_campanha: `Novidade chat — ${nome_modelo}`
  });
}

async function enviarCampanhaNovidadeOferta({ audience_id, nome_modelo, modelo_id, desconto_percentual, mensagem, data_fim }) {
  const dataFmt = new Date(data_fim).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const html = wrapEmail(`
    <h2 style="color:#7B2CFF;text-align:center;margin:0 0 6px;">🎉 ${nome_modelo} lançou uma oferta especial</h2>
    ${infoBox("pink", `
      <p style="margin:0 0 8px;font-weight:bold;">${desconto_percentual}% de desconto na assinatura</p>
      ${mensagem ? `<p style="margin:0 0 8px;">${mensagem}</p>` : ""}
      <p style="margin:0;color:#7a6a9a;">Válido até ${dataFmt}</p>
    `)}
    ${btnPrimary(`https://velvet.lat/perfil.html?modelo_id=${modelo_id}`, "Ver oferta")}
  `);

  return enviarCampanhaVIP({
    audience_id,
    subject: `🎉 ${nome_modelo} liberou ${desconto_percentual}% de desconto pra você`,
    html,
    nome_campanha: `Novidade oferta — ${nome_modelo}`
  });
}

// ─────────────────────────────────────────────────────────────
// AUDIENCE GLOBAL — clientes que ainda não são VIP de ninguém
// ─────────────────────────────────────────────────────────────

async function obterOuCriarAudienceNaoAssinantes(db) {
  const dbRes = await db.query(
    "SELECT value FROM app_settings WHERE key = 'brevo_lista_nao_assinantes_id'"
  );
  const existingId = dbRes.rows[0]?.value;
  if (existingId) return Number(existingId);

  const lista = await brevo.request("POST", "/v3/contacts/lists", {
    name: "Não Assinantes",
    folderId: brevo.FOLDER_ID_VELVET
  });

  await db.query(
    `INSERT INTO app_settings (key, value, atualizado_em)
     VALUES ('brevo_lista_nao_assinantes_id', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, atualizado_em = NOW()`,
    [String(lista.id)]
  );
  console.log(`[Lista Brevo] "Não Assinantes" criada: ${lista.id}`);
  return lista.id;
}

function blocoDestaqueModelo(d) {
  const partes = [];

  if (d.feed_qtd > 0) {
    partes.push(`<p style="margin:0 0 6px;">📸 ${d.feed_qtd} ${d.feed_qtd === 1 ? "foto nova" : "fotos novas"} no feed VIP</p>`);
  }

  for (const p of d.premiums || []) {
    const precoFmt = Number(p.preco || 0).toFixed(2).replace(".", ",");
    partes.push(`<p style="margin:0 0 6px;">💎 Premium novo: ${p.descricao || "mídia exclusiva"} — R$ ${precoFmt}</p>`);
  }

  if (d.oferta) {
    const dataFmt = new Date(d.oferta.data_fim).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    partes.push(`<p style="margin:0 0 6px;">🎉 ${d.oferta.desconto_percentual}% de desconto na assinatura até ${dataFmt}</p>`);
  }

  if (!partes.length) return "";

  return `
    <div style="display:flex;align-items:center;gap:10px;margin:0 0 10px;">
      <img src="${d.avatar || ""}" alt="${d.nome_exibicao}" width="40" height="40" style="border-radius:50%;object-fit:cover;background:#e5d9ff;">
      <strong style="color:#2d1f3d;font-size:15px;">${d.nome_exibicao}</strong>
    </div>
    <div style="margin:0 0 20px 50px;color:#4b2a7b;font-size:14px;line-height:1.6;">
      ${partes.join("")}
      <a href="https://velvet.lat/perfil.html?modelo_id=${d.modelo_id}" style="color:#7B2CFF;font-weight:bold;text-decoration:none;font-size:13px;">Ver perfil →</a>
    </div>
  `;
}

async function enviarCampanhaNovidadesSemanais({ audience_id, destaques }) {
  const corpo = destaques.map(blocoDestaqueModelo).filter(Boolean).join("");

  const html = wrapEmail(`
    <h2 style="color:#7B2CFF;text-align:center;margin:0 0 6px;">✨ As novidades da semana na Velvet</h2>
    <p style="text-align:center;color:#6b5a7d;margin:0 0 28px;">
      Separamos o que rolou de melhor essa semana pra você não perder nada.
    </p>

    ${corpo}

    ${btnPrimary("https://velvet.lat/feed.html", "Explorar a plataforma")}
  `);

  return enviarCampanhaVIP({
    audience_id,
    subject: "✨ As novidades da semana na Velvet",
    html,
    nome_campanha: `Novidades semanais — ${new Date().toLocaleDateString("pt-BR")}`
  });
}

module.exports = {
  enviarEmailValidacao,
  enviarEmailAprovacao,
  enviarEmailRejeicao,
  enviarEmailBoasVindasCliente,
  enviarEmailBoasVindasModelo,
  enviarEmailContratoModelos,
  enviarEmailNotificacaoContratoAssinado,
  enviarEmailVerificacao,
  enviarEmailOTP,
  enviarFaturaVIP,
  enviarFaturaConteudo,
  enviarFaturaPremium,
  enviarEmailAviso7Dias,
  enviarEmailAviso24h,
  obterOuCriarAudienceVIP,
  adicionarContatoAudienceVIP,
  removerContatoAudienceVIP,
  enviarCampanhaVIP,
  enviarEmailOfertaExpirando,
  enviarCampanhaNovidadeFeed,
  enviarCampanhaNovidadePremium,
  enviarCampanhaNovidadeChat,
  enviarCampanhaNovidadeOferta,
  obterOuCriarAudienceNaoAssinantes,
  enviarCampanhaNovidadesSemanais
};
