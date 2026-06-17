import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appChannelNames,
  ok,
  type ActiveProject,
  type ProjectSummary,
} from '@ai-canvas/ipc-contract';
import { createEmptyDocument } from '@ai-canvas/document-core';

import type { ProjectRuntime } from './runtime/index.js';

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcHandle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      },
    ),
    openExternal: vi.fn(),
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  };
});

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: electronMock.showOpenDialog,
    showSaveDialog: electronMock.showSaveDialog,
  },
  ipcMain: {
    handle: electronMock.ipcHandle,
  },
  shell: {
    openExternal: electronMock.openExternal,
  },
}));

const projectSummary: ProjectSummary = {
  createdAt: '2026-03-31T00:00:00.000Z',
  documentId: 'doc_1',
  id: 'project_1',
  lastOpenedAt: '2026-03-31T00:00:00.000Z',
  name: 'Snapshot Project',
  updatedAt: '2026-03-31T00:00:00.000Z',
};

const activeProject: ActiveProject = {
  document: createEmptyDocument({
    documentId: projectSummary.documentId,
    name: projectSummary.name,
  }),
  project: projectSummary,
  resolved_assets: {},
  revision: 1,
};

function createRuntimeStub(): ProjectRuntime {
  return {
    applyCommands: vi.fn(),
    createProject: vi.fn(),
    exportProjectSnapshot: vi.fn(async () =>
      ok({
        canceled: false,
        filePath: '/tmp/snapshot.aicp',
        project: projectSummary,
        warnings: [],
      }),
    ),
    getActiveProject: vi.fn(),
    getHistoryState: vi.fn(),
    getMcpStatus: vi.fn(),
    getRuntimeCapabilities: vi.fn(),
    importProjectSnapshot: vi.fn(async () =>
      ok({
        activeProject,
        canceled: false,
        warnings: [],
      }),
    ),
    listProjects: vi.fn(() => ok([projectSummary])),
    openProject: vi.fn(),
    publishMcpStatus: vi.fn(),
    redo: vi.fn(),
    subscribeToEvents: vi.fn(() => () => undefined),
    undo: vi.fn(),
  } as unknown as ProjectRuntime;
}

describe('registerIpc snapshot handlers', () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.ipcHandle.mockClear();
    electronMock.openExternal.mockReset();
    electronMock.showOpenDialog.mockReset();
    electronMock.showSaveDialog.mockReset();
  });

  it('maps canceled export dialogs to a canceled result without calling the runtime', async () => {
    const { registerIpc } = await import('./registerIpc.js');
    const runtime = createRuntimeStub();

    electronMock.showSaveDialog.mockResolvedValue({
      canceled: true,
    });

    registerIpc(runtime);

    const handler = electronMock.handlers.get(
      appChannelNames.exportProjectSnapshot,
    );

    expect(handler).toBeDefined();

    const result = await handler?.({}, { projectId: projectSummary.id });

    expect(result).toEqual(
      ok({
        canceled: true,
        warnings: [],
      }),
    );
    expect(runtime.exportProjectSnapshot).not.toHaveBeenCalled();
  });

  it('exports through the runtime using the selected .aicp destination', async () => {
    const { registerIpc } = await import('./registerIpc.js');
    const runtime = createRuntimeStub();

    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/Snapshot Project',
    });

    registerIpc(runtime);

    const handler = electronMock.handlers.get(
      appChannelNames.exportProjectSnapshot,
    );
    const result = await handler?.({}, { projectId: projectSummary.id });

    expect(result).toEqual(
      ok({
        canceled: false,
        filePath: '/tmp/snapshot.aicp',
        project: projectSummary,
        warnings: [],
      }),
    );
    expect(runtime.exportProjectSnapshot).toHaveBeenCalledWith({
      destinationPath: '/tmp/Snapshot Project.aicp',
      projectId: projectSummary.id,
    });
  });

  it('maps canceled import dialogs to a canceled result without calling the runtime', async () => {
    const { registerIpc } = await import('./registerIpc.js');
    const runtime = createRuntimeStub();

    electronMock.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    registerIpc(runtime);

    const handler = electronMock.handlers.get(
      appChannelNames.importProjectSnapshot,
    );
    const result = await handler?.({}, {});

    expect(result).toEqual(
      ok({
        canceled: true,
        warnings: [],
      }),
    );
    expect(runtime.importProjectSnapshot).not.toHaveBeenCalled();
  });

  it('imports through the runtime using the selected snapshot path', async () => {
    const { registerIpc } = await import('./registerIpc.js');
    const runtime = createRuntimeStub();

    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/project.aicp'],
    });

    registerIpc(runtime);

    const handler = electronMock.handlers.get(
      appChannelNames.importProjectSnapshot,
    );
    const result = await handler?.({}, {});

    expect(result).toEqual(
      ok({
        activeProject,
        canceled: false,
        warnings: [],
      }),
    );
    expect(runtime.importProjectSnapshot).toHaveBeenCalledWith({
      filePath: '/tmp/project.aicp',
    });
  });
});
