import type { ChoiceId, ChoiceOption, Decision } from './endings';
import { CollisionWorld } from './collision';
import {
  CHAMBER_POS,
  CHIEF_POS,
  FORBIDDEN_GATE_ID,
  HUT_POS,
  OLD_WELL_POS,
  KAMPUNG_BOUNDS,
  SCHOOL_POS,
  STOR_POS,
  TUNNEL_X,
  kampungColliders,
  kampungTerrain,
  localToWorld,
} from './maps/kampung';
import { roadX } from './maps/villageEntrance';
import { BUS_STOP, CHAMBER, CHIEF_HOUSE, HALL, SCHOOL, SHOP, STOR, TUNNEL } from './props';
import { DOCS } from './story';

/**
 * Phase 5 gameplay data: what can be picked up, what can be used, the
 * puzzles and the objectives. Positions are world space.
 */

export const INVENTORY_SLOTS = 5;
export const INTERACT_RANGE = 2.2;
/** The server allows a little more (latency, rounding). */
export const INTERACT_RANGE_SERVER = 3.0;
export const MAX_HEALTH = 100;
export const BLEEDOUT_S = 60;
export const REVIVE_S = 3;
export const REVIVE_HEALTH = 35;
export const BATTERY_CHARGE = 0.6;

export type ItemType = 'battery' | 'key' | 'crowbar' | 'diary' | 'cassette' | 'photo' | 'document' | 'belonging';

/** Items that go into the 5-slot inventory; everything else goes to the shared journal. */
export const INVENTORY_TYPES: ReadonlySet<ItemType> = new Set(['battery', 'key', 'crowbar']);

export interface ItemSpawn {
  id: string;
  type: ItemType;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Journal entry it unlocks (documents, diary pages…). */
  doc?: string;
}

export interface WorldItem extends ItemSpawn {}

export interface InvItem {
  id: string;
  type: ItemType;
  name: string;
}

const shop = { x: roadX(-4) - 8.6, z: -4, yaw: Math.PI / 2 };
const warung = { x: roadX(-104) + 9.2, z: -104, yaw: -Math.PI / 2 };
const busStop = { x: roadX(8) + 4.7, z: 8, yaw: -Math.PI / 2 };
const hall = { x: roadX(-112) - 11.5, z: -112, yaw: Math.PI / 2 };
const giantTree = { x: -14, z: -193, yaw: 0.4 };

/** Item in a building, given in that building's local coordinates. */
function at(base: { x: number; z: number; yaw: number }, lx: number, lz: number, y: number) {
  const p = localToWorld(base, lx, lz);
  return { x: p.x, y, z: p.z };
}

const S = SCHOOL;
const C = CHIEF_HOUSE;

