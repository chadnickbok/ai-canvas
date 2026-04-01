import { z } from "zod";

import {
  assetRecordSchema,
  assetSourceAttributeValueSchema,
  assetSourceSchema,
  canvasSemanticSlotSchema,
  nodeSemanticSlotSchema,
  opaqueValueSchema,
  renderStyleValueSchema,
  rendererDocumentSchema,
  rendererNodeKindSchema,
  rendererVariableModeSchema,
  rendererVariableSchema,
  styleFamilySchema,
  svgDefinitionSchema,
  svgPrimitivePayloadSchema,
  svgNodePayloadSchema,
  textNodePayloadSchema,
  typographyTokenValueSchema
} from "./types.js";

export const COMMAND_TYPES = [
  "create_scene",
  "update_scene",
  "delete_scene",
  "update_scene_metadata",
  "create_node",
  "update_node",
  "reparent_node",
  "reorder_children",
  "delete_node",
  "update_text_content",
  "set_canvas_local_value",
  "clear_canvas_local_value",
  "bind_canvas_variable",
  "clear_canvas_variable_binding",
  "set_node_local_value",
  "clear_node_local_value",
  "bind_node_variable",
  "clear_node_variable_binding",
  "bind_node_style",
  "clear_node_style_binding",
  "create_variable_collection",
  "update_variable_collection",
  "delete_variable_collection",
  "create_variable",
  "update_variable",
  "delete_variable",
  "create_style",
  "update_style",
  "delete_style",
  "create_asset",
  "update_asset",
  "delete_asset",
  "update_svg_root",
  "update_svg_primitive"
] as const;

export const commandTypeSchema = z.enum(COMMAND_TYPES);

export const renderStylePatchSchema = z.record(
  z.string(),
  z.union([renderStyleValueSchema, z.null()])
);

export const sceneMetadataPatchSchema = z
  .object({
    group: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    tags: z.array(z.string()).optional()
  })
  .strict();

const sceneMetadataCreateSchema = z
  .object({
    group: z.string().optional(),
    notes: z.string().optional(),
    role: z.string().optional(),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional()
  })
  .strict();

const baseCreateNodePayloadSchema = z
  .object({
    id: z.string(),
    kind: rendererNodeKindSchema,
    name: z.string(),
    left: renderStyleValueSchema.optional(),
    top: renderStyleValueSchema.optional(),
    width: renderStyleValueSchema.optional(),
    height: renderStyleValueSchema.optional(),
    is_visible: z.boolean().optional(),
    is_locked: z.boolean().optional(),
    render_style: z.record(z.string(), renderStyleValueSchema).optional()
  })
  .strict();

const createFrameNodePayloadSchema = baseCreateNodePayloadSchema.extend({
  kind: z.literal("frame")
});

const createRectangleNodePayloadSchema = baseCreateNodePayloadSchema.extend({
  kind: z.literal("rectangle")
});

const createTextNodePayloadSchema = baseCreateNodePayloadSchema.extend({
  kind: z.literal("text"),
  text: textNodePayloadSchema
});

const createSvgNodePayloadSchema = baseCreateNodePayloadSchema.extend({
  kind: z.literal("svg"),
  svg: svgNodePayloadSchema
});

const createSvgVisualElementNodePayloadSchema = baseCreateNodePayloadSchema.extend({
  kind: z.literal("svg-visual-element"),
  svg_primitive: svgPrimitivePayloadSchema
});

export const createNodePayloadSchema = z.union([
  createFrameNodePayloadSchema,
  createRectangleNodePayloadSchema,
  createTextNodePayloadSchema,
  createSvgNodePayloadSchema,
  createSvgVisualElementNodePayloadSchema
]);

const styleSlotValueSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("value"),
      value: z.union([z.string(), z.number()])
    })
    .strict(),
  z
    .object({
      kind: z.literal("variable"),
      variable_id: z.string()
    })
    .strict()
]);

