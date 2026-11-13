import { SETTINGS_LIMITS, resetSettings, settingsStore, updateSettings, type Quality } from '../../lib/settings';
import { useStore } from '../../lib/store';
import { audio } from '../../audio/AudioManager';
import { PanelHead, Row, Segmented, Slider, Switch } from '../components/Controls';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const s = useStore(settingsStore);
  return (
    <section className="column">
      <PanelHead title="Settings" sub="Saved on this device" onBack={onBack} />
      <div className="settings">
        <div className="settings-group">
          <h3>Audio</h3>
          <Row label="Master volume" value={pct(s.masterVolume)}>
            <Slider label="Master volume" min={0} max={1} step={0.05} value={s.masterVolume} onChange={(v) => updateSettings({ masterVolume: v })} />
          </Row>
          <Row label="Ambience" help="Rain, wind, thunder" value={pct(s.ambienceVolume)}>
            <Slider label="Ambience volume" min={0} max={1} step={0.05} value={s.ambienceVolume} onChange={(v) => updateSettings({ ambienceVolume: v })} />
          </Row>
          <Row label="Effects & interface" value={pct(s.sfxVolume)}>
            <Slider
              label="Effects volume"
              min={0}
              max={1}
              step={0.05}
              value={s.sfxVolume}
              onChange={(v) => {
                updateSettings({ sfxVolume: v });
                audio.ui('hover');
              }}
            />
          </Row>
        </div>

        <div className="settings-group">
          <h3>Graphics</h3>
          <Row label="Quality" help="Low = no shadows, less rain">
            <Segmented<Quality>
              label="Graphics quality"
              value={s.quality}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Med' },
                { value: 'high', label: 'High' },
              ]}
              onChange={(quality) => updateSettings({ quality })}
            />
          </Row>
          <Row label="Brightness" help="Raise it if you can't see anything" value={pct(s.brightness)}>
            <Slider label="Brightness" min={SETTINGS_LIMITS.brightness[0]} max={SETTINGS_LIMITS.brightness[1]} step={0.05} value={s.brightness} onChange={(v) => updateSettings({ brightness: v })} />
          </Row>
          <Row label="Field of view" help="Takes effect in-game" value={`${s.fov}°`}>
            <Slider label="Field of view" min={SETTINGS_LIMITS.fov[0]} max={SETTINGS_LIMITS.fov[1]} step={1} value={s.fov} onChange={(v) => updateSettings({ fov: v })} />
          </Row>
        </div>

        <div className="settings-group">
          <h3>Controls</h3>
          <Row label="Mouse sensitivity" help="Takes effect in-game" value={s.mouseSensitivity.toFixed(2)}>
            <Slider
              label="Mouse sensitivity"
              min={SETTINGS_LIMITS.mouseSensitivity[0]}
              max={SETTINGS_LIMITS.mouseSensitivity[1]}
              step={0.05}
              value={s.mouseSensitivity}
              onChange={(v) => updateSettings({ mouseSensitivity: v })}
            />
          </Row>
          <Row label="Invert mouse Y" value={s.invertY ? 'On' : 'Off'}>
            <Switch label="Invert mouse Y" checked={s.invertY} onChange={(invertY) => updateSettings({ invertY })} />
          </Row>
        </div>

        <div className="actions">
          <button
            className="btn btn-small"
            type="button"
            onClick={() => {
              audio.ui('back');
              resetSettings();
            }}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </section>
  );
}
