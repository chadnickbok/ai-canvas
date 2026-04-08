import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ErrorCode,
  McpError,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import {
  appErrorSchema,
  applyCommandsInputSchema,
  commandResultSchema,
  createProjectInputSchema,
  projectSummarySchema,
  type AppResult,
  type CommandResult,
  type McpStatus,
  type ProjectSummary,
} from '@ai-canvas/ipc-contract';
import { z } from 'zod';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export type InspectProjectOutput = {
  document: {
    asset_count: number;
    document_id: string;
    name: string;
    node_count: number;
    page_name: string;
    paint_style_count: number;
    root_child_ids: string[];
    root_id: string;
    scene_count: number;
    text_style_count: number;
    variable_collection_count: number;
    variable_count: number;
  };
  is_active: boolean;
  project: ProjectSummary;
  revision: number;
};

export type InspectTreeNodeOutput = {
  child_ids: string[];
  children: InspectTreeNodeOutput[];
  computed_layout?: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  id: string;
  is_locked: boolean;
  is_visible: boolean;
  kind: string;
  name: string;
  parent_id: string | null;
  scene_id: string | null;
};

export type InspectTreeOutput = {
  document_id: string;
  project_id: string;
  revision: number;
  root_node_id: string | null;
  tree: InspectTreeNodeOutput[];
};

export type InspectNodeOutput = {
  document_id: string;
  node: JsonObject;
  project_id: string;
  revision: number;
};

export type InspectScenesOutput = {
  document_id: string;
  project_id: string;
  revision: number;
  scenes: Array<{
    child_ids: string[];
    frame: JsonObject;
    scene: {
      child_count: number;
      frame_node_id: string;
      id: string;
      name: string;
      scene_metadata: {
        group?: string;
        notes?: string;
        role?: string;
        summary?: string;
        tags: string[];
      };
    };
  }>;
};

export type InspectDesignSystemOutput = {
  design_system: {
    canvas: JsonObject;
    styles: JsonObject;
    variables: JsonObject;
  };
  document_id: string;
  project_id: string;
  revision: number;
};

export type OpenProjectOutput = {
  project: ProjectSummary;
  revision: number;
};

export type ApplyCommandsToolInput = {
  base_revision?: number;
  commands: z.infer<typeof applyCommandsInputSchema>['commands'];
  project_id?: string;
};

export type CreateAssetFromBytesToolInput = {
  asset_id?: string;
  bytes_base64: string;
  height?: number;
  kind?: 'image' | 'svg' | 'unknown';
  metadata?: JsonObject;
  mime_type: string;
  original_filename?: string;
  project_id?: string;
  width?: number;
};

export type CreateAssetFromUrlToolInput = {
  asset_id?: string;
  project_id?: string;
  url: string;
};

export type CreateAssetToolOutput = {
  asset_id: string;
  content_hash: string;
  kind: 'image' | 'svg' | 'unknown';
  mime_type: string;
  revision: number;
  size_bytes: number;
  source: {
    content_hash: string;
    kind: 'asset_store';
    original_filename?: string;
  };
};

export type CreateAssetFromBytesOutput = CreateAssetToolOutput;
export type CreateAssetFromUrlOutput = CreateAssetToolOutput;

export type ProjectService = {
  applyCommands: (
    input: ApplyCommandsToolInput,
  ) => Promise<AppResult<CommandResult>> | AppResult<CommandResult>;
  createAssetFromBytes: (
    input: CreateAssetFromBytesToolInput,
  ) =>
    | Promise<AppResult<CreateAssetFromBytesOutput>>
    | AppResult<CreateAssetFromBytesOutput>;
  createAssetFromUrl: (
    input: CreateAssetFromUrlToolInput,
  ) =>
    | Promise<AppResult<CreateAssetFromUrlOutput>>
    | AppResult<CreateAssetFromUrlOutput>;
  createProject: (
    name: string,
  ) => Promise<AppResult<ProjectSummary>> | AppResult<ProjectSummary>;
  inspectDesignSystem: (
    projectId?: string,
  ) =>
    | Promise<AppResult<InspectDesignSystemOutput>>
    | AppResult<InspectDesignSystemOutput>;
  inspectNode: (
    projectId: string | undefined,
    nodeId: string,
  ) => Promise<AppResult<InspectNodeOutput>> | AppResult<InspectNodeOutput>;
  inspectProject: (
    projectId?: string,
  ) =>
    | Promise<AppResult<InspectProjectOutput>>
    | AppResult<InspectProjectOutput>;
  inspectScenes: (
    projectId?: string,
  ) => Promise<AppResult<InspectScenesOutput>> | AppResult<InspectScenesOutput>;
  inspectTree: (input: {
    projectId?: string;
    rootNodeId?: string;
  }) => Promise<AppResult<InspectTreeOutput>> | AppResult<InspectTreeOutput>;
  listProjects: () =>
    | Promise<AppResult<ProjectSummary[]>>
    | AppResult<ProjectSummary[]>;
  openProject: (
    projectId: string,
  ) => Promise<AppResult<OpenProjectOutput>> | AppResult<OpenProjectOutput>;
};

export type LocalMcpBridgeOptions = {
  host: string;
  port: number;
  projectService: ProjectService;
};

type SessionEntry = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

type McpStartError = {
  code: 'port_in_use' | 'startup_failed';
  message: string;
};

const toolErrorSchema = z
  .object({
    error: appErrorSchema,
    ok: z.literal(false),
  })
  .strict();

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  jsonValueSchema,
);

const computedLayoutSchema = z
  .object({
    height: z.number(),
    width: z.number(),
    x: z.number(),
    y: z.number(),
  })
  .strict();

