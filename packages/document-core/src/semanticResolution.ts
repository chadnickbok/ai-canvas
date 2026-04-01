import { CANVAS_SEMANTIC_SLOTS } from "./constants.js";
import {
  getAllowedNodeSemanticSlots,
  type CanvasSemanticSlot,
  type NodeSemanticSlot,
  type RendererDocument,
  type RendererNode,
  type RendererSemanticSlot,
  type RendererVariable,
  type RendererVariableCollection,
  type RenderStyleValue,
  type StyleFamily,
  type TypographyTokenValue
} from "./types.js";

export const CANVAS_SEMANTIC_SLOT_TO_RENDER_FIELD = {
  "canvas.background_color": "background_color"
} as const satisfies Record<CanvasSemanticSlot, "background_color">;

export const NODE_SEMANTIC_SLOT_TO_RENDER_KEY = {
  "node.layout.gap": "gap",
  "node.layout.padding_top": "paddingTop",
  "node.layout.padding_right": "paddingRight",
  "node.layout.padding_bottom": "paddingBottom",
  "node.layout.padding_left": "paddingLeft",
  "node.paint.background_color": "backgroundColor",
  "node.paint.opacity": "opacity",
  "node.shape.border_radius": "borderRadius",
  "node.text.color": "color",
  "node.typography.font_family": "fontFamily",
  "node.typography.font_size": "fontSize",
  "node.typography.font_weight": "fontWeight",
  "node.typography.line_height": "lineHeight",
  "node.typography.letter_spacing": "letterSpacing"
} as const satisfies Record<NodeSemanticSlot, string>;

export const SEMANTIC_SLOT_TO_RENDER_KEY = {
  ...CANVAS_SEMANTIC_SLOT_TO_RENDER_FIELD,
  ...NODE_SEMANTIC_SLOT_TO_RENDER_KEY
} as const satisfies Record<RendererSemanticSlot, string>;

export const NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY = {
  "node.paint.background_color": "paint",
  "node.paint.opacity": "paint",
  "node.shape.border_radius": "paint",
  "node.text.color": "text",
  "node.typography.font_family": "text",
  "node.typography.font_size": "text",
  "node.typography.font_weight": "text",
  "node.typography.line_height": "text",
  "node.typography.letter_spacing": "text"
} as const satisfies Partial<Record<NodeSemanticSlot, StyleFamily>>;

export const RENDER_KEY_TO_NODE_SEMANTIC_SLOT = Object.fromEntries(
  Object.entries(NODE_SEMANTIC_SLOT_TO_RENDER_KEY).map(([slot, renderKey]) => [renderKey, slot])
) as Partial<Record<(typeof NODE_SEMANTIC_SLOT_TO_RENDER_KEY)[NodeSemanticSlot], NodeSemanticSlot>>;

export const SEMANTIC_OWNED_NODE_RENDER_KEYS = [
  ...new Set(Object.values(NODE_SEMANTIC_SLOT_TO_RENDER_KEY))
] as Array<(typeof NODE_SEMANTIC_SLOT_TO_RENDER_KEY)[NodeSemanticSlot]>;

const TYPOGRAPHY_SLOT_TO_FIELD = {
  "node.typography.font_family": "font_family",
  "node.typography.font_size": "font_size",
  "node.typography.font_weight": "font_weight",
  "node.typography.line_height": "line_height",
  "node.typography.letter_spacing": "letter_spacing"
} as const satisfies Partial<Record<NodeSemanticSlot, keyof TypographyTokenValue>>;

type ResolutionContext = {
  collectionsByVariableId: Map<string, RendererVariableCollection>;
  document: RendererDocument;
  options: SemanticResolutionOptions;
  variablesById: Map<string, RendererVariable>;
};

type GenericStyleSlotValue =
  | { kind: "value"; value: RenderStyleValue }
  | { kind: "variable"; variable_id: string };

type VariableModeValue =
  | { kind: "alias"; variable_id: string }
  | { kind: "value"; value: string }
  | { kind: "value"; value: RenderStyleValue }
  | { kind: "value"; value: TypographyTokenValue };

export type SemanticResolutionOptions = {
  modeOverridesByCollectionId?: Record<string, string>;
};

export type SemanticResolutionSourceKind =
  | "local"
  | "variable"
  | "style"
  | "style-variable"
  | "unset"
  | "unresolved";

