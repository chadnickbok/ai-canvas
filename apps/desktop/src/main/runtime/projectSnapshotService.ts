import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  isAssetStoreSource,
  normalizeDocument,
  safeParseDocument,
  type AssetRecord,
  type LocalAssetStoreSource,
  type RendererDocument,
  type RendererNode,
  type RendererPaintStyle,
  type RendererStyles,
  type RendererTextStyle,
  type RendererVariable,
  type RendererVariableCollection,
} from '@ai-canvas/document-core';
import type {
  AppErrorCode,
  ProjectSummary,
  SnapshotWarning,
} from '@ai-canvas/ipc-contract';
import { z } from 'zod';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';

import { hashAssetBytes } from './assetStorage.js';
import {
  createAssetId,
  createDocumentId,
  createNodeId,
  createSceneId,
  createStyleId,
  createVariableCollectionId,
  createVariableId,
  createVariableModeId,
} from './ids.js';
import type { ProjectStore, StoredProject } from './projectStore.js';

export type ExportProjectSnapshotServiceInput = {
  appVersion?: string;
  destinationPath: string;
  projectId: string;
};

export type ExportProjectSnapshotServiceResult = {
  filePath: string;
  project: ProjectSummary;
  warnings: SnapshotWarning[];
};

export type ImportProjectSnapshotServiceInput = {
  filePath: string;
};

export type ImportProjectSnapshotServiceResult = {
  activeProject: StoredProject;
  warnings: SnapshotWarning[];
};

type SnapshotAssetEntry = {
  asset_id: string;
  content_hash: string;
  height?: number;
  mime_type: string;
  original_filename?: string;
  path: string;
  size_bytes: number;
  width?: number;
};

type SnapshotManifest = {
  checksums: {
    asset_sha256: Record<string, string>;
    document_json_sha256: string;
    preview_sha256?: Record<string, string>;
    project_json_sha256: string;
  };
  created_at: string;
  created_by: {
    app: 'ai-canvas-desktop';
    app_version?: string;
  };
  entries: {
    assets: Record<string, SnapshotAssetEntry>;
    document: string;
    previews?: {
      document_thumbnail?: string;
      project_thumbnail?: string;
    };
    project: string;
  };
  project_id: string;
  snapshot_format: 'ai-canvas-project';
  snapshot_version: 1;
};

type ProjectSnapshotMetadata = {
  created_at?: string;
  document_id: string;
  export_metadata?: {
    app_version?: string;
  };
  id: string;
  name: string;
  updated_at?: string;
};

type ZipEntryMap = Map<string, Buffer>;
type AssetStoreRecord = AssetRecord & {
  source: LocalAssetStoreSource;
};

const SNAPSHOT_FORMAT = 'ai-canvas-project';
const SNAPSHOT_VERSION = 1;
const HEX_SHA256_PATTERN = /^[a-f0-9]{64}$/;

const snapshotAssetEntrySchema = z
  .object({
    asset_id: z.string().min(1),
    content_hash: z.string().regex(HEX_SHA256_PATTERN),
    height: z.number().optional(),
    mime_type: z.string().min(1),
    original_filename: z.string().optional(),
    path: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
    width: z.number().optional(),
  })
  .strict();

const snapshotManifestSchema = z
  .object({
    checksums: z
      .object({
        asset_sha256: z.record(
          z.string(),
          z.string().regex(HEX_SHA256_PATTERN),
        ),
        document_json_sha256: z.string().regex(HEX_SHA256_PATTERN),
        preview_sha256: z
          .record(z.string(), z.string().regex(HEX_SHA256_PATTERN))
          .optional(),
        project_json_sha256: z.string().regex(HEX_SHA256_PATTERN),
      })
      .strict(),
    created_at: z.string(),
    created_by: z
      .object({
        app: z.literal('ai-canvas-desktop'),
        app_version: z.string().optional(),
      })
      .strict(),
    entries: z
      .object({
        assets: z.record(z.string(), snapshotAssetEntrySchema),
        document: z.string().min(1),
        previews: z
          .object({
            document_thumbnail: z.string().optional(),
            project_thumbnail: z.string().optional(),
          })
          .strict()
          .optional(),
        project: z.string().min(1),
      })
      .strict(),
    project_id: z.string().min(1),
    snapshot_format: z.literal(SNAPSHOT_FORMAT),
    snapshot_version: z.literal(SNAPSHOT_VERSION),
  })
  .strict();