const sceneRecordSchema = z
  .object({
    child_count: z.number().int().nonnegative(),
    frame_node_id: z.string(),
    id: z.string(),
    name: z.string(),
    scene_metadata: z
      .object({
        group: z.string().optional(),
        notes: z.string().optional(),
        role: z.string().optional(),
        summary: z.string().optional(),
        tags: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

const documentInspectionSchema = z
  .object({
    asset_count: z.number().int().nonnegative(),
    document_id: z.string(),
    name: z.string(),
    node_count: z.number().int().nonnegative(),
    page_name: z.string(),
    paint_style_count: z.number().int().nonnegative(),
    root_child_ids: z.array(z.string()),
    root_id: z.string(),
    scene_count: z.number().int().nonnegative(),
    text_style_count: z.number().int().nonnegative(),
    variable_collection_count: z.number().int().nonnegative(),
    variable_count: z.number().int().nonnegative(),
  })
  .strict();

const treeNodeInspectionSchema: z.ZodType<InspectTreeNodeOutput> = z.lazy(() =>
  z
    .object({
      child_ids: z.array(z.string()),
      children: z.array(treeNodeInspectionSchema),
      computed_layout: computedLayoutSchema.optional(),
      id: z.string(),
      is_locked: z.boolean(),
      is_visible: z.boolean(),
      kind: z.string(),
      name: z.string(),
      parent_id: z.string().nullable(),
      scene_id: z.string().nullable(),
    })
    .strict(),
);

const sceneInspectionSchema = z
  .object({
    child_ids: z.array(z.string()),
    frame: jsonObjectSchema,
    scene: sceneRecordSchema,
  })
  .strict();

const designSystemInspectionSchema = z
  .object({
    canvas: jsonObjectSchema,
    styles: jsonObjectSchema,
    variables: jsonObjectSchema,
  })
  .strict();

const toolProjectIdSchema = z.string().min(1);
const assetKindSchema = z.enum(['image', 'svg', 'unknown']);
const mimeTypeSchema = z.string().trim().min(1);
const assetMetadataSchema = jsonObjectSchema;
const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Asset URLs must use http or https.');
const assetStoreSourceSchema = z
  .object({
    content_hash: z.string(),
    kind: z.literal('asset_store'),
    original_filename: z.string().optional(),
  })
  .strict();

const openProjectInputSchema = z
  .object({
    project_id: toolProjectIdSchema,
  })
  .strict();

const inspectProjectInputSchema = z
  .object({
    project_id: toolProjectIdSchema.optional(),
  })
  .strict();

const inspectTreeInputSchema = z
  .object({
    project_id: toolProjectIdSchema.optional(),
    root_node_id: z.string().min(1).optional(),
  })
  .strict();

const inspectNodeInputSchema = z
  .object({
    node_id: z.string().min(1),
    project_id: toolProjectIdSchema.optional(),
  })
  .strict();

const applyCommandsToolInputSchema = applyCommandsInputSchema
  .omit({
    document_id: true,
  })
  .extend({
    project_id: toolProjectIdSchema.optional(),
  })
  .strict();

const createAssetFromBytesInputSchema = z
  .object({
    asset_id: z.string().min(1).optional(),
    bytes_base64: z.string().min(1),
    height: z.number().nonnegative().optional(),
    kind: assetKindSchema.optional(),
    metadata: assetMetadataSchema.optional(),
    mime_type: mimeTypeSchema,
    original_filename: z.string().min(1).optional(),
    project_id: toolProjectIdSchema.optional(),
    width: z.number().nonnegative().optional(),
  })
  .strict();

const createAssetFromUrlInputSchema = z
  .object({
    asset_id: z.string().min(1).optional(),
    project_id: toolProjectIdSchema.optional(),
    url: httpUrlSchema,
  })
  .strict();

const listProjectsOutputSchema = z
  .object({
    ok: z.literal(true),
    projects: z.array(projectSummarySchema),
  })
  .strict();

const createProjectOutputSchema = z
  .object({
    ok: z.literal(true),
    project: projectSummarySchema,
  })
  .strict();

const openProjectOutputSchema = z
  .object({
    ok: z.literal(true),
    project: projectSummarySchema,
    revision: z.number().int().positive(),
  })
  .strict();

const inspectProjectOutputSchema = z
  .object({
    document: documentInspectionSchema,
    is_active: z.boolean(),
    ok: z.literal(true),
    project: projectSummarySchema,
    revision: z.number().int().positive(),
  })
  .strict();

const inspectTreeOutputSchema = z
  .object({
    document_id: z.string(),
    ok: z.literal(true),
    project_id: z.string(),
    revision: z.number().int().positive(),
    root_node_id: z.string().nullable(),
    tree: z.array(treeNodeInspectionSchema),
  })
  .strict();

const inspectNodeOutputSchema = z
  .object({
    document_id: z.string(),
    node: jsonObjectSchema,
    ok: z.literal(true),
    project_id: z.string(),
    revision: z.number().int().positive(),
  })
  .strict();

const inspectScenesOutputSchema = z
  .object({
    document_id: z.string(),
    ok: z.literal(true),
    project_id: z.string(),
    revision: z.number().int().positive(),
    scenes: z.array(sceneInspectionSchema),
  })
  .strict();

const inspectDesignSystemOutputSchema = z
  .object({
    design_system: designSystemInspectionSchema,
    document_id: z.string(),
    ok: z.literal(true),
    project_id: z.string(),
    revision: z.number().int().positive(),
  })
  .strict();

const applyCommandsOutputSchema = z
  .object({
    ok: z.literal(true),
  })
  .extend(commandResultSchema.shape)
  .strict();

const createAssetOutputSchema = z
  .object({
    asset_id: z.string(),
    content_hash: z.string(),
    kind: assetKindSchema,
    mime_type: mimeTypeSchema,
    ok: z.literal(true),
    revision: z.number().int().positive(),
    size_bytes: z.number().int().nonnegative(),
    source: assetStoreSourceSchema,
  })
  .strict();

type ToolResourceLink = {
  description?: string;
  mimeType?: string;
  name: string;
  type: 'resource_link';
  uri: string;
};

type ToolDocDefinition = {
  category: 'inspection' | 'mutation' | 'session';
  description: string;
  guidance: string[];
  readOnly: boolean;
  relatedResources: string[];
  requiresMeasurementSurface: boolean;
  title: string;
};

type FixedResourceDefinition = {
  description: string;
  mimeType: string;
  name: string;
  title: string;
  uri: string;
};

type TemplateResourceDefinition = {
  description: string;
  mimeType: string;
  name: string;
  title: string;
  uriTemplate: string;
};

type ListedResource = {
  description: string;
  mimeType: string;
  name: string;
  title: string;
  uri: string;
};

const DOCS_OVERVIEW_URI = 'docs://overview';
const DOCS_CAPABILITIES_URI = 'docs://capabilities';
const DOCS_TOOLS_URI = 'docs://tools';
const DOCS_RESOURCES_URI = 'docs://resources';
const DOCS_QUICKSTART_URI = 'docs://examples/quickstart';
const DOCS_TOOL_URI_TEMPLATE = 'docs://tools/{tool_name}';

const AI_CANVAS_PROJECTS_URI = 'ai-canvas://projects';
const AI_CANVAS_ACTIVE_PROJECT_URI = 'ai-canvas://active/project';
const AI_CANVAS_PROJECT_URI_TEMPLATE = 'ai-canvas://projects/{project_id}';
const AI_CANVAS_PROJECT_SCENES_URI_TEMPLATE =
  'ai-canvas://projects/{project_id}/scenes';
const AI_CANVAS_PROJECT_DESIGN_SYSTEM_URI_TEMPLATE =
  'ai-canvas://projects/{project_id}/design-system';
const AI_CANVAS_PROJECT_TREE_URI_TEMPLATE =
  'ai-canvas://projects/{project_id}/tree';
const AI_CANVAS_PROJECT_NODE_URI_TEMPLATE =
  'ai-canvas://projects/{project_id}/nodes/{node_id}';

const fixedDocsResources: readonly FixedResourceDefinition[] = [
  {
    description:
      'Operator-facing overview of the AI Canvas MCP bridge and how to start exploring it.',
    mimeType: 'text/markdown',
    name: 'overview',
    title: 'AI Canvas MCP Overview',
    uri: DOCS_OVERVIEW_URI,
  },
  {
    description:
      'Summary of the handshake, tools, resources, and deferred prompt surface.',
    mimeType: 'text/markdown',
    name: 'capabilities',
    title: 'AI Canvas MCP Capabilities',
    uri: DOCS_CAPABILITIES_URI,
  },
  {
    description:
      'Index of MCP tools with titles, access mode, and related documentation URIs.',
    mimeType: 'text/markdown',
    name: 'tools',
    title: 'AI Canvas MCP Tools',
    uri: DOCS_TOOLS_URI,
  },
  {
    description:
      'Guide to the fixed and templated resource URI spaces exposed by the bridge.',
    mimeType: 'text/markdown',
    name: 'resources',
    title: 'AI Canvas MCP Resources',
    uri: DOCS_RESOURCES_URI,
  },
  {
    description:
      'Recommended inspect-first and mutate-second workflow for AI Canvas MCP clients.',
    mimeType: 'text/markdown',
    name: 'quickstart',
    title: 'AI Canvas MCP Quickstart',
    uri: DOCS_QUICKSTART_URI,
  },
] as const;

const fixedLiveResources: readonly FixedResourceDefinition[] = [
  {
    description:
      'List every local AI Canvas project known to the desktop runtime.',
    mimeType: 'application/json',
    name: 'projects',
    title: 'Projects',
    uri: AI_CANVAS_PROJECTS_URI,
  },
  {
    description:
      'Inspect the current active project session when one is available.',
    mimeType: 'application/json',
    name: 'active-project',
    title: 'Active Project',
    uri: AI_CANVAS_ACTIVE_PROJECT_URI,
  },
] as const;

const templateResources: readonly TemplateResourceDefinition[] = [
  {
    description: 'Per-tool documentation for the AI Canvas MCP tool surface.',
    mimeType: 'text/markdown',
    name: 'tool-docs',
    title: 'Tool Documentation',
    uriTemplate: DOCS_TOOL_URI_TEMPLATE,
  },
  {
    description: 'Project inspection payloads for specific project ids.',
    mimeType: 'application/json',
    name: 'project',
    title: 'Project',
    uriTemplate: AI_CANVAS_PROJECT_URI_TEMPLATE,
  },
  {
    description: 'Scene inspection payloads for specific project ids.',
    mimeType: 'application/json',
    name: 'project-scenes',
    title: 'Project Scenes',
    uriTemplate: AI_CANVAS_PROJECT_SCENES_URI_TEMPLATE,
  },
  {
    description: 'Design-system inspection payloads for specific project ids.',
    mimeType: 'application/json',
    name: 'project-design-system',
    title: 'Project Design System',
    uriTemplate: AI_CANVAS_PROJECT_DESIGN_SYSTEM_URI_TEMPLATE,
  },
  {
    description:
      'Normalized tree inspection payloads for specific project ids.',
    mimeType: 'application/json',
    name: 'project-tree',
    title: 'Project Tree',
    uriTemplate: AI_CANVAS_PROJECT_TREE_URI_TEMPLATE,
  },
  {
    description:
      'Node inspection payloads for a specific project id and node id.',
    mimeType: 'application/json',
    name: 'project-node',
    title: 'Project Node',
    uriTemplate: AI_CANVAS_PROJECT_NODE_URI_TEMPLATE,
  },
] as const;

const toolDocs = {
  list_projects: {
    category: 'inspection',
    description:
      'List local AI Canvas projects from the shared desktop runtime.',
    guidance: [
      'Use this when you need a project id before calling open_project or explicit project resources.',
      'This tool is read-only and remains available when the editor window is closed.',
      `Read ${AI_CANVAS_PROJECTS_URI} for the same information through the resources surface.`,
    ],
    readOnly: true,
    relatedResources: [AI_CANVAS_PROJECTS_URI],
    requiresMeasurementSurface: false,
    title: 'List Projects',
  },
  create_project: {
    category: 'session',
    description:
      'Create a new local AI Canvas project and make it the active desktop session.',
    guidance: [
      'The created project becomes the active project session immediately.',
      `Inspect the result through ${AI_CANVAS_ACTIVE_PROJECT_URI} or ${AI_CANVAS_PROJECT_URI_TEMPLATE}.`,
      'This does not require the renderer measurement surface.',
    ],
    readOnly: false,
    relatedResources: [
      AI_CANVAS_ACTIVE_PROJECT_URI,
      AI_CANVAS_PROJECT_URI_TEMPLATE,
    ],
    requiresMeasurementSurface: false,
    title: 'Create Project',
  },
  open_project: {
    category: 'session',
    description:
      'Open a local AI Canvas project and make it the active desktop session.',
    guidance: [
      'Use this to switch the active project session before omitting project_id from later calls.',
      `The canonical inspection resource is ${AI_CANVAS_PROJECT_URI_TEMPLATE}.`,
      'This changes session state but does not require the renderer measurement surface.',
    ],
    readOnly: false,
    relatedResources: [
      AI_CANVAS_ACTIVE_PROJECT_URI,
      AI_CANVAS_PROJECT_URI_TEMPLATE,
    ],
    requiresMeasurementSurface: false,
    title: 'Open Project',
  },
  inspect_project: {
    category: 'inspection',
    description:
      'Inspect a project summary and normalized document overview for the active or targeted project.',
    guidance: [
      'Omit project_id to inspect the active project session.',
      'This is the best top-level starting point before inspecting scenes, nodes, or design-system state.',
      `The matching resource URI is ${AI_CANVAS_PROJECT_URI_TEMPLATE}.`,
    ],
    readOnly: true,
    relatedResources: [
      AI_CANVAS_ACTIVE_PROJECT_URI,
      AI_CANVAS_PROJECT_URI_TEMPLATE,
    ],
    requiresMeasurementSurface: false,
    title: 'Inspect Project',
  },
  inspect_tree: {
    category: 'inspection',
    description:
      'Inspect the normalized node tree for the active or targeted project.',
    guidance: [
      'Omit root_node_id to inspect the full normalized tree.',
      'Use inspect_node for a single detailed node payload.',
      `The matching resource URI is ${AI_CANVAS_PROJECT_TREE_URI_TEMPLATE}.`,
    ],
    readOnly: true,
    relatedResources: [AI_CANVAS_PROJECT_TREE_URI_TEMPLATE],
    requiresMeasurementSurface: false,
    title: 'Inspect Tree',
  },
  inspect_node: {
    category: 'inspection',
    description:
      'Inspect a normalized node from the active or targeted project.',
    guidance: [
      'This returns the full normalized node payload for a single node id.',
      'Use inspect_tree first when you need to discover child relationships or candidate node ids.',
      `The matching resource URI is ${AI_CANVAS_PROJECT_NODE_URI_TEMPLATE}.`,
    ],
    readOnly: true,
    relatedResources: [AI_CANVAS_PROJECT_NODE_URI_TEMPLATE],
    requiresMeasurementSurface: false,
    title: 'Inspect Node',
  },
  inspect_scenes: {
    category: 'inspection',
    description:
      'Inspect scenes and backing frame records from the active or targeted project.',
    guidance: [
      'This is the fastest way to inspect top-level scene organization.',
      'Each scene payload includes both scene metadata and its backing frame node.',
      `The matching resource URI is ${AI_CANVAS_PROJECT_SCENES_URI_TEMPLATE}.`,
    ],
    readOnly: true,
    relatedResources: [AI_CANVAS_PROJECT_SCENES_URI_TEMPLATE],
    requiresMeasurementSurface: false,
    title: 'Inspect Scenes',
  },
  inspect_design_system: {
    category: 'inspection',
    description:
      'Inspect canvas authoring, variables, and styles from the active or targeted project.',
    guidance: [
      'Use this to inspect document-level canvas state plus design-system data.',
      'This is read-only and remains available while the editor window is closed.',
      `The matching resource URI is ${AI_CANVAS_PROJECT_DESIGN_SYSTEM_URI_TEMPLATE}.`,
    ],
    readOnly: true,
    relatedResources: [AI_CANVAS_PROJECT_DESIGN_SYSTEM_URI_TEMPLATE],
    requiresMeasurementSurface: false,
    title: 'Inspect Design System',
  },
  apply_commands: {
    category: 'mutation',
    description:
      'Apply a validated command batch to the active project session and refresh computed_layout before persistence.',
    guidance: [
      'Use inspect_project to get the current revision before setting base_revision.',
      'This requires the editor window to remain open because the renderer measurement surface must be available.',
      'Create project-local assets first, then attach them through follow-up commands.',
    ],
    readOnly: false,
    relatedResources: [
      AI_CANVAS_ACTIVE_PROJECT_URI,
      AI_CANVAS_PROJECT_URI_TEMPLATE,
      AI_CANVAS_PROJECT_TREE_URI_TEMPLATE,
    ],
    requiresMeasurementSurface: true,
    title: 'Apply Commands',
  },
  create_asset_from_bytes: {
    category: 'mutation',
    description:
      'Create a new project-local asset from inline base64 bytes and return a usable asset_id.',
    guidance: [
      'Use this for image or SVG bytes you already have locally.',
      'Attach the returned asset_id to nodes separately with apply_commands.',
      'This is write-capable and requires the editor measurement surface to be available.',
    ],
    readOnly: false,
    relatedResources: [
      AI_CANVAS_ACTIVE_PROJECT_URI,
      AI_CANVAS_PROJECT_URI_TEMPLATE,
    ],
    requiresMeasurementSurface: true,
    title: 'Create Asset From Bytes',
  },
  create_asset_from_url: {
    category: 'mutation',
    description:
      'Create a new project-local asset from a public image URL and return a usable asset_id.',
    guidance: [
      'Use this when the asset is reachable over http or https and should be imported into the project asset store.',
      'Attach the returned asset_id to nodes separately with apply_commands.',
      'This is write-capable and requires the editor measurement surface to be available.',
    ],
    readOnly: false,
    relatedResources: [
      AI_CANVAS_ACTIVE_PROJECT_URI,
      AI_CANVAS_PROJECT_URI_TEMPLATE,
    ],
    requiresMeasurementSurface: true,
    title: 'Create Asset From URL',
  },
} as const satisfies Record<string, ToolDocDefinition>;

type ToolName = keyof typeof toolDocs;

const toolNames = Object.keys(toolDocs) as ToolName[];

function isToolName(value: string): value is ToolName {
  return toolNames.includes(value as ToolName);
}

const serverInstructions = [
  'AI Canvas Desktop exposes a localhost MCP server over the same project runtime the editor uses.',
  `Start with ${DOCS_OVERVIEW_URI}, ${DOCS_QUICKSTART_URI}, or ${AI_CANVAS_PROJECTS_URI}.`,
  'Tools may omit project_id to target the active project session.',
  'Inspection remains available when the editor window is closed, but write-capable actions require the editor window to stay open so the renderer measurement surface is available.',
  'Create assets with create_asset_from_bytes or create_asset_from_url, then attach them with apply_commands.',
].join(' ');

function buildToolDocUri(toolName: ToolName): string {
  return `docs://tools/${toolName}`;
}

function buildProjectUri(projectId: string): string {
  return `ai-canvas://projects/${projectId}`;
}

function buildProjectScenesUri(projectId: string): string {
  return `ai-canvas://projects/${projectId}/scenes`;
}

function buildProjectDesignSystemUri(projectId: string): string {
  return `ai-canvas://projects/${projectId}/design-system`;
}

function buildProjectTreeUri(projectId: string): string {
  return `ai-canvas://projects/${projectId}/tree`;
}

function buildProjectNodeUri(projectId: string, nodeId: string): string {
  return `ai-canvas://projects/${projectId}/nodes/${nodeId}`;
}

function buildMarkdownList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function buildFixedResourceSummary(
  resources: readonly FixedResourceDefinition[],
) {
  return resources
    .map(
      (resource) =>
        `- \`${resource.uri}\` (${resource.mimeType})` +
        `\n  ${resource.description}`,
    )
    .join('\n');
}

function buildTemplateResourceSummary(
  resources: readonly TemplateResourceDefinition[],
) {
  return resources
    .map(
      (resource) =>
        `- \`${resource.uriTemplate}\` (${resource.mimeType})` +
        `\n  ${resource.description}`,
    )
    .join('\n');
}

function renderOverviewDoc(): string {
  return `# AI Canvas MCP Overview

AI Canvas Desktop exposes a localhost MCP server over the same shared project runtime the editor UI uses. The bridge does not scrape renderer state or maintain a separate document model.

## Runtime model

- Project targeting defaults to the active project session when a tool omits \`project_id\`.
- Each project contains exactly one document in v1, so project targeting also implies document targeting.
- Inspection remains available when the editor window is closed.
- Write-capable operations require the editor window to remain open so the renderer measurement surface can refresh \`computed_layout\` before persistence.

## Discovery path

- Read \`${DOCS_QUICKSTART_URI}\` for the recommended inspect-first workflow.
- Read \`${DOCS_RESOURCES_URI}\` for the fixed and templated URI spaces.
- Use \`tools/list\` for strict machine-readable tool contracts.
- Use \`resources/list\` and \`resources/templates/list\` for human-readable docs and live project resources.`;
}

function renderCapabilitiesDoc(): string {
  const toolSummary = toolNames
    .map((toolName) => {
      const tool = toolDocs[toolName];
      const access = tool.readOnly ? 'read-only' : 'write-capable';

      return (
        `- \`${toolName}\` — ${tool.title} (${access})` +
        `\n  Docs: \`${buildToolDocUri(toolName)}\``
      );
    })
    .join('\n');

  return `# AI Canvas MCP Capabilities

## Handshake layer

- The initialize response includes \`serverInfo\` plus operator-facing \`instructions\`.
- Those instructions point clients at the docs resources and explain the read-only versus write-capable runtime model.

## Capability layer

- \`tools/list\` exposes ${toolNames.length} tools with titles, descriptions, strict schemas, and read-only annotations on inspection tools.
- \`resources/list\` exposes fixed docs resources plus live AI Canvas resources.
- \`resources/templates/list\` exposes the dynamic docs and project URI spaces.
- \`prompts/list\` is intentionally absent in this pass because the runtime does not yet expose a reusable workflow that should be treated as a first-class prompt.

## Tool index

${toolSummary}`;
}

function renderToolsIndexDoc(): string {
  const toolSummary = toolNames
    .map((toolName) => {
      const tool = toolDocs[toolName];
      const access = tool.readOnly ? 'read-only' : 'write-capable';

      return (
        `- \`${toolName}\` — ${tool.title}` +
        `\n  ${tool.description}` +
        `\n  Access: ${access}` +
        `\n  Docs: \`${buildToolDocUri(toolName)}\``
      );
    })
    .join('\n');

  return `# AI Canvas MCP Tools

Use \`tools/list\` for the machine-readable input and output schemas. The entries below are the human-readable index.

${toolSummary}`;
}

function renderResourcesDoc(): string {
  return `# AI Canvas MCP Resources

## Fixed docs resources

${buildFixedResourceSummary(fixedDocsResources)}

## Fixed live resources

${buildFixedResourceSummary(fixedLiveResources)}

## Resource templates

${buildTemplateResourceSummary(templateResources)}

## Notes

- \`${AI_CANVAS_PROJECT_NODE_URI_TEMPLATE}\` is intentionally template-only and is not expanded into \`resources/list\`.
- Use \`resource_link\` items returned by tools as context-specific shortcuts to canonical resources.`;
}

function renderQuickstartDoc(): string {
  return `# AI Canvas MCP Quickstart

1. Start by reading \`${AI_CANVAS_PROJECTS_URI}\` or calling \`list_projects\` to discover project ids.
2. If you need to change the active project session, call \`open_project\`.
3. Call \`inspect_project\`, \`inspect_scenes\`, \`inspect_tree\`, or \`inspect_design_system\` before mutating the document.
4. When importing external images, call \`create_asset_from_bytes\` or \`create_asset_from_url\` first, then attach the returned \`asset_id\` with \`apply_commands\`.
5. Keep the editor window open for write-capable operations so the measurement surface is available.

## Recommended starting points

${buildMarkdownList([
  `Docs overview: \`${DOCS_OVERVIEW_URI}\``,
  `Project list: \`${AI_CANVAS_PROJECTS_URI}\``,
  `Tool catalog: \`${DOCS_TOOLS_URI}\``,
])}`;
}

function renderToolDoc(toolName: ToolName): string {
  const tool = toolDocs[toolName];
  const access = tool.readOnly ? 'read-only' : 'write-capable';
  const measurementSurface = tool.requiresMeasurementSurface
    ? 'required'
    : 'not required';

  return `# ${tool.title}

## Summary

- Tool name: \`${toolName}\`
- Access mode: ${access}
- Measurement surface: ${measurementSurface}
- Category: ${tool.category}

## Description

${tool.description}

## Related resources

${buildMarkdownList(tool.relatedResources.map((resource) => `\`${resource}\``))}

