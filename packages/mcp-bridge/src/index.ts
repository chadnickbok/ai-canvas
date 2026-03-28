import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";

import {
  createProjectInputSchema,
  projectSummarySchema,
  type McpStatus,
  type ProjectSummary
} from "@ai-canvas/ipc-contract";

export type ProjectService = {
  createProject: (name: string) => Promise<ProjectSummary> | ProjectSummary;
  listProjects: () => Promise<ProjectSummary[]> | ProjectSummary[];
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
  code: "port_in_use" | "startup_failed";
  message: string;
};

const listProjectsOutputSchema = z.object({
  projects: z.array(projectSummarySchema)
});

const createProjectOutputSchema = z.object({
  project: projectSummarySchema
});

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
          res.writeHead(500, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown MCP error"
            })
          );
        }
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        this.httpServer?.once("error", reject);
        this.httpServer?.listen(this.requestedPort, this.host, () => {
          const address = this.httpServer?.address();

          if (!address || typeof address === "string") {
            reject(new Error("MCP bridge did not bind to a TCP port"));
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
      state: this.startError ? "error" : "running"
    };
  }

  private toStartError(error: unknown): McpStartError {
    if (isPortInUseError(error)) {
      return {
        code: "port_in_use",
        message: `The local MCP bridge requires ${this.host}:${this.requestedPort}, but that port is already in use.`
      };
    }

    return {
      code: "startup_failed",
      message: error instanceof Error ? error.message : "The local MCP bridge failed to start."
    };
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(this.getStatus()));
      return;
    }

    if (!req.url.startsWith("/mcp")) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.method === "POST") {
      const body = await this.readJsonBody(req);
      await this.handlePost(req, res, body);
      return;
    }

    if (req.method === "GET") {
      await this.handleGet(req, res);
      return;
    }

    if (req.method === "DELETE") {
      await this.handleDelete(req, res);
      return;
    }

    res.writeHead(405);
    res.end();
  }

  private async handlePost(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown
  ): Promise<void> {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

    if (sessionId && this.sessions.has(sessionId)) {
      await this.sessions.get(sessionId)?.transport.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: missing valid MCP session"
          },
          id: null
        })
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
            transport
          });
          this.emitStatusChanged();
        }
      }
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

  private async handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Invalid or missing MCP session ID");
      return;
    }

    await this.sessions.get(sessionId)?.transport.handleRequest(req, res);
  }

  private async handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Invalid or missing MCP session ID");
      return;
    }

    await this.sessions.get(sessionId)?.transport.handleRequest(req, res);
  }

  private createServer(): McpServer {
    const server = new McpServer({
      name: "ai-canvas-desktop",
      version: "0.0.0"
    });

    server.registerTool(
      "list_projects",
      {
        description: "List local AI Canvas projects from the shared desktop runtime.",
        inputSchema: {},
        outputSchema: listProjectsOutputSchema
      },
      async () => {
        const projects = await this.projectService.listProjects();
        const structuredContent = listProjectsOutputSchema.parse({ projects });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(structuredContent, null, 2)
            }
          ],
          structuredContent
        };
      }
    );

    server.registerTool(
      "create_project",
      {
        description: "Create a new local AI Canvas project and make it the active desktop session.",
        inputSchema: createProjectInputSchema,
        outputSchema: createProjectOutputSchema
      },
      async (args) => {
        const input = createProjectInputSchema.parse(args);
        const project = await this.projectService.createProject(input.name);
        const structuredContent = createProjectOutputSchema.parse({ project });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(structuredContent, null, 2)
            }
          ],
          structuredContent
        };
      }
    );

    return server;
  }

  private async readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
      return undefined;
    }

    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  private emitStatusChanged(): void {
    const status = this.getStatus();

    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

function isPortInUseError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}
