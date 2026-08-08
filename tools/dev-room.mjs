/**
 * The room server, for development and for the automated test.
 *
 * The real deployment target is a Cloudflare Durable Object (see
 * apps/server/worker.mjs) because Vercel cannot host these sockets — they pin
 * to an instance with no cross-instance broadcast and a ~5 minute cap, so
 * twelve players in one room could land on different instances and never see
 * each other. This runs the exact same Room class over `ws`, so the part with
 * the rules in it is the part both hosts share.
 *
 *   npm run room          # ws://127.0.0.1:8787/r/<code>
 */
import { WebSocketServer } from 'ws';
import { Room, TICK_MS } from '../apps/server/room.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port: PORT });

/** @type {Map<string, {room: Room, sockets: Map<string, import('ws').WebSocket>, timer: NodeJS.Timeout}>} */
const rooms = new Map();
let nextId = 1;

function roomFor(code) {
  let entry = rooms.get(code);
  if (entry !== undefined) return entry;

  const sockets = new Map();
  const room = new Room(
    (id, msg) => {
      const ws = sockets.get(id);
      if (ws !== undefined && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
    () => {
      clearInterval(entry.timer);
      rooms.delete(code);
    },
  );
  entry = { room, sockets, timer: setInterval(() => room.tick(), TICK_MS) };
  rooms.set(code, entry);
  return entry;
}

wss.on('connection', (ws, req) => {
  const code = (req.url ?? '/').split('/').filter(Boolean).pop() ?? 'default';
  const { room, sockets } = roomFor(code);
  const id = `p${nextId++}`;

  sockets.set(id, ws);
  if (!room.join(id)) {
    ws.close();
    sockets.delete(id);
    return;
  }

  ws.on('message', (raw) => {
    let msg = null;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return; // a client that sends nonsense is simply ignored
    }
    room.onMessage(id, msg);
  });

  ws.on('close', () => {
    sockets.delete(id);
    room.leave(id);
  });
});

console.log(`room server on ws://127.0.0.1:${PORT}/r/<code>`);
