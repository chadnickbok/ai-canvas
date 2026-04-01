import { parseArgs } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_ENDPOINT = "http://127.0.0.1:9311/mcp";

const DEMO_COMMANDS = [
  {
    type: "create_scene",
    scene: {
      id: "scene_home",
      name: "Home",
      left: 80,
      top: 80,
      width: 390,
      height: 844,
      render_style: {
        backgroundColor: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        overflow: "hidden",
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 24
      }
    }
  },
  {
    type: "create_node",
    parent: {
      parent_id: "scene_home"
    },
    node: {
      id: "rect_hero",
      kind: "rectangle",
      name: "Hero",
      width: 342,
      height: 180,
      render_style: {
        backgroundColor: "#f5c04a",
        borderRadius: 24
      }
    }
  },
  {
    type: "create_node",
    parent: {
      parent_id: "scene_home"
    },
    node: {
      id: "text_title",
      kind: "text",
      name: "Title",
      text: {
        content: "Hello from MCP"
      },
      render_style: {
        color: "#111111",
        fontFamily: "IBM Plex Sans",
        fontSize: 32,
        fontWeight: 600,
        lineHeight: "38px"
      }
    }
  },
  {
    type: "create_node",
    parent: {
      parent_id: "scene_home"
    },
    node: {
      id: "rect_body",
      kind: "rectangle",
      name: "Body",
      width: 342,
      height: 280,
      render_style: {
        backgroundColor: "#efe7d5",
        borderRadius: 20
      }
    }
  },
  {
    type: "create_node",
    parent: {
      parent_id: "scene_home"
    },
    node: {
      id: "text_caption",
      kind: "text",
      name: "Caption",
      text: {
        content: "This scene was created through the local MCP bridge."
      },
      render_style: {
        color: "#4b5563",
        fontFamily: "IBM Plex Sans",
        fontSize: 15,
        lineHeight: "24px",
        maxWidth: 320
      }
    }
  }
];

function parseToolResult(result, toolName) {
  if (result.isError) {
    throw new Error(`${toolName} failed: ${result.content?.[0]?.text ?? "Unknown MCP error"}`);
  }

  return result.structuredContent;
}

async function main() {
  const { values } = parseArgs({
    options: {
      endpoint: {
        type: "string"
      },
      "project-id": {
        type: "string"
      }
    }
  });

  const endpoint = values.endpoint ?? DEFAULT_ENDPOINT;
  const projectId = values["project-id"];
  const client = new Client({
    name: "ai-canvas-vertical-slice-demo",
    version: "0.0.0"
  });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));

  try {
    await client.connect(transport);

    if (projectId) {
      parseToolResult(
        await client.callTool({
          arguments: {
            project_id: projectId
          },
          name: "open_project"
        }),
        "open_project"
      );
    }

    const inspectProjectResult = parseToolResult(
      await client.callTool({
        arguments: projectId
          ? {
              project_id: projectId
            }
          : {},
        name: "inspect_project"
      }),
      "inspect_project"
    );

    if (!inspectProjectResult.ok) {
      throw new Error("inspect_project returned a non-ok payload");
    }

    const applyCommandsResult = parseToolResult(
      await client.callTool({
        arguments: {
          ...(projectId ? { project_id: projectId } : {}),
          base_revision: inspectProjectResult.revision,
          commands: DEMO_COMMANDS
        },
        name: "apply_commands"
      }),
      "apply_commands"
    );

    if (!applyCommandsResult.ok) {
      throw new Error("apply_commands returned a non-ok payload");
    }

    const inspectScenesResult = parseToolResult(
      await client.callTool({
        arguments: projectId
          ? {
              project_id: projectId
            }
          : {},
        name: "inspect_scenes"
      }),
      "inspect_scenes"
    );

    if (!inspectScenesResult.ok) {
      throw new Error("inspect_scenes returned a non-ok payload");
    }

    console.log(
      JSON.stringify(
        {
          document_id: applyCommandsResult.document_id,
          endpoint,
          project_id: inspectProjectResult.project.id,
          revision: applyCommandsResult.revision,
          scene_count: inspectScenesResult.scenes.length,
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await transport.close();
    await client.close();
  }
}

await main();
