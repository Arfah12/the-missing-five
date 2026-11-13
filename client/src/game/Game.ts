import * as THREE from 'three';
import {
  CLIENT_SEND_HZ,
  DOCS,
  INTERACTABLES,
  INTERACT_RANGE,
  KAMPUNG_LANDMARKS,
  LOCKED_AT_START,
  PORTALS,
  areaAt,
  PLAYER,
  buildGameWorld,
  createPlayerState,
  eyeHeight,
  stepPlayer,
  type CollisionWorld,
  type Correction,
  type NetPlayer,
  type PlayerNetInput,
  type GameEvent,
  type PlayerState,
  type PlayersFrame,
  type PrivateState,
  type WorldSnapshot,
} from '@tmf/shared';
import { audio } from '../audio/AudioManager';
import { QUALITY, type QualityPreset } from '../engine/quality';
import type { Quality } from '../lib/settings';
import { Flashlight } from './Flashlight';
import { Input } from './Input';
import { ItemsView } from './ItemsView';
import { RemotePlayers } from './RemotePlayers';
import { Weather } from './Weather';
import { WatcherView } from './WatcherView';
import { DynamicResolution } from './DynamicResolution';
import { FOG_COLOR, FOG_DENSITY, WorldScene } from './world/WorldScene';

export interface GameSettings {
  quality: Quality;
  brightness: number;
  fov: number;
  mouseSensitivity: number;
  invertY: boolean;
}

export interface HudState {
  stamina: number;
  exhausted: boolean;
  battery: number;
  flashlight: boolean;
  crouching: boolean;
  sprinting: boolean;
  /** Other players in the game. */
  roster: { name: string; connected: boolean }[];
  /** What E would do right now. */
  target: InteractTarget | null;
  health: number;
  downed: boolean;
  bleedout: number;
  /** 0…1, drives the vignette and heartbeat. */
  fear: number;
  /** 0…1 while holding E on a downed teammate. */
  revive: number;
  /** 0…1 red flash after being hit. */
  hurt: number;
  /** A scare is messing with your eyes. */
  distort: boolean;
  /** Only filled in debug mode (?debug in the URL). */
  debug?: { fps: number; x: number; y: number; z: number; surface: string; calls: number; tris: number; watcher: string };
}

export interface InteractTarget {
  /** Item id, interactable id or player id. */
  id: string;
  kind: 'item' | 'door' | 'padlock' | 'pry' | 'fusebox' | 'radio' | 'lever' | 'readable' | 'altar' | 'car' | 'player';
  verb: string;
  name: string;
}

/** How the game talks to the server (kept abstract so the game stays testable). */
export interface GameNet {
  selfId: string;
  /** Where the server says we are when the game starts / after a reconnect. */
  you: NetPlayer;
  send(state: PlayerNetInput): void;
  onFrame(fn: (frame: PlayersFrame) => void): () => void;
  onCorrection(fn: (c: Correction) => void): () => void;
  /** Ask the server to move us through a hatch / ladder / well. */
  portal(id: string): Promise<boolean>;
  world: WorldSnapshot | null;
  me: PrivateState | null;
  onWorld(fn: (w: WorldSnapshot) => void): () => void;
  onMe(fn: (me: PrivateState) => void): () => void;
  onEvent(fn: (e: GameEvent) => void): () => void;
}

export interface GameCallbacks {
  onHud(state: HudState): void;
  /** Pointer lock gained (playing) or lost (show pause / click-to-play). */
  onLockChange(locked: boolean): void;
  /** Player walked into a named place. */
  onLandmark(name: string): void;
  /** Player entered one of the seven areas. */
  onArea(name: string): void;
  /** M pressed. */
  onToggleMap(): void;
  /** A whispered line to show as a subtitle. */
  onWhisper?(text: string): void;
  /** A portal is being used (fade the screen). */
  onTravel(label: string): void;
  /** E pressed (or released, for reviving) while looking at something. */
  onInteract(target: InteractTarget, phase: 'press' | 'release'): void;
  /** Tab / J / G pressed while playing. */
  onKey(key: 'inventory' | 'journal' | 'drop'): void;
  /** Something broke (WebGL context lost, init failure). */
  onFatal(message: string): void;
}

