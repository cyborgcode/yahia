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

/** One frame every this many ms while showing off a newly picked colour. */
const SPIN_MS = 90;

export interface Boot {
  /** Swap the status line for a live PLAY button. */
  ready(onPlay: (kit: KitChoice) => void): void;
  kit(): KitChoice;
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

export function createBoot(): Boot {
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

  return {
    kit: () => KIT_COMBOS[combo]!,
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
          onPlay(KIT_COMBOS[combo]!);
        }, 220);
      });
      foot.append(play);
    },
  };
}
