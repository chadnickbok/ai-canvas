import { describe, expect, it } from "vitest";

import {
  sanitizeSvgAttributeBag,
  sanitizeSvgDefinitionsMarkup,
  sanitizeSvgElementName
} from "../src/rendering/svgSanitization.js";

describe("svg sanitization helpers", () => {
  it("removes blocked SVG attributes while preserving safe ones", () => {
    expect(
      sanitizeSvgAttributeBag({
        fill: "#111111",
        href: "javascript:alert(1)",
        onload: "alert(1)",
        viewBox: "0 0 24 24"
      })
    ).toEqual({
      fill: "#111111",
      viewBox: "0 0 24 24"
    });
  });

  it("normalizes allowed element names and rejects blocked or invalid ones", () => {
    expect(sanitizeSvgElementName("LinearGradient")).toBe("lineargradient");
    expect(sanitizeSvgElementName("script")).toBeNull();
    expect(sanitizeSvgElementName("bad name")).toBeNull();
  });

  it("removes unsafe definitions markup and preserves safe SVG content", () => {
    const sanitized = sanitizeSvgDefinitionsMarkup(
      '<linearGradient id="hero"><stop offset="0%" stop-color="#fff" /></linearGradient><script>alert(1)</script><foreignObject>bad</foreignObject><pattern onload="alert(1)"></pattern>'
    );

    expect(sanitized).toContain("linearGradient");
    expect(sanitized).toContain('id="hero"');
    expect(sanitized).toContain("<pattern");
    expect(sanitized).not.toContain("script");
    expect(sanitized).not.toContain("foreignObject");
    expect(sanitized).not.toContain("onload");
  });

  it("drops malformed definitions markup", () => {
    expect(sanitizeSvgDefinitionsMarkup("<linearGradient><stop></linearGradientX>")).toBe("");
  });
});