/** Radians of view rotation per pixel of mouse movement at sensitivity 1. */
const MOUSE_RADIANS_PER_PIXEL = 0.0022;

/**
 * The 3D game: renderer, world, local player and the frame loop.
 * React only hosts the canvas and draws the HUD on top.
 */
export class Game {
  private renderer!: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 110);
  private world!: CollisionWorld;
  private env!: WorldScene;
  private flashlight!: Flashlight;
  private weather!: Weather;
  private input!: Input;
  private player!: PlayerState;
  private preset: QualityPreset;
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;

  private raf = 0;
  private running = false;
  private disposed = false;
  private last = 0;
  private time = 0;
  private yaw = 0;
  private pitch = 0;
  private eyeY = 0;
  private bobPhase = 0;
  private bobAmount = 0;
  private landDip = 0;
  private fallSpeed = 0;
  private wasGrounded = true;
  private landmark: string | null = null;
  private hudTimer = 0;
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;
  private readonly debug = new URLSearchParams(window.location.search).has('debug');
  private remotes!: RemotePlayers;
  private unsubs: (() => void)[] = [];
  private sendTimer = 0;
  private area = '';
  private portalBusy = false;
  private portalCooldown = 0;
  private seq = 0;
  private lastSent = '';
  private items!: ItemsView;
  private worldState: WorldSnapshot | null = null;
  private me: PrivateState | null = null;
  private uiOpen = false;
  private target: InteractTarget | null = null;
  private holding: InteractTarget | null = null;
  private holdTime = 0;
  private fear = 0.2;
  private watcherView!: WatcherView;
  private dynres: DynamicResolution | null = null;
  private shake = 0;
  private hurt = 0;
  private flickerUntil = 0;
  private distortUntil = 0;
  private heartTimer = 0;
  private lightningFear = 0;

  constructor(
    private readonly container: HTMLElement,
    private settings: GameSettings,
    private readonly cb: GameCallbacks,
    private readonly net: GameNet,
  ) {
    this.preset = QUALITY[settings.quality];
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.tabIndex = -1;
  }

  /** Build everything. Resolves when the first frame can be drawn. */
  async init(): Promise<void> {
    const q = this.preset;
    this.container.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.settings.brightness;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(FOG_COLOR);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
    this.camera.fov = this.settings.fov;

    this.world = buildGameWorld();
    const env = await WorldScene.create(q);
    if (this.disposed) {
      env.dispose(); // the player left during loading
      return;
    }
    this.env = env;
    this.scene.add(this.env.root);

    const you = this.net.you;
    this.player = createPlayerState(you.x, you.z, you.yaw, this.world);
    this.player.y = you.y;
    this.yaw = you.yaw;
    this.pitch = you.pitch;

    this.remotes = new RemotePlayers(this.scene, this.net.selfId);
    this.watcherView = new WatcherView(this.scene);
    this.items = new ItemsView(this.scene);
    if (this.net.world) this.applyWorld(this.net.world);
    if (this.net.me) this.me = this.net.me;
    this.unsubs.push(
      this.net.onFrame((f) => {
        this.remotes.push(f);
        this.watcherView?.setState(f.watcher ?? null);
      }),
      this.net.onCorrection((c) => this.applyCorrection(c)),
      this.net.onWorld((w) => this.applyWorld(w)),
      this.net.onMe((me) => (this.me = me)),
      this.net.onEvent((e) => this.onEvent(e)),
    );
    this.eyeY = this.player.y + eyeHeight(this.player);
    this.scene.add(this.camera);

    this.flashlight = new Flashlight(this.camera, this.scene, { enabled: q.shadows, mapSize: Math.min(1024, q.shadowMapSize) });
    this.weather = new Weather(
      this.scene,
      q.rainDrops,
      this.env.flash,
      this.env.hemi,
      (x, z, y) => this.env.isSheltered(x, z, y),
      (strength, delay) => {
        audio.thunder(delay, strength);
        this.lightningFear = 0.35 * strength;
      },
    );

    this.input = new Input(this.canvas);
    this.input.onLockChange = (locked) => this.cb.onLockChange(locked);
    this.input.attach();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.updateCamera(0);
    // compile shaders now rather than on the first frame (avoids a hitch)
    this.renderer.compile(this.scene, this.camera);
    this.start();
  }

  /** Call from a click handler: captures the mouse and starts playing. */
  requestPlay(): void {
    audio.unlock();
    audio.startAmbience();
    this.input?.requestPointer();
  }

  releasePointer(): void {
    this.input?.releasePointer();
  }

  applySettings(next: GameSettings): void {
    const prev = this.settings;
    this.settings = next;
    if (!this.renderer) return;
    this.renderer.toneMappingExposure = next.brightness;
    if (next.fov !== prev.fov) {
      this.camera.fov = next.fov;
      this.camera.updateProjectionMatrix();
    }
    // quality changes need a rebuild – the UI remounts the game for that
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      try {
        this.frame(dt);
      } catch (err) {
        this.stop();
        console.error(err);
        this.cb.onFatal(err instanceof Error ? err.message : String(err));
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(dt: number): void {
    this.time += dt;
    const locked = this.input.isLocked;
    const downed = this.me?.downed === true;
    const playing = locked && !this.uiOpen;

    if (locked && !this.uiOpen) {
      const [mx, my] = this.input.takeMouse();
      const k = MOUSE_RADIANS_PER_PIXEL * this.settings.mouseSensitivity;
      this.yaw -= mx * k;
      this.pitch -= my * k * (this.settings.invertY ? -1 : 1);
      this.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, this.pitch));
      if (this.input.consume('flashlight')) {
        const on = this.flashlight.toggle();
        audio.flashlight(on);
      }
      this.handleInteractKey(dt);
      if (this.input.consume('map')) this.cb.onToggleMap();
      if (this.input.consume('inventory')) this.cb.onKey('inventory');
      if (this.input.consume('journal')) this.cb.onKey('journal');
      if (this.input.consume('drop')) this.cb.onKey('drop');
    }

    const axis = playing && !downed ? this.input.axis() : { forward: 0, right: 0 };
    const s = this.player;
    const before = { x: s.x, z: s.z };
    const vyBefore = s.vy;
    stepPlayer(
      s,
      {
        forward: axis.forward,
        right: axis.right,
        sprint: playing && !downed && this.input.isHeld('sprint'),
        crouch: (playing && this.input.isHeld('crouch')) || downed,
        yaw: this.yaw,
        pitch: this.pitch,
      },
      dt,
      this.world,
    );

    // landing
    if (!s.grounded) this.fallSpeed = Math.min(this.fallSpeed, vyBefore);
    if (s.grounded && !this.wasGrounded) {
      const impact = Math.min(1, -this.fallSpeed / 9);
      if (impact > 0.25) {
        audio.land(impact);
        this.landDip = 0.12 * impact;
      }
      audio.footstep(s.surface, 0.8);
      this.fallSpeed = 0;
    }
    this.wasGrounded = s.grounded;

    // footsteps and head bob follow the distance actually walked
    const moved = Math.hypot(s.x - before.x, s.z - before.z);
    const stepLen = s.sprinting ? 0.95 : s.crouch > 0.5 ? 0.6 : 0.78;
    if (s.grounded && moved > 0.0005) {
      const prevStep = Math.floor(this.bobPhase / Math.PI);
      this.bobPhase += (moved / stepLen) * Math.PI;
      if (Math.floor(this.bobPhase / Math.PI) !== prevStep) {
        audio.footstep(s.surface, s.sprinting ? 1 : s.crouch > 0.5 ? 0.25 : 0.6);
      }
    }
    const speed = moved / Math.max(dt, 1e-4);
    const targetBob = s.grounded ? Math.min(1, speed / PLAYER.walkSpeed) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * (1 - Math.exp(-dt * 8));

    this.updateCamera(dt);
    this.flashlight.update(dt);
    this.env.followShadows(s.x, s.z);
    const area = areaAt(s.x, s.z);
    this.env.updateMood(area.id, dt, this.scene.fog as THREE.FogExp2);
    if (area.name !== this.area) {
      this.area = area.name;
      this.cb.onArea(area.name);
    }
    this.env.update(this.time, dt, this.camera);
    this.weather.update(this.time, dt, this.camera.position, this.env.mood.hemi, this.env.mood.flash);
    this.checkPortals(dt);
    audio.setIndoors(this.env.isIndoors(s.x, s.z));
    this.checkLandmarks();

    this.remotes.update(dt, this.camera);
    this.watcherView.update(dt, this.camera);
    audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.yaw);
    this.updateScares(dt);
    audio.setMusic(this.watcherView.mode === 'chase' ? 'chase' : this.fear > 0.5 || this.watcherView.mode !== 'hidden' ? 'tense' : 'calm');
    this.items.update(this.time, this.camera);
    this.target = locked && !downed ? this.findTarget() : null;
    this.items.highlight(this.target?.kind === 'item' ? this.target.id : null);
    this.updateFear(dt, area.underground === true, area.id === 'forest');
    this.sendState(dt);

    this.renderer.render(this.scene, this.camera);
    this.reportHud(dt);
    // weaker PC? render fewer pixels rather than stutter
    if (this.dynres?.frame(dt)) this.resize();
  }

  /** Report our position ~15×/s (and at least once a second when idle). */
  private sendState(dt: number): void {
    this.sendTimer += dt;
    if (this.sendTimer < 1 / CLIENT_SEND_HZ) return;
    const s = this.player;
    const state: PlayerNetInput = {
      seq: ++this.seq,
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: this.yaw,
      pitch: this.pitch,
      crouch: s.crouch,
      flashlight: this.flashlight.isOn,
      sprinting: s.sprinting,
    };
    const key = `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.z.toFixed(3)},${this.yaw.toFixed(3)},${this.pitch.toFixed(3)},${s.crouch.toFixed(2)},${state.flashlight}`;
    if (key === this.lastSent && this.sendTimer < 1) return;
    this.lastSent = key;
    this.sendTimer = 0;
    this.net.send(state);
  }

  /** The server rejected our movement or teleported us. */
  applyCorrection(c: Correction): void {
    const s = this.player;
    if (!s) return;
    s.x = c.x;
    s.y = c.y;
    s.z = c.z;
    s.vx = s.vy = s.vz = 0;
    s.grounded = true;
    if (c.yaw !== undefined) this.yaw = c.yaw;
    if (c.teleport) this.eyeY = s.y + eyeHeight(s);
    this.lastSent = '';
  }

  /** After a reconnect: trust our own position unless the server disagrees a lot. */
  resync(you: NetPlayer): void {
    const s = this.player;
    if (!s) return;
    if (Math.hypot(s.x - you.x, s.z - you.z) > 1.5 || Math.abs(s.y - you.y) > 1) {
      this.applyCorrection({ x: you.x, y: you.y, z: you.z, teleport: true });
    }
    this.lastSent = '';
  }

  private updateCamera(dt: number): void {
    const s = this.player;
    const target = s.y + eyeHeight(s);
    // smooth out stair steps while walking; follow falls exactly
    if (dt === 0 || !s.grounded) this.eyeY = target;
    else this.eyeY += (target - this.eyeY) * (1 - Math.exp(-dt * 16));
    this.landDip *= Math.exp(-dt * 7);

    const sprintBoost = s.sprinting ? 1.5 : 1;
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.045 * this.bobAmount * sprintBoost;
    const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmount * sprintBoost;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(s.x + right.x * bobX, this.eyeY + bobY - this.landDip, s.z + right.z * bobX);
    this.camera.rotation.set(this.pitch, this.yaw, Math.cos(this.bobPhase) * 0.004 * this.bobAmount, 'YXZ');

    // tiny FOV kick while sprinting
    // knocked down: the view drops to the floor and tilts
    if (this.me?.downed) {
      this.camera.position.y = s.y + 0.45;
      this.camera.rotation.z = 0.35;
    }
    const fov = this.settings.fov + (s.sprinting ? 4 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 6));
      this.camera.updateProjectionMatrix();
    }
  }

  /** Walk-in portals: ask the server, which teleports us if it agrees. */
  private checkPortals(dt: number): void {
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    if (this.portalBusy || this.portalCooldown > 0) return;
    const s = this.player;
    for (const p of PORTALS) {
      if (Math.hypot(s.x - p.from.x, s.z - p.from.z) > p.from.r) continue;
      if (p.requiresOpen && !this.world.isOpen(p.requiresOpen)) continue;
      this.portalBusy = true;
      this.cb.onTravel(p.label);
      void this.net.portal(p.id).then((ok) => {
        this.portalBusy = false;
        this.portalCooldown = ok ? 1.5 : 3;
      });
      return;
    }
  }

  /* ───────────────────────── gameplay ───────────────────────── */

  /** Keyboard panels (inventory, documents, puzzles) freeze movement and look. */
  setUiOpen(open: boolean): void {
    this.uiOpen = open;
    if (this.input) {
      this.input.passthrough = open;
      if (open) this.input.clear();
    }
  }

  private applyWorld(w: WorldSnapshot): void {
    this.worldState = w;
    this.items?.sync(w.items);
    for (const id of LOCKED_AT_START) {
      const open = w.open.includes(id);
      this.world?.setOpen(id, open);
      this.env?.setOpen(id, open);
    }
    this.env?.setPower(w.power);
  }

  private onEvent(e: GameEvent): void {
    if (e.type === 'horror') {
      audio.horror(e.kind, e.x, e.y, e.z, this.env?.isIndoors(e.x, e.z) ?? false);
      if (e.line) this.cb.onWhisper?.(e.line);
      if (e.kind === 'flicker') {
        this.flickerUntil = this.time + 1.8;
        this.flashlight?.stutter(1.8);
      }
      if (e.kind === 'silhouette' && this.player) this.watcherView?.showSilhouette(e.x, e.y, e.z, this.player);
      if (e.kind === 'illusion') this.distortUntil = this.time + 1.6;
      this.lightningFear = Math.max(this.lightningFear, 0.25);
      return;
    }
    if (e.type === 'chase') {
      audio.watcher('scream', e.x, e.y + 2, e.z);
      audio.stinger();
      this.lightningFear = 0.5;
      return;
    }
    if (e.type === 'hit') {
      this.shake = 0.7;
      this.hurt = 1;
      this.lightningFear = 0.6;
      return;
    }
    if (e.type === 'sfx' && (e.sound === 'vanish' || e.sound === 'watcherHit' || e.sound === 'doorSlam')) {
      const x = e.x ?? this.player?.x ?? 0;
      const y = e.y ?? 1;
      const z = e.z ?? this.player?.z ?? 0;
      if (e.sound === 'doorSlam') {
        audio.horror('doorSlam', x, y, z);
        this.lightningFear = Math.max(this.lightningFear, 0.3);
      } else audio.watcher(e.sound === 'vanish' ? 'vanish' : 'hit', x, y, z);
      return;
    }
    if (e.type === 'recharge') {
      this.flashlight?.recharge(e.amount);
      return;
    }
    if (e.type === 'sfx') {
      let gain = 1;
      if (e.x !== undefined && e.z !== undefined && this.player) {
        const d = Math.hypot(this.player.x - e.x, this.player.z - e.z);
        gain = Math.max(0, 1 - d / 30);
      }
      audio.sfx(e.sound as Parameters<typeof audio.sfx>[0], gain);
      if (e.sound === 'gate' || e.sound === 'trip') this.lightningFear = 0.3;
      return;
    }
    if (e.type === 'found') audio.sfx('page', 0.8);
  }

  private handleInteractKey(dt: number): void {
    const pressed = this.input.consume('interact');
    const held = this.input.isHeld('interact');
    if (this.holding) {
      // reviving: keep holding E while looking at them
      if (!held || this.target?.id !== this.holding.id) {
        this.cb.onInteract(this.holding, 'release');
        this.holding = null;
        this.holdTime = 0;
      } else {
        this.holdTime += dt;
      }
      return;
    }
    if (!pressed || !this.target || this.me?.downed) return;
    this.cb.onInteract(this.target, 'press');
    if (this.target.kind === 'player') {
      this.holding = this.target;
      this.holdTime = 0;
    }
  }

  /** What's in front of us and within reach. */
  private findTarget(): InteractTarget | null {
    // Plain math from the view angles: forward = (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch)
    const s = this.player;
    const eye = { x: s.x, y: this.eyeY, z: s.z };
    const cp = Math.cos(this.pitch);
    const dir = { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
    let best: { t: InteractTarget; score: number } | null = null;
    const consider = (t: InteractTarget, x: number, y: number, z: number, reach = INTERACT_RANGE) => {
      const vx = x - eye.x;
      const vy = y - eye.y;
      const vz = z - eye.z;
      const d = Math.hypot(vx, vy, vz);
      if (d > reach) return;
      const dot = d < 0.6 ? 1 : (vx * dir.x + vy * dir.y + vz * dir.z) / d;
      if (dot < 0.8) return;
      const score = dot - d * 0.05;
      if (best && best.score >= score) return;
      if (!this.lineClear(eye, x, y, z)) return;
      best = { t, score };
    };
    const w = this.worldState;
    if (w) {
      for (const it of w.items) {
        const doc = it.doc ? DOCS[it.doc] : undefined;
        consider({ id: it.id, kind: 'item', verb: doc ? 'Pick up' : 'Take', name: it.name }, it.x, it.y + 0.05, it.z);
      }
      for (const it of INTERACTABLES) {
        const open = w.open.includes(it.opens ?? it.id);
        const unlocked = w.unlocked.includes(it.opens ?? it.id);
        let verb: string;
        switch (it.kind) {
          case 'door':
            verb = unlocked ? (open ? 'Close' : 'Open') : 'Try';
            break;
          case 'padlock':
            verb = unlocked ? (open ? 'Close' : 'Open') : 'Enter code on';
            break;
          case 'pry':
            if (open) continue;
            verb = 'Pry open';
            break;
          case 'fusebox':
            verb = w.power ? 'Look at' : 'Open';
            break;
          case 'radio':
            verb = 'Tune';
            break;
          case 'lever':
            verb = 'Pull';
            break;
          case 'altar':
            verb = 'Kneel at';
            break;
          case 'car':
            verb = 'Get in';
            break;
          default:
            verb = 'Read';
        }
        consider({ id: it.id, kind: it.kind, verb, name: it.label }, it.x, it.y, it.z, INTERACT_RANGE + 0.3);
      }
    }
    for (const r of this.remotes.downedPlayers()) {
      consider({ id: r.id, kind: 'player', verb: 'Hold E to help up', name: r.name }, r.x, r.y + 0.4, r.z, 2.4);
    }
    return (best as { t: InteractTarget } | null)?.t ?? null;
  }

  /** No wall between the eye and the thing (cheap sampling against the collision boxes). */
  private lineClear(eye: { x: number; y: number; z: number }, x: number, y: number, z: number): boolean {
    const dx = x - eye.x;
    const dy = y - eye.y;
    const dz = z - eye.z;
    const len = Math.hypot(dx, dy, dz);
    const steps = Math.floor((len - 0.35) / 0.15);
    for (let i = 1; i <= steps; i++) {
      const k = (i * 0.15) / len;
      const px = eye.x + dx * k;
      const py = eye.y + dy * k;
      const pz = eye.z + dz * k;
      if (this.world.overlaps(px, pz, 0.03, py - 0.02, py + 0.02)) return false;
    }
    return true;
  }

  /** Fear: darkness, being alone, being underground, sudden events. */
  private updateFear(dt: number, underground: boolean, forest: boolean): void {
    const s = this.player;
    const torch = this.flashlight.isOn;
    const mates = this.remotes.positions().filter((p) => p.connected && Math.hypot(p.x - s.x, p.z - s.z) < 10).length;
    let target = 0.12 + (underground ? 0.3 : 0) + (forest ? 0.18 : 0) + (torch ? 0 : 0.18) + (mates === 0 ? 0.12 : -0.12 * Math.min(2, mates));
    if (this.me && this.me.health < 50) target += 0.15;
    // The Watcher nearby is the worst of it
    const wd = this.watcherView.distanceTo(s.x, s.z);
    if (wd < 30) target += ((30 - wd) / 30) * 0.5 + (this.watcherView.mode === 'chase' ? 0.3 : 0);
    target = Math.max(0, Math.min(1, target + this.lightningFear));
    this.lightningFear = Math.max(0, this.lightningFear - dt * 0.12);
    this.fear += (target - this.fear) * (1 - Math.exp(-dt * 0.6));
    if (this.fear > 0.55) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        audio.heartbeat(Math.min(1, (this.fear - 0.5) * 2));
        this.heartTimer = 1.1 - this.fear * 0.5;
      }
    }
  }

  /** Light flicker, screen shake and the red flash after a hit. */
  private updateScares(dt: number): void {
    const flicker = this.time < this.flickerUntil;
    this.renderer.toneMappingExposure = this.settings.brightness * (flicker && Math.random() < 0.45 ? 0.2 : 1);
    this.shake = Math.max(0, this.shake - dt * 1.4);
    this.hurt = Math.max(0, this.hurt - dt * 0.9);
    if (this.shake > 0) {
      const a = this.shake * 0.06;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.rotation.z += (Math.random() - 0.5) * a * 0.6;
    }
  }

  /** Positions for the map screen. */
  mapState(): { self: { x: number; z: number; yaw: number }; others: { name: string; x: number; z: number; connected: boolean }[] } {
    const s = this.player;
    return { self: { x: s?.x ?? 0, z: s?.z ?? 0, yaw: this.yaw }, others: this.remotes?.positions() ?? [] };
  }

  private checkLandmarks(): void {
    const s = this.player;
    let found: string | null = null;
    for (const l of KAMPUNG_LANDMARKS) {
      if (Math.hypot(s.x - l.x, s.z - l.z) < l.r) {
        found = l.name;
        break;
      }
    }
    if (found && found !== this.landmark) this.cb.onLandmark(found);
    if (found !== this.landmark) this.landmark = found;
  }

  private reportHud(dt: number): void {
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTimer);
      this.frames = 0;
      this.fpsTimer = 0;
    }
    this.hudTimer += dt;
    if (this.hudTimer < 0.1) return;
    this.hudTimer = 0;
    const s = this.player;
    const info = this.renderer.info.render;
    this.cb.onHud({
      hurt: this.hurt,
      distort: this.time < this.distortUntil,
      stamina: s.stamina,
      exhausted: s.exhausted,
      battery: this.flashlight.battery,
      flashlight: this.flashlight.isOn,
      crouching: s.crouch > 0.5,
      sprinting: s.sprinting,
      roster: this.remotes.roster(),
      target: this.target,
      health: this.me?.health ?? 100,
      downed: this.me?.downed ?? false,
      bleedout: this.me?.bleedout ?? 0,
      fear: this.fear,
      revive: this.holding?.kind === 'player' ? Math.min(1, this.holdTime / 3) : 0,
      debug: this.debug
        ? { fps: this.fps, x: s.x, y: s.y, z: s.z, surface: s.surface, calls: Number(info.calls) || 0, tris: Number(info.triangles) || 0, watcher: this.watcherView.mode }
        : undefined,
    });
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const maxRatio = Math.min(window.devicePixelRatio || 1, this.preset.dprCap);
    this.dynres ??= new DynamicResolution(maxRatio, Math.min(maxRatio, 0.6));
    this.renderer.setPixelRatio(Math.min(maxRatio, this.dynres.scale));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.stop();
    this.cb.onFatal('The graphics context was lost (GPU reset or out of memory). Try a lower quality setting.');
  };

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.remotes?.dispose();
    this.resizeObserver?.disconnect();
    this.input?.detach();
    this.weather?.dispose();
    this.flashlight?.dispose();
    this.env?.dispose();
    audio.setIndoors(false);
    audio.setMusic('none');
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
    this.canvas.remove();
  }
}
