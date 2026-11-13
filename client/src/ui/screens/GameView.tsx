import { useCallback, useEffect, useRef, useState } from 'react';
import { ENTRANCE_AREA_NAME } from '@tmf/shared';
import { CHOICES, type ChoiceId } from '@tmf/shared';
import { audio } from '../../audio/AudioManager';
import { Game, type HudState, type InteractTarget } from '../../game/Game';
import { settingsStore } from '../../lib/settings';
import { useStore } from '../../lib/store';
import {
  broadcastStore,
  dropItem,
  interact,
  meStore,
  notify,
  onCorrection,
  onGameEvent,
  onPlayersFrame,
  sendPlayerState,
  sessionStore,
  syncGame,
  useItem,
  usePortal,
  worldStore,
} from '../../net/connection';
import { MapView } from '../game/MapView';
import { ChoicePanel, DocReader, FusePanel, InventoryPanel, JournalPanel, PadlockPanel, RadioPanel, Subtitle } from '../game/Panels';
import { DawnTimer, Hud } from '../game/Hud';
import { SettingsScreen } from './SettingsScreen';

type Phase = 'loading' | 'ready' | 'playing' | 'paused' | 'settings' | 'error';

type Panel =
  | { type: 'inventory' }
  | { type: 'journal'; tab: 'objectives' | 'clues' }
  | { type: 'doc'; doc: string; back?: Panel }
  | { type: 'fusebox'; target: string }
  | { type: 'radio'; target: string }
  | { type: 'padlock'; target: string }
  | { type: 'choice'; target: string; choice: ChoiceId };

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Shift', 'Sprint'],
  ['C / Ctrl', 'Crouch'],
  ['F', 'Flashlight'],
  ['E', 'Interact / pick up'],
  ['Tab', 'Inventory'],
  ['J', 'Journal'],
  ['M', 'Map'],
  ['Esc', 'Pause'],
];

/**
 * Hosts the 3D game for a running room (solo or co-op).
 * Loading screen → click to enter → play; Esc pauses.
 */
