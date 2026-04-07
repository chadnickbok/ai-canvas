import type {
  AssetRecord,
  CanvasSemanticSlot,
  ComputedLayout,
  NodeSemanticSlot,
  RendererCanvas,
  RendererDocument,
  RendererNode,
  RenderStyleValue,
  RendererStyles,
  RendererVariables,
  SceneRecord,
  StyleFamily,
} from './types.js';
import {
  CANVAS_SEMANTIC_SLOT_TO_RENDER_FIELD,
  NODE_SEMANTIC_SLOT_TO_RENDER_KEY,
  NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY,
  resolveCanvasSemanticState,
  resolveNodeSemanticState,
  type ResolvedCanvasSemanticValue,
  type ResolvedNodeSemanticValue,
} from './semanticResolution.js';

export type DocumentInspection = {
  asset_count: number;
  document_id: string;
  name: string;
  node_count: number;
  page_name: string;
  paint_style_count: number;
  root_child_ids: string[];
  root_id: string;
  scene_count: number;
  text_style_count: number;
  variable_collection_count: number;
  variable_count: number;
};

export type TreeNodeInspection = {
  child_ids: string[];
  children: TreeNodeInspection[];
  computed_layout?: ComputedLayout;
  id: string;
  is_locked: boolean;
  is_visible: boolean;
  kind: RendererNode['kind'];
  name: string;
  parent_id: string | null;
  scene_id: string | null;
};

export type SceneInspection = {
  child_ids: string[];
  frame: RendererNode;
  scene: SceneRecord;
};

export type DesignSystemInspection = {
  canvas: RendererCanvas;
  styles: RendererStyles;
  variables: RendererVariables;
};

export type CanvasSemanticSlotInspection = {
  local_value?: RenderStyleValue;
  render_field: string;
  render_value?: RenderStyleValue;
  resolved: ResolvedCanvasSemanticValue;
  slot: CanvasSemanticSlot;
  variable_id?: string;
};

export type NodeSemanticSlotInspection = {
  local_value?: RenderStyleValue;
  render_key: string;
  render_value?: RenderStyleValue;
  resolved: ResolvedNodeSemanticValue;
  slot: NodeSemanticSlot;
  style_family?: StyleFamily;
  style_id?: string;
  variable_id?: string;
};

export type NodePathInspection = {
  id: string;
  kind: RendererNode['kind'];
  name: string;
};

export type BackgroundAssetInspection = {
  asset: AssetRecord;
  asset_id: string;
  source_kind: AssetRecord['source']['kind'];
};

export type NodeInspectorInspection = {
  ancestor_path: NodePathInspection[];
  background_asset?: BackgroundAssetInspection;
  child_count: number;
  computed_layout?: ComputedLayout;
  id: string;
  is_locked: boolean;
  is_scene_root: boolean;
  is_top_level: boolean;
  is_visible: boolean;
  kind: RendererNode['kind'];
  name: string;
  parent_id: string | null;
  parent_name?: string;
  raw_render_style: RendererNode['render_style'];
  scene_id: string | null;
  scene_name?: string;
  semantic_slots: NodeSemanticSlotInspection[];
  style_bindings: Partial<Record<StyleFamily, string>>;
  text_content?: string;
};

export type SceneInspectorInspection = {
  child_count: number;
  frame_node_id: string;
  frame_node: NodeInspectorInspection;
  id: string;
  metadata: SceneRecord['scene_metadata'];
  name: string;
};

export type DocumentSummaryInspection = DocumentInspection & {
  canvas_semantic_slots: CanvasSemanticSlotInspection[];
  canvas_background_color?: string;
  loose_top_level_node_count: number;
};

export type SelectionInspection =
  | {
      document: DocumentSummaryInspection;
      kind: 'document';
    }
  | {
      document: DocumentSummaryInspection;
      kind: 'node';
      node: NodeInspectorInspection;
    }
  | {
      document: DocumentSummaryInspection;
      kind: 'scene';
      node: NodeInspectorInspection;
      scene: SceneInspectorInspection;
    };

