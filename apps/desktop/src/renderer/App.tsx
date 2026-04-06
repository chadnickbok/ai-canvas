import React, { startTransition, useEffect, useState } from "react";

import { DocumentWorkspaceScreen, ProjectLibraryScreen } from "@ai-canvas/editor-ui";
import type { DesktopApi } from "@ai-canvas/ipc-contract";
import {
  assertOk,
  err,
  type ActiveProject,
  type ApplyCommandsInput,
  type CreateProjectInput,
  type HistoryState,
  type McpStatus,
  type ProjectSummary,
  runtimeEventSchema,
  type RuntimeCapabilities,
  type RuntimeEvent
} from "@ai-canvas/ipc-contract";

import { desktopBranding } from "../branding.js";
import { CommitLayoutMeasurementHost } from "./CommitLayoutMeasurementHost.js";

type BootState = "booting" | "ready" | "boot_error";
type Screen = "library" | "workspace";

type ScreenState = {
  activeProject: ActiveProject | null;
  bootState: BootState;
  errorMessage: string | null;
  historyState: HistoryState | null;
  isBusy: boolean;
  mcpStatus: McpStatus | null;
  projects: ProjectSummary[];
  runtimeCapabilities: RuntimeCapabilities | null;
  screen: Screen;
};

const initialState: ScreenState = {
  activeProject: null,
  bootState: "booting",
  errorMessage: null,
  historyState: null,
  isBusy: true,
  mcpStatus: null,
  projects: [],
  runtimeCapabilities: null,
  screen: "library"
};

function getDesktopApi(): DesktopApi | null {
  return window.aiCanvasApi ?? null;
}

async function loadScreenState(
  api: DesktopApi
): Promise<Omit<ScreenState, "bootState" | "errorMessage" | "isBusy">> {
  const [projectsResult, activeProjectResult, historyResult, runtimeResult, mcpResult] =
    await Promise.all([
      api.listProjects(),
      api.getActiveProject(),
      api.getHistoryState(),
      api.getRuntimeCapabilities(),
      api.getMcpStatus()
    ]);
  const activeProject = assertOk(activeProjectResult);

  return {
    activeProject,
    historyState: assertOk(historyResult),
    mcpStatus: assertOk(mcpResult),
    projects: assertOk(projectsResult),
    runtimeCapabilities: assertOk(runtimeResult),
    screen: activeProject ? "workspace" : "library"
  };
}

function applyRuntimeEvent(state: ScreenState, event: RuntimeEvent): ScreenState {
  switch (event.type) {
    case "projects_changed":
      return {
        ...state,
        projects: event.projects
      };
    case "active_project_changed":
      return {
        ...state,
        activeProject: event.activeProject,
        screen: event.activeProject ? "workspace" : "library"
      };
    case "runtime_capabilities_changed":
      return {
        ...state,
        runtimeCapabilities: event.runtimeCapabilities
      };
    case "history_state_changed":
      return {
        ...state,
        historyState: event.historyState
      };
    case "mcp_status_changed":
      return {
        ...state,
        mcpStatus: event.mcpStatus
      };
    case "document_changed":
      return {
        ...state,
        activeProject: {
          document: event.document,
          project: event.project,
          revision: event.revision
        },
        runtimeCapabilities: event.runtimeCapabilities
      };
  }
}

