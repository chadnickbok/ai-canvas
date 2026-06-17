import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const generatedPaths = [
  '.electron-vite',
  'coverage',
  'dist',
  'out',
  'apps/desktop/.electron-vite',
  'apps/desktop/dist',
  'apps/desktop/dist-electron',
  'apps/desktop/out',
  'apps/marketing/.next',
  'apps/marketing/dist',
  'packages/document-core/dist',
  'packages/editor-ui/dist',
  'packages/ipc-contract/dist',
  'packages/mcp-bridge/dist',
];

const skippedDirectoryNames = new Set(['.git', 'node_modules']);

for (const generatedPath of generatedPaths) {
  removePath(generatedPath);
}

removeTsBuildInfoFiles(repoRoot);

function removePath(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  rmSync(absolutePath, {
    force: true,
    recursive: true,
  });

  console.log(`removed ${relativePath}`);
}

function removeTsBuildInfoFiles(directoryPath) {
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (skippedDirectoryNames.has(entry.name)) {
        continue;
      }

      removeTsBuildInfoFiles(absolutePath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.tsbuildinfo')) {
      continue;
    }

    const relativePath = path.relative(repoRoot, absolutePath);
    rmSync(absolutePath, {
      force: true,
    });
    console.log(`removed ${relativePath}`);
  }
}
