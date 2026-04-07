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

export type RasterImageMetadata = {
  height: number;
  mimeType: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
  width: number;
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

export function decodeBase64AssetBytes(base64: string): Uint8Array | null {
  const normalizedBase64 = base64.trim();

  if (!normalizedBase64 || normalizedBase64.length % 4 !== 0) {
    return null;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
    return null;
  }

  try {
    const decoded = Buffer.from(normalizedBase64, "base64");

    if (decoded.length === 0 || decoded.toString("base64") !== normalizedBase64) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function inspectRasterImageBytes(bytes: Uint8Array): RasterImageMetadata | null {
  return (
    inspectPng(bytes) ??
    inspectGif(bytes) ??
    inspectWebp(bytes) ??
    inspectJpeg(bytes)
  );
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

function inspectPng(bytes: Uint8Array): RasterImageMetadata | null {
  if (
    bytes.byteLength < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return null;
  }

  const width = readUint32BigEndian(bytes, 16);
  const height = readUint32BigEndian(bytes, 20);

  if (width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  return {
    height,
    mimeType: "image/png",
    width
  };
}

function inspectGif(bytes: Uint8Array): RasterImageMetadata | null {
  if (bytes.byteLength < 10) {
    return null;
  }

  const signature = Buffer.from(bytes.slice(0, 6)).toString("ascii");

  if (signature !== "GIF87a" && signature !== "GIF89a") {
    return null;
  }

  const width = readUint16LittleEndian(bytes, 6);
  const height = readUint16LittleEndian(bytes, 8);

  if (width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  return {
    height,
    mimeType: "image/gif",
    width
  };
}

function inspectWebp(bytes: Uint8Array): RasterImageMetadata | null {
  if (
    bytes.byteLength < 30 ||
    Buffer.from(bytes.slice(0, 4)).toString("ascii") !== "RIFF" ||
    Buffer.from(bytes.slice(8, 12)).toString("ascii") !== "WEBP"
  ) {
    return null;
  }

  const chunkType = Buffer.from(bytes.slice(12, 16)).toString("ascii");

  if (chunkType === "VP8X") {
    const widthMinusOne = readUint24LittleEndian(bytes, 24);
    const heightMinusOne = readUint24LittleEndian(bytes, 27);

    if (widthMinusOne === null || heightMinusOne === null) {
      return null;
    }

    return {
      height: heightMinusOne + 1,
      mimeType: "image/webp",
      width: widthMinusOne + 1
    };
  }

  if (chunkType === "VP8L") {
    if (bytes.byteLength < 25 || bytes[20] !== 0x2f) {
      return null;
    }

    const packed =
      bytes[21] |
      (bytes[22] << 8) |
      (bytes[23] << 16) |
      (bytes[24] << 24);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >> 14) & 0x3fff) + 1;

    if (width <= 0 || height <= 0) {
      return null;
    }

    return {
      height,
      mimeType: "image/webp",
      width
    };
  }

  if (chunkType === "VP8 ") {
    if (
      bytes.byteLength < 30 ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) {
      return null;
    }

    const width = readUint16LittleEndian(bytes, 26);
    const height = readUint16LittleEndian(bytes, 28);

    if (width === null || height === null) {
      return null;
    }

    return {
      height: height & 0x3fff,
      mimeType: "image/webp",
      width: width & 0x3fff
    };
  }

  return null;
}

function inspectJpeg(bytes: Uint8Array): RasterImageMetadata | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let markerOffset = offset + 1;

    while (markerOffset < bytes.byteLength && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }

    if (markerOffset >= bytes.byteLength) {
      return null;
    }

    const marker = bytes[markerOffset];

    if (marker === 0xd8 || marker === 0xd9) {
      offset = markerOffset + 1;
      continue;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = markerOffset + 1;
      continue;
    }

    const segmentLength = readUint16BigEndian(bytes, markerOffset + 1);

    if (segmentLength === null || segmentLength < 2) {
      return null;
    }

    const segmentStart = markerOffset + 3;

    if (isJpegStartOfFrameMarker(marker)) {
      const height = readUint16BigEndian(bytes, segmentStart + 1);
      const width = readUint16BigEndian(bytes, segmentStart + 3);

      if (width === null || height === null || width <= 0 || height <= 0) {
        return null;
      }

      return {
        height,
        mimeType: "image/jpeg",
        width
      };
    }

    offset = markerOffset + 1 + segmentLength;
  }

  return null;
}

function isJpegStartOfFrameMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset + 1 >= bytes.byteLength) {
    return null;
  }

  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset + 1 >= bytes.byteLength) {
    return null;
  }

  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset + 2 >= bytes.byteLength) {
    return null;
  }

  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset + 3 >= bytes.byteLength) {
    return null;
  }

  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}
