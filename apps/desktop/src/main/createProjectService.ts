import type {
  InspectDesignSystemOutput,
  ProjectService
} from "@ai-canvas/mcp-bridge";
import type { AppResult } from "@ai-canvas/ipc-contract";

import type {
  InspectDesignSystemResult,
  ProjectRuntime
} from "./runtime/index.js";

function toBridgeDesignSystemResult(
  result: AppResult<InspectDesignSystemResult>
): AppResult<InspectDesignSystemOutput> {
  if (!result.ok) {
    return result;
  }

  return {
    data: {
      ...result.data,
      design_system: result.data.design_system as unknown as InspectDesignSystemOutput["design_system"]
    },
    ok: true
  };
}

export function createProjectService(runtime: ProjectRuntime): ProjectService {
  return {
    applyCommands: async (input) =>
      runtime.applyProjectCommands({
        base_revision: input.base_revision,
        commands: input.commands,
        projectId: input.project_id
      }),
    createAssetFromBytes: async (input) =>
      runtime.createAssetFromBytes({
        assetId: input.asset_id,
        bytesBase64: input.bytes_base64,
        ...(input.height === undefined ? {} : { height: input.height }),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        mimeType: input.mime_type,
        ...(input.original_filename === undefined
          ? {}
          : { originalFilename: input.original_filename }),
        projectId: input.project_id,
        ...(input.width === undefined ? {} : { width: input.width })
      }),
    createAssetFromUrl: async (input) =>
      runtime.createAssetFromUrl({
        assetId: input.asset_id,
        projectId: input.project_id,
        url: input.url
      }),
    createProject: async (name) => runtime.createProject(name),
    inspectDesignSystem: async (projectId) =>
      toBridgeDesignSystemResult(runtime.inspectDesignSystem(projectId)),
    inspectNode: async (projectId, nodeId) => runtime.inspectNode({ nodeId, projectId }),
    inspectProject: async (projectId) => runtime.inspectProject(projectId),
    inspectScenes: async (projectId) => runtime.inspectScenes(projectId),
    inspectTree: async (input) => runtime.inspectTree(input),
    listProjects: async () => runtime.listProjects(),
    openProject: async (projectId) => {
      const result = runtime.openProject(projectId);

      if (!result.ok) {
        return result;
      }

      return {
        data: {
          project: result.data.project,
          revision: result.data.revision
        },
        ok: true as const
      };
    }
  };
}
