import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const sourceIconDocumentPath = path.join(
  appDir,
  'src/assets/branding/strapping_icon.icon',
);
const sourceSvgPath = path.join(
  appDir,
  'src/assets/branding/strapping_logo.svg',
);
const iconOutputDir = path.join(appDir, 'build/icons');
const outputPngPath = path.join(iconOutputDir, 'strapping-app-icon.png');
const outputIcoPath = path.join(iconOutputDir, 'strapping-app-icon.ico');
const outputIcnsPath = path.join(iconOutputDir, 'strapping-app-icon.icns');

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: appDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Required tool "${command}" is not installed or not on PATH.`,
      );
    }

    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error
        ? String(error.stderr ?? '').trim()
        : '';
    const stdout =
      typeof error === 'object' && error !== null && 'stdout' in error
        ? String(error.stdout ?? '').trim()
        : '';
    const details = stderr || stdout;

    throw new Error(
      details ? `${command} failed: ${details}` : `${command} failed.`,
    );
  }
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected file was not generated: ${filePath}`);
  }
}

function resolveIctoolPath() {
  const developerPath = run('xcode-select', ['-p']).trim();
  const ictoolPath = path.resolve(
    developerPath,
    '../Applications/Icon Composer.app/Contents/Executables/ictool',
  );

  if (!fs.existsSync(ictoolPath)) {
    throw new Error(`Icon Composer tool was not found at ${ictoolPath}`);
  }

  return ictoolPath;
}

function exportMasterPng(ictoolPath) {
  run(ictoolPath, [
    sourceIconDocumentPath,
    '--export-image',
    '--output-file',
    outputPngPath,
    '--platform',
    'macOS',
    '--rendition',
    'Default',
    '--width',
    '1024',
    '--height',
    '1024',
    '--scale',
    '1',
  ]);
}

function writeIconset(tempDir) {
  const iconsetDir = path.join(tempDir, 'strapping-app-icon.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const targets = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [filename, size] of targets) {
    run('sips', [
      '-z',
      String(size),
      String(size),
      outputPngPath,
      '--out',
      path.join(iconsetDir, filename),
    ]);
  }

  run('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcnsPath]);
}

function writeWindowsIcon() {
  run('magick', [
    outputPngPath,
    '-define',
    'icon:auto-resize=16,32,48,64,128,256',
    outputIcoPath,
  ]);
}

function validateOutputs() {
  const identify = run('magick', [
    'identify',
    '-format',
    '%[type]|%[channels]|%[pixel:p{0,0}]|%[pixel:p{1023,1023}]',
    outputPngPath,
  ]).trim();
  const [imageType, channels, topLeftPixel, bottomRightPixel] =
    identify.split('|');

  if (!channels.toLowerCase().includes('a')) {
    throw new Error(`Generated icon is missing alpha: ${channels}`);
  }

  if (imageType.toLowerCase().includes('gray')) {
    throw new Error(`Generated icon is still grayscale: ${imageType}`);
  }

  const transparentCornerPattern = /rgba?\([^)]*,0(?:\.0+)?\)$|none$/i;

  if (
    !transparentCornerPattern.test(topLeftPixel.trim()) ||
    !transparentCornerPattern.test(bottomRightPixel.trim())
  ) {
    throw new Error(
      `Generated icon corners are not transparent: top-left=${topLeftPixel}, bottom-right=${bottomRightPixel}`,
    );
  }

  ensureFileExists(outputPngPath);
  ensureFileExists(outputIcoPath);
  ensureFileExists(outputIcnsPath);
}

function main() {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Desktop icon generation requires macOS with Xcode Icon Composer.',
    );
  }

  ensureFileExists(sourceIconDocumentPath);
  ensureFileExists(sourceSvgPath);
  fs.mkdirSync(iconOutputDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strapping-app-icon-'));

  try {
    exportMasterPng(resolveIctoolPath());
    writeWindowsIcon();
    writeIconset(tempDir);
    validateOutputs();
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }

  console.log(
    `Generated app icon assets in ${path.relative(appDir, iconOutputDir)}`,
  );
}

main();
