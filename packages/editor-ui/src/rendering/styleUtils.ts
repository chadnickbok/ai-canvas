import type { CSSProperties } from 'react';

import type { RenderStyleValue } from '@ai-canvas/document-core';

import { resolveBackgroundImageValue } from './assetResolution.js';
import type { ResolvedAssetsById } from './types.js';

const SAFE_RENDER_STYLE_KEYS = new Set([
  'alignContent',
  'alignItems',
  'alignSelf',
  'backgroundClip',
  'backgroundColor',
  'backgroundImage',
  'backgroundOrigin',
  'backgroundPosition',
  'backgroundRepeat',
  'backgroundSize',
  'backdropFilter',
  'border',
  'borderColor',
  'borderRadius',
  'borderStyle',
  'borderWidth',
  'bottom',
  'boxShadow',
  'color',
  'columnGap',
  'display',
  'filter',
  'flex',
  'flexBasis',
  'flexDirection',
  'flexGrow',
  'flexShrink',
  'flexWrap',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'gap',
  'height',
  'justifyContent',
  'left',
  'letterSpacing',
  'lineHeight',
  'margin',
  'marginBlock',
  'marginBottom',
  'marginInline',
  'marginLeft',
  'marginRight',
  'marginTop',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'opacity',
  'outline',
  'outlineOffset',
  'overflow',
  'overflowX',
  'overflowY',
  'padding',
  'paddingBlock',
  'paddingBottom',
  'paddingInline',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'position',
  'right',
  'rotate',
  'rowGap',
  'scale',
  'textAlign',
  'textDecoration',
  'textTransform',
  'top',
  'transform',
  'transformOrigin',
  'translate',
  'whiteSpace',
  'width',
  'zIndex',
]);

type BuildRenderStyleOptions = {
  isHtmlBox: boolean;
  isLeaf: boolean;
  isTopLevel: boolean;
  resolvedAssetsById: ResolvedAssetsById;
};

export function buildRenderStyle(
  renderStyle: Record<string, RenderStyleValue>,
  options: BuildRenderStyleOptions,
): CSSProperties {
  const style: CSSProperties = options.isHtmlBox
    ? { boxSizing: 'border-box' }
    : {};

  for (const [key, rawValue] of Object.entries(renderStyle)) {
    if (key.startsWith('--')) {
      (style as Record<string, string | number>)[key] = rawValue;
      continue;
    }

    if (!SAFE_RENDER_STYLE_KEYS.has(key)) {
      continue;
    }

    (style as Record<string, string | number | undefined>)[key] =
      key === 'backgroundImage' && typeof rawValue === 'string'
        ? resolveBackgroundImageValue(rawValue, options.resolvedAssetsById)
        : key === 'lineHeight' && typeof rawValue === 'number'
          ? `${rawValue}px`
          : rawValue;
  }

  if (options.isTopLevel && style.position === undefined) {
    style.position = 'absolute';
  }

  if (options.isLeaf && style.display === undefined) {
    style.display = 'block';
  }

  return style;
}