const projectSnapshotMetadataSchema = z
  .object({
    created_at: z.string().optional(),
    document_id: z.string().min(1),
    export_metadata: z
      .object({
        app_version: z.string().optional(),
      })
      .strict()
      .optional(),
    id: z.string().min(1),
    name: z.string().min(1),
    updated_at: z.string().optional(),
  })
  .strict();

export class ProjectSnapshotError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectSnapshotError';
  }
}

export class ProjectSnapshotService {
  constructor(private readonly store: ProjectStore) {}

  async exportProjectSnapshot(
    input: ExportProjectSnapshotServiceInput,
  ): Promise<ExportProjectSnapshotServiceResult> {
    const storedProject = this.store.getProject(input.projectId);

    if (!storedProject) {
      throw new ProjectSnapshotError(
        'not_found',
        `Project ${input.projectId} does not exist`,
      );
    }

    const document = normalizeDocument(storedProject.document, {
      fallbackDocumentId: storedProject.project.documentId,
      fallbackName: storedProject.project.name,
    });
    const projectMetadata: ProjectSnapshotMetadata = {
      created_at: storedProject.project.createdAt,
      document_id: document.document_id,
      id: storedProject.project.id,
      name: storedProject.project.name,
      updated_at: storedProject.project.updatedAt,
      ...(input.appVersion
        ? {
            export_metadata: {
              app_version: input.appVersion,
            },
          }
        : {}),
    };

    const projectJsonBuffer = createJsonBuffer(projectMetadata);
    const documentJsonBuffer = createJsonBuffer(document);
    const assetEntries = await this.collectExportAssetEntries(
      storedProject.project.id,
      document,
    );
    const manifest: SnapshotManifest = {
      checksums: {
        asset_sha256: Object.fromEntries(
          assetEntries.map((entry) => [
            entry.assetEntry.asset_id,
            entry.contentHash,
          ]),
        ),
        document_json_sha256: sha256(documentJsonBuffer),
        project_json_sha256: sha256(projectJsonBuffer),
      },
      created_at: new Date().toISOString(),
      created_by: {
        app: 'ai-canvas-desktop',
        ...(input.appVersion ? { app_version: input.appVersion } : {}),
      },
      entries: {
        assets: Object.fromEntries(
          assetEntries.map((entry) => [
            entry.assetEntry.asset_id,
            entry.assetEntry,
          ]),
        ),
        document: 'document.json',
        project: 'project.json',
      },
      project_id: storedProject.project.id,
      snapshot_format: SNAPSHOT_FORMAT,
      snapshot_version: SNAPSHOT_VERSION,
    };

    await writeZipArchive(input.destinationPath, [
      {
        buffer: createJsonBuffer(manifest),
        path: 'manifest.json',
      },
      {
        buffer: projectJsonBuffer,
        path: 'project.json',
      },
      {
        buffer: documentJsonBuffer,
        path: 'document.json',
      },
      ...assetEntries.map((entry) => ({
        buffer: entry.bytes,
        path: entry.assetEntry.path,
      })),
    ]);

    return {
      filePath: input.destinationPath,
      project: storedProject.project,
      warnings: [],
    };
  }

