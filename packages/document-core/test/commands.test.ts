import { describe, expect, it } from 'vitest';

import {
  applyCommands,
  createEmptyDocument,
  normalizeDocument,
  type ApplyCommandsResult,
  type RendererDocument,
} from '../src';

function createBaseDocument(documentId = 'doc_commands'): RendererDocument {
  return createEmptyDocument({
    documentId,
    name: 'Command Tests',
  });
}

function expectOk(result: ApplyCommandsResult) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }

  return result;
}

function expectError(result: ApplyCommandsResult, code: string) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error('Expected command application to fail');
  }

  expect(result.error.code).toBe(code);
  return result;
}

async function runCommands(
  document: RendererDocument,
  commands: unknown[],
  options: {
    baseRevision?: number;
    currentRevision?: number;
    measurementSurfaceAvailable?: boolean;
    refreshComputedLayout?: (document: RendererDocument) => RendererDocument;
  } = {},
) {
  const currentRevision = options.currentRevision ?? 1;
  const normalizedDocument = normalizeDocument(document, {
    fallbackDocumentId: document.document_id,
    fallbackName: document.name,
  });

  return applyCommands(
    normalizedDocument,
    {
      document_id: normalizedDocument.document_id,
      commands,
      ...(options.baseRevision === undefined
        ? { base_revision: currentRevision }
        : { base_revision: options.baseRevision }),
    },
    {
      currentRevision,
      measurementSurfaceAvailable: options.measurementSurfaceAvailable ?? true,
      refreshComputedLayout: options.refreshComputedLayout
        ? ({ document: refreshedDocument }) =>
            options.refreshComputedLayout!(refreshedDocument)
        : ({ document: refreshedDocument }) => refreshedDocument,
    },
  );
}

