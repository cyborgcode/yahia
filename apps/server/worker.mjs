/**
 * The room, as a Cloudflare Worker plus one Durable Object per room code.
 *
 * A Durable Object is exactly the right primitive here: `idFromName(code)` maps
 * a room code to precisely one actor, worldwide, so twelve phones that type the
 * same code reach the same object. Vercel hosts the client; it cannot host
 * this, because its WebSocket support pins connections to an instance with no
 * cross-instance broadcast and a ~5 minute duration cap.
 *
 * Deploy:
 *   npx wrangler deploy --config apps/server/wrangler.toml
 *
 * Hibernation is used deliberately — `acceptWebSocket` rather than a long-lived
 * handler — so an idle room costs nothing while people are still arriving.
 */
import { Room, TICK_MS } from './room.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('YAHIA room server', { status: 200 });
    }
    // /r/<code> — anything else lands everyone in the same default room.
    const code = (url.pathname.split('/').filter(Boolean).pop() ?? 'default')
      .toUpperCase()
      .slice(0, 8);
    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(request);
  },
};

export class RaceRoom {
  constructor(state) {
    this.state = state;
    this.nextId = 1;
    this.room = new Room((pid, msg) => {
      for (const ws of this.state.getWebSockets()) {
        if (ws.deserializeAttachment()?.id === pid) {
          try {
            ws.send(JSON.stringify(msg));
          } catch {
            /* a socket that has gone away is handled by the close event */
          }
        }
      }
    });
  }

  /** Ghost broadcast runs off an alarm, so a hibernating room wakes to tick. */
  async schedule() {
    const at = await this.state.storage.getAlarm();
    if (at === null) await this.state.storage.setAlarm(Date.now() + TICK_MS);
  }

  async alarm() {
    this.room.tick();
    if (this.state.getWebSockets().length > 0) {
      await this.state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = `p${this.nextId++}`;

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id });
    this.room.join(id);
    await this.schedule();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const id = ws.deserializeAttachment()?.id;
    if (id === undefined) return;
    let msg = null;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    this.room.onMessage(id, msg);
  }

  async webSocketClose(ws) {
    const id = ws.deserializeAttachment()?.id;
    if (id !== undefined) this.room.leave(id);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
