import { describe, expect, it } from 'vitest';

import {
  CANVAS_ROOT_ID,
  collectSubtreeIds,
  getChildren,
  getScene,
  isContainerNode,
  isLeafNode,
  normalizeDocument,
  safeParseDocument,
} from '../src';

function createCanonicalDocumentWithNode(node: Record<string, unknown>) {
  return {
    schema_version: 1 as const,
    render_canon: 'browser-css' as const,
    document_id: 'doc_canonical',
    name: 'Canonical',
    page_name: 'Page 1',
    source: {
      kind: 'ai-canvas' as const,
    },
    canvas: {
      extent_mode: 'infinite' as const,
      authoring: {
        local_values: {},
        variable_bindings: {},
      },
    },
    root: {
      id: CANVAS_ROOT_ID,
      child_ids: ['node_1'],
    },
    scenes: {},
    nodes: {
      node_1: node,
    },
    assets: {},
    variables: {
      collections: {},
    },
    styles: {
      paint: {},
      text: {},
    },
  };
}

describe('document-core structural model', () => {
  it('repairs structure, preserves typed payloads, and keeps computed layout optional', () => {
    const document = normalizeDocument(
      {
        schema_version: 1,
        render_canon: 'browser-css',
        document_id: 'doc_structural',
        name: 'Structural Fixture',
        canvas: {
          extent_mode: 'infinite',
          authoring: {
            local_values: {
              'canvas.background_color': '#ffffff',
              'bad.slot': 'ignore-me',
            },
            variable_bindings: {
              'canvas.background_color': 'var_canvas',
              bad: 'ignore-me',
            },
          },
        },
        root: {
          id: CANVAS_ROOT_ID,
          child_ids: [
            'scene_home',
            'missing_top',
            'rect_leaf',
            'scene_home',
            'legacy_text',
          ],
        },
        scenes: {
          scene_home: {
            name: 'Home',
            frame_node_id: 'wrong_id',
            child_count: 999,
            scene_metadata: {
              group: 'main',
              tags: ['hero', 'hero'],
            },
          },
          scene_orphan: {
            name: 'Orphan',
            scene_metadata: {
              tags: ['drop-me'],
            },
          },
        },
        nodes: {
          scene_home: {
            id: 'wrong-scene-id',
            kind: 'frame',
            name: 'Scene Home',
            parent_id: 'missing_parent',
            child_ids: ['legacy_text', 'ghost_child', 'legacy_text'],
            scene_id: 'stale_scene_id',
            render_style: {
              left: 100,
              top: 200,
              width: '800px',
              height: '600px',
            },
            computed_layout: {
              left: 100,
              top: 200,
              width: 800,
              height: 600,
            },
            authoring: {
              local_values: {
                'node.layout.gap': 24,
                'node.text.color': '#444444',
                'bad.slot': 'ignore-me',
              },
              variable_bindings: {
                'node.paint.background_color': 'var_surface',
                'node.text.color': 'var_text',
                'bad.slot': 'ignore-me',
              },
              style_bindings: {
                paint: 'paint_card',
                text: 'text_body',
                bad: 'ignore-me',
              },
            },
          },
          legacy_text: {
            kind: 'text',
            name: 'Title',
            parent_id: 'scene_home',
            child_ids: ['nested_should_detach'],
            render_style: {
              color: '#111111',
              backgroundImage: 'url(asset://missing_asset)',
            },
            computed_layout: {
              left: 120,
              top: 230,
              width: 320,
              height: 48,
            },
            authoring: {
              local_values: {
                'node.text.color': '#222222',
                'node.paint.background_color': '#ff00ff',
              },
              variable_bindings: {
                'node.text.color': 'var_body',
                'node.paint.background_color': 'var_invalid',
              },
              style_bindings: {
                text: 'text_body',
                paint: 'paint_card',
              },
            },
            text_content: 'Hello world',
          },
          nested_should_detach: {
            kind: 'text',
            name: 'Detached Child',
            parent_id: 'legacy_text',
            render_style: {},
            text: {
              content: 'Detached',
            },
          },
          rect_leaf: {
            kind: 'rectangle',
            name: 'Card',
            parent_id: null,
            child_ids: ['primitive_bad_parent'],
            render_style: {
              backgroundImage: 'url(asset://asset_present)',
            },
            authoring: {
              local_values: {
                'node.paint.opacity': 0.8,
                'node.layout.gap': 8,
              },
              variable_bindings: {
                'node.paint.opacity': 'var_opacity',
                'node.layout.gap': 'var_gap',
              },
              style_bindings: {
                paint: 'paint_card',
                text: 'text_body',
              },
            },
          },
          primitive_bad_parent: {
            kind: 'svg-visual-element',
            name: 'Loose Primitive',
            parent_id: 'rect_leaf',
            svg_primitive: {
              element_name: 'path',
              order: 2,
              attributes: {
                d: 'M0 0',
              },
            },
          },
          svg_root: {
            kind: 'svg',
            name: 'Icon',
            parent_id: null,
            child_ids: ['svg_child'],
            svg: {
              view_box: '0 0 10 10',
              raw_root_attributes: {
                fill: 'none',
              },
            },
            authoring: {
              local_values: {
                'node.text.color': '#ffffff',
              },
              variable_bindings: {
                'node.text.color': 'var_svg',
              },
              style_bindings: {
                text: 'text_body',
              },
            },
          },
          svg_child: {
            kind: 'svg-visual-element',
            name: 'Path',
            parent_id: 'svg_root',
            svg_primitive: {
              element_name: 'path',
              order: 1,
              attributes: {
                d: 'M0 0',
              },
            },
          },
          cycle_a: {
            kind: 'frame',
            name: 'Cycle A',
            parent_id: 'cycle_b',
            child_ids: ['cycle_b'],
          },
          cycle_b: {
            kind: 'frame',
            name: 'Cycle B',
            parent_id: 'cycle_a',
            child_ids: ['cycle_a'],
          },
        },
        assets: {
          asset_present: {
            kind: 'image',
            mime_type: 'image/png',
            source: {
              kind: 'asset_store',
              content_hash: 'hash123',
            },
          },
        },
        variables: {
          collections: {
            colors: {
              name: 'Colors',
              default_mode_id: 'light',
              modes: {
                light: {
                  name: 'Light',
                },
                dark: {
                  id: 'dark',
                  name: 'Dark',
                },
              },
              variables: {
                surface: {
                  kind: 'color',
                  name: 'Surface',
                  scopes: ['node.paint.background_color', 'bad.scope'],
                  values_by_mode: {
                    light: {
                      kind: 'value',
                      value: '#ffffff',
                    },
                    dark: {
                      kind: 'alias',
                      variable_id: 'other',
                    },
                  },
                },
              },
            },
          },
        },
        styles: {
          paint: {
            paint_card: {
              name: 'Card Paint',
              slots: {
                'node.paint.background_color': {
                  kind: 'value',
                  value: '#ffffff',
                },
                'node.paint.opacity': {
                  kind: 'value',
                  value: 0.95,
                },
                'bad.slot': {
                  kind: 'value',
                  value: '#000000',
                },
              },
            },
          },
          text: {
            text_body: {
              name: 'Body',
              slots: {
                'node.text.color': {
                  kind: 'value',
                  value: '#222222',
                },
                'node.typography.font_size': {
                  kind: 'value',
                  value: 16,
                },
              },
            },
          },
        },
      },
      {
        fallbackDocumentId: 'doc_structural',
        fallbackName: 'Structural Fixture',
      },
    );

    expect(document.page_name).toBe('Page 1');
    expect(document.root.child_ids).toEqual([
      'scene_home',
      'rect_leaf',
      'nested_should_detach',
      'svg_root',
      'cycle_b',
    ]);

    expect(document.canvas.authoring).toEqual({
      local_values: {
        'canvas.background_color': '#ffffff',
      },
      variable_bindings: {},
    });
    expect(document.canvas.background_color).toBe('#ffffff');

    expect(document.scenes).toEqual({
      scene_home: {
        id: 'scene_home',
        frame_node_id: 'scene_home',
        name: 'Home',
        child_count: 1,
        scene_metadata: {
          group: 'main',
          tags: ['hero'],
        },
      },
    });

    expect(document.nodes.scene_home).toMatchObject({
      id: 'scene_home',
      kind: 'frame',
      parent_id: null,
      child_ids: ['legacy_text'],
      scene_id: 'scene_home',
      computed_layout: {
        x: 100,
        y: 200,
        width: 800,
        height: 600,
      },
      authoring: {
        local_values: {
          'node.layout.gap': 24,
        },
        variable_bindings: {},
        style_bindings: {
          paint: 'paint_card',
        },
      },
    });
    expect(document.nodes.scene_home.render_style).toEqual({
      left: 100,
      top: 200,
      width: '800px',
      height: '600px',
      gap: 24,
      backgroundColor: '#ffffff',
      opacity: 0.95,
    });

    expect(document.nodes.legacy_text).toMatchObject({
      kind: 'text',
      parent_id: 'scene_home',
      child_ids: [],
      scene_id: 'scene_home',
      computed_layout: {
        x: 120,
        y: 230,
        width: 320,
        height: 48,
      },
      text: {
        content: 'Hello world',
      },
    });
    expect(document.nodes.legacy_text.render_style).toEqual({
      color: '#222222',
      fontSize: 16,
    });
    expect(document.nodes.legacy_text.authoring).toEqual({
      local_values: {
        'node.text.color': '#222222',
      },
      variable_bindings: {},
      style_bindings: {
        text: 'text_body',
      },
    });

    expect(document.nodes.nested_should_detach.parent_id).toBeNull();
    expect(document.nodes.nested_should_detach.scene_id).toBeNull();
    expect(document.nodes.primitive_bad_parent).toBeUndefined();
    expect(document.nodes.rect_leaf.authoring).toEqual({
      local_values: {
        'node.paint.opacity': 0.8,
      },
      variable_bindings: {},
      style_bindings: {
        paint: 'paint_card',
      },
    });
    expect(document.nodes.rect_leaf.render_style).toEqual({
      backgroundImage: 'url(asset://asset_present)',
      backgroundColor: '#ffffff',
      opacity: 0.8,
    });
    expect(document.nodes.svg_root.authoring).toEqual({
      local_values: {},
      variable_bindings: {},
      style_bindings: {},
    });
    expect(document.nodes.svg_child.parent_id).toBe('svg_root');
    expect(document.nodes.svg_child.scene_id).toBeNull();
    expect(document.nodes.cycle_b.parent_id).toBeNull();
    expect(document.nodes.cycle_b.child_ids).toEqual(['cycle_a']);
    expect(document.nodes.cycle_a.parent_id).toBe('cycle_b');

    expect(document.assets).toEqual({
      asset_present: {
        id: 'asset_present',
        kind: 'image',
        mime_type: 'image/png',
        source: {
          kind: 'asset_store',
          content_hash: 'hash123',
        },
      },
    });

    expect(document.variables.collections.colors).toEqual({
      id: 'colors',
      name: 'Colors',
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
      variables: {
        surface: {
          id: 'surface',
          collection_id: 'colors',
          kind: 'color',
          group_path: [],
          name: 'Surface',
          scopes: ['node.paint.background_color'],
          values_by_mode: {
            light: {
              kind: 'value',
              value: '#ffffff',
            },
            dark: {
              kind: 'alias',
              variable_id: 'other',
            },
          },
        },
      },
    });

    expect(document.styles).toEqual({
      paint: {
        paint_card: {
          id: 'paint_card',
          name: 'Card Paint',
          slots: {
            'node.paint.background_color': {
              kind: 'value',
              value: '#ffffff',
            },
            'node.paint.opacity': {
              kind: 'value',
              value: 0.95,
            },
          },
        },
      },
      text: {
        text_body: {
          id: 'text_body',
          name: 'Body',
          slots: {
            'node.text.color': {
              kind: 'value',
              value: '#222222',
            },
            'node.typography.font_size': {
              kind: 'value',
              value: 16,
            },
          },
        },
      },
    });

    expect(getScene(document, 'scene_home')?.child_count).toBe(1);
    expect(getChildren(document, 'scene_home').map((node) => node.id)).toEqual([
      'legacy_text',
    ]);
    expect(collectSubtreeIds(document, 'scene_home')).toEqual([
      'scene_home',
      'legacy_text',
    ]);
    expect(isContainerNode(document.nodes.scene_home)).toBe(true);
    expect(isLeafNode(document.nodes.legacy_text)).toBe(true);
  });

  it('drops detached svg primitives during normalization', () => {
    const document = normalizeDocument(
      {
        schema_version: 1,
        render_canon: 'browser-css',
        document_id: 'doc_svg_primitives',
        name: 'SVG Primitive Repairs',
        root: {
          id: CANVAS_ROOT_ID,
          child_ids: ['primitive_top_level', 'frame_1', 'svg_root'],
        },
        nodes: {
          primitive_top_level: {
            kind: 'svg-visual-element',
            name: 'Top Level Primitive',
            parent_id: null,
            svg_primitive: {
              element_name: 'path',
              order: 0,
              attributes: {
                d: 'M0 0',
              },
            },
          },
          primitive_missing_parent: {
            kind: 'svg-visual-element',
            name: 'Missing Parent Primitive',
            parent_id: 'missing_svg_parent',
            svg_primitive: {
              element_name: 'circle',
              order: 1,
              attributes: {
                cx: 5,
                cy: 5,
                r: 5,
              },
            },
          },
          frame_1: {
            kind: 'frame',
            name: 'Frame',
            parent_id: null,
            child_ids: ['primitive_under_frame'],
          },
          primitive_under_frame: {
            kind: 'svg-visual-element',
            name: 'Primitive Under Frame',
            parent_id: 'frame_1',
            svg_primitive: {
              element_name: 'rect',
              order: 2,
              attributes: {
                width: 10,
                height: 10,
              },
            },
          },
          svg_root: {
            kind: 'svg',
            name: 'Valid SVG',
            parent_id: null,
            child_ids: ['svg_child'],
            svg: {
              view_box: '0 0 10 10',
            },
          },
          svg_child: {
            kind: 'svg-visual-element',
            name: 'Valid Child',
            parent_id: 'svg_root',
            svg_primitive: {
              element_name: 'path',
              order: 3,
              attributes: {
                d: 'M1 1',
              },
            },
          },
        },
      },
      {
        fallbackDocumentId: 'doc_svg_primitives',
        fallbackName: 'SVG Primitive Repairs',
      },
    );

    expect(document.root.child_ids).toEqual(['frame_1', 'svg_root']);
    expect(document.nodes.primitive_top_level).toBeUndefined();
    expect(document.nodes.primitive_missing_parent).toBeUndefined();
    expect(document.nodes.primitive_under_frame).toBeUndefined();
    expect(document.nodes.frame_1.child_ids).toEqual([]);
    expect(document.nodes.svg_root.child_ids).toEqual(['svg_child']);
    expect(document.nodes.svg_child.parent_id).toBe('svg_root');
  });

  it('rejects canonical documents with semantically illegal node authoring', () => {
    expect(
      safeParseDocument(
        createCanonicalDocumentWithNode({
          id: 'node_1',
          kind: 'text',
          name: 'Title',
          parent_id: null,
          child_ids: [],
          scene_id: null,
          is_visible: true,
          is_locked: false,
          render_style: {},
          authoring: {
            local_values: {
              'node.paint.background_color': '#ffffff',
            },
            variable_bindings: {},
            style_bindings: {},
          },
          text: {
            content: 'Hello',
          },
        }),
      ).success,
    ).toBe(false);

    expect(
      safeParseDocument(
        createCanonicalDocumentWithNode({
          id: 'node_1',
          kind: 'frame',
          name: 'Frame',
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
        }),
      ).success,
    ).toBe(false);

    expect(
      safeParseDocument(
        createCanonicalDocumentWithNode({
          id: 'node_1',
          kind: 'svg',
          name: 'Icon',
          parent_id: null,
          child_ids: [],
          scene_id: null,
          is_visible: true,
          is_locked: false,
          render_style: {},
          authoring: {
            local_values: {
              'node.text.color': '#ffffff',
            },
            variable_bindings: {},
            style_bindings: {},
          },
          svg: {},
        }),
      ).success,
    ).toBe(false);
  });

  it('accepts canonical typed documents and rejects legacy-only node payloads', () => {
    const canonicalDocument = createCanonicalDocumentWithNode({
      id: 'node_1',
      kind: 'text',
      name: 'Title',
      parent_id: null,
      child_ids: [],
      scene_id: null,
      is_visible: true,
      is_locked: false,
      render_style: {},
      authoring: {
        local_values: {},
        variable_bindings: {},
        style_bindings: {},
      },
      text: {
        content: 'Hello',
      },
    });

    expect(safeParseDocument(canonicalDocument).success).toBe(true);

    const legacyNode = {
      ...canonicalDocument.nodes.node_1,
      computed_layout: {
        left: 0,
        top: 0,
        width: 100,
        height: 20,
      },
      text_content: 'Hello',
    } as Record<string, unknown>;

    delete legacyNode.text;

    expect(
      safeParseDocument({
        ...canonicalDocument,
        nodes: {
          node_1: legacyNode,
        },
      }).success,
    ).toBe(false);
  });
});
