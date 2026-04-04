import type { ComputedLayout } from "@ai-canvas/document-core";

export type ResolvedAssetSource = {
  url: string;
};

export type ResolvedAssetsById = Record<string, ResolvedAssetSource | undefined>;

export type ViewportState = {
  panX: number;
  panY: number;
  zoom: number;
};

export type RendererMeasurementHandle = {
  getDocumentRevision: () => number | null;
  getNodeElement: (nodeId: string) => Element | null;
  getRootElement: () => HTMLDivElement | null;
  measureSubtrees: (input: { rootIds: string[] }) => Record<string, ComputedLayout>;
};
