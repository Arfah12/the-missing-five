import type { Quality } from '../lib/settings';

export interface QualityPreset {
  dprCap: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  textureSize: number;
  rainDrops: number;
  mistBanks: number;
  grassTufts: number;
  jungleTrees: number;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: { dprCap: 1, antialias: false, shadows: false, shadowMapSize: 512, textureSize: 256, rainDrops: 500, mistBanks: 3, grassTufts: 150, jungleTrees: 60 },
  medium: { dprCap: 1.5, antialias: true, shadows: true, shadowMapSize: 1024, textureSize: 512, rainDrops: 1400, mistBanks: 6, grassTufts: 420, jungleTrees: 110 },
  high: { dprCap: 2, antialias: true, shadows: true, shadowMapSize: 2048, textureSize: 512, rainDrops: 2600, mistBanks: 9, grassTufts: 800, jungleTrees: 170 },
};

/** Three.js r163+ requires WebGL 2. */
export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}
