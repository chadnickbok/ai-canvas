import {
  CANVAS_ROOT_ID,
  DEFAULT_RENDER_CANON,
  DEFAULT_SCHEMA_VERSION,
  NODE_KINDS
} from "./constants.js";
import { createEmptyDocument } from "./createEmptyDocument.js";
import {
  type RenderStyleValue,
  rendererDocumentSchema,
  type RendererDocument,
  type RendererNode,
  type RendererNodeKind,
  type SceneRecord
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

function asNodeKind(value: unknown): RendererNodeKind | null {
  return NODE_KINDS.includes(value as RendererNodeKind) ? (value as RendererNodeKind) : null;
}

function normalizeNode(nodeId: string, rawValue: unknown): RendererNode | null {
  if (!isObject(rawValue)) {
    return null;
  }

  const kind = asNodeKind(rawValue.kind);

  if (!kind) {
    return null;
  }

  return {
    id: nodeId,
    kind,
    name: asString(rawValue.name, nodeId),
    parent_id: asNullableString(rawValue.parent_id),
    child_ids: dedupe(asStringArray(rawValue.child_ids)),
    scene_id: asNullableString(rawValue.scene_id),
    render_style: asRenderStyle(rawValue.render_style),
    computed_layout: isObject(rawValue.computed_layout)
      ? {
          left: typeof rawValue.computed_layout.left === "number" ? rawValue.computed_layout.left : 0,
          top: typeof rawValue.computed_layout.top === "number" ? rawValue.computed_layout.top : 0,
          width:
            typeof rawValue.computed_layout.width === "number" ? rawValue.computed_layout.width : 0,
          height:
            typeof rawValue.computed_layout.height === "number" ? rawValue.computed_layout.height : 0
        }
      : undefined,
    is_visible: rawValue.is_visible !== false,
    is_locked: rawValue.is_locked === true,
    authoring: {
      local_values: isObject(rawValue.authoring) && isObject(rawValue.authoring.local_values)
        ? asRenderStyle(rawValue.authoring.local_values)
        : {},
      variable_bindings:
        isObject(rawValue.authoring) && isObject(rawValue.authoring.variable_bindings)
          ? Object.fromEntries(
              Object.entries(rawValue.authoring.variable_bindings).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string"
              )
            )
          : {},
      style_bindings:
        isObject(rawValue.authoring) && isObject(rawValue.authoring.style_bindings)
          ? Object.fromEntries(
              Object.entries(rawValue.authoring.style_bindings).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string"
              )
            )
          : {}
    },
    text_content: typeof rawValue.text_content === "string" ? rawValue.text_content : undefined
  };
}

