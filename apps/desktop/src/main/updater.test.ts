import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { startAutoUpdates, supportsAutoUpdates } from './updater.js';

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = true;
  logger: {
    error(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
  } | null = null;
  checkForUpdatesAndNotify = vi.fn(async () => null);
  quitAndInstall = vi.fn();

  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
}

const silentLogger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

describe('supportsAutoUpdates', () => {
  it('supports packaged macOS builds only', () => {
    expect(supportsAutoUpdates({ isPackaged: true }, 'darwin')).toBe(true);
    expect(supportsAutoUpdates({ isPackaged: false }, 'darwin')).toBe(false);
    expect(supportsAutoUpdates({ isPackaged: true }, 'linux')).toBe(false);
  });
});

describe('startAutoUpdates', () => {
  it('skips updater setup outside packaged macOS builds', () => {
    const updater = new FakeUpdater();

    expect(
      startAutoUpdates({
        app: { isPackaged: false },
        getParentWindow: () => null,
        logger: silentLogger,
        platform: 'darwin',
        updater,
      }),
    ).toBe(false);

    expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it('checks for updates and prompts to install a downloaded update', async () => {
    const updater = new FakeUpdater();
    const restartPrompt = vi.fn(async () => true);

    expect(
      startAutoUpdates({
        app: { isPackaged: true },
        getParentWindow: () => null,
        logger: silentLogger,
        platform: 'darwin',
        restartPrompt,
        updater,
      }),
    ).toBe(true);

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1);

    updater.emit('update-downloaded', { version: '2026.408.17' });
    await Promise.resolve();
    await Promise.resolve();

    expect(restartPrompt).toHaveBeenCalledWith('2026.408.17');
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('does not install the update when the restart prompt is declined', async () => {
    const updater = new FakeUpdater();
    const restartPrompt = vi.fn(async () => false);

    startAutoUpdates({
      app: { isPackaged: true },
      getParentWindow: () => null,
      logger: silentLogger,
      platform: 'darwin',
      restartPrompt,
      updater,
    });

    updater.emit('update-downloaded', { version: '2026.408.18' });
    await Promise.resolve();
    await Promise.resolve();

    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});
