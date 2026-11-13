import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHAMBER_POS,
  DAWN_S,
  DOCS,
  ENDINGS,
  INTERACTABLES,
  KAMPUNG_SPAWNS,
  MYSTERY_DOCS,
  buildGameWorld,
  decideEnding,
  parseAction,
  roadX,
  type GameEnd,
  type InteractResult,
} from '@tmf/shared';
import { GameSession } from '../src/game/GameSession';

const T0 = 5_000_000;
const KIDS = ['belonging-alya', 'belonging-danish', 'belonging-mira', 'belonging-adam', 'belonging-sofia'];

function setup(mode: 'solo' | 'coop' = 'coop') {
  const clock = { now: T0 };
  // rand → 0.999: The Watcher stays away from these story tests unless asked
  const s = new GameSession({ world: buildGameWorld(), spawns: KAMPUNG_SPAWNS, mode, now: () => clock.now, rand: () => 0.999 });
  s.addPlayer('a', 'Aiman');
  if (mode === 'coop') s.addPlayer('b', 'Siti');
  const learn = (...docs: string[]) => docs.forEach((d) => (s as unknown as { addToJournal(d: string, by: string): void }).addToJournal(d, 'Aiman'));
  const altar = INTERACTABLES.find((i) => i.id === 'altar')!;
  const car = INTERACTABLES.find((i) => i.id === 'car')!;
  const goAltar = () => s.teleport('a', altar.x - 1.1, altar.z);
  const goCar = (id = 'a') => s.teleport(id, roadX(36) + 0.3, car.z);
  const use = (target: string, action: unknown): InteractResult => {
    const r = s.interact('a', target, parseAction(action)!);
    assert.ok(r.ok, `interact ${target} ${JSON.stringify(action)} → ${r.ok ? '' : r.error + ' ' + r.message}`);
    return r.value;
  };
  return { s, clock, learn, goAltar, goCar, use };
}

describe('ending rules', () => {
  it('decideEnding covers the four endings and Game Over', () => {
    assert.equal(decideEnding({ via: 'car', final: 'free', children: 5 }), 'truth');
    assert.equal(decideEnding({ via: 'dawn', final: 'free', children: 5 }), 'last-night');
    assert.equal(decideEnding({ via: 'allDown', final: 'free', children: 5 }), 'last-night');
    assert.equal(decideEnding({ via: 'car', final: 'sleep', children: 5 }), 'escape');
    assert.equal(decideEnding({ via: 'car', final: null, children: 3 }), 'escape');
    assert.equal(decideEnding({ via: 'car', final: null, children: 1 }), 'forgotten');
    assert.equal(decideEnding({ via: 'allDown', final: null, children: 4 }), null);
    for (const e of Object.values(ENDINGS)) assert.ok(e.title && e.text.length >= 2);
    for (const d of MYSTERY_DOCS) assert.ok(DOCS[d], d);
  });
});