export type ResolvedSemanticValue<TSlot extends RendererSemanticSlot = RendererSemanticSlot> = {
  slot: TSlot;
  value: RenderStyleValue | undefined;
  source_kind: SemanticResolutionSourceKind;
  variable_id?: string;
  style_id?: string;
  collection_id?: string;
  mode_id?: string;
};

export type ResolvedCanvasSemanticValue = ResolvedSemanticValue<CanvasSemanticSlot>;
export type ResolvedNodeSemanticValue = ResolvedSemanticValue<NodeSemanticSlot>;
export type ResolvedCanvasSemanticState = Record<CanvasSemanticSlot, ResolvedCanvasSemanticValue>;
export type ResolvedNodeSemanticState = Partial<Record<NodeSemanticSlot, ResolvedNodeSemanticValue>>;

export function isSemanticOwnedNodeRenderKey(renderKey: string): boolean {
  return SEMANTIC_OWNED_NODE_RENDER_KEYS.includes(
    renderKey as (typeof NODE_SEMANTIC_SLOT_TO_RENDER_KEY)[NodeSemanticSlot]
  );
}

export function getNodeSemanticSlotForRenderKey(renderKey: string): NodeSemanticSlot | undefined {
  return RENDER_KEY_TO_NODE_SEMANTIC_SLOT[
    renderKey as keyof typeof RENDER_KEY_TO_NODE_SEMANTIC_SLOT
  ];
}

function createResolutionContext(
  document: RendererDocument,
  options: SemanticResolutionOptions = {}
): ResolutionContext {
  const variablesById = new Map<string, RendererVariable>();
  const collectionsByVariableId = new Map<string, RendererVariableCollection>();

  for (const collection of Object.values(document.variables.collections)) {
    for (const variable of Object.values(collection.variables)) {
      variablesById.set(variable.id, variable);
      collectionsByVariableId.set(variable.id, collection);
    }
  }

  return {
    collectionsByVariableId,
    document,
    options,
    variablesById
  };
}

function getRequestedModeId(
  collection: RendererVariableCollection,
  options: SemanticResolutionOptions
): string {
  const overrideModeId = options.modeOverridesByCollectionId?.[collection.id];

  return overrideModeId && collection.modes[overrideModeId]
    ? overrideModeId
    : collection.default_mode_id;
}

function createUnsetResult<TSlot extends RendererSemanticSlot>(
  slot: TSlot
): ResolvedSemanticValue<TSlot> {
  return {
    slot,
    value: undefined,
    source_kind: "unset"
  };
}

function createUnresolvedResult<TSlot extends RendererSemanticSlot>(
  slot: TSlot,
  metadata: Omit<ResolvedSemanticValue<TSlot>, "slot" | "source_kind" | "value"> = {}
): ResolvedSemanticValue<TSlot> {
  return {
    slot,
    value: undefined,
    source_kind: "unresolved",
    ...metadata
  };
}

function resolveTypographyValue(
  requestedSlot: RendererSemanticSlot,
  value: TypographyTokenValue
): RenderStyleValue | undefined {
  if (!(requestedSlot in TYPOGRAPHY_SLOT_TO_FIELD)) {
    return undefined;
  }

  const field = TYPOGRAPHY_SLOT_TO_FIELD[requestedSlot as keyof typeof TYPOGRAPHY_SLOT_TO_FIELD];
  return value[field];
}

function resolveVariableValue<TSlot extends RendererSemanticSlot>(
  context: ResolutionContext,
  variableId: string,
  requestedSlot: TSlot,
  visited: Set<string> = new Set()
): ResolvedSemanticValue<TSlot> {
  const variable = context.variablesById.get(variableId);

  if (!variable) {
    return createUnresolvedResult(requestedSlot, {
      variable_id: variableId
    });
  }

  const collection = context.collectionsByVariableId.get(variableId);

  if (!collection) {
    return createUnresolvedResult(requestedSlot, {
      variable_id: variableId
    });
  }

  const modeId = getRequestedModeId(collection, context.options);

  if (!variable.scopes.includes(requestedSlot)) {
    return createUnresolvedResult(requestedSlot, {
      variable_id: variable.id,
      collection_id: collection.id,
      mode_id: modeId
    });
  }

  const visitKey = `${variable.id}:${requestedSlot}:${modeId}`;

  if (visited.has(visitKey)) {
    return createUnresolvedResult(requestedSlot, {
      variable_id: variable.id,
      collection_id: collection.id,
      mode_id: modeId
    });
  }

  const modeValue = variable.values_by_mode[modeId] as VariableModeValue | undefined;

  if (!modeValue) {
    return createUnresolvedResult(requestedSlot, {
      variable_id: variable.id,
      collection_id: collection.id,
      mode_id: modeId
    });
  }

  if (modeValue.kind === "alias") {
    visited.add(visitKey);
    const aliasedResult = resolveVariableValue(
      context,
      modeValue.variable_id,
      requestedSlot,
      visited
    );
    visited.delete(visitKey);
    return aliasedResult;
  }

  const resolvedValue =
    variable.kind === "typography"
      ? resolveTypographyValue(requestedSlot, modeValue.value as TypographyTokenValue)
      : (modeValue.value as RenderStyleValue);

  if (resolvedValue === undefined) {
    return createUnresolvedResult(requestedSlot, {
      variable_id: variable.id,
      collection_id: collection.id,
      mode_id: modeId
    });
  }

  return {
    slot: requestedSlot,
    value: resolvedValue,
    source_kind: "variable",
    variable_id: variable.id,
    collection_id: collection.id,
    mode_id: modeId
  };
}

