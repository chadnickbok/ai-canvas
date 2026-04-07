export const CANVAS_ROOT_ID = 'canvas_root';
export const DEFAULT_RENDER_CANON = 'browser-css';
export const DEFAULT_SCHEMA_VERSION = 1;

export const NODE_KINDS = [
  'frame',
  'rectangle',
  'text',
  'svg',
  'svg-visual-element',
] as const;

export const LEAF_NODE_KINDS = [
  'rectangle',
  'text',
  'svg-visual-element',
] as const;
export const CONTAINER_NODE_KINDS = ['frame', 'svg'] as const;

export const CANVAS_SEMANTIC_SLOTS = ['canvas.background_color'] as const;
export const NODE_SEMANTIC_SLOTS = [
  'node.layout.gap',
  'node.layout.padding_top',
  'node.layout.padding_right',
  'node.layout.padding_bottom',
  'node.layout.padding_left',
  'node.paint.background_color',
  'node.paint.opacity',
  'node.shape.border_radius',
  'node.text.color',
  'node.typography.font_family',
  'node.typography.font_size',
  'node.typography.font_weight',
  'node.typography.line_height',
  'node.typography.letter_spacing',
] as const;

export const FRAME_NODE_SEMANTIC_SLOTS = [
  'node.layout.gap',
  'node.layout.padding_top',
  'node.layout.padding_right',
  'node.layout.padding_bottom',
  'node.layout.padding_left',
  'node.paint.background_color',
  'node.paint.opacity',
  'node.shape.border_radius',
] as const;

export const RECTANGLE_NODE_SEMANTIC_SLOTS = [
  'node.paint.background_color',
  'node.paint.opacity',
  'node.shape.border_radius',
] as const;

export const TEXT_NODE_SEMANTIC_SLOTS = [
  'node.text.color',
  'node.typography.font_family',
  'node.typography.font_size',
  'node.typography.font_weight',
  'node.typography.line_height',
  'node.typography.letter_spacing',
] as const;

export const NO_NODE_SEMANTIC_SLOTS = [] as const;

export const RENDERER_SEMANTIC_SLOTS = [
  ...CANVAS_SEMANTIC_SLOTS,
  ...NODE_SEMANTIC_SLOTS,
] as const;

export const STYLE_FAMILIES = ['paint', 'text'] as const;
export const FRAME_NODE_STYLE_FAMILIES = ['paint'] as const;
export const RECTANGLE_NODE_STYLE_FAMILIES = ['paint'] as const;
export const TEXT_NODE_STYLE_FAMILIES = ['text'] as const;
export const NO_NODE_STYLE_FAMILIES = [] as const;
export const VARIABLE_KINDS = [
  'color',
  'radius',
  'spacing',
  'typography',
] as const;
export const ASSET_KINDS = ['image', 'svg', 'unknown'] as const;

export const NODE_KIND_SEMANTIC_SLOTS = {
  frame: FRAME_NODE_SEMANTIC_SLOTS,
  rectangle: RECTANGLE_NODE_SEMANTIC_SLOTS,
  text: TEXT_NODE_SEMANTIC_SLOTS,
  svg: NO_NODE_SEMANTIC_SLOTS,
  'svg-visual-element': NO_NODE_SEMANTIC_SLOTS,
} as const;

export const NODE_KIND_STYLE_FAMILIES = {
  frame: FRAME_NODE_STYLE_FAMILIES,
  rectangle: RECTANGLE_NODE_STYLE_FAMILIES,
  text: TEXT_NODE_STYLE_FAMILIES,
  svg: NO_NODE_STYLE_FAMILIES,
  'svg-visual-element': NO_NODE_STYLE_FAMILIES,
} as const;
