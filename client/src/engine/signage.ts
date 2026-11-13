import * as THREE from 'three';
import { canvas, makeFbm, mulberry32, plankTexture, toTexture } from './textures';

/**
 * Painted signs, posters and stained walls for Kampung Hujan. All drawn on
 * canvases so the build needs no image files.
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function grime(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, amount = 1) {
  const rand = mulberry32(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 900 * amount; i++) {
    ctx.fillStyle = `rgba(${30 + rand() * 30},${26 + rand() * 20},${18 + rand() * 12},${0.2 + rand() * 0.5})`;
    const s = 1 + rand() * 5;
    ctx.fillRect(rand() * w, rand() * h, s, s * (0.4 + rand()));
  }
  // rain streaks running down
  for (let i = 0; i < 70 * amount; i++) {
    const x = rand() * w;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(20,16,10,0)');
    g.addColorStop(0.3 + rand() * 0.4, `rgba(20,16,10,${0.15 + rand() * 0.25})`);
    g.addColorStop(1, 'rgba(20,16,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, rand() * h * 0.3, 1 + rand() * 3, h);
  }
  ctx.restore();
}

/** Stained, mouldy painted plaster (old shop walls, bus stop). */
export function plasterTexture(seed = 3, base: [number, number, number] = [150, 146, 128]): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const n = makeFbm(seed, 3, 5);
  const fine = makeFbm(seed + 9, 24, 2);
  for (let y = 0; y < size; y++) {
    const damp = clamp01((y / size - 0.5) * 2); // rising damp from the floor
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = n(x / size, y / size);
      const f = fine(x / size, y / size) * 0.15;
      const dirt = clamp01(0.35 + v * 0.7 + damp * 0.6 + f);
      const mould = clamp01((v - 0.15) * 3) * damp;
      img.data[i] = base[0] * (1 - dirt * 0.6) - mould * 30;
      img.data[i + 1] = base[1] * (1 - dirt * 0.55) - mould * 12;
      img.data[i + 2] = base[2] * (1 - dirt * 0.6) - mould * 34;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // a painted band along the bottom (typical kedai colour)
  ctx.fillStyle = 'rgba(58,78,70,0.55)';
  ctx.fillRect(0, size * 0.78, size, size * 0.22);
  grime(ctx, size, size, seed + 1, 0.8);
  return toTexture(c, true, [2, 1]);
}

/** Rough cast concrete (pillars, slabs). */
export function concreteTexture(seed = 12): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const n = makeFbm(seed, 4, 5);
  const rand = mulberry32(seed);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    const v = 92 + n(x / size, y / size) * 40 + (rand() - 0.5) * 18;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v * 0.98;
    img.data[i * 4 + 2] = v * 0.92;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grime(ctx, size, size, seed + 3, 0.4);
  return toTexture(c, true, [1, 1]);
}

/** Old floor tiles (shop interior). */
export function tileTexture(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size, size);
  const rand = mulberry32(61);
  const t = 64;
  for (let y = 0; y < size; y += t) {
    for (let x = 0; x < size; x += t) {
      const k = 0.75 + rand() * 0.2;
      const red = (x / t + y / t) % 2 === 0;
      ctx.fillStyle = red ? `rgb(${108 * k | 0},${56 * k | 0},${44 * k | 0})` : `rgb(${150 * k | 0},${140 * k | 0},${118 * k | 0})`;
      ctx.fillRect(x, y, t, t);
      if (rand() < 0.18) {
        ctx.strokeStyle = 'rgba(20,14,10,0.7)';
        ctx.beginPath();
        ctx.moveTo(x + rand() * t, y);
        ctx.lineTo(x + rand() * t, y + t);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = 'rgba(30,26,20,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += t) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  grime(ctx, size, size, 64, 1.4);
  return toTexture(c, true, [3, 3]);
}

function boardBase(w: number, h: number, seed: number, tint: [number, number, number]): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const [c, ctx] = canvas(w, h);
  const wood = plankTexture(seed, tint).image as HTMLCanvasElement;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(wood, -h / 2, -w / 2, h, w);
  ctx.restore();
  return [c, ctx];
}

/** "KEDAI RUNCIT PAK LEMAN" – faded hand-painted shop board. */
export function shopSignTexture(variant: 'kedai' | 'warung' = 'kedai'): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const warung = variant === 'warung';
  const [c, ctx] = boardBase(w, h, warung ? 31 : 27, warung ? [86, 52, 40] : [60, 74, 66]);
  ctx.fillStyle = 'rgba(214,200,160,0.85)';
  ctx.textAlign = 'center';
  ctx.font = '700 92px Georgia, "Times New Roman", serif';
  ctx.fillText(warung ? 'WARUNG' : 'KEDAI RUNCIT', w / 2, 112);
  ctx.font = '600 64px Georgia, serif';
  ctx.fillStyle = 'rgba(170,52,40,0.8)';
  ctx.fillText(warung ? 'MAK JAH' : 'PAK LEMAN', w / 2, 196);
  ctx.font = '400 26px Georgia, serif';
  ctx.fillStyle = 'rgba(214,200,160,0.6)';
  ctx.fillText(warung ? 'NASI LEMAK · KOPI O · ROTI CANAI' : 'BARANG RUNCIT · ROKOK · AIS', w / 2, 236);
  grime(ctx, w, h, 5, 1.2);
  return toTexture(c);
}

