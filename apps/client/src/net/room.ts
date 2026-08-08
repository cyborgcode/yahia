/**
 * The client half of a race room.
 *
 * Deliberately thin. Living players are ghosts, so nothing here is authoritative
 * over your own runner and nothing is ever reconciled — your physics runs
 * locally at full speed with zero input latency, which is what makes a
 * platformer feel good. The socket only carries who is here, when to start,
 * where everyone is (cosmetic), where bodies fell (not cosmetic), and who won.
 *
 * With no server configured the whole thing is inert and the game is exactly
 * the single-player prototype it was — `enabled` is false and nothing calls out.
 */

export interface RosterPlayer {
  id: string;
  name: string;
  kit: number;
  ready: boolean;
  place: number | null;
}

export interface Finisher {
  id: string;
  name: string;
  ms: number;
  place: number;
}

export interface Ghost {
  id: string;
  x: number;
  y: number;
  state: string;
  kit: number;
  /** Joined in from the roster, not carried by the position stream. */
  name: string;
}

export type Phase = 'lobby' | 'racing' | 'over' | 'offline';

export interface RoomEvents {
  onRoster?: (players: RosterPlayer[], phase: Phase, finishers: Finisher[]) => void;
  onStart?: (seed: number) => void;
  onCorpse?: (x: number, y: number, kit: number) => void;
  onOver?: (finishers: Finisher[]) => void;
  onConnection?: (up: boolean) => void;
}

/** Positions go out at this rate. 12 players x ~12 bytes x 20Hz is ~3 KB/s. */
const POS_HZ = 20;

/**
 * Where the rooms live.
 *
 * Build-time, because it is deployment configuration rather than a runtime
 * choice — set `VITE_ROOM_URL` to the Durable Object's origin. The URL hash can
 * override it for testing against a local server without a rebuild.
 */
function serverUrl(): string | null {
  const override = new URLSearchParams(location.search).get('room');
  const configured = (import.meta.env.VITE_ROOM_URL as string | undefined) ?? '';
  const base = override ?? configured;
  return base.length > 0 ? base.replace(/\/+$/, '') : null;
}

/** Everyone who types the same code lands in the same room. */
export function roomCode(): string {
  const fromUrl = new URLSearchParams(location.search).get('r');
  if (fromUrl !== null && fromUrl.length > 0) return fromUrl.toUpperCase().slice(0, 8);
  // A fresh code, put in the URL so the address bar is the invite.
  const code = Math.random().toString(36).slice(2, 6).toUpperCase();
  const url = new URL(location.href);
  url.searchParams.set('r', code);
  history.replaceState(null, '', url);
  return code;
}

export class RoomClient {
  readonly enabled: boolean;
  readonly code: string;
  private ws: WebSocket | null = null;
  /**
   * A list, not one object. Both the lobby and the game register for `onStart`,
   * and merging the objects meant whichever registered last silently replaced
   * the other — the menu simply stopped closing when the race began.
   */
  private listeners: RoomEvents[] = [];
  private lastPos = 0;
  /** Our own id, so we can tell ourselves out of the roster and the ghosts. */
  selfId: string | null = null;
  ghosts: Ghost[] = [];
  phase: Phase = 'offline';
  /**
   * id -> name, kept from the roster.
   *
   * Names deliberately do not ride on the position packets. Those go out 20
   * times a second and a name never changes mid-race; sending it with every
   * frame would roughly triple the only message in the protocol that has a
   * rate worth caring about.
   */
  private names = new Map<string, string>();

  /** Runners already home, and how many it takes to end the race. */
  home = 0;
  ends = 3;
  /** Your own finishing place once you have one, else null. */
  myPlace: number | null = null;
  /** Who is home, in the order they got there. */
  finishers: Finisher[] = [];

  constructor() {
    const base = serverUrl();
    this.enabled = base !== null;
    this.code = this.enabled ? roomCode() : '';
    if (base !== null) this.connect(base);
  }

  on(events: RoomEvents): void {
    this.listeners.push(events);
  }

  private emit<K extends keyof RoomEvents>(
    key: K,
    call: (fn: NonNullable<RoomEvents[K]>) => void,
  ): void {
    for (const l of this.listeners) {
      const fn = l[key];
      if (fn !== undefined) call(fn as NonNullable<RoomEvents[K]>);
    }
  }

  private connect(base: string): void {
    const ws = new WebSocket(`${base}/r/${this.code}`);
    this.ws = ws;
    ws.onopen = () => this.emit('onConnection', (f) => f(true));
    ws.onclose = () => {
      this.emit('onConnection', (f) => f(false));
      this.phase = 'offline';
    };
    ws.onerror = () => this.emit('onConnection', (f) => f(false));
    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(e.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      this.handle(msg);
    };
  }

  private handle(msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 'hello':
        this.selfId = String(msg.id);
        break;
      case 'roster':
        this.phase = msg.phase as Phase;
        for (const p of msg.players as RosterPlayer[]) {
          this.names.set(p.id, p.name);
          if (p.id === this.selfId) this.myPlace = p.place;
        }
        this.finishers = (msg.finishers ?? []) as Finisher[];
        this.home = this.finishers.length;
        if (typeof msg.ends === 'number') this.ends = msg.ends;
        this.emit('onRoster', (f) =>
          f(msg.players as RosterPlayer[], this.phase, (msg.finishers ?? []) as Finisher[]),
        );
        break;
      case 'start':
        this.phase = 'racing';
        this.emit('onStart', (f) => f(Number(msg.seed) >>> 0));
        break;
      case 'ghosts':
        // Everyone but us — our own runner is drawn from local physics, and a
        // stale copy of ourselves drawn on top of it is the one ghost that
        // would actually be confusing.
        this.ghosts = (msg.g as [string, number, number, string, number][])
          .filter(([id]) => id !== this.selfId)
          .map(([id, x, y, state, kit]) => ({ id, x, y, state, kit, name: this.names.get(id) ?? '' }));
        break;
      case 'corpse':
        if (msg.id !== this.selfId) {
          this.emit('onCorpse', (f) => f(Number(msg.x), Number(msg.y), Number(msg.kit)));
        }
        break;
      case 'over':
        this.phase = 'over';
        this.emit('onOver', (f) => f(msg.finishers as Finisher[]));
        break;
      default:
        break;
    }
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  identify(name: string, kit: number): void {
    this.send({ t: 'iam', name, kit });
  }

  setReady(ready: boolean): void {
    this.send({ t: 'ready', ready });
  }

  /** Rate-limited: this is the only message that would otherwise flood. */
  position(x: number, y: number, state: string, now: number): void {
    if (now - this.lastPos < 1000 / POS_HZ) return;
    this.lastPos = now;
    this.send({ t: 'pos', x: Math.round(x), y: Math.round(y), s: state });
  }

  died(x: number, y: number): void {
    this.send({ t: 'died', x: Math.round(x), y: Math.round(y) });
  }

  finished(): void {
    this.send({ t: 'finish' });
  }

  again(): void {
    this.send({ t: 'again' });
  }
}
