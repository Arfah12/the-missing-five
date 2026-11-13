import * as THREE from 'three';
import {
  BUS_STOP,
  CHIEF_HOUSE,
  DOOR_KELAS3,
  DOOR_STOR,
  FORBIDDEN_GATE_ID,
  HATCH_STOR,
  INTERACTABLES,
  OLD_WELL_POS,
  WELL_PLANKS,
  doorColliders,
  HUT,
  KAMPUNG_BOUNDS,
  KAMPUNG_PROPS,
  OVERGROUND_MAX_X,
  ROADS,
  SCHOOL,
  SHOP,
  STILT_HOUSE,
  STOR,
  UNDERGROUND_RECT,
  areaAt,
  kampungTerrain,
  roadDistance,
  roadX,
  type AreaId,
  type PropPlacement,
} from '@tmf/shared';
import type { QualityPreset } from '../../engine/quality';
import { Disposer, buildGrass, buildJungle, buildPalm, buildPoles, buildSign, buildStiltHouse, buildStreetLamp } from '../../engine/props';
import { buildBusStop, buildCar, buildCrate, buildDrum, buildFence, buildGate, buildLog, buildShop } from '../../engine/buildings';
import {
  blackboardTexture,
  busSignTexture,
  calendarTexture,
  concreteTexture,
  gateSignTexture,
  missingPosterTexture,
  plasterTexture,
  roadClosedTexture,
  schoolSignTexture,
  shopSignTexture,
  tileTexture,
  tunnelDrawingTexture,
  warningSignTexture,
} from '../../engine/signage';
import { frondTexture, makeNoise, mudTextures, mulberry32, plankTexture, signTexture, softBlobTexture, zincTexture } from '../../engine/textures';
import {
  buildChamber,
  buildChiefHouse,
  buildForestTrees,
  buildGiantTree,
  buildGoal,
  buildHall,
  buildHut,
  buildIronGate,
  buildLowWall,
  buildSchool,
  buildSchoolSign,
  buildStor,
  buildTunnel,
  buildTunnelCap,
  buildWarningSign,
  buildWell,
  type KampungMaterials,
} from '../../engine/village';
import { loadOverrides, type TextureOverrides } from './overrides';
import { batchStatic } from './staticBatch';

export const FOG_COLOR = 0x0d1216;
export const FOG_DENSITY = 0.045;

/** Lighting & fog per kind of place. */
const MOODS: Record<'outdoor' | 'forest' | 'underground', { hemi: number; moon: number; fog: number; fogColor: THREE.Color; flash: number }> = {
  outdoor: { hemi: 0.42, moon: 0.4, fog: FOG_DENSITY, fogColor: new THREE.Color(FOG_COLOR), flash: 1 },
  forest: { hemi: 0.3, moon: 0.22, fog: 0.058, fogColor: new THREE.Color(0x0a0f0d), flash: 0.6 },
  underground: { hemi: 0.025, moon: 0, fog: 0.09, fogColor: new THREE.Color(0x040506), flash: 0 },
};

interface Shelter {
  x: number;
  z: number;
  cos: number;
  sin: number;
  hx: number;
  hz: number;
  roof: number;
  indoor: boolean;
}

interface Flicker {
  update(t: number, dt: number): void;
}

/**
 * Builds the whole of Kampung Hujan from the shared layout: terrain, roads,
 * every building, the forest, the tunnel, lights, mist and per-area mood.
 */
export class WorldScene {
  readonly root = new THREE.Group();
  private readonly d = new Disposer();
  private readonly shelters: Shelter[] = [];
  private readonly flickers: Flicker[] = [];
  private readonly palms: THREE.Object3D[] = [];
  private readonly gates = new Map<string, THREE.Object3D>();
  /** Swinging doors: pivot rotates to open. */
  private readonly doors = new Map<string, { pivot: THREE.Object3D; closed: number; target: number }>();
  private schoolPower: { material: THREE.MeshStandardMaterial; lights: THREE.PointLight[] } | null = null;
  private power = false;
  private readonly noise = makeNoise(5, 64);
  private mist: THREE.Mesh[] = [];
  private moon!: THREE.DirectionalLight;
  private batched: { dispose: () => void } | null = null;
  hemi!: THREE.HemisphereLight;
  flash!: THREE.DirectionalLight;
  /** Current blended mood values (Game reads them for fog and lightning). */
  readonly mood = { hemi: MOODS.outdoor.hemi, moon: MOODS.outdoor.moon, fog: MOODS.outdoor.fog, fogColor: MOODS.outdoor.fogColor.clone(), flash: 1 };
  stats = { meshesBefore: 0, meshesAfter: 0 };

