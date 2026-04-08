import { afterEach, describe, expect, it, vi } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { ProjectSummary } from '@ai-canvas/ipc-contract';

import { LocalMcpBridge, type ProjectService } from '../src';

const activeBridges: LocalMcpBridge[] = [];

afterEach(async () => {
  await Promise.all(activeBridges.splice(0).map((bridge) => bridge.stop()));
});

const fixtureProject: ProjectSummary = {
  createdAt: '2026-03-25T00:00:00.000Z',
  documentId: 'doc_123',
  id: 'project_123',
  lastOpenedAt: '2026-03-25T00:00:00.000Z',
  name: 'Fixture Project',
  updatedAt: '2026-03-25T00:00:00.000Z',
};

const fixtureNode = {
  authoring: {
    local_values: {},
    style_bindings: {},
    variable_bindings: {},
  },
  child_ids: [],
  id: 'scene_home',
  is_locked: false,
  is_visible: true,
  kind: 'frame' as const,
  name: 'Home',
  parent_id: null,
  render_style: {
    height: 844,
    left: 40,
    top: 60,
    width: 390,
  },
  scene_id: 'scene_home',
};

const fixtureNodeWithUndefinedComputedLayout = {
  ...fixtureNode,
  computed_layout: undefined,
};

const DOCS_OVERVIEW_URI = 'docs://overview';
const DOCS_TOOL_LIST_PROJECTS_URI = 'docs://tools/list_projects';
const AI_CANVAS_PROJECTS_URI = 'ai-canvas://projects';
const AI_CANVAS_ACTIVE_PROJECT_URI = 'ai-canvas://active/project';
const AI_CANVAS_PROJECT_URI = `ai-canvas://projects/${fixtureProject.id}`;
const AI_CANVAS_PROJECT_SCENES_URI = `ai-canvas://projects/${fixtureProject.id}/scenes`;
const AI_CANVAS_PROJECT_DESIGN_SYSTEM_URI = `ai-canvas://projects/${fixtureProject.id}/design-system`;
const AI_CANVAS_PROJECT_TREE_URI = `ai-canvas://projects/${fixtureProject.id}/tree`;
const AI_CANVAS_PROJECT_NODE_URI = `ai-canvas://projects/${fixtureProject.id}/nodes/${fixtureNode.id}`;

function createOk<T>(data: T) {
  return {
    data,
    ok: true as const,
  };
}

