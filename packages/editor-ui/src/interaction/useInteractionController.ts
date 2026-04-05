import type { RendererDocument, RendererNode } from "@ai-canvas/document-core";
import type { AppResult, ApplyCommandsInput, CommandResult } from "@ai-canvas/ipc-contract";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { CanvasTool, CreateCanvasTool } from "../canvasTools.js";
import { isCreateCanvasTool } from "../canvasTools.js";
import type { RendererMeasurementHandle, ViewportState } from "../rendering/types.js";
import {
  createCanvasRect,
  type CanvasPoint,
  type CanvasRect,
  isNodeDirectlyManipulable,
  isSceneFrameNode,
  resolveFramePaddingInsets,
  roundCanvasNumber,
  type ResizeHandle,
  resolveCanvasPointFromClientCoordinates,
  resolveInteractionTargetNodeId,
  resolveNodeCanvasRect,
  resolveResizeHandleFromTarget
} from "./geometry.js";

const GESTURE_MOVE_THRESHOLD = 1;
const MIN_RESIZE_SIZE = 8;

type InteractionPreview = {
  kind: "move" | "resize";
  nodeId: string;
  originalRect: CanvasRect;
  previewRect: CanvasRect;
};

type GestureState = InteractionPreview & {
  hasMoved: boolean;
  pointerId: number;
  resizeHandle: ResizeHandle | null;
  startPoint: CanvasPoint;
};

type SelectionRectOverride = {
  nodeId: string;
  rect: CanvasRect;
  targetRevision: number | null;
};

type CreateCommandDescriptor = {
  createdNodeId: string;
  input: ApplyCommandsInput;
};

type CreateNodePayload = Extract<ApplyCommandsInput["commands"][number], { type: "create_node" }>["node"];

type CreateInsertionTarget = {
  index?: number;
  parentId: string | null;
};

export type UseInteractionControllerInput = {
  activeTool: CanvasTool;
  allowMutation: boolean;
  document: RendererDocument;
  isPanModifierActive?: boolean;
  onCanvasToolChange?: (tool: CanvasTool) => void;
  onSelectedNodeIdChange?: (nodeId: string | null) => void;
  onApplyCommands?: (input: ApplyCommandsInput) => Promise<AppResult<CommandResult>>;
  rendererRef: RefObject<RendererMeasurementHandle | null>;
  revision: number;
  selectedNodeId: string | null;
  viewport: ViewportState;
  workspaceIdentity: string;
};

export type UseInteractionControllerResult = {
  commandError: string | null;
  handleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handlePointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => boolean;
  handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => boolean;
  handlePointerLeave: () => void;
  handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => boolean;
  handlePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => boolean;
  hoveredNodeId: string | null;
  isGestureActive: boolean;
  isMutatingSelection: boolean;
  preview: InteractionPreview | null;
  selectionRectOverride: CanvasRect | null;
  selectedNodeId: string | null;
};