  private constructor(private readonly q: QualityPreset) {}

  static async create(q: QualityPreset): Promise<WorldScene> {
    const scene = new WorldScene(q);
    const overrides = await loadOverrides();
    scene.build(overrides);
    return scene;
  }

  private materials(o: TextureOverrides): KampungMaterials {
    const d = this.d;
    const t = <T extends THREE.Texture>(tex: T) => d.track(tex);
    const plankTex = o.planks ?? t(plankTexture(5));
    plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
    plankTex.repeat.set(2.5, 1);
    const plankDarkTex = o.planks ? o.planks.clone() : t(plankTexture(9, [52, 42, 32]));
    if (o.planks) d.track(plankDarkTex);
    const zincTex = o.zinc ?? t(zincTexture());
    zincTex.wrapS = zincTex.wrapT = THREE.RepeatWrapping;
    const poster = t(missingPosterTexture());
    const concreteTex = o.concrete ?? t(concreteTexture());
    const tunnelTex = t(concreteTexture(31));
    tunnelTex.wrapS = tunnelTex.wrapT = THREE.RepeatWrapping;
    tunnelTex.repeat.set(4, 1);
    const std = (p: THREE.MeshStandardMaterialParameters) => d.track(new THREE.MeshStandardMaterial(p));
    return {
      planks: std({ map: plankTex, roughness: 0.92 }),
      planksDark: std({ map: plankDarkTex, roughness: 0.95, color: o.planks ? 0x7a6d60 : 0xffffff }),
      zinc: std({ map: zincTex, roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide }),
      wood: std({ color: 0x3a2e24, roughness: 0.95 }),
      void: std({ color: 0x020202, roughness: 1 }),
      frond: std({ map: t(frondTexture()), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0x9aa58a }),
      trunk: std({ color: 0x3b342b, roughness: 1 }),
      foliage: std({ color: 0xffffff, roughness: 0.95 }),
      wire: std({ color: 0x0a0a0a, roughness: 0.7 }),
      metal: std({ color: 0x2c2f31, roughness: 0.6, metalness: 0.6 }),
      plaster: std({ map: o.plaster ?? t(plasterTexture(3)), roughness: 0.95 }),
      plasterInside: std({ map: t(plasterTexture(8, [118, 116, 100])), roughness: 1 }),
      concrete: std({ map: concreteTex, roughness: 0.95 }),
      tiles: std({ map: t(tileTexture()), roughness: 0.6 }),
      carPaint: std({ color: 0x3d4a3f, roughness: 0.55, metalness: 0.4 }),
      glass: std({ color: 0x0b0f12, roughness: 0.08, metalness: 0.9 }),
      rubber: std({ color: 0x0f0f0f, roughness: 0.9 }),
      rust: std({ color: 0x5b3a26, roughness: 0.85, metalness: 0.35 }),
      bark: std({ color: 0x2f2820, roughness: 1 }),
      shopSign: std({ map: t(shopSignTexture()), roughness: 0.9 }),
      gateSign: std({ map: t(gateSignTexture()), roughness: 0.9 }),
      roadClosed: std({ map: t(roadClosedTexture()), roughness: 0.85 }),
      poster: std({ map: poster, roughness: 1, alphaTest: 0.5, side: THREE.DoubleSide }),
      calendar: std({ map: t(calendarTexture()), roughness: 1 }),
      busSign: std({ map: t(busSignTexture()), roughness: 0.7, metalness: 0.2 }),
      // Phase 4
      schoolWall: std({ map: t(plasterTexture(14, [168, 160, 112])), roughness: 0.95 }),
      schoolInside: std({ map: t(plasterTexture(15, [150, 156, 140])), roughness: 1 }),
      board2: std({ map: t(blackboardTexture('class2')), roughness: 0.9 }),
      board3: std({ map: t(blackboardTexture('class3')), roughness: 0.9 }),
      boardOffice: std({ map: t(blackboardTexture('office')), roughness: 0.9 }),
      schoolSign: std({ map: t(schoolSignTexture()), roughness: 0.8 }),
      warningSign: std({ map: t(warningSignTexture()), roughness: 0.9 }),
      stone: std({ map: concreteTex, color: 0x8c8a80, roughness: 1 }),
      iron: std({ color: 0x23201d, roughness: 0.7, metalness: 0.7 }),
      tunnelWall: std({ map: tunnelTex, color: 0x6c6658, roughness: 1 }),
      tunnelFloor: std({ map: tunnelTex, color: 0x3c3a33, roughness: 0.9 }),
      drawing: std({ map: t(tunnelDrawingTexture()), transparent: true, roughness: 1, depthWrite: false }),
      cloth: std({ color: 0x6b5a48, roughness: 1 }),
      water: std({ color: 0x050708, roughness: 0.05, metalness: 0.8 }),
    };
  }