function createService(
  overrides: Partial<ProjectService> = {},
): ProjectService {
  return {
    applyCommands:
      overrides.applyCommands ??
      (async () =>
        createOk({
          document_id: 'doc_123',
          effects: {
            changed_node_ids: ['scene_home'],
            changed_scene_ids: ['scene_home'],
          },
          layout_refresh: {
            measured_node_count: 1,
            measured_root_ids: ['scene_home'],
            status: 'refreshed' as const,
          },
          revision: 2,
        })),
    createAssetFromBytes:
      overrides.createAssetFromBytes ??
      (async (input) =>
        createOk({
          asset_id: input.asset_id ?? 'asset_uploaded',
          content_hash: 'abc123',
          kind: input.kind ?? 'image',
          mime_type: input.mime_type,
          revision: 2,
          size_bytes: 68,
          source: {
            content_hash: 'abc123',
            kind: 'asset_store' as const,
            ...(input.original_filename === undefined
              ? {}
              : { original_filename: input.original_filename }),
          },
        })),
    createAssetFromUrl:
      overrides.createAssetFromUrl ??
      (async (input) =>
        createOk({
          asset_id: input.asset_id ?? 'asset_downloaded',
          content_hash: 'url123',
          kind: 'image',
          mime_type: 'image/png',
          revision: 2,
          size_bytes: 68,
          source: {
            content_hash: 'url123',
            kind: 'asset_store' as const,
            original_filename: 'downloaded.png',
          },
        })),
    createProject:
      overrides.createProject ??
      (async (name) =>
        createOk({
          ...fixtureProject,
          id: 'project_created',
          name,
        })),
    inspectDesignSystem:
      overrides.inspectDesignSystem ??
      (async () =>
        createOk({
          design_system: {
            canvas: {
              authoring: {
                local_values: {
                  'canvas.background_color': '#faf7f0',
                },
                variable_bindings: {},
              },
              background_color: '#faf7f0',
              extent_mode: 'infinite' as const,
            },
            styles: {
              paint: {},
              text: {},
            },
            variables: {
              collections: {},
            },
          },
          document_id: 'doc_123',
          project_id: fixtureProject.id,
          revision: 1,
        })),
    inspectNode:
      overrides.inspectNode ??
      (async (_projectId, nodeId) =>
        createOk({
          document_id: 'doc_123',
          node: {
            ...fixtureNode,
            id: nodeId,
          },
          project_id: fixtureProject.id,
          revision: 1,
        })),
    inspectProject:
      overrides.inspectProject ??
      (async () =>
        createOk({
          document: {
            asset_count: 0,
            document_id: 'doc_123',
            name: 'Fixture Project',
            node_count: 1,
            page_name: 'Canvas',
            paint_style_count: 0,
            root_child_ids: ['scene_home'],
            root_id: 'canvas_root',
            scene_count: 1,
            text_style_count: 0,
            variable_collection_count: 0,
            variable_count: 0,
          },
          is_active: true,
          project: fixtureProject,
          revision: 1,
        })),
    inspectScenes:
      overrides.inspectScenes ??
      (async () =>
        createOk({
          document_id: 'doc_123',
          project_id: fixtureProject.id,
          revision: 1,
          scenes: [
            {
              child_ids: [],
              frame: fixtureNode,
              scene: {
                child_count: 0,
                frame_node_id: 'scene_home',
                id: 'scene_home',
                name: 'Home',
                scene_metadata: {
                  tags: [],
                },
              },
            },
          ],
        })),
    inspectTree:
      overrides.inspectTree ??
      (async (input) =>
        createOk({
          document_id: 'doc_123',
          project_id: fixtureProject.id,
          revision: 1,
          root_node_id: input.rootNodeId ?? null,
          tree: [
            {
              child_ids: [],
              children: [],
              id: input.rootNodeId ?? 'scene_home',
              is_locked: false,
              is_visible: true,
              kind: 'frame',
              name: 'Home',
              parent_id: null,
              scene_id: 'scene_home',
            },
          ],
        })),
    listProjects:
      overrides.listProjects ?? (async () => createOk([fixtureProject])),
    openProject:
      overrides.openProject ??
      (async (projectId) =>
        createOk({
          project: {
            ...fixtureProject,
            id: projectId,
          },
          revision: 1,
        })),
  };
}

