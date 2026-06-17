import { dialog, ipcMain, shell } from 'electron';

import {
  appChannelNames,
  applyCommandsInputSchema,
  createProjectInputSchema,
  emptyPayloadSchema,
  err,
  exportProjectSnapshotInputSchema,
  layoutMeasurementResultSchema,
  ok,
  openExternalUrlInputSchema,
  openProjectInputSchema,
  type AppResult,
  type EmptyPayload,
  type LayoutMeasurementResult,
  type RuntimeEvent,
} from '@ai-canvas/ipc-contract';

import type { ProjectRuntime } from './runtime/index.js';

type RegisterIpcOptions = {
  sendRuntimeEvent?: (event: RuntimeEvent) => void;
  submitLayoutMeasurementResult?: (
    input: LayoutMeasurementResult,
  ) => AppResult<EmptyPayload> | Promise<AppResult<EmptyPayload>>;
};

export function registerIpc(
  runtime: ProjectRuntime,
  options: RegisterIpcOptions = {},
): () => void {
  const unsubscribe = runtime.subscribeToEvents((event) => {
    options.sendRuntimeEvent?.(event);
  });

  ipcMain.handle(appChannelNames.listProjects, async () =>
    runtime.listProjects(),
  );
  ipcMain.handle(appChannelNames.getActiveProject, async () =>
    runtime.getActiveProject(),
  );
  ipcMain.handle(appChannelNames.getHistoryState, async (_event, input) => {
    try {
      emptyPayloadSchema.parse(input ?? {});
      return runtime.getHistoryState();
    } catch (error) {
      return toValidationError(error);
    }
  });
  ipcMain.handle(appChannelNames.getMcpStatus, async () =>
    runtime.getMcpStatus(),
  );

  ipcMain.handle(appChannelNames.createProject, async (_event, input) => {
    try {
      const parsed = createProjectInputSchema.parse(input);
      return runtime.createProject(parsed.name);
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(appChannelNames.openProject, async (_event, input) => {
    try {
      const parsed = openProjectInputSchema.parse(input);
      return runtime.openProject(parsed.projectId);
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(
    appChannelNames.exportProjectSnapshot,
    async (_event, input) => {
      try {
        const parsed = exportProjectSnapshotInputSchema.parse(input);
        const projectsResult = runtime.listProjects();
        const project = projectsResult.ok
          ? projectsResult.data.find(
              (candidate) => candidate.id === parsed.projectId,
            )
          : null;
        const saveResult = await dialog.showSaveDialog({
          defaultPath: `${sanitizeSnapshotFileName(project?.name ?? parsed.projectId)}.aicp`,
          filters: [
            {
              extensions: ['aicp'],
              name: 'AI Canvas Project',
            },
          ],
          properties: ['createDirectory', 'showOverwriteConfirmation'],
          title: 'Export AI Canvas project',
        });

        if (saveResult.canceled || !saveResult.filePath) {
          return ok({
            canceled: true,
            warnings: [],
          });
        }

        return runtime.exportProjectSnapshot({
          destinationPath: ensureAicpExtension(saveResult.filePath),
          projectId: parsed.projectId,
        });
      } catch (error) {
        return toValidationError(error);
      }
    },
  );

  ipcMain.handle(
    appChannelNames.importProjectSnapshot,
    async (_event, input) => {
      try {
        emptyPayloadSchema.parse(input ?? {});
        const openResult = await dialog.showOpenDialog({
          filters: [
            {
              extensions: ['aicp'],
              name: 'AI Canvas Project',
            },
          ],
          properties: ['openFile'],
          title: 'Import AI Canvas project',
        });

        if (openResult.canceled || openResult.filePaths.length === 0) {
          return ok({
            canceled: true,
            warnings: [],
          });
        }

        return runtime.importProjectSnapshot({
          filePath: openResult.filePaths[0] ?? '',
        });
      } catch (error) {
        return toValidationError(error);
      }
    },
  );

  ipcMain.handle(appChannelNames.openExternalUrl, async (_event, input) => {
    try {
      const parsed = openExternalUrlInputSchema.parse(input);
      await shell.openExternal(parsed.url);
      return ok({});
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(appChannelNames.applyCommands, async (_event, input) => {
    try {
      const parsed = applyCommandsInputSchema.parse(input);
      return runtime.applyCommands(parsed);
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(
    appChannelNames.getRuntimeCapabilities,
    async (_event, input) => {
      try {
        emptyPayloadSchema.parse(input ?? {});
        return runtime.getRuntimeCapabilities();
      } catch (error) {
        return toValidationError(error);
      }
    },
  );

  ipcMain.handle(appChannelNames.undo, async (_event, input) => {
    try {
      emptyPayloadSchema.parse(input ?? {});
      return runtime.undo();
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(appChannelNames.redo, async (_event, input) => {
    try {
      emptyPayloadSchema.parse(input ?? {});
      return runtime.redo();
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(
    appChannelNames.submitLayoutMeasurementResult,
    async (_event, input) => {
      try {
        const parsed = layoutMeasurementResultSchema.parse(input);

        if (!options.submitLayoutMeasurementResult) {
          return err(
            'not_implemented',
            'Renderer layout measurement bridge is not attached',
          );
        }

        return await options.submitLayoutMeasurementResult(parsed);
      } catch (error) {
        return toValidationError(error);
      }
    },
  );

  return unsubscribe;
}

function ensureAicpExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith('.aicp')
    ? filePath
    : `${filePath}.aicp`;
}

function sanitizeSnapshotFileName(value: string): string {
  const sanitized = Array.from(value.trim(), (character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character;
  })
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);

  return sanitized.length > 0 ? sanitized : 'AI Canvas Project';
}

function toValidationError(error: unknown) {
  if (isZodLikeError(error)) {
    return err(
      'validation_failed',
      error.issues.map((issue) => issue.message).join(', '),
    );
  }

  return err(
    'internal_error',
    error instanceof Error ? error.message : 'Unknown IPC error',
  );
}

function isZodLikeError(error: unknown): error is {
  issues: Array<{ message: string }>;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}
