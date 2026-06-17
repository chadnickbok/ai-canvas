import type {
  AssetRecord,
  AssetSource,
  EmbeddedAssetSource,
  LocalAssetStoreSource,
  RendererDocument,
} from './types.js';

export function isEmbeddedAssetSource(
  source: AssetSource,
): source is EmbeddedAssetSource {
  return source.kind === 'data_uri' || source.kind === 'base64';
}

export function isAssetStoreSource(
  source: AssetSource,
): source is LocalAssetStoreSource {
  return source.kind === 'asset_store';
}

export function collectEmbeddedAssets(
  document: RendererDocument,
): AssetRecord[] {
  return Object.values(document.assets).filter((asset) =>
    isEmbeddedAssetSource(asset.source),
  );
}

export function replaceAssetSources(
  document: RendererDocument,
  replacements: Record<string, AssetSource | undefined>,
): RendererDocument {
  const nextDocument = structuredClone(document);

  for (const [assetId, nextSource] of Object.entries(replacements)) {
    if (!nextSource || !nextDocument.assets[assetId]) {
      continue;
    }

    nextDocument.assets[assetId] = {
      ...nextDocument.assets[assetId],
      source: structuredClone(nextSource),
    };
  }

  return nextDocument;
}
