import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";

import { err, ok, type AppResult } from "@ai-canvas/ipc-contract";

import { inspectRasterImageBytes, type RasterImageMetadata } from "./assetStorage.js";

type LookupAddress = {
  address: string;
  family: number;
};

type LookupFunction = (hostname: string) => Promise<LookupAddress[]>;

export type DownloadRasterAssetFromUrlInput = {
  fetchImpl?: typeof fetch;
  lookupImpl?: LookupFunction;
  maxBytes: number;
  maxRedirects?: number;
  url: string;
};

export type DownloadedRasterAsset = {
  bytes: Uint8Array;
  height: number;
  mimeType: RasterImageMetadata["mimeType"];
  originalFilename?: string;
  width: number;
};

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export async function downloadRasterAssetFromUrl(
  input: DownloadRasterAssetFromUrlInput
): Promise<AppResult<DownloadedRasterAsset>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const lookupImpl = input.lookupImpl ?? lookupAll;
  const maxRedirects = input.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl: URL;

  try {
    currentUrl = new URL(input.url);
  } catch {
    return err("validation_failed", `Invalid asset URL: ${input.url}`);
  }

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const urlValidation = await validatePublicAssetUrl(currentUrl, lookupImpl);

    if (!urlValidation.ok) {
      return urlValidation;
    }

    let response: Response;

    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual"
      });
    } catch (error) {
      return err(
        "internal_error",
        error instanceof Error ? error.message : `Failed to download asset URL: ${currentUrl.href}`
      );
    }

    if (REDIRECT_STATUS_CODES.has(response.status)) {
      const redirectLocation = response.headers.get("location");

      if (!redirectLocation) {
        return err(
          "validation_failed",
          `Asset URL returned HTTP ${response.status} without a redirect location`
        );
      }

      if (redirectCount === maxRedirects) {
        return err("validation_failed", `Asset URL exceeded the ${maxRedirects} redirect limit`);
      }

      try {
        currentUrl = new URL(redirectLocation, currentUrl);
      } catch {
        return err("validation_failed", `Asset URL returned an invalid redirect target`);
      }

      continue;
    }

    if (!response.ok) {
      return err("validation_failed", `Asset URL returned HTTP ${response.status}`);
    }

    const bytes = await readResponseBytes(response, input.maxBytes);

    if (!bytes.ok) {
      return bytes;
    }

    const rasterImage = inspectRasterImageBytes(bytes.data);

    if (!rasterImage) {
      return err(
        "validation_failed",
        "Downloaded asset is not a supported raster image. Supported formats: PNG, JPEG, GIF, WebP."
      );
    }

    const originalFilename = deriveOriginalFilename(currentUrl);

    return ok({
      bytes: bytes.data,
      height: rasterImage.height,
      mimeType: rasterImage.mimeType,
      ...(originalFilename === undefined ? {} : { originalFilename }),
      width: rasterImage.width
    });
  }

  return err("validation_failed", "Asset URL exceeded the redirect limit");
}

async function validatePublicAssetUrl(
  url: URL,
  lookupImpl: LookupFunction
): Promise<AppResult<void>> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return err("validation_failed", "Asset URLs must use http or https");
  }

  if (url.username || url.password) {
    return err("validation_failed", "Asset URLs must not include embedded credentials");
  }

  const hostname = normalizeHostLiteral(url.hostname);

  if (!hostname) {
    return err("validation_failed", "Asset URL must include a hostname");
  }

  let addresses: LookupAddress[];

  if (isIP(hostname)) {
    addresses = [
      {
        address: hostname,
        family: isIP(hostname)
      }
    ];
  } else {
    try {
      addresses = await lookupImpl(hostname);
    } catch (error) {
      return err(
        "internal_error",
        error instanceof Error ? error.message : `Failed to resolve asset URL host: ${hostname}`
      );
    }
  }

  if (addresses.length === 0) {
    return err("validation_failed", `Asset URL host did not resolve to an address: ${hostname}`);
  }

  if (addresses.some((address) => isBlockedIpAddress(address.address))) {
    return err(
      "validation_failed",
      "Asset URLs must resolve to public internet addresses. Localhost, loopback, link-local, and private-network targets are not allowed."
    );
  }

  return ok(undefined);
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<AppResult<Uint8Array>> {
  const contentLengthHeader = response.headers.get("content-length");

  if (contentLengthHeader) {
    const declaredSize = Number.parseInt(contentLengthHeader, 10);

    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      return err(
        "validation_failed",
        `Downloaded asset exceeds the ${maxBytes} byte limit`
      );
    }
  }

  if (!response.body) {
    const bodyBytes = new Uint8Array(await response.arrayBuffer());

    if (bodyBytes.byteLength > maxBytes) {
      return err("validation_failed", `Downloaded asset exceeds the ${maxBytes} byte limit`);
    }

    return ok(bodyBytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      byteLength += value.byteLength;

      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return err("validation_failed", `Downloaded asset exceeds the ${maxBytes} byte limit`);
      }

      chunks.push(value);
    }
  } catch (error) {
    return err(
      "internal_error",
      error instanceof Error ? error.message : "Failed while streaming the asset response"
    );
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return ok(bytes);
}

