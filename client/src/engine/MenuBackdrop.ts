import * as THREE from 'three';
import type { Quality } from '../lib/settings';
import { QUALITY, type QualityPreset } from './quality';
import {
  Disposer,
  buildGrass,
  buildJungle,
  buildPalm,
  buildPoles,
  buildSign,
  buildStiltHouse,
  buildStreetLamp,
  buildWatcher,
  type PropMaterials,
} from './props';
import { frondTexture, makeNoise, mudTextures, plankTexture, signTexture, softBlobTexture, zincTexture } from './textures';

export interface BackdropOptions {
  quality: Quality;
  brightness: number;
  reducedMotion?: boolean;
  /** Called on each lightning strike so the audio can play thunder. */
  onLightning?: (strength: number) => void;
}

/** Centre line of the muddy road (it bends gently into the fog). */
export const roadX = (z: number) => 1.4 * Math.sin(z * 0.055) - 0.4;

const FOG = 0x10161b;
const WATCHER_SPOTS = [
  { x: roadX(-23), z: -23, face: 0 },
  { x: 3.2, z: -10.5, face: -0.4 },
  { x: -6.8, z: -19, face: 0.5 },
];

/**
 * The main-menu scene: Kampung Hujan at night. Rain, drifting mist, a
 * flickering street lamp, an abandoned stilt house… and something that
 * occasionally stands at the end of the road.
 */
