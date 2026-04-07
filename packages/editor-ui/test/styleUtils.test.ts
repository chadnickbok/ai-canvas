import { describe, expect, it } from 'vitest';

import { buildRenderStyle } from '../src/rendering/styleUtils.js';

describe('render style helpers', () => {
  it('emits only safe render-style keys and applies asset and box defaults', () => {
    const style = buildRenderStyle(
      {
        '--token': '1',
        backgroundImage: 'url(asset://hero)',
        color: '#111111',
        lineHeight: 24,
        unknownStyleKey: 'ignore-me',
        width: 320,
      },
      {
        isHtmlBox: true,
        isLeaf: true,
        isTopLevel: true,
        resolvedAssetsById: {
          hero: {
            url: 'https://cdn.example.test/hero.png',
          },
        },
      },
    );

    expect(style.boxSizing).toBe('border-box');
    expect(style.position).toBe('absolute');
    expect(style.display).toBe('block');
    expect(style.backgroundImage).toBe(
      'url("https://cdn.example.test/hero.png")',
    );
    expect(style.lineHeight).toBe('24px');
    expect(style.color).toBe('#111111');
    expect(style.width).toBe(320);
    expect((style as Record<string, unknown>)['--token']).toBe('1');
    expect((style as Record<string, unknown>).unknownStyleKey).toBeUndefined();
  });

  it('does not override explicit position or display values', () => {
    const style = buildRenderStyle(
      {
        display: 'flex',
        position: 'relative',
      },
      {
        isHtmlBox: false,
        isLeaf: true,
        isTopLevel: true,
        resolvedAssetsById: {},
      },
    );

    expect(style.position).toBe('relative');
    expect(style.display).toBe('flex');
    expect(style.boxSizing).toBeUndefined();
  });
});
