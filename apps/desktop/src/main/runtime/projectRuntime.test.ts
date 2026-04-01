import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RuntimeEvent } from "@ai-canvas/ipc-contract";

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
    const events: RuntimeEvent[] = [];

    runtime.subscribeToEvents((event) => {
      events.push(event);
    });

    const createResult = runtime.createProject("Phase 0 Test");

    expect(createResult.ok).toBe(true);

    const activeProject = runtime.getActiveProject();

    expect(activeProject.ok && activeProject.data?.project.name).toBe("Phase 0 Test");
    expect(activeProject.ok && activeProject.data?.document.document_id.startsWith("doc_")).toBe(true);
    expect(activeProject.ok && activeProject.data?.revision).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      "projects_changed",
      "active_project_changed",
      "runtime_capabilities_changed"
    ]);
    expect(events[0]).toMatchObject({
      type: "projects_changed",
      projects: [{ name: "Phase 0 Test" }]
    });
    expect(events[1]).toMatchObject({
      type: "active_project_changed",
      activeProject: {
        project: { name: "Phase 0 Test" },
        revision: 1
      }
    });
    expect(events[2]).toEqual({
      type: "runtime_capabilities_changed",
      runtimeCapabilities: {
        measurementSurfaceAvailable: false,
        mode: "read_only",
        runtimeState: "editor_open_clean"
      }
    });

    store.close();
  });

  it("reopens a persisted project and leaves the active session untouched on failure", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-runtime-reopen-"));
    cleanupPaths.push(tempDir);

    const firstStore = new ProjectStore(path.join(tempDir, "app.db"));
    const runtime = createProjectRuntime(firstStore);
    const events: RuntimeEvent[] = [];

    runtime.subscribeToEvents((event) => {
      events.push(event);
    });

    const created = runtime.createProject("Persisted Project");

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    events.length = 0;
    const missingResult = runtime.openProject("project_missing");
    expect(missingResult.ok).toBe(false);
    expect(events).toEqual([]);

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
    expect(reopened.data.revision).toBe(1);

    reopenedStore.close();
  });

  it("inspects non-active persisted projects without switching the active session", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-runtime-inspect-"));
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, "app.db"));
    const runtime = createProjectRuntime(store);

    const firstProject = runtime.createProject("First Project");

    if (!firstProject.ok) {
      throw new Error(firstProject.error.message);
    }

    const secondProject = runtime.createProject("Second Project");

    if (!secondProject.ok) {
      throw new Error(secondProject.error.message);
    }

    const inspected = runtime.inspectProject(firstProject.data.id);

    expect(inspected.ok).toBe(true);

    if (!inspected.ok) {
      throw new Error(inspected.error.message);
    }

    expect(inspected.data.project.id).toBe(firstProject.data.id);
    expect(inspected.data.is_active).toBe(false);
    expect(inspected.data.revision).toBe(1);

    const activeProject = runtime.getActiveProject();

    expect(activeProject.ok && activeProject.data?.project.id).toBe(secondProject.data.id);

    store.close();
  });

  it("applies command batches, persists revisions, and emits document_changed", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-runtime-commands-"));
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, "app.db"));
    const runtime = createProjectRuntime(store);
    const events: RuntimeEvent[] = [];

    runtime.subscribeToEvents((event) => {
      events.push(event);
    });

    const created = runtime.createProject("Writable Project");

    if (!created.ok) {
      throw new Error(created.error.message);
    }

    runtime.setMeasurementSurfaceAvailable(true);
    events.length = 0;

    const commandResult = await runtime.applyProjectCommands({
      base_revision: 1,
      commands: [
        {
          type: "create_scene",
          scene: {
            height: 844,
            id: "scene_home",
            left: 40,
            name: "Home",
            top: 60,
            width: 390
          }
        }
      ]
    });

    expect(commandResult.ok).toBe(true);

    if (!commandResult.ok) {
      throw new Error(commandResult.error.message);
    }

    expect(commandResult.data).toEqual({
      document_id: expect.stringMatching(/^doc_/),
      effects: {
        changed_node_ids: ["scene_home"],
        changed_scene_ids: ["scene_home"]
      },
      layout_refresh: {
        reason: "computed_layout_refresh_not_implemented",
        status: "skipped"
      },
      revision: 2
    });

    const activeProject = runtime.getActiveProject();

    expect(activeProject.ok).toBe(true);

    if (!activeProject.ok || !activeProject.data) {
      throw new Error("Expected the active project session to remain available");
    }

    expect(activeProject.data.revision).toBe(2);
    expect(activeProject.data.document.scenes.scene_home).toMatchObject({
      id: "scene_home",
      name: "Home"
    });

    const persistedProject = store.getProject(created.data.id);

    expect(persistedProject?.revision).toBe(2);
    expect(persistedProject?.document.scenes.scene_home).toMatchObject({
      id: "scene_home",
      name: "Home"
    });

    expect(events.map((event) => event.type)).toEqual([
      "projects_changed",
      "active_project_changed",
      "document_changed"
    ]);
    expect(events[2]).toMatchObject({
      type: "document_changed",
      project: {
        id: created.data.id
      },
      revision: 2
    });

    store.close();
  });

  it("emits capability and MCP status events when those values change", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-runtime-status-"));
    cleanupPaths.push(tempDir);

    const store = new ProjectStore(path.join(tempDir, "app.db"));
    const runtime = createProjectRuntime(store);
    const events: RuntimeEvent[] = [];

    runtime.subscribeToEvents((event) => {
      events.push(event);
    });

    runtime.setMeasurementSurfaceAvailable(true);
    runtime.publishMcpStatus({
      connectedSessions: 1,
      enabled: true,
      endpoint: "http://127.0.0.1:9311/mcp",
      errorCode: null,
      errorMessage: null,
      host: "127.0.0.1",
      port: 9311,
      state: "running"
    });

    expect(events).toEqual([
      {
        type: "runtime_capabilities_changed",
        runtimeCapabilities: {
          measurementSurfaceAvailable: true,
          mode: "read_only",
          runtimeState: "no_project_open"
        }
      },
      {
        type: "mcp_status_changed",
        mcpStatus: {
          connectedSessions: 1,
          enabled: true,
          endpoint: "http://127.0.0.1:9311/mcp",
          errorCode: null,
          errorMessage: null,
          host: "127.0.0.1",
          port: 9311,
          state: "running"
        }
      }
    ]);

    store.close();
  });
});
