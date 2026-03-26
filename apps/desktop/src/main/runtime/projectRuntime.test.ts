import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createProjectRuntime } from "./projectRuntime";
import { ProjectStore } from "./projectStore";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((entry) => rm(entry, { force: true, recursive: true })));
});

describe("ProjectRuntime", () => {
  it("creates a project and makes it the active session", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-runtime-"));
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, "app.db"));
    const runtime = createProjectRuntime(store);
    const createResult = runtime.createProject("Phase 0 Test");

    expect(createResult.ok).toBe(true);

    const activeProject = runtime.getActiveProject();

    expect(activeProject.ok && activeProject.data?.project.name).toBe("Phase 0 Test");
    expect(activeProject.ok && activeProject.data?.document.document_id.startsWith("doc_")).toBe(true);

    store.close();
  });

  it("reopens a persisted project and leaves the active session untouched on failure", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-runtime-reopen-"));
    cleanupPaths.push(tempDir);

    const firstStore = new ProjectStore(path.join(tempDir, "app.db"));
    const runtime = createProjectRuntime(firstStore);
    const created = runtime.createProject("Persisted Project");

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const missingResult = runtime.openProject("project_missing");
    expect(missingResult.ok).toBe(false);

    const activeAfterFailure = runtime.getActiveProject();
    expect(activeAfterFailure.ok).toBe(true);

    if (!activeAfterFailure.ok || !activeAfterFailure.data) {
      throw new Error("Expected an active project session after the failed reopen");
    }

    expect(activeAfterFailure.data.project.id).toBe(created.data.id);

    firstStore.close();

    const reopenedStore = new ProjectStore(path.join(tempDir, "app.db"));
    const reopenedRuntime = createProjectRuntime(reopenedStore);
    const reopened = reopenedRuntime.openProject(created.data.id);

    expect(reopened.ok).toBe(true);

    if (!reopened.ok) {
      throw new Error(reopened.error.message);
    }

    expect(reopened.data.project.name).toBe("Persisted Project");
    expect(reopened.data.document.name).toBe("Persisted Project");

    reopenedStore.close();
  });
});
