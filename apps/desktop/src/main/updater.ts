import { dialog, type App, type BrowserWindow } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';

import { desktopBranding } from '../branding.js';

type Logger = Pick<Console, 'error' | 'info' | 'warn'>;

type RestartPrompt = (version: string) => Promise<boolean>;

type UpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdatesAndNotify(): Promise<unknown>;
  logger?: Logger | null;
  on(event: string, listener: (...args: unknown[]) => void): UpdaterLike;
  quitAndInstall(): void;
};

type DialogLike = Pick<typeof dialog, 'showMessageBox'>;

type SupportedApp = Pick<App, 'isPackaged'>;

type StartAutoUpdateOptions = {
  app: SupportedApp;
  getParentWindow: () => BrowserWindow | null;
  logger?: Logger;
  platform?: NodeJS.Platform;
  restartPrompt?: RestartPrompt;
  updater?: UpdaterLike;
};

const updaterLogger: Logger = {
  error: (...args) => console.error('[auto-update]', ...args),
  info: (...args) => console.info('[auto-update]', ...args),
  warn: (...args) => console.warn('[auto-update]', ...args),
};

export function getAutoUpdater(): AppUpdater {
  const { autoUpdater } = electronUpdater;
  return autoUpdater;
}

export function supportsAutoUpdates(
  app: SupportedApp,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return (
    app.isPackaged &&
    (platform === 'darwin' || platform === 'linux' || platform === 'win32')
  );
}

export function createRestartPrompt(
  getParentWindow: () => BrowserWindow | null,
  dialogModule: DialogLike = dialog,
): RestartPrompt {
  return async (version) => {
    const options = {
      buttons: ['Restart and Install', 'Later'],
      cancelId: 1,
      defaultId: 0,
      detail: `${desktopBranding.appName} ${version} has been downloaded and is ready to install.`,
      message: 'A new update is ready',
      noLink: true,
      type: 'info' as const,
    };
    const parentWindow = getParentWindow();
    const result = parentWindow
      ? await dialogModule.showMessageBox(parentWindow, options)
      : await dialogModule.showMessageBox(options);

    return result.response === 0;
  };
}

export function startAutoUpdates({
  app,
  getParentWindow,
  logger = updaterLogger,
  platform = process.platform,
  restartPrompt = createRestartPrompt(getParentWindow),
  updater = getAutoUpdater(),
}: StartAutoUpdateOptions): boolean {
  if (!supportsAutoUpdates(app, platform)) {
    return false;
  }

  let promptInFlight = false;

  updater.logger = logger;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;

  updater.on('checking-for-update', () => {
    logger.info('Checking for updates.');
  });

  updater.on('update-available', (info) => {
    const version = readVersion(info);
    logger.info(
      version ? `Update available: ${version}.` : 'An update is available.',
    );
  });

  updater.on('update-not-available', () => {
    logger.info('No updates available.');
  });

  updater.on('error', (error) => {
    logger.error('Auto-update failed.', error);
  });

  updater.on('update-downloaded', async (info) => {
    const version = readVersion(info);

    logger.info(
      version
        ? `Update downloaded: ${version}.`
        : 'An update has finished downloading.',
    );

    if (promptInFlight) {
      return;
    }

    promptInFlight = true;

    try {
      const shouldRestart = await restartPrompt(
        version ?? 'the latest version',
      );

      if (shouldRestart) {
        updater.quitAndInstall();
      } else {
        logger.info('User postponed installation of the downloaded update.');
      }
    } catch (error) {
      logger.error('Failed to show the update installation prompt.', error);
    } finally {
      promptInFlight = false;
    }
  });

  void updater.checkForUpdatesAndNotify().catch((error) => {
    logger.error('Failed to check for updates.', error);
  });

  return true;
}

function readVersion(value: unknown): string | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string'
  ) {
    return value.version;
  }

  return null;
}