const createPaintStyleCommandSchema = z
  .object({
    type: z.literal("create_style"),
    style: z
      .object({
        id: z.string(),
        family: z.literal("paint"),
        name: z.string(),
        description: z.string().optional(),
        slots: z
          .object({
            "node.paint.background_color": styleSlotValueSchema.optional(),
            "node.shape.border_radius": styleSlotValueSchema.optional(),
            "node.paint.opacity": styleSlotValueSchema.optional()
          })
          .strict()
      })
      .strict()
  })
  .strict();

const createTextStyleCommandSchema = z
  .object({
    type: z.literal("create_style"),
    style: z
      .object({
        id: z.string(),
        family: z.literal("text"),
        name: z.string(),
        description: z.string().optional(),
        slots: z
          .object({
            "node.text.color": styleSlotValueSchema.optional(),
            "node.typography.font_family": styleSlotValueSchema.optional(),
            "node.typography.font_size": styleSlotValueSchema.optional(),
            "node.typography.font_weight": styleSlotValueSchema.optional(),
            "node.typography.line_height": styleSlotValueSchema.optional(),
            "node.typography.letter_spacing": styleSlotValueSchema.optional()
          })
          .strict()
      })
      .strict()
  })
  .strict();

export const createStyleCommandSchema = z.union([
  createPaintStyleCommandSchema,
  createTextStyleCommandSchema
]);

const updatePaintStyleCommandSchema = z
  .object({
    type: z.literal("update_style"),
    family: z.literal("paint"),
    style_id: z.string(),
    patch: z
      .object({
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        slots: z
          .object({
            "node.paint.background_color": styleSlotValueSchema.nullable().optional(),
            "node.shape.border_radius": styleSlotValueSchema.nullable().optional(),
            "node.paint.opacity": styleSlotValueSchema.nullable().optional()
          })
          .strict()
          .optional()
      })
      .strict()
  })
  .strict();

const updateTextStyleCommandSchema = z
  .object({
    type: z.literal("update_style"),
    family: z.literal("text"),
    style_id: z.string(),
    patch: z
      .object({
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        slots: z
          .object({
            "node.text.color": styleSlotValueSchema.nullable().optional(),
            "node.typography.font_family": styleSlotValueSchema.nullable().optional(),
            "node.typography.font_size": styleSlotValueSchema.nullable().optional(),
            "node.typography.font_weight": styleSlotValueSchema.nullable().optional(),
            "node.typography.line_height": styleSlotValueSchema.nullable().optional(),
            "node.typography.letter_spacing": styleSlotValueSchema.nullable().optional()
          })
          .strict()
          .optional()
      })
      .strict()
  })
  .strict();

export const updateStyleCommandSchema = z.union([
  updatePaintStyleCommandSchema,
  updateTextStyleCommandSchema
]);

const variableValueByModeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("value"),
      value: z.union([z.string(), z.number(), typographyTokenValueSchema])
    })
    .strict(),
  z
    .object({
      kind: z.literal("alias"),
      variable_id: z.string()
    })
    .strict()
]);

export const createSceneCommandSchema = z
  .object({
    type: z.literal("create_scene"),
    scene: z
      .object({
        id: z.string(),
        name: z.string(),
        left: renderStyleValueSchema.optional(),
        top: renderStyleValueSchema.optional(),
        width: renderStyleValueSchema.optional(),
        height: renderStyleValueSchema.optional(),
        scene_metadata: sceneMetadataCreateSchema.optional(),
        render_style: z.record(z.string(), renderStyleValueSchema).optional()
      })
      .strict()
  })
  .strict();

export const updateSceneCommandSchema = z
  .object({
    type: z.literal("update_scene"),
    scene_id: z.string(),
    patch: z
      .object({
        name: z.string().optional(),
        left: renderStyleValueSchema.optional(),
        top: renderStyleValueSchema.optional(),
        width: renderStyleValueSchema.optional(),
        height: renderStyleValueSchema.optional(),
        render_style: renderStylePatchSchema.optional()
      })
      .strict()
  })
  .strict();

