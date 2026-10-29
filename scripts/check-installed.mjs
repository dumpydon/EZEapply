import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// A real extension smoke test: no Chrome API shim and no bundled content script
// is served here. Any filled values must come from the installed extension.
const page = new URL('../fixtures/installed-check.html', import.meta.url);
createServer(async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/apply/installed-check') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; connect-src 'none'",
  });
  response.end(await readFile(page));
}).listen(4318, '127.0.0.1', () =>
  console.log('Installed-extension check: http://127.0.0.1:4318/apply/installed-check'),
);
