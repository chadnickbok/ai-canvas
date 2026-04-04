import type { AssetRecord } from "@ai-canvas/document-core";
import type {
  ActiveProject,
  AppResult,
  ApplyCommandsInput,
  CommandResult,
  McpStatus,
  RuntimeCapabilities
} from "@ai-canvas/ipc-contract";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { resolveNodeCanvasRect } from "./interaction/geometry.js";
import { InteractionOverlay } from "./interaction/InteractionOverlay.js";
import { useInteractionController } from "./interaction/useInteractionController.js";
import { LayersInspector } from "./LayersInspector.js";
import { SelectionInspector } from "./SelectionInspector.js";
import { EditorWorkspaceSurface } from "./rendering/EditorWorkspaceSurface.js";
import type { RendererMeasurementHandle, ResolvedAssetsById } from "./rendering/types.js";
import { useViewportController } from "./rendering/useViewportController.js";
import {
  formatViewportZoomPercent,
  parseViewportZoomPercent
} from "./rendering/viewport.js";
import { WorkspaceGridBackdrop } from "./rendering/workspaceGrid.js";

export type DocumentWorkspaceScreenProps = {
  activeProject: ActiveProject;
  errorMessage?: string | null;
  isBusy?: boolean;
  mcpStatus: McpStatus | null;
  onApplyCommands?: (input: ApplyCommandsInput) => Promise<AppResult<CommandResult>>;
  onBackToLibrary: () => void;
  runtimeCapabilities: RuntimeCapabilities | null;
};

type SelectionSource = "canvas" | "hierarchy";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatMcpStatusLine(status: McpStatus | null): string {
  if (!status) {
    return "Loading MCP status";
  }

  if (status.state === "error") {
    return `MCP failed on ${status.host}:${status.port}`;
  }

  if (!status.enabled) {
    return `MCP disabled on ${status.host}:${status.port}`;
  }

  return `MCP is running on ${status.endpoint}`;
}

function formatRuntimeMode(capabilities: RuntimeCapabilities | null): string {
  if (!capabilities) {
    return "Loading runtime mode";
  }

  return capabilities.mode === "read_write" ? "Read/write" : "Read only";
}

function resolveAssetUrl(asset: AssetRecord): string | null {
  switch (asset.source.kind) {
    case "data_uri":
      return asset.source.data_uri;
    case "base64":
      return `data:${asset.mime_type};base64,${asset.source.base64}`;
    case "asset_store":
      return null;
  }
}

function resolveDocumentAssets(activeProject: ActiveProject): ResolvedAssetsById {
  const resolvedAssetsById: ResolvedAssetsById = {};

  for (const asset of Object.values(activeProject.document.assets)) {
    const url = resolveAssetUrl(asset);

    if (!url) {
      continue;
    }

    resolvedAssetsById[asset.id] = { url };
  }

  return resolvedAssetsById;
}