/** Gate beam: "KAMPUNG HUJAN" with a missing letter. */
export function gateSignTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 160;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#2b2f2c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(206,196,170,0.9)';
  ctx.textAlign = 'center';
  ctx.font = '700 96px Georgia, "Times New Roman", serif';
  // one letter has fallen off long ago
  const text = 'KAMPUNG HUJAN';
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  let x = w / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  [...text].forEach((ch, i) => {
    if (i === 9) {
      ctx.save();
      ctx.globalAlpha = 0.18; // ghost of the "U"
      ctx.fillText(ch, x + widths[i] / 2, 118);
      ctx.restore();
    } else {
      ctx.fillText(ch, x + widths[i] / 2, 118);
    }
    x += widths[i];
  });
  grime(ctx, w, h, 9, 1.5);
  return toTexture(c);
}

/** "JALAN DITUTUP" road-closed board. */
export function roadClosedTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 160;
  const [c, ctx] = canvas(w, h);
  for (let i = -4; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#8a2a22' : '#b7ab8f';
    ctx.beginPath();
    ctx.moveTo(i * 48, 0);
    ctx.lineTo(i * 48 + 48, 0);
    ctx.lineTo(i * 48 + 48 + 60, h);
    ctx.lineTo(i * 48 + 60, h);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,18,16,0.85)';
  ctx.fillRect(40, 40, w - 80, h - 80);
  ctx.fillStyle = 'rgba(220,206,170,0.92)';
  ctx.textAlign = 'center';
  ctx.font = '700 54px Georgia, serif';
  ctx.fillText('JALAN DITUTUP', w / 2, h / 2 + 19);
  grime(ctx, w, h, 13, 1.3);
  return toTexture(c);
}

/**
 * The missing-children poster pasted all over the village in 1998.
 * Faces are left as dark silhouettes – rain washed the photos away.
 */
