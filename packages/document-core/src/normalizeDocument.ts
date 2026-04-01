import {
  CANVAS_ROOT_ID,
  NODE_KINDS,
  RENDERER_SEMANTIC_SLOTS
} from "./constants.js";
import { createEmptyDocument } from "./createEmptyDocument.js";
import { materializeSemanticRenderState } from "./semanticResolution.js";
import {
  type AssetRecord,
  assetSourceSchema,
  type ComputedLayout,
  type FrameNode,
  getAllowedNodeSemanticSlots,
  getAllowedStyleFamilies,
  type OpaqueValue,
  opaqueValueSchema,
  parseDocument,
  type RectangleNode,
  type RendererCanvasAuthoring,
  type RendererDocument,
  type RendererNode,
  type RendererNodeKind,
  type RendererPaintStyle,
  type RendererSceneMetadata,
  type RendererSemanticSlot,
  type RenderStyleValue,
  type RendererStyles,
  type RendererTextStyle,
  type RendererVariable,
  type RendererVariableCollection,
  type RendererVariables,
  type SceneRecord,
  type SvgNode,
  type SvgNodePayload,
  type SvgVisualElementNode,
  type TextNode
} from "./types.js";

type NormalizeDocumentOptions = {
  fallbackDocumentId?: string;
  fallbackName?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  ) as T;
}

function asRenderStyle(value: unknown): Record<string, RenderStyleValue> {
  if (!isObject(value)) {
    return {};
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, RenderStyleValue] =>
      typeof entry[1] === "string" || typeof entry[1] === "number"
  );

  return Object.fromEntries(entries);
}

function asComputedLayout(value: unknown): ComputedLayout | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const x = typeof value.x === "number" ? value.x : typeof value.left === "number" ? value.left : null;
  const y = typeof value.y === "number" ? value.y : typeof value.top === "number" ? value.top : null;
  const { width, height } = value;

  return typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number"
    ? { x, y, width, height }
    : undefined;
}

function asStringNumberBooleanRecord(value: unknown): Record<string, boolean | number | string> {
  if (!isObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean | number | string] =>
        typeof entry[1] === "boolean" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "string"
    )
  );
}

function normalizeRecord<T>(
  value: unknown,
  normalizeEntry: (key: string, rawValue: unknown) => T | null
): Record<string, T> {
  if (!isObject(value)) {
    return {};
  }

  const entries = Object.entries(value)
    .map(([key, rawValue]) => [key, normalizeEntry(key, rawValue)] as const)
    .filter((entry): entry is [string, T] => entry[1] !== null);

  return Object.fromEntries(entries);
}

function asNodeKind(value: unknown): RendererNodeKind | null {
  return NODE_KINDS.includes(value as RendererNodeKind) ? (value as RendererNodeKind) : null;
}

function normalizeCanvasAuthoring(rawValue: unknown): RendererCanvasAuthoring {
  const localValuesSource = isObject(rawValue) && isObject(rawValue.local_values) ? rawValue.local_values : {};
  const variableBindingsSource =
    isObject(rawValue) && isObject(rawValue.variable_bindings) ? rawValue.variable_bindings : {};

  return {
    local_values: compactObject({
      "canvas.background_color":
        typeof localValuesSource["canvas.background_color"] === "string" ||
        typeof localValuesSource["canvas.background_color"] === "number"
          ? (localValuesSource["canvas.background_color"] as RenderStyleValue)
          : undefined
    }),
    variable_bindings: compactObject({
      "canvas.background_color":
        typeof variableBindingsSource["canvas.background_color"] === "string"
          ? (variableBindingsSource["canvas.background_color"] as string)
          : undefined
    })
  };
}

function normalizeNodeAuthoringForKind(
  nodeKind: RendererNodeKind,
  rawValue: unknown
): RendererNode["authoring"] {
  const localValuesSource = isObject(rawValue) && isObject(rawValue.local_values) ? rawValue.local_values : {};
  const variableBindingsSource =
    isObject(rawValue) && isObject(rawValue.variable_bindings) ? rawValue.variable_bindings : {};
  const styleBindingsSource =
    isObject(rawValue) && isObject(rawValue.style_bindings) ? rawValue.style_bindings : {};

  const localValues = Object.fromEntries(
    getAllowedNodeSemanticSlots(nodeKind).map((slot) => [
      slot,
      typeof localValuesSource[slot] === "string" || typeof localValuesSource[slot] === "number"
        ? (localValuesSource[slot] as RenderStyleValue)
        : undefined
    ])
  );

  const variableBindings = Object.fromEntries(
    getAllowedNodeSemanticSlots(nodeKind).map((slot) => [
      slot,
      typeof variableBindingsSource[slot] === "string"
        ? (variableBindingsSource[slot] as string)
        : undefined
    ])
  );

  const styleBindings = Object.fromEntries(
    getAllowedStyleFamilies(nodeKind).map((family) => [
      family,
      typeof styleBindingsSource[family] === "string"
        ? (styleBindingsSource[family] as string)
        : undefined
    ])
  );

  return {
    local_values: compactObject(localValues),
    variable_bindings: compactObject(variableBindings),
    style_bindings: compactObject(styleBindings)
  } as RendererNode["authoring"];
}

