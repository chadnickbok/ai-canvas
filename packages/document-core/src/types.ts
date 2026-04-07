import { z } from 'zod';

import {
  ASSET_KINDS,
  CANVAS_SEMANTIC_SLOTS,
  CONTAINER_NODE_KINDS,
  DEFAULT_RENDER_CANON,
  DEFAULT_SCHEMA_VERSION,
  LEAF_NODE_KINDS,
  NODE_KINDS,
  NODE_KIND_SEMANTIC_SLOTS,
  NODE_KIND_STYLE_FAMILIES,
  NODE_SEMANTIC_SLOTS,
  RENDERER_SEMANTIC_SLOTS,
  STYLE_FAMILIES,
  VARIABLE_KINDS,
} from './constants.js';

export const renderStyleValueSchema = z.union([z.string(), z.number()]);

export const computedLayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const canvasSemanticSlotSchema = z.enum(CANVAS_SEMANTIC_SLOTS);
export const nodeSemanticSlotSchema = z.enum(NODE_SEMANTIC_SLOTS);
export const rendererSemanticSlotSchema = z.enum(RENDERER_SEMANTIC_SLOTS);
export const styleFamilySchema = z.enum(STYLE_FAMILIES);
export const rendererNodeKindSchema = z.enum(NODE_KINDS);
export const leafNodeKindSchema = z.enum(LEAF_NODE_KINDS);
export const containerNodeKindSchema = z.enum(CONTAINER_NODE_KINDS);
export const variableKindSchema = z.enum(VARIABLE_KINDS);
export const assetKindSchema = z.enum(ASSET_KINDS);

export const canvasLocalValuesSchema = z
  .object({
    'canvas.background_color': renderStyleValueSchema.optional(),
  })
  .strict();

export const canvasVariableBindingsSchema = z
  .object({
    'canvas.background_color': z.string().optional(),
  })
  .strict();

export const rendererCanvasAuthoringSchema = z
  .object({
    local_values: canvasLocalValuesSchema,
    variable_bindings: canvasVariableBindingsSchema,
  })
  .strict();

export const rendererCanvasSchema = z.object({
  extent_mode: z.literal('infinite'),
  background_color: z.string().optional(),
  authoring: rendererCanvasAuthoringSchema,
});

export const canvasRootSchema = z.object({
  id: z.string(),
  child_ids: z.array(z.string()),
});

export const rendererSceneMetadataSchema = z.object({
  group: z.string().optional(),
  notes: z.string().optional(),
  role: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()),
});

export const sceneRecordSchema = z.object({
  id: z.string(),
  frame_node_id: z.string(),
  name: z.string(),
  child_count: z.number(),
  scene_metadata: rendererSceneMetadataSchema,
});

export const nodeLocalValuesSchema = z
  .object({
    'node.layout.gap': renderStyleValueSchema.optional(),
    'node.layout.padding_top': renderStyleValueSchema.optional(),
    'node.layout.padding_right': renderStyleValueSchema.optional(),
    'node.layout.padding_bottom': renderStyleValueSchema.optional(),
    'node.layout.padding_left': renderStyleValueSchema.optional(),
    'node.paint.background_color': renderStyleValueSchema.optional(),
    'node.paint.opacity': renderStyleValueSchema.optional(),
    'node.shape.border_radius': renderStyleValueSchema.optional(),
    'node.text.color': renderStyleValueSchema.optional(),
    'node.typography.font_family': renderStyleValueSchema.optional(),
    'node.typography.font_size': renderStyleValueSchema.optional(),
    'node.typography.font_weight': renderStyleValueSchema.optional(),
    'node.typography.line_height': renderStyleValueSchema.optional(),
    'node.typography.letter_spacing': renderStyleValueSchema.optional(),
  })
  .strict();

export const nodeVariableBindingsSchema = z
  .object({
    'node.layout.gap': z.string().optional(),
    'node.layout.padding_top': z.string().optional(),
    'node.layout.padding_right': z.string().optional(),
    'node.layout.padding_bottom': z.string().optional(),
    'node.layout.padding_left': z.string().optional(),
    'node.paint.background_color': z.string().optional(),
    'node.paint.opacity': z.string().optional(),
    'node.shape.border_radius': z.string().optional(),
    'node.text.color': z.string().optional(),
    'node.typography.font_family': z.string().optional(),
    'node.typography.font_size': z.string().optional(),
    'node.typography.font_weight': z.string().optional(),
    'node.typography.line_height': z.string().optional(),
    'node.typography.letter_spacing': z.string().optional(),
  })
  .strict();