describe('story flow', () => {
  it('the recording that brought them is played and filed on the first tick', () => {
    const { s } = setup();
    s.tick();
    const { events } = s.drain();
    assert.ok(events.some((e) => e.event.type === 'broadcast' && e.event.doc === 'rakaman'));
    assert.ok(s.worldSnapshot().journal.some((j) => j.doc === 'rakaman'));
  });

  it('the stone refuses until all five are found and the truth is known', () => {
    const { s, learn, goAltar, use } = setup();
    goAltar();
    let r = use('altar', { type: 'toggle' });
    assert.equal(r.kind, 'read');
    assert.match((r as { message?: string }).message ?? '', /5 of the children/);
    learn(...KIDS);
    r = use('altar', { type: 'toggle' });
    assert.match((r as { message?: string }).message ?? '', /truth about 1998/);
    const refused = s.interact('a', 'altar', { type: 'choose', option: 'free' });
    assert.equal(refused.ok, false, 'cannot skip the requirements by sending the choice directly');
    learn(...MYSTERY_DOCS);
    r = use('altar', { type: 'toggle' });
    assert.deepEqual(r, { kind: 'choice', choice: 'altar' });
  });

  it('THE TRUTH: free them, then reach the car before dawn', () => {
    const { s, learn, goAltar, goCar, use, clock } = setup();
    learn(...KIDS, ...MYSTERY_DOCS);
    goAltar();
    use('altar', { type: 'choose', option: 'free' });
    const w = s.worldSnapshot();
    assert.equal(w.final?.mode, 'free');
    assert.equal(w.final?.dawnAt, T0 + DAWN_S * 1000);
    assert.deepEqual(w.decisions, [{ choice: 'altar', option: 'free', by: 'Aiman' }]);
    assert.ok(w.objectives.some((o) => o.id === 'escape' && /before dawn/.test(o.title)));
    clock.now += 120_000;
    s.tick();
    assert.equal(s.ended, null);
    goCar();
    assert.deepEqual(use('car', { type: 'toggle' }), { kind: 'choice', choice: 'car' });
    use('car', { type: 'choose', option: 'stay' });
    assert.equal(s.ended, null, '"not yet" keeps playing');
    use('car', { type: 'choose', option: 'leave' });
    const end = s.ended as GameEnd | null;
    assert.equal(end?.kind, 'ending');
    assert.equal(end?.ending, 'truth');
    assert.equal(end?.stats.children, 5);
  });

  it('THE LAST NIGHT: dawn comes first', () => {
    const { s, learn, goAltar, use, clock } = setup();
    learn(...KIDS, ...MYSTERY_DOCS);
    goAltar();
    use('altar', { type: 'choose', option: 'free' });
    clock.now += DAWN_S * 1000 + 10;
    s.tick();
    assert.equal((s.ended as GameEnd | null)?.ending, 'last-night');
  });

  it('THE LAST NIGHT: everyone falls during the final escape', () => {
    const { s, learn, goAltar, use, clock } = setup();
    learn(...KIDS, ...MYSTERY_DOCS);
    goAltar();
    use('altar', { type: 'choose', option: 'free' });
    s.damage('a', 500);
    s.damage('b', 500);
    s.tick();
    clock.now += 5_000;
    s.tick();
    assert.equal((s.ended as GameEnd | null)?.ending, 'last-night');
  });

  it('THE ESCAPE: let them sleep, then leave', () => {
    const { s, learn, goAltar, goCar, use } = setup();
    learn(...KIDS, ...MYSTERY_DOCS);
    goAltar();
    use('altar', { type: 'choose', option: 'sleep' });
    assert.equal(s.worldSnapshot().final?.dawnAt, null, 'no dawn timer when they are left asleep');
    goCar();
    use('car', { type: 'choose', option: 'leave' });
    assert.equal((s.ended as GameEnd | null)?.ending, 'escape');
  });

  it('THE FORGOTTEN: leaving early, knowing little', () => {
    const { s, learn, goCar, use } = setup();
    goCar();
    const r = use('car', { type: 'toggle' });
    assert.equal(r.kind, 'ok', "the car won't start before anything is found");
    learn('belonging-danish');
    assert.deepEqual(use('car', { type: 'toggle' }), { kind: 'choice', choice: 'car' });
    use('car', { type: 'choose', option: 'leave' });
    assert.equal((s.ended as GameEnd | null)?.ending, 'forgotten');
  });

  it('leaving with most of them found is still THE ESCAPE', () => {
    const { s, learn, goCar, use } = setup('solo');
    learn('belonging-alya', 'belonging-danish', 'belonging-mira');
    goCar();
    use('car', { type: 'choose', option: 'leave' });
    assert.equal((s.ended as GameEnd | null)?.ending, 'escape');
  });

  it('the car and the stone must be within reach', () => {
    const { s } = setup();
    const r = s.interact('a', 'altar', { type: 'toggle' });
    assert.equal(r.ok, false);
    void CHAMBER_POS;
  });

  it('freeing them enrages The Watcher (it comes back fast)', () => {
    const { s, learn, goAltar, use } = setup();
    learn(...KIDS, ...MYSTERY_DOCS);
    goAltar();
    use('altar', { type: 'choose', option: 'free' });
    const next = (s.watcher as unknown as { nextAppear: number }).nextAppear;
    assert.ok(next <= T0 + 8_000, `appears within 8 s (next at +${(next - T0) / 1000}s)`);
  });
});
