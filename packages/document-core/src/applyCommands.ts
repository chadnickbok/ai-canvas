import {
  type ApplyCommandsEffects,
  type ApplyCommandsError,
  type ApplyCommandsErrorCode,
  type ApplyCommandsInput,
  type ApplyCommandsResult,
  type Command,
  type RenderStylePatch,
  commandSchemaByType,
  isCommandType
} from "./commandTypes.js";
import { normalizeDocument } from "./normalizeDocument.js";
import { collectSubtreeIds } from "./queries.js";
import {
  NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY,
  getNodeSemanticSlotForRenderKey,
  materializeSemanticRenderState,
  resolveCanvasSemanticSlot,
  resolveNodeSemanticSlot
} from "./semanticResolution.js";
import {
  type CanvasSemanticSlot,
  type EmptyNodeAuthoring,
  type FrameNode,
  getAllowedNodeSemanticSlots,
  getAllowedStyleFamilies,
  isContainerNode,
  type NodeSemanticSlot,
  type OpaqueValue,
  parseDocument,
  type RendererDocument,
  type RendererNode,
  type RendererPaintStyle,
  type RendererSemanticSlot,
  type RendererTextStyle,
  type RendererVariable,
  type RendererVariableCollection,
  type RenderStyleValue,
  type StyleFamily,
  type TypographyTokenValue
} from "./types.js";

type VariableModeValue =
  | { kind: "alias"; variable_id: string }
  | { kind: "value"; value: string }
  | { kind: "value"; value: RenderStyleValue }
  | { kind: "value"; value: TypographyTokenValue };

type VariableRawValue = RenderStyleValue | TypographyTokenValue;

type VariableLocation = {
  collection: RendererVariableCollection;
  variable: RendererVariable;
};

type VariableLookup = {
  collectionsByVariableId: Map<string, RendererVariableCollection>;
  variablesById: Map<string, RendererVariable>;
};

type ApplyCommandOptions = {
  currentRevision: number;
  measurementSurfaceAvailable: boolean;
  refreshComputedLayout?: (
    input: RefreshComputedLayoutInput
  ) => RendererDocument | Promise<RendererDocument>;
};

export type ApplyCommandsOptions = ApplyCommandOptions;

export type RefreshComputedLayoutInput = {
  document: RendererDocument;
  changed_asset_ids: string[];
  changed_node_ids: string[];
  changed_scene_ids: string[];
  changed_style_ids: string[];
  changed_variable_ids: string[];
};

type CommandContext = {
  changedAssetIds: Set<string>;
  changedNodeIds: Set<string>;
  changedSceneIds: Set<string>;
  changedStyleIds: Set<string>;
  changedVariableIds: Set<string>;
  document: RendererDocument;
};

class CommandApplicationError extends Error {
  readonly code: ApplyCommandsErrorCode;
  readonly commandIndex?: number;
  readonly details?: Record<string, OpaqueValue>;

  constructor(
    code: ApplyCommandsErrorCode,
    message: string,
    options: {
      commandIndex?: number;
      details?: Record<string, OpaqueValue>;
    } = {}
  ) {
    super(message);
    this.code = code;
    this.commandIndex = options.commandIndex;
    this.details = options.details;
  }
}

const GEOMETRY_RENDER_KEYS = ["left", "top", "width", "height"] as const;

