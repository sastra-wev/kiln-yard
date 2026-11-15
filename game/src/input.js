// input.js — keyboard and mouse state for the human player. One object, written by event
// listeners and read by the simulation; the sim never touches the DOM itself. Mouse movement is
// accumulated into deltas the player controller consumes once per step, so look speed does not
// depend on the event rate.

export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firing = false;
    this.mouseDownRight = false;
    this.locked = false;
    this.pressed = new Set(); // key codes that went down since the last consumePressed()
    dom.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    dom.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.mouseDownRight = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.mouseDownRight = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'KeyB'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) this.firing = false;
    });
  }

  down(code) { return this.keys.has(code); }

  /** Read and clear the look deltas accumulated since the last call. */
  takeLook() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  /** Read and clear the set of keys pressed since the last call (edge-triggered actions). */
  consumePressed() {
    const p = this.pressed;
    this.pressed = new Set();
    return p;
  }
}
