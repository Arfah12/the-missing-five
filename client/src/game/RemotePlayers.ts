import * as THREE from 'three';
import { INTERP_DELAY_MS, PLAYER, angleDelta, type NetPlayer, type PlayersFrame } from '@tmf/shared';

/**
 * Other players: a simple human figure with a name tag and their torch,
 * moved smoothly by interpolating between server snapshots.
 */

const JACKETS = [0x6b3a2e, 0x2f4a5c, 0x4d5a36, 0x5a4a6b, 0x7a6a3a];

interface Snapshot {
  t: number;
  p: NetPlayer;
}

interface Avatar {
  id: string;
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  head: THREE.Object3D;
  tag: THREE.Sprite;
  tagTex: THREE.CanvasTexture;
  torch: THREE.SpotLight;
  torchGlow: THREE.Mesh;
  buffer: Snapshot[];
  walk: number;
  lastPos: THREE.Vector3;
  name: string;
  connected: boolean;
  downed: boolean;
}

function nameTexture(name: string, faded: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.font = '600 30px "Special Elite", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = faded ? 'rgba(201,58,50,0.85)' : 'rgba(214,205,184,0.92)';
    ctx.fillText(faded ? `${name} (offline)` : name, 128, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RemotePlayers {
  private readonly group = new THREE.Group();
  private readonly avatars = new Map<string, Avatar>();
  private readonly shared: { skin: THREE.MeshStandardMaterial; pants: THREE.MeshStandardMaterial; jackets: THREE.MeshStandardMaterial[]; geos: THREE.BufferGeometry[] };
  /** Server clock minus local clock (ms), refined with every frame. */
  private clockOffset: number | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly selfId: string,
    private readonly maxTorches = 4,
  ) {
    scene.add(this.group);
    this.shared = {
      skin: new THREE.MeshStandardMaterial({ color: 0x9a7356, roughness: 0.8 }),
      pants: new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.9 }),
      jackets: JACKETS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })),
      geos: [],
    };
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.shared.geos.push(g);
    return g;
  }

  private create(p: NetPlayer): Avatar {
    const m = this.shared;
    const jacket = m.jackets[p.slot % m.jackets.length];
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };
    // torso and head
    const torso = part(this.geo(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10)), jacket, 0, 1.18, 0);
    torso.scale.z = 0.7;
    body.add(torso);
    const head = part(this.geo(new THREE.SphereGeometry(0.12, 14, 12)), m.skin, 0, 1.62, 0);
    head.scale.set(0.95, 1.1, 1);
    body.add(head);
    const hair = part(this.geo(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), m.pants, 0, 1.65, 0.005);
    body.add(hair);
    // limbs pivot at the hips / shoulders
    const limb = (len: number, r: number, mat: THREE.Material, x: number, y: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const g = this.geo(new THREE.CapsuleGeometry(r, len, 3, 8));
      const mesh = part(g, mat, 0, -len / 2 - r, 0);
      pivot.add(mesh);
      body.add(pivot);
      return pivot;
    };
    const legL = limb(0.62, 0.075, m.pants, -0.1, 0.86);
    const legR = limb(0.62, 0.075, m.pants, 0.1, 0.86);
    const armL = limb(0.5, 0.055, jacket, -0.27, 1.42);
    const armR = limb(0.5, 0.055, jacket, 0.27, 1.42);

    // name tag
    const tagTex = nameTexture(p.name, !p.connected);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false, fog: false }));
    tag.scale.set(1.1, 0.275, 1);
    tag.position.y = 2.05;
    root.add(tag);

    // their torch (no shadows: cheap)
    const torch = new THREE.SpotLight(0xfff1dc, 0, 22, 0.48, 0.55, 2);
    torch.position.set(0.25, 1.35, -0.2);
    torch.target.position.set(0.25, 1.1, -6);
    body.add(torch, torch.target);
    const torchGlow = new THREE.Mesh(
      this.geo(new THREE.CircleGeometry(0.035, 10)),
      new THREE.MeshBasicMaterial({ color: 0xfff1dc, transparent: true, opacity: 0, fog: false }),
    );
    torchGlow.position.set(0.25, 1.35, -0.26);
    body.add(torchGlow);

    this.group.add(root);
    return {
      id: p.id,
      root,
      body,
      legL,
      legR,
      armL,
      armR,
      head,
      tag,
      tagTex,
      torch,
      torchGlow,
      buffer: [],
      walk: 0,
      lastPos: new THREE.Vector3(p.x, p.y, p.z),
      name: p.name,
      connected: p.connected,
      downed: p.downed,
    };
  }

  /** Feed a snapshot from the server. */
  push(frame: PlayersFrame): void {
    const local = performance.now();
    const offset = frame.t - local;
    // keep the smallest offset seen recently (least network delay), drift slowly
    this.clockOffset = this.clockOffset === null ? offset : Math.min(this.clockOffset + 2, offset);

    const seen = new Set<string>();
    for (const p of frame.players) {
      if (p.id === this.selfId) continue;
      seen.add(p.id);
      let a = this.avatars.get(p.id);
      if (!a) {
        a = this.create(p);
        this.avatars.set(p.id, a);
        a.root.position.set(p.x, p.y, p.z);
      }
      if (a.connected !== p.connected || a.name !== p.name) {
        a.connected = p.connected;
        a.name = p.name;
        a.tagTex.dispose();
        a.tagTex = nameTexture(p.name, !p.connected);
        (a.tag.material as THREE.SpriteMaterial).map = a.tagTex;
        (a.tag.material as THREE.SpriteMaterial).needsUpdate = true;
      }
      a.downed = p.downed;
      a.buffer.push({ t: frame.t, p });
      if (a.buffer.length > 30) a.buffer.splice(0, a.buffer.length - 30);
    }
    for (const [id, a] of this.avatars) {
      if (!seen.has(id)) this.remove(a);
    }
  }

  private remove(a: Avatar): void {
    a.root.removeFromParent();
    a.tagTex.dispose();
    (a.tag.material as THREE.SpriteMaterial).dispose();
    (a.torchGlow.material as THREE.Material).dispose();
    a.torch.dispose();
    this.avatars.delete(a.id);
  }

  /** Positions every avatar for this frame. */
  update(dt: number, camera: THREE.Camera): void {
    if (this.clockOffset === null) return;
    const renderT = performance.now() + this.clockOffset - INTERP_DELAY_MS;
    // torches nearest to the camera get real lights; the rest only glow
    const byDistance = [...this.avatars.values()].sort(
      (a, b) => a.root.position.distanceToSquared(camera.position) - b.root.position.distanceToSquared(camera.position),
    );
    byDistance.forEach((a, i) => this.updateAvatar(a, renderT, dt, i < this.maxTorches));
  }

  private updateAvatar(a: Avatar, renderT: number, dt: number, torchAllowed: boolean): void {
    const buf = a.buffer;
    if (!buf.length) return;
    // drop snapshots we no longer need
    while (buf.length > 2 && buf[1].t <= renderT) buf.shift();
    let p: NetPlayer;
    let yaw: number;
    let pitch: number;
    let crouch: number;
    if (buf.length >= 2 && buf[0].t <= renderT) {
      const [s0, s1] = buf;
      const k = Math.min(1, (renderT - s0.t) / Math.max(1, s1.t - s0.t));
      p = s1.p;
      this.tmp.set(s0.p.x + (s1.p.x - s0.p.x) * k, s0.p.y + (s1.p.y - s0.p.y) * k, s0.p.z + (s1.p.z - s0.p.z) * k);
      yaw = s0.p.yaw + angleDelta(s0.p.yaw, s1.p.yaw) * k;
      pitch = s0.p.pitch + (s1.p.pitch - s0.p.pitch) * k;
      crouch = s0.p.crouch + (s1.p.crouch - s0.p.crouch) * k;
    } else {
      p = buf[buf.length - 1].p;
      this.tmp.set(p.x, p.y, p.z);
      yaw = p.yaw;
      pitch = p.pitch;
      crouch = p.crouch;
    }

    // teleported (portal / correction): don't slide across the map
    if (this.tmp.distanceTo(a.root.position) > 6) a.root.position.copy(this.tmp);
    else a.root.position.lerp(this.tmp, 1 - Math.exp(-dt * 30));
    a.root.rotation.y = yaw;

    // walk cycle from the distance actually covered
    const moved = Math.hypot(a.root.position.x - a.lastPos.x, a.root.position.z - a.lastPos.z);
    a.lastPos.copy(a.root.position);
    const speed = moved / Math.max(dt, 1e-3);
    a.walk += moved * (p.sprinting ? 3.2 : 4.2);
    const swing = Math.min(1, speed / PLAYER.walkSpeed) * (p.sprinting ? 0.75 : 0.5);
    const s = Math.sin(a.walk);
    a.legL.rotation.x = s * swing;
    a.legR.rotation.x = -s * swing;
    a.armL.rotation.x = -s * swing * 0.8;
    a.armR.rotation.x = s * swing * 0.8 - (p.flashlight ? 1.1 : 0); // torch arm raised
    // crouch: lower the body and bend forward a little; downed: lying on the ground
    if (p.downed) {
      a.body.position.y = 0.25;
      a.body.rotation.x = -Math.PI / 2 + 0.15;
    } else {
      a.body.position.y = -crouch * (PLAYER.standHeight - PLAYER.crouchHeight);
      a.body.rotation.x = crouch * 0.35;
    }
    a.head.rotation.x = -pitch * 0.6;
    a.body.visible = true;
    a.root.visible = true;

    // torch follows their view pitch
    a.torch.target.position.set(0.25, 1.35 + Math.sin(pitch) * 6, -Math.cos(pitch) * 6);
    const on = p.flashlight && p.connected;
    a.torch.intensity = on && torchAllowed ? 30 : 0;
    (a.torchGlow.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0;

    // offline players fade (ghostly)
    a.body.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.visible = p.connected || Math.sin(renderT * 0.006) > -0.3;
    });
  }

  /** Teammates lying on the ground (for the revive prompt). */
  downedPlayers(): { id: string; name: string; x: number; y: number; z: number }[] {
    return [...this.avatars.values()]
      .filter((a) => a.downed && a.connected)
      .map((a) => ({ id: a.id, name: a.name, x: a.root.position.x, y: a.root.position.y, z: a.root.position.z }));
  }

  positions(): { name: string; x: number; z: number; connected: boolean }[] {
    return [...this.avatars.values()].map((a) => ({ name: a.name, x: a.root.position.x, z: a.root.position.z, connected: a.connected }));
  }

  /** Names of the players currently in the world (for the HUD). */
  roster(): { name: string; connected: boolean }[] {
    return [...this.avatars.values()].map((a) => ({ name: a.name, connected: a.connected }));
  }

  dispose(): void {
    for (const a of [...this.avatars.values()]) this.remove(a);
    this.shared.skin.dispose();
    this.shared.pants.dispose();
    this.shared.jackets.forEach((j) => j.dispose());
    this.shared.geos.forEach((g) => g.dispose());
    this.group.removeFromParent();
  }
}
