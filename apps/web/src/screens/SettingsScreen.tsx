import { useState } from 'react';
import { feedback, hapticTarget, isIOS } from '@spelldex/design/feedback';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useCatalogReady } from '../data/hooks.ts';
import { useDeviceStore } from '../state/device.ts';
import { requestPersistentStorage } from '../app/bootstrap.ts';
import { useI18n } from '../i18n/index.ts';
import { LanguageSwitch } from './common.tsx';
import css from './screen.module.css';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <label className={css.field}>
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
  const { t, num } = useI18n();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  return (
    <>
      <TopScreen>
        <div className={css.center}><p className={css.title}>{t('settings.title')}</p></div>
      </TopScreen>
      <BottomScreen>
        <div className={css.pane}>
          <div className={css.field}>
            <span>{t('settings.language')}</span>
            <LanguageSwitch target="ui" label={t('settings.language')} />
          </div>
          <div className={css.field}>
            <span>{t('settings.cardLanguage')}</span>
            <LanguageSwitch target="card" label={t('settings.cardLanguage')} />
          </div>
          <p className={css.muted} style={{ margin: '-6px 0 0' }}>{t('settings.cardLanguageHint')}</p>
          <hr className={css.hr} />
          <Toggle label={t('settings.sound')} value={prefs.sound} onChange={(sound) => setPrefs({ sound })} />
          <label className={css.field}>
            <span>{t('settings.volume')}</span>
            <input
              type="range" min={0} max={1} step={0.05} value={prefs.volume} disabled={!prefs.sound}
              aria-valuetext={`${Math.round(prefs.volume * 100)} %`}
              onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
              onPointerUp={() => feedback('press')}
            />
          </label>
          <Toggle label={t('settings.ignoreMute')} value={prefs.audioSession === 'playback'} onChange={(v) => setPrefs({ audioSession: v ? 'playback' : 'ambient' })} />
          <Toggle label={t('settings.haptics')} value={prefs.haptics} onChange={(haptics) => setPrefs({ haptics })} />
          {isIOS && (
            <Toggle label={t('settings.iosPatterns')} value={prefs.iosHaptics === 'hybrid'} onChange={(v) => setPrefs({ iosHaptics: v ? 'hybrid' : 'tap' })} />
          )}
          <hr className={css.hr} />
          <Toggle label={t('settings.reducedMotion')} value={prefs.reducedMotion ?? false} onChange={(v) => setPrefs({ reducedMotion: v })} />
          <Toggle label={t('settings.device3d')} value={prefs.shell !== '2d'} onChange={(v) => setPrefs({ shell: v ? null : '2d' })} />
          <button
            type="button"
            className={css.button}
            ref={hapticTarget}
            onClick={() => {
              feedback('press');
              void requestPersistentStorage().then(setPersisted, () => setPersisted(false));
            }}
          >
            {t('settings.persist')}
          </button>
          {persisted != null && <p className={css.muted} role="status">{t(persisted ? 'settings.persisted' : 'settings.persistDenied')}</p>}
          <hr className={css.hr} />
          <p className={css.muted}>
            {t('settings.catalog')}: {catalog.version ?? t('settings.notInstalled')}
            {catalog.cards ? ` · ${t('settings.counts', { cards: num(catalog.cards), printings: num(catalog.printings ?? 0) })}` : ''}
            {catalog.storage === 'memory' ? ` · ${t('settings.memoryOnly')}` : ''}
          </p>
          <p className={css.muted}>{t('settings.installTip')}</p>
        </div>
      </BottomScreen>
    </>
  );
}