export function useInteractionController({
  activeTool,
  allowMutation,
  document,
  isPanModifierActive = false,
  onCanvasToolChange,
  onSelectedNodeIdChange,
  onApplyCommands,
  rendererRef,
  revision,
  selectedNodeId,
  viewport,
  workspaceIdentity
}: UseInteractionControllerInput): UseInteractionControllerResult {
  const [commandError, setCommandError] = useState<string | null>(null);
  const [gestureState, setGestureState] = useState<GestureState | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isMutatingSelection, setIsMutatingSelection] = useState(false);
  const [selectionRectOverride, setSelectionRectOverride] = useState<SelectionRectOverride | null>(
    null
  );
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    setCommandError(null);
    setGestureState(null);
    setHoveredNodeId(null);
    setIsMutatingSelection(false);
    setSelectionRectOverride(null);
    suppressNextClickRef.current = false;
  }, [workspaceIdentity]);

  useEffect(() => {
    if (selectedNodeId && !document.nodes[selectedNodeId]) {
      onSelectedNodeIdChange?.(null);
    }

    if (hoveredNodeId && !document.nodes[hoveredNodeId]) {
      setHoveredNodeId(null);
    }

    if (gestureState && !document.nodes[gestureState.nodeId]) {
      setGestureState(null);
      setIsMutatingSelection(false);
    }

    if (selectionRectOverride && !document.nodes[selectionRectOverride.nodeId]) {
      setSelectionRectOverride(null);
    }
  }, [document, gestureState, hoveredNodeId, onSelectedNodeIdChange, selectedNodeId, selectionRectOverride]);

  useEffect(() => {
    if (activeTool === "selection") {
      return;
    }

    setGestureState(null);
    setSelectionRectOverride(null);

    if (activeTool === "grab") {
      setHoveredNodeId(null);
    }
  }, [activeTool]);

  useLayoutEffect(() => {
    if (!selectionRectOverride) {
      return;
    }

    if (selectedNodeId !== selectionRectOverride.nodeId) {
      setSelectionRectOverride(null);
      return;
    }

    const measuredRect = resolveNodeCanvasRect(
      document,
      selectionRectOverride.nodeId,
      rendererRef.current,
      viewport.zoom,
      revision
    );

    if (measuredRect && areCanvasRectsClose(measuredRect, selectionRectOverride.rect)) {
      setSelectionRectOverride(null);
      return;
    }

    if (
      selectionRectOverride.targetRevision !== null &&
      revision >= selectionRectOverride.targetRevision
    ) {
      setSelectionRectOverride(null);
    }
  }, [document, rendererRef, revision, selectedNodeId, selectionRectOverride, viewport.zoom]);

  useEffect(() => {
    if (!gestureState) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      suppressNextClickRef.current = true;
      setGestureState(null);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [gestureState]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? document.nodes[selectedNodeId] ?? null : null),
    [document.nodes, selectedNodeId]
  );
  const selectedNodeCanBeManipulated =
    selectedNode !== null && isNodeDirectlyManipulable(document, selectedNode, allowMutation);

  const startGesture = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      node: RendererNode,
      kind: "move" | "resize",
      resizeHandle: ResizeHandle | null
    ) => {
      const originalRect = resolveNodeCanvasRect(
        document,
        node.id,
        rendererRef.current,
        viewport.zoom,
        revision
      );

      if (!originalRect) {
        return false;
      }

      suppressNextClickRef.current = true;
      setCommandError(null);
      setHoveredNodeId(node.id);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      setGestureState({
        hasMoved: false,
        kind,
        nodeId: node.id,
        originalRect,
        pointerId: event.pointerId,
        previewRect: originalRect,
        resizeHandle,
        startPoint: resolveCanvasPointFromClientCoordinates({
          clientX: event.clientX,
          clientY: event.clientY,
          viewportElement: event.currentTarget,
          viewportState: viewport
        })
      });

      return true;
    },
    [document, rendererRef, revision, viewport]
  );

  const commitGesture = useCallback(
    async (nextGesture: GestureState) => {
      if (!onApplyCommands) {
        return;
      }

      const commandInput = createCommitInput(document, nextGesture, revision);

      if (!commandInput) {
        return;
      }

      setIsMutatingSelection(true);
      setSelectionRectOverride({
        nodeId: nextGesture.nodeId,
        rect: nextGesture.previewRect,
        targetRevision: null
      });

      try {
        const result = await onApplyCommands(commandInput);

        if (!result.ok) {
          setCommandError(result.error.message);
          setSelectionRectOverride(null);
        } else {
          setCommandError(null);
          setSelectionRectOverride((currentSelectionRectOverride) =>
            currentSelectionRectOverride && currentSelectionRectOverride.nodeId === nextGesture.nodeId
              ? {
                  ...currentSelectionRectOverride,
                  targetRevision: result.data.revision
                }
              : currentSelectionRectOverride
          );
        }
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : "Failed to apply commands");
        setSelectionRectOverride(null);
      } finally {
        setIsMutatingSelection(false);
      }
    },
    [document, onApplyCommands, revision]
  );

  const commitCreateNode = useCallback(
    async (tool: CreateCanvasTool, event: ReactMouseEvent<HTMLDivElement>) => {
      if (!allowMutation || !onApplyCommands) {
        return;
      }

      const createCommand = resolveCreateCommandDescriptor({
        document,
        event,
        rendererRef: rendererRef.current,
        revision,
        tool,
        viewport
      });

      if (!createCommand) {
        setCommandError("Failed to resolve insertion target");
        return;
      }

      setCommandError(null);
      setIsMutatingSelection(true);

      try {
        const result = await onApplyCommands(createCommand.input);

        if (!result.ok) {
          setCommandError(result.error.message);
          return;
        }

        setCommandError(null);
        setHoveredNodeId(null);
        setSelectionRectOverride(null);
        onSelectedNodeIdChange?.(createCommand.createdNodeId);
        onCanvasToolChange?.("selection");
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : "Failed to apply commands");
      } finally {
        setIsMutatingSelection(false);
      }
    },
    [allowMutation, document, onApplyCommands, onCanvasToolChange, onSelectedNodeIdChange, rendererRef, revision, viewport]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        activeTool !== "selection" ||
        event.button !== 0 ||
        isMutatingSelection ||
        isPanModifierActive
      ) {
        return false;
      }

      const targetNodeId = resolveInteractionTargetNodeId(event.target);
      const resizeHandle = resolveResizeHandleFromTarget(event.target);

      if (!targetNodeId) {
        return false;
      }

      const targetNode = document.nodes[targetNodeId];

      if (!targetNode) {
        return false;
      }

      setCommandError(null);
      setHoveredNodeId(targetNodeId);
      onSelectedNodeIdChange?.(targetNodeId);
      setSelectionRectOverride(null);

      if (!isNodeDirectlyManipulable(document, targetNode, allowMutation)) {
        return true;
      }

      if (resizeHandle) {
        return startGesture(event, targetNode, "resize", resizeHandle);
      }

      return startGesture(event, targetNode, "move", null);
    },
    [
      activeTool,
      allowMutation,
      document,
      isMutatingSelection,
      isPanModifierActive,
      onSelectedNodeIdChange,
      startGesture
    ]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (gestureState) {
        if (gestureState.pointerId !== event.pointerId) {
          return true;
        }

        event.preventDefault();

        const nextPoint = resolveCanvasPointFromClientCoordinates({
          clientX: event.clientX,
          clientY: event.clientY,
          viewportElement: event.currentTarget,
          viewportState: viewport
        });
        const deltaX = nextPoint.x - gestureState.startPoint.x;
        const deltaY = nextPoint.y - gestureState.startPoint.y;
        const previewRect =
          gestureState.kind === "move"
            ? createCanvasRect({
                height: gestureState.originalRect.height,
                width: gestureState.originalRect.width,
                x: gestureState.originalRect.x + deltaX,
                y: gestureState.originalRect.y + deltaY
              })
            : resolveResizePreviewRect(gestureState.originalRect, gestureState.resizeHandle, deltaX, deltaY);

        setGestureState((currentGesture) =>
          currentGesture
            ? {
                ...currentGesture,
                hasMoved:
                  currentGesture.hasMoved ||
                  Math.abs(previewRect.x - currentGesture.originalRect.x) >= GESTURE_MOVE_THRESHOLD ||
                  Math.abs(previewRect.y - currentGesture.originalRect.y) >= GESTURE_MOVE_THRESHOLD ||
                  Math.abs(previewRect.width - currentGesture.originalRect.width) >= GESTURE_MOVE_THRESHOLD ||
                  Math.abs(previewRect.height - currentGesture.originalRect.height) >= GESTURE_MOVE_THRESHOLD,
                previewRect
              }
            : currentGesture
        );

        return true;
      }

      if (!event.isPrimary || isMutatingSelection) {
        return false;
      }

      if (activeTool === "grab") {
        setHoveredNodeId(null);
        return false;
      }

      setHoveredNodeId(resolveInteractionTargetNodeId(event.target));
      return false;
    },
    [activeTool, gestureState, isMutatingSelection, viewport]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!gestureState || gestureState.pointerId !== event.pointerId) {
        return false;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setGestureState(null);

      if (!gestureState.hasMoved) {
        return true;
      }

      void commitGesture(gestureState);
      return true;
    },
    [commitGesture, gestureState]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!gestureState || gestureState.pointerId !== event.pointerId) {
        return false;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      suppressNextClickRef.current = true;
      setGestureState(null);
      return true;
    },
    [gestureState]
  );

  const handlePointerLeave = useCallback(() => {
    if (!gestureState) {
      setHoveredNodeId(null);
    }
  }, [gestureState]);

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isMutatingSelection) {
        return;
      }

      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      if (resolveResizeHandleFromTarget(event.target)) {
        return;
      }

      if (activeTool === "grab") {
        return;
      }

      if (isCreateCanvasTool(activeTool)) {
        void commitCreateNode(activeTool, event);
        return;
      }

      const targetNodeId = resolveInteractionTargetNodeId(event.target);

      setCommandError(null);
      onSelectedNodeIdChange?.(targetNodeId);
      setHoveredNodeId(targetNodeId);
    },
    [activeTool, commitCreateNode, isMutatingSelection, onSelectedNodeIdChange]
  );

  return {
    commandError,
    handleClick,
    handlePointerCancel,
    handlePointerDown,
    handlePointerLeave,
    handlePointerMove,
    handlePointerUp,
    hoveredNodeId,
    isGestureActive: gestureState !== null,
    isMutatingSelection,
    preview: gestureState
      ? gestureState.hasMoved
        ? {
            kind: gestureState.kind,
            nodeId: gestureState.nodeId,
            originalRect: gestureState.originalRect,
            previewRect: gestureState.previewRect
          }
        : null
      : null,
    selectionRectOverride:
      selectionRectOverride && selectionRectOverride.nodeId === selectedNodeId
        ? selectionRectOverride.rect
        : null,
    selectedNodeId,
    ...(selectedNodeCanBeManipulated ? {} : {})
  };
}

