import { useEffect, useRef } from 'react';
import {
  AREAS,
  KAMPUNG_BOUNDS,
  KAMPUNG_PROPS,
  OVERGROUND_MAX_X,
  ROADS,
  UNDERGROUND_RECT,
  areaAt,
  type PropPlacement,
} from '@tmf/shared';

export interface MapState {
  self: { x: number; z: number; yaw: number };
  others: { name: string; x: number; z: number; connected: boolean }[];
}

/** Rough footprint (half extents) of each building for the map. */
const FOOTPRINT: Partial<Record<PropPlacement['kind'], [number, number, number?]>> = {
  stiltHouse: [3.65, 2.85, 0.6],
  shop: [3.6, 2.85],
  busStop: [2, 0.95],
  school: [12.2, 4.6, 1.2],
  hall: [6.3, 4.3],
  chiefHouse: [5.15, 3.65],
  stor: [1.7, 1.7],
  hut: [1.5, 1.2],
  car: [0.84, 2.1],
  chamber: [5, 5],
};

const CREAM = 'rgba(214,205,184,';

/**
 * Hand-drawn style map of the village (M). Overground by default; shows the
 * tunnel plan while you're underground.
 */
export function MapView({ getState, onClose }: { getState: () => MapState | null; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 120) return;
      last = now;
      const st = getState();
      const ctx = c.getContext('2d');
      if (!ctx || !st) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const under = areaAt(st.self.x, st.self.z).underground === true;
      const view = under
        ? { minX: 124, maxX: 160, minZ: -122, maxZ: -34 }
        : { minX: KAMPUNG_BOUNDS.minX, maxX: OVERGROUND_MAX_X, minZ: KAMPUNG_BOUNDS.minZ, maxZ: KAMPUNG_BOUNDS.maxZ };
      const pad = 18;
      const scale = Math.min((w - pad * 2) / (view.maxX - view.minX), (h - pad * 2) / (view.maxZ - view.minZ));
      const ox = (w - (view.maxX - view.minX) * scale) / 2;
      const oy = (h - (view.maxZ - view.minZ) * scale) / 2;
      // north (−z) is up
      const px = (x: number) => ox + (x - view.minX) * scale;
      const pz = (z: number) => oy + (z - view.minZ) * scale;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0f0f10';
      ctx.fillRect(0, 0, w, h);

      // area tints and labels
      ctx.font = `${Math.max(11, scale * 3.2)}px "IM Fell English SC", Georgia, serif`;
      ctx.textAlign = 'center';
      for (const a of AREAS) {
        if (!!a.underground !== under) continue;
        const r = a.rect;
        const x0 = px(Math.max(r.minX, view.minX));
        const x1 = px(Math.min(r.maxX, view.maxX));
        const z0 = pz(Math.max(r.minZ, view.minZ));
        const z1 = pz(Math.min(r.maxZ, view.maxZ));
        ctx.fillStyle = a.id === 'forest' ? 'rgba(40,58,40,0.35)' : a.id === 'forbidden' ? 'rgba(120,20,20,0.25)' : 'rgba(255,255,255,0.025)';
        ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
      }

      if (under) {
        // tunnel plan
        ctx.strokeStyle = `${CREAM}0.75)`;
        ctx.lineWidth = Math.max(3, 2.6 * scale);
        ctx.lineCap = 'round';
        for (const p of KAMPUNG_PROPS) {
          if (p.kind !== 'tunnel') continue;
          const half = (p.length ?? 4) / 2;
          const dx = Math.sin(p.yaw) * half;
          const dz = Math.cos(p.yaw) * half;
          ctx.beginPath();
          ctx.moveTo(px(p.x - dx), pz(p.z - dz));
          ctx.lineTo(px(p.x + dx), pz(p.z + dz));
          ctx.stroke();
        }
        const ch = KAMPUNG_PROPS.find((p) => p.kind === 'chamber');
        if (ch) {
          ctx.strokeRect(px(ch.x - 5), pz(ch.z - 5), 10 * scale, 10 * scale);
        }
        ctx.fillStyle = `${CREAM}0.8)`;
        ctx.fillText('TEROWONG', px(UNDERGROUND_RECT.minX + 28), pz(-30));
      } else {
        // roads
        for (const r of ROADS) {
          ctx.strokeStyle = r.kind === 'road' ? `${CREAM}0.55)` : `${CREAM}0.3)`;
          ctx.lineWidth = Math.max(1.5, r.halfWidth * 2 * scale);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.setLineDash(r.kind === 'path' ? [4, 4] : []);
          ctx.beginPath();
          r.points.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
          ctx.stroke();
        }
        ctx.setLineDash([]);
        // buildings
        for (const p of KAMPUNG_PROPS) {
          const fp = FOOTPRINT[p.kind];
          if (!fp) continue;
          const [hx, hz, oz = 0] = fp;
          ctx.save();
          ctx.translate(px(p.x), pz(p.z));
          ctx.rotate(-p.yaw);
          ctx.fillStyle = `${CREAM}0.22)`;
          ctx.strokeStyle = `${CREAM}0.6)`;
          ctx.lineWidth = 1;
          ctx.fillRect(-hx * scale, (-hz + oz) * scale, hx * 2 * scale, hz * 2 * scale);
          ctx.strokeRect(-hx * scale, (-hz + oz) * scale, hx * 2 * scale, hz * 2 * scale);
          ctx.restore();
        }
        // trees as specks
        ctx.fillStyle = 'rgba(90,110,80,0.5)';
        for (const p of KAMPUNG_PROPS) if (p.kind === 'tree') ctx.fillRect(px(p.x) - 1, pz(p.z) - 1, 2, 2);
        // area names
        ctx.fillStyle = `${CREAM}0.85)`;
        for (const a of AREAS) {
          if (a.underground) continue;
          const r = a.rect;
          const cx = (Math.max(r.minX, view.minX) + Math.min(r.maxX, OVERGROUND_MAX_X)) / 2;
          const cz = a.id === 'central' ? -64 : a.id === 'entrance' ? -2 : a.id === 'forest' ? -150 : r.minZ + 4;
          ctx.fillText(a.name.toUpperCase(), px(cx), pz(cz));
        }
      }

      // teammates
      for (const o of st.others) {
        if (!!areaAt(o.x, o.z).underground !== under) continue;
        ctx.fillStyle = o.connected ? 'rgba(127,151,116,0.95)' : 'rgba(201,58,50,0.8)';
        ctx.beginPath();
        ctx.arc(px(o.x), pz(o.z), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '11px "Special Elite", monospace';
        ctx.fillText(o.name, px(o.x), pz(o.z) - 8);
      }
      // you: an arrow pointing where you look
      const x = px(st.self.x);
      const y = pz(st.self.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-st.self.yaw);
      ctx.fillStyle = '#c93a32';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 7);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getState]);

  return (
    <div className="game-overlay map-overlay" onClick={onClose}>
      <div className="map-panel" onClick={(e) => e.stopPropagation()}>
        <div className="map-head">
          <span className="overline">Kampung Hujan · peta</span>
          <span className="map-hint">M to close</span>
        </div>
        <canvas ref={canvas} className="map-canvas" />
      </div>
    </div>
  );
}
