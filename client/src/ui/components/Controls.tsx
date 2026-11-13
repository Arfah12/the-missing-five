import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { audio } from '../../audio/AudioManager';

/* ───────────── Menu list with arrow-key navigation ───────────── */

export interface MenuEntry {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function MenuList({ items, autoFocus = true }: { items: MenuEntry[]; autoFocus?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current.find((b) => b && !b.disabled)?.focus({ preventScroll: true });
  }, [autoFocus]);

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const enabled = refs.current.filter((b): b is HTMLButtonElement => !!b && !b.disabled);
    const i = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % enabled.length : (i - 1 + enabled.length) % enabled.length;
    enabled[next]?.focus();
  };

  return (
    <ul className="menu" onKeyDown={onKey}>
      {items.map((item, i) => (
        <li key={item.id}>
          <button
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className="menu-item"
            disabled={item.disabled}
            onMouseEnter={() => audio.ui('hover')}
            onFocus={() => audio.ui('hover')}
            onClick={() => {
              audio.ui('select');
              item.onSelect();
            }}
          >
            <span className="num">{String(i + 1).padStart(2, '0')}</span>
            {item.label}
            {item.hint && <span className="hint">{item.hint}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Panel header with back button ───────────── */

export function PanelHead({ title, sub, onBack }: { title: string; sub?: string; onBack?: () => void }) {
  return (
    <div className="panel-head">
      {onBack && (
        <button
          type="button"
          className="back"
          aria-label="Back"
          onClick={() => {
            audio.ui('back');
            onBack();
          }}
        >
          ←
        </button>
      )}
      <div>
        <h2 className="panel-title">{title}</h2>
        {sub && <p className="panel-sub">{sub}</p>}
      </div>
    </div>
  );
}

/* ───────────── Settings rows ───────────── */

export function Row({ label, help, value, children }: { label: string; help?: string; value?: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">
        {label}
        {help && <small>{help}</small>}
      </span>
      <span>{children}</span>
      <span className="row-value">{value}</span>
    </div>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      className="slider"
      type="range"
      aria-label={props.label}
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="switch"
      onClick={() => {
        audio.ui('select');
        onChange(!checked);
      }}
    />
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => {
            audio.ui('select');
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
