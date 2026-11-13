import { CHOICES, DOCS, INVENTORY_SLOTS, RADIO_FREQ, type ChoiceId, type InvItem, type ObjectiveState, type WorldSnapshot } from '@tmf/shared';

/**
 * Keyboard-driven in-game panels. The mouse stays captured while they are
 * open, so everything works from the keyboard (hints are shown on each).
 */

const KIND_LABEL: Record<string, string> = {
  diary: 'Diary page',
  document: 'Document',
  photo: 'Photograph',
  cassette: 'Cassette transcript',
  belonging: 'Belonging',
  note: 'Note',
};

export function DocReader({ doc, hint }: { doc: string; hint: string }) {
  const d = DOCS[doc];
  if (!d) return null;
  return (
    <div className="game-overlay dim">
      <article className={`doc-sheet ${d.kind}`}>
        <p className="overline">{KIND_LABEL[d.kind] ?? 'Clue'}</p>
        <h2 className="doc-title">{d.title}</h2>
        {d.body.map((para, i) => (
          <p key={i} className="doc-body">
            {para}
          </p>
        ))}
        {d.footer && <p className="doc-footer">{d.footer}</p>}
        <p className="panel-keys">{hint}</p>
      </article>
    </div>
  );
}

export function InventoryPanel({ items, selected, battery }: { items: (InvItem | null)[]; selected: number; battery: number }) {
  const sel = items[selected];
  return (
    <div className="game-overlay dim">
      <div className="overlay-panel wide">
        <p className="overline">Inventory</p>
        <ol className="inv-slots">
          {Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
            const it = items[i];
            return (
              <li key={i} className={`inv-slot${i === selected ? ' selected' : ''}${it ? '' : ' empty'}`}>
                <span className="inv-num">{i + 1}</span>
                <span className="inv-icon" data-type={it?.type ?? 'none'} aria-hidden />
                <span className="inv-name">{it ? it.name : 'Empty'}</span>
              </li>
            );
          })}
        </ol>
        <p className="note">
          Torch battery: {Math.round(battery * 100)}%{sel?.type === 'battery' ? ' — press E to put this one in.' : ''}
        </p>
        <p className="panel-keys">1–5 select · E use · G drop · Tab close</p>
      </div>
    </div>
  );
}

export function JournalPanel({ world, selected, tab }: { world: WorldSnapshot | null; selected: number; tab: 'objectives' | 'clues' }) {
  const objectives = world?.objectives ?? [];
  const clues = world?.journal ?? [];
  const row = (o: ObjectiveState) => (
    <li key={o.id} className={`objective${o.done ? ' done' : ''}${o.hidden ? ' hidden' : ''}`}>
      <span className="check" aria-hidden>
        {o.done ? '✕' : ''}
      </span>
      <span>
        <strong>{o.title}</strong>
        {o.progress && <em> {o.progress}</em>}
        <small>{o.description}</small>
      </span>
    </li>
  );
  return (
    <div className="game-overlay dim">
      <div className="overlay-panel journal">
        <div className="journal-tabs">
          <span className={tab === 'objectives' ? 'on' : ''}>Objectives</span>
          <span className={tab === 'clues' ? 'on' : ''}>Clues ({clues.length})</span>
        </div>
        {tab === 'objectives' ? (
          <div className="journal-cols">
            <section>
              <h3>Find the five</h3>
              <ul>{objectives.filter((o) => o.main).map(row)}</ul>
            </section>
            <section>
              <h3>Optional</h3>
              <ul>{objectives.filter((o) => !o.main).map(row)}</ul>
            </section>
          </div>
        ) : (
          <ul className="clue-list">
            {clues.length === 0 && <li className="note">Nothing yet. Look around – pages, photographs, tapes…</li>}
            {clues.map((c, i) => (
              <li key={c.doc} className={i === selected ? 'selected' : ''}>
                <span>{DOCS[c.doc]?.title ?? c.doc}</span>
                <small>found by {c.by}</small>
              </li>
            ))}
          </ul>
        )}
        {tab === 'objectives' && (world?.decisions.length ?? 0) > 0 && (
          <p className="note decisions">
            {world!.decisions.map((d) => `${d.by}: ${CHOICES[d.choice].options.find((o) => o.id === d.option)?.label ?? d.option}`).join(' · ')}
          </p>
        )}
        <p className="panel-keys">{tab === 'clues' ? '↑↓ choose · E read · ' : ''}←→ switch tab · J close</p>
      </div>
    </div>
  );
}

