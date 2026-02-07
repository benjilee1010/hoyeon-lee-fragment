/**
 * Optional local server: serves the site and writes edit-mode changes to HTML files.
 * Run: node save-server.js
 * Then open http://localhost:3000 and use Edit mode. Click "Done editing" to save to files.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = path.join(__dirname);

function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function esc(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyEditsToHtml(html, edits, page) {
  const glob = edits.global || {};
  const cp = edits.contactPage || {};

  // Nav and footer (shared)
  html = html.replace(/(<a[^>]+id="navLogo"[^>]*>)[^<]*(<\/a>)/, `$1${esc(glob.navLogo)}$2`);
  html = html.replace(/(<a[^>]+id="navLinkArtworks"[^>]*>)[^<]*(<\/a>)/, `$1${esc(glob.navLinkArtworks)}$2`);
  html = html.replace(/(<a[^>]+id="navLinkPhotography"[^>]*>)[^<]*(<\/a>)/, `$1${esc(glob.navLinkPhotography)}$2`);
  html = html.replace(/(<a[^>]+id="navLinkContact"[^>]*>)[^<]*(<\/a>)/, `$1${esc(glob.navLinkContact)}$2`);
  html = html.replace(/(<p id="footerText"[^>]*>)[^<]*(<\/p>)/, `$1${esc(glob.footerText)}$2`);

  if (page === 'contact' && cp) {
    html = html.replace(/(<span[^>]+id="contactLabel"[^>]*>)[^<]*(<\/span>)/, `$1${esc(cp.label)}$2`);
    const emailEsc = esc(cp.email);
    html = html.replace(/(<a[^>]+id="contactEmail"[^>]+href=")mailto:[^"]*("[^>]*>)[^<]*(<\/a>)/, `$1mailto:${emailEsc}$2${emailEsc}$3`);
    html = html.replace(/(<div[^>]+id="contactBox"[^>]*>)[\s\S]*?(<\/div>)/, (m, open, close) => open + esc(cp.box) + close);
  }

  if (page === 'index' && edits) {
    // Build map of img src -> title from edits (skip special keys)
    const specialKeys = ['global', 'contactPage', 'artworksOrder', 'photographyOrder', 'galleryHeader', 'photographyHeader'];
    const titlesBySrc = {};
    for (const key of Object.keys(edits)) {
      if (!specialKeys.includes(key) && edits[key] && edits[key].title != null) {
        titlesBySrc[key] = edits[key].title;
      }
    }
    // Replace each article: update img alt and h3 text for matching src
    html = html.replace(/<article class="artwork">\s*<div class="artwork-frame">\s*<img src="(artworks\/[^"]+)"[^>]*>\s*<\/div>\s*<h3[^>]*>([^<]*)<\/h3>\s*<\/article>/g, (match, src, oldTitle) => {
      const title = titlesBySrc[src];
      if (title === undefined) return match;
      const altAttr = title ? ` alt="${esc(title)}"` : ' alt=""';
      const hiddenClass = title === 'Unnamed' ? ' artwork-title--hidden' : '';
      return `<article class="artwork">
        <div class="artwork-frame">
          <img src="${src}"${altAttr}>
        </div>
        <h3 class="artwork-title${hiddenClass}">${esc(title)}</h3>
      </article>`;
    });

    // Gallery order: reorder articles by artworksOrder
    const order = edits.artworksOrder;
    if (Array.isArray(order) && order.length) {
      const sectionMatch = html.match(/<section class="gallery" id="artworksGallery">([\s\S]*?)<\/section>/);
      if (sectionMatch) {
        const sectionContent = sectionMatch[1];
        const articles = sectionContent.match(/<article class="artwork">[\s\S]*?<\/article>/g) || [];
        const bySrc = {};
        articles.forEach((art) => {
          const m = art.match(/src="(artworks\/[^"]+)"/);
          if (m) bySrc[m[1]] = art;
        });
        const ordered = order.filter((src) => bySrc[src]).map((src) => bySrc[src]);
        Object.keys(bySrc).filter((src) => !order.includes(src)).forEach((src) => ordered.push(bySrc[src]));
        const newContent = ordered.join('\n      ');
        html = html.replace(/(<section class="gallery" id="artworksGallery">)[\s\S]*?(<\/section>)/, `$1\n      ${newContent}\n    $2`);
      }
    }
  }

  if (page === 'photography' && edits.photographyOrder && Array.isArray(edits.photographyOrder) && edits.photographyOrder.length) {
    const sectionMatch = html.match(/<section class="gallery[^"]*" id="photographyGallery">([\s\S]*?)<\/section>/);
    if (sectionMatch) {
      const sectionContent = sectionMatch[1];
      const articles = sectionContent.match(/<article class="artwork">[\s\S]*?<\/article>/g) || [];
      const bySrc = {};
      articles.forEach((art) => {
        const m = art.match(/src="(photography\/[^"]+)"/);
        if (m) bySrc[m[1]] = art;
      });
      const order = edits.photographyOrder;
      const ordered = order.filter((src) => bySrc[src]).map((src) => bySrc[src]);
      Object.keys(bySrc).filter((src) => !order.includes(src)).forEach((src) => ordered.push(bySrc[src]));
      const newContent = ordered.join('\n      ');
      html = html.replace(/(<section class="gallery[^"]*" id="photographyGallery">)[\s\S]*?(<\/section>)/, `$1\n      ${newContent}\n    $2`);
    }
  }

  return html;
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/save') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const edits = JSON.parse(body);
        const indexPath = path.join(ROOT, 'index.html');
        const contactPath = path.join(ROOT, 'contact.html');
        const photographyPath = path.join(ROOT, 'photography.html');

        const indexHtml = fs.readFileSync(indexPath, 'utf8');
        const contactHtml = fs.readFileSync(contactPath, 'utf8');
        const photoHtml = fs.readFileSync(photographyPath, 'utf8');

        fs.writeFileSync(indexPath, applyEditsToHtml(indexHtml, edits, 'index'), 'utf8');
        fs.writeFileSync(contactPath, applyEditsToHtml(contactHtml, edits, 'contact'), 'utf8');
        fs.writeFileSync(photographyPath, applyEditsToHtml(photoHtml, edits, 'photography'), 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: String(err.message) }));
      }
    });
    return;
  }

  if (req.method === 'OPTIONS' && req.url === '/api/save') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  let url = req.url === '/' ? '/index.html' : req.url;
  url = url.split('?')[0];
  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  serveFile(filePath, res);
});

server.listen(PORT, () => {
  console.log(`Art site with save-to-files: http://localhost:${PORT}`);
  console.log('Use Edit mode, then "Done editing" to write changes to HTML files.');
});