  async importProjectSnapshot(
    input: ImportProjectSnapshotServiceInput,
  ): Promise<ImportProjectSnapshotServiceResult> {
    const warnings: SnapshotWarning[] = [];
    const entries = await readZipArchive(input.filePath);
    const manifest = parseManifest(entries);

    assertNoUnsupportedMultiBundleShape(manifest.rawManifest, 'manifest.json');

    const projectBuffer = getRequiredEntry(
      entries,
      manifest.data.entries.project,
    );
    const documentBuffer = getRequiredEntry(
      entries,
      manifest.data.entries.document,
    );

    warnIfChecksumMismatch({
      actualBuffer: projectBuffer,
      expectedHash: manifest.data.checksums.project_json_sha256,
      path: manifest.data.entries.project,
      warningCode: 'project_checksum_mismatch',
      warnings,
    });
    warnIfChecksumMismatch({
      actualBuffer: documentBuffer,
      expectedHash: manifest.data.checksums.document_json_sha256,
      path: manifest.data.entries.document,
      warningCode: 'document_checksum_mismatch',
      warnings,
    });

    const projectMetadata = parseProjectMetadata(
      projectBuffer,
      manifest.data.entries.project,
    );
    assertNoUnsupportedMultiBundleShape(
      projectMetadata.rawProject,
      manifest.data.entries.project,
    );

    if (projectMetadata.data.id !== manifest.data.project_id) {
      throw new ProjectSnapshotError(
        'snapshot_invalid',
        'project.json id does not match manifest project_id',
      );
    }

    const rawDocument = parseJson(
      documentBuffer,
      manifest.data.entries.document,
    );

    if (
      !isObject(rawDocument) ||
      typeof rawDocument.document_id !== 'string' ||
      rawDocument.document_id !== projectMetadata.data.document_id
    ) {
      throw new ProjectSnapshotError(
        'snapshot_invalid',
        'document.json document_id does not match project.json document_id',
      );
    }

    const normalizedDocument = normalizeDocument(rawDocument, {
      fallbackDocumentId: projectMetadata.data.document_id,
      fallbackName: projectMetadata.data.name,
    });
    const parsedDocument = safeParseDocument(normalizedDocument);

    if (!parsedDocument.success) {
      throw new ProjectSnapshotError(
        'snapshot_invalid',
        'document.json could not be normalized into a supported document',
      );
    }

    const importedAssetDocument = await this.importReadableAssets({
      document: parsedDocument.data,
      entries,
      manifest: manifest.data,
      warnings,
    });
    const remappedDocument = remapImportedDocument(importedAssetDocument, {
      filePath: input.filePath,
      importedAt: new Date().toISOString(),
    });
    const activeProject = this.store.createImportedProjectFromDocument({
      document: remappedDocument,
      name: projectMetadata.data.name,
      sourceMetadata: {
        imported_at: remappedDocument.source.imported_at ?? '',
        snapshot_file_name: path.basename(input.filePath),
        snapshot_format: SNAPSHOT_FORMAT,
        snapshot_project_id: projectMetadata.data.id,
        snapshot_version: SNAPSHOT_VERSION,
        source_document_id: projectMetadata.data.document_id,
      },
    });

    return {
      activeProject,
      warnings,
    };
  }

  private async collectExportAssetEntries(
    projectId: string,
    document: RendererDocument,
  ): Promise<
    Array<{
      assetEntry: SnapshotAssetEntry;
      bytes: Buffer;
      contentHash: string;
    }>
  > {
    const assetEntries: Array<{
      assetEntry: SnapshotAssetEntry;
      bytes: Buffer;
      contentHash: string;
    }> = [];
    const assetStoreAssets = Object.values(document.assets)
      .filter(isAssetStoreRecord)
      .sort((left, right) => left.id.localeCompare(right.id));
    const bytesByContentHash = new Map<string, Buffer>();

    for (const asset of assetStoreAssets) {
      const assetPath = this.store.resolveAssetFilePath(projectId, asset.id);

      if (!assetPath) {
        throw new ProjectSnapshotError(
          'snapshot_invalid',
          `Asset ${asset.id} is referenced by the project but its payload is missing`,
        );
      }

      const bytes =
        bytesByContentHash.get(asset.source.content_hash) ??
        (await readFile(assetPath));
      const actualHash = hashAssetBytes(bytes);

      if (actualHash !== asset.source.content_hash) {
        throw new ProjectSnapshotError(
          'snapshot_invalid',
          `Asset ${asset.id} content hash does not match its stored payload`,
        );
      }

      bytesByContentHash.set(actualHash, bytes);

      assetEntries.push({
        assetEntry: {
          asset_id: asset.id,
          content_hash: actualHash,
          ...(asset.height === undefined ? {} : { height: asset.height }),
          mime_type: asset.mime_type,
          ...(asset.source.original_filename === undefined
            ? {}
            : { original_filename: asset.source.original_filename }),
          path: resolveSnapshotAssetPath(actualHash),
          size_bytes: bytes.byteLength,
          ...(asset.width === undefined ? {} : { width: asset.width }),
        },
        bytes,
        contentHash: actualHash,
      });
    }

    return assetEntries;
  }