export const ITEM_SPAWNS: ItemSpawn[] = [
  // batteries
  { id: 'battery-car', type: 'battery', name: 'Torch Battery', ...{ x: roadX(36) + 1.6, y: 0.05, z: 34.6 } },
  { id: 'battery-shop', type: 'battery', name: 'Torch Battery', ...at(shop, SHOP.counter.x + 0.4, SHOP.counter.z, SHOP.counter.top + 0.03) },
  { id: 'battery-warung', type: 'battery', name: 'Torch Battery', ...at(warung, SHOP.freezer.x, SHOP.freezer.z, SHOP.freezer.top + 0.03) },
  { id: 'battery-school', type: 'battery', name: 'Torch Battery', ...at(SCHOOL_POS, S.classes[0] + 1.8, 0.6, 1.08) },
  { id: 'battery-chief', type: 'battery', name: 'Torch Battery', ...at(CHIEF_POS, 2.6, 2.6, C.floorTop + 0.02) },
  { id: 'battery-hut', type: 'battery', name: 'Torch Battery', ...at(HUT_POS, 0.9, -0.7, 0.58) },
  { id: 'battery-tunnel', type: 'battery', name: 'Torch Battery', x: TUNNEL_X - 0.8, y: 0.05, z: -55 },

  // keys & tools
  { id: 'key-kelas3', type: 'key', name: 'Kunci Kelas 3 Melati', ...at(SCHOOL_POS, S.classes[0] - 1.5, -1.4, 1.08) },
  { id: 'crowbar', type: 'crowbar', name: 'Besi Pengumpil (Crowbar)', ...at(hall, 1.5, HALL.stage.z0 + 0.8, HALL.stage.top + 0.03) },

  // diary pages
  { id: 'diary-1', type: 'diary', name: 'Diary Page', doc: 'diary-1', ...at(SCHOOL_POS, S.classes[2] - 1.4, 0.3, 1.08) },
  { id: 'diary-2', type: 'diary', name: 'Diary Page', doc: 'diary-2', ...at(busStop, 0.6, BUS_STOP.bench.z, BUS_STOP.bench.top + 0.03) },
  { id: 'diary-3', type: 'diary', name: 'Diary Page', doc: 'diary-3', ...at(CHIEF_POS, C.chest.x, C.chest.z, C.chest.top + 0.03) },
  { id: 'diary-4', type: 'diary', name: 'Diary Page', doc: 'diary-4', ...at(HUT_POS, -0.8, -0.5, 0.58) },
  { id: 'diary-5', type: 'diary', name: 'Diary Page', doc: 'diary-5', x: TUNNEL_X + 0.6, y: 0.05, z: -108 },

  // documents
  { id: 'nota-penjaga', type: 'document', name: "Caretaker's Note", doc: 'nota-penjaga', ...at(SCHOOL_POS, S.classes[0] + 1.2, 0.3, 1.08) },
  { id: 'surat-ketua', type: 'document', name: 'Unsent Letter', doc: 'surat-ketua', ...at(CHIEF_POS, C.table.x - 0.3, C.table.z + 0.2, C.table.top + 0.03) },
  { id: 'laporan-polis', type: 'document', name: 'Police Report', doc: 'laporan-polis', ...at(hall, 3, -1.5, HALL.slabTop + 0.02) },

  // cassettes
  { id: 'cassette-1', type: 'cassette', name: 'Cassette Tape', doc: 'cassette-1', ...at(warung, SHOP.counter.x, SHOP.counter.z, SHOP.counter.top + 0.03) },
  { id: 'cassette-2', type: 'cassette', name: 'Cassette Tape', doc: 'cassette-2', ...at(hall, -2, HALL.stage.z0 + 0.9, HALL.stage.top + 0.03) },
  { id: 'cassette-3', type: 'cassette', name: 'Cassette Tape', doc: 'cassette-3', x: 136, y: 0.05, z: -100.6 },

  // photographs
  { id: 'photo-class', type: 'photo', name: 'Old Photograph', doc: 'photo-class', ...at(SCHOOL_POS, S.classes[1], S.teacherDesk.z, S.teacherDesk.top + 0.03) },
  { id: 'photo-shop', type: 'photo', name: 'Old Photograph', doc: 'photo-shop', ...at(shop, SHOP.freezer.x, SHOP.freezer.z, SHOP.freezer.top + 0.03) },
  { id: 'photo-family', type: 'photo', name: 'Old Photograph', doc: 'photo-family', ...at(CHIEF_POS, -3.5, 1.5, C.floorTop + 0.02) },
  { id: 'photo-tree', type: 'photo', name: 'Old Photograph', doc: 'photo-tree', ...at(giantTree, 3.2, 0.6, 0.12) },

  // the children's belongings (main objectives)
  { id: 'belonging-alya', type: 'belonging', name: "Alya's Hair Clip", doc: 'belonging-alya', ...at(SCHOOL_POS, S.classes[2], S.teacherDesk.z, S.teacherDesk.top + 0.03) },
  { id: 'belonging-danish', type: 'belonging', name: "Danish's Sandal", doc: 'belonging-danish', ...at(HUT_POS, 0.4, 0.3, 0.58) },
  { id: 'belonging-mira', type: 'belonging', name: "Mira's Doll", doc: 'belonging-mira', ...at(CHIEF_POS, C.bed.x, C.bed.z, C.bed.top + 0.03) },
  { id: 'belonging-adam', type: 'belonging', name: "Adam's Toy Car", doc: 'belonging-adam', x: TUNNEL_X + 0.4, y: 0.05, z: -70 },
  { id: 'pengakuan', type: 'document', name: "Haji Osman's Confession", doc: 'pengakuan', x: CHAMBER_POS.x - 2.6, y: 0.05, z: CHAMBER_POS.z + 2.4 },
  { id: 'belonging-sofia', type: 'belonging', name: "Sofia's Ribbon", doc: 'belonging-sofia', x: CHAMBER_POS.x, y: 0.05, z: CHAMBER_POS.z },
];

