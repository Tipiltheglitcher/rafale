// Entrées clavier/souris avec verrouillage du pointeur et touches réassignables.
// Les touches sont lues par position physique (event.code) : ZQSD sur AZERTY fonctionne sans réglage.
export class Input {
  constructor(canvas, profile) {
    this.canvas = canvas; this.profile = profile;
    this.down = new Set(); this.edge = new Set(); this.mb = [false, false, false]; this.mbEdge = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0; this.locked = false; this.enabled = false;
    this.onUnlock = null; this.onKey = null; this.layout = null;
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then((m) => {
      this.layout = m;
      // AZERTY : la touche marquée « M » est à la place du « ; » QWERTY
      const k = profile.settings.keys;
      if (k.map === 'KeyM' && m.get('Semicolon') === 'm') { k.map = 'Semicolon'; profile.save(); }
    }).catch(() => {});
    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'); };
    addEventListener('keydown', (e) => {
      if (this.onKey && this.onKey(e)) return;
      if (typing() || !this.enabled) return;
      if (!e.repeat) { this.down.add(e.code); this.edge.add(e.code); }
      if (e.code === 'Tab' || e.code === 'Space' || (this.locked && e.code !== 'Escape' && e.code !== 'F11' && e.code !== 'F12')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.mb = [false, false, false]; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    addEventListener('mousedown', (e) => { if (this.locked && e.button < 3) { this.mb[e.button] = true; this.mbEdge[e.button] = true; } });
    addEventListener('mouseup', (e) => { if (e.button < 3) this.mb[e.button] = false; });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mb = [false, false, false]; this.down.clear(); }
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch { this.canvas.requestPointerLock(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  key(a) { return this.profile.settings.keys[a]; }
  is(a) { return this.down.has(this.key(a)); }
  hit(a) { return this.edge.has(this.key(a)); }

  mouse() { const r = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return r; }
  endFrame() { this.edge.clear(); this.mbEdge = [false, false, false]; this.wheel = 0; }

  label(code) {
    if (!code) return '—';
    if (this.layout && this.layout.get(code)) return this.layout.get(code).toUpperCase();
    const map = { Space: 'Espace', ShiftLeft: 'Maj G', ShiftRight: 'Maj D', ControlLeft: 'Ctrl G', ControlRight: 'Ctrl D', AltLeft: 'Alt', Tab: 'Tab', Enter: 'Entrée', Backspace: 'Retour', CapsLock: 'Verr. Maj' };
    if (map[code]) return map[code];
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Pavé ');
  }
}