export const deleteSceneCommandSchema = z
  .object({
    type: z.literal("delete_scene"),
    scene_id: z.string()
  })
  .strict();

export const updateSceneMetadataCommandSchema = z
  .object({
    type: z.literal("update_scene_metadata"),
    scene_id: z.string(),
    patch: sceneMetadataPatchSchema
  })
  .strict();

export const createNodeCommandSchema = z
  .object({
    type: z.literal("create_node"),
    node: createNodePayloadSchema,
    parent: z
      .object({
        parent_id: z.string().nullable(),
        index: z.number().int().min(0).optional()
      })
      .strict()
  })
  .strict();

export const updateNodeCommandSchema = z
  .object({
    type: z.literal("update_node"),
    node_id: z.string(),
    patch: z
      .object({
        name: z.string().optional(),
        is_visible: z.boolean().optional(),
        is_locked: z.boolean().optional(),
        left: renderStyleValueSchema.optional(),
        top: renderStyleValueSchema.optional(),
        width: renderStyleValueSchema.optional(),
        height: renderStyleValueSchema.optional(),
        render_style: renderStylePatchSchema.optional()
      })
      .strict()
  })
  .strict();

export const reparentNodeCommandSchema = z
  .object({
    type: z.literal("reparent_node"),
    node_id: z.string(),
    destination: z
      .object({
        parent_id: z.string().nullable(),
        index: z.number().int().min(0).optional()
      })
      .strict()
  })
  .strict();

export const reorderChildrenCommandSchema = z
  .object({
    type: z.literal("reorder_children"),
    container: z
      .object({
        parent_id: z.string().nullable()
      })
      .strict(),
    child_ids: z.array(z.string())
  })
  .strict();

export const deleteNodeCommandSchema = z
  .object({
    type: z.literal("delete_node"),
    node_id: z.string()
  })
  .strict();

export const updateTextContentCommandSchema = z
  .object({
    type: z.literal("update_text_content"),
    node_id: z.string(),
    content: z.string()
  })
  .strict();

export const setCanvasLocalValueCommandSchema = z
  .object({
    type: z.literal("set_canvas_local_value"),
    slot: canvasSemanticSlotSchema,
    value: renderStyleValueSchema
  })
  .strict();

export const clearCanvasLocalValueCommandSchema = z
  .object({
    type: z.literal("clear_canvas_local_value"),
    slot: canvasSemanticSlotSchema
  })
  .strict();

export const bindCanvasVariableCommandSchema = z
  .object({
    type: z.literal("bind_canvas_variable"),
    slot: canvasSemanticSlotSchema,
    variable_id: z.string()
  })
  .strict();

export const clearCanvasVariableBindingCommandSchema = z
  .object({
    type: z.literal("clear_canvas_variable_binding"),
    slot: canvasSemanticSlotSchema
  })
  .strict();

export const setNodeLocalValueCommandSchema = z
  .object({
    type: z.literal("set_node_local_value"),
    node_id: z.string(),
    slot: nodeSemanticSlotSchema,
    value: renderStyleValueSchema
  })
  .strict();

export const clearNodeLocalValueCommandSchema = z
  .object({
    type: z.literal("clear_node_local_value"),
    node_id: z.string(),
    slot: nodeSemanticSlotSchema
  })
  .strict();

export const bindNodeVariableCommandSchema = z
  .object({
    type: z.literal("bind_node_variable"),
    node_id: z.string(),
    slot: nodeSemanticSlotSchema,
    variable_id: z.string()
  })
  .strict();

export const clearNodeVariableBindingCommandSchema = z
  .object({
    type: z.literal("clear_node_variable_binding"),
    node_id: z.string(),
    slot: nodeSemanticSlotSchema
  })
  .strict();

export const bindNodeStyleCommandSchema = z
  .object({
    type: z.literal("bind_node_style"),
    node_id: z.string(),
    family: styleFamilySchema,
    style_id: z.string()
  })
  .strict();

