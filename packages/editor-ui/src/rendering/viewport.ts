import type { RenderStyleValue, RendererDocument, RendererNode } from "@ai-canvas/document-core";

import type { ViewportState } from "./types.js";

export type CanvasBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type ViewportSize = {
  height: number;
  width: number;
};

export const DEFAULT_VIEWPORT: ViewportState = {
  panX: 0,
  panY: 0,
  zoom: 1
};

export const DEFAULT_VIEWPORT_FIT_PADDING = 64;
export const MIN_VIEWPORT_ZOOM = 0.02;
export const MAX_VIEWPORT_ZOOM = 4;
const DEFAULT_DOCUMENT_CENTER = { x: 0, y: 0 };

export function clampViewportZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return DEFAULT_VIEWPORT.zoom;
  }

  return Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, zoom));
}

export function formatViewportZoomPercent(zoom: number): string {
  return `${Math.round(clampViewportZoom(zoom) * 100)}%`;
}

export function parseViewportZoomPercent(input: string): number | null {
  const normalized = input.trim().replace(/%$/, "");

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return clampViewportZoom(parsed / 100);
}

export function resolveTopLevelContentBounds(document: RendererDocument): CanvasBounds | null {
  let aggregatedBounds: CanvasBounds | null = null;

  for (const childId of document.root.child_ids) {
    const node = resolveTopLevelNode(document, childId);

    if (!node || !node.is_visible) {
      continue;
    }

    const nodeBounds = resolveNodeCanvasBounds(node);

    if (!nodeBounds) {
      continue;
    }

    aggregatedBounds = aggregatedBounds ? unionCanvasBounds(aggregatedBounds, nodeBounds) : nodeBounds;
  }

  return aggregatedBounds;
}

export function createViewportForContentBounds(
  bounds: CanvasBounds | null,
  viewportSize: ViewportSize,
  options?: {
    maxZoom?: number;
    padding?: number;
    zoom?: number;
  }
): ViewportState {
  const padding = options?.padding ?? DEFAULT_VIEWPORT_FIT_PADDING;
  const maxZoom = clampViewportZoom(options?.maxZoom ?? DEFAULT_VIEWPORT.zoom);
  const viewportWidth = Math.max(0, viewportSize.width);
  const viewportHeight = Math.max(0, viewportSize.height);

  if (viewportWidth === 0 || viewportHeight === 0) {
    return DEFAULT_VIEWPORT;
  }

  if (!bounds) {
    return centerViewportOnPoint(DEFAULT_DOCUMENT_CENTER, viewportSize, options?.zoom ?? DEFAULT_VIEWPORT.zoom);
  }

  const nextZoom =
    options?.zoom ??
    clampViewportZoom(
      Math.min(
        viewportWidth / Math.max(bounds.width + padding * 2, 1),
        viewportHeight / Math.max(bounds.height + padding * 2, 1),
        maxZoom
      )
    );

  return centerViewportOnPoint(getCanvasBoundsCenter(bounds), viewportSize, nextZoom);
}

export function centerViewportOnPoint(
  point: { x: number; y: number },
  viewportSize: ViewportSize,
  zoom: number
): ViewportState {
  const normalizedZoom = clampViewportZoom(zoom);

  return {
    panX: viewportSize.width / 2 - point.x * normalizedZoom,
    panY: viewportSize.height / 2 - point.y * normalizedZoom,
    zoom: normalizedZoom
  };
}

export function zoomViewportAroundPoint(
  viewport: ViewportState,
  point: { x: number; y: number },
  nextZoom: number
): ViewportState {
  const normalizedZoom = clampViewportZoom(nextZoom);

  if (normalizedZoom === viewport.zoom) {
    return viewport;
  }

  const documentX = (point.x - viewport.panX) / viewport.zoom;
  const documentY = (point.y - viewport.panY) / viewport.zoom;

  return {
    panX: point.x - documentX * normalizedZoom,
    panY: point.y - documentY * normalizedZoom,
    zoom: normalizedZoom
  };
}

function resolveTopLevelNode(
  document: RendererDocument,
  childId: string
): RendererNode | null {
  const scene = document.scenes[childId];

  if (scene) {
    const frameNode = document.nodes[scene.id];

    return frameNode && frameNode.kind === "frame" ? frameNode : null;
  }

  const topLevelNode = document.nodes[childId];

  return topLevelNode && topLevelNode.parent_id === null ? topLevelNode : null;
}

function resolveNodeCanvasBounds(node: RendererNode): CanvasBounds | null {
  const x = resolveCanvasNumber(node.render_style.left, node.computed_layout?.x);
  const y = resolveCanvasNumber(node.render_style.top, node.computed_layout?.y);
  const width = resolveCanvasNumber(node.render_style.width, node.computed_layout?.width);
  const height = resolveCanvasNumber(node.render_style.height, node.computed_layout?.height);

  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return {
    height,
    width,
    x,
    y
  };
}

function resolveCanvasNumber(
  value: RenderStyleValue | undefined,
  fallback: number | undefined
): number | null {
  const authoredValue = resolveFiniteCanvasNumber(value);

  if (authoredValue !== null) {
    return authoredValue;
  }

  return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
}

function resolveFiniteCanvasNumber(value: RenderStyleValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^-?\d+(\.\d+)?px$/i.test(trimmed) || /^-?\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = Number.parseFloat(trimmed);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function unionCanvasBounds(left: CanvasBounds, right: CanvasBounds): CanvasBounds {
  const minX = Math.min(left.x, right.x);
  const minY = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY
  };
}

function getCanvasBoundsCenter(bounds: CanvasBounds): { x: number; y: number } {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}