export const nodeStyleBindingsSchema = z
  .object({
    paint: z.string().optional(),
    text: z.string().optional(),
  })
  .strict();

export const frameNodeLocalValuesSchema = nodeLocalValuesSchema
  .pick({
    'node.layout.gap': true,
    'node.layout.padding_top': true,
    'node.layout.padding_right': true,
    'node.layout.padding_bottom': true,
    'node.layout.padding_left': true,
    'node.paint.background_color': true,
    'node.paint.opacity': true,
    'node.shape.border_radius': true,
  })
  .strict();

export const rectangleNodeLocalValuesSchema = nodeLocalValuesSchema
  .pick({
    'node.paint.background_color': true,
    'node.paint.opacity': true,
    'node.shape.border_radius': true,
  })
  .strict();

export const textNodeLocalValuesSchema = nodeLocalValuesSchema
  .pick({
    'node.text.color': true,
    'node.typography.font_family': true,
    'node.typography.font_size': true,
    'node.typography.font_weight': true,
    'node.typography.line_height': true,
    'node.typography.letter_spacing': true,
  })
  .strict();

export const emptyNodeLocalValuesSchema = z.object({}).strict();

export const frameNodeVariableBindingsSchema = nodeVariableBindingsSchema
  .pick({
    'node.layout.gap': true,
    'node.layout.padding_top': true,
    'node.layout.padding_right': true,
    'node.layout.padding_bottom': true,
    'node.layout.padding_left': true,
    'node.paint.background_color': true,
    'node.paint.opacity': true,
    'node.shape.border_radius': true,
  })
  .strict();

export const rectangleNodeVariableBindingsSchema = nodeVariableBindingsSchema
  .pick({
    'node.paint.background_color': true,
    'node.paint.opacity': true,
    'node.shape.border_radius': true,
  })
  .strict();

export const textNodeVariableBindingsSchema = nodeVariableBindingsSchema
  .pick({
    'node.text.color': true,
    'node.typography.font_family': true,
    'node.typography.font_size': true,
    'node.typography.font_weight': true,
    'node.typography.line_height': true,
    'node.typography.letter_spacing': true,
  })
  .strict();

export const emptyNodeVariableBindingsSchema = z.object({}).strict();

export const frameNodeStyleBindingsSchema = nodeStyleBindingsSchema
  .pick({
    paint: true,
  })
  .strict();

export const rectangleNodeStyleBindingsSchema = nodeStyleBindingsSchema
  .pick({
    paint: true,
  })
  .strict();

export const textNodeStyleBindingsSchema = nodeStyleBindingsSchema
  .pick({
    text: true,
  })
  .strict();

export const emptyNodeStyleBindingsSchema = z.object({}).strict();

export const frameNodeAuthoringSchema = z
  .object({
    local_values: frameNodeLocalValuesSchema,
    variable_bindings: frameNodeVariableBindingsSchema,
    style_bindings: frameNodeStyleBindingsSchema,
  })
  .strict();

export const rectangleNodeAuthoringSchema = z
  .object({
    local_values: rectangleNodeLocalValuesSchema,
    variable_bindings: rectangleNodeVariableBindingsSchema,
    style_bindings: rectangleNodeStyleBindingsSchema,
  })
  .strict();

export const textNodeAuthoringSchema = z
  .object({
    local_values: textNodeLocalValuesSchema,
    variable_bindings: textNodeVariableBindingsSchema,
    style_bindings: textNodeStyleBindingsSchema,
  })
  .strict();

export const emptyNodeAuthoringSchema = z
  .object({
    local_values: emptyNodeLocalValuesSchema,
    variable_bindings: emptyNodeVariableBindingsSchema,
    style_bindings: emptyNodeStyleBindingsSchema,
  })
  .strict();

export const rendererNodeAuthoringSchema = z.union([
  frameNodeAuthoringSchema,
  rectangleNodeAuthoringSchema,
  textNodeAuthoringSchema,
  emptyNodeAuthoringSchema,
]);