  private build(o: TextureOverrides): void {
    const d = this.d;
    const q = this.q;
    const m = this.materials(o);
    const warungSign = d.track(new THREE.MeshStandardMaterial({ map: d.track(shopSignTexture('warung')), roughness: 0.9 }));

    this.buildGround(o);
    this.buildSkyLights();

    const static_ = new THREE.Group(); // everything that never moves → batched
    this.root.add(static_);
    let seed = 1;
    const trees: PropPlacement[] = [];
    for (const p of KAMPUNG_PROPS) {
      if (p.kind === 'tree') {
        trees.push(p);
        continue;
      }
      const obj = this.buildProp(p, m, warungSign, seed++);
      if (!obj) continue;
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = p.yaw;
      static_.add(obj);
    }
    static_.add(buildForestTrees(d, m, trees));

    const poles = KAMPUNG_PROPS.filter((p) => p.kind === 'pole' || p.kind === 'lampPole');
    // two separate wire runs: entrance road and the village part
    static_.add(buildPoles(d, m, poles.filter((p) => p.z > -50).map((p) => new THREE.Vector3(p.x, 7.5, p.z))));
    static_.add(buildPoles(d, m, poles.filter((p) => p.z <= -50).map((p) => new THREE.Vector3(p.x, 7.5, p.z))));

    // Houses beyond the forest edge, only seen as shapes in the fog.
    const B = KAMPUNG_BOUNDS;
    this.root.add(
      buildJungle(
        d,
        m,
        Math.round(q.jungleTrees * 2.6),
        (rand) => {
          for (;;) {
            const x = -120 + rand() * 230;
            const z = -250 + rand() * 330;
            const outside = x < B.minX + 1 || x > OVERGROUND_MAX_X + 1 || z < B.minZ + 1 || z > B.maxZ - 0.5;
            if (outside && x < OVERGROUND_MAX_X + 40) return { x, z };
          }
        },
        77,
      ),
    );
    this.root.add(this.buildBushes(m));
    this.root.add(
      buildGrass(d, q.grassTufts * 3, (rand) => {
        for (;;) {
          const x = B.minX + rand() * (OVERGROUND_MAX_X - B.minX);
          const z = B.minZ + rand() * (B.maxZ - B.minZ);
          const rd = roadDistance(x, z).d;
          if (rd > 0.3 && rd < 9) return { x, z };
        }
      }),
    );

    this.buildMist();
    this.computeShelters();
    this.buildDoors(m);

    const res = batchStatic(static_);
    this.batched = res;
    this.stats = { meshesBefore: res.before, meshesAfter: res.after };
  }