## Guidance

${buildMarkdownList(tool.guidance)}

## Machine-readable contract

Use \`tools/list\` to fetch the strict \`inputSchema\` and \`outputSchema\` for this tool.`;
}

function createProjectsResourceLink(): ToolResourceLink {
  return {
    description: 'List local AI Canvas projects.',
    mimeType: 'application/json',
    name: 'Projects',
    type: 'resource_link',
    uri: AI_CANVAS_PROJECTS_URI,
  };
}

function createActiveProjectResourceLink(): ToolResourceLink {
  return {
    description: 'Inspect the current active project session.',
    mimeType: 'application/json',
    name: 'Active Project',
    type: 'resource_link',
    uri: AI_CANVAS_ACTIVE_PROJECT_URI,
  };
}

function createProjectResourceLink(projectId: string): ToolResourceLink {
  return {
    description: `Inspect project ${projectId}.`,
    mimeType: 'application/json',
    name: `Project ${projectId}`,
    type: 'resource_link',
    uri: buildProjectUri(projectId),
  };
}

function createProjectScenesResourceLink(projectId: string): ToolResourceLink {
  return {
    description: `Inspect scenes for project ${projectId}.`,
    mimeType: 'application/json',
    name: `Project ${projectId} Scenes`,
    type: 'resource_link',
    uri: buildProjectScenesUri(projectId),
  };
}