export function App() {
  const [state, setState] = useState<ScreenState>(initialState);
  const api = getDesktopApi();

  const loadInitialState = async (api: DesktopApi) => {
    try {
      const nextState = await loadScreenState(api);

      startTransition(() => {
        setState({
          ...nextState,
          bootState: "ready",
          errorMessage: null,
          isBusy: false
        });
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        bootState: current.bootState === "ready" ? "ready" : "boot_error",
        errorMessage: error instanceof Error ? error.message : "Failed to load the project library",
        isBusy: false
      }));
    }
  };

  useEffect(() => {
    const effectApi = getDesktopApi();

    if (!effectApi) {
      setState({
        ...initialState,
        bootState: "boot_error",
        errorMessage:
          "Desktop bridge unavailable. The Electron preload script did not attach aiCanvasApi.",
        isBusy: false
      });
      return;
    }

    const unsubscribe = effectApi.subscribeToRuntimeEvents((runtimeEvent) => {
      const parsed = runtimeEventSchema.safeParse(runtimeEvent);

      if (!parsed.success) {
        setState((current) => ({
          ...current,
          errorMessage: "Received an invalid runtime event from the desktop main process."
        }));
        return;
      }

      startTransition(() => {
        setState((current) => applyRuntimeEvent(current, parsed.data));
      });
    });

    void loadInitialState(effectApi);

    return () => {
      unsubscribe();
    };
  }, []);

  const handleCreateProject = async (input: CreateProjectInput) => {
    const api = getDesktopApi();

    if (!api || state.bootState !== "ready") {
      throw new Error("Desktop bridge unavailable");
    }

    setState((current) => ({
      ...current,
      errorMessage: null,
      isBusy: true
    }));

    let result;

    try {
      result = await api.createProject(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create the project";

      setState((current) => ({
        ...current,
        errorMessage: message,
        isBusy: false
      }));

      throw new Error(message);
    }

    if (!result.ok) {
      const message = result.error.message;

      setState((current) => ({
        ...current,
        errorMessage: message,
        isBusy: false
      }));

      throw new Error(message);
    }

    let activeProjectResult;

    try {
      activeProjectResult = await api.getActiveProject();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load the created project session";

      setState((current) => ({
        ...current,
        errorMessage: message,
        isBusy: false
      }));

      throw new Error(message);
    }

    if (!activeProjectResult.ok || !activeProjectResult.data) {
      const message = activeProjectResult.ok
        ? "The project was created but no active project session was returned."
        : activeProjectResult.error.message;

      setState((current) => ({
        ...current,
        errorMessage: message,
        isBusy: false
      }));

      throw new Error(message);
    }

    setState((current) => ({
      ...current,
      activeProject: activeProjectResult.data,
      errorMessage: null,
      isBusy: false,
      screen: "workspace"
    }));
  };

  const handleOpenProject = async (projectId: string) => {
    const api = getDesktopApi();

    if (!api || state.bootState !== "ready") {
      return;
    }

    setState((current) => ({
      ...current,
      errorMessage: null,
      isBusy: true
    }));

    let result;

    try {
      result = await api.openProject({ projectId });
    } catch (error) {
      setState((current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : "Failed to open the project",
        isBusy: false
      }));
      return;
    }

    if (!result.ok) {
      setState((current) => ({
        ...current,
        errorMessage: result.error.message,
        isBusy: false
      }));
      return;
    }

    setState((current) => ({
      ...current,
      activeProject: result.data,
      errorMessage: null,
      isBusy: false,
      screen: "workspace"
    }));
  };

  const handleOpenExternalUrl = async (url: string) => {
    const api = getDesktopApi();

    if (!api) {
      setState((current) => ({
        ...current,
        errorMessage:
          "Desktop bridge unavailable. The Electron preload script did not attach aiCanvasApi."
      }));
      return;
    }

    try {
      const result = await api.openExternalUrl({ url });

      if (!result.ok) {
        setState((current) => ({
          ...current,
          errorMessage: result.error.message
        }));
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : "Failed to open the external link"
      }));
    }
  };

  const retryApplyCommandsOnRevisionMismatch = async (
    api: DesktopApi,
    input: ApplyCommandsInput,
    initialResult: Awaited<ReturnType<DesktopApi["applyCommands"]>>
  ) => {
    const isBaseRevisionMismatch =
      !initialResult.ok &&
      typeof initialResult.error.message === "string" &&
      initialResult.error.message.toLowerCase().includes("base_revision");

    if (!isBaseRevisionMismatch) {
      return initialResult;
    }

    const activeProjectResult = await api.getActiveProject();

    if (!activeProjectResult.ok || !activeProjectResult.data) {
      return initialResult;
    }

    const latestRevision = activeProjectResult.data.revision;

    if (latestRevision === input.base_revision) {
      return initialResult;
    }

    return api.applyCommands({
      ...input,
      base_revision: latestRevision
    });
  };

  const handleApplyCommands = async (input: ApplyCommandsInput) => {
    const api = getDesktopApi();

    if (!api || state.bootState !== "ready") {
      return err("internal_error", "Desktop bridge unavailable");
    }

    try {
      const initialResult = await api.applyCommands(input);
      return retryApplyCommandsOnRevisionMismatch(api, input, initialResult);
    } catch (error) {
      return err(
        "internal_error",
        error instanceof Error ? error.message : "Failed to apply commands"
      );
    }
  };

  const handleUndo = async () => {
    const api = getDesktopApi();

    if (!api || state.bootState !== "ready") {
      return;
    }

    setState((current) => ({
      ...current,
      errorMessage: null,
      isBusy: true
    }));

    try {
      const result = await api.undo();

      setState((current) => ({
        ...current,
        errorMessage: result.ok ? null : result.error.message,
        isBusy: false
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : "Failed to undo",
        isBusy: false
      }));
    }
  };

  const handleRedo = async () => {
    const api = getDesktopApi();

    if (!api || state.bootState !== "ready") {
      return;
    }

    setState((current) => ({
      ...current,
      errorMessage: null,
      isBusy: true
    }));

    try {
      const result = await api.redo();

      setState((current) => ({
        ...current,
        errorMessage: result.ok ? null : result.error.message,
        isBusy: false
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : "Failed to redo",
        isBusy: false
      }));
    }
  };

  const measurementHost = api ? <CommitLayoutMeasurementHost api={api} /> : null;

  if (state.bootState === "ready" && state.screen === "workspace" && state.activeProject) {
    return (
      <>
        <DocumentWorkspaceScreen
          activeProject={state.activeProject}
          errorMessage={state.errorMessage}
          historyState={state.historyState}
          isBusy={state.isBusy}
          mcpStatus={state.mcpStatus}
          onApplyCommands={handleApplyCommands}
          onBackToLibrary={() => {
            setState((current) => ({
              ...current,
              screen: "library"
            }));
          }}
          onRedo={handleRedo}
          onUndo={handleUndo}
          runtimeCapabilities={state.runtimeCapabilities}
        />
        {measurementHost}
      </>
    );
  }

  return (
    <>
      <ProjectLibraryScreen
        activeProjectId={state.activeProject?.project.id ?? null}
        brandAttribution={desktopBranding.brandAttribution}
        bootState={state.bootState}
        errorMessage={state.errorMessage}
        isBusy={state.isBusy}
        mcpStatus={state.mcpStatus}
        onCreateProject={handleCreateProject}
        onOpenProject={handleOpenProject}
        onOpenExternalUrl={(url) => {
          void handleOpenExternalUrl(url);
        }}
        projects={state.projects}
        runtimeCapabilities={state.runtimeCapabilities}
      />
      {measurementHost}
    </>
  );
}