function WorkspaceOverlay({
  hasInteractedWithCanvas,
  isBusy,
  sceneCount
}: {
  hasInteractedWithCanvas: boolean;
  isBusy: boolean;
  sceneCount: number;
}) {
  return (
    <div className="pointer-events-none flex h-full w-full flex-col justify-between p-5">
      {isBusy ? (
        <div className="flex items-start justify-end">
          <div className="ui-mono border border-black/12 bg-white/84 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-black/52 shadow-[0_12px_30px_rgba(0,0,0,0.06)] backdrop-blur">
            Syncing
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-center">
        {sceneCount === 0 ? (
          <div className="max-w-[360px] border border-black/14 bg-white/92 px-5 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.08)] backdrop-blur">
            <p className="m-0 text-[15px] font-medium text-[#111111]">No scene yet.</p>
            <p className="m-0 mt-2 text-[13px] leading-6 text-black/62">
              Use MCP to add a scene, a few rectangles, and text. The viewport is ready to pan,
              zoom, and fit the document as soon as committed content arrives.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex justify-start">
        <div
          aria-hidden={hasInteractedWithCanvas}
          className={cn(
            "ui-mono bg-[var(--chrome-surface-strong)]/78 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--chrome-ink-inverse)] shadow-[0_14px_40px_rgba(0,0,0,0.16)] transition-[opacity,transform] duration-200 ease-out",
            hasInteractedWithCanvas ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
          )}
          data-viewport-hint="true"
          data-viewport-hint-visible={hasInteractedWithCanvas ? "false" : "true"}
        >
          Scroll to pan. Hold Space and drag to move. Ctrl/Cmd + wheel to zoom.
        </div>
      </div>
    </div>
  );
}

export function DocumentWorkspaceScreen({
  activeProject,
  errorMessage,
  isBusy = false,
  mcpStatus,
  onApplyCommands,
  onBackToLibrary,
  runtimeCapabilities
}: DocumentWorkspaceScreenProps) {
  const resolvedAssetsById = resolveDocumentAssets(activeProject);
  const sceneCount = Object.keys(activeProject.document.scenes).length;
  const workspaceIdentity = `${activeProject.project.id}:${activeProject.document.document_id}`;
  const rendererRef = useRef<RendererMeasurementHandle | null>(null);
  const [selectionState, setSelectionState] = useState<{
    nodeId: string | null;
    sequence: number;
    source: SelectionSource | null;
    workspaceIdentity: string;
  }>(() => ({
    nodeId: null,
    sequence: 0,
    source: null,
    workspaceIdentity
  }));
  const [layersInspectorVisibilityState, setLayersInspectorVisibilityState] = useState<{
    isVisible: boolean;
    workspaceIdentity: string;
  }>(() => ({
    isVisible: true,
    workspaceIdentity
  }));
  const {
    fitToContent,
    hasInteractedWithCanvas,
    handleAuxClick,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    isDragging,
    isSpacePressed,
    revealCanvasRect,
    resetToActualSize,
    setZoomAtViewportCenter,
    viewport,
    viewportRef,
    viewportSize
  } = useViewportController({
    document: activeProject.document,
    workspaceIdentity
  });
  const selectedNodeId =
    selectionState.workspaceIdentity === workspaceIdentity &&
    selectionState.nodeId &&
    activeProject.document.nodes[selectionState.nodeId]
      ? selectionState.nodeId
      : null;
  const selectedNodeSelectionSource =
    selectionState.workspaceIdentity === workspaceIdentity && selectedNodeId !== null
      ? selectionState.source
      : null;
  const selectedNodeSelectionSequence =
    selectionState.workspaceIdentity === workspaceIdentity && selectedNodeId !== null
      ? selectionState.sequence
      : 0;
  const isLayersInspectorVisible =
    layersInspectorVisibilityState.workspaceIdentity === workspaceIdentity
      ? layersInspectorVisibilityState.isVisible
      : true;
  const {
    commandError,
    handleClick: handleInteractionClick,
    handlePointerCancel: handleInteractionPointerCancel,
    handlePointerDown: handleInteractionPointerDown,
    handlePointerLeave: handleInteractionPointerLeave,
    handlePointerMove: handleInteractionPointerMove,
    handlePointerUp: handleInteractionPointerUp,
    hoveredNodeId,
    isGestureActive,
    isMutatingSelection,
    preview,
    selectionRectOverride
  } = useInteractionController({
    allowMutation:
      runtimeCapabilities?.mode === "read_write" &&
      runtimeCapabilities.measurementSurfaceAvailable === true,
    document: activeProject.document,
    isPanModifierActive: isSpacePressed,
    onSelectedNodeIdChange: (nodeId) => {
      setSelectionState((currentSelectionState) => ({
        nodeId,
        sequence: currentSelectionState.sequence + 1,
        source: "canvas",
        workspaceIdentity
      }));
    },
    onApplyCommands,
    rendererRef,
    revision: activeProject.revision,
    selectedNodeId,
    viewport,
    workspaceIdentity
  });
  const [zoomInputState, setZoomInputState] = useState(() => ({
    draft: formatViewportZoomPercent(viewport.zoom),
    lastCommittedZoom: viewport.zoom
  }));
  const canAdjustViewport = viewportSize.width > 0 && viewportSize.height > 0;
  const effectiveErrorMessage = errorMessage ?? commandError;
  const zoomInputValue =
    zoomInputState.lastCommittedZoom === viewport.zoom
      ? zoomInputState.draft
      : formatViewportZoomPercent(viewport.zoom);

  const handleLayerSelection = useCallback(
    (nodeId: string) => {
      setSelectionState((currentSelectionState) => ({
        nodeId,
        sequence: currentSelectionState.sequence + 1,
        source: "hierarchy",
        workspaceIdentity
      }));

      const selectionRect = resolveNodeCanvasRect(
        activeProject.document,
        nodeId,
        rendererRef.current,
        viewport.zoom
      );

      if (selectionRect) {
        revealCanvasRect(selectionRect);
      }
    },
    [activeProject.document, revealCanvasRect, viewport.zoom, workspaceIdentity]
  );

  const commitZoomInput = () => {
    const parsedZoom = parseViewportZoomPercent(zoomInputValue);

    if (parsedZoom === null) {
      setZoomInputState({
        draft: formatViewportZoomPercent(viewport.zoom),
        lastCommittedZoom: viewport.zoom
      });
      return;
    }

    setZoomAtViewportCenter(parsedZoom);
    setZoomInputState({
      draft: formatViewportZoomPercent(parsedZoom),
      lastCommittedZoom: parsedZoom
    });
  };

  return (
    <main
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-white text-[#111111]"
      data-workspace-shell="true"
    >
      <header className="border-b border-black/12 bg-white/94 backdrop-blur">
        <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              className={cn(
                "ui-mono shrink-0 border border-black/16 bg-white px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#111111] transition hover:border-black",
                isBusy && "cursor-not-allowed opacity-45 hover:border-black/16"
              )}
              disabled={isBusy}
              onClick={onBackToLibrary}
              type="button"
            >
              Library
            </button>

            <div className="min-w-0">
              <h1 className="m-0 truncate text-[28px] font-semibold tracking-[-0.05em] text-[#111111]">
                {activeProject.project.name}
              </h1>
              <div className="ui-mono mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.16em] text-black/48">
                <span>{sceneCount} scene{sceneCount === 1 ? "" : "s"}</span>
                <span>Project {activeProject.project.id}</span>
                <span>Document {activeProject.document.document_id}</span>
                <span>Revision {activeProject.revision}</span>
                <span>{formatRuntimeMode(runtimeCapabilities)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="min-w-0 max-w-full text-left md:text-right">
              <div className="ui-mono text-[12px] text-[#111111]">{formatMcpStatusLine(mcpStatus)}</div>
              <div className="ui-mono mt-1 break-all text-[11px] uppercase tracking-[0.14em] text-black/40">
                {mcpStatus?.endpoint ?? "Loading MCP endpoint"}
              </div>
            </div>

            <div className="flex items-center gap-2 border border-black/12 bg-white/86 px-2 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
              <button
                className={cn(
                  "ui-mono border border-black/12 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#111111] transition hover:border-black",
                  !canAdjustViewport && "cursor-not-allowed opacity-45 hover:border-black/12"
                )}
                disabled={!canAdjustViewport}
                onClick={fitToContent}
                type="button"
              >
                Fit
              </button>

              <button
                className={cn(
                  "ui-mono border border-black/12 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#111111] transition hover:border-black",
                  !canAdjustViewport && "cursor-not-allowed opacity-45 hover:border-black/12"
                )}
                disabled={!canAdjustViewport}
                onClick={resetToActualSize}
                type="button"
              >
                100%
              </button>

              <label className="ui-mono flex items-center gap-2 border border-black/12 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-black/52">
                <span>Zoom</span>
                <input
                  aria-label="Zoom percentage"
                  className="w-[64px] border-0 bg-transparent p-0 text-right text-[#111111] outline-none"
                  disabled={!canAdjustViewport}
                  onBlur={commitZoomInput}
                  onChange={(event) => {
                    setZoomInputState({
                      draft: event.target.value,
                      lastCommittedZoom: viewport.zoom
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitZoomInput();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setZoomInputState({
                        draft: formatViewportZoomPercent(viewport.zoom),
                        lastCommittedZoom: viewport.zoom
                      });
                      event.currentTarget.blur();
                    }
                  }}
                  type="text"
                  value={zoomInputValue}
                />
              </label>
            </div>
          </div>
        </div>
      </header>

      {effectiveErrorMessage ? (
        <div className="border-b border-black/12 bg-black/[0.03]">
          <div className="w-full px-4 py-3 text-[14px] leading-7 text-[#111111]">
            {effectiveErrorMessage}
          </div>
        </div>
      ) : null}

      <section
        className="flex min-h-0 flex-1 overflow-hidden"
        data-workspace-body="true"
      >
        <div
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
          data-workspace-canvas-region="true"
        >
          <div
            className={cn(
              "absolute inset-0 min-h-0 overflow-hidden",
              isMutatingSelection || isGestureActive
                ? "cursor-default"
                : isDragging
                  ? "cursor-grabbing"
                  : isSpacePressed
                    ? "cursor-grab"
                    : "cursor-default"
            )}
            data-viewport-frame="true"
            onAuxClick={handleAuxClick}
            onClick={(event) => {
              if (!isDragging && !isSpacePressed && !isMutatingSelection) {
                handleInteractionClick(event);
              }
            }}
            onLostPointerCapture={(event) => {
              if (!handleInteractionPointerCancel(event)) {
                handlePointerCancel(event);
              }
            }}
            onPointerCancel={(event) => {
              if (!handleInteractionPointerCancel(event)) {
                handlePointerCancel(event);
              }
            }}
            onPointerDown={(event) => {
              if (!handleInteractionPointerDown(event)) {
                handlePointerDown(event);
              }
            }}
            onPointerLeave={handleInteractionPointerLeave}
            onPointerMove={(event) => {
              if (isDragging && !isGestureActive) {
                handlePointerMove(event);
                return;
              }

              if (!handleInteractionPointerMove(event)) {
                handlePointerMove(event);
              }
            }}
            onPointerUp={(event) => {
              if (!handleInteractionPointerUp(event)) {
                handlePointerUp(event);
              }
            }}
            ref={viewportRef}
            style={{
              touchAction: "none",
              userSelect: isDragging ? "none" : undefined
            }}
          >
            <EditorWorkspaceSurface
              backdropLayer={<WorkspaceGridBackdrop viewport={viewport} viewportSize={viewportSize} />}
              className="h-full w-full"
              document={activeProject.document}
              interactionLayer={
                <InteractionOverlay
                  allowMutation={
                    runtimeCapabilities?.mode === "read_write" &&
                    runtimeCapabilities.measurementSurfaceAvailable === true
                  }
                  document={activeProject.document}
                  hoveredNodeId={hoveredNodeId}
                  preview={preview}
                  rendererRef={rendererRef}
                  selectionRectOverride={selectionRectOverride}
                  selectedNodeId={selectedNodeId}
                  viewport={viewport}
                />
              }
              ref={rendererRef}
              resolvedAssetsById={resolvedAssetsById}
              uiLayer={
                <WorkspaceOverlay
                  hasInteractedWithCanvas={hasInteractedWithCanvas}
                  isBusy={isBusy}
                  sceneCount={sceneCount}
                />
              }
              viewport={viewport}
            />
          </div>

          <div
            className="pointer-events-none absolute inset-0 z-10"
            data-layers-overlay="true"
          >
            {isLayersInspectorVisible ? (
              <div
                className="pointer-events-auto absolute inset-y-0 left-0 shadow-[18px_0_42px_rgba(0,0,0,0.10)]"
                data-layers-overlay-panel="true"
              >
                <LayersInspector
                  document={activeProject.document}
                  headerAction={
                    <button
                      aria-label="Hide layers panel"
                      className="flex h-9 w-9 items-center justify-center border border-black/14 bg-white text-[#111111] transition hover:border-black/60"
                      data-layers-hide-toggle="true"
                      onClick={() => {
                        setLayersInspectorVisibilityState({
                          isVisible: false,
                          workspaceIdentity
                        });
                      }}
                      title="Hide layers panel"
                      type="button"
                    >
                      <PanelLeftClose className="h-4 w-4" strokeWidth={1.6} />
                    </button>
                  }
                  onSelectNode={handleLayerSelection}
                  selectedNodeId={selectedNodeId}
                  selectedNodeSelectionSequence={selectedNodeSelectionSequence}
                  selectedNodeSelectionSource={selectedNodeSelectionSource}
                  workspaceIdentity={workspaceIdentity}
                />
              </div>
            ) : (
              <button
                aria-label="Show layers panel"
                className="pointer-events-auto absolute left-4 top-5 flex h-9 w-9 items-center justify-center border border-black/14 bg-white/96 text-[#111111] shadow-[0_10px_24px_rgba(0,0,0,0.08)] backdrop-blur transition hover:border-black/60"
                data-layers-show-toggle="true"
                onClick={() => {
                  setLayersInspectorVisibilityState({
                    isVisible: true,
                    workspaceIdentity
                  });
                }}
                title="Show layers panel"
                type="button"
              >
                <PanelLeftOpen className="h-4 w-4" strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>

        <SelectionInspector
          document={activeProject.document}
          rendererRef={rendererRef}
          selectedNodeId={selectedNodeId}
          viewport={viewport}
        />
      </section>
    </main>
  );
}
