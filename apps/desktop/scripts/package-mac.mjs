import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const packageJsonPath = path.join(appDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const outputDir = path.join(appDir, 'dist', 'mac');
const iconComposerPath = path.join(
  appDir,
  'src',
  'assets',
  'branding',
  'strapping_icon.icon',
);
const iconPath = path.join(appDir, 'build', 'icons', 'strapping-app-icon.icns');
const ignoredTopLevelEntries = new Set(['build', 'dist', 'scripts', 'src']);

function normalizeRelativePath(candidatePath) {
  const relativePath = path.relative(appDir, candidatePath);
  return relativePath.split(path.sep).join('/');
}

function shouldIgnorePath(candidatePath) {
  const relativePath = normalizeRelativePath(candidatePath);

  if (
    relativePath.length === 0 ||
    relativePath === '.' ||
    relativePath.startsWith('..') ||
    relativePath === 'out' ||
    relativePath.startsWith('out/') ||
    relativePath === 'node_modules' ||
    relativePath.startsWith('node_modules/')
  ) {
    return false;
  }

  if (
    relativePath === 'electron.vite.config.ts' ||
    relativePath === 'tsconfig.node.json' ||
    relativePath === 'tsconfig.web.json'
  ) {
    return true;
  }

  const [topLevelEntry] = relativePath.split('/');
  return ignoredTopLevelEntries.has(topLevelEntry);
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('The macOS packaging flow can only run on macOS.');
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`Desktop icon asset is missing: ${iconPath}`);
  }

  if (!fs.existsSync(iconComposerPath)) {
    throw new Error(`Icon Composer asset is missing: ${iconComposerPath}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const packagePaths = await packager({
    appVersion: packageJson.version ?? '0.0.0',
    arch: process.arch,
    dir: appDir,
    icon: [iconComposerPath, iconPath],
    ignore: shouldIgnorePath,
    name: packageJson.productName ?? 'AI Canvas',
    out: outputDir,
    overwrite: true,
    platform: 'darwin',
    prune: false,
  });

  for (const packagePath of packagePaths) {
    console.log(`Packaged macOS app at ${path.relative(appDir, packagePath)}`);
  }
}

await main();
