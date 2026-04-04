import { z } from "zod";

import {
  applyCommandsEffectsSchema,
  applyCommandsInputSchema as documentCoreApplyCommandsInputSchema,
  rendererDocumentSchema
} from "@ai-canvas/document-core";

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  documentId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastOpenedAt: z.string().nullable()
});

export const runtimeModeSchema = z.enum(["read_write", "read_only"]);

export const runtimeCapabilitiesSchema = z.object({
  measurementSurfaceAvailable: z.boolean(),
  mode: runtimeModeSchema,
  runtimeState: z.string()
});

export const mcpStatusStateSchema = z.enum(["running", "error"]);
export const mcpStatusErrorCodeSchema = z.enum(["port_in_use", "startup_failed"]);

export const mcpStatusSchema = z.object({
  enabled: z.boolean(),
  errorCode: mcpStatusErrorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
  host: z.string(),
  port: z.number().int().positive(),
  state: mcpStatusStateSchema,
  endpoint: z.string(),
  connectedSessions: z.number().int().nonnegative()
});

export const activeProjectSchema = z.object({
  project: projectSummarySchema,
  document: rendererDocumentSchema,
  revision: z.number().int().positive()
});

export const projectsChangedEventSchema = z.object({
  type: z.literal("projects_changed"),
  projects: z.array(projectSummarySchema)
});

export const activeProjectChangedEventSchema = z.object({
  type: z.literal("active_project_changed"),
  activeProject: activeProjectSchema.nullable()
});

export const runtimeCapabilitiesChangedEventSchema = z.object({
  type: z.literal("runtime_capabilities_changed"),
  runtimeCapabilities: runtimeCapabilitiesSchema
});

export const mcpStatusChangedEventSchema = z.object({
  type: z.literal("mcp_status_changed"),
  mcpStatus: mcpStatusSchema
});

export const documentChangedEventSchema = z.object({
  type: z.literal("document_changed"),
  document: rendererDocumentSchema,
  project: projectSummarySchema,
  revision: z.number().int().nonnegative(),
  runtimeCapabilities: runtimeCapabilitiesSchema
});

export const runtimeEventSchema = z.discriminatedUnion("type", [
  projectsChangedEventSchema,
  activeProjectChangedEventSchema,
  runtimeCapabilitiesChangedEventSchema,
  mcpStatusChangedEventSchema,
  documentChangedEventSchema
]);

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export const openProjectInputSchema = z.object({
  projectId: z.string().min(1)
});

export const openExternalUrlInputSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "External links must use http or https.")
});

export const applyCommandsInputSchema = documentCoreApplyCommandsInputSchema;

export const computedLayoutSchema = z
  .object({
    height: z.number(),
    width: z.number(),
    x: z.number(),
    y: z.number()
  })
  .strict();

export const commandLayoutRefreshSchema = z.discriminatedUnion("status", [
  z
    .object({
      measured_node_count: z.number().int().nonnegative(),
      measured_root_ids: z.array(z.string()),
      status: z.literal("refreshed")
    })
    .strict(),
  z
    .object({
      status: z.literal("not_required")
    })
    .strict()
]);

export const appErrorCodeSchema = z.enum([
  "internal_error",
  "measurement_surface_unavailable",
  "not_found",
  "not_implemented",
  "revision_conflict",
  "target_not_found",
  "unknown_command",
  "unrecoverable_command",
  "validation_failed"
]);

export const appErrorSchema = z.object({
  code: appErrorCodeSchema,
  message: z.string()
});

export const layoutMeasurementRequestSchema = z
  .object({
    document: rendererDocumentSchema,
    request_id: z.string(),
    root_ids: z.array(z.string())
  })
  .strict();

export const layoutMeasurementResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      measured_layouts: z.record(z.string(), computedLayoutSchema),
      ok: z.literal(true),
      request_id: z.string()
    })
    .strict(),
  z
    .object({
      error: appErrorSchema,
      ok: z.literal(false),
      request_id: z.string()
    })
    .strict()
]);

export const okResultSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    ok: z.literal(true),
    data: schema
  });

