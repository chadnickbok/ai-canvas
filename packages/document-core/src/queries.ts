import type { RendererDocument, RendererNode, SceneRecord } from "./types.js";

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