  private async importReadableAssets(input: {
    document: RendererDocument;
    entries: ZipEntryMap;
    manifest: SnapshotManifest;
    warnings: SnapshotWarning[];
  }): Promise<RendererDocument> {
    const nextDocument = structuredClone(input.document);
    const nextAssets: Record<string, AssetRecord> = {};

    for (const [assetId, asset] of Object.entries(nextDocument.assets).sort(
      ([leftId], [rightId]) => leftId.localeCompare(rightId),
    )) {
      if (!isAssetStoreSource(asset.source)) {
        nextAssets[assetId] = asset;
        continue;
      }

      const manifestAsset = input.manifest.entries.assets[assetId];

      if (!manifestAsset) {
        input.warnings.push({
          assetId,
          code: 'asset_manifest_missing',
          message: `Asset ${assetId} is missing from the snapshot manifest and was skipped.`,
        });
        continue;
      }

      const assetBuffer = input.entries.get(manifestAsset.path);

      if (!assetBuffer) {
        input.warnings.push({
          assetId,
          code: 'asset_file_missing',
          message: `Asset ${assetId} payload is missing and was skipped.`,
          path: manifestAsset.path,
        });
        continue;
      }

      const actualHash = hashAssetBytes(assetBuffer);
      const expectedChecksum = input.manifest.checksums.asset_sha256[assetId];

      if (
        actualHash !== manifestAsset.content_hash ||
        (expectedChecksum && actualHash !== expectedChecksum)
      ) {
        input.warnings.push({
          assetId,
          code: 'asset_checksum_mismatch',
          message: `Asset ${assetId} checksum did not match the snapshot manifest and was skipped.`,
          path: manifestAsset.path,
        });
        continue;
      }

      const stored = this.store.storeAssetBytes(assetBuffer);

      nextAssets[assetId] = {
        ...asset,
        height: manifestAsset.height ?? asset.height,
        mime_type: manifestAsset.mime_type || asset.mime_type,
        source: {
          kind: 'asset_store',
          content_hash: stored.contentHash,
          ...((manifestAsset.original_filename ??
          asset.source.original_filename)
            ? {
                original_filename:
                  manifestAsset.original_filename ??
                  asset.source.original_filename,
              }
            : {}),
        },
        width: manifestAsset.width ?? asset.width,
      };
    }

    return normalizeDocument(
      {
        ...nextDocument,
        assets: nextAssets,
      },
      {
        fallbackDocumentId: nextDocument.document_id,
        fallbackName: nextDocument.name,
      },
    );
  }
}

function isAssetStoreRecord(asset: AssetRecord): asset is AssetStoreRecord {
  return isAssetStoreSource(asset.source);
}

function parseManifest(entries: ZipEntryMap): {
  data: SnapshotManifest;
  rawManifest: unknown;
} {
  const manifestBuffer = getRequiredEntry(entries, 'manifest.json');
  const rawManifest = parseJson(manifestBuffer, 'manifest.json');

  if (
    isObject(rawManifest) &&
    rawManifest.snapshot_format === SNAPSHOT_FORMAT &&
    rawManifest.snapshot_version !== SNAPSHOT_VERSION
  ) {
    throw new ProjectSnapshotError(
      'snapshot_unsupported_version',
      `Unsupported snapshot version: ${String(rawManifest.snapshot_version)}`,
    );
  }

  const parsed = snapshotManifestSchema.safeParse(rawManifest);

  if (!parsed.success) {
    throw new ProjectSnapshotError(
      'snapshot_invalid',
      `manifest.json is not a valid AI Canvas project snapshot manifest: ${parsed.error.issues
        .map((issue) => issue.message)
        .join(', ')}`,
    );
  }

  assertSafeArchivePath(parsed.data.entries.project);
  assertSafeArchivePath(parsed.data.entries.document);

  for (const asset of Object.values(parsed.data.entries.assets)) {
    assertSafeArchivePath(asset.path);
  }

  return {
    data: parsed.data,
    rawManifest,
  };
}

function parseProjectMetadata(
  buffer: Buffer,
  entryPath: string,
): {
  data: ProjectSnapshotMetadata;
  rawProject: unknown;
} {
  const rawProject = parseJson(buffer, entryPath);
  const parsed = projectSnapshotMetadataSchema.safeParse(rawProject);

  if (!parsed.success) {
    throw new ProjectSnapshotError(
      'snapshot_invalid',
      `${entryPath} is not valid project snapshot metadata: ${parsed.error.issues
        .map((issue) => issue.message)
        .join(', ')}`,
    );
  }

  return {
    data: parsed.data,
    rawProject,
  };
}

function getRequiredEntry(entries: ZipEntryMap, entryPath: string): Buffer {
  const buffer = entries.get(entryPath);

  if (!buffer) {
    throw new ProjectSnapshotError(
      'snapshot_invalid',
      `Snapshot is missing required entry ${entryPath}`,
    );
  }

  return buffer;
}

