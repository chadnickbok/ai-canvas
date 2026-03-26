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

    const result = await client.callTool({
      arguments: {},
      name: "list_projects"
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ projects });

    await transport.close();
    await client.close();
  });

  it("fails on a fixed-port conflict without reporting itself as enabled", async () => {
    const primaryBridge = new LocalMcpBridge({
      host: "127.0.0.1",
      port: 4319,
      projectService: {
        listProjects: async () => []
      }
    });
    const conflictingBridge = new LocalMcpBridge({
      host: "127.0.0.1",
      port: 4319,
      projectService: {
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
