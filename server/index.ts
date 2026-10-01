// Single process: serves the web client and the WebSocket game server on one port.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { TICK_MS } from '../shared/game.ts';
import {
  rooms, type Room, cleanText, createRoom, addPlayer, removePlayer, startGame, act, tickRoom, view, loadRooms, saveRooms,
} from './rooms.ts';

const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
const DIST = path.resolve('dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  let file = DIST;
  try { file = path.join(DIST, decodeURIComponent((req.url || '/').split('?')[0])); } catch { /* bad url */ }
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer();
let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void = serveStatic;
if (!PROD) {
  // Dev: Vite runs inside this same server (one command, one port).
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, ws: { server } }, appType: 'spa' });
  handler = vite.middlewares;
}
server.on('request', (req, res) => {
  if (req.url === '/health') return void res.end('ok');
  handler(req, res);
});

// --- WebSocket game protocol
interface Conn { ws: WebSocket; room?: Room; pid?: string; count: number; windowStart: number }
const roomConns = new Map<string, Set<Conn>>();
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws')) wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  else if (PROD) socket.destroy(); // in dev, Vite's HMR handles its own upgrades
});

const send = (c: Conn, msg: object) => c.ws.readyState === WebSocket.OPEN && c.ws.send(JSON.stringify(msg));

function broadcast(room: Room) {
  const set = roomConns.get(room.code);
  if (!set?.size) return;
  const data = JSON.stringify({ t: 'state', room: view(room) });
  for (const c of set) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}

function attach(c: Conn, room: Room, pid: string) {
  detach(c);
  c.room = room;
  c.pid = pid;
  if (!roomConns.has(room.code)) roomConns.set(room.code, new Set());
  roomConns.get(room.code)!.add(c);
  room.players.find((p) => p.id === pid)!.online = true;
  room.lastActive = Date.now();
  send(c, { t: 'joined', code: room.code, playerId: pid, token: room.tokens[pid] });
  broadcast(room);
}

function detach(c: Conn) {
  const room = c.room;
  if (!room) return;
  const set = roomConns.get(room.code);
  set?.delete(c);
  if (!set?.size) roomConns.delete(room.code);
  const p = room.players.find((x) => x.id === c.pid);
  if (p && ![...(set ?? [])].some((x) => x.pid === c.pid)) p.online = false; // may have another tab open
  c.room = c.pid = undefined;
  room.lastActive = Date.now();
  broadcast(room);
}

function handle(c: Conn, m: Record<string, unknown>): string | void {
  const code = cleanText(m.code, 8).toUpperCase();
  switch (m.t) {
    case 'ping': return;
    case 'create': {
      const name = cleanText(m.name, 16);
      if (!name) return 'Escribe tu nombre';
      const room = createRoom(cleanText(m.roomName, 24));
      if (typeof room === 'string') return room;
      const r = addPlayer(room, name);
      if (typeof r === 'string') return r;
      return attach(c, room, r.player.id);
    }
    case 'join': {
      const name = cleanText(m.name, 16);
      if (!name) return 'Escribe tu nombre';
      const room = rooms.get(code);
      if (!room) return 'No existe ninguna partida con ese código';
      const r = addPlayer(room, name);
      if (typeof r === 'string') return r;
      return attach(c, room, r.player.id);
    }
    case 'resume': {
      const room = rooms.get(code);
      const pid = room && typeof m.token === 'string' ? Object.keys(room.tokens).find((id) => room.tokens[id] === m.token) : undefined;
      if (!room || !pid) return void send(c, { t: 'expired' });
      return attach(c, room, pid);
    }
    case 'leave': {
      const room = c.room, pid = c.pid;
      detach(c);
      if (room && pid && room.status === 'lobby') { removePlayer(room, pid); broadcast(room); }
      return void send(c, { t: 'left' });
    }
  }
  const room = c.room;
  const p = room?.players.find((x) => x.id === c.pid);
  if (!room || !p) return 'No estás en ninguna partida';
  room.lastActive = Date.now();
  const err = m.t === 'start' ? startGame(room, p, Number(m.duration)) : act(room, p, m);
  if (err) return err;
  broadcast(room);
}

wss.on('connection', (ws) => {
  const c: Conn = { ws, count: 0, windowStart: Date.now() };
  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - c.windowStart > 1000) { c.windowStart = now; c.count = 0; }
    if (++c.count > 20) return; // basic flood protection
    let m: unknown;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const err = handle(c, m as Record<string, unknown>);
    if (err) send(c, { t: 'error', msg: err });
  });
  ws.on('close', () => detach(c));
  ws.on('error', () => ws.terminate());
});

// --- Game loop, persistence and cleanup
loadRooms();
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) if (tickRoom(room, now)) broadcast(room);
}, TICK_MS);

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const online = room.players.some((p) => p.online);
    if (!online && now - room.lastActive > 60 * 60_000) rooms.delete(room.code); // abandoned for 1h
  }
  saveRooms();
}, 10_000);

function shutdown() {
  saveRooms();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`Tycooon listo en http://localhost:${PORT} (${PROD ? 'producción' : 'desarrollo'})`));
