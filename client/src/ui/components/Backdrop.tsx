import { useEffect, useRef, useState } from 'react';
import { audio } from '../../audio/AudioManager';
import { MenuBackdrop } from '../../engine/MenuBackdrop';
import { hasWebGL2 } from '../../engine/quality';
import type { Quality } from '../../lib/settings';

interface Props {
  quality: Quality;
  brightness: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Hosts the Three.js menu scene. If WebGL 2 is missing or the GPU context
 * is lost, the menu keeps working on a painted fallback background.
 */
export function Backdrop({ quality, brightness }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MenuBackdrop | null>(null);
  const [failed, setFailed] = useState<string | null>(() => (hasWebGL2() ? null : 'WebGL 2 is not available'));

  // (Re)create the scene when the quality preset changes (antialias can't change live).
  useEffect(() => {
    const el = host.current;
    if (!el || failed) return;
    let instance: MenuBackdrop;
    try {
      instance = new MenuBackdrop(el, {
        quality,
        brightness,
        reducedMotion: prefersReducedMotion(),
        onLightning: (strength) => audio.thunder(1 + Math.random() * 2.5, strength),
      });
    } catch (e) {
      console.error('[backdrop] failed to start', e);
      setFailed(e instanceof Error ? e.message : 'renderer error');
      return;
    }
    scene.current = instance;
    instance.start();
    const onLost = () => setFailed('graphics context lost');
    el.addEventListener('backdrop-lost', onLost);
    return () => {
      el.removeEventListener('backdrop-lost', onLost);
      instance.dispose();
      scene.current = null;
    };
    // brightness is applied live below; only quality rebuilds the scene
  }, [quality, failed]);

  useEffect(() => {
    scene.current?.setBrightness(brightness);
  }, [brightness]);

  return <div ref={host} className="backdrop" data-fallback={failed ?? undefined} />;
}