export class MenuBackdrop {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 160);
  private readonly d = new Disposer();
  private readonly preset: QualityPreset;
  private readonly canvas: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private running = false;
  private last = performance.now();
  private time = 0;
  private pointer = new THREE.Vector2();
  private pointerEased = new THREE.Vector2();
  private readonly lookTarget = new THREE.Vector3();
  private readonly noise = makeNoise(7, 64);

  private rain!: THREE.LineSegments;
  private rainSpeed!: Float32Array;
  private mist: THREE.Mesh[] = [];
  private lampSpot!: THREE.SpotLight;
  private lampPoint!: THREE.PointLight;
  private lampGlow!: THREE.Sprite;
  private lampBulb!: THREE.MeshStandardMaterial;
  private windowLight: THREE.PointLight | null = null;
  private windowGlow: THREE.MeshStandardMaterial | null = null;
  private flash!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private watcher!: THREE.Group;
  private palms: THREE.Group[] = [];

  private nextLightning = 9;
  private flashSeq: { at: number; level: number }[] = [];
  private watcherUntil = 0;
  private nextWatcher = 22;
  private lampDropUntil = 0;

  constructor(
    private readonly container: HTMLElement,
    private opts: BackdropOptions,
  ) {
    this.preset = QUALITY[opts.quality];
    // A fresh canvas per instance keeps React StrictMode remounts safe.
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'backdrop-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.preset.antialias,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = opts.brightness;
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(FOG);

    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = new THREE.FogExp2(FOG, 0.036);

    this.build();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    window.addEventListener('pointermove', this.onPointer, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  /* ───────────────────────── scene construction ───────────────────────── */

  private build(): void {
    const d = this.d;
    const q = this.preset;

    // Shared materials
    const plankTex = d.track(plankTexture(5));
    plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
    plankTex.repeat.set(2.5, 1);
    const plankDarkTex = d.track(plankTexture(9, [52, 42, 32]));
    const zincTex = d.track(zincTexture());
    zincTex.wrapS = zincTex.wrapT = THREE.RepeatWrapping;
    const frondTex = d.track(frondTexture());
    const m: PropMaterials = {
      planks: d.track(new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.92 })),
      planksDark: d.track(new THREE.MeshStandardMaterial({ map: plankDarkTex, roughness: 0.95 })),
      zinc: d.track(new THREE.MeshStandardMaterial({ map: zincTex, roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide })),
      wood: d.track(new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.95 })),
      void: d.track(new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 1 })),
      frond: d.track(
        new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0x9aa58a }),
      ),
      trunk: d.track(new THREE.MeshStandardMaterial({ color: 0x3b342b, roughness: 1 })),
      foliage: d.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })),
      wire: d.track(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7 })),
      metal: d.track(new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.6, metalness: 0.6 })),
    };

    this.buildGround(q);
    this.buildLights();

    // Village sign at the roadside, near the camera
    const sign = buildSign(d, m, d.track(signTexture()));
    sign.position.set(roadX(1) - 3.3, 0, 1);
    sign.rotation.y = 0.55;
    this.scene.add(sign);

    // Two abandoned houses
    const house = buildStiltHouse(d, m, { litWindow: true, seed: 3 });
    house.group.position.set(roadX(-14) + 7.6, 0, -14);
    house.group.rotation.y = -Math.PI / 2 + 0.38;
    this.scene.add(house.group);
    this.windowGlow = house.windowGlow;
    if (house.windowPos) {
      house.group.updateMatrixWorld(true);
      const p = house.windowPos.clone().applyMatrix4(house.group.matrixWorld);
      this.windowLight = new THREE.PointLight(0xff8a3c, 2.2, 7, 2);
      this.windowLight.position.copy(p);
      this.scene.add(this.windowLight);
    }
    const house2 = buildStiltHouse(d, m, { litWindow: false, seed: 8 });
    house2.group.position.set(roadX(-30) - 9, 0, -30);
    house2.group.rotation.y = Math.PI / 2 - 0.3;
    house2.group.scale.setScalar(0.92);
    this.scene.add(house2.group);

    // Palms and utility poles along the road
    const palmSpots: [number, number, number][] = [
      [5.2, -4, 7.5],
      [-6.2, -7, 8.2],
      [10.5, -21, 7],
      [-5.6, -16, 6.5],
      [6.8, -33, 8],
      [-10, -41, 7.8],
      [-12, -3, 7],
    ];
    palmSpots.forEach(([x, z, h], i) => {
      const palm = buildPalm(d, m, 31 + i * 17, h);
      palm.position.set(x, 0, z);
      this.palms.push(palm);
      this.scene.add(palm);
    });

    const poleTops: THREE.Vector3[] = [];
    for (let z = 6; z > -60; z -= 13) poleTops.push(new THREE.Vector3(roadX(z) - 3, 7.5, z));
    this.scene.add(buildPoles(d, m, poleTops));
    const lamp = buildStreetLamp(d, m, poleTops[1], 1);
    this.scene.add(lamp.group);
    this.lampBulb = lamp.bulb;
    this.placeLampLights(lamp.bulbPos, q);

    // Jungle all around, grass along the verges
    this.scene.add(
      buildJungle(d, m, q.jungleTrees, (rand) => {
        const side = rand() < 0.5 ? -1 : 1;
        const z = 10 - rand() * 90;
        const x = roadX(z) + side * (12 + rand() * 26);
        return { x, z };
      }),
    );
    this.scene.add(
      buildGrass(d, q.grassTufts, (rand) => {
        const z = 9 - rand() * 50;
        const side = rand() < 0.5 ? -1 : 1;
        return { x: roadX(z) + side * (2.1 + rand() * 2.8), z };
      }),
    );

    this.buildRain(q);
    this.buildMist(q);

    this.watcher = buildWatcher(d);
    this.scene.add(this.watcher);
  }

  private buildGround(q: QualityPreset): void {
    const d = this.d;
    const ground = mudTextures(q.textureSize, [22, 22], 0.35);
    const groundGeo = d.track(new THREE.PlaneGeometry(170, 170, 90, 90));
    groundGeo.rotateX(-Math.PI / 2);
    groundGeo.translate(0, 0, -30); // centre the ground on the visible stretch of road
    const pos = groundGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const fromRoad = Math.abs(x - roadX(z));
      const bump = this.noise(x * 0.15 + 30, z * 0.15 + 30) * 0.35 + this.noise(x * 0.6, z * 0.6) * 0.06;
      const t = Math.min(1, Math.max(0, (fromRoad - 2.6) / 3));
      pos.setY(i, bump * t - 0.03 * (1 - t));
    }
    groundGeo.computeVertexNormals();
    const groundMesh = new THREE.Mesh(
      groundGeo,
      d.track(new THREE.MeshStandardMaterial({ map: ground.map, roughnessMap: ground.roughnessMap, roughness: 1 })),
    );
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);
    d.track(ground.map);
    d.track(ground.roughnessMap);

    // Road ribbon following roadX(z)
    const road = mudTextures(Math.min(q.textureSize, 256), [1, 18], 0.75, true);
    d.track(road.map);
    d.track(road.roughnessMap);
    const segs = 120;
    const zStart = 14;
    const zEnd = -75;
    const width = 4.4;
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const z = zStart + (zEnd - zStart) * t;
      const cx = roadX(z);
      for (const side of [-1, 1]) {
        const x = cx + (side * width) / 2;
        verts.push(x, 0.012 + this.noise(x * 0.8, z * 0.8) * 0.01, z);
        uvs.push(side < 0 ? 0 : 1, t);
      }
      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // counter-clockwise from above → faces up
      }
    }
    const roadGeo = d.track(new THREE.BufferGeometry());
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(idx);
    roadGeo.computeVertexNormals();
    const roadMesh = new THREE.Mesh(
      roadGeo,
      d.track(new THREE.MeshStandardMaterial({ map: road.map, roughnessMap: road.roughnessMap, roughness: 1, metalness: 0.05 })),
    );
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
  }

  private buildLights(): void {
    // Cold moonlight through the clouds + a dim sky/ground fill.
    this.hemi = new THREE.HemisphereLight(0x3d4f63, 0x120d09, 0.55);
    this.scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0x8ea4c4, 0.45);
    moon.position.set(-18, 26, -22);
    this.scene.add(moon);
    // Lightning: a bright cold light that is normally off.
    this.flash = new THREE.DirectionalLight(0xcfdcff, 0);
    this.flash.position.set(10, 40, -30);
    this.scene.add(this.flash);
  }

  private placeLampLights(bulbPos: THREE.Vector3, q: QualityPreset): void {
    const d = this.d;
    this.lampSpot = new THREE.SpotLight(0xffb066, 70, 26, 0.72, 0.65, 2);
    this.lampSpot.position.copy(bulbPos);
    this.lampSpot.target.position.set(bulbPos.x + 0.6, 0, bulbPos.z - 1.5);
    this.lampSpot.castShadow = q.shadows;
    this.lampSpot.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.lampSpot.shadow.bias = -0.0006;
    this.lampSpot.shadow.camera.near = 0.5;
    this.lampSpot.shadow.camera.far = 28;
    this.scene.add(this.lampSpot, this.lampSpot.target);

    this.lampPoint = new THREE.PointLight(0xffa860, 3, 6, 2);
    this.lampPoint.position.copy(bulbPos).add(new THREE.Vector3(0, -0.3, 0));
    this.scene.add(this.lampPoint);

    const glowTex = d.track(softBlobTexture(2, false));
    const glowMat = d.track(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xffb36b, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.lampGlow = new THREE.Sprite(glowMat);
    this.lampGlow.position.copy(bulbPos);
    this.lampGlow.scale.set(2.6, 2.6, 1);
    this.scene.add(this.lampGlow);
  }

  private buildRain(q: QualityPreset): void {
    const n = q.rainDrops;
    const positions = new Float32Array(n * 6);
    this.rainSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 36;
      const y = Math.random() * 16;
      const z = 8 - Math.random() * 40;
      const len = 0.35 + Math.random() * 0.35;
      positions.set([x, y, z, x + 0.08, y + len, z], i * 6);
      this.rainSpeed[i] = 13 + Math.random() * 7;
    }
    const geo = this.d.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = this.d.track(new THREE.LineBasicMaterial({ color: 0x9fb2c2, transparent: true, opacity: 0.28, depthWrite: false }));
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  private buildMist(q: QualityPreset): void {
    const tex = this.d.track(softBlobTexture(12, true));
    const geo = this.d.track(new THREE.PlaneGeometry(1, 1));
    for (let i = 0; i < q.mistBanks; i++) {
      const mat = this.d.track(
        new THREE.MeshBasicMaterial({ map: tex, color: 0x8796a4, transparent: true, opacity: 0.07 + Math.random() * 0.06, depthWrite: false }),
      );
      const m = new THREE.Mesh(geo, mat);
      const z = -4 - i * (34 / q.mistBanks) - Math.random() * 3;
      m.position.set(roadX(z) + (Math.random() - 0.5) * 14, 0.8 + Math.random() * 1.2, z);
      m.scale.set(16 + Math.random() * 12, 3.5 + Math.random() * 2.5, 1);
      m.userData.drift = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.25);
      m.userData.baseX = m.position.x;
      m.renderOrder = 2;
      this.mist.push(m);
      this.scene.add(m);
    }
  }

  /* ───────────────────────── runtime ───────────────────────── */

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setBrightness(value: number): void {
    this.opts = { ...this.opts, brightness: value };
    this.renderer.toneMappingExposure = value;
  }

  private update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const calm = this.opts.reducedMotion ? 0.25 : 1;

    // Camera: slow, uneasy drift with a little handheld breathing and mouse parallax.
    this.pointerEased.lerp(this.pointer, 1 - Math.exp(-dt * 2));
    const cx = 0.5 + Math.sin(t * 0.045) * 0.7 * calm + this.pointerEased.x * 0.35;
    const cz = 7.2 + Math.sin(t * 0.03) * 0.9 * calm;
    const cy = 1.62 + Math.sin(t * 0.8) * 0.012 * calm + this.noise(t * 0.4, 3) * 0.02 * calm;
    this.camera.position.set(cx, cy, cz);
    this.lookTarget.set(
      2.0 + this.pointerEased.x * 1.6 + this.noise(t * 0.15, 9) * 0.25 * calm,
      1.75 + this.pointerEased.y * 0.6,
      -16,
    );
    this.camera.lookAt(this.lookTarget);

    // Rain
    const attr = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < this.rainSpeed.length; i++) {
      const o = i * 6;
      const fall = this.rainSpeed[i] * dt;
      arr[o + 1] -= fall;
      arr[o + 4] -= fall;
      arr[o] -= fall * 0.06;
      arr[o + 3] -= fall * 0.06;
      if (arr[o + 1] < 0) {
        const x = cx + (Math.random() - 0.5) * 36;
        const len = arr[o + 4] - arr[o + 1];
        arr[o] = x;
        arr[o + 3] = x + 0.08;
        arr[o + 1] = 16;
        arr[o + 4] = 16 + len;
      }
    }
    attr.needsUpdate = true;

    // Mist drifts slowly across the road
    for (const m of this.mist) {
      m.position.x = (m.userData.baseX as number) + Math.sin(t * 0.05 + m.position.z) * 3 + t * (m.userData.drift as number) * 0.2;
      m.quaternion.copy(this.camera.quaternion);
    }

    // Palm crowns sway in the wind
    this.palms.forEach((p, i) => {
      const crown = p.userData.crown as THREE.Object3D;
      crown.rotation.z = Math.sin(t * 0.9 + i) * 0.05 * calm;
      crown.rotation.x = Math.sin(t * 0.7 + i * 2) * 0.04 * calm;
    });

    this.updateLamp(t);
    this.updateLightning(t);
    this.updateWatcher(t);

    // The lit window breathes like a kerosene lamp… and sometimes goes dark.
    if (this.windowLight && this.windowGlow) {
      const off = this.noise(t * 0.08, 42) > 0.45;
      const k = off ? 0 : 0.75 + this.noise(t * 3, 17) * 0.25;
      this.windowLight.intensity = 2.2 * k;
      this.windowGlow.emissiveIntensity = 0.6 * k;
    }
  }

  private updateLamp(t: number): void {
    let k = 0.88 + this.noise(t * 6, 1) * 0.12;
    if (t > this.lampDropUntil && Math.random() < 0.004) this.lampDropUntil = t + 0.05 + Math.random() * 0.25;
    if (t < this.lampDropUntil) k = 0.08;
    if (this.watcher.visible) k *= 0.55 + Math.random() * 0.45; // it doesn't like the light
    this.lampSpot.intensity = 70 * k;
    this.lampPoint.intensity = 3 * k;
    this.lampBulb.emissiveIntensity = 2.2 * k;
    (this.lampGlow.material as THREE.SpriteMaterial).opacity = 0.55 * k;
  }

  private updateLightning(t: number): void {
    if (t >= this.nextLightning) {
      const strength = 0.6 + Math.random() * 0.4;
      const scale = this.opts.reducedMotion ? 0.35 : 1;
      this.flashSeq = [
        { at: t, level: 2.6 * strength * scale },
        { at: t + 0.07, level: 0.2 },
        { at: t + 0.14, level: 1.8 * strength * scale },
        { at: t + 0.3, level: 0 },
      ];
      this.nextLightning = t + 14 + Math.random() * 22;
      this.opts.onLightning?.(strength);
      if (!this.watcher.visible && Math.random() < 0.45) this.showWatcher(t, 3 + Math.random() * 2);
    }
    let level = 0;
    for (const f of this.flashSeq) if (t >= f.at) level = f.level;
    const current = this.flash.intensity;
    this.flash.intensity = level > current ? level : current + (level - current) * 0.25;
    this.hemi.intensity = 0.55 + this.flash.intensity * 0.35;
  }

  private showWatcher(t: number, seconds: number): void {
    const spot = WATCHER_SPOTS[Math.floor(Math.random() * WATCHER_SPOTS.length)];
    this.watcher.position.set(spot.x, 0, spot.z);
    this.watcher.rotation.y = spot.face;
    this.watcher.visible = true;
    this.watcherUntil = t + seconds;
  }

  private updateWatcher(t: number): void {
    if (this.watcher.visible) {
      if (t > this.watcherUntil) {
        this.watcher.visible = false;
        this.nextWatcher = t + 25 + Math.random() * 35;
      } else {
        // almost still – just a slow, wrong tilt of the head
        const head = this.watcher.getObjectByName('head');
        if (head) head.rotation.z = Math.sin((this.watcherUntil - t) * 0.6) * 0.35;
        this.watcher.rotation.z = Math.sin(t * 0.5) * 0.015;
      }
    } else if (t > this.nextWatcher) {
      this.showWatcher(t, 2.5 + Math.random() * 2.5);
    }
  }

  /* ───────────────────────── housekeeping ───────────────────────── */

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.dprCap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  };

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.stop();
    this.canvas.dispatchEvent(new CustomEvent('backdrop-lost', { bubbles: true }));
  };

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.lampSpot.shadow.map?.dispose();
    this.d.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
