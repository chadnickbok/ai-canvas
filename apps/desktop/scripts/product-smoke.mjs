#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import electronPath from 'electron';
import { _electron as electron } from 'playwright-core';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopDir, '../..');

const UI_FILL_COLOR = '#2563eb';
const UI_FILL_COLOR_RGB = 'rgb(37, 99, 235)';
const MCP_FILL_COLOR = '#14b8a6';
const MCP_FILL_COLOR_RGB = 'rgb(20, 184, 166)';
const MCP_WIDTH = 188;

async function main() {
  const { values } = parseArgs({
    args: normalizeScriptArgs(process.argv.slice(2)),
    options: {
      'keep-temp': {
        default: false,
        type: 'boolean',
      },
      'skip-build': {
        default: false,
        type: 'boolean',
      },
    },
  });

  assertGraphicalSessionAvailable();

  if (!values['skip-build']) {
    await runCommand('pnpm', ['build:packages'], repoRoot);
    await runCommand(
      'pnpm',
      ['--filter', '@ai-canvas/desktop', 'build:app'],
      repoRoot,
    );
  }

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ai-canvas-smoke-'));
  const mcpPort = await allocatePort();
  const projectName = `Smoke ${new Date().toISOString()}`;
  const mcpEndpoint = `http://127.0.0.1:${mcpPort}/mcp`;
  let shouldKeepTemp = values['keep-temp'];
  let desktop = null;

  try {
    desktop = await launchDesktop({ mcpPort, userDataDir });
    const createdProject = await createAndEditProject(
      desktop.page,
      projectName,
    );

    await closeDesktop(desktop);
    desktop = null;

    desktop = await launchDesktop({ mcpPort, userDataDir });
    await reopenProject(desktop.page, projectName);
    await verifyNodeState(
      desktop.page,
      createdProject.rectangleId,
      UI_FILL_COLOR,
      MCP_WIDTH - 28,
    );
    await waitForComputedBackground(
      desktop.page,
      createdProject.rectangleId,
      UI_FILL_COLOR_RGB,
    );

    const mcpRevision = await runMcpMutation({
      endpoint: mcpEndpoint,
      projectId: createdProject.projectId,
      rectangleId: createdProject.rectangleId,
    });

    const finalProject = await verifyNodeState(
      desktop.page,
      createdProject.rectangleId,
      MCP_FILL_COLOR,
      MCP_WIDTH,
    );
    await waitForComputedBackground(
      desktop.page,
      createdProject.rectangleId,
      MCP_FILL_COLOR_RGB,
    );

    console.log(
      JSON.stringify(
        {
          document_id: finalProject.document.document_id,
          mcp_endpoint: mcpEndpoint,
          mcp_revision: mcpRevision,
          project_id: createdProject.projectId,
          project_name: projectName,
          rectangle_id: createdProject.rectangleId,
          revision: finalProject.revision,
          status: 'ok',
          user_data_dir: userDataDir,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    shouldKeepTemp = true;
    console.error(formatError(error));
    throw error;
  } finally {
    if (desktop) {
      await closeDesktop(desktop);
    }

    if (shouldKeepTemp) {
      console.error(`Preserved smoke profile: ${userDataDir}`);
    } else {
      await rm(userDataDir, {
        force: true,
        recursive: true,
      });
    }
  }
}

function normalizeScriptArgs(args) {
  return args[0] === '--' ? args.slice(1) : args;
}

async function createAndEditProject(page, projectName) {
  await page.getByRole('button', { name: 'New Project' }).click();
  await page.locator('#create-project-name').fill(projectName);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await page.locator('[data-workspace-shell="true"]').waitFor({
    state: 'visible',
  });

  const createdProject = await waitForActiveProject(
    page,
    (activeProject) => activeProject.project.name === projectName,
    `project ${projectName} to become active`,
  );

  await createRectangleThroughToolbar(page);
  const projectWithRectangle = await waitForActiveProject(
    page,
    (activeProject) => findSmokeRectangle(activeProject) !== null,
    'UI-created rectangle to be persisted',
  );
  const rectangle = findSmokeRectangle(projectWithRectangle);

  if (!rectangle) {
    throw new Error('Failed to find the UI-created rectangle.');
  }

  await page.locator(nodeSelector(rectangle.id)).waitFor({ state: 'visible' });
  await setFillColorThroughInspector(page, UI_FILL_COLOR);
  await verifyNodeState(page, rectangle.id, UI_FILL_COLOR, MCP_WIDTH - 28);

  return {
    documentId: createdProject.document.document_id,
    projectId: createdProject.project.id,
    rectangleId: rectangle.id,
  };
}

async function createRectangleThroughToolbar(page) {
  const rectangleTool = page.locator('[data-canvas-tool="rectangle"]');

  await rectangleTool.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-canvas-tool="rectangle"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await rectangleTool.click();

  const viewport = page.locator('[data-viewport-frame="true"]');
  await viewport.waitFor({ state: 'visible' });
  const box = await viewport.boundingBox();

  if (!box) {
    throw new Error('Could not resolve the viewport frame bounding box.');
  }

  await viewport.click({
    position: {
      x: Math.round(box.width / 2),
      y: Math.round(box.height / 2),
    },
  });
}

async function reopenProject(page, projectName) {
  await page.getByRole('button', { name: 'New Project' }).waitFor({
    state: 'visible',
  });
  await page
    .getByRole('button', { name: new RegExp(escapeRegex(projectName)) })
    .click();
  await page.locator('[data-workspace-shell="true"]').waitFor({
    state: 'visible',
  });
  await waitForActiveProject(
    page,
    (activeProject) => activeProject.project.name === projectName,
    `project ${projectName} to reopen`,
  );
}

async function runMcpMutation({ endpoint, projectId, rectangleId }) {
  const client = new Client({
    name: 'ai-canvas-product-smoke',
    version: '0.0.0',
  });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));

  try {
    await client.connect(transport);

    const inspectProjectResult = parseToolResult(
      await client.callTool({
        arguments: {
          project_id: projectId,
        },
        name: 'inspect_project',
      }),
      'inspect_project',
    );

    if (!inspectProjectResult.ok) {
      throw new Error('inspect_project returned a non-ok payload.');
    }

    const applyCommandsResult = parseToolResult(
      await client.callTool({
        arguments: {
          base_revision: inspectProjectResult.revision,
          commands: [
            {
              node_id: rectangleId,
              patch: {
                render_style: {
                  backgroundColor: MCP_FILL_COLOR,
                },
                width: MCP_WIDTH,
              },
              type: 'update_node',
            },
          ],
          project_id: projectId,
        },
        name: 'apply_commands',
      }),
      'apply_commands',
    );

    if (!applyCommandsResult.ok) {
      throw new Error('apply_commands returned a non-ok payload.');
    }

    return applyCommandsResult.revision;
  } finally {
    await transport.close();
    await client.close();
  }
}

function parseToolResult(result, toolName) {
  if (result.isError) {
    throw new Error(
      `${toolName} failed: ${result.content?.[0]?.text ?? 'Unknown MCP error'}`,
    );
  }

  return result.structuredContent;
}

async function verifyNodeState(page, nodeId, backgroundColor, width) {
  return waitForActiveProject(
    page,
    (activeProject) => {
      const node = activeProject.document.nodes[nodeId];

      return (
        node?.kind === 'rectangle' &&
        node.render_style.backgroundColor === backgroundColor &&
        node.render_style.width === width
      );
    },
    `node ${nodeId} to have ${backgroundColor} and width ${width}`,
  );
}

async function setFillColorThroughInspector(page, color) {
  const fillColorInput = page.getByLabel('Fill color');

  await fillColorInput.waitFor({ state: 'visible' });
  await fillColorInput.evaluate((element, nextColor) => {
    const input = element;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;

    if (valueSetter) {
      valueSetter.call(input, nextColor);
    } else {
      input.value = nextColor;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, color);
}

async function waitForComputedBackground(page, nodeId, expectedBackground) {
  await page.waitForFunction(
    ({ expectedBackground: expected, selector }) => {
      const element = document.querySelector(selector);

      return (
        element !== null &&
        getComputedStyle(element).backgroundColor === expected
      );
    },
    {
      expectedBackground,
      selector: nodeSelector(nodeId),
    },
  );
}

function findSmokeRectangle(activeProject) {
  return (
    Object.values(activeProject.document.nodes).find(
      (node) =>
        node.kind === 'rectangle' &&
        node.name === 'Rectangle' &&
        node.render_style.backgroundColor === '#d4d4d4',
    ) ?? null
  );
}

async function waitForActiveProject(page, predicate, description) {
  const deadline = Date.now() + 15_000;
  let lastProject = null;

  while (Date.now() < deadline) {
    const activeProject = await getActiveProject(page);
    lastProject = activeProject;

    if (activeProject && predicate(activeProject)) {
      return activeProject;
    }

    await delay(150);
  }

  throw new Error(
    `Timed out waiting for ${description}. Last active project: ${JSON.stringify(lastProject)}`,
  );
}

async function getActiveProject(page) {
  const result = await page.evaluate(() =>
    window.aiCanvasApi.getActiveProject(),
  );

  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }

  return result.data;
}

async function launchDesktop({ mcpPort, userDataDir }) {
  if (typeof electronPath !== 'string') {
    throw new Error('The electron package did not resolve to an executable.');
  }

  const electronApp = await electron.launch({
    cwd: desktopDir,
    env: {
      ...process.env,
      AI_CANVAS_MCP_PORT: String(mcpPort),
      AI_CANVAS_USER_DATA_DIR: userDataDir,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    executablePath: electronPath,
    args: [desktopDir],
  });
  const page = await electronApp.firstWindow();

  page.setDefaultTimeout(15_000);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(window.aiCanvasApi));

  return {
    app: electronApp,
    page,
  };
}

async function closeDesktop(desktop) {
  await desktop.app.close();
}

async function allocatePort() {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate a local TCP port.');
  }

  return address.port;
}

async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with ${signal ?? `exit code ${code}`}.`,
        ),
      );
    });
  });
}

function resolveCommand(command) {
  return process.platform === 'win32' ? `${command}.cmd` : command;
}

function assertGraphicalSessionAvailable() {
  if (
    process.platform === 'linux' &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  ) {
    throw new Error(
      'Desktop smoke requires a graphical session. On Linux CI, run it under xvfb or another display server.',
    );
  }
}

function nodeSelector(nodeId) {
  return `[data-renderer-root="true"] [data-node-id="${escapeCssString(nodeId)}"]`;
}

function escapeCssString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatError(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

await main();
