import { ipcMain, shell } from "electron";

import {
  appChannelNames,
  applyCommandsInputSchema,
  createProjectInputSchema,
  emptyPayloadSchema,
  err,
  layoutMeasurementResultSchema,
  ok,
  openExternalUrlInputSchema,
  openProjectInputSchema,
  type AppResult,
  type EmptyPayload,
  type LayoutMeasurementResult,
  type RuntimeEvent
} from "@ai-canvas/ipc-contract";

import type { ProjectRuntime } from "./runtime/index.js";

type RegisterIpcOptions = {
  sendRuntimeEvent?: (event: RuntimeEvent) => void;
  submitLayoutMeasurementResult?: (
    input: LayoutMeasurementResult
  ) => AppResult<EmptyPayload> | Promise<AppResult<EmptyPayload>>;
};

export function registerIpc(runtime: ProjectRuntime, options: RegisterIpcOptions = {}): () => void {
  const unsubscribe = runtime.subscribeToEvents((event) => {
    options.sendRuntimeEvent?.(event);
  });

  ipcMain.handle(appChannelNames.listProjects, async () => runtime.listProjects());
  ipcMain.handle(appChannelNames.getActiveProject, async () => runtime.getActiveProject());
  ipcMain.handle(appChannelNames.getMcpStatus, async () => runtime.getMcpStatus());

  ipcMain.handle(appChannelNames.createProject, async (_event, input) => {
    try {
      const parsed = createProjectInputSchema.parse(input);
      return runtime.createProject(parsed.name);
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(appChannelNames.openProject, async (_event, input) => {
    try {
      const parsed = openProjectInputSchema.parse(input);
      return runtime.openProject(parsed.projectId);
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(appChannelNames.openExternalUrl, async (_event, input) => {
    try {
      const parsed = openExternalUrlInputSchema.parse(input);
      await shell.openExternal(parsed.url);
      return ok({});
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(appChannelNames.applyCommands, async (_event, input) => {
    try {
      const parsed = applyCommandsInputSchema.parse(input);
      return runtime.applyCommands(parsed);
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(appChannelNames.getRuntimeCapabilities, async (_event, input) => {
    try {
      emptyPayloadSchema.parse(input ?? {});
      return runtime.getRuntimeCapabilities();
    } catch (error) {
      return toValidationError(error);
    }
  });

  ipcMain.handle(appChannelNames.submitLayoutMeasurementResult, async (_event, input) => {
    try {
      const parsed = layoutMeasurementResultSchema.parse(input);

      if (!options.submitLayoutMeasurementResult) {
        return err("not_implemented", "Renderer layout measurement bridge is not attached");
      }

      return await options.submitLayoutMeasurementResult(parsed);
    } catch (error) {
      return toValidationError(error);
    }
  });

  return unsubscribe;
}

function toValidationError(error: unknown) {
  if (isZodLikeError(error)) {
    return err("validation_failed", error.issues.map((issue) => issue.message).join(", "));
  }

  return err("internal_error", error instanceof Error ? error.message : "Unknown IPC error");
}

function isZodLikeError(
  error: unknown
): error is {
  issues: Array<{ message: string }>;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}