function getAllowedSlotsForNode(node: RendererNode): readonly NodeSemanticSlot[] {
  return getAllowedNodeSemanticSlots(node.kind) as readonly NodeSemanticSlot[];
}

function getNodeLocalValues(node: RendererNode): Partial<Record<NodeSemanticSlot, RenderStyleValue>> {
  return node.authoring.local_values as Partial<Record<NodeSemanticSlot, RenderStyleValue>>;
}

function getNodeVariableBindings(node: RendererNode): Partial<Record<NodeSemanticSlot, string>> {
  return node.authoring.variable_bindings as Partial<Record<NodeSemanticSlot, string>>;
}

function getNodeStyleBindings(node: RendererNode): Partial<Record<StyleFamily, string>> {
  return node.authoring.style_bindings as Partial<Record<StyleFamily, string>>;
}

function getNodeFromInput(document: RendererDocument, nodeOrId: RendererNode | string): RendererNode {
  if (typeof nodeOrId !== "string") {
    return nodeOrId;
  }

  const node = document.nodes[nodeOrId];

  if (!node) {
    throw new Error(`Node not found: ${nodeOrId}`);
  }

  return node;
}

function getStyleSlotValue(
  family: StyleFamily,
  styleId: string,
  document: RendererDocument,
  slot: NodeSemanticSlot
): GenericStyleSlotValue | undefined {
  if (family === "paint") {
    const style = document.styles.paint[styleId];

    if (!style) {
      return undefined;
    }

    switch (slot) {
      case "node.paint.background_color":
      case "node.paint.opacity":
      case "node.shape.border_radius":
        return style.slots[slot];
      default:
        return undefined;
    }
  }

  const style = document.styles.text[styleId];

  if (!style) {
    return undefined;
  }

  switch (slot) {
    case "node.text.color":
    case "node.typography.font_family":
    case "node.typography.font_size":
    case "node.typography.font_weight":
    case "node.typography.line_height":
    case "node.typography.letter_spacing":
      return style.slots[slot];
    default:
      return undefined;
  }
}

function resolveCanvasSemanticSlotWithContext(
  context: ResolutionContext,
  slot: CanvasSemanticSlot
): ResolvedCanvasSemanticValue {
  const localValue = context.document.canvas.authoring.local_values[slot];

  if (localValue !== undefined) {
    return {
      slot,
      value: localValue,
      source_kind: "local"
    };
  }

  const variableId = context.document.canvas.authoring.variable_bindings[slot];

  if (!variableId) {
    return createUnsetResult(slot);
  }

  return resolveVariableValue(context, variableId, slot);
}

function resolveCanvasSemanticStateWithContext(
  context: ResolutionContext
): ResolvedCanvasSemanticState {
  return Object.fromEntries(
    CANVAS_SEMANTIC_SLOTS.map((slot) => [slot, resolveCanvasSemanticSlotWithContext(context, slot)])
  ) as ResolvedCanvasSemanticState;
}

