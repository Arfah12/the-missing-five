import { useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH, ROOM_CODE_DIGITS, ROOM_CODE_PREFIX, normalizeRoomCode, sanitizeName } from '@tmf/shared';
import { audio } from '../../audio/AudioManager';
import { settingsStore, updateSettings } from '../../lib/settings';
import { useStore } from '../../lib/store';
import { connectionStore, createRoom, joinRoom } from '../../net/connection';
import { PanelHead } from '../components/Controls';
import { statusText } from '../components/Status';

function NameField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">Your name</span>
      <input
        className="input"
        value={value}
        maxLength={NAME_MAX_LENGTH}
        autoFocus={autoFocus}
        autoComplete="nickname"
        spellCheck={false}
        placeholder="e.g. Aiman"
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="field-help">2–16 characters. Must be unique in the room.</span>
    </label>
  );
}

function useSubmit() {
  const conn = useStore(connectionStore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offlineReason = conn.status === 'online' ? null : statusText(conn).text;
  return { busy, setBusy, error, setError, offlineReason };
}

export function CreateRoomScreen({ onBack }: { onBack: () => void }) {
  const saved = useStore(settingsStore, (s) => s.playerName);
  const [name, setName] = useState(saved);
  const { busy, setBusy, error, setError, offlineReason } = useSubmit();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = sanitizeName(name);
    if (!clean) {
      audio.ui('error');
      setError('Names need 2–16 letters, numbers, spaces, "-" or "_".');
      return;
    }
    setBusy(true);
    setError(null);
    updateSettings({ playerName: clean });
    const res = await createRoom(clean);
    setBusy(false);
    if (res.ok) audio.ui('join');
    else {
      audio.ui('error');
      setError(res.message);
    }
  };

  return (
    <section className="column">
      <PanelHead title="Create Room" sub="You will be the host" onBack={onBack} />
      <form onSubmit={submit} noValidate>
        <NameField value={name} onChange={setName} autoFocus />
        {error && <p className="error">{error}</p>}
        {offlineReason && <p className="error">{offlineReason}</p>}
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !!offlineReason}>
            {busy ? 'Opening the gate…' : 'Create Room'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function JoinRoomScreen({ onBack, initialCode }: { onBack: () => void; initialCode?: string }) {
  const saved = useStore(settingsStore, (s) => s.playerName);
  const [name, setName] = useState(saved);
  const [digits, setDigits] = useState(() => (initialCode ? (normalizeRoomCode(initialCode)?.slice(3) ?? '') : ''));
  const { busy, setBusy, error, setError, offlineReason } = useSubmit();

  const onCode = (raw: string) => {
    // Accept pasted "HJ-8291" as well as typed digits.
    const normalized = normalizeRoomCode(raw);
    setDigits(normalized ? normalized.slice(3) : raw.replace(/\D/g, '').slice(0, ROOM_CODE_DIGITS));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = sanitizeName(name);
    const code = normalizeRoomCode(digits);
    if (!code) {
      audio.ui('error');
      setError(`Enter the ${ROOM_CODE_DIGITS}-digit room code from your host.`);
      return;
    }
    if (!clean) {
      audio.ui('error');
      setError('Names need 2–16 letters, numbers, spaces, "-" or "_".');
      return;
    }
    setBusy(true);
    setError(null);
    updateSettings({ playerName: clean });
    const res = await joinRoom(code, clean);
    setBusy(false);
    if (res.ok) audio.ui('join');
    else {
      audio.ui('error');
      setError(res.message);
    }
  };

  return (
    <section className="column">
      <PanelHead title="Join Room" sub="Enter the code from your host" onBack={onBack} />
      <form onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Room code</span>
          <span className="code-input">
            <span className="code-prefix">{ROOM_CODE_PREFIX}-</span>
            <input
              className="input"
              value={digits}
              inputMode="numeric"
              autoFocus={!initialCode}
              aria-label="Room code digits"
              placeholder="0000"
              onChange={(e) => onCode(e.target.value)}
            />
          </span>
        </label>
        <NameField value={name} onChange={setName} autoFocus={!!initialCode} />
        {error && <p className="error">{error}</p>}
        {offlineReason && <p className="error">{offlineReason}</p>}
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !!offlineReason}>
            {busy ? 'Searching…' : 'Join Room'}
          </button>
        </div>
      </form>
    </section>
  );
}
