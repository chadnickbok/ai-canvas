import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');

const args = [
  'exec',
  'electron-builder',
  '--config',
  'electron-builder.yml',
  '--publish',
  'never',
];

if (process.env.DESKTOP_TARGET === 'linux') {
  args.push('--linux');
} else if (process.env.DESKTOP_TARGET === 'mac') {
  args.push('--mac');
}

if (process.env.DESKTOP_ARCH === 'arm64') {
  args.push('--arm64');
} else if (process.env.DESKTOP_ARCH === 'x64') {
  args.push('--x64');
}

if (process.env.DESKTOP_UNSIGNED === 'true') {
  args.push('-c.mac.identity=null', '-c.mac.forceCodeSigning=false');
}

if (process.env.DESKTOP_RELEASE_VERSION) {
  args.push(`-c.extraMetadata.version=${process.env.DESKTOP_RELEASE_VERSION}`);
}

if (process.env.DESKTOP_BUILD_VERSION) {
  args.push(`-c.buildVersion=${process.env.DESKTOP_BUILD_VERSION}`);
}

const result = spawnSync('pnpm', args, {
  cwd: appDir,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
