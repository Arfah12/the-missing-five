import { useEffect, useRef, useState } from 'react';
import { GAME_VERSION, normalizeRoomCode } from '@tmf/shared';
import { audio } from './audio/AudioManager';
import { settingsStore } from './lib/settings';
import { useStore } from './lib/store';
import { endStore, exploreAlone, initConnection, leaveRoom, notify, sessionStore } from './net/connection';
import { Backdrop } from './ui/components/Backdrop';
import { ConnectionBadge, NoticeToast } from './ui/components/Status';
import { EndScreen } from './ui/screens/EndScreen';
import { ExitScreen } from './ui/screens/ExitScreen';
import { GameView } from './ui/screens/GameView';
import { Lobby } from './ui/screens/Lobby';
import { MainMenu } from './ui/screens/MainMenu';
import { CreateRoomScreen, JoinRoomScreen } from './ui/screens/RoomForms';
import { SettingsScreen } from './ui/screens/SettingsScreen';

export type Screen = 'menu' | 'create' | 'join' | 'settings' | 'exit' | 'solo';

/** Read and strip `?room=HJ-1234` invite links. */
function takeInviteCode(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  if (!raw) return undefined;
  params.delete('room');
  const qs = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  return normalizeRoomCode(raw) ?? undefined;
}

export function App() {
  const [invite] = useState(takeInviteCode);
  const [screen, setScreen] = useState<Screen>(invite ? 'join' : 'menu');
  const [audioOn, setAudioOn] = useState(false);
  const settings = useStore(settingsStore);
  const session = useStore(sessionStore);
  const end = useStore(endStore).end;

  useEffect(() => {
    initConnection();
  }, []);

  // Browsers only allow sound after a gesture.
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.startAmbience();
      setAudioOn(true);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    audio.setVolumes({ master: settings.masterVolume, ambience: settings.ambienceVolume, sfx: settings.sfxVolume });
  }, [settings.masterVolume, settings.ambienceVolume, settings.sfxVolume]);

  const inRoom = !!session.room;
  const back = () => {
    audio.ui('back');
    setScreen('menu');
  };

  // Esc goes back to the main menu (not while in a lobby: leaving is explicit,
  // and not in-game: there Esc releases the mouse and opens the pause menu).
  useEffect(() => {
    if (inRoom || screen === 'menu' || screen === 'solo') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, inRoom]);

  // After leaving a room (in-room → not), land on the main menu.
  const wasInRoom = useRef(inRoom);
  useEffect(() => {
    if (wasInRoom.current && !inRoom) setScreen('menu');
    wasInRoom.current = inRoom;
  }, [inRoom]);

  // "Explore Alone": a private one-player game on the server.
  useEffect(() => {
    if (screen !== 'solo') return;
    let cancelled = false;
    const name = settingsStore.get().playerName || 'Explorer';
    void exploreAlone(name).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        audio.ui('error');
        notify(res.error === 'NOT_CONNECTED' ? 'Not connected to the game server – is it running?' : res.message, 'error');
        setScreen('menu');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [screen]);

  const solo = !!session.room?.solo;
  const endOverlay = end ? (
    <EndScreen
      end={end}
      solo={solo || !session.room}
      onContinue={() => {
        endStore.set({ end: null });
        if (solo || !session.room) {
          setScreen('menu');
          void leaveRoom();
        }
      }}
    />
  ) : null;

  if (session.room?.phase === 'playing') {
    return (
      <div className="stage in-game">
        <GameView
          key={session.room.code}
          onQuit={() => {
            setScreen('menu');
            void leaveRoom();
          }}
        />
        <div className="vignette" aria-hidden />
        <div className="grain" aria-hidden />
        <NoticeToast />
        {endOverlay}
      </div>
    );
  }

  let content;
  if (screen === 'solo' && (!session.room || session.room.solo)) {
    content = <p className="note">Opening the road to Kampung Hujan…</p>;
  } else if (session.room) {
    content = <Lobby room={session.room} playerId={session.playerId} resuming={session.resuming} />;
  } else {
    switch (screen) {
      case 'create':
        content = <CreateRoomScreen onBack={back} />;
        break;
      case 'join':
        content = <JoinRoomScreen onBack={back} initialCode={invite} />;
        break;
      case 'settings':
        content = <SettingsScreen onBack={back} />;
        break;
      case 'exit':
        content = <ExitScreen onBack={() => setScreen('menu')} />;
        break;
      default:
        content = <MainMenu go={(s) => setScreen(s)} />;
    }
  }

  return (
    <div className="stage">
      <Backdrop quality={settings.quality} brightness={settings.brightness} />
      <div className="shade" aria-hidden />
      <div className="vignette" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="scanline" aria-hidden />
      <main className="ui">
        <div className="screen" key={session.room ? 'lobby' : screen}>{content}</div>
        <footer className="footer">
          <ConnectionBadge />
          {!audioOn && <span className="audio-hint">Click anywhere for sound</span>}
          <span>v{GAME_VERSION}</span>
        </footer>
      </main>
      <NoticeToast />
      {endOverlay}
    </div>
  );
}
