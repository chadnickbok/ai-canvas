import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normalizeDocument } from "../src";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, "../../../fixtures/normalization/empty-document");

describe("normalizeDocument", () => {
  it("normalizes the Phase 0 empty-document fixture", async () => {
    const input = JSON.parse(await readFile(path.join(fixtureDir, "input.json"), "utf8"));
    const expected = JSON.parse(await readFile(path.join(fixtureDir, "expected.json"), "utf8"));

    expect(
      normalizeDocument(input, {
        fallbackDocumentId: "doc_fixture",
        fallbackName: "Fixture Project"
      })
    ).toEqual(expected);
  });
});
