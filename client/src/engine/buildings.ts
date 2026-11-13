import * as THREE from 'three';
import { BUS_STOP, CAR, FENCE, GATE, LOG, SHOP } from '@tmf/shared';
import type { Disposer, PropMaterials } from './props';
import { mulberry32 } from './textures';

/**
 * Larger kampung props for the playable areas. Dimensions come from the
 * shared prop specs so meshes line up with the collision boxes.
 */

export interface WorldMaterials extends PropMaterials {
  plaster: THREE.MeshStandardMaterial;
  plasterInside: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  tiles: THREE.MeshStandardMaterial;
  carPaint: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  rust: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  shopSign: THREE.MeshStandardMaterial;
  gateSign: THREE.MeshStandardMaterial;
  roadClosed: THREE.MeshStandardMaterial;
  poster: THREE.MeshStandardMaterial;
  calendar: THREE.MeshStandardMaterial;
  busSign: THREE.MeshStandardMaterial;
}

function box(d: Disposer, w: number, h: number, depth: number, mat: THREE.Material | THREE.Material[], shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(d.track(new THREE.BoxGeometry(w, h, depth)), mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

/** Box placed by its ground-centre and vertical span. */
function slabAt(d: Disposer, mat: THREE.Material, x: number, z: number, hx: number, hz: number, y0: number, y1: number, shadows = true) {
  const m = box(d, hx * 2, y1 - y0, hz * 2, mat, shadows);
  m.position.set(x, (y0 + y1) / 2, z);
  return m;
}

function decal(d: Disposer, mat: THREE.Material, w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(d.track(new THREE.PlaneGeometry(w, h)), mat);
  m.receiveShadow = true;
  return m;
}

/* ───────────────────────── Kedai runcit (enterable shop) ───────────────────────── */

export interface ShopRefs {
  group: THREE.Group;
  /** Local position of the broken fluorescent tube (for a flickering light). */
  tubePos: THREE.Vector3;
  tube: THREE.MeshStandardMaterial;
}

export function buildShop(d: Disposer, m: WorldMaterials, sign: THREE.Material = m.shopSign): ShopRefs {
  const S = SHOP;
  const g = new THREE.Group();
  const hw = S.width / 2;
  const hd = S.depth / 2;
  const t = S.wallT / 2;

  // slab + porch (kaki lima)
  g.add(slabAt(d, m.concrete, 0, S.porchDepth / 2, hw + 0.1, hd + 0.1 + S.porchDepth / 2, -0.4, S.slabTop, false));
  // tiled interior floor, just above the slab
  const floor = new THREE.Mesh(d.track(new THREE.PlaneGeometry(S.width - S.wallT * 2, S.depth - S.wallT * 2)), m.tiles);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = S.slabTop + 0.005;
  floor.receiveShadow = true;
  g.add(floor);

  // walls: outside plaster, darker inside
  const wallMats = (outside: '+x' | '-x' | '+z' | '-z') => {
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const faces = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
    return faces.map((f) => (f === outside ? m.plaster : f === '+y' || f === '-y' ? m.concrete : m.plasterInside));
  };
  const wall = (x: number, z: number, hx: number, hz: number, y0: number, y1: number, outside: '+x' | '-x' | '+z' | '-z') => {
    const w = box(d, hx * 2, y1 - y0, hz * 2, wallMats(outside));
    w.position.set(x, (y0 + y1) / 2, z);
    g.add(w);
  };
  const front = (hw - S.doorHalf) / 2;
  wall(0, -hd + t, hw, t, S.slabTop, S.wallTop, '-z');
  wall(-hw + t, 0, t, hd - S.wallT, S.slabTop, S.wallTop, '-x');
  wall(hw - t, 0, t, hd - S.wallT, S.slabTop, S.wallTop, '+x');
  wall(-(S.doorHalf + front), hd - t, front, t, S.slabTop, S.wallTop, '+z');
  wall(S.doorHalf + front, hd - t, front, t, S.slabTop, S.wallTop, '+z');
  wall(0, hd - t, S.doorHalf, t, S.doorTop, S.wallTop, '+z');

  // the door: one leaf hanging open on a broken hinge
  const leaf = box(d, S.doorHalf * 2 - 0.1, S.doorTop - S.slabTop - 0.06, 0.05, m.planksDark);
  leaf.geometry.translate(-(S.doorHalf - 0.05), 0, 0);
  leaf.position.set(S.doorHalf - 0.02, (S.slabTop + S.doorTop) / 2 - 0.02, hd + 0.03);
  leaf.rotation.set(0.0, 2.95, 0.04); // swung back against the outside wall
  g.add(leaf);

  // boarded front windows (papan)
  for (const sx of [-1, 1]) {
    const cx = sx * (S.doorHalf + front);
    const frame = box(d, 1.9, 1.3, 0.08, m.wood);
    frame.position.set(cx, 1.55, hd + 0.03);
    g.add(frame);
    const rand = mulberry32(sx > 0 ? 3 : 9);
    for (let i = 0; i < 4; i++) {
      const b = box(d, 2.1, 0.22, 0.04, m.planksDark);
      b.position.set(cx + (rand() - 0.5) * 0.1, 1.08 + i * 0.32, hd + 0.1);
      b.rotation.z = (rand() - 0.5) * 0.18;
      g.add(b);
    }
  }

  // roof: zinc sloping back, with an awning over the porch
  const roofY = S.wallTop + 0.05;
  const roof = box(d, S.width + 0.6, 0.05, S.depth + 0.6, m.zinc);
  roof.position.set(0, roofY + 0.35, 0);
  roof.rotation.x = -0.13;
  g.add(roof);
  const awning = box(d, S.width + 0.4, 0.04, S.porchDepth + 0.3, m.zinc);
  awning.position.set(0, 2.78, hd + S.porchDepth / 2 + 0.05);
  awning.rotation.x = 0.16;
  g.add(awning);
  for (const sx of [-1, 1]) {
    const post = box(d, 0.12, 2.6, 0.12, m.wood);
    post.position.set(sx * (hw - 0.1), S.slabTop + 1.3, hd + S.porchDepth - 0.1);
    g.add(post);
  }
  // shop sign above the awning
  const signBoard = new THREE.Mesh(d.track(new THREE.BoxGeometry(4.4, 1.0, 0.06)), [m.wood, m.wood, m.wood, m.wood, sign, m.wood]);
  signBoard.position.set(0, S.wallTop - 0.1, hd + 0.1);
  signBoard.rotation.z = 0.025;
  signBoard.castShadow = true;
  g.add(signBoard);

  // interior ceiling (keeps the inside properly dark)
  const ceiling = new THREE.Mesh(d.track(new THREE.PlaneGeometry(S.width, S.depth)), m.plasterInside);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = S.wallTop - 0.02;
  g.add(ceiling);

  // counter, shelves, freezer
  const c = S.counter;
  g.add(slabAt(d, m.planks, c.x, c.z, c.hx, c.hz, S.slabTop, c.top));
  const top = box(d, c.hx * 2 + 0.1, 0.05, c.hz * 2 + 0.12, m.wood);
  top.position.set(c.x, c.top + 0.02, c.z);
  g.add(top);
  const shelf = (k: { x: number; z: number; hx: number; hz: number; top: number }, alongX: boolean) => {
    const sg = new THREE.Group();
    const sideGeoW = alongX ? 0.05 : k.hx * 2;
    const sideGeoD = alongX ? k.hz * 2 : 0.05;
    for (const s of [-1, 1]) {
      const side = box(d, sideGeoW, k.top - S.slabTop, sideGeoD, m.planksDark);
      side.position.set(alongX ? s * k.hx : 0, (k.top + S.slabTop) / 2, alongX ? 0 : s * k.hz);
      sg.add(side);
    }
    const rand = mulberry32(Math.round(k.x * 10 + k.z * 7));
    for (let y = S.slabTop + 0.15; y < k.top; y += 0.45) {
      const board = box(d, k.hx * 2, 0.03, k.hz * 2, m.planksDark);
      board.position.set(0, y, 0);
      sg.add(board);
      // a few forgotten tins and boxes
      for (let i = 0; i < 4; i++) {
        if (rand() < 0.45) continue;
        const along = (rand() - 0.5) * 2 * (alongX ? k.hz : k.hx) * 0.85;
        const isTin = rand() < 0.5;
        const item = isTin
          ? new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 8)), m.rust)
          : box(d, 0.12, 0.18, 0.08, m.planks, false);
        item.position.set(alongX ? 0 : along, y + (isTin ? 0.08 : 0.1), alongX ? along : 0);
        item.rotation.y = rand() * 3;
        if (rand() < 0.15) item.rotation.z = Math.PI / 2;
        sg.add(item);
      }
    }
    sg.position.set(k.x, 0, k.z);
    g.add(sg);
  };
  shelf(S.sideShelf, true);
  shelf(S.backShelf, false);
  // the fallen shelf, lying on its back
  const fs = S.fallenShelf;
  const fallen = slabAt(d, m.planksDark, 0, 0, fs.hx, fs.hz, S.slabTop, fs.top);
  fallen.position.set(fs.x, (S.slabTop + fs.top) / 2, fs.z);
  fallen.rotation.y = fs.yaw;
  g.add(fallen);
  const fz = S.freezer;
  const freezer = slabAt(d, m.rust, fz.x, fz.z, fz.hx, fz.hz, S.slabTop, fz.top);
  g.add(freezer);

  // wall dressing: calendar (August 1998) and a missing poster inside
  const cal = decal(d, m.calendar, 0.42, 0.6);
  cal.position.set(-hw + S.wallT + 0.01, 1.75, -1.6);
  cal.rotation.y = Math.PI / 2;
  g.add(cal);
  const poster = decal(d, m.poster, 0.5, 0.67);
  poster.position.set(0.9, 1.6, -hd + S.wallT + 0.01);
  g.add(poster);
  const posterOut = decal(d, m.poster, 0.5, 0.67);
  posterOut.position.set(hw + 0.01, 1.5, 1.2);
  posterOut.rotation.set(0, Math.PI / 2, 0.06);
  g.add(posterOut);

  // the dead fluorescent tube
  const tube = d.track(new THREE.MeshStandardMaterial({ color: 0x777b70, emissive: 0xcfe8ff, emissiveIntensity: 0, roughness: 0.4 }));
  const tubeMesh = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8)), tube);
  tubeMesh.rotation.z = Math.PI / 2;
  const tubePos = new THREE.Vector3(0.4, S.wallTop - 0.12, -0.4);
  tubeMesh.position.copy(tubePos);
  g.add(tubeMesh);

  return { group: g, tubePos, tube };
}

