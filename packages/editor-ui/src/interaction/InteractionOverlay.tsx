import type { RendererDocument, RendererNode } from "@ai-canvas/document-core";
import { Fragment, useMemo } from "react";

import type { RendererMeasurementHandle, ViewportState } from "../rendering/types.js";
import {
  insetCanvasRect,
  isNodeDirectlyManipulable,
  type CanvasRect,
  resolveFlexAxis,
  resolveFramePaddingInsets,
  resolveNodeCanvasRect,
  type ResizeHandle
} from "./geometry.js";

type InteractionPreview = {
  kind: "move" | "resize";
  nodeId: string;
  originalRect: CanvasRect;
  previewRect: CanvasRect;
};

export type InteractionOverlayProps = {
  allowMutation: boolean;
  document: RendererDocument;
  documentRevision: number;
  hoveredNodeId: string | null;
  measurementHandle: RendererMeasurementHandle | null;
  preview: InteractionPreview | null;
  selectionRectOverride: CanvasRect | null;
  selectedNodeId: string | null;
  viewport: ViewportState;
};

type MeasureSpec = {
  axis: "x" | "y";
  id: string;
  label: string;
  tone: "distance" | "padding";
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

const RESIZE_HANDLE_ORDER: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function InteractionOverlay({
  allowMutation,
  document,
  documentRevision,
  hoveredNodeId,
  measurementHandle,
  preview,
  selectionRectOverride,
  selectedNodeId,
  viewport
}: InteractionOverlayProps) {
  const selectedNode = selectedNodeId ? document.nodes[selectedNodeId] ?? null : null;
  const hoveredNode = hoveredNodeId ? document.nodes[hoveredNodeId] ?? null : null;
  const selectedRect =
    preview?.previewRect ??
    selectionRectOverride ??
    (selectedNode
      ? resolveOverlayCanvasRect(document, selectedNode.id, measurementHandle, viewport.zoom, documentRevision)
      : null);
  const originalSelectedRect = preview?.originalRect ?? selectedRect;
  const hoveredRect =
    hoveredNode && hoveredNode.id !== selectedNode?.id
      ? resolveOverlayCanvasRect(document, hoveredNode.id, measurementHandle, viewport.zoom, documentRevision)
      : null;
  const canManipulateSelection =
    selectedNode !== null && isNodeDirectlyManipulable(document, selectedNode, allowMutation);
  const parentNode =
    selectedNode && selectedNode.parent_id ? document.nodes[selectedNode.parent_id] ?? null : null;
  const parentRect =
    parentNode
      ? resolveOverlayCanvasRect(document, parentNode.id, measurementHandle, viewport.zoom, documentRevision)
      : null;
  const parentPaddingRect =
    parentNode && parentRect
      ? insetCanvasRect(parentRect, resolveFramePaddingInsets(parentNode) ?? { bottom: 0, left: 0, right: 0, top: 0 })
      : null;

  const spacingMeasures = useMemo(
    () =>
      selectedNode && selectedRect && parentNode && parentRect
        ? buildSpacingMeasures(
            document,
            documentRevision,
            measurementHandle,
            selectedNode,
            selectedRect,
            parentNode,
            parentRect,
            viewport.zoom
          )
        : [],
    [
      document,
      documentRevision,
      measurementHandle,
      parentNode,
      parentRect,
      selectedNode,
      selectedRect,
      viewport.zoom
    ]
  );
  const labelScale = viewport.zoom > 0 ? 1 / viewport.zoom : 1;
  const outlineThickness = 1 / Math.max(viewport.zoom, 0.0001);
  const handleSize = 10 / Math.max(viewport.zoom, 0.0001);

  return (
    <div
      data-interaction-overlay="true"
      style={{
        height: "100%",
        inset: 0,
        overflow: "visible",
        pointerEvents: "none",
        position: "relative",
        width: "100%"
      }}
    >
      <svg
        aria-hidden="true"
        style={{
          height: "100%",
          inset: 0,
          overflow: "visible",
          position: "absolute",
          width: "100%"
        }}
      >
        {hoveredRect ? (
          <rect
            data-interaction-outline="hover"
            data-node-id={hoveredNode?.id}
            fill="none"
            height={hoveredRect.height}
            stroke="rgba(17, 17, 17, 0.52)"
            strokeDasharray={`${5 * labelScale} ${4 * labelScale}`}
            strokeWidth={outlineThickness}
            width={hoveredRect.width}
            x={hoveredRect.x}
            y={hoveredRect.y}
          />
        ) : null}

        {parentPaddingRect ? (
          <rect
            data-interaction-padding-box="true"
            data-node-id={parentNode?.id}
            fill="rgba(17, 17, 17, 0.03)"
            height={parentPaddingRect.height}
            stroke="rgba(17, 17, 17, 0.42)"
            strokeDasharray={`${6 * labelScale} ${4 * labelScale}`}
            strokeWidth={outlineThickness}
            width={parentPaddingRect.width}
            x={parentPaddingRect.x}
            y={parentPaddingRect.y}
          />
        ) : null}

        {spacingMeasures.map((measure) => (
          <Fragment key={measure.id}>
            <line
              data-interaction-measure={measure.tone}
              data-measure-id={measure.id}
              stroke={
                measure.tone === "padding" ? "rgba(17, 17, 17, 0.72)" : "rgba(17, 17, 17, 0.54)"
              }
              strokeDasharray={measure.tone === "padding" ? `${4 * labelScale} ${3 * labelScale}` : undefined}
              strokeWidth={outlineThickness}
              x1={measure.x1}
              x2={measure.x2}
              y1={measure.y1}
              y2={measure.y2}
            />
          </Fragment>
        ))}

        {selectedRect ? (
          <rect
            data-interaction-outline="selected"
            data-node-id={selectedNode?.id}
            fill="none"
            height={selectedRect.height}
            stroke="rgba(17, 17, 17, 0.92)"
            strokeWidth={outlineThickness}
            width={selectedRect.width}
            x={selectedRect.x}
            y={selectedRect.y}
          />
        ) : null}
      </svg>

      {spacingMeasures.map((measure) => {
        const labelX = measure.axis === "x" ? Math.min(measure.x1, measure.x2) + Math.abs(measure.x2 - measure.x1) / 2 : measure.x1;
        const labelY = measure.axis === "y" ? Math.min(measure.y1, measure.y2) + Math.abs(measure.y2 - measure.y1) / 2 : measure.y1;

        return (
          <div
            data-interaction-label={measure.tone}
            data-measure-id={measure.id}
            key={`${measure.id}:label`}
            style={createLabelStyle(labelX, labelY, labelScale)}
          >
            {measure.label}
          </div>
        );
      })}

      {selectedRect ? (
        <div
          data-interaction-label="selection"
          data-node-id={selectedNode?.id}
          style={createLabelStyle(selectedRect.x, selectedRect.y - 14 * labelScale, labelScale)}
        >
          {`${Math.round(selectedRect.width)} × ${Math.round(selectedRect.height)} at ${Math.round(selectedRect.x)}, ${Math.round(selectedRect.y)}`}
        </div>
      ) : null}

      {preview && originalSelectedRect && preview.previewRect ? (
        <div
          data-interaction-preview="true"
          data-node-id={preview.nodeId}
          style={{
            backgroundColor: "rgba(17, 17, 17, 0.06)",
            border: `${outlineThickness}px dashed rgba(17, 17, 17, 0.72)`,
            boxShadow: `0 ${8 * labelScale}px ${24 * labelScale}px rgba(0, 0, 0, 0.16)`,
            height: `${preview.previewRect.height}px`,
            left: `${preview.previewRect.x}px`,
            pointerEvents: "none",
            position: "absolute",
            top: `${preview.previewRect.y}px`,
            width: `${preview.previewRect.width}px`
          }}
        />
      ) : null}

      {preview && originalSelectedRect ? (
        <div
          data-interaction-original="true"
          data-node-id={preview.nodeId}
          style={{
            border: `${outlineThickness}px solid rgba(17, 17, 17, 0.28)`,
            height: `${originalSelectedRect.height}px`,
            left: `${originalSelectedRect.x}px`,
            pointerEvents: "none",
            position: "absolute",
            top: `${originalSelectedRect.y}px`,
            width: `${originalSelectedRect.width}px`
          }}
        />
      ) : null}

      {selectedRect && canManipulateSelection && !preview
        ? RESIZE_HANDLE_ORDER.map((handle) => {
            const position = resolveHandlePosition(selectedRect, handle, handleSize);

            return (
              <div
                data-interaction-handle={handle}
                data-interaction-node-id={selectedNode?.id}
                data-node-id={selectedNode?.id}
                key={handle}
                style={{
                  backgroundColor: "#ffffff",
                  border: `${outlineThickness}px solid rgba(17, 17, 17, 0.92)`,
                  borderRadius: 999,
                  cursor: resolveHandleCursor(handle),
                  height: `${handleSize}px`,
                  left: `${position.x}px`,
                  pointerEvents: "auto",
                  position: "absolute",
                  top: `${position.y}px`,
                  width: `${handleSize}px`
                }}
              />
            );
          })
        : null}
    </div>
  );
}

function buildSpacingMeasures(
  document: RendererDocument,
  documentRevision: number,
  measurementHandle: RendererMeasurementHandle | null,
  selectedNode: RendererNode,
  selectedRect: CanvasRect,
  parentNode: RendererNode,
  parentRect: CanvasRect,
  zoom: number
): MeasureSpec[] {
  const measures: MeasureSpec[] = [];

  if (selectedRect.x > parentRect.x) {
    measures.push({
      axis: "x",
      id: "parent-left",
      label: `${Math.round(selectedRect.x - parentRect.x)}px`,
      tone: "padding",
      x1: parentRect.x,
      x2: selectedRect.x,
      y1: selectedRect.y + selectedRect.height / 2,
      y2: selectedRect.y + selectedRect.height / 2
    });
  }

  if (selectedRect.right < parentRect.right) {
    measures.push({
      axis: "x",
      id: "parent-right",
      label: `${Math.round(parentRect.right - selectedRect.right)}px`,
      tone: "padding",
      x1: selectedRect.right,
      x2: parentRect.right,
      y1: selectedRect.y + selectedRect.height / 2,
      y2: selectedRect.y + selectedRect.height / 2
    });
  }

  if (selectedRect.y > parentRect.y) {
    measures.push({
      axis: "y",
      id: "parent-top",
      label: `${Math.round(selectedRect.y - parentRect.y)}px`,
      tone: "padding",
      x1: selectedRect.x + selectedRect.width / 2,
      x2: selectedRect.x + selectedRect.width / 2,
      y1: parentRect.y,
      y2: selectedRect.y
    });
  }

  if (selectedRect.bottom < parentRect.bottom) {
    measures.push({
      axis: "y",
      id: "parent-bottom",
      label: `${Math.round(parentRect.bottom - selectedRect.bottom)}px`,
      tone: "padding",
      x1: selectedRect.x + selectedRect.width / 2,
      x2: selectedRect.x + selectedRect.width / 2,
      y1: selectedRect.bottom,
      y2: parentRect.bottom
    });
  }

  const layoutAxis = resolveFlexAxis(parentNode);

  if (!layoutAxis || parentNode.kind !== "frame") {
    return measures;
  }

  const siblingIds = parentNode.child_ids;
  const selectedIndex = siblingIds.indexOf(selectedNode.id);

  if (selectedIndex === -1) {
    return measures;
  }

  const previousSiblingId = selectedIndex > 0 ? siblingIds[selectedIndex - 1] : null;
  const nextSiblingId = selectedIndex < siblingIds.length - 1 ? siblingIds[selectedIndex + 1] : null;
  const previousRect =
    previousSiblingId
      ? resolveNodeCanvasRect(
          document,
          previousSiblingId,
          null,
          zoom,
          documentRevision
        ) ??
        resolveNodeCanvasRect(document, previousSiblingId, measurementHandle, zoom, documentRevision)
      : null;
  const nextRect =
    nextSiblingId
      ? resolveNodeCanvasRect(
          document,
          nextSiblingId,
          null,
          zoom,
          documentRevision
        ) ??
        resolveNodeCanvasRect(document, nextSiblingId, measurementHandle, zoom, documentRevision)
      : null;

  if (layoutAxis === "x" && previousRect && previousRect.right <= selectedRect.x) {
    measures.push({
      axis: "x",
      id: "sibling-left-gap",
      label: `${Math.round(selectedRect.x - previousRect.right)}px`,
      tone: "distance",
      x1: previousRect.right,
      x2: selectedRect.x,
      y1: selectedRect.y + selectedRect.height / 2,
      y2: selectedRect.y + selectedRect.height / 2
    });
  }

  if (layoutAxis === "x" && nextRect && selectedRect.right <= nextRect.x) {
    measures.push({
      axis: "x",
      id: "sibling-right-gap",
      label: `${Math.round(nextRect.x - selectedRect.right)}px`,
      tone: "distance",
      x1: selectedRect.right,
      x2: nextRect.x,
      y1: selectedRect.y + selectedRect.height / 2,
      y2: selectedRect.y + selectedRect.height / 2
    });
  }

  if (layoutAxis === "y" && previousRect && previousRect.bottom <= selectedRect.y) {
    measures.push({
      axis: "y",
      id: "sibling-top-gap",
      label: `${Math.round(selectedRect.y - previousRect.bottom)}px`,
      tone: "distance",
      x1: selectedRect.x + selectedRect.width / 2,
      x2: selectedRect.x + selectedRect.width / 2,
      y1: previousRect.bottom,
      y2: selectedRect.y
    });
  }

  if (layoutAxis === "y" && nextRect && selectedRect.bottom <= nextRect.y) {
    measures.push({
      axis: "y",
      id: "sibling-bottom-gap",
      label: `${Math.round(nextRect.y - selectedRect.bottom)}px`,
      tone: "distance",
      x1: selectedRect.x + selectedRect.width / 2,
      x2: selectedRect.x + selectedRect.width / 2,
      y1: selectedRect.bottom,
      y2: nextRect.y
    });
  }

  return measures;
}

function resolveOverlayCanvasRect(
  document: RendererDocument,
  nodeId: string,
  measurementHandle: RendererMeasurementHandle | null,
  zoom: number,
  documentRevision: number
): CanvasRect | null {
  return (
    resolveNodeCanvasRect(document, nodeId, null, zoom, documentRevision) ??
    resolveNodeCanvasRect(document, nodeId, measurementHandle, zoom, documentRevision)
  );
}

function createLabelStyle(x: number, y: number, scale: number) {
  return {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    border: `${1 * scale}px solid rgba(17, 17, 17, 0.18)`,
    borderRadius: `${999 * scale}px`,
    color: "#111111",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: `${11 * scale}px`,
    left: `${x}px`,
    padding: `${3 * scale}px ${6 * scale}px`,
    position: "absolute" as const,
    top: `${y}px`,
    transform: "translate(-50%, -50%)",
    whiteSpace: "nowrap" as const
  };
}

function resolveHandlePosition(rect: CanvasRect, handle: ResizeHandle, handleSize: number) {
  const halfHandle = handleSize / 2;
  const centerX = rect.x + rect.width / 2 - halfHandle;
  const centerY = rect.y + rect.height / 2 - halfHandle;
  const left = rect.x - halfHandle;
  const right = rect.right - halfHandle;
  const top = rect.y - halfHandle;
  const bottom = rect.bottom - halfHandle;

  switch (handle) {
    case "nw":
      return { x: left, y: top };
    case "n":
      return { x: centerX, y: top };
    case "ne":
      return { x: right, y: top };
    case "e":
      return { x: right, y: centerY };
    case "se":
      return { x: right, y: bottom };
    case "s":
      return { x: centerX, y: bottom };
    case "sw":
      return { x: left, y: bottom };
    case "w":
      return { x: left, y: centerY };
  }
}

function resolveHandleCursor(handle: ResizeHandle): string {
  switch (handle) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
  }
}
