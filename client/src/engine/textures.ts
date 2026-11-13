import * as THREE from 'three';

/**
 * Procedural canvas textures (mud, wet road, weathered planks, rusty zinc,
 * the village sign, palm fronds, mist). Generated once at startup so the
 * game ships without image files. Deterministic thanks to a seeded RNG.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable 2D value noise in [-1, 1] with a given lattice period. */
export function makeNoise(seed: number, period = 16) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rand() * 2 - 1;
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Fractal noise; (u, v) in [0, 1) tiles seamlessly. */
export function makeFbm(seed: number, baseFreq = 4, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, i) => makeNoise(seed + i * 101, baseFreq * 2 ** i));
  return (u: number, v: number) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const f = baseFreq * 2 ** i;
      sum += layers[i](u * f, v * f) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

export function toTexture(c: HTMLCanvasElement, color = true, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface SurfaceMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

/** Muddy ground with patches of grass and dark rain puddles. */
export function mudTextures(size: number, repeat: [number, number], wetness = 0.35, ruts = false): SurfaceMaps {
  const [c, ctx] = canvas(size, size);
  const [rc, rctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const rough = rctx.createImageData(size, size);
  const base = makeFbm(11, 4, 5);
  const grass = makeFbm(23, 3, 3);
  const puddle = makeFbm(37, 2, 3);
  const fine = makeFbm(51, 32, 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = base(u, v);
      const f = fine(u, v) * 0.5;
      let r = mix(46, 70, clamp01(n + 0.5 + f * 0.3));
      let g = mix(38, 58, clamp01(n + 0.5 + f * 0.3));
      let b = mix(28, 40, clamp01(n + 0.5));
      // grass patches
      const gr = clamp01((grass(u, v) - (ruts ? 0.25 : 0.0)) * 3);
      r = mix(r, 34, gr * 0.8);
      g = mix(g, 52, gr * 0.8);
      b = mix(b, 28, gr * 0.8);
      // tyre ruts along v
      let rut = 0;
      if (ruts) {
        const d1 = Math.abs(u - 0.3);
        const d2 = Math.abs(u - 0.7);
        rut = clamp01(1 - Math.min(d1, d2) / 0.07);
        r *= 1 - rut * 0.35;
        g *= 1 - rut * 0.35;
        b *= 1 - rut * 0.3;
      }
      // puddles: dark, slightly blue, very smooth
      const p = clamp01((-puddle(u, v) - (0.42 - wetness * 0.4) + rut * 0.25) * 6);
      r = mix(r, 18, p);
      g = mix(g, 21, p);
      b = mix(b, 26, p);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
      const ro = mix(235 - wetness * 60, 26, p) - rut * 40;
      rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = ro;
      rough.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rough, 0, 0);
  return { map: toTexture(c, true, repeat), roughnessMap: toTexture(rc, false, repeat) };
}

/** Old vertical wooden planks with grime, mould and nail heads. */
export function plankTexture(seed = 5, tint: [number, number, number] = [74, 58, 42]): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size, size);
  const rand = mulberry32(seed);
  const grime = makeFbm(seed + 7, 3, 4);
  const plankW = 42;
  for (let x = 0; x < size; x += plankW) {
    const k = 0.7 + rand() * 0.45;
    ctx.fillStyle = `rgb(${tint[0] * k | 0},${tint[1] * k | 0},${tint[2] * k | 0})`;
    ctx.fillRect(x, 0, plankW, size);
    // grain
    for (let i = 0; i < 22; i++) {
      ctx.strokeStyle = `rgba(20,14,10,${0.08 + rand() * 0.12})`;
      ctx.lineWidth = 1 + rand();
      ctx.beginPath();
      const gx = x + rand() * plankW;
      ctx.moveTo(gx, 0);
      for (let y = 0; y <= size; y += 32) ctx.lineTo(gx + Math.sin(y * 0.02 + i) * 2, y);
      ctx.stroke();
    }
    // gap between planks
    ctx.fillStyle = 'rgba(8,6,5,0.85)';
    ctx.fillRect(x, 0, 3, size);
    // nails
    ctx.fillStyle = 'rgba(40,30,24,0.9)';
    for (const ny of [40, 260, 470]) {
      ctx.beginPath();
      ctx.arc(x + plankW / 2, ny + rand() * 8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // grime, damp and mould
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const damp = clamp01((y / size - 0.55) * 2.2); // dirtier towards the bottom
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = grime(x / size, y / size);
      const dark = clamp01(0.25 + n * 0.6 + damp * 0.5);
      img.data[i] *= 1 - dark * 0.55;
      img.data[i + 1] *= 1 - dark * 0.45;
      img.data[i + 2] *= 1 - dark * 0.5;
      const mould = clamp01((n - 0.2) * 4) * damp;
      img.data[i + 1] += mould * 14;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, true, [1, 1]);
}

/** Corrugated zinc roof with rust streaks. */
export function zincTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  const rust = makeFbm(77, 3, 4);
  const streak = makeNoise(91, 64);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ridge = 0.75 + 0.25 * Math.sin((x / w) * Math.PI * 2 * 10);
      const rr = clamp01((rust(x / w, y / h) + 0.15) * 2.2 + clamp01(streak(x / 4, 0) * 2) * (y / h) * 0.8);
      img.data[i] = mix(92, 96, rr) * ridge;
      img.data[i + 1] = mix(96, 52, rr) * ridge;
      img.data[i + 2] = mix(100, 30, rr) * ridge;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, true, [3, 1]);
}