function areCanvasRectsClose(left: CanvasRect, right: CanvasRect): boolean {
  return (
    Math.abs(left.x - right.x) < 0.5 &&
    Math.abs(left.y - right.y) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  );
}

function resolveResizePreviewRect(
  originalRect: CanvasRect,
  resizeHandle: ResizeHandle | null,
  deltaX: number,
  deltaY: number
): CanvasRect {
  if (!resizeHandle) {
    return originalRect;
  }

  let nextX = originalRect.x;
  let nextY = originalRect.y;
  let nextWidth = originalRect.width;
  let nextHeight = originalRect.height;

  if (resizeHandle.includes("e")) {
    nextWidth = Math.max(MIN_RESIZE_SIZE, originalRect.width + deltaX);
  }

  if (resizeHandle.includes("s")) {
    nextHeight = Math.max(MIN_RESIZE_SIZE, originalRect.height + deltaY);
  }

  if (resizeHandle.includes("w")) {
    nextWidth = Math.max(MIN_RESIZE_SIZE, originalRect.width - deltaX);
    nextX = originalRect.right - nextWidth;
  }

  if (resizeHandle.includes("n")) {
    nextHeight = Math.max(MIN_RESIZE_SIZE, originalRect.height - deltaY);
    nextY = originalRect.bottom - nextHeight;
  }

  return createCanvasRect({
    height: nextHeight,
    width: nextWidth,
    x: nextX,
    y: nextY
  });
}