  private buildProp(p: PropPlacement, m: KampungMaterials, warungSign: THREE.Material, seed: number): THREE.Object3D | null {
    const d = this.d;
    switch (p.kind) {
      case 'stiltHouse': {
        const h = buildStiltHouse(d, m, { litWindow: !!p.lit, seed: p.seed ?? 1 });
        if (h.windowGlow && h.windowPos) {
          const light = new THREE.PointLight(0xff8a3c, 2.4, 8, 2);
          light.position.copy(h.windowPos);
          h.group.add(light);
          const glow = h.windowGlow;
          const phase = (p.seed ?? 1) * 7;
          this.flickers.push({
            update: (t) => {
              const off = this.noise(t * 0.06 + phase, 42) > 0.5;
              const k = off ? 0.04 : 0.75 + this.noise(t * 3, 17 + phase) * 0.25;
              light.intensity = 2.4 * k;
              glow.emissiveIntensity = 0.6 * k;
            },
          });
        }
        return h.group;
      }
      case 'shop': {
        const warung = p.variant === 'warung';
        const s = buildShop(d, m, warung ? warungSign : m.shopSign);
        if (!warung) {
          const light = new THREE.PointLight(0xcfe8ff, 0, 7, 2);
          light.position.copy(s.tubePos).add(new THREE.Vector3(0, -0.15, 0));
          s.group.add(light);
          let until = 0;
          let next = 8;
          this.flickers.push({
            update: (t) => {
              if (t > next) {
                until = t + 0.08 + Math.random() * 0.25;
                next = t + 12 + Math.random() * 25;
              }
              const on = t < until && Math.random() < 0.7;
              light.intensity = on ? 3.2 : 0;
              s.tube.emissiveIntensity = on ? 1.5 : 0;
            },
          });
        }
        return s.group;
      }
      case 'busStop':
        return buildBusStop(d, m);
      case 'gate':
        return buildGate(d, m);
      case 'sign':
        return p.variant === 'school' ? buildSchoolSign(d, m) : buildSign(d, m, d.track(signTexture()));
      case 'warningSign':
        return buildWarningSign(d, m);
      case 'car':
        return buildCar(d, m);
      case 'log':
        return buildLog(d, m);
      case 'fence':
        return buildFence(d, m, seed);
      case 'drum':
        return buildDrum(d, m);
      case 'crate':
        return buildCrate(d, m);
      case 'palm': {
        const palm = buildPalm(d, m, p.seed ?? 1, p.height ?? 7);
        (palm.userData.crown as THREE.Object3D).userData.dynamic = true;
        this.palms.push(palm);
        return palm;
      }
      case 'lampPole': {
        const g = new THREE.Group();
        const lamp = buildStreetLamp(d, m, new THREE.Vector3(0, 0, 0), p.arm ?? 1);
        g.add(lamp.group);
        if (p.working) this.addStreetLight(g, lamp.bulbPos, lamp.bulb);
        else lamp.bulb.emissiveIntensity = 0;
        return g;
      }
      case 'school': {
        const s = buildSchool(d, m);
        const lights = s.lamps.map((p) => {
          const l = new THREE.PointLight(0xdcecff, 0, 9, 2);
          l.position.copy(p).add(new THREE.Vector3(0, -0.2, 0));
          s.group.add(l);
          return l;
        });
        this.schoolPower = { material: s.lampMaterial, lights };
        let flickerUntil = 0;
        this.flickers.push({
          update: (t) => {
            if (!this.power || !this.schoolPower) return;
            if (t > flickerUntil && Math.random() < 0.003) flickerUntil = t + 0.1 + Math.random() * 0.3;
            const k = t < flickerUntil ? (Math.random() < 0.5 ? 0.1 : 0.7) : 1;
            this.schoolPower.material.emissiveIntensity = 1.6 * k;
            this.schoolPower.lights.forEach((l) => (l.intensity = 4.5 * k));
          },
        });
        return s.group;
      }
      case 'hall':
        return buildHall(d, m);
      case 'well':
        return buildWell(d, m, false);
      case 'oldWell':
        return buildWell(d, m, true);
      case 'chiefHouse': {
        const c = buildChiefHouse(d, m);
        // the oil lamp on the table still burns. Who lit it?
        const light = new THREE.PointLight(0xffa04a, 1.6, 6, 2);
        light.position.copy(c.lampPos).add(new THREE.Vector3(0, 0.15, 0));
        c.group.add(light);
        this.flickers.push({ update: (t) => (light.intensity = 1.4 + this.noise(t * 4, 77) * 0.4) });
        return c.group;
      }
      case 'stor':
        return buildStor(d, m);
      case 'hut':
        return buildHut(d, m);
      case 'giantTree':
        return buildGiantTree(d, m);
      case 'lowWall':
        return buildLowWall(d, m, p.length ?? 4, p.height);
      case 'goal':
        return buildGoal(d, m);
      case 'tunnel':
        return buildTunnel(d, m, p.length ?? 4, (p.length ?? 0) > 30);
      case 'tunnelCap':
        return buildTunnelCap(d, m);
      case 'chamber':
        return buildChamber(d, m);
      case 'ironGate': {
        const g = buildIronGate(d, m);
        this.gates.set(p.id ?? FORBIDDEN_GATE_ID, g);
        return g;
      }
      case 'barrier':
      case 'pole':
      case 'tree':
        return null;
    }
  }

