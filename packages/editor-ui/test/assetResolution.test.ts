import { describe, expect, it } from "vitest";

import { resolveBackgroundImageValue } from "../src/rendering/assetResolution.js";

describe("asset resolution helpers", () => {
  it("rewrites asset-backed background images and degrades missing assets to none", () => {
    const resolved = resolveBackgroundImageValue(
      "linear-gradient(#fff, #000), url(asset://hero), url(\"asset://missing\"), url('asset://logo')",
      {
        hero: {
          url: "https://cdn.example.test/hero.png"
        },
        logo: {
          url: "https://cdn.example.test/logo.svg"
        }
      }
    );

    expect(resolved).toContain("linear-gradient(#fff, #000)");
    expect(resolved).toContain('url("https://cdn.example.test/hero.png")');
    expect(resolved).toContain('url("https://cdn.example.test/logo.svg")');
    expect(resolved).toContain("none");
  });

  it("leaves non-asset background images unchanged", () => {
    const resolved = resolveBackgroundImageValue(
      "url(https://cdn.example.test/already-resolved.png)",
      {}
    );

    expect(resolved).toBe("url(https://cdn.example.test/already-resolved.png)");
  });
});