const VARIABLE_KIND_ALLOWED_SLOTS = {
  color: [
    "canvas.background_color",
    "node.paint.background_color",
    "node.text.color"
  ],
  radius: ["node.shape.border_radius"],
  spacing: [
    "node.layout.gap",
    "node.layout.padding_top",
    "node.layout.padding_right",
    "node.layout.padding_bottom",
    "node.layout.padding_left"
  ],
  typography: [
    "node.typography.font_family",
    "node.typography.font_size",
    "node.typography.font_weight",
    "node.typography.line_height",
    "node.typography.letter_spacing"
  ]
} as const satisfies Record<RendererVariable["kind"], readonly RendererSemanticSlot[]>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTypographyTokenValue(value: unknown): value is TypographyTokenValue {
  return (
    isObject(value) &&
    typeof value.font_family === "string" &&
    (typeof value.font_size === "number" || typeof value.font_size === "string") &&
    (value.font_weight === undefined ||
      typeof value.font_weight === "number" ||
      typeof value.font_weight === "string") &&
    (value.line_height === undefined ||
      typeof value.line_height === "number" ||
      typeof value.line_height === "string") &&
    (value.letter_spacing === undefined ||
      typeof value.letter_spacing === "number" ||
      typeof value.letter_spacing === "string")
  );
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function sortStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function cloneNormalizedDocument(document: unknown): RendererDocument {
  const fallbackDocumentId =
    isObject(document) && typeof document.document_id === "string"
      ? document.document_id
      : "doc_unknown";
  const fallbackName =
    isObject(document) && typeof document.name === "string"
      ? document.name
      : "Untitled Project";

  return normalizeDocument(document, {
    fallbackDocumentId,
    fallbackName
  });
}

function createCommandError(
  documentId: string,
  code: ApplyCommandsErrorCode,
  message: string,
  options: {
    commandIndex?: number;
    details?: Record<string, OpaqueValue>;
    revision?: number;
  } = {}
): ApplyCommandsError {
  return {
    ok: false,
    document_id: documentId,
    ...(options.revision === undefined ? {} : { revision: options.revision }),
    error: {
      code,
      message,
      ...(options.commandIndex === undefined ? {} : { command_index: options.commandIndex }),
      ...(options.details === undefined ? {} : { details: options.details })
    }
  };
}

function throwValidation(
  message: string,
  options: {
    commandIndex?: number;
    details?: Record<string, OpaqueValue>;
  } = {}
): never {
  throw new CommandApplicationError("validation_failed", message, options);
}

function throwTargetNotFound(
  message: string,
  options: {
    commandIndex?: number;
    details?: Record<string, OpaqueValue>;
  } = {}
): never {
  throw new CommandApplicationError("target_not_found", message, options);
}

function throwUnrecoverable(
  message: string,
  options: {
    commandIndex?: number;
    details?: Record<string, OpaqueValue>;
  } = {}
): never {
  throw new CommandApplicationError("unrecoverable_command", message, options);
}

function parseCommandList(
  input: unknown,
  fallbackDocumentId: string
): { ok: true; data: ApplyCommandsInput } | { ok: false; error: ApplyCommandsError } {
  if (!isObject(input)) {
    return {
      ok: false,
      error: createCommandError(
        fallbackDocumentId,
        "validation_failed",
        "applyCommands input must be an object"
      )
    };
  }

  if (typeof input.document_id !== "string") {
    return {
      ok: false,
      error: createCommandError(
        fallbackDocumentId,
        "validation_failed",
        "applyCommands input must include document_id"
      )
    };
  }

  if (input.base_revision !== undefined && !Number.isInteger(input.base_revision)) {
    return {
      ok: false,
      error: createCommandError(input.document_id, "validation_failed", "base_revision must be an integer")
    };
  }

  if (!Array.isArray(input.commands)) {
    return {
      ok: false,
      error: createCommandError(input.document_id, "validation_failed", "commands must be an array")
    };
  }

  const commands: Command[] = [];
  const baseRevision = typeof input.base_revision === "number" ? input.base_revision : undefined;

  for (const [index, rawCommand] of input.commands.entries()) {
    if (!isObject(rawCommand) || typeof rawCommand.type !== "string") {
      return {
        ok: false,
        error: createCommandError(
          input.document_id,
          "validation_failed",
          "command must be an object with a string type",
          {
            commandIndex: index
          }
        )
      };
    }

    if (!isCommandType(rawCommand.type)) {
      return {
        ok: false,
        error: createCommandError(input.document_id, "unknown_command", `Unknown command type: ${rawCommand.type}`, {
          commandIndex: index
        })
      };
    }

    const parsed = commandSchemaByType[rawCommand.type].safeParse(rawCommand);

    if (!parsed.success) {
      return {
        ok: false,
        error: createCommandError(
          input.document_id,
          "validation_failed",
          `Invalid payload for command type: ${rawCommand.type}`,
          {
            commandIndex: index,
            details: {
              issues: parsed.error.issues.map((issue) => issue.message)
            }
          }
        )
      };
    }

    commands.push(parsed.data);
  }

  return {
    ok: true,
    data: {
      document_id: input.document_id,
      commands,
      ...(baseRevision === undefined ? {} : { base_revision: baseRevision })
    }
  };
}

function buildEffects(context: CommandContext): ApplyCommandsEffects | undefined {
  const effects: ApplyCommandsEffects = {
    ...(context.changedNodeIds.size === 0
      ? {}
      : { changed_node_ids: sortStrings(context.changedNodeIds) }),
    ...(context.changedSceneIds.size === 0
      ? {}
      : { changed_scene_ids: sortStrings(context.changedSceneIds) }),
    ...(context.changedAssetIds.size === 0
      ? {}
      : { changed_asset_ids: sortStrings(context.changedAssetIds) }),
    ...(context.changedVariableIds.size === 0
      ? {}
      : { changed_variable_ids: sortStrings(context.changedVariableIds) }),
    ...(context.changedStyleIds.size === 0
      ? {}
      : { changed_style_ids: sortStrings(context.changedStyleIds) })
  };

  return Object.keys(effects).length === 0 ? undefined : effects;
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

function getFamilySlots(node: RendererNode, family: StyleFamily): NodeSemanticSlot[] {
  return getAllowedNodeSemanticSlots(node.kind).filter(
    (slot) =>
      NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY[slot as keyof typeof NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY] ===
      family
  ) as NodeSemanticSlot[];
}

function ensureNodeSlotAllowed(node: RendererNode, slot: NodeSemanticSlot): void {
  if (!getAllowedNodeSemanticSlots(node.kind).some((allowedSlot) => allowedSlot === slot)) {
    throwValidation(`Slot ${slot} is not valid for node kind ${node.kind}`);
  }
}

function ensureNodeFamilyAllowed(node: RendererNode, family: StyleFamily): void {
  if (!getAllowedStyleFamilies(node.kind).some((allowedFamily) => allowedFamily === family)) {
    throwValidation(`Style family ${family} is not valid for node kind ${node.kind}`);
  }
}

function getNodeOrThrow(document: RendererDocument, nodeId: string): RendererNode {
  const node = document.nodes[nodeId];

  if (!node) {
    throwTargetNotFound(`Node not found: ${nodeId}`);
  }

  return node;
}

function getSceneOrThrow(document: RendererDocument, sceneId: string) {
  const scene = document.scenes[sceneId];

  if (!scene) {
    throwTargetNotFound(`Scene not found: ${sceneId}`);
  }

  return scene;
}

function getParentContainerOrThrow(document: RendererDocument, parentId: string | null): RendererNode | null {
  if (parentId === null) {
    return null;
  }

  const parent = document.nodes[parentId];

  if (!parent) {
    throwTargetNotFound(`Parent node not found: ${parentId}`);
  }

  if (!isContainerNode(parent)) {
    throwValidation(`Node ${parentId} cannot contain children`);
  }

  return parent;
}

function getContainerChildren(document: RendererDocument, parentId: string | null): string[] {
  return parentId === null ? document.root.child_ids : getNodeOrThrow(document, parentId).child_ids;
}

function removeChildReference(items: string[], childId: string): void {
  const index = items.indexOf(childId);

  if (index >= 0) {
    items.splice(index, 1);
  }
}

function insertChildReference(items: string[], childId: string, index?: number): void {
  if (items.includes(childId)) {
    throwValidation(`Container already includes child ${childId}`);
  }

  if (index === undefined) {
    items.push(childId);
    return;
  }

  if (index < 0 || index > items.length) {
    throwValidation(`Insertion index ${index} is out of range`);
  }

  items.splice(index, 0, childId);
}

function isSceneBackingFrame(document: RendererDocument, nodeId: string): boolean {
  return document.scenes[nodeId] !== undefined;
}

function markNode(context: CommandContext, nodeId: string): void {
  context.changedNodeIds.add(nodeId);
}

function markNodeAndAncestors(context: CommandContext, nodeId: string): void {
  let currentNodeId: string | null = nodeId;

  while (currentNodeId) {
    context.changedNodeIds.add(currentNodeId);
    currentNodeId = context.document.nodes[currentNodeId]?.parent_id ?? null;
  }
}

function markSubtree(context: CommandContext, rootNodeId: string): void {
  for (const nodeId of collectSubtreeIds(context.document, rootNodeId)) {
    context.changedNodeIds.add(nodeId);
  }
}

function markAllNodes(context: CommandContext): void {
  for (const nodeId of Object.keys(context.document.nodes)) {
    context.changedNodeIds.add(nodeId);
  }
}

function buildVariableLookup(document: RendererDocument): VariableLookup {
  const collectionsByVariableId = new Map<string, RendererVariableCollection>();
  const variablesById = new Map<string, RendererVariable>();

  for (const collection of Object.values(document.variables.collections)) {
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

function findVariableLocation(document: RendererDocument, variableId: string): VariableLocation {
  const matches: VariableLocation[] = [];

  for (const collection of Object.values(document.variables.collections)) {
    const variable = collection.variables[variableId];

    if (variable) {
      matches.push({
        collection,
        variable
      });
    }
  }

  if (matches.length === 0) {
    throwTargetNotFound(`Variable not found: ${variableId}`);
  }

  if (matches.length > 1) {
    throwUnrecoverable(`Variable id ${variableId} is ambiguous in the current document`);
  }

  return matches[0];
}

function isVariableKindSlotCompatible(
  kind: RendererVariable["kind"],
  slot: RendererSemanticSlot
): boolean {
  return (VARIABLE_KIND_ALLOWED_SLOTS[kind] as readonly RendererSemanticSlot[]).some(
    (allowedSlot) => allowedSlot === slot
  );
}

function ensureVariableSupportsSlot(variable: RendererVariable, slot: RendererSemanticSlot): void {
  if (!variable.scopes.includes(slot) || !isVariableKindSlotCompatible(variable.kind, slot)) {
    throwValidation(`Variable ${variable.id} cannot be used for slot ${slot}`);
  }
}

function validateVariableModeValueKind(
  kind: RendererVariable["kind"],
  modeValue: VariableModeValue
): void {
  if (modeValue.kind === "alias") {
    return;
  }

  switch (kind) {
    case "color":
      if (typeof modeValue.value !== "string") {
        throwValidation("Color variables require string mode values");
      }
      return;
    case "radius":
    case "spacing":
      if (typeof modeValue.value !== "string" && typeof modeValue.value !== "number") {
        throwValidation(`${kind} variables require string or number mode values`);
      }
      return;
    case "typography":
      if (!isTypographyTokenValue(modeValue.value)) {
        throwValidation("Typography variables require typography token values");
      }
      return;
  }
}

function ensureVariableScopesValid(variable: RendererVariable): void {
  for (const slot of variable.scopes) {
    if (!isVariableKindSlotCompatible(variable.kind, slot)) {
      throwValidation(`Variable ${variable.id} has an invalid scope ${slot} for kind ${variable.kind}`);
    }
  }
}

function ensureVariableModeKeysValid(
  collection: RendererVariableCollection,
  variable: RendererVariable
): void {
  for (const [modeId, modeValue] of Object.entries(variable.values_by_mode)) {
    if (!collection.modes[modeId]) {
      throwValidation(`Variable ${variable.id} references unknown mode ${modeId}`);
    }

    validateVariableModeValueKind(variable.kind, modeValue as VariableModeValue);
  }
}

function ensureVariableAliasTargetsValid(document: RendererDocument, variable: RendererVariable): void {
  for (const modeValue of Object.values(variable.values_by_mode) as VariableModeValue[]) {
    if (modeValue.kind !== "alias") {
      continue;
    }

    const target = findVariableLocation(document, modeValue.variable_id).variable;

    if (target.kind !== variable.kind) {
      throwValidation(`Variable ${variable.id} cannot alias variable ${target.id} of kind ${target.kind}`);
    }
  }
}

function hasAliasCycle(
  variableId: string,
  modeId: string,
  lookup: VariableLookup
): boolean {
  let currentVariableId = variableId;
  let currentModeId = modeId;
  const visited = new Set<string>();

  while (true) {
    const visitKey = `${currentVariableId}:${currentModeId}`;

    if (visited.has(visitKey)) {
      return true;
    }

    visited.add(visitKey);
    const variable = lookup.variablesById.get(currentVariableId);

    if (!variable) {
      return false;
    }

    const collection = lookup.collectionsByVariableId.get(currentVariableId);

    if (!collection) {
      return false;
    }

    const effectiveModeId = collection.modes[currentModeId] ? currentModeId : collection.default_mode_id;
    const modeValue = variable.values_by_mode[effectiveModeId] as VariableModeValue | undefined;

    if (!modeValue || modeValue.kind !== "alias") {
      return false;
    }

    const targetVariable = lookup.variablesById.get(modeValue.variable_id);

    if (!targetVariable) {
      return false;
    }

    const targetCollection = lookup.collectionsByVariableId.get(targetVariable.id);

    if (!targetCollection) {
      return false;
    }

    currentVariableId = targetVariable.id;
    currentModeId = targetCollection.modes[effectiveModeId]
      ? effectiveModeId
      : targetCollection.default_mode_id;
  }
}

function ensureNoVariableAliasCycles(document: RendererDocument): void {
  const lookup = buildVariableLookup(document);

  for (const collection of Object.values(document.variables.collections)) {
    for (const variable of Object.values(collection.variables)) {
      for (const [modeId, modeValue] of Object.entries(variable.values_by_mode) as Array<
        [string, VariableModeValue]
      >) {
        if (modeValue.kind !== "alias") {
          continue;
        }

        if (hasAliasCycle(variable.id, modeId, lookup)) {
          throwUnrecoverable(`Variable alias cycle detected for ${variable.id} in mode ${modeId}`);
        }
      }
    }
  }
}

function getRequestedModeId(
  collection: RendererVariableCollection,
  requestedModeId: string | undefined,
  modeOverridesByCollectionId: Record<string, string>
): string {
  const overrideModeId = modeOverridesByCollectionId[collection.id];

  if (overrideModeId && collection.modes[overrideModeId]) {
    return overrideModeId;
  }

  if (requestedModeId && collection.modes[requestedModeId]) {
    return requestedModeId;
  }

  return collection.default_mode_id;
}

function resolveVariableModeRawValue(
  lookup: VariableLookup,
  variableId: string,
  requestedModeId: string | undefined,
  modeOverridesByCollectionId: Record<string, string>,
  visited: Set<string> = new Set()
): VariableRawValue | undefined {
  const variable = lookup.variablesById.get(variableId);

  if (!variable) {
    return undefined;
  }

  const collection = lookup.collectionsByVariableId.get(variableId);

  if (!collection) {
    return undefined;
  }

  const modeId = getRequestedModeId(collection, requestedModeId, modeOverridesByCollectionId);
  const visitKey = `${variable.id}:${modeId}`;

  if (visited.has(visitKey)) {
    return undefined;
  }

  const modeValue = variable.values_by_mode[modeId] as VariableModeValue | undefined;

  if (!modeValue) {
    return undefined;
  }

  if (modeValue.kind === "value") {
    return modeValue.value as VariableRawValue;
  }

  visited.add(visitKey);
  const resolved = resolveVariableModeRawValue(
    lookup,
    modeValue.variable_id,
    modeId,
    modeOverridesByCollectionId,
    visited
  );
  visited.delete(visitKey);
  return resolved;
}

function slotExpectsString(slot: RendererSemanticSlot): boolean {
  return (
    slot === "canvas.background_color" ||
    slot === "node.paint.background_color" ||
    slot === "node.text.color" ||
    slot === "node.typography.font_family"
  );
}

function rawValueToSlotValue(
  slot: RendererSemanticSlot,
  rawValue: VariableRawValue | undefined
): RenderStyleValue | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  if (isTypographyTokenValue(rawValue)) {
    switch (slot) {
      case "node.typography.font_family":
        return rawValue.font_family;
      case "node.typography.font_size":
        return rawValue.font_size;
      case "node.typography.font_weight":
        return rawValue.font_weight;
      case "node.typography.line_height":
        return rawValue.line_height;
      case "node.typography.letter_spacing":
        return rawValue.letter_spacing;
      default:
        return undefined;
    }
  }

  if (slotExpectsString(slot) && typeof rawValue !== "string") {
    return undefined;
  }

  return rawValue;
}

function resolveVariableSlotValue(
  document: RendererDocument,
  variableId: string,
  slot: RendererSemanticSlot,
  modeOverridesByCollectionId: Record<string, string> = {}
): RenderStyleValue | undefined {
  const location = findVariableLocation(document, variableId);

  ensureVariableSupportsSlot(location.variable, slot);

  const rawValue = resolveVariableModeRawValue(
    buildVariableLookup(document),
    variableId,
    undefined,
    modeOverridesByCollectionId
  );

  return rawValueToSlotValue(slot, rawValue);
}

function aliasChainDependsOnDeletedVariables(
  lookup: VariableLookup,
  variableId: string,
  requestedModeId: string,
  deletedVariableIds: Set<string>,
  modeOverridesByCollectionId: Record<string, string>,
  visited: Set<string> = new Set()
): boolean {
  const variable = lookup.variablesById.get(variableId);

  if (!variable) {
    return false;
  }

  const collection = lookup.collectionsByVariableId.get(variableId);

  if (!collection) {
    return false;
  }

  const modeId = getRequestedModeId(collection, requestedModeId, modeOverridesByCollectionId);
  const visitKey = `${variable.id}:${modeId}`;

  if (visited.has(visitKey)) {
    return false;
  }

  const modeValue = variable.values_by_mode[modeId] as VariableModeValue | undefined;

  if (!modeValue || modeValue.kind !== "alias") {
    return false;
  }

  if (deletedVariableIds.has(modeValue.variable_id)) {
    return true;
  }

  visited.add(visitKey);
  const dependsOnDeleted = aliasChainDependsOnDeletedVariables(
    lookup,
    modeValue.variable_id,
    modeId,
    deletedVariableIds,
    modeOverridesByCollectionId,
    visited
  );
  visited.delete(visitKey);
  return dependsOnDeleted;
}

function applyNodeRenderStyleValue(
  node: RendererNode,
  renderKey: string,
  value: RenderStyleValue | null
): void {
  const semanticSlot = getNodeSemanticSlotForRenderKey(renderKey);

  if (!semanticSlot) {
    if (value === null) {
      delete node.render_style[renderKey];
      return;
    }

    node.render_style[renderKey] = value;
    return;
  }

  ensureNodeSlotAllowed(node, semanticSlot);
  const localValues = getNodeLocalValues(node);
  const variableBindings = getNodeVariableBindings(node);

  delete node.render_style[renderKey];

  if (value === null) {
    delete localValues[semanticSlot];
    return;
  }

  localValues[semanticSlot] = value;
  delete variableBindings[semanticSlot];
}

function applyNodeRenderStylePatch(node: RendererNode, patch: RenderStylePatch): void {
  for (const [renderKey, value] of Object.entries(patch)) {
    applyNodeRenderStyleValue(node, renderKey, value);
  }
}

function translateGeometryCreateInput(
  convenienceFields: Partial<Record<(typeof GEOMETRY_RENDER_KEYS)[number], RenderStyleValue>>,
  renderStyle: Record<string, RenderStyleValue> | undefined,
  options: {
    requireAllGeometry?: boolean;
  } = {}
): Record<string, RenderStyleValue> {
  const patch: Record<string, RenderStyleValue> = { ...(renderStyle ?? {}) };

  for (const key of GEOMETRY_RENDER_KEYS) {
    const convenienceValue = convenienceFields[key];

    if (convenienceValue !== undefined && key in patch) {
      throwValidation(`Geometry key ${key} was provided both as a convenience field and in render_style`);
    }

    if (convenienceValue !== undefined) {
      patch[key] = convenienceValue;
    }
  }

  if (options.requireAllGeometry) {
    for (const key of GEOMETRY_RENDER_KEYS) {
      if (patch[key] === undefined) {
        throwValidation(`Scene creation requires ${key}`);
      }
    }
  }

  return patch;
}

function translateGeometryPatch(
  convenienceFields: Partial<Record<(typeof GEOMETRY_RENDER_KEYS)[number], RenderStyleValue>>,
  renderStylePatch: RenderStylePatch | undefined
): RenderStylePatch {
  const patch: RenderStylePatch = { ...(renderStylePatch ?? {}) };

  for (const key of GEOMETRY_RENDER_KEYS) {
    const convenienceValue = convenienceFields[key];

    if (convenienceValue !== undefined && key in patch) {
      throwValidation(`Geometry key ${key} was provided both as a convenience field and in render_style`);
    }

    if (convenienceValue !== undefined) {
      patch[key] = convenienceValue;
    }
  }

  return patch;
}

function createEmptyAuthoring(): EmptyNodeAuthoring {
  return {
    local_values: {},
    variable_bindings: {},
    style_bindings: {}
  };
}

function createNodeFromPayload(
  payload: Extract<Command, { type: "create_node" }>["node"],
  sceneId: string | null
): RendererNode {
  const base = {
    id: payload.id,
    name: payload.name,
    parent_id: null,
    child_ids: [] as string[],
    scene_id: sceneId,
    is_visible: payload.is_visible ?? true,
    is_locked: payload.is_locked ?? false,
    render_style: {}
  };

  switch (payload.kind) {
    case "frame":
      return {
        ...base,
        kind: "frame",
        authoring: {
          local_values: {},
          variable_bindings: {},
          style_bindings: {}
        }
      };
    case "rectangle":
      return {
        ...base,
        kind: "rectangle",
        authoring: {
          local_values: {},
          variable_bindings: {},
          style_bindings: {}
        }
      };
    case "text":
      return {
        ...base,
        kind: "text",
        authoring: {
          local_values: {},
          variable_bindings: {},
          style_bindings: {}
        },
        text: {
          content: payload.text.content
        }
      };
    case "svg":
      return {
        ...base,
        kind: "svg",
        authoring: createEmptyAuthoring(),
        svg: {
          ...(payload.svg.definitions === undefined ? {} : { definitions: payload.svg.definitions }),
          ...(payload.svg.preserve_aspect_ratio === undefined
            ? {}
            : { preserve_aspect_ratio: payload.svg.preserve_aspect_ratio }),
          ...(payload.svg.raw_root_attributes === undefined
            ? {}
            : { raw_root_attributes: payload.svg.raw_root_attributes }),
          ...(payload.svg.view_box === undefined ? {} : { view_box: payload.svg.view_box })
        }
      };
    case "svg-visual-element":
      return {
        ...base,
        kind: "svg-visual-element",
        authoring: createEmptyAuthoring(),
        svg_primitive: {
          element_name: payload.svg_primitive.element_name,
          order: payload.svg_primitive.order,
          attributes: payload.svg_primitive.attributes
        }
      };
  }
}

function ensureUniqueNodeId(document: RendererDocument, nodeId: string): void {
  if (document.nodes[nodeId]) {
    throwValidation(`Node id already exists: ${nodeId}`);
  }
}

function ensureUniqueSceneId(document: RendererDocument, sceneId: string): void {
  if (document.scenes[sceneId] || document.nodes[sceneId]) {
    throwValidation(`Scene id already exists: ${sceneId}`);
  }
}

function ensureUniqueAssetId(document: RendererDocument, assetId: string): void {
  if (document.assets[assetId]) {
    throwValidation(`Asset id already exists: ${assetId}`);
  }
}

function ensureUniqueStyleId(
  document: RendererDocument,
  family: StyleFamily,
  styleId: string
): void {
  const existingStyle = family === "paint" ? document.styles.paint[styleId] : document.styles.text[styleId];

  if (existingStyle) {
    throwValidation(`Style id already exists in family ${family}: ${styleId}`);
  }
}

function ensureUniqueVariableCollectionId(document: RendererDocument, collectionId: string): void {
  if (document.variables.collections[collectionId]) {
    throwValidation(`Variable collection id already exists: ${collectionId}`);
  }
}

function ensureUniqueVariableId(document: RendererDocument, variableId: string): void {
  let count = 0;

  for (const collection of Object.values(document.variables.collections)) {
    if (collection.variables[variableId]) {
      count += 1;
    }
  }

  if (count > 0) {
    throwValidation(`Variable id already exists: ${variableId}`);
  }
}

function canonicalizeModeMap(
  modes: Record<string, { id: string; name: string }>
): RendererVariableCollection["modes"] {
  return Object.fromEntries(
    Object.entries(modes).map(([modeId, mode]) => [
      modeId,
      {
        id: modeId,
        name: mode.name
      }
    ])
  );
}

function ensureCollectionDefinitionValid(
  modes: Record<string, { id: string; name: string }>,
  defaultModeId: string
): void {
  const modeIds = Object.keys(modes);

  if (modeIds.length === 0) {
    throwValidation("Variable collections must declare at least one mode");
  }

  if (!modes[defaultModeId]) {
    throwValidation(`Default mode ${defaultModeId} does not exist in collection`);
  }
}

function getStyleOrThrow(
  document: RendererDocument,
  family: StyleFamily,
  styleId: string
): RendererPaintStyle | RendererTextStyle {
  const style = family === "paint" ? document.styles.paint[styleId] : document.styles.text[styleId];

  if (!style) {
    throwTargetNotFound(`Style not found in family ${family}: ${styleId}`);
  }

  return style;
}

function ensureStyleVariableReferenceValid(
  document: RendererDocument,
  variableId: string,
  slot: RendererSemanticSlot
): void {
  const variable = findVariableLocation(document, variableId).variable;
  ensureVariableSupportsSlot(variable, slot);
}

function clearLocalValuesForFamily(node: RendererNode, family: StyleFamily): void {
  const localValues = getNodeLocalValues(node);

  for (const slot of getFamilySlots(node, family)) {
    delete localValues[slot];
  }
}

function detachNodeVariableBindingToLocal(
  currentDocument: RendererDocument,
  snapshotDocument: RendererDocument,
  nodeId: string,
  slot: NodeSemanticSlot
): void {
  const currentNode = getNodeOrThrow(currentDocument, nodeId);
  ensureNodeSlotAllowed(currentNode, slot);
  const localValues = getNodeLocalValues(currentNode);
  const variableBindings = getNodeVariableBindings(currentNode);
  const resolved = resolveNodeSemanticSlot(snapshotDocument, nodeId, slot);

  if (resolved.value === undefined) {
    delete localValues[slot];
  } else {
    localValues[slot] = resolved.value;
  }

  delete variableBindings[slot];
}

function detachCanvasVariableBindingToLocal(
  currentDocument: RendererDocument,
  snapshotDocument: RendererDocument,
  slot: CanvasSemanticSlot
): void {
  const resolved = resolveCanvasSemanticSlot(snapshotDocument, slot);

  if (resolved.value === undefined) {
    delete currentDocument.canvas.authoring.local_values[slot];
  } else {
    currentDocument.canvas.authoring.local_values[slot] = resolved.value;
  }

  delete currentDocument.canvas.authoring.variable_bindings[slot];
}

function detachNodeStyleBindingToLocal(
  currentDocument: RendererDocument,
  snapshotDocument: RendererDocument,
  nodeId: string,
  family: StyleFamily
): void {
  const currentNode = getNodeOrThrow(currentDocument, nodeId);
  ensureNodeFamilyAllowed(currentNode, family);
  const localValues = getNodeLocalValues(currentNode);
  const variableBindings = getNodeVariableBindings(currentNode);
  const styleBindings = getNodeStyleBindings(currentNode);

  for (const slot of getFamilySlots(currentNode, family)) {
    if (localValues[slot] !== undefined || variableBindings[slot]) {
      continue;
    }

    const resolved = resolveNodeSemanticSlot(snapshotDocument, nodeId, slot);

    if (
      (resolved.source_kind === "style" || resolved.source_kind === "style-variable") &&
      resolved.value !== undefined
    ) {
      localValues[slot] = resolved.value;
    }
  }

  delete styleBindings[family];
}

function extractAssetReference(renderValue: unknown): string | null {
  if (typeof renderValue !== "string") {
    return null;
  }

  const match = renderValue.match(/url\(\s*['"]?asset:\/\/([^'")]+)['"]?\s*\)/);
  return match?.[1] ?? null;
}

function collectNodesReferencingAsset(document: RendererDocument, assetId: string): string[] {
  return Object.values(document.nodes)
    .filter((node) => extractAssetReference(node.render_style.backgroundImage) === assetId)
    .map((node) => node.id);
}

function detachDeletedVariables(document: RendererDocument, deletedVariableIds: Set<string>): void {
  if (deletedVariableIds.size === 0) {
    return;
  }

  const snapshotDocument = structuredClone(document);
  const lookup = buildVariableLookup(snapshotDocument);

  for (const [slot, variableId] of Object.entries(snapshotDocument.canvas.authoring.variable_bindings)) {
    if (!variableId || !deletedVariableIds.has(variableId)) {
      continue;
    }

    detachCanvasVariableBindingToLocal(
      document,
      snapshotDocument,
      slot as CanvasSemanticSlot
    );
  }

  for (const node of Object.values(snapshotDocument.nodes)) {
    const currentNode = getNodeOrThrow(document, node.id);

    for (const [slot, variableId] of Object.entries(getNodeVariableBindings(node))) {
      if (!variableId || !deletedVariableIds.has(variableId)) {
        continue;
      }

      detachNodeVariableBindingToLocal(
        document,
        snapshotDocument,
        currentNode.id,
        slot as NodeSemanticSlot
      );
    }
  }

  for (const style of Object.values(document.styles.paint)) {
    const snapshotStyle = snapshotDocument.styles.paint[style.id];
    const slots = style.slots as Partial<
      Record<NodeSemanticSlot, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
    >;
    const snapshotSlots = snapshotStyle?.slots as Partial<
      Record<NodeSemanticSlot, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
    >;

    for (const [slot, slotValue] of Object.entries(snapshotSlots ?? {})) {
      if (slotValue?.kind !== "variable" || !deletedVariableIds.has(slotValue.variable_id)) {
        continue;
      }

      const resolvedValue = resolveVariableSlotValue(
        snapshotDocument,
        slotValue.variable_id,
        slot as RendererSemanticSlot
      );

      if (resolvedValue === undefined) {
        delete slots[slot as NodeSemanticSlot];
      } else {
        slots[slot as NodeSemanticSlot] = {
          kind: "value",
          value: resolvedValue
        };
      }
    }
  }

  for (const style of Object.values(document.styles.text)) {
    const snapshotStyle = snapshotDocument.styles.text[style.id];
    const slots = style.slots as Partial<
      Record<NodeSemanticSlot, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
    >;
    const snapshotSlots = snapshotStyle?.slots as Partial<
      Record<NodeSemanticSlot, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
    >;

    for (const [slot, slotValue] of Object.entries(snapshotSlots ?? {})) {
      if (slotValue?.kind !== "variable" || !deletedVariableIds.has(slotValue.variable_id)) {
        continue;
      }

      const resolvedValue = resolveVariableSlotValue(
        snapshotDocument,
        slotValue.variable_id,
        slot as RendererSemanticSlot
      );

      if (resolvedValue === undefined) {
        delete slots[slot as NodeSemanticSlot];
      } else {
        slots[slot as NodeSemanticSlot] = {
          kind: "value",
          value: resolvedValue
        };
      }
    }
  }

  for (const collection of Object.values(document.variables.collections)) {
    for (const variable of Object.values(collection.variables)) {
      if (deletedVariableIds.has(variable.id)) {
        continue;
      }

      for (const [modeId, modeValue] of Object.entries(variable.values_by_mode) as Array<
        [string, VariableModeValue]
      >) {
        if (modeValue.kind !== "alias") {
          continue;
        }

        const overrides = { [collection.id]: modeId };

        if (
          !aliasChainDependsOnDeletedVariables(
            lookup,
            variable.id,
            modeId,
            deletedVariableIds,
            overrides
          )
        ) {
          continue;
        }

        const rawValue = resolveVariableModeRawValue(
          lookup,
          variable.id,
          modeId,
          overrides
        );

        if (rawValue === undefined) {
          delete variable.values_by_mode[modeId];
          continue;
        }

        variable.values_by_mode[modeId] = {
          kind: "value",
          value: rawValue as never
        };
      }
    }
  }

  for (const deletedVariableId of deletedVariableIds) {
    const collection = findVariableLocation(document, deletedVariableId).collection;
    delete collection.variables[deletedVariableId];
  }
}

function normalizeSceneMetadataTags(tags: string[] | undefined): string[] {
  return dedupe((tags ?? []).filter((tag) => typeof tag === "string"));
}

function applyCreateSceneCommand(
  context: CommandContext,
  command: Extract<Command, { type: "create_scene" }>
): void {
  ensureUniqueSceneId(context.document, command.scene.id);

  const frameNode: FrameNode = {
    id: command.scene.id,
    kind: "frame",
    name: command.scene.name,
    parent_id: null,
    child_ids: [],
    scene_id: command.scene.id,
    is_visible: true,
    is_locked: false,
    render_style: {},
    authoring: {
      local_values: {},
      variable_bindings: {},
      style_bindings: {}
    }
  };

  const renderStyle = translateGeometryCreateInput(
    {
      left: command.scene.left,
      top: command.scene.top,
      width: command.scene.width,
      height: command.scene.height
    },
    command.scene.render_style,
    { requireAllGeometry: true }
  );

  applyNodeRenderStylePatch(frameNode, renderStyle);
  context.document.nodes[frameNode.id] = frameNode;
  context.document.scenes[command.scene.id] = {
    id: command.scene.id,
    frame_node_id: command.scene.id,
    name: command.scene.name,
    child_count: 0,
    scene_metadata: {
      ...(command.scene.scene_metadata?.group === undefined
        ? {}
        : { group: command.scene.scene_metadata.group }),
      ...(command.scene.scene_metadata?.notes === undefined
        ? {}
        : { notes: command.scene.scene_metadata.notes }),
      ...(command.scene.scene_metadata?.role === undefined
        ? {}
        : { role: command.scene.scene_metadata.role }),
      ...(command.scene.scene_metadata?.summary === undefined
        ? {}
        : { summary: command.scene.scene_metadata.summary }),
      tags: normalizeSceneMetadataTags(command.scene.scene_metadata?.tags)
    }
  };
  context.document.root.child_ids.push(command.scene.id);
  context.changedSceneIds.add(command.scene.id);
  markNode(context, command.scene.id);
}

function applyUpdateSceneCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_scene" }>
): void {
  const scene = getSceneOrThrow(context.document, command.scene_id);
  const frameNode = getNodeOrThrow(context.document, command.scene_id);

  if (frameNode.kind !== "frame") {
    throwUnrecoverable(`Scene ${command.scene_id} does not point to a frame node`);
  }

  if (command.patch.name !== undefined) {
    scene.name = command.patch.name;
    frameNode.name = command.patch.name;
  }

  const renderStylePatch = translateGeometryPatch(
    {
      left: command.patch.left,
      top: command.patch.top,
      width: command.patch.width,
      height: command.patch.height
    },
    command.patch.render_style
  );

  applyNodeRenderStylePatch(frameNode, renderStylePatch);
  context.changedSceneIds.add(command.scene_id);
  markNodeAndAncestors(context, command.scene_id);
}

function applyDeleteSceneCommand(
  context: CommandContext,
  command: Extract<Command, { type: "delete_scene" }>
): void {
  getSceneOrThrow(context.document, command.scene_id);
  const subtreeIds = collectSubtreeIds(context.document, command.scene_id);

  removeChildReference(context.document.root.child_ids, command.scene_id);

  for (const nodeId of subtreeIds) {
    delete context.document.nodes[nodeId];
    context.changedNodeIds.add(nodeId);
  }

  delete context.document.scenes[command.scene_id];
  context.changedSceneIds.add(command.scene_id);
}

function applyUpdateSceneMetadataCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_scene_metadata" }>
): void {
  const scene = getSceneOrThrow(context.document, command.scene_id);

  if (command.patch.group !== undefined) {
    if (command.patch.group === null) {
      delete scene.scene_metadata.group;
    } else {
      scene.scene_metadata.group = command.patch.group;
    }
  }

  if (command.patch.notes !== undefined) {
    if (command.patch.notes === null) {
      delete scene.scene_metadata.notes;
    } else {
      scene.scene_metadata.notes = command.patch.notes;
    }
  }

  if (command.patch.role !== undefined) {
    if (command.patch.role === null) {
      delete scene.scene_metadata.role;
    } else {
      scene.scene_metadata.role = command.patch.role;
    }
  }

  if (command.patch.summary !== undefined) {
    if (command.patch.summary === null) {
      delete scene.scene_metadata.summary;
    } else {
      scene.scene_metadata.summary = command.patch.summary;
    }
  }

  if (command.patch.tags !== undefined) {
    scene.scene_metadata.tags = normalizeSceneMetadataTags(command.patch.tags);
  }

  context.changedSceneIds.add(command.scene_id);
}

function ensureParentAcceptsNode(parent: RendererNode | null, nodeKind: RendererNode["kind"]): void {
  if (parent === null) {
    if (nodeKind === "svg-visual-element") {
      throwValidation("svg-visual-element nodes must live under an svg node");
    }

    return;
  }

  if (parent.kind === "svg" && nodeKind !== "svg-visual-element") {
    throwValidation("svg nodes may contain only svg-visual-element children");
  }

  if (parent.kind !== "svg" && nodeKind === "svg-visual-element") {
    throwValidation("svg-visual-element nodes must live under an svg node");
  }
}

function insertNodeIntoParent(
  context: CommandContext,
  nodeId: string,
  parentId: string | null,
  index?: number
): void {
  const children = getContainerChildren(context.document, parentId);
  insertChildReference(children, nodeId, index);
}

function applyCreateNodeCommand(
  context: CommandContext,
  command: Extract<Command, { type: "create_node" }>
): void {
  ensureUniqueNodeId(context.document, command.node.id);
  const parent = getParentContainerOrThrow(context.document, command.parent.parent_id);
  ensureParentAcceptsNode(parent, command.node.kind);
  const sceneId = parent?.scene_id ?? null;
  const node = createNodeFromPayload(command.node, sceneId);
  const renderStyle = translateGeometryCreateInput(
    {
      left: command.node.left,
      top: command.node.top,
      width: command.node.width,
      height: command.node.height
    },
    command.node.render_style
  );

  applyNodeRenderStylePatch(node, renderStyle);
  node.parent_id = command.parent.parent_id;
  context.document.nodes[node.id] = node;
  insertNodeIntoParent(context, node.id, command.parent.parent_id, command.parent.index);

  if (parent) {
    markNodeAndAncestors(context, parent.id);
  }

  markNode(context, node.id);
}

function applyUpdateNodeCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_node" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);

  if (command.patch.name !== undefined) {
    node.name = command.patch.name;

    if (isSceneBackingFrame(context.document, node.id)) {
      context.document.scenes[node.id].name = command.patch.name;
      context.changedSceneIds.add(node.id);
    }
  }

  if (command.patch.is_visible !== undefined) {
    node.is_visible = command.patch.is_visible;
  }

  if (command.patch.is_locked !== undefined) {
    node.is_locked = command.patch.is_locked;
  }

  const renderStylePatch = translateGeometryPatch(
    {
      left: command.patch.left,
      top: command.patch.top,
      width: command.patch.width,
      height: command.patch.height
    },
    command.patch.render_style
  );

  applyNodeRenderStylePatch(node, renderStylePatch);
  markNodeAndAncestors(context, node.id);
}