function createProjectDesignSystemResourceLink(
  projectId: string,
): ToolResourceLink {
  return {
    description: `Inspect design-system state for project ${projectId}.`,
    mimeType: 'application/json',
    name: `Project ${projectId} Design System`,
    type: 'resource_link',
    uri: buildProjectDesignSystemUri(projectId),
  };
}

function createProjectTreeResourceLink(projectId: string): ToolResourceLink {
  return {
    description: `Inspect the normalized tree for project ${projectId}.`,
    mimeType: 'application/json',
    name: `Project ${projectId} Tree`,
    type: 'resource_link',
    uri: buildProjectTreeUri(projectId),
  };
}

function createProjectNodeResourceLink(
  projectId: string,
  nodeId: string,
): ToolResourceLink {
  return {
    description: `Inspect node ${nodeId} in project ${projectId}.`,
    mimeType: 'application/json',
    name: `Node ${nodeId}`,
    type: 'resource_link',
    uri: buildProjectNodeUri(projectId, nodeId),
  };
}

function toJsonCompatibleValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === undefined ? null : toJsonCompatibleValue(entry),
    );
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, toJsonCompatibleValue(entry)]],
      ),
    );
  }

  return null;
}

export class LocalMcpBridge {
  private boundPort: number | null = null;
  private readonly host: string;
  private readonly requestedPort: number;
  private readonly projectService: ProjectService;
  private readonly statusListeners = new Set<(status: McpStatus) => void>();
  private readonly sessions = new Map<string, SessionEntry>();
  private startError: McpStartError | null = null;

