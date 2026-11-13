import { CollisionWorld, type Surface } from './collision';
import { clamp } from './math';

/**
 * First-person character movement. Pure and deterministic: the client runs
 * it every frame for responsive controls, and the server can run the very
 * same function to check that reported positions are possible.
 */

export const PLAYER = {
  radius: 0.3,
  standHeight: 1.75,
  crouchHeight: 1.1,
  /** Eye height below the top of the head. */
  eyeOffset: 0.12,
  walkSpeed: 2.7,
  sprintSpeed: 4.8,
  crouchSpeed: 1.35,
  /** Ground acceleration / braking (m/s²). */
  accel: 16,
  brake: 14,
  airControl: 0.25,
  gravity: 20,
  maxFall: 30,
  /** Highest ledge you can walk up without jumping (stairs ≈ 0.33). */
  stepHeight: 0.4,
  /** Drops smaller than this keep you glued to the ground (walking downstairs). */
  snapDown: 0.45,
  /** Seconds to go from standing to crouched. */
  crouchTime: 0.22,
  /** Stamina: full sprint lasts ~6.5 s, regenerates after a short pause. */
  staminaDrain: 1 / 6.5,
  staminaRegen: 1 / 5,
  staminaRegenDelay: 0.9,
  /** Once empty you must recover to this level before sprinting again. */
  staminaRecover: 0.3,
  pitchLimit: Math.PI / 2 - 0.02,
} as const;

export interface MoveInput {
  /** −1…1: forward (+) / back (−). */
  forward: number;
  /** −1…1: right (+) / left (−). */
  right: number;
  sprint: boolean;
  crouch: boolean;
  /** View angles (radians). yaw 0 looks down −Z, positive yaw turns left. */
  yaw: number;
  pitch: number;
}

export interface PlayerState {
  x: number;
  /** Feet height. */
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  /** 0 = standing, 1 = fully crouched. */
  crouch: number;
  stamina: number;
  exhausted: boolean;
  /** Seconds since stamina was last used. */
  restTime: number;
  grounded: boolean;
  surface: Surface;
  sprinting: boolean;
  /** Horizontal distance walked on the ground (drives footsteps / head bob). */
  stride: number;
  /** True if a wall stopped the player this step. */
  blocked: boolean;
}

export function createPlayerState(x: number, z: number, yaw: number, world: CollisionWorld): PlayerState {
  const g = world.groundAt(x, z, Number.POSITIVE_INFINITY);
  return {
    x,
    y: g.height,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    pitch: 0,
    crouch: 0,
    stamina: 1,
    exhausted: false,
    restTime: 10,
    grounded: true,
    surface: g.surface,
    sprinting: false,
    stride: 0,
    blocked: false,
  };
}

export const bodyHeight = (s: PlayerState) => PLAYER.standHeight + (PLAYER.crouchHeight - PLAYER.standHeight) * s.crouch;
export const eyeHeight = (s: PlayerState) => bodyHeight(s) - PLAYER.eyeOffset;

const MAX_SUBSTEP = 0.12; // metres per collision sub-step (smaller than the radius)

