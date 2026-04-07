import type { ReactNode } from 'react';

import type { ViewportState } from './types.js';
import type { ViewportSize } from './viewport.js';

export type WorkspaceGridAxis = 'horizontal' | 'vertical';
export type WorkspaceGridLineKind = 'major' | 'minor';

export type WorkspaceGridLine = {
  axis: WorkspaceGridAxis;
  documentCoordinate: number;
  index: number;
  kind: WorkspaceGridLineKind;
  screenCoordinate: number;
};

export type WorkspaceGridGeometry = {
  backgroundFill: string;
  height: number;
  majorLines: WorkspaceGridLine[];
  minorLines: WorkspaceGridLine[];
  width: number;
};

type BuildWorkspaceGridGeometryInput = {
  devicePixelRatio?: number;
  viewport: ViewportState;
  viewportSize: ViewportSize;
};

type VisibleDocumentRange = {
  endX: number;
  endY: number;
  startX: number;
  startY: number;
};

const GRID_BACKGROUND_FILL = '#ffffff';
const GRID_MAJOR_LINE_COLOR = 'rgba(17, 17, 17, 0.085)';
const GRID_MINOR_LINE_COLOR = 'rgba(17, 17, 17, 0.045)';
const GRID_STROKE_WIDTH = 1;

export const WORKSPACE_GRID_MAJOR_SPACING = 128;
export const WORKSPACE_GRID_MINOR_SPACING = 16;
export const MIN_MINOR_GRID_SCREEN_SPACING = 8;

export function shouldRenderMinorGridLines(zoom: number): boolean {
  return WORKSPACE_GRID_MINOR_SPACING * zoom >= MIN_MINOR_GRID_SCREEN_SPACING;
}

export function snapGridLineToDevicePixel(
  position: number,
  options?: {
    devicePixelRatio?: number;
    strokeWidth?: number;
  },
): number {
  const devicePixelRatio =
    options?.devicePixelRatio && options.devicePixelRatio > 0
      ? options.devicePixelRatio
      : 1;
  const strokeWidth = options?.strokeWidth ?? GRID_STROKE_WIDTH;
  const strokeWidthInDevicePixels = strokeWidth * devicePixelRatio;
  const halfPixelOffset =
    strokeWidthInDevicePixels % 2 === 0 ? 0 : 0.5 / devicePixelRatio;

  return (
    Math.round(position * devicePixelRatio) / devicePixelRatio + halfPixelOffset
  );
}

export function resolveVisibleDocumentRange(
  viewport: ViewportState,
  viewportSize: ViewportSize,
): VisibleDocumentRange | null {
  if (
    viewport.zoom <= 0 ||
    viewportSize.width <= 0 ||
    viewportSize.height <= 0
  ) {
    return null;
  }

  return {
    endX: (viewportSize.width - viewport.panX) / viewport.zoom,
    endY: (viewportSize.height - viewport.panY) / viewport.zoom,
    startX: -viewport.panX / viewport.zoom,
    startY: -viewport.panY / viewport.zoom,
  };
}

export function buildWorkspaceGridGeometry(
  input: BuildWorkspaceGridGeometryInput,
): WorkspaceGridGeometry {
  const width = Math.max(0, input.viewportSize.width);
  const height = Math.max(0, input.viewportSize.height);
  const visibleDocumentRange = resolveVisibleDocumentRange(
    input.viewport,
    input.viewportSize,
  );

  if (!visibleDocumentRange) {
    return {
      backgroundFill: GRID_BACKGROUND_FILL,
      height,
      majorLines: [],
      minorLines: [],
      width,
    };
  }

  const minorLines = shouldRenderMinorGridLines(input.viewport.zoom)
    ? [
        ...createGridLinesForAxis({
          axis: 'vertical',
          devicePixelRatio: input.devicePixelRatio,
          documentEnd: visibleDocumentRange.endX,
          documentStart: visibleDocumentRange.startX,
          kind: 'minor',
          pan: input.viewport.panX,
          screenExtent: width,
          skipEvery:
            WORKSPACE_GRID_MAJOR_SPACING / WORKSPACE_GRID_MINOR_SPACING,
          spacing: WORKSPACE_GRID_MINOR_SPACING,
          zoom: input.viewport.zoom,
        }),
        ...createGridLinesForAxis({
          axis: 'horizontal',
          devicePixelRatio: input.devicePixelRatio,
          documentEnd: visibleDocumentRange.endY,
          documentStart: visibleDocumentRange.startY,
          kind: 'minor',
          pan: input.viewport.panY,
          screenExtent: height,
          skipEvery:
            WORKSPACE_GRID_MAJOR_SPACING / WORKSPACE_GRID_MINOR_SPACING,
          spacing: WORKSPACE_GRID_MINOR_SPACING,
          zoom: input.viewport.zoom,
        }),
      ]
    : [];

  const majorLines = [
    ...createGridLinesForAxis({
      axis: 'vertical',
      devicePixelRatio: input.devicePixelRatio,
      documentEnd: visibleDocumentRange.endX,
      documentStart: visibleDocumentRange.startX,
      kind: 'major',
      pan: input.viewport.panX,
      screenExtent: width,
      spacing: WORKSPACE_GRID_MAJOR_SPACING,
      zoom: input.viewport.zoom,
    }),
    ...createGridLinesForAxis({
      axis: 'horizontal',
      devicePixelRatio: input.devicePixelRatio,
      documentEnd: visibleDocumentRange.endY,
      documentStart: visibleDocumentRange.startY,
      kind: 'major',
      pan: input.viewport.panY,
      screenExtent: height,
      spacing: WORKSPACE_GRID_MAJOR_SPACING,
      zoom: input.viewport.zoom,
    }),
  ];

  return {
    backgroundFill: GRID_BACKGROUND_FILL,
    height,
    majorLines,
    minorLines,
    width,
  };
}