  private httpServer: HttpServer | null = null;

  constructor(options: LocalMcpBridgeOptions) {
    this.host = options.host;
    this.requestedPort = options.port;
    this.projectService = options.projectService;
  }

  subscribeToStatusChanges(listener: (status: McpStatus) => void): () => void {
    this.statusListeners.add(listener);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (this.httpServer) {
      return;
    }

    this.startError = null;
    this.httpServer = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'Unknown MCP error',
            }),
          );
        }
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        this.httpServer?.once('error', reject);
        this.httpServer?.listen(this.requestedPort, this.host, () => {
          const address = this.httpServer?.address();

          if (!address || typeof address === 'string') {
            reject(new Error('MCP bridge did not bind to a TCP port'));
            return;
          }

          this.boundPort = (address as AddressInfo).port;
          this.emitStatusChanged();
          resolve();
        });
      });
    } catch (error) {
      this.httpServer?.close();
      this.httpServer = null;
      this.boundPort = null;
      this.startError = this.toStartError(error);
      this.emitStatusChanged();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const closePromises = [...this.sessions.values()].map(async (session) => {
      await session.server.close();
      await session.transport.close();
    });

    await Promise.all(closePromises);
    this.sessions.clear();

    if (!this.httpServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.httpServer?.close((error) => (error ? reject(error) : resolve()));
    });

    this.httpServer = null;
    this.boundPort = null;
    this.emitStatusChanged();
  }

  getStatus(): McpStatus {
    const port = this.boundPort ?? this.requestedPort;

    return {
      connectedSessions: this.sessions.size,
      enabled: this.boundPort !== null,
      errorCode: this.startError?.code ?? null,
      errorMessage: this.startError?.message ?? null,
      endpoint: `http://${this.host}:${port}/mcp`,
      host: this.host,
      port,
      state: this.startError ? 'error' : 'running',
    };
  }

  private toStartError(error: unknown): McpStartError {
    if (isPortInUseError(error)) {
      return {
        code: 'port_in_use',
        message: `The local MCP bridge requires ${this.host}:${this.requestedPort}, but that port is already in use.`,
      };
    }

    return {
      code: 'startup_failed',
      message:
        error instanceof Error
          ? error.message
          : 'The local MCP bridge failed to start.',
    };
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!req.url) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(this.getStatus()));
      return;
    }

    if (!req.url.startsWith('/mcp')) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.method === 'POST') {
      const body = await this.readJsonBody(req);
      await this.handlePost(req, res, body);
      return;
    }

    if (req.method === 'GET') {
      await this.handleGet(req, res);
      return;
    }

    if (req.method === 'DELETE') {
      await this.handleDelete(req, res);
      return;
    }

    res.writeHead(405);
    res.end();
  }

  private async handlePost(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void> {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId =
      typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;

    if (sessionId && this.sessions.has(sessionId)) {
      await this.sessions
        .get(sessionId)
        ?.transport.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: missing valid MCP session',
          },
          id: null,
        }),
      );
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (initializedSessionId) => {
        const session = this.sessions.get(initializedSessionId);
        if (!session) {
          this.sessions.set(initializedSessionId, {
            server,
            transport,
          });
          this.emitStatusChanged();
        }
      },
    });
    const server = this.createServer();

    transport.onclose = () => {
      const closedSessionId = transport.sessionId;

      if (closedSessionId) {
        this.sessions.delete(closedSessionId);
        this.emitStatusChanged();
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  private async handleGet(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId =
      typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('Invalid or missing MCP session ID');
      return;
    }

    await this.sessions.get(sessionId)?.transport.handleRequest(req, res);
  }

  private async handleDelete(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId =
      typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('Invalid or missing MCP session ID');
      return;
    }

    await this.sessions.get(sessionId)?.transport.handleRequest(req, res);
  }

  private getToolConfig(
    toolName: ToolName,
    inputSchema: z.ZodRawShape | z.ZodTypeAny,
    outputSchema: z.ZodRawShape | z.ZodTypeAny,
  ) {
    const tool = toolDocs[toolName];

    return {
      ...(tool.readOnly
        ? { annotations: { readOnlyHint: true as const } }
        : {}),
      description: tool.description,
      inputSchema,
      outputSchema,
      title: tool.title,
    };
  }

  private getTemplateResourceDefinition(
    uriTemplate: string,
  ): TemplateResourceDefinition {
    const definition = templateResources.find(
      (resource) => resource.uriTemplate === uriTemplate,
    );

    if (!definition) {
      throw new Error(
        `Missing template resource definition for ${uriTemplate}`,
      );
    }

    return definition;
  }

  private mapListProjects(projects: ProjectSummary[]) {
    return {
      ok: true as const,
      projects,
    };
  }

  private mapCreateProject(project: ProjectSummary) {
    return {
      ok: true as const,
      project,
    };
  }

  private mapOpenProject(data: OpenProjectOutput) {
    return {
      ok: true as const,
      project: data.project,
      revision: data.revision,
    };
  }

  private mapInspectProject(data: InspectProjectOutput) {
    return {
      document: data.document,
      is_active: data.is_active,
      ok: true as const,
      project: data.project,
      revision: data.revision,
    };
  }

  private mapInspectTree(data: InspectTreeOutput) {
    return {
      document_id: data.document_id,
      ok: true as const,
      project_id: data.project_id,
      revision: data.revision,
      root_node_id: data.root_node_id,
      tree: data.tree,
    };
  }

  private mapInspectNode(data: InspectNodeOutput) {
    return {
      document_id: data.document_id,
      node: data.node,
      ok: true as const,
      project_id: data.project_id,
      revision: data.revision,
    };
  }

  private mapInspectScenes(data: InspectScenesOutput) {
    return {
      document_id: data.document_id,
      ok: true as const,
      project_id: data.project_id,
      revision: data.revision,
      scenes: data.scenes,
    };
  }

  private mapInspectDesignSystem(data: InspectDesignSystemOutput) {
    return {
      design_system: data.design_system,
      document_id: data.document_id,
      ok: true as const,
      project_id: data.project_id,
      revision: data.revision,
    };
  }

  private mapApplyCommands(data: CommandResult) {
    return {
      document_id: data.document_id,
      ...(data.effects === undefined ? {} : { effects: data.effects }),
      layout_refresh: data.layout_refresh,
      ok: true as const,
      revision: data.revision,
    };
  }

  private mapCreateAsset(data: CreateAssetToolOutput) {
    return {
      asset_id: data.asset_id,
      content_hash: data.content_hash,
      kind: data.kind,
      mime_type: data.mime_type,
      ok: true as const,
      revision: data.revision,
      size_bytes: data.size_bytes,
      source: data.source,
    };
  }

  private readDocumentationResource(uri: string): string {
    switch (uri) {
      case DOCS_OVERVIEW_URI:
        return renderOverviewDoc();
      case DOCS_CAPABILITIES_URI:
        return renderCapabilitiesDoc();
      case DOCS_TOOLS_URI:
        return renderToolsIndexDoc();
      case DOCS_RESOURCES_URI:
        return renderResourcesDoc();
      case DOCS_QUICKSTART_URI:
        return renderQuickstartDoc();
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Documentation resource ${uri} not found`,
        );
    }
  }

  private createTextResource(uri: string, text: string, mimeType: string) {
    return {
      contents: [
        {
          mimeType,
          text,
          uri,
        },
      ],
    };
  }

  private createJsonResource<TOutput>(
    uri: string,
    schema: z.ZodType<TOutput>,
    payload: TOutput,
  ) {
    const structuredContent = schema.parse(
      toJsonCompatibleValue(payload) as unknown as TOutput,
    );

    return {
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify(structuredContent, null, 2),
          uri,
        },
      ],
    };
  }

  private toMcpError(error: z.infer<typeof appErrorSchema>) {
    switch (error.code) {
      case 'internal_error':
      case 'not_implemented':
        return new McpError(ErrorCode.InternalError, error.message);
      default:
        return new McpError(ErrorCode.InvalidParams, error.message);
    }
  }

  private unwrapAppResult<T>(result: AppResult<T>): T {
    if (!result.ok) {
      throw this.toMcpError(result.error);
    }

    return result.data;
  }

  private getRequiredTemplateValue(
    variables: Record<string, string | string[] | undefined>,
    key: string,
  ): string {
    const value = variables[key];

    if (Array.isArray(value)) {
      if (value.length > 0 && value[0]) {
        return value[0];
      }

      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing resource template variable ${key}`,
      );
    }

    if (!value) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing resource template variable ${key}`,
      );
    }

    return value;
  }

  private async listProjectTemplateResources(
    mapProject: (project: ProjectSummary) => ListedResource,
  ) {
    const projects = this.unwrapAppResult(
      await this.projectService.listProjects(),
    );

    return {
      resources: projects.map(mapProject),
    };
  }

  private registerDocumentationResources(server: McpServer): void {
    for (const resource of fixedDocsResources) {
      server.registerResource(
        resource.name,
        resource.uri,
        {
          description: resource.description,
          mimeType: resource.mimeType,
          title: resource.title,
        },
        async () =>
          this.createTextResource(
            resource.uri,
            this.readDocumentationResource(resource.uri),
            resource.mimeType,
          ),
      );
    }

    const toolDocsTemplate = this.getTemplateResourceDefinition(
      DOCS_TOOL_URI_TEMPLATE,
    );

    server.registerResource(
      toolDocsTemplate.name,
      new ResourceTemplate(toolDocsTemplate.uriTemplate, {
        list: async () => ({
          resources: toolNames.map((toolName) => ({
            description: toolDocs[toolName].description,
            mimeType: toolDocsTemplate.mimeType,
            name: toolName,
            title: `Tool: ${toolDocs[toolName].title}`,
            uri: buildToolDocUri(toolName),
          })),
        }),
      }),
      {
        description: toolDocsTemplate.description,
        mimeType: toolDocsTemplate.mimeType,
        title: toolDocsTemplate.title,
      },
      async (_uri, variables) => {
        const toolName = this.getRequiredTemplateValue(variables, 'tool_name');

        if (!isToolName(toolName)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Tool ${toolName} not found`,
          );
        }

        return this.createTextResource(
          buildToolDocUri(toolName),
          renderToolDoc(toolName),
          toolDocsTemplate.mimeType,
        );
      },
    );
  }

  private registerProjectTemplateResource<TOutput>(
    server: McpServer,
    definition: TemplateResourceDefinition,
    buildUri: (projectId: string) => string,
    schema: z.ZodType<TOutput>,
    readProject: (projectId: string) => Promise<TOutput>,
    mapProject: (project: ProjectSummary) => ListedResource,
  ): void {
    server.registerResource(
      definition.name,
      new ResourceTemplate(definition.uriTemplate, {
        list: async () => this.listProjectTemplateResources(mapProject),
      }),
      {
        description: definition.description,
        mimeType: definition.mimeType,
        title: definition.title,
      },
      async (_uri, variables) => {
        const projectId = this.getRequiredTemplateValue(
          variables,
          'project_id',
        );

        return this.createJsonResource(
          buildUri(projectId),
          schema,
          await readProject(projectId),
        );
      },
    );
  }

  private registerProjectResources(server: McpServer): void {
    const projectsResource = fixedLiveResources.find(
      (resource) => resource.uri === AI_CANVAS_PROJECTS_URI,
    );

    if (!projectsResource) {
      throw new Error(
        `Missing fixed resource definition for ${AI_CANVAS_PROJECTS_URI}`,
      );
    }

    server.registerResource(
      projectsResource.name,
      projectsResource.uri,
      {
        description: projectsResource.description,
        mimeType: projectsResource.mimeType,
        title: projectsResource.title,
      },
      async () =>
        this.createJsonResource(
          AI_CANVAS_PROJECTS_URI,
          listProjectsOutputSchema,
          this.mapListProjects(
            this.unwrapAppResult(await this.projectService.listProjects()),
          ),
        ),
    );

    const activeProjectResource = fixedLiveResources.find(
      (resource) => resource.uri === AI_CANVAS_ACTIVE_PROJECT_URI,
    );

    if (!activeProjectResource) {
      throw new Error(
        `Missing fixed resource definition for ${AI_CANVAS_ACTIVE_PROJECT_URI}`,
      );
    }

    server.registerResource(
      activeProjectResource.name,
      activeProjectResource.uri,
      {
        description: activeProjectResource.description,
        mimeType: activeProjectResource.mimeType,
        title: activeProjectResource.title,
      },
      async () =>
        this.createJsonResource(
          AI_CANVAS_ACTIVE_PROJECT_URI,
          inspectProjectOutputSchema,
          this.mapInspectProject(
            this.unwrapAppResult(await this.projectService.inspectProject()),
          ),
        ),
    );

    this.registerProjectTemplateResource(
      server,
      this.getTemplateResourceDefinition(AI_CANVAS_PROJECT_URI_TEMPLATE),
      buildProjectUri,
      inspectProjectOutputSchema,
      async (projectId) =>
        this.mapInspectProject(
          this.unwrapAppResult(
            await this.projectService.inspectProject(projectId),
          ),
        ),
      (project) => ({
        description: `Inspect project ${project.name}.`,
        mimeType: 'application/json',
        name: project.id,
        title: `Project: ${project.name}`,
        uri: buildProjectUri(project.id),
      }),
    );

    this.registerProjectTemplateResource(
      server,
      this.getTemplateResourceDefinition(AI_CANVAS_PROJECT_SCENES_URI_TEMPLATE),
      buildProjectScenesUri,
      inspectScenesOutputSchema,
      async (projectId) =>
        this.mapInspectScenes(
          this.unwrapAppResult(
            await this.projectService.inspectScenes(projectId),
          ),
        ),
      (project) => ({
        description: `Inspect scenes for project ${project.name}.`,
        mimeType: 'application/json',
        name: `${project.id}-scenes`,
        title: `Project Scenes: ${project.name}`,
        uri: buildProjectScenesUri(project.id),
      }),
    );

    this.registerProjectTemplateResource(
      server,
      this.getTemplateResourceDefinition(
        AI_CANVAS_PROJECT_DESIGN_SYSTEM_URI_TEMPLATE,
      ),
      buildProjectDesignSystemUri,
      inspectDesignSystemOutputSchema,
      async (projectId) =>
        this.mapInspectDesignSystem(
          this.unwrapAppResult(
            await this.projectService.inspectDesignSystem(projectId),
          ),
        ),
      (project) => ({
        description: `Inspect design-system state for project ${project.name}.`,
        mimeType: 'application/json',
        name: `${project.id}-design-system`,
        title: `Project Design System: ${project.name}`,
        uri: buildProjectDesignSystemUri(project.id),
      }),
    );

    this.registerProjectTemplateResource(
      server,
      this.getTemplateResourceDefinition(AI_CANVAS_PROJECT_TREE_URI_TEMPLATE),
      buildProjectTreeUri,
      inspectTreeOutputSchema,
      async (projectId) =>
        this.mapInspectTree(
          this.unwrapAppResult(
            await this.projectService.inspectTree({ projectId }),
          ),
        ),
      (project) => ({
        description: `Inspect the normalized tree for project ${project.name}.`,
        mimeType: 'application/json',
        name: `${project.id}-tree`,
        title: `Project Tree: ${project.name}`,
        uri: buildProjectTreeUri(project.id),
      }),
    );

    const nodeTemplate = this.getTemplateResourceDefinition(
      AI_CANVAS_PROJECT_NODE_URI_TEMPLATE,
    );

    server.registerResource(
      nodeTemplate.name,
      new ResourceTemplate(nodeTemplate.uriTemplate, {
        list: undefined,
      }),
      {
        description: nodeTemplate.description,
        mimeType: nodeTemplate.mimeType,
        title: nodeTemplate.title,
      },
      async (_uri, variables) => {
        const projectId = this.getRequiredTemplateValue(
          variables,
          'project_id',
        );
        const nodeId = this.getRequiredTemplateValue(variables, 'node_id');

        return this.createJsonResource(
          buildProjectNodeUri(projectId, nodeId),
          inspectNodeOutputSchema,
          this.mapInspectNode(
            this.unwrapAppResult(
              await this.projectService.inspectNode(projectId, nodeId),
            ),
          ),
        );
      },
    );
  }

  private createServer(): McpServer {
    const server = new McpServer(
      {
        name: 'ai-canvas-desktop',
        version: '0.0.0',
      },
      {
        instructions: serverInstructions,
      },
    );

    this.registerDocumentationResources(server);
    this.registerProjectResources(server);

    server.registerTool(
      'list_projects',
      this.getToolConfig('list_projects', {}, listProjectsOutputSchema),
      async () =>
        this.toToolResponse(
          await this.projectService.listProjects(),
          listProjectsOutputSchema,
          (projects) => this.mapListProjects(projects),
          () => [createProjectsResourceLink()],
        ),
    );

    server.registerTool(
      'create_project',
      this.getToolConfig(
        'create_project',
        createProjectInputSchema,
        createProjectOutputSchema,
      ),
      async (args: unknown) => {
        const input = createProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.createProject(input.name),
          createProjectOutputSchema,
          (project) => this.mapCreateProject(project),
          (payload) => [createProjectResourceLink(payload.project.id)],
        );
      },
    );

    server.registerTool(
      'open_project',
      this.getToolConfig(
        'open_project',
        openProjectInputSchema,
        openProjectOutputSchema,
      ),
      async (args: unknown) => {
        const input = openProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.openProject(input.project_id),
          openProjectOutputSchema,
          (data) => this.mapOpenProject(data),
          (payload) => [createProjectResourceLink(payload.project.id)],
        );
      },
    );

    server.registerTool(
      'inspect_project',
      this.getToolConfig(
        'inspect_project',
        inspectProjectInputSchema,
        inspectProjectOutputSchema,
      ),
      async (args: unknown) => {
        const input = inspectProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectProject(input.project_id),
          inspectProjectOutputSchema,
          (data) => this.mapInspectProject(data),
          (payload) => [createProjectResourceLink(payload.project.id)],
        );
      },
    );

    server.registerTool(
      'inspect_tree',
      this.getToolConfig(
        'inspect_tree',
        inspectTreeInputSchema,
        inspectTreeOutputSchema,
      ),
      async (args: unknown) => {
        const input = inspectTreeInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectTree({
            projectId: input.project_id,
            rootNodeId: input.root_node_id,
          }),
          inspectTreeOutputSchema,
          (data) => this.mapInspectTree(data),
          (payload) => [createProjectTreeResourceLink(payload.project_id)],
        );
      },
    );

    server.registerTool(
      'inspect_node',
      this.getToolConfig(
        'inspect_node',
        inspectNodeInputSchema,
        inspectNodeOutputSchema,
      ),
      async (args: unknown) => {
        const input = inspectNodeInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectNode(
            input.project_id,
            input.node_id,
          ),
          inspectNodeOutputSchema,
          (data) => this.mapInspectNode(data),
          (payload) => [
            createProjectNodeResourceLink(payload.project_id, input.node_id),
          ],
        );
      },
    );

    server.registerTool(
      'inspect_scenes',
      this.getToolConfig(
        'inspect_scenes',
        inspectProjectInputSchema,
        inspectScenesOutputSchema,
      ),
      async (args: unknown) => {
        const input = inspectProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectScenes(input.project_id),
          inspectScenesOutputSchema,
          (data) => this.mapInspectScenes(data),
          (payload) => [createProjectScenesResourceLink(payload.project_id)],
        );
      },
    );

    server.registerTool(
      'inspect_design_system',
      this.getToolConfig(
        'inspect_design_system',
        inspectProjectInputSchema,
        inspectDesignSystemOutputSchema,
      ),
      async (args: unknown) => {
        const input = inspectProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectDesignSystem(input.project_id),
          inspectDesignSystemOutputSchema,
          (data) => this.mapInspectDesignSystem(data),
          (payload) => [
            createProjectDesignSystemResourceLink(payload.project_id),
          ],
        );
      },
    );

    server.registerTool(
      'apply_commands',
      this.getToolConfig(
        'apply_commands',
        applyCommandsToolInputSchema,
        applyCommandsOutputSchema,
      ),
      async (args: unknown) => {
        const input = applyCommandsToolInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.applyCommands({
            base_revision: input.base_revision,
            commands: input.commands,
            project_id: input.project_id,
          }),
          applyCommandsOutputSchema,
          (data) => this.mapApplyCommands(data),
          () =>
            input.project_id
              ? [createProjectResourceLink(input.project_id)]
              : [createActiveProjectResourceLink()],
        );
      },
    );

    server.registerTool(
      'create_asset_from_bytes',
      this.getToolConfig(
        'create_asset_from_bytes',
        createAssetFromBytesInputSchema,
        createAssetOutputSchema,
      ),
      async (args: unknown) => {
        const input = createAssetFromBytesInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.createAssetFromBytes(input),
          createAssetOutputSchema,
          (data) => this.mapCreateAsset(data),
          () =>
            input.project_id
              ? [createProjectResourceLink(input.project_id)]
              : [createActiveProjectResourceLink()],
        );
      },
    );

    server.registerTool(
      'create_asset_from_url',
      this.getToolConfig(
        'create_asset_from_url',
        createAssetFromUrlInputSchema,
        createAssetOutputSchema,
      ),
      async (args: unknown) => {
        const input = createAssetFromUrlInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.createAssetFromUrl(input),
          createAssetOutputSchema,
          (data) => this.mapCreateAsset(data),
          () =>
            input.project_id
              ? [createProjectResourceLink(input.project_id)]
              : [createActiveProjectResourceLink()],
        );
      },
    );

    return server;
  }

  private toStructuredResult<TOutput>(
    schema: z.ZodType<TOutput>,
    payload: TOutput,
    resourceLinks: ToolResourceLink[] = [],
  ) {
    const structuredContent = schema.parse(
      toJsonCompatibleValue(payload) as unknown as TOutput,
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(structuredContent, null, 2),
        },
        ...resourceLinks,
      ],
      structuredContent,
    };
  }

  private toToolError(error: z.infer<typeof appErrorSchema>) {
    const structuredContent = toolErrorSchema.parse({
      error,
      ok: false,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
      isError: true as const,
    };
  }

  private toToolResponse<TInput, TOutput>(
    result: AppResult<TInput>,
    schema: z.ZodType<TOutput>,
    mapSuccess: (data: TInput) => TOutput,
    mapResourceLinks?: (payload: TOutput) => ToolResourceLink[],
  ) {
    if (!result.ok) {
      return this.toToolError(result.error);
    }

    const payload = mapSuccess(result.data);

    return this.toStructuredResult(
      schema,
      payload,
      mapResourceLinks?.(payload) ?? [],
    );
  }

  private async readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
      return undefined;
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  private emitStatusChanged(): void {
    const status = this.getStatus();

    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

function isPortInUseError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
  );
}
