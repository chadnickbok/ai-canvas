import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';

import {
  createEmptyDocument,
  type RendererDocument,
  type RendererNode,
} from '@ai-canvas/document-core';
import { afterEach, describe, expect, it } from 'vitest';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';

import { ProjectSnapshotService } from './projectSnapshotService.js';
import { ProjectStore } from './projectStore.js';

const cleanupPaths: string[] = [];
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZcAAAAASUVORK5CYII=';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, 'base64');
const TINY_PNG_HASH =
  'e9cd408c8c8d0c2b28cff985d699b60d1dd970785342f19eeaac21a1060cc1d0';

afterEach(async () => {
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((entry) => rm(entry, { force: true, recursive: true })),
  );
});

type ProjectRow = {
  source_kind: string;
  source_metadata_json: string | null;
};

async function createTempStore(prefix: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupPaths.push(tempDir);

  return {
    dbPath: path.join(tempDir, 'app.db'),
    store: new ProjectStore(path.join(tempDir, 'app.db')),
    tempDir,
  };
}

function createReferencedDocument(
  documentId: string,
  name: string,
  assetContentHash: string,
): RendererDocument {
  const document = createEmptyDocument({
    documentId,
    name,
  });

  document.assets.asset_logo = {
    height: 1,
    id: 'asset_logo',
    kind: 'image',
    mime_type: 'image/png',
    source: {
      content_hash: assetContentHash,
      kind: 'asset_store',
      original_filename: 'logo.png',
    },
    width: 1,
  };
  document.assets.asset_logo_copy = {
    height: 1,
    id: 'asset_logo_copy',
    kind: 'image',
    mime_type: 'image/png',
    source: {
      content_hash: assetContentHash,
      kind: 'asset_store',
      original_filename: 'logo-copy.png',
    },
    width: 1,
  };
  document.root.child_ids = ['scene_home'];
  document.scenes.scene_home = {
    child_count: 1,
    frame_node_id: 'scene_home',
    id: 'scene_home',
    name: 'Home',
    scene_metadata: {
      tags: ['snapshot'],
    },
  };
  document.nodes.scene_home = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {},
    },
    child_ids: ['rect_card'],
    id: 'scene_home',
    is_locked: false,
    is_visible: true,
    kind: 'frame',
    name: 'Home',
    parent_id: null,
    render_style: {
      backgroundColor: '#ffffff',
      height: 400,
      left: 40,
      top: 40,
      width: 300,
    },
    scene_id: 'scene_home',
  };
  document.nodes.rect_card = {
    authoring: {
      local_values: {},
      style_bindings: {
        paint: 'style_brand',
      },
      variable_bindings: {
        'node.paint.background_color': 'var_brand',
      },
    },
    child_ids: [],
    id: 'rect_card',
    is_locked: false,
    is_visible: true,
    kind: 'rectangle',
    name: 'Card',
    parent_id: 'scene_home',
    render_style: {
      backgroundImage: 'url(asset://asset_logo)',
      height: 120,
      width: 240,
    },
    scene_id: 'scene_home',
  };
  document.variables.collections.tokens = {
    default_mode_id: 'mode_light',
    id: 'tokens',
    modes: {
      mode_light: {
        id: 'mode_light',
        name: 'Light',
      },
    },
    name: 'Tokens',
    variables: {
      var_brand: {
        collection_id: 'tokens',
        group_path: [],
        id: 'var_brand',
        kind: 'color',
        name: 'Brand',
        scopes: ['node.paint.background_color'],
        values_by_mode: {
          mode_light: {
            kind: 'value',
            value: '#ffcc00',
          },
        },
      },
    },
  };
  document.styles.paint.style_brand = {
    id: 'style_brand',
    name: 'Brand paint',
    slots: {
      'node.paint.background_color': {
        kind: 'variable',
        variable_id: 'var_brand',
      },
    },
  };

  return document;
}

async function createExportedReferencedSnapshot() {
  const { store, tempDir } = await createTempStore('ai-canvas-snapshot-');
  const created = store.createProject('Snapshot Project');
  const storedAsset = store.storeAssetBytes(TINY_PNG_BYTES);
  const document = createReferencedDocument(
    created.document.document_id,
    created.project.name,
    storedAsset.contentHash,
  );
  const saved = store.saveProjectDocument(
    created.project.id,
    document,
    created.revision,
  );

  expect(saved.ok).toBe(true);

  const snapshotPath = path.join(tempDir, 'snapshot.aicp');
  const service = new ProjectSnapshotService(store);
  await service.exportProjectSnapshot({
    destinationPath: snapshotPath,
    projectId: created.project.id,
  });

  return {
    created,
    snapshotPath,
    store,
    tempDir,
  };
}

