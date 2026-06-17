import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import config from '../../electron.vite.config';

const preloadSourcePath = fileURLToPath(
  new URL('../preload/index.ts', import.meta.url),
);

describe('desktop preload compatibility', () => {
  it('builds preload as a CommonJS bundle for sandboxed renderers', () => {
    const preloadBuild = config.preload?.build;
    const output = preloadBuild?.rollupOptions?.output;
    const format = Array.isArray(output) ? output[0]?.format : output?.format;

    expect(format).toBe('cjs');
  });

  it('keeps preload runtime imports limited to electron', () => {
    const source = readFileSync(preloadSourcePath, 'utf8');
    const runtimeImports = [
      ...source.matchAll(/^import\s+(?!type\b).*from\s+["']([^"']+)["'];?$/gm),
    ]
      .map((match) => match[1])
      .sort();

    expect(runtimeImports).toEqual(['electron']);
  });

  it('exposes snapshot import and export bridge methods', () => {
    const source = readFileSync(preloadSourcePath, 'utf8');

    expect(source).toContain('exportProjectSnapshot');
    expect(source).toContain('importProjectSnapshot');
  });
});
