import { GAME_TAGLINE } from '@tmf/shared';
import { MenuList } from '../components/Controls';
import type { Screen } from '../../App';

export function MainMenu({ go }: { go: (s: Screen) => void }) {
  return (
    <section className="column" aria-labelledby="game-title">
      <p className="overline">Kampung Hujan · 1998</p>
      <h1 className="title" id="game-title">
        The Missing
        <span className="five">Five</span>
      </h1>
      <p className="tagline">{GAME_TAGLINE}</p>
      <MenuList
        items={[
          { id: 'create', label: 'Create Room', onSelect: () => go('create') },
          { id: 'join', label: 'Join Room', hint: 'room code', onSelect: () => go('join') },
          { id: 'explore', label: 'Explore Alone', hint: 'prototype', onSelect: () => go('solo') },
          { id: 'settings', label: 'Settings', onSelect: () => go('settings') },
          { id: 'exit', label: 'Exit', onSelect: () => go('exit') },
        ]}
      />
    </section>
  );
}