function parseJson(buffer: Buffer, entryPath: string): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new ProjectSnapshotError(
      'snapshot_invalid',
      `${entryPath} is not valid JSON: ${
        error instanceof Error ? error.message : 'Unknown JSON parse error'
      }`,
    );
  }
}

function warnIfChecksumMismatch(input: {
  actualBuffer: Buffer;
  expectedHash: string;
  path: string;
  warningCode: string;
  warnings: SnapshotWarning[];
}): void {
  const actualHash = sha256(input.actualBuffer);

  if (actualHash === input.expectedHash) {
    return;
  }

  input.warnings.push({
    code: input.warningCode,
    message: `${input.path} checksum did not match the snapshot manifest.`,
    path: input.path,
  });
}

function assertNoUnsupportedMultiBundleShape(
  value: unknown,
  entryPath: string,
) {
  if (!isObject(value)) {
    return;
  }

  for (const key of ['projects', 'documents']) {
    const candidate = value[key];

    if (Array.isArray(candidate) && candidate.length > 1) {
      throw new ProjectSnapshotError(
        'snapshot_invalid',
        `${entryPath} declares multiple ${key}, which snapshot v1 does not support`,
      );
    }
  }
}

function remapImportedDocument(
  inputDocument: RendererDocument,
  options: {
    filePath: string;
    importedAt: string;
  },
): RendererDocument {
  const document = structuredClone(inputDocument);
  const oldDocumentId = document.document_id;
  const oldPageName = document.page_name;
  const assetIdMap = createIdMap(Object.keys(document.assets), createAssetId);
  const nodeIdMap = createNodeIdMap(document);
  const sceneIdMap = createSceneIdMap(document, nodeIdMap);
  const variableCollectionIdMap = createIdMap(
    Object.keys(document.variables.collections),
    createVariableCollectionId,
  );
  const variableModeIdMap = createVariableModeIdMap(document);
  const variableIdMap = createVariableIdMap(document);
  const paintStyleIdMap = createIdMap(Object.keys(document.styles.paint), () =>
    createStyleId(),
  );
  const textStyleIdMap = createIdMap(Object.keys(document.styles.text), () =>
    createStyleId(),
  );

  document.document_id = createDocumentId();
  document.source = {
    kind: 'ai-canvas',
    ...(document.source.created_at
      ? { created_at: document.source.created_at }
      : {}),
    imported_at: options.importedAt,
    source_document_id: oldDocumentId,
    source_file_name: path.basename(options.filePath),
    source_page_name: oldPageName,
  };
  document.assets = Object.fromEntries(
    Object.entries(document.assets).map(([oldAssetId, asset]) => {
      const nextAssetId = assetIdMap.get(oldAssetId) ?? createAssetId();
      return [
        nextAssetId,
        {
          ...asset,
          id: nextAssetId,
        },
      ];
    }),
  );
  document.root = {
    ...document.root,
    child_ids: remapIdList(document.root.child_ids, nodeIdMap),
  };
  document.scenes = remapScenes(document, sceneIdMap, nodeIdMap);
  document.nodes = remapNodes(document, {
    assetIdMap,
    nodeIdMap,
    paintStyleIdMap,
    sceneIdMap,
    textStyleIdMap,
    variableIdMap,
  });
  document.canvas = {
    ...document.canvas,
    authoring: {
      ...document.canvas.authoring,
      variable_bindings: remapRecordValues(
        document.canvas.authoring.variable_bindings,
        variableIdMap,
      ) as typeof document.canvas.authoring.variable_bindings,
    },
  };
  document.variables = {
    collections: remapVariableCollections(document, {
      variableCollectionIdMap,
      variableIdMap,
      variableModeIdMap,
    }),
  };
  document.styles = remapStyles(document.styles, {
    paintStyleIdMap,
    textStyleIdMap,
    variableIdMap,
  });

  return normalizeDocument(document, {
    fallbackDocumentId: document.document_id,
    fallbackName: document.name,
  });
}

function createIdMap(
  ids: string[],
  createId: () => string,
): Map<string, string> {
  return new Map(ids.sort().map((id) => [id, createId()]));
}

function createNodeIdMap(document: RendererDocument): Map<string, string> {
  const sceneFrameNodeIds = new Set(
    Object.values(document.scenes).flatMap((scene) => [
      scene.id,
      scene.frame_node_id,
    ]),
  );

  return new Map(
    Object.keys(document.nodes)
      .sort()
      .map((nodeId) => [
        nodeId,
        sceneFrameNodeIds.has(nodeId) ? createSceneId() : createNodeId(),
      ]),
  );
}

