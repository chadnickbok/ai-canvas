import {
  type FrameNode,
  type RendererDocument,
  type RendererNode,
  type SvgNode,
  type SvgVisualElementNode,
  type TextNode
} from "@ai-canvas/document-core";
import {
  createElement,
  forwardRef,
  type ReactNode,
  useImperativeHandle,
  useRef,
  useState
} from "react";

import { measureRenderedSubtrees } from "./measurement.js";
import { buildRenderStyle } from "./styleUtils.js";
import {
  sanitizeSvgAttributeBag,
  sanitizeSvgDefinitionsMarkup,
  sanitizeSvgElementName
} from "./svgSanitization.js";
import type {
  RendererMeasurementHandle,
  ResolvedAssetsById
} from "./types.js";

export type DocumentRendererProps = {
  className?: string;
  document: RendererDocument;
  resolvedAssetsById: ResolvedAssetsById;
  viewportZoom?: number;
};

type RenderContext = {
  document: RendererDocument;
  registerNodeElement: (nodeId: string, element: Element | null) => void;
  resolvedAssetsById: ResolvedAssetsById;
};

type RenderNodeOptions = {
  inSvg: boolean;
  isTopLevel: boolean;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function createNodeRef(
  context: RenderContext,
  nodeId: string
): (element: Element | null) => void {
  return (element) => {
    context.registerNodeElement(nodeId, element);
  };
}

function createSvgPrimitiveFallback(
  node: SvgVisualElementNode,
  context: RenderContext
): ReactNode {
  return (
    <g
      data-node-id={node.id}
      data-node-kind={node.kind}
      data-render-fallback="svg-primitive"
      key={node.id}
      ref={createNodeRef(context, node.id)}
    >
      <rect
        fill="rgba(243, 244, 246, 0.96)"
        height="24"
        rx="4"
        stroke="#9ca3af"
        strokeDasharray="4 2"
        width="24"
        x="0"
        y="0"
      />
      <text fill="#6b7280" fontSize="7" x="4" y="14">
        svg
      </text>
    </g>
  );
}

function renderSvgVisualElementNode(
  node: SvgVisualElementNode,
  context: RenderContext,
  options: RenderNodeOptions
): ReactNode {
  if (!options.inSvg) {
    const fallbackStyle = buildRenderStyle(node.render_style, {
      isHtmlBox: true,
      isLeaf: true,
      isTopLevel: options.isTopLevel,
      resolvedAssetsById: context.resolvedAssetsById
    });

    return (
      <div
        data-node-id={node.id}
        data-node-kind={node.kind}
        data-render-fallback="svg-primitive"
        key={node.id}
        ref={createNodeRef(context, node.id)}
        style={{
          alignItems: "center",
          backgroundColor: "rgba(243, 244, 246, 0.96)",
          border: "1px dashed #9ca3af",
          color: "#6b7280",
          display: "flex",
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 10,
          height: fallbackStyle.height ?? 24,
          justifyContent: "center",
          overflow: "hidden",
          width: fallbackStyle.width ?? 24,
          ...fallbackStyle
        }}
      >
        svg
      </div>
    );
  }

  const elementName = sanitizeSvgElementName(node.svg_primitive.element_name);

  if (!elementName) {
    return createSvgPrimitiveFallback(node, context);
  }

  return createElement(elementName, {
    ...sanitizeSvgAttributeBag(node.svg_primitive.attributes),
    "data-node-id": node.id,
    "data-node-kind": node.kind,
    key: node.id,
    ref: createNodeRef(context, node.id)
  });
}

function renderSvgNode(
  node: SvgNode,
  context: RenderContext,
  options: RenderNodeOptions
): ReactNode {
  const sanitizedDefinitions = (node.svg.definitions ?? [])
    .map((definition: NonNullable<SvgNode["svg"]["definitions"]>[number]) =>
      sanitizeSvgDefinitionsMarkup(definition.markup)
    )
    .filter((markup: string) => markup.length > 0)
    .join("");

  const childNodes = node.child_ids
    .map((childId: string) => context.document.nodes[childId])
    .filter((childNode: RendererNode | undefined): childNode is RendererNode => childNode !== undefined);

  const shouldSortPrimitivesOnly = childNodes.every(
    (childNode) => childNode.kind === "svg-visual-element"
  );

  const orderedChildNodes = shouldSortPrimitivesOnly
    ? [...childNodes].sort((left, right) => {
        if (left.kind !== "svg-visual-element" || right.kind !== "svg-visual-element") {
          return 0;
        }

        return left.svg_primitive.order - right.svg_primitive.order;
      })
    : childNodes;

  return (
    <svg
      {...sanitizeSvgAttributeBag(node.svg.raw_root_attributes ?? {})}
      data-node-id={node.id}
      data-node-kind={node.kind}
      key={node.id}
      preserveAspectRatio={node.svg.preserve_aspect_ratio}
      ref={createNodeRef(context, node.id)}
      style={buildRenderStyle(node.render_style, {
        isHtmlBox: false,
        isLeaf: false,
        isTopLevel: options.isTopLevel,
        resolvedAssetsById: context.resolvedAssetsById
      })}
      viewBox={node.svg.view_box}
    >
      {sanitizedDefinitions ? (
        <defs dangerouslySetInnerHTML={{ __html: sanitizedDefinitions }} />
      ) : null}
      {orderedChildNodes.map((childNode: RendererNode) =>
        renderNode(childNode, context, {
          inSvg: true,
          isTopLevel: false
        })
      )}
    </svg>
  );
}

function renderTextNode(
  node: TextNode,
  context: RenderContext,
  options: RenderNodeOptions
): ReactNode {
  return (
    <div
      data-node-id={node.id}
      data-node-kind={node.kind}
      key={node.id}
      ref={createNodeRef(context, node.id)}
      style={buildRenderStyle(node.render_style, {
        isHtmlBox: true,
        isLeaf: true,
        isTopLevel: options.isTopLevel,
        resolvedAssetsById: context.resolvedAssetsById
      })}
    >
      {node.text.content}
    </div>
  );
}

function renderFrameNode(
  node: FrameNode,
  context: RenderContext,
  options: RenderNodeOptions
): ReactNode {
  return (
    <div
      data-node-id={node.id}
      data-node-kind={node.kind}
      data-scene-root={node.scene_id === node.id ? "true" : undefined}
      key={node.id}
      ref={createNodeRef(context, node.id)}
      style={buildRenderStyle(node.render_style, {
        isHtmlBox: true,
        isLeaf: false,
        isTopLevel: options.isTopLevel,
        resolvedAssetsById: context.resolvedAssetsById
      })}
    >
      {node.child_ids.map((childId) => {
        const childNode = context.document.nodes[childId];

        if (!childNode) {
          return null;
        }

        return renderNode(childNode, context, {
          inSvg: false,
          isTopLevel: false
        });
      })}
    </div>
  );
}

function renderRectangleNode(
  node: RendererNode,
  context: RenderContext,
  options: RenderNodeOptions
): ReactNode {
  return (
    <div
      data-node-id={node.id}
      data-node-kind={node.kind}
      key={node.id}
      ref={createNodeRef(context, node.id)}
      style={buildRenderStyle(node.render_style, {
        isHtmlBox: true,
        isLeaf: true,
        isTopLevel: options.isTopLevel,
        resolvedAssetsById: context.resolvedAssetsById
      })}
    />
  );
}

function renderNode(
  node: RendererNode,
  context: RenderContext,
  options: RenderNodeOptions
): ReactNode {
  if (!node.is_visible) {
    return null;
  }

  switch (node.kind) {
    case "frame":
      return renderFrameNode(node, context, options);
    case "rectangle":
      return renderRectangleNode(node, context, options);
    case "text":
      return renderTextNode(node, context, options);
    case "svg":
      return renderSvgNode(node, context, options);
    case "svg-visual-element":
      return renderSvgVisualElementNode(node, context, options);
  }
}

export const DocumentRenderer = forwardRef<RendererMeasurementHandle, DocumentRendererProps>(
  function DocumentRenderer(
    { className, document, resolvedAssetsById, viewportZoom = 1 },
    ref
  ) {
    const rootElementRef = useRef<HTMLDivElement | null>(null);
    const [nodeElementsById] = useState(() => new Map<string, Element>());

    useImperativeHandle(
      ref,
      () => ({
        getNodeElement: (nodeId) => nodeElementsById.get(nodeId) ?? null,
        getRootElement: () => rootElementRef.current,
        measureSubtrees: ({ rootIds }) =>
          measureRenderedSubtrees({
            document,
            nodeElementsById,
            rootElement: rootElementRef.current,
            rootIds,
            zoom: viewportZoom
          })
      }),
      [document, nodeElementsById, viewportZoom]
    );

    const context: RenderContext = {
      document,
      registerNodeElement: (nodeId, element) => {
        if (!element) {
          nodeElementsById.delete(nodeId);
          return;
        }

        nodeElementsById.set(nodeId, element);
      },
      resolvedAssetsById
    };

    return (
      <div
        className={cn(className)}
        data-document-id={document.document_id}
        data-renderer-root="true"
        ref={rootElementRef}
        style={{
          backgroundColor: document.canvas.background_color ?? "transparent",
          height: "100%",
          minHeight: "100%",
          minWidth: "100%",
          overflow: "visible",
          position: "relative",
          width: "100%"
        }}
      >
        {document.root.child_ids.map((childId) => {
          const scene = document.scenes[childId];

          if (scene) {
            const sceneFrameNode = document.nodes[scene.id];

            if (!sceneFrameNode || sceneFrameNode.kind !== "frame") {
              return null;
            }

            return renderNode(sceneFrameNode, context, {
              inSvg: false,
              isTopLevel: true
            });
          }

          const looseTopLevelNode = document.nodes[childId];

          if (!looseTopLevelNode || looseTopLevelNode.parent_id !== null) {
            return null;
          }

          return renderNode(looseTopLevelNode, context, {
            inSvg: false,
            isTopLevel: true
          });
        })}
      </div>
    );
  }
);
