import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export function createStaticHandler(rootDir: string) {
  const root = path.resolve(rootDir);
  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let filePath = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (url.pathname === '/' || !path.extname(filePath)) {
      filePath = path.join(root, 'index.html');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      const ext = path.extname(filePath);
      const immutable = url.pathname.startsWith('/assets/');
      res.writeHead(200, {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(data);
    });
  };
}
