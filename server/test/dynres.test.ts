import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DynamicResolution } from '../../client/src/game/DynamicResolution';

describe('dynamic resolution (client)', () => {
  it('drops the resolution when frames are slow and recovers when fast', () => {
    const d = new DynamicResolution(1.5, 0.6);
    let changed = 0;
    for (let i = 0; i < 30 * 6; i++) if (d.frame(1 / 25)) changed++; // 6 s at 25 fps
    assert.ok(d.scale < 1.5 && changed >= 2, `scale ${d.scale}`);
    const low = d.scale;
    for (let i = 0; i < 60 * 30; i++) d.frame(1 / 60); // 30 s at 60 fps
    assert.ok(d.scale > low, `recovered to ${d.scale}`);
    assert.ok(d.scale <= 1.5);
  });

  it('never goes below the minimum and ignores pauses', () => {
    const d = new DynamicResolution(1, 0.6);
    for (let i = 0; i < 2000; i++) d.frame(1 / 10);
    assert.equal(d.scale, 0.6);
    assert.equal(d.frame(5), false);
  });

  it('a steady 50 fps leaves it alone', () => {
    const d = new DynamicResolution(1.25);
    for (let i = 0; i < 50 * 20; i++) d.frame(1 / 50);
    assert.equal(d.scale, 1.25);
  });
});