export function GameView({ onQuit }: { onQuit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [hud, setHud] = useState<HudState | null>(null);
  const [landmark, setLandmark] = useState<{ name: string; key: number } | null>(null);
  const [areaTitle, setAreaTitle] = useState<{ name: string; key: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [travel, setTravel] = useState<{ label: string; key: number } | null>(null);
  const settings = useStore(settingsStore);
  const quality = settings.quality;
  const solo = useStore(sessionStore, (s) => s.room?.solo ?? false);
  const resuming = useStore(sessionStore, (s) => s.resuming);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const world = useStore(worldStore, (s) => s.world);
  const me = useStore(meStore, (s) => s.me);
  const broadcast = useStore(broadcastStore);
  const [panel, setPanel] = useState<Panel | null>(null);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const [slot, setSlot] = useState(0);
  const [clue, setClue] = useState(0);
  const [freq, setFreq] = useState(91.0);
  const [code, setCode] = useState([0, 0, 0, 0]);
  const [wheel, setWheel] = useState(0);
  const [codeError, setCodeError] = useState(false);
  const [subtitle, setSubtitle] = useState<{ doc: string; key: number } | null>(null);
  const [whisper, setWhisper] = useState<{ text: string; key: number } | null>(null);

  // (Re)create the game; quality changes need a full rebuild.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let game: Game | null = null;
    setPhase('loading');
    const s = settingsStore.get();
    const boot = async () => {
      const sync = await syncGame();
      if (cancelled) return;
      if (!sync.ok) throw new Error(sync.message);
      game = new Game(
      el,
      { quality: s.quality, brightness: s.brightness, fov: s.fov, mouseSensitivity: s.mouseSensitivity, invertY: s.invertY },
      {
        onHud: (h) => setHud(h),
        onLockChange: (locked) => {
          if (locked) setPhase('playing');
          else if (phaseRef.current === 'playing') setPhase('paused');
        },
        onLandmark: (name) => setLandmark({ name, key: performance.now() }),
        onArea: (name) => setAreaTitle({ name, key: performance.now() }),
        onToggleMap: () => setMapOpen((v) => !v),
        onWhisper: (text) => setWhisper({ text, key: performance.now() }),
        onTravel: (label) => setTravel({ label, key: performance.now() }),
        onInteract: (target, phase) => void handleInteract(target, phase),
        onKey: (key) => {
          if (key === 'inventory') setPanel((p) => (p?.type === 'inventory' ? null : { type: 'inventory' }));
          else if (key === 'journal') setPanel((p) => (p?.type === 'journal' ? null : { type: 'journal', tab: 'objectives' }));
          else notify('Open the inventory (Tab) to drop something.');
        },
        onFatal: (msg) => {
          setError(msg);
          setPhase('error');
        },
      },
      {
        selfId: sync.data.you.id,
        you: sync.data.you,
        send: sendPlayerState,
        onFrame: onPlayersFrame,
        onCorrection,
        portal: usePortal,
        world: worldStore.get().world,
        me: meStore.get().me,
        onWorld: (fn) => worldStore.subscribe(() => {
          const w = worldStore.get().world;
          if (w) fn(w);
        }),
        onMe: (fn) => meStore.subscribe(() => {
          const m = meStore.get().me;
          if (m) fn(m);
        }),
        onEvent: onGameEvent,
      },
      );
      gameRef.current = game;
      await game.init();
      if (!cancelled) setPhase((p) => (p === 'loading' ? 'ready' : p));
    };
    // let the loading screen paint before the heavy world build
    const start = window.setTimeout(() => {
      boot().catch((err: unknown) => {
        console.error(err);
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      });
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      game?.dispose();
      gameRef.current = null;
    };
  }, [quality]);

  // After a reconnect, line our position up with the server's.
  const wasResuming = useRef(resuming);
  useEffect(() => {
    if (wasResuming.current && !resuming && gameRef.current) {
      void syncGame().then((r) => {
        if (r.ok) gameRef.current?.resync(r.data.you);
      });
    }
    wasResuming.current = resuming;
  }, [resuming]);

  // Live settings (brightness, FOV, mouse) apply without a rebuild.
  useEffect(() => {
    gameRef.current?.applySettings({
      quality: settings.quality,
      brightness: settings.brightness,
      fov: settings.fov,
      mouseSensitivity: settings.mouseSensitivity,
      invertY: settings.invertY,
    });
  }, [settings.quality, settings.brightness, settings.fov, settings.mouseSensitivity, settings.invertY]);

  /* ───────────── interactions & panels ───────────── */

  // the 3D game ignores keys while a panel is open
  useEffect(() => {
    gameRef.current?.setUiOpen(panel !== null);
    if (panel) setMapOpen(false);
  }, [panel]);

  // panels close when the game pauses
  useEffect(() => {
    if (phase !== 'playing') setPanel(null);
  }, [phase]);

  // a dead/downed player can't keep a puzzle open
  useEffect(() => {
    if (me?.downed) setPanel(null);
  }, [me?.downed]);

  // PA and radio voices appear as subtitles for everyone
  useEffect(() => {
    if (!broadcast.doc) return;
    setSubtitle({ doc: broadcast.doc, key: broadcast.key });
    const t = window.setTimeout(() => setSubtitle(null), 11000);
    return () => window.clearTimeout(t);
  }, [broadcast.key, broadcast.doc]);

  async function handleInteract(target: InteractTarget, phase: 'press' | 'release') {
    if (target.kind === 'player') {
      await interact(target.id, { type: phase === 'press' ? 'revive' : 'reviveCancel' });
      return;
    }
    if (phase !== 'press') return;
    const res = await interact(target.id, target.kind === 'item' ? { type: 'pickup' } : { type: 'toggle' });
    if (!res.ok) {
      notify(res.message, 'error');
      return;
    }
    const r = res.data;
    if (r.kind === 'read') {
      if (r.doc) setPanel({ type: 'doc', doc: r.doc });
      if (r.message) notify(r.message);
    } else if (r.kind === 'choice') {
      setPanel({ type: 'choice', target: target.id, choice: r.choice });
    } else if (r.kind === 'ui') {
      if (r.ui === 'padlock') {
        setCode([0, 0, 0, 0]);
        setWheel(0);
      }
      setPanel({ type: r.ui, target: target.id });
    } else if (r.message) {
      notify(r.message);
    }
  }

  // keyboard for the panels (the mouse is still captured)
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      const p = panelRef.current;
      if (!p) return;
      const k = e.code;
      const close = () => setPanel(null);
      if (k === 'Tab') e.preventDefault();
      switch (p.type) {
        case 'doc':
          if (['KeyE', 'Enter', 'Space', 'KeyQ', 'Tab', 'KeyJ', 'Backspace'].includes(k)) setPanel(p.back ?? null);
          break;
        case 'inventory': {
          const items = meStore.get().me?.inventory ?? [];
          if (k === 'Tab' || k === 'KeyI' || k === 'KeyQ') close();
          else if (/^Digit[1-5]$/.test(k)) setSlot(Number(k.slice(5)) - 1);
          else if (k === 'ArrowLeft' || k === 'KeyA') setSlot((v) => (v + 4) % 5);
          else if (k === 'ArrowRight' || k === 'KeyD') setSlot((v) => (v + 1) % 5);
          else if ((k === 'KeyE' || k === 'Enter') && items[slot]) {
            void useItem(slot).then((r) => (r.ok ? r.data.kind === 'ok' && r.data.message && notify(r.data.message) : notify(r.message, 'error')));
          } else if (k === 'KeyG' && items[slot]) {
            void dropItem(slot).then((r) => !r.ok && notify(r.message, 'error'));
            audio.ui('back');
          }
          break;
        }
        case 'journal': {
          const clues = worldStore.get().world?.journal ?? [];
          if (k === 'KeyJ' || k === 'Tab' || k === 'KeyQ') close();
          else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'KeyA' || k === 'KeyD')
            setPanel({ type: 'journal', tab: p.tab === 'objectives' ? 'clues' : 'objectives' });
          else if (p.tab === 'clues' && (k === 'ArrowUp' || k === 'KeyW')) setClue((v) => Math.max(0, v - 1));
          else if (p.tab === 'clues' && (k === 'ArrowDown' || k === 'KeyS')) setClue((v) => Math.min(Math.max(0, clues.length - 1), v + 1));
          else if (p.tab === 'clues' && (k === 'KeyE' || k === 'Enter') && clues[clue]) {
            audio.sfx('page', 0.6);
            setPanel({ type: 'doc', doc: clues[clue].doc, back: p });
          }
          break;
        }
        case 'fusebox':
          if (k === 'KeyQ' || k === 'KeyE' || k === 'Tab') close();
          else if (/^Digit[1-4]$/.test(k)) void interact(p.target, { type: 'toggle', index: Number(k.slice(5)) - 1 }).then((r) => r.ok && r.data.kind === 'ok' && r.data.message && notify(r.data.message));
          break;
        case 'radio':
          if (k === 'KeyQ' || k === 'Tab') close();
          else if (k === 'ArrowLeft' || k === 'KeyA') setFreq((f) => Math.max(88, Math.round((f - 0.5) * 10) / 10));
          else if (k === 'ArrowRight' || k === 'KeyD') setFreq((f) => Math.min(108, Math.round((f + 0.5) * 10) / 10));
          else if (k === 'KeyE' || k === 'Enter') {
            void interact(p.target, { type: 'tune', freq: freqRef.current }).then((r) => {
              if (r.ok && r.data.kind === 'read') setPanel({ type: 'doc', doc: r.data.doc });
              else if (r.ok && r.data.kind === 'ok' && r.data.message) notify(r.data.message);
            });
          }
          break;
        case 'choice': {
          const opts = CHOICES[p.choice].options;
          if (k === 'KeyQ' || k === 'Tab' || k === 'Escape') close();
          else if (/^Digit[1-9]$/.test(k) && opts[Number(k.slice(5)) - 1]) {
            const option = opts[Number(k.slice(5)) - 1].id;
            audio.ui('select');
            void interact(p.target, { type: 'choose', option }).then((r) => {
              if (!r.ok) notify(r.message, 'error');
              else if (r.data.kind === 'ok' && r.data.message) notify(r.data.message);
              setPanel(null);
            });
          }
          break;
        }
        case 'padlock':
          if (k === 'KeyQ' || k === 'Tab') close();
          else if (/^Digit\d$/.test(k)) {
            const d = Number(k.slice(5));
            setCode((c) => c.map((v, i) => (i === wheelRef.current ? d : v)));
            setWheel((w) => Math.min(3, w + 1));
          } else if (k === 'ArrowLeft' || k === 'KeyA') setWheel((w) => Math.max(0, w - 1));
          else if (k === 'ArrowRight' || k === 'KeyD') setWheel((w) => Math.min(3, w + 1));
          else if (k === 'ArrowUp' || k === 'KeyW') setCode((c) => c.map((v, i) => (i === wheelRef.current ? (v + 1) % 10 : v)));
          else if (k === 'ArrowDown' || k === 'KeyS') setCode((c) => c.map((v, i) => (i === wheelRef.current ? (v + 9) % 10 : v)));
          else if (k === 'KeyE' || k === 'Enter') {
            void interact(p.target, { type: 'code', code: codeRef.current.join('') }).then((r) => {
              if (r.ok) setPanel(null);
              else {
                setCodeError(true);
                window.setTimeout(() => setCodeError(false), 500);
              }
            });
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, slot, clue]);

  const freqRef = useRef(freq);
  freqRef.current = freq;
  const codeRef = useRef(code);
  codeRef.current = code;
  const wheelRef = useRef(wheel);
  wheelRef.current = wheel;

  const getMapState = useCallback(() => gameRef.current?.mapState() ?? null, []);
  // the map closes when the game pauses
  useEffect(() => {
    if (phase !== 'playing') setMapOpen(false);
  }, [phase]);

  const play = () => {
    audio.ui('select');
    gameRef.current?.requestPlay();
  };

  const quit = () => {
    audio.ui('back');
    gameRef.current?.releasePointer();
    onQuit();
  };

  return (
    <div className="game-root">
      <div className="game-host" ref={host} />

      {phase === 'playing' && hud && <Hud hud={hud} landmark={landmark} />}
      {phase === 'playing' && areaTitle && (
        <div className="area-title" key={areaTitle.key}>
          {areaTitle.name}
        </div>
      )}
      {travel && (
        <div className="travel-fade" key={travel.key} onAnimationEnd={() => setTravel(null)}>
          {travel.label}…
        </div>
      )}
      {phase === 'playing' && mapOpen && <MapView getState={getMapState} onClose={() => setMapOpen(false)} />}
      {phase === 'playing' && subtitle && <Subtitle key={subtitle.key} doc={subtitle.doc} />}
      {phase === 'playing' && world?.final?.dawnAt && <DawnTimer dawnAt={world.final.dawnAt} serverTime={world.serverTime} />}
      {phase === 'playing' && whisper && (
        <div className="whisper" key={whisper.key}>
          {whisper.text}
        </div>
      )}
      {phase === 'playing' && panel?.type === 'doc' && <DocReader doc={panel.doc} hint={panel.back ? 'E back to the journal' : 'E close'} />}
      {phase === 'playing' && panel?.type === 'inventory' && <InventoryPanel items={me?.inventory ?? []} selected={slot} battery={hud?.battery ?? 1} />}
      {phase === 'playing' && panel?.type === 'journal' && <JournalPanel world={world} selected={clue} tab={panel.tab} />}
      {phase === 'playing' && panel?.type === 'fusebox' && <FusePanel fuse={world?.fuse ?? [false, false, false, false]} power={world?.power ?? false} />}
      {phase === 'playing' && panel?.type === 'radio' && <RadioPanel freq={freq} solved={world?.radioSolved ?? false} />}
      {phase === 'playing' && panel?.type === 'choice' && <ChoicePanel choice={panel.choice} busy={false} />}
      {phase === 'playing' && panel?.type === 'padlock' && <PadlockPanel digits={code} wheel={wheel} error={codeError} />}

      {phase === 'loading' && (
        <div className="game-overlay loading" role="status">
          <p className="overline">Kampung Hujan · 2026</p>
          <h2 className="loading-title">{ENTRANCE_AREA_NAME}</h2>
          <div className="loading-bar" aria-hidden>
            <span />
          </div>
          <p className="loading-tip">“The recording said: come to the village. Find us.”</p>
        </div>
      )}

      {phase === 'ready' && (
        <div className="game-overlay" onClick={play}>
          <div className="overlay-panel">
            <p className="overline">{solo ? 'Exploring alone' : 'Co-op · stay together'}</p>
            <h2 className="loading-title">{ENTRANCE_AREA_NAME}</h2>
            <p className="note">Your car died at the edge of the village. The road behind you is blocked. Walk in.</p>
            <ControlsList />
            <button className="btn btn-primary" type="button" onClick={(e) => (e.stopPropagation(), play())} autoFocus>
              Click to enter
            </button>
          </div>
        </div>
      )}

      {phase === 'paused' && (
        <div className="game-overlay dim">
          <div className="overlay-panel">
            <h2 className="pause-title">Paused</h2>
            {!solo && <p className="note">The game keeps running for the others while you're here.</p>}
            <div className="pause-actions">
              <button className="btn btn-primary" type="button" onClick={play} autoFocus>
                Resume
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  audio.ui('select');
                  setPhase('settings');
                }}
              >
                Settings
              </button>
              <button className="btn" type="button" onClick={quit}>
                {solo ? 'Quit to menu' : 'Leave game'}
              </button>
            </div>
            <ControlsList />
          </div>
        </div>
      )}

      {phase === 'settings' && (
        <div className="game-overlay dim">
          <div className="overlay-panel wide">
            <SettingsScreen onBack={() => setPhase('paused')} />
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="game-overlay dim">
          <div className="overlay-panel">
            <h2 className="pause-title">Something went wrong</h2>
            <p className="error">{error || 'The game could not start.'}</p>
            <p className="note">Try a lower graphics quality in Settings, or another browser (Chrome / Edge). Make sure hardware acceleration is on.</p>
            <div className="pause-actions">
              <button className="btn btn-primary" type="button" onClick={quit}>
                Back to menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ControlsList() {
  return (
    <dl className="controls">
      {CONTROLS.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
