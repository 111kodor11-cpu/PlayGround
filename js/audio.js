// Tiny procedural sound engine — no audio assets.
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambient = null;
    this.muted = localStorage.getItem('aurora-muted') === '1';
    this.started = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : .55;
      this.master.connect(this.ctx.destination);
      this.noise = this._noiseBuffer();
      this.started = true;
      this._ambient();
      return true;
    } catch { return false; }
  }

  setMuted(v) {
    this.muted = !!v;
    localStorage.setItem('aurora-muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : .55, this.ctx.currentTime, .03);
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _ambient() {
    if (!this.ctx || this.ambient) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const g = this.ctx.createGain(); g.gain.value = .012;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = .07;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = .006;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(lp).connect(hp).connect(g).connect(this.master);
    src.start(); lfo.start();
    this.ambient = { src, g };
  }

  _env(node, t0, a, d, peak = .3) {
    node.gain.cancelScheduledValues(t0);
    node.gain.setValueAtTime(.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(.0001, t0 + a + d);
  }

  tone(freq, dur = .15, type = 'sine', peak = .18, slide = 0) {
    if (!this.ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    this._env(g, t, .008, dur, peak);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + .05);
  }

  noiseBurst(dur = .2, freq = 1200, peak = .2, type = 'bandpass') {
    if (!this.ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * .25), t + dur); f.Q.value = .8;
    const g = this.ctx.createGain(); this._env(g, t, .006, dur, peak);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + .05);
  }

  click() { this.tone(760, .05, 'triangle', .07); }
  draw() { this.noiseBurst(.14, 2600, .09, 'highpass'); this.tone(520, .07, 'sine', .05, 260); }
  summon() {
    this.tone(220, .3, 'sine', .13, 180);
    setTimeout(() => this.tone(330, .32, 'triangle', .11, 120), 70);
    setTimeout(() => this.tone(495, .38, 'sine', .08, 80), 140);
    this.noiseBurst(.25, 900, .07);
  }
  set() { this.tone(180, .12, 'triangle', .09); this.noiseBurst(.1, 700, .06); }
  attack() {
    this.noiseBurst(.32, 3200, .16, 'bandpass');
    this.tone(160, .28, 'sawtooth', .09, -90);
  }
  impact() {
    this.tone(72, .4, 'sine', .34, -30);
    this.noiseBurst(.22, 600, .24, 'lowpass');
  }
  damage() { this.tone(340, .22, 'sawtooth', .1, -180); }
  heal() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, .25, 'sine', .07), i * 55)); }
  trap() { this.tone(1200, .12, 'square', .07, -400); this.noiseBurst(.2, 1800, .08); }
  turn() { this.tone(196, .45, 'sine', .12); setTimeout(() => this.tone(294, .55, 'sine', .09), 90); }
  victory() { [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, .5, 'triangle', .1), i * 120)); }
  defeat() { [330, 262, 196, 147].forEach((f, i) => setTimeout(() => this.tone(f, .5, 'sine', .09), i * 160)); }
}
