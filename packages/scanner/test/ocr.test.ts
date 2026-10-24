import { describe, expect, it } from 'vitest';
import { parseCollectorLine } from '../src/ocr.ts';

describe('parseCollectorLine', () => {
  it('reads the 2023+ layout', () => {
    expect(parseCollectorLine('0123 R\nMOM • EN  Artist')).toEqual({ number: '123', set: 'MOM' });
  });
  it('reads the 2015-2022 layout', () => {
    expect(parseCollectorLine('123/280 M\nDMU . EN')).toEqual({ number: '123', set: 'DMU' });
  });
  it('returns nothing useful for noise', () => {
    expect(parseCollectorLine('~~ ..').number).toBeUndefined();
  });
});
