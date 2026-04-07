import {
  inspectSelection,
  type BackgroundAssetInspection,
  type DocumentSummaryInspection,
  type NodeInspectorInspection,
  type RendererDocument,
  type RendererNode,
  type SelectionInspection,
} from '@ai-canvas/document-core';
import {
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  parseFiniteCanvasLength,
  resolveFramePaddingInsets,
  resolveNodeCanvasRect,
  type CanvasRect,
  type EdgeInsets,
} from './interaction/geometry.js';
import type {
  RendererMeasurementHandle,
  ViewportState,
} from './rendering/types.js';

type SelectionInspectorProps = {
  canEditAppearance?: boolean;
  document: RendererDocument;
  onUpdateNodeFillColor?: (
    nodeId: string,
    color: string,
  ) => Promise<{ errorMessage?: string; ok: boolean }>;
  rendererRef: RefObject<RendererMeasurementHandle | null>;
  selectedNodeId: string | null;
  viewport: ViewportState;
};

type InspectorMetric = {
  label: string;
  value: string;
};

type InspectorRow = {
  label: string;
  value: ReactNode;
};

export function SelectionInspector({
  canEditAppearance = false,
  document,
  onUpdateNodeFillColor,
  rendererRef,
  selectedNodeId,
  viewport,
}: SelectionInspectorProps) {
  const selection = inspectSelection(document, selectedNodeId);
  const [bestAvailableCanvasRect, setBestAvailableCanvasRect] =
    useState<CanvasRect | null>(null);
  const selectedInspectableNodeId =
    selection.kind === 'document' ? null : selection.node.id;

  useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(() => {
      if (selectedInspectableNodeId === null) {
        setBestAvailableCanvasRect(null);
        return;
      }

      setBestAvailableCanvasRect(
        resolveNodeCanvasRect(
          document,
          selectedInspectableNodeId,
          rendererRef.current,
          viewport.zoom,
        ),
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
      <InspectorHeader selection={selection} />

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {selection.kind === 'document' ? (
          <DocumentSummaryView document={selection.document} />
        ) : (
          <SelectionDetailView
            bestAvailableCanvasRect={bestAvailableCanvasRect}
            canEditAppearance={canEditAppearance}
            document={document}
            onUpdateNodeFillColor={onUpdateNodeFillColor}
            selection={selection}
          />
        )}
      </div>
    </aside>
  );
}

function InspectorHeader({ selection }: { selection: SelectionInspection }) {
  return (
    <div className="border-b border-black/10 px-4 py-3">
      <div className="ui-mono text-[11px] uppercase tracking-[0.16em] text-black/42">
        Inspector
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 truncate text-[16px] font-semibold tracking-[-0.03em] text-[#111111]">
            {resolveInspectorTitle(selection)}
          </h2>
          <div className="mt-1 text-[13px] leading-5 text-black/56">
            {resolveInspectorSubtitle(selection)}
          </div>
        </div>
        <span className="ui-mono shrink-0 rounded border border-black/10 bg-white/92 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-black/54">
          {resolveInspectorKindLabel(selection)}
        </span>
      </div>
    </div>
  );
}

function DocumentSummaryView({
  document,
}: {
  document: DocumentSummaryInspection;
}) {
  const pageRows: InspectorRow[] = [
    { label: 'Page', value: document.page_name },
    ...(document.canvas_background_color
      ? [
          {
            label: 'Canvas',
            value: <ColorValue color={document.canvas_background_color} />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <InspectorSection title="Page">
        <div className="space-y-3">
          <MetricGrid
            items={[
              {
                label: 'W',
                value: String(document.scene_count),
                metricLabel: 'Scenes',
              },
              {
                label: 'H',
                value: String(document.node_count),
                metricLabel: 'Items',
              },
              ...(document.loose_top_level_node_count > 0
                ? [
                    {
                      label: 'X' as const,
                      value: String(document.loose_top_level_node_count),
                      metricLabel: 'Loose',
                    },
                  ]
                : []),
            ]}
          />
          <PropertyList rows={pageRows} />
        </div>
      </InspectorSection>

      <div className="rounded border border-black/10 bg-white/92 px-3 py-3 text-[13px] leading-6 text-black/56">
        Select a scene or layer to inspect layout and appearance.
      </div>
    </div>
  );
}

function SelectionDetailView({
  bestAvailableCanvasRect,
  canEditAppearance,
  document,
  onUpdateNodeFillColor,
  selection,
}: {
  bestAvailableCanvasRect: CanvasRect | null;
  canEditAppearance: boolean;
  document: RendererDocument;
  onUpdateNodeFillColor?: (
    nodeId: string,
    color: string,
  ) => Promise<{ errorMessage?: string; ok: boolean }>;
  selection: Exclude<SelectionInspection, { kind: 'document' }>;
}) {
  const selectedNode = selection.node;
  const rendererNode = document.nodes[selectedNode.id];
  const parentRendererNode =
    rendererNode?.parent_id !== null && rendererNode?.parent_id !== undefined
      ? document.nodes[rendererNode.parent_id]
      : undefined;
  const fillColor =
    typeof selectedNode.raw_render_style.backgroundColor === 'string'
      ? selectedNode.raw_render_style.backgroundColor
      : null;
  const appearanceRows = resolveAppearanceRows(selectedNode);

  if (!rendererNode) {
    return null;
  }

  return (
    <div className="space-y-4">
      <LayoutSection
        bestAvailableCanvasRect={bestAvailableCanvasRect}
        node={selectedNode}
      />

      {isFlexContainer(rendererNode) ? (
        <AutoLayoutSection node={rendererNode} />
      ) : null}

      {isFlexContainer(parentRendererNode) ? (
        <FlexItemSection node={rendererNode} />
      ) : null}

      {fillColor || appearanceRows.length > 0 ? (
        <InspectorSection title="Appearance">
          <div className="space-y-3">
            {fillColor ? (
              <FillColorControl
                canEdit={canEditAppearance}
                color={fillColor}
                nodeId={selectedNode.id}
                onUpdateNodeFillColor={onUpdateNodeFillColor}
              />
            ) : null}
            {appearanceRows.length > 0 ? (
              <PropertyList rows={appearanceRows} />
            ) : null}
          </div>
        </InspectorSection>
      ) : null}

      {selectedNode.text_content !== undefined ? (
        <TextSection node={selectedNode} />
      ) : null}
    </div>
  );
}

function LayoutSection({
  bestAvailableCanvasRect,
  node,
}: {
  bestAvailableCanvasRect: CanvasRect | null;
  node: NodeInspectorInspection;
}) {
  const metrics = resolveLayoutMetrics(node, bestAvailableCanvasRect);
  const rows: InspectorRow[] = [
    {
      label: 'Position',
      value: resolvePositionLabel(node),
    },
  ];

  return (
    <InspectorSection title="Layout">
      <div className="space-y-3">
        {metrics.length > 0 ? (
          <MetricGrid items={metrics} />
        ) : (
          <div className="rounded border border-dashed border-black/12 bg-[var(--chrome-surface-subtle)] px-3 py-3 text-[13px] leading-6 text-black/52">
            Layout details will appear after measurement resolves.
          </div>
        )}
        <PropertyList rows={rows} />
      </div>
    </InspectorSection>
  );
}

function AutoLayoutSection({ node }: { node: RendererNode }) {
  const paddingInsets = resolveFramePaddingInsets(node);
  const rows: InspectorRow[] = [
    {
      label: 'Direction',
      value: resolveFlexDirectionLabel(node.render_style.flexDirection),
    },
    {
      label: 'Gap',
      value: resolveGapSummary(node.render_style),
    },
    ...(paddingInsets
      ? [
          {
            label: 'Padding',
            value: formatInsets(paddingInsets),
          },
        ]
      : []),
    {
      label: 'Align',
      value: resolveAlignmentLabel(node.render_style.alignItems, 'Stretch'),
    },
    {
      label: 'Distribute',
      value: resolveAlignmentLabel(node.render_style.justifyContent, 'Start'),
    },
    {
      label: 'Clip',
      value: resolveClipContentLabel(node.render_style),
    },
  ];

  return (
    <InspectorSection title="Auto Layout">
      <PropertyList rows={rows} />
    </InspectorSection>
  );
}

function FlexItemSection({ node }: { node: RendererNode }) {
  const rows: InspectorRow[] = [
    {
      label: 'Grow',
      value: formatStyleValue(node.render_style.flexGrow) ?? '0',
    },
    {
      label: 'Shrink',
      value: formatStyleValue(node.render_style.flexShrink) ?? '1',
    },
    {
      label: 'Basis',
      value: formatStyleValue(node.render_style.flexBasis) ?? 'Auto',
    },
    {
      label: 'Align',
      value: resolveAlignmentLabel(node.render_style.alignSelf, 'Auto'),
    },
  ];

  return (
    <InspectorSection title="Flex Item">
      <PropertyList rows={rows} />
    </InspectorSection>
  );
}

function TextSection({ node }: { node: NodeInspectorInspection }) {
  const rows: InspectorRow[] = [
    maybeCreateRow('Font', node.raw_render_style.fontFamily),
    maybeCreateRow('Size', node.raw_render_style.fontSize),
    maybeCreateRow('Weight', node.raw_render_style.fontWeight),
    maybeCreateRow('Line height', node.raw_render_style.lineHeight),
    maybeCreateRow('Letter spacing', node.raw_render_style.letterSpacing),
    maybeCreateKeywordRow('Align', node.raw_render_style.textAlign),
    maybeCreateKeywordRow('Transform', node.raw_render_style.textTransform),
  ].filter((row): row is InspectorRow => row !== null);

  return (
    <InspectorSection title="Text">
      <div className="space-y-3">
        <div
          className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded border border-black/10 bg-[var(--chrome-surface-subtle)] px-3 py-3 text-[13px] leading-6 text-[#111111]"
          data-inspector-text-preview="true"
        >
          {node.text_content}
        </div>
        {rows.length > 0 ? <PropertyList rows={rows} /> : null}
      </div>
    </InspectorSection>
  );
}

function InspectorSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section
      className="rounded border border-black/10 bg-white/92"
      data-inspector-section={title.toLowerCase().replace(/\s+/g, '-')}
    >
      <div className="border-b border-black/8 px-3 py-2.5">
        <div className="ui-mono text-[10px] uppercase tracking-[0.16em] text-black/42">
          {title}
        </div>
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function MetricGrid({
  items,
}: {
  items: Array<InspectorMetric | (InspectorMetric & { metricLabel: string })>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" data-inspector-metrics="true">
      {items.map((item) => (
        <div
          className="rounded border border-black/10 bg-[var(--chrome-surface-subtle)] px-3 py-2.5"
          data-inspector-metric={item.label.toLowerCase()}
          key={`${item.label}-${item.value}`}
        >
          <div className="ui-mono text-[10px] uppercase tracking-[0.14em] text-black/42">
            {'metricLabel' in item ? item.metricLabel : item.label}
          </div>
          <div className="mt-1 text-[16px] font-semibold tracking-[-0.03em] text-[#111111]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function PropertyList({ rows }: { rows: InspectorRow[] }) {
  return (
    <dl className="space-y-2.5">
      {rows.map((row) => (
        <div className="flex items-start justify-between gap-3" key={row.label}>
          <dt className="ui-mono pt-0.5 text-[10px] uppercase tracking-[0.16em] text-black/42">
            {row.label}
          </dt>
          <dd className="m-0 min-w-0 text-right text-[13px] leading-5 text-[#111111]">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ColorValue({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-3 rounded-[3px] border border-black/14"
        style={{
          backgroundColor: color,
        }}
      />
      <span>{color}</span>
    </span>
  );
}

function FillColorControl({
  canEdit,
  color,
  nodeId,
  onUpdateNodeFillColor,
}: {
  canEdit: boolean;
  color: string;
  nodeId: string;
  onUpdateNodeFillColor?: (
    nodeId: string,
    color: string,
  ) => Promise<{ errorMessage?: string; ok: boolean }>;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputColor = resolveColorInputValue(color);
  const isDisabled = !canEdit || !onUpdateNodeFillColor || isSaving;

  const handleChange = async (nextColor: string) => {
    if (!onUpdateNodeFillColor || !canEdit || nextColor === inputColor) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const result = await onUpdateNodeFillColor(nodeId, nextColor);

      if (!result.ok) {
        setSaveError(result.errorMessage ?? 'Failed to update fill color.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="ui-mono pt-0.5 text-[10px] uppercase tracking-[0.16em] text-black/42">
          Fill
        </span>
        <div className="flex items-center gap-2">
          <input
            aria-label="Fill color"
            className="h-6 w-9 cursor-pointer border border-black/18 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isDisabled}
            onChange={(event) => {
              void handleChange(event.currentTarget.value);
            }}
            type="color"
            value={inputColor}
          />
          <span className="ui-mono text-[12px] uppercase tracking-[0.08em] text-[#111111]">
            {color}
          </span>
        </div>
      </div>
      {saveError ? (
        <div className="text-[12px] leading-5 text-black/62">{saveError}</div>
      ) : null}
    </div>
  );
}

function maybeCreateRow(label: string, value: unknown): InspectorRow | null {
  const formattedValue = formatStyleValue(value);

  return formattedValue ? { label, value: formattedValue } : null;
}

function maybeCreateKeywordRow(
  label: string,
  value: unknown,
): InspectorRow | null {
  const formattedValue =
    typeof value === 'string' ? formatKeywordValue(value) : null;

  return formattedValue ? { label, value: formattedValue } : null;
}

function resolveLayoutMetrics(
  node: NodeInspectorInspection,
  bestAvailableCanvasRect: CanvasRect | null,
): InspectorMetric[] {
  const metrics: InspectorMetric[] = [];
  const shouldShowPositionMetrics =
    node.parent_id === null || node.raw_render_style.position === 'absolute';
  const x = shouldShowPositionMetrics
    ? (bestAvailableCanvasRect?.x ??
      parseFiniteCanvasLength(node.raw_render_style.left))
    : null;
  const y = shouldShowPositionMetrics
    ? (bestAvailableCanvasRect?.y ??
      parseFiniteCanvasLength(node.raw_render_style.top))
    : null;
  const width =
    bestAvailableCanvasRect?.width ??
    parseFiniteCanvasLength(node.raw_render_style.width);
  const height =
    bestAvailableCanvasRect?.height ??
    parseFiniteCanvasLength(node.raw_render_style.height);

  if (x !== null) {
    metrics.push({ label: 'X', value: formatRoundedNumber(x) });
  }

  if (y !== null) {
    metrics.push({ label: 'Y', value: formatRoundedNumber(y) });
  }

  if (width !== null) {
    metrics.push({ label: 'W', value: formatRoundedNumber(width) });
  }

  if (height !== null) {
    metrics.push({ label: 'H', value: formatRoundedNumber(height) });
  }

  return metrics;
}

function resolveAppearanceRows(node: NodeInspectorInspection): InspectorRow[] {
  const rows: InspectorRow[] = [];
  const radius = formatStyleValue(node.raw_render_style.borderRadius);
  const opacity = formatOpacityValue(node.raw_render_style.opacity);

  if (node.background_asset) {
    rows.push({
      label: 'Image',
      value: describeBackgroundAsset(node.background_asset),
    });
  }

  if (radius) {
    rows.push({
      label: 'Radius',
      value: radius,
    });
  }

  if (opacity) {
    rows.push({
      label: 'Opacity',
      value: opacity,
    });
  }

  return rows;
}

function resolveInspectorTitle(selection: SelectionInspection): string {
  switch (selection.kind) {
    case 'document':
      return selection.document.name;
    case 'scene':
      return selection.scene.name;
    case 'node':
      return selection.node.name;
  }
}

function resolveInspectorSubtitle(selection: SelectionInspection): string {
  switch (selection.kind) {
    case 'document':
      return 'Nothing selected';
    case 'scene':
      return 'Scene frame';
    case 'node': {
      const labels = [
        selection.node.parent_name
          ? `Inside ${selection.node.parent_name}`
          : 'Top level',
      ];

      if (!selection.node.is_visible) {
        labels.push('Hidden');
      }

      if (selection.node.is_locked) {
        labels.push('Locked');
      }

      return labels.join(' · ');
    }
  }
}

function resolveInspectorKindLabel(selection: SelectionInspection): string {
  switch (selection.kind) {
    case 'document':
      return 'Page';
    case 'scene':
      return 'Scene';
    case 'node':
      return resolveNodeKindLabel(selection.node);
  }
}

function resolveNodeKindLabel(node: NodeInspectorInspection): string {
  if (node.background_asset && node.kind !== 'text') {
    return 'Image';
  }

  switch (node.kind) {
    case 'frame':
      return 'Frame';
    case 'rectangle':
      return 'Rectangle';
    case 'text':
      return 'Text';
    case 'svg':
      return 'SVG';
    case 'svg-visual-element':
      return 'Vector';
  }
}

function resolvePositionLabel(node: NodeInspectorInspection): string {
  if (node.parent_id === null) {
    return 'Top level';
  }

  if (node.raw_render_style.position === 'absolute') {
    return 'Absolute';
  }

  return 'In flow';
}

function isFlexContainer(node: RendererNode | undefined): node is RendererNode {
  return node?.kind === 'frame' && node.render_style.display === 'flex';
}

function resolveFlexDirectionLabel(value: unknown): string {
  if (value === 'column') {
    return 'Vertical';
  }

  if (value === 'row') {
    return 'Horizontal';
  }

  return 'Default';
}

function resolveGapSummary(renderStyle: RendererNode['render_style']): string {
  const gap = formatStyleValue(renderStyle.gap);

  if (gap) {
    return gap;
  }

  const rowGap = formatStyleValue(renderStyle.rowGap);
  const columnGap = formatStyleValue(renderStyle.columnGap);

  if (rowGap && columnGap) {
    return rowGap === columnGap ? rowGap : `${rowGap} / ${columnGap}`;
  }

  return rowGap ?? columnGap ?? '0';
}

function resolveAlignmentLabel(value: unknown, fallback: string): string {
  return typeof value === 'string'
    ? (formatKeywordValue(value) ?? fallback)
    : fallback;
}

function resolveClipContentLabel(
  renderStyle: RendererNode['render_style'],
): string {
  const overflowValues = [
    renderStyle.overflow,
    renderStyle.overflowX,
    renderStyle.overflowY,
  ];

  return overflowValues.some(
    (value) => value !== undefined && value !== 'visible',
  )
    ? 'On'
    : 'Off';
}

function describeBackgroundAsset(
  assetInspection: BackgroundAssetInspection,
): string {
  const asset = assetInspection.asset;
  const parts = ['Image fill'];
  const mimeLabel = asset.mime_type.split('/')[1];

  if (mimeLabel) {
    parts.push(mimeLabel.toUpperCase());
  }

  if (typeof asset.width === 'number' && typeof asset.height === 'number') {
    parts.push(
      `${formatRoundedNumber(asset.width)} × ${formatRoundedNumber(asset.height)}`,
    );
  }

  return parts.join(' · ');
}

function formatOpacityValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${formatRoundedNumber(value * 100)}%`;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const numericValue = Number.parseFloat(trimmedValue);

  if (trimmedValue.endsWith('%') || Number.isNaN(numericValue)) {
    return trimmedValue;
  }

  return `${formatRoundedNumber(numericValue * 100)}%`;
}

function formatStyleValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return formatRoundedNumber(value);
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  return String(value);
}

function formatKeywordValue(value: string): string | null {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  switch (normalizedValue) {
    case 'flex-start':
      return 'Start';
    case 'flex-end':
      return 'End';
    case 'space-between':
      return 'Space Between';
    case 'space-around':
      return 'Space Around';
    case 'space-evenly':
      return 'Space Evenly';
    default:
      return normalizedValue
        .split(/[-_]/)
        .map((part) => {
          if (!part) {
            return part;
          }

          return `${part[0].toUpperCase()}${part.slice(1)}`;
        })
        .join(' ');
  }
}

function formatInsets(insets: EdgeInsets): string {
  const top = formatRoundedNumber(insets.top);
  const right = formatRoundedNumber(insets.right);
  const bottom = formatRoundedNumber(insets.bottom);
  const left = formatRoundedNumber(insets.left);

  if (top === right && top === bottom && top === left) {
    return top;
  }

  if (top === bottom && right === left) {
    return `${top} ${right}`;
  }

  if (right === left) {
    return `${top} ${right} ${bottom}`;
  }

  return `${top} ${right} ${bottom} ${left}`;
}

function formatRoundedNumber(value: number): string {
  const roundedValue = Math.round(value * 100) / 100;

  return Number.isInteger(roundedValue)
    ? String(roundedValue)
    : `${roundedValue}`;
}

function resolveColorInputValue(color: string): string {
  const normalizedColor = color.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(normalizedColor)) {
    return normalizedColor.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(normalizedColor)) {
    const [r, g, b] = normalizedColor.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return '#111111';
}
