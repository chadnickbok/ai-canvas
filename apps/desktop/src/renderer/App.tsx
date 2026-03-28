import { startTransition, useEffect, useState } from "react";

import { ProjectLibraryScreen } from "@ai-canvas/editor-ui";
import type { DesktopApi } from "@ai-canvas/ipc-contract";
import {
  assertOk,
  type CreateProjectInput,
  type McpStatus,
  type ProjectSummary,
  runtimeEventSchema,
  type RuntimeCapabilities,
  type RuntimeEvent
} from "@ai-canvas/ipc-contract";

type BootState = "booting" | "ready" | "boot_error";

type ScreenState = {
  activeProjectId: string | null;
  bootState: BootState;
  errorMessage: string | null;
  isBusy: boolean;
  mcpStatus: McpStatus | null;
  projects: ProjectSummary[];
  runtimeCapabilities: RuntimeCapabilities | null;
};

const initialState: ScreenState = {
  activeProjectId: null,
  bootState: "booting",
  errorMessage: null,
  isBusy: true,
  mcpStatus: null,
  projects: [],
  runtimeCapabilities: null
};

function getDesktopApi(): DesktopApi | null {
  return window.aiCanvasApi ?? null;
}

async function loadScreenState(
  api: DesktopApi
): Promise<Omit<ScreenState, "bootState" | "errorMessage" | "isBusy">> {
  const [projectsResult, activeProjectResult, runtimeResult, mcpResult] = await Promise.all([
    api.listProjects(),
    api.getActiveProject(),
    api.getRuntimeCapabilities(),
    api.getMcpStatus()
  ]);

  return {
    activeProjectId: assertOk(activeProjectResult)?.project.id ?? null,
    mcpStatus: assertOk(mcpResult),
    projects: assertOk(projectsResult),
    runtimeCapabilities: assertOk(runtimeResult)
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
        activeProjectId: event.activeProject?.project.id ?? null
      };
    case "runtime_capabilities_changed":
      return {
        ...state,
        runtimeCapabilities: event.runtimeCapabilities
      };
    case "mcp_status_changed":
      return {
        ...state,
        mcpStatus: event.mcpStatus
      };
    case "document_changed":
      return {
        ...state,
        activeProjectId: event.project.id,
        runtimeCapabilities: event.runtimeCapabilities
      };
  }
}

export function App() {
  const [state, setState] = useState<ScreenState>(initialState);

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
    const api = getDesktopApi();

    if (!api) {
      setState({
        ...initialState,
        bootState: "boot_error",
        errorMessage:
          "Desktop bridge unavailable. The Electron preload script did not attach aiCanvasApi.",
        isBusy: false
      });
      return;
    }

    const unsubscribe = api.subscribeToRuntimeEvents((runtimeEvent) => {
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

    void loadInitialState(api);

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

    setState((current) => ({
      ...current,
      errorMessage: null,
      isBusy: false
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
      errorMessage: null,
      isBusy: false
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

  return (
    <ProjectLibraryScreen
      activeProjectId={state.activeProjectId}
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
  );
}
