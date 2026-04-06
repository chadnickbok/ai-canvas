export const CANVAS_TOOLS = ["selection", "grab", "frame", "text", "rectangle"] as const;

export type CanvasTool = (typeof CANVAS_TOOLS)[number];

export type CreateCanvasTool = Exclude<CanvasTool, "grab" | "selection">;

export function isCreateCanvasTool(tool: CanvasTool): tool is CreateCanvasTool {
  return tool === "frame" || tool === "text" || tool === "rectangle";
}
