/**
 * Optional local server: serves the site and writes edit-mode changes to HTML files.
 * Run: node save-server.js
 * Then open http://localhost:3000 and use Edit mode. Click "Done editing" to save to files.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
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

  // Nav and footer (shared) – only replace when we have a stored value
  if (glob.navLogo != null) html = html.replace(/(<a[^>]+id="navLogo"[^>]*>)[^<]*(<\/a>)/, `$1${esc(glob.navLogo)}$2`);
  if (glob.navLinkArtworks != null) html = html.replace(/(<a[^>]+id="navLinkArtworks"[^>]*>)[^<]*(<\/a>)/, `$1${esc(glob.navLinkArtworks)}$2`);
  if (glob.navLinkPhotography != null) html = html.replace(/(<a[^>]+id="navLinkPhotography"[^>]*>)[^<]*(<\/a>)/, `$1${esc(glob.navLinkPhotography)}$2`);
  if (glob.navLinkContact != null) html = html.replace(/(<a[^>]+id="navLinkContact"[^>]*>)[^<]*(<\/a>)/, `$1${esc(glob.navLinkContact)}$2`);
  if (glob.footerText != null) html = html.replace(/(<p id="footerText"[^>]*>)[^<]*(<\/p>)/, `$1${esc(glob.footerText)}$2`);

  if (page === 'contact' && cp) {
    if (cp.label != null) html = html.replace(/(<span[^>]+id="contactLabel"[^>]*>)[^<]*(<\/span>)/, `$1${esc(cp.label)}$2`);
    if (cp.email != null) {
      const emailEsc = esc(cp.email);
      html = html.replace(/(<a[^>]+id="contactEmail"[^>]+href=")mailto:[^"]*("[^>]*>)[^<]*(<\/a>)/, `$1mailto:${emailEsc}$2${emailEsc}$3`);
    }
    if (cp.box != null) html = html.replace(/(<div[^>]+id="contactBox"[^>]*>)[\s\S]*?(<\/div>)/, (m, open, close) => open + esc(cp.box) + close);
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
    // Replace each article: update img alt, h3 title, price span, and data-sold
    const pricesBySrc = {};
    const soldBySrc = {};
    for (const key of Object.keys(edits)) {
      if (!specialKeys.includes(key) && edits[key]) {
        if (edits[key].price != null) pricesBySrc[key] = edits[key].price;
        if (edits[key].sold) soldBySrc[key] = true;
      }
    }
    html = html.replace(/<article class="artwork"([^>]*)>\s*<div class="artwork-frame">\s*<img src="(artworks\/[^"]+)"[^>]*>\s*<\/div>\s*<h3[^>]*>([^<]*)<\/h3>\s*<span class="artwork-price"[^>]*>([^<]*)<\/span>\s*<\/article>/g, (match, articleExtra, src, oldTitle, oldPrice) => {
      const title = titlesBySrc[src] !== undefined ? titlesBySrc[src] : oldTitle;
      const price = pricesBySrc[src] !== undefined ? pricesBySrc[src] : oldPrice;
      const sold = soldBySrc[src];
      const altAttr = title ? ` alt="${esc(title)}"` : ' alt=""';
      const hiddenClass = title === 'Unnamed' ? ' artwork-title--hidden' : '';
      const soldClass = String(price).trim().toUpperCase() === 'SOLD' ? ' artwork-price--sold' : '';
      const dataSold = sold ? ' data-sold="true"' : '';
      return `<article class="artwork"${dataSold}>
        <div class="artwork-frame">
          <img src="${src}"${altAttr}>
        </div>
        <h3 class="artwork-title${hiddenClass}">${esc(title)}</h3>
        <span class="artwork-price${soldClass}">${esc(price)}</span>
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
  try { url = decodeURIComponent(url); } catch (_) {}
  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  serveFile(filePath, res);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Art site with save-to-files: http://localhost:${PORT}`);
    console.log('Use Edit mode, then "Done editing" to write changes to HTML files.');
  });
}

module.exports = { applyEditsToHtml };
