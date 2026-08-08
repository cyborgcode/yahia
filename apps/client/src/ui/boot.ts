import {
  HERO_FRAMES,
  HERO_FRAME_H,
  HERO_FRAME_W,
  KITS,
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

/** One frame every this many ms while showing off a newly picked colour. */
const SPIN_MS = 90;

export interface Boot {
  /** Swap the status line for a live PLAY button. */
  ready(onPlay: (kit: KitChoice) => void): void;
  kit(): KitChoice;
}

/** The supplied art's own colours: a pale shirt over pink shorts. */
const DEFAULT_KIT: KitChoice = { shirt: 11, shorts: 10 };

function savedKit(): KitChoice {
  // Guard the null explicitly: Number(null) is 0, so a player who had never
  // picked anything was silently assigned the first kit instead of the default.
  const stored = localStorage.getItem(STORE_KEY);
  if (stored === null) return DEFAULT_KIT;
  const parts = stored.split(':').map(Number);
  const ok = (n: number | undefined): n is number =>
    n !== undefined && Number.isInteger(n) && n >= 0 && n < KITS.length;
  return ok(parts[0]) && ok(parts[1]) ? { shirt: parts[0], shorts: parts[1] } : DEFAULT_KIT;
}

export function createBoot(): Boot {
  let kit = savedKit();

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

  const foot = document.createElement('div');
  foot.id = 'boot-foot';
  const status = document.createElement('p');
  status.id = 'boot-status';
  status.textContent = 'loading';
  foot.append(status);

  root.append(title, canvas, swatches, foot);
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
    drawHero(ctx, kit, frame, 0, 0, 1);
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);

  function spin(): void {
    spinLeft = HERO_FRAMES;
    lastStep = 0;
  }

  // --- kit picker ----------------------------------------------------------
  // One row per garment. A single palette with a "which am I colouring?" toggle
  // would be fewer controls and one more thing to understand; two labelled rows
  // are the whole model on screen at once.
  function row(part: 'shirt' | 'shorts', label: string): void {
    const strip = document.createElement('div');
    strip.className = 'kit-row';
    const name = document.createElement('span');
    name.className = 'kit-label';
    name.textContent = label;

    const cells = document.createElement('div');
    cells.className = 'kit-cells';

    const buttons: HTMLButtonElement[] = KITS.map((k, i) => {
      const b = document.createElement('button');
      b.className = 'kit';
      b.style.background = k.color;
      b.title = `${label} — ${k.name}`;
      b.setAttribute('aria-label', `${label} ${k.name}`);
      b.addEventListener('click', () => {
        if (kit[part] === i) return;
        kit = { ...kit, [part]: i };
        localStorage.setItem(STORE_KEY, `${kit.shirt}:${kit.shorts}`);
        // Bake before the turn starts so the first frame is already the new kit.
        heroSheet(kit);
        buttons.forEach((other, j) => other.classList.toggle('on', j === kit[part]));
        spin();
      });
      cells.append(b);
      return b;
    });
    buttons[kit[part]]?.classList.add('on');

    strip.append(name, cells);
    swatches.append(strip);
  }
  row('shirt', 'SHIRT');
  row('shorts', 'SHORTS');

  return {
    kit: () => kit,
    ready(onPlay) {
      status.remove();
      const play = document.createElement('button');
      play.id = 'play';
      play.textContent = 'PLAY';
      play.addEventListener('click', () => {
        root.classList.add('gone');
        // Let the fade finish before handing over, so the first frame of the
        // race is not drawn underneath a dissolving menu.
        setTimeout(() => {
          root.remove();
          onPlay(kit);
        }, 220);
      });
      foot.append(play);
    },
  };
}
