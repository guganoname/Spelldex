/** Card image straight from Scryfall's CDN, never cropped or altered (their terms). */
import { useState } from 'react';
import { scryfallImageUrl, type ImageSize } from '@spelldex/shared/scryfall';
import css from './ui.module.css';

export function CardImage({ id, name, size = 'normal', back = false, className }: {
  id: string; name: string; size?: ImageSize; back?: boolean; className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`${css.cardImage} ${css.cardMissing} ${className ?? ''}`} role="img" aria-label={name}>
        <span>{name}</span>
      </div>
    );
  }
  return (
    <img
      className={`${css.cardImage} ${className ?? ''}`}
      src={scryfallImageUrl(id, size, back ? 'back' : 'front')}
      alt={name}
      decoding="async"
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}
