const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./server/rooms');

const PORT = process.env.PORT || 3000;

// ── MIME types ──────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ── Static file server ──────────────────────────────────────────────────────
const PUBLIC = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  const filePath = path.join(PUBLIC, url);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── WebSocket server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    roomManager.handleMessage(ws, msg);
  });

  ws.on('close', () => {
    roomManager.handleDisconnect(ws);
  });
});

// ── Cleanup stale rooms every 5 minutes ─────────────────────────────────────
setInterval(() => roomManager.cleanup(), 5 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Game Arena running at http://localhost:${PORT}`);
});