function createSceneIdMap(
  document: RendererDocument,
  nodeIdMap: Map<string, string>,
): Map<string, string> {
  const sceneIdMap = new Map<string, string>();

  for (const scene of Object.values(document.scenes).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const nextSceneId =
      nodeIdMap.get(scene.frame_node_id) ??
      nodeIdMap.get(scene.id) ??
      createSceneId();
    sceneIdMap.set(scene.id, nextSceneId);
    nodeIdMap.set(scene.frame_node_id, nextSceneId);
    nodeIdMap.set(scene.id, nextSceneId);
  }

  return sceneIdMap;
}

function createVariableModeIdMap(
  document: RendererDocument,
): Map<string, string> {
  const modeIds = new Set<string>();

  for (const collection of Object.values(document.variables.collections)) {
    for (const modeId of Object.keys(collection.modes)) {
      modeIds.add(modeId);
    }
  }

  return createIdMap([...modeIds], createVariableModeId);
}

function createVariableIdMap(document: RendererDocument): Map<string, string> {
  const variableIds = new Set<string>();

  for (const collection of Object.values(document.variables.collections)) {
    for (const variableId of Object.keys(collection.variables)) {
      variableIds.add(variableId);
    }
  }

  return createIdMap([...variableIds], createVariableId);
}

function remapScenes(
  document: RendererDocument,
  sceneIdMap: Map<string, string>,
  nodeIdMap: Map<string, string>,
): RendererDocument['scenes'] {
  return Object.fromEntries(
    Object.entries(document.scenes).map(([oldSceneId, scene]) => {
      const nextSceneId = sceneIdMap.get(oldSceneId) ?? createSceneId();
      return [
        nextSceneId,
        {
          ...scene,
          frame_node_id:
            nodeIdMap.get(scene.frame_node_id) ??
            nodeIdMap.get(oldSceneId) ??
            nextSceneId,
          id: nextSceneId,
        },
      ];
    }),
  );
}

function remapNodes(
  document: RendererDocument,
  maps: {
    assetIdMap: Map<string, string>;
    nodeIdMap: Map<string, string>;
    paintStyleIdMap: Map<string, string>;
    sceneIdMap: Map<string, string>;
    textStyleIdMap: Map<string, string>;
    variableIdMap: Map<string, string>;
  },
): RendererDocument['nodes'] {
  return Object.fromEntries(
    Object.entries(document.nodes).map(([oldNodeId, node]) => {
      const nextNodeId = maps.nodeIdMap.get(oldNodeId) ?? createNodeId();
      const nextNode = {
        ...node,
        authoring: {
          ...node.authoring,
          style_bindings: remapNodeStyleBindings(
            node.authoring.style_bindings as Partial<
              Record<'paint' | 'text', string>
            >,
            maps,
          ),
          variable_bindings: remapRecordValues(
            node.authoring.variable_bindings,
            maps.variableIdMap,
          ),
        },
        child_ids: remapIdList(node.child_ids, maps.nodeIdMap),
        id: nextNodeId,
        parent_id:
          node.parent_id === null
            ? null
            : (maps.nodeIdMap.get(node.parent_id) ?? null),
        render_style: remapRenderStyleAssets(
          node.render_style,
          maps.assetIdMap,
        ),
        scene_id:
          node.scene_id === null
            ? null
            : (maps.sceneIdMap.get(node.scene_id) ??
              maps.nodeIdMap.get(node.scene_id) ??
              null),
      };

      return [nextNodeId, nextNode as RendererNode];
    }),
  );
}

function remapVariableCollections(
  document: RendererDocument,
  maps: {
    variableCollectionIdMap: Map<string, string>;
    variableIdMap: Map<string, string>;
    variableModeIdMap: Map<string, string>;
  },
): RendererDocument['variables']['collections'] {
  return Object.fromEntries(
    Object.entries(document.variables.collections).map(
      ([oldCollectionId, collection]) => {
        const nextCollectionId =
          maps.variableCollectionIdMap.get(oldCollectionId) ??
          createVariableCollectionId();

        return [
          nextCollectionId,
          {
            ...collection,
            default_mode_id:
              maps.variableModeIdMap.get(collection.default_mode_id) ??
              collection.default_mode_id,
            id: nextCollectionId,
            modes: Object.fromEntries(
              Object.entries(collection.modes).map(([oldModeId, mode]) => {
                const nextModeId =
                  maps.variableModeIdMap.get(oldModeId) ??
                  createVariableModeId();
                return [
                  nextModeId,
                  {
                    ...mode,
                    id: nextModeId,
                  },
                ];
              }),
            ),
            variables: remapVariables(collection, maps, nextCollectionId),
          } satisfies RendererVariableCollection,
        ];
      },
    ),
  );
}

