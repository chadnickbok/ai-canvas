import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const cliArgs = process.argv.slice(2);
const target = readArgValue('--target') ?? process.env.DESKTOP_TARGET;
const arch = readArgValue('--arch') ?? process.env.DESKTOP_ARCH;
const isUnsigned =
  cliArgs.includes('--unsigned') || process.env.DESKTOP_UNSIGNED === 'true';

const args = [
  'exec',
  'electron-builder',
  '--config',
  'electron-builder.yml',
  '--publish',
  'never',
];

if (target === 'linux') {
  args.push('--linux');
} else if (target === 'mac') {
  args.push('--mac');
} else if (target === 'win') {
  args.push('--win');
}

if (arch === 'arm64') {
  args.push('--arm64');
} else if (arch === 'x64') {
  args.push('--x64');
}

if (isUnsigned) {
  args.push('-c.mac.identity=null', '-c.mac.forceCodeSigning=false');
}

if (process.env.DESKTOP_WINDOWS_SIGN === 'true') {
  const requiredWindowsSigningEnv = [
    'WINDOWS_AZURE_TRUSTED_SIGNING_ENDPOINT',
    'WINDOWS_AZURE_TRUSTED_SIGNING_ACCOUNT_NAME',
    'WINDOWS_AZURE_TRUSTED_SIGNING_PROFILE_NAME',
    'WINDOWS_SIGN_PUBLISHER_NAME',
  ];

  for (const envName of requiredWindowsSigningEnv) {
    if (!process.env[envName]) {
      throw new Error(
        `Missing required Windows signing environment variable: ${envName}`,
      );
    }
  }

  args.push(
    `-c.win.azureSignOptions.endpoint=${process.env.WINDOWS_AZURE_TRUSTED_SIGNING_ENDPOINT}`,
    `-c.win.azureSignOptions.codeSigningAccountName=${process.env.WINDOWS_AZURE_TRUSTED_SIGNING_ACCOUNT_NAME}`,
    `-c.win.azureSignOptions.certificateProfileName=${process.env.WINDOWS_AZURE_TRUSTED_SIGNING_PROFILE_NAME}`,
    `-c.win.azureSignOptions.publisherName=${process.env.WINDOWS_SIGN_PUBLISHER_NAME}`,
  );

  if (process.env.WINDOWS_AZURE_TRUSTED_SIGNING_TIMESTAMP_RFC3161) {
    args.push(
      `-c.win.azureSignOptions.timestampRfc3161=${process.env.WINDOWS_AZURE_TRUSTED_SIGNING_TIMESTAMP_RFC3161}`,
    );
  }
} else if (target === 'win') {
  args.push('-c.win.signAndEditExecutable=false');
}

if (process.env.DESKTOP_RELEASE_VERSION) {
  args.push(`-c.extraMetadata.version=${process.env.DESKTOP_RELEASE_VERSION}`);
}

if (process.env.DESKTOP_BUILD_VERSION) {
  args.push(`-c.buildVersion=${process.env.DESKTOP_BUILD_VERSION}`);
}

const result = spawnSync(getCommand(), getSpawnArgs(args), {
  cwd: appDir,
  stdio: 'inherit',
  windowsVerbatimArguments: process.platform === 'win32',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function readArgValue(flagName) {
  const flagIndex = cliArgs.indexOf(flagName);

  if (flagIndex === -1) {
    return null;
  }

  return cliArgs[flagIndex + 1] ?? null;
}

function getCommand() {
  if (process.platform !== 'win32') {
    return pnpmCommand;
  }

  return process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe';
}

function getSpawnArgs(baseArgs) {
  if (process.platform !== 'win32') {
    return baseArgs;
  }

  return ['/d', '/s', '/c', quoteWindowsCommand([pnpmCommand, ...baseArgs])];
}

function quoteWindowsCommand(commandArgs) {
  return commandArgs.map(quoteWindowsArgument).join(' ');
}

function quoteWindowsArgument(arg) {
  if (!/[\s"&<>^|()]/.test(arg)) {
    return arg;
  }

  return `"${arg.replaceAll('"', '""')}"`;
}
