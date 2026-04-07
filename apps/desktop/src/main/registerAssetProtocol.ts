import { pathToFileURL } from "node:url";

import { net, protocol } from "electron";

import { DESKTOP_ASSET_PROTOCOL } from "./runtime/assetStorage.js";
import type { ProjectStore } from "./runtime/projectStore.js";

export function registerAssetProtocol(projectStore: ProjectStore): void {
  protocol.handle(DESKTOP_ASSET_PROTOCOL, (request) => {
    const parsedUrl = new URL(request.url);

    if (parsedUrl.host !== "project") {
      return new Response("Invalid asset URL", { status: 400 });
    }

    const [projectId, assetId] = parsedUrl.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    if (!projectId || !assetId) {
      return new Response("Invalid asset URL", { status: 400 });
    }

    const assetFilePath = projectStore.resolveAssetFilePath(projectId, assetId);

    if (!assetFilePath) {
      return new Response("Asset not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(assetFilePath).href);
  });
}
