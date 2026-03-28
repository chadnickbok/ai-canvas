import { describe, expect, it } from "vitest";

import { resolveRendererLoadTarget } from "./resolveRendererLoadTarget.js";

describe("resolveRendererLoadTarget", () => {
  it("prefers the electron-vite renderer URL", () => {
    expect(
      resolveRendererLoadTarget(
        {
          ELECTRON_RENDERER_URL: "http://localhost:5173",
          NODE_ENV_ELECTRON_VITE: "development",
          VITE_DEV_SERVER_URL: "http://localhost:4173"
        },
        "/tmp/index.html"
      )
    ).toEqual({
      kind: "url",
      value: "http://localhost:5173"
    });
  });

  it("accepts the legacy Vite dev server URL", () => {
    expect(
      resolveRendererLoadTarget(
        {
          NODE_ENV_ELECTRON_VITE: "development",
          VITE_DEV_SERVER_URL: "http://localhost:4173"
        },
        "/tmp/index.html"
      )
    ).toEqual({
      kind: "url",
      value: "http://localhost:4173"
    });
  });

  it("throws instead of silently loading stale files during dev", () => {
    expect(() =>
      resolveRendererLoadTarget(
        {
          NODE_ENV_ELECTRON_VITE: "development"
        },
        "/tmp/index.html"
      )
    ).toThrow("Renderer dev server URL missing");
  });

  it("falls back to the built renderer outside dev", () => {
    expect(resolveRendererLoadTarget({}, "/tmp/index.html")).toEqual({
      kind: "file",
      value: "/tmp/index.html"
    });
  });
});
