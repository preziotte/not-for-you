// Serves site/public locally the way CloudFront serves it in production.
//
// Every internal link on the site is extensionless (/youtube, /privacy), which
// only resolves because site/url-rewrite.js maps those to .html at the edge. A
// plain static server 404s on all of them, so this reimplements the same two
// rules: trailing slashes redirect to the bare path, and a last segment with
// no dot is a page rather than an asset and gets .html appended.
//
//   node scripts/serve-site.mjs [port] [dir]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8080);
const root = resolve(process.argv[3] ?? join(repo, 'site', 'public'));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

createServer(async (req, res) => {
  let uri = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (uri !== '/' && uri.endsWith('/')) {
    res.writeHead(301, { location: uri.slice(0, -1) });
    console.log(`301 ${uri}`);
    return res.end();
  }

  if (uri !== '/' && !uri.split('/').pop().includes('.')) uri += '.html';
  if (uri === '/') uri = '/index.html';

  const path = join(root, normalize(uri));
  if (!path.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const info = await stat(path);
    if (info.isDirectory()) throw new Error('directory');
    res.writeHead(200, {
      'content-type': types[extname(path)] || 'application/octet-stream',
      // The point of running this is to see an edit, so never let the browser
      // hold on to a previous copy.
      'cache-control': 'no-store',
    });
    res.end(await readFile(path));
    console.log(`200 ${uri}`);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    console.log(`404 ${uri}`);
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