/* ───────────────────────── interactables ───────────────────────── */

export type InteractKind = 'door' | 'fusebox' | 'radio' | 'padlock' | 'pry' | 'lever' | 'readable' | 'altar' | 'car';

export interface Interactable {
  id: string;
  kind: InteractKind;
  label: string;
  x: number;
  y: number;
  z: number;
  /** Doors: the dynamic collider it opens. Pry targets: the id that becomes "open". */
  opens?: string;
  /** Doors locked by an item type / id. */
  needsItem?: string;
  /** Readables: journal entry shown. */
  doc?: string;
}

export const DOOR_KELAS3 = 'door:kelas3';
export const DOOR_STOR = 'door:stor';
export const HATCH_STOR = 'hatch:stor';
export const WELL_PLANKS = 'well:planks';
export const PADLOCK_CODE = '1308';
export const RADIO_FREQ = 98.5;
export const FUSE_ORDER = [2, 0, 3, 1]; // switches 3 – 1 – 4 – 2
export const LEVER_LATCH_COOP_S = 1.5;
export const LEVER_LATCH_SOLO_S = 8;

const kelas3Door = at(SCHOOL_POS, S.classes[2] + S.doorOffset, S.classDepth / 2 - S.wallT / 2, 1.4);
const storDoor = at(STOR_POS, 0, STOR.hz - 0.08, 1.1);
const storHatch = at(STOR_POS, STOR.hatch.x, STOR.hatch.z, 0.3);

export const INTERACTABLES: Interactable[] = [
  { id: DOOR_KELAS3, kind: 'door', label: 'Kelas 3 Melati door', ...kelas3Door, opens: DOOR_KELAS3, needsItem: 'key-kelas3' },
  { id: DOOR_STOR, kind: 'padlock', label: 'Padlocked storeroom door', ...storDoor, opens: DOOR_STOR },
  { id: HATCH_STOR, kind: 'pry', label: 'Nailed-down hatch', ...storHatch, opens: HATCH_STOR, needsItem: 'crowbar' },
  { id: WELL_PLANKS, kind: 'pry', label: 'Planks over the old well', x: OLD_WELL_POS.x, y: 0.9, z: OLD_WELL_POS.z, opens: WELL_PLANKS, needsItem: 'crowbar' },
  { id: 'fusebox', kind: 'fusebox', label: 'Fuse box', ...at(SCHOOL_POS, S.width / 2 - 0.9, S.classDepth / 2 + 0.2, 1.6) },
  { id: 'radio', kind: 'radio', label: 'Old radio', ...at(CHIEF_POS, C.table.x + 0.2, C.table.z - 0.1, C.table.top + 0.1) },
  { id: 'lever-a', kind: 'lever', label: 'Rusty lever', x: 143.5, y: 1.2, z: -100 - TUNNEL.halfWidth + 0.15 },
  { id: 'lever-b', kind: 'lever', label: 'Rusty lever', x: TUNNEL_X + TUNNEL.halfWidth - 0.15, y: 1.2, z: -86 },
  { id: 'calendar', kind: 'readable', label: 'Wall calendar', ...at(shop, -SHOP.width / 2 + 0.2, -1.6, 1.75), doc: 'kalendar' },
  { id: 'altar', kind: 'altar', label: 'Batu Penunggu', x: CHAMBER_POS.x + CHAMBER.stone.x - 0.3, y: 1.0, z: CHAMBER_POS.z },
  { id: 'car', kind: 'car', label: 'Your car', x: roadX(36) + 2.75 - 1.05, y: 1.0, z: 36.35 },
];

