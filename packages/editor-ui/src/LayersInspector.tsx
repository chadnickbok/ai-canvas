import type { RendererDocument, RendererNode } from "@ai-canvas/document-core";
import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

type LayersInspectorProps = {
  document: RendererDocument;
  headerAction?: ReactNode;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string | null;
  selectedNodeSelectionSequence: number;
  selectedNodeSelectionSource: "canvas" | "hierarchy" | null;
  workspaceIdentity: string;
};

type LayerPresentationKind = "frame" | "image" | "rectangle" | "svg" | "text";
type FrameDirection = "column" | "row" | null;

type LayerRow = {
  depth: number;
  frameDirection: FrameDirection;
  id: string;
  isContainer: boolean;
  kind: RendererNode["kind"];
  name: string;
  presentationKind: LayerPresentationKind;
};

const ASSET_BACKGROUND_IMAGE_PATTERN = /url\(\s*(['"]?)asset:\/\/([^'")]+)\1\s*\)/i;
const INDENT_SIZE = 18;
const ROW_MIN_WIDTH = 220;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function LayersInspector({
  document,
  headerAction,
  onSelectNode,
  selectedNodeId,
  selectedNodeSelectionSequence,
  selectedNodeSelectionSource,
  workspaceIdentity
}: LayersInspectorProps) {
  const defaultExpandedNodeIds = useMemo(
    () => createDefaultExpandedNodeIds(document),
    [document]
  );
  const [expansionState, setExpansionState] = useState<{
    expandedNodeIds: Set<string>;
    workspaceIdentity: string;
  }>(() => ({
    expandedNodeIds: defaultExpandedNodeIds,
    workspaceIdentity
  }));
  const selectedAncestorIds = useMemo(
    () => (selectedNodeId ? collectAncestorContainerIds(document, selectedNodeId) : []),
    [document, selectedNodeId]
  );
  const baseExpandedNodeIds =
    expansionState.workspaceIdentity === workspaceIdentity
      ? expansionState.expandedNodeIds
      : defaultExpandedNodeIds;
  const expandedNodeIds = useMemo(() => {
    const nextExpandedNodeIds = new Set(baseExpandedNodeIds);

    for (const ancestorId of selectedAncestorIds) {
      nextExpandedNodeIds.add(ancestorId);
    }

    return nextExpandedNodeIds;
  }, [baseExpandedNodeIds, selectedAncestorIds]);

  const { maxDepth, rows } = useMemo(
    () => buildVisibleRows(document, expandedNodeIds),
    [document, expandedNodeIds]
  );
  const rowElementsByIdRef = useRef(new Map<string, HTMLButtonElement>());
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const totalNodeCount = Object.keys(document.nodes).length;

  const registerRowElement = useCallback((nodeId: string, element: HTMLButtonElement | null) => {
    if (!element) {
      rowElementsByIdRef.current.delete(nodeId);
      return;
    }

    rowElementsByIdRef.current.set(nodeId, element);
  }, []);

  useLayoutEffect(() => {
    if (selectedNodeId === null || selectedNodeSelectionSource !== "canvas") {
      return;
    }

    const scrollRegionElement = scrollRegionRef.current;
    const rowElement = rowElementsByIdRef.current.get(selectedNodeId) ?? null;

    if (!scrollRegionElement || !rowElement) {
      return;
    }

    if (isElementFullyVisibleWithinContainer(scrollRegionElement, rowElement)) {
      return;
    }

    rowElement.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  }, [expandedNodeIds, selectedNodeId, selectedNodeSelectionSequence, selectedNodeSelectionSource]);

  return (
    <aside
      className="flex h-full min-h-0 w-[320px] flex-col overflow-hidden border-r border-black/12 bg-white"
      data-layers-inspector="true"
    >
      <div className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div className="min-w-0">
          <div className="ui-mono text-[11px] uppercase tracking-[0.16em] text-black/42">Layers</div>
          <div className="mt-1 text-[13px] text-black/58">{totalNodeCount} items</div>
        </div>

        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto bg-white px-2 py-2"
        data-layers-scroll-region="true"
        ref={scrollRegionRef}
      >
        <div
          data-layers-tree-content="true"
          data-tree-max-depth={String(maxDepth)}
          style={{
            minWidth: `${Math.max(ROW_MIN_WIDTH + maxDepth * INDENT_SIZE, 100)}px`,
            width: "max-content"
          }}
        >
          {rows.length === 0 ? (
            <div className="px-2 py-4 text-[13px] leading-6 text-black/42">
              No layers yet.
            </div>
          ) : (
            rows.map((row) => {
              const isSelected = row.id === selectedNodeId;

              return (
                <div
                  data-layer-depth={String(row.depth)}
                  data-layer-entry="true"
                  key={row.id}
                  style={{
                    paddingLeft: `${row.depth * INDENT_SIZE}px`
                  }}
                >
                  <div className="flex items-center gap-1">
                    {row.isContainer ? (
                      <button
                        aria-expanded={expandedNodeIds.has(row.id)}
                        aria-label={`${expandedNodeIds.has(row.id) ? "Collapse" : "Expand"} ${row.name}`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-black/42 transition hover:bg-black/[0.04] hover:text-[#111111]"
                        data-expanded={expandedNodeIds.has(row.id) ? "true" : "false"}
                        data-layer-disclosure="true"
                        data-layer-node-id={row.id}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setExpansionState((currentExpansionState) => {
                            const nextExpandedNodeIds = new Set(
                              currentExpansionState.workspaceIdentity === workspaceIdentity
                                ? currentExpansionState.expandedNodeIds
                                : defaultExpandedNodeIds
                            );

                            if (nextExpandedNodeIds.has(row.id)) {
                              nextExpandedNodeIds.delete(row.id);
                            } else {
                              nextExpandedNodeIds.add(row.id);
                            }

                            return {
                              expandedNodeIds: nextExpandedNodeIds,
                              workspaceIdentity
                            };
                          });
                        }}
                        type="button"
                      >
                        <DisclosureGlyph expanded={expandedNodeIds.has(row.id)} />
                      </button>
                    ) : (
                      <div className="h-6 w-6 shrink-0" />
                    )}

                    <button
                      className={cn(
                        "flex w-full min-w-[220px] items-center gap-2 rounded px-2 py-1 text-left text-[13px] transition",
                        isSelected
                          ? "bg-[#111111] text-[var(--chrome-ink-inverse)] shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
                          : "text-[#111111] hover:bg-black/[0.04]"
                      )}
                      data-layer-node-id={row.id}
                      data-layer-row="true"
                      data-layer-selected={isSelected ? "true" : "false"}
                      onClick={() => {
                        onSelectNode(row.id);
                      }}
                      ref={(element) => {
                        registerRowElement(row.id, element);
                      }}
                      style={{
                        whiteSpace: "nowrap"
                      }}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center",
                          isSelected ? "text-[var(--chrome-ink-inverse)]" : "text-black/54"
                        )}
                        data-layer-icon-direction={row.frameDirection ?? "none"}
                        data-layer-icon-type={row.presentationKind}
                      >
                        <LayerGlyph
                          direction={row.frameDirection}
                          kind={row.presentationKind}
                        />
                      </span>

                      <span className="min-w-0 truncate">{row.name}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}

function isElementFullyVisibleWithinContainer(
  containerElement: HTMLElement,
  targetElement: HTMLElement
): boolean {
  const containerRect = containerElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();

  return (
    targetRect.top >= containerRect.top &&
    targetRect.bottom <= containerRect.bottom &&
    targetRect.left >= containerRect.left &&
    targetRect.right <= containerRect.right
  );
}

function buildVisibleRows(
  document: RendererDocument,
  expandedNodeIds: ReadonlySet<string>
): { maxDepth: number; rows: LayerRow[] } {
  const rows: LayerRow[] = [];
  let maxDepth = 0;

  const visitNode = (node: RendererNode, depth: number) => {
    const childIds = node.child_ids.filter((childId) => document.nodes[childId] !== undefined);

    rows.push({
      depth,
      frameDirection: resolveFrameDirection(node),
      id: node.id,
      isContainer: childIds.length > 0,
      kind: node.kind,
      name: node.name,
      presentationKind: resolvePresentationKind(node)
    });
    maxDepth = Math.max(maxDepth, depth);

    if (!expandedNodeIds.has(node.id)) {
      return;
    }

    for (const childId of childIds) {
      const childNode = document.nodes[childId];

      if (!childNode) {
        continue;
      }

      visitNode(childNode, depth + 1);
    }
  };

  for (const childId of document.root.child_ids) {
    const topLevelNode = resolveTopLevelNode(document, childId);

    if (!topLevelNode) {
      continue;
    }

    visitNode(topLevelNode, 0);
  }

  return { maxDepth, rows };
}

function createDefaultExpandedNodeIds(document: RendererDocument): Set<string> {
  const expandedNodeIds = new Set<string>();

  for (const childId of document.root.child_ids) {
    const topLevelNode = resolveTopLevelNode(document, childId);

    if (topLevelNode && topLevelNode.child_ids.length > 0) {
      expandedNodeIds.add(topLevelNode.id);
    }
  }

  return expandedNodeIds;
}

function collectAncestorContainerIds(
  document: RendererDocument,
  nodeId: string
): string[] {
  const ancestorIds: string[] = [];
  let currentNode = document.nodes[nodeId] ?? null;

  while (currentNode?.parent_id) {
    const parentNode = document.nodes[currentNode.parent_id] ?? null;

    if (!parentNode) {
      break;
    }

    if (parentNode.child_ids.length > 0) {
      ancestorIds.unshift(parentNode.id);
    }

    currentNode = parentNode;
  }

  return ancestorIds;
}

function resolveTopLevelNode(
  document: RendererDocument,
  childId: string
): RendererNode | null {
  const scene = document.scenes[childId];

  if (scene) {
    const sceneFrameNode = document.nodes[scene.id];

    return sceneFrameNode && sceneFrameNode.kind === "frame" ? sceneFrameNode : null;
  }

  const looseTopLevelNode = document.nodes[childId];

  return looseTopLevelNode && looseTopLevelNode.parent_id === null ? looseTopLevelNode : null;
}

function resolvePresentationKind(node: RendererNode): LayerPresentationKind {
  if (node.kind === "rectangle" && isAssetBackedRectangle(node)) {
    return "image";
  }

  switch (node.kind) {
    case "frame":
      return "frame";
    case "rectangle":
      return "rectangle";
    case "text":
      return "text";
    case "svg":
    case "svg-visual-element":
      return "svg";
  }
}

function isAssetBackedRectangle(node: RendererNode): boolean {
  return (
    node.kind === "rectangle" &&
    typeof node.render_style.backgroundImage === "string" &&
    ASSET_BACKGROUND_IMAGE_PATTERN.test(node.render_style.backgroundImage)
  );
}

function resolveFrameDirection(node: RendererNode): FrameDirection {
  if (node.kind !== "frame" || node.render_style.display !== "flex") {
    return null;
  }

  if (
    node.render_style.flexDirection === undefined ||
    node.render_style.flexDirection === "column" ||
    node.render_style.flexDirection === "column-reverse"
  ) {
    return "column";
  }

  if (
    node.render_style.flexDirection === "row" ||
    node.render_style.flexDirection === "row-reverse"
  ) {
    return "row";
  }

  return null;
}

function DisclosureGlyph({ expanded }: { expanded: boolean }) {
  return (
    <svg
      fill="none"
      height="12"
      viewBox="0 0 12 12"
      width="12"
    >
      <path
        d={expanded ? "M2.5 4.25 6 7.75l3.5-3.5" : "m4.25 2.5 3.5 3.5-3.5 3.5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function LayerGlyph({
  direction,
  kind
}: {
  direction: FrameDirection;
  kind: LayerPresentationKind;
}) {
  switch (kind) {
    case "frame":
      return <FrameGlyph direction={direction} />;
    case "image":
      return <ImageGlyph />;
    case "rectangle":
      return <RectangleGlyph />;
    case "text":
      return <TextGlyph />;
    case "svg":
      return <SvgGlyph />;
  }
}

function FrameGlyph({ direction }: { direction: FrameDirection }) {
  return (
    <svg fill="none" height="14" viewBox="0 0 14 14" width="14">
      <rect height="11" rx="2" stroke="currentColor" strokeWidth="1.1" width="11" x="1.5" y="1.5" />
      {direction === "row" ? (
        <>
          <rect fill="currentColor" height="2" rx="1" width="2" x="3" y="6" />
          <rect fill="currentColor" height="2" rx="1" width="2" x="6" y="6" />
          <rect fill="currentColor" height="2" rx="1" width="2" x="9" y="6" />
        </>
      ) : direction === "column" ? (
        <>
          <rect fill="currentColor" height="2" rx="1" width="2" x="6" y="3" />
          <rect fill="currentColor" height="2" rx="1" width="2" x="6" y="6" />
          <rect fill="currentColor" height="2" rx="1" width="2" x="6" y="9" />
        </>
      ) : null}
    </svg>
  );
}

function RectangleGlyph() {
  return (
    <svg fill="none" height="14" viewBox="0 0 14 14" width="14">
      <rect height="9" rx="1.6" stroke="currentColor" strokeWidth="1.1" width="11" x="1.5" y="2.5" />
    </svg>
  );
}

function TextGlyph() {
  return (
    <svg fill="none" height="14" viewBox="0 0 14 14" width="14">
      <path
        d="M3 3.25h8M7 3.25v7.5M5 10.75h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
    </svg>
  );
}

function ImageGlyph() {
  return (
    <svg fill="none" height="14" viewBox="0 0 14 14" width="14">
      <rect height="10" rx="1.6" stroke="currentColor" strokeWidth="1.1" width="11" x="1.5" y="2" />
      <circle cx="4.5" cy="5" fill="currentColor" r="1" />
      <path
        d="m3 10 2.4-2.6 1.7 1.8 2.3-2.8L11 10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
    </svg>
  );
}

function SvgGlyph() {
  return (
    <svg fill="none" height="14" viewBox="0 0 14 14" width="14">
      <circle cx="3" cy="4" fill="currentColor" r="1.2" />
      <circle cx="10.5" cy="3" fill="currentColor" r="1.2" />
      <circle cx="8.5" cy="10.5" fill="currentColor" r="1.2" />
      <path
        d="M4 4.6 9.3 3.4M3.8 4.9l4.1 4.6M9.8 4.1l-1 5.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
    </svg>
  );
}