  /** Doors, hatch covers and well planks (dynamic, never batched). */
  private buildDoors(m: KampungMaterials): void {
    const d = this.d;
    for (const c of doorColliders()) {
      const pivot = new THREE.Group();
      // hinge at the leaf's −x end
      const hinge = new THREE.Vector3(-c.hx, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
      pivot.position.set(c.x + hinge.x, c.y0, c.z + hinge.z);
      pivot.rotation.y = c.yaw;
      const leaf = new THREE.Mesh(d.track(new THREE.BoxGeometry(c.hx * 2 - 0.04, c.y1 - c.y0 - 0.04, 0.05)), m.planksDark);
      leaf.position.set(c.hx, (c.y1 - c.y0) / 2, 0);
      leaf.castShadow = leaf.receiveShadow = true;
      pivot.add(leaf);
      if (c.id === DOOR_STOR) {
        // padlock and hasp
        const lock = new THREE.Mesh(d.track(new THREE.BoxGeometry(0.07, 0.09, 0.03)), m.rust);
        lock.position.set(c.hx * 2 - 0.12, 1.0, 0.05);
        pivot.add(lock);
      }
      pivot.userData.dynamic = true;
      this.root.add(pivot);
      this.doors.set(c.id!, { pivot, closed: c.yaw, target: c.yaw });
    }
    // planks nailed over the storeroom hatch and the old well
    const hatch = INTERACTABLES.find((i) => i.id === HATCH_STOR)!;
    const cover = new THREE.Group();
    for (const [dx, rot] of [
      [-0.25, 0.1],
      [0.05, -0.05],
      [0.3, 0.08],
    ] as const) {
      const plank = new THREE.Mesh(d.track(new THREE.BoxGeometry(0.22, 0.04, 1.1)), m.planks);
      plank.position.set(dx, 0, 0);
      plank.rotation.y = rot;
      cover.add(plank);
    }
    cover.position.set(hatch.x, 0.18, hatch.z);
    cover.userData.dynamic = true;
    this.root.add(cover);
    this.gates.set(HATCH_STOR, cover);
    const wellCover = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const plank = new THREE.Mesh(d.track(new THREE.BoxGeometry(1.8, 0.05, 0.26)), m.planksDark);
      plank.position.set(0, 0, i * 0.3);
      plank.rotation.y = (i % 2) * 0.06;
      wellCover.add(plank);
    }
    wellCover.position.set(OLD_WELL_POS.x, 0.86, OLD_WELL_POS.z);
    wellCover.rotation.y = 0.3;
    wellCover.userData.dynamic = true;
    this.root.add(wellCover);
    this.gates.set(WELL_PLANKS, wellCover);
    void DOOR_KELAS3;
  }

  /** Show/hide gates and covers, swing doors. */
  setOpen(id: string, open: boolean): void {
    const g = this.gates.get(id);
    if (g) g.visible = !open;
    const door = this.doors.get(id);
    if (door) door.target = door.closed + (open ? -1.75 : 0);
  }

  setPower(on: boolean): void {
    this.power = on;
    if (!on && this.schoolPower) {
      this.schoolPower.material.emissiveIntensity = 0;
      this.schoolPower.lights.forEach((l) => (l.intensity = 0));
    }
  }

