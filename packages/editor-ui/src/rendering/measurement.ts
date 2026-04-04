import {
  collectSubtreeIds,
  resolveComputedLayoutRootIds,
  type ComputedLayout,
  type RendererDocument
} from "@ai-canvas/document-core";

type MeasureRenderedSubtreesInput = {
  document: RendererDocument;
  nodeElementsById: Map<string, Element>;
  rootElement: Element | null;
  rootIds: string[];
  zoom: number;
};

export function resolveMeasurementRootIds(
  document: RendererDocument,
  changedNodeIds: string[]
): string[] {
  return resolveComputedLayoutRootIds(document, changedNodeIds);
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