export function missingPosterTexture(seed = 1): THREE.CanvasTexture {
  const w = 384;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#c9c0a6';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7a1c16';
  ctx.textAlign = 'center';
  ctx.font = '700 66px Georgia, serif';
  ctx.fillText('HILANG', w / 2, 74);
  ctx.fillStyle = '#26221c';
  ctx.font = '600 20px Georgia, serif';
  ctx.fillText('MISSING · 13 OGOS 1998', w / 2, 104);
  const names = ['ALYA', 'DANISH', 'MIRA', 'ADAM', 'SOFIA'];
  const cols = [w * 0.2, w * 0.5, w * 0.8, w * 0.35, w * 0.65];
  const rows = [190, 190, 190, 330, 330];
  names.forEach((name, i) => {
    const x = cols[i];
    const y = rows[i];
    ctx.fillStyle = '#9d957f';
    ctx.fillRect(x - 46, y - 62, 92, 104);
    ctx.fillStyle = '#1d1a16';
    ctx.beginPath();
    ctx.arc(x, y - 22, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 32, 34, 30, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#26221c';
    ctx.font = '700 17px Georgia, serif';
    ctx.fillText(name, x, y + 62);
  });
  ctx.font = '500 16px Georgia, serif';
  ctx.fillStyle = '#3a342b';
  ctx.fillText('Sesiapa yang melihat mereka,', w / 2, 438);
  ctx.fillText('sila hubungi Ketua Kampung.', w / 2, 460);
  // water damage, tears and mould
  const rand = mulberry32(seed + 40);
  const n = makeFbm(seed + 3, 3, 4);
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = n(x / w, y / h);
      const stain = clamp01((v + 0.1) * 1.8) * (0.35 + (y / h) * 0.5);
      img.data[i] *= 1 - stain * 0.45;
      img.data[i + 1] *= 1 - stain * 0.5;
      img.data[i + 2] *= 1 - stain * 0.6;
      // torn corner: transparent
      if (x + (h - y) < 70 + rand() * 6) img.data[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  grime(ctx, w, h, seed + 2, 0.6);
  return toTexture(c);
}

/** Calendar on the shop wall, stuck on August 1998. */
export function calendarTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 360;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#d4cbb2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5b6a4c';
  ctx.fillRect(0, 0, w, 120);
  ctx.fillStyle = '#e6dcc0';
  ctx.textAlign = 'center';
  ctx.font = '700 34px Georgia, serif';
  ctx.fillText('OGOS', w / 2, 62);
  ctx.font = '600 26px Georgia, serif';
  ctx.fillText('1998', w / 2, 98);
  ctx.fillStyle = '#2a261f';
  ctx.font = '500 17px Georgia, serif';
  let d = 1;
  for (let r = 0; r < 5; r++) {
    for (let col = 0; col < 7; col++) {
      if ((r === 0 && col < 5) || d > 31) continue;
      const x = 22 + col * 35;
      const y = 152 + r * 40;
      ctx.fillText(String(d), x + 8, y + 8);
      if (d === 13) {
        ctx.strokeStyle = '#8b1f17';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + 8, y + 2, 15, 0, Math.PI * 2);
        ctx.stroke();
      }
      d++;
    }
  }
  grime(ctx, w, h, 77, 0.9);
  return toTexture(c);
}

/** Faded bus-stop board. */
export function busSignTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#2c3d55';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8d0b8';
  ctx.textAlign = 'center';
  ctx.font = '700 84px Georgia, serif';
  ctx.fillText('BAS', w / 2, h / 2 + 10);
  ctx.font = '600 22px Georgia, serif';
  ctx.fillText('HENTIAN', w / 2, h / 2 + 50);
  grime(ctx, w, h, 33, 1.6);
  return toTexture(c);
}

/** "SEKOLAH KEBANGSAAN SUNGAI SENYAP" signboard. */
export function schoolSignTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 448;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#23402f';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(214,200,160,0.7)';
  ctx.lineWidth = 8;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.fillStyle = 'rgba(222,210,170,0.9)';
  ctx.textAlign = 'center';
  ctx.font = '600 52px Georgia, serif';
  ctx.fillText('SEKOLAH KEBANGSAAN', w / 2, 140);
  ctx.font = '700 92px Georgia, serif';
  ctx.fillText('SUNGAI SENYAP', w / 2, 256);
  ctx.font = '400 32px Georgia, serif';
  ctx.fillText('BERILMU · BERBAKTI', w / 2, 330);
  ctx.font = '400 26px Georgia, serif';
  ctx.fillText('DITUBUHKAN 1961', w / 2, 380);
  grime(ctx, w, h, 41, 1.6);
  return toTexture(c);
}