  private addStreetLight(g: THREE.Group, bulbPos: THREE.Vector3, bulb: THREE.MeshStandardMaterial): void {
    const d = this.d;
    const q = this.q;
    const spot = new THREE.SpotLight(0xffb066, 80, 24, 0.8, 0.6, 2);
    spot.position.copy(bulbPos);
    spot.target.position.set(bulbPos.x + 0.8, 0, bulbPos.z);
    spot.castShadow = q.shadows;
    spot.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    spot.shadow.bias = -0.0006;
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 26;
    g.add(spot, spot.target);
    const point = new THREE.PointLight(0xffa860, 3, 6, 2);
    point.position.copy(bulbPos).add(new THREE.Vector3(0, -0.3, 0));
    g.add(point);
    const glowMat = d.track(
      new THREE.SpriteMaterial({ map: d.track(softBlobTexture(2, false)), color: 0xffb36b, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(bulbPos);
    glow.scale.set(2.6, 2.6, 1);
    g.add(glow);
    let dropUntil = 0;
    this.flickers.push({
      update: (t) => {
        let k = 0.88 + this.noise(t * 6, 1) * 0.12;
        if (t > dropUntil && Math.random() < 0.004) dropUntil = t + 0.05 + Math.random() * 0.25;
        if (t < dropUntil) k = 0.08;
        spot.intensity = 80 * k;
        point.intensity = 3 * k;
        bulb.emissiveIntensity = 2.2 * k;
        glowMat.opacity = 0.55 * k;
      },
    });
  }

  private buildGround(o: TextureOverrides): void {
    const d = this.d;
    const q = this.q;
    const minX = KAMPUNG_BOUNDS.minX - 40;
    const maxX = OVERGROUND_MAX_X + 35;
    const minZ = KAMPUNG_BOUNDS.minZ - 40;
    const maxZ = KAMPUNG_BOUNDS.maxZ + 30;
    const sizeX = maxX - minX;
    const sizeZ = maxZ - minZ;
    const seg = 1.6;
    const geo = d.track(new THREE.PlaneGeometry(sizeX, sizeZ, Math.round(sizeX / seg), Math.round(sizeZ / seg)));
    geo.rotateX(-Math.PI / 2);
    geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, kampungTerrain(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const mud = mudTextures(q.textureSize, [sizeX / 7, sizeZ / 7], 0.35);
    d.track(mud.map);
    d.track(mud.roughnessMap);
    const groundMap = o.mud ?? mud.map;
    if (o.mud) groundMap.repeat.set(sizeX / 4, sizeZ / 4);
    const ground = new THREE.Mesh(geo, d.track(new THREE.MeshStandardMaterial({ map: groundMap, roughnessMap: o.mud ? null : mud.roughnessMap, roughness: 1 })));
    ground.receiveShadow = true;
    this.root.add(ground);

    // road / footpath ribbons
    const road = mudTextures(Math.min(q.textureSize, 256), [1, 1], 0.75, true);
    d.track(road.map);
    d.track(road.roughnessMap);
    const roadMat = d.track(
      new THREE.MeshStandardMaterial({ map: o.road ?? road.map, roughnessMap: o.road ? null : road.roughnessMap, roughness: 1, metalness: 0.05 }),
    );
    const pathMat = d.track(new THREE.MeshStandardMaterial({ map: mud.map, roughness: 1, color: 0x8a7b66 }));
    for (const r of ROADS) {
      const pts = r.kind === 'road' && r.id === 'main' ? this.denseMainRoad() : this.resample(r.points, 2);
      this.root.add(new THREE.Mesh(this.ribbon(pts, r.halfWidth, r.id === 'main' ? 0.015 : 0.02), r.kind === 'road' ? roadMat : pathMat));
    }
  }

  private denseMainRoad(): { x: number; z: number }[] {
    const pts: { x: number; z: number }[] = [];
    for (let z = 70; z >= -128; z -= 0.75) pts.push({ x: roadX(z), z });
    return pts;
  }

  private resample(points: { x: number; z: number }[], step: number): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
      for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    return out;
  }

  /** A strip of road following points, draped on the terrain. */
  private ribbon(pts: { x: number; z: number }[], halfWidth: number, lift: number): THREE.BufferGeometry {
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    let v = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      // left-hand normal (when walking along the points)
      const nx = -tz;
      const nz = tx;
      if (i > 0) v += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) / (halfWidth * 2);
      for (const s of [-1, 0, 1]) {
        const x = p.x + nx * halfWidth * s;
        const z = p.z + nz * halfWidth * s;
        verts.push(x, kampungTerrain(x, z) + lift + (s === 0 ? 0.015 : 0), z);
        uvs.push((s + 1) / 2, v);
      }
      if (i < pts.length - 1) {
        const k = i * 3;
        idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
      }
    }
    const geo = this.d.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // make sure the faces point up (flip winding if the computed normal points down)
    const n = geo.getAttribute('normal') as THREE.BufferAttribute;
    if (n.count && n.getY(1) < 0) {
      const index = geo.getIndex();
      if (index) {
        const arr = index.array as Uint16Array | Uint32Array;
        for (let i = 0; i < arr.length; i += 3) {
          const tmp = arr[i + 1];
          arr[i + 1] = arr[i + 2];
          arr[i + 2] = tmp;
        }
        index.needsUpdate = true;
        geo.computeVertexNormals();
      }
    }
    return geo;
  }

  private buildSkyLights(): void {
    const q = this.q;
    this.hemi = new THREE.HemisphereLight(0x34465a, 0x0e0a07, MOODS.outdoor.hemi);
    this.root.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8ea4c4, MOODS.outdoor.moon);
    this.moon.position.set(-18, 30, -20);
    this.moon.castShadow = q.shadows;
    if (q.shadows) {
      const s = this.moon.shadow;
      s.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      s.camera.left = -28;
      s.camera.right = 28;
      s.camera.top = 28;
      s.camera.bottom = -28;
      s.camera.near = 1;
      s.camera.far = 90;
      s.bias = -0.0008;
      s.normalBias = 0.03;
    }
    this.root.add(this.moon, this.moon.target);
    this.flash = new THREE.DirectionalLight(0xcfdcff, 0);
    this.flash.position.set(10, 40, -30);
    this.root.add(this.flash);
  }

