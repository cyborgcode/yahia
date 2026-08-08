/**
 * A YAHIA race room, as a state machine with no transport in it.
 *
 * Plain JS with no imports so the same file runs unchanged inside a Cloudflare
 * Durable Object and inside the Node dev server — the room is the part worth
 * testing, and it should not need a platform to be tested on.
 *
 * The server referees exactly three things, which is all the design ever asked
 * of it: who is in the room, when the race starts, and who finished. Everything
 * else — physics, the track itself, collision — each client does locally from
 * the seed. Living players are ghosts, so a rival's position being 120ms stale
 * changes nothing about your run and never has to be reconciled.
 */

export const LOBBY = 'lobby';
export const RACING = 'racing';
export const OVER = 'over';

/** The race ends once this many people are home, not when the last one is. */
export const FINISHERS_TO_END = 3;

/** Ghost positions in, ghost positions out, at this rate. */
export const TICK_MS = 50;

const MAX_PLAYERS = 16;
const NAME_MAX = 12;

/** Names arrive from strangers on the internet. */
export function cleanName(raw) {
  // Control characters only. An earlier version of this line was a character
  // RANGE from space to hyphen, which quietly deleted digits and punctuation
  // out of everyone's name.
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, NAME_MAX);
  return s.length > 0 ? s : 'RUNNER';
}

export class Room {
  /** @param {(id: string, msg: object) => void} send @param {() => void} [onEmpty] */
  constructor(send, onEmpty) {
    this.send = send;
    this.onEmpty = onEmpty;
    /** @type {Map<string, {id:string,name:string,kit:number,ready:boolean,x:number,y:number,state:string,finished:number|null,place:number|null}>} */
    this.players = new Map();
    this.phase = LOBBY;
    this.seed = 0;
    this.startedAt = 0;
    this.finishOrder = [];
  }

  broadcast(msg) {
    for (const id of this.players.keys()) this.send(id, msg);
  }

  roster() {
    return {
      t: 'roster',
      phase: this.phase,
      seed: this.seed,
      finishers: this.finishOrder.map((f) => ({ id: f.id, name: f.name, ms: f.ms, place: f.place })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        kit: p.kit,
        ready: p.ready,
        place: p.place,
      })),
    };
  }

  join(id) {
    if (this.players.size >= MAX_PLAYERS) {
      this.send(id, { t: 'full' });
      return false;
    }
    this.players.set(id, {
      id,
      name: 'RUNNER',
      kit: 0,
      ready: false,
      x: 0,
      y: 0,
      state: 'run',
      finished: null,
      place: null,
    });
    this.send(id, { t: 'hello', id });
    this.broadcast(this.roster());
    return true;
  }

  leave(id) {
    if (!this.players.delete(id)) return;
    // A player who drops mid-race just stops being a ghost. The design already
    // says a disconnection is expressed as a death, and the client that owns
    // that runner is the one that decides it — the room does not invent one.
    if (this.players.size === 0) {
      this.reset();
      this.onEmpty?.();
      return;
    }
    this.maybeStart();
    this.broadcast(this.roster());
  }

  reset() {
    this.phase = LOBBY;
    this.seed = 0;
    this.startedAt = 0;
    this.finishOrder = [];
    for (const p of this.players.values()) {
      p.ready = false;
      p.finished = null;
      p.place = null;
    }
  }

  /** Everyone ready, and more than nobody. */
  maybeStart() {
    if (this.phase !== LOBBY) return;
    const all = [...this.players.values()];
    if (all.length === 0 || !all.every((p) => p.ready)) return;

    this.phase = RACING;
    // The track is 4 bytes. Every client rebuilds it identically from the seed,
    // which is why no map data is ever sent.
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.startedAt = Date.now();
    this.finishOrder = [];
    this.broadcast({ t: 'start', seed: this.seed, at: this.startedAt });
    this.broadcast(this.roster());
  }

  onMessage(id, msg) {
    const p = this.players.get(id);
    if (p === undefined || msg === null || typeof msg !== 'object') return;

    switch (msg.t) {
      case 'iam':
        p.name = cleanName(msg.name);
        p.kit = Number.isInteger(msg.kit) ? msg.kit : 0;
        this.broadcast(this.roster());
        break;

      case 'ready':
        if (this.phase !== LOBBY) break;
        p.ready = msg.ready !== false;
        this.broadcast(this.roster());
        this.maybeStart();
        break;

      case 'pos':
        // Cosmetic, and the only high-rate message. Clamped to numbers so a
        // hostile client cannot poison another client's renderer.
        p.x = Number(msg.x) || 0;
        p.y = Number(msg.y) || 0;
        p.state = typeof msg.s === 'string' ? msg.s.slice(0, 6) : 'run';
        break;

      case 'died':
        // Corpses are the one thing that must arrive, in order, for everyone:
        // they are solid ground to every other player.
        this.broadcast({
          t: 'corpse',
          id,
          x: Number(msg.x) || 0,
          y: Number(msg.y) || 0,
          kit: p.kit,
        });
        break;

      case 'finish':
        this.finish(id);
        break;

      case 'again':
        // Anyone can send the room back to the lobby once it is over.
        if (this.phase === OVER) {
          this.reset();
          this.broadcast(this.roster());
        }
        break;

      default:
        break;
    }
  }

  finish(id) {
    const p = this.players.get(id);
    if (p === undefined || this.phase !== RACING || p.finished !== null) return;

    p.finished = Date.now() - this.startedAt;
    p.place = this.finishOrder.length + 1;
    this.finishOrder.push({ id, name: p.name, ms: p.finished, place: p.place });
    this.broadcast(this.roster());

    // The race ends on the third runner home rather than the last, so nobody
    // spends the end of a round watching. Everyone still running is ranked by
    // distance, which the clients already know from the ghost stream.
    if (this.finishOrder.length >= FINISHERS_TO_END) {
      this.phase = OVER;
      this.broadcast({ t: 'over', finishers: this.finishOrder });
      this.broadcast(this.roster());
    }
  }

  /**
   * The room-level state worth surviving the host going away underneath it.
   *
   * A Durable Object is evicted from memory whenever it goes quiet, and comes
   * back with its sockets intact but its heap empty — so on that host this is
   * not an optional durability feature, it is the difference between a lobby
   * that works and one that silently stops answering. Positions are deliberately
   * absent: they are cosmetic and a frame stale already.
   */
  snapshot() {
    return {
      phase: this.phase,
      seed: this.seed,
      startedAt: this.startedAt,
      finishOrder: this.finishOrder,
    };
  }

  /** @param {object|undefined} saved @param {object[]} players */
  restore(saved, players) {
    if (saved !== undefined && saved !== null) {
      this.phase = saved.phase ?? LOBBY;
      this.seed = saved.seed ?? 0;
      this.startedAt = saved.startedAt ?? 0;
      this.finishOrder = saved.finishOrder ?? [];
    }
    for (const p of players) {
      this.players.set(p.id, {
        name: 'RUNNER',
        kit: 0,
        ready: false,
        x: 0,
        y: 0,
        state: 'run',
        finished: null,
        place: null,
        ...p,
      });
    }
  }

  /** Ghost positions, on a timer. One message for everyone, not one each. */
  tick() {
    if (this.phase !== RACING || this.players.size === 0) return;
    const ghosts = [];
    for (const p of this.players.values()) {
      if (p.finished !== null) continue;
      ghosts.push([p.id, Math.round(p.x), Math.round(p.y), p.state, p.kit]);
    }
    this.broadcast({ t: 'ghosts', g: ghosts });
  }
}
