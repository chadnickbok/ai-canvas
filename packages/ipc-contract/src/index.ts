import { z } from "zod";

import { rendererDocumentSchema } from "@ai-canvas/document-core";

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
  document: rendererDocumentSchema
});

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

export const applyCommandsInputSchema = z.object({
  document_id: z.string().min(1),
  commands: z.array(z.object({ type: z.string() })),
  base_revision: z.number().int().nonnegative().optional()
});

export const appErrorCodeSchema = z.enum([
  "internal_error",
  "measurement_surface_unavailable",
  "not_found",
  "not_implemented",
  "validation_failed"
]);

export const appErrorSchema = z.object({
  code: appErrorCodeSchema,
  message: z.string()
});

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
  revision: z.number().int().nonnegative()
});

export const appChannelNames = {
  applyCommands: "app:applyCommands",
  createProject: "app:createProject",
  getActiveProject: "app:getActiveProject",
  getMcpStatus: "app:getMcpStatus",
  getRuntimeCapabilities: "app:getRuntimeCapabilities",
  listProjects: "app:listProjects",
  openExternalUrl: "app:openExternalUrl",
  openProject: "app:openProject"
} as const;

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type RuntimeCapabilities = z.infer<typeof runtimeCapabilitiesSchema>;
export type McpStatus = z.infer<typeof mcpStatusSchema>;
export type McpStatusState = z.infer<typeof mcpStatusStateSchema>;
export type McpStatusErrorCode = z.infer<typeof mcpStatusErrorCodeSchema>;
export type ActiveProject = z.infer<typeof activeProjectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type OpenProjectInput = z.infer<typeof openProjectInputSchema>;
export type OpenExternalUrlInput = z.infer<typeof openExternalUrlInputSchema>;
export type ApplyCommandsInput = z.infer<typeof applyCommandsInputSchema>;
export type AppErrorCode = z.infer<typeof appErrorCodeSchema>;
export type AppError = z.infer<typeof appErrorSchema>;
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
