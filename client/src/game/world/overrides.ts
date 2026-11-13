import * as THREE from 'three';

/**
 * Optional real photo textures.
 *
 * The game ships with procedural textures. If you put CC0/licensed images in
 * `client/public/assets/textures/` and list them in `manifest.json` there,
 * they replace the procedural ones – no code changes needed.
 *
 *   { "mud": "mud.jpg", "road": "road.jpg", "planks": "planks.jpg",
 *     "zinc": "zinc.jpg", "plaster": "plaster.jpg", "concrete": "concrete.jpg" }
 */

export type OverrideSlot = 'mud' | 'road' | 'planks' | 'zinc' | 'plaster' | 'concrete';
export type TextureOverrides = Partial<Record<OverrideSlot, THREE.Texture>>;

const SLOTS: OverrideSlot[] = ['mud', 'road', 'planks', 'zinc', 'plaster', 'concrete'];
const BASE = `${import.meta.env.BASE_URL ?? '/'}assets/textures/`;

export async function loadOverrides(): Promise<TextureOverrides> {
  let manifest: Record<string, unknown>;
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return {};
    manifest = (await res.json()) as Record<string, unknown>;
  } catch {
    return {}; // no manifest (or the server answered with HTML) – use procedural textures
  }
  const loader = new THREE.TextureLoader();
  const out: TextureOverrides = {};
  await Promise.all(
    SLOTS.map(async (slot) => {
      const file = manifest[slot];
      if (typeof file !== 'string' || !/^[\w.-]+\.(jpe?g|png|webp)$/i.test(file)) return;
      try {
        const tex = await loader.loadAsync(BASE + file);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        out[slot] = tex;
      } catch {
        console.warn(`[assets] could not load texture "${file}" for ${slot}; using the procedural one`);
      }
    }),
  );
  return out;
}