/** Dynamic colliders that start closed (and the portals that need them). */
export const LOCKED_AT_START = [DOOR_KELAS3, DOOR_STOR, HATCH_STOR, WELL_PLANKS, FORBIDDEN_GATE_ID];

/** Door leaf colliders (closed state). Built into the collision world by the server and client. */
export function doorColliders() {
  const leaf = (p: { x: number; z: number }, yaw: number, hx: number, y0: number, y1: number, id: string) => ({
    x: p.x,
    z: p.z,
    hx,
    hz: 0.06,
    yaw,
    y0,
    y1,
    surface: 'wood' as const,
    id,
    tag: 'door',
  });
  return [
    leaf(localToWorld(SCHOOL_POS, S.classes[2] + S.doorOffset, S.classDepth / 2 - S.wallT / 2), SCHOOL_POS.yaw, S.doorHalf, S.slabTop, S.doorTop, DOOR_KELAS3),
    leaf(localToWorld(STOR_POS, 0, STOR.hz - 0.08), STOR_POS.yaw, STOR.doorHalf, STOR.floorTop, 2.1, DOOR_STOR),
  ];
}

/* ───────────────────────── objectives ───────────────────────── */

export type ObjectiveId =
  | 'find-alya'
  | 'find-danish'
  | 'find-mira'
  | 'find-adam'
  | 'find-sofia'
  | 'decide'
  | 'escape'
  | 'side-diary'
  | 'side-photos'
  | 'side-power'
  | 'side-cassettes'
  | 'side-secret';

export interface ObjectiveState {
  id: ObjectiveId;
  main: boolean;
  title: string;
  description: string;
  done: boolean;
  /** "2/5" style progress for collection missions. */
  progress?: string;
  /** Not revealed yet (shown as ???). */
  hidden?: boolean;
}

export interface ObjectiveFacts {
  found: ReadonlySet<string>;
  power: boolean;
  secretRoom: boolean;
  /** The choice made at the Batu Penunggu. */
  final?: 'free' | 'sleep' | null;
}

const count = (found: ReadonlySet<string>, prefix: string) => [...found].filter((f) => f.startsWith(prefix)).length;

export function computeObjectives(f: ObjectiveFacts): ObjectiveState[] {
  const kids: [ObjectiveId, string, string, string][] = [
    ['find-alya', 'Find Alya', 'Alya was last seen at school, after recess.', 'belonging-alya'],
    ['find-danish', 'Find Danish', 'Danish knew the way into the Forbidden Forest.', 'belonging-danish'],
    ['find-mira', 'Find Mira', "Mira is the Village Chief's granddaughter.", 'belonging-mira'],
    ['find-adam', 'Find Adam', 'Adam never went anywhere without his toy car.', 'belonging-adam'],
  ];
  const mains: ObjectiveState[] = kids.map(([id, title, description, item]) => ({ id, main: true, title, description, done: f.found.has(item) }));
  const fourFound = mains.every((m) => m.done);
  mains.push({
    id: 'find-sofia',
    main: true,
    title: fourFound ? 'Find Sofia' : '???',
    description: fourFound ? 'Sofia "found a door". Behind the iron gate, deep underground.' : 'Find the other four first.',
    done: f.found.has('belonging-sofia'),
    hidden: !fourFound,
  });
  if (f.found.has('belonging-sofia')) {
    mains.push({
      id: 'decide',
      main: true,
      title: 'Decide at the Batu Penunggu',
      description: 'Five small mats around a black stone. Learn what happened in 1998, then choose.',
      done: !!f.final,
    });
  }
  if (f.final) {
    mains.push({
      id: 'escape',
      main: true,
      title: f.final === 'free' ? 'Reach the car before dawn' : 'Leave Kampung Hujan',
      description: f.final === 'free' ? 'It is awake, and it is angry. Get everyone back to the car.' : 'Let them sleep. Walk back to the car and go.',
      done: false,
    });
  }
  const diary = count(f.found, 'diary-');
  const photos = count(f.found, 'photo-');
  const tapes = count(f.found, 'cassette-');
  return [
    ...mains,
    { id: 'side-diary', main: false, title: 'Five diary pages', description: "Alya's diary, torn and scattered.", done: diary >= 5, progress: `${diary}/5` },
    { id: 'side-photos', main: false, title: 'Old photographs', description: 'Photographs from the summer of 1998.', done: photos >= 4, progress: `${photos}/4` },
    { id: 'side-power', main: false, title: 'Restore school electricity', description: 'The fuse box at the end of the school corridor.', done: f.power },
    { id: 'side-cassettes', main: false, title: 'Three cassette recordings', description: 'Someone recorded the children.', done: tapes >= 3, progress: `${tapes}/3` },
    { id: 'side-secret', main: false, title: 'Discover the secret room', description: 'Somewhere below the village.', done: f.secretRoom },
  ];
}

