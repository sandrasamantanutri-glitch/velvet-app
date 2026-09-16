/* footer-shared.js — footer único para todas as páginas internas
   Para atualizar o footer em todas as páginas, edite apenas este arquivo.
   Cada página deve ter: <div id="footer-container"></div>
   e carregar este script: <script src="/testes/footer-shared.js"></script>
*/
(function () {
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

    if (container) {
      container.innerHTML = html;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();