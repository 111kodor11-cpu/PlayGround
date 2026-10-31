// Procedural Arctic sky: aurora, stars, ice mountains, frozen lake, snow.
export class ArcticSky {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    this.w = 0; this.h = 0;
    this.t = 0;
    this.last = performance.now();
    this.stars = [];
    this.snow = [];
    this.mountains = [];
    this.shooting = null;
    this.nextShooting = 6 + Math.random() * 8;
    this.running = true;
    this._resize = this.resize.bind(this);
    this._loop = this.loop.bind(this);
    window.addEventListener('resize', this._resize);
    document.addEventListener('visibilitychange', () => {
      this.running = !document.hidden;
      if (this.running) { this.last = performance.now(); requestAnimationFrame(this._loop); }
    });
    this.resize();
    requestAnimationFrame(this._loop);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.buildStars();
    this.buildMountains();
    this.buildSnow();
  }

  buildStars() {
    const n = Math.round((this.w * this.h) / 9000);
    this.stars = Array.from({ length: Math.min(220, n) }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h * .62,
      r: Math.random() * 1.35 + .25,
      a: Math.random() * .6 + .2,
      tw: Math.random() * 6.28,
      sp: .3 + Math.random() * 1.1
    }));
  }

  buildMountains() {
    const w = this.w, h = this.h;
    const horizon = h * .655;
    const mk = (base, amp, color1, color2, seed) => {
      let s = seed;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      const pts = [];
      const step = Math.max(18, w / 60);
      for (let x = -step; x <= w + step; x += step) {
        const y = base - (Math.sin(x * .007 + seed) * .45 + Math.sin(x * .017 + seed * 2) * .3 + rnd() * .25) * amp;
        pts.push([x, y]);
      }
      return { pts, color1, color2, base };
    };
    this.mountains = [
      mk(horizon, h * .19, '#0c233c', '#061426', 3.1),
      mk(horizon + h * .035, h * .13, '#0a1c31', '#040c18', 8.7),
      mk(horizon + h * .07, h * .085, '#071523', '#020812', 15.4)
    ];
  }

  buildSnow() {
    const n = this.w < 700 ? 70 : Math.min(180, Math.round(this.w / 9));
    this.snow = Array.from({ length: n }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      r: Math.random() * 2.1 + .5,
      v: Math.random() * .5 + .18,
      drift: (Math.random() - .5) * .5,
      a: Math.random() * .55 + .15,
      ph: Math.random() * 6.28
    }));
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.draw(dt);
    requestAnimationFrame(this._loop);
  }

  draw(dt) {
    const { ctx, w, h } = this;
    const t = this.t;
    const horizon = h * .66;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#02040d');
    sky.addColorStop(.28, '#041224');
    sky.addColorStop(.52, '#06233a');
    sky.addColorStop(.66, '#0b3b4f');
    sky.addColorStop(.72, '#081b2c');
    sky.addColorStop(1, '#020711');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // stars
    for (const s of this.stars) {
      const tw = .55 + Math.sin(t * s.sp + s.tw) * .45;
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = s.r > 1.1 ? '#d9fbff' : '#bfe6ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // aurora glow
    const glow = ctx.createRadialGradient(w * .5, h * .28, 0, w * .5, h * .28, Math.max(w, h) * .62);
    glow.addColorStop(0, 'rgba(37,190,180,.13)');
    glow.addColorStop(.45, 'rgba(80,85,220,.08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.ribbon(t, h * .21, h * .075, '#2ff5cf', '#3a8dff', w * .10, .10, 0.0);
    this.ribbon(t, h * .29, h * .060, '#7a5cff', '#ff67d8', w * .075, .13, 2.1);
    this.ribbon(t, h * .17, h * .045, '#5affd7', '#8a6bff', w * .045, .08, 4.4);
    this.ribbon(t, h * .36, h * .038, '#3b7cff', '#2ff5cf', w * .06, .16, 5.8);
    ctx.restore();

    // shooting star
    this.nextShooting -= dt;
    if (!this.shooting && this.nextShooting <= 0) {
      this.shooting = { x: w * (.15 + Math.random() * .7), y: h * (.05 + Math.random() * .25), life: 1.2, max: 1.2, len: 90 + Math.random() * 100 };
      this.nextShooting = 8 + Math.random() * 12;
    }
    if (this.shooting) {
      const s = this.shooting;
      s.life -= dt;
      const p = 1 - s.life / s.max;
      const x = s.x - p * s.len * 1.6, y = s.y + p * s.len * .6;
      const g = ctx.createLinearGradient(x, y, x + s.len, y - s.len * .38);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(.75, `rgba(190,255,250,${.7 * (1 - p)})`);
      g.addColorStop(1, `rgba(255,255,255,${.9 * (1 - p)})`);
      ctx.strokeStyle = g; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s.len, y - s.len * .38); ctx.stroke();
      if (s.life <= 0) this.shooting = null;
    }

    // mountains
    for (const m of this.mountains) this.drawMountain(m);

    // frozen lake
    const ice = ctx.createLinearGradient(0, horizon + h * .07, 0, h);
    ice.addColorStop(0, 'rgba(16,58,79,.86)');
    ice.addColorStop(.35, 'rgba(8,34,55,.94)');
    ice.addColorStop(1, 'rgba(2,8,18,1)');
    ctx.fillStyle = ice; ctx.fillRect(0, horizon + h * .07, w, h);

    // aurora reflection
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .16;
    const refl = ctx.createLinearGradient(0, horizon + h * .08, 0, h);
    refl.addColorStop(0, 'rgba(47,245,207,.55)');
    refl.addColorStop(.5, 'rgba(122,92,255,.18)');
    refl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = refl; ctx.fillRect(0, horizon + h * .08, w, h);
    ctx.restore();

    // ice cracks
    ctx.save();
    ctx.globalAlpha = .13;
    ctx.strokeStyle = '#9de9ff'; ctx.lineWidth = .7;
    for (let i = 0; i < 9; i++) {
      const y = horizon + h * .10 + (i / 9) * h * .26;
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 30) {
        const yy = y + Math.sin(x * .011 + i * 2.3) * 6 + Math.sin(x * .031 + i) * 2;
        if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();

    // snow
    for (const s of this.snow) {
      s.y += (s.v + .12) * 60 * dt;
      s.x += (s.drift + Math.sin(t * .7 + s.ph) * .22) * 40 * dt;
      if (s.y > h + 5) { s.y = -5; s.x = Math.random() * w; }
      if (s.x < -5) s.x = w + 5;
      if (s.x > w + 5) s.x = -5;
      ctx.globalAlpha = s.a * (.65 + Math.sin(t * 1.3 + s.ph) * .35);
      ctx.fillStyle = '#e8fbff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // horizon mist
    const mist = ctx.createLinearGradient(0, horizon - h * .04, 0, horizon + h * .1);
    mist.addColorStop(0, 'rgba(120,235,230,0)');
    mist.addColorStop(.5, 'rgba(120,235,230,.06)');
    mist.addColorStop(1, 'rgba(120,235,230,0)');
    ctx.fillStyle = mist; ctx.fillRect(0, horizon - h * .04, w, h * .14);
  }

  ribbon(t, base, amp, c1, c2, width, speed, phase) {
    const { ctx, w, h } = this;
    const points = [];
    const step = Math.max(14, w / 90);
    for (let x = -80; x <= w + 80; x += step) {
      const y = base
        + Math.sin(x * .0032 + t * speed + phase) * amp
        + Math.sin(x * .0071 - t * speed * .7 + phase * 2) * amp * .38
        + Math.sin(x * .015 + t * .4) * amp * .12;
      points.push([x, y]);
    }
    const grad = ctx.createLinearGradient(0, base - amp * 2, 0, base + amp * 2.4);
    grad.addColorStop(0, this.hexA(c1, 0));
    grad.addColorStop(.28, this.hexA(c1, .34));
    grad.addColorStop(.62, this.hexA(c2, .22));
    grad.addColorStop(1, this.hexA(c2, 0));
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [lw, alpha] of [[width, .16], [width * .55, .14], [width * .22, .12]]) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.stroke();
    }
    // vertical curtains
    ctx.globalAlpha = .055;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < points.length; i += 3) {
      const [x, y] = points[i];
      const len = amp * (1.2 + Math.sin(i * .7 + t) * .35);
      const vg = ctx.createLinearGradient(x, y, x, y + len * 2.4);
      vg.addColorStop(0, this.hexA(c1, .6));
      vg.addColorStop(1, this.hexA(c2, 0));
      ctx.strokeStyle = vg;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t + i) * 5, y + len * 2.4); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawMountain(m) {
    const { ctx, w, h } = this;
    ctx.beginPath();
    ctx.moveTo(-30, h);
    for (const [x, y] of m.pts) ctx.lineTo(x, y);
    ctx.lineTo(w + 30, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, m.base - h * .2, 0, m.base + h * .12);
    g.addColorStop(0, m.color1);
    g.addColorStop(1, m.color2);
    ctx.fillStyle = g; ctx.fill();
    // snow caps
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = .18;
    ctx.fillStyle = '#b9f2ff';
    for (let i = 0; i < m.pts.length - 1; i++) {
      const [x, y] = m.pts[i];
      if (y < m.base - h * .05) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 13, y + 18);
        ctx.lineTo(x - 7, y + 21);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }
}