/* ───────────────────────── Bus stop ───────────────────────── */

export function buildBusStop(d: Disposer, m: WorldMaterials): THREE.Group {
  const B = BUS_STOP;
  const g = new THREE.Group();
  g.add(slabAt(d, m.concrete, 0, 0, B.halfWidth, B.halfDepth, -0.3, B.slabTop, false));
  g.add(slabAt(d, m.plaster, 0, -B.halfDepth + 0.08, B.halfWidth, 0.06, B.slabTop, B.wallTop));
  g.add(slabAt(d, m.plaster, -B.halfWidth + 0.06, -0.35, 0.05, 0.55, B.slabTop, B.wallTop));
  // bench: planks on two legs
  for (const x of [-1.2, 1.2]) g.add(slabAt(d, m.concrete, x, B.bench.z, 0.08, B.bench.hz, B.slabTop, B.bench.top - 0.05));
  const seat = slabAt(d, m.planks, 0, B.bench.z, B.bench.hx, B.bench.hz, B.bench.top - 0.05, B.bench.top);
  seat.rotation.z = 0.02;
  g.add(seat);
  for (const x of [-B.halfWidth + 0.1, B.halfWidth - 0.1]) g.add(slabAt(d, m.metal, x, B.halfDepth - 0.1, 0.05, 0.05, B.slabTop, B.roofY));
  const roof = box(d, B.halfWidth * 2 + 0.4, 0.05, B.halfDepth * 2 + 0.6, m.zinc);
  roof.position.set(0, B.roofY + 0.05, 0.1);
  roof.rotation.x = 0.1;
  roof.rotation.z = -0.03; // one corner sags
  g.add(roof);
  // posters on the back wall
  for (const [x, rot] of [
    [-0.7, -0.05],
    [0.4, 0.04],
  ] as const) {
    const p = decal(d, m.poster, 0.5, 0.67);
    p.position.set(x, 1.45, -B.halfDepth + 0.15);
    p.rotation.z = rot;
    g.add(p);
  }
  // bus sign on a pole beside it
  const pole = slabAt(d, m.metal, B.halfWidth + 0.5, B.halfDepth, 0.04, 0.04, 0, 2.6);
  g.add(pole);
  const signDisc = new THREE.Mesh(d.track(new THREE.CircleGeometry(0.3, 24)), m.busSign);
  signDisc.position.set(B.halfWidth + 0.5, 2.45, B.halfDepth + 0.05);
  signDisc.rotation.z = 0.2;
  g.add(signDisc);
  return g;
}