function normalizeSceneMetadata(rawValue: unknown): RendererSceneMetadata {
  const source = isObject(rawValue) ? rawValue : {};

  return {
    ...compactObject({
      group: asOptionalString(source.group),
      notes: asOptionalString(source.notes),
      role: asOptionalString(source.role),
      summary: asOptionalString(source.summary)
    }),
    tags: dedupe(asStringArray(source.tags))
  };
}

function normalizeScene(sceneId: string, rawValue: unknown): SceneRecord | null {
  if (!isObject(rawValue)) {
    return null;
  }

  return {
    id: sceneId,
    frame_node_id: sceneId,
    name: asString(rawValue.name, sceneId),
    child_count: 0,
    scene_metadata: normalizeSceneMetadata(rawValue.scene_metadata)
  };
}

function normalizeTextNodePayload(rawValue: Record<string, unknown>): TextNode["text"] {
  const text = isObject(rawValue.text) ? rawValue.text : {};
  const legacyContent = typeof rawValue.text_content === "string" ? rawValue.text_content : undefined;

  return {
    content: typeof text.content === "string" ? text.content : legacyContent ?? ""
  };
}

function normalizeSvgDefinitions(value: unknown): SvgNodePayload["definitions"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const definitions = value
    .map((item) => {
      if (!isObject(item)) {
        return null;
      }

      const kind = asOptionalString(item.kind);
      const markup = asOptionalString(item.markup);

      if (!kind || !markup) {
        return null;
      }

      return {
        id: asOptionalString(item.id),
        kind,
        markup
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return definitions.length > 0 ? definitions : undefined;
}

function normalizeSvgNodePayload(rawValue: Record<string, unknown>): SvgNode["svg"] {
  const svg = isObject(rawValue.svg) ? rawValue.svg : {};

  return {
    ...compactObject({
      definitions: normalizeSvgDefinitions(svg.definitions),
      preserve_aspect_ratio: asOptionalString(svg.preserve_aspect_ratio),
      raw_root_attributes: (() => {
        const attributes = asStringNumberBooleanRecord(svg.raw_root_attributes);
        return Object.keys(attributes).length > 0 ? attributes : undefined;
      })(),
      view_box: asOptionalString(svg.view_box)
    })
  };
}

function normalizeSvgPrimitivePayload(rawValue: Record<string, unknown>): SvgVisualElementNode["svg_primitive"] {
  const primitive = isObject(rawValue.svg_primitive) ? rawValue.svg_primitive : {};

  return {
    element_name: asString(primitive.element_name, "g"),
    order: typeof primitive.order === "number" ? primitive.order : 0,
    attributes: asStringNumberBooleanRecord(primitive.attributes)
  };
}

function normalizeFrameNode(nodeId: string, rawValue: Record<string, unknown>): FrameNode {
  return {
    id: nodeId,
    kind: "frame",
    name: asString(rawValue.name, nodeId),
    parent_id: asNullableString(rawValue.parent_id),
    child_ids: dedupe(asStringArray(rawValue.child_ids)),
    scene_id: asNullableString(rawValue.scene_id),
    is_visible: rawValue.is_visible !== false,
    is_locked: rawValue.is_locked === true,
    render_style: asRenderStyle(rawValue.render_style),
    computed_layout: asComputedLayout(rawValue.computed_layout),
    authoring: normalizeNodeAuthoringForKind("frame", rawValue.authoring) as FrameNode["authoring"]
  };
}

function normalizeRectangleNode(nodeId: string, rawValue: Record<string, unknown>): RectangleNode {
  return {
    id: nodeId,
    kind: "rectangle",
    name: asString(rawValue.name, nodeId),
    parent_id: asNullableString(rawValue.parent_id),
    child_ids: dedupe(asStringArray(rawValue.child_ids)),
    scene_id: asNullableString(rawValue.scene_id),
    is_visible: rawValue.is_visible !== false,
    is_locked: rawValue.is_locked === true,
    render_style: asRenderStyle(rawValue.render_style),
    computed_layout: asComputedLayout(rawValue.computed_layout),
    authoring: normalizeNodeAuthoringForKind("rectangle", rawValue.authoring) as RectangleNode["authoring"]
  };
}

function normalizeTextNode(nodeId: string, rawValue: Record<string, unknown>): TextNode {
  return {
    id: nodeId,
    kind: "text",
    name: asString(rawValue.name, nodeId),
    parent_id: asNullableString(rawValue.parent_id),
    child_ids: dedupe(asStringArray(rawValue.child_ids)),
    scene_id: asNullableString(rawValue.scene_id),
    is_visible: rawValue.is_visible !== false,
    is_locked: rawValue.is_locked === true,
    render_style: asRenderStyle(rawValue.render_style),
    computed_layout: asComputedLayout(rawValue.computed_layout),
    authoring: normalizeNodeAuthoringForKind("text", rawValue.authoring) as TextNode["authoring"],
    text: normalizeTextNodePayload(rawValue)
  };
}

function normalizeSvgNode(nodeId: string, rawValue: Record<string, unknown>): SvgNode {
  return {
    id: nodeId,
    kind: "svg",
    name: asString(rawValue.name, nodeId),
    parent_id: asNullableString(rawValue.parent_id),
    child_ids: dedupe(asStringArray(rawValue.child_ids)),
    scene_id: asNullableString(rawValue.scene_id),
    is_visible: rawValue.is_visible !== false,
    is_locked: rawValue.is_locked === true,
    render_style: asRenderStyle(rawValue.render_style),
    computed_layout: asComputedLayout(rawValue.computed_layout),
    authoring: normalizeNodeAuthoringForKind("svg", rawValue.authoring) as SvgNode["authoring"],
    svg: normalizeSvgNodePayload(rawValue)
  };
}

function normalizeSvgVisualElementNode(
  nodeId: string,
  rawValue: Record<string, unknown>
): SvgVisualElementNode {
  return {
    id: nodeId,
    kind: "svg-visual-element",
    name: asString(rawValue.name, nodeId),
    parent_id: asNullableString(rawValue.parent_id),
    child_ids: dedupe(asStringArray(rawValue.child_ids)),
    scene_id: asNullableString(rawValue.scene_id),
    is_visible: rawValue.is_visible !== false,
    is_locked: rawValue.is_locked === true,
    render_style: asRenderStyle(rawValue.render_style),
    computed_layout: asComputedLayout(rawValue.computed_layout),
    authoring: normalizeNodeAuthoringForKind(
      "svg-visual-element",
      rawValue.authoring
    ) as SvgVisualElementNode["authoring"],
    svg_primitive: normalizeSvgPrimitivePayload(rawValue)
  };
}

function normalizeNode(nodeId: string, rawValue: unknown): RendererNode | null {
  if (!isObject(rawValue)) {
    return null;
  }

  const kind = asNodeKind(rawValue.kind);

  if (!kind) {
    return null;
  }

  switch (kind) {
    case "frame":
      return normalizeFrameNode(nodeId, rawValue);
    case "rectangle":
      return normalizeRectangleNode(nodeId, rawValue);
    case "text":
      return normalizeTextNode(nodeId, rawValue);
    case "svg":
      return normalizeSvgNode(nodeId, rawValue);
    case "svg-visual-element":
      return normalizeSvgVisualElementNode(nodeId, rawValue);
  }
}

function normalizeOpaqueMetadata(value: unknown): Record<string, OpaqueValue> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const metadata = Object.fromEntries(
    Object.entries(value)
      .map(([key, metadataValue]) => {
        const parsed = opaqueValueSchema.safeParse(metadataValue);
        return parsed.success ? ([key, parsed.data] as const) : null;
      })
      .filter((entry): entry is [string, OpaqueValue] => entry !== null)
  );

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeAsset(assetId: string, rawValue: unknown): AssetRecord | null {
  if (!isObject(rawValue)) {
    return null;
  }

  const source = assetSourceSchema.safeParse(rawValue.source);

  if (!source.success) {
    return null;
  }

  return {
    id: assetId,
    kind:
      rawValue.kind === "image" || rawValue.kind === "svg" || rawValue.kind === "unknown"
        ? rawValue.kind
        : "unknown",
    mime_type: asString(rawValue.mime_type, "application/octet-stream"),
    ...compactObject({
      width: typeof rawValue.width === "number" ? rawValue.width : undefined,
      height: typeof rawValue.height === "number" ? rawValue.height : undefined,
      metadata: normalizeOpaqueMetadata(rawValue.metadata)
    }),
    source: source.data
  };
}

function normalizeRendererSemanticSlots(value: unknown): RendererSemanticSlot[] {
  return dedupe(
    asStringArray(value).filter((slot) => RENDERER_SEMANTIC_SLOTS.includes(slot as RendererSemanticSlot))
  ) as RendererSemanticSlot[];
}

function normalizeVariableModeValue(kind: RendererVariable["kind"], rawValue: unknown) {
  if (!isObject(rawValue)) {
    return null;
  }

  if (rawValue.kind === "alias" && typeof rawValue.variable_id === "string") {
    return {
      kind: "alias" as const,
      variable_id: rawValue.variable_id
    };
  }

  if (rawValue.kind !== "value") {
    return null;
  }

  switch (kind) {
    case "color":
      return typeof rawValue.value === "string"
        ? {
            kind: "value" as const,
            value: rawValue.value
          }
        : null;
    case "radius":
    case "spacing":
      return typeof rawValue.value === "string" || typeof rawValue.value === "number"
        ? {
            kind: "value" as const,
            value: rawValue.value as RenderStyleValue
          }
        : null;
    case "typography":
      if (!isObject(rawValue.value)) {
        return null;
      }

      return typeof rawValue.value.font_family === "string" &&
        (typeof rawValue.value.font_size === "string" || typeof rawValue.value.font_size === "number")
        ? {
            kind: "value" as const,
            value: {
              font_family: rawValue.value.font_family,
              font_size: rawValue.value.font_size as RenderStyleValue,
              font_weight:
                typeof rawValue.value.font_weight === "string" ||
                typeof rawValue.value.font_weight === "number"
                  ? (rawValue.value.font_weight as RenderStyleValue)
                  : undefined,
              line_height:
                typeof rawValue.value.line_height === "string" ||
                typeof rawValue.value.line_height === "number"
                  ? (rawValue.value.line_height as RenderStyleValue)
                  : undefined,
              letter_spacing:
                typeof rawValue.value.letter_spacing === "string" ||
                typeof rawValue.value.letter_spacing === "number"
                  ? (rawValue.value.letter_spacing as RenderStyleValue)
                  : undefined
            }
          }
        : null;
  }
}

function normalizeVariable(
  variableId: string,
  collectionId: string,
  rawValue: unknown
): RendererVariable | null {
  if (!isObject(rawValue)) {
    return null;
  }

  const kind =
    rawValue.kind === "color" ||
    rawValue.kind === "radius" ||
    rawValue.kind === "spacing" ||
    rawValue.kind === "typography"
      ? rawValue.kind
      : null;

  if (!kind) {
    return null;
  }

  const valuesByMode = Object.fromEntries(
    Object.entries(isObject(rawValue.values_by_mode) ? rawValue.values_by_mode : {})
      .map(([modeId, modeValue]) => [modeId, normalizeVariableModeValue(kind, modeValue)] as const)
      .filter(
        (entry): entry is [string, NonNullable<ReturnType<typeof normalizeVariableModeValue>>] =>
          entry[1] !== null
      )
  );

  return {
    id: variableId,
    collection_id: collectionId,
    kind,
    group_path: asStringArray(rawValue.group_path),
    name: asString(rawValue.name, variableId),
    scopes: normalizeRendererSemanticSlots(rawValue.scopes),
    values_by_mode: valuesByMode,
    ...compactObject({
      description: asOptionalString(rawValue.description)
    })
  };
}

function normalizeVariableCollection(
  collectionId: string,
  rawValue: unknown
): RendererVariableCollection | null {
  if (!isObject(rawValue)) {
    return null;
  }

  const modes = normalizeRecord(rawValue.modes, (modeId, rawMode) => {
    if (!isObject(rawMode)) {
      return null;
    }

    return {
      id: modeId,
      name: asString(rawMode.name, modeId)
    };
  });

  const defaultModeId = asString(
    rawValue.default_mode_id,
    Object.keys(modes)[0] ?? "default"
  );

  if (!modes[defaultModeId]) {
    modes[defaultModeId] = {
      id: defaultModeId,
      name: defaultModeId === "default" ? "Default" : defaultModeId
    };
  }

  return {
    id: collectionId,
    name: asString(rawValue.name, collectionId),
    default_mode_id: defaultModeId,
    modes,
    variables: normalizeRecord(rawValue.variables, (variableId, rawVariable) =>
      normalizeVariable(variableId, collectionId, rawVariable)
    ),
    ...compactObject({
      description: asOptionalString(rawValue.description)
    })
  };
}

function normalizeVariables(rawValue: unknown): RendererVariables {
  return {
    collections: normalizeRecord(rawValue && isObject(rawValue) ? rawValue.collections : {}, (collectionId, rawCollection) =>
      normalizeVariableCollection(collectionId, rawCollection)
    )
  };
}

function normalizeStringStyleSlotValue(
  rawValue: unknown
): { kind: "value"; value: string } | { kind: "variable"; variable_id: string } | null {
  if (!isObject(rawValue)) {
    return null;
  }

  if (rawValue.kind === "variable" && typeof rawValue.variable_id === "string") {
    return {
      kind: "variable",
      variable_id: rawValue.variable_id
    };
  }

  return rawValue.kind === "value" && typeof rawValue.value === "string"
    ? {
        kind: "value",
        value: rawValue.value
      }
    : null;
}

function normalizeRenderStyleSlotValue(
  rawValue: unknown
): { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string } | null {
  if (!isObject(rawValue)) {
    return null;
  }

  if (rawValue.kind === "variable" && typeof rawValue.variable_id === "string") {
    return {
      kind: "variable",
      variable_id: rawValue.variable_id
    };
  }

  return rawValue.kind === "value" &&
    (typeof rawValue.value === "string" || typeof rawValue.value === "number")
    ? {
        kind: "value",
        value: rawValue.value
      }
    : null;
}

function normalizePaintStyle(styleId: string, rawValue: unknown): RendererPaintStyle | null {
  if (!isObject(rawValue)) {
    return null;
  }

  const slotsSource = isObject(rawValue.slots) ? rawValue.slots : {};

  return {
    id: styleId,
    name: asString(rawValue.name, styleId),
    ...compactObject({
      description: asOptionalString(rawValue.description)
    }),
    slots: compactObject({
      "node.paint.background_color":
        normalizeStringStyleSlotValue(slotsSource["node.paint.background_color"]) ?? undefined,
      "node.shape.border_radius":
        normalizeRenderStyleSlotValue(slotsSource["node.shape.border_radius"]) ?? undefined,
      "node.paint.opacity":
        normalizeRenderStyleSlotValue(slotsSource["node.paint.opacity"]) ?? undefined
    })
  };
}

function normalizeTextStyle(styleId: string, rawValue: unknown): RendererTextStyle | null {
  if (!isObject(rawValue)) {
    return null;
  }

  const slotsSource = isObject(rawValue.slots) ? rawValue.slots : {};

  return {
    id: styleId,
    name: asString(rawValue.name, styleId),
    ...compactObject({
      description: asOptionalString(rawValue.description)
    }),
    slots: compactObject({
      "node.text.color": normalizeStringStyleSlotValue(slotsSource["node.text.color"]) ?? undefined,
      "node.typography.font_family":
        normalizeStringStyleSlotValue(slotsSource["node.typography.font_family"]) ?? undefined,
      "node.typography.font_size":
        normalizeRenderStyleSlotValue(slotsSource["node.typography.font_size"]) ?? undefined,
      "node.typography.font_weight":
        normalizeRenderStyleSlotValue(slotsSource["node.typography.font_weight"]) ?? undefined,
      "node.typography.line_height":
        normalizeRenderStyleSlotValue(slotsSource["node.typography.line_height"]) ?? undefined,
      "node.typography.letter_spacing":
        normalizeRenderStyleSlotValue(slotsSource["node.typography.letter_spacing"]) ?? undefined
    })
  };
}

function normalizeStyles(rawValue: unknown): RendererStyles {
  const source = isObject(rawValue) ? rawValue : {};

  return {
    paint: normalizeRecord(source.paint, (styleId, rawStyle) => normalizePaintStyle(styleId, rawStyle)),
    text: normalizeRecord(source.text, (styleId, rawStyle) => normalizeTextStyle(styleId, rawStyle))
  };
}

function normalizeRootChildOrder(
  rawDocument: Record<string, unknown>,
  nodes: Record<string, RendererNode>
): string[] {
  const rawRoot = isObject(rawDocument.root) ? rawDocument.root : {};
  const existingOrder = asStringArray(rawRoot.child_ids);
  const topLevelNodeIds = Object.values(nodes)
    .filter((node) => node.parent_id === null)
    .map((node) => node.id);
  const validOrder = existingOrder.filter((id) => topLevelNodeIds.includes(id));
  const missingTopLevelIds = topLevelNodeIds.filter((id) => !validOrder.includes(id));

  return dedupe([...validOrder, ...missingTopLevelIds]);
}

function breakNodeCycles(nodes: Record<string, RendererNode>): void {
  for (const nodeId of Object.keys(nodes)) {
    const trail = new Set<string>();
    let current = nodes[nodeId];

    while (current?.parent_id) {
      if (trail.has(current.parent_id)) {
        current.parent_id = null;
        break;
      }

      trail.add(current.id);
      current = nodes[current.parent_id];
    }
  }
}

function buildChildrenByParent(nodes: Record<string, RendererNode>): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();

  for (const node of Object.values(nodes)) {
    if (!node.parent_id) {
      continue;
    }

    const children = childrenByParent.get(node.parent_id) ?? [];
    children.push(node.id);
    childrenByParent.set(node.parent_id, children);
  }

  return childrenByParent;
}

function detachLeafChildren(nodes: Record<string, RendererNode>): void {
  const childrenByParent = buildChildrenByParent(nodes);

  for (const node of Object.values(nodes)) {
    if (node.kind === "frame" || node.kind === "svg") {
      continue;
    }

    const children = childrenByParent.get(node.id) ?? [];

    for (const childId of children) {
      nodes[childId].parent_id = null;
    }

    node.child_ids = [];
  }
}

function dropDetachedSvgPrimitives(nodes: Record<string, RendererNode>): void {
  for (const nodeId of Object.keys(nodes)) {
    const node = nodes[nodeId];

    if (node.kind !== "svg-visual-element") {
      continue;
    }

    if (node.parent_id === null || nodes[node.parent_id]?.kind !== "svg") {
      delete nodes[nodeId];
    }
  }
}

function repairChildIds(nodes: Record<string, RendererNode>): void {
  const childrenByParent = buildChildrenByParent(nodes);

  for (const node of Object.values(nodes)) {
    if (node.kind !== "frame" && node.kind !== "svg") {
      node.child_ids = [];
      continue;
    }

    const backReferencedChildren = childrenByParent.get(node.id) ?? [];
    const validExistingChildren = node.child_ids.filter(
      (childId) => nodes[childId]?.parent_id === node.id
    );
    node.child_ids = dedupe([...validExistingChildren, ...backReferencedChildren]);
  }
}

function propagateSceneIds(
  nodeId: string,
  sceneId: string | null,
  nodes: Record<string, RendererNode>
): void {
  const node = nodes[nodeId];

  if (!node) {
    return;
  }

  node.scene_id = sceneId;

  for (const childId of node.child_ids) {
    propagateSceneIds(childId, sceneId, nodes);
  }
}

function extractAssetReference(backgroundImage: unknown): string | null {
  if (typeof backgroundImage !== "string") {
    return null;
  }

  const match = backgroundImage.match(/url\(\s*['"]?asset:\/\/([^'")]+)['"]?\s*\)/);

  return match?.[1] ?? null;
}

function repairAssetReferences(
  nodes: Record<string, RendererNode>,
  assets: Record<string, AssetRecord>
): void {
  for (const node of Object.values(nodes)) {
    const assetId = extractAssetReference(node.render_style.backgroundImage);

    if (assetId && !assets[assetId]) {
      delete node.render_style.backgroundImage;
    }
  }
}

function buildVariableIndex(variables: RendererVariables): {
  collectionsByVariableId: Map<string, RendererVariableCollection>;
  variablesById: Map<string, RendererVariable>;
} {
  const collectionsByVariableId = new Map<string, RendererVariableCollection>();
  const variablesById = new Map<string, RendererVariable>();

  for (const collection of Object.values(variables.collections)) {
    for (const variable of Object.values(collection.variables)) {
      collectionsByVariableId.set(variable.id, collection);
      variablesById.set(variable.id, variable);
    }
  }

  return {
    collectionsByVariableId,
    variablesById
  };
}

function repairCanvasVariableBindings(
  authoring: RendererCanvasAuthoring,
  variablesById: Map<string, RendererVariable>
): void {
  for (const [slot, variableId] of Object.entries(authoring.variable_bindings)) {
    if (variableId && !variablesById.has(variableId)) {
      delete authoring.variable_bindings[slot as keyof typeof authoring.variable_bindings];
    }
  }
}

function repairNodeSemanticBindings(
  nodes: Record<string, RendererNode>,
  variablesById: Map<string, RendererVariable>,
  styles: RendererStyles
): void {
  for (const node of Object.values(nodes)) {
    const variableBindings = node.authoring.variable_bindings as Partial<
      Record<RendererSemanticSlot, string>
    >;
    const styleBindings = node.authoring.style_bindings as Partial<Record<"paint" | "text", string>>;

    for (const [slot, variableId] of Object.entries(variableBindings)) {
      if (variableId && !variablesById.has(variableId)) {
        delete variableBindings[slot as keyof typeof variableBindings];
      }
    }

    for (const [family, styleId] of Object.entries(styleBindings)) {
      if (!styleId) {
        continue;
      }

      if (family === "paint" && !styles.paint[styleId]) {
        delete styleBindings.paint;
      }

      if (family === "text" && !styles.text[styleId]) {
        delete styleBindings.text;
      }
    }
  }
}

function repairStyleVariableReferences(
  styles: RendererStyles,
  variablesById: Map<string, RendererVariable>
): void {
  for (const style of Object.values(styles.paint)) {
    const slots = style.slots as Partial<
      Record<string, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
    >;

    for (const [slot, slotValue] of Object.entries(slots)) {
      if (slotValue?.kind === "variable" && !variablesById.has(slotValue.variable_id)) {
        delete slots[slot];
      }
    }
  }

  for (const style of Object.values(styles.text)) {
    const slots = style.slots as Partial<
      Record<string, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
    >;

    for (const [slot, slotValue] of Object.entries(slots)) {
      if (slotValue?.kind === "variable" && !variablesById.has(slotValue.variable_id)) {
        delete slots[slot];
      }
    }
  }
}

function hasAliasCycle(
  startVariableId: string,
  startModeId: string,
  collectionsByVariableId: Map<string, RendererVariableCollection>,
  variablesById: Map<string, RendererVariable>
): boolean {
  let currentVariableId = startVariableId;
  let currentModeId = startModeId;
  const visited = new Set<string>();

  while (true) {
    const visitKey = `${currentVariableId}:${currentModeId}`;

    if (visited.has(visitKey)) {
      return true;
    }

    visited.add(visitKey);

    const variable = variablesById.get(currentVariableId);

    if (!variable) {
      return false;
    }

    const modeValue = variable.values_by_mode[currentModeId] as
      | { kind: "value"; value: unknown }
      | { kind: "alias"; variable_id: string }
      | undefined;

    if (!modeValue || modeValue.kind !== "alias") {
      return false;
    }

    const targetVariable = variablesById.get(modeValue.variable_id);

    if (!targetVariable) {
      return false;
    }

    const targetCollection = collectionsByVariableId.get(targetVariable.id);

    if (!targetCollection) {
      return false;
    }

    currentVariableId = targetVariable.id;
    currentModeId = targetCollection.modes[currentModeId]
      ? currentModeId
      : targetCollection.default_mode_id;
  }
}

function repairVariableAliasCycles(variables: RendererVariables): void {
  const { collectionsByVariableId, variablesById } = buildVariableIndex(variables);
  const collectionIds = Object.keys(variables.collections).sort();

  for (const collectionId of collectionIds) {
    const collection = variables.collections[collectionId];
    const variableIds = Object.keys(collection.variables).sort();

    for (const variableId of variableIds) {
      const variable = collection.variables[variableId];
      const modeIds = Object.keys(variable.values_by_mode).sort();

      for (const modeId of modeIds) {
        const modeValue = variable.values_by_mode[modeId] as
          | { kind: "value"; value: unknown }
          | { kind: "alias"; variable_id: string }
          | undefined;

        if (modeValue?.kind !== "alias") {
          continue;
        }

        if (hasAliasCycle(variable.id, modeId, collectionsByVariableId, variablesById)) {
          delete variable.values_by_mode[modeId];
        }
      }
    }
  }
}

function repairSemanticReferences(
  canvasAuthoring: RendererCanvasAuthoring,
  nodes: Record<string, RendererNode>,
  variables: RendererVariables,
  styles: RendererStyles
): void {
  const { variablesById } = buildVariableIndex(variables);

  repairCanvasVariableBindings(canvasAuthoring, variablesById);
  repairNodeSemanticBindings(nodes, variablesById, styles);
  repairStyleVariableReferences(styles, variablesById);
  repairVariableAliasCycles(variables);
}

export function normalizeDocument(
  input: unknown,
  options: NormalizeDocumentOptions = {}
): RendererDocument {
  const rawDocument = isObject(input) ? input : {};
  const fallbackDocumentId = options.fallbackDocumentId ?? "doc_unknown";
  const fallbackName = options.fallbackName ?? "Untitled Project";
  const documentId = asString(rawDocument.document_id, fallbackDocumentId);
  const name = asString(rawDocument.name, fallbackName);
  const empty = createEmptyDocument({
    documentId,
    name,
    createdAt:
      isObject(rawDocument.source) && typeof rawDocument.source.created_at === "string"
        ? rawDocument.source.created_at
        : undefined
  });

  const normalizedNodes = normalizeRecord(rawDocument.nodes, (nodeId, rawNode) =>
    normalizeNode(nodeId, rawNode)
  );

  const normalizedScenes = normalizeRecord(rawDocument.scenes, (sceneId, rawScene) =>
    normalizeScene(sceneId, rawScene)
  );

  for (const node of Object.values(normalizedNodes)) {
    if (node.parent_id && !normalizedNodes[node.parent_id]) {
      node.parent_id = null;
    }
  }

  for (const [sceneId, scene] of Object.entries(normalizedScenes)) {
    const frameNode = normalizedNodes[sceneId];

    if (!frameNode || frameNode.kind !== "frame") {
      delete normalizedScenes[sceneId];
      continue;
    }

    scene.id = sceneId;
    scene.frame_node_id = sceneId;
    frameNode.parent_id = null;
  }

  breakNodeCycles(normalizedNodes);
  detachLeafChildren(normalizedNodes);
  dropDetachedSvgPrimitives(normalizedNodes);
  repairChildIds(normalizedNodes);

  for (const [sceneId, scene] of Object.entries(normalizedScenes)) {
    scene.child_count = normalizedNodes[sceneId]?.child_ids.length ?? 0;
  }

  const rootChildIds = normalizeRootChildOrder(rawDocument, normalizedNodes);

  for (const node of Object.values(normalizedNodes)) {
    node.scene_id = null;
  }

  for (const nodeId of rootChildIds) {
    propagateSceneIds(nodeId, normalizedScenes[nodeId] ? nodeId : null, normalizedNodes);
  }

  const assets = normalizeRecord(rawDocument.assets, (assetId, rawAsset) => normalizeAsset(assetId, rawAsset));

  repairAssetReferences(normalizedNodes, assets);

  const canvasAuthoring = normalizeCanvasAuthoring(
    isObject(rawDocument.canvas) ? rawDocument.canvas.authoring : undefined
  );
  const variables = normalizeVariables(rawDocument.variables);
  const styles = normalizeStyles(rawDocument.styles);

  repairSemanticReferences(canvasAuthoring, normalizedNodes, variables, styles);

  const normalizedDocument: RendererDocument = parseDocument({
    ...empty,
    document_id: documentId,
    name,
    page_name: asString(rawDocument.page_name, empty.page_name),
    source: {
      kind: "ai-canvas",
      ...compactObject({
        created_at:
          isObject(rawDocument.source) && typeof rawDocument.source.created_at === "string"
            ? rawDocument.source.created_at
            : empty.source.created_at,
        imported_at:
          isObject(rawDocument.source) && typeof rawDocument.source.imported_at === "string"
            ? rawDocument.source.imported_at
            : undefined,
        source_document_id:
          isObject(rawDocument.source) && typeof rawDocument.source.source_document_id === "string"
            ? rawDocument.source.source_document_id
            : undefined,
        source_file_name:
          isObject(rawDocument.source) && typeof rawDocument.source.source_file_name === "string"
            ? rawDocument.source.source_file_name
            : undefined,
        source_page_name:
          isObject(rawDocument.source) && typeof rawDocument.source.source_page_name === "string"
            ? rawDocument.source.source_page_name
            : undefined
      })
    },
    canvas: compactObject({
      extent_mode: "infinite",
      authoring: canvasAuthoring
    }),
    root: {
      id:
        isObject(rawDocument.root) && typeof rawDocument.root.id === "string"
          ? rawDocument.root.id
          : CANVAS_ROOT_ID,
      child_ids: rootChildIds
    },
    scenes: normalizedScenes,
    nodes: normalizedNodes,
    assets,
    variables,
    styles
  });

  return parseDocument(materializeSemanticRenderState(normalizedDocument));
}
