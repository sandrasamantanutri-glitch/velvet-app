const fs = require('fs');
const path = require('path');
const db = require('./db');

// ─── CONFIGURAÇÃO ───────────────────────────────────────────────
const BASE_URL = 'https://www.velvet.lat';
const HTML_DIR = path.join(__dirname);        // pasta raiz do projecto
const OUTPUT   = path.join(__dirname, 'public', 'sitemap.xml');

// Ficheiros/pastas a ignorar
const PUBLIC_PAGES = [
  '/'
];
// ────────────────────────────────────────────────────────────────

function buildUrl(filePath) {
  let relative = path.relative(HTML_DIR, filePath);

  // Converter separadores Windows → /
  relative = relative.split(path.sep).join('/');

  // index.html → URL limpo sem ficheiro
  if (relative === 'index.html') return BASE_URL + '/';
  if (relative.endsWith('/index.html')) {
    relative = relative.replace('/index.html', '/');
  }

  return `${BASE_URL}/${relative}`;
}

async function getEligibleModelIds() {
  const result = await db.query(`
    SELECT id
    FROM modelos
    WHERE verificada = TRUE
      AND feed = TRUE
      AND id IS NOT NULL
  `);

  return result.rows.map(row => row.id);
}

async function generateSitemap() {
  const modelIds = await getEligibleModelIds();

  const files = PUBLIC_PAGES.map(page => page === '/'
    ? path.join(HTML_DIR, 'index.html')
    : path.join(HTML_DIR, page.replace(/^\//, ''))
  );

  const today = new Date().toISOString().split('T')[0];

  // URLs das páginas públicas
  const pageUrls = files.map(f => {
    const url = buildUrl(f);

    return `
  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${url === BASE_URL + '/' ? '1.0' : '0.8'}</priority>
  </url>`;
  });

  // URLs dos perfis das modelos elegíveis
  const profileUrls = modelIds.map(id => {
    const url = new URL('/perfil.html', BASE_URL);
    url.searchParams.set('modelo_id', String(id));

    return `
  <url>
    <loc>${url.toString()}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  });

  // Juntar as páginas públicas e os perfis
  const allUrls = [...pageUrls, ...profileUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.join('\n')}
</urlset>`;

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, xml, 'utf8');

  console.log(
    `✅ Sitemap gerado com ${allUrls.length} URLs → ${OUTPUT}`
  );

  allUrls.forEach(entry => {
    const match = entry.match(/<loc>(.*?)<\/loc>/);
    if (match) {
      console.log('   •', match[1]);
    }
  });
}

generateSitemap().catch(err => {
  console.error('❌ Erro ao gerar sitemap:', err);
  process.exitCode = 1;
});