async function readZipEntries(filePath: string): Promise<Map<string, Buffer>> {
  return await new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('Failed to open zip'));
        return;
      }

      const entries = new Map<string, Buffer>();

      zipFile.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(
              streamError ?? new Error(`Failed to read ${entry.fileName}`),
            );
            return;
          }

          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          stream.once('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zipFile.readEntry();
          });
          stream.once('error', reject);
        });
      });
      zipFile.once('end', () => resolve(entries));
      zipFile.once('error', reject);
      zipFile.readEntry();
    });
  });
}

async function writeZipEntries(
  filePath: string,
  entries: Array<{ buffer: Buffer; path: string }>,
) {
  await new Promise<void>((resolve, reject) => {
    const zipFile = new yazl.ZipFile();
    const output = createWriteStream(filePath);

    output.once('close', resolve);
    output.once('error', reject);
    zipFile.outputStream.once('error', reject);
    zipFile.outputStream.pipe(output);

    for (const entry of entries) {
      zipFile.addBuffer(entry.buffer, entry.path);
    }

    zipFile.end();
  });
}

async function writeRawStoredZipEntries(
  filePath: string,
  entries: Array<{ buffer: Buffer; path: string }>,
) {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.path);
    const crc = crc32(entry.buffer);
    const localHeader = Buffer.alloc(30 + fileName.byteLength);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.buffer.byteLength, 18);
    localHeader.writeUInt32LE(entry.buffer.byteLength, 22);
    localHeader.writeUInt16LE(fileName.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    fileName.copy(localHeader, 30);

    const centralHeader = Buffer.alloc(46 + fileName.byteLength);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.buffer.byteLength, 20);
    centralHeader.writeUInt32LE(entry.buffer.byteLength, 24);
    centralHeader.writeUInt16LE(fileName.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    fileName.copy(centralHeader, 46);

    localRecords.push(localHeader, entry.buffer);
    centralRecords.push(centralHeader);
    offset += localHeader.byteLength + entry.buffer.byteLength;
  }

  const centralDirectorySize = centralRecords.reduce(
    (sum, record) => sum + record.byteLength,
    0,
  );
  const endRecord = Buffer.alloc(22);

  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectorySize, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  await writeFile(
    filePath,
    Buffer.concat([...localRecords, ...centralRecords, endRecord]),
  );
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let index = 0; index < 8; index += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function parseEntry<T>(entries: Map<string, Buffer>, entryPath: string): T {
  const buffer = entries.get(entryPath);

  if (!buffer) {
    throw new Error(`${entryPath} was not found`);
  }

  return JSON.parse(buffer.toString('utf8')) as T;
}

function findNodeByName(
  document: RendererDocument,
  name: string,
): RendererNode {
  const node = Object.values(document.nodes).find(
    (candidate) => candidate.name === name,
  );

  if (!node) {
    throw new Error(`Node ${name} was not found`);
  }

  return node;
}

