/** A card's entry: image in the lens, five tabs on the info screen (one per gem). */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import {
  colorAccent, ENTRY_TAB_LABELS, ENTRY_TABS, FORMATS, gemForTab, tabForGem,
  type CardDetail, type EntryTab, type Finish, type GemIndex,
} from '@spelldex/shared/contracts';
import { cardmarketSearchUrl, scryfallCardPage } from '@spelldex/shared/scryfall';
import { cardRoute } from '../app/router.tsx';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import {
  useCard, useCombos, useLore, useMarkSeen, useOwned, usePriceHistory, usePrices, usePrintings, useRulings,
  useSeen, useSetOwned,
} from '../data/hooks.ts';
import { useDeviceButton, useDeviceStore } from '../state/device.ts';
import { CardImage } from '../ui/CardImage.tsx';
import { ManaCost, SymbolText } from '../ui/symbols.tsx';
import { Sparkline } from '../ui/Sparkline.tsx';
import { CatalogGate, eur } from './common.tsx';
import css from './screen.module.css';

const FORMAT_LABEL: Record<string, string> = {
  standard: 'Standard', pioneer: 'Pioneer', modern: 'Modern', legacy: 'Legacy', vintage: 'Vintage',
  commander: 'Commander', pauper: 'Pauper', brawl: 'Brawl', historic: 'Historic', timeless: 'Timeless',
};
const LEGALITY_LABEL = { legal: 'legal', restricted: 'eingeschränkt', banned: 'gebannt', not_legal: '–' } as const;

export function CardScreen() {
  const { id } = cardRoute.useParams();
  const { tab } = cardRoute.useSearch();
  const navigate = useNavigate({ from: cardRoute.fullPath });
  const card = useCard(id).data;
  const [back, setBack] = useState(false);
  const markSeen = useMarkSeen();
  const setAccent = useDeviceStore((s) => s.setAccent);
  const setActiveGem = useDeviceStore((s) => s.setActiveGem);
  const lang = useDeviceStore((s) => s.prefs.cardLanguage);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => setBack(false), [id]);
  useEffect(() => {
    if (card) {
      setAccent(colorAccent(card.colors));
      markSeen.mutate({ id: card.scryfallId, source: 'view' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.scryfallId]);
  useEffect(() => setActiveGem(gemForTab(tab)), [tab, setActiveGem]);

  const goTab = (t: EntryTab) => {
    if (t === tab) return;
    feedback('tab', card ? { gem: gemColor(card) } : {});
    void navigate({ search: { tab: t }, replace: true });
  };

  useDeviceButton((b) => {
    if (b.startsWith('gem-')) {
      goTab(tabForGem(Number(b.slice(4)) as GemIndex));
      return true;
    }
    const i = ENTRY_TABS.indexOf(tab);
    if (b === 'dpad-right') goTab(ENTRY_TABS[(i + 1) % ENTRY_TABS.length]!);
    else if (b === 'dpad-left') goTab(ENTRY_TABS[(i + ENTRY_TABS.length - 1) % ENTRY_TABS.length]!);
    else if (b === 'dpad-up' || b === 'dpad-down') scroller.current?.scrollBy({ top: b === 'dpad-up' ? -120 : 120, behavior: 'smooth' });
    else return false;
    return true;
  });

  const name = card ? (lang === 'de' && card.nameDe ? card.nameDe : card.name) : '';

  return (
    <>
      <TopScreen>
        <div className={css.lens}>
          {card && (
            <button
              type="button"
              className={css.lensCard}
              style={{ background: 'none', border: 0, padding: 0 }}
              ref={hapticTarget}
              aria-label={card.hasBackFace ? 'Karte umdrehen' : name}
              onClick={() => {
                if (!card.hasBackFace) return;
                feedback('swipe');
                setBack((b) => !b);
              }}
            >
              <CardImage id={card.scryfallId} name={name} size="large" back={back} />
            </button>
          )}
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <div className={css.pane} ref={scroller}>
            {card ? (
              <>
                <div className={css.spread}>
                  <h1 className={css.title}>{name}</h1>
                  <ManaCost cost={card.manaCost} />
                </div>
                <div className={css.tabs} role="tablist">
                  {ENTRY_TABS.map((t) => (
                    <button key={t} type="button" role="tab" className={css.tab} aria-selected={t === tab} ref={hapticTarget} onClick={() => goTab(t)}>
                      {ENTRY_TAB_LABELS[t]}
                    </button>
                  ))}
                </div>
                <div role="tabpanel">
                  {tab === 'overview' && <Overview card={card} lang={lang} />}
                  {tab === 'market' && <Market card={card} />}
                  {tab === 'combos' && <Combos card={card} />}
                  {tab === 'lore' && <Lore card={card} />}
                  {tab === 'printings' && <Printings card={card} />}
                </div>
              </>
            ) : (
              <p className={css.muted}>Karte wird geladen …</p>
            )}
          </div>
        </CatalogGate>
      </BottomScreen>
    </>
  );
}

const gemColor = (c: CardDetail) => {
  const a = colorAccent(c.colors);
  return a === 'multi' ? 'M' : a === 'colorless' ? 'C' : a;
};

function Overview({ card, lang }: { card: CardDetail; lang: 'de' | 'en' }) {
  const text = lang === 'de' && card.textDe ? card.textDe : card.oracleText;
  const type = lang === 'de' && card.typeLineDe ? card.typeLineDe : card.typeLine;
  const rulings = useRulings(card.scryfallId).data;
  const pt = card.power != null ? `${card.power}/${card.toughness}` : card.loyalty ?? card.defense;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className={css.spread}>
        <span className={css.muted}>{type}</span>
        {pt && <span className={css.badge}>{pt}</span>}
      </div>
      {card.faces ? (
        card.faces.map((f) => (
          <div key={f.name}>
            <div className={css.spread}><strong>{f.name}</strong><ManaCost cost={f.manaCost} /></div>
            <SymbolText className={css.body} text={f.oracleText} />
          </div>
        ))
      ) : (
        <SymbolText className={css.body} text={text} />
      )}
      {card.flavorText && <p className={css.flavor}>{card.flavorText}</p>}
      <Strength card={card} />
      <Owned card={card} />
      <table className={css.table}>
        <tbody>
          {FORMATS.filter((f) => card.legalities[f]).map((f) => (
            <tr key={f}><td>{FORMAT_LABEL[f]}</td><td>{LEGALITY_LABEL[card.legalities[f]!]}</td></tr>
          ))}
        </tbody>
      </table>
      {card.artist && <p className={css.muted}>Illustration: {card.artist}</p>}
      {rulings && rulings.length > 0 && (
        <details>
          <summary className={css.muted}>Regelhinweise ({rulings.length}, englisch)</summary>
          {rulings.map((r, i) => <p key={i} className={css.muted}>{r.published_at}: {r.comment}</p>)}
        </details>
      )}
    </div>
  );
}

function Strength({ card }: { card: CardDetail }) {
  if (!card.strength) return null;
  const p = card.strength.parts;
  const parts: [string, number][] = [['Beliebtheit', p.popularity], ['Kombos', p.combos], ['Formate', p.formats], ['Marktwert', p.market]];
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className={css.spread}>
        <span className={css.subtitle}>Stärke</span>
        <span className={css.gauge} aria-label={`Stärke ${card.strength.score} von 100`}>{card.strength.score}</span>
      </div>
      {parts.map(([label, v]) => (
        <div key={label} className={css.row}>
          <span className={css.muted} style={{ width: 90 }}>{label}</span>
          <div className={css.bar} style={{ flex: 1 }}><div className={css.barFill} style={{ width: `${Math.round(v * 100)}%` }} /></div>
        </div>
      ))}
      <p className={css.muted}>Berechnet aus EDHREC-Rang, Anzahl Kombos, Formaten und Preis. Keine KI.</p>
    </div>
  );
}

