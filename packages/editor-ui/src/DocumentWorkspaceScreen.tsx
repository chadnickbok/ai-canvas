import type { AssetRecord } from "@ai-canvas/document-core";
import type {
  ActiveProject,
  McpStatus,
  RuntimeCapabilities
} from "@ai-canvas/ipc-contract";

import { EditorWorkspaceSurface } from "./rendering/EditorWorkspaceSurface.js";
import type { ResolvedAssetsById, ViewportState } from "./rendering/types.js";

export type DocumentWorkspaceScreenProps = {
  activeProject: ActiveProject;
  errorMessage?: string | null;
  isBusy?: boolean;
  mcpStatus: McpStatus | null;
  onBackToLibrary: () => void;
  runtimeCapabilities: RuntimeCapabilities | null;
};

const DEFAULT_VIEWPORT: ViewportState = {
  panX: 0,
  panY: 0,
  zoom: 1
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
  activeProject,
  isBusy
}: Pick<DocumentWorkspaceScreenProps, "activeProject" | "isBusy">) {
  const sceneCount = Object.keys(activeProject.document.scenes).length;

  return (
    <div className="pointer-events-none flex h-full w-full items-start justify-between p-5">
      {sceneCount === 0 ? (
        <div className="max-w-[320px] border border-black/14 bg-white/92 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <p className="m-0 text-[15px] font-medium text-[#111111]">No scene yet.</p>
          <p className="m-0 mt-1 text-[13px] leading-6 text-black/62">
            Use MCP to add a scene, a few rectangles, and text. The committed document render will
            appear here as soon as the command batch lands.
          </p>
        </div>
      ) : (
        <div className="ui-mono border border-black/12 bg-white/86 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-black/48 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
          {sceneCount} scene{sceneCount === 1 ? "" : "s"}
        </div>
      )}

      {isBusy ? (
        <div className="ui-mono border border-black/12 bg-white/86 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-black/48 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
          Syncing
        </div>
      ) : null}
    </div>
  );
}

export function DocumentWorkspaceScreen({
  activeProject,
  errorMessage,
  isBusy = false,
  mcpStatus,
  onBackToLibrary,
  runtimeCapabilities
}: DocumentWorkspaceScreenProps) {
  const resolvedAssetsById = resolveDocumentAssets(activeProject);

  return (
    <main className="page-grid flex min-h-screen flex-col bg-white text-[#111111]">
      <header className="border-b border-black/12 bg-white/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-5 px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
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
              <h1 className="m-0 truncate text-[30px] font-semibold tracking-[-0.05em] text-[#111111]">
                {activeProject.project.name}
              </h1>
              <div className="ui-mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.16em] text-black/48">
                <span>Project {activeProject.project.id}</span>
                <span>Document {activeProject.document.document_id}</span>
                <span>Revision {activeProject.revision}</span>
                <span>{formatRuntimeMode(runtimeCapabilities)}</span>
              </div>
            </div>
          </div>

          <div className="min-w-0 max-w-full text-left md:text-right">
            <div className="ui-mono text-[12px] text-[#111111]">{formatMcpStatusLine(mcpStatus)}</div>
            <div className="ui-mono mt-1 break-all text-[11px] uppercase tracking-[0.14em] text-black/40">
              {mcpStatus?.endpoint ?? "Loading MCP endpoint"}
            </div>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="border-b border-black/12 bg-black/[0.03]">
          <div className="mx-auto w-full max-w-[1600px] px-6 py-3 text-[14px] leading-7 text-[#111111]">
            {errorMessage}
          </div>
        </div>
      ) : null}

      <section className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-6 py-6">
        <div className="relative flex min-h-[720px] flex-1 overflow-hidden border border-black/12 bg-[#f2ede1] shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
          <div className="absolute inset-0">
            <EditorWorkspaceSurface
              className="h-full w-full"
              document={activeProject.document}
              resolvedAssetsById={resolvedAssetsById}
              uiLayer={<WorkspaceOverlay activeProject={activeProject} isBusy={isBusy} />}
              viewport={DEFAULT_VIEWPORT}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
