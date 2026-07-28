(function () {
  const API = "";
  const STORAGE_KEY = "vw_suporte_sessao";

  let sessaoId = localStorage.getItem(STORAGE_KEY) || null;
  let aberto = false;
  let etapaAtual = "inicio";

  // ─── Árvore de conteúdo ─────────────────────────────────────────────────────
  const ARVORE = {
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

    // ── 1. VELVET ──────────────────────────────────────────────────────────────
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

    // ── 2. PERFIL / CONTA ──────────────────────────────────────────────────────
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
      bot: "Para validar sua conta basta preencher passo a passo todas as informações na página de dados pessoais e enviar para análise.\n\nVou te redirecionar para lá agora! 👇",
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

    // ── 3. AGENCIAMENTO ────────────────────────────────────────────────────────
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
      bot: "Para entrar para uma agência, selecione a opção OUTRO no formulário de contato, informe que deseja ser agenciada, informe seu WhatsApp e/ou email.\n\nIremos solicitar que a contactem e você terá liberdade de escolha sobre qual se identifica melhor! 💜",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "c3_agencia" },
      ]
    },

    // ── 4. PAGAMENTOS ──────────────────────────────────────────────────────────
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
      bot: "São valores pagos pelo cliente via cartão de crédito. Dependemos da operadora avaliar o pagamento, descartar fraude e liberar o valor — o que pode levar de 3 a 30 dias.\n\nNão se preocupe! A própria plataforma trata de atualizar os ganhos pendentes para liberados automaticamente. ✅",
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

    // ── 5. MÍDIAS ──────────────────────────────────────────────────────────────
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

    // ── CLIENTE 1: PLATAFORMA ─────────────────────────────────────────────────
    cl1_plataforma: {
      bot: "Sobre a plataforma e app, o que deseja saber?",
      opcoes: [
        { label: "1.1 O que é e como funciona a Velvet?",       next: "cl1_1" },
        { label: "1.2 Que tipo de conteúdo posso encontrar?",   next: "cl1_2" },
        { label: "← Voltar",                                     next: "cliente" },
      ]
    },
    cl1_1: {
      bot: "A Velvet foi criada para proporcionar aos fãs uma forma simples, segura e próxima de apoiar e acompanhar os seus criadores favoritos.\n\nNossa missão é aproximar criadores e comunidade, oferecendo um espaço onde pode descobrir conteúdo, interagir diretamente com seus criadores favoritos e apoiar o trabalho deles de forma transparente.\n\nAcreditamos que a melhor experiência acontece quando existe uma ligação autêntica entre fãs e criadores. Por isso, desenvolvemos uma plataforma que privilegia a segurança, a privacidade e uma experiência intuitiva.",
      opcoes: [
        { label: "← Voltar",       next: "cl1_plataforma" },
        { label: "🏠 Menu Cliente", next: "cliente"        },
      ]
    },
    cl1_2: {
      bot: "Pode encontrar conteúdo de lifestyle, bastidores, dicas, entretenimento, privados e muito mais.\n\nAntes de assinar qualquer perfil, pode consultar a categoria ao passar o mouse sobre o perfil no feed:\n\n🌍 Social — Fotos, vídeos, viagens, lifestyle, gaming, fitness, moda e muito mais.\n\n🔥 Premium — Conteúdo mais exclusivo e sensual (biquíni, lingerie, cosplay) sem nudez explícita.\n\n🔒 Privado — Conteúdo adulto, disponível mediante validação de identidade.",
      opcoes: [
        { label: "← Voltar",       next: "cl1_plataforma" },
        { label: "🏠 Menu Cliente", next: "cliente"        },
      ]
    },

    // ── CLIENTE 2: MINHA CONTA ────────────────────────────────────────────────
    cl2_conta: {
      bot: "Sobre sua conta, o que deseja fazer?",
      opcoes: [
        { label: "2.1 Quero excluir minha conta",       next: "cl2_1" },
        { label: "2.2 Quero alterar dados da minha conta", next: "cl2_2" },
        { label: "2.3 Posso colocar foto no perfil?",   next: "cl2_3" },
        { label: "← Voltar",                             next: "cliente" },
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
      bot: "Por motivos de segurança os dados não podem ser alterados.\n\nCaso alguma informação esteja realmente incorreta, envie um documento que comprove e iremos fazer a correção.\n\nSelecione a opção SUPORTE no formulário de contato.",
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

    // ── CLIENTE 3: ASSINATURAS VIP ────────────────────────────────────────────
    cl3_vip: {
      bot: "Sobre assinaturas VIP, o que deseja saber?",
      opcoes: [
        { label: "3.1 Como funciona a assinatura VIP?",      next: "cl3_1" },
        { label: "3.2 Quero assinar um perfil",              next: "cl3_2" },
        { label: "3.3 Quero renovar uma assinatura",         next: "cl3_3" },
        { label: "3.4 Quero cancelar uma assinatura",        next: "cl3_4" },
        { label: "3.5 Assinei VIP da criadora errada",       next: "cl3_5" },
        { label: "3.6 Problemas com o pagamento VIP",        next: "cl3_6" },
        { label: "3.7 Assinei VIP mas não liberou",          next: "cl3_7" },
        { label: "3.8 Renovei VIP mas continuo sem acesso",  next: "cl3_8" },
        { label: "3.9 Quero pagar com PIX minha 1ª assinatura", next: "cl3_9" },
        { label: "← Voltar",                                 next: "cliente" },
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

    // ── CLIENTE 4: CONTEÚDOS/MÍDIAS ──────────────────────────────────────────
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
      bot: "Antes de prosseguir, entenda o Direito de Arrependimento em plataformas digitais:\n\nCompras pela internet podem ter direito ao arrependimento em até 7 dias. Porém, na Velvet o acesso ao conteúdo digital é liberado imediatamente após a confirmação do pagamento.\n\nAo concluir a compra, você aceitou os Termos de Uso e autorizou o acesso imediato. Por isso, após o conteúdo ser disponibilizado, não é possível solicitar reembolso por arrependimento ou porque o conteúdo não correspondeu às expectativas.\n\nFicam registados:\n• Data e hora da aceitação\n• Endereço IP\n• Aceite dos Termos de Uso\n\nMesmo assim, deseja continuar com o pedido de reembolso por arrependimento?",
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

    // ── CLIENTE 5: DENÚNCIAS ─────────────────────────────────────────────────
    cl5_denuncias: {
      bot: "Sobre denúncias, o que deseja fazer?",
      opcoes: [
        { label: "5.1 Quero denunciar um Perfil",   next: "cl5_1" },
        { label: "5.2 Quero fazer outra denúncia",  next: "cl5_2" },
        { label: "← Voltar",                         next: "cliente" },
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
      bot: "Para fazer outra denúncia, selecione a opção OUTRO no formulário, informe o motivo detalhadamente.\n\n⚠️ O envio do printscreen referente ao motivo da denúncia é obrigatório para análise.",
      opcoes: [
        { label: "📬 Ir para Contato", action: "redirect", url: "/contato.html" },
        { label: "← Voltar",           next: "cl5_denuncias" },
      ]
    },

    // ── CLIENTE 6: TIPOS DE PAGAMENTO ─────────────────────────────────────────
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
      transition: opacity .2s, transform .2s;
      transform: translateY(8px); opacity: 0;
    }
    #vw-sp-box.aberto { display: flex; transform: translateY(0); opacity: 1; }

    /* Header */
    #vw-sp-header {
      background: linear-gradient(135deg, #7b2cff 0%, #5a1ebb 100%);
      padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    }
    #vw-sp-header-left { display: flex; align-items: center; gap: 10px; }
    #vw-sp-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,.2);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0;
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

    /* Form de email (antes de iniciar) */
    #vw-sp-form-email {
      padding: 20px 16px; display: flex; flex-direction: column; gap: 10px;
      background: #fff;
    }
    #vw-sp-form-email p {
      font-size: 13px; color: #555; line-height: 1.5; margin: 0;
    }
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

    /* Mensagens */
    #vw-sp-msgs {
      flex: 1; overflow-y: auto; padding: 14px 12px;
      display: flex; flex-direction: column; gap: 10px;
      background: #f8f7fc;
    }
    #vw-sp-msgs::-webkit-scrollbar { width: 4px; }
    #vw-sp-msgs::-webkit-scrollbar-thumb { background: #d0c0f0; border-radius: 4px; }

    .vw-msg-row {
      display: flex; gap: 8px; align-items: flex-end;
    }
    .vw-msg-row.bot  { justify-content: flex-start; }
    .vw-msg-row.user { justify-content: flex-end; }

    .vw-msg-icon {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #7b2cff, #5a1ebb);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; align-self: flex-end;
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
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .vw-msg-hora {
      font-size: 10px; opacity: .5; margin-top: 4px; text-align: right;
    }

    /* Typing indicator */
    #vw-sp-typing {
      display: none; padding: 4px 12px 8px; align-items: center; gap: 6px;
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

    /* Opções */
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
      line-height: 1.3;
    }
    .vw-opcao-btn:hover {
      background: #f0e8ff; border-color: #7b2cff; color: #7b2cff;
    }
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
      .vw-bubble.bot { background: #252540; color: #eee; box-shadow: none; }
      #vw-sp-typing { background: #141428; }
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
  btn.setAttribute("aria-label", "Suporte Velvet");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    <span id="vw-sp-badge"></span>
  `;

  const box = document.createElement("div");
  box.id = "vw-sp-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Suporte Velvet");
  box.innerHTML = `
    <div id="vw-sp-header">
      <div id="vw-sp-header-left">
        <div id="vw-sp-avatar">💜</div>
        <div id="vw-sp-header-info">
          <div id="vw-sp-header-title">Suporte Velvet</div>
          <div id="vw-sp-header-sub">● Online</div>
        </div>
      </div>
      <button id="vw-sp-fechar" aria-label="Fechar suporte">✕</button>
    </div>

    <div id="vw-sp-form-email">
      <p>Para te ajudar melhor, informe seu e-mail:</p>
      <input id="vw-sp-email-input" type="email" placeholder="seu@email.com" maxlength="120" autocomplete="email" />
      <button id="vw-sp-btn-iniciar">Iniciar atendimento</button>
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
  const badge      = document.getElementById("vw-sp-badge");
  const formEmail  = document.getElementById("vw-sp-form-email");
  const emailInput = document.getElementById("vw-sp-email-input");
  const btnIniciar = document.getElementById("vw-sp-btn-iniciar");
  const msgsEl     = document.getElementById("vw-sp-msgs");
  const typingEl   = document.getElementById("vw-sp-typing");
  const opcoesEl   = document.getElementById("vw-sp-opcoes");

  // ─── TOGGLE ──────────────────────────────────────────────────────────────────
  btn.addEventListener("click", () => {
    aberto = !aberto;
    if (aberto) {
      box.classList.add("aberto");
      badge.style.display = "none";
      badge.textContent = "";
      if (!sessaoId) {
        preencherEmailDoStorage();
      }
    } else {
      box.classList.remove("aberto");
    }
  });
  document.getElementById("vw-sp-fechar").addEventListener("click", () => {
    aberto = false;
    box.classList.remove("aberto");
  });

  // ─── PRÉ-PREENCHER EMAIL ─────────────────────────────────────────────────────
  function preencherEmailDoStorage() {
    const emailSalvo = localStorage.getItem("email") || localStorage.getItem("userEmail") || "";
    if (emailSalvo) emailInput.value = emailSalvo;
  }

  // ─── INICIAR SESSÃO ──────────────────────────────────────────────────────────
  btnIniciar.addEventListener("click", iniciarSessao);
  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") iniciarSessao();
  });

  async function iniciarSessao() {
    const email = emailInput.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.focus();
      emailInput.style.borderColor = "#e53e3e";
      return;
    }
    emailInput.style.borderColor = "";
    btnIniciar.disabled = true;
    btnIniciar.textContent = "Aguarde…";

    const token    = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    const clienteId = localStorage.getItem("clienteId") || localStorage.getItem("userId") || "";
    const nome     = localStorage.getItem("nome") || localStorage.getItem("name") || "";

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch(`${API}/api/suporte/conversa`, {
        method: "POST",
        headers,
        body: JSON.stringify({ nome: nome || email, email, cliente_id: clienteId || undefined })
      });
      if (r.ok) {
        const data = await r.json();
        sessaoId = data.conversa_id;
        localStorage.setItem(STORAGE_KEY, sessaoId);
      }
    } catch (_) {
      // falha silenciosa — o chatbot funciona sem sessão gravada
    }

    formEmail.style.display  = "none";
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
    setTimeout(() => {
      typingEl.style.display = "none";
      cb();
    }, delay);
  }

  // ─── MENSAGEM DO BOT ─────────────────────────────────────────────────────────
  function adicionarMsgBot(texto) {
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
    scrollBaixo();
  }

  // ─── MENSAGEM DO USUÁRIO (escolha) ───────────────────────────────────────────
  function adicionarMsgUsuario(texto) {
    const row = document.createElement("div");
    row.className = "vw-msg-row user";

    const bubble = document.createElement("div");
    bubble.className = "vw-bubble user";
    bubble.textContent = texto;

    row.appendChild(bubble);
    msgsEl.appendChild(row);
    scrollBaixo();
  }

  // ─── MOSTRAR OPÇÕES ──────────────────────────────────────────────────────────
  function mostrarOpcoes(opcoes) {
    opcoesEl.innerHTML = "";
    opcoesEl.style.display = "flex";

    opcoes.forEach(op => {
      const btn = document.createElement("button");
      btn.className = "vw-opcao-btn";
      btn.textContent = op.label;
      btn.addEventListener("click", () => executarOpcao(op));
      opcoesEl.appendChild(btn);
    });
    scrollBaixo();
  }

  // ─── EXECUTAR AÇÃO ───────────────────────────────────────────────────────────
  function executarOpcao(op) {
    adicionarMsgUsuario(op.label);
    opcoesEl.style.display = "none";
    opcoesEl.innerHTML = "";

    if (op.action === "redirect") {
      mostrarTyping(() => {
        adicionarMsgBot("Redirecionando… 👉");
        setTimeout(() => { window.location.href = op.url; }, 800);
      }, 500);
      return;
    }

    if (op.action === "contato") {
      mostrarTyping(() => {
        adicionarMsgBot("Vou te encaminhar para o nosso formulário de contato! Nossa equipe responde em até 48h. 💜");
        setTimeout(() => { window.location.href = "/contato.html"; }, 1200);
      }, 500);
      return;
    }

    if (op.next) {
      irParaEtapa(op.next);
    }
  }

  // ─── UTILITÁRIOS ─────────────────────────────────────────────────────────────
  function scrollBaixo() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
    opcoesEl.scrollTop = 0;
  }

  // ─── INIT: se já tem sessão, pula o form de email ────────────────────────────
  if (sessaoId) {
    formEmail.style.display  = "none";
    msgsEl.style.display    = "flex";
    typingEl.style.display  = "none";
    opcoesEl.style.display  = "flex";
    // Vai direto para início sem typing ao reabrir
    const etapa = ARVORE["inicio"];
    adicionarMsgBot(etapa.bot);
    mostrarOpcoes(etapa.opcoes);
  }
})();
