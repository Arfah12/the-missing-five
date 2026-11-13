import { useState } from 'react';
import { audio } from '../../audio/AudioManager';
import { disposeConnection } from '../../net/connection';
import { PanelHead } from '../components/Controls';

/**
 * Browsers only let scripts close windows they opened themselves, so
 * "Exit" tries to close the tab and otherwise tells the player they can.
 */
export function ExitScreen({ onBack }: { onBack: () => void }) {
  const [left, setLeft] = useState(false);

  const exit = () => {
    audio.ui('back');
    audio.stopAmbience();
    disposeConnection();
    setLeft(true);
    window.close();
  };

  if (left) {
    return (
      <section className="column">
        <p className="farewell">The rain keeps falling on Kampung Hujan. You can close this tab now.</p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Return
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="column">
      <PanelHead title="Leave?" sub="The children are still waiting" onBack={onBack} />
      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={exit} autoFocus>
          Exit game
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            audio.ui('back');
            onBack();
          }}
        >
          Stay
        </button>
      </div>
    </section>
  );
}
