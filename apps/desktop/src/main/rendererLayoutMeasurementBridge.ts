import { randomUUID } from 'node:crypto';

import type { BrowserWindow } from 'electron';

import type {
  ComputedLayout,
  RendererDocument,
} from '@ai-canvas/document-core';
import {
  appChannelNames,
  err,
  layoutMeasurementRequestSchema,
  ok,
  type AppErrorCode,
  type AppResult,
  type EmptyPayload,
  type LayoutMeasurementResult,
} from '@ai-canvas/ipc-contract';

type MeasureDocumentLayoutInput = {
  document: RendererDocument;
  rootIds: string[];
};

type PendingMeasurementRequest = {
  reject: (error: LayoutMeasurementBridgeError) => void;
  resolve: (measuredLayouts: Record<string, ComputedLayout>) => void;
  timeoutId: NodeJS.Timeout;
};

const DEFAULT_MEASUREMENT_TIMEOUT_MS = 10_000;

export class LayoutMeasurementBridgeError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class RendererLayoutMeasurementBridge {
  private readonly pendingRequests = new Map<
    string,
    PendingMeasurementRequest
  >();

  async measureDocumentLayout(
    browserWindow: BrowserWindow,
    input: MeasureDocumentLayoutInput,
  ): Promise<Record<string, ComputedLayout>> {
    if (browserWindow.isDestroyed()) {
      throw new LayoutMeasurementBridgeError(
        'measurement_surface_unavailable',
        'The renderer measurement surface is not available.',
      );
    }

    const requestId = randomUUID();
    const request = layoutMeasurementRequestSchema.parse({
      document: input.document,
      request_id: requestId,
      root_ids: input.rootIds,
    });

    const measurementPromise = new Promise<Record<string, ComputedLayout>>(
      (resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(
            new LayoutMeasurementBridgeError(
              'measurement_surface_unavailable',
              'The renderer measurement surface did not respond.',
            ),
          );
        }, DEFAULT_MEASUREMENT_TIMEOUT_MS);

        this.pendingRequests.set(requestId, {
          reject: (error) => {
            clearTimeout(timeoutId);
            reject(error);
          },
          resolve: (measuredLayouts) => {
            clearTimeout(timeoutId);
            resolve(measuredLayouts);
          },
          timeoutId,
        });
      },
    );

    browserWindow.webContents.send(
      appChannelNames.layoutMeasurementRequest,
      request,
    );

    return measurementPromise;
  }

  submitLayoutMeasurementResult(
    result: LayoutMeasurementResult,
  ): AppResult<EmptyPayload> {
    const pendingRequest = this.pendingRequests.get(result.request_id);

    if (!pendingRequest) {
      return err(
        'not_found',
        `No pending layout measurement request exists for ${result.request_id}.`,
      );
    }

    this.pendingRequests.delete(result.request_id);
    clearTimeout(pendingRequest.timeoutId);

    if (!result.ok) {
      pendingRequest.reject(
        new LayoutMeasurementBridgeError(
          result.error.code,
          result.error.message,
        ),
      );
      return ok({});
    }

    pendingRequest.resolve(result.measured_layouts);
    return ok({});
  }

  rejectAll(message: string): void {
    for (const [requestId, pendingRequest] of this.pendingRequests) {
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.reject(
        new LayoutMeasurementBridgeError(
          'measurement_surface_unavailable',
          message,
        ),
      );
      this.pendingRequests.delete(requestId);
    }
  }
}