export const clearNodeStyleBindingCommandSchema = z
  .object({
    type: z.literal("clear_node_style_binding"),
    node_id: z.string(),
    family: styleFamilySchema
  })
  .strict();

export const createVariableCollectionCommandSchema = z
  .object({
    type: z.literal("create_variable_collection"),
    collection: z
      .object({
        id: z.string(),
        name: z.string(),
        default_mode_id: z.string(),
        modes: z.record(z.string(), rendererVariableModeSchema),
        description: z.string().optional()
      })
      .strict()
  })
  .strict();

export const updateVariableCollectionCommandSchema = z
  .object({
    type: z.literal("update_variable_collection"),
    collection_id: z.string(),
    patch: z
      .object({
        name: z.string().optional(),
        default_mode_id: z.string().optional(),
        description: z.string().nullable().optional()
      })
      .strict()
  })
  .strict();

export const deleteVariableCollectionCommandSchema = z
  .object({
    type: z.literal("delete_variable_collection"),
    collection_id: z.string()
  })
  .strict();

export const createVariableCommandSchema = z
  .object({
    type: z.literal("create_variable"),
    variable: rendererVariableSchema
  })
  .strict();

export const updateVariableCommandSchema = z
  .object({
    type: z.literal("update_variable"),
    variable_id: z.string(),
    patch: z
      .object({
        group_path: z.array(z.string()).optional(),
        name: z.string().optional(),
        scopes: z.array(z.union([canvasSemanticSlotSchema, nodeSemanticSlotSchema])).optional(),
        values_by_mode: z.record(z.string(), variableValueByModeSchema).optional(),
        description: z.string().nullable().optional()
      })
      .strict()
  })
  .strict();

export const deleteVariableCommandSchema = z
  .object({
    type: z.literal("delete_variable"),
    variable_id: z.string()
  })
  .strict();

export const deleteStyleCommandSchema = z
  .object({
    type: z.literal("delete_style"),
    family: styleFamilySchema,
    style_id: z.string()
  })
  .strict();

export const createAssetCommandSchema = z
  .object({
    type: z.literal("create_asset"),
    asset: assetRecordSchema
  })
  .strict();

export const updateAssetCommandSchema = z
  .object({
    type: z.literal("update_asset"),
    asset_id: z.string(),
    patch: z
      .object({
        width: z.number().nullable().optional(),
        height: z.number().nullable().optional(),
        metadata: z.record(z.string(), opaqueValueSchema).nullable().optional(),
        source: assetSourceSchema.optional()
      })
      .strict()
  })
  .strict();

export const deleteAssetCommandSchema = z
  .object({
    type: z.literal("delete_asset"),
    asset_id: z.string()
  })
  .strict();

export const updateSvgRootCommandSchema = z
  .object({
    type: z.literal("update_svg_root"),
    node_id: z.string(),
    patch: z
      .object({
        definitions: z.array(svgDefinitionSchema).optional(),
        preserve_aspect_ratio: z.string().nullable().optional(),
        raw_root_attributes: z.record(z.string(), assetSourceAttributeValueSchema).optional(),
        view_box: z.string().nullable().optional()
      })
      .strict()
  })
  .strict();

export const updateSvgPrimitiveCommandSchema = z
  .object({
    type: z.literal("update_svg_primitive"),
    node_id: z.string(),
    patch: z
      .object({
        element_name: z.string().optional(),
        order: z.number().optional(),
        attributes: z.record(z.string(), assetSourceAttributeValueSchema).optional()
      })
      .strict()
  })
  .strict();