/* ───────────────────────── Village gate ───────────────────────── */

export function buildGate(d: Disposer, m: WorldMaterials): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(slabAt(d, m.concrete, s * GATE.pillarX, 0, GATE.pillarHalf, GATE.pillarHalf, 0, GATE.pillarTop));
    const cap = slabAt(d, m.concrete, s * GATE.pillarX, 0, GATE.pillarHalf + 0.08, GATE.pillarHalf + 0.08, GATE.pillarTop, GATE.pillarTop + 0.18);
    g.add(cap);
  }
  const beam = new THREE.Mesh(
    d.track(new THREE.BoxGeometry(GATE.pillarX * 2 + 0.4, GATE.beamY1 - GATE.beamY0, 0.35)),
    [m.concrete, m.concrete, m.concrete, m.concrete, m.gateSign, m.gateSign],
  );
  beam.position.set(0, (GATE.beamY0 + GATE.beamY1) / 2, 0);
  beam.castShadow = true;
  g.add(beam);
  // creeping vines hanging off the beam
  const rand = mulberry32(5);
  const vineGeo = d.track(new THREE.CylinderGeometry(0.012, 0.012, 1, 3));
  for (let i = 0; i < 14; i++) {
    const vine = new THREE.Mesh(vineGeo, m.foliage);
    const len = 0.4 + rand() * 1.6;
    vine.scale.y = len;
    vine.position.set((rand() - 0.5) * GATE.pillarX * 2, GATE.beamY0 - len / 2, (rand() - 0.5) * 0.3);
    g.add(vine);
  }
  return g;
}

