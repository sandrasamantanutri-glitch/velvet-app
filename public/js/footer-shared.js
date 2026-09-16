/* footer-shared.js — footer único para todas as páginas internas
   Cada página deve ter: <div id="footer-container"></div>
   e carregar este script: <script src="/js/footer-shared.js"></script>
*/
(function () {
  if (!document.getElementById('footer-shared-styles')) {
    const style = document.createElement('style');
    style.id = 'footer-shared-styles';
    style.textContent = `
      .footer { padding: 1.5rem 1rem 1rem; text-align: center; border-top: 1px solid #e8e4f4; margin-top: 2rem; }
      .footer-links { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: .35rem .1rem; list-style: none; padding: 0; margin: 0 0 .75rem; }
      .footer-links a { color: rgba(30,30,38,.55); font-size: .78rem; text-decoration: none; padding: 0 .25rem; transition: color .15s; }
      .footer-links a:hover { color: #7B2CFF; }
      .footer-sep { color: rgba(30,30,38,.3); font-size: .78rem; user-select: none; }
      .footer-copy { font-size: .72rem; color: rgba(30,30,38,.4); margin: 0; }
    `;
    document.head.appendChild(style);
  }

  const html = `
    <footer class="footer">
      <ul class="footer-links">
        <a href="https://www.velvet.lat/about.html"
           target="_blank"
           rel="noopener noreferrer"
           data-i18n="footer.sobre">Sobre nós</a>

        <span class="footer-sep">·</span>

        <a href="https://www.velvet.lat/terms.html"
           target="_blank"
           rel="noopener noreferrer"
           data-i18n="footer.termos">Políticas e Termos de utilização</a>

        <span class="footer-sep">·</span>

        <a href="https://www.velvet.lat/privacy.html"
           target="_blank"
           rel="noopener noreferrer"
           data-i18n="footer.privacidade">Políticas de Privacidade</a>

        <span class="footer-sep">·</span>

        <a href="contato.html"
           target="_blank"
           rel="noopener noreferrer"
           data-i18n="footer.contato">Contato</a>
      </ul>

      <p class="footer-copy" data-i18n="footer.copy">
        © 2026 Velvet. Todos os direitos reservados.
      </p>
    </footer>
  `;

  function inject() {
    const container = document.getElementById('footer-container');
    if (!container) return;
    container.innerHTML = html;
    const applyWhenReady = () => {
      if (typeof applyTranslations === 'function') applyTranslations(container);
    };
    if (typeof whenI18nReady === 'function') {
      whenI18nReady().then(applyWhenReady);
    } else {
      applyWhenReady();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();