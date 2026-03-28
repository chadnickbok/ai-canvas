export type RendererLoadTarget =
  | {
      kind: "url";
      value: string;
    }
  | {
      kind: "file";
      value: string;
    };

export function resolveRendererLoadTarget(
  env: NodeJS.ProcessEnv,
  rendererIndexPath: string
): RendererLoadTarget {
  const devServerUrl = env.ELECTRON_RENDERER_URL ?? env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    return {
      kind: "url",
      value: devServerUrl
    };
  }

  if (env.NODE_ENV_ELECTRON_VITE === "development") {
    throw new Error(
      "Renderer dev server URL missing. Expected ELECTRON_RENDERER_URL during electron-vite development."
    );
  }

  return {
    kind: "file",
    value: rendererIndexPath
  };
}
