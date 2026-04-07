import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
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

export type ProjectService = {
  applyCommands: (
    input: ApplyCommandsToolInput,
  ) => Promise<AppResult<CommandResult>> | AppResult<CommandResult>;
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

  private createServer(): McpServer {
    const server = new McpServer({
      name: 'ai-canvas-desktop',
      version: '0.0.0',
    });

    server.registerTool(
      'list_projects',
      {
        description:
          'List local AI Canvas projects from the shared desktop runtime.',
        inputSchema: {},
        outputSchema: listProjectsOutputSchema,
      },
      async () =>
        this.toToolResponse(
          await this.projectService.listProjects(),
          listProjectsOutputSchema,
          (projects) => ({
            ok: true as const,
            projects,
          }),
        ),
    );

    server.registerTool(
      'create_project',
      {
        description:
          'Create a new local AI Canvas project and make it the active desktop session.',
        inputSchema: createProjectInputSchema,
        outputSchema: createProjectOutputSchema,
      },
      async (args) => {
        const input = createProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.createProject(input.name),
          createProjectOutputSchema,
          (project) => ({
            ok: true as const,
            project,
          }),
        );
      },
    );

    server.registerTool(
      'open_project',
      {
        description:
          'Open a local AI Canvas project and make it the active desktop session.',
        inputSchema: openProjectInputSchema,
        outputSchema: openProjectOutputSchema,
      },
      async (args) => {
        const input = openProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.openProject(input.project_id),
          openProjectOutputSchema,
          (data) => ({
            ok: true as const,
            project: data.project,
            revision: data.revision,
          }),
        );
      },
    );

    server.registerTool(
      'inspect_project',
      {
        description:
          'Inspect a project summary and the normalized document overview for the active or targeted project.',
        inputSchema: inspectProjectInputSchema,
        outputSchema: inspectProjectOutputSchema,
      },
      async (args) => {
        const input = inspectProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectProject(input.project_id),
          inspectProjectOutputSchema,
          (data) => ({
            document: data.document,
            is_active: data.is_active,
            ok: true as const,
            project: data.project,
            revision: data.revision,
          }),
        );
      },
    );

    server.registerTool(
      'inspect_tree',
      {
        description:
          'Inspect the normalized node tree for the active or targeted project.',
        inputSchema: inspectTreeInputSchema,
        outputSchema: inspectTreeOutputSchema,
      },
      async (args) => {
        const input = inspectTreeInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectTree({
            projectId: input.project_id,
            rootNodeId: input.root_node_id,
          }),
          inspectTreeOutputSchema,
          (data) => ({
            document_id: data.document_id,
            ok: true as const,
            project_id: data.project_id,
            revision: data.revision,
            root_node_id: data.root_node_id,
            tree: data.tree,
          }),
        );
      },
    );

    server.registerTool(
      'inspect_node',
      {
        description:
          'Inspect a normalized node from the active or targeted project.',
        inputSchema: inspectNodeInputSchema,
        outputSchema: inspectNodeOutputSchema,
      },
      async (args) => {
        const input = inspectNodeInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectNode(
            input.project_id,
            input.node_id,
          ),
          inspectNodeOutputSchema,
          (data) => ({
            document_id: data.document_id,
            node: data.node,
            ok: true as const,
            project_id: data.project_id,
            revision: data.revision,
          }),
        );
      },
    );

    server.registerTool(
      'inspect_scenes',
      {
        description:
          'Inspect scenes and backing frames from the active or targeted project.',
        inputSchema: inspectProjectInputSchema,
        outputSchema: inspectScenesOutputSchema,
      },
      async (args) => {
        const input = inspectProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectScenes(input.project_id),
          inspectScenesOutputSchema,
          (data) => ({
            document_id: data.document_id,
            ok: true as const,
            project_id: data.project_id,
            revision: data.revision,
            scenes: data.scenes,
          }),
        );
      },
    );

    server.registerTool(
      'inspect_design_system',
      {
        description:
          'Inspect canvas authoring, variables, and styles from the active or targeted project.',
        inputSchema: inspectProjectInputSchema,
        outputSchema: inspectDesignSystemOutputSchema,
      },
      async (args) => {
        const input = inspectProjectInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.inspectDesignSystem(input.project_id),
          inspectDesignSystemOutputSchema,
          (data) => ({
            design_system: data.design_system,
            document_id: data.document_id,
            ok: true as const,
            project_id: data.project_id,
            revision: data.revision,
          }),
        );
      },
    );

    server.registerTool(
      'apply_commands',
      {
        description:
          'Apply a validated command batch to the active project session. Mutations require a live measurement surface and refresh computed_layout before persistence.',
        inputSchema: applyCommandsToolInputSchema,
        outputSchema: applyCommandsOutputSchema,
      },
      async (args) => {
        const input = applyCommandsToolInputSchema.parse(args);

        return this.toToolResponse(
          await this.projectService.applyCommands({
            base_revision: input.base_revision,
            commands: input.commands,
            project_id: input.project_id,
          }),
          applyCommandsOutputSchema,
          (data) => ({
            document_id: data.document_id,
            ...(data.effects === undefined ? {} : { effects: data.effects }),
            layout_refresh: data.layout_refresh,
            ok: true as const,
            revision: data.revision,
          }),
        );
      },
    );

    return server;
  }

  private toStructuredResult<TOutput>(
    schema: z.ZodType<TOutput>,
    payload: TOutput,
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
  ) {
    if (!result.ok) {
      return this.toToolError(result.error);
    }

    return this.toStructuredResult(schema, mapSuccess(result.data));
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
