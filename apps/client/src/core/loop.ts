/**
 * Fixed-timestep simulation with a decoupled render.
 *
 * Non-negotiable: players will be on 60Hz and 120Hz screens in the same race,
 * and a seeded track has to play identically on both.
 */
export function startLoop(
  step: (dt: number) => void,
  render: (alpha: number) => void,
  hz = 120,
): void {
  const dt = 1 / hz;
  const maxFrame = 0.25; // never spiral after a tab stall
  let accumulator = 0;
  let last = performance.now();

  const frame = (now: number) => {
    const elapsed = Math.min((now - last) / 1000, maxFrame);
    last = now;
    accumulator += elapsed;
    while (accumulator >= dt) {
      step(dt);
      accumulator -= dt;
    }
    render(accumulator / dt);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
