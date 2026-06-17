import { randomUUID } from 'node:crypto';

export function createProjectId(): string {
  return `project_${randomUUID()}`;
}

export function createDocumentId(): string {
  return `doc_${randomUUID()}`;
}

export function createAssetId(): string {
  return `asset_${randomUUID()}`;
}

export function createNodeId(): string {
  return `node_${randomUUID()}`;
}

export function createSceneId(): string {
  return `scene_${randomUUID()}`;
}

export function createStyleId(): string {
  return `style_${randomUUID()}`;
}

export function createVariableCollectionId(): string {
  return `collection_${randomUUID()}`;
}

export function createVariableModeId(): string {
  return `mode_${randomUUID()}`;
}

export function createVariableId(): string {
  return `variable_${randomUUID()}`;
}