function isDescendant(document: RendererDocument, candidateId: string, ancestorId: string): boolean {
  let currentNodeId: string | null = candidateId;

  while (currentNodeId) {
    if (currentNodeId === ancestorId) {
      return true;
    }

    currentNodeId = document.nodes[currentNodeId]?.parent_id ?? null;
  }

  return false;
}

function rewriteSceneMembership(
  document: RendererDocument,
  nodeId: string,
  sceneId: string | null
): void {
  const node = document.nodes[nodeId];

  if (!node) {
    return;
  }

  node.scene_id = sceneId;

  for (const childId of node.child_ids) {
    rewriteSceneMembership(document, childId, sceneId);
  }
}

function applyReparentNodeCommand(
  context: CommandContext,
  command: Extract<Command, { type: "reparent_node" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);
  const destinationParent = getParentContainerOrThrow(context.document, command.destination.parent_id);

  if (command.destination.parent_id === node.id) {
    throwValidation("A node cannot be reparented into itself");
  }

  if (command.destination.parent_id && isDescendant(context.document, command.destination.parent_id, node.id)) {
    throwValidation("A node cannot be reparented into one of its descendants");
  }

  if (isSceneBackingFrame(context.document, node.id) && command.destination.parent_id !== null) {
    throwValidation("Scene backing frames must remain top-level");
  }

  ensureParentAcceptsNode(destinationParent, node.kind);

  const oldParentId = node.parent_id;
  const oldChildren = getContainerChildren(context.document, oldParentId);
  removeChildReference(oldChildren, node.id);

  const destinationChildren = getContainerChildren(context.document, command.destination.parent_id);
  insertChildReference(destinationChildren, node.id, command.destination.index);
  node.parent_id = command.destination.parent_id;

  const nextSceneId =
    command.destination.parent_id === null
      ? isSceneBackingFrame(context.document, node.id)
        ? node.id
        : null
      : destinationParent?.scene_id ?? null;

  rewriteSceneMembership(context.document, node.id, nextSceneId);

  if (oldParentId) {
    markNodeAndAncestors(context, oldParentId);
  }

  if (command.destination.parent_id) {
    markNodeAndAncestors(context, command.destination.parent_id);
  }

  markSubtree(context, node.id);
}

