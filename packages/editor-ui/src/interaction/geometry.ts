import type { RenderStyleValue, RendererDocument, RendererNode } from "@ai-canvas/document-core";

import type { RendererMeasurementHandle } from "../rendering/types.js";

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasRect = {
  bottom: number;
  height: number;
  right: number;
  width: number;
  x: number;
  y: number;
};

export type EdgeInsets = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type ResizeHandle = "e" | "n" | "ne" | "nw" | "s" | "se" | "sw" | "w";

const NUMERIC_VALUE_PATTERN = /^-?\d+(\.\d+)?$/;
const PIXEL_VALUE_PATTERN = /^-?\d+(\.\d+)?px$/i;
const RESIZE_HANDLES = new Set<ResizeHandle>(["n", "s", "e", "w", "nw", "ne", "sw", "se"]);

export function createCanvasRect(input: {
  height: number;
  width: number;
  x: number;
  y: number;
}): CanvasRect {
  return {
    bottom: input.y + input.height,
    height: input.height,
    right: input.x + input.width,
    width: input.width,
    x: input.x,
    y: input.y
  };
}

export function roundCanvasNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseFiniteCanvasLength(value: RenderStyleValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (NUMERIC_VALUE_PATTERN.test(trimmedValue) || PIXEL_VALUE_PATTERN.test(trimmedValue)) {
    const parsedValue = Number.parseFloat(trimmedValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

export function isResizeHandle(value: string | null | undefined): value is ResizeHandle {
  return value !== undefined && value !== null && RESIZE_HANDLES.has(value as ResizeHandle);
}

export function resolveInteractionTargetNodeId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const interactionNodeElement = target.closest("[data-interaction-node-id]");

  if (interactionNodeElement instanceof HTMLElement) {
    return interactionNodeElement.dataset.interactionNodeId ?? null;
  }

  const renderedNodeElement = target.closest("[data-node-id]");

  return renderedNodeElement?.getAttribute("data-node-id") ?? null;
}

export function resolveResizeHandleFromTarget(target: EventTarget | null): ResizeHandle | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const handleElement = target.closest("[data-interaction-handle]");

  if (!(handleElement instanceof HTMLElement)) {
    return null;
  }

  return isResizeHandle(handleElement.dataset.interactionHandle) ? handleElement.dataset.interactionHandle : null;
}

export function resolveCanvasPointFromClientCoordinates(input: {
  clientX: number;
  clientY: number;
  viewportElement: Element;
  viewportState: {
    panX: number;
    panY: number;
    zoom: number;
  };
}): CanvasPoint {
  const viewportRect = input.viewportElement.getBoundingClientRect();
  const zoom = input.viewportState.zoom > 0 ? input.viewportState.zoom : 1;

  return {
    x: (input.clientX - viewportRect.left - input.viewportState.panX) / zoom,
    y: (input.clientY - viewportRect.top - input.viewportState.panY) / zoom
  };
}

export function resolveNodeCanvasRect(
  document: RendererDocument,
  nodeId: string,
  measurementHandle: RendererMeasurementHandle | null,
  zoom: number,
  currentDocumentRevision?: number
): CanvasRect | null {
  const resolvedRect = resolveNodeCanvasRectWithSource(
    document,
    nodeId,
    measurementHandle,
    zoom,
    currentDocumentRevision
  );

  return resolvedRect?.rect ?? null;
}

export type NodeCanvasRectSource =
  | "authored_render_style"
  | "computed_layout"
  | "measured_dom";

export type NodeCanvasRectResolution = {
  rect: CanvasRect;
  source: NodeCanvasRectSource;
};

export function resolveMeasuredNodeCanvasRect(
  nodeId: string,
  measurementHandle: RendererMeasurementHandle | null,
  zoom: number,
  currentDocumentRevision?: number
): CanvasRect | null {
  return resolveMeasuredCanvasRect(nodeId, measurementHandle, zoom, currentDocumentRevision);
}

export function resolveNodeCanvasRectWithSource(
  document: RendererDocument,
  nodeId: string,
  measurementHandle: RendererMeasurementHandle | null,
  zoom: number,
  currentDocumentRevision?: number
): NodeCanvasRectResolution | null {
  const measuredRect = resolveMeasuredCanvasRect(
    nodeId,
    measurementHandle,
    zoom,
    currentDocumentRevision
  );

  if (measuredRect) {
    return {
      rect: measuredRect,
      source: "measured_dom"
    };
  }

  const node = document.nodes[nodeId];

  if (!node) {
    return null;
  }

  if (node.computed_layout) {
    return {
      rect: createCanvasRect(node.computed_layout),
      source: "computed_layout"
    };
  }

  const x = parseFiniteCanvasLength(node.render_style.left);
  const y = parseFiniteCanvasLength(node.render_style.top);
  const width = parseFiniteCanvasLength(node.render_style.width);
  const height = parseFiniteCanvasLength(node.render_style.height);

  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return {
    rect: createCanvasRect({
      height,
      width,
      x,
      y
    }),
    source: "authored_render_style"
  };
}

export function isSceneFrameNode(document: RendererDocument, node: RendererNode): boolean {
  return node.kind === "frame" && node.scene_id === node.id && document.scenes[node.id] !== undefined;
}

export function isNodeDirectlyManipulable(
  document: RendererDocument,
  node: RendererNode,
  allowMutation: boolean
): boolean {
  if (!allowMutation || node.is_locked || node.kind === "svg-visual-element") {
    return false;
  }

  if (hasNonPixelGeometryInputs(node.render_style)) {
    return false;
  }

  if (isSceneFrameNode(document, node) || node.parent_id === null) {
    return true;
  }

  return node.render_style.position === "absolute";
}

export function resolveFramePaddingInsets(node: RendererNode): EdgeInsets | null {
  if (node.kind !== "frame") {
    return null;
  }

  const individualInsets = {
    bottom: parseFiniteCanvasLength(node.render_style.paddingBottom),
    left: parseFiniteCanvasLength(node.render_style.paddingLeft),
    right: parseFiniteCanvasLength(node.render_style.paddingRight),
    top: parseFiniteCanvasLength(node.render_style.paddingTop)
  };

  if (Object.values(individualInsets).every((value) => value !== null)) {
    return individualInsets as EdgeInsets;
  }

  const paddingInsets = parseShorthandInsets(node.render_style.padding);
  const paddingBlock = parsePairInset(node.render_style.paddingBlock);
  const paddingInline = parsePairInset(node.render_style.paddingInline);

  const top =
    individualInsets.top ??
    paddingBlock?.start ??
    paddingInsets?.top ??
    0;
  const right =
    individualInsets.right ??
    paddingInline?.end ??
    paddingInsets?.right ??
    0;
  const bottom =
    individualInsets.bottom ??
    paddingBlock?.end ??
    paddingInsets?.bottom ??
    0;
  const left =
    individualInsets.left ??
    paddingInline?.start ??
    paddingInsets?.left ??
    0;

  return { bottom, left, right, top };
}

export function insetCanvasRect(rect: CanvasRect, insets: EdgeInsets): CanvasRect | null {
  const width = rect.width - insets.left - insets.right;
  const height = rect.height - insets.top - insets.bottom;

  if (width < 0 || height < 0) {
    return null;
  }

  return createCanvasRect({
    height,
    width,
    x: rect.x + insets.left,
    y: rect.y + insets.top
  });
}

export function resolveFlexAxis(node: RendererNode): "x" | "y" | null {
  if (node.kind !== "frame" || node.render_style.display !== "flex") {
    return null;
  }

  if (node.render_style.flexDirection === "column" || node.render_style.flexDirection === undefined) {
    return "y";
  }

  if (node.render_style.flexDirection === "row") {
    return "x";
  }

  return null;
}

function resolveMeasuredCanvasRect(
  nodeId: string,
  measurementHandle: RendererMeasurementHandle | null,
  zoom: number,
  currentDocumentRevision?: number
): CanvasRect | null {
  if (
    currentDocumentRevision !== undefined &&
    measurementHandle?.getDocumentRevision() !== currentDocumentRevision
  ) {
    return null;
  }

  const rootElement = measurementHandle?.getRootElement() ?? null;
  const nodeElement = measurementHandle?.getNodeElement(nodeId) ?? null;

  if (!rootElement || !nodeElement) {
    return null;
  }

  const rootRect = rootElement.getBoundingClientRect();
  const nodeRect = nodeElement.getBoundingClientRect();
  const safeZoom = zoom > 0 ? zoom : 1;

  return createCanvasRect({
    height: nodeRect.height / safeZoom,
    width: nodeRect.width / safeZoom,
    x: (nodeRect.left - rootRect.left) / safeZoom,
    y: (nodeRect.top - rootRect.top) / safeZoom
  });
}

function hasNonPixelGeometryInputs(renderStyle: RendererNode["render_style"]): boolean {
  return ["left", "top", "width", "height"].some((key) => {
    const value = renderStyle[key];
    return value !== undefined && parseFiniteCanvasLength(value) === null;
  });
}

function parseInsetTokens(value: RenderStyleValue | undefined): number[] | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }

  if (typeof value !== "string") {
    return null;
  }

  const tokens = value
    .trim()
    .split(/\s+/)
    .map((token) => parseFiniteCanvasLength(token))
    .filter((token): token is number => token !== null);

  if (tokens.length === 0 || tokens.length > 4) {
    return null;
  }

  return tokens;
}

function parseShorthandInsets(value: RenderStyleValue | undefined): EdgeInsets | null {
  const tokens = parseInsetTokens(value);

  if (!tokens) {
    return null;
  }

  if (tokens.length === 1) {
    return { bottom: tokens[0], left: tokens[0], right: tokens[0], top: tokens[0] };
  }

  if (tokens.length === 2) {
    return { bottom: tokens[0], left: tokens[1], right: tokens[1], top: tokens[0] };
  }

  if (tokens.length === 3) {
    return { bottom: tokens[2], left: tokens[1], right: tokens[1], top: tokens[0] };
  }

  return { bottom: tokens[2], left: tokens[3], right: tokens[1], top: tokens[0] };
}

function parsePairInset(value: RenderStyleValue | undefined): { end: number; start: number } | null {
  const tokens = parseInsetTokens(value);

  if (!tokens) {
    return null;
  }

  if (tokens.length === 1) {
    return { end: tokens[0], start: tokens[0] };
  }

  return { end: tokens[1], start: tokens[0] };
}