const ASSET_BACKGROUND_IMAGE_PATTERN =
  /url\(\s*(['"]?)asset:\/\/([^'")]+)\1\s*\)/i;

export function getNode(
  document: RendererDocument,
  nodeId: string,
): RendererNode | undefined {
  return document.nodes[nodeId];
}

export function requireNode(
  document: RendererDocument,
  nodeId: string,
): RendererNode {
  const node = getNode(document, nodeId);

  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  return node;
}

export function getScene(
  document: RendererDocument,
  sceneId: string,
): SceneRecord | undefined {
  return document.scenes[sceneId];
}

export function isTopLevelNode(node: RendererNode): boolean {
  return node.parent_id === null;
}

export function getChildren(
  document: RendererDocument,
  nodeId: string,
): RendererNode[] {
  const node = getNode(document, nodeId);

  if (!node) {
    return [];
  }

  return node.child_ids
    .map((childId) => getNode(document, childId))
    .filter((child): child is RendererNode => child !== undefined);
}

export function collectSubtreeIds(
  document: RendererDocument,
  rootNodeId: string,
): string[] {
  const rootNode = getNode(document, rootNodeId);

  if (!rootNode) {
    return [];
  }

  const subtreeIds: string[] = [];
  const stack = [rootNodeId];

  while (stack.length > 0) {
    const nodeId = stack.pop();

    if (!nodeId) {
      continue;
    }

    subtreeIds.push(nodeId);

    const node = getNode(document, nodeId);

    if (!node) {
      continue;
    }

    for (let index = node.child_ids.length - 1; index >= 0; index -= 1) {
      stack.push(node.child_ids[index]);
    }
  }

  return subtreeIds;
}

function resolveTopLevelComputedLayoutRootId(
  document: RendererDocument,
  nodeId: string,
): string | null {
  let currentNodeId: string | null = nodeId;

  while (currentNodeId) {
    const currentNode: RendererDocument['nodes'][string] | undefined =
      document.nodes[currentNodeId];

    if (!currentNode) {
      return null;
    }

    if (currentNode.parent_id === null) {
      return currentNode.id;
    }

    currentNodeId = currentNode.parent_id;
  }

  return null;
}

export function resolveComputedLayoutRootIds(
  document: RendererDocument,
  changedNodeIds: string[],
): string[] {
  const rootIds = new Set<string>();

  for (const nodeId of changedNodeIds) {
    const node = document.nodes[nodeId];

    if (!node) {
      continue;
    }

    if (
      node.scene_id &&
      document.scenes[node.scene_id] &&
      document.nodes[node.scene_id]
    ) {
      rootIds.add(node.scene_id);
      continue;
    }

    const topLevelRootId = resolveTopLevelComputedLayoutRootId(
      document,
      node.id,
    );

    if (topLevelRootId) {
      rootIds.add(topLevelRootId);
    }
  }

  return [...rootIds];
}

export function inspectDocument(
  document: RendererDocument,
): DocumentInspection {
  let variableCount = 0;

  for (const collection of Object.values(document.variables.collections)) {
    variableCount += Object.keys(collection.variables).length;
  }

  return {
    asset_count: Object.keys(document.assets).length,
    document_id: document.document_id,
    name: document.name,
    node_count: Object.keys(document.nodes).length,
    page_name: document.page_name,
    paint_style_count: Object.keys(document.styles.paint).length,
    root_child_ids: [...document.root.child_ids],
    root_id: document.root.id,
    scene_count: Object.keys(document.scenes).length,
    text_style_count: Object.keys(document.styles.text).length,
    variable_collection_count: Object.keys(document.variables.collections)
      .length,
    variable_count: variableCount,
  };
}

export function inspectDocumentSummary(
  document: RendererDocument,
): DocumentSummaryInspection {
  const baseInspection = inspectDocument(document);
  const canvasSemanticState = resolveCanvasSemanticState(document);
  const canvasSemanticSlots: CanvasSemanticSlotInspection[] = Object.values(
    canvasSemanticState,
  ).map((resolvedSlot) => {
    const renderField = CANVAS_SEMANTIC_SLOT_TO_RENDER_FIELD[resolvedSlot.slot];

    return {
      ...(document.canvas.authoring.local_values[resolvedSlot.slot] ===
      undefined
        ? {}
        : {
            local_value:
              document.canvas.authoring.local_values[resolvedSlot.slot],
          }),
      ...(document.canvas.authoring.variable_bindings[resolvedSlot.slot] ===
      undefined
        ? {}
        : {
            variable_id:
              document.canvas.authoring.variable_bindings[resolvedSlot.slot],
          }),
      render_field: renderField,
      ...(document.canvas[renderField] === undefined
        ? {}
        : { render_value: document.canvas[renderField] }),
      resolved: resolvedSlot,
      slot: resolvedSlot.slot,
    };
  });
  let looseTopLevelNodeCount = 0;

  for (const childId of document.root.child_ids) {
    if (
      !document.scenes[childId] &&
      document.nodes[childId]?.parent_id === null
    ) {
      looseTopLevelNodeCount += 1;
    }
  }

  return {
    ...baseInspection,
    ...(document.canvas.background_color === undefined
      ? {}
      : { canvas_background_color: document.canvas.background_color }),
    canvas_semantic_slots: canvasSemanticSlots,
    loose_top_level_node_count: looseTopLevelNodeCount,
  };
}

export function inspectNode(
  document: RendererDocument,
  nodeId: string,
): RendererNode | undefined {
  return getNode(document, nodeId);
}

export function inspectNodeForInspector(
  document: RendererDocument,
  nodeId: string,
): NodeInspectorInspection | undefined {
  const node = getNode(document, nodeId);

  if (!node) {
    return undefined;
  }

  const resolvedSemanticState = resolveNodeSemanticState(document, node);
  const backgroundAssetInspection = resolveBackgroundAssetInspection(
    document,
    node,
  );
  const localValues = getNodeLocalValues(node);
  const variableBindings = getNodeVariableBindings(node);
  const styleBindings = getNodeStyleBindings(node);
  const semanticSlots: NodeSemanticSlotInspection[] = Object.values(
    resolvedSemanticState,
  ).map((resolvedSlot) => {
    const renderKey = NODE_SEMANTIC_SLOT_TO_RENDER_KEY[resolvedSlot.slot];
    const styleFamily = getNodeStyleFamilyForSlot(resolvedSlot.slot);

    return {
      ...(localValues[resolvedSlot.slot] === undefined
        ? {}
        : { local_value: localValues[resolvedSlot.slot] }),
      render_key: renderKey,
      ...(node.render_style[renderKey] === undefined
        ? {}
        : { render_value: node.render_style[renderKey] }),
      resolved: resolvedSlot,
      slot: resolvedSlot.slot,
      ...(styleFamily === undefined ? {} : { style_family: styleFamily }),
      ...(styleFamily === undefined || styleBindings[styleFamily] === undefined
        ? {}
        : { style_id: styleBindings[styleFamily] }),
      ...(variableBindings[resolvedSlot.slot] === undefined
        ? {}
        : { variable_id: variableBindings[resolvedSlot.slot] }),
    };
  });
  const parentNode = node.parent_id
    ? getNode(document, node.parent_id)
    : undefined;
  const scene = node.scene_id ? getScene(document, node.scene_id) : undefined;

  return {
    ancestor_path: buildNodeAncestorPath(document, node),
    ...(backgroundAssetInspection === undefined
      ? {}
      : { background_asset: backgroundAssetInspection }),
    child_count: node.child_ids.length,
    ...(node.computed_layout === undefined
      ? {}
      : { computed_layout: node.computed_layout }),
    id: node.id,
    is_locked: node.is_locked,
    is_scene_root:
      node.kind === 'frame' && node.scene_id === node.id && scene !== undefined,
    is_top_level: node.parent_id === null,
    is_visible: node.is_visible,
    kind: node.kind,
    name: node.name,
    parent_id: node.parent_id,
    ...(parentNode === undefined ? {} : { parent_name: parentNode.name }),
    raw_render_style: {
      ...node.render_style,
    },
    scene_id: node.scene_id,
    ...(scene === undefined ? {} : { scene_name: scene.name }),
    semantic_slots: semanticSlots,
    style_bindings: {
      ...styleBindings,
    },
    ...(node.kind === 'text' ? { text_content: node.text.content } : {}),
  };
}

export function inspectRootTree(
  document: RendererDocument,
): TreeNodeInspection[] {
  return document.root.child_ids
    .map((nodeId) => getNode(document, nodeId))
    .filter((node): node is RendererNode => node !== undefined)
    .map((node) => buildTreeNodeInspection(document, node));
}

export function inspectSubtree(
  document: RendererDocument,
  rootNodeId: string,
): TreeNodeInspection | undefined {
  const node = getNode(document, rootNodeId);

  if (!node) {
    return undefined;
  }

  return buildTreeNodeInspection(document, node);
}

export function inspectScenes(document: RendererDocument): SceneInspection[] {
  const orderedSceneIds = new Set<string>();

  for (const childId of document.root.child_ids) {
    if (document.scenes[childId]) {
      orderedSceneIds.add(childId);
    }
  }

  for (const sceneId of Object.keys(document.scenes)) {
    orderedSceneIds.add(sceneId);
  }

  const scenes: SceneInspection[] = [];

  for (const sceneId of orderedSceneIds) {
    const scene = document.scenes[sceneId];

    if (!scene) {
      continue;
    }

    const frame = getNode(document, scene.frame_node_id);

    if (!frame) {
      continue;
    }

    scenes.push({
      child_ids: [...frame.child_ids],
      frame,
      scene,
    });
  }

  return scenes;
}

export function inspectSceneForInspector(
  document: RendererDocument,
  sceneId: string,
): SceneInspectorInspection | undefined {
  const scene = getScene(document, sceneId);

  if (!scene) {
    return undefined;
  }

  const frameNode = inspectNodeForInspector(document, scene.frame_node_id);

  if (!frameNode) {
    return undefined;
  }

  return {
    child_count: scene.child_count,
    frame_node_id: scene.frame_node_id,
    frame_node: frameNode,
    id: scene.id,
    metadata: {
      ...scene.scene_metadata,
      tags: [...scene.scene_metadata.tags],
    },
    name: scene.name,
  };
}

export function inspectSelection(
  document: RendererDocument,
  selectedNodeId: string | null | undefined,
): SelectionInspection {
  const documentInspection = inspectDocumentSummary(document);

  if (!selectedNodeId) {
    return {
      document: documentInspection,
      kind: 'document',
    };
  }

  const nodeInspection = inspectNodeForInspector(document, selectedNodeId);

  if (!nodeInspection) {
    return {
      document: documentInspection,
      kind: 'document',
    };
  }

  const sceneInspection = inspectSceneForInspector(document, selectedNodeId);

  if (sceneInspection) {
    return {
      document: documentInspection,
      kind: 'scene',
      node: nodeInspection,
      scene: sceneInspection,
    };
  }

  return {
    document: documentInspection,
    kind: 'node',
    node: nodeInspection,
  };
}

export function inspectDesignSystem(
  document: RendererDocument,
): DesignSystemInspection {
  return {
    canvas: document.canvas,
    styles: document.styles,
    variables: document.variables,
  };
}

function buildTreeNodeInspection(
  document: RendererDocument,
  node: RendererNode,
): TreeNodeInspection {
  return {
    child_ids: [...node.child_ids],
    children: getChildren(document, node.id).map((childNode) =>
      buildTreeNodeInspection(document, childNode),
    ),
    ...(node.computed_layout === undefined
      ? {}
      : { computed_layout: node.computed_layout }),
    id: node.id,
    is_locked: node.is_locked,
    is_visible: node.is_visible,
    kind: node.kind,
    name: node.name,
    parent_id: node.parent_id,
    scene_id: node.scene_id,
  };
}

function buildNodeAncestorPath(
  document: RendererDocument,
  node: RendererNode,
): NodePathInspection[] {
  const ancestorPath: NodePathInspection[] = [];
  let currentParentId = node.parent_id;

  while (currentParentId) {
    const parentNode = getNode(document, currentParentId);

    if (!parentNode) {
      break;
    }

    ancestorPath.unshift({
      id: parentNode.id,
      kind: parentNode.kind,
      name: parentNode.name,
    });
    currentParentId = parentNode.parent_id;
  }

  return ancestorPath;
}

function resolveBackgroundAssetInspection(
  document: RendererDocument,
  node: RendererNode,
): BackgroundAssetInspection | undefined {
  const backgroundImage = node.render_style.backgroundImage;

  if (typeof backgroundImage !== 'string') {
    return undefined;
  }

  const match = backgroundImage.match(ASSET_BACKGROUND_IMAGE_PATTERN);

  if (!match) {
    return undefined;
  }

  const asset = document.assets[match[2]];

  if (!asset) {
    return undefined;
  }

  return {
    asset,
    asset_id: asset.id,
    source_kind: asset.source.kind,
  };
}

function getNodeLocalValues(
  node: RendererNode,
): Partial<Record<NodeSemanticSlot, RenderStyleValue>> {
  return node.authoring.local_values as Partial<
    Record<NodeSemanticSlot, RenderStyleValue>
  >;
}

function getNodeVariableBindings(
  node: RendererNode,
): Partial<Record<NodeSemanticSlot, string>> {
  return node.authoring.variable_bindings as Partial<
    Record<NodeSemanticSlot, string>
  >;
}

function getNodeStyleBindings(
  node: RendererNode,
): Partial<Record<StyleFamily, string>> {
  return node.authoring.style_bindings as Partial<Record<StyleFamily, string>>;
}

function getNodeStyleFamilyForSlot(
  slot: NodeSemanticSlot,
): StyleFamily | undefined {
  return NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY[
    slot as keyof typeof NODE_SEMANTIC_SLOT_TO_STYLE_FAMILY
  ];
}
