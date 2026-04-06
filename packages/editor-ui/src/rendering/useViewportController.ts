import type { RendererDocument } from "@ai-canvas/document-core";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ViewportState } from "./types.js";
import {
  DEFAULT_VIEWPORT,
  DEFAULT_VIEWPORT_FIT_PADDING,
  centerViewportOnPoint,
  clampViewportZoom,
  createViewportForContentBounds,
  isCanvasBoundsFullyVisible,
  revealCanvasBounds,
  resolveTopLevelContentBounds,
  zoomViewportAroundPoint,
  type ViewportSize
} from "./viewport.js";

const MODIFIED_WHEEL_ZOOM_SENSITIVITY = 0.00375;

type UseViewportControllerInput = {
  document: RendererDocument;
  fitPadding?: number;
  workspaceIdentity: string;
};

type DragState = {
  lastClientX: number;
  lastClientY: number;
  pointerId: number;
  workspaceIdentity: string;
};

type ScopedBooleanState = {
  value: boolean;
  workspaceIdentity: string | null;
};

type ScopedDraggingState = {
  isDragging: boolean;
  workspaceIdentity: string | null;
};

type ScopedViewportState = {
  viewport: ViewportState;
  workspaceIdentity: string | null;
};

type ViewportUpdater = ViewportState | ((currentViewport: ViewportState) => ViewportState);

const EMPTY_VIEWPORT_SIZE: ViewportSize = {
  height: 0,
  width: 0
};

function areViewportSizesEqual(left: ViewportSize, right: ViewportSize): boolean {
  return left.width === right.width && left.height === right.height;
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"))
  );
}

function measureViewportSize(element: HTMLDivElement | null): ViewportSize {
  if (!element) {
    return EMPTY_VIEWPORT_SIZE;
  }

  const rect = element.getBoundingClientRect();

  return {
    height: rect.height,
    width: rect.width
  };
}

function createInitialViewport(
  contentBounds: ReturnType<typeof resolveTopLevelContentBounds>,
  viewportSize: ViewportSize,
  fitPadding: number
): ViewportState {
  if (viewportSize.width === 0 || viewportSize.height === 0) {
    return DEFAULT_VIEWPORT;
  }

  return createViewportForContentBounds(contentBounds, viewportSize, {
    maxZoom: 1,
    padding: fitPadding
  });
}

