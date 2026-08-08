/**
 * The room rules, and what survives the host disappearing under them.
 *
 * `multitest` drives three real browsers, which is the right way to check the
 * flow — but it runs in seconds, and the failure this file exists for needs the
 * room to sit quiet long enough to be evicted from memory. On Cloudflare that
 * takes about ten seconds of silence and happens constantly; in a test it never
 * happens at all. So this simulates it directly: snapshot a room, throw it away,
 * rebuild it from nothing but the sockets and storage, and check the race is
 * still the same race.
 *
 *   npm run roomtest
 */
import { Room, FINISHERS_TO_END } from '../apps/server/room.mjs';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** A room plus the mailbox each player sees, so broadcasts can be asserted. */
function makeRoom(restoreFrom) {
  const inbox = new Map();
  const room = new Room((id, msg) => {
    if (!inbox.has(id)) inbox.set(id, []);
    inbox.get(id).push(msg);
  });
  if (restoreFrom !== undefined) room.restore(restoreFrom.saved, restoreFrom.players);
  return { room, inbox, last: (id, t) => [...(inbox.get(id) ?? [])].reverse().find((m) => m.t === t) };
}

/**
 * Exactly what the Durable Object does when it wakes with an empty heap: the
 * per-player fields come back off the sockets, the rest out of storage.
 */
function hibernate(room) {
  const saved = JSON.parse(JSON.stringify(room.snapshot()));
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    kit: p.kit,
    ready: p.ready,
    finished: p.finished,
    place: p.place,
  }));
  return { saved, players };
}

// --- a race, interrupted -----------------------------------------------------
const a = makeRoom();
for (const id of ['p1', 'p2', 'p3', 'p4']) a.room.join(id);
a.room.onMessage('p1', { t: 'iam', name: 'ALFA', kit: 5 });
for (const id of ['p1', 'p2', 'p3', 'p4']) a.room.onMessage(id, { t: 'ready', ready: true });

check('everyone ready starts the race', a.room.phase === 'racing', a.room.phase);
a.room.onMessage('p1', { t: 'finish' });

// The lights go out here.
const woken = makeRoom(hibernate(a.room));

check(
  'a woken room is still racing',
  woken.room.phase === 'racing' && woken.room.seed === a.room.seed,
  `phase=${woken.room.phase} seed=${woken.room.seed}`,
);
check('a woken room still knows everyone', woken.room.players.size === 4, `${woken.room.players.size} of 4`);
check(
  'names and kits survive',
  woken.room.players.get('p1').name === 'ALFA' && woken.room.players.get('p1').kit === 5,
  `${woken.room.players.get('p1').name}/${woken.room.players.get('p1').kit}`,
);
check(
  'a finish already banked is not forgotten',
  woken.room.finishOrder.length === 1 && woken.room.players.get('p1').place === 1,
  `${woken.room.finishOrder.length} finisher(s)`,
);

// The message that used to be dropped as coming from a stranger.
woken.room.onMessage('p2', { t: 'finish' });
woken.room.onMessage('p3', { t: 'finish' });
check(
  'the race still ends on the third runner home',
  woken.room.phase === 'over' && woken.room.finishOrder.length === FINISHERS_TO_END,
  `phase=${woken.room.phase}, ${woken.room.finishOrder.length} home`,
);
check(
  'the finish order is intact across the gap',
  woken.room.finishOrder.map((f) => f.id).join(',') === 'p1,p2,p3',
  woken.room.finishOrder.map((f) => f.id).join(','),
);
check(
  'the fourth player is told it is over',
  woken.last('p4', 'over') !== undefined,
  woken.last('p4', 'over') ? 'received' : 'never told',
);

// --- a lobby that sat quiet --------------------------------------------------
const b = makeRoom();
b.room.join('q1');
b.room.join('q2');
b.room.onMessage('q1', { t: 'ready', ready: true });
const dozed = makeRoom(hibernate(b.room));
check('a ready press survives an idle lobby', dozed.room.players.get('q1').ready === true);
dozed.room.onMessage('q2', { t: 'ready', ready: true });
check(
  'the last ready still starts the race after a doze',
  dozed.room.phase === 'racing',
  dozed.room.phase,
);

// --- ghosts are not worth persisting ----------------------------------------
const c = makeRoom();
c.room.join('g1');
c.room.onMessage('g1', { t: 'ready', ready: true });
c.room.onMessage('g1', { t: 'pos', x: 4000, y: 200, s: 'slide' });
const revived = makeRoom(hibernate(c.room));
check(
  'positions are dropped, not restored stale',
  revived.room.players.get('g1').x === 0,
  `x=${revived.room.players.get('g1').x}`,
);

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
