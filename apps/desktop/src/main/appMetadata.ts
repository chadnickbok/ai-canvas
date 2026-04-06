import { readFileSync } from "node:fs";
import path from "node:path";

import sourcePackageJson from "../../package.json";

import { appMetadataSchema, type AppMetadata, type AppReleaseChannel } from "@ai-canvas/ipc-contract";

type DesktopPackageManifest = {
  aiCanvasBuild?: {
    commitSha?: unknown;
    releaseChannel?: unknown;
  };
  version?: unknown;
};

function normalizeCommitSha(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeReleaseChannel(value: unknown): AppReleaseChannel {
  return value === "beta" ? "beta" : "latest";
}

function normalizeVersion(value: unknown): string {
  if (typeof value !== "string") {
    return typeof sourcePackageJson.version === "string" ? sourcePackageJson.version : "0.0.0";
  }

  const trimmed = value.trim();
  return trimmed.length > 0
    ? trimmed
    : typeof sourcePackageJson.version === "string"
      ? sourcePackageJson.version
      : "0.0.0";
}

function readDesktopPackageManifest(appPath: string): DesktopPackageManifest {
  try {
    const packageJsonPath = path.join(appPath, "package.json");
    const source = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(source) as DesktopPackageManifest;

    return parsed;
  } catch {
    return {};
  }
}

export function loadAppMetadata(
  appPath: string,
  env: NodeJS.ProcessEnv = process.env
): AppMetadata {
  const manifest = readDesktopPackageManifest(appPath);
  const buildMetadata = manifest.aiCanvasBuild;

  return appMetadataSchema.parse({
    channel: normalizeReleaseChannel(buildMetadata?.releaseChannel ?? env.AI_CANVAS_RELEASE_CHANNEL),
    commitSha: normalizeCommitSha(buildMetadata?.commitSha ?? env.AI_CANVAS_COMMIT_SHA),
    version: normalizeVersion(manifest.version)
  });
}
