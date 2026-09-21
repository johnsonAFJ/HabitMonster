// Static file server for local development. No dependencies.
//
// Replaces `python3 -m http.server`, which needs a readable working directory
// and so cannot start under a sandboxed launcher.
//
//   node scripts/serve.mjs [port]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8438);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const wanted = decodeURIComponent(url.pathname);
  const path = join(ROOT, normalize(wanted).replace(/^(\.\.[/\\])+/, ''));

  // Never serve outside the project, whatever the request asks for.
  if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep) && path !== ROOT.slice(0, -1)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const file = wanted.endsWith('/') ? join(path, 'index.html') : path;
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      // Always revalidate, so an edit shows up on a plain reload.
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${wanted}`);
  }
}).listen(PORT, () => {
  console.log(`Habit Monster on http://localhost:${PORT}`);
});
