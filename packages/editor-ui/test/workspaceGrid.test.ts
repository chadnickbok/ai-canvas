import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceGridGeometry,
  shouldRenderMinorGridLines,
  snapGridLineToDevicePixel,
} from '../src/rendering/workspaceGrid.js';

describe('workspace grid helpers', () => {
  it('keeps major lines visible below 25% zoom while suppressing minor lines', () => {
    const geometry = buildWorkspaceGridGeometry({
      devicePixelRatio: 1,
      viewport: {
        panX: 0,
        panY: 0,
        zoom: 0.24,
      },
      viewportSize: {
        height: 1024,
        width: 1024,
      },
    });

    expect(shouldRenderMinorGridLines(0.24)).toBe(false);
    expect(geometry.majorLines.length).toBeGreaterThan(0);
    expect(geometry.minorLines).toEqual([]);
  });

  it('snaps grid lines to device pixels for crisp rendering under fractional pan and zoom', () => {
    const geometry = buildWorkspaceGridGeometry({
      devicePixelRatio: 1,
      viewport: {
        panX: 13.2,
        panY: 27.7,
        zoom: 0.71,
      },
      viewportSize: {
        height: 600,
        width: 800,
      },
    });

    expect(geometry.majorLines.length).toBeGreaterThan(0);

    for (const line of geometry.majorLines.slice(0, 8)) {
      expect(line.screenCoordinate * 2).toBeCloseTo(
        Math.round(line.screenCoordinate * 2),
        8,
      );
    }
  });

  it('applies half-pixel offsets for one-pixel strokes on standard displays', () => {
    expect(
      snapGridLineToDevicePixel(10.2, { devicePixelRatio: 1, strokeWidth: 1 }),
    ).toBe(10.5);
    expect(
      snapGridLineToDevicePixel(10.2, { devicePixelRatio: 2, strokeWidth: 1 }),
    ).toBe(10);
  });
});
