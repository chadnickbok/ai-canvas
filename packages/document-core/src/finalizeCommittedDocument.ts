import { materializeSemanticRenderState } from './semanticResolution.js';
import { normalizeDocument } from './normalizeDocument.js';
import { parseDocument, type RendererDocument } from './types.js';
import type { RefreshComputedLayoutInput } from './applyCommands.js';

export type FinalizeCommittedDocumentOptions = {
  currentRevision: number;
  measurementSurfaceAvailable: boolean;
  refreshComputedLayout?: (
    input: RefreshComputedLayoutInput,
  ) => RendererDocument | Promise<RendererDocument>;
};

export async function finalizeCommittedDocument(
  document: RendererDocument,
  options: FinalizeCommittedDocumentOptions,
): Promise<RendererDocument> {
  if (!options.measurementSurfaceAvailable) {
    const error = new Error(
      'A live measurement surface is required to finalize document changes',
    ) as Error & {
      code: 'measurement_surface_unavailable';
      revision: number;
    };
    error.code = 'measurement_surface_unavailable';
    error.revision = options.currentRevision;
    throw error;
  }

  const normalizedDocument = normalizeDocument(document, {
    fallbackDocumentId: document.document_id,
    fallbackName: document.name,
  });

  const changedNodeIds = Object.keys(normalizedDocument.nodes).sort();
  let finalDocument = normalizedDocument;

  if (changedNodeIds.length > 0 && options.refreshComputedLayout) {
    finalDocument = await options.refreshComputedLayout({
      document: normalizedDocument,
      changed_asset_ids: Object.keys(normalizedDocument.assets).sort(),
      changed_node_ids: changedNodeIds,
      changed_scene_ids: Object.keys(normalizedDocument.scenes).sort(),
      changed_style_ids: Object.keys(normalizedDocument.styles).sort(),
      changed_variable_ids: Object.keys(normalizedDocument.variables).sort(),
    });
  }

  return parseDocument(
    materializeSemanticRenderState(parseDocument(finalDocument)),
  );
}
