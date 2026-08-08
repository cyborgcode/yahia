import type { Finisher, Phase, RoomClient, RosterPlayer } from '../net/room';
import {
  HERO_FRAMES,
  HERO_FRAME_H,
  HERO_FRAME_W,
  KITS,
  KIT_COMBOS,
  type KitChoice,
  drawHero,
  heroSheet,
} from '../render/hero';

/**
 * The loading screen and the title screen — the same screen, twice.
 *
 * They share a layout because they are the same moment to a player: the hero
 * appears, and when he can be recoloured he can also be played. Swapping the
 * status line for a PLAY button is the whole transition, so nothing jumps.
 *
 * Laid out for a phone held upright, which means the one thing you have to tap
 * lives at the bottom, inside thumb reach, and the thing you look at is above
 * it. That is the same rule the HUD follows and the opposite of desktop habit.
 */

const STORE_KEY = 'yahia.kit';
const NAME_KEY = 'yahia.name';

/** One frame every this many ms while showing off a newly picked colour. */
const SPIN_MS = 90;

export interface Boot {
  /** Swap the status line for a live PLAY (solo) or READY (room) button. */
  ready(onPlay: (kit: KitChoice) => void): void;
  kit(): KitChoice;
  /** The same outfit as an index, which is what the wire and the tags use. */
  kitIndex(): number;
  name(): string;
  /** Bring the menu back between races, for the leaderboard and the rematch. */
  reopen(finishers: Finisher[]): void;
}

/** Index into KIT_COMBOS. Zero is the supplied art's own cream over pink. */
const DEFAULT_COMBO = 0;

function savedCombo(): number {
  // Guard the null explicitly: Number(null) is 0, which happens to be the
  // default here but was silently picking the first kit when it wasn't.
  const stored = localStorage.getItem(STORE_KEY);
  if (stored === null) return DEFAULT_COMBO;
  const n = Number(stored);
  return Number.isInteger(n) && n >= 0 && n < KIT_COMBOS.length ? n : DEFAULT_COMBO;
}

