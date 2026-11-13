import { useEffect } from 'react';
import { connectionStore, noticeStore, type ConnectionState } from '../../net/connection';
import { useStore } from '../../lib/store';

export function statusText(c: ConnectionState): { dot: 'ok' | 'warn' | 'bad'; text: string } {
  switch (c.status) {
    case 'online':
      return { dot: 'ok', text: c.latencyMs !== null ? `Server online · ${c.latencyMs} ms` : 'Server online' };
    case 'connecting':
      return { dot: 'warn', text: 'Connecting to server…' };
    case 'outdated':
      return { dot: 'bad', text: 'Game updated – refresh the page' };
    default:
      return { dot: 'bad', text: 'Server offline – multiplayer unavailable' };
  }
}

export function ConnectionBadge() {
  const c = useStore(connectionStore);
  const s = statusText(c);
  return (
    <div className="status" role="status" aria-live="polite">
      <span className={`dot ${s.dot}`} aria-hidden />
      <span>{s.text}</span>
    </div>
  );
}

export function NoticeToast() {
  const { notice } = useStore(noticeStore);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => noticeStore.set({ notice: null }), 5_000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return (
    <div key={notice.id} className={`notice ${notice.tone === 'error' ? 'error' : ''}`} role="alert">
      {notice.text}
    </div>
  );
}
