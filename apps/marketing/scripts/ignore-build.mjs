import { spawnSync } from 'node:child_process';

const relevantPaths = [
  '.',
  '../../package.json',
  '../../pnpm-lock.yaml',
  '../../pnpm-workspace.yaml',
  '../../tsconfig.base.json',
];

function runGit(args) {
  return spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolvePreviousSha() {
  const fromEnv = process.env.VERCEL_GIT_PREVIOUS_SHA?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  const fallback = runGit(['rev-parse', 'HEAD^']);

  if (fallback.status !== 0) {
    return null;
  }

  return fallback.stdout.trim() || null;
}

function resolveCurrentSha() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim() || 'HEAD';
}

const previousSha = resolvePreviousSha();
const currentSha = resolveCurrentSha();

if (!previousSha) {
  console.error(
    'No previous git SHA is available for the marketing app. Continuing build.',
  );
  process.exit(1);
}

const diff = runGit([
  'diff',
  '--quiet',
  previousSha,
  currentSha,
  '--',
  ...relevantPaths,
]);

if (diff.status === 0) {
  console.log(
    `No marketing-related changes between ${previousSha} and ${currentSha}. Skipping Vercel build.`,
  );
  process.exit(0);
}

if (diff.status === 1) {
  console.log(
    `Marketing-related changes detected between ${previousSha} and ${currentSha}. Continuing Vercel build.`,
  );
  process.exit(1);
}

console.error(diff.stderr || 'git diff failed while checking marketing changes.');
console.error('Continuing build to avoid an incorrect skipped deployment.');
process.exit(1);
