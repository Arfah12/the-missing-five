import { useState } from 'react';
import { MIN_PLAYERS, type RoomSnapshot } from '@tmf/shared';
import { audio } from '../../audio/AudioManager';
import { leaveRoom, setReady, startGame } from '../../net/connection';
import { PanelHead } from '../components/Controls';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lobby: live, server-authoritative room state. Players mark themselves
 * ready; the host starts the game when everyone is.
 */
export function Lobby({ room, playerId, resuming }: { room: RoomSnapshot; playerId: string | null; resuming: boolean }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const me = room.players.find((p) => p.id === playerId);
  const slots = Array.from({ length: room.maxPlayers }, (_, i) => room.players[i] ?? null);
  const connected = room.players.filter((p) => p.connected);
  const enough = connected.length >= MIN_PLAYERS;
  const allReady = connected.every((p) => p.isHost || p.ready);
  const isHost = !!me?.isHost;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleReady = async () => {
    if (!me) return;
    setBusy(true);
    const res = await setReady(!me.ready);
    setBusy(false);
    audio.ui(res.ok ? 'select' : 'error');
    setError(res.ok ? null : res.message);
  };

  const start = async () => {
    setBusy(true);
    const res = await startGame();
    setBusy(false);
    if (!res.ok) {
      audio.ui('error');
      setError(res.message);
    } else {
      audio.ui('join');
    }
  };

  const doCopy = async (what: 'code' | 'link') => {
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    if (await copy(what === 'code' ? room.code : url)) {
      audio.ui('select');
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <section className="column" aria-label="Multiplayer lobby">
      <PanelHead title="Lobby" sub={me?.isHost ? 'You are the host' : 'Waiting for the host'} />
      <div className="room-code">
        <span className="field-label">Room</span>
        <strong>{room.code}</strong>
      </div>
      <div className="actions">
        <button className="btn btn-small" type="button" onClick={() => doCopy('code')}>
          {copied === 'code' ? 'Copied' : 'Copy code'}
        </button>
        <button className="btn btn-small" type="button" onClick={() => doCopy('link')}>
          {copied === 'link' ? 'Copied' : 'Copy invite link'}
        </button>
      </div>

      <ol className="slots" aria-label="Players">
        {slots.map((p, i) =>
          p ? (
            <li key={p.id} className="slot">
              <span className="slot-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="slot-name">
                {p.name}
                {p.isHost && <span className="tag">Host</span>}
                {p.id === playerId && <span className="tag you">You</span>}
              </span>
              <span className="slot-status">
                <span className={`dot ${!p.connected ? 'warn' : p.isHost || p.ready ? 'ok' : 'idle'}`} aria-hidden />
                {!p.connected ? 'Reconnecting…' : p.isHost ? 'Host' : p.ready ? 'Ready' : 'Not ready'}
              </span>
            </li>
          ) : (
            <li key={`empty-${i}`} className="slot empty">
              <span className="slot-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="slot-name">Waiting for player…</span>
              <span />
            </li>
          ),
        )}
      </ol>

      <div className="actions">
        {isHost ? (
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !enough || !allReady}
            onClick={() => void start()}
            title={!enough ? `Needs at least ${MIN_PLAYERS} players` : !allReady ? 'Waiting for everyone to be ready' : 'Start the game'}
          >
            Start Game
          </button>
        ) : (
          <button className={`btn${me?.ready ? '' : ' btn-primary'}`} type="button" disabled={busy || !me} onClick={() => void toggleReady()}>
            {me?.ready ? 'Not ready' : 'Ready'}
          </button>
        )}
        <button
          className="btn"
          type="button"
          onClick={() => {
            audio.ui('back');
            void leaveRoom();
          }}
        >
          Leave Room
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="note">
        {resuming
          ? 'Reconnecting to your room…'
          : !enough
            ? `Waiting for at least ${MIN_PLAYERS} players. Share the room code.`
            : !allReady
              ? isHost
                ? 'Waiting for everyone to press Ready.'
                : me?.ready
                  ? 'Waiting for the host to start.'
                  : 'Press Ready when you are.'
              : isHost
                ? 'Everyone is ready. Start when you like.'
                : 'Everyone is ready. Waiting for the host to start.'}
      </p>
    </section>
  );
}