/* ───────────────────────── Old car ───────────────────────── */

export function buildCar(d: Disposer, m: WorldMaterials): THREE.Group {
  const g = new THREE.Group();
  const lower = box(d, CAR.hx * 2, 0.62, CAR.hz * 2, m.carPaint);
  lower.position.y = 0.55;
  g.add(lower);
  // windows on all four sides, painted roof
  const cabin = box(d, CAR.hx * 2 - 0.12, 0.52, 2.1, [m.glass, m.glass, m.carPaint, m.carPaint, m.glass, m.glass]);
  cabin.position.set(0, 1.12, -0.15);
  g.add(cabin);
  const wheelGeo = d.track(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 14));
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-1, 1]) {
    for (const z of [-1.3, 1.3]) {
      const w = new THREE.Mesh(wheelGeo, m.rubber);
      w.position.set(x * (CAR.hx - 0.05), 0.31, z);
      w.castShadow = true;
      g.add(w);
    }
  }
  // driver door left open – they ran
  const door = box(d, 0.05, 0.75, 1.0, m.carPaint);
  door.geometry.translate(0, 0, -0.5);
  door.position.set(-CAR.hx, 0.85, 0.35);
  door.rotation.y = -0.9;
  g.add(door);
  // dead headlights
  const lampGeo = d.track(new THREE.CircleGeometry(0.1, 12));
  for (const x of [-0.55, 0.55]) {
    const l = new THREE.Mesh(lampGeo, m.glass);
    l.position.set(x, 0.62, -CAR.hz - 0.005);
    l.rotation.y = Math.PI;
    g.add(l);
  }
  return g;
}

