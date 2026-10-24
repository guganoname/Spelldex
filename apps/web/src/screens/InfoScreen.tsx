import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useManifest } from '../data/hooks.ts';
import css from './screen.module.css';

export function InfoScreen() {
  const sources = useManifest().data?.sources ?? [];
  return (
    <>
      <TopScreen>
        <div className={css.center}><p className={css.title}>Quellen und Hinweise</p></div>
      </TopScreen>
      <BottomScreen>
        <div className={css.pane}>
          <p className={css.muted}>
            Spelldex ist inoffizieller Fan-Content gemäß der Fan Content Policy von Wizards of the Coast und weder von
            Wizards genehmigt noch unterstützt. Teile der verwendeten Materialien sind Eigentum von Wizards of the Coast.
            © Wizards of the Coast LLC.
          </p>
          <ul className={css.list}>
            {sources.map((s) => (
              <li key={s.name} className={css.listItem}>
                <div className={css.listMain}>
                  <a className={css.link} href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
                  <div className={css.listMeta}>{s.license}</div>
                </div>
              </li>
            ))}
            <li className={css.listItem}>
              <div className={css.listMain}>
                <a className={css.link} href="https://mtg.wiki" target="_blank" rel="noreferrer">MTG Wiki</a>
                <div className={css.listMeta}>Nur als Verweis verlinkt (CC BY-NC-SA 4.0), keine Texte übernommen</div>
              </div>
            </li>
          </ul>
          <p className={css.muted}>Kartenbilder und Tagespreise lädt dein Gerät direkt von Scryfall. Spelldex nutzt keine KI.</p>
        </div>
      </BottomScreen>
    </>
  );
}
