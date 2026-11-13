import { useEffect, useState, type CSSProperties } from 'react';
import type { HudState } from '../../game/Game';

/**
 * Minimal in-game HUD: it stays out of the way and only shows what matters
 * right now (stamina while running, battery while the torch is on or low).
 */
export function Hud({ hud, landmark }: { hud: HudState; landmark: { name: string; key: number } | null }) {
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 9000);
    return () => window.clearTimeout(t);
  }, []);

  const showStamina = hud.stamina < 0.995 || hud.sprinting;
  const lowBattery = hud.battery < 0.15;
  const showBattery = hud.flashlight || lowBattery;

  const fearStyle = { ['--fear' as string]: hud.fear.toFixed(3) } as CSSProperties;
  return (
    <div className={`hud${hud.distort ? ' distort' : ''}`} aria-hidden style={fearStyle}>
      <div className="fear-vignette" />
      {hud.hurt > 0.01 && <div className="hurt-flash" style={{ opacity: hud.hurt }} />}
      <div className={`crosshair${hud.crouching ? ' small' : ''}${hud.target ? ' active' : ''}`} />

      {hud.target && !hud.downed && (
        <div className="prompt">
          <kbd>E</kbd> {hud.target.verb} <strong>{hud.target.name}</strong>
          {hud.revive > 0 && (
            <span className="revive-bar">
              <span style={{ transform: `scaleX(${hud.revive})` }} />
            </span>
          )}
        </div>
      )}

      {hud.health < 100 && !hud.downed && (
        <div className={`hud-health${hud.health < 35 ? ' low' : ''}`}>
          <span className="hud-label">Health</span>
          <span className="bar">
            <span style={{ transform: `scaleX(${hud.health / 100})` }} />
          </span>
        </div>
      )}

      {hud.downed && (
        <div className="downed">
          <h2>You are down</h2>
          <p>Someone has to hold E on you to get you back up.</p>
          <p className="downed-timer">{Math.ceil(hud.bleedout)}s</p>
        </div>
      )}

      {landmark && (
        <div className="landmark" key={landmark.key}>
          {landmark.name}
        </div>
      )}

      <div className={`hud-meter stamina${showStamina ? ' show' : ''}${hud.exhausted ? ' exhausted' : ''}`}>
        <span className="hud-label">Stamina</span>
        <span className="bar">
          <span style={{ transform: `scaleX(${hud.stamina})` }} />
        </span>
      </div>

      <div className={`hud-meter battery${showBattery ? ' show' : ''}${lowBattery ? ' low' : ''}`}>
        <span className="hud-label">{hud.flashlight ? 'Torch' : 'Torch off'}</span>
        <span className="cells">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={hud.battery > i * 0.25 + 0.01 ? 'on' : ''} />
          ))}
        </span>
      </div>

      {hud.crouching && <div className="hud-state">Crouching</div>}

      {hud.roster.length > 0 && (
        <ul className="hud-roster">
          {hud.roster.map((p) => (
            <li key={p.name} className={p.connected ? '' : 'offline'}>
              <span className={`dot ${p.connected ? 'ok' : 'warn'}`} />
              {p.name}
            </li>
          ))}
        </ul>
      )}

      {hint && <div className="hud-hint">E — interact · Tab — inventory · J — journal · M — map · F — torch · Esc — pause</div>}

      {hud.debug && (
        <pre className="hud-debug">
          {`${hud.debug.fps} fps · ${hud.debug.calls} calls · ${(hud.debug.tris / 1000).toFixed(0)}k tris\n` +
            `x ${hud.debug.x.toFixed(2)}  y ${hud.debug.y.toFixed(2)}  z ${hud.debug.z.toFixed(2)}  ${hud.debug.surface}\nwatcher ${hud.debug.watcher}`}
        </pre>
      )}
    </div>
  );
}

/** Countdown to dawn after the children are freed. */
export function DawnTimer({ dawnAt, serverTime }: { dawnAt: number; serverTime: number }) {
  // convert the server deadline to this machine's clock once per snapshot
  const [deadline, setDeadline] = useState(() => Date.now() + (dawnAt - serverTime));
  const [now, setNow] = useState(Date.now());
  useEffect(() => setDeadline(Date.now() + (dawnAt - serverTime)), [dawnAt, serverTime]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((deadline - now) / 1000));
  return (
    <div className={`dawn-timer${left < 60 ? ' urgent' : ''}`}>
      <span className="hud-label">Dawn in</span>
      <strong>
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </strong>
    </div>
  );
}
