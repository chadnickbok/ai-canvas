import {
  applyCommands as applyDocumentCommands,
  type RefreshComputedLayoutInput,
  inspectDesignSystem as inspectDocumentDesignSystem,
  inspectDocument,
  inspectNode as inspectDocumentNode,
  inspectRootTree,
  inspectScenes as inspectDocumentScenes,
  inspectSubtree,
  type DesignSystemInspection,
  type DocumentInspection,
  type SceneInspection,
  type TreeNodeInspection
} from "@ai-canvas/document-core";
import type {
  ActiveProject,
  ApplyCommandsInput,
  AppErrorCode,
  AppResult,
  CommandResult,
  McpStatus,
  ProjectSummary,
  RuntimeCapabilities,
  RuntimeEvent
} from "@ai-canvas/ipc-contract";
import { err, ok } from "@ai-canvas/ipc-contract";

import type { ProjectStore } from "./projectStore.js";

type McpStatusProvider = {
  getStatus: () => McpStatus;
};

type ReadableProjectSession = ActiveProject & {
  isActive: boolean;
};

export type InspectProjectResult = {
  document: DocumentInspection;
  is_active: boolean;
  project: ProjectSummary;
  revision: number;
};

export type InspectTreeInput = {
  projectId?: string;
  rootNodeId?: string;
};

export type InspectTreeResult = {
  document_id: string;
  project_id: string;
  revision: number;
  root_node_id: string | null;
  tree: TreeNodeInspection[];
};

export type InspectNodeInput = {
  nodeId: string;
  projectId?: string;
};

export type InspectNodeResult = {
  document_id: string;
  node: ActiveProject["document"]["nodes"][string];
  project_id: string;
  revision: number;
};

export type InspectScenesResult = {
  document_id: string;
  project_id: string;
  revision: number;
  scenes: SceneInspection[];
};

export type InspectDesignSystemResult = {
  design_system: DesignSystemInspection;
  document_id: string;
  project_id: string;
  revision: number;
};

export type ApplyProjectCommandsInput = {
  base_revision?: number;
  commands: ApplyCommandsInput["commands"];
  projectId?: string;
};

type ComputedLayoutRefreshResult = {
  document: ActiveProject["document"];
  layoutRefresh: CommandResult["layout_refresh"];
};

type ComputedLayoutRefresher = (
  input: RefreshComputedLayoutInput
) => Promise<ComputedLayoutRefreshResult>;

export class ProjectRuntime {
  private activeSession: ActiveProject | null = null;
  private commandQueue: Promise<void> = Promise.resolve();
  private computedLayoutRefresher: ComputedLayoutRefresher | null = null;
  private readonly listeners = new Set<(event: RuntimeEvent) => void>();
  private measurementSurfaceAvailable = false;
  private mcpStatusProvider: McpStatusProvider | null = null;

  constructor(private readonly store: ProjectStore) {}

  attachMcpStatusProvider(provider: McpStatusProvider): void {
    this.mcpStatusProvider = provider;
  }

