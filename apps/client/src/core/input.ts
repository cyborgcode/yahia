/**
 * Two verbs, and they have to survive glass.
 *
 * Touch uses screen halves rather than gesture recognition: a swipe can't be
 * recognised until it has moved, and that delay is exactly the latency a
 * platformer can't afford. Left half slides, right half jumps, both holdable.
 */
export class Input {
  jumpHeld = false;
  slideHeld = false;

  private jumpEdge = false;
  private pointers = new Map<number, 'jump' | 'slide'>();
  private keyJump = false;
  private keySlide = false;

  attach(el: HTMLElement): void {
    el.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  /** True once per press. The jump buffer takes it from here. */
  consumeJumpPressed(): boolean {
    const pressed = this.jumpEdge;
    this.jumpEdge = false;
    return pressed;
  }

  private onPointerDown = (e: Event): void => {
    const pe = e as PointerEvent;
    pe.preventDefault();
    const target = pe.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const side = pe.clientX - rect.left < rect.width / 2 ? 'slide' : 'jump';
    this.pointers.set(pe.pointerId, side);
    this.sync();
    if (side === 'jump') this.jumpEdge = true;
  };

  private onPointerUp = (e: Event): void => {
    this.pointers.delete((e as PointerEvent).pointerId);
    this.sync();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isJumpKey(e.code)) {
      e.preventDefault();
      if (!this.keyJump) this.jumpEdge = true;
      this.keyJump = true;
    } else if (isSlideKey(e.code)) {
      e.preventDefault();
      this.keySlide = true;
    }
    this.sync();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (isJumpKey(e.code)) this.keyJump = false;
    else if (isSlideKey(e.code)) this.keySlide = false;
    this.sync();
  };

  private releaseAll = (): void => {
    this.pointers.clear();
    this.keyJump = false;
    this.keySlide = false;
    this.sync();
  };

  private sync(): void {
    const sides = [...this.pointers.values()];
    this.jumpHeld = this.keyJump || sides.includes('jump');
    this.slideHeld = this.keySlide || sides.includes('slide');
  }
}

function isJumpKey(code: string): boolean {
  return code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'KeyZ';
}

function isSlideKey(code: string): boolean {
  return (
    code === 'ArrowDown' ||
    code === 'KeyS' ||
    code === 'KeyX' ||
    code === 'ShiftLeft' ||
    code === 'ShiftRight'
  );
}
