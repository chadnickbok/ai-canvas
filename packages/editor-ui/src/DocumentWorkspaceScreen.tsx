import type { AssetRecord } from "@ai-canvas/document-core";
import type {
  ActiveProject,
  AppResult,
  ApplyCommandsInput,
  CommandResult,
  McpStatus,
  RuntimeCapabilities
} from "@ai-canvas/ipc-contract";
import { useEffect, useRef, useState } from "react";

import { InteractionOverlay } from "./interaction/InteractionOverlay.js";
import { useInteractionController } from "./interaction/useInteractionController.js";
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
      <div className="flex items-start justify-between gap-4">
        <div className="ui-mono border border-black/12 bg-white/84 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-black/52 shadow-[0_12px_30px_rgba(0,0,0,0.06)] backdrop-blur">
          {sceneCount} scene{sceneCount === 1 ? "" : "s"}
        </div>

        {isBusy ? (
          <div className="ui-mono border border-black/12 bg-white/84 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-black/52 shadow-[0_12px_30px_rgba(0,0,0,0.06)] backdrop-blur">
            Syncing
          </div>
        ) : null}
      </div>

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
            "ui-mono bg-[#1d1a14]/78 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#f6f1e3] shadow-[0_14px_40px_rgba(0,0,0,0.16)] transition-[opacity,transform] duration-200 ease-out",
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
    resetToActualSize,
    setZoomAtViewportCenter,
    viewport,
    viewportRef,
    viewportSize
  } = useViewportController({
    document: activeProject.document,
    workspaceIdentity
  });
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
    selectionRectOverride,
    selectedNodeId
  } = useInteractionController({
    allowMutation:
      runtimeCapabilities?.mode === "read_write" &&
      runtimeCapabilities.measurementSurfaceAvailable === true,
    document: activeProject.document,
    isPanModifierActive: isSpacePressed,
    onApplyCommands,
    rendererRef,
    revision: activeProject.revision,
    viewport,
    workspaceIdentity
  });
  const [zoomInputValue, setZoomInputValue] = useState(() => formatViewportZoomPercent(viewport.zoom));
  const canAdjustViewport = viewportSize.width > 0 && viewportSize.height > 0;
  const effectiveErrorMessage = errorMessage ?? commandError;

  useEffect(() => {
    setZoomInputValue(formatViewportZoomPercent(viewport.zoom));
  }, [viewport.zoom]);

  const commitZoomInput = () => {
    const parsedZoom = parseViewportZoomPercent(zoomInputValue);

    if (parsedZoom === null) {
      setZoomInputValue(formatViewportZoomPercent(viewport.zoom));
      return;
    }

    setZoomAtViewportCenter(parsedZoom);
    setZoomInputValue(formatViewportZoomPercent(parsedZoom));
  };

  return (
    <main className="flex min-h-screen flex-col bg-white text-[#111111]">
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
                    setZoomInputValue(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitZoomInput();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setZoomInputValue(formatViewportZoomPercent(viewport.zoom));
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

      <section className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "relative min-h-0 flex-1 overflow-hidden",
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
      </section>
    </main>
  );
}
