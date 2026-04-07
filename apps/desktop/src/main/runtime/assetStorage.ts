import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  isAssetStoreSource,
  isEmbeddedAssetSource,
  type AssetRecord,
  type LocalAssetStoreSource
} from "@ai-canvas/document-core";
import type { ResolvedAssetsById } from "@ai-canvas/ipc-contract";

export const DESKTOP_ASSET_PROTOCOL = "ai-canvas-asset";

type DecodedEmbeddedAsset = {
  bytes: Uint8Array;
  contentHash: string;
};

export class AssetStorage {
  constructor(private readonly assetsDirectoryPath: string) {
    mkdirSync(this.assetsDirectoryPath, { recursive: true });
  }

  getAssetsDirectoryPath(): string {
    return this.assetsDirectoryPath;
  }

  resolveAssetFilePath(contentHash: string): string {
    return path.join(this.assetsDirectoryPath, resolveContentAddressedAssetRelativePath(contentHash));
  }

  findStoredAssetFilePath(contentHash: string): string | null {
    const assetPath = this.resolveAssetFilePath(contentHash);
    return existsSync(assetPath) ? assetPath : null;
  }

  ensureStoredBytes(contentHash: string, bytes: Uint8Array): { path: string; sizeBytes: number } {
    const assetPath = this.resolveAssetFilePath(contentHash);
    mkdirSync(path.dirname(assetPath), { recursive: true });

    if (!existsSync(assetPath)) {
      writeFileSync(assetPath, bytes);
    }

    return {
      path: assetPath,
      sizeBytes: bytes.byteLength
    };
  }

  decodeEmbeddedAsset(asset: AssetRecord): DecodedEmbeddedAsset | null {
    if (!isEmbeddedAssetSource(asset.source)) {
      return null;
    }

    const bytes =
      asset.source.kind === "base64"
        ? Buffer.from(asset.source.base64, "base64")
        : decodeDataUri(asset.source.data_uri);

    if (!bytes) {
      return null;
    }

    return {
      bytes,
      contentHash: hashAssetBytes(bytes)
    };
  }

  resolveDocumentAssets(projectId: string, assets: Record<string, AssetRecord>): ResolvedAssetsById {
    const resolvedAssets: ResolvedAssetsById = {};

    for (const asset of Object.values(assets)) {
      const resolvedAsset = this.resolveAsset(projectId, asset);

      if (resolvedAsset) {
        resolvedAssets[asset.id] = resolvedAsset;
      }
    }

    return resolvedAssets;
  }

  private resolveAsset(projectId: string, asset: AssetRecord): { url: string } | undefined {
    if (isEmbeddedAssetSource(asset.source)) {
      return {
        url:
          asset.source.kind === "data_uri"
            ? asset.source.data_uri
            : `data:${asset.mime_type};base64,${asset.source.base64}`
      };
    }

    if (!isAssetStoreSource(asset.source)) {
      return undefined;
    }

    if (!this.findStoredAssetFilePath(asset.source.content_hash)) {
      return undefined;
    }

    return {
      url: createResolvedAssetUrl(projectId, asset.id, asset.source)
    };
  }
}

export function createResolvedAssetUrl(
  projectId: string,
  assetId: string,
  source: LocalAssetStoreSource
): string {
  return `${DESKTOP_ASSET_PROTOCOL}://project/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}?content_hash=${encodeURIComponent(source.content_hash)}`;
}

export function resolveContentAddressedAssetRelativePath(contentHash: string): string {
  const normalizedHash = contentHash.trim().toLowerCase();
  const bucket = normalizedHash.slice(0, 2) || "__";
  return path.join("sha256", bucket, normalizedHash);
}

export function hashAssetBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeDataUri(dataUri: string): Uint8Array | null {
  const match = dataUri.match(/^data:([^,]*?),(.*)$/s);

  if (!match) {
    return null;
  }

  const metadata = match[1];
  const rawData = match[2];
  const isBase64 = /(?:^|;)base64(?:;|$)/i.test(metadata);

  try {
    return isBase64
      ? Buffer.from(rawData, "base64")
      : Buffer.from(decodeURIComponent(rawData), "utf8");
  } catch {
    return null;
  }
}