export type OpaqueValue =
  | null
  | boolean
  | number
  | string
  | OpaqueValue[]
  | { [key: string]: OpaqueValue };

export const opaqueValueSchema: z.ZodType<OpaqueValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(opaqueValueSchema),
    z.record(z.string(), opaqueValueSchema),
  ]),
);

export const assetSourceAttributeValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
]);

export const embeddedDataUriAssetSourceSchema = z.object({
  kind: z.literal('data_uri'),
  data_uri: z.string(),
});

export const embeddedBase64AssetSourceSchema = z.object({
  kind: z.literal('base64'),
  base64: z.string(),
});

export const localAssetStoreSourceSchema = z.object({
  kind: z.literal('asset_store'),
  content_hash: z.string(),
  original_filename: z.string().optional(),
});

export const assetSourceSchema = z.discriminatedUnion('kind', [
  embeddedDataUriAssetSourceSchema,
  embeddedBase64AssetSourceSchema,
  localAssetStoreSourceSchema,
]);

export const liveAssetSourceSchema = localAssetStoreSourceSchema;

export const assetRecordSchema = z.object({
  id: z.string(),
  kind: assetKindSchema,
  mime_type: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  metadata: z.record(z.string(), opaqueValueSchema).optional(),
  source: assetSourceSchema,
});

export const rendererDocumentSourceSchema = z.object({
  kind: z.literal('ai-canvas'),
  created_at: z.string().optional(),
  imported_at: z.string().optional(),
  source_document_id: z.string().optional(),
  source_file_name: z.string().optional(),
  source_page_name: z.string().optional(),
});

export const typographyTokenValueSchema = z.object({
  font_family: z.string(),
  font_size: renderStyleValueSchema,
  font_weight: renderStyleValueSchema.optional(),
  line_height: renderStyleValueSchema.optional(),
  letter_spacing: renderStyleValueSchema.optional(),
});

function createVariableModeValueSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('value'),
      value: valueSchema,
    }),
    z.object({
      kind: z.literal('alias'),
      variable_id: z.string(),
    }),
  ]);
}

export const colorVariableModeValueSchema = createVariableModeValueSchema(
  z.string(),
);
export const radiusVariableModeValueSchema = createVariableModeValueSchema(
  renderStyleValueSchema,
);
export const spacingVariableModeValueSchema = createVariableModeValueSchema(
  renderStyleValueSchema,
);
export const typographyVariableModeValueSchema = createVariableModeValueSchema(
  typographyTokenValueSchema,
);

function createVariableSchema<TKind extends string>(
  kind: TKind,
  modeValueSchema: z.ZodTypeAny,
) {
  return z.object({
    id: z.string(),
    collection_id: z.string(),
    kind: z.literal(kind),
    group_path: z.array(z.string()),
    name: z.string(),
    scopes: z.array(rendererSemanticSlotSchema),
    values_by_mode: z.record(z.string(), modeValueSchema),
    description: z.string().optional(),
  });
}

export const colorVariableSchema = createVariableSchema(
  'color',
  colorVariableModeValueSchema,
);
export const radiusVariableSchema = createVariableSchema(
  'radius',
  radiusVariableModeValueSchema,
);
export const spacingVariableSchema = createVariableSchema(
  'spacing',
  spacingVariableModeValueSchema,
);
export const typographyVariableSchema = createVariableSchema(
  'typography',
  typographyVariableModeValueSchema,
);

export const rendererVariableSchema = z.discriminatedUnion('kind', [
  colorVariableSchema,
  radiusVariableSchema,
  spacingVariableSchema,
  typographyVariableSchema,
]);

export const rendererVariableModeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const rendererVariableCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  default_mode_id: z.string(),
  modes: z.record(z.string(), rendererVariableModeSchema),
  variables: z.record(z.string(), rendererVariableSchema),
  description: z.string().optional(),
});

export const rendererVariablesSchema = z.object({
  collections: z.record(z.string(), rendererVariableCollectionSchema),
});

function createStyleSlotValueSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('value'),
      value: valueSchema,
    }),
    z.object({
      kind: z.literal('variable'),
      variable_id: z.string(),
    }),
  ]);
}

