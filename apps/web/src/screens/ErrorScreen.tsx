/** Route-level error and not-found screens, rendered inside the device like every other screen. */
import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useEffect } from 'react';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useI18n } from '../i18n/index.ts';
import css from './screen.module.css';

const RELOAD_FLAG = 'spelldex-chunk-reload';

/** A screen chunk that no longer exists: the app was updated while this tab was open. */
export const isChunkError = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically/i.test(
    String((e as Error)?.message ?? e),
  );

export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { t } = useI18n();
  const chunk = isChunkError(error);
  useEffect(() => {
    console.error('[route]', error);
    feedback('error');
    // Reload once by itself for a stale chunk; a second failure shows the button instead of looping.
    if (chunk && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      location.reload();
    }
  }, [error, chunk]);
  return (
    <>
      <TopScreen>
        <div className={css.center}><p className={css.title}>{t('error.title')}</p></div>
      </TopScreen>
      <BottomScreen>
        <div className={css.pane}>
          <p className={css.muted}>{chunk ? t('error.update') : String((error as Error)?.message ?? error)}</p>
          <button
            type="button"
            className={css.button}
            ref={hapticTarget}
            onClick={() => {
              if (chunk) {
                location.reload();
                return;
              }
              reset();
              void router.invalidate();
            }}
          >
            {chunk ? t('common.reload') : t('common.retry')}
          </button>
          <Link to="/" className={css.link}>{t('common.home')}</Link>
        </div>
      </BottomScreen>
    </>
  );
}

export function NotFoundScreen() {
  const { t } = useI18n();
  return (
    <>
      <TopScreen>
        <div className={css.center}><span className={css.emblem}>404</span></div>
      </TopScreen>
      <BottomScreen>
        <div className={css.pane}>
          <Link to="/" className={css.button}>{t('common.home')}</Link>
        </div>
      </BottomScreen>
    </>
  );
}

/** Called once the app runs fine, so a later stale chunk may auto-reload again. */
export function clearChunkReloadFlag() {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* private mode */ }
}
