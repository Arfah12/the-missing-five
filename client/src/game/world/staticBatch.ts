import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges static meshes that share a material into a few big meshes per map
 * cell. The village is built from thousands of small boxes; drawing each
 * separately would cost thousands of draw calls per frame.
 *
 * Skipped: instanced meshes, multi-material meshes, transparent materials,
 * and anything under an object marked `userData.dynamic` (things that move,
 * like palm crowns, gates and doors).
 */
export function batchStatic(root: THREE.Object3D, cellSize = 28): { before: number; after: number; dispose: () => void } {
  root.updateMatrixWorld(true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const merged: THREE.Mesh[] = [];
  const victims: THREE.Mesh[] = [];
  let before = 0;

  const isDynamic = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true;
    return false;
  };

  root.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    before++;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const material = mesh.material;
    if (Array.isArray(material) || material.transparent || isDynamic(mesh)) return;
    const src = mesh.geometry;
    if (!src.getAttribute('position') || !src.getAttribute('normal') || !src.getAttribute('uv')) return;

    const geo = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    for (const k of Object.keys(geo.morphAttributes)) delete geo.morphAttributes[k];
    geo.clearGroups();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld));

    const pos = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const key = `${material.uuid}|${mesh.castShadow ? 1 : 0}|${Math.floor(pos.x / cellSize)},${Math.floor(pos.z / cellSize)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material, cast: mesh.castShadow, geos: [] }));
    b.geos.push(geo);
    victims.push(mesh);
  });

  for (const b of buckets.values()) {
    if (b.geos.length === 1) {
      // nothing to merge with: keep the original mesh
      b.geos[0].dispose();
      continue;
    }
    const geometry = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.userData.batched = true;
    merged.push(mesh);
  }

  // remove the originals that ended up in a merged mesh
  const mergedMaterials = new Set<string>();
  for (const [key, b] of buckets) if (b.geos.length > 1) mergedMaterials.add(key);
  for (const mesh of victims) {
    const pos = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}|${mesh.castShadow ? 1 : 0}|${Math.floor(pos.x / cellSize)},${Math.floor(pos.z / cellSize)}`;
    if (mergedMaterials.has(key)) mesh.removeFromParent();
  }
  root.add(...merged);

  let after = 0;
  root.traverse((o: THREE.Object3D) => {
    if ((o as THREE.Mesh).isMesh) after++;
  });
  return { before, after, dispose: () => merged.forEach((m) => m.geometry.dispose()) };
}