function applyReorderChildrenCommand(
  context: CommandContext,
  command: Extract<Command, { type: "reorder_children" }>
): void {
  const existingChildren = getContainerChildren(context.document, command.container.parent_id);
  const dedupedChildIds = dedupe(command.child_ids);

  if (
    existingChildren.length !== dedupedChildIds.length ||
    existingChildren.length !== command.child_ids.length
  ) {
    throwValidation("reorder_children must list each existing child exactly once");
  }

  const existingSet = new Set(existingChildren);

  for (const childId of command.child_ids) {
    if (!existingSet.has(childId)) {
      throwValidation("reorder_children must not introduce new children");
    }
  }

  existingChildren.splice(0, existingChildren.length, ...command.child_ids);

  if (command.container.parent_id === null) {
    for (const childId of command.child_ids) {
      if (context.document.scenes[childId]) {
        context.changedSceneIds.add(childId);
      }

      context.changedNodeIds.add(childId);
    }

    return;
  }

  markNodeAndAncestors(context, command.container.parent_id);
}

function applyDeleteNodeCommand(
  context: CommandContext,
  command: Extract<Command, { type: "delete_node" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);

  if (isSceneBackingFrame(context.document, node.id)) {
    throwValidation("Scene backing frames must be deleted through delete_scene");
  }

  const subtreeIds = collectSubtreeIds(context.document, node.id);
  const parentChildren = getContainerChildren(context.document, node.parent_id);
  removeChildReference(parentChildren, node.id);

  if (node.parent_id) {
    markNodeAndAncestors(context, node.parent_id);
  }

  for (const nodeId of subtreeIds) {
    delete context.document.nodes[nodeId];
    context.changedNodeIds.add(nodeId);
  }
}

function applyUpdateTextContentCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_text_content" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);

  if (node.kind !== "text") {
    throwValidation(`Node ${command.node_id} is not a text node`);
  }

  node.text.content = command.content;
  markNodeAndAncestors(context, node.id);
}

function applySetCanvasLocalValueCommand(
  context: CommandContext,
  command: Extract<Command, { type: "set_canvas_local_value" }>
): void {
  context.document.canvas.authoring.local_values[command.slot] = command.value;
  delete context.document.canvas.authoring.variable_bindings[command.slot];
}

function applyClearCanvasLocalValueCommand(
  context: CommandContext,
  command: Extract<Command, { type: "clear_canvas_local_value" }>
): void {
  delete context.document.canvas.authoring.local_values[command.slot];
}

function applyBindCanvasVariableCommand(
  context: CommandContext,
  command: Extract<Command, { type: "bind_canvas_variable" }>
): void {
  const variable = findVariableLocation(context.document, command.variable_id).variable;
  ensureVariableSupportsSlot(variable, command.slot);
  context.document.canvas.authoring.variable_bindings[command.slot] = command.variable_id;
  delete context.document.canvas.authoring.local_values[command.slot];
}

function applyClearCanvasVariableBindingCommand(
  context: CommandContext,
  command: Extract<Command, { type: "clear_canvas_variable_binding" }>
): void {
  const snapshot = structuredClone(context.document);
  detachCanvasVariableBindingToLocal(context.document, snapshot, command.slot);
}

