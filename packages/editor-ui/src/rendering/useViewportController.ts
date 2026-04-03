import type { RendererDocument } from "@ai-canvas/document-core";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

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
};

const EMPTY_VIEWPORT_SIZE: ViewportSize = {
  height: 0,
  width: 0
};

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

export function useViewportController({
  document,
  fitPadding = DEFAULT_VIEWPORT_FIT_PADDING,
  workspaceIdentity
}: UseViewportControllerInput) {
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const [isDragging, setIsDragging] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [hasInteractedWithCanvas, setHasInteractedWithCanvas] = useState(false);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const initializedWorkspaceRef = useRef<string | null>(null);

  const contentBounds = useMemo(() => resolveTopLevelContentBounds(document), [document]);

  const viewportRef = useCallback((element: HTMLDivElement | null) => {
    viewportElementRef.current = element;
    setViewportElement(element);
  }, []);

  const fitToContent = useCallback(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    setViewport(
      createViewportForContentBounds(contentBounds, viewportSize, {
        maxZoom: 1,
        padding: fitPadding
      })
    );
  }, [contentBounds, fitPadding, viewportSize]);

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

    setViewport(centerViewportOnPoint(targetCenter, viewportSize, 1));
  }, [contentBounds, viewportSize]);

  const setZoomAtViewportCenter = useCallback(
    (nextZoom: number) => {
      if (viewportSize.width === 0 || viewportSize.height === 0) {
        return;
      }

      const centerPoint = {
        x: viewportSize.width / 2,
        y: viewportSize.height / 2
      };

      setViewport((currentViewport) =>
        zoomViewportAroundPoint(currentViewport, centerPoint, clampViewportZoom(nextZoom))
      );
    },
    [viewportSize]
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

      const shouldReveal = !isCanvasBoundsFullyVisible(viewport, rect, viewportSize, options?.padding ?? fitPadding);

      if (!shouldReveal) {
        return false;
      }

      setViewport((currentViewport) =>
        revealCanvasBounds(currentViewport, rect, viewportSize, {
          padding: options?.padding ?? fitPadding
        })
      );
      setHasInteractedWithCanvas(true);
      return true;
    },
    [fitPadding, viewport, viewportSize]
  );

  const stopDragging = useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  useLayoutEffect(() => {
    if (!viewportElement) {
      setViewportSize(EMPTY_VIEWPORT_SIZE);
      return;
    }

    const updateViewportSize = () => {
      setViewportSize(measureViewportSize(viewportElement));
    };

    updateViewportSize();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => {
        updateViewportSize();
      });

      observer.observe(viewportElement);

      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", updateViewportSize);

    return () => {
      window.removeEventListener("resize", updateViewportSize);
    };
  }, [viewportElement]);

  useEffect(() => {
    initializedWorkspaceRef.current = null;
    stopDragging();
    setViewport(DEFAULT_VIEWPORT);
    setHasInteractedWithCanvas(false);
  }, [stopDragging, workspaceIdentity]);

  useEffect(() => {
    if (initializedWorkspaceRef.current === workspaceIdentity) {
      return;
    }

    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    setViewport(
      createViewportForContentBounds(contentBounds, viewportSize, {
        maxZoom: 1,
        padding: fitPadding
      })
    );
    setHasInteractedWithCanvas(false);
    initializedWorkspaceRef.current = workspaceIdentity;
  }, [contentBounds, fitPadding, viewportSize, workspaceIdentity]);

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

        setViewport((currentViewport) =>
          zoomViewportAroundPoint(
            currentViewport,
            pointer,
            clampViewportZoom(currentViewport.zoom * zoomFactor)
          )
        );
      } else {
        setViewport((currentViewport) => ({
          ...currentViewport,
          panX: currentViewport.panX - input.deltaX,
          panY: currentViewport.panY - input.deltaY
        }));
      }

      setHasInteractedWithCanvas(true);
    },
    [viewportSize]
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
        pointerId: event.pointerId
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setHasInteractedWithCanvas(true);
      setIsDragging(true);
    },
    [isSpacePressed]
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.lastClientX;
    const deltaY = event.clientY - dragState.lastClientY;

    dragStateRef.current = {
      ...dragState,
      lastClientX: event.clientX,
      lastClientY: event.clientY
    };

    setViewport((currentViewport) => ({
      ...currentViewport,
      panX: currentViewport.panX + deltaX,
      panY: currentViewport.panY + deltaY
    }));
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      stopDragging();
    },
    [stopDragging]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return;
      }

      stopDragging();
    },
    [stopDragging]
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
