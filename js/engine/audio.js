// Sons entièrement synthétisés (Web Audio) : aucun fichier audio à télécharger.
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.8; this.listener = { x: 0, y: 0, z: 0, yaw: 0 }; this.last = {}; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }

  /** Nœud de sortie spatialisé : volume selon la distance, panoramique selon l'angle. */
  _out(x, z, ref = 18, y) {
    const c = this.ctx, g = c.createGain(), L = this.listener;
    if (x === undefined) { g.connect(this.master); return { node: g, gain: 1, far: 0 }; }
    const dx = x - L.x, dz = z - L.z, dy = (y ?? L.y) - L.y, d = Math.hypot(dx, dy, dz);
    const gain = 1 / (1 + d / ref);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 18000 / (1 + d / 25));
    if (p) {
      const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw); // vecteur « droite » de l'auditeur
      p.pan.value = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d)) : 0;
      g.connect(lp).connect(p).connect(this.master);
    } else g.connect(lp).connect(this.master);
    return { node: g, gain, far: d };
  }

  _noise(out, t, dur, type, freq, q, vol, attack = 0.002) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  _tone(out, t, dur, type, f0, f1, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  _ok(key, gap) {
    if (!this.ctx) return false;
    const n = this.ctx.currentTime;
    if (this.last[key] && n - this.last[key] < gap) return false;
    this.last[key] = n;
    return true;
  }

  shot(cls, x, y, z, own) {
    if (!this.ctx) return;
    const o = own ? this._out() : this._out(x, z, 30, y), t = this.ctx.currentTime, v = (own ? 0.55 : 0.9) * o.gain;
    if (v < 0.01) return;
    const P = {
      pistol: [2600, 0.09, 160, 0.12], smg: [3200, 0.07, 140, 0.08], ar: [2200, 0.12, 110, 0.14], shotgun: [1300, 0.26, 70, 0.28],
      dmr: [1700, 0.2, 90, 0.2], sniper: [1100, 0.45, 55, 0.4], lmg: [1900, 0.13, 95, 0.15], launcher: [600, 0.35, 60, 0.3], energy: [4200, 0.12, 300, 0.12],
    }[cls] || [2200, 0.12, 110, 0.14];
    if (cls === 'energy') { this._tone(o.node, t, P[1] * 1.5, 'sawtooth', 1800, 180, v * 0.35); this._tone(o.node, t, P[1], 'square', 900, 90, v * 0.2); }
    this._noise(o.node, t, P[1], 'bandpass', P[0], 0.8, v * 0.9);
    this._noise(o.node, t, P[3], 'lowpass', P[0] * 0.5, 0.7, v * 0.6);
    this._tone(o.node, t, P[3], 'sine', P[2] * 2, P[2] * 0.5, v * 0.8);
    if (o.far > 60) this._noise(o.node, t + 0.03, 0.5, 'lowpass', 500, 0.5, v * 0.35, 0.05);
  }

  boom(x, y, z) {
    if (!this.ctx) return;
    const o = this._out(x, z, 40, y), t = this.ctx.currentTime, v = o.gain * 1.3;
    this._noise(o.node, t, 1.2, 'lowpass', 900, 0.6, v);
    this._tone(o.node, t, 0.8, 'sine', 110, 28, v);
    this._noise(o.node, t + 0.05, 1.6, 'lowpass', 300, 0.5, v * 0.6, 0.1);
  }

  hit(head) { if (!this._ok('hit', 0.03)) return; const o = this._out(), t = this.ctx.currentTime; this._tone(o.node, t, 0.06, 'square', head ? 1900 : 1300, head ? 2400 : 900, head ? 0.18 : 0.12); }
  kill() { if (!this.ctx) return; const o = this._out(), t = this.ctx.currentTime; this._tone(o.node, t, 0.12, 'triangle', 880, 880, 0.25); this._tone(o.node, t + 0.09, 0.2, 'triangle', 1320, 1320, 0.25); }
  hurt() { if (!this._ok('hurt', 0.12)) return; const o = this._out(), t = this.ctx.currentTime; this._noise(o.node, t, 0.18, 'lowpass', 500, 1, 0.5); this._tone(o.node, t, 0.15, 'sine', 160, 60, 0.4); }
  shieldHit() { if (!this._ok('sh', 0.06)) return; const o = this._out(), t = this.ctx.currentTime; this._tone(o.node, t, 0.12, 'sine', 2600, 1200, 0.12); }
  empty() { if (!this._ok('empty', 0.15)) return; const o = this._out(), t = this.ctx.currentTime; this._noise(o.node, t, 0.03, 'highpass', 3000, 1, 0.3); }
  reload(step) { if (!this.ctx) return; const o = this._out(), t = this.ctx.currentTime; this._noise(o.node, t, 0.05, 'bandpass', step ? 1600 : 900, 2, 0.35); this._tone(o.node, t, 0.04, 'square', step ? 300 : 200, 120, 0.08); }
  pickup() { if (!this.ctx) return; const o = this._out(), t = this.ctx.currentTime; this._tone(o.node, t, 0.08, 'triangle', 660, 990, 0.18); this._noise(o.node, t, 0.06, 'bandpass', 2400, 3, 0.15); }
  heal() { if (!this.ctx) return; const o = this._out(), t = this.ctx.currentTime; [523, 659, 784].forEach((f, i) => this._tone(o.node, t + i * 0.07, 0.18, 'sine', f, f, 0.15)); }
  step(x, y, z, own, soft) {
    if (!this.ctx) return;
    const o = own ? this._out() : this._out(x, z, 8, y), t = this.ctx.currentTime, v = (own ? 0.08 : 0.25) * o.gain * (soft ? 0.45 : 1);
    if (v > 0.006) this._noise(o.node, t, 0.07, 'lowpass', 700 + Math.random() * 300, 1, v);
  }
  land() { if (!this.ctx) return; const o = this._out(), t = this.ctx.currentTime; this._noise(o.node, t, 0.12, 'lowpass', 400, 1, 0.25); }
  warn() { if (!this._ok('warn', 0.8)) return; const o = this._out(), t = this.ctx.currentTime; this._tone(o.node, t, 0.15, 'square', 440, 440, 0.07); }
  click() { if (!this.ctx) return; const o = this._out(), t = this.ctx.currentTime; this._tone(o.node, t, 0.04, 'triangle', 1200, 900, 0.08); }
  whoosh() { if (!this.ctx) return; const o = this._out(), t = this.ctx.currentTime; this._noise(o.node, t, 0.6, 'bandpass', 800, 0.5, 0.15, 0.2); }
  zone() { if (!this.ctx) return; const o = this._out(), t = this.ctx.currentTime; this._tone(o.node, t, 0.5, 'sine', 330, 330, 0.12); this._tone(o.node, t + 0.25, 0.6, 'sine', 247, 247, 0.12); }
}