function resolveNodeSemanticSlotWithContext(
  context: ResolutionContext,
  node: RendererNode,
  slot: NodeSemanticSlot
): ResolvedNodeSemanticValue {
  if (!getAllowedSlotsForNode(node).includes(slot)) {
    return createUnsetResult(slot);
  }

  const localValue = getNodeLocalValues(node)[slot];

  if (localValue !== undefined) {
    return {
      slot,
      value: localValue,
      source_kind: "local"
    };
  }

  const directVariableId = getNodeVariableBindings(node)[slot];

  if (directVariableId) {
    return resolveVariableValue(context, directVariableId, slot);
  }

  const family = NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY[slot as keyof typeof NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY];

  if (!family) {
    return createUnsetResult(slot);
  }

  const styleId = getNodeStyleBindings(node)[family];

  if (!styleId) {
    return createUnsetResult(slot);
  }

  const styleSlotValue = getStyleSlotValue(family, styleId, context.document, slot);

  if (!styleSlotValue) {
    return createUnsetResult(slot);
  }

  if (styleSlotValue.kind === "value") {
    return {
      slot,
      value: styleSlotValue.value,
      source_kind: "style",
      style_id: styleId
    };
  }

  const variableResult = resolveVariableValue(context, styleSlotValue.variable_id, slot);

  if (variableResult.source_kind === "variable" && variableResult.value !== undefined) {
    return {
      slot,
      value: variableResult.value,
      source_kind: "style-variable",
      style_id: styleId,
      variable_id: variableResult.variable_id,
      collection_id: variableResult.collection_id,
      mode_id: variableResult.mode_id
    };
  }

  return createUnresolvedResult(slot, {
    style_id: styleId,
    variable_id: variableResult.variable_id ?? styleSlotValue.variable_id,
    collection_id: variableResult.collection_id,
    mode_id: variableResult.mode_id
  });
}

function resolveNodeSemanticStateWithContext(
  context: ResolutionContext,
  node: RendererNode
): ResolvedNodeSemanticState {
  return Object.fromEntries(
    getAllowedNodeSemanticSlots(node.kind).map((slot) => [
      slot,
      resolveNodeSemanticSlotWithContext(context, node, slot)
    ])
  ) as ResolvedNodeSemanticState;
}

export function resolveCanvasSemanticSlot(
  document: RendererDocument,
  slot: CanvasSemanticSlot,
  options: SemanticResolutionOptions = {}
): ResolvedCanvasSemanticValue {
  return resolveCanvasSemanticSlotWithContext(createResolutionContext(document, options), slot);
}

export function resolveCanvasSemanticState(
  document: RendererDocument,
  options: SemanticResolutionOptions = {}
): ResolvedCanvasSemanticState {
  return resolveCanvasSemanticStateWithContext(createResolutionContext(document, options));
}

export function resolveNodeSemanticSlot(
  document: RendererDocument,
  nodeOrId: RendererNode | string,
  slot: NodeSemanticSlot,
  options: SemanticResolutionOptions = {}
): ResolvedNodeSemanticValue {
  const context = createResolutionContext(document, options);
  const node = getNodeFromInput(document, nodeOrId);

  return resolveNodeSemanticSlotWithContext(context, node, slot);
}

export function resolveNodeSemanticState(
  document: RendererDocument,
  nodeOrId: RendererNode | string,
  options: SemanticResolutionOptions = {}
): ResolvedNodeSemanticState {
  const context = createResolutionContext(document, options);
  const node = getNodeFromInput(document, nodeOrId);

  return resolveNodeSemanticStateWithContext(context, node);
}

export function materializeSemanticRenderState(
  document: RendererDocument,
  options: SemanticResolutionOptions = {}
): RendererDocument {
  const context = createResolutionContext(document, options);
  const canvasSemanticState = resolveCanvasSemanticStateWithContext(context);
  const nextNodes = Object.fromEntries(
    Object.entries(document.nodes).map(([nodeId, node]) => {
      const renderStyle = { ...node.render_style };

      for (const renderKey of SEMANTIC_OWNED_NODE_RENDER_KEYS) {
        delete renderStyle[renderKey];
      }

      const resolvedSlots = resolveNodeSemanticStateWithContext(context, node);

      for (const result of Object.values(resolvedSlots)) {
        if (!result || result.value === undefined) {
          continue;
        }

        renderStyle[NODE_SEMANTIC_SLOT_TO_RENDER_KEY[result.slot]] = result.value;
      }

      return [
        nodeId,
        {
          ...node,
          render_style: renderStyle
        }
      ] as const;
    })
  );

  const nextCanvas = {
    ...document.canvas
  };

  const resolvedBackground = canvasSemanticState["canvas.background_color"];

  if (typeof resolvedBackground.value === "string") {
    nextCanvas.background_color = resolvedBackground.value;
  } else {
    delete nextCanvas.background_color;
  }

  return {
    ...document,
    canvas: nextCanvas,
    nodes: nextNodes
  };
}