  private buildBushes(m: KampungMaterials): THREE.InstancedMesh {
    const d = this.d;
    const B = KAMPUNG_BOUNDS;
    const geo = d.track(new THREE.IcosahedronGeometry(1, 1));
    const n = makeNoise(13, 8);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(1 + n(v.x * 2 + 3, v.z * 2 + v.y * 2) * 0.3);
      p.setXYZ(i, v.x, Math.max(-0.2, v.y * 0.7), v.z);
    }
    geo.computeVertexNormals();
    const count = Math.round(this.q.jungleTrees * 4);
    const bushes = new THREE.InstancedMesh(geo, m.foliage, count);
    const rand = mulberry32(91);
    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const color = new THREE.Color();
    const perimeter = 2 * (OVERGROUND_MAX_X - B.minX) + 2 * (B.maxZ - B.minZ);
    for (let i = 0; i < count; i++) {
      let x: number;
      let z: number;
      if (rand() < 0.75) {
        // hug the edge of the overground map
        let k = rand() * perimeter;
        const w = OVERGROUND_MAX_X - B.minX;
        const h = B.maxZ - B.minZ;
        const inset = rand() * 4;
        if (k < w) [x, z] = [B.minX + k, B.maxZ - inset];
        else if ((k -= w) < h) [x, z] = [OVERGROUND_MAX_X - inset, B.maxZ - k];
        else if ((k -= h) < w) [x, z] = [OVERGROUND_MAX_X - k, B.minZ + inset];
        else [x, z] = [B.minX + inset, B.minZ + (k - h - w)];
      } else {
        do {
          x = B.minX + rand() * (OVERGROUND_MAX_X - B.minX);
          z = B.minZ + rand() * (B.maxZ - B.minZ);
        } while (roadDistance(x, z).d < 3);
      }
      const s = 0.8 + rand() * 1.6;
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      mat4.compose(new THREE.Vector3(x, kampungTerrain(x, z) + s * 0.3, z), quat, new THREE.Vector3(s * 1.3, s, s * 1.3));
      bushes.setMatrixAt(i, mat4);
      color.setHSL(0.25 + rand() * 0.07, 0.3, 0.06 + rand() * 0.05);
      bushes.setColorAt(i, color);
    }
    bushes.instanceMatrix.needsUpdate = true;
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    bushes.receiveShadow = true;
    return d.track(bushes);
  }

  private buildMist(): void {
    const d = this.d;
    const tex = d.track(softBlobTexture(12, true));
    const geo = d.track(new THREE.PlaneGeometry(1, 1));
    const rand = mulberry32(404);
    const count = this.q.mistBanks * 6;
    const B = KAMPUNG_BOUNDS;
    for (let i = 0; i < count; i++) {
      const mat = d.track(
        new THREE.MeshBasicMaterial({ map: tex, color: 0x7f8e9b, transparent: true, opacity: 0.05 + rand() * 0.05, depthWrite: false, fog: true }),
      );
      const mesh = new THREE.Mesh(geo, mat);
      const x = B.minX + rand() * (OVERGROUND_MAX_X - B.minX);
      const z = B.minZ + rand() * (B.maxZ - B.minZ);
      mesh.position.set(x, kampungTerrain(x, z) + 0.7 + rand() * 1.4, z);
      mesh.scale.set(14 + rand() * 12, 3 + rand() * 2.5, 1);
      mesh.userData.baseX = mesh.position.x;
      mesh.userData.drift = (rand() < 0.5 ? -1 : 1) * (0.1 + rand() * 0.2);
      mesh.renderOrder = 2;
      this.mist.push(mesh);
      this.root.add(mesh);
    }
  }

  private computeShelters(): void {
    for (const p of KAMPUNG_PROPS) {
      let rect: { x: number; z: number; hx: number; hz: number; roof: number; indoor: boolean } | null = null;
      switch (p.kind) {
        case 'shop':
          rect = { x: 0, z: 0, hx: SHOP.width / 2, hz: SHOP.depth / 2, roof: SHOP.wallTop, indoor: true };
          break;
        case 'busStop':
          rect = { x: 0, z: 0.1, hx: BUS_STOP.halfWidth, hz: BUS_STOP.halfDepth, roof: BUS_STOP.roofY, indoor: false };
          break;
        case 'stiltHouse':
          rect = { x: 0, z: 0, hx: STILT_HOUSE.width / 2, hz: STILT_HOUSE.depth / 2, roof: STILT_HOUSE.stilt, indoor: false };
          break;
        case 'school':
          rect = { x: 0, z: SCHOOL.corridor / 2, hx: SCHOOL.width / 2, hz: (SCHOOL.classDepth + SCHOOL.corridor) / 2, roof: SCHOOL.wallTop, indoor: true };
          break;
        case 'hall':
          rect = { x: 0, z: 0, hx: 6.5, hz: 4.5, roof: 4, indoor: false };
          break;
        case 'chiefHouse':
          rect = { x: 0, z: 0, hx: CHIEF_HOUSE.width / 2, hz: CHIEF_HOUSE.depth / 2, roof: CHIEF_HOUSE.wallTop, indoor: true };
          break;
        case 'stor':
          rect = { x: 0, z: 0, hx: STOR.hx, hz: STOR.hz, roof: STOR.wallTop, indoor: true };
          break;
        case 'hut':
          rect = { x: 0, z: 0, hx: HUT.hx, hz: HUT.hz, roof: HUT.roofY, indoor: false };
          break;
      }
      if (!rect) continue;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      this.shelters.push({ x: p.x + rect.x * c + rect.z * s, z: p.z - rect.x * s + rect.z * c, cos: c, sin: s, hx: rect.hx, hz: rect.hz, roof: rect.roof, indoor: rect.indoor });
    }
  }

  private static inRect(s: Shelter, x: number, z: number, shrink = 0): boolean {
    const dx = x - s.x;
    const dz = z - s.z;
    const lx = dx * s.cos - dz * s.sin;
    const lz = dx * s.sin + dz * s.cos;
    return Math.abs(lx) <= s.hx - shrink && Math.abs(lz) <= s.hz - shrink;
  }

  private static underground(x: number, z: number): boolean {
    const U = UNDERGROUND_RECT;
    return x >= U.minX && x <= U.maxX && z >= U.minZ && z <= U.maxZ;
  }

  /** True if (x, z) at height y is under a roof (no rain falls there). */
  isSheltered(x: number, z: number, y = 0): boolean {
    if (WorldScene.underground(x, z)) return true;
    for (const s of this.shelters) if (y <= s.roof && WorldScene.inRect(s, x, z)) return true;
    return false;
  }

  /** True inside closed buildings and underground (muffled rain). */
  isIndoors(x: number, z: number): boolean {
    if (WorldScene.underground(x, z)) return true;
    for (const s of this.shelters) if (s.indoor && WorldScene.inRect(s, x, z, 0.1)) return true;
    return false;
  }

  followShadows(x: number, z: number): void {
    const step = 56 / this.q.shadowMapSize;
    const sx = Math.round(x / step) * step;
    const sz = Math.round(z / step) * step;
    this.moon.target.position.set(sx, 0, sz);
    this.moon.position.set(sx - 18, 30, sz - 20);
  }

  /** Blend lighting/fog towards the mood of the area the camera is in. */
  updateMood(area: AreaId, dt: number, fog: THREE.FogExp2): void {
    const target = area === 'tunnel' || area === 'forbidden' ? MOODS.underground : area === 'forest' ? MOODS.forest : MOODS.outdoor;
    const k = 1 - Math.exp(-dt * 1.6);
    const md = this.mood;
    md.hemi += (target.hemi - md.hemi) * k;
    md.moon += (target.moon - md.moon) * k;
    md.fog += (target.fog - md.fog) * k;
    md.flash += (target.flash - md.flash) * k;
    md.fogColor.lerp(target.fogColor, k);
    this.moon.intensity = md.moon;
    fog.density = md.fog;
    fog.color.copy(md.fogColor);
  }

  update(t: number, dt: number, camera: THREE.Camera): void {
    for (const f of this.flickers) f.update(t, dt);
    for (const door of this.doors.values()) {
      const r = door.pivot.rotation;
      r.y += (door.target - r.y) * (1 - Math.exp(-dt * 6));
    }
    this.palms.forEach((p, i) => {
      const crown = p.userData.crown as THREE.Object3D | undefined;
      if (!crown) return;
      crown.rotation.z = Math.sin(t * 0.9 + i) * 0.05;
      crown.rotation.x = Math.sin(t * 0.7 + i * 2) * 0.04;
    });
    for (const mist of this.mist) {
      mist.position.x = (mist.userData.baseX as number) + Math.sin(t * 0.05 + mist.position.z) * 3 + t * (mist.userData.drift as number) * 0.2;
      mist.quaternion.copy(camera.quaternion);
    }
  }

  dispose(): void {
    this.root.traverse((o: THREE.Object3D) => {
      const l = o as THREE.Light;
      if (l.isLight) {
        l.shadow?.map?.dispose();
        l.dispose();
      }
    });
    this.batched?.dispose();
    this.d.dispose();
    this.root.removeFromParent();
  }
}

export { areaAt };
