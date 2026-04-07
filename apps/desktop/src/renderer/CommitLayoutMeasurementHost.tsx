import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  DocumentRenderer,
  type RendererMeasurementHandle,
  type ResolvedAssetsById,
} from '@ai-canvas/editor-ui';
import type {
  DesktopApi,
  LayoutMeasurementRequest,
  LayoutMeasurementResult,
} from '@ai-canvas/ipc-contract';

const EMPTY_RESOLVED_ASSETS: ResolvedAssetsById = {};

function formatMeasurementError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to measure the renderer layout.';
}

function submitMeasurementResult(
  api: DesktopApi,
  result: LayoutMeasurementResult,
) {
  return api.submitLayoutMeasurementResult(result);
}

export function CommitLayoutMeasurementHost({ api }: { api: DesktopApi }) {
  const rendererRef = useRef<RendererMeasurementHandle | null>(null);
  const queuedRequestsRef = useRef<LayoutMeasurementRequest[]>([]);
  const [activeRequest, setActiveRequest] =
    useState<LayoutMeasurementRequest | null>(null);

  useEffect(() => {
    return api.subscribeToLayoutMeasurementRequests((request) => {
      queuedRequestsRef.current.push(request);
      setActiveRequest(
        (current) => current ?? queuedRequestsRef.current.shift() ?? null,
      );
    });
  }, [api]);

  useLayoutEffect(() => {
    if (!activeRequest) {
      return;
    }

    let cancelled = false;

    const measureRequest = async () => {
      try {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        const measuredLayouts = rendererRef.current?.measureSubtrees({
          rootIds: activeRequest.root_ids,
        });

        if (!measuredLayouts) {
          throw new Error('The hidden measurement renderer is unavailable.');
        }

        if (!cancelled) {
          await submitMeasurementResult(api, {
            measured_layouts: measuredLayouts,
            ok: true,
            request_id: activeRequest.request_id,
          });
        }
      } catch (error) {
        if (!cancelled) {
          await submitMeasurementResult(api, {
            error: {
              code: 'internal_error',
              message: formatMeasurementError(error),
            },
            ok: false,
            request_id: activeRequest.request_id,
          });
        }
      } finally {
        if (!cancelled) {
          setActiveRequest(queuedRequestsRef.current.shift() ?? null);
        }
      }
    };

    void measureRequest();

    return () => {
      cancelled = true;
    };
  }, [activeRequest, api]);

  if (!activeRequest) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      style={{
        height: 1,
        left: -100_000,
        overflow: 'hidden',
        pointerEvents: 'none',
        position: 'fixed',
        top: 0,
        visibility: 'hidden',
        width: 1,
      }}
    >
      <DocumentRenderer
        document={activeRequest.document}
        documentRevision={0}
        ref={rendererRef}
        resolvedAssetsById={EMPTY_RESOLVED_ASSETS}
      />
    </div>
  );
}
