import { spawn } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const childProcesses = [];

function spawnProcess(label, args) {
  const child = spawn(pnpmCommand, args, {
    env: process.env,
    stdio: "inherit"
  });

  child.on("error", (error) => {
    console.error(`${label} failed to start:`, error);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
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

let shuttingDown = false;

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of childProcesses) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  }, 5_000).unref();

  process.exitCode = exitCode;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

spawnProcess("packages watcher", ["watch:packages"]);
spawnProcess("desktop dev", ["--filter", "@ai-canvas/desktop", "dev:app"]);