export function WorkspaceGridBackdrop({
  viewport,
  viewportSize,
}: {
  viewport: ViewportState;
  viewportSize: ViewportSize;
}) {
  const geometry = buildWorkspaceGridGeometry({
    devicePixelRatio:
      typeof window === 'undefined' || !window.devicePixelRatio
        ? 1
        : window.devicePixelRatio,
    viewport,
    viewportSize,
  });
  const svgWidth = Math.max(geometry.width, 1);
  const svgHeight = Math.max(geometry.height, 1);

  return (
    <svg
      data-workspace-backdrop="true"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{
        display: 'block',
        height: '100%',
        pointerEvents: 'none',
        width: '100%',
      }}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
    >
      <rect
        data-grid-background="true"
        fill={geometry.backgroundFill}
        height={svgHeight}
        width={svgWidth}
        x="0"
        y="0"
      />
      {geometry.minorLines.map((line) =>
        renderGridLine(line, geometry.width, geometry.height),
      )}
      {geometry.majorLines.map((line) =>
        renderGridLine(line, geometry.width, geometry.height),
      )}
    </svg>
  );
}

function createGridLinesForAxis(input: {
  axis: WorkspaceGridAxis;
  devicePixelRatio?: number;
  documentEnd: number;
  documentStart: number;
  kind: WorkspaceGridLineKind;
  pan: number;
  screenExtent: number;
  skipEvery?: number;
  spacing: number;
  zoom: number;
}): WorkspaceGridLine[] {
  const documentStart = Math.min(input.documentStart, input.documentEnd);
  const documentEnd = Math.max(input.documentStart, input.documentEnd);
  const startIndex = Math.floor(documentStart / input.spacing) - 1;
  const endIndex = Math.ceil(documentEnd / input.spacing) + 1;
  const lines: WorkspaceGridLine[] = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    if (input.skipEvery && index % input.skipEvery === 0) {
      continue;
    }

    const documentCoordinate = index * input.spacing;
    const rawScreenCoordinate = documentCoordinate * input.zoom + input.pan;

    if (
      rawScreenCoordinate < -GRID_STROKE_WIDTH ||
      rawScreenCoordinate > input.screenExtent + GRID_STROKE_WIDTH
    ) {
      continue;
    }

    lines.push({
      axis: input.axis,
      documentCoordinate,
      index,
      kind: input.kind,
      screenCoordinate: snapGridLineToDevicePixel(rawScreenCoordinate, {
        devicePixelRatio: input.devicePixelRatio,
        strokeWidth: GRID_STROKE_WIDTH,
      }),
    });
  }

  return lines;
}

function renderGridLine(
  line: WorkspaceGridLine,
  width: number,
  height: number,
): ReactNode {
  const stroke =
    line.kind === 'major' ? GRID_MAJOR_LINE_COLOR : GRID_MINOR_LINE_COLOR;
  const isVertical = line.axis === 'vertical';

  return (
    <line
      data-grid-line-axis={line.axis}
      data-grid-line-kind={line.kind}
      key={`${line.kind}-${line.axis}-${line.index}`}
      stroke={stroke}
      strokeWidth={GRID_STROKE_WIDTH}
      vectorEffect="non-scaling-stroke"
      x1={isVertical ? line.screenCoordinate : 0}
      x2={isVertical ? line.screenCoordinate : width}
      y1={isVertical ? 0 : line.screenCoordinate}
      y2={isVertical ? height : line.screenCoordinate}
    />
  );
}