export function createBoot(room: RoomClient | null): Boot {
  let combo = savedCombo();

  const root = document.createElement('div');
  root.id = 'boot';

  const title = document.createElement('h1');
  title.innerHTML = 'YAHIA<small>يحيى</small>';

  const canvas = document.createElement('canvas');
  canvas.id = 'hero';
  canvas.width = HERO_FRAME_W;
  canvas.height = HERO_FRAME_H;
  const ctx = canvas.getContext('2d')!;

  const swatches = document.createElement('div');
  swatches.id = 'kits';

  // Who you are. Only asked for when there is somebody to be it in front of.
  const nameInput = document.createElement('input');
  nameInput.id = 'name';
  nameInput.type = 'text';
  nameInput.maxLength = 12;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.placeholder = 'YOUR NAME';
  nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
  nameInput.hidden = room === null || !room.enabled;

  const roster = document.createElement('div');
  roster.id = 'roster';
  roster.hidden = nameInput.hidden;

  const foot = document.createElement('div');
  foot.id = 'boot-foot';
  const status = document.createElement('p');
  status.id = 'boot-status';
  status.textContent = 'loading';
  foot.append(status);

  root.append(title, canvas, nameInput, swatches, roster, foot);
  document.body.append(root);

  // --- the turn ------------------------------------------------------------
  // Front pose at rest. A character that spins forever is motion for its own
  // sake; one that turns when you change his colour is showing you the change.
  let frame = 0;
  let spinLeft = 0;
  let lastStep = 0;

  function paint(now: number): void {
    if (spinLeft > 0 && now - lastStep >= SPIN_MS) {
      lastStep = now;
      frame = (frame + 1) % HERO_FRAMES;
      spinLeft -= 1;
      if (spinLeft === 0) frame = 0;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawHero(ctx, KIT_COMBOS[combo]!, frame, 0, 0, 1);
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);

  function spin(): void {
    spinLeft = HERO_FRAMES;
    lastStep = 0;
  }

  // --- kit picker ----------------------------------------------------------
  // One tap, one outfit. Each swatch is split — shirt colour above the diagonal,
  // shorts below — so the chip is a small picture of the thing it selects rather
  // than a label for it.
  const buttons: HTMLButtonElement[] = KIT_COMBOS.map((c, i) => {
    const shirt = KITS[c.shirt]!;
    const shorts = KITS[c.shorts]!;
    const b = document.createElement('button');
    b.className = 'kit';
    b.style.background =
      `linear-gradient(155deg, ${shirt.color} 0 48%, ${shorts.color} 48% 100%)`;
    b.title = `${shirt.name} over ${shorts.name}`;
    b.setAttribute('aria-label', `${shirt.name} shirt, ${shorts.name} shorts`);
    b.addEventListener('click', () => {
      if (i === combo) return;
      combo = i;
      localStorage.setItem(STORE_KEY, String(i));
      // Bake before the turn starts so the first frame is already the new kit.
      heroSheet(KIT_COMBOS[combo]!);
      buttons.forEach((other, j) => other.classList.toggle('on', j === combo));
      spin();
    });
    swatches.append(b);
    return b;
  });
  buttons[combo]?.classList.add('on');

  // --- identity -------------------------------------------------------------
  const myName = (): string => nameInput.value.trim() || 'RUNNER';
  function pushIdentity(): void {
    localStorage.setItem(NAME_KEY, nameInput.value.trim());
    room?.identify(myName(), combo);
  }
  nameInput.addEventListener('input', pushIdentity);
  buttons.forEach((b) => b.addEventListener('click', pushIdentity));

  // --- the lobby ------------------------------------------------------------
  // The roster is the whole reason to sit here: it is how you know the friend
  // you sent the link to has actually arrived.
  function drawRoster(players: RosterPlayer[], phase: Phase, finishers: Finisher[]): void {
    roster.replaceChildren();
    if (phase === 'over' && finishers.length > 0) {
      const head = document.createElement('p');
      head.className = 'roster-head';
      head.textContent = 'FINISHED';
      roster.append(head);
      for (const f of finishers) {
        const line = document.createElement('p');
        line.className = 'roster-line done';
        line.textContent = `${f.place}. ${f.name}  ${(f.ms / 1000).toFixed(2)}s`;
        roster.append(line);
      }
      return;
    }
    const head = document.createElement('p');
    head.className = 'roster-head';
    const waiting = players.filter((p) => !p.ready).length;
    head.textContent =
      players.length <= 1
        ? `ROOM ${room?.code ?? ''} — SHARE THE LINK`
        : waiting === 0
          ? 'ALL READY'
          : `WAITING FOR ${waiting}`;
    roster.append(head);
    for (const p of players) {
      const line = document.createElement('p');
      line.className = `roster-line${p.ready ? ' on' : ''}`;
      const kit = KIT_COMBOS[p.kit] ?? KIT_COMBOS[0]!;
      const chip = document.createElement('span');
      chip.className = 'roster-chip';
      chip.style.background =
        `linear-gradient(155deg, ${KITS[kit.shirt]!.color} 0 48%, ${KITS[kit.shorts]!.color} 48% 100%)`;
      line.append(chip, document.createTextNode(p.name + (p.ready ? '  READY' : '')));
      roster.append(line);
    }
  }

  let button: HTMLButtonElement | null = null;
  let iAmReady = false;

  room?.on({
    onRoster: (players, phase, finishers) => {
      drawRoster(players, phase, finishers);
      if (button !== null && phase === 'lobby') {
        button.textContent = iAmReady ? 'WAITING…' : 'READY';
        button.classList.toggle('waiting', iAmReady);
      }
    },
    onConnection: (up) => {
      if (!up) drawRoster([], 'lobby', []);
    },
  });

  function show(): void {
    root.classList.remove('gone');
    if (!root.isConnected) document.body.append(root);
  }

  function hide(then: () => void): void {
    root.classList.add('gone');
    // Let the fade finish before handing over, so the first frame of the race
    // is not drawn underneath a dissolving menu.
    setTimeout(() => {
      root.remove();
      then();
    }, 220);
  }

  return {
    kit: () => KIT_COMBOS[combo]!,
    kitIndex: () => combo,
    name: myName,

    ready(onPlay) {
      status.remove();
      const b = document.createElement('button');
      button = b;
      b.id = 'play';

      if (room !== null && room.enabled) {
        // In a room you do not start the race, the room does. The button is a
        // statement about you, and the race begins when it is true of everyone.
        b.textContent = 'READY';
        pushIdentity();
        b.addEventListener('click', () => {
          // Asking for a rematch is what clears the last race's result, not
          // arriving at the screen that shows it — reopening used to reset the
          // room immediately and wipe the finish order it had just drawn.
          if (room.phase === 'over') room.again();
          iAmReady = !iAmReady;
          room.setReady(iAmReady);
          b.textContent = iAmReady ? 'WAITING…' : 'READY';
          b.classList.toggle('waiting', iAmReady);
        });
        room.on({
          onStart: () => {
            iAmReady = false;
            hide(() => onPlay(KIT_COMBOS[combo]!));
          },
        });
      } else {
        b.textContent = 'PLAY';
        b.addEventListener('click', () => hide(() => onPlay(KIT_COMBOS[combo]!)));
      }
      foot.append(b);
    },

    reopen(finishers) {
      show();
      iAmReady = false;
      if (button !== null) {
        button.textContent = room?.enabled === true ? 'READY' : 'PLAY';
        button.classList.remove('waiting');
      }
      drawRoster([], room?.enabled === true ? 'over' : 'lobby', finishers);
    },
  };
}
