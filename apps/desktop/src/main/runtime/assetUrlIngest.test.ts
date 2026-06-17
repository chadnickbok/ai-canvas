import { describe, expect, it, vi } from 'vitest';

import { downloadRasterAssetFromUrl } from './assetUrlIngest.js';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZcAAAAASUVORK5CYII=';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, 'base64');

describe('downloadRasterAssetFromUrl', () => {
  it('downloads a public PNG URL, validates it, and derives metadata', async () => {
    const result = await downloadRasterAssetFromUrl({
      fetchImpl: async () =>
        new Response(TINY_PNG_BYTES, {
          headers: {
            'content-type': 'application/octet-stream',
          },
          status: 200,
        }),
      lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
      maxBytes: 1024,
      url: 'https://cdn.example.test/logo.png',
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(Buffer.from(result.data.bytes).equals(TINY_PNG_BYTES)).toBe(true);
    expect(result.data).toMatchObject({
      height: 1,
      mimeType: 'image/png',
      originalFilename: 'logo.png',
      width: 1,
    });
  });

  it('rejects localhost and private-network targets before fetching', async () => {
    const fetchImpl = vi.fn();
    const result = await downloadRasterAssetFromUrl({
      fetchImpl,
      lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }],
      maxBytes: 1024,
      url: 'http://localhost/logo.png',
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: {
        code: 'validation_failed',
        message:
          'Asset URLs must resolve to public internet addresses. Localhost, loopback, link-local, and private-network targets are not allowed.',
      },
      ok: false,
    });
  });

  it('rejects redirects that land on blocked hosts', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(null, {
        headers: {
          location: 'http://127.0.0.1/logo.png',
        },
        status: 302,
      }),
    );
    const result = await downloadRasterAssetFromUrl({
      fetchImpl,
      lookupImpl: async (hostname) =>
        hostname === 'cdn.example.test'
          ? [{ address: '93.184.216.34', family: 4 }]
          : [{ address: '127.0.0.1', family: 4 }],
      maxBytes: 1024,
      url: 'https://cdn.example.test/logo.png',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      error: {
        code: 'validation_failed',
        message:
          'Asset URLs must resolve to public internet addresses. Localhost, loopback, link-local, and private-network targets are not allowed.',
      },
      ok: false,
    });
  });

  it('rejects non-raster downloads even when the response succeeds', async () => {
    const result = await downloadRasterAssetFromUrl({
      fetchImpl: async () =>
        new Response('plain text', {
          headers: {
            'content-type': 'text/plain',
          },
          status: 200,
        }),
      lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
      maxBytes: 1024,
      url: 'https://cdn.example.test/not-an-image.txt',
    });

    expect(result).toEqual({
      error: {
        code: 'validation_failed',
        message:
          'Downloaded asset is not a supported raster image. Supported formats: PNG, JPEG, GIF, WebP.',
      },
      ok: false,
    });
  });

  it('rejects oversized downloads from Content-Length before reading the body', async () => {
    const result = await downloadRasterAssetFromUrl({
      fetchImpl: async () =>
        new Response(new Uint8Array([0x00]), {
          headers: {
            'content-length': '2048',
          },
          status: 200,
        }),
      lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
      maxBytes: 1024,
      url: 'https://cdn.example.test/large.png',
    });

    expect(result).toEqual({
      error: {
        code: 'validation_failed',
        message: 'Downloaded asset exceeds the 1024 byte limit',
      },
      ok: false,
    });
  });

  it('rejects oversized downloads while streaming when Content-Length is absent', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0x01, 0x02, 0x03]));
        controller.enqueue(new Uint8Array([0x04, 0x05, 0x06]));
        controller.close();
      },
    });
    const result = await downloadRasterAssetFromUrl({
      fetchImpl: async () =>
        new Response(stream, {
          status: 200,
        }),
      lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
      maxBytes: 4,
      url: 'https://cdn.example.test/streamed.png',
    });

    expect(result).toEqual({
      error: {
        code: 'validation_failed',
        message: 'Downloaded asset exceeds the 4 byte limit',
      },
      ok: false,
    });
  });
});