export function FusePanel({ fuse, power }: { fuse: boolean[]; power: boolean }) {
  return (
    <div className="game-overlay dim">
      <div className="overlay-panel">
        <p className="overline">Fuse box · SK Sungai Senyap</p>
        <div className="fuse-row">
          {fuse.map((on, i) => (
            <div key={i} className={`fuse${on || power ? ' on' : ''}`}>
              <span className="fuse-lever" />
              <span className="fuse-num">{i + 1}</span>
            </div>
          ))}
        </div>
        <p className="note">{power ? 'Power is on. The building hums.' : 'Four breakers, all down. Somebody left a note about these…'}</p>
        <p className="panel-keys">1–4 flip a breaker · Q close</p>
      </div>
    </div>
  );
}

export function RadioPanel({ freq, solved }: { freq: number; solved: boolean }) {
  const pct = ((freq - 88) / (108 - 88)) * 100;
  const close = Math.abs(freq - RADIO_FREQ);
  const signal = close < 0.06 ? 'clear' : close < 1.1 ? 'faint' : 'static';
  return (
    <div className="game-overlay dim">
      <div className="overlay-panel">
        <p className="overline">Radio · Philips 1984</p>
        <div className="radio-dial">
          <div className="radio-scale">
            {[88, 92, 96, 100, 104, 108].map((f) => (
              <span key={f} style={{ left: `${((f - 88) / 20) * 100}%` }}>
                {f}
              </span>
            ))}
          </div>
          <div className="radio-needle" style={{ left: `${pct}%` }} />
        </div>
        <p className="radio-freq">{freq.toFixed(1)} MHz</p>
        <p className={`note radio-${signal}`}>{solved ? 'The voices are gone. Only rain on the antenna.' : signal === 'clear' ? 'Voices! Press E to listen.' : signal === 'faint' ? 'Something under the static…' : 'Static.'}</p>
        <p className="panel-keys">A / D or ←→ tune · E listen · Q close</p>
      </div>
    </div>
  );
}

export function PadlockPanel({ digits, wheel, error }: { digits: number[]; wheel: number; error: boolean }) {
  return (
    <div className="game-overlay dim">
      <div className="overlay-panel">
        <p className="overline">Combination padlock</p>
        <div className={`padlock${error ? ' shake' : ''}`}>
          {digits.map((d, i) => (
            <span key={i} className={`wheel${i === wheel ? ' active' : ''}`}>
              {d}
            </span>
          ))}
        </div>
        <p className="note">Four numbers. A date nobody here can forget?</p>
        <p className="panel-keys">0–9 type · ←→ wheel · ↑↓ turn · E try · Q close</p>
      </div>
    </div>
  );
}

/** PA announcement / radio voices shown as subtitles for everyone. */
export function Subtitle({ doc }: { doc: string }) {
  const d = DOCS[doc];
  if (!d) return null;
  return (
    <div className="subtitle">
      <strong>{d.title}</strong>
      {d.body.map((b, i) => (
        <span key={i}>{b}</span>
      ))}
    </div>
  );
}

/** A story choice: numbered options, chosen with the number keys. */
export function ChoicePanel({ choice, busy }: { choice: ChoiceId; busy: boolean }) {
  const c = CHOICES[choice];
  return (
    <div className="game-overlay dim">
      <div className="overlay-panel wide choice-panel">
        <p className="overline">A choice</p>
        <h2 className="doc-title">{c.title}</h2>
        {c.text.map((t, i) => (
          <p key={i} className="doc-body">
            {t}
          </p>
        ))}
        <ol className="choice-options">
          {c.options.map((o, i) => (
            <li key={o.id}>
              <span className="inv-num">{i + 1}</span>
              <span>
                <strong>{o.label}</strong>
                <small>{o.hint}</small>
              </span>
            </li>
          ))}
        </ol>
        <p className="panel-keys">{busy ? '…' : `1–${c.options.length} choose · Q back`}</p>
      </div>
    </div>
  );
}