function createCommitInput(
  document: RendererDocument,
  gestureState: GestureState,
  revision: number
): ApplyCommandsInput | null {
  const node = document.nodes[gestureState.nodeId];

  if (!node) {
    return null;
  }

  if (gestureState.kind === "move") {
    const patch = {
      left: roundCanvasNumber(gestureState.previewRect.x),
      top: roundCanvasNumber(gestureState.previewRect.y)
    };

    if (isSceneFrameNode(document, node)) {
      return {
        base_revision: revision,
        commands: [
          {
            patch,
            scene_id: node.id,
            type: "update_scene"
          }
        ],
        document_id: document.document_id
      };
    }

    return {
      base_revision: revision,
      commands: [
        {
          node_id: node.id,
          patch,
          type: "update_node"
        }
      ],
      document_id: document.document_id
    };
  }

  const resizePatch = {
    ...(gestureState.resizeHandle?.includes("w") || gestureState.resizeHandle?.includes("n")
      ? {
          left: roundCanvasNumber(gestureState.previewRect.x),
          top: roundCanvasNumber(gestureState.previewRect.y)
        }
      : {}),
    height: roundCanvasNumber(gestureState.previewRect.height),
    width: roundCanvasNumber(gestureState.previewRect.width)
  };

  if (isSceneFrameNode(document, node)) {
    return {
      base_revision: revision,
      commands: [
        {
          patch: resizePatch,
          scene_id: node.id,
          type: "update_scene"
        }
      ],
      document_id: document.document_id
    };
  }

  return {
    base_revision: revision,
    commands: [
      {
        node_id: node.id,
        patch: resizePatch,
        type: "update_node"
      }
    ],
    document_id: document.document_id
  };
}

