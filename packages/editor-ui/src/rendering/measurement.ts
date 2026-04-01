import { collectSubtreeIds, type ComputedLayout, type RendererDocument } from "@ai-canvas/document-core";

type MeasureRenderedSubtreesInput = {
  document: RendererDocument;
  nodeElementsById: Map<string, Element>;
  rootElement: Element | null;
  rootIds: string[];
  zoom: number;
};

function resolveTopLevelRootId(document: RendererDocument, nodeId: string): string | null {
  let currentNodeId: string | null = nodeId;

  while (currentNodeId) {
    const currentNode: RendererDocument["nodes"][string] | undefined =
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

export function resolveMeasurementRootIds(
  document: RendererDocument,
  changedNodeIds: string[]
): string[] {
  const rootIds = new Set<string>();

  for (const nodeId of changedNodeIds) {
    const node = document.nodes[nodeId];

    if (!node) {
      continue;
    }

    if (node.scene_id && document.scenes[node.scene_id] && document.nodes[node.scene_id]) {
      rootIds.add(node.scene_id);
      continue;
    }

    const topLevelRootId = resolveTopLevelRootId(document, node.id);

    if (topLevelRootId) {
      rootIds.add(topLevelRootId);
    }
  }

  return [...rootIds];
}

export function measureRenderedSubtrees(
  input: MeasureRenderedSubtreesInput
): Record<string, ComputedLayout> {
  if (!input.rootElement) {
    return {};
  }

  const zoom = input.zoom > 0 ? input.zoom : 1;
  const rootRect = input.rootElement.getBoundingClientRect();
  const measuredLayouts: Record<string, ComputedLayout> = {};

  for (const rootId of input.rootIds) {
    for (const nodeId of collectSubtreeIds(input.document, rootId)) {
      const element = input.nodeElementsById.get(nodeId);

      if (!element) {
        continue;
      }

      const rect = element.getBoundingClientRect();

      measuredLayouts[nodeId] = {
        height: rect.height / zoom,
        width: rect.width / zoom,
        x: (rect.left - rootRect.left) / zoom,
        y: (rect.top - rootRect.top) / zoom
      };
    }
  }

  return measuredLayouts;
}
