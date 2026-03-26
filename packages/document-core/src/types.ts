import { z } from "zod";

import { DEFAULT_RENDER_CANON, DEFAULT_SCHEMA_VERSION, NODE_KINDS } from "./constants.js";

export const renderStyleValueSchema = z.union([z.string(), z.number()]);

export const computedLayoutSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number()
});

export const rendererCanvasAuthoringSchema = z.object({
  local_values: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  variable_bindings: z.record(z.string(), z.string()).default({})
});

export const rendererCanvasSchema = z.object({
  extent_mode: z.literal("infinite").default("infinite"),
  background_color: z.string().optional(),
  authoring: rendererCanvasAuthoringSchema.default({
    local_values: {},
    variable_bindings: {}
  })
});

export const canvasRootSchema = z.object({
  id: z.string(),
  child_ids: z.array(z.string())
});

export const rendererSceneMetadataSchema = z.object({
  group: z.string().optional(),
  notes: z.string().optional(),
  role: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([])
});

export const sceneRecordSchema = z.object({
  id: z.string(),
  frame_node_id: z.string(),
  name: z.string(),
  child_count: z.number(),
  scene_metadata: rendererSceneMetadataSchema
});

export const rendererNodeAuthoringSchema = z.object({
  local_values: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  variable_bindings: z.record(z.string(), z.string()).default({}),
  style_bindings: z.record(z.string(), z.string()).default({})
});

export const rendererNodeKindSchema = z.enum(NODE_KINDS);

export const rendererNodeSchema = z.object({
  id: z.string(),
  kind: rendererNodeKindSchema,
  name: z.string(),
  parent_id: z.string().nullable(),
  child_ids: z.array(z.string()),
  scene_id: z.string().nullable(),
  render_style: z.record(z.string(), renderStyleValueSchema).default({}),
  computed_layout: computedLayoutSchema.optional(),
  is_visible: z.boolean().default(true),
  is_locked: z.boolean().default(false),
  authoring: rendererNodeAuthoringSchema.default({
    local_values: {},
    variable_bindings: {},
    style_bindings: {}
  }),
  text_content: z.string().optional()
});

export const assetRecordSchema = z.object({
  id: z.string(),
  kind: z.string().optional(),
  mime_type: z.string().optional(),
  storage_path: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional()
});

export const rendererVariablesSchema = z.object({
  collections: z.record(z.string(), z.unknown()).default({})
});

export const rendererStylesSchema = z.object({
  paint: z.record(z.string(), z.unknown()).default({}),
  text: z.record(z.string(), z.unknown()).default({})
});

export const rendererDocumentSourceSchema = z.object({
  kind: z.literal("ai-canvas"),
  created_at: z.string().optional(),
  imported_at: z.string().optional(),
  source_document_id: z.string().optional(),
  source_file_name: z.string().optional(),
  source_page_name: z.string().optional()
});

export const rendererDocumentSchema = z.object({
  schema_version: z.literal(DEFAULT_SCHEMA_VERSION),
  render_canon: z.literal(DEFAULT_RENDER_CANON),
  document_id: z.string(),
  name: z.string(),
  page_name: z.string(),
  source: rendererDocumentSourceSchema,
  canvas: rendererCanvasSchema,
  root: canvasRootSchema,
  scenes: z.record(z.string(), sceneRecordSchema),
  nodes: z.record(z.string(), rendererNodeSchema),
  assets: z.record(z.string(), assetRecordSchema),
  variables: rendererVariablesSchema,
  styles: rendererStylesSchema
});

export type RenderStyleValue = z.infer<typeof renderStyleValueSchema>;
export type ComputedLayout = z.infer<typeof computedLayoutSchema>;
export type RendererCanvasAuthoring = z.infer<typeof rendererCanvasAuthoringSchema>;
export type RendererCanvas = z.infer<typeof rendererCanvasSchema>;
export type CanvasRoot = z.infer<typeof canvasRootSchema>;
export type RendererSceneMetadata = z.infer<typeof rendererSceneMetadataSchema>;
export type SceneRecord = z.infer<typeof sceneRecordSchema>;
export type RendererNodeAuthoring = z.infer<typeof rendererNodeAuthoringSchema>;
export type RendererNodeKind = z.infer<typeof rendererNodeKindSchema>;
export type RendererNode = z.infer<typeof rendererNodeSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;
export type RendererVariables = z.infer<typeof rendererVariablesSchema>;
export type RendererStyles = z.infer<typeof rendererStylesSchema>;
export type RendererDocumentSource = z.infer<typeof rendererDocumentSourceSchema>;
export type RendererDocument = z.infer<typeof rendererDocumentSchema>;
