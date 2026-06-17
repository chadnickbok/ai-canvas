import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import {
  collectSubtreeIds,
  resolveComputedLayoutRootIds,
  type RendererDocument,
} from '@ai-canvas/document-core';
import { err, ok, type RuntimeEvent } from '@ai-canvas/ipc-contract';
import { LocalMcpBridge } from '@ai-canvas/mcp-bridge';

import { createProjectService } from '../createProjectService.js';
import { createProjectRuntime, type ProjectRuntime } from './projectRuntime';
import { ProjectStore } from './projectStore';

const cleanupPaths: string[] = [];
const activeBridges: LocalMcpBridge[] = [];
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZcAAAAASUVORK5CYII=';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, 'base64');
const TINY_PNG_HASH =
  'e9cd408c8c8d0c2b28cff985d699b60d1dd970785342f19eeaac21a1060cc1d0';

afterEach(async () => {
  await Promise.all(activeBridges.splice(0).map((bridge) => bridge.stop()));
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((entry) => rm(entry, { force: true, recursive: true })),
  );
});

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate a test port'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function attachTestComputedLayoutRefresher(runtime: ProjectRuntime) {
  runtime.setComputedLayoutRefresher(async ({ changed_node_ids, document }) => {
    const refreshedDocument = structuredClone(document);
    const rootIds = resolveComputedLayoutRootIds(document, changed_node_ids);
    let measuredNodeCount = 0;

    for (const rootId of rootIds) {
      for (const nodeId of collectSubtreeIds(document, rootId)) {
        const node = refreshedDocument.nodes[nodeId];

        if (!node) {
          continue;
        }

        const x = resolveFiniteCanvasNumber(node.render_style.left);
        const y = resolveFiniteCanvasNumber(node.render_style.top);
        const width = resolveFiniteCanvasNumber(node.render_style.width);
        const height = resolveFiniteCanvasNumber(node.render_style.height);

        if (x === null || y === null || width === null || height === null) {
          delete node.computed_layout;
          continue;
        }

        node.computed_layout = {
          height,
          width,
          x,
          y,
        };
        measuredNodeCount += 1;
      }
    }

    return {
      document: refreshedDocument,
      layoutRefresh: rootIds.length
        ? {
            measured_node_count: measuredNodeCount,
            measured_root_ids: rootIds,
            status: 'refreshed' as const,
          }
        : {
            status: 'not_required' as const,
          },
    };
  });
}

function resolveFiniteCanvasNumber(
  value: RendererDocument['nodes'][string]['render_style'][string],
) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^-?\d+(\.\d+)?px$/i.test(trimmed) || /^-?\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function createMockAssetUrlDownloader() {
  return async () =>
    ok({
      bytes: TINY_PNG_BYTES,
      height: 1,
      mimeType: 'image/png' as const,
      originalFilename: 'logo.png',
      width: 1,
    });
}