function Owned({ card }: { card: CardDetail }) {
  const owned = useOwned(card.scryfallId).data ?? [];
  const setOwned = useSetOwned();
  const lang = 'de';
  const finishes: Finish[] = card.finishes.length ? card.finishes : ['nonfoil'];
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span className={css.subtitle}>Besitze ich</span>
      {finishes.map((finish) => {
        const entry = owned.find((o) => o.finish === finish && o.lang === lang && o.condition === 'NM');
        const qty = entry?.quantity ?? 0;
        const set = (quantity: number) => {
          feedback(quantity > qty ? 'collect' : 'toggle');
          setOwned.mutate({ scryfallId: card.scryfallId, finish, lang, condition: 'NM', quantity });
        };
        return (
          <div key={finish} className={css.spread}>
            <span>{finish === 'nonfoil' ? 'Normal' : finish === 'foil' ? 'Foil' : 'Etched'}</span>
            <span className={css.stepper}>
              <button type="button" ref={hapticTarget} aria-label="Eins weniger" disabled={qty === 0} onClick={() => set(qty - 1)}>−</button>
              <span style={{ minWidth: 20, textAlign: 'center' }}>{qty}</span>
              <button type="button" ref={hapticTarget} aria-label="Eins mehr" onClick={() => set(qty + 1)}>+</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Market({ card }: { card: CardDetail }) {
  const prices = usePrices(card.scryfallId);
  const history = usePriceHistory(card.scryfallId).data;
  const url = prices.data?.cardmarketUrl ?? cardmarketSearchUrl(card.name);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {prices.isError && <p className={css.muted}>Preise gerade nicht erreichbar (offline?).</p>}
      <table className={css.table}>
        <tbody>
          <tr><td>Cardmarket Trend</td><td>{prices.isPending ? '…' : eur(prices.data?.eur)}</td></tr>
          <tr><td>Foil</td><td>{prices.isPending ? '…' : eur(prices.data?.eurFoil)}</td></tr>
        </tbody>
      </table>
      {history?.normal && history.normal.length > 1 && (
        <div>
          <span className={css.subtitle}>Verlauf 90 Tage</span>
          <Sparkline points={history.normal} />
        </div>
      )}
      <a className={css.button} href={url} target="_blank" rel="noreferrer">Auf Cardmarket ansehen</a>
      <p className={css.muted}>
        Preise: Scryfall{prices.data ? `, Stand ${new Date(prices.data.fetchedAt).toLocaleDateString('de-DE')}` : ''}. Verlauf: MTGJSON.
      </p>
    </div>
  );
}

function Combos({ card }: { card: CardDetail }) {
  const combos = useCombos(card.oracleId).data ?? [];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {card.tags.length > 0 && (
        <div>
          <span className={css.subtitle}>Gut in Decks mit</span>
          <div className={css.chips}>{card.tags.map((t) => <span key={t} className={css.chip}>{t}</span>)}</div>
        </div>
      )}
      {card.edhrecRank && <p className={css.muted}>EDHREC-Rang {card.edhrecRank.toLocaleString('de-DE')} unter allen Commander-Karten.</p>}
      <span className={css.subtitle}>Kombos ({card.comboCount})</span>
      {combos.length === 0 && <p className={css.muted}>Keine bekannten Kombos.</p>}
      <ul className={css.list}>
        {combos.map((c) => (
          <li key={c.id}>
            <a className={css.listItem} href={c.url} target="_blank" rel="noreferrer">
              <div className={css.listMain}>
                <div className={css.listName}>{c.cards.join(' + ')}</div>
                <div className={css.listMeta}>{c.produces.join(', ')}</div>
              </div>
            </a>
          </li>
        ))}
      </ul>
      {combos.length > 0 && <p className={css.muted}>Kombos: Commander Spellbook</p>}
    </div>
  );
}

function Lore({ card }: { card: CardDetail }) {
  const lore = useLore(card).data;
  const entries = lore ? [lore.character, lore.plane, ...lore.creatureTypes].filter((e) => e != null) : [];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {card.flavorText && <p className={css.flavor}>„{card.flavorText}“</p>}
      {entries.length === 0 && <p className={css.muted}>Zu dieser Karte gibt es noch keinen Lore-Eintrag.</p>}
      {entries.map((e) => (
        <section key={`${e.kind}:${e.id}`} style={{ display: 'grid', gap: 4 }}>
          <div className={css.spread}>
            <strong>{e.name.de}</strong>
            <span className={css.badge}>{{ plane: 'Ebene', 'creature-type': 'Kreaturtyp', character: 'Figur', event: 'Ereignis' }[e.kind]}</span>
          </div>
          <p className={css.body}>{e.summary.de}</p>
          {e.facts?.map((f) => <p key={f.label} className={css.muted}>{f.label}: {f.value}{f.unit ? ` ${f.unit}` : ''}</p>)}
          {e.status === 'draft' && <p className={css.muted}>Entwurf, noch nicht redaktionell geprüft.</p>}
          <p className={css.muted}>
            {e.sources.map((s, i) => <a key={i} className={css.link} href={s.url} target="_blank" rel="noreferrer">{s.title}{i < e.sources.length - 1 ? ' · ' : ''}</a>)}
          </p>
        </section>
      ))}
    </div>
  );
}

function Printings({ card }: { card: CardDetail }) {
  const printings = usePrintings(card.oracleId).data ?? [];
  const seen = useSeen(printings.map((p) => p.scryfallId)).data ?? {};
  return (
    <ul className={css.list}>
      {printings.map((p) => (
        <li key={p.scryfallId}>
          <Link
            className={css.listItem}
            data-active={p.scryfallId === card.scryfallId}
            to="/karte/$id"
            params={{ id: p.scryfallId }}
            search={{ tab: 'printings' }}
            replace
          >
            <span aria-label={seen[p.scryfallId] ? 'gesehen' : 'nicht gesehen'}>{seen[p.scryfallId] ? '◆' : '◇'}</span>
            <div className={css.listMain}>
              <div className={css.listName}>{p.setName}</div>
              <div className={css.listMeta}>{p.setCode} #{p.collectorNumber} · {p.releaseDate.slice(0, 4)} · {p.rarity}{p.isPromo ? ' · Promo' : ''}</div>
            </div>
          </Link>
        </li>
      ))}
      <li><a className={css.link} href={scryfallCardPage(card.scryfallId)} target="_blank" rel="noreferrer">Auf Scryfall ansehen</a></li>
    </ul>
  );
}
