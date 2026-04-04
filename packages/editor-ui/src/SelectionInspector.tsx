import {
  inspectSelection,
  type BackgroundAssetInspection,
  type DocumentSummaryInspection,
  type NodeSemanticSlotInspection,
  type RendererDocument,
  type SelectionInspection
} from "@ai-canvas/document-core";
import type { RuntimeCapabilities } from "@ai-canvas/ipc-contract";
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";

import {
  createCanvasRect,
  resolveMeasuredNodeCanvasRect,
  resolveNodeCanvasRectWithSource,
  type CanvasRect,
  type NodeCanvasRectSource
} from "./interaction/geometry.js";
import type { RendererMeasurementHandle, ViewportState } from "./rendering/types.js";

type SelectionInspectorProps = {
  document: RendererDocument;
  projectId: string;
  projectName: string;
  rendererRef: RefObject<RendererMeasurementHandle | null>;
  revision: number;
  runtimeCapabilities: RuntimeCapabilities | null;
  selectedNodeId: string | null;
  viewport: ViewportState;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SelectionInspector({
  document,
  projectId,
  projectName,
  rendererRef,
  revision,
  runtimeCapabilities,
  selectedNodeId,
  viewport
}: SelectionInspectorProps) {
  const selection = inspectSelection(document, selectedNodeId);
  const [measuredCanvasRect, setMeasuredCanvasRect] = useState<CanvasRect | null>(null);
  const [bestAvailableCanvasRectResolution, setBestAvailableCanvasRectResolution] =
    useState<{
      rect: CanvasRect;
      source: NodeCanvasRectSource;
    } | null>(null);
  const selectedInspectableNodeId = selection.kind === "document" ? null : selection.node.id;

  useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(() => {
      if (selectedInspectableNodeId === null) {
        setMeasuredCanvasRect(null);
        setBestAvailableCanvasRectResolution(null);
        return;
      }

      setMeasuredCanvasRect(
        resolveMeasuredNodeCanvasRect(selectedInspectableNodeId, rendererRef.current, viewport.zoom)
      );
      setBestAvailableCanvasRectResolution(
        resolveNodeCanvasRectWithSource(
          document,
          selectedInspectableNodeId,
          rendererRef.current,
          viewport.zoom
        )
      );
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [document, rendererRef, selectedInspectableNodeId, viewport.zoom]);

  return (
    <aside
      className="flex h-full min-h-0 w-[360px] shrink-0 flex-col overflow-hidden border-l border-black/12 bg-[var(--chrome-surface-muted)]"
      data-inspector-state={selection.kind}
      data-selection-inspector="true"
    >
      <div className="border-b border-black/10 px-4 py-3">
        <div className="ui-mono text-[11px] uppercase tracking-[0.16em] text-black/42">
          Inspector
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h2 className="m-0 min-w-0 truncate text-[16px] font-semibold tracking-[-0.03em] text-[#111111]">
            {resolveInspectorTitle(selection)}
          </h2>
          <span className="ui-mono shrink-0 text-[11px] uppercase tracking-[0.16em] text-black/42">
            {selection.kind}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {selection.kind === "document" ? (
          <DocumentSummaryView
            document={selection.document}
            projectId={projectId}
            projectName={projectName}
            revision={revision}
            runtimeCapabilities={runtimeCapabilities}
          />
        ) : (
          <SelectionDetailView
            bestAvailableCanvasRectResolution={bestAvailableCanvasRectResolution}
            measuredCanvasRect={measuredCanvasRect}
            runtimeCapabilities={runtimeCapabilities}
            selection={selection}
          />
        )}
      </div>
    </aside>
  );
}

function DocumentSummaryView({
  document,
  projectId,
  projectName,
  revision,
  runtimeCapabilities
}: {
  document: DocumentSummaryInspection;
  projectId: string;
  projectName: string;
  revision: number;
  runtimeCapabilities: RuntimeCapabilities | null;
}) {
  return (
    <div className="space-y-4">
      <InspectorSection description="Current workspace context" title="Workspace">
        <KeyValueList
          items={[
            { label: "Project", value: projectName },
            { label: "Project ID", value: projectId },
            { label: "Document", value: document.name },
            { label: "Document ID", value: document.document_id },
            { label: "Page", value: document.page_name },
            { label: "Revision", value: String(revision) },
            {
              label: "Runtime",
              value: runtimeCapabilities ? formatRuntimeCapabilities(runtimeCapabilities) : "Loading"
            }
          ]}
        />
      </InspectorSection>

      <InspectorSection description="Semantic canvas state" title="Canvas">
        <div className="space-y-3">
          {document.canvas_semantic_slots.map((slotInspection) => (
            <SemanticValueCard
              key={slotInspection.slot}
              label={slotInspection.slot}
              resolvedSource={slotInspection.resolved.source_kind}
              resolvedValue={slotInspection.resolved.value}
              supportingRows={[
                { label: "Render field", value: slotInspection.render_field },
                {
                  label: "Render value",
                  value: formatOptionalValue(slotInspection.render_value)
                },
                {
                  label: "Local value",
                  value: formatOptionalValue(slotInspection.local_value)
                },
                {
                  label: "Variable",
                  value: formatOptionalValue(slotInspection.variable_id)
                }
              ]}
            />
          ))}
        </div>
      </InspectorSection>

      <InspectorSection description="Current document counts" title="Stats">
        <KeyValueList
          items={[
            { label: "Scenes", value: String(document.scene_count) },
            { label: "Nodes", value: String(document.node_count) },
            { label: "Loose top level", value: String(document.loose_top_level_node_count) },
            { label: "Assets", value: String(document.asset_count) },
            { label: "Variable collections", value: String(document.variable_collection_count) },
            { label: "Variables", value: String(document.variable_count) },
            { label: "Paint styles", value: String(document.paint_style_count) },
            { label: "Text styles", value: String(document.text_style_count) }
          ]}
        />
      </InspectorSection>
    </div>
  );
}

function SelectionDetailView({
  bestAvailableCanvasRectResolution,
  measuredCanvasRect,
  runtimeCapabilities,
  selection
}: {
  bestAvailableCanvasRectResolution: {
    rect: CanvasRect;
    source: NodeCanvasRectSource;
  } | null;
  measuredCanvasRect: CanvasRect | null;
  runtimeCapabilities: RuntimeCapabilities | null;
  selection: Exclude<SelectionInspection, { kind: "document" }>;
}) {
  const selectedNode = selection.node;
  const persistedCanvasRect = selectedNode.computed_layout
    ? createCanvasRect(selectedNode.computed_layout)
    : null;

  return (
    <div className="space-y-4">
      <InspectorSection description="Current selection identity" title="Selection">
        <KeyValueList
          items={[
            { label: "Name", value: selectedNode.name },
            { label: "Kind", value: selectedNode.kind },
            { label: "Node ID", value: selectedNode.id },
            { label: "Scene", value: selectedNode.scene_name ?? "None" },
            { label: "Parent", value: selectedNode.parent_name ?? "Top level" },
            { label: "Visible", value: selectedNode.is_visible ? "Yes" : "No" },
            { label: "Locked", value: selectedNode.is_locked ? "Yes" : "No" },
            { label: "Children", value: String(selectedNode.child_count) },
            {
              label: "Mutations",
              value:
                runtimeCapabilities?.mode === "read_write" &&
                runtimeCapabilities.measurementSurfaceAvailable
                  ? "Allowed"
                  : "Read only"
            }
          ]}
        />
        {selectedNode.ancestor_path.length > 0 ? (
          <div className="mt-3">
            <div className="ui-mono text-[10px] uppercase tracking-[0.16em] text-black/42">
              Hierarchy path
            </div>
            <div
              className="mt-2 text-[12px] leading-6 text-black/62"
              data-inspector-hierarchy-path="true"
            >
              {selectedNode.ancestor_path
                .map((pathItem) => `${pathItem.name} (${pathItem.kind})`)
                .join(" / ")}
            </div>
          </div>
        ) : null}
      </InspectorSection>

      {selection.kind === "scene" ? (
        <InspectorSection description="Scene metadata and frame ownership" title="Scene">
          <KeyValueList
            items={[
              { label: "Scene name", value: selection.scene.name },
              { label: "Scene ID", value: selection.scene.id },
              { label: "Frame node", value: selection.scene.frame_node_id },
              { label: "Scene children", value: String(selection.scene.child_count) },
              {
                label: "Group",
                value: formatOptionalValue(selection.scene.metadata.group)
              },
              {
                label: "Role",
                value: formatOptionalValue(selection.scene.metadata.role)
              },
              {
                label: "Summary",
                value: formatOptionalValue(selection.scene.metadata.summary)
              },
              {
                label: "Notes",
                value: formatOptionalValue(selection.scene.metadata.notes)
              },
              {
                label: "Tags",
                value:
                  selection.scene.metadata.tags.length > 0
                    ? selection.scene.metadata.tags.join(", ")
                    : "None"
              }
            ]}
          />
        </InspectorSection>
      ) : null}

      <InspectorSection description="Measured, persisted, and authored geometry" title="Geometry">
        <div className="space-y-3">
          <GeometryCard
            dataAttribute="measured"
            rect={measuredCanvasRect}
            status="No live DOM measurement is available for this selection."
            title="Measured bounds"
          />
          <GeometryCard
            dataAttribute="computed"
            rect={persistedCanvasRect}
            status="No persisted computed_layout snapshot is stored for this node."
            title="Persisted layout snapshot"
          />
          <KeyValueList
            items={[
              {
                label: "Best available",
                value: describeCanvasRectSource(bestAvailableCanvasRectResolution?.source)
              },
              {
                label: "Snapshot delta",
                value: resolveGeometryDelta(measuredCanvasRect, persistedCanvasRect)
              },
              {
                label: "Authored left",
                value: formatOptionalValue(selectedNode.raw_render_style.left)
              },
              {
                label: "Authored top",
                value: formatOptionalValue(selectedNode.raw_render_style.top)
              },
              {
                label: "Authored width",
                value: formatOptionalValue(selectedNode.raw_render_style.width)
              },
              {
                label: "Authored height",
                value: formatOptionalValue(selectedNode.raw_render_style.height)
              }
            ]}
          />
        </div>
      </InspectorSection>

      {selectedNode.text_content !== undefined || selectedNode.background_asset ? (
        <InspectorSection description="Type-specific content details" title="Content">
          <div className="space-y-3">
            {selectedNode.text_content !== undefined ? (
              <ValueBlock label="Text content" value={selectedNode.text_content} />
            ) : null}
            {selectedNode.background_asset ? (
              <AssetCard assetInspection={selectedNode.background_asset} />
            ) : null}
          </div>
        </InspectorSection>
      ) : null}

      <InspectorSection description="Semantic authoring, bindings, and resolved values" title="Semantics">
        <div className="space-y-3">
          {selectedNode.semantic_slots.length === 0 ? (
            <div className="rounded border border-black/10 bg-white/86 px-3 py-3 text-[13px] text-black/52">
              No semantic slots for this node kind.
            </div>
          ) : (
            selectedNode.semantic_slots.map((slotInspection) => (
              <SemanticSlotCard
                key={slotInspection.slot}
                slotInspection={slotInspection}
              />
            ))
          )}
        </div>
      </InspectorSection>

      <details
        className="rounded border border-black/10 bg-white/92"
        data-inspector-raw-style="true"
      >
        <summary className="cursor-pointer list-none px-3 py-3 text-[13px] font-medium text-[#111111]">
          Raw render style
        </summary>
        <pre className="m-0 overflow-auto border-t border-black/8 px-3 py-3 text-[11px] leading-5 text-black/62">
          {JSON.stringify(selectedNode.raw_render_style, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function resolveInspectorTitle(selection: SelectionInspection): string {
  switch (selection.kind) {
    case "document":
      return "Document Summary";
    case "scene":
      return selection.scene.name;
    case "node":
      return selection.node.name;
  }
}

function InspectorSection({
  children,
  description,
  title
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section
      className="rounded border border-black/10 bg-white/92"
      data-inspector-section={title.toLowerCase().replace(/\s+/g, "-")}
    >
      <div className="border-b border-black/8 px-3 py-3">
        <div className="ui-mono text-[10px] uppercase tracking-[0.16em] text-black/42">
          {title}
        </div>
        <div className="mt-1 text-[12px] leading-5 text-black/56">{description}</div>
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function KeyValueList({
  items
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-3 gap-y-2">
      {items.map((item) => (
        <div className="contents" key={item.label}>
          <dt className="ui-mono text-[10px] uppercase tracking-[0.16em] text-black/42">
            {item.label}
          </dt>
          <dd className="m-0 break-words text-[13px] leading-5 text-[#111111]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SemanticSlotCard({
  slotInspection
}: {
  slotInspection: NodeSemanticSlotInspection;
}) {
  const rows = [
    {
      label: "Render key",
      value: slotInspection.render_key
    },
    {
      label: "Render value",
      value: formatOptionalValue(slotInspection.render_value)
    },
    {
      label: "Local value",
      value: formatOptionalValue(slotInspection.local_value)
    },
    {
      label: "Variable",
      value: formatOptionalValue(slotInspection.variable_id)
    },
    {
      label: "Style family",
      value: formatOptionalValue(slotInspection.style_family)
    },
    {
      label: "Style",
      value: formatOptionalValue(slotInspection.style_id)
    }
  ];

  return (
    <SemanticValueCard
      label={slotInspection.slot}
      resolvedSource={slotInspection.resolved.source_kind}
      resolvedValue={slotInspection.resolved.value}
      supportingRows={rows}
    />
  );
}

function SemanticValueCard({
  label,
  resolvedSource,
  resolvedValue,
  supportingRows
}: {
  label: string;
  resolvedSource: string;
  resolvedValue: unknown;
  supportingRows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded border border-black/10 bg-[var(--chrome-surface-subtle)] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-[#111111]">{label}</div>
          <div className="mt-1 text-[12px] leading-5 text-black/56">
            Resolved to {formatOptionalValue(resolvedValue)}
          </div>
        </div>
        <span
          className={cn(
            "ui-mono shrink-0 rounded px-2 py-1 text-[10px] uppercase tracking-[0.14em]",
            resolveSourceClassName(resolvedSource)
          )}
        >
          {resolvedSource}
        </span>
      </div>
      <div className="mt-3">
        <KeyValueList items={supportingRows} />
      </div>
    </div>
  );
}

function GeometryCard({
  dataAttribute,
  rect,
  status,
  title
}: {
  dataAttribute: string;
  rect: CanvasRect | null;
  status: string;
  title: string;
}) {
  return (
    <div
      className="rounded border border-black/10 bg-[var(--chrome-surface-subtle)] px-3 py-3"
      data-inspector-geometry={dataAttribute}
    >
      <div className="text-[13px] font-medium text-[#111111]">{title}</div>
      <div className="mt-2">
        <KeyValueList
          items={
            rect
              ? [
                  { label: "X", value: formatRoundedNumber(rect.x) },
                  { label: "Y", value: formatRoundedNumber(rect.y) },
                  { label: "Width", value: formatRoundedNumber(rect.width) },
                  { label: "Height", value: formatRoundedNumber(rect.height) }
                ]
              : [{ label: "Status", value: status }]
          }
        />
      </div>
    </div>
  );
}

function AssetCard({
  assetInspection
}: {
  assetInspection: BackgroundAssetInspection;
}) {
  const asset = assetInspection.asset;

  return (
    <div className="rounded border border-black/10 bg-[var(--chrome-surface-subtle)] px-3 py-3">
      <div className="text-[13px] font-medium text-[#111111]">Background asset</div>
      <div className="mt-2">
        <KeyValueList
          items={[
            { label: "Asset ID", value: assetInspection.asset_id },
            { label: "Kind", value: asset.kind },
            { label: "Mime", value: asset.mime_type },
            { label: "Source", value: assetInspection.source_kind },
            { label: "Width", value: formatOptionalValue(asset.width) },
            { label: "Height", value: formatOptionalValue(asset.height) }
          ]}
        />
      </div>
    </div>
  );
}

function ValueBlock({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="ui-mono text-[10px] uppercase tracking-[0.16em] text-black/42">{label}</div>
      <div className="mt-2 whitespace-pre-wrap rounded border border-black/10 bg-[var(--chrome-surface-subtle)] px-3 py-3 text-[13px] leading-6 text-[#111111]">
        {value}
      </div>
    </div>
  );
}

function formatRuntimeCapabilities(runtimeCapabilities: RuntimeCapabilities): string {
  return `${runtimeCapabilities.mode === "read_write" ? "Read/write" : "Read only"} / ${runtimeCapabilities.runtimeState}`;
}

function formatOptionalValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "Unset";
  }

  if (typeof value === "string") {
    return value.length > 0 ? value : "Empty";
  }

  return String(value);
}

function formatRoundedNumber(value: number): string {
  return `${Math.round(value * 100) / 100}`;
}

function describeCanvasRectSource(source: NodeCanvasRectSource | undefined): string {
  switch (source) {
    case "measured_dom":
      return "Live DOM measurement";
    case "computed_layout":
      return "Persisted computed_layout snapshot";
    case "authored_render_style":
      return "Authored pixel inputs";
    default:
      return "Unavailable";
  }
}

function resolveGeometryDelta(
  measuredRect: CanvasRect | null,
  persistedRect: CanvasRect | null
): string {
  if (!measuredRect || !persistedRect) {
    return "Unavailable";
  }

  const deltaX = measuredRect.x - persistedRect.x;
  const deltaY = measuredRect.y - persistedRect.y;
  const deltaWidth = measuredRect.width - persistedRect.width;
  const deltaHeight = measuredRect.height - persistedRect.height;
  const deltaValues = [deltaX, deltaY, deltaWidth, deltaHeight];

  if (deltaValues.every((value) => Math.abs(value) < 0.01)) {
    return "Matches current DOM measurement";
  }

  return `dx ${formatRoundedNumber(deltaX)}, dy ${formatRoundedNumber(deltaY)}, dw ${formatRoundedNumber(deltaWidth)}, dh ${formatRoundedNumber(deltaHeight)}`;
}

function resolveSourceClassName(sourceKind: string): string {
  switch (sourceKind) {
    case "local":
      return "border border-black/10 bg-black/[0.05] text-black/62";
    case "variable":
    case "style-variable":
      return "border border-black/12 bg-black/[0.10] text-black/70";
    case "style":
      return "border border-black/14 bg-black/[0.16] text-black/78";
    case "unset":
      return "border border-black/10 bg-black/[0.06] text-black/52";
    case "unresolved":
      return "bg-[var(--chrome-surface-strong)] text-[var(--chrome-ink-inverse)]";
    default:
      return "border border-black/10 bg-black/[0.06] text-black/52";
  }
}