describe('ProjectSnapshotService', () => {
  it('exports a minimal project as a deterministic .aicp archive without local storage internals', async () => {
    const { store, tempDir } = await createTempStore(
      'ai-canvas-snapshot-minimal-',
    );
    const created = store.createProject('Minimal Snapshot');
    const snapshotPath = path.join(tempDir, 'minimal.aicp');
    const service = new ProjectSnapshotService(store);

    await service.exportProjectSnapshot({
      destinationPath: snapshotPath,
      projectId: created.project.id,
    });

    const entries = await readZipEntries(snapshotPath);

    expect([...entries.keys()].sort()).toEqual([
      'document.json',
      'manifest.json',
      'project.json',
    ]);

    const manifest = parseEntry<{
      checksums: {
        asset_sha256: Record<string, string>;
        document_json_sha256: string;
        project_json_sha256: string;
      };
      entries: {
        assets: Record<string, unknown>;
      };
      snapshot_format: string;
      snapshot_version: number;
    }>(entries, 'manifest.json');
    const project = parseEntry<{
      document_id: string;
      id: string;
      name: string;
    }>(entries, 'project.json');

    expect(manifest.snapshot_format).toBe('ai-canvas-project');
    expect(manifest.snapshot_version).toBe(1);
    expect(manifest.entries.assets).toEqual({});
    expect(manifest.checksums.asset_sha256).toEqual({});
    expect(project).toMatchObject({
      document_id: created.project.documentId,
      id: created.project.id,
      name: 'Minimal Snapshot',
    });
    expect(Buffer.concat([...entries.values()]).toString('utf8')).not.toContain(
      'project_history',
    );
    expect(Buffer.concat([...entries.values()]).toString('utf8')).not.toContain(
      'current_document_json',
    );

    store.close();
  });

  it('exports asset-store payloads with content-addressed paths and de-duplicates identical bytes', async () => {
    const { snapshotPath, store } = await createExportedReferencedSnapshot();
    const entries = await readZipEntries(snapshotPath);
    const manifest = parseEntry<{
      entries: {
        assets: Record<
          string,
          {
            content_hash: string;
            path: string;
          }
        >;
      };
    }>(entries, 'manifest.json');
    const assetPaths = Object.values(manifest.entries.assets).map(
      (entry) => entry.path,
    );

    expect(manifest.entries.assets.asset_logo).toMatchObject({
      content_hash: TINY_PNG_HASH,
      path: `assets/sha256/${TINY_PNG_HASH.slice(0, 2)}/${TINY_PNG_HASH}`,
    });
    expect(new Set(assetPaths).size).toBe(1);
    expect(
      [...entries.keys()].filter((entryPath) =>
        entryPath.startsWith('assets/sha256/'),
      ),
    ).toEqual([`assets/sha256/${TINY_PNG_HASH.slice(0, 2)}/${TINY_PNG_HASH}`]);

    store.close();
  });

  it('imports an exported snapshot with fresh ids, empty history, persisted assets, and remapped references', async () => {
    const { created, snapshotPath, store } =
      await createExportedReferencedSnapshot();
    const importedTemp = await createTempStore('ai-canvas-snapshot-import-');
    const importService = new ProjectSnapshotService(importedTemp.store);

    const imported = await importService.importProjectSnapshot({
      filePath: snapshotPath,
    });

    expect(imported.warnings).toEqual([]);
    expect(imported.activeProject.project.name).toBe('Snapshot Project');
    expect(imported.activeProject.project.id).not.toBe(created.project.id);
    expect(imported.activeProject.document.document_id).not.toBe(
      created.project.documentId,
    );
    expect(imported.activeProject.revision).toBe(1);
    expect(
      importedTemp.store.getProjectHistory(imported.activeProject.project.id),
    ).toEqual({
      redo: [],
      undo: [],
    });

    const documentJson = JSON.stringify(imported.activeProject.document);
    expect(documentJson).not.toContain('asset_logo');
    expect(documentJson).not.toContain('rect_card');
    expect(documentJson).not.toContain('style_brand');
    expect(documentJson).not.toContain('var_brand');
    expect(documentJson).not.toContain('scene_home');

    const cardNode = findNodeByName(imported.activeProject.document, 'Card');
    const sceneNode = findNodeByName(imported.activeProject.document, 'Home');
    const paintStyleId = (
      cardNode.authoring.style_bindings as Partial<Record<'paint', string>>
    ).paint;

    expect(cardNode.parent_id).toBe(sceneNode.id);
    expect(cardNode.scene_id).toBe(sceneNode.id);
    expect(cardNode.render_style.backgroundImage).toMatch(
      /^url\(asset:\/\/asset_/,
    );
    expect(paintStyleId).toBeTruthy();

    const paintStyle =
      imported.activeProject.document.styles.paint[paintStyleId ?? ''];
    const paintSlot = paintStyle?.slots['node.paint.background_color'];

    expect(paintSlot?.kind).toBe('variable');
    expect(
      paintSlot?.kind === 'variable' ? paintSlot.variable_id : null,
    ).toMatch(/^variable_/);

    const importedAssetId = Object.keys(
      imported.activeProject.document.assets,
    )[0];
    const importedAssetPath = importedTemp.store.resolveAssetFilePath(
      imported.activeProject.project.id,
      importedAssetId ?? '',
    );

    expect(importedAssetPath).not.toBeNull();
    expect(await readFile(importedAssetPath ?? '', 'base64')).toBe(
      TINY_PNG_BASE64,
    );

    const database = new DatabaseSync(importedTemp.dbPath);
    const row = database
      .prepare(
        'SELECT source_kind, source_metadata_json FROM projects WHERE id = ?',
      )
      .get(imported.activeProject.project.id) as ProjectRow;

    expect(row.source_kind).toBe('imported_snapshot');
    expect(JSON.parse(row.source_metadata_json ?? '{}')).toMatchObject({
      snapshot_format: 'ai-canvas-project',
      snapshot_project_id: created.project.id,
      source_document_id: created.project.documentId,
    });
    database.close();
    store.close();
    importedTemp.store.close();
  });

  it('imports the same snapshot twice as distinct local projects', async () => {
    const { snapshotPath, store } = await createExportedReferencedSnapshot();
    const importedTemp = await createTempStore(
      'ai-canvas-snapshot-import-twice-',
    );
    const importService = new ProjectSnapshotService(importedTemp.store);

    const firstImport = await importService.importProjectSnapshot({
      filePath: snapshotPath,
    });
    const secondImport = await importService.importProjectSnapshot({
      filePath: snapshotPath,
    });

    expect(secondImport.activeProject.project.id).not.toBe(
      firstImport.activeProject.project.id,
    );
    expect(secondImport.activeProject.document.document_id).not.toBe(
      firstImport.activeProject.document.document_id,
    );
    expect(
      Object.keys(secondImport.activeProject.document.nodes).sort(),
    ).not.toEqual(Object.keys(firstImport.activeProject.document.nodes).sort());

    store.close();
    importedTemp.store.close();
  });

  it('partially imports snapshots with missing or corrupted assets and removes broken render references', async () => {
    const { snapshotPath, store, tempDir } =
      await createExportedReferencedSnapshot();
    const entries = await readZipEntries(snapshotPath);
    const manifest = parseEntry<{
      entries: {
        assets: Record<string, { path: string }>;
      };
    }>(entries, 'manifest.json');
    const assetPath = manifest.entries.assets.asset_logo.path;
    const missingAssetSnapshot = path.join(tempDir, 'missing-asset.aicp');
    const checksumSnapshot = path.join(tempDir, 'checksum-asset.aicp');

    await writeZipEntries(
      missingAssetSnapshot,
      [...entries.entries()]
        .filter(([entryPath]) => entryPath !== assetPath)
        .map(([entryPath, buffer]) => ({ buffer, path: entryPath })),
    );
    await writeZipEntries(
      checksumSnapshot,
      [...entries.entries()].map(([entryPath, buffer]) => ({
        buffer: entryPath === assetPath ? Buffer.from('corrupt') : buffer,
        path: entryPath,
      })),
    );

    for (const [filePath, warningCode] of [
      [missingAssetSnapshot, 'asset_file_missing'],
      [checksumSnapshot, 'asset_checksum_mismatch'],
    ] as const) {
      const importedTemp = await createTempStore(
        `ai-canvas-snapshot-${warningCode}-`,
      );
      const importService = new ProjectSnapshotService(importedTemp.store);
      const imported = await importService.importProjectSnapshot({ filePath });
      const cardNode = findNodeByName(imported.activeProject.document, 'Card');

      expect(imported.warnings.map((warning) => warning.code)).toContain(
        warningCode,
      );
      expect(imported.activeProject.document.assets).toEqual({});
      expect(cardNode.render_style.backgroundImage).toBeUndefined();

      importedTemp.store.close();
    }

    store.close();
  });

  it('rejects unsupported, malformed, unsafe, and duplicate-entry archives', async () => {
    const { tempDir, store } = await createTempStore(
      'ai-canvas-snapshot-invalid-',
    );
    const service = new ProjectSnapshotService(store);
    const missingManifestPath = path.join(tempDir, 'missing-manifest.aicp');
    const unsupportedPath = path.join(tempDir, 'unsupported.aicp');
    const traversalPath = path.join(tempDir, 'traversal.aicp');
    const duplicatePath = path.join(tempDir, 'duplicate.aicp');
    const unsupportedManifest = Buffer.from(
      JSON.stringify({
        checksums: {
          asset_sha256: {},
          document_json_sha256: TINY_PNG_HASH,
          project_json_sha256: TINY_PNG_HASH,
        },
        created_at: '2026-01-01T00:00:00.000Z',
        created_by: {
          app: 'ai-canvas-desktop',
        },
        entries: {
          assets: {},
          document: 'document.json',
          project: 'project.json',
        },
        project_id: 'project_old',
        snapshot_format: 'ai-canvas-project',
        snapshot_version: 999,
      }),
    );

    await writeZipEntries(missingManifestPath, [
      { buffer: Buffer.from('{}'), path: 'project.json' },
      { buffer: Buffer.from('{}'), path: 'document.json' },
    ]);
    await writeZipEntries(unsupportedPath, [
      { buffer: unsupportedManifest, path: 'manifest.json' },
      { buffer: Buffer.from('{}'), path: 'project.json' },
      { buffer: Buffer.from('{}'), path: 'document.json' },
    ]);
    await writeRawStoredZipEntries(traversalPath, [
      { buffer: Buffer.from('{}'), path: '../manifest.json' },
    ]);
    await writeRawStoredZipEntries(duplicatePath, [
      { buffer: Buffer.from('{}'), path: 'manifest.json' },
      { buffer: Buffer.from('{}'), path: 'manifest.json' },
    ]);

    await expect(
      service.importProjectSnapshot({ filePath: missingManifestPath }),
    ).rejects.toMatchObject({ code: 'snapshot_invalid' });
    await expect(
      service.importProjectSnapshot({ filePath: unsupportedPath }),
    ).rejects.toMatchObject({ code: 'snapshot_unsupported_version' });
    await expect(
      service.importProjectSnapshot({ filePath: traversalPath }),
    ).rejects.toMatchObject({ code: 'snapshot_invalid' });
    await expect(
      service.importProjectSnapshot({ filePath: duplicatePath }),
    ).rejects.toMatchObject({ code: 'snapshot_invalid' });

    store.close();
  });
});