function deriveOriginalFilename(url: URL): string | undefined {
  const baseName = path.posix.basename(url.pathname);

  if (!baseName) {
    return undefined;
  }

  try {
    const decoded = decodeURIComponent(baseName);
    return decoded || undefined;
  } catch {
    return baseName;
  }
}

async function lookupAll(hostname: string): Promise<LookupAddress[]> {
  return (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => ({
    address: entry.address,
    family: entry.family
  }));
}

function normalizeHostLiteral(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isBlockedIpAddress(address: string): boolean {
  const normalizedAddress = normalizeHostLiteral(address);
  const ipFamily = isIP(normalizedAddress);

  if (ipFamily === 4) {
    return isBlockedIpv4(normalizedAddress);
  }

  if (ipFamily !== 6) {
    return true;
  }

  const mappedIpv4 = extractMappedIpv4(normalizedAddress);

  if (mappedIpv4) {
    return isBlockedIpv4(mappedIpv4);
  }

  return isBlockedIpv6(normalizedAddress);
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map((segment) => Number.parseInt(segment, 10));

  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const groups = parseIpv6(address);

  if (!groups) {
    return true;
  }

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback =
    groups.slice(0, 7).every((group) => group === 0) &&
    groups[7] === 1;

  return (
    isUnspecified ||
    isLoopback ||
    (groups[0] & 0xfe00) === 0xfc00 ||
    (groups[0] & 0xffc0) === 0xfe80 ||
    (groups[0] & 0xff00) === 0xff00
  );
}

function extractMappedIpv4(address: string): string | null {
  const lastColonIndex = address.lastIndexOf(":");

  if (lastColonIndex === -1) {
    return null;
  }

  const tail = address.slice(lastColonIndex + 1);
  return isIP(tail) === 4 ? tail : null;
}

function parseIpv6(address: string): number[] | null {
  const normalizedAddress = address.toLowerCase();
  const doubleColonIndex = normalizedAddress.indexOf("::");

  if (doubleColonIndex !== normalizedAddress.lastIndexOf("::")) {
    return null;
  }

  const [headRaw, tailRaw = ""] = normalizedAddress.split("::");
  const head = parseIpv6Segments(headRaw);
  const tail = parseIpv6Segments(tailRaw);

  if (!head || !tail) {
    return null;
  }

  if (doubleColonIndex === -1) {
    return head.length === 8 ? head : null;
  }

  const missingGroupCount = 8 - (head.length + tail.length);

  if (missingGroupCount < 1) {
    return null;
  }

  return [...head, ...Array(missingGroupCount).fill(0), ...tail];
}

function parseIpv6Segments(value: string): number[] | null {
  if (!value) {
    return [];
  }

  const rawSegments = value.split(":");
  const lastSegment = rawSegments[rawSegments.length - 1];

  if (isIP(lastSegment) === 4) {
    const ipv4Segments = lastSegment.split(".").map((segment) => Number.parseInt(segment, 10));

    if (
      ipv4Segments.length !== 4 ||
      ipv4Segments.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 255)
    ) {
      return null;
    }

    rawSegments.splice(
      rawSegments.length - 1,
      1,
      ((ipv4Segments[0] << 8) | ipv4Segments[1]).toString(16),
      ((ipv4Segments[2] << 8) | ipv4Segments[3]).toString(16)
    );
  }

  const segments = rawSegments.map((segment) => Number.parseInt(segment, 16));

  if (
    segments.some(
      (segment, index) =>
        !Number.isInteger(segment) ||
        segment < 0 ||
        segment > 0xffff ||
        rawSegments[index].length === 0
    )
  ) {
    return null;
  }

  return segments;
}