function applySetNodeLocalValueCommand(
  context: CommandContext,
  command: Extract<Command, { type: "set_node_local_value" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);
  ensureNodeSlotAllowed(node, command.slot);
  getNodeLocalValues(node)[command.slot] = command.value;
  delete getNodeVariableBindings(node)[command.slot];
  markNodeAndAncestors(context, node.id);
}

function applyClearNodeLocalValueCommand(
  context: CommandContext,
  command: Extract<Command, { type: "clear_node_local_value" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);
  ensureNodeSlotAllowed(node, command.slot);
  delete getNodeLocalValues(node)[command.slot];
  markNodeAndAncestors(context, node.id);
}

function applyBindNodeVariableCommand(
  context: CommandContext,
  command: Extract<Command, { type: "bind_node_variable" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);
  const variable = findVariableLocation(context.document, command.variable_id).variable;
  ensureNodeSlotAllowed(node, command.slot);
  ensureVariableSupportsSlot(variable, command.slot);
  getNodeVariableBindings(node)[command.slot] = command.variable_id;
  delete getNodeLocalValues(node)[command.slot];
  markNodeAndAncestors(context, node.id);
}

function applyClearNodeVariableBindingCommand(
  context: CommandContext,
  command: Extract<Command, { type: "clear_node_variable_binding" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);
  ensureNodeSlotAllowed(node, command.slot);
  const snapshot = structuredClone(context.document);
  detachNodeVariableBindingToLocal(context.document, snapshot, node.id, command.slot);
  markNodeAndAncestors(context, node.id);
}

function applyBindNodeStyleCommand(
  context: CommandContext,
  command: Extract<Command, { type: "bind_node_style" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);
  ensureNodeFamilyAllowed(node, command.family);
  getStyleOrThrow(context.document, command.family, command.style_id);
  getNodeStyleBindings(node)[command.family] = command.style_id;
  clearLocalValuesForFamily(node, command.family);
  markNodeAndAncestors(context, node.id);
}

function applyClearNodeStyleBindingCommand(
  context: CommandContext,
  command: Extract<Command, { type: "clear_node_style_binding" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);
  ensureNodeFamilyAllowed(node, command.family);
  const snapshot = structuredClone(context.document);
  detachNodeStyleBindingToLocal(context.document, snapshot, node.id, command.family);
  markNodeAndAncestors(context, node.id);
}

function applyCreateVariableCollectionCommand(
  context: CommandContext,
  command: Extract<Command, { type: "create_variable_collection" }>
): void {
  ensureUniqueVariableCollectionId(context.document, command.collection.id);
  ensureCollectionDefinitionValid(command.collection.modes, command.collection.default_mode_id);

  context.document.variables.collections[command.collection.id] = {
    id: command.collection.id,
    name: command.collection.name,
    default_mode_id: command.collection.default_mode_id,
    modes: canonicalizeModeMap(command.collection.modes),
    variables: {},
    ...(command.collection.description === undefined
      ? {}
      : { description: command.collection.description })
  };
}

function applyUpdateVariableCollectionCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_variable_collection" }>
): void {
  const collection = context.document.variables.collections[command.collection_id];

  if (!collection) {
    throwTargetNotFound(`Variable collection not found: ${command.collection_id}`);
  }

  if (command.patch.name !== undefined) {
    collection.name = command.patch.name;
  }

  if (command.patch.default_mode_id !== undefined) {
    if (!collection.modes[command.patch.default_mode_id]) {
      throwValidation(`Default mode ${command.patch.default_mode_id} does not exist in collection`);
    }

    collection.default_mode_id = command.patch.default_mode_id;
    markAllNodes(context);
  }

  if (command.patch.description !== undefined) {
    if (command.patch.description === null) {
      delete collection.description;
    } else {
      collection.description = command.patch.description;
    }
  }
}