export const paintStyleSlotsSchema = z.object({
  'node.paint.background_color': createStyleSlotValueSchema(
    z.string(),
  ).optional(),
  'node.shape.border_radius': createStyleSlotValueSchema(
    renderStyleValueSchema,
  ).optional(),
  'node.paint.opacity': createStyleSlotValueSchema(
    renderStyleValueSchema,
  ).optional(),
});

export const textStyleSlotsSchema = z.object({
  'node.text.color': createStyleSlotValueSchema(z.string()).optional(),
  'node.typography.font_family': createStyleSlotValueSchema(
    z.string(),
  ).optional(),
  'node.typography.font_size': createStyleSlotValueSchema(
    renderStyleValueSchema,
  ).optional(),
  'node.typography.font_weight': createStyleSlotValueSchema(
    renderStyleValueSchema,
  ).optional(),
  'node.typography.line_height': createStyleSlotValueSchema(
    renderStyleValueSchema,
  ).optional(),
  'node.typography.letter_spacing': createStyleSlotValueSchema(
    renderStyleValueSchema,
  ).optional(),
});

export const rendererPaintStyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  slots: paintStyleSlotsSchema,
});

export const rendererTextStyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  slots: textStyleSlotsSchema,
});

export const rendererStylesSchema = z.object({
  paint: z.record(z.string(), rendererPaintStyleSchema),
  text: z.record(z.string(), rendererTextStyleSchema),
});

export const svgDefinitionSchema = z.object({
  id: z.string().optional(),
  kind: z.string(),
  markup: z.string(),
});

export const svgAttributeBagSchema = z.record(
  z.string(),
  assetSourceAttributeValueSchema,
);

export const textNodePayloadSchema = z.object({
  content: z.string(),
});

export const svgNodePayloadSchema = z.object({
  definitions: z.array(svgDefinitionSchema).optional(),
  preserve_aspect_ratio: z.string().optional(),
  raw_root_attributes: svgAttributeBagSchema.optional(),
  view_box: z.string().optional(),
});

export const svgPrimitivePayloadSchema = z.object({
  element_name: z.string(),
  order: z.number(),
  attributes: svgAttributeBagSchema,
});

export const baseRendererNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
  child_ids: z.array(z.string()),
  scene_id: z.string().nullable(),
  is_visible: z.boolean(),
  is_locked: z.boolean(),
  render_style: z.record(z.string(), renderStyleValueSchema),
  computed_layout: computedLayoutSchema.optional(),
});

export const frameNodeSchema = baseRendererNodeSchema.extend({
  kind: z.literal('frame'),
  authoring: frameNodeAuthoringSchema,
});

export const rectangleNodeSchema = baseRendererNodeSchema.extend({
  kind: z.literal('rectangle'),
  authoring: rectangleNodeAuthoringSchema,
});

export const textNodeSchema = baseRendererNodeSchema.extend({
  kind: z.literal('text'),
  authoring: textNodeAuthoringSchema,
  text: textNodePayloadSchema,
});

export const svgNodeSchema = baseRendererNodeSchema.extend({
  kind: z.literal('svg'),
  authoring: emptyNodeAuthoringSchema,
  svg: svgNodePayloadSchema,
});

export const svgVisualElementNodeSchema = baseRendererNodeSchema.extend({
  kind: z.literal('svg-visual-element'),
  authoring: emptyNodeAuthoringSchema,
  svg_primitive: svgPrimitivePayloadSchema,
});

export const rendererNodeSchema = z.discriminatedUnion('kind', [
  frameNodeSchema,
  rectangleNodeSchema,
  textNodeSchema,
  svgNodeSchema,
  svgVisualElementNodeSchema,
]);

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
  styles: rendererStylesSchema,
});

export type RenderStyleValue = z.infer<typeof renderStyleValueSchema>;
export type ComputedLayout = z.infer<typeof computedLayoutSchema>;
export type CanvasSemanticSlot = z.infer<typeof canvasSemanticSlotSchema>;
export type NodeSemanticSlot = z.infer<typeof nodeSemanticSlotSchema>;
export type RendererSemanticSlot = z.infer<typeof rendererSemanticSlotSchema>;
export type StyleFamily = z.infer<typeof styleFamilySchema>;
export type RendererCanvasAuthoring = z.infer<
  typeof rendererCanvasAuthoringSchema