describe('applyCommands', () => {
  it('creates scenes and nodes with canonical defaults and semantic render-style handling', async () => {
    const result = expectOk(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_scene',
          scene: {
            id: 'scene_home',
            name: 'Home',
            left: 40,
            top: 60,
            width: 390,
            height: 844,
            scene_metadata: {
              role: 'screen',
              tags: ['mobile', 'mobile', 'home'],
            },
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'title_1',
            kind: 'text',
            name: 'Title',
            render_style: {
              color: '#111111',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            },
            text: {
              content: 'Hello',
            },
          },
          parent: {
            parent_id: 'scene_home',
          },
        },
      ]),
    );

    expect(result.revision).toBe(2);
    expect(result.effects?.changed_scene_ids).toEqual(['scene_home']);
    expect(result.effects?.changed_node_ids).toEqual(['scene_home', 'title_1']);
    expect(result.document.scenes.scene_home).toEqual({
      id: 'scene_home',
      frame_node_id: 'scene_home',
      name: 'Home',
      child_count: 1,
      scene_metadata: {
        role: 'screen',
        tags: ['mobile', 'home'],
      },
    });
    expect(result.document.nodes.scene_home).toMatchObject({
      id: 'scene_home',
      kind: 'frame',
      parent_id: null,
      scene_id: 'scene_home',
      child_ids: ['title_1'],
      is_visible: true,
      is_locked: false,
    });
    expect(result.document.nodes.scene_home.render_style).toMatchObject({
      left: 40,
      top: 60,
      width: 390,
      height: 844,
    });
    expect(result.document.nodes.title_1).toMatchObject({
      id: 'title_1',
      kind: 'text',
      parent_id: 'scene_home',
      scene_id: 'scene_home',
      child_ids: [],
      is_visible: true,
      is_locked: false,
      text: {
        content: 'Hello',
      },
      authoring: {
        local_values: {
          'node.text.color': '#111111',
        },
        variable_bindings: {},
        style_bindings: {},
      },
    });
    expect(result.document.nodes.title_1.render_style).toEqual({
      color: '#111111',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    });
  });

  it('applies batches atomically and leaves the source document unchanged on failure', async () => {
    const document = createBaseDocument();
    const before = structuredClone(document);
    const result = expectError(
      await runCommands(document, [
        {
          type: 'create_scene',
          scene: {
            id: 'scene_home',
            name: 'Home',
            left: 0,
            top: 0,
            width: 400,
            height: 800,
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'rect_1',
            kind: 'rectangle',
            name: 'Card',
          },
          parent: {
            parent_id: 'missing_parent',
          },
        },
      ]),
      'target_not_found',
    );

    expect(result.error.command_index).toBe(1);
    expect(document).toEqual(before);
  });

  it('rejects invalid scene geometry payloads', async () => {
    const missingGeometry = expectError(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_scene',
          scene: {
            id: 'scene_home',
            name: 'Home',
            left: 0,
            top: 0,
            width: 320,
          },
        },
      ]),
      'validation_failed',
    );

    expect(missingGeometry.error.message).toContain('height');

    const duplicateGeometry = expectError(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_scene',
          scene: {
            id: 'scene_home',
            name: 'Home',
            left: 0,
            top: 0,
            width: 320,
            height: 640,
            render_style: {
              left: 10,
            },
          },
        },
      ]),
      'validation_failed',
    );

    expect(duplicateGeometry.error.message).toContain('Geometry key left');
  });

  it('reparents and reorders nodes while preserving structural invariants', async () => {
    const created = expectOk(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_scene',
          scene: {
            id: 'scene_home',
            name: 'Home',
            left: 0,
            top: 0,
            width: 400,
            height: 800,
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'text_1',
            kind: 'text',
            name: 'Caption',
            text: {
              content: 'Caption',
            },
          },
          parent: {
            parent_id: 'scene_home',
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'loose_1',
            kind: 'rectangle',
            name: 'Loose',
          },
          parent: {
            parent_id: null,
          },
        },
      ]),
    );

    const moved = expectOk(
      await runCommands(
        created.document,
        [
          {
            type: 'reparent_node',
            node_id: 'text_1',
            destination: {
              parent_id: null,
              index: 0,
            },
          },
          {
            type: 'reorder_children',
            container: {
              parent_id: null,
            },
            child_ids: ['scene_home', 'loose_1', 'text_1'],
          },
        ],
        { currentRevision: created.revision },
      ),
    );

    expect(moved.document.root.child_ids).toEqual([
      'scene_home',
      'loose_1',
      'text_1',
    ]);
    expect(moved.document.nodes.text_1.parent_id).toBeNull();
    expect(moved.document.nodes.text_1.scene_id).toBeNull();
    expect(moved.document.nodes.scene_home.child_ids).toEqual([]);
  });

  it('rejects invalid structural mutations', async () => {
    const created = expectOk(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_scene',
          scene: {
            id: 'scene_home',
            name: 'Home',
            left: 0,
            top: 0,
            width: 400,
            height: 800,
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'frame_1',
            kind: 'frame',
            name: 'Container',
          },
          parent: {
            parent_id: 'scene_home',
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'frame_2',
            kind: 'frame',
            name: 'Nested',
          },
          parent: {
            parent_id: 'frame_1',
          },
        },
      ]),
    );

    const deleteSceneViaNode = expectError(
      await runCommands(
        created.document,
        [
          {
            type: 'delete_node',
            node_id: 'scene_home',
          },
        ],
        { currentRevision: created.revision },
      ),
      'validation_failed',
    );

    expect(deleteSceneViaNode.error.message).toContain('delete_scene');

    const reparentIntoDescendant = expectError(
      await runCommands(
        created.document,
        [
          {
            type: 'reparent_node',
            node_id: 'frame_1',
            destination: {
              parent_id: 'frame_2',
            },
          },
        ],
        { currentRevision: created.revision },
      ),
      'validation_failed',
    );

    expect(reparentIntoDescendant.error.message).toContain('descendants');

    const detachedPrimitive = expectError(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_node',
          node: {
            id: 'path_1',
            kind: 'svg-visual-element',
            name: 'Path',
            svg_primitive: {
              element_name: 'path',
              order: 1,
              attributes: {
                d: 'M0 0',
              },
            },
          },
          parent: {
            parent_id: null,
          },
        },
      ]),
      'validation_failed',
    );

    expect(detachedPrimitive.error.message).toContain('svg-visual-element');
  });

  it('clears style and variable bindings by snapshotting effective values locally', async () => {
    const document = createBaseDocument();
    document.root.child_ids = ['text_1'];
    document.nodes.text_1 = {
      id: 'text_1',
      kind: 'text',
      name: 'Body',
      parent_id: null,
      child_ids: [],
      scene_id: null,
      is_visible: true,
      is_locked: false,
      render_style: {},
      authoring: {
        local_values: {},
        variable_bindings: {
          'node.text.color': 'body_color',
        },
        style_bindings: {
          text: 'text_body',
        },
      },
      text: {
        content: 'Hello',
      },
    };
    document.variables.collections.tokens = {
      id: 'tokens',
      name: 'Tokens',
      default_mode_id: 'light',
      modes: {
        light: {
          id: 'light',
          name: 'Light',
        },
      },
      variables: {
        body_color: {
          id: 'body_color',
          collection_id: 'tokens',
          kind: 'color',
          group_path: [],
          name: 'Body',
          scopes: ['node.text.color'],
          values_by_mode: {
            light: {
              kind: 'value',
              value: '#224466',
            },
          },
        },
      },
    };
    document.styles.text.text_body = {
      id: 'text_body',
      name: 'Body',
      slots: {
        'node.text.color': {
          kind: 'value',
          value: '#999999',
        },
        'node.typography.font_size': {
          kind: 'value',
          value: 16,
        },
      },
    };

    const result = expectOk(
      await runCommands(document, [
        {
          type: 'clear_node_style_binding',
          node_id: 'text_1',
          family: 'text',
        },
        {
          type: 'clear_node_variable_binding',
          node_id: 'text_1',
          slot: 'node.text.color',
        },
      ]),
    );

    expect(result.document.nodes.text_1.authoring).toEqual({
      local_values: {
        'node.text.color': '#224466',
        'node.typography.font_size': 16,
      },
      variable_bindings: {},
      style_bindings: {},
    });
    expect(result.document.nodes.text_1.render_style).toEqual({
      color: '#224466',
      fontSize: 16,
    });
  });

  it('deletes variables with command-owned detach behavior for bindings, styles, and aliases', async () => {
    const document = createBaseDocument();
    document.root.child_ids = ['text_1'];
    document.nodes.text_1 = {
      id: 'text_1',
      kind: 'text',
      name: 'Body',
      parent_id: null,
      child_ids: [],
      scene_id: null,
      is_visible: true,
      is_locked: false,
      render_style: {},
      authoring: {
        local_values: {},
        variable_bindings: {
          'node.text.color': 'base_color',
        },
        style_bindings: {
          text: 'text_body',
        },
      },
      text: {
        content: 'Hello',
      },
    };
    document.variables.collections.tokens = {
      id: 'tokens',
      name: 'Tokens',
      default_mode_id: 'light',
      modes: {
        light: {
          id: 'light',
          name: 'Light',
        },
      },
      variables: {
        base_color: {
          id: 'base_color',
          collection_id: 'tokens',
          kind: 'color',
          group_path: [],
          name: 'Base',
          scopes: ['node.text.color'],
          values_by_mode: {
            light: {
              kind: 'value',
              value: '#112233',
            },
          },
        },
        accent_color: {
          id: 'accent_color',
          collection_id: 'tokens',
          kind: 'color',
          group_path: [],
          name: 'Accent',
          scopes: ['node.text.color'],
          values_by_mode: {
            light: {
              kind: 'alias',
              variable_id: 'base_color',
            },
          },
        },
      },
    };
    document.styles.text.text_body = {
      id: 'text_body',
      name: 'Body',
      slots: {
        'node.text.color': {
          kind: 'variable',
          variable_id: 'base_color',
        },
      },
    };

    const result = expectOk(
      await runCommands(document, [
        {
          type: 'delete_variable',
          variable_id: 'base_color',
        },
      ]),
    );

    expect(
      result.document.variables.collections.tokens.variables.base_color,
    ).toBeUndefined();
    expect(
      result.document.variables.collections.tokens.variables.accent_color
        .values_by_mode.light,
    ).toEqual({
      kind: 'value',
      value: '#112233',
    });
    expect(
      result.document.styles.text.text_body.slots['node.text.color'],
    ).toEqual({
      kind: 'value',
      value: '#112233',
    });
    expect(
      (
        result.document.nodes.text_1.authoring.local_values as Record<
          string,
          unknown
        >
      )['node.text.color'],
    ).toBe('#112233');
    expect(result.document.nodes.text_1.authoring.variable_bindings).toEqual(
      {},
    );
    expect(result.document.nodes.text_1.render_style.color).toBe('#112233');
  });

  it('deletes styles by snapshotting style-contributed values to local node state', async () => {
    const document = createBaseDocument();
    document.root.child_ids = ['text_1'];
    document.nodes.text_1 = {
      id: 'text_1',
      kind: 'text',
      name: 'Body',
      parent_id: null,
      child_ids: [],
      scene_id: null,
      is_visible: true,
      is_locked: false,
      render_style: {},
      authoring: {
        local_values: {},
        variable_bindings: {},
        style_bindings: {
          text: 'text_body',
        },
      },
      text: {
        content: 'Hello',
      },
    };
    document.styles.text.text_body = {
      id: 'text_body',
      name: 'Body',
      slots: {
        'node.text.color': {
          kind: 'value',
          value: '#123456',
        },
        'node.typography.font_size': {
          kind: 'value',
          value: 18,
        },
      },
    };

    const result = expectOk(
      await runCommands(document, [
        {
          type: 'delete_style',
          family: 'text',
          style_id: 'text_body',
        },
      ]),
    );

    expect(result.document.styles.text.text_body).toBeUndefined();
    expect(result.document.nodes.text_1.authoring).toEqual({
      local_values: {
        'node.text.color': '#123456',
        'node.typography.font_size': 18,
      },
      variable_bindings: {},
      style_bindings: {},
    });
    expect(result.document.nodes.text_1.render_style).toEqual({
      color: '#123456',
      fontSize: 18,
    });
  });

  it('supports variable-collection, variable, and style CRUD through the shared command path', async () => {
    const created = expectOk(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_variable_collection',
          collection: {
            id: 'tokens',
            name: 'Tokens',
            default_mode_id: 'light',
            modes: {
              light: {
                id: 'light',
                name: 'Light',
              },
              dark: {
                id: 'dark',
                name: 'Dark',
              },
            },
          },
        },
        {
          type: 'create_variable',
          variable: {
            id: 'brand_color',
            collection_id: 'tokens',
            kind: 'color',
            group_path: [],
            name: 'Brand Color',
            scopes: ['node.text.color'],
            values_by_mode: {
              light: {
                kind: 'value',
                value: '#112233',
              },
              dark: {
                kind: 'value',
                value: '#445566',
              },
            },
          },
        },
        {
          type: 'create_style',
          style: {
            id: 'text_body',
            family: 'text',
            name: 'Body',
            slots: {
              'node.text.color': {
                kind: 'variable',
                variable_id: 'brand_color',
              },
            },
          },
        },
        {
          type: 'update_style',
          family: 'text',
          style_id: 'text_body',
          patch: {
            slots: {
              'node.typography.font_size': {
                kind: 'value',
                value: 20,
              },
            },
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'text_1',
            kind: 'text',
            name: 'Body',
            text: {
              content: 'Hello',
            },
          },
          parent: {
            parent_id: null,
          },
        },
        {
          type: 'bind_node_style',
          node_id: 'text_1',
          family: 'text',
          style_id: 'text_body',
        },
        {
          type: 'update_variable_collection',
          collection_id: 'tokens',
          patch: {
            default_mode_id: 'dark',
            description: 'Theme tokens',
          },
        },
        {
          type: 'update_variable',
          variable_id: 'brand_color',
          patch: {
            name: 'Brand',
            description: 'Primary brand token',
          },
        },
      ]),
    );

    expect(created.document.variables.collections.tokens.default_mode_id).toBe(
      'dark',
    );
    expect(created.document.variables.collections.tokens.description).toBe(
      'Theme tokens',
    );
    expect(
      created.document.variables.collections.tokens.variables.brand_color.name,
    ).toBe('Brand');
    expect(
      created.document.styles.text.text_body.slots['node.typography.font_size'],
    ).toEqual({
      kind: 'value',
      value: 20,
    });
    expect(created.document.nodes.text_1.render_style).toEqual({
      color: '#445566',
      fontSize: 20,
    });

    const deletedCollection = expectOk(
      await runCommands(
        created.document,
        [
          {
            type: 'delete_variable_collection',
            collection_id: 'tokens',
          },
        ],
        { currentRevision: created.revision },
      ),
    );

    expect(
      deletedCollection.document.variables.collections.tokens,
    ).toBeUndefined();
    expect(
      deletedCollection.document.styles.text.text_body.slots['node.text.color'],
    ).toEqual({
      kind: 'value',
      value: '#445566',
    });
    expect(deletedCollection.document.nodes.text_1.render_style).toEqual({
      color: '#445566',
      fontSize: 20,
    });
  });

  it('supports asset and SVG commands and clears asset references on delete', async () => {
    const created = expectOk(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_asset',
          asset: {
            id: 'asset_1',
            kind: 'image',
            mime_type: 'image/png',
            source: {
              kind: 'asset_store',
              content_hash: 'hash_asset_1',
            },
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'rect_1',
            kind: 'rectangle',
            name: 'Hero',
            render_style: {
              backgroundImage: 'url(asset://asset_1)',
            },
          },
          parent: {
            parent_id: null,
          },
        },
        {
          type: 'update_asset',
          asset_id: 'asset_1',
          patch: {
            width: 640,
            metadata: {
              alt: 'Hero',
            },
            source: {
              kind: 'asset_store',
              content_hash: 'hash123',
            },
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'icon_1',
            kind: 'svg',
            name: 'Icon',
            svg: {
              view_box: '0 0 10 10',
            },
          },
          parent: {
            parent_id: null,
          },
        },
        {
          type: 'create_node',
          node: {
            id: 'path_1',
            kind: 'svg-visual-element',
            name: 'Path',
            svg_primitive: {
              element_name: 'path',
              order: 1,
              attributes: {
                d: 'M0 0',
              },
            },
          },
          parent: {
            parent_id: 'icon_1',
          },
        },
        {
          type: 'update_svg_root',
          node_id: 'icon_1',
          patch: {
            preserve_aspect_ratio: 'none',
            raw_root_attributes: {
              fill: 'none',
            },
            view_box: '0 0 20 20',
          },
        },
        {
          type: 'update_svg_primitive',
          node_id: 'path_1',
          patch: {
            order: 2,
            attributes: {
              d: 'M1 1',
            },
          },
        },
      ]),
    );

    expect(created.document.assets.asset_1).toMatchObject({
      width: 640,
      metadata: {
        alt: 'Hero',
      },
      source: {
        kind: 'asset_store',
        content_hash: 'hash123',
      },
    });
    expect(created.document.nodes.rect_1.render_style.backgroundImage).toBe(
      'url(asset://asset_1)',
    );
    expect(created.document.nodes.icon_1).toMatchObject({
      kind: 'svg',
      svg: {
        preserve_aspect_ratio: 'none',
        raw_root_attributes: {
          fill: 'none',
        },
        view_box: '0 0 20 20',
      },
    });
    expect(created.document.nodes.path_1).toMatchObject({
      kind: 'svg-visual-element',
      svg_primitive: {
        order: 2,
        attributes: {
          d: 'M1 1',
        },
      },
    });

    const deleted = expectOk(
      await runCommands(
        created.document,
        [
          {
            type: 'delete_asset',
            asset_id: 'asset_1',
          },
        ],
        { currentRevision: created.revision },
      ),
    );

    expect(deleted.document.assets.asset_1).toBeUndefined();
    expect(
      deleted.document.nodes.rect_1.render_style.backgroundImage,
    ).toBeUndefined();
  });

  it('rejects embedded asset sources for live asset creation', async () => {
    const result = expectError(
      await runCommands(createBaseDocument(), [
        {
          type: 'create_asset',
          asset: {
            id: 'asset_legacy',
            kind: 'image',
            mime_type: 'image/png',
            source: {
              kind: 'base64',
              base64: 'abcd',
            },
          },
        },
      ]),
      'validation_failed',
    );

    expect(result.error.message).toContain('create_asset');
  });

  it('fails before mutation when the measurement surface is unavailable', async () => {
    const document = createBaseDocument();
    const before = structuredClone(document);
    const result = expectError(
      await runCommands(
        document,
        [
          {
            type: 'create_scene',
            scene: {
              id: 'scene_home',
              name: 'Home',
              left: 0,
              top: 0,
              width: 320,
              height: 640,
            },
          },
        ],
        { measurementSurfaceAvailable: false },
      ),
      'measurement_surface_unavailable',
    );

    expect(result.revision).toBe(1);
    expect(document).toEqual(before);
  });

  it('reports revision conflicts and malformed command payloads', async () => {
    const revisionConflict = expectError(
      await runCommands(
        createBaseDocument(),
        [
          {
            type: 'create_scene',
            scene: {
              id: 'scene_home',
              name: 'Home',
              left: 0,
              top: 0,
              width: 320,
              height: 640,
            },
          },
        ],
        {
          currentRevision: 3,
          baseRevision: 2,
        },
      ),
      'revision_conflict',
    );

    expect(revisionConflict.revision).toBe(3);

    const malformed = expectError(
      await applyCommands(
        createBaseDocument(),
        {
          document_id: 'doc_commands',
          commands: [
            {
              type: 'update_node',
              node_id: 'text_1',
              patch: {},
              text: {
                content: 'bad',
              },
            },
          ],
          base_revision: 1,
        },
        {
          currentRevision: 1,
          measurementSurfaceAvailable: true,
          refreshComputedLayout: ({ document }) => document,
        },
      ),
      'validation_failed',
    );

    expect(malformed.error.command_index).toBe(0);

    const unknown = expectError(
      await applyCommands(
        createBaseDocument(),
        {
          document_id: 'doc_commands',
          commands: [
            {
              type: 'explode_document',
            },
          ],
          base_revision: 1,
        },
        {
          currentRevision: 1,
          measurementSurfaceAvailable: true,
          refreshComputedLayout: ({ document }) => document,
        },
      ),
      'unknown_command',
    );

    expect(unknown.error.command_index).toBe(0);
  });

  it('rejects variable alias cycles introduced through updates', async () => {
    const document = createBaseDocument();
    document.variables.collections.tokens = {
      id: 'tokens',
      name: 'Tokens',
      default_mode_id: 'light',
      modes: {
        light: {
          id: 'light',
          name: 'Light',
        },
      },
      variables: {
        color_a: {
          id: 'color_a',
          collection_id: 'tokens',
          kind: 'color',
          group_path: [],
          name: 'A',
          scopes: ['node.text.color'],
          values_by_mode: {
            light: {
              kind: 'value',
              value: '#111111',
            },
          },
        },
        color_b: {
          id: 'color_b',
          collection_id: 'tokens',
          kind: 'color',
          group_path: [],
          name: 'B',
          scopes: ['node.text.color'],
          values_by_mode: {
            light: {
              kind: 'alias',
              variable_id: 'color_a',
            },
          },
        },
      },
    };

    const result = expectError(
      await runCommands(document, [
        {
          type: 'update_variable',
          variable_id: 'color_a',
          patch: {
            values_by_mode: {
              light: {
                kind: 'alias',
                variable_id: 'color_b',
              },
            },
          },
        },
      ]),
      'unrecoverable_command',
    );

    expect(result.error.command_index).toBe(0);
    expect(result.error.message).toContain('alias cycle');
  });
});