export function useViewportController({
  document,
  fitPadding = DEFAULT_VIEWPORT_FIT_PADDING,
  workspaceIdentity
}: UseViewportControllerInput) {
  const [viewportState, setViewportState] = useState<ScopedViewportState>(() => ({
    viewport: DEFAULT_VIEWPORT,
    workspaceIdentity: null
  }));
  const [viewportSize, setViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const [draggingState, setDraggingState] = useState<ScopedDraggingState>(() => ({
    isDragging: false,
    workspaceIdentity: null
  }));
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [interactionState, setInteractionState] = useState<ScopedBooleanState>(() => ({
    value: false,
    workspaceIdentity: null
  }));
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const contentBounds = useMemo(() => resolveTopLevelContentBounds(document), [document]);
  const viewport =
    viewportState.workspaceIdentity === workspaceIdentity
      ? viewportState.viewport
      : createInitialViewport(contentBounds, viewportSize, fitPadding);
  const isDragging =
    draggingState.workspaceIdentity === workspaceIdentity ? draggingState.isDragging : false;
  const hasInteractedWithCanvas =
    interactionState.workspaceIdentity === workspaceIdentity ? interactionState.value : false;

  const setViewportForCurrentWorkspace = useCallback(
    (nextViewport: ViewportUpdater) => {
      setViewportState((currentViewportState) => {
        const currentViewport =
          currentViewportState.workspaceIdentity === workspaceIdentity
            ? currentViewportState.viewport
            : createInitialViewport(contentBounds, viewportSize, fitPadding);
        const resolvedViewport =
          typeof nextViewport === "function" ? nextViewport(currentViewport) : nextViewport;

        return {
          viewport: resolvedViewport,
          workspaceIdentity
        };
      });
    },
    [contentBounds, fitPadding, viewportSize, workspaceIdentity]
  );

  const setHasInteractedForCurrentWorkspace = useCallback(
    (value: boolean) => {
      setInteractionState({
        value,
        workspaceIdentity
      });
    },
    [workspaceIdentity]
  );

  const viewportRef = useCallback((element: HTMLDivElement | null) => {
    setViewportElement(element);
    setViewportSize(measureViewportSize(element));
  }, []);

  const fitToContent = useCallback(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    setViewportForCurrentWorkspace(
      createViewportForContentBounds(contentBounds, viewportSize, {
        maxZoom: 1,
        padding: fitPadding
      })
    );
  }, [contentBounds, fitPadding, setViewportForCurrentWorkspace, viewportSize]);

  const resetToActualSize = useCallback(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    const targetCenter = contentBounds
      ? {
          x: contentBounds.x + contentBounds.width / 2,
          y: contentBounds.y + contentBounds.height / 2
        }
      : { x: 0, y: 0 };

    setViewportForCurrentWorkspace(centerViewportOnPoint(targetCenter, viewportSize, 1));
  }, [contentBounds, setViewportForCurrentWorkspace, viewportSize]);

  const setZoomAtViewportCenter = useCallback(
    (nextZoom: number) => {
      if (viewportSize.width === 0 || viewportSize.height === 0) {
        return;
      }

      const centerPoint = {
        x: viewportSize.width / 2,
        y: viewportSize.height / 2
      };

      setViewportForCurrentWorkspace((currentViewport) =>
        zoomViewportAroundPoint(currentViewport, centerPoint, clampViewportZoom(nextZoom))
      );
    },
    [setViewportForCurrentWorkspace, viewportSize]
  );

  const revealCanvasRect = useCallback(
    (
      rect: {
        height: number;
        width: number;
        x: number;
        y: number;
      },
      options?: {
        padding?: number;
      }
    ) => {
      if (viewportSize.width === 0 || viewportSize.height === 0) {
        return false;
      }

      const shouldReveal = !isCanvasBoundsFullyVisible(
        viewport,
        rect,
        viewportSize,
        options?.padding ?? fitPadding
      );

      if (!shouldReveal) {
        return false;
      }

      setViewportForCurrentWorkspace((currentViewport) =>
        revealCanvasBounds(currentViewport, rect, viewportSize, {
          padding: options?.padding ?? fitPadding
        })
      );
      setHasInteractedForCurrentWorkspace(true);
      return true;
    },
    [
      fitPadding,
      setHasInteractedForCurrentWorkspace,
      setViewportForCurrentWorkspace,
      viewport,
      viewportSize
    ]
  );

  const stopDragging = useCallback(() => {
    dragStateRef.current = null;
    setDraggingState({
      isDragging: false,
      workspaceIdentity
    });
  }, [workspaceIdentity]);

  useLayoutEffect(() => {
    if (!viewportElement) {
      return;
    }

    const updateViewportSize = () => {
      const nextViewportSize = measureViewportSize(viewportElement);

      setViewportSize((currentViewportSize) =>
        areViewportSizesEqual(currentViewportSize, nextViewportSize)
          ? currentViewportSize
          : nextViewportSize
      );
    };

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            updateViewportSize();
          })
        : null;

    resizeObserver?.observe(viewportElement);
    window.addEventListener("resize", updateViewportSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, [viewportElement]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditableEventTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setIsSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      setIsSpacePressed(false);
    };

    const handleWindowBlur = () => {
      setIsSpacePressed(false);
      stopDragging();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [stopDragging]);

  const applyWheelInput = useCallback(
    (input: {
      clientX: number;
      clientY: number;
      ctrlKey: boolean;
      currentTarget: HTMLDivElement;
      deltaX: number;
      deltaY: number;
      metaKey: boolean;
      preventDefault: () => void;
    }) => {
      if (viewportSize.width === 0 || viewportSize.height === 0) {
        return;
      }

      input.preventDefault();

      if (input.ctrlKey || input.metaKey) {
        const frameRect = input.currentTarget.getBoundingClientRect();
        const pointer = {
          x: input.clientX - frameRect.left,
          y: input.clientY - frameRect.top
        };
        const zoomFactor = Math.exp(-input.deltaY * MODIFIED_WHEEL_ZOOM_SENSITIVITY);

        setViewportForCurrentWorkspace((currentViewport) =>
          zoomViewportAroundPoint(
            currentViewport,
            pointer,
            clampViewportZoom(currentViewport.zoom * zoomFactor)
          )
        );
      } else {
        setViewportForCurrentWorkspace((currentViewport) => ({
          ...currentViewport,
          panX: currentViewport.panX - input.deltaX,
          panY: currentViewport.panY - input.deltaY
        }));
      }

      setHasInteractedForCurrentWorkspace(true);
    },
    [setHasInteractedForCurrentWorkspace, setViewportForCurrentWorkspace, viewportSize]
  );

  useEffect(() => {
    if (!viewportElement) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      applyWheelInput({
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        currentTarget: viewportElement,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        metaKey: event.metaKey,
        preventDefault: () => {
          event.preventDefault();
        }
      });
    };

    viewportElement.addEventListener("wheel", handleNativeWheel, {
      passive: false
    });

    return () => {
      viewportElement.removeEventListener("wheel", handleNativeWheel);
    };
  }, [applyWheelInput, viewportElement]);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      applyWheelInput({
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        currentTarget: event.currentTarget,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        metaKey: event.metaKey,
        preventDefault: () => {
          event.preventDefault();
        }
      });
    },
    [applyWheelInput]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const shouldStartDrag = event.button === 1 || (event.button === 0 && isSpacePressed);

      if (!shouldStartDrag) {
        return;
      }

      event.preventDefault();
      dragStateRef.current = {
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        pointerId: event.pointerId,
        workspaceIdentity
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setHasInteractedForCurrentWorkspace(true);
      setDraggingState({
        isDragging: true,
        workspaceIdentity
      });
    },
    [isSpacePressed, setHasInteractedForCurrentWorkspace, workspaceIdentity]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;

      if (
        !dragState ||
        dragState.pointerId !== event.pointerId ||
        dragState.workspaceIdentity !== workspaceIdentity
      ) {
        return;
      }

      const deltaX = event.clientX - dragState.lastClientX;
      const deltaY = event.clientY - dragState.lastClientY;

      dragStateRef.current = {
        ...dragState,
        lastClientX: event.clientX,
        lastClientY: event.clientY
      };

      setViewportForCurrentWorkspace((currentViewport) => ({
        ...currentViewport,
        panX: currentViewport.panX + deltaX,
        panY: currentViewport.panY + deltaY
      }));
    },
    [setViewportForCurrentWorkspace, workspaceIdentity]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        dragStateRef.current?.pointerId !== event.pointerId ||
        dragStateRef.current.workspaceIdentity !== workspaceIdentity
      ) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      stopDragging();
    },
    [stopDragging, workspaceIdentity]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        dragStateRef.current?.pointerId !== event.pointerId ||
        dragStateRef.current.workspaceIdentity !== workspaceIdentity
      ) {
        return;
      }

      stopDragging();
    },
    [stopDragging, workspaceIdentity]
  );

  const handleAuxClick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  }, []);

  return {
    contentBounds,
    fitToContent,
    handleAuxClick,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    hasInteractedWithCanvas,
    isDragging,
    isSpacePressed,
    resetToActualSize,
    revealCanvasRect,
    setZoomAtViewportCenter,
    viewport,
    viewportRef,
    viewportSize
  };
}