/** Warning board at the forest edge. */
export function warningSignTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 448;
  const [c, ctx] = boardBase(w, h, 53, [58, 46, 36]);
  ctx.fillStyle = 'rgba(160,36,28,0.9)';
  ctx.textAlign = 'center';
  ctx.font = '700 96px Georgia, serif';
  ctx.fillText('AMARAN', w / 2, 140);
  ctx.fillStyle = 'rgba(214,200,160,0.85)';
  ctx.font = '600 58px Georgia, serif';
  ctx.fillText('HUTAN LARANGAN', w / 2, 240);
  ctx.font = '400 40px Georgia, serif';
  ctx.fillText('JANGAN MASUK SELEPAS MAGHRIB', w / 2, 320);
  ctx.save();
  ctx.translate(w * 0.28, 400);
  ctx.rotate(0.04);
  ctx.fillStyle = 'rgba(30,24,18,0.75)';
  ctx.font = 'italic 34px "Comic Sans MS", "Segoe Print", cursive';
  ctx.fillText('dia nampak kita', 0, 0);
  ctx.restore();
  grime(ctx, w, h, 57, 1.5);
  return toTexture(c);
}

/** Classroom blackboard with the last lesson still on it. */
export function blackboardTexture(variant: 'class2' | 'class3' | 'office'): THREE.CanvasTexture {
  const w = 1024;
  const h = 384;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#1e2a24';
  ctx.fillRect(0, 0, w, h);
  const rand = mulberry32(variant.length * 7);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(200,210,200,${0.02 + rand() * 0.05})`;
    ctx.fillRect(rand() * w, rand() * h, 60 + rand() * 200, 10 + rand() * 40);
  }
  ctx.fillStyle = 'rgba(225,228,215,0.85)';
  ctx.font = '400 40px "Segoe Print", "Comic Sans MS", cursive';
  if (variant === 'class3') {
    ctx.fillText('Khamis, 13 Ogos 1998', 40, 70);
    ctx.fillText('Karangan: "Kawan Baik Saya"', 40, 150);
    ctx.fillStyle = 'rgba(200,60,50,0.7)';
    ctx.font = '400 30px "Segoe Print", "Comic Sans MS", cursive';
    ctx.fillText('Alya - jumpa cikgu selepas rehat', 40, 240);
    ctx.fillStyle = 'rgba(225,228,215,0.35)';
    ctx.font = '400 54px "Segoe Print", "Comic Sans MS", cursive';
    ctx.fillText('KAMI DI BAWAH', w * 0.55, 330);
  } else if (variant === 'class2') {
    ctx.fillText('Rabu, 12 Ogos 1998', 40, 70);
    ctx.fillText('Matematik: 7 x 8 = 56', 40, 150);
    ctx.fillText('                9 x 6 = 54', 40, 210);
    ctx.fillText('Kerja rumah: m/s 42', 40, 300);
  } else {
    ctx.font = '400 34px "Segoe Print", "Comic Sans MS", cursive';
    ctx.fillText('JADUAL BERTUGAS - OGOS', 40, 60);
    ctx.fillText('Isnin: Cikgu Rahimah', 40, 130);
    ctx.fillText('Selasa: Cikgu Ong', 40, 185);
    ctx.fillText('Rabu: Cikgu Kamal', 40, 240);
    ctx.fillText('Khamis: ????', 40, 295);
  }
  grime(ctx, w, h, 71, 0.5);
  return toTexture(c);
}

/** Children's chalk drawings on the tunnel wall. */
export function tunnelDrawingTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(230,226,210,0.75)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  // five stick figures holding hands
  for (let i = 0; i < 5; i++) {
    const x = 70 + i * 80;
    ctx.beginPath();
    ctx.arc(x, 80, 14, 0, Math.PI * 2);
    ctx.moveTo(x, 94);
    ctx.lineTo(x, 150);
    ctx.moveTo(x, 150);
    ctx.lineTo(x - 15, 190);
    ctx.moveTo(x, 150);
    ctx.lineTo(x + 15, 190);
    ctx.moveTo(x - 40, 115);
    ctx.lineTo(x + 40, 115);
    ctx.stroke();
  }
  // a tall figure behind them, scribbled over
  ctx.strokeStyle = 'rgba(170,40,32,0.75)';
  ctx.beginPath();
  ctx.moveTo(470, 20);
  ctx.lineTo(470, 230);
  ctx.moveTo(450, 40);
  for (let i = 0; i < 12; i++) ctx.lineTo(440 + (i % 2) * 60, 40 + i * 14);
  ctx.stroke();
  const t = toTexture(c);
  return t;
}