function normalizeScene(sceneId: string, rawValue: unknown): SceneRecord | null {
  if (!isObject(rawValue)) {
    return null;
  }

  return {
    id: sceneId,
    frame_node_id: asString(rawValue.frame_node_id, sceneId),
    name: asString(rawValue.name, sceneId),
    child_count: 0,
    scene_metadata: {
      group: typeof rawValue.scene_metadata === "object" && rawValue.scene_metadata
        ? typeof (rawValue.scene_metadata as Record<string, unknown>).group === "string"
          ? (rawValue.scene_metadata as Record<string, unknown>).group as string
          : undefined
        : undefined,
      notes: typeof rawValue.scene_metadata === "object" && rawValue.scene_metadata
        ? typeof (rawValue.scene_metadata as Record<string, unknown>).notes === "string"
          ? (rawValue.scene_metadata as Record<string, unknown>).notes as string
          : undefined
        : undefined,
      role: typeof rawValue.scene_metadata === "object" && rawValue.scene_metadata
        ? typeof (rawValue.scene_metadata as Record<string, unknown>).role === "string"
          ? (rawValue.scene_metadata as Record<string, unknown>).role as string
          : undefined
        : undefined,
      summary: typeof rawValue.scene_metadata === "object" && rawValue.scene_metadata
        ? typeof (rawValue.scene_metadata as Record<string, unknown>).summary === "string"
          ? (rawValue.scene_metadata as Record<string, unknown>).summary as string
          : undefined
        : undefined,
      tags:
        typeof rawValue.scene_metadata === "object" && rawValue.scene_metadata
          ? asStringArray((rawValue.scene_metadata as Record<string, unknown>).tags)
          : []
    }
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
    createdAt: typeof rawDocument.source === "object" && rawDocument.source
      ? typeof (rawDocument.source as Record<string, unknown>).created_at === "string"
        ? (rawDocument.source as Record<string, unknown>).created_at as string
        : undefined
      : undefined
  });

  const normalizedNodes = Object.fromEntries(
    Object.entries(isObject(rawDocument.nodes) ? rawDocument.nodes : {})
      .map(([nodeId, rawNode]) => [nodeId, normalizeNode(nodeId, rawNode)] as const)
      .filter((entry): entry is [string, RendererNode] => entry[1] !== null)
  );

  for (const node of Object.values(normalizedNodes)) {
    if (node.parent_id && !normalizedNodes[node.parent_id]) {
      node.parent_id = null;
    }
  }

  const childrenByParent = new Map<string, string[]>();

  for (const node of Object.values(normalizedNodes)) {
    if (!node.parent_id) {
      continue;
    }

    const parentChildren = childrenByParent.get(node.parent_id) ?? [];
    parentChildren.push(node.id);
    childrenByParent.set(node.parent_id, parentChildren);
  }

  for (const node of Object.values(normalizedNodes)) {
    const backReferencedChildren = childrenByParent.get(node.id) ?? [];
    const validExistingChildren = node.child_ids.filter(
      (childId) => normalizedNodes[childId]?.parent_id === node.id
    );
    node.child_ids = dedupe([...validExistingChildren, ...backReferencedChildren]);
  }

  const normalizedScenes = Object.fromEntries(
    Object.entries(isObject(rawDocument.scenes) ? rawDocument.scenes : {})
      .map(([sceneId, rawScene]) => [sceneId, normalizeScene(sceneId, rawScene)] as const)
      .filter((entry): entry is [string, SceneRecord] => entry[1] !== null)
  );

  for (const sceneId of Object.keys(normalizedScenes)) {
    const frameNode = normalizedNodes[sceneId];

    if (!frameNode || frameNode.kind !== "frame") {
      delete normalizedScenes[sceneId];
      continue;
    }

    frameNode.parent_id = null;
    frameNode.scene_id = sceneId;
  }

  const rootChildIds = normalizeRootChildOrder(rawDocument, normalizedNodes);

  const resolveSceneId = (nodeId: string, trail = new Set<string>()): string | null => {
    if (trail.has(nodeId)) {
      normalizedNodes[nodeId].parent_id = null;
      return normalizedScenes[nodeId] ? nodeId : null;
    }

    trail.add(nodeId);
    const node = normalizedNodes[nodeId];

    if (!node) {
      return null;
    }

    if (node.parent_id === null) {
      return normalizedScenes[node.id] ? node.id : null;
    }

    const parent = normalizedNodes[node.parent_id];

    if (!parent) {
      node.parent_id = null;
      return normalizedScenes[node.id] ? node.id : null;
    }

    return resolveSceneId(parent.id, trail);
  };

  for (const node of Object.values(normalizedNodes)) {
    node.scene_id = resolveSceneId(node.id);
  }

  for (const [sceneId, scene] of Object.entries(normalizedScenes)) {
    scene.child_count = normalizedNodes[sceneId]?.child_ids.length ?? 0;
  }

  const normalizedDocument: RendererDocument = {
    ...empty,
    schema_version: DEFAULT_SCHEMA_VERSION,
    render_canon: DEFAULT_RENDER_CANON,
    document_id: documentId,
    name,
    page_name: asString(rawDocument.page_name, name),
    source: {
      kind: "ai-canvas",
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
    },
    canvas: {
      extent_mode: "infinite",
      background_color:
        isObject(rawDocument.canvas) && typeof rawDocument.canvas.background_color === "string"
          ? rawDocument.canvas.background_color
          : undefined,
      authoring: {
        local_values:
          isObject(rawDocument.canvas) && isObject(rawDocument.canvas.authoring)
            ? asRenderStyle(rawDocument.canvas.authoring.local_values)
            : {},
        variable_bindings:
          isObject(rawDocument.canvas) && isObject(rawDocument.canvas.authoring)
            ? Object.fromEntries(
                Object.entries(
                  isObject(rawDocument.canvas.authoring.variable_bindings)
                    ? rawDocument.canvas.authoring.variable_bindings
                    : {}
                ).filter((entry): entry is [string, string] => typeof entry[1] === "string")
              )
            : {}
      }
    },
    root: {
      id:
        isObject(rawDocument.root) && typeof rawDocument.root.id === "string"
          ? rawDocument.root.id
          : CANVAS_ROOT_ID,
      child_ids: rootChildIds
    },
    scenes: normalizedScenes,
    nodes: normalizedNodes,
    assets: Object.fromEntries(
      Object.entries(isObject(rawDocument.assets) ? rawDocument.assets : {})
        .filter((entry): entry is [string, Record<string, unknown>] => isObject(entry[1]))
        .map(([assetId, rawAsset]) => [
          assetId,
          {
            id: asString(rawAsset.id, assetId),
            kind: typeof rawAsset.kind === "string" ? rawAsset.kind : undefined,
            mime_type: typeof rawAsset.mime_type === "string" ? rawAsset.mime_type : undefined,
            storage_path:
              typeof rawAsset.storage_path === "string" ? rawAsset.storage_path : undefined,
            width: typeof rawAsset.width === "number" ? rawAsset.width : undefined,
            height: typeof rawAsset.height === "number" ? rawAsset.height : undefined
          }
        ])
    ),
    variables: {
      collections:
        isObject(rawDocument.variables) && isObject(rawDocument.variables.collections)
          ? rawDocument.variables.collections
          : {}
    },
    styles: {
      paint:
        isObject(rawDocument.styles) && isObject(rawDocument.styles.paint)
          ? rawDocument.styles.paint
          : {},
      text:
        isObject(rawDocument.styles) && isObject(rawDocument.styles.text)
          ? rawDocument.styles.text
          : {}
    }
  };

  return rendererDocumentSchema.parse(normalizedDocument);
}
