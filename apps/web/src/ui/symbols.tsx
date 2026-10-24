/** Mana and other card symbols from Scryfall's symbol SVGs (part of the card, so allowed). */
import { Fragment } from 'react';
import css from './ui.module.css';

const SYMBOL = /\{([^}]+)\}/g;
const symbolUrl = (s: string) => `https://svgs.scryfall.io/card-symbols/${s.replace(/\//g, '').toUpperCase()}.svg`;

export function Symbol({ code }: { code: string }) {
  return <img className={css.symbol} src={symbolUrl(code)} alt={`{${code}}`} loading="lazy" decoding="async" />;
}

/** Renders text with {X} symbols inline, keeping line breaks. */
export function SymbolText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return (
    <div className={className}>
      {text.split('\n').map((line, i) => (
        <p key={i}>
          {line.split(SYMBOL).map((part, j) => (j % 2 === 1 ? <Symbol key={j} code={part} /> : <Fragment key={j}>{part}</Fragment>))}
        </p>
      ))}
    </div>
  );
}

export function ManaCost({ cost }: { cost: string | null | undefined }) {
  if (!cost) return null;
  return (
    <span className={css.mana} aria-label={cost}>
      {cost.split(' // ').map((side, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={css.manaSep}>//</span>}
          {[...side.matchAll(SYMBOL)].map((m, j) => <Symbol key={j} code={m[1]!} />)}
        </Fragment>
      ))}
    </span>
  );
}
