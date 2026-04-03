import type { RendererDocument, RendererNode } from "@ai-canvas/document-core";
import type { AppResult, ApplyCommandsInput, CommandResult } from "@ai-canvas/ipc-contract";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { RendererMeasurementHandle, ViewportState } from "../rendering/types.js";
import {
  createCanvasRect,
  type CanvasPoint,
  type CanvasRect,
  isNodeDirectlyManipulable,
  isSceneFrameNode,
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

export type UseInteractionControllerInput = {
  allowMutation: boolean;
  document: RendererDocument;
  isPanModifierActive?: boolean;
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
  allowMutation,
  document,
  isPanModifierActive = false,
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
      viewport.zoom
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
        viewport.zoom
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
    [document, rendererRef, viewport]
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

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isMutatingSelection || isPanModifierActive) {
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

      setHoveredNodeId(resolveInteractionTargetNodeId(event.target));
      return false;
    },
    [gestureState, isMutatingSelection, viewport]
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

      const targetNodeId = resolveInteractionTargetNodeId(event.target);

      setCommandError(null);
      onSelectedNodeIdChange?.(targetNodeId);
      setHoveredNodeId(targetNodeId);
    },
    [isMutatingSelection, onSelectedNodeIdChange]
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