export const commandSchemaByType = {
  create_scene: createSceneCommandSchema,
  update_scene: updateSceneCommandSchema,
  delete_scene: deleteSceneCommandSchema,
  update_scene_metadata: updateSceneMetadataCommandSchema,
  create_node: createNodeCommandSchema,
  update_node: updateNodeCommandSchema,
  reparent_node: reparentNodeCommandSchema,
  reorder_children: reorderChildrenCommandSchema,
  delete_node: deleteNodeCommandSchema,
  update_text_content: updateTextContentCommandSchema,
  set_canvas_local_value: setCanvasLocalValueCommandSchema,
  clear_canvas_local_value: clearCanvasLocalValueCommandSchema,
  bind_canvas_variable: bindCanvasVariableCommandSchema,
  clear_canvas_variable_binding: clearCanvasVariableBindingCommandSchema,
  set_node_local_value: setNodeLocalValueCommandSchema,
  clear_node_local_value: clearNodeLocalValueCommandSchema,
  bind_node_variable: bindNodeVariableCommandSchema,
  clear_node_variable_binding: clearNodeVariableBindingCommandSchema,
  bind_node_style: bindNodeStyleCommandSchema,
  clear_node_style_binding: clearNodeStyleBindingCommandSchema,
  create_variable_collection: createVariableCollectionCommandSchema,
  update_variable_collection: updateVariableCollectionCommandSchema,
  delete_variable_collection: deleteVariableCollectionCommandSchema,
  create_variable: createVariableCommandSchema,
  update_variable: updateVariableCommandSchema,
  delete_variable: deleteVariableCommandSchema,
  create_style: createStyleCommandSchema,
  update_style: updateStyleCommandSchema,
  delete_style: deleteStyleCommandSchema,
  create_asset: createAssetCommandSchema,
  update_asset: updateAssetCommandSchema,
  delete_asset: deleteAssetCommandSchema,
  update_svg_root: updateSvgRootCommandSchema,
  update_svg_primitive: updateSvgPrimitiveCommandSchema
} as const;

export const commandSchema = z.union(Object.values(commandSchemaByType));

export const applyCommandsInputSchema = z
  .object({
    document_id: z.string(),
    commands: z.array(commandSchema),
    base_revision: z.number().int().optional()
  })
  .strict();

export const applyCommandsEffectsSchema = z
  .object({
    changed_node_ids: z.array(z.string()).optional(),
    changed_scene_ids: z.array(z.string()).optional(),
    changed_asset_ids: z.array(z.string()).optional(),
    changed_variable_ids: z.array(z.string()).optional(),
    changed_style_ids: z.array(z.string()).optional()
  })
  .strict();

export const applyCommandsSuccessSchema = z
  .object({
    ok: z.literal(true),
    document_id: z.string(),
    revision: z.number().int(),
    document: rendererDocumentSchema,
    effects: applyCommandsEffectsSchema.optional()
  })
  .strict();

export const applyCommandsErrorCodeSchema = z.enum([
  "revision_conflict",
  "validation_failed",
  "unrecoverable_command",
  "unknown_command",
  "target_not_found",
  "measurement_surface_unavailable"
]);

export const applyCommandsErrorSchema = z
  .object({
    ok: z.literal(false),
    document_id: z.string(),
    revision: z.number().int().optional(),
    error: z
      .object({
        code: applyCommandsErrorCodeSchema,
        message: z.string(),
        command_index: z.number().int().min(0).optional(),
        details: z.record(z.string(), opaqueValueSchema).optional()
      })
      .strict()
  })
  .strict();

export const applyCommandsResultSchema = z.union([
  applyCommandsSuccessSchema,
  applyCommandsErrorSchema
]);

