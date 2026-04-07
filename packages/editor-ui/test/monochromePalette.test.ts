import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(TEST_DIRECTORY, '../../..');
const EDITOR_SOURCE_DIRECTORY = resolve(TEST_DIRECTORY, '../src');
const RENDERER_STYLE_FILE = resolve(
  WORKSPACE_ROOT,
  'apps/desktop/src/renderer/styles.css',
);
const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

function collectSourceFiles(directoryPath: string): string[] {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const sourceFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      sourceFiles.push(...collectSourceFiles(entryPath));
      continue;
    }

    if (!SOURCE_FILE_EXTENSIONS.has(extname(entry.name))) {
      continue;
    }

    sourceFiles.push(entryPath);
  }

  return sourceFiles;
}

function isGrayscaleHexColor(token: string): boolean {
  const digits = token.slice(1);

  if (digits.length === 3 || digits.length === 4) {
    return digits[0] === digits[1] && digits[1] === digits[2];
  }

  if (digits.length === 6 || digits.length === 8) {
    return (
      digits.slice(0, 2).toLowerCase() === digits.slice(2, 4).toLowerCase() &&
      digits.slice(2, 4).toLowerCase() === digits.slice(4, 6).toLowerCase()
    );
  }

  return false;
}

function isGrayscaleRgbColor(token: string): boolean {
  const numericParts = token.match(/[\d.]+/g);

  if (!numericParts || numericParts.length < 3) {
    return false;
  }

  const [red, green, blue] = numericParts
    .slice(0, 3)
    .map((part) => Number.parseFloat(part));

  return red === green && green === blue;
}

function findNonGrayscaleColorLiterals(filePath: string): string[] {
  const contents = readFileSync(filePath, 'utf8');
  const matches = contents.match(/#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)/g) ?? [];

  return matches.filter((token) =>
    token.startsWith('#')
      ? !isGrayscaleHexColor(token)
      : !isGrayscaleRgbColor(token),
  );
}

describe('monochrome chrome palette', () => {
  it('keeps app chrome color literals grayscale', () => {
    expect(statSync(RENDERER_STYLE_FILE).isFile()).toBe(true);

    const filesToCheck = [
      ...collectSourceFiles(EDITOR_SOURCE_DIRECTORY),
      RENDERER_STYLE_FILE,
    ];
    const violations = filesToCheck.flatMap((filePath) =>
      findNonGrayscaleColorLiterals(filePath).map(
        (token) => `${relative(WORKSPACE_ROOT, filePath)}: ${token}`,
      ),
    );

    expect(violations).toEqual([]);
  });
});
