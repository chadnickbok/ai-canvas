import type { ApplyCommandsInput, AppResult, McpStatus, ProjectSummary, RuntimeCapabilities } from "@ai-canvas/ipc-contract";
import { err, ok } from "@ai-canvas/ipc-contract";

import type { RendererDocument } from "@ai-canvas/document-core";

import type { ProjectStore } from "./projectStore.js";

type ActiveProjectSession = {
  document: RendererDocument;
  project: ProjectSummary;
};

type McpStatusProvider = {
  getStatus: () => McpStatus;
};

export class ProjectRuntime {
  private activeSession: ActiveProjectSession | null = null;
  private measurementSurfaceAvailable = false;
  private mcpStatusProvider: McpStatusProvider | null = null;

  constructor(private readonly store: ProjectStore) {}

  attachMcpStatusProvider(provider: McpStatusProvider): void {
    this.mcpStatusProvider = provider;
  }

  listProjects(): AppResult<ProjectSummary[]> {
    return ok(this.store.listProjects());
  }

  createProject(name: string): AppResult<ProjectSummary> {
    try {
      const storedProject = this.store.createProject(name);
      this.activeSession = storedProject;
      return ok(storedProject.project);
    } catch (error) {
      return err(
        "internal_error",
        error instanceof Error ? error.message : "Failed to create the project"
      );
    }
  }

  openProject(projectId: string): AppResult<ActiveProjectSession> {
    const previousSession = this.activeSession;

    try {
      const storedProject = this.store.getProject(projectId);

      if (!storedProject) {
        return err("not_found", `Project ${projectId} does not exist`);
      }

      const openedProject = this.store.markOpened(projectId);

      if (!openedProject) {
        return err("not_found", `Project ${projectId} no longer exists`);
      }

      this.activeSession = {
        document: storedProject.document,
        project: openedProject
      };

      return ok(this.activeSession);
    } catch (error) {
      this.activeSession = previousSession;
      return err(
        "internal_error",
        error instanceof Error ? error.message : "Failed to open the project"
      );
    }
  }

  getActiveProject(): AppResult<ActiveProjectSession | null> {
    return ok(this.activeSession);
  }

  getRuntimeCapabilities(): AppResult<RuntimeCapabilities> {
    const runtimeState = this.activeSession ? "editor_open_clean" : "no_project_open";
    const mode = this.activeSession && this.measurementSurfaceAvailable ? "read_write" : "read_only";

    return ok({
      measurementSurfaceAvailable: this.measurementSurfaceAvailable,
      mode,
      runtimeState
    });
  }

  getMcpStatus(): AppResult<McpStatus> {
    if (!this.mcpStatusProvider) {
      return err("internal_error", "MCP bridge has not been attached");
    }

    return ok(this.mcpStatusProvider.getStatus());
  }

  applyCommands(input: ApplyCommandsInput): AppResult<{ document_id: string; revision: number }> {
    if (!this.activeSession || input.document_id !== this.activeSession.document.document_id) {
      return err("not_found", "The target document is not open");
    }

    if (!this.measurementSurfaceAvailable) {
      return err(
        "measurement_surface_unavailable",
        "Write-capable command execution requires an available renderer measurement surface"
      );
    }

    return err(
      "not_implemented",
      "Phase 0 wires the command contract but does not yet implement mutation semantics"
    );
  }

  setMeasurementSurfaceAvailable(value: boolean): void {
    this.measurementSurfaceAvailable = value;
  }

  close(): void {
    this.store.close();
  }
}

export function createProjectRuntime(store: ProjectStore): ProjectRuntime {
  return new ProjectRuntime(store);
}