function remapVariables(
  collection: RendererVariableCollection,
  maps: {
    variableIdMap: Map<string, string>;
    variableModeIdMap: Map<string, string>;
  },
  nextCollectionId: string,
): RendererVariableCollection['variables'] {
  return Object.fromEntries(
    Object.entries(collection.variables).map(([oldVariableId, variable]) => {
      const nextVariableId =
        maps.variableIdMap.get(oldVariableId) ?? createVariableId();

      return [
        nextVariableId,
        {
          ...variable,
          collection_id: nextCollectionId,
          id: nextVariableId,
          values_by_mode: Object.fromEntries(
            Object.entries(variable.values_by_mode).map(
              ([oldModeId, modeValue]) => [
                maps.variableModeIdMap.get(oldModeId) ?? createVariableModeId(),
                remapVariableModeValue(modeValue, maps.variableIdMap),
              ],
            ),
          ),
        } as RendererVariable,
      ];
    }),
  );
}

function remapVariableModeValue(
  modeValue: unknown,
  variableIdMap: Map<string, string>,
): unknown {
  if (
    isObject(modeValue) &&
    modeValue.kind === 'alias' &&
    typeof modeValue.variable_id === 'string'
  ) {
    const nextVariableId = variableIdMap.get(modeValue.variable_id);

    return nextVariableId
      ? {
          ...modeValue,
          variable_id: nextVariableId,
        }
      : modeValue;
  }

  return modeValue;
}

function remapStyles(
  styles: RendererStyles,
  maps: {
    paintStyleIdMap: Map<string, string>;
    textStyleIdMap: Map<string, string>;
    variableIdMap: Map<string, string>;
  },
): RendererStyles {
  return {
    paint: Object.fromEntries(
      Object.entries(styles.paint).map(([oldStyleId, style]) => {
        const nextStyleId =
          maps.paintStyleIdMap.get(oldStyleId) ?? createStyleId();
        return [
          nextStyleId,
          {
            ...style,
            id: nextStyleId,
            slots: remapStyleSlots(style.slots, maps.variableIdMap),
          } as RendererPaintStyle,
        ];
      }),
    ),
    text: Object.fromEntries(
      Object.entries(styles.text).map(([oldStyleId, style]) => {
        const nextStyleId =
          maps.textStyleIdMap.get(oldStyleId) ?? createStyleId();
        return [
          nextStyleId,
          {
            ...style,
            id: nextStyleId,
            slots: remapStyleSlots(style.slots, maps.variableIdMap),
          } as RendererTextStyle,
        ];
      }),
    ),
  };
}

function remapStyleSlots<T extends Record<string, unknown>>(
  slots: T,
  variableIdMap: Map<string, string>,
): T {
  return Object.fromEntries(
    Object.entries(slots).map(([slot, value]) => [
      slot,
      isObject(value) &&
      value.kind === 'variable' &&
      typeof value.variable_id === 'string' &&
      variableIdMap.has(value.variable_id)
        ? {
            ...value,
            variable_id: variableIdMap.get(value.variable_id),
          }
        : value,
    ]),
  ) as T;
}

function remapNodeStyleBindings(
  bindings: Partial<Record<'paint' | 'text', string>>,
  maps: {
    paintStyleIdMap: Map<string, string>;
    textStyleIdMap: Map<string, string>;
  },
): Partial<Record<'paint' | 'text', string>> {
  return {
    ...(bindings.paint && maps.paintStyleIdMap.has(bindings.paint)
      ? { paint: maps.paintStyleIdMap.get(bindings.paint) }
      : {}),
    ...(bindings.text && maps.textStyleIdMap.has(bindings.text)
      ? { text: maps.textStyleIdMap.get(bindings.text) }
      : {}),
  };
}

function remapRecordValues<T extends Record<string, unknown>>(
  input: T,
  idMap: Map<string, string>,
): Partial<Record<keyof T, string>> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      if (typeof value !== 'string') {
        return [];
      }

      const nextValue = idMap.get(value);
      return nextValue ? [[key, nextValue]] : [];
    }),
  ) as Partial<Record<keyof T, string>>;
}

