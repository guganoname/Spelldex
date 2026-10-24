import { feedback, hapticTarget, isIOS } from '@spelldex/design/feedback';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useCatalogReady } from '../data/hooks.ts';
import { useDeviceStore } from '../state/device.ts';
import { requestPersistentStorage } from '../app/bootstrap.ts';
import css from './screen.module.css';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <label className={css.spread} style={{ minHeight: 44 }}>
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={value}
        ref={hapticTarget}
        onChange={(e) => {
          feedback('toggle');
          onChange(e.target.checked);
        }}
      />
    </label>
  );
}

export function SettingsScreen() {
  const prefs = useDeviceStore((s) => s.prefs);
  const setPrefs = useDeviceStore((s) => s.setPrefs);
  const catalog = useCatalogReady();
  return (
    <>
      <TopScreen>
        <div className={css.center}><p className={css.title}>Einstellungen</p></div>
      </TopScreen>
      <BottomScreen>
        <div className={css.pane}>
          <Toggle label="Klänge" value={prefs.sound} onChange={(sound) => setPrefs({ sound })} />
          <Toggle label="Haptik" value={prefs.haptics} onChange={(haptics) => setPrefs({ haptics })} />
          <label className={css.spread}>
            <span>Lautstärke</span>
            <input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => setPrefs({ volume: Number(e.target.value) })} />
          </label>
          <Toggle label="Klänge trotz Lautlos-Schalter" value={prefs.audioSession === 'playback'} onChange={(v) => setPrefs({ audioSession: v ? 'playback' : 'ambient' })} />
          {isIOS && (
            <Toggle label="Haptik-Muster (iPhone)" value={prefs.iosHaptics === 'hybrid'} onChange={(v) => setPrefs({ iosHaptics: v ? 'hybrid' : 'tap' })} />
          )}
          <Toggle label="Kartentexte auf Deutsch" value={prefs.cardLanguage === 'de'} onChange={(de) => setPrefs({ cardLanguage: de ? 'de' : 'en' })} />
          <Toggle label="Weniger Bewegung" value={prefs.reducedMotion ?? false} onChange={(v) => setPrefs({ reducedMotion: v })} />
          <Toggle label="3D-Gerät" value={prefs.shell !== '2d'} onChange={(v) => setPrefs({ shell: v ? null : '2d' })} />
          <button type="button" className={css.button} ref={hapticTarget} onClick={() => void requestPersistentStorage()}>
            Speicher dauerhaft sichern
          </button>
          <hr className={css.hr} />
          <p className={css.muted}>
            Kartenarchiv: {catalog.version ?? 'nicht installiert'}
            {catalog.cards ? ` · ${catalog.cards.toLocaleString('de-DE')} Karten, ${catalog.printings?.toLocaleString('de-DE')} Drucke` : ''}
            {catalog.storage === 'memory' ? ' · nur im Arbeitsspeicher (dieser Browser unterstützt kein OPFS)' : ''}
          </p>
          <p className={css.muted}>Tipp: Über „Teilen → Zum Home-Bildschirm“ installieren, dann bleibt die Sammlung sicher gespeichert.</p>
        </div>
      </BottomScreen>
    </>
  );
}
