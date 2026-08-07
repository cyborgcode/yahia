import { T, TUNER_RANGES, type Tuning } from '../game/tuning';

/**
 * Live tuning sliders.
 *
 * The prototype exists to find numbers, and numbers are found by dragging them
 * while playing — not by editing a file and reloading. Ships behind a toggle.
 */
export function createTuner(onReset: () => void): { toggle: () => void } {
  const panel = document.createElement('div');
  panel.id = 'tuner';
  panel.hidden = true;

  const title = document.createElement('h2');
  title.textContent = 'TUNING';
  panel.append(title);

  const entries = Object.entries(TUNER_RANGES) as [keyof Tuning, [number, number]][];
  for (const [key, [lo, hi]] of entries) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = key;
    const value = document.createElement('b');

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(lo);
    slider.max = String(hi);
    slider.step = String((hi - lo) / 200);
    slider.value = String(T[key]);

    const render = () => {
      value.textContent = Number(slider.value).toFixed(hi - lo <= 5 ? 2 : 0);
    };
    slider.addEventListener('input', () => {
      T[key] = Number(slider.value);
      render();
    });
    render();

    row.append(name, value, slider);
    panel.append(row);
  }

  const restart = document.createElement('button');
  restart.textContent = 'NEW TRACK';
  restart.addEventListener('click', onReset);
  panel.append(restart);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'tuner-toggle';
  toggleBtn.textContent = '⚙';
  toggleBtn.title = 'Tuning (T)';

  const toggle = () => {
    panel.hidden = !panel.hidden;
  };
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  document.body.append(panel, toggleBtn);
  return { toggle };
}