/** Weathered welcome sign: "SELAMAT DATANG KE KAMPUNG HUJAN". */
export function signTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 448;
  const [c, ctx] = canvas(w, h);
  const wood = plankTexture(19, [70, 56, 40]).image as HTMLCanvasElement;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(wood, -h / 2, -w / 2, h, w); // horizontal planks
  ctx.restore();
  ctx.fillStyle = 'rgba(205,196,174,0.92)';
  ctx.textAlign = 'center';
  ctx.font = '600 44px Georgia, "Times New Roman", serif';
  ctx.fillText('SELAMAT DATANG KE', w / 2, 112);
  ctx.font = '700 118px Georgia, "Times New Roman", serif';
  ctx.fillText('KAMPUNG HUJAN', w / 2, 248);
  ctx.font = '500 34px Georgia, serif';
  ctx.fillText('MUKIM SUNGAI SENYAP', w / 2, 318);
  // someone wrote something under it, long ago
  ctx.save();
  ctx.translate(w * 0.69, 392);
  ctx.rotate(-0.05);
  ctx.fillStyle = 'rgba(120,22,18,0.55)';
  ctx.font = 'italic 40px "Comic Sans MS", "Segoe Print", cursive';
  ctx.fillText('cari kami', 0, 0);
  ctx.restore();
  // chipped paint & dirt
  const rand = mulberry32(3);
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(${40 + rand() * 25},${32 + rand() * 18},${24 + rand() * 12},${0.35 + rand() * 0.5})`;
    const s = 1 + rand() * 6;
    ctx.fillRect(rand() * w, rand() * h, s, s * (0.4 + rand()));
  }
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0.25)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(10,14,8,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return toTexture(c, true);
}

/** Palm / banana frond with transparent background (use alphaTest). */
export function frondTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  const rand = mulberry32(8);
  ctx.strokeStyle = '#2b3a22';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.lineTo(w / 2, 0);
  ctx.stroke();
  for (let y = 16; y < h - 8; y += 9) {
    const len = (w / 2 - 4) * Math.sin((y / h) * Math.PI) * (0.75 + rand() * 0.25);
    for (const side of [-1, 1]) {
      const shade = 30 + rand() * 20;
      ctx.strokeStyle = `rgb(${shade * 0.8 | 0},${shade * 1.35 | 0},${shade * 0.7 | 0})`;
      ctx.lineWidth = 3 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w / 2 + side * len * 0.5, y + 6, w / 2 + side * len, y + 18 + rand() * 10);
      ctx.stroke();
    }
  }
  return toTexture(c, true);
}

/** Soft radial blob used for mist banks and light glows. */
export function softBlobTexture(seed = 4, noisy = true): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const n = makeFbm(seed, 3, 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5;
      const dy = y / size - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const fall = clamp01(1 - d) ** 2;
      const a = noisy ? fall * clamp01(0.55 + n(x / size, y / size) * 0.9) : fall;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, true);
}