function remapIdList(ids: string[], idMap: Map<string, string>): string[] {
  return ids.flatMap((id) => {
    const nextId = idMap.get(id);
    return nextId ? [nextId] : [];
  });
}

function remapRenderStyleAssets(
  renderStyle: RendererNode['render_style'],
  assetIdMap: Map<string, string>,
): RendererNode['render_style'] {
  return Object.fromEntries(
    Object.entries(renderStyle).map(([key, value]) => {
      if (key !== 'backgroundImage' || typeof value !== 'string') {
        return [key, value];
      }

      return [key, remapAssetUrl(value, assetIdMap)];
    }),
  );
}

function remapAssetUrl(value: string, assetIdMap: Map<string, string>): string {
  return value.replace(/asset:\/\/([^'")\s]+)/g, (match, rawAssetId) => {
    const assetId = decodeURIComponentSafely(String(rawAssetId));
    const nextAssetId = assetIdMap.get(assetId);
    return nextAssetId ? `asset://${nextAssetId}` : match;
  });
}

function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function writeZipArchive(
  destinationPath: string,
  entries: Array<{ buffer: Buffer; path: string }>,
): Promise<void> {
  await mkdir(path.dirname(destinationPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const zipFile = new yazl.ZipFile();
    const output = createWriteStream(destinationPath);
    let settled = false;

    const settle = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    output.once('close', () => settle());
    output.once('error', settle);
    zipFile.outputStream.once('error', settle);
    zipFile.outputStream.pipe(output);

    const dedupedEntries = new Map<string, Buffer>();

    for (const entry of entries) {
      dedupedEntries.set(entry.path, entry.buffer);
    }

    for (const [entryPath, buffer] of [...dedupedEntries.entries()].sort(
      ([leftPath], [rightPath]) => leftPath.localeCompare(rightPath),
    )) {
      zipFile.addBuffer(buffer, entryPath);
    }

    zipFile.end();
  }).catch((error) => {
    throw new ProjectSnapshotError(
      'snapshot_io_error',
      error instanceof Error ? error.message : 'Failed to write snapshot',
    );
  });
}

async function readZipArchive(filePath: string): Promise<ZipEntryMap> {
  return await new Promise<ZipEntryMap>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(
          new ProjectSnapshotError(
            'snapshot_io_error',
            openError instanceof Error
              ? openError.message
              : 'Failed to open snapshot archive',
          ),
        );
        return;
      }

      const entries: ZipEntryMap = new Map();
      let settled = false;

      const fail = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        zipFile.close();
        reject(toZipReadError(error));
      };

      zipFile.once('error', fail);
      zipFile.once('end', () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(entries);
      });
      zipFile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipFile.readEntry();
          return;
        }

        try {
          assertSafeArchivePath(entry.fileName);
        } catch (error) {
          fail(error as Error);
          return;
        }

        if (entries.has(entry.fileName)) {
          fail(
            new ProjectSnapshotError(
              'snapshot_invalid',
              `Snapshot contains duplicate entry ${entry.fileName}`,
            ),
          );
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(
              new ProjectSnapshotError(
                'snapshot_io_error',
                streamError instanceof Error
                  ? streamError.message
                  : `Failed to read ${entry.fileName}`,
              ),
            );
            return;
          }

          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          stream.once('error', fail);
          stream.once('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zipFile.readEntry();
          });
        });
      });

      zipFile.readEntry();
    });
  });
}

function toZipReadError(error: Error): ProjectSnapshotError {
  if (error instanceof ProjectSnapshotError) {
    return error;
  }

  if (/invalid relative path|absolute path|duplicate/i.test(error.message)) {
    return new ProjectSnapshotError('snapshot_invalid', error.message);
  }

  return new ProjectSnapshotError('snapshot_io_error', error.message);
}

function assertSafeArchivePath(entryPath: string): void {
  if (
    entryPath.length === 0 ||
    entryPath.includes('\\') ||
    path.posix.isAbsolute(entryPath) ||
    entryPath.split('/').includes('..') ||
    path.posix.normalize(entryPath) !== entryPath
  ) {
    throw new ProjectSnapshotError(
      'snapshot_invalid',
      `Snapshot entry path is unsafe: ${entryPath}`,
    );
  }
}

function resolveSnapshotAssetPath(contentHash: string): string {
  return `assets/sha256/${contentHash.slice(0, 2)}/${contentHash}`;
}

function createJsonBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(sortJsonValue(value), null, 2)}\n`);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
  );
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
