import { forwardRef, type ReactNode } from 'react';

import {
  DocumentRenderer,
  type DocumentRendererProps,
} from './DocumentRenderer.js';
import type { RendererMeasurementHandle, ViewportState } from './types.js';

export type EditorWorkspaceSurfaceProps = Omit<
  DocumentRendererProps,
  'viewportZoom'
> & {
  backdropLayer?: ReactNode;
  interactionLayer?: ReactNode;
  uiLayer?: ReactNode;
  viewport: ViewportState;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function createViewportTransform(viewport: ViewportState): string {
  return `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;
}

export const EditorWorkspaceSurface = forwardRef<
  RendererMeasurementHandle,
  EditorWorkspaceSurfaceProps
>(function EditorWorkspaceSurface(
  {
    backdropLayer,
    className,
    document,
    documentRevision,
    interactionLayer,
    resolvedAssetsById,
    uiLayer,
    viewport,
  },
  ref,
) {
  const layerStyle = {
    inset: 0,
    position: 'absolute' as const,
  };
  const nonInteractiveLayerStyle = {
    ...layerStyle,
    pointerEvents: 'none' as const,
  };
  const viewportTransformStyle = {
    height: '100%',
    transform: createViewportTransform(viewport),
    transformOrigin: '0 0',
    width: '100%',
  };

  return (
    <div
      className={cn(className)}
      data-editor-workspace-surface="true"
      style={{
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      <div data-layer="backdrop" style={nonInteractiveLayerStyle}>
        {backdropLayer}
      </div>

      <div data-layer="renderer" style={layerStyle}>
        <div data-viewport-transform="renderer" style={viewportTransformStyle}>
          <DocumentRenderer
            document={document}
            documentRevision={documentRevision}
            ref={ref}
            resolvedAssetsById={resolvedAssetsById}
            viewportZoom={viewport.zoom}
          />
        </div>
      </div>

      <div data-layer="interaction" style={nonInteractiveLayerStyle}>
        <div
          data-viewport-transform="interaction"
          style={{
            ...viewportTransformStyle,
            pointerEvents: 'none',
          }}
        >
          {interactionLayer}
        </div>
      </div>

      <div data-layer="ui" style={nonInteractiveLayerStyle}>
        {uiLayer}
      </div>
    </div>
  );
});
