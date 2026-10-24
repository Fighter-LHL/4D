import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root) || !['GET','HEAD'].includes(req.method)) { res.writeHead(403).end(); return; }
    if (!(await stat(filename)).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type':mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(filename));
  } catch { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`W-Slice web: http://127.0.0.1:${port}`));
