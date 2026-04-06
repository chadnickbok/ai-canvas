import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadAppMetadata } from "./appMetadata.js";

describe("loadAppMetadata", () => {
  it("reads packaged metadata from the desktop package manifest", () => {
    const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "ai-canvas-app-metadata-"));

    try {
      writeFileSync(
        path.join(tempDirectory, "package.json"),
        JSON.stringify(
          {
            aiCanvasBuild: {
              commitSha: "abc1234",
              releaseChannel: "beta"
            },
            version: "1.2.3"
          },
          null,
          2
        )
      );

      expect(loadAppMetadata(tempDirectory)).toEqual({
        channel: "beta",
        commitSha: "abc1234",
        version: "1.2.3"
      });
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }
  });

  it("falls back to local defaults and optional environment metadata during development", () => {
    const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "ai-canvas-app-metadata-"));

    try {
      expect(
        loadAppMetadata(tempDirectory, {
          AI_CANVAS_COMMIT_SHA: "  def5678  ",
          AI_CANVAS_RELEASE_CHANNEL: "beta"
        })
      ).toEqual({
        channel: "beta",
        commitSha: "def5678",
        version: "0.0.0"
      });
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }
  });
});