  subscribeToEvents(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  listProjects(): AppResult<ProjectSummary[]> {
    return ok(this.store.listProjects());
  }

  createProject(name: string): AppResult<ProjectSummary> {
    try {
      const storedProject = this.store.createProject(name);
      this.activeSession = storedProject;
      this.emitProjectsChanged();
      this.emitActiveProjectChanged();
      this.emitRuntimeCapabilitiesChanged();
      return ok(storedProject.project);
    } catch (error) {
      return err(
        "internal_error",
        error instanceof Error ? error.message : "Failed to create the project"
      );
    }
  }

  openProject(projectId: string): AppResult<ActiveProject> {
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
        project: openedProject,
        revision: storedProject.revision
      };

      this.emitProjectsChanged();
      this.emitActiveProjectChanged();
      this.emitRuntimeCapabilitiesChanged();

      return ok(this.activeSession);
    } catch (error) {
      this.activeSession = previousSession;
      return err(
        "internal_error",
        error instanceof Error ? error.message : "Failed to open the project"
      );
    }
  }

  getActiveProject(): AppResult<ActiveProject | null> {
    return ok(this.activeSession);
  }

  getRuntimeCapabilities(): AppResult<RuntimeCapabilities> {
    return ok(this.buildRuntimeCapabilities());
  }

  getMcpStatus(): AppResult<McpStatus> {
    if (!this.mcpStatusProvider) {
      return err("internal_error", "MCP bridge has not been attached");
    }

    return ok(this.mcpStatusProvider.getStatus());
  }

  inspectProject(projectId?: string): AppResult<InspectProjectResult> {
    const resolvedProject = this.resolveReadableProject(projectId);

    if (!resolvedProject.ok) {
      return resolvedProject;
    }

    return ok({
      document: inspectDocument(resolvedProject.data.document),
      is_active: resolvedProject.data.isActive,
      project: resolvedProject.data.project,
      revision: resolvedProject.data.revision
    });
  }

  inspectTree(input: InspectTreeInput = {}): AppResult<InspectTreeResult> {
    const resolvedProject = this.resolveReadableProject(input.projectId);

    if (!resolvedProject.ok) {
      return resolvedProject;
    }

    const tree =
      input.rootNodeId === undefined
        ? inspectRootTree(resolvedProject.data.document)
        : (() => {
            const subtree = inspectSubtree(resolvedProject.data.document, input.rootNodeId);

            if (!subtree) {
              return null;
            }

            return [subtree];
          })();

    if (tree === null) {
      return err("target_not_found", `Node ${input.rootNodeId} does not exist in the targeted project`);
    }

    return ok({
      document_id: resolvedProject.data.document.document_id,
      project_id: resolvedProject.data.project.id,
      revision: resolvedProject.data.revision,
      root_node_id: input.rootNodeId ?? null,
      tree
    });
  }

  inspectNode(input: InspectNodeInput): AppResult<InspectNodeResult> {
    const resolvedProject = this.resolveReadableProject(input.projectId);

    if (!resolvedProject.ok) {
      return resolvedProject;
    }

    const node = inspectDocumentNode(resolvedProject.data.document, input.nodeId);

    if (!node) {
      return err("target_not_found", `Node ${input.nodeId} does not exist in the targeted project`);
    }

    return ok({
      document_id: resolvedProject.data.document.document_id,
      node,
      project_id: resolvedProject.data.project.id,
      revision: resolvedProject.data.revision
    });
  }

  inspectScenes(projectId?: string): AppResult<InspectScenesResult> {
    const resolvedProject = this.resolveReadableProject(projectId);

    if (!resolvedProject.ok) {
      return resolvedProject;
    }

    return ok({
      document_id: resolvedProject.data.document.document_id,
      project_id: resolvedProject.data.project.id,
      revision: resolvedProject.data.revision,
      scenes: inspectDocumentScenes(resolvedProject.data.document)
    });
  }

  inspectDesignSystem(projectId?: string): AppResult<InspectDesignSystemResult> {
    const resolvedProject = this.resolveReadableProject(projectId);

    if (!resolvedProject.ok) {
      return resolvedProject;
    }

    return ok({
      design_system: inspectDocumentDesignSystem(resolvedProject.data.document),
      document_id: resolvedProject.data.document.document_id,
      project_id: resolvedProject.data.project.id,
      revision: resolvedProject.data.revision
    });
  }

  async applyCommands(input: ApplyCommandsInput): Promise<AppResult<CommandResult>> {
    return this.enqueueCommand(() => this.applyCommandsInternal(input));
  }

  async applyProjectCommands(input: ApplyProjectCommandsInput): Promise<AppResult<CommandResult>> {
    const writableSession = this.resolveWritableProject(input.projectId);

    if (!writableSession.ok) {
      return writableSession;
    }

    return this.applyCommands({
      base_revision: input.base_revision,
      commands: input.commands,
      document_id: writableSession.data.document.document_id
    });
  }

  setMeasurementSurfaceAvailable(value: boolean): void {
    if (this.measurementSurfaceAvailable === value) {
      return;
    }

    this.measurementSurfaceAvailable = value;
    this.emitRuntimeCapabilitiesChanged();
  }

  setComputedLayoutRefresher(refresher: ComputedLayoutRefresher | null): void {
    if (this.computedLayoutRefresher === refresher) {
      return;
    }

    this.computedLayoutRefresher = refresher;
    this.emitRuntimeCapabilitiesChanged();
  }

  publishMcpStatus(status: McpStatus): void {
    this.emitRuntimeEvent({
      type: "mcp_status_changed",
      mcpStatus: status
    });
  }

  close(): void {
    this.store.close();
  }

  private async applyCommandsInternal(input: ApplyCommandsInput): Promise<AppResult<CommandResult>> {
    if (!this.activeSession) {
      return err("not_found", "No active project session is open");
    }

    if (input.document_id !== this.activeSession.document.document_id) {
      return err("target_not_found", `Document ${input.document_id} is not the active document`);
    }

    if (!this.hasMeasurementSurface()) {
      return err(
        "measurement_surface_unavailable",
        "Write-capable command execution requires an available renderer measurement surface"
      );
    }

    let layoutRefresh: CommandResult["layout_refresh"] = {
      status: "not_required"
    };
    let commandResult: Awaited<ReturnType<typeof applyDocumentCommands>>;
    const computedLayoutRefresher = this.computedLayoutRefresher;

    try {
      commandResult = await applyDocumentCommands(this.activeSession.document, input, {
        currentRevision: this.activeSession.revision,
        measurementSurfaceAvailable: true,
        refreshComputedLayout: computedLayoutRefresher
          ? async (refreshInput) => {
              const refreshedDocument = await computedLayoutRefresher(refreshInput);
              layoutRefresh = refreshedDocument.layoutRefresh;
              return refreshedDocument.document;
            }
          : undefined
      });
    } catch (error) {
      return err(resolveRuntimeErrorCode(error), resolveRuntimeErrorMessage(error));
    }

    if (!commandResult.ok) {
      return err(commandResult.error.code, commandResult.error.message);
    }

    const persistedProject = this.store.saveProjectDocument(
      this.activeSession.project.id,
      commandResult.document,
      this.activeSession.revision
    );

    if (!persistedProject.ok) {
      if (persistedProject.code === "not_found") {
        return err("not_found", `Project ${this.activeSession.project.id} no longer exists`);
      }

      return err(
        "revision_conflict",
        `Project ${this.activeSession.project.id} changed while applying commands`
      );
    }

    this.activeSession = {
      document: commandResult.document,
      project: persistedProject.project,
      revision: persistedProject.revision
    };

    this.emitProjectsChanged();
    this.emitActiveProjectChanged();
    this.emitDocumentChanged();

    return ok({
      document_id: commandResult.document_id,
      ...(commandResult.effects === undefined ? {} : { effects: commandResult.effects }),
      layout_refresh: layoutRefresh,
      revision: persistedProject.revision
    });
  }

  private buildRuntimeCapabilities(): RuntimeCapabilities {
    const runtimeState = this.activeSession ? "editor_open_clean" : "no_project_open";
    const mode = this.activeSession && this.hasMeasurementSurface() ? "read_write" : "read_only";

    return {
      measurementSurfaceAvailable: this.hasMeasurementSurface(),
      mode,
      runtimeState
    };
  }

  private hasMeasurementSurface(): boolean {
    return this.measurementSurfaceAvailable && this.computedLayoutRefresher !== null;
  }

  private emitProjectsChanged(): void {
    this.emitRuntimeEvent({
      type: "projects_changed",
      projects: this.store.listProjects()
    });
  }

  private emitActiveProjectChanged(): void {
    this.emitRuntimeEvent({
      type: "active_project_changed",
      activeProject: this.activeSession
    });
  }

  private emitDocumentChanged(): void {
    if (!this.activeSession) {
      return;
    }

    this.emitRuntimeEvent({
      document: this.activeSession.document,
      project: this.activeSession.project,
      revision: this.activeSession.revision,
      runtimeCapabilities: this.buildRuntimeCapabilities(),
      type: "document_changed"
    });
  }

  private emitRuntimeCapabilitiesChanged(): void {
    this.emitRuntimeEvent({
      type: "runtime_capabilities_changed",
      runtimeCapabilities: this.buildRuntimeCapabilities()
    });
  }

  private emitRuntimeEvent(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private enqueueCommand<T>(operation: () => Promise<T>): Promise<T> {
    const queuedOperation = this.commandQueue.then(operation);

    this.commandQueue = queuedOperation.then(
      () => undefined,
      () => undefined
    );

    return queuedOperation;
  }

  private resolveReadableProject(projectId?: string): AppResult<ReadableProjectSession> {
    if (projectId === undefined) {
      if (!this.activeSession) {
        return err("not_found", "No active project session is open");
      }

      return ok({
        ...this.activeSession,
        isActive: true
      });
    }

    if (this.activeSession?.project.id === projectId) {
      return ok({
        ...this.activeSession,
        isActive: true
      });
    }

    const storedProject = this.store.getProject(projectId);

    if (!storedProject) {
      return err("not_found", `Project ${projectId} does not exist`);
    }

    return ok({
      ...storedProject,
      isActive: false
    });
  }

  private resolveWritableProject(projectId?: string): AppResult<ActiveProject> {
    if (!this.activeSession) {
      return err("not_found", "No active project session is open");
    }

    if (projectId !== undefined && this.activeSession.project.id !== projectId) {
      return err(
        "not_found",
        `Project ${projectId} is not the active project session. Use open_project first.`
      );
    }

    return ok(this.activeSession);
  }
}

export function createProjectRuntime(store: ProjectStore): ProjectRuntime {
  return new ProjectRuntime(store);
}

function resolveRuntimeErrorCode(error: unknown): AppErrorCode {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    switch ((error as { code: string }).code) {
      case "internal_error":
      case "measurement_surface_unavailable":
      case "not_found":
      case "not_implemented":
      case "revision_conflict":
      case "target_not_found":
      case "unknown_command":
      case "unrecoverable_command":
      case "validation_failed":
        return (error as { code: AppErrorCode }).code;
    }
  }

  return "internal_error";
}

function resolveRuntimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to refresh computed layout";
}
