import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MCP_HOST,
  DEFAULT_MCP_PORT,
  MCP_PORT_ENV,
  USER_DATA_DIR_ENV,
  resolveMainProcessRuntimeConfig,
} from './appRuntimeConfig.js';

describe('resolveMainProcessRuntimeConfig', () => {
  it('uses the production defaults when no smoke overrides are set', () => {
    expect(resolveMainProcessRuntimeConfig({})).toEqual({
      mcpHost: DEFAULT_MCP_HOST,
      mcpPort: DEFAULT_MCP_PORT,
      userDataDir: null,
    });
  });

  it('uses a custom user data directory when one is provided', () => {
    expect(
      resolveMainProcessRuntimeConfig({
        [USER_DATA_DIR_ENV]: '  /tmp/ai-canvas-smoke-profile  ',
      }),
    ).toEqual({
      mcpHost: DEFAULT_MCP_HOST,
      mcpPort: DEFAULT_MCP_PORT,
      userDataDir: '/tmp/ai-canvas-smoke-profile',
    });
  });

  it('uses a custom MCP port when one is provided', () => {
    expect(
      resolveMainProcessRuntimeConfig({
        [MCP_PORT_ENV]: '57123',
      }),
    ).toEqual({
      mcpHost: DEFAULT_MCP_HOST,
      mcpPort: 57123,
      userDataDir: null,
    });
  });

  it('rejects invalid MCP ports', () => {
    expect(() =>
      resolveMainProcessRuntimeConfig({
        [MCP_PORT_ENV]: '0',
      }),
    ).toThrowError(`${MCP_PORT_ENV} must be an integer from 1 to 65535.`);
    expect(() =>
      resolveMainProcessRuntimeConfig({
        [MCP_PORT_ENV]: '70000',
      }),
    ).toThrowError(`${MCP_PORT_ENV} must be an integer from 1 to 65535.`);
    expect(() =>
      resolveMainProcessRuntimeConfig({
        [MCP_PORT_ENV]: 'not-a-port',
      }),
    ).toThrowError(`${MCP_PORT_ENV} must be an integer from 1 to 65535.`);
  });
});
