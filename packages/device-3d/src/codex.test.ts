import { describe, expect, it } from 'vitest';
import { lidEvents, quadToMatrix3d } from './codex.js';

describe('quadToMatrix3d', () => {
  it('is a pure translation for an axis-aligned quad of the same size', () => {
    const m = quadToMatrix3d(200, 100, [{ x: 10, y: 20 }, { x: 210, y: 20 }, { x: 210, y: 120 }, { x: 10, y: 120 }]);
    expect(m).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,10,20,0,1)');
  });
  it('maps the far corner onto a perspective quad', () => {
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 90 }, { x: 5, y: 100 }];
    const v = quadToMatrix3d(50, 50, corners).slice(9, -1).split(',').map(Number);
    // CSS matrix3d is column-major; apply to (50, 50, 0, 1)
    const x = v[0]! * 50 + v[4]! * 50 + v[12]!, y = v[1]! * 50 + v[5]! * 50 + v[13]!, w = v[3]! * 50 + v[7]! * 50 + v[15]!;
    expect(x / w).toBeCloseTo(90, 6);
    expect(y / w).toBeCloseTo(90, 6);
  });
});

describe('lidEvents', () => {
  it('reports the latch and the 40 % detent once on the way up', () => {
    expect(lidEvents(0, 0.1)).toEqual(['latch-release']);
    expect(lidEvents(0.3, 0.45)).toEqual(['lid-detent']);
    expect(lidEvents(0.45, 0.3)).toEqual([]);
  });
});

describe('tokensFromDesign', () => {
  it('maps design material names and mana colors', async () => {
    const { tokensFromDesign } = await import('./codex.js');
    const t = tokensFromDesign({
      color: { mana: { R: '#d4462f' } },
      material: { bronze: { color: '#7a5a34', metalness: 1, roughness: 0.5 } },
      gem: { emissiveIntensity: { rest: 0.1, active: 1 } },
    });
    expect(t.gem?.R?.color).toBe('#d4462f');
    expect(t.material?.bronzeDark?.color).toBe('#7a5a34');
    expect(t.emissiveIntensity?.active).toBe(1);
  });
});
