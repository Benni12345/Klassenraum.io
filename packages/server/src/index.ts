import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { Db } from './db.js';
import { Room } from './game.js';
import { Net } from './net.js';
import { createStaticHandler } from './static.js';

const HERE =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const staticDir = CONFIG.staticDir || path.resolve(HERE, '../../client/dist');

const db = new Db(CONFIG.dbPath);
const serveStatic = createStaticHandler(staticDir);

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, online: room.players.size }));
    return;
  }
  serveStatic(req, res);
});

const net = new Net(server);
const room = new Room(db, net);
net.attachRoom(room);

const tickTimer = setInterval(() => room.tick(), CONFIG.tickMs);
const flushTimer = setInterval(() => room.flush(), CONFIG.flushMs);

server.listen(CONFIG.port, () => {
  console.log(`Klassenraum.io server on :${CONFIG.port} (static: ${staticDir})`);
});

function shutdown(): void {
  console.log('shutting down, saving players...');
  clearInterval(tickTimer);
  clearInterval(flushTimer);
  room.shutdown();
  db.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
