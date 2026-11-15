// audio.js — every sound in the game is synthesised with WebAudio: no audio files, nothing to
// load, nothing borrowed. A shot is filtered noise with a fast decay, a reload is two clicks, the
// charge beeps faster as it counts down. Sounds are short-lived nodes; the pool of reusable
// buffers (one noise buffer) is built once.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
    this.master = null;
  }

  /** Create the context on the first user gesture (the Play click), as browsers require. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** A burst of band-passed noise. freq sweeps down; the workhorse for shots and hits. */
  burst({ freq = 1800, endFreq = 300, dur = 0.12, gain = 0.5, type = 'bandpass', q = 0.8 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.2, dur + 0.05);
  }

  /** A short oscillator blip (beeps, clicks, the plant confirm). */
  blip({ freq = 880, dur = 0.07, gain = 0.25, type = 'square' } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type; osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  shot(kind) {
    if (kind === 'sniper') this.burst({ freq: 2600, endFreq: 120, dur: 0.32, gain: 0.9, q: 0.5 });
    else if (kind === 'smg') this.burst({ freq: 2100, endFreq: 400, dur: 0.09, gain: 0.42 });
    else if (kind === 'rifle') this.burst({ freq: 1900, endFreq: 260, dur: 0.14, gain: 0.6 });
    else this.burst({ freq: 1700, endFreq: 350, dur: 0.1, gain: 0.45 });
  }

  dryFire() { this.blip({ freq: 1400, dur: 0.03, gain: 0.12 }); }
  reloadStart() { this.blip({ freq: 500, dur: 0.05, gain: 0.2, type: 'triangle' }); }
  reloadEnd() { this.blip({ freq: 760, dur: 0.05, gain: 0.22, type: 'triangle' }); }
  hit() { this.blip({ freq: 1900, dur: 0.04, gain: 0.16 }); }
  headshot() { this.blip({ freq: 2500, dur: 0.06, gain: 0.22 }); }
  hurt() { this.burst({ freq: 500, endFreq: 150, dur: 0.16, gain: 0.4, type: 'lowpass' }); }
  explosion() {
    this.burst({ freq: 300, endFreq: 40, dur: 0.8, gain: 1.0, type: 'lowpass', q: 0.4 });
    this.burst({ freq: 1200, endFreq: 100, dur: 0.3, gain: 0.5 });
  }
  grenadeBounce() { this.blip({ freq: 300, dur: 0.04, gain: 0.15, type: 'triangle' }); }
  beep(fast = false) { this.blip({ freq: fast ? 1560 : 1180, dur: 0.05, gain: 0.18 }); }
  plantDone() { this.blip({ freq: 980, dur: 0.09, gain: 0.25 }); setTimeout(() => this.blip({ freq: 1470, dur: 0.12, gain: 0.25 }), 90); }
  roundWin() { this.blip({ freq: 660, dur: 0.12, gain: 0.2, type: 'triangle' }); setTimeout(() => this.blip({ freq: 990, dur: 0.18, gain: 0.2, type: 'triangle' }), 110); }
  roundLose() { this.blip({ freq: 440, dur: 0.14, gain: 0.2, type: 'triangle' }); setTimeout(() => this.blip({ freq: 294, dur: 0.2, gain: 0.2, type: 'triangle' }), 120); }
  buy() { this.blip({ freq: 1250, dur: 0.05, gain: 0.18 }); }
  denied() { this.blip({ freq: 220, dur: 0.08, gain: 0.18 }); }
}
