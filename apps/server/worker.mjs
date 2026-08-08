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
 *   npm run deploy:rooms
 *
 * Two things here exist only because of hibernation, and neither shows up on
 * the Node dev server — see `restore` and `schedule` below.
 */
import { Room, RACING, TICK_MS } from './room.mjs';

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

/** What a hibernating room keeps about itself, beyond its sockets. */
const SAVED = 'room';

export class RaceRoom {
  constructor(state) {
    this.state = state;
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
    // Nothing may be served until the room knows who is in it.
    state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get(SAVED);
      const players = [];
      for (const ws of state.getWebSockets()) {
        const a = ws.deserializeAttachment();
        if (a?.id !== undefined) players.push(a);
      }
      this.room.restore(saved, players);
    });
  }

  /**
   * Hibernation keeps the sockets and throws away the heap. Without this, a
   * lobby that sat quiet for ten seconds would wake up with an empty roster and
   * every player's next message would be dropped as coming from a stranger —
   * the room would go silent while still looking connected.
   *
   * Per-player state rides on the socket itself, so it comes back with it. Only
   * the room's own phase, seed and finish order need storage.
   */
  async persist() {
    for (const ws of this.state.getWebSockets()) {
      const id = ws.deserializeAttachment()?.id;
      const p = id === undefined ? undefined : this.room.players.get(id);
      if (p === undefined) continue;
      // Positions are excluded on purpose: they change 20x a second and are
      // cosmetic, and writing them would turn every ghost packet into a write.
      ws.serializeAttachment({
        id: p.id,
        name: p.name,
        kit: p.kit,
        ready: p.ready,
        finished: p.finished,
        place: p.place,
      });
    }
    await this.state.storage.put(SAVED, this.room.snapshot());
  }

  /**
   * Ghosts tick off an alarm — but only while a race is actually running.
   *
   * An alarm every 50ms is also a billable invocation every 50ms, and it keeps
   * the object resident. Ticking through an idle lobby would burn ~1.7M of them
   * a day for a room nobody is racing in, which is how you exhaust a free plan
   * on an empty menu screen. Outside a race, every message is event-driven and
   * the room can sleep.
   */
  async schedule() {
    if (this.room.phase !== RACING) return;
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  async alarm() {
    this.room.tick();
    if (this.room.phase === RACING && this.state.getWebSockets().length > 0) {
      await this.state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Random rather than a counter: a counter lives in the heap, and the heap
    // does not survive hibernation — it would restart at 1 and hand a newcomer
    // an id somebody in the room is already using.
    const id = Math.random().toString(36).slice(2, 8);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id });
    this.room.join(id);
    await this.persist();

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
    // Positions are the only high-rate message and change nothing durable.
    if (msg?.t !== 'pos') {
      await this.persist();
      await this.schedule();
    }
  }

  async webSocketClose(ws) {
    const id = ws.deserializeAttachment()?.id;
    if (id !== undefined) {
      this.room.leave(id);
      await this.persist();
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
