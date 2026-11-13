import type { GameEnd } from '@tmf/shared';
import { audio } from '../../audio/AudioManager';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Game Over / ending screen, shown over everything until the player continues. */
export function EndScreen({ end, onContinue, solo }: { end: GameEnd; onContinue: () => void; solo: boolean }) {
  return (
    <div className="end-screen" role="dialog" aria-labelledby="end-title">
      <div className="end-panel">
        <p className="end-kicker">{end.kind === 'gameover' ? 'Game over' : 'Ending'}</p>
        <h2 className="end-title" id="end-title">
          {end.title}
        </h2>
        <p className="end-subtitle">{end.subtitle}</p>
        <div className="end-text">
          {end.text.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
        <dl className="end-stats">
          <div>
            <dt>Time in the village</dt>
            <dd>{mmss(end.stats.timeS)}</dd>
          </div>
          <div>
            <dt>Children found</dt>
            <dd>{end.stats.children} / 5</dd>
          </div>
          <div>
            <dt>Clues</dt>
            <dd>
              {end.stats.clues} / {end.stats.totalClues}
            </dd>
          </div>
          <div>
            <dt>Times someone went down</dt>
            <dd>{end.stats.downs}</dd>
          </div>
        </dl>
        <button
          className="btn btn-primary"
          type="button"
          autoFocus
          onClick={() => {
            audio.ui('select');
            onContinue();
          }}
        >
          {solo ? 'Back to menu' : 'Back to lobby'}
        </button>
      </div>
    </div>
  );
}