/* ───────────────────────── network shapes ───────────────────────── */

export interface WorldSnapshot {
  /** Items lying in the world (picked-up ones are gone). */
  items: WorldItem[];
  /** Dynamic colliders currently open. */
  open: string[];
  /** Interactables that are unlocked (but maybe closed). */
  unlocked: string[];
  power: boolean;
  radioSolved: boolean;
  fuse: boolean[];
  levers: { a: boolean; b: boolean };
  /** Journal entries in the order they were found (shared by the team). */
  journal: { doc: string; by: string }[];
  objectives: ObjectiveState[];
  /** Story decisions made by the team (shared). */
  decisions: Decision[];
  /** After the choice at the Batu Penunggu. `dawnAt` is server time (free only). */
  final: { mode: 'free' | 'sleep'; dawnAt: number | null } | null;
  /** Server clock when this snapshot was made (to count down to dawn). */
  serverTime: number;
}

export interface PrivateState {
  inventory: (InvItem | null)[];
  health: number;
  downed: boolean;
  /** Seconds left before bleeding out (while downed). */
  bleedout: number;
}

export type InteractAction =
  | { type: 'pickup' }
  | { type: 'use' }
  | { type: 'toggle'; index?: number }
  | { type: 'code'; code: string }
  | { type: 'tune'; freq: number }
  | { type: 'revive' }
  | { type: 'reviveCancel' }
  | { type: 'choose'; option: ChoiceOption };

export type InteractResult =
  | { kind: 'ok'; message?: string }
  | { kind: 'read'; doc: string; message?: string }
  | { kind: 'ui'; ui: 'fusebox' | 'radio' | 'padlock' }
  /** Show a story choice (see CHOICES). */
  | { kind: 'choice'; choice: ChoiceId };

/** Validates an untrusted action payload. */
export function parseAction(raw: unknown): InteractAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'pickup':
    case 'use':
    case 'revive':
    case 'reviveCancel':
      return { type: r.type };
    case 'toggle':
      return { type: 'toggle', index: typeof r.index === 'number' && Number.isInteger(r.index) && r.index >= 0 && r.index < 4 ? r.index : undefined };
    case 'code':
      return typeof r.code === 'string' && /^\d{4}$/.test(r.code) ? { type: 'code', code: r.code } : null;
    case 'choose':
      return r.option === 'free' || r.option === 'sleep' || r.option === 'leave' || r.option === 'stay' ? { type: 'choose', option: r.option } : null;
    case 'tune':
      return typeof r.freq === 'number' && Number.isFinite(r.freq) && r.freq >= 80 && r.freq <= 110 ? { type: 'tune', freq: r.freq } : null;
    default:
      return null;
  }
}

/** All docs referenced by items exist (checked in tests). */
export const ALL_DOC_IDS = Object.keys(DOCS);

/** The full collision world for a game: the village plus door leaves. */
export function buildGameWorld(): CollisionWorld {
  return new CollisionWorld([...kampungColliders(), ...doorColliders()], kampungTerrain, KAMPUNG_BOUNDS);
}