function resolveCreateCommandDescriptor(input: {
  document: RendererDocument;
  event: ReactMouseEvent<HTMLDivElement>;
  rendererRef: RendererMeasurementHandle | null;
  revision: number;
  tool: CreateCanvasTool;
  viewport: ViewportState;
}): CreateCommandDescriptor | null {
  const targetNodeId = resolveInteractionTargetNodeId(input.event.target);
  const clickPoint = resolveCanvasPointFromClientCoordinates({
    clientX: input.event.clientX,
    clientY: input.event.clientY,
    viewportElement: input.event.currentTarget,
    viewportState: input.viewport
  });
  const insertionTarget = resolveCreateInsertionTarget(input.document, targetNodeId);

  if (!insertionTarget) {
    return null;
  }

  const parentNode = insertionTarget.parentId
    ? input.document.nodes[insertionTarget.parentId] ?? null
    : null;
  const localPoint = resolveCreateLocalPoint({
    clickPoint,
    document: input.document,
    parentNode,
    rendererRef: input.rendererRef,
    revision: input.revision,
    viewportZoom: input.viewport.zoom
  });

  if (!localPoint) {
    return null;
  }

  const createdNodeId = createNodeId(input.tool);
  const commands: ApplyCommandsInput["commands"] = [];

  if (shouldPatchParentToRelative(parentNode)) {
    commands.push({
      node_id: parentNode.id,
      patch: {
        render_style: {
          position: "relative"
        }
      },
      type: "update_node"
    });
  }

  commands.push({
    node: createNodePayload(input.tool, createdNodeId, localPoint),
    parent: {
      parent_id: insertionTarget.parentId,
      ...(insertionTarget.index === undefined ? {} : { index: insertionTarget.index })
    },
    type: "create_node"
  });

  return {
    createdNodeId,
    input: {
      base_revision: input.revision,
      commands,
      document_id: input.document.document_id
    }
  };
}

function resolveCreateInsertionTarget(
  document: RendererDocument,
  targetNodeId: string | null
): CreateInsertionTarget | null {
  if (!targetNodeId) {
    return {
      index: document.root.child_ids.length,
      parentId: null
    };
  }

  const targetNode = document.nodes[targetNodeId];

  if (!targetNode) {
    return null;
  }

  switch (targetNode.kind) {
    case "frame":
      return {
        index: targetNode.child_ids.length,
        parentId: targetNode.id
      };
    case "rectangle":
    case "text":
      return resolveSiblingInsertionTarget(document, targetNode.id);
    case "svg":
    case "svg-visual-element": {
      const svgSiblingAnchor = resolveSvgSiblingAnchor(document, targetNode.id);
      return svgSiblingAnchor ? resolveSiblingInsertionTarget(document, svgSiblingAnchor.id) : null;
    }
  }
}