describe('LocalMcpBridge', () => {
  it('initializes and exposes the self-documenting MCP surface', async () => {
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4318,
      projectService: createService(),
    });
    activeBridges.push(bridge);

    await bridge.start();
    expect(bridge.getStatus()).toMatchObject({
      enabled: true,
      errorCode: null,
      errorMessage: null,
      port: 4318,
      state: 'running',
    });

    const client = new Client({
      name: 'ai-canvas-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:4318/mcp'),
    );

    await client.connect(transport);

    expect(client.getInstructions()).toContain(DOCS_OVERVIEW_URI);
    expect(client.getInstructions()).toContain('renderer measurement surface');
    expect(client.getServerCapabilities()).toMatchObject({
      resources: {
        listChanged: true,
      },
      tools: {
        listChanged: true,
      },
    });
    expect(client.getServerCapabilities()?.prompts).toBeUndefined();

    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'apply_commands',
      'create_asset_from_bytes',
      'create_asset_from_url',
      'create_project',
      'inspect_design_system',
      'inspect_node',
      'inspect_project',
      'inspect_scenes',
      'inspect_tree',
      'list_projects',
      'open_project',
    ]);
    expect(
      tools.tools.find((tool) => tool.name === 'list_projects'),
    ).toMatchObject({
      annotations: {
        readOnlyHint: true,
      },
      title: 'List Projects',
    });
    expect(
      tools.tools.find((tool) => tool.name === 'inspect_project'),
    ).toMatchObject({
      annotations: {
        readOnlyHint: true,
      },
      title: 'Inspect Project',
    });
    expect(
      tools.tools.find((tool) => tool.name === 'open_project'),
    ).toMatchObject({
      title: 'Open Project',
    });

    const resources = await client.listResources();

    expect(resources.resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining([
        DOCS_OVERVIEW_URI,
        'docs://capabilities',
        'docs://tools',
        'docs://resources',
        'docs://examples/quickstart',
        DOCS_TOOL_LIST_PROJECTS_URI,
        AI_CANVAS_PROJECTS_URI,
        AI_CANVAS_ACTIVE_PROJECT_URI,
        AI_CANVAS_PROJECT_URI,
        AI_CANVAS_PROJECT_SCENES_URI,
        AI_CANVAS_PROJECT_DESIGN_SYSTEM_URI,
        AI_CANVAS_PROJECT_TREE_URI,
      ]),
    );
    expect(resources.resources.map((resource) => resource.uri)).not.toContain(
      AI_CANVAS_PROJECT_NODE_URI,
    );

    const templates = await client.listResourceTemplates();

    expect(
      templates.resourceTemplates.map((resource) => resource.uriTemplate),
    ).toEqual(
      expect.arrayContaining([
        'docs://tools/{tool_name}',
        'ai-canvas://projects/{project_id}',
        'ai-canvas://projects/{project_id}/scenes',
        'ai-canvas://projects/{project_id}/design-system',
        'ai-canvas://projects/{project_id}/tree',
        'ai-canvas://projects/{project_id}/nodes/{node_id}',
      ]),
    );

    const result = await client.callTool({
      arguments: {},
      name: 'list_projects',
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      ok: true,
      projects: [fixtureProject],
    });
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_link',
          uri: AI_CANVAS_PROJECTS_URI,
        }),
      ]),
    );

    await transport.close();
    await client.close();
  });

  it('reads documentation and live project resources', async () => {
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4326,
      projectService: createService(),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:4326/mcp'),
    );

    await client.connect(transport);

    const overview = await client.readResource({
      uri: DOCS_OVERVIEW_URI,
    });

    expect(overview.contents[0]).toMatchObject({
      mimeType: 'text/markdown',
      uri: DOCS_OVERVIEW_URI,
    });
    expect(overview.contents[0]?.text).toContain(
      'Project targeting defaults to the active project session',
    );

    const toolDoc = await client.readResource({
      uri: DOCS_TOOL_LIST_PROJECTS_URI,
    });

    expect(toolDoc.contents[0]).toMatchObject({
      mimeType: 'text/markdown',
      uri: DOCS_TOOL_LIST_PROJECTS_URI,
    });
    expect(toolDoc.contents[0]?.text).toContain('Tool name: `list_projects`');

    const projectsResource = await client.readResource({
      uri: AI_CANVAS_PROJECTS_URI,
    });

    expect(JSON.parse(projectsResource.contents[0]?.text ?? '')).toEqual({
      ok: true,
      projects: [fixtureProject],
    });

    const projectResource = await client.readResource({
      uri: AI_CANVAS_PROJECT_URI,
    });

    expect(JSON.parse(projectResource.contents[0]?.text ?? '')).toMatchObject({
      ok: true,
      project: fixtureProject,
      revision: 1,
    });

    const nodeResource = await client.readResource({
      uri: AI_CANVAS_PROJECT_NODE_URI,
    });

    expect(JSON.parse(nodeResource.contents[0]?.text ?? '')).toMatchObject({
      node: fixtureNode,
      ok: true,
      project_id: fixtureProject.id,
    });

    await transport.close();
    await client.close();
  });

  it('creates project-local assets from a public image URL and returns a usable asset id', async () => {
    const createAssetFromUrl = vi.fn(async (input) =>
      createOk({
        asset_id: input.asset_id ?? 'asset_downloaded',
        content_hash: 'url123',
        kind: 'image',
        mime_type: 'image/png',
        revision: 2,
        size_bytes: 68,
        source: {
          content_hash: 'url123',
          kind: 'asset_store' as const,
          original_filename: 'downloaded.png',
        },
      }),
    );
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4325,
      projectService: createService({ createAssetFromUrl }),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:4325/mcp'),
    );

    await client.connect(transport);

    const result = await client.callTool({
      arguments: {
        asset_id: 'asset_logo',
        project_id: fixtureProject.id,
        url: 'https://cdn.example.test/logo.png',
      },
      name: 'create_asset_from_url',
    });

    expect(createAssetFromUrl).toHaveBeenCalledWith({
      asset_id: 'asset_logo',
      project_id: fixtureProject.id,
      url: 'https://cdn.example.test/logo.png',
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      asset_id: 'asset_logo',
      content_hash: 'url123',
      kind: 'image',
      mime_type: 'image/png',
      ok: true,
      revision: 2,
      size_bytes: 68,
      source: {
        content_hash: 'url123',
        kind: 'asset_store',
        original_filename: 'downloaded.png',
      },
    });
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_link',
          uri: AI_CANVAS_PROJECT_URI,
        }),
      ]),
    );

    await transport.close();
    await client.close();
  });

  it('creates project-local assets from inline bytes and returns a usable asset id', async () => {
    const createAssetFromBytes = vi.fn(async (input) =>
      createOk({
        asset_id: input.asset_id ?? 'asset_uploaded',
        content_hash:
          '4caece539b039b16e16206ea2478f8c5ffb2ca05c5d1d8eb6573993dbcbdbb0f',
        kind: input.kind ?? 'image',
        mime_type: input.mime_type,
        revision: 2,
        size_bytes: 68,
        source: {
          content_hash:
            '4caece539b039b16e16206ea2478f8c5ffb2ca05c5d1d8eb6573993dbcbdbb0f',
          kind: 'asset_store' as const,
          ...(input.original_filename === undefined
            ? {}
            : { original_filename: input.original_filename }),
        },
      }),
    );
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4324,
      projectService: createService({ createAssetFromBytes }),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:4324/mcp'),
    );

    await client.connect(transport);

    const result = await client.callTool({
      arguments: {
        asset_id: 'asset_logo',
        bytes_base64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZcAAAAASUVORK5CYII=',
        kind: 'image',
        mime_type: 'image/png',
        original_filename: 'logo.png',
        project_id: fixtureProject.id,
      },
      name: 'create_asset_from_bytes',
    });

    expect(createAssetFromBytes).toHaveBeenCalledWith({
      asset_id: 'asset_logo',
      bytes_base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZcAAAAASUVORK5CYII=',
      kind: 'image',
      mime_type: 'image/png',
      original_filename: 'logo.png',
      project_id: fixtureProject.id,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      asset_id: 'asset_logo',
      content_hash:
        '4caece539b039b16e16206ea2478f8c5ffb2ca05c5d1d8eb6573993dbcbdbb0f',
      kind: 'image',
      mime_type: 'image/png',
      ok: true,
      revision: 2,
      size_bytes: 68,
      source: {
        content_hash:
          '4caece539b039b16e16206ea2478f8c5ffb2ca05c5d1d8eb6573993dbcbdbb0f',
        kind: 'asset_store',
        original_filename: 'logo.png',
      },
    });
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_link',
          uri: AI_CANVAS_PROJECT_URI,
        }),
      ]),
    );

    await transport.close();
    await client.close();
  });

  it('opens, inspects, and applies commands with structured MCP payloads', async () => {
    const applyCommands = vi.fn(async () =>
      createOk({
        document_id: 'doc_123',
        effects: {
          changed_node_ids: ['scene_home'],
          changed_scene_ids: ['scene_home'],
        },
        layout_refresh: {
          measured_node_count: 1,
          measured_root_ids: ['scene_home'],
          status: 'refreshed' as const,
        },
        revision: 2,
      }),
    );
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4321,
      projectService: createService({ applyCommands }),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:4321/mcp'),
    );

    await client.connect(transport);

    const openResult = await client.callTool({
      arguments: {
        project_id: fixtureProject.id,
      },
      name: 'open_project',
    });

    expect(openResult.isError).not.toBe(true);
    expect(openResult.structuredContent).toEqual({
      ok: true,
      project: fixtureProject,
      revision: 1,
    });
    expect(openResult.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_link',
          uri: AI_CANVAS_PROJECT_URI,
        }),
      ]),
    );

    const inspectProjectResult = await client.callTool({
      arguments: {},
      name: 'inspect_project',
    });

    expect(inspectProjectResult.structuredContent).toEqual({
      document: {
        asset_count: 0,
        document_id: 'doc_123',
        name: 'Fixture Project',
        node_count: 1,
        page_name: 'Canvas',
        paint_style_count: 0,
        root_child_ids: ['scene_home'],
        root_id: 'canvas_root',
        scene_count: 1,
        text_style_count: 0,
        variable_collection_count: 0,
        variable_count: 0,
      },
      is_active: true,
      ok: true,
      project: fixtureProject,
      revision: 1,
    });

    const inspectTreeResult = await client.callTool({
      arguments: {
        root_node_id: 'scene_home',
      },
      name: 'inspect_tree',
    });

    expect(inspectTreeResult.structuredContent).toEqual({
      document_id: 'doc_123',
      ok: true,
      project_id: fixtureProject.id,
      revision: 1,
      root_node_id: 'scene_home',
      tree: [
        {
          child_ids: [],
          children: [],
          id: 'scene_home',
          is_locked: false,
          is_visible: true,
          kind: 'frame',
          name: 'Home',
          parent_id: null,
          scene_id: 'scene_home',
        },
      ],
    });

    const inspectNodeResult = await client.callTool({
      arguments: {
        node_id: 'scene_home',
      },
      name: 'inspect_node',
    });

    expect(inspectNodeResult.structuredContent).toEqual({
      document_id: 'doc_123',
      node: fixtureNode,
      ok: true,
      project_id: fixtureProject.id,
      revision: 1,
    });
    expect(inspectNodeResult.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_link',
          uri: AI_CANVAS_PROJECT_NODE_URI,
        }),
      ]),
    );

    const inspectScenesResult = await client.callTool({
      arguments: {},
      name: 'inspect_scenes',
    });

    expect(inspectScenesResult.structuredContent).toEqual({
      document_id: 'doc_123',
      ok: true,
      project_id: fixtureProject.id,
      revision: 1,
      scenes: [
        {
          child_ids: [],
          frame: fixtureNode,
          scene: {
            child_count: 0,
            frame_node_id: 'scene_home',
            id: 'scene_home',
            name: 'Home',
            scene_metadata: {
              tags: [],
            },
          },
        },
      ],
    });

    const inspectDesignSystemResult = await client.callTool({
      arguments: {},
      name: 'inspect_design_system',
    });

    expect(inspectDesignSystemResult.structuredContent).toEqual({
      design_system: {
        canvas: {
          authoring: {
            local_values: {
              'canvas.background_color': '#faf7f0',
            },
            variable_bindings: {},
          },
          background_color: '#faf7f0',
          extent_mode: 'infinite',
        },
        styles: {
          paint: {},
          text: {},
        },
        variables: {
          collections: {},
        },
      },
      document_id: 'doc_123',
      ok: true,
      project_id: fixtureProject.id,
      revision: 1,
    });

    const applyResult = await client.callTool({
      arguments: {
        base_revision: 1,
        commands: [
          {
            scene: {
              height: 844,
              id: 'scene_home',
              left: 40,
              name: 'Home',
              top: 60,
              width: 390,
            },
            type: 'create_scene',
          },
        ],
        project_id: fixtureProject.id,
      },
      name: 'apply_commands',
    });

    expect(applyCommands).toHaveBeenCalledWith({
      base_revision: 1,
      commands: [
        {
          scene: {
            height: 844,
            id: 'scene_home',
            left: 40,
            name: 'Home',
            top: 60,
            width: 390,
          },
          type: 'create_scene',
        },
      ],
      project_id: fixtureProject.id,
    });
    expect(applyResult.structuredContent).toEqual({
      document_id: 'doc_123',
      effects: {
        changed_node_ids: ['scene_home'],
        changed_scene_ids: ['scene_home'],
      },
      layout_refresh: {
        measured_node_count: 1,
        measured_root_ids: ['scene_home'],
        status: 'refreshed',
      },
      ok: true,
      revision: 2,
    });
    expect(applyResult.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_link',
          uri: AI_CANVAS_PROJECT_URI,
        }),
      ]),
    );

    await transport.close();
    await client.close();
  });

  it('omits undefined fields from JSON inspection payloads', async () => {
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4323,
      projectService: createService({
        inspectNode: async () =>
          createOk({
            document_id: 'doc_123',
            node: fixtureNodeWithUndefinedComputedLayout,
            project_id: fixtureProject.id,
            revision: 1,
          }),
        inspectScenes: async () =>
          createOk({
            document_id: 'doc_123',
            project_id: fixtureProject.id,
            revision: 1,
            scenes: [
              {
                child_ids: [],
                frame: fixtureNodeWithUndefinedComputedLayout,
                scene: {
                  child_count: 0,
                  frame_node_id: 'scene_home',
                  id: 'scene_home',
                  name: 'Home',
                  scene_metadata: {
                    tags: [],
                  },
                },
              },
            ],
          }),
      }),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:4323/mcp'),
    );

    await client.connect(transport);

    const inspectNodeResult = await client.callTool({
      arguments: {
        node_id: 'scene_home',
      },
      name: 'inspect_node',
    });

    expect(inspectNodeResult.structuredContent).toEqual({
      document_id: 'doc_123',
      node: fixtureNode,
      ok: true,
      project_id: fixtureProject.id,
      revision: 1,
    });

    const inspectScenesResult = await client.callTool({
      arguments: {},
      name: 'inspect_scenes',
    });

    expect(inspectScenesResult.structuredContent).toEqual({
      document_id: 'doc_123',
      ok: true,
      project_id: fixtureProject.id,
      revision: 1,
      scenes: [
        {
          child_ids: [],
          frame: fixtureNode,
          scene: {
            child_count: 0,
            frame_node_id: 'scene_home',
            id: 'scene_home',
            name: 'Home',
            scene_metadata: {
              tags: [],
            },
          },
        },
      ],
    });

    await transport.close();
    await client.close();
  });

  it('returns structured tool errors when the runtime rejects a request', async () => {
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4322,
      projectService: createService({
        applyCommands: async () => ({
          error: {
            code: 'measurement_surface_unavailable',
            message:
              'Write-capable command execution requires an available renderer measurement surface',
          },
          ok: false,
        }),
      }),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: 'ai-canvas-test-client',
      version: '0.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:4322/mcp'),
    );

    await client.connect(transport);

    const result = await client.callTool({
      arguments: {
        commands: [],
        project_id: fixtureProject.id,
      },
      name: 'apply_commands',
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({
      error: {
        code: 'measurement_surface_unavailable',
        message:
          'Write-capable command execution requires an available renderer measurement surface',
      },
      ok: false,
    });

    await transport.close();
    await client.close();
  });

  it('rejects MCP requests sent to the bare root URL', async () => {
    const bridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4320,
      projectService: createService(),
    });
    activeBridges.push(bridge);

    await bridge.start();

    const response = await fetch('http://127.0.0.1:4320/', {
      body: JSON.stringify({}),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    expect(response.status).toBe(404);
  });

  it('fails on a fixed-port conflict without reporting itself as enabled', async () => {
    const primaryBridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4319,
      projectService: createService(),
    });
    const conflictingBridge = new LocalMcpBridge({
      host: '127.0.0.1',
      port: 4319,
      projectService: createService(),
    });

    activeBridges.push(primaryBridge, conflictingBridge);

    await primaryBridge.start();
    await expect(conflictingBridge.start()).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    expect(conflictingBridge.getStatus()).toMatchObject({
      enabled: false,
      errorCode: 'port_in_use',
      errorMessage:
        'The local MCP bridge requires 127.0.0.1:4319, but that port is already in use.',
      port: 4319,
      state: 'error',
    });
  });
});