describe('ProjectRuntime', () => {
  it('creates a project and makes it the active session', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-runtime-'));
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);
    const events: RuntimeEvent[] = [];

    runtime.subscribeToEvents((event) => {
      events.push(event);
    });

    const createResult = runtime.createProject('Phase 0 Test');

    expect(createResult.ok).toBe(true);

    const activeProject = runtime.getActiveProject();

    expect(activeProject.ok && activeProject.data?.project.name).toBe(
      'Phase 0 Test',
    );
    expect(
      activeProject.ok &&
        activeProject.data?.document.document_id.startsWith('doc_'),
    ).toBe(true);
    expect(activeProject.ok && activeProject.data?.revision).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      'projects_changed',
      'active_project_changed',
      'history_state_changed',
      'runtime_capabilities_changed',
    ]);
    expect(events[0]).toMatchObject({
      type: 'projects_changed',
      projects: [{ name: 'Phase 0 Test' }],
    });
    expect(events[1]).toMatchObject({
      type: 'active_project_changed',
      activeProject: {
        project: { name: 'Phase 0 Test' },
        revision: 1,
      },
    });
    expect(events[2]).toEqual({
      historyState: {
        canRedo: false,
        canUndo: false,
        redoDepth: 0,
        undoDepth: 0,
      },
      type: 'history_state_changed',
    });
    expect(events[3]).toEqual({
      type: 'runtime_capabilities_changed',
      runtimeCapabilities: {
        measurementSurfaceAvailable: false,
        mode: 'read_only',
        runtimeState: 'editor_open_clean',
      },
    });

    store.close();
  });

  it('reopens a persisted project and leaves the active session untouched on failure', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-reopen-'),
    );
    cleanupPaths.push(tempDir);

    const firstStore = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(firstStore);
    const events: RuntimeEvent[] = [];

    runtime.subscribeToEvents((event) => {
      events.push(event);
    });

    const created = runtime.createProject('Persisted Project');

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    events.length = 0;
    const missingResult = runtime.openProject('project_missing');
    expect(missingResult.ok).toBe(false);
    expect(events).toEqual([]);

    const activeAfterFailure = runtime.getActiveProject();
    expect(activeAfterFailure.ok).toBe(true);

    if (!activeAfterFailure.ok || !activeAfterFailure.data) {
      throw new Error(
        'Expected an active project session after the failed reopen',
      );
    }

    expect(activeAfterFailure.data.project.id).toBe(created.data.id);

    firstStore.close();

    const reopenedStore = new ProjectStore(path.join(tempDir, 'app.db'));
    const reopenedRuntime = createProjectRuntime(reopenedStore);
    const reopened = reopenedRuntime.openProject(created.data.id);

    expect(reopened.ok).toBe(true);

    if (!reopened.ok) {
      throw new Error(reopened.error.message);
    }

    expect(reopened.data.project.name).toBe('Persisted Project');
    expect(reopened.data.document.name).toBe('Persisted Project');
    expect(reopened.data.revision).toBe(1);

    reopenedStore.close();
  });

  it('inspects non-active persisted projects without switching the active session', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-inspect-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);

    const firstProject = runtime.createProject('First Project');

    if (!firstProject.ok) {
      throw new Error(firstProject.error.message);
    }

    const secondProject = runtime.createProject('Second Project');

    if (!secondProject.ok) {
      throw new Error(secondProject.error.message);
    }

    const inspected = runtime.inspectProject(firstProject.data.id);

    expect(inspected.ok).toBe(true);

    if (!inspected.ok) {
      throw new Error(inspected.error.message);
    }

    expect(inspected.data.project.id).toBe(firstProject.data.id);
    expect(inspected.data.is_active).toBe(false);
    expect(inspected.data.revision).toBe(1);

    const activeProject = runtime.getActiveProject();

    expect(activeProject.ok && activeProject.data?.project.id).toBe(
      secondProject.data.id,
    );

    store.close();
  });

  it('applies command batches, persists revisions, and emits document_changed', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-commands-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);
    const events: RuntimeEvent[] = [];

    runtime.subscribeToEvents((event) => {
      events.push(event);
    });

    const created = runtime.createProject('Writable Project');

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    attachTestComputedLayoutRefresher(runtime);
    runtime.setMeasurementSurfaceAvailable(true);
    events.length = 0;

    const commandResult = await runtime.applyProjectCommands({
      base_revision: 1,
      commands: [
        {
          type: 'create_scene',
          scene: {
            height: 844,
            id: 'scene_home',
            left: 40,
            name: 'Home',
            top: 60,
            width: 390,
          },
        },
      ],
    });

    expect(commandResult.ok).toBe(true);

    if (!commandResult.ok) {
      throw new Error(commandResult.error.message);
    }

    expect(commandResult.data).toEqual({
      document_id: expect.stringMatching(/^doc_/),
      effects: {
        changed_node_ids: ['scene_home'],
        changed_scene_ids: ['scene_home'],
      },
      layout_refresh: {
        measured_node_count: 1,
        measured_root_ids: ['scene_home'],
        status: 'refreshed',
      },
      revision: 2,
    });

    const activeProject = runtime.getActiveProject();

    expect(activeProject.ok).toBe(true);

    if (!activeProject.ok || !activeProject.data) {
      throw new Error(
        'Expected the active project session to remain available',
      );
    }

    expect(activeProject.data.revision).toBe(2);
    expect(activeProject.data.document.scenes.scene_home).toMatchObject({
      id: 'scene_home',
      name: 'Home',
    });

    const persistedProject = store.getProject(created.data.id);

    expect(persistedProject?.revision).toBe(2);
    expect(persistedProject?.document.scenes.scene_home).toMatchObject({
      id: 'scene_home',
      name: 'Home',
    });
    expect(persistedProject?.document.nodes.scene_home.computed_layout).toEqual(
      {
        height: 844,
        width: 390,
        x: 40,
        y: 60,
      },
    );

    expect(events.map((event) => event.type)).toEqual([
      'projects_changed',
      'active_project_changed',
      'document_changed',
      'history_state_changed',
    ]);
    expect(events[2]).toMatchObject({
      type: 'document_changed',
      project: {
        id: created.data.id,
      },
      revision: 2,
    });
    expect(events[3]).toEqual({
      historyState: {
        canRedo: false,
        canUndo: true,
        redoDepth: 0,
        undoDepth: 1,
      },
      type: 'history_state_changed',
    });

    store.close();
  });

  it('creates project-local assets from bytes, persists them on disk, and resolves them for rendering', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-assets-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);
    const created = runtime.createProject('Asset Project');

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    attachTestComputedLayoutRefresher(runtime);
    runtime.setMeasurementSurfaceAvailable(true);

    const createdAsset = await runtime.createAssetFromBytes({
      assetId: 'asset_logo',
      bytesBase64: TINY_PNG_BASE64,
      height: 1,
      kind: 'image',
      mimeType: 'image/png',
      originalFilename: 'logo.png',
      width: 1,
    });

    expect(createdAsset.ok).toBe(true);

    if (!createdAsset.ok) {
      throw new Error(createdAsset.error.message);
    }

    expect(createdAsset.data).toEqual({
      asset_id: 'asset_logo',
      content_hash: TINY_PNG_HASH,
      kind: 'image',
      mime_type: 'image/png',
      revision: 2,
      size_bytes: 68,
      source: {
        content_hash: TINY_PNG_HASH,
        kind: 'asset_store',
        original_filename: 'logo.png',
      },
    });

    const activeProject = runtime.getActiveProject();

    expect(activeProject.ok).toBe(true);

    if (!activeProject.ok || !activeProject.data) {
      throw new Error(
        'Expected the active project session to remain available',
      );
    }

    expect(activeProject.data.document.assets.asset_logo).toEqual({
      height: 1,
      id: 'asset_logo',
      kind: 'image',
      mime_type: 'image/png',
      source: {
        content_hash: TINY_PNG_HASH,
        kind: 'asset_store',
        original_filename: 'logo.png',
      },
      width: 1,
    });
    expect(activeProject.data.resolved_assets.asset_logo?.url).toContain(
      'ai-canvas-asset://project/',
    );

    const assetPath = store.resolveAssetFilePath(created.data.id, 'asset_logo');

    expect(assetPath).not.toBeNull();
    expect(await readFile(assetPath ?? '', 'base64')).toBe(TINY_PNG_BASE64);

    const duplicateAsset = await runtime.createAssetFromBytes({
      assetId: 'asset_logo',
      bytesBase64: TINY_PNG_BASE64,
      mimeType: 'image/png',
    });

    expect(duplicateAsset).toEqual(
      err('validation_failed', 'Asset asset_logo already exists'),
    );

    store.close();
  });

  it('creates project-local assets from a public image URL and resolves them for rendering', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-assets-url-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store, {
      assetUrlDownloader: createMockAssetUrlDownloader(),
    });
    const created = runtime.createProject('Asset URL Project');

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    attachTestComputedLayoutRefresher(runtime);
    runtime.setMeasurementSurfaceAvailable(true);

    const createdAsset = await runtime.createAssetFromUrl({
      assetId: 'asset_logo',
      url: 'https://cdn.example.test/logo.png',
    });

    expect(createdAsset.ok).toBe(true);

    if (!createdAsset.ok) {
      throw new Error(createdAsset.error.message);
    }

    expect(createdAsset.data).toEqual({
      asset_id: 'asset_logo',
      content_hash: TINY_PNG_HASH,
      kind: 'image',
      mime_type: 'image/png',
      revision: 2,
      size_bytes: 68,
      source: {
        content_hash: TINY_PNG_HASH,
        kind: 'asset_store',
        original_filename: 'logo.png',
      },
    });

    const activeProject = runtime.getActiveProject();

    expect(
      activeProject.ok && activeProject.data?.document.assets.asset_logo,
    ).toEqual({
      height: 1,
      id: 'asset_logo',
      kind: 'image',
      mime_type: 'image/png',
      source: {
        content_hash: TINY_PNG_HASH,
        kind: 'asset_store',
        original_filename: 'logo.png',
      },
      width: 1,
    });

    store.close();
  });

  it('rejects asset creation while the runtime is read-only', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-assets-readonly-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store, {
      assetUrlDownloader: createMockAssetUrlDownloader(),
    });
    const created = runtime.createProject('Read Only Assets');

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    attachTestComputedLayoutRefresher(runtime);

    await expect(
      runtime.createAssetFromBytes({
        bytesBase64: TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    ).resolves.toEqual(
      err(
        'measurement_surface_unavailable',
        'Write-capable command execution requires an available renderer measurement surface',
      ),
    );

    await expect(
      runtime.createAssetFromUrl({
        url: 'https://cdn.example.test/logo.png',
      }),
    ).resolves.toEqual(
      err(
        'measurement_surface_unavailable',
        'Write-capable command execution requires an available renderer measurement surface',
      ),
    );

    store.close();
  });

  it('records MCP mutations in shared history, supports undo/redo, and persists history across reopen', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-history-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);
    const created = runtime.createProject('History Project');

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    attachTestComputedLayoutRefresher(runtime);
    runtime.setMeasurementSurfaceAvailable(true);

    const applyResult = await runtime.applyProjectCommands({
      base_revision: 1,
      commands: [
        {
          type: 'create_scene',
          scene: {
            height: 844,
            id: 'scene_home',
            left: 40,
            name: 'Home',
            top: 60,
            width: 390,
          },
        },
      ],
    });

    expect(applyResult.ok).toBe(true);
    expect(runtime.getHistoryState()).toEqual(
      ok({
        canRedo: false,
        canUndo: true,
        redoDepth: 0,
        undoDepth: 1,
      }),
    );

    const undoResult = await runtime.undo();

    expect(undoResult.ok).toBe(true);
    expect(undoResult.ok && undoResult.data.revision).toBe(3);
    expect(runtime.getHistoryState()).toEqual(
      ok({
        canRedo: true,
        canUndo: false,
        redoDepth: 1,
        undoDepth: 0,
      }),
    );

    const activeAfterUndo = runtime.getActiveProject();

    expect(activeAfterUndo.ok && activeAfterUndo.data?.document.scenes).toEqual(
      {},
    );

    const redoResult = await runtime.redo();

    expect(redoResult.ok).toBe(true);
    expect(redoResult.ok && redoResult.data.revision).toBe(4);
    expect(runtime.getHistoryState()).toEqual(
      ok({
        canRedo: false,
        canUndo: true,
        redoDepth: 0,
        undoDepth: 1,
      }),
    );

    store.close();

    const reopenedStore = new ProjectStore(path.join(tempDir, 'app.db'));
    const reopenedRuntime = createProjectRuntime(reopenedStore);
    const reopenedProject = reopenedRuntime.openProject(created.data.id);

    expect(reopenedProject.ok).toBe(true);
    expect(reopenedRuntime.getHistoryState()).toEqual(
      ok({
        canRedo: false,
        canUndo: true,
        redoDepth: 0,
        undoDepth: 1,
      }),
    );

    attachTestComputedLayoutRefresher(reopenedRuntime);
    reopenedRuntime.setMeasurementSurfaceAvailable(true);

    const reopenedUndoResult = await reopenedRuntime.undo();

    expect(reopenedUndoResult.ok).toBe(true);
    expect(reopenedUndoResult.ok && reopenedUndoResult.data.revision).toBe(5);

    const reopenedActiveProject = reopenedRuntime.getActiveProject();

    expect(
      reopenedActiveProject.ok && reopenedActiveProject.data?.document.scenes,
    ).toEqual({});

    reopenedStore.close();
  });

  it('fails undo while the runtime is read-only', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-undo-readonly-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);
    const created = runtime.createProject('Read Only History');

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    attachTestComputedLayoutRefresher(runtime);
    runtime.setMeasurementSurfaceAvailable(true);

    const applyResult = await runtime.applyCommands({
      base_revision: 1,
      commands: [
        {
          type: 'create_scene',
          scene: {
            height: 844,
            id: 'scene_home',
            left: 40,
            name: 'Home',
            top: 60,
            width: 390,
          },
        },
      ],
      document_id: created.data.documentId,
    });

    expect(applyResult.ok).toBe(true);

    runtime.setMeasurementSurfaceAvailable(false);

    await expect(runtime.undo()).resolves.toEqual(
      err(
        'measurement_surface_unavailable',
        'Write-capable command execution requires an available renderer measurement surface',
      ),
    );

    store.close();
  });

  it('applies commands through the real local MCP bridge and updates the active runtime session', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-mcp-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: await getAvailablePort(),
      projectService: createProjectService(runtime),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-runtime-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${bridge.getStatus().port}/mcp`),
    );

    try {
      await client.connect(transport);

      const createProjectResult = await client.callTool({
        arguments: {
          name: 'Bridge Slice',
        },
        name: 'create_project',
      });

      expect(createProjectResult.isError).not.toBe(true);

      const createdProject = (
        createProjectResult.structuredContent as {
          ok: true;
          project: {
            id: string;
          };
        }
      ).project;

      const openProjectResult = await client.callTool({
        arguments: {
          project_id: createdProject.id,
        },
        name: 'open_project',
      });

      expect(openProjectResult.isError).not.toBe(true);

      const inspectProjectResult = await client.callTool({
        arguments: {},
        name: 'inspect_project',
      });

      expect(inspectProjectResult.isError).not.toBe(true);

      const inspectedProject = inspectProjectResult.structuredContent as {
        document: {
          document_id: string;
        };
        ok: true;
        revision: number;
      };

      attachTestComputedLayoutRefresher(runtime);
      runtime.setMeasurementSurfaceAvailable(true);

      const applyCommandsResult = await client.callTool({
        arguments: {
          base_revision: inspectedProject.revision,
          commands: [
            {
              scene: {
                height: 844,
                id: 'scene_home',
                left: 80,
                name: 'Home',
                render_style: {
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                  overflow: 'hidden',
                  paddingLeft: 24,
                  paddingRight: 24,
                  paddingTop: 24,
                },
                top: 80,
                width: 390,
              },
              type: 'create_scene',
            },
            {
              node: {
                height: 180,
                id: 'rect_hero',
                kind: 'rectangle',
                name: 'Hero',
                render_style: {
                  backgroundColor: '#f5c04a',
                  borderRadius: 24,
                },
                width: 342,
              },
              parent: {
                parent_id: 'scene_home',
              },
              type: 'create_node',
            },
            {
              node: {
                id: 'text_title',
                kind: 'text',
                name: 'Title',
                render_style: {
                  color: '#111111',
                  fontFamily: 'IBM Plex Sans',
                  fontSize: 32,
                  fontWeight: 600,
                },
                text: {
                  content: 'Hello from MCP',
                },
              },
              parent: {
                parent_id: 'scene_home',
              },
              type: 'create_node',
            },
          ],
        },
        name: 'apply_commands',
      });

      expect(applyCommandsResult.isError).not.toBe(true);
      expect(applyCommandsResult.structuredContent).toMatchObject({
        ok: true,
        revision: 2,
      });

      const activeProject = runtime.getActiveProject();

      expect(activeProject.ok).toBe(true);

      if (!activeProject.ok || !activeProject.data) {
        throw new Error(
          'Expected an active project session after MCP mutation',
        );
      }

      expect(activeProject.data.document.document_id).toBe(
        inspectedProject.document.document_id,
      );
      expect(activeProject.data.document.scenes.scene_home).toMatchObject({
        id: 'scene_home',
        name: 'Home',
      });
      expect(activeProject.data.document.nodes.text_title).toMatchObject({
        kind: 'text',
        text: {
          content: 'Hello from MCP',
        },
      });
      expect(activeProject.data.revision).toBe(2);
    } finally {
      await transport.close();
      await client.close();
      store.close();
    }
  });

  it('creates project-local assets through the real local MCP bridge', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-mcp-assets-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: await getAvailablePort(),
      projectService: createProjectService(runtime),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-runtime-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${bridge.getStatus().port}/mcp`),
    );

    try {
      await client.connect(transport);

      const createProjectResult = await client.callTool({
        arguments: {
          name: 'Asset Bridge Slice',
        },
        name: 'create_project',
      });

      expect(createProjectResult.isError).not.toBe(true);

      const createdProject = (
        createProjectResult.structuredContent as {
          ok: true;
          project: {
            id: string;
          };
        }
      ).project;

      await client.callTool({
        arguments: {
          project_id: createdProject.id,
        },
        name: 'open_project',
      });

      attachTestComputedLayoutRefresher(runtime);
      runtime.setMeasurementSurfaceAvailable(true);

      const createAssetResult = await client.callTool({
        arguments: {
          asset_id: 'asset_logo',
          bytes_base64: TINY_PNG_BASE64,
          height: 1,
          kind: 'image',
          mime_type: 'image/png',
          original_filename: 'logo.png',
          width: 1,
        },
        name: 'create_asset_from_bytes',
      });

      expect(createAssetResult.isError).not.toBe(true);
      expect(createAssetResult.structuredContent).toMatchObject({
        asset_id: 'asset_logo',
        content_hash: TINY_PNG_HASH,
        kind: 'image',
        mime_type: 'image/png',
        ok: true,
        revision: 2,
        size_bytes: 68,
        source: {
          content_hash: TINY_PNG_HASH,
          kind: 'asset_store',
          original_filename: 'logo.png',
        },
      });

      const activeProject = runtime.getActiveProject();

      expect(
        activeProject.ok && activeProject.data?.document.assets.asset_logo,
      ).toEqual({
        height: 1,
        id: 'asset_logo',
        kind: 'image',
        mime_type: 'image/png',
        source: {
          content_hash: TINY_PNG_HASH,
          kind: 'asset_store',
          original_filename: 'logo.png',
        },
        width: 1,
      });
    } finally {
      await transport.close();
      await client.close();
      store.close();
    }
  });

  it('creates project-local assets from a URL through the real local MCP bridge', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-mcp-assets-url-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store, {
      assetUrlDownloader: createMockAssetUrlDownloader(),
    });
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: await getAvailablePort(),
      projectService: createProjectService(runtime),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-runtime-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${bridge.getStatus().port}/mcp`),
    );

    try {
      await client.connect(transport);

      const createProjectResult = await client.callTool({
        arguments: {
          name: 'Asset URL Bridge Slice',
        },
        name: 'create_project',
      });

      expect(createProjectResult.isError).not.toBe(true);

      const createdProject = (
        createProjectResult.structuredContent as {
          ok: true;
          project: {
            id: string;
          };
        }
      ).project;

      await client.callTool({
        arguments: {
          project_id: createdProject.id,
        },
        name: 'open_project',
      });

      attachTestComputedLayoutRefresher(runtime);
      runtime.setMeasurementSurfaceAvailable(true);

      const createAssetResult = await client.callTool({
        arguments: {
          asset_id: 'asset_logo',
          url: 'https://cdn.example.test/logo.png',
        },
        name: 'create_asset_from_url',
      });

      expect(createAssetResult.isError).not.toBe(true);
      expect(createAssetResult.structuredContent).toMatchObject({
        asset_id: 'asset_logo',
        content_hash: TINY_PNG_HASH,
        kind: 'image',
        mime_type: 'image/png',
        ok: true,
        revision: 2,
        size_bytes: 68,
        source: {
          content_hash: TINY_PNG_HASH,
          kind: 'asset_store',
          original_filename: 'logo.png',
        },
      });

      const activeProject = runtime.getActiveProject();

      expect(
        activeProject.ok && activeProject.data?.document.assets.asset_logo,
      ).toEqual({
        height: 1,
        id: 'asset_logo',
        kind: 'image',
        mime_type: 'image/png',
        source: {
          content_hash: TINY_PNG_HASH,
          kind: 'asset_store',
          original_filename: 'logo.png',
        },
        width: 1,
      });
    } finally {
      await transport.close();
      await client.close();
      store.close();
    }
  });

  it('emits capability and MCP status events when those values change', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'ai-canvas-runtime-status-'),
    );
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, 'app.db'));
    const runtime = createProjectRuntime(store);
    const events: RuntimeEvent[] = [];

    runtime.subscribeToEvents((event) => {
      events.push(event);
    });

    attachTestComputedLayoutRefresher(runtime);
    runtime.setMeasurementSurfaceAvailable(true);
    runtime.publishMcpStatus({
      connectedSessions: 1,
      enabled: true,
      endpoint: 'http://127.0.0.1:9311/mcp',
      errorCode: null,
      errorMessage: null,
      host: '127.0.0.1',
      port: 9311,
      state: 'running',
    });

    expect(events).toEqual([
      {
        type: 'runtime_capabilities_changed',
        runtimeCapabilities: {
          measurementSurfaceAvailable: false,
          mode: 'read_only',
          runtimeState: 'no_project_open',
        },
      },
      {
        type: 'runtime_capabilities_changed',
        runtimeCapabilities: {
          measurementSurfaceAvailable: true,
          mode: 'read_only',
          runtimeState: 'no_project_open',
        },
      },
      {
        type: 'mcp_status_changed',
        mcpStatus: {
          connectedSessions: 1,
          enabled: true,
          endpoint: 'http://127.0.0.1:9311/mcp',
          errorCode: null,
          errorMessage: null,
          host: '127.0.0.1',
          port: 9311,
          state: 'running',
        },
      },
    ]);

    store.close();
  });
});