function resolveSiblingInsertionTarget(
  document: RendererDocument,
  nodeId: string
): CreateInsertionTarget | null {
  const node = document.nodes[nodeId];

  if (!node) {
    return null;
  }

  if (node.parent_id === null) {
    const index = document.root.child_ids.indexOf(node.id);

    return {
      index: index === -1 ? document.root.child_ids.length : index + 1,
      parentId: null
    };
  }

  const parentNode = document.nodes[node.parent_id];

  if (!parentNode) {
    return null;
  }

  const index = parentNode.child_ids.indexOf(node.id);

  return {
    index: index === -1 ? parentNode.child_ids.length : index + 1,
    parentId: parentNode.id
  };
}

function resolveSvgSiblingAnchor(
  document: RendererDocument,
  nodeId: string
): RendererNode | null {
  let currentNode = document.nodes[nodeId] ?? null;

  while (currentNode?.parent_id) {
    const parentNode = document.nodes[currentNode.parent_id] ?? null;

    if (!parentNode || parentNode.kind !== "svg") {
      break;
    }

    currentNode = parentNode;
  }

  return currentNode;
}

function resolveCreateLocalPoint(input: {
  clickPoint: CanvasPoint;
  document: RendererDocument;
  parentNode: RendererNode | null;
  rendererRef: RendererMeasurementHandle | null;
  revision: number;
  viewportZoom: number;
}): CanvasPoint | null {
  if (!input.parentNode) {
    return {
      x: roundCanvasNumber(input.clickPoint.x),
      y: roundCanvasNumber(input.clickPoint.y)
    };
  }

  const parentRect = resolveNodeCanvasRect(
    input.document,
    input.parentNode.id,
    input.rendererRef,
    input.viewportZoom,
    input.revision
  );

  if (!parentRect) {
    return null;
  }

  const paddingInsets =
    input.parentNode.kind === "frame"
      ? resolveFramePaddingInsets(input.parentNode) ?? { bottom: 0, left: 0, right: 0, top: 0 }
      : { bottom: 0, left: 0, right: 0, top: 0 };

  return {
    x: roundCanvasNumber(input.clickPoint.x - parentRect.x - paddingInsets.left),
    y: roundCanvasNumber(input.clickPoint.y - parentRect.y - paddingInsets.top)
  };
}

function shouldPatchParentToRelative(parentNode: RendererNode | null): parentNode is RendererNode {
  if (!parentNode || parentNode.kind !== "frame" || parentNode.parent_id === null) {
    return false;
  }

  return !isPositionedValue(parentNode.render_style.position);
}

function isPositionedValue(value: unknown): boolean {
  return value === "absolute" || value === "fixed" || value === "relative" || value === "sticky";
}

function createNodeId(tool: CreateCanvasTool): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? createFallbackId();

  switch (tool) {
    case "frame":
      return `frame_${suffix}`;
    case "rectangle":
      return `rect_${suffix}`;
    case "text":
      return `text_${suffix}`;
  }
}

function createFallbackId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function createNodePayload(
  tool: CreateCanvasTool,
  nodeId: string,
  localPoint: CanvasPoint
): CreateNodePayload {
  switch (tool) {
    case "frame":
      return {
        height: 240,
        id: nodeId,
        kind: "frame" as const,
        left: localPoint.x,
        name: "Frame",
        render_style: {
          backgroundColor: "#f5f5f5",
          border: "1px solid rgba(17, 17, 17, 0.14)",
          position: "absolute"
        },
        top: localPoint.y,
        width: 320
      };
    case "rectangle":
      return {
        height: 120,
        id: nodeId,
        kind: "rectangle" as const,
        left: localPoint.x,
        name: "Rectangle",
        render_style: {
          backgroundColor: "#d4d4d4",
          position: "absolute"
        },
        top: localPoint.y,
        width: 160
      };
    case "text":
      return {
        id: nodeId,
        kind: "text" as const,
        left: localPoint.x,
        name: "Text",
        render_style: {
          color: "#111111",
          fontFamily: "IBM Plex Sans",
          fontSize: 24,
          fontWeight: 500,
          position: "absolute"
        },
        text: {
          content: "Text"
        },
        top: localPoint.y
      };
  }
}
