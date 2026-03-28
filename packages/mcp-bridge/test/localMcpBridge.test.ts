import { afterEach, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { ProjectSummary } from "@ai-canvas/ipc-contract";

import { LocalMcpBridge } from "../src";

const activeBridges: LocalMcpBridge[] = [];

afterEach(async () => {
  await Promise.all(activeBridges.splice(0).map((bridge) => bridge.stop()));
});

describe("LocalMcpBridge", () => {
  it("initializes and serves list_projects over streamable HTTP", async () => {
    const projects: ProjectSummary[] = [
      {
        createdAt: "2026-03-25T00:00:00.000Z",
        documentId: "doc_123",
        id: "project_123",
        lastOpenedAt: "2026-03-25T00:00:00.000Z",
        name: "Fixture Project",
        updatedAt: "2026-03-25T00:00:00.000Z"
      }
    ];

    const bridge = new LocalMcpBridge({
      host: "127.0.0.1",
      port: 4318,
      projectService: {
        createProject: async (name) => ({
          createdAt: "2026-03-25T00:00:00.000Z",
          documentId: "doc_created",
          id: "project_created",
          lastOpenedAt: "2026-03-25T00:00:00.000Z",
          name,
          updatedAt: "2026-03-25T00:00:00.000Z"
        }),
        listProjects: async () => projects
      }
    });
    activeBridges.push(bridge);

    await bridge.start();
    expect(bridge.getStatus()).toMatchObject({
      enabled: true,
      errorCode: null,
      errorMessage: null,
      port: 4318,
      state: "running"
    });

    const client = new Client({
      name: "ai-canvas-test-client",
      version: "0.0.0"
    });
    const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:4318/mcp"));

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("list_projects");
    expect(tools.tools.map((tool) => tool.name)).toContain("create_project");

    const result = await client.callTool({
      arguments: {},
      name: "list_projects"
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ projects });

    await transport.close();
    await client.close();
  });

  it("creates a project over MCP and returns it from a follow-up list_projects call", async () => {
    const projects: ProjectSummary[] = [];

    const bridge = new LocalMcpBridge({
      host: "127.0.0.1",
      port: 4321,
      projectService: {
        createProject: async (name) => {
          const project: ProjectSummary = {
            createdAt: "2026-03-26T00:00:00.000Z",
            documentId: "doc_456",
            id: "project_456",
            lastOpenedAt: "2026-03-26T00:00:00.000Z",
            name,
            updatedAt: "2026-03-26T00:00:00.000Z"
          };

          projects.unshift(project);
          return project;
        },
        listProjects: async () => projects
      }
    });
    activeBridges.push(bridge);

    await bridge.start();

    const client = new Client({
      name: "ai-canvas-test-client",
      version: "0.0.0"
    });
    const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:4321/mcp"));

    await client.connect(transport);

    const createResult = await client.callTool({
      arguments: {
        name: "New Project Via MCP"
      },
      name: "create_project"
    });

    expect(createResult.isError).not.toBe(true);
    expect(createResult.structuredContent).toEqual({
      project: {
        createdAt: "2026-03-26T00:00:00.000Z",
        documentId: "doc_456",
        id: "project_456",
        lastOpenedAt: "2026-03-26T00:00:00.000Z",
        name: "New Project Via MCP",
        updatedAt: "2026-03-26T00:00:00.000Z"
      }
    });

    const listResult = await client.callTool({
      arguments: {},
      name: "list_projects"
    });

    expect(listResult.isError).not.toBe(true);
    expect(listResult.structuredContent).toEqual({
      projects: [
        {
          createdAt: "2026-03-26T00:00:00.000Z",
          documentId: "doc_456",
          id: "project_456",
          lastOpenedAt: "2026-03-26T00:00:00.000Z",
          name: "New Project Via MCP",
          updatedAt: "2026-03-26T00:00:00.000Z"
        }
      ]
    });

    await transport.close();
    await client.close();
  });

  it("rejects MCP requests sent to the bare root URL", async () => {
    const bridge = new LocalMcpBridge({
      host: "127.0.0.1",
      port: 4320,
      projectService: {
        createProject: async (name) => ({
          createdAt: "2026-03-25T00:00:00.000Z",
          documentId: "doc_created",
          id: "project_created",
          lastOpenedAt: "2026-03-25T00:00:00.000Z",
          name,
          updatedAt: "2026-03-25T00:00:00.000Z"
        }),
        listProjects: async () => []
      }
    });
    activeBridges.push(bridge);

    await bridge.start();

    const response = await fetch("http://127.0.0.1:4320/", {
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });

    expect(response.status).toBe(404);
  });

  it("fails on a fixed-port conflict without reporting itself as enabled", async () => {
    const primaryBridge = new LocalMcpBridge({
      host: "127.0.0.1",
      port: 4319,
      projectService: {
        createProject: async (name) => ({
          createdAt: "2026-03-25T00:00:00.000Z",
          documentId: "doc_created",
          id: "project_created",
          lastOpenedAt: "2026-03-25T00:00:00.000Z",
          name,
          updatedAt: "2026-03-25T00:00:00.000Z"
        }),
        listProjects: async () => []
      }
    });
    const conflictingBridge = new LocalMcpBridge({
      host: "127.0.0.1",
      port: 4319,
      projectService: {
        createProject: async (name) => ({
          createdAt: "2026-03-25T00:00:00.000Z",
          documentId: "doc_created",
          id: "project_created",
          lastOpenedAt: "2026-03-25T00:00:00.000Z",
          name,
          updatedAt: "2026-03-25T00:00:00.000Z"
        }),
        listProjects: async () => []
      }
    });

    activeBridges.push(primaryBridge, conflictingBridge);

    await primaryBridge.start();
    await expect(conflictingBridge.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(conflictingBridge.getStatus()).toMatchObject({
      enabled: false,
      errorCode: "port_in_use",
      errorMessage: "The local MCP bridge requires 127.0.0.1:4319, but that port is already in use.",
      port: 4319,
      state: "error"
    });
  });
});