>;
export type RendererCanvas = z.infer<typeof rendererCanvasSchema>;
export type CanvasRoot = z.infer<typeof canvasRootSchema>;
export type RendererSceneMetadata = z.infer<typeof rendererSceneMetadataSchema>;
export type SceneRecord = z.infer<typeof sceneRecordSchema>;
export type FrameNodeAuthoring = z.infer<typeof frameNodeAuthoringSchema>;
export type RectangleNodeAuthoring = z.infer<
  typeof rectangleNodeAuthoringSchema
>;
export type TextNodeAuthoring = z.infer<typeof textNodeAuthoringSchema>;
export type EmptyNodeAuthoring = z.infer<typeof emptyNodeAuthoringSchema>;
export type RendererNodeAuthoring = z.infer<typeof rendererNodeAuthoringSchema>;
export type RendererNodeKind = z.infer<typeof rendererNodeKindSchema>;
export type AssetSource = z.infer<typeof assetSourceSchema>;
export type EmbeddedDataUriAssetSource = z.infer<typeof embeddedDataUriAssetSourceSchema>;
export type EmbeddedBase64AssetSource = z.infer<typeof embeddedBase64AssetSourceSchema>;
export type EmbeddedAssetSource = EmbeddedDataUriAssetSource | EmbeddedBase64AssetSource;
export type LocalAssetStoreSource = z.infer<typeof localAssetStoreSourceSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;
export type RendererDocumentSource = z.infer<
  typeof rendererDocumentSourceSchema
>;
export type TypographyTokenValue = z.infer<typeof typographyTokenValueSchema>;
export type ColorVariable = z.infer<typeof colorVariableSchema>;
export type RadiusVariable = z.infer<typeof radiusVariableSchema>;
export type SpacingVariable = z.infer<typeof spacingVariableSchema>;
export type TypographyVariable = z.infer<typeof typographyVariableSchema>;
export type RendererVariable = z.infer<typeof rendererVariableSchema>;
export type RendererVariableMode = z.infer<typeof rendererVariableModeSchema>;
export type RendererVariableCollection = z.infer<
  typeof rendererVariableCollectionSchema
>;
export type RendererVariables = z.infer<typeof rendererVariablesSchema>;
export type RendererPaintStyle = z.infer<typeof rendererPaintStyleSchema>;
export type RendererTextStyle = z.infer<typeof rendererTextStyleSchema>;
export type RendererStyles = z.infer<typeof rendererStylesSchema>;
export type TextNodePayload = z.infer<typeof textNodePayloadSchema>;
export type SvgNodePayload = z.infer<typeof svgNodePayloadSchema>;
export type SvgPrimitivePayload = z.infer<typeof svgPrimitivePayloadSchema>;
export type FrameNode = z.infer<typeof frameNodeSchema>;
export type RectangleNode = z.infer<typeof rectangleNodeSchema>;
export type TextNode = z.infer<typeof textNodeSchema>;
export type SvgNode = z.infer<typeof svgNodeSchema>;
export type SvgVisualElementNode = z.infer<typeof svgVisualElementNodeSchema>;
export type RendererNode = z.infer<typeof rendererNodeSchema>;
export type RendererDocument = z.infer<typeof rendererDocumentSchema>;

export function parseDocument(input: unknown): RendererDocument {
  return rendererDocumentSchema.parse(input);
}

export function safeParseDocument(input: unknown) {
  return rendererDocumentSchema.safeParse(input);
}

export function isContainerNode(
  node: RendererNode,
): node is FrameNode | SvgNode {
  return containerNodeKindSchema.safeParse(node.kind).success;
}

export function isLeafNode(
  node: RendererNode,
): node is RectangleNode | TextNode | SvgVisualElementNode {
  return leafNodeKindSchema.safeParse(node.kind).success;
}

export function getAllowedNodeSemanticSlots(kind: RendererNodeKind) {
  return NODE_KIND_SEMANTIC_SLOTS[kind];
}

export function getAllowedStyleFamilies(kind: RendererNodeKind) {
  return NODE_KIND_STYLE_FAMILIES[kind];
}