/* ───────────────────────── Fallen tree, barriers, fences, clutter ───────────────────────── */

export function buildLog(d: Disposer, m: WorldMaterials): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(d.track(new THREE.CylinderGeometry(LOG.radius * 0.85, LOG.radius, LOG.hx * 2, 12)), m.bark);
  trunk.rotation.z = Math.PI / 2;
  trunk.position.y = LOG.radius;
  trunk.castShadow = trunk.receiveShadow = true;
  g.add(trunk);
  // splintered branches and a torn root plate at one end
  const rand = mulberry32(17);
  const branchGeo = d.track(new THREE.CylinderGeometry(0.05, 0.12, 1, 6));
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(branchGeo, m.bark);
    const len = 1 + rand() * 2.2;
    b.scale.y = len;
    b.position.set((rand() - 0.3) * LOG.hx * 1.6, LOG.radius * 1.6, (rand() - 0.5) * 0.6);
    b.rotation.set((rand() - 0.5) * 1.6, rand() * 3, (rand() - 0.5) * 1.6);
    b.castShadow = true;
    g.add(b);
  }
  const roots = new THREE.Mesh(d.track(new THREE.CylinderGeometry(1.4, 1.1, 0.4, 10)), m.bark);
  roots.rotation.z = Math.PI / 2;
  roots.position.set(-LOG.hx, 0.9, 0);
  roots.castShadow = true;
  g.add(roots);
  return g;
}

export function buildBarrier(d: Disposer, m: WorldMaterials): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(d.track(new THREE.BoxGeometry(2.6, 0.5, 0.05)), [m.wood, m.wood, m.wood, m.wood, m.roadClosed, m.wood]);
  board.position.y = 0.85;
  board.castShadow = true;
  g.add(board);
  for (const x of [-1.2, 1.2]) {
    for (const s of [-1, 1]) {
      const leg = box(d, 0.07, 1.15, 0.07, m.wood);
      leg.position.set(x, 0.55, s * 0.12);
      leg.rotation.x = s * 0.22;
      g.add(leg);
    }
  }
  return g;
}

export function buildFence(d: Disposer, m: WorldMaterials, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);
  for (const x of [-FENCE.hx + 0.05, 0, FENCE.hx - 0.05]) {
    const p = box(d, 0.09, FENCE.top, 0.09, m.wood);
    p.position.set(x, FENCE.top / 2, 0);
    p.rotation.z = (rand() - 0.5) * 0.12;
    g.add(p);
  }
  for (const y of [0.35, 0.8]) {
    if (rand() < 0.2) continue; // a missing rail
    const r = box(d, FENCE.hx * 2, 0.08, 0.04, m.planksDark);
    r.position.set(0, y, 0.05);
    r.rotation.z = (rand() - 0.5) * 0.08;
    g.add(r);
  }
  return g;
}

export function buildDrum(d: Disposer, m: WorldMaterials): THREE.Mesh {
  const drum = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.28, 0.28, 0.88, 14)), m.rust);
  drum.position.y = 0.44;
  drum.castShadow = drum.receiveShadow = true;
  return drum;
}

export function buildCrate(d: Disposer, m: WorldMaterials): THREE.Mesh {
  const c = box(d, 0.6, 0.6, 0.6, m.planksDark);
  c.position.y = 0.3;
  return c;
}