/** Advance one player by `dt` seconds. Mutates and returns `s`. */
export function stepPlayer(s: PlayerState, input: MoveInput, dt: number, world: CollisionWorld): PlayerState {
  dt = clamp(dt, 0, 0.1);
  s.yaw = input.yaw;
  s.pitch = clamp(input.pitch, -PLAYER.pitchLimit, PLAYER.pitchLimit);

  // ── crouch (can't stand up under something low) ──
  const wantCrouch = input.crouch;
  if (wantCrouch) {
    s.crouch = Math.min(1, s.crouch + dt / PLAYER.crouchTime);
  } else if (s.crouch > 0) {
    const next = Math.max(0, s.crouch - dt / PLAYER.crouchTime);
    const nextHeight = PLAYER.standHeight + (PLAYER.crouchHeight - PLAYER.standHeight) * next;
    if (!world.overlaps(s.x, s.z, PLAYER.radius * 0.95, s.y + bodyHeight(s) - 0.01, s.y + nextHeight)) s.crouch = next;
  }

  // ── wish direction ──
  let f = clamp(input.forward, -1, 1);
  let r = clamp(input.right, -1, 1);
  const len = Math.hypot(f, r);
  if (len > 1) {
    f /= len;
    r /= len;
  }
  const moving = len > 0.01;
  const sin = Math.sin(s.yaw);
  const cos = Math.cos(s.yaw);
  // forward = (−sin, −cos), right = (cos, −sin)
  const dirX = -sin * f + cos * r;
  const dirZ = -cos * f - sin * r;

  // ── stamina & speed ──
  const canSprint = input.sprint && moving && f > 0.1 && s.crouch < 0.5 && !s.exhausted && s.grounded;
  s.sprinting = canSprint;
  if (canSprint) {
    s.stamina = Math.max(0, s.stamina - PLAYER.staminaDrain * dt);
    s.restTime = 0;
    if (s.stamina <= 0) s.exhausted = true;
  } else {
    s.restTime += dt;
    if (s.restTime >= PLAYER.staminaRegenDelay) s.stamina = Math.min(1, s.stamina + PLAYER.staminaRegen * dt);
    if (s.exhausted && s.stamina >= PLAYER.staminaRecover) s.exhausted = false;
  }
  const baseSpeed = canSprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const speed = baseSpeed + (PLAYER.crouchSpeed - baseSpeed) * s.crouch * (canSprint ? 0 : 1);
  // moving backwards / sideways is a little slower – feels heavier, more grounded
  const dirScale = f < -0.1 ? 0.75 : 1;
  const targetX = dirX * speed * dirScale;
  const targetZ = dirZ * speed * dirScale;

  // ── acceleration ──
  const control = s.grounded ? 1 : PLAYER.airControl;
  const rate = (moving ? PLAYER.accel : PLAYER.brake) * control * dt;
  const dvx = targetX - s.vx;
  const dvz = targetZ - s.vz;
  const dv = Math.hypot(dvx, dvz);
  if (dv <= rate || dv < 1e-6) {
    s.vx = targetX;
    s.vz = targetZ;
  } else {
    s.vx += (dvx / dv) * rate;
    s.vz += (dvz / dv) * rate;
  }

  // ── horizontal move with collision, in small sub-steps ──
  const height = bodyHeight(s);
  const travel = Math.hypot(s.vx, s.vz) * dt;
  const steps = Math.max(1, Math.ceil(travel / MAX_SUBSTEP));
  const startX = s.x;
  const startZ = s.z;
  s.blocked = false;
  for (let i = 0; i < steps; i++) {
    const nx = s.x + (s.vx * dt) / steps;
    const nz = s.z + (s.vz * dt) / steps;
    const res = world.resolve(nx, nz, PLAYER.radius, s.y + PLAYER.stepHeight, s.y + height);
    if (res.hit) s.blocked = true;
    s.x = res.x;
    s.z = res.z;
    // follow the ground while walking so stairs work inside one frame
    if (s.grounded) {
      const g = world.groundAt(s.x, s.z, s.y + PLAYER.stepHeight);
      if (g.height >= s.y - PLAYER.snapDown) {
        s.y = g.height;
        s.surface = g.surface;
      }
    }
  }
  // velocity loses the component that hit a wall (prevents sliding speed build-up)
  if (s.blocked && dt > 0) {
    s.vx = (s.x - startX) / dt;
    s.vz = (s.z - startZ) / dt;
  }

  // ── vertical ──
  const ground = world.groundAt(s.x, s.z, s.y + PLAYER.stepHeight);
  if (s.grounded && ground.height >= s.y - PLAYER.snapDown && s.vy <= 0) {
    s.y = ground.height;
    s.vy = 0;
    s.surface = ground.surface;
  } else {
    s.vy = Math.max(-PLAYER.maxFall, s.vy - PLAYER.gravity * dt);
    s.y += s.vy * dt;
    if (s.y <= ground.height) {
      s.y = ground.height;
      s.vy = 0;
      s.grounded = true;
      s.surface = ground.surface;
    } else {
      s.grounded = false;
    }
  }

  if (s.grounded) s.stride += Math.hypot(s.x - startX, s.z - startZ);
  return s;
}
