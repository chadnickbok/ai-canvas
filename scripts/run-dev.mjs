import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm';
const childProcesses = [];

function spawnProcess(label, args) {
  const child = spawn(getCommand(), getArgs(args), {
    env: process.env,
    stdio: 'inherit',
    windowsVerbatimArguments: isWindows,
  });

  child.on('error', (error) => {
    console.error(`${label} failed to start:`, error);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`${label} exited with signal ${signal}.`);
      shutdown(1);
      return;
    }

    if (code !== 0) {
      console.error(`${label} exited with code ${code}.`);
      shutdown(code ?? 1);
      return;
    }

    shutdown(0);
  });

  childProcesses.push(child);
}

function getCommand() {
  if (!isWindows) {
    return pnpmCommand;
  }

  return process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe';
}

function getArgs(args) {
  if (!isWindows) {
    return args;
  }

  return ['/d', '/s', '/c', quoteWindowsCommand([pnpmCommand, ...args])];
}

function quoteWindowsCommand(args) {
  return args.map(quoteWindowsArgument).join(' ');
}

function quoteWindowsArgument(arg) {
  if (!/[\s"&<>^|()]/.test(arg)) {
    return arg;
  }

  return `"${arg.replaceAll('"', '""')}"`;
}

let shuttingDown = false;

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of childProcesses) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
  }, 5_000).unref();

  process.exitCode = exitCode;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

spawnProcess('packages watcher', ['watch:packages']);
spawnProcess('desktop dev', ['--filter', '@ai-canvas/desktop', 'dev:app']);