export type CommandType = z.infer<typeof commandTypeSchema>;
export type RenderStylePatch = z.infer<typeof renderStylePatchSchema>;
export type SceneMetadataPatch = z.infer<typeof sceneMetadataPatchSchema>;
export type CreateNodePayload = z.infer<typeof createNodePayloadSchema>;
export type CreateSceneCommand = z.infer<typeof createSceneCommandSchema>;
export type UpdateSceneCommand = z.infer<typeof updateSceneCommandSchema>;
export type DeleteSceneCommand = z.infer<typeof deleteSceneCommandSchema>;
export type UpdateSceneMetadataCommand = z.infer<typeof updateSceneMetadataCommandSchema>;
export type CreateNodeCommand = z.infer<typeof createNodeCommandSchema>;
export type UpdateNodeCommand = z.infer<typeof updateNodeCommandSchema>;
export type ReparentNodeCommand = z.infer<typeof reparentNodeCommandSchema>;
export type ReorderChildrenCommand = z.infer<typeof reorderChildrenCommandSchema>;
export type DeleteNodeCommand = z.infer<typeof deleteNodeCommandSchema>;
export type UpdateTextContentCommand = z.infer<typeof updateTextContentCommandSchema>;
export type SetCanvasLocalValueCommand = z.infer<typeof setCanvasLocalValueCommandSchema>;
export type ClearCanvasLocalValueCommand = z.infer<typeof clearCanvasLocalValueCommandSchema>;
export type BindCanvasVariableCommand = z.infer<typeof bindCanvasVariableCommandSchema>;
export type ClearCanvasVariableBindingCommand = z.infer<typeof clearCanvasVariableBindingCommandSchema>;
export type SetNodeLocalValueCommand = z.infer<typeof setNodeLocalValueCommandSchema>;
export type ClearNodeLocalValueCommand = z.infer<typeof clearNodeLocalValueCommandSchema>;
export type BindNodeVariableCommand = z.infer<typeof bindNodeVariableCommandSchema>;
export type ClearNodeVariableBindingCommand = z.infer<typeof clearNodeVariableBindingCommandSchema>;
export type BindNodeStyleCommand = z.infer<typeof bindNodeStyleCommandSchema>;
export type ClearNodeStyleBindingCommand = z.infer<typeof clearNodeStyleBindingCommandSchema>;
export type CreateVariableCollectionCommand = z.infer<typeof createVariableCollectionCommandSchema>;
export type UpdateVariableCollectionCommand = z.infer<typeof updateVariableCollectionCommandSchema>;
export type DeleteVariableCollectionCommand = z.infer<typeof deleteVariableCollectionCommandSchema>;
export type CreateVariableCommand = z.infer<typeof createVariableCommandSchema>;
export type UpdateVariableCommand = z.infer<typeof updateVariableCommandSchema>;
export type DeleteVariableCommand = z.infer<typeof deleteVariableCommandSchema>;
export type CreateStyleCommand = z.infer<typeof createStyleCommandSchema>;
export type UpdateStyleCommand = z.infer<typeof updateStyleCommandSchema>;
export type DeleteStyleCommand = z.infer<typeof deleteStyleCommandSchema>;
export type CreateAssetCommand = z.infer<typeof createAssetCommandSchema>;
export type UpdateAssetCommand = z.infer<typeof updateAssetCommandSchema>;
export type DeleteAssetCommand = z.infer<typeof deleteAssetCommandSchema>;
export type UpdateSvgRootCommand = z.infer<typeof updateSvgRootCommandSchema>;
export type UpdateSvgPrimitiveCommand = z.infer<typeof updateSvgPrimitiveCommandSchema>;
export type Command = z.infer<typeof commandSchema>;
export type ApplyCommandsInput = z.infer<typeof applyCommandsInputSchema>;
export type ApplyCommandsEffects = z.infer<typeof applyCommandsEffectsSchema>;
export type ApplyCommandsSuccess = z.infer<typeof applyCommandsSuccessSchema>;
export type ApplyCommandsErrorCode = z.infer<typeof applyCommandsErrorCodeSchema>;
export type ApplyCommandsError = z.infer<typeof applyCommandsErrorSchema>;
export type ApplyCommandsResult = z.infer<typeof applyCommandsResultSchema>;

export function isCommandType(value: unknown): value is CommandType {
  return commandTypeSchema.safeParse(value).success;
}

export function parseApplyCommandsInput(input: unknown): ApplyCommandsInput {
  return applyCommandsInputSchema.parse(input);
}

export function parseCommand(input: unknown): Command {
  return commandSchema.parse(input);
}