export const errorResultSchema = z.object({
  ok: z.literal(false),
  error: appErrorSchema
});

export const resultSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([okResultSchema(schema), errorResultSchema]);

export const emptyPayloadSchema = z.object({});
export const commandResultSchema = z.object({
  document_id: z.string(),
  effects: applyCommandsEffectsSchema.optional(),
  layout_refresh: commandLayoutRefreshSchema,
  revision: z.number().int().positive()
});

export const appChannelNames = {
  applyCommands: "app:applyCommands",
  createProject: "app:createProject",
  getActiveProject: "app:getActiveProject",
  getMcpStatus: "app:getMcpStatus",
  getRuntimeCapabilities: "app:getRuntimeCapabilities",
  layoutMeasurementRequest: "app:layoutMeasurementRequest",
  listProjects: "app:listProjects",
  openExternalUrl: "app:openExternalUrl",
  openProject: "app:openProject",
  submitLayoutMeasurementResult: "app:submitLayoutMeasurementResult",
  runtimeEvent: "app:runtimeEvent"
} as const;

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type RuntimeCapabilities = z.infer<typeof runtimeCapabilitiesSchema>;
export type McpStatus = z.infer<typeof mcpStatusSchema>;
export type McpStatusState = z.infer<typeof mcpStatusStateSchema>;
export type McpStatusErrorCode = z.infer<typeof mcpStatusErrorCodeSchema>;
export type ActiveProject = z.infer<typeof activeProjectSchema>;
export type ProjectsChangedEvent = z.infer<typeof projectsChangedEventSchema>;
export type ActiveProjectChangedEvent = z.infer<typeof activeProjectChangedEventSchema>;
export type RuntimeCapabilitiesChangedEvent = z.infer<typeof runtimeCapabilitiesChangedEventSchema>;
export type McpStatusChangedEvent = z.infer<typeof mcpStatusChangedEventSchema>;
export type DocumentChangedEvent = z.infer<typeof documentChangedEventSchema>;
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type OpenProjectInput = z.infer<typeof openProjectInputSchema>;
export type OpenExternalUrlInput = z.infer<typeof openExternalUrlInputSchema>;
export type ApplyCommandsInput = z.infer<typeof applyCommandsInputSchema>;
export type AppErrorCode = z.infer<typeof appErrorCodeSchema>;
export type AppError = z.infer<typeof appErrorSchema>;
export type LayoutMeasurementRequest = z.infer<typeof layoutMeasurementRequestSchema>;
export type LayoutMeasurementResult = z.infer<typeof layoutMeasurementResultSchema>;
export type CommandResult = z.infer<typeof commandResultSchema>;
export type EmptyPayload = Record<string, never>;

export type AppResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: AppError;
    };

export interface DesktopApi {
  applyCommands(input: ApplyCommandsInput): Promise<AppResult<CommandResult>>;
  createProject(input: CreateProjectInput): Promise<AppResult<ProjectSummary>>;
  getActiveProject(): Promise<AppResult<ActiveProject | null>>;
  getMcpStatus(): Promise<AppResult<McpStatus>>;
  getRuntimeCapabilities(): Promise<AppResult<RuntimeCapabilities>>;
  listProjects(): Promise<AppResult<ProjectSummary[]>>;
  openExternalUrl(input: OpenExternalUrlInput): Promise<AppResult<EmptyPayload>>;
  openProject(input: OpenProjectInput): Promise<AppResult<ActiveProject>>;
  submitLayoutMeasurementResult(input: LayoutMeasurementResult): Promise<AppResult<EmptyPayload>>;
  subscribeToLayoutMeasurementRequests(
    listener: (request: LayoutMeasurementRequest) => void
  ): () => void;
  subscribeToRuntimeEvents(listener: (event: RuntimeEvent) => void): () => void;
}

export function ok<T>(data: T): AppResult<T> {
  return { ok: true, data };
}

export function err(code: AppErrorCode, message: string): AppResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

export function assertOk<T>(result: AppResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }

  return result.data;
}