function applyDeleteVariableCollectionCommand(
  context: CommandContext,
  command: Extract<Command, { type: "delete_variable_collection" }>
): void {
  const collection = context.document.variables.collections[command.collection_id];

  if (!collection) {
    throwTargetNotFound(`Variable collection not found: ${command.collection_id}`);
  }

  const deletedVariableIds = new Set(Object.keys(collection.variables));
  detachDeletedVariables(context.document, deletedVariableIds);

  for (const variableId of deletedVariableIds) {
    context.changedVariableIds.add(variableId);
  }

  markAllNodes(context);
  delete context.document.variables.collections[command.collection_id];
}

function applyCreateVariableCommand(
  context: CommandContext,
  command: Extract<Command, { type: "create_variable" }>
): void {
  const collection = context.document.variables.collections[command.variable.collection_id];

  if (!collection) {
    throwTargetNotFound(`Variable collection not found: ${command.variable.collection_id}`);
  }

  ensureUniqueVariableId(context.document, command.variable.id);
  ensureVariableScopesValid(command.variable);
  ensureVariableModeKeysValid(collection, command.variable);

  collection.variables[command.variable.id] = structuredClone(command.variable);
  ensureVariableAliasTargetsValid(context.document, collection.variables[command.variable.id]);
  ensureNoVariableAliasCycles(context.document);
  context.changedVariableIds.add(command.variable.id);
}

function applyUpdateVariableCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_variable" }>
): void {
  const { collection, variable } = findVariableLocation(context.document, command.variable_id);

  if (command.patch.group_path !== undefined) {
    variable.group_path = command.patch.group_path;
  }

  if (command.patch.name !== undefined) {
    variable.name = command.patch.name;
  }

  if (command.patch.scopes !== undefined) {
    variable.scopes = command.patch.scopes;
  }

  if (command.patch.values_by_mode !== undefined) {
    const nextValuesByMode = structuredClone(command.patch.values_by_mode);

    for (const [modeId, modeValue] of Object.entries(nextValuesByMode)) {
      if (!collection.modes[modeId]) {
        throwValidation(`Variable ${variable.id} references unknown mode ${modeId}`);
      }

      validateVariableModeValueKind(variable.kind, modeValue as VariableModeValue);
    }

    variable.values_by_mode = nextValuesByMode as RendererVariable["values_by_mode"];
  }

  if (command.patch.description !== undefined) {
    if (command.patch.description === null) {
      delete variable.description;
    } else {
      variable.description = command.patch.description;
    }
  }

  ensureVariableScopesValid(variable);
  ensureVariableModeKeysValid(collection, variable);
  ensureVariableAliasTargetsValid(context.document, variable);
  ensureNoVariableAliasCycles(context.document);
  context.changedVariableIds.add(variable.id);
  markAllNodes(context);
}

function applyDeleteVariableCommand(
  context: CommandContext,
  command: Extract<Command, { type: "delete_variable" }>
): void {
  findVariableLocation(context.document, command.variable_id);
  detachDeletedVariables(context.document, new Set([command.variable_id]));
  context.changedVariableIds.add(command.variable_id);
  markAllNodes(context);
}

function validateStyleSlotPayload(
  document: RendererDocument,
  slots: Partial<Record<NodeSemanticSlot, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>>
): void {
  for (const [slot, slotValue] of Object.entries(slots)) {
    if (!slotValue || slotValue.kind !== "variable") {
      continue;
    }

    ensureStyleVariableReferenceValid(document, slotValue.variable_id, slot as RendererSemanticSlot);
  }
}

function applyCreateStyleCommand(
  context: CommandContext,
  command: Extract<Command, { type: "create_style" }>
): void {
  ensureUniqueStyleId(context.document, command.style.family, command.style.id);

  if (command.style.family === "paint") {
    validateStyleSlotPayload(
      context.document,
      command.style.slots as Partial<
        Record<NodeSemanticSlot, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
      >
    );

    context.document.styles.paint[command.style.id] = {
      id: command.style.id,
      name: command.style.name,
      ...(command.style.description === undefined ? {} : { description: command.style.description }),
      slots: structuredClone(command.style.slots) as RendererPaintStyle["slots"]
    };
  } else {
    validateStyleSlotPayload(
      context.document,
      command.style.slots as Partial<
        Record<NodeSemanticSlot, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
      >
    );

    context.document.styles.text[command.style.id] = {
      id: command.style.id,
      name: command.style.name,
      ...(command.style.description === undefined ? {} : { description: command.style.description }),
      slots: structuredClone(command.style.slots) as RendererTextStyle["slots"]
    };
  }

  context.changedStyleIds.add(command.style.id);
}

function applyUpdateStyleCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_style" }>
): void {
  const style = getStyleOrThrow(context.document, command.family, command.style_id);

  if (command.patch.name !== undefined) {
    style.name = command.patch.name;
  }

  if (command.patch.description !== undefined) {
    if (command.patch.description === null) {
      delete style.description;
    } else {
      style.description = command.patch.description;
    }
  }

  if (command.patch.slots) {
    const mutableSlots = style.slots as Partial<
      Record<NodeSemanticSlot, { kind: "value"; value: RenderStyleValue } | { kind: "variable"; variable_id: string }>
    >;

    for (const [slot, slotValue] of Object.entries(command.patch.slots)) {
      if (slotValue === null) {
        delete mutableSlots[slot as NodeSemanticSlot];
        continue;
      }

      if (slotValue.kind === "variable") {
        ensureStyleVariableReferenceValid(
          context.document,
          slotValue.variable_id,
          slot as RendererSemanticSlot
        );
      }

      mutableSlots[slot as NodeSemanticSlot] = structuredClone(slotValue);
    }
  }

  context.changedStyleIds.add(command.style_id);
  markAllNodes(context);
}

function applyDeleteStyleCommand(
  context: CommandContext,
  command: Extract<Command, { type: "delete_style" }>
): void {
  getStyleOrThrow(context.document, command.family, command.style_id);
  const snapshot = structuredClone(context.document);

  for (const node of Object.values(snapshot.nodes)) {
    if (getNodeStyleBindings(node)[command.family] !== command.style_id) {
      continue;
    }

    detachNodeStyleBindingToLocal(context.document, snapshot, node.id, command.family);
    markNodeAndAncestors(context, node.id);
  }

  if (command.family === "paint") {
    delete context.document.styles.paint[command.style_id];
  } else {
    delete context.document.styles.text[command.style_id];
  }

  context.changedStyleIds.add(command.style_id);
}

function applyCreateAssetCommand(
  context: CommandContext,
  command: Extract<Command, { type: "create_asset" }>
): void {
  ensureUniqueAssetId(context.document, command.asset.id);
  context.document.assets[command.asset.id] = structuredClone(command.asset);
  context.changedAssetIds.add(command.asset.id);
}

function applyUpdateAssetCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_asset" }>
): void {
  const asset = context.document.assets[command.asset_id];

  if (!asset) {
    throwTargetNotFound(`Asset not found: ${command.asset_id}`);
  }

  if (command.patch.width !== undefined) {
    if (command.patch.width === null) {
      delete asset.width;
    } else {
      asset.width = command.patch.width;
    }
  }

  if (command.patch.height !== undefined) {
    if (command.patch.height === null) {
      delete asset.height;
    } else {
      asset.height = command.patch.height;
    }
  }

  if (command.patch.metadata !== undefined) {
    if (command.patch.metadata === null) {
      delete asset.metadata;
    } else {
      asset.metadata = structuredClone(command.patch.metadata);
    }
  }

  if (command.patch.source !== undefined) {
    asset.source = structuredClone(command.patch.source);
  }

  context.changedAssetIds.add(command.asset_id);

  for (const nodeId of collectNodesReferencingAsset(context.document, command.asset_id)) {
    markNodeAndAncestors(context, nodeId);
  }
}

function applyDeleteAssetCommand(
  context: CommandContext,
  command: Extract<Command, { type: "delete_asset" }>
): void {
  if (!context.document.assets[command.asset_id]) {
    throwTargetNotFound(`Asset not found: ${command.asset_id}`);
  }

  delete context.document.assets[command.asset_id];
  context.changedAssetIds.add(command.asset_id);

  for (const nodeId of collectNodesReferencingAsset(context.document, command.asset_id)) {
    delete context.document.nodes[nodeId].render_style.backgroundImage;
    markNodeAndAncestors(context, nodeId);
  }
}

function applyUpdateSvgRootCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_svg_root" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);

  if (node.kind !== "svg") {
    throwValidation(`Node ${command.node_id} is not an svg node`);
  }

  if (command.patch.definitions !== undefined) {
    if (command.patch.definitions.length === 0) {
      delete node.svg.definitions;
    } else {
      node.svg.definitions = structuredClone(command.patch.definitions);
    }
  }

  if (command.patch.preserve_aspect_ratio !== undefined) {
    if (command.patch.preserve_aspect_ratio === null) {
      delete node.svg.preserve_aspect_ratio;
    } else {
      node.svg.preserve_aspect_ratio = command.patch.preserve_aspect_ratio;
    }
  }

  if (command.patch.raw_root_attributes !== undefined) {
    if (Object.keys(command.patch.raw_root_attributes).length === 0) {
      delete node.svg.raw_root_attributes;
    } else {
      node.svg.raw_root_attributes = structuredClone(command.patch.raw_root_attributes);
    }
  }

  if (command.patch.view_box !== undefined) {
    if (command.patch.view_box === null) {
      delete node.svg.view_box;
    } else {
      node.svg.view_box = command.patch.view_box;
    }
  }

  markNodeAndAncestors(context, node.id);
}

function applyUpdateSvgPrimitiveCommand(
  context: CommandContext,
  command: Extract<Command, { type: "update_svg_primitive" }>
): void {
  const node = getNodeOrThrow(context.document, command.node_id);

  if (node.kind !== "svg-visual-element") {
    throwValidation(`Node ${command.node_id} is not an svg primitive node`);
  }

  if (command.patch.element_name !== undefined) {
    node.svg_primitive.element_name = command.patch.element_name;
  }

  if (command.patch.order !== undefined) {
    node.svg_primitive.order = command.patch.order;
  }

  if (command.patch.attributes !== undefined) {
    node.svg_primitive.attributes = structuredClone(command.patch.attributes);
  }

  markNodeAndAncestors(context, node.id);
}

function applySingleCommand(context: CommandContext, command: Command): void {
  switch (command.type) {
    case "create_scene":
      applyCreateSceneCommand(context, command);
      return;
    case "update_scene":
      applyUpdateSceneCommand(context, command);
      return;
    case "delete_scene":
      applyDeleteSceneCommand(context, command);
      return;
    case "update_scene_metadata":
      applyUpdateSceneMetadataCommand(context, command);
      return;
    case "create_node":
      applyCreateNodeCommand(context, command);
      return;
    case "update_node":
      applyUpdateNodeCommand(context, command);
      return;
    case "reparent_node":
      applyReparentNodeCommand(context, command);
      return;
    case "reorder_children":
      applyReorderChildrenCommand(context, command);
      return;
    case "delete_node":
      applyDeleteNodeCommand(context, command);
      return;
    case "update_text_content":
      applyUpdateTextContentCommand(context, command);
      return;
    case "set_canvas_local_value":
      applySetCanvasLocalValueCommand(context, command);
      return;
    case "clear_canvas_local_value":
      applyClearCanvasLocalValueCommand(context, command);
      return;
    case "bind_canvas_variable":
      applyBindCanvasVariableCommand(context, command);
      return;
    case "clear_canvas_variable_binding":
      applyClearCanvasVariableBindingCommand(context, command);
      return;
    case "set_node_local_value":
      applySetNodeLocalValueCommand(context, command);
      return;
    case "clear_node_local_value":
      applyClearNodeLocalValueCommand(context, command);
      return;
    case "bind_node_variable":
      applyBindNodeVariableCommand(context, command);
      return;
    case "clear_node_variable_binding":
      applyClearNodeVariableBindingCommand(context, command);
      return;
    case "bind_node_style":
      applyBindNodeStyleCommand(context, command);
      return;
    case "clear_node_style_binding":
      applyClearNodeStyleBindingCommand(context, command);
      return;
    case "create_variable_collection":
      applyCreateVariableCollectionCommand(context, command);
      return;
    case "update_variable_collection":
      applyUpdateVariableCollectionCommand(context, command);
      return;
    case "delete_variable_collection":
      applyDeleteVariableCollectionCommand(context, command);
      return;
    case "create_variable":
      applyCreateVariableCommand(context, command);
      return;
    case "update_variable":
      applyUpdateVariableCommand(context, command);
      return;
    case "delete_variable":
      applyDeleteVariableCommand(context, command);
      return;
    case "create_style":
      applyCreateStyleCommand(context, command);
      return;
    case "update_style":
      applyUpdateStyleCommand(context, command);
      return;
    case "delete_style":
      applyDeleteStyleCommand(context, command);
      return;
    case "create_asset":
      applyCreateAssetCommand(context, command);
      return;
    case "update_asset":
      applyUpdateAssetCommand(context, command);
      return;
    case "delete_asset":
      applyDeleteAssetCommand(context, command);
      return;
    case "update_svg_root":
      applyUpdateSvgRootCommand(context, command);
      return;
    case "update_svg_primitive":
      applyUpdateSvgPrimitiveCommand(context, command);
      return;
  }
}

export async function applyCommands(
  currentDocument: unknown,
  input: unknown,
  options: ApplyCommandsOptions
): Promise<ApplyCommandsResult> {
  const normalizedCurrentDocument = cloneNormalizedDocument(currentDocument);
  const parsedInput = parseCommandList(input, normalizedCurrentDocument.document_id);

  if (!parsedInput.ok) {
    return parsedInput.error;
  }

  if (parsedInput.data.document_id !== normalizedCurrentDocument.document_id) {
    return createCommandError(
      parsedInput.data.document_id,
      "target_not_found",
      `Document ${parsedInput.data.document_id} is not the active document`,
      {
        revision: options.currentRevision
      }
    );
  }

  if (
    parsedInput.data.base_revision !== undefined &&
    parsedInput.data.base_revision !== options.currentRevision
  ) {
    return createCommandError(
      normalizedCurrentDocument.document_id,
      "revision_conflict",
      "The provided base_revision does not match the current revision",
      {
        revision: options.currentRevision
      }
    );
  }

  if (parsedInput.data.commands.length === 0) {
    return {
      ok: true,
      document_id: normalizedCurrentDocument.document_id,
      revision: options.currentRevision,
      document: normalizedCurrentDocument
    };
  }

  if (!options.measurementSurfaceAvailable) {
    return createCommandError(
      normalizedCurrentDocument.document_id,
      "measurement_surface_unavailable",
      "A live measurement surface is required to apply commands",
      {
        revision: options.currentRevision
      }
    );
  }

  const workingDocument = structuredClone(normalizedCurrentDocument);
  const context: CommandContext = {
    changedAssetIds: new Set<string>(),
    changedNodeIds: new Set<string>(),
    changedSceneIds: new Set<string>(),
    changedStyleIds: new Set<string>(),
    changedVariableIds: new Set<string>(),
    document: workingDocument
  };

  try {
    for (const [commandIndex, command] of parsedInput.data.commands.entries()) {
      try {
        applySingleCommand(context, command);
      } catch (error) {
        if (error instanceof CommandApplicationError) {
          throw new CommandApplicationError(error.code, error.message, {
            commandIndex,
            details: error.details
          });
        }

        throw error;
      }
    }

    const normalizedAfterCommands = normalizeDocument(context.document, {
      fallbackDocumentId: normalizedCurrentDocument.document_id,
      fallbackName: normalizedCurrentDocument.name
    });

    const effects = buildEffects(context);
    let finalDocument = normalizedAfterCommands;

    if (effects?.changed_node_ids?.length && options.refreshComputedLayout) {
      const refreshedDocument = await options.refreshComputedLayout({
        document: normalizedAfterCommands,
        changed_asset_ids: effects.changed_asset_ids ?? [],
        changed_node_ids: effects.changed_node_ids,
        changed_scene_ids: effects.changed_scene_ids ?? [],
        changed_style_ids: effects.changed_style_ids ?? [],
        changed_variable_ids: effects.changed_variable_ids ?? []
      });

      finalDocument = parseDocument(materializeSemanticRenderState(parseDocument(refreshedDocument)));
    } else {
      finalDocument = parseDocument(materializeSemanticRenderState(normalizedAfterCommands));
    }

    return {
      ok: true,
      document_id: finalDocument.document_id,
      revision: options.currentRevision + 1,
      document: finalDocument,
      ...(effects === undefined ? {} : { effects })
    };
  } catch (error) {
    if (error instanceof CommandApplicationError) {
      return createCommandError(normalizedCurrentDocument.document_id, error.code, error.message, {
        commandIndex: error.commandIndex,
        details: error.details,
        revision: options.currentRevision
      });
    }

    return createCommandError(
      normalizedCurrentDocument.document_id,
      "unrecoverable_command",
      error instanceof Error ? error.message : "Unknown command application failure",
      {
        revision: options.currentRevision
      }
    );
  }
}
