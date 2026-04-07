import type { ResolvedAssetsById } from './types.js';

const ASSET_BACKGROUND_IMAGE_PATTERN =
  /url\(\s*(['"]?)asset:\/\/([^'")]+)\1\s*\)/gi;

export function resolveBackgroundImageValue(
  value: string,
  resolvedAssetsById: ResolvedAssetsById,
): string {
  return value.replace(
    ASSET_BACKGROUND_IMAGE_PATTERN,
    (_match, _quote, assetId: string) => {
      const resolvedAsset = resolvedAssetsById[assetId];

      if (!resolvedAsset) {
        return 'none';
      }

      return `url(${JSON.stringify(resolvedAsset.url)})`;
    },
  );
}
