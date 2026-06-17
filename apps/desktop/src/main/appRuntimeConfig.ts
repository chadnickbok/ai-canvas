export const DEFAULT_MCP_HOST = '127.0.0.1';
export const DEFAULT_MCP_PORT = 9311;
export const MCP_PORT_ENV = 'AI_CANVAS_MCP_PORT';
export const USER_DATA_DIR_ENV = 'AI_CANVAS_USER_DATA_DIR';

export type MainProcessRuntimeConfig = {
  mcpHost: string;
  mcpPort: number;
  userDataDir: string | null;
};

export function resolveMainProcessRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): MainProcessRuntimeConfig {
  return {
    mcpHost: DEFAULT_MCP_HOST,
    mcpPort: resolveMcpPort(env[MCP_PORT_ENV]),
    userDataDir: resolveUserDataDir(env[USER_DATA_DIR_ENV]),
  };
}

export function resolveMcpPort(value: string | undefined): number {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return DEFAULT_MCP_PORT;
  }

  const parsedPort = Number(trimmedValue);

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(`${MCP_PORT_ENV} must be an integer from 1 to 65535.`);
  }

  return parsedPort;
}

export function resolveUserDataDir(value: string | undefined): string | null {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}
