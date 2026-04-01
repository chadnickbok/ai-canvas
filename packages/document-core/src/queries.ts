import type {
  ComputedLayout,
  RendererCanvas,
  RendererDocument,
  RendererNode,
  RendererStyles,
  RendererVariables,
  SceneRecord
} from "./types.js";

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
  kind: RendererNode["kind"];
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

export function getNode(document: RendererDocument, nodeId: string): RendererNode | undefined {
  return document.nodes[nodeId];
}

export function requireNode(document: RendererDocument, nodeId: string): RendererNode {
  const node = getNode(document, nodeId);

  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  return node;
}

export function getScene(document: RendererDocument, sceneId: string): SceneRecord | undefined {
  return document.scenes[sceneId];
}

export function isTopLevelNode(node: RendererNode): boolean {
  return node.parent_id === null;
}

export function getChildren(document: RendererDocument, nodeId: string): RendererNode[] {
  const node = getNode(document, nodeId);

  if (!node) {
    return [];
  }

  return node.child_ids
    .map((childId) => getNode(document, childId))
    .filter((child): child is RendererNode => child !== undefined);
}

export function collectSubtreeIds(document: RendererDocument, rootNodeId: string): string[] {
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

export function inspectDocument(document: RendererDocument): DocumentInspection {
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
    variable_collection_count: Object.keys(document.variables.collections).length,
    variable_count: variableCount
  };
}

export function inspectNode(document: RendererDocument, nodeId: string): RendererNode | undefined {
  return getNode(document, nodeId);
}

export function inspectRootTree(document: RendererDocument): TreeNodeInspection[] {
  return document.root.child_ids
    .map((nodeId) => getNode(document, nodeId))
    .filter((node): node is RendererNode => node !== undefined)
    .map((node) => buildTreeNodeInspection(document, node));
}

export function inspectSubtree(
  document: RendererDocument,
  rootNodeId: string
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
      scene
    });
  }

  return scenes;
}

export function inspectDesignSystem(document: RendererDocument): DesignSystemInspection {
  return {
    canvas: document.canvas,
    styles: document.styles,
    variables: document.variables
  };
}

function buildTreeNodeInspection(
  document: RendererDocument,
  node: RendererNode
): TreeNodeInspection {
  return {
    child_ids: [...node.child_ids],
    children: getChildren(document, node.id).map((childNode) =>
      buildTreeNodeInspection(document, childNode)
    ),
    ...(node.computed_layout === undefined ? {} : { computed_layout: node.computed_layout }),
    id: node.id,
    is_locked: node.is_locked,
    is_visible: node.is_visible,
    kind: node.kind,
    name: node.name,
    parent_id: node.parent_id,
    scene_id: node.scene_id
  };
}
