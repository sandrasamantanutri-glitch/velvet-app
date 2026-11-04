(function () {
  const LANGS = ['pt', 'en', 'es'];
  const DEFAULT = 'pt';

  const T = {
    pt: {
      'nav.creators':   'Criadores',
      'nav.howItWorks': 'Como Funciona',
      'nav.help':       'Ajuda',
      'nav.access':     'Acessar',
      'hero.title':     'Conecte-se com seus<br><em>criadores favoritos</em>',
      'hero.subtitle':  'Assine e desbloqueie mídias, envie mensagens privadas e tenha uma experiência muito mais próxima de quem você admira.',
      'hero.cta':       'Acessar',
      'phone1.label':   'Comunidade Premium',
      'phone1.title':   'Entre no universo dos<br><em>seus criadores favoritos</em>',
      'phone1.desc':    'Tenha acesso a conteúdos, bastidores, atualizações e experiências reservadas para assinantes.',
      'phone1.cta':     'Começar agora',
      'tagline':        'Acompanhe seus criadores<br>além das redes sociais.',
      'chat.title':     'Converse com seus<br><em>criadores favoritos</em>',
      'chat.desc':      'Obtenha uma conexão mais pessoal com seus criadores.',
      'chat.cta':       'Explorar agora',
      'features.title': 'Tudo que você precisa<br>em um só lugar',
      'features.sub':   'Uma experiência premium para fãs e criadores',
      'f1.title': 'Mídias',
      'f1.desc':  'Acesse fotos, vídeos e publicações disponíveis para assinantes.',
      'f2.title': 'Chat Direto',
      'f2.desc':  'Converse diretamente com seus criadores favoritos. Uma conexão real, longe dos algoritmos.',
      'f3.title': 'Atualizações em Tempo Real',
      'f3.desc':  'Seja o primeiro a ver cada novo post. Notificações instantâneas para nunca perder nada.',
      'f4.title': 'Status Especial',
      'f4.desc':  'Assinantes top ganham status VIP e benefícios exclusivos dentro da plataforma.',
      'f5.title': 'Comunidade',
      'f5.desc':  'Faça parte de uma comunidade de fãs que compartilham os mesmos interesses que você.',
      'f6.title': 'Pagamento Seguro',
      'f6.desc':  'Pagamentos processados com total segurança. PIX, cartão de crédito e mais opções.',
      'faq.title': 'Perguntas Frequentes',
      'faq1.q': 'Como entro na Velvet?',
      'faq1.a': 'Clique em qualquer botão "Acessar" ou "Começar Agora" para criar sua conta gratuitamente em segundos, ou fazer seu login',
      'faq2.q': 'Quanto custa assinar um criador?',
      'faq2.a': 'Cada criador define o valor da sua assinatura mensal. Você pode encontrar criadores com diferentes faixas de preço para todo tipo de orçamento.',
      'faq3.q': 'Como funciona o chat com criadores?',
      'faq3.a': 'Após assinar um criador, você tem acesso VIP ao chat direto no perfil dele. É uma conversa privada, sem filtros de algoritmo.',
      'faq4.q': 'Que tipo de conteúdo é permitido?',
      'faq4.a': 'Conteúdo de lifestyle, bastidores, dicas, entretenimento, +18 e muito mais. Atenção que conteudo +18 não é o mesmo que explícito, e conteúdo explícito não é permitido na plataforma.',
      'faq5.q': 'Qual a idade mínima para usar o Velvet?',
      'faq5.a': 'É necessário ter 18 anos ou mais para criar uma conta e assinar criadores na Velvet.',
      'cta.title': 'Pronto para ingressar<br>na Velvet?',
      'cta.desc':  'Junte-se a milhares de fãs que já estão mais perto de seus criadores favoritos.',
      'cta.btn':   'Criar Conta Grátis',
      'footer.copy': '© 2026 Velvet. Todos os direitos reservados.',
    },
    en: {
      'nav.creators':   'Creators',
      'nav.howItWorks': 'How It Works',
      'nav.help':       'Help',
      'nav.access':     'Get Started',
      'hero.title':     'Connect with your<br><em>favorite creators</em>',
      'hero.subtitle':  'Subscribe and unlock media, send private messages, and get much closer to the people you admire.',
      'hero.cta':       'Get Started',
      'phone1.label':   'Premium Community',
      'phone1.title':   'Enter the world of<br><em>your favorite creators</em>',
      'phone1.desc':    'Access content, behind-the-scenes, updates, and experiences reserved for subscribers.',
      'phone1.cta':     'Start now',
      'tagline':        'Follow your creators<br>beyond social media.',
      'chat.title':     'Chat with your<br><em>favorite creators</em>',
      'chat.desc':      'Get a more personal connection with your creators.',
      'chat.cta':       'Explore now',
      'features.title': 'Everything you need<br>in one place',
      'features.sub':   'A premium experience for fans and creators',
      'f1.title': 'Media',
      'f1.desc':  'Access photos, videos, and posts available for subscribers.',
      'f2.title': 'Direct Chat',
      'f2.desc':  'Talk directly with your favorite creators. A real connection, away from algorithms.',
      'f3.title': 'Real-Time Updates',
      'f3.desc':  'Be the first to see every new post. Instant notifications so you never miss a thing.',
      'f4.title': 'Special Status',
      'f4.desc':  'Top subscribers earn VIP status and exclusive benefits within the platform.',
      'f5.title': 'Community',
      'f5.desc':  'Be part of a community of fans who share the same interests as you.',
      'f6.title': 'Secure Payment',
      'f6.desc':  'Payments processed with total security. Credit card, PIX, and more options.',
      'faq.title': 'Frequently Asked Questions',
      'faq1.q': 'How do I join Velvet?',
      'faq1.a': 'Click any "Get Started" button to create your account for free in seconds, or log in.',
      'faq2.q': 'How much does it cost to subscribe to a creator?',
      'faq2.a': 'Each creator sets their own monthly subscription price. You can find creators at different price ranges for any budget.',
      'faq3.q': 'How does the chat with creators work?',
      'faq3.a': 'After subscribing to a creator, you get VIP access to direct chat on their profile. It\'s a private conversation, free from algorithm filters.',
      'faq4.q': 'What kind of content is allowed?',
      'faq4.a': 'Lifestyle content, behind-the-scenes, tips, entertainment, +18 and much more. Note that +18 content is not the same as explicit, and explicit content is not allowed on the platform.',
      'faq5.q': 'What is the minimum age to use Velvet?',
      'faq5.a': 'You must be 18 years or older to create an account and subscribe to creators on Velvet.',
      'cta.title': 'Ready to join<br>Velvet?',
      'cta.desc':  'Join thousands of fans who are already closer to their favorite creators.',
      'cta.btn':   'Create Free Account',
      'footer.copy': '© 2026 Velvet. All rights reserved.',
    },
    es: {
      'nav.creators':   'Creadores',
      'nav.howItWorks': 'Cómo Funciona',
      'nav.help':       'Ayuda',
      'nav.access':     'Acceder',
      'hero.title':     'Conéctate con tus<br><em>creadores favoritos</em>',
      'hero.subtitle':  'Suscríbete y desbloquea medios, envía mensajes privados y ten una experiencia mucho más cercana a quienes admiras.',
      'hero.cta':       'Acceder',
      'phone1.label':   'Comunidad Premium',
      'phone1.title':   'Entra en el universo de<br><em>tus creadores favoritos</em>',
      'phone1.desc':    'Accede a contenidos, bastidores, actualizaciones y experiencias reservadas para suscriptores.',
      'phone1.cta':     'Comenzar ahora',
      'tagline':        'Sigue a tus creadores<br>más allá de las redes sociales.',
      'chat.title':     'Chatea con tus<br><em>creadores favoritos</em>',
      'chat.desc':      'Obtén una conexión más personal con tus creadores.',
      'chat.cta':       'Explorar ahora',
      'features.title': 'Todo lo que necesitas<br>en un solo lugar',
      'features.sub':   'Una experiencia premium para fans y creadores',
      'f1.title': 'Medios',
      'f1.desc':  'Accede a fotos, videos y publicaciones disponibles para suscriptores.',
      'f2.title': 'Chat Directo',
      'f2.desc':  'Habla directamente con tus creadores favoritos. Una conexión real, lejos de los algoritmos.',
      'f3.title': 'Actualizaciones en Tiempo Real',
      'f3.desc':  'Sé el primero en ver cada nueva publicación. Notificaciones instantáneas para nunca perderte nada.',
      'f4.title': 'Estado Especial',
      'f4.desc':  'Los mejores suscriptores obtienen estado VIP y beneficios exclusivos dentro de la plataforma.',
      'f5.title': 'Comunidad',
      'f5.desc':  'Sé parte de una comunidad de fans que comparten los mismos intereses que tú.',
      'f6.title': 'Pago Seguro',
      'f6.desc':  'Pagos procesados con total seguridad. Tarjeta de crédito, PIX y más opciones.',
      'faq.title': 'Preguntas Frecuentes',
      'faq1.q': '¿Cómo me uno a Velvet?',
      'faq1.a': 'Haz clic en cualquier botón "Acceder" o "Comenzar Ahora" para crear tu cuenta gratis en segundos, o inicia sesión.',
      'faq2.q': '¿Cuánto cuesta suscribirse a un creador?',
      'faq2.a': 'Cada creador establece el valor de su suscripción mensual. Puedes encontrar creadores con diferentes rangos de precio para todo tipo de presupuesto.',
      'faq3.q': '¿Cómo funciona el chat con los creadores?',
      'faq3.a': 'Después de suscribirte a un creador, tienes acceso VIP al chat directo en su perfil. Es una conversación privada, sin filtros de algoritmo.',
      'faq4.q': '¿Qué tipo de contenido está permitido?',
      'faq4.a': 'Contenido de lifestyle, bastidores, consejos, entretenimiento, +18 y mucho más. Ten en cuenta que el contenido +18 no es lo mismo que explícito, y el contenido explícito no está permitido en la plataforma.',
      'faq5.q': '¿Cuál es la edad mínima para usar Velvet?',
      'faq5.a': 'Debes tener 18 años o más para crear una cuenta y suscribirte a creadores en Velvet.',
      'cta.title': '¿Listo para unirte<br>a Velvet?',
      'cta.desc':  'Únete a miles de fans que ya están más cerca de sus creadores favoritos.',
      'cta.btn':   'Crear Cuenta Gratis',
      'footer.copy': '© 2026 Velvet. Todos los derechos reservados.',
    },
  };

  function getLang() {
    const saved = localStorage.getItem('velvet-lang');
    if (saved && LANGS.includes(saved)) return saved;
    const browser = (navigator.language || '').slice(0, 2);
    if (LANGS.includes(browser)) return browser;
    return DEFAULT;
  }

  function applyLang(lang) {
    const t = T[lang] || T[DEFAULT];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = t[el.dataset.i18n];
      if (v === undefined) return;
      if (v.includes('<')) {
        el.innerHTML = v;
      } else {
        el.textContent = v;
      }
    });
    localStorage.setItem('velvet-lang', lang);
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
    const sw = document.getElementById('lang-switcher');
    if (sw) sw.value = lang;
  }

  function init() {
    const lang = getLang();
    applyLang(lang);
    const sw = document.getElementById('lang-switcher');
    if (sw) {
      sw.value = lang;
      sw.addEventListener('change', () => applyLang(sw.value));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
