(function () {
  const API = "";
  const SESSION_KEY = "vw_suporte_sessao";
  const STATE_KEY   = "vw_chat_ui";

  let sessaoId = localStorage.getItem(SESSION_KEY) || null;
  let aberto   = false;
  let etapaAtual = "inicio";

  function getLang() {
    return (typeof getCurrentLanguage === "function" ? getCurrentLanguage() : null)
      || localStorage.getItem("idioma") || localStorage.getItem("lang") || "pt";
  }
  const _lang = getLang();

  const TX = {
    pt: {
      title: "Suporte Velvet", online: "🟢 Online", fechar_aria: "Fechar suporte",
      email_prompt: "Para te ajudar melhor, informe seu e-mail:",
      btn_iniciar: "Iniciar atendimento", aguarde: "Aguarde…",
      redirect_msg: "Ok! Vou te levar lá agora. 👇\n\nQuando voltar, use os botões abaixo para continuar ou resolver outra dúvida.",
      redirect_outro: "🏠 Resolver outra dúvida",
      contato_msg: "Vou te encaminhar para o formulário de contato! Nossa equipe responde em até 48h. 💜\n\nQuando voltar, use os botões abaixo.",
      contato_btn: "📬 Ir para Contato",
    },
    es: {
      title: "Soporte Velvet", online: "🟢 En línea", fechar_aria: "Cerrar soporte",
      email_prompt: "Para ayudarte mejor, ingresa tu correo electrónico:",
      btn_iniciar: "Iniciar atención", aguarde: "Espera…",
      redirect_msg: "¡Ok! Te llevo ahí ahora. 👇\n\nCuando vuelvas, usa los botones de abajo para continuar o resolver otra duda.",
      redirect_outro: "🏠 Resolver otra duda",
      contato_msg: "¡Te dirijo al formulario de contacto! Nuestro equipo responde en hasta 48h. 💜\n\nCuando vuelvas, usa los botones de abajo.",
      contato_btn: "📬 Ir a Contacto",
    },
    en: {
      title: "Velvet Support", online: "🟢 Online", fechar_aria: "Close support",
      email_prompt: "To help you better, please enter your email:",
      btn_iniciar: "Start support", aguarde: "Please wait…",
      redirect_msg: "Ok! Taking you there now. 👇\n\nWhen you return, use the buttons below to continue or resolve another question.",
      redirect_outro: "🏠 Resolve another question",
      contato_msg: "I'll direct you to the contact form! Our team responds within 48h. 💜\n\nWhen you return, use the buttons below.",
      contato_btn: "📬 Go to Contact",
    }
  };
  const T = TX[_lang] || TX.pt;

  // ─── Restaurar estado salvo ──────────────────────────────────────────────────
  let estadoSalvo = null;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) estadoSalvo = JSON.parse(raw);
  } catch (_) {}

  // ─── Árvore de conteúdo ─────────────────────────────────────────────────────
  const ARVORE_PT = {
    inicio: {
      bot: "👋 Olá! Bem-vindo ao suporte automático da Velvet.\nEm que podemos ajudar?",
      opcoes: [
        { label: "👩‍💻 Sou Criadora", next: "criadora" },
        { label: "🛍️ Sou Cliente",   next: "cliente"  },
      ]
    },

    // ── CRIADORA ───────────────────────────────────────────────────────────────
    criadora: {
      bot: "Ótimo! Sobre o que você precisa de ajuda?",
      opcoes: [
        { label: "1. Saber mais sobre a Velvet",   next: "c1_velvet"     },
        { label: "2. Meu Perfil / Conta",           next: "c2_perfil"     },
        { label: "3. Agenciamento",                 next: "c3_agencia"    },
        { label: "4. Pagamentos e Ganhos",          next: "c4_pagamentos" },
        { label: "5. Mídias e Conteúdos",          next: "c5_midias"     },
        { label: "6. Não encontrei minha dúvida",  action: "contato"     },
        { label: "← Início",                        next: "inicio"        },
      ]
    },

    // 1. VELVET
    c1_velvet: {
      bot: "Sobre a Velvet, o que deseja saber?",
      opcoes: [
        { label: "1.1 O que é e como funciona a Velvet?", next: "c1_1" },
        { label: "1.2 Tipos de pagamento do cliente",      next: "c1_2" },
        { label: "← Voltar",                               next: "criadora" },
      ]
    },
    c1_1: {
      bot: "A Velvet nasceu da convicção de que os criadores de conteúdo merecem uma plataforma construída a pensar neles — onde possam partilhar o seu trabalho, crescer a sua comunidade e monetizar o seu talento com total autonomia.\n\nAcreditamos numa internet onde a relação entre criadores e fãs é direta, próxima e genuína. Por isso construímos ferramentas que colocam os criadores no controlo da sua presença digital e da sua carreira.",
      opcoes: [
        { label: "← Voltar",        next: "c1_velvet" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c1_2: {
      bot: "Os clientes podem pagar via:\n\n💳 Pix\n💳 Cartão de débito/crédito",
      opcoes: [
        { label: "← Voltar",        next: "c1_velvet" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },

    // 2. PERFIL / CONTA
    c2_perfil: {
      bot: "Sobre o seu perfil/conta, o que deseja saber?",
      opcoes: [
        { label: "2.1 Como validar minha conta?",     next: "c2_1" },
        { label: "2.2 Como divulgar meu perfil?",     next: "c2_2" },
        { label: "2.3 Como funciona o feed?",         next: "c2_3" },
        { label: "2.4 Como funciona meu Perfil?",     next: "c2_4" },
        { label: "2.5 Como funciona o Premium?",      next: "c2_5" },
        { label: "2.6 Como funciona o Chat?",         next: "c2_6" },
        { label: "2.7 Quero excluir minha conta",     next: "c2_7" },
        { label: "← Voltar",                          next: "criadora" },
      ]
    },
    c2_1: {
      bot: "Para validar sua conta basta preencher passo a passo todas as informações na página de dados pessoais e enviar para análise.\n\nVou te direcionar para lá agora! 👇",
      opcoes: [
        { label: "📋 Ir para Dados Pessoais", action: "redirect", url: "/conta.html" },
        { label: "← Voltar",                  next: "c2_perfil" },
      ]
    },
    c2_2: {
      bot: "Para divulgar seu perfil, acesse a página de links onde você pode copiar e compartilhar nas suas redes sociais! 🔗",
      opcoes: [
        { label: "🔗 Ver meus links", action: "redirect", url: "/links.html" },
        { label: "← Voltar",          next: "c2_perfil" },
      ]
    },
    c2_3: {
      bot: "O feed reúne o perfil das criadoras presentes na plataforma, permitindo aos utilizadores descobrir novos perfis e acompanhar quem já seguem.\n\n✅ Descobrir novas modelos\n✅ Aceder rapidamente ao perfil de cada criadora\n✅ Assinar perfis diretamente com um clique",
      opcoes: [
        { label: "← Voltar",        next: "c2_perfil" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c2_4: {
      bot: "O Perfil é o espaço onde as criadoras publicam conteúdos para manter os seus seguidores envolvidos e divulgar novidades.\n\nAtravés do perfil, é possível:\n✅ Publicar fotos e vídeos\n✅ Publicar conteúdos acessíveis apenas para assinantes\n✅ Divulgar novos conteúdos, promoções e campanhas\n✅ Aumentar o envolvimento e incentivar novas subscrições",
      opcoes: [
        { label: "← Voltar",        next: "c2_perfil" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c2_5: {
      bot: "O Premium é a área onde ficam reunidas as fotos e vídeos mais especiais — conteúdos que precisam ser desbloqueados individualmente, diferente das mídias do perfil.\n\nNesta secção:\n✅ Acesso mediante pagamento por post\n✅ A criadora pode escrever legendas e atualizações\n✅ Conteúdos especiais reservados para assinantes\n✅ Novos conteúdos à medida que a criadora os publica",
      opcoes: [
        { label: "← Voltar",        next: "c2_perfil" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c2_6: {
      bot: "O Chat da Velvet permite que as criadoras conversem diretamente com os seus assinantes de forma simples e segura.\n\nAtravés do chat, podes:\n✅ Conversar em tempo real com os teus assinantes\n✅ Enviar fotos e vídeos gratuitos\n✅ Vender conteúdos pagos (PPV) diretamente na conversa\n✅ Criar uma relação mais próxima com a tua comunidade\n✅ Receber notificações de novas mensagens\n\nO chat é uma das principais ferramentas de monetização da plataforma! 💜",
      opcoes: [
        { label: "← Voltar",        next: "c2_perfil" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c2_7: {
      bot: "Para excluir sua conta, vá até o final da página de Dados Pessoais e clique em \"Excluir conta permanentemente\".",
      opcoes: [
        { label: "📋 Ir para Dados Pessoais", action: "redirect", url: "/conta.html" },
        { label: "← Voltar",                  next: "c2_perfil" },
      ]
    },

    // 3. AGENCIAMENTO
    c3_agencia: {
      bot: "Sobre agenciamento, o que deseja saber?",
      opcoes: [
        { label: "3.1 O que é uma agência?",          next: "c3_1" },
        { label: "3.2 Como entrar para uma agência?", next: "c3_2" },
        { label: "← Voltar",                          next: "criadora" },
      ]
    },
    c3_1: {
      bot: "Uma agência na Velvet atua como representante e gestora das criadoras de conteúdo. O objetivo é ajudar no crescimento da carreira, organização do trabalho e aumento dos ganhos.\n\nAs principais funções:\n\n📌 Gestão de carreira — planejamento e estratégias\n📌 Acompanhamento do desempenho\n📌 Divulgação — promover perfis e atrair assinantes\n📌 Análise de resultados — métricas e retenção\n📌 Gestão financeira — acompanhar ganhos e repasses\n📌 Segurança — garantir conformidade com as políticas da Velvet",
      opcoes: [
        { label: "← Voltar",        next: "c3_agencia" },
        { label: "🏠 Menu Criadora", next: "criadora"   },
      ]
    },
    c3_2: {
      bot: "Para entrar para uma agência, selecione a opção OUTRO no formulário de contato, informe que deseja ser agenciada e informe seu WhatsApp e/ou email.\n\nIremos solicitar que a contactem e você terá liberdade de escolha! 💜",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "c3_agencia" },
      ]
    },

    // 4. PAGAMENTOS
    c4_pagamentos: {
      bot: "Sobre pagamentos e ganhos, o que deseja saber?",
      opcoes: [
        { label: "4.1 Como funcionam os pagamentos?",     next: "c4_1" },
        { label: "4.2 Onde coloco meus dados bancários?", next: "c4_2" },
        { label: "4.3 Onde vejo meus ganhos?",            next: "c4_3" },
        { label: "4.4 O que são valores pendentes?",      next: "c4_4" },
        { label: "4.5 Qual valor para minha assinatura?", next: "c4_5" },
        { label: "4.6 Para que serve a oferta?",          next: "c4_6" },
        { label: "← Voltar",                              next: "criadora" },
      ]
    },
    c4_1: {
      bot: "Atualmente os pagamentos são feitos 1× por mês, entre os dias 1 e 5.\n\n⚡ Já estamos implantando um sistema de saque onde você poderá escolher o dia e programar quando receber!",
      opcoes: [
        { label: "← Voltar",        next: "c4_pagamentos" },
        { label: "🏠 Menu Criadora", next: "criadora"      },
      ]
    },
    c4_2: {
      bot: "Para adicionar seus dados bancários, vá em Ganhos no menu e ao final da página em Dados Bancários.",
      opcoes: [
        { label: "💰 Ir para Ganhos", action: "redirect", url: "/relatorio.html" },
        { label: "← Voltar",          next: "c4_pagamentos" },
      ]
    },
    c4_3: {
      bot: "Basta ir em Ganhos, onde você terá acesso aos seus ganhos por dia, mês, mídia, assinatura, etc.",
      opcoes: [
        { label: "💰 Ir para Ganhos", action: "redirect", url: "/relatorio.html" },
        { label: "← Voltar",          next: "c4_pagamentos" },
      ]
    },
    c4_4: {
      bot: "São valores pagos pelo cliente via cartão de crédito. Dependemos da operadora avaliar o pagamento, descartar fraude e liberar o valor — o que pode levar de 3 a 30 dias.\n\nNão se preocupe! A própria plataforma atualiza os ganhos pendentes para liberados automaticamente. ✅",
      opcoes: [
        { label: "← Voltar",        next: "c4_pagamentos" },
        { label: "🏠 Menu Criadora", next: "criadora"      },
      ]
    },
    c4_5: {
      bot: "O valor que preferir! 😊\n\nLembre-se das porcentagens da plataforma e, se for agenciada, das % da agência também. Por isso não indicamos menos que R$ 20,00.",
      opcoes: [
        { label: "← Voltar",        next: "c4_pagamentos" },
        { label: "🏠 Menu Criadora", next: "criadora"      },
      ]
    },
    c4_6: {
      bot: "Caso tenha uma assinatura de alto valor e deseje dar um desconto por um período, você pode usar a opção Oferta! 🎁",
      opcoes: [
        { label: "← Voltar",        next: "c4_pagamentos" },
        { label: "🏠 Menu Criadora", next: "criadora"      },
      ]
    },

    // 5. MÍDIAS
    c5_midias: {
      bot: "Sobre mídias e conteúdos, o que deseja saber?",
      opcoes: [
        { label: "5.1 Que tipo de conteúdo posso postar?", next: "c5_1" },
        { label: "5.2 Como classifico meu perfil?",         next: "c5_2" },
        { label: "5.3 Precisa ser conteúdo exclusivo?",     next: "c5_3" },
        { label: "5.4 Como funciona o feed?",               next: "c5_4" },
        { label: "5.5 Como funciona meu Perfil?",           next: "c5_5" },
        { label: "5.6 Como funciona o Premium?",            next: "c5_6" },
        { label: "5.7 Como funciona o Chat?",               next: "c5_7" },
        { label: "← Voltar",                                next: "criadora" },
      ]
    },
    c5_1: {
      bot: "A Velvet não é exclusiva para conteúdo adulto! Os Criadores podem monetizar qualquer tipo de conteúdo digital:\n\n📚 Educativos\n🎨 Artísticos e culturais\n📣 Informativos e de entretenimento\n📸 Pessoais e de lifestyle\n🔞 Adulto (com validação de identidade)\n\nTodos os conteúdos devem respeitar a legislação aplicável, direitos de terceiros e as políticas da Velvet.",
      opcoes: [
        { label: "← Voltar",        next: "c5_midias" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c5_2: {
      bot: "Você pode classificar seu perfil de acordo com o que tem a oferecer:\n\n🌍 Social — Dia a dia, viagens, gaming, fitness, moda e muito mais.\n\n🔥 Premium — Conteúdo sensual (biquíni, lingerie, cosplay) sem nudez explícita.\n\n🔒 Privado — Conteúdo adulto, disponível mediante validação de identidade do utilizador.",
      opcoes: [
        { label: "← Voltar",        next: "c5_midias" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c5_3: {
      bot: "Não! Podes publicar mídias que já partilhaste noutras redes sociais ou criar conteúdos específicos para a Velvet.\n\n💡 Uma estratégia que gera bons resultados: publicar um teaser nas redes sociais e disponibilizar o conteúdo completo na Velvet.\n\nQuanto mais valor entregares aos teus assinantes, maior será a retenção e atração de novos! 🚀",
      opcoes: [
        { label: "← Voltar",        next: "c5_midias" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c5_4: {
      bot: "O feed reúne o perfil das criadoras presentes na plataforma, permitindo aos utilizadores descobrir novos perfis e acompanhar quem já seguem.\n\n✅ Descobrir novas modelos\n✅ Aceder rapidamente ao perfil de cada criadora\n✅ Assinar perfis diretamente com um clique",
      opcoes: [
        { label: "← Voltar",        next: "c5_midias" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c5_5: {
      bot: "O Perfil é o espaço onde as criadoras publicam conteúdos para manter os seus seguidores envolvidos e divulgar novidades.\n\nAtravés do perfil:\n✅ Publicar fotos e vídeos\n✅ Conteúdos para assinantes\n✅ Divulgar novidades e campanhas\n✅ Aumentar novas subscrições",
      opcoes: [
        { label: "← Voltar",        next: "c5_midias" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c5_6: {
      bot: "O Premium reúne conteúdos mais especiais que precisam ser desbloqueados individualmente.\n\n✅ Acesso mediante pagamento por post\n✅ Legendas e atualizações da criadora\n✅ Conteúdos exclusivos para assinantes\n✅ Novos conteúdos em tempo real",
      opcoes: [
        { label: "← Voltar",        next: "c5_midias" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },
    c5_7: {
      bot: "O Chat da Velvet permite conversas diretas com os seus assinantes de forma simples e segura.\n\n✅ Conversar em tempo real\n✅ Enviar fotos e vídeos gratuitos\n✅ Vender conteúdos pagos (PPV) na conversa\n✅ Criar relação próxima com a comunidade\n✅ Receber notificações de novas mensagens",
      opcoes: [
        { label: "← Voltar",        next: "c5_midias" },
        { label: "🏠 Menu Criadora", next: "criadora"  },
      ]
    },

    // ── CLIENTE ────────────────────────────────────────────────────────────────
    cliente: {
      bot: "Olá! Como podemos ajudar você hoje?",
      opcoes: [
        { label: "1. Sobre a plataforma e app",   next: "cl1_plataforma" },
        { label: "2. Minha Conta",                next: "cl2_conta"      },
        { label: "3. Assinaturas VIP",            next: "cl3_vip"        },
        { label: "4. Conteúdos/Mídias",          next: "cl4_midias"     },
        { label: "5. Denúncias",                  next: "cl5_denuncias"  },
        { label: "6. Tipos de Pagamentos",        next: "cl6_pagamentos" },
        { label: "7. Não encontrei minha dúvida", action: "contato"      },
        { label: "← Início",                      next: "inicio"         },
      ]
    },

    // CL1: PLATAFORMA
    cl1_plataforma: {
      bot: "Sobre a plataforma e app, o que deseja saber?",
      opcoes: [
        { label: "1.1 O que é e como funciona a Velvet?",     next: "cl1_1" },
        { label: "1.2 Que tipo de conteúdo posso encontrar?", next: "cl1_2" },
        { label: "← Voltar",                                   next: "cliente" },
      ]
    },
    cl1_1: {
      bot: "A Velvet foi criada para proporcionar aos fãs uma forma simples, segura e próxima de apoiar e acompanhar os seus criadores favoritos.\n\nNossa missão é aproximar criadores e comunidade, oferecendo um espaço onde pode descobrir conteúdo, interagir diretamente com seus criadores favoritos e apoiar o trabalho deles de forma transparente.\n\nAcreditamos que a melhor experiência acontece quando existe uma ligação autêntica entre fãs e criadores.",
      opcoes: [
        { label: "← Voltar",       next: "cl1_plataforma" },
        { label: "🏠 Menu Cliente", next: "cliente"        },
      ]
    },
    cl1_2: {
      bot: "Pode encontrar conteúdo de lifestyle, bastidores, dicas, entretenimento, privados e muito mais.\n\nAntes de assinar, consulte a categoria ao passar o mouse sobre o perfil no feed:\n\n🌍 Social — Fotos, vídeos, viagens, lifestyle, gaming, fitness, moda e muito mais.\n\n🔥 Premium — Conteúdo sensual (biquíni, lingerie, cosplay) sem nudez explícita.\n\n🔒 Privado — Conteúdo adulto, disponível mediante validação de identidade.",
      opcoes: [
        { label: "← Voltar",       next: "cl1_plataforma" },
        { label: "🏠 Menu Cliente", next: "cliente"        },
      ]
    },

    // CL2: MINHA CONTA
    cl2_conta: {
      bot: "Sobre sua conta, o que deseja fazer?",
      opcoes: [
        { label: "2.1 Quero excluir minha conta",          next: "cl2_1" },
        { label: "2.2 Quero alterar dados da minha conta", next: "cl2_2" },
        { label: "2.3 Posso colocar foto no perfil?",      next: "cl2_3" },
        { label: "← Voltar",                                next: "cliente" },
      ]
    },
    cl2_1: {
      bot: "Para excluir sua conta, vá até o final da página de Dados e clique em \"Excluir conta permanentemente\".",
      opcoes: [
        { label: "🗑️ Ir para Dados", action: "redirect", url: "/dados.html" },
        { label: "← Voltar",          next: "cl2_conta" },
      ]
    },
    cl2_2: {
      bot: "Por motivos de segurança os dados não podem ser alterados.\n\nCaso alguma informação esteja incorreta, envie um documento que comprove e iremos fazer a correção.\n\nSelecione a opção SUPORTE no formulário de contato.",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl2_conta" },
      ]
    },
    cl2_3: {
      bot: "Sim! Com a foto do perfil o seu contato com a sua criadora ou criador favorito se torna mais próximo via chat, assim eles podem te ver e conhecer melhor. 📸",
      opcoes: [
        { label: "← Voltar",       next: "cl2_conta" },
        { label: "🏠 Menu Cliente", next: "cliente"   },
      ]
    },

    // CL3: ASSINATURAS VIP
    cl3_vip: {
      bot: "Sobre assinaturas VIP, o que deseja saber?",
      opcoes: [
        { label: "3.1 Como funciona a assinatura VIP?",         next: "cl3_1" },
        { label: "3.2 Quero assinar um perfil",                 next: "cl3_2" },
        { label: "3.3 Quero renovar uma assinatura",            next: "cl3_3" },
        { label: "3.4 Quero cancelar uma assinatura",           next: "cl3_4" },
        { label: "3.5 Assinei VIP da criadora errada",          next: "cl3_5" },
        { label: "3.6 Problemas com o pagamento VIP",           next: "cl3_6" },
        { label: "3.7 Assinei VIP mas não liberou",             next: "cl3_7" },
        { label: "3.8 Renovei VIP mas continuo sem acesso",     next: "cl3_8" },
        { label: "3.9 Quero pagar com PIX minha 1ª assinatura", next: "cl3_9" },
        { label: "← Voltar",                                    next: "cliente" },
      ]
    },
    cl3_1: {
      bot: "A assinatura VIP te dá direito a acesso durante 30 dias ao perfil do(a) criador(a), incluindo todas as mídias postadas no feed do perfil assinado.\n\nAlém disso, você pode conversar e ficar mais próximo do seu criador favorito pelo chat de forma privada. 💜",
      opcoes: [
        { label: "← Voltar",       next: "cl3_vip" },
        { label: "🏠 Menu Cliente", next: "cliente" },
      ]
    },
    cl3_2: {
      bot: "Para assinar um perfil, basta selecionar no feed o(a) criador(a) que deseja assinar e clicar para ver o perfil.",
      opcoes: [
        { label: "🔍 Ir para o Feed", action: "redirect", url: "/feed.html" },
        { label: "← Voltar",          next: "cl3_vip" },
      ]
    },
    cl3_3: {
      bot: "Para renovar uma assinatura, basta selecionar a assinatura que deseja renovar nas suas transações.",
      opcoes: [
        { label: "💳 Ir para Transações", action: "redirect", url: "/transacoes.html" },
        { label: "← Voltar",              next: "cl3_vip" },
      ]
    },
    cl3_4: {
      bot: "Para cancelar uma assinatura, basta selecionar a assinatura que deseja cancelar nas suas transações.",
      opcoes: [
        { label: "💳 Ir para Transações", action: "redirect", url: "/transacoes.html" },
        { label: "← Voltar",              next: "cl3_vip" },
      ]
    },
    cl3_5: {
      bot: "Para resolver isso, basta selecionar a assinatura que deseja contestar e informar os dados da criadora que assinou e qual gostaria de ter assinado.",
      opcoes: [
        { label: "💳 Ir para Transações", action: "redirect", url: "/transacoes.html" },
        { label: "← Voltar",              next: "cl3_vip" },
      ]
    },
    cl3_6: {
      bot: "Para reportar problemas com pagamento VIP, selecione a opção SUPORTE e informe quais erros enfrentou ao assinar.\n\n⚠️ Lembre-se: o printscreen do erro é obrigatório.",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl3_vip" },
      ]
    },
    cl3_7: {
      bot: "Para resolver isso, selecione a opção SUPORTE e informe que mesmo após assinar continua sem acesso.\n\n⚠️ São obrigatórios:\n• Print do comprovante de pagamento\n• Print do perfil bloqueado após pagamento",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl3_vip" },
      ]
    },
    cl3_8: {
      bot: "Para resolver isso, selecione a opção SUPORTE e informe que mesmo após renovar continua sem acesso.\n\n⚠️ São obrigatórios:\n• Print do comprovante de pagamento\n• Print do perfil bloqueado após renovação",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl3_vip" },
      ]
    },
    cl3_9: {
      bot: "O pagamento da primeira assinatura via PIX está sujeito a uma análise de segurança.\n\nA disponibilidade depende do histórico de utilização tanto do cliente como do criador na plataforma. Quando ambos apresentam bom histórico, o PIX pode ser liberado automaticamente.\n\nPara solicitar a liberação manual:\n1. Acesse a página de contato\n2. Selecione a opção \"Outro\"\n3. Informe o nome do criador que deseja assinar via PIX\n\nNossa equipe analisará e responderá assim que possível.",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl3_vip" },
      ]
    },

    // CL4: CONTEÚDOS/MÍDIAS
    cl4_midias: {
      bot: "Sobre conteúdos e mídias, o que deseja resolver?",
      opcoes: [
        { label: "4.1 Propaganda Enganosa / Golpe / Fraude", next: "cl4_1_intro"   },
        { label: "4.2 Arrependimento",                        next: "cl4_2_intro"   },
        { label: "4.3 Mídia no chat não desbloqueou",        next: "cl4_3"         },
        { label: "4.4 Mídia Premium não desbloqueou",        next: "cl4_4"         },
        { label: "4.5 Desbloqueei mídia errada",             next: "cl4_5"         },
        { label: "4.6 Paguei mídia que já havia pago/visto", next: "cl4_6"         },
        { label: "← Voltar",                                  next: "cliente"       },
      ]
    },
    cl4_1_intro: {
      bot: "Antes de prosseguir, vamos alinhar o que significa propaganda enganosa/golpe:\n\n📌 Propaganda enganosa — Anunciam algo que não corresponde ao que é entregue.\nExemplos: prometeu conteúdo explícito e entregou outro; disse que o vídeo tem 30min e tem 5; anunciou \"10 fotos\" e entregou 3.\n\n📌 Golpe (fraude) — Intenção de enganar para obter dinheiro.\nExemplos: recebeu pagamento e entregou nada; fingiu ser outra pessoa; criou oferta sabendo que nunca cumpriria.\n\n⚠️ O que NÃO é propaganda enganosa:\n• Achar que o conteúdo seria diferente, sem que ninguém prometeu isso\n• Não gostar do conteúdo recebido\n• Arrependimento da compra\n\nAinda assim, acredita que foi vítima de propaganda enganosa ou golpe?",
      opcoes: [
        { label: "✅ Sim, quero abrir reclamação", next: "cl4_1_sim" },
        { label: "❌ Não, entendi",                next: "inicio"    },
      ]
    },
    cl4_1_sim: {
      bot: "Para abrir a reclamação, selecione a assinatura ou mídia que deseja reclamar e escolha a opção \"Propaganda Enganosa\".\n\n⚠️ O envio do printscreen que comprove a promessa não entregue é obrigatório para validação da ocorrência.",
      opcoes: [
        { label: "💳 Ir para Transações", action: "redirect", url: "/transacoes.html" },
        { label: "← Voltar",              next: "cl4_midias" },
      ]
    },
    cl4_2_intro: {
      bot: "Antes de prosseguir, entenda o Direito de Arrependimento em plataformas digitais:\n\nCompras pela internet podem ter direito ao arrependimento em até 7 dias. Porém, na Velvet o acesso ao conteúdo digital é liberado imediatamente após a confirmação do pagamento.\n\nAo concluir a compra, você aceitou os Termos de Uso e autorizou o acesso imediato. Por isso, após o conteúdo ser disponibilizado, não é possível solicitar reembolso por arrependimento.\n\nFicam registados:\n• Data e hora da aceitação\n• Endereço IP\n• Aceite dos Termos de Uso\n\nMesmo assim, deseja continuar com o pedido de reembolso por arrependimento?",
      opcoes: [
        { label: "✅ Sim, quero continuar", next: "cl4_2_sim" },
        { label: "❌ Não, entendi",          next: "inicio"    },
      ]
    },
    cl4_2_sim: {
      bot: "Para seguir com o pedido, selecione a opção \"Reembolso\" e em seguida \"Arrependimento\", relacionado à mídia ou assinatura em questão.",
      opcoes: [
        { label: "💳 Ir para Transações", action: "redirect", url: "/transacoes.html" },
        { label: "← Voltar",              next: "cl4_midias" },
      ]
    },
    cl4_3: {
      bot: "Para resolver isso, selecione a opção SUPORTE e informe que mesmo após o pagamento a mídia do chat continua bloqueada.\n\n⚠️ São obrigatórios:\n• Print do comprovante de pagamento\n• Print da mídia bloqueada",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl4_midias" },
      ]
    },
    cl4_4: {
      bot: "Para resolver isso, selecione a opção SUPORTE e informe que mesmo após o pagamento a mídia Premium continua bloqueada.\n\n⚠️ São obrigatórios:\n• Print do comprovante de pagamento\n• Print da mídia bloqueada",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl4_midias" },
      ]
    },
    cl4_5: {
      bot: "Para resolver isso, basta enviar o print das mídias que desbloqueou e o print das mídias que gostaria de ter desbloqueado.",
      opcoes: [
        { label: "💳 Ir para Transações", action: "redirect", url: "/transacoes.html" },
        { label: "← Voltar",              next: "cl4_midias" },
      ]
    },
    cl4_6: {
      bot: "Para resolver isso, selecione a opção SUPORTE e informe que a plataforma entregou a mesma mídia em pacotes diferentes (premium ou chat).\n\n⚠️ São obrigatórios:\n• Print de ambas as visualizações\n• Comprovante de pagamento de ambas",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl4_midias" },
      ]
    },

    // CL5: DENÚNCIAS
    cl5_denuncias: {
      bot: "Sobre denúncias, o que deseja fazer?",
      opcoes: [
        { label: "5.1 Quero denunciar um Perfil",  next: "cl5_1" },
        { label: "5.2 Quero fazer outra denúncia", next: "cl5_2" },
        { label: "← Voltar",                        next: "cliente" },
      ]
    },
    cl5_1: {
      bot: "Para denunciar um perfil, selecione a opção \"Denunciar conta\" no formulário, informe o motivo.\n\n⚠️ O envio do printscreen referente ao motivo da denúncia é obrigatório para análise.",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl5_denuncias" },
      ]
    },
    cl5_2: {
      bot: "Para fazer outra denúncia, selecione a opção OUTRO no formulário e informe o motivo detalhadamente.\n\n⚠️ O envio do printscreen referente ao motivo da denúncia é obrigatório para análise.",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl5_denuncias" },
      ]
    },

    // CL6: TIPOS DE PAGAMENTO
    cl6_pagamentos: {
      bot: "Sobre tipos de pagamento, o que deseja saber?",
      opcoes: [
        { label: "6.1 Quais tipos de pagamento posso usar?", next: "cl6_1" },
        { label: "← Voltar",                                  next: "cliente" },
      ]
    },
    cl6_1: {
      bot: "Na Velvet você pode pagar via:\n\n💳 Pix\n💳 Cartão de crédito/débito",
      opcoes: [
        { label: "← Voltar",       next: "cl6_pagamentos" },
        { label: "🏠 Menu Cliente", next: "cliente"        },
      ]
    }
  };

  const ARVORE_ES = {
    inicio: {
      bot: "👋 ¡Hola! Bienvenido al soporte automático de Velvet.\n¿En qué podemos ayudarte?",
      opcoes: [
        { label: "👩‍💻 Soy Creadora", next: "criadora" },
        { label: "🛍️ Soy Cliente",   next: "cliente"  },
      ]
    },
    criadora: {
      bot: "¡Genial! ¿Sobre qué necesitas ayuda?",
      opcoes: [
        { label: "1. Saber más sobre Velvet",       next: "c1_velvet"     },
        { label: "2. Mi Perfil / Cuenta",            next: "c2_perfil"     },
        { label: "3. Agenciamiento",                 next: "c3_agencia"    },
        { label: "4. Pagos y Ganancias",             next: "c4_pagamentos" },
        { label: "5. Medios y Contenidos",           next: "c5_midias"     },
        { label: "6. No encontré mi pregunta",       action: "contato"     },
        { label: "← Inicio",                         next: "inicio"        },
      ]
    },
    c1_velvet: {
      bot: "Sobre Velvet, ¿qué deseas saber?",
      opcoes: [
        { label: "1.1 ¿Qué es y cómo funciona Velvet?", next: "c1_1" },
        { label: "1.2 Tipos de pago del cliente",         next: "c1_2" },
        { label: "← Volver",                              next: "criadora" },
      ]
    },
    c1_1: {
      bot: "Velvet nació de la convicción de que los creadores de contenido merecen una plataforma construida pensando en ellos — donde puedan compartir su trabajo, hacer crecer su comunidad y monetizar su talento con total autonomía.\n\nCreemos en un internet donde la relación entre creadores y fans es directa, cercana y genuina.",
      opcoes: [
        { label: "← Volver",          next: "c1_velvet" },
        { label: "🏠 Menú Creadora",  next: "criadora"  },
      ]
    },
    c1_2: {
      bot: "Los clientes pueden pagar mediante:\n\n💳 Pix\n💳 Tarjeta de débito/crédito",
      opcoes: [
        { label: "← Volver",         next: "c1_velvet" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c2_perfil: {
      bot: "Sobre tu perfil/cuenta, ¿qué deseas saber?",
      opcoes: [
        { label: "2.1 ¿Cómo validar mi cuenta?",     next: "c2_1" },
        { label: "2.2 ¿Cómo promocionar mi perfil?", next: "c2_2" },
        { label: "2.3 ¿Cómo funciona el feed?",      next: "c2_3" },
        { label: "2.4 ¿Cómo funciona mi Perfil?",    next: "c2_4" },
        { label: "2.5 ¿Cómo funciona el Premium?",   next: "c2_5" },
        { label: "2.6 ¿Cómo funciona el Chat?",      next: "c2_6" },
        { label: "2.7 Quiero eliminar mi cuenta",     next: "c2_7" },
        { label: "← Volver",                          next: "criadora" },
      ]
    },
    c2_1: {
      bot: "Para validar tu cuenta, solo completa paso a paso toda la información en la página de datos personales y envíala para revisión.\n\n¡Te dirijo allí ahora! 👇",
      opcoes: [
        { label: "📋 Ir a Datos Personales", action: "redirect", url: "/conta.html" },
        { label: "← Volver",                 next: "c2_perfil" },
      ]
    },
    c2_2: {
      bot: "Para promocionar tu perfil, accede a la página de links donde puedes copiar y compartir en tus redes sociales! 🔗",
      opcoes: [
        { label: "🔗 Ver mis links", action: "redirect", url: "/links.html" },
        { label: "← Volver",         next: "c2_perfil" },
      ]
    },
    c2_3: {
      bot: "El feed reúne el perfil de las creadoras presentes en la plataforma, permitiendo a los usuarios descubrir nuevos perfiles y seguir a quienes ya siguen.\n\n✅ Descubrir nuevas modelos\n✅ Acceder rápidamente al perfil de cada creadora\n✅ Suscribirse a perfiles directamente con un clic",
      opcoes: [
        { label: "← Volver",         next: "c2_perfil" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c2_4: {
      bot: "El Perfil es el espacio donde las creadoras publican contenidos para mantener a sus seguidores comprometidos y difundir novedades.\n\nA través del perfil, es posible:\n✅ Publicar fotos y videos\n✅ Publicar contenidos solo para suscriptores\n✅ Difundir novedades, promociones y campañas\n✅ Aumentar el compromiso e incentivar nuevas suscripciones",
      opcoes: [
        { label: "← Volver",         next: "c2_perfil" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c2_5: {
      bot: "El Premium es el área donde se reúnen las fotos y videos más especiales — contenidos que deben desbloquearse individualmente, a diferencia de los medios del perfil.\n\n✅ Acceso mediante pago por publicación\n✅ La creadora puede escribir leyendas y actualizaciones\n✅ Contenidos especiales reservados para suscriptores",
      opcoes: [
        { label: "← Volver",         next: "c2_perfil" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c2_6: {
      bot: "El Chat de Velvet permite a las creadoras conversar directamente con sus suscriptores de forma simple y segura.\n\nA través del chat puedes:\n✅ Conversar en tiempo real con tus suscriptores\n✅ Enviar fotos y videos gratuitos\n✅ Vender contenidos de pago (PPV) directamente en la conversación\n✅ Crear una relación más cercana con tu comunidad\n✅ Recibir notificaciones de nuevos mensajes",
      opcoes: [
        { label: "← Volver",         next: "c2_perfil" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c2_7: {
      bot: "Para eliminar tu cuenta, ve al final de la página de Datos Personales y haz clic en \"Eliminar cuenta permanentemente\".",
      opcoes: [
        { label: "📋 Ir a Datos Personales", action: "redirect", url: "/conta.html" },
        { label: "← Volver",                 next: "c2_perfil" },
      ]
    },
    c3_agencia: {
      bot: "Sobre agenciamiento, ¿qué deseas saber?",
      opcoes: [
        { label: "3.1 ¿Qué es una agencia?",            next: "c3_1" },
        { label: "3.2 ¿Cómo unirme a una agencia?",     next: "c3_2" },
        { label: "← Volver",                             next: "criadora" },
      ]
    },
    c3_1: {
      bot: "Una agencia en Velvet actúa como representante y gestora de las creadoras de contenido. El objetivo es ayudar en el crecimiento de la carrera, la organización del trabajo y el aumento de las ganancias.\n\n📌 Gestión de carrera — planificación y estrategias\n📌 Seguimiento del rendimiento\n📌 Difusión — promover perfiles y atraer suscriptores\n📌 Análisis de resultados — métricas y retención\n📌 Gestión financiera — seguimiento de ganancias\n📌 Seguridad — garantizar el cumplimiento de las políticas de Velvet",
      opcoes: [
        { label: "← Volver",         next: "c3_agencia" },
        { label: "🏠 Menú Creadora", next: "criadora"   },
      ]
    },
    c3_2: {
      bot: "Para unirte a una agencia, selecciona la opción OTRO en el formulario de contacto, indica que deseas ser agenciada e informa tu WhatsApp y/o email.\n\n¡Solicitaremos que te contacten y tendrás libertad de elección! 💜",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "c3_agencia" },
      ]
    },
    c4_pagamentos: {
      bot: "Sobre pagos y ganancias, ¿qué deseas saber?",
      opcoes: [
        { label: "4.1 ¿Cómo funcionan los pagos?",       next: "c4_1" },
        { label: "4.2 ¿Dónde pongo mis datos bancarios?", next: "c4_2" },
        { label: "4.3 ¿Dónde veo mis ganancias?",         next: "c4_3" },
        { label: "4.4 ¿Qué son los valores pendientes?",  next: "c4_4" },
        { label: "4.5 ¿Cuánto cobrar por mi suscripción?",next: "c4_5" },
        { label: "4.6 ¿Para qué sirve la oferta?",        next: "c4_6" },
        { label: "← Volver",                              next: "criadora" },
      ]
    },
    c4_1: {
      bot: "Actualmente los pagos se realizan 1× al mes, entre los días 1 y 5.\n\n⚡ ¡Ya estamos implementando un sistema de retiro donde podrás elegir el día y programar cuándo recibir!",
      opcoes: [
        { label: "← Volver",         next: "c4_pagamentos" },
        { label: "🏠 Menú Creadora", next: "criadora"      },
      ]
    },
    c4_2: {
      bot: "Para agregar tus datos bancarios, ve a Ganancias en el menú y al final de la página en Datos Bancarios.",
      opcoes: [
        { label: "💰 Ir a Ganancias", action: "redirect", url: "/relatorio.html" },
        { label: "← Volver",          next: "c4_pagamentos" },
      ]
    },
    c4_3: {
      bot: "Solo ve a Ganancias, donde tendrás acceso a tus ganancias por día, mes, medio, suscripción, etc.",
      opcoes: [
        { label: "💰 Ir a Ganancias", action: "redirect", url: "/relatorio.html" },
        { label: "← Volver",          next: "c4_pagamentos" },
      ]
    },
    c4_4: {
      bot: "Son valores pagados por el cliente con tarjeta de crédito. Dependemos de que la operadora evalúe el pago, descarte fraudes y libere el valor — lo que puede llevar de 3 a 30 días.\n\n¡No te preocupes! La propia plataforma actualiza las ganancias pendientes a liberadas automáticamente. ✅",
      opcoes: [
        { label: "← Volver",         next: "c4_pagamentos" },
        { label: "🏠 Menú Creadora", next: "criadora"      },
      ]
    },
    c4_5: {
      bot: "¡El valor que prefieras! 😊\n\nRecuerda los porcentajes de la plataforma y, si tienes agencia, los % de la agencia también. Por eso no recomendamos menos de R$ 20,00.",
      opcoes: [
        { label: "← Volver",         next: "c4_pagamentos" },
        { label: "🏠 Menú Creadora", next: "criadora"      },
      ]
    },
    c4_6: {
      bot: "Si tienes una suscripción de alto valor y deseas dar un descuento por un período, ¡puedes usar la opción Oferta! 🎁",
      opcoes: [
        { label: "← Volver",         next: "c4_pagamentos" },
        { label: "🏠 Menú Creadora", next: "criadora"      },
      ]
    },
    c5_midias: {
      bot: "Sobre medios y contenidos, ¿qué deseas saber?",
      opcoes: [
        { label: "5.1 ¿Qué tipo de contenido puedo publicar?", next: "c5_1" },
        { label: "5.2 ¿Cómo clasifico mi perfil?",             next: "c5_2" },
        { label: "5.3 ¿Necesita ser contenido exclusivo?",     next: "c5_3" },
        { label: "5.4 ¿Cómo funciona el feed?",                next: "c5_4" },
        { label: "5.5 ¿Cómo funciona mi Perfil?",              next: "c5_5" },
        { label: "5.6 ¿Cómo funciona el Premium?",             next: "c5_6" },
        { label: "5.7 ¿Cómo funciona el Chat?",                next: "c5_7" },
        { label: "← Volver",                                    next: "criadora" },
      ]
    },
    c5_1: {
      bot: "¡Velvet no es exclusiva para contenido adulto! Los Creadores pueden monetizar cualquier tipo de contenido digital:\n\n📚 Educativos\n🎨 Artísticos y culturales\n📣 Informativos y de entretenimiento\n📸 Personales y de lifestyle\n🔞 Adulto (con validación de identidad)\n\nTodo el contenido debe respetar la legislación aplicable, los derechos de terceros y las políticas de Velvet.",
      opcoes: [
        { label: "← Volver",         next: "c5_midias" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c5_2: {
      bot: "Puedes clasificar tu perfil según lo que tienes para ofrecer:\n\n🌍 Social — Día a día, viajes, gaming, fitness, moda y mucho más.\n\n🔥 Premium — Contenido sensual (bikini, lencería, cosplay) sin desnudez explícita.\n\n🔒 Privado — Contenido adulto, disponible previa validación de identidad del usuario.",
      opcoes: [
        { label: "← Volver",         next: "c5_midias" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c5_3: {
      bot: "¡No! Puedes publicar medios que ya compartiste en otras redes sociales o crear contenidos específicos para Velvet.\n\n💡 Una estrategia que genera buenos resultados: publicar un teaser en redes sociales y poner el contenido completo en Velvet.\n\n¡Cuanto más valor entregues a tus suscriptores, mayor será la retención y atracción de nuevos! 🚀",
      opcoes: [
        { label: "← Volver",         next: "c5_midias" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c5_4: {
      bot: "El feed reúne el perfil de las creadoras presentes en la plataforma, permitiendo a los usuarios descubrir nuevos perfiles y seguir a quienes ya siguen.\n\n✅ Descubrir nuevas modelos\n✅ Acceder rápidamente al perfil de cada creadora\n✅ Suscribirse a perfiles directamente con un clic",
      opcoes: [
        { label: "← Volver",         next: "c5_midias" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c5_5: {
      bot: "El Perfil es el espacio donde las creadoras publican contenidos para mantener a sus seguidores comprometidos y difundir novedades.\n\nA través del perfil:\n✅ Publicar fotos y videos\n✅ Contenidos para suscriptores\n✅ Difundir novedades y campañas\n✅ Aumentar nuevas suscripciones",
      opcoes: [
        { label: "← Volver",         next: "c5_midias" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c5_6: {
      bot: "El Premium reúne contenidos más especiales que deben desbloquearse individualmente.\n\n✅ Acceso mediante pago por publicación\n✅ Leyendas y actualizaciones de la creadora\n✅ Contenidos exclusivos para suscriptores\n✅ Nuevos contenidos en tiempo real",
      opcoes: [
        { label: "← Volver",         next: "c5_midias" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    c5_7: {
      bot: "El Chat de Velvet permite conversaciones directas con tus suscriptores de forma simple y segura.\n\n✅ Conversar en tiempo real\n✅ Enviar fotos y videos gratuitos\n✅ Vender contenidos de pago (PPV) en la conversación\n✅ Crear relación cercana con la comunidad\n✅ Recibir notificaciones de nuevos mensajes",
      opcoes: [
        { label: "← Volver",         next: "c5_midias" },
        { label: "🏠 Menú Creadora", next: "criadora"  },
      ]
    },
    cliente: {
      bot: "¡Hola! ¿Cómo podemos ayudarte hoy?",
      opcoes: [
        { label: "1. Sobre la plataforma y app",     next: "cl1_plataforma" },
        { label: "2. Mi Cuenta",                     next: "cl2_conta"      },
        { label: "3. Suscripciones VIP",             next: "cl3_vip"        },
        { label: "4. Contenidos/Medios",             next: "cl4_midias"     },
        { label: "5. Denuncias",                     next: "cl5_denuncias"  },
        { label: "6. Tipos de Pago",                 next: "cl6_pagamentos" },
        { label: "7. No encontré mi pregunta",       action: "contato"      },
        { label: "← Inicio",                         next: "inicio"         },
      ]
    },
    cl1_plataforma: {
      bot: "Sobre la plataforma y app, ¿qué deseas saber?",
      opcoes: [
        { label: "1.1 ¿Qué es y cómo funciona Velvet?",       next: "cl1_1" },
        { label: "1.2 ¿Qué tipo de contenido puedo encontrar?",next: "cl1_2" },
        { label: "← Volver",                                    next: "cliente" },
      ]
    },
    cl1_1: {
      bot: "Velvet fue creada para ofrecer a los fans una forma simple, segura y cercana de apoyar y acompañar a sus creadores favoritos.\n\nNuestra misión es acercar a creadores y comunidad, ofreciendo un espacio donde puedes descubrir contenido, interactuar directamente con tus creadores favoritos y apoyar su trabajo de forma transparente.",
      opcoes: [
        { label: "← Volver",        next: "cl1_plataforma" },
        { label: "🏠 Menú Cliente", next: "cliente"        },
      ]
    },
    cl1_2: {
      bot: "Puedes encontrar contenido de lifestyle, bastidores, consejos, entretenimiento, privados y mucho más.\n\nAntes de suscribirte, consulta la categoría al pasar el mouse sobre el perfil en el feed:\n\n🌍 Social — Fotos, videos, viajes, lifestyle, gaming, fitness, moda y mucho más.\n\n🔥 Premium — Contenido sensual sin desnudez explícita.\n\n🔒 Privado — Contenido adulto, previa validación de identidad.",
      opcoes: [
        { label: "← Volver",        next: "cl1_plataforma" },
        { label: "🏠 Menú Cliente", next: "cliente"        },
      ]
    },
    cl2_conta: {
      bot: "Sobre tu cuenta, ¿qué deseas hacer?",
      opcoes: [
        { label: "2.1 Quiero eliminar mi cuenta",          next: "cl2_1" },
        { label: "2.2 Quiero cambiar datos de mi cuenta",  next: "cl2_2" },
        { label: "2.3 ¿Puedo poner foto en el perfil?",   next: "cl2_3" },
        { label: "← Volver",                               next: "cliente" },
      ]
    },
    cl2_1: {
      bot: "Para eliminar tu cuenta, ve al final de la página de Datos y haz clic en \"Eliminar cuenta permanentemente\".",
      opcoes: [
        { label: "🗑️ Ir a Datos", action: "redirect", url: "/dados.html" },
        { label: "← Volver",       next: "cl2_conta" },
      ]
    },
    cl2_2: {
      bot: "Por motivos de seguridad los datos no pueden ser modificados.\n\nSi alguna información es incorrecta, envía un documento que lo compruebe y haremos la corrección.\n\nSelecciona la opción SOPORTE en el formulario de contacto.",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl2_conta" },
      ]
    },
    cl2_3: {
      bot: "¡Sí! Con la foto de perfil tu contacto con tu creadora o creador favorito se vuelve más cercano a través del chat, así ellos pueden verte y conocerte mejor. 📸",
      opcoes: [
        { label: "← Volver",        next: "cl2_conta" },
        { label: "🏠 Menú Cliente", next: "cliente"   },
      ]
    },
    cl3_vip: {
      bot: "Sobre suscripciones VIP, ¿qué deseas saber?",
      opcoes: [
        { label: "3.1 ¿Cómo funciona la suscripción VIP?",       next: "cl3_1" },
        { label: "3.2 Quiero suscribirme a un perfil",           next: "cl3_2" },
        { label: "3.3 Quiero renovar una suscripción",           next: "cl3_3" },
        { label: "3.4 Quiero cancelar una suscripción",          next: "cl3_4" },
        { label: "3.5 Me suscribí a la creadora equivocada",     next: "cl3_5" },
        { label: "3.6 Problemas con el pago VIP",                next: "cl3_6" },
        { label: "3.7 Me suscribí VIP pero no se desbloqueó",   next: "cl3_7" },
        { label: "3.8 Renovar VIP pero sigo sin acceso",         next: "cl3_8" },
        { label: "3.9 Quiero pagar con PIX mi 1ª suscripción",  next: "cl3_9" },
        { label: "← Volver",                                     next: "cliente" },
      ]
    },
    cl3_1: {
      bot: "La suscripción VIP te da acceso durante 30 días al perfil del/la creador(a), incluyendo todos los medios publicados en el feed del perfil suscrito.\n\nAdemás, puedes conversar y estar más cerca de tu creador favorito a través del chat de forma privada. 💜",
      opcoes: [
        { label: "← Volver",        next: "cl3_vip" },
        { label: "🏠 Menú Cliente", next: "cliente" },
      ]
    },
    cl3_2: {
      bot: "Para suscribirte a un perfil, solo selecciona en el feed al/la creador(a) que deseas suscribir y haz clic para ver el perfil.",
      opcoes: [
        { label: "🔍 Ir al Feed", action: "redirect", url: "/feed.html" },
        { label: "← Volver",      next: "cl3_vip" },
      ]
    },
    cl3_3: {
      bot: "Para renovar una suscripción, selecciona la suscripción que deseas renovar en tus transacciones.",
      opcoes: [
        { label: "💳 Ir a Transacciones", action: "redirect", url: "/transacoes.html" },
        { label: "← Volver",              next: "cl3_vip" },
      ]
    },
    cl3_4: {
      bot: "Para cancelar una suscripción, selecciona la suscripción que deseas cancelar en tus transacciones.",
      opcoes: [
        { label: "💳 Ir a Transacciones", action: "redirect", url: "/transacoes.html" },
        { label: "← Volver",              next: "cl3_vip" },
      ]
    },
    cl3_5: {
      bot: "Para resolver esto, selecciona la suscripción que deseas disputar e indica los datos de la creadora a la que te suscribiste y a cuál querías suscribirte.",
      opcoes: [
        { label: "💳 Ir a Transacciones", action: "redirect", url: "/transacoes.html" },
        { label: "← Volver",              next: "cl3_vip" },
      ]
    },
    cl3_6: {
      bot: "Para reportar problemas con el pago VIP, selecciona la opción SOPORTE e indica qué errores tuviste al suscribirte.\n\n⚠️ Recuerda: la captura de pantalla del error es obligatoria.",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl3_vip" },
      ]
    },
    cl3_7: {
      bot: "Para resolver esto, selecciona la opción SOPORTE e indica que incluso después de suscribirte sigues sin acceso.\n\n⚠️ Son obligatorios:\n• Captura del comprobante de pago\n• Captura del perfil bloqueado después del pago",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl3_vip" },
      ]
    },
    cl3_8: {
      bot: "Para resolver esto, selecciona la opción SOPORTE e indica que incluso después de renovar sigues sin acceso.\n\n⚠️ Son obligatorios:\n• Captura del comprobante de pago\n• Captura del perfil bloqueado después de la renovación",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl3_vip" },
      ]
    },
    cl3_9: {
      bot: "El pago de la primera suscripción vía PIX está sujeto a un análisis de seguridad.\n\nLa disponibilidad depende del historial de uso tanto del cliente como del creador en la plataforma.\n\nPara solicitar la liberación manual:\n1. Accede a la página de contacto\n2. Selecciona la opción \"Otro\"\n3. Indica el nombre del creador que deseas suscribir vía PIX\n\nNuestro equipo analizará y responderá a la brevedad.",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl3_vip" },
      ]
    },
    cl4_midias: {
      bot: "Sobre contenidos y medios, ¿qué deseas resolver?",
      opcoes: [
        { label: "4.1 Publicidad Engañosa / Estafa / Fraude", next: "cl4_1_intro" },
        { label: "4.2 Arrepentimiento",                        next: "cl4_2_intro" },
        { label: "4.3 Medio del chat no se desbloqueó",       next: "cl4_3"       },
        { label: "4.4 Medio Premium no se desbloqueó",        next: "cl4_4"       },
        { label: "4.5 Desbloqueé el medio equivocado",        next: "cl4_5"       },
        { label: "4.6 Pagué un medio que ya había pagado",    next: "cl4_6"       },
        { label: "← Volver",                                   next: "cliente"     },
      ]
    },
    cl4_1_intro: {
      bot: "Antes de continuar, aclaremos qué significa publicidad engañosa/estafa:\n\n📌 Publicidad engañosa — Anuncian algo que no corresponde a lo entregado.\nEjemplos: prometió contenido explícito y entregó otro; dijo que el video dura 30min y dura 5.\n\n📌 Estafa (fraude) — Intención de engañar para obtener dinero.\nEjemplos: recibió pago y no entregó nada; fingió ser otra persona.\n\n⚠️ Lo que NO es publicidad engañosa:\n• Creer que el contenido sería diferente, sin que nadie lo prometiera\n• No gustar el contenido recibido\n• Arrepentimiento de la compra\n\n¿Aun así crees que fuiste víctima de publicidad engañosa o estafa?",
      opcoes: [
        { label: "✅ Sí, quiero abrir una queja", next: "cl4_1_sim" },
        { label: "❌ No, entendí",                next: "inicio"    },
      ]
    },
    cl4_1_sim: {
      bot: "Para abrir la queja, selecciona la suscripción o medio que deseas reclamar y elige la opción \"Publicidad Engañosa\".\n\n⚠️ El envío de la captura de pantalla que pruebe la promesa incumplida es obligatorio para validar la ocurrencia.",
      opcoes: [
        { label: "💳 Ir a Transacciones", action: "redirect", url: "/transacoes.html" },
        { label: "← Volver",              next: "cl4_midias" },
      ]
    },
    cl4_2_intro: {
      bot: "Antes de continuar, entiende el Derecho de Arrepentimiento en plataformas digitales:\n\nLas compras por internet pueden tener derecho al arrepentimiento dentro de los 7 días. Sin embargo, en Velvet el acceso al contenido digital se libera inmediatamente después de la confirmación del pago.\n\nAl completar la compra, aceptaste los Términos de Uso y autorizaste el acceso inmediato. Por eso, después de que el contenido esté disponible, no es posible solicitar reembolso por arrepentimiento.\n\n¿Aun así deseas continuar con la solicitud de reembolso por arrepentimiento?",
      opcoes: [
        { label: "✅ Sí, quiero continuar", next: "cl4_2_sim" },
        { label: "❌ No, entendí",           next: "inicio"    },
      ]
    },
    cl4_2_sim: {
      bot: "Para continuar con la solicitud, selecciona la opción \"Reembolso\" y luego \"Arrepentimiento\", relacionado con el medio o suscripción en cuestión.",
      opcoes: [
        { label: "💳 Ir a Transacciones", action: "redirect", url: "/transacoes.html" },
        { label: "← Volver",              next: "cl4_midias" },
      ]
    },
    cl4_3: {
      bot: "Para resolver esto, selecciona la opción SOPORTE e indica que incluso después del pago el medio del chat sigue bloqueado.\n\n⚠️ Son obligatorios:\n• Captura del comprobante de pago\n• Captura del medio bloqueado",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl4_midias" },
      ]
    },
    cl4_4: {
      bot: "Para resolver esto, selecciona la opción SOPORTE e indica que incluso después del pago el medio Premium sigue bloqueado.\n\n⚠️ Son obligatorios:\n• Captura del comprobante de pago\n• Captura del medio bloqueado",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl4_midias" },
      ]
    },
    cl4_5: {
      bot: "Para resolver esto, solo envía la captura de los medios que desbloqueaste y la captura de los medios que querías desbloquear.",
      opcoes: [
        { label: "💳 Ir a Transacciones", action: "redirect", url: "/transacoes.html" },
        { label: "← Volver",              next: "cl4_midias" },
      ]
    },
    cl4_6: {
      bot: "Para resolver esto, selecciona la opción SOPORTE e indica que la plataforma entregó el mismo medio en paquetes diferentes (premium o chat).\n\n⚠️ Son obligatorios:\n• Captura de ambas visualizaciones\n• Comprobante de pago de ambas",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl4_midias" },
      ]
    },
    cl5_denuncias: {
      bot: "Sobre denuncias, ¿qué deseas hacer?",
      opcoes: [
        { label: "5.1 Quiero denunciar un Perfil",    next: "cl5_1" },
        { label: "5.2 Quiero hacer otra denuncia",    next: "cl5_2" },
        { label: "← Volver",                           next: "cliente" },
      ]
    },
    cl5_1: {
      bot: "Para denunciar un perfil, selecciona la opción \"Denunciar cuenta\" en el formulario e indica el motivo.\n\n⚠️ El envío de la captura de pantalla referente al motivo de la denuncia es obligatorio para el análisis.",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl5_denuncias" },
      ]
    },
    cl5_2: {
      bot: "Para hacer otra denuncia, selecciona la opción OTRO en el formulario e indica el motivo detalladamente.\n\n⚠️ El envío de la captura de pantalla referente al motivo de la denuncia es obligatorio para el análisis.",
      opcoes: [
        { label: "📬 Ir a Contacto", action: "redirect", url: "/contato.html" },
        { label: "← Volver",         next: "cl5_denuncias" },
      ]
    },
    cl6_pagamentos: {
      bot: "Sobre tipos de pago, ¿qué deseas saber?",
      opcoes: [
        { label: "6.1 ¿Qué tipos de pago puedo usar?", next: "cl6_1" },
        { label: "← Volver",                             next: "cliente" },
      ]
    },
    cl6_1: {
      bot: "En Velvet puedes pagar mediante:\n\n💳 Pix\n💳 Tarjeta de crédito/débito",
      opcoes: [
        { label: "← Volver",        next: "cl6_pagamentos" },
        { label: "🏠 Menú Cliente", next: "cliente"        },
      ]
    }
  };

  const ARVORE_EN = {
    inicio: {
      bot: "👋 Hello! Welcome to Velvet's automated support.\nHow can we help you?",
      opcoes: [
        { label: "👩‍💻 I'm a Creator", next: "criadora" },
        { label: "🛍️ I'm a Client",   next: "cliente"  },
      ]
    },
    criadora: {
      bot: "Great! What do you need help with?",
      opcoes: [
        { label: "1. Learn more about Velvet",    next: "c1_velvet"     },
        { label: "2. My Profile / Account",        next: "c2_perfil"     },
        { label: "3. Agency",                      next: "c3_agencia"    },
        { label: "4. Payments & Earnings",         next: "c4_pagamentos" },
        { label: "5. Media & Content",             next: "c5_midias"     },
        { label: "6. I didn't find my question",  action: "contato"     },
        { label: "← Home",                         next: "inicio"        },
      ]
    },
    c1_velvet: {
      bot: "About Velvet, what would you like to know?",
      opcoes: [
        { label: "1.1 What is Velvet and how does it work?", next: "c1_1" },
        { label: "1.2 Client payment types",                  next: "c1_2" },
        { label: "← Back",                                    next: "criadora" },
      ]
    },
    c1_1: {
      bot: "Velvet was born from the belief that content creators deserve a platform built with them in mind — where they can share their work, grow their community and monetize their talent with full autonomy.\n\nWe believe in an internet where the relationship between creators and fans is direct, close and genuine.",
      opcoes: [
        { label: "← Back",           next: "c1_velvet" },
        { label: "🏠 Creator Menu",  next: "criadora"  },
      ]
    },
    c1_2: {
      bot: "Clients can pay via:\n\n💳 Pix\n💳 Debit/credit card",
      opcoes: [
        { label: "← Back",          next: "c1_velvet" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c2_perfil: {
      bot: "About your profile/account, what would you like to know?",
      opcoes: [
        { label: "2.1 How to validate my account?",    next: "c2_1" },
        { label: "2.2 How to promote my profile?",     next: "c2_2" },
        { label: "2.3 How does the feed work?",        next: "c2_3" },
        { label: "2.4 How does my Profile work?",      next: "c2_4" },
        { label: "2.5 How does Premium work?",         next: "c2_5" },
        { label: "2.6 How does Chat work?",            next: "c2_6" },
        { label: "2.7 I want to delete my account",   next: "c2_7" },
        { label: "← Back",                             next: "criadora" },
      ]
    },
    c2_1: {
      bot: "To validate your account, simply fill in all the information step by step on the personal data page and submit it for review.\n\nI'll take you there now! 👇",
      opcoes: [
        { label: "📋 Go to Personal Data", action: "redirect", url: "/conta.html" },
        { label: "← Back",                 next: "c2_perfil" },
      ]
    },
    c2_2: {
      bot: "To promote your profile, access the links page where you can copy and share on your social networks! 🔗",
      opcoes: [
        { label: "🔗 View my links", action: "redirect", url: "/links.html" },
        { label: "← Back",           next: "c2_perfil" },
      ]
    },
    c2_3: {
      bot: "The feed brings together creator profiles on the platform, allowing users to discover new profiles and follow those they already follow.\n\n✅ Discover new creators\n✅ Quickly access each creator's profile\n✅ Subscribe to profiles directly with one click",
      opcoes: [
        { label: "← Back",          next: "c2_perfil" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c2_4: {
      bot: "The Profile is the space where creators publish content to keep their followers engaged and share news.\n\nThrough the profile, you can:\n✅ Publish photos and videos\n✅ Post content accessible only to subscribers\n✅ Share news, promotions and campaigns\n✅ Increase engagement and encourage new subscriptions",
      opcoes: [
        { label: "← Back",          next: "c2_perfil" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c2_5: {
      bot: "Premium is the area where the most special photos and videos are gathered — content that must be unlocked individually, unlike profile media.\n\n✅ Access via pay-per-post\n✅ The creator can write captions and updates\n✅ Special content reserved for subscribers",
      opcoes: [
        { label: "← Back",          next: "c2_perfil" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c2_6: {
      bot: "Velvet Chat allows creators to talk directly with their subscribers in a simple and secure way.\n\nThrough chat you can:\n✅ Chat in real time with your subscribers\n✅ Send free photos and videos\n✅ Sell paid content (PPV) directly in the conversation\n✅ Build a closer relationship with your community\n✅ Receive notifications of new messages",
      opcoes: [
        { label: "← Back",          next: "c2_perfil" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c2_7: {
      bot: "To delete your account, go to the bottom of the Personal Data page and click \"Delete account permanently\".",
      opcoes: [
        { label: "📋 Go to Personal Data", action: "redirect", url: "/conta.html" },
        { label: "← Back",                 next: "c2_perfil" },
      ]
    },
    c3_agencia: {
      bot: "About agencies, what would you like to know?",
      opcoes: [
        { label: "3.1 What is an agency?",         next: "c3_1" },
        { label: "3.2 How to join an agency?",     next: "c3_2" },
        { label: "← Back",                          next: "criadora" },
      ]
    },
    c3_1: {
      bot: "An agency on Velvet acts as representative and manager for content creators. The goal is to help with career growth, work organization and increased earnings.\n\n📌 Career management — planning and strategies\n📌 Performance tracking\n📌 Promotion — promoting profiles and attracting subscribers\n📌 Results analysis — metrics and retention\n📌 Financial management — tracking earnings\n📌 Security — ensuring compliance with Velvet's policies",
      opcoes: [
        { label: "← Back",          next: "c3_agencia" },
        { label: "🏠 Creator Menu", next: "criadora"   },
      ]
    },
    c3_2: {
      bot: "To join an agency, select the OTHER option in the contact form, state that you want to be managed and provide your WhatsApp and/or email.\n\nWe'll ask them to contact you and you'll have freedom of choice! 💜",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "c3_agencia" },
      ]
    },
    c4_pagamentos: {
      bot: "About payments and earnings, what would you like to know?",
      opcoes: [
        { label: "4.1 How do payments work?",          next: "c4_1" },
        { label: "4.2 Where do I add bank details?",   next: "c4_2" },
        { label: "4.3 Where do I see my earnings?",    next: "c4_3" },
        { label: "4.4 What are pending amounts?",      next: "c4_4" },
        { label: "4.5 How much should I charge?",      next: "c4_5" },
        { label: "4.6 What is the offer feature for?", next: "c4_6" },
        { label: "← Back",                             next: "criadora" },
      ]
    },
    c4_1: {
      bot: "Payments are currently made once a month, between the 1st and 5th.\n\n⚡ We're already implementing a withdrawal system where you can choose the day and schedule when to receive!",
      opcoes: [
        { label: "← Back",          next: "c4_pagamentos" },
        { label: "🏠 Creator Menu", next: "criadora"      },
      ]
    },
    c4_2: {
      bot: "To add your bank details, go to Earnings in the menu and at the bottom of the page under Bank Details.",
      opcoes: [
        { label: "💰 Go to Earnings", action: "redirect", url: "/relatorio.html" },
        { label: "← Back",            next: "c4_pagamentos" },
      ]
    },
    c4_3: {
      bot: "Just go to Earnings, where you'll have access to your earnings by day, month, media, subscription, etc.",
      opcoes: [
        { label: "💰 Go to Earnings", action: "redirect", url: "/relatorio.html" },
        { label: "← Back",            next: "c4_pagamentos" },
      ]
    },
    c4_4: {
      bot: "These are amounts paid by the client via credit card. We depend on the card network to evaluate the payment, rule out fraud and release the value — which can take 3 to 30 days.\n\nDon't worry! The platform itself automatically updates pending earnings to released. ✅",
      opcoes: [
        { label: "← Back",          next: "c4_pagamentos" },
        { label: "🏠 Creator Menu", next: "criadora"      },
      ]
    },
    c4_5: {
      bot: "Whatever you prefer! 😊\n\nRemember the platform percentages and, if you have an agency, their % too. That's why we don't recommend less than R$ 20.00.",
      opcoes: [
        { label: "← Back",          next: "c4_pagamentos" },
        { label: "🏠 Creator Menu", next: "criadora"      },
      ]
    },
    c4_6: {
      bot: "If you have a high-value subscription and want to give a discount for a period, you can use the Offer option! 🎁",
      opcoes: [
        { label: "← Back",          next: "c4_pagamentos" },
        { label: "🏠 Creator Menu", next: "criadora"      },
      ]
    },
    c5_midias: {
      bot: "About media and content, what would you like to know?",
      opcoes: [
        { label: "5.1 What type of content can I post?", next: "c5_1" },
        { label: "5.2 How do I classify my profile?",    next: "c5_2" },
        { label: "5.3 Does it need to be exclusive?",    next: "c5_3" },
        { label: "5.4 How does the feed work?",          next: "c5_4" },
        { label: "5.5 How does my Profile work?",        next: "c5_5" },
        { label: "5.6 How does Premium work?",           next: "c5_6" },
        { label: "5.7 How does Chat work?",              next: "c5_7" },
        { label: "← Back",                               next: "criadora" },
      ]
    },
    c5_1: {
      bot: "Velvet is not exclusive to adult content! Creators can monetize any type of digital content:\n\n📚 Educational\n🎨 Artistic and cultural\n📣 Informational and entertainment\n📸 Personal and lifestyle\n🔞 Adult (with identity verification)\n\nAll content must comply with applicable law, third-party rights and Velvet's policies.",
      opcoes: [
        { label: "← Back",          next: "c5_midias" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c5_2: {
      bot: "You can classify your profile according to what you have to offer:\n\n🌍 Social — Daily life, travel, gaming, fitness, fashion and much more.\n\n🔥 Premium — Sensual content (bikini, lingerie, cosplay) without explicit nudity.\n\n🔒 Private — Adult content, available upon user identity verification.",
      opcoes: [
        { label: "← Back",          next: "c5_midias" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c5_3: {
      bot: "No! You can publish media you've already shared on other social networks or create content specifically for Velvet.\n\n💡 A strategy that generates good results: publish a teaser on social media and make the full content available on Velvet.\n\nThe more value you deliver to your subscribers, the higher the retention and attraction of new ones! 🚀",
      opcoes: [
        { label: "← Back",          next: "c5_midias" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c5_4: {
      bot: "The feed brings together creator profiles on the platform, allowing users to discover new profiles and follow those they already follow.\n\n✅ Discover new creators\n✅ Quickly access each creator's profile\n✅ Subscribe to profiles with one click",
      opcoes: [
        { label: "← Back",          next: "c5_midias" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c5_5: {
      bot: "The Profile is the space where creators publish content to keep their followers engaged and share news.\n\nThrough the profile:\n✅ Publish photos and videos\n✅ Content for subscribers\n✅ Share news and campaigns\n✅ Grow new subscriptions",
      opcoes: [
        { label: "← Back",          next: "c5_midias" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c5_6: {
      bot: "Premium gathers the most special content that must be unlocked individually.\n\n✅ Access via pay-per-post\n✅ Creator captions and updates\n✅ Exclusive content for subscribers\n✅ New content in real time",
      opcoes: [
        { label: "← Back",          next: "c5_midias" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    c5_7: {
      bot: "Velvet Chat allows direct conversations with your subscribers in a simple and secure way.\n\n✅ Chat in real time\n✅ Send free photos and videos\n✅ Sell paid content (PPV) in the chat\n✅ Build closer relationships with your community\n✅ Receive new message notifications",
      opcoes: [
        { label: "← Back",          next: "c5_midias" },
        { label: "🏠 Creator Menu", next: "criadora"  },
      ]
    },
    cliente: {
      bot: "Hello! How can we help you today?",
      opcoes: [
        { label: "1. About the platform and app",   next: "cl1_plataforma" },
        { label: "2. My Account",                   next: "cl2_conta"      },
        { label: "3. VIP Subscriptions",            next: "cl3_vip"        },
        { label: "4. Content/Media",                next: "cl4_midias"     },
        { label: "5. Reports",                      next: "cl5_denuncias"  },
        { label: "6. Payment Methods",              next: "cl6_pagamentos" },
        { label: "7. I didn't find my question",   action: "contato"      },
        { label: "← Home",                          next: "inicio"         },
      ]
    },
    cl1_plataforma: {
      bot: "About the platform and app, what would you like to know?",
      opcoes: [
        { label: "1.1 What is Velvet and how does it work?",    next: "cl1_1" },
        { label: "1.2 What type of content can I find?",        next: "cl1_2" },
        { label: "← Back",                                       next: "cliente" },
      ]
    },
    cl1_1: {
      bot: "Velvet was created to give fans a simple, safe and close way to support and follow their favorite creators.\n\nOur mission is to bring creators and community closer, offering a space where you can discover content, interact directly with your favorite creators and support their work transparently.",
      opcoes: [
        { label: "← Back",         next: "cl1_plataforma" },
        { label: "🏠 Client Menu", next: "cliente"        },
      ]
    },
    cl1_2: {
      bot: "You can find lifestyle, behind-the-scenes, tips, entertainment, private and much more.\n\nBefore subscribing, check the category by hovering over the profile in the feed:\n\n🌍 Social — Photos, videos, travel, lifestyle, gaming, fitness, fashion and more.\n\n🔥 Premium — Sensual content without explicit nudity.\n\n🔒 Private — Adult content, available upon identity verification.",
      opcoes: [
        { label: "← Back",         next: "cl1_plataforma" },
        { label: "🏠 Client Menu", next: "cliente"        },
      ]
    },
    cl2_conta: {
      bot: "About your account, what would you like to do?",
      opcoes: [
        { label: "2.1 I want to delete my account",         next: "cl2_1" },
        { label: "2.2 I want to change my account data",    next: "cl2_2" },
        { label: "2.3 Can I add a profile photo?",          next: "cl2_3" },
        { label: "← Back",                                   next: "cliente" },
      ]
    },
    cl2_1: {
      bot: "To delete your account, go to the bottom of the Data page and click \"Delete account permanently\".",
      opcoes: [
        { label: "🗑️ Go to Data", action: "redirect", url: "/dados.html" },
        { label: "← Back",         next: "cl2_conta" },
      ]
    },
    cl2_2: {
      bot: "For security reasons, account data cannot be changed.\n\nIf any information is incorrect, send a supporting document and we'll make the correction.\n\nSelect the SUPPORT option in the contact form.",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl2_conta" },
      ]
    },
    cl2_3: {
      bot: "Yes! A profile photo makes your connection with your favorite creator closer through chat, so they can see and get to know you better. 📸",
      opcoes: [
        { label: "← Back",         next: "cl2_conta" },
        { label: "🏠 Client Menu", next: "cliente"   },
      ]
    },
    cl3_vip: {
      bot: "About VIP subscriptions, what would you like to know?",
      opcoes: [
        { label: "3.1 How does VIP subscription work?",        next: "cl3_1" },
        { label: "3.2 I want to subscribe to a profile",      next: "cl3_2" },
        { label: "3.3 I want to renew a subscription",        next: "cl3_3" },
        { label: "3.4 I want to cancel a subscription",       next: "cl3_4" },
        { label: "3.5 I subscribed to the wrong creator",     next: "cl3_5" },
        { label: "3.6 Problems with VIP payment",             next: "cl3_6" },
        { label: "3.7 Subscribed VIP but no access",          next: "cl3_7" },
        { label: "3.8 Renewed VIP but still no access",       next: "cl3_8" },
        { label: "3.9 I want to pay with PIX for 1st sub",   next: "cl3_9" },
        { label: "← Back",                                    next: "cliente" },
      ]
    },
    cl3_1: {
      bot: "The VIP subscription gives you 30-day access to the creator's profile, including all media posted on the subscribed profile's feed.\n\nYou can also chat and get closer to your favorite creator privately. 💜",
      opcoes: [
        { label: "← Back",         next: "cl3_vip" },
        { label: "🏠 Client Menu", next: "cliente" },
      ]
    },
    cl3_2: {
      bot: "To subscribe to a profile, simply select the creator you want to subscribe to in the feed and click to view their profile.",
      opcoes: [
        { label: "🔍 Go to Feed", action: "redirect", url: "/feed.html" },
        { label: "← Back",        next: "cl3_vip" },
      ]
    },
    cl3_3: {
      bot: "To renew a subscription, select the subscription you want to renew in your transactions.",
      opcoes: [
        { label: "💳 Go to Transactions", action: "redirect", url: "/transacoes.html" },
        { label: "← Back",                next: "cl3_vip" },
      ]
    },
    cl3_4: {
      bot: "To cancel a subscription, select the subscription you want to cancel in your transactions.",
      opcoes: [
        { label: "💳 Go to Transactions", action: "redirect", url: "/transacoes.html" },
        { label: "← Back",                next: "cl3_vip" },
      ]
    },
    cl3_5: {
      bot: "To resolve this, select the subscription you want to dispute and provide the details of the creator you subscribed to and which one you wanted.",
      opcoes: [
        { label: "💳 Go to Transactions", action: "redirect", url: "/transacoes.html" },
        { label: "← Back",                next: "cl3_vip" },
      ]
    },
    cl3_6: {
      bot: "To report VIP payment issues, select the SUPPORT option and describe the errors you encountered when subscribing.\n\n⚠️ Remember: a screenshot of the error is mandatory.",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl3_vip" },
      ]
    },
    cl3_7: {
      bot: "To resolve this, select the SUPPORT option and state that even after subscribing you still don't have access.\n\n⚠️ Required:\n• Screenshot of payment confirmation\n• Screenshot of the blocked profile after payment",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl3_vip" },
      ]
    },
    cl3_8: {
      bot: "To resolve this, select the SUPPORT option and state that even after renewing you still don't have access.\n\n⚠️ Required:\n• Screenshot of payment confirmation\n• Screenshot of the blocked profile after renewal",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl3_vip" },
      ]
    },
    cl3_9: {
      bot: "Payment for the first subscription via PIX is subject to a security review.\n\nAvailability depends on the usage history of both the client and the creator on the platform.\n\nTo request manual release:\n1. Go to the contact page\n2. Select the \"Other\" option\n3. Provide the name of the creator you want to subscribe to via PIX\n\nOur team will review and respond as soon as possible.",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl3_vip" },
      ]
    },
    cl4_midias: {
      bot: "About content and media, what would you like to resolve?",
      opcoes: [
        { label: "4.1 Misleading Advertising / Scam / Fraud", next: "cl4_1_intro" },
        { label: "4.2 Right of Withdrawal",                    next: "cl4_2_intro" },
        { label: "4.3 Chat media didn't unlock",              next: "cl4_3"       },
        { label: "4.4 Premium media didn't unlock",           next: "cl4_4"       },
        { label: "4.5 I unlocked the wrong media",            next: "cl4_5"       },
        { label: "4.6 Paid for media I already had",          next: "cl4_6"       },
        { label: "← Back",                                     next: "cliente"     },
      ]
    },
    cl4_1_intro: {
      bot: "Before proceeding, let's clarify what misleading advertising/scam means:\n\n📌 Misleading advertising — They advertise something that doesn't match what is delivered.\nExamples: promised explicit content and delivered something else; said the video is 30min and it's 5min.\n\n📌 Scam (fraud) — Intent to deceive to obtain money.\nExamples: received payment and delivered nothing; pretended to be someone else.\n\n⚠️ What is NOT misleading advertising:\n• Thinking the content would be different, without anyone promising that\n• Not liking the content received\n• Buyer's remorse\n\nDo you still believe you were a victim of misleading advertising or a scam?",
      opcoes: [
        { label: "✅ Yes, I want to file a complaint", next: "cl4_1_sim" },
        { label: "❌ No, I understood",                next: "inicio"    },
      ]
    },
    cl4_1_sim: {
      bot: "To file the complaint, select the subscription or media you want to dispute and choose the \"Misleading Advertising\" option.\n\n⚠️ Submitting a screenshot proving the unkept promise is mandatory to validate the occurrence.",
      opcoes: [
        { label: "💳 Go to Transactions", action: "redirect", url: "/transacoes.html" },
        { label: "← Back",                next: "cl4_midias" },
      ]
    },
    cl4_2_intro: {
      bot: "Before proceeding, understand the Right of Withdrawal for digital platforms:\n\nOnline purchases may have a right of withdrawal within 7 days. However, on Velvet access to digital content is released immediately after payment confirmation.\n\nBy completing the purchase, you accepted the Terms of Use and authorized immediate access. Therefore, after the content is made available, it is not possible to request a refund for withdrawal.\n\nDo you still want to proceed with the withdrawal refund request?",
      opcoes: [
        { label: "✅ Yes, I want to continue", next: "cl4_2_sim" },
        { label: "❌ No, I understood",         next: "inicio"    },
      ]
    },
    cl4_2_sim: {
      bot: "To proceed with the request, select the \"Refund\" option and then \"Withdrawal\", related to the media or subscription in question.",
      opcoes: [
        { label: "💳 Go to Transactions", action: "redirect", url: "/transacoes.html" },
        { label: "← Back",                next: "cl4_midias" },
      ]
    },
    cl4_3: {
      bot: "To resolve this, select the SUPPORT option and state that even after payment the chat media is still blocked.\n\n⚠️ Required:\n• Screenshot of payment confirmation\n• Screenshot of the blocked media",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl4_midias" },
      ]
    },
    cl4_4: {
      bot: "To resolve this, select the SUPPORT option and state that even after payment the Premium media is still blocked.\n\n⚠️ Required:\n• Screenshot of payment confirmation\n• Screenshot of the blocked media",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl4_midias" },
      ]
    },
    cl4_5: {
      bot: "To resolve this, simply send a screenshot of the media you unlocked and a screenshot of the media you wanted to unlock.",
      opcoes: [
        { label: "💳 Go to Transactions", action: "redirect", url: "/transacoes.html" },
        { label: "← Back",                next: "cl4_midias" },
      ]
    },
    cl4_6: {
      bot: "To resolve this, select the SUPPORT option and state that the platform delivered the same media in different packages (premium or chat).\n\n⚠️ Required:\n• Screenshot of both views\n• Payment confirmation of both",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl4_midias" },
      ]
    },
    cl5_denuncias: {
      bot: "About reports, what would you like to do?",
      opcoes: [
        { label: "5.1 I want to report a Profile",      next: "cl5_1" },
        { label: "5.2 I want to make another report",   next: "cl5_2" },
        { label: "← Back",                               next: "cliente" },
      ]
    },
    cl5_1: {
      bot: "To report a profile, select the \"Report account\" option in the form and state the reason.\n\n⚠️ Submitting a screenshot related to the reason for the report is mandatory for review.",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl5_denuncias" },
      ]
    },
    cl5_2: {
      bot: "To make another report, select the OTHER option in the form and state the reason in detail.\n\n⚠️ Submitting a screenshot related to the reason for the report is mandatory for review.",
      opcoes: [
        { label: "📬 Go to Contact", action: "redirect", url: "/contato.html" },
        { label: "← Back",           next: "cl5_denuncias" },
      ]
    },
    cl6_pagamentos: {
      bot: "About payment types, what would you like to know?",
      opcoes: [
        { label: "6.1 What payment methods can I use?", next: "cl6_1" },
        { label: "← Back",                               next: "cliente" },
      ]
    },
    cl6_1: {
      bot: "On Velvet you can pay via:\n\n💳 Pix\n💳 Credit/debit card",
      opcoes: [
        { label: "← Back",         next: "cl6_pagamentos" },
        { label: "🏠 Client Menu", next: "cliente"        },
      ]
    }
  };

  const ARVORE = { pt: ARVORE_PT, es: ARVORE_ES, en: ARVORE_EN }[_lang] || ARVORE_PT;

  // ─── CSS ────────────────────────────────────────────────────────────────────
  const css = document.createElement("style");
  css.textContent = `
    #vw-sp-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%;
      background: #7b2cff; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(123,44,255,.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s;
    }
    #vw-sp-btn:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(123,44,255,.6); }
    #vw-sp-btn svg { width: 26px; height: 26px; fill: #fff; pointer-events: none; }
    #vw-sp-badge {
      position: absolute; top: -4px; right: -4px;
      background: #e53e3e; color: #fff; border-radius: 50%;
      width: 18px; height: 18px; font-size: 11px; font-weight: 700;
      display: none; align-items: center; justify-content: center;
    }
    #vw-sp-box {
      position: fixed; bottom: 90px; right: 24px; z-index: 9998;
      width: 340px; max-height: 520px;
      background: #fff; border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,.18);
      display: none; flex-direction: column;
      overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #vw-sp-box.aberto { display: flex; }
    #vw-sp-header {
      background: linear-gradient(135deg, #7b2cff 0%, #5a1ebb 100%);
      padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    }
    #vw-sp-header-left { display: flex; align-items: center; gap: 10px; }
    #vw-sp-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; flex-shrink: 0;
    }
    #vw-sp-header-info { display: flex; flex-direction: column; }
    #vw-sp-header-title { color: #fff; font-weight: 700; font-size: 14px; line-height: 1.2; }
    #vw-sp-header-sub { color: rgba(255,255,255,.75); font-size: 11px; margin-top: 1px; }
    #vw-sp-fechar {
      background: rgba(255,255,255,.15); border: none; color: #fff;
      cursor: pointer; width: 28px; height: 28px; border-radius: 50%;
      font-size: 16px; display: flex; align-items: center; justify-content: center;
      transition: background .2s; flex-shrink: 0;
    }
    #vw-sp-fechar:hover { background: rgba(255,255,255,.25); }
    #vw-sp-form-email {
      padding: 20px 16px; display: flex; flex-direction: column; gap: 10px;
      background: #fff;
    }
    #vw-sp-form-email p { font-size: 13px; color: #555; line-height: 1.5; margin: 0; }
    #vw-sp-form-email input {
      background: #f6f6f9; border: 1.5px solid #e0e0e0; border-radius: 10px;
      color: #222; padding: 10px 12px; font-size: 13px; outline: none;
      transition: border-color .2s;
    }
    #vw-sp-form-email input:focus { border-color: #7b2cff; }
    #vw-sp-btn-iniciar {
      background: #7b2cff; border: none; border-radius: 10px;
      color: #fff; padding: 11px; font-size: 14px;
      cursor: pointer; font-weight: 600; transition: background .2s;
    }
    #vw-sp-btn-iniciar:hover { background: #6a22e8; }
    #vw-sp-btn-iniciar:disabled { opacity: .6; cursor: default; }
    #vw-sp-msgs {
      flex: 1; overflow-y: auto; padding: 14px 12px;
      display: flex; flex-direction: column; gap: 10px;
      background: #f8f7fc;
    }
    #vw-sp-msgs::-webkit-scrollbar { width: 4px; }
    #vw-sp-msgs::-webkit-scrollbar-thumb { background: #d0c0f0; border-radius: 4px; }
    .vw-msg-row { display: flex; gap: 8px; align-items: flex-end; }
    .vw-msg-row.bot  { justify-content: flex-start; }
    .vw-msg-row.user { justify-content: flex-end; }
    .vw-msg-icon {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; align-self: flex-end;
    }
    .vw-bubble {
      max-width: 82%; padding: 10px 13px; border-radius: 14px;
      font-size: 13px; line-height: 1.55; word-break: break-word;
      white-space: pre-wrap;
    }
    .vw-bubble.bot {
      background: #fff; color: #222;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 6px rgba(0,0,0,.09);
    }
    .vw-bubble.user {
      background: linear-gradient(135deg, #7b2cff, #5a1ebb);
      color: #fff; border-bottom-right-radius: 4px;
    }
    #vw-sp-typing {
      display: none; padding: 4px 12px 8px; align-items: center; gap: 6px;
      background: #f8f7fc;
    }
    .vw-typing-dots {
      display: flex; gap: 4px; align-items: center;
      background: #fff; padding: 8px 12px; border-radius: 14px;
      box-shadow: 0 1px 6px rgba(0,0,0,.09);
    }
    .vw-typing-dots span {
      width: 7px; height: 7px; border-radius: 50%;
      background: #b39ddb; display: block;
      animation: vwBounce 1.2s ease-in-out infinite;
    }
    .vw-typing-dots span:nth-child(2) { animation-delay: .2s; }
    .vw-typing-dots span:nth-child(3) { animation-delay: .4s; }
    @keyframes vwBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30%            { transform: translateY(-5px); }
    }
    #vw-sp-opcoes {
      padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 7px;
      background: #f8f7fc; flex-shrink: 0; max-height: 200px; overflow-y: auto;
    }
    #vw-sp-opcoes::-webkit-scrollbar { width: 4px; }
    #vw-sp-opcoes::-webkit-scrollbar-thumb { background: #d0c0f0; border-radius: 4px; }
    .vw-opcao-btn {
      background: #fff; border: 1.5px solid #e0d6ff; border-radius: 10px;
      color: #5a1ebb; font-size: 12.5px; font-weight: 500;
      padding: 9px 12px; cursor: pointer; text-align: left;
      transition: background .15s, border-color .15s, color .15s;
      line-height: 1.3; font-family: inherit;
    }
    .vw-opcao-btn:hover { background: #f0e8ff; border-color: #7b2cff; color: #7b2cff; }
    .vw-opcao-btn:active { background: #e8d8ff; }
    @media (max-width: 420px) {
      #vw-sp-box { width: calc(100vw - 32px); right: 16px; bottom: 80px; }
    }
    @media (prefers-color-scheme: dark) {
      #vw-sp-box { background: #1a1a2e; }
      #vw-sp-form-email { background: #1a1a2e; }
      #vw-sp-form-email p { color: #bbb; }
      #vw-sp-form-email input { background: #252540; border-color: #3a3a6a; color: #eee; }
      #vw-sp-msgs { background: #141428; }
      #vw-sp-typing { background: #141428; }
      .vw-bubble.bot { background: #252540; color: #eee; box-shadow: none; }
      .vw-typing-dots { background: #252540; box-shadow: none; }
      #vw-sp-opcoes { background: #141428; }
      .vw-opcao-btn { background: #252540; border-color: #3a3a6a; color: #c4a8ff; }
      .vw-opcao-btn:hover { background: #32326a; border-color: #7b2cff; color: #d4bcff; }
    }
  `;
  document.head.appendChild(css);

  // ─── HTML ───────────────────────────────────────────────────────────────────
  const btn = document.createElement("button");
  btn.id = "vw-sp-btn";
  btn.setAttribute("aria-label", T.title);
  btn.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    <span id="vw-sp-badge"></span>
  `;

  const box = document.createElement("div");
  box.id = "vw-sp-box";
  box.setAttribute("role", "dialog");
  box.innerHTML = `
    <div id="vw-sp-header">
      <div id="vw-sp-header-left">
        <div id="vw-sp-header-info">
          <div id="vw-sp-header-title">${T.title}</div>
          <div id="vw-sp-header-sub">${T.online}</div>
        </div>
      </div>
      <button id="vw-sp-fechar" aria-label="${T.fechar_aria}">✕</button>
    </div>
    <div id="vw-sp-form-email">
      <p>${T.email_prompt}</p>
      <input id="vw-sp-email-input" type="email" placeholder="seu@email.com" maxlength="120" autocomplete="email" />
      <button id="vw-sp-btn-iniciar">${T.btn_iniciar}</button>
    </div>
    <div id="vw-sp-msgs" style="display:none"></div>
    <div id="vw-sp-typing" style="display:none">
      <div class="vw-typing-dots"><span></span><span></span><span></span></div>
    </div>
    <div id="vw-sp-opcoes" style="display:none"></div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(box);

  // ─── REFS ────────────────────────────────────────────────────────────────────
  const formEmail  = document.getElementById("vw-sp-form-email");
  const emailInput = document.getElementById("vw-sp-email-input");
  const btnIniciar = document.getElementById("vw-sp-btn-iniciar");
  const msgsEl     = document.getElementById("vw-sp-msgs");
  const typingEl   = document.getElementById("vw-sp-typing");
  const opcoesEl   = document.getElementById("vw-sp-opcoes");

  // ─── TOGGLE ──────────────────────────────────────────────────────────────────
  btn.addEventListener("click", () => {
    aberto = !aberto;
    box.classList.toggle("aberto", aberto);
  });
  document.getElementById("vw-sp-fechar").addEventListener("click", () => {
    aberto = false;
    box.classList.remove("aberto");
  });

  // ─── PERSISTÊNCIA DE ESTADO ──────────────────────────────────────────────────
  function salvarEstado(opcoes) {
    const msgs = [];
    msgsEl.querySelectorAll(".vw-msg-row").forEach(row => {
      const bubble = row.querySelector(".vw-bubble");
      if (!bubble) return;
      msgs.push({ type: bubble.classList.contains("bot") ? "bot" : "user", text: bubble.textContent });
    });
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ msgs, opcoes: opcoes || [] }));
    } catch (_) {}
  }

  function restaurarEstado() {
    if (!estadoSalvo) return false;
    formEmail.style.display = "none";
    msgsEl.style.display    = "flex";
    typingEl.style.display  = "none";
    opcoesEl.style.display  = "flex";
    (estadoSalvo.msgs || []).forEach(m => {
      if (m.type === "bot") adicionarMsgBot(m.text, true);
      else adicionarMsgUsuario(m.text);
    });
    mostrarOpcoes(estadoSalvo.opcoes || [], true);
    return true;
  }

  // ─── PRÉ-PREENCHER EMAIL ─────────────────────────────────────────────────────
  function preencherEmailDoStorage() {
    const email = localStorage.getItem("email") || localStorage.getItem("userEmail") || "";
    if (email) emailInput.value = email;
  }

  // ─── LOG DE INTERAÇÕES (fire-and-forget p/ o admin ver o trail) ─────────────
  function logInteracao(texto, remetente) {
    if (!sessaoId) return;
    fetch(`${API}/api/suporte/conversa/${sessaoId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto, remetente })
    }).catch(() => {});
  }

  // ─── INICIAR SESSÃO ──────────────────────────────────────────────────────────
  btnIniciar.addEventListener("click", iniciarSessao);
  emailInput.addEventListener("keydown", e => { if (e.key === "Enter") iniciarSessao(); });

  async function iniciarSessao() {
    const email = emailInput.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.focus(); emailInput.style.borderColor = "#e53e3e"; return;
    }
    emailInput.style.borderColor = "";
    btnIniciar.disabled = true;
    btnIniciar.textContent = T.aguarde;

    const token     = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    const clienteId = localStorage.getItem("clienteId") || localStorage.getItem("userId") || "";
    const nome      = localStorage.getItem("nome") || localStorage.getItem("name") || "";

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(`${API}/api/suporte/conversa`, {
        method: "POST", headers,
        body: JSON.stringify({ nome: nome || email, email, cliente_id: clienteId || undefined })
      });
      if (r.ok) {
        const data = await r.json();
        sessaoId = data.conversa_id;
        localStorage.setItem(SESSION_KEY, sessaoId);
      }
    } catch (_) {}

    formEmail.style.display = "none";
    msgsEl.style.display    = "flex";
    typingEl.style.display  = "flex";
    opcoesEl.style.display  = "flex";
    irParaEtapa("inicio");
  }

  // ─── RENDERIZAR ETAPA ────────────────────────────────────────────────────────
  function irParaEtapa(id) {
    etapaAtual = id;
    const etapa = ARVORE[id];
    if (!etapa) return;
    opcoesEl.innerHTML = "";
    opcoesEl.style.display = "none";
    mostrarTyping(() => {
      adicionarMsgBot(etapa.bot);
      mostrarOpcoes(etapa.opcoes);
    });
  }

  function mostrarTyping(cb, delay = 700) {
    typingEl.style.display = "flex";
    scrollBaixo();
    setTimeout(() => { typingEl.style.display = "none"; cb(); }, delay);
  }

  // ─── MENSAGENS ───────────────────────────────────────────────────────────────
  function adicionarMsgBot(texto, silencioso = false) {
    const row = document.createElement("div");
    row.className = "vw-msg-row bot";
    const icon = document.createElement("div");
    icon.className = "vw-msg-icon";
    icon.textContent = "💜";
    const bubble = document.createElement("div");
    bubble.className = "vw-bubble bot";
    bubble.textContent = texto;
    row.appendChild(icon);
    row.appendChild(bubble);
    msgsEl.appendChild(row);
    if (!silencioso) {
      scrollBaixo();
      logInteracao(texto, "admin");
    }
  }

  function adicionarMsgUsuario(texto) {
    const row = document.createElement("div");
    row.className = "vw-msg-row user";
    const bubble = document.createElement("div");
    bubble.className = "vw-bubble user";
    bubble.textContent = texto;
    row.appendChild(bubble);
    msgsEl.appendChild(row);
    scrollBaixo();
    logInteracao(texto, "cliente");
  }

  // ─── OPÇÕES ──────────────────────────────────────────────────────────────────
  function mostrarOpcoes(opcoes, silencioso = false) {
    opcoesEl.innerHTML = "";
    opcoesEl.style.display = "flex";
    opcoes.forEach(op => {
      const b = document.createElement("button");
      b.className = "vw-opcao-btn";
      b.textContent = op.label;
      b.addEventListener("click", () => executarOpcao(op));
      opcoesEl.appendChild(b);
    });
    salvarEstado(opcoes);
    if (!silencioso) scrollBaixo();
  }

  // ─── EXECUTAR AÇÃO ───────────────────────────────────────────────────────────
  function executarOpcao(op) {
    // navigate: usado pelos botões de retorno — navega direto sem mensagem nova
    if (op.action === "navigate") {
      window.location.href = op.url;
      return;
    }

    adicionarMsgUsuario(op.label);
    opcoesEl.style.display = "none";
    opcoesEl.innerHTML = "";

    if (op.action === "redirect") {
      mostrarTyping(() => {
        adicionarMsgBot(T.redirect_msg);
        mostrarOpcoes([
          { label: op.label, action: "navigate", url: op.url },
          { label: T.redirect_outro, next: "inicio" },
        ]);
        setTimeout(() => { window.location.href = op.url; }, 1200);
      }, 400);
      return;
    }

    if (op.action === "contato") {
      mostrarTyping(() => {
        adicionarMsgBot(T.contato_msg);
        mostrarOpcoes([
          { label: T.contato_btn, action: "navigate", url: "/contato.html" },
          { label: T.redirect_outro, next: "inicio" },
        ]);
        setTimeout(() => { window.location.href = "/contato.html"; }, 1200);
      }, 400);
      return;
    }

    if (op.next) irParaEtapa(op.next);
  }

  // ─── UTILITÁRIOS ─────────────────────────────────────────────────────────────
  function scrollBaixo() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
    opcoesEl.scrollTop = 0;
  }

  // ─── INIT ────────────────────────────────────────────────────────────────────
  const restaurado = restaurarEstado();
  if (!restaurado) {
    preencherEmailDoStorage();
    // Se já tem sessão mas não tem estado salvo, pula o form e vai para início
    if (sessaoId) {
      formEmail.style.display = "none";
      msgsEl.style.display    = "flex";
      typingEl.style.display  = "none";
      opcoesEl.style.display  = "flex";
      adicionarMsgBot(ARVORE["inicio"].bot, true);
      mostrarOpcoes(ARVORE["inicio"].opcoes, true);
    }
  }
})();